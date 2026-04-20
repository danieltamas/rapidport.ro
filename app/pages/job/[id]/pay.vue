<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { ArrowLeft, Lock, Check, CreditCard, Loader2, CircleCheck, CircleAlert, Search } from 'lucide-vue-next'
// @stripe/stripe-js exports are type-safe but the runtime loader touches
// `window` — imported dynamically inside onMounted so SSR stays clean.
import type { Stripe, StripeElements } from '@stripe/stripe-js'

const route = useRoute()
const jobId = computed(() => String(route.params.id))
const config = useRuntimeConfig()

useHead({
  title: () => `Plată #${jobId.value.slice(0, 8)} — Rapidport`,
  htmlAttrs: { lang: 'ro' },
})

// Step machine ---------------------------------------------------------------
// billing   — user fills billing form (default entry)
// payment   — billing committed; clientSecret resolved; PaymentElement mounted
// confirming — confirm submitted; waiting for Stripe (inline 3DS, redirect, polling)
// succeeded  — intent reached 'succeeded' (redirects to /job/[id]/status)
// failed     — terminal non-retryable error; show friendly message + back-to-billing
type Step = 'billing' | 'payment' | 'confirming' | 'succeeded' | 'failed'
// Initialize synchronously: when Stripe redirects the user back from 3DS, the
// URL carries `payment_intent_client_secret` — jump straight to 'confirming'
// so SSR and client hydration match (no flash of the billing form).
const step = ref<Step>(
  typeof route.query.payment_intent_client_secret === 'string' ? 'confirming' : 'billing',
)

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

