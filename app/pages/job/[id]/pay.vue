<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { ArrowLeft, Lock, Check, CreditCard, Loader2, CircleCheck, CircleAlert, Search } from 'lucide-vue-next'

const route = useRoute()
const jobId = computed(() => String(route.params.id))

useHead({
  title: () => `Plată #${jobId.value.slice(0, 8)} — Rapidport`,
  htmlAttrs: { lang: 'ro' },
})

const entity = ref<'pj' | 'pf'>('pj')
const form = ref({
  cui: '',
  name: '',
  address: '',
  regCom: '',
  email: '',
})
const consent = ref(false)

// ANAF lookup state ---------------------------------------------------------
type AnafCompany = {
  cui: number
  cuiRo: string
  name: string
  address: string
  registrationNumber: string
  vatRegistered: boolean
  cashBasisVat: boolean
  eFacturaRegistered: boolean
  inactive: boolean
  vatStatus: string
  fetchedAt: string
}
const lookupState = ref<'idle' | 'loading' | 'verifying' | 'resolved' | 'not_found' | 'error'>('idle')
const lookupError = ref<string | null>(null)
const anafCompany = ref<AnafCompany | null>(null)
const anafVerifiedAt = ref<string | null>(null)
let pollTimer: ReturnType<typeof setTimeout> | null = null
let pollStartedAt = 0

function clearLookup() {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
  anafCompany.value = null
  anafVerifiedAt.value = null
  lookupState.value = 'idle'
  lookupError.value = null
}

function readCsrf(): string {
  if (import.meta.server) return ''
  const m = document.cookie.match(/(?:^|;\s*)rp_csrf=([^;]+)/)
  return m && m[1] ? decodeURIComponent(m[1]) : ''
}

async function doLookup(cuiRaw: string): Promise<AnafCompany | null> {
  const res = await $fetch<{ ok: true; company: AnafCompany }>(
    '/api/anaf/lookup',
    {
      method: 'POST',
      body: { cui: cuiRaw },
      headers: { 'x-csrf-token': readCsrf() },
    },
  )
  return res.company
}

async function lookupCui() {
  const raw = form.value.cui.trim()
  if (!raw) return
  if (!/^(RO)?\d{2,10}$/i.test(raw)) {
    lookupState.value = 'error'
    lookupError.value = 'format_invalid'
    return
  }

  clearLookup()
  lookupState.value = 'loading'
  pollStartedAt = Date.now()

  try {
    const company = await doLookup(raw)
    if (!company) {
      lookupState.value = 'not_found'
      return
    }
    anafCompany.value = company
    // Fill the form with identity fields (available even while VAT is verifying).
    form.value.name = company.name
    form.value.address = company.address
    form.value.regCom = company.registrationNumber
    // Normalize the CUI to the RO-prefixed form SmartBill expects.
    form.value.cui = company.cuiRo

    if (company.vatStatus === 'verifying') {
      lookupState.value = 'verifying'
      scheduleNextPoll(3000)
    } else {
      lookupState.value = 'resolved'
      anafVerifiedAt.value = new Date().toISOString()
    }
  } catch (err) {
    const e = err as { data?: { error?: string }; statusCode?: number }
    if (e?.statusCode === 404 || e?.data?.error === 'cui_not_found') {
      lookupState.value = 'not_found'
    } else {
      lookupState.value = 'error'
      lookupError.value = e?.data?.error ?? 'unknown'
    }
  }
}

function scheduleNextPoll(delayMs: number) {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = setTimeout(pollVat, delayMs)
}

async function pollVat() {
  if (lookupState.value !== 'verifying') return
  const elapsed = Date.now() - pollStartedAt
  if (elapsed > 20_000) {
    // Give up polling but keep what we have — user can submit with VAT unresolved.
    lookupState.value = 'resolved'
    anafVerifiedAt.value = new Date().toISOString()
    return
  }
  try {
    const company = await doLookup(form.value.cui)
    if (!company) {
      lookupState.value = 'not_found'
      return
    }
    anafCompany.value = company
    if (company.vatStatus === 'verifying') {
      scheduleNextPoll(2000)
    } else {
      lookupState.value = 'resolved'
      anafVerifiedAt.value = new Date().toISOString()
    }
  } catch {
    // swallow — transient; next poll will retry if still verifying.
    scheduleNextPoll(2000)
  }
}

// Any manual edit after verification clears the ANAF-verified marker so admin
// sees the billingInfo as "manually edited" rather than "ANAF sealed".
function markManualEdit() {
  if (anafVerifiedAt.value) anafVerifiedAt.value = null
}

// On entity flip, reset ANAF state so PF doesn't carry stale PJ data.
watch(entity, () => clearLookup())

onBeforeUnmount(() => {
  if (pollTimer) clearTimeout(pollTimer)
})

// Pricing ------------------------------------------------------------------
const priceNoVat = 499
const vat = Math.round(priceNoVat * 0.21)
const total = priceNoVat + vat

// Submit -------------------------------------------------------------------
// This POSTs to /api/jobs/[id]/pay which creates the Stripe PaymentIntent and
// persists billingInfo to payments.billingInfo. Actual card-entry (Stripe
// Elements / Checkout redirect) is a separate task — for now we capture the
// intent + billingInfo and send the user to the status page.
const submitting = ref(false)
const submitError = ref<string | null>(null)
const canSubmit = computed(() => {
  if (!consent.value || submitting.value) return false
  if (!form.value.email) return false
  if (entity.value === 'pj') {
    return Boolean(form.value.cui && form.value.name && form.value.address)
  }
  return Boolean(form.value.name)
})

function buildBillingInfo() {
  if (entity.value === 'pj') {
    return {
      entity: 'pj' as const,
      name: form.value.name,
      cui: form.value.cui,
      address: form.value.address,
      regCom: form.value.regCom || undefined,
      email: form.value.email || undefined,
      anafVerifiedAt: anafVerifiedAt.value ?? undefined,
      anafVatRegistered: anafCompany.value?.vatRegistered,
      anafCashBasisVat: anafCompany.value?.cashBasisVat,
    }
  }
  return {
    entity: 'pf' as const,
    name: form.value.name,
    address: form.value.address || undefined,
    email: form.value.email || undefined,
  }
}

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  submitError.value = null
  try {
    await $fetch(`/api/jobs/${jobId.value}/pay`, {
      method: 'POST',
      body: {
        billingEmail: form.value.email,
        billingInfo: buildBillingInfo(),
      },
      headers: { 'x-csrf-token': readCsrf() },
    })
    // TODO(stripe-elements): navigate to a card-entry step using the returned
    // clientSecret. For now, the billingInfo is captured server-side and the
    // payment row exists — admin can complete via Stripe dashboard while the
    // Elements/Checkout integration is being wired.
    await navigateTo(`/job/${jobId.value}/result`)
  } catch (err) {
    const e = err as { data?: { error?: string } }
    submitError.value = e?.data?.error ?? 'unknown'
  } finally {
    submitting.value = false
  }
}

const vatBadge = computed(() => {
  if (entity.value !== 'pj') return null
  if (lookupState.value === 'verifying') {
    return { label: 'verificare TVA…', tone: 'muted' }
  }
  if (!anafCompany.value || lookupState.value !== 'resolved') return null
  if (anafCompany.value.inactive) {
    return { label: 'firmă inactivă', tone: 'destructive' }
  }
  if (anafCompany.value.vatRegistered) {
    return {
      label: anafCompany.value.cashBasisVat ? 'plătitor TVA · TVA la încasare' : 'plătitor TVA',
      tone: 'success',
    }
  }
  return { label: 'neplătitor TVA', tone: 'muted' }
})
</script>