// Billing validation -------------------------------------------------------
const billingValid = computed(() => {
  if (!consent.value) return false
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

// Stripe state -------------------------------------------------------------
let stripe: Stripe | null = null
let elements: StripeElements | null = null
const clientSecret = ref<string | null>(null)
const intentAmount = ref<number | null>(null)
const intentCurrency = ref<string | null>(null)

const submitting = ref(false)
const submitError = ref<string | null>(null)
const payError = ref<string | null>(null)
const elementsReady = ref(false)

// Step 1 — commit billing + fetch PaymentIntent + transition to payment.
async function submitBilling() {
  if (!billingValid.value || submitting.value) return
  submitting.value = true
  submitError.value = null
  try {
    const res = await $fetch<{ clientSecret: string; amount: number; currency: string }>(
      `/api/jobs/${jobId.value}/pay`,
      {
        method: 'POST',
        body: {
          billingEmail: form.value.email,
          billingInfo: buildBillingInfo(),
        },
        headers: { 'x-csrf-token': readCsrf() },
      },
    )
    clientSecret.value = res.clientSecret
    intentAmount.value = res.amount
    intentCurrency.value = res.currency
    step.value = 'payment'
    // Mount PaymentElement in the next tick, after the payment section renders.
    await nextTick()
    await mountPaymentElement()
  } catch (err) {
    const e = err as { data?: { error?: string } }
    submitError.value = e?.data?.error ?? 'unknown'
  } finally {
    submitting.value = false
  }
}

// Lazy-load + mount Stripe Elements. Runs on client only.
async function mountPaymentElement() {
  if (!clientSecret.value) return
  if (import.meta.server) return
  try {
    if (!stripe) {
      const { loadStripe } = await import('@stripe/stripe-js')
      stripe = await loadStripe(config.public.stripePublishableKey as string)
    }
    if (!stripe) {
      payError.value = 'stripe_not_loaded'
      return
    }
    elements = stripe.elements({
      clientSecret: clientSecret.value,
      locale: 'ro',
      appearance: {
        // Match the rest of the page (light card on light page). Colours come
        // from rapidport's signature accent #C72E49 so the Pay button's ring
        // state matches the rest of the UI.
        theme: 'flat',
        variables: {
          colorPrimary: '#C72E49',
          colorBackground: '#ffffff',
          colorText: '#0a0a0a',
          colorDanger: '#C72E49',
          fontFamily: 'Inter, system-ui, sans-serif',
          borderRadius: '10px',
        },
      },
    })
    const paymentElement = elements.create('payment', { layout: 'tabs' })
    paymentElement.on('ready', () => {
      elementsReady.value = true
    })
    paymentElement.mount('#payment-element')
  } catch {
    payError.value = 'stripe_init_failed'
  }
}

// Step 2 — confirm payment. Stripe may either inline-succeed, redirect for 3DS,
// or return a non-terminal status that we recover from on the next page load.
async function confirmPayment() {
  if (!stripe || !elements) return
  if (step.value !== 'payment') return
  submitting.value = true
  payError.value = null
  const { error } = await stripe.confirmPayment({
    elements,
    // `redirect: 'always'` makes the contract explicit — Stripe ALWAYS navigates
    // to return_url on success or 3DS. confirmPayment only returns inline for
    // validation/card errors. Without this, a future "optimization" to
    // 'if_required' would leave inline-success paths stuck on this page.
    redirect: 'always',
    confirmParams: {
      return_url: `${window.location.origin}/job/${jobId.value}/pay`,
      receipt_email: form.value.email || undefined,
    },
  })
  // We reach this point ONLY on inline validation/card errors. Redirect
  // paths send the user to Stripe and back to return_url.
  submitting.value = false
  if (error) {
    payError.value = error.type === 'validation_error' || error.type === 'card_error'
      ? (error.message ?? 'card_declined')
      : 'stripe_confirm_failed'
  }
}

function backToBilling() {
  // User wants to change billing info. Clear the Elements instance so the next
  // submit re-fetches (handler is idempotent — it reuses the intent).
  if (elements) {
    // Destroy the instance; we'll recreate on re-submit. Elements has no
    // public destroy() so we drop the ref — the container is v-if'd away.
    elements = null
    elementsReady.value = false
  }
  step.value = 'billing'
  payError.value = null
}

// On return from Stripe 3DS redirect: URL carries ?payment_intent=&payment_intent_client_secret=&redirect_status=.
// Retrieve the intent, branch on status, and either navigate to status page
// (succeeded / processing) or surface a retryable message.
async function handleReturnFromStripe() {
  const params = new URLSearchParams(window.location.search)
  const piClientSecret = params.get('payment_intent_client_secret')
  if (!piClientSecret) return

  step.value = 'confirming'
  try {
    const { loadStripe } = await import('@stripe/stripe-js')
    const s = await loadStripe(config.public.stripePublishableKey as string)
    if (!s) {
      step.value = 'failed'
      payError.value = 'stripe_not_loaded'
      return
    }
    const { paymentIntent, error } = await s.retrievePaymentIntent(piClientSecret)
    if (error || !paymentIntent) {
      step.value = 'failed'
      payError.value = error?.message ?? 'intent_retrieve_failed'
      return
    }
    switch (paymentIntent.status) {
      case 'succeeded':
      case 'processing':
        step.value = 'succeeded'
        // Server webhook flips job.status on succeeded; /status will surface
        // either "queued → converting" or "still processing" copy.
        await navigateTo(`/job/${jobId.value}/status`)
        break
      case 'requires_payment_method':
        step.value = 'billing'
        payError.value = 'card_declined_try_another'
        break
      default:
        step.value = 'failed'
        payError.value = `intent_${paymentIntent.status}`
    }
  } catch {
    step.value = 'failed'
    payError.value = 'stripe_return_failed'
  }
}

onMounted(() => {
  if (window.location.search.includes('payment_intent_client_secret')) {
    handleReturnFromStripe()
  }
})

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

// Short summary rendered at the top of the payment step (read-only billing).
const billingSummary = computed(() => {
  if (entity.value === 'pj') {
    return {
      label: 'Persoană juridică',
      lines: [form.value.name, form.value.cui, form.value.address, form.value.email].filter(Boolean),
    }
  }
  return {
    label: 'Persoană fizică',
    lines: [form.value.name, form.value.address, form.value.email].filter(Boolean),
  }
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

          <!-- Confirming state — after Stripe 3DS redirect back. -->
          <div v-if="step === 'confirming'" class="rounded-2xl border border-border bg-card p-10 text-center">
            <Loader2 class="size-8 mx-auto mb-4 animate-spin text-primary" :stroke-width="2" />
            <div class="text-lg font-semibold mb-1">Confirmăm plata…</div>
            <div class="text-sm text-muted-foreground">Verificăm cu banca dvs. Nu închideți această pagină.</div>
          </div>

          <!-- Terminal failed state. -->
          <div v-else-if="step === 'failed'" class="rounded-2xl border border-destructive/30 bg-destructive/5 p-8">
            <div class="flex items-start gap-3 mb-4">
              <CircleAlert class="size-6 text-destructive shrink-0" :stroke-width="2" />
              <div>
                <div class="text-lg font-semibold text-destructive mb-1">Plata nu a fost finalizată</div>
                <div class="text-sm text-muted-foreground">Cod: <span class="font-mono">{{ payError ?? 'unknown' }}</span></div>
              </div>
            </div>
            <Button variant="outline" class="rounded-full h-10" @click="backToBilling">Încearcă din nou</Button>
          </div>

          <div v-else class="grid md:grid-cols-[1.3fr_1fr] gap-8 lg:gap-12">
            <!-- LEFT: Billing (step=billing) OR Payment (step=payment) -->
            <div class="space-y-10">
              <!-- Billing form (editable) -->
              <div v-if="step === 'billing'">
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

              <!-- Billing summary (read-only, collapsed) -->
              <div v-else class="rounded-2xl border border-border bg-card p-5">
                <div class="flex items-start justify-between gap-4">
                  <div class="min-w-0">
                    <div class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
                      {{ billingSummary.label }}
                    </div>
                    <div class="text-sm leading-relaxed space-y-0.5">
                      <div v-for="(line, i) in billingSummary.lines" :key="i" class="truncate">{{ line }}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    @click="backToBilling"
                  >
                    Modifică
                  </button>
                </div>
              </div>

              <!-- Payment section: placeholder (billing step) OR PaymentElement (payment step) -->
              <div>
                <h2 class="text-lg font-semibold mb-5 flex items-center gap-2">
                  <CreditCard class="size-5 text-muted-foreground" :stroke-width="2" />
                  Card bancar
                </h2>

                <div v-if="step === 'billing'" class="rounded-2xl border border-border bg-card p-6 space-y-4">
                  <div class="text-sm text-muted-foreground leading-relaxed">
                    Plata este procesată de Stripe cu 3D Secure. Câmpul securizat pentru card se încarcă
                    imediat ce confirmați datele de facturare.
                  </div>
                  <div class="text-xs text-muted-foreground flex items-center gap-1.5 pt-2">
                    <Lock class="size-3.5" :stroke-width="2" />
                    Datele cardului nu ajung niciodată la Rapidport.
                  </div>
                </div>

                <div v-else class="rounded-2xl border border-border bg-card p-6 space-y-4">
                  <div v-if="!elementsReady" class="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 class="size-4 animate-spin" :stroke-width="2" />
                    Se încarcă formularul securizat…
                  </div>
                  <!-- Stripe mounts its iframe here. Container height is driven by Stripe's markup. -->
                  <div id="payment-element" />
                  <div v-if="payError" class="text-xs text-destructive" role="alert">
                    {{ payError }}
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

                <!-- Consent only shown on billing step; once committed it's implied. -->
                <label v-if="step === 'billing'" class="flex items-start gap-3 text-xs text-muted-foreground leading-relaxed mb-5 cursor-pointer">
                  <input v-model="consent" type="checkbox" class="mt-0.5 size-4 rounded border-input accent-primary cursor-pointer" />
                  <span>
                    Sunt de acord cu
                    <NuxtLink to="/legal/terms" class="text-primary hover:underline">termenii</NuxtLink>
                    și
                    <NuxtLink to="/legal/privacy" class="text-primary hover:underline">politica de confidențialitate</NuxtLink>.
                  </span>
                </label>

                <!-- Step-dependent CTA. -->
                <Button
                  v-if="step === 'billing'"
                  class="rounded-full h-12 w-full text-base font-medium"
                  :disabled="!billingValid || submitting"
                  @click="submitBilling"
                >
                  <Loader2 v-if="submitting" class="size-4 mr-1 animate-spin" :stroke-width="2" />
                  <Check v-else class="size-4 mr-1" :stroke-width="2.5" />
                  {{ submitting ? 'Se procesează…' : `Continuă · ${total} RON` }}
                </Button>
                <Button
                  v-else
                  class="rounded-full h-12 w-full text-base font-medium"
                  :disabled="!elementsReady || submitting"
                  @click="confirmPayment"
                >
                  <Loader2 v-if="submitting || !elementsReady" class="size-4 mr-1 animate-spin" :stroke-width="2" />
                  <Lock v-else class="size-4 mr-1" :stroke-width="2" />
                  {{ submitting ? 'Confirmăm…' : `Plătește ${total} RON` }}
                </Button>

                <div v-if="submitError && step === 'billing'" class="mt-3 text-xs text-destructive">
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