<template>
  <div class="bg-background text-foreground min-h-dvh flex flex-col">
    <LayoutSiteHeader />

    <main class="flex-1">
      <section class="border-b border-border">
        <div class="mx-auto max-w-[1200px] px-6 py-12">
          <div class="mb-8">
            <NuxtLink :to="`/job/${jobId}/mapping`" class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft class="size-4" :stroke-width="2" />
              Înapoi la mapare
            </NuxtLink>
          </div>

          <div class="mb-10">
            <div class="text-sm font-medium text-primary mb-2">Pas 3 din 3 · Plată</div>
            <h1 class="text-3xl md:text-4xl font-bold tracking-tight leading-tight" style="color: #000;">
              Finalizați plata
            </h1>
            <p class="mt-2 text-muted-foreground">
              După plată, începem generarea pachetului SAGA. Durează 3–15 minute.
            </p>
          </div>

          <div class="grid md:grid-cols-[1.3fr_1fr] gap-8 lg:gap-12">
            <!-- LEFT: Billing + Payment -->
            <div class="space-y-10">
              <!-- Billing -->
              <div>
                <h2 class="text-lg font-semibold mb-5">Date de facturare</h2>

                <div class="flex gap-2 mb-6">
                  <button
                    type="button"
                    class="flex-1 rounded-xl border p-4 text-left transition-all cursor-pointer"
                    :class="entity === 'pj' ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40'"
                    @click="entity = 'pj'"
                  >
                    <div class="text-sm font-semibold mb-1">Persoană juridică</div>
                    <div class="text-xs text-muted-foreground">SRL, SA, PFA, II, SRL-D</div>
                  </button>
                  <button
                    type="button"
                    class="flex-1 rounded-xl border p-4 text-left transition-all cursor-pointer"
                    :class="entity === 'pf' ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40'"
                    @click="entity = 'pf'"
                  >
                    <div class="text-sm font-semibold mb-1">Persoană fizică</div>
                    <div class="text-xs text-muted-foreground">factură pe CNP</div>
                  </button>
                </div>

                <div class="space-y-4">
                  <template v-if="entity === 'pj'">
                    <div class="space-y-2">
                      <label class="text-sm font-medium">CUI</label>
                      <div class="flex gap-2">
                        <Input
                          v-model="form.cui"
                          class="h-11 font-mono flex-1"
                          placeholder="RO12345678"
                          @blur="lookupCui"
                          @keydown.enter.prevent="lookupCui"
                        />
                        <Button
                          variant="outline"
                          type="button"
                          class="h-11 px-4"
                          :disabled="lookupState === 'loading' || lookupState === 'verifying'"
                          @click="lookupCui"
                        >
                          <Loader2 v-if="lookupState === 'loading' || lookupState === 'verifying'" class="size-4 animate-spin" :stroke-width="2" />
                          <Search v-else class="size-4" :stroke-width="2" />
                        </Button>
                      </div>
                      <div v-if="vatBadge" class="flex items-center gap-2 pt-1">
                        <CircleCheck v-if="vatBadge.tone === 'success'" class="size-4 text-success" :stroke-width="2" />
                        <Loader2 v-else-if="vatBadge.tone === 'muted' && lookupState === 'verifying'" class="size-4 animate-spin text-muted-foreground" :stroke-width="2" />
                        <CircleAlert v-else-if="vatBadge.tone === 'destructive'" class="size-4 text-destructive" :stroke-width="2" />
                        <span
                          class="text-xs font-medium"
                          :class="{
                            'text-success': vatBadge.tone === 'success',
                            'text-muted-foreground': vatBadge.tone === 'muted',
                            'text-destructive': vatBadge.tone === 'destructive',
                          }"
                        >{{ vatBadge.label }}</span>
                        <span v-if="anafCompany && !anafCompany.inactive && lookupState === 'resolved'" class="ml-auto text-xs text-muted-foreground">
                          date din ANAF · editați liber
                        </span>
                      </div>
                      <div v-if="lookupState === 'not_found'" class="text-xs text-destructive pt-1">
                        CUI necunoscut sau inactiv. Completați manual.
                      </div>
                      <div v-if="lookupState === 'error'" class="text-xs text-destructive pt-1">
                        Eroare la interogarea ANAF. Completați manual.
                      </div>
                    </div>

                    <div class="space-y-2">
                      <label class="text-sm font-medium">Denumire firmă</label>
                      <Input v-model="form.name" class="h-11" placeholder="SC Exemplu SRL" @input="markManualEdit" />
                    </div>
                    <div class="space-y-2">
                      <label class="text-sm font-medium">Nr. Registrul Comerțului</label>
                      <Input v-model="form.regCom" class="h-11 font-mono" placeholder="J12/2020/1234" @input="markManualEdit" />
                    </div>
                    <div class="space-y-2">
                      <label class="text-sm font-medium">Adresă</label>
                      <Input v-model="form.address" class="h-11" placeholder="Str. Exemplu nr. 1, Oraș, Județ" @input="markManualEdit" />
                    </div>
                  </template>

                  <template v-else>
                    <div class="space-y-2">
                      <label class="text-sm font-medium">Nume</label>
                      <Input v-model="form.name" class="h-11" placeholder="Nume Prenume" />
                    </div>
                    <div class="space-y-2">
                      <label class="text-sm font-medium">Adresă (opțional)</label>
                      <Input v-model="form.address" class="h-11" placeholder="Str. Exemplu nr. 1, Oraș" />
                    </div>
                  </template>

                  <div class="space-y-2">
                    <label class="text-sm font-medium">Email (pentru factură + link descărcare)</label>
                    <Input v-model="form.email" type="email" class="h-11" placeholder="contact@firma.ro" />
                  </div>
                </div>
              </div>

              <!-- Payment (Stripe placeholder — Elements/Checkout wiring lands in a follow-up task) -->
              <div>
                <h2 class="text-lg font-semibold mb-5 flex items-center gap-2">
                  <CreditCard class="size-5 text-muted-foreground" :stroke-width="2" />
                  Card bancar
                </h2>
                <div class="rounded-2xl border border-border bg-card p-6 space-y-4">
                  <div class="text-sm text-muted-foreground leading-relaxed">
                    Plata este procesată de Stripe cu 3D Secure. Câmpul securizat pentru card se încarcă în pasul următor după ce confirmați datele de facturare.
                  </div>
                  <div class="text-xs text-muted-foreground flex items-center gap-1.5 pt-2">
                    <Lock class="size-3.5" :stroke-width="2" />
                    Datele cardului nu ajung niciodată la Rapidport.
                  </div>
                </div>
              </div>
            </div>

            <!-- RIGHT: Summary -->
            <div class="md:sticky md:top-20 h-fit">
              <div class="rounded-2xl border border-border bg-card p-6">
                <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">Rezumat</div>

                <div class="space-y-3 pb-4 border-b border-border text-sm">
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Pachet</span>
                    <span class="font-semibold">Standard</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Sincronizări delta incluse</span>
                    <span class="font-mono tabular-nums">3</span>
                  </div>
                </div>

                <div class="space-y-2 py-4 border-b border-border text-sm">
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Subtotal</span>
                    <span class="font-mono tabular-nums">{{ priceNoVat }},00 RON</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">TVA 21%</span>
                    <span class="font-mono tabular-nums">{{ vat }},00 RON</span>
                  </div>
                </div>

                <div class="flex justify-between items-baseline pt-4 pb-6">
                  <span class="font-semibold">Total</span>
                  <span class="text-2xl font-bold tabular-nums">{{ total }},00 RON</span>
                </div>

                <label class="flex items-start gap-3 text-xs text-muted-foreground leading-relaxed mb-5 cursor-pointer">
                  <input v-model="consent" type="checkbox" class="mt-0.5 size-4 rounded border-input accent-primary cursor-pointer" />
                  <span>
                    Sunt de acord cu
                    <NuxtLink to="/legal/terms" class="text-primary hover:underline">termenii</NuxtLink>
                    și
                    <NuxtLink to="/legal/privacy" class="text-primary hover:underline">politica de confidențialitate</NuxtLink>.
                  </span>
                </label>

                <Button
                  class="rounded-full h-12 w-full text-base font-medium"
                  :disabled="!canSubmit"
                  @click="submit"
                >
                  <Loader2 v-if="submitting" class="size-4 mr-1 animate-spin" :stroke-width="2" />
                  <Check v-else class="size-4 mr-1" :stroke-width="2.5" />
                  {{ submitting ? 'Se procesează…' : `Continuă · ${total} RON` }}
                </Button>

                <div v-if="submitError" class="mt-3 text-xs text-destructive">
                  Eroare: {{ submitError }}
                </div>

                <div class="mt-4 text-xs text-muted-foreground text-center">
                  Factură fiscală cu eFactura, trimisă automat către ANAF după confirmarea plății.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <LayoutSiteFooter />
  </div>
</template>
