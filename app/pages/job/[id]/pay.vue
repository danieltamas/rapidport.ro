<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { ArrowLeft, Lock, Check, CreditCard } from 'lucide-vue-next'

const route = useRoute()
const jobId = computed(() => String(route.params.id))

useHead({
  title: () => `Plată #${jobId.value.slice(0, 8)} — Rapidport`,
  htmlAttrs: { lang: 'ro' },
})

const entity = ref<'pj' | 'pf'>('pj')
const form = ref({
  cui: 'RO12345678',
  name: 'SC Exemplu SRL',
  address: 'Str. X nr. 1, Cluj-Napoca, Cluj',
  email: 'contact@cabinet-exemplu.ro',
  regCom: 'J12/2020/1234',
})
const consent = ref(false)

const priceNoVat = 499
const vat = Math.round(priceNoVat * 0.19)
const total = priceNoVat + vat
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
                    <div class="text-xs text-muted-foreground">SRL, SA, PFA, II, II, SRL-D</div>
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
                  <div class="grid sm:grid-cols-2 gap-4">
                    <div class="space-y-2">
                      <label class="text-sm font-medium">{{ entity === 'pj' ? 'CUI' : 'CNP' }}</label>
                      <Input v-model="form.cui" class="h-11 font-mono" />
                    </div>
                    <div class="space-y-2">
                      <label class="text-sm font-medium">{{ entity === 'pj' ? 'Denumire firmă' : 'Nume' }}</label>
                      <Input v-model="form.name" class="h-11" />
                    </div>
                  </div>
                  <div v-if="entity === 'pj'" class="space-y-2">
                    <label class="text-sm font-medium">Nr. Registrul Comerțului</label>
                    <Input v-model="form.regCom" class="h-11 font-mono" placeholder="J12/2020/1234" />
                  </div>
                  <div class="space-y-2">
                    <label class="text-sm font-medium">Adresă</label>
                    <Input v-model="form.address" class="h-11" />
                  </div>
                  <div class="space-y-2">
                    <label class="text-sm font-medium">Email (pentru factură + link descărcare)</label>
                    <Input v-model="form.email" type="email" class="h-11" />
                  </div>
                </div>
              </div>

              <!-- Payment (Stripe placeholder) -->
              <div>
                <h2 class="text-lg font-semibold mb-5 flex items-center gap-2">
                  <CreditCard class="size-5 text-muted-foreground" :stroke-width="2" />
                  Card bancar
                </h2>
                <div class="rounded-2xl border border-border bg-card p-6 space-y-4">
                  <div class="space-y-2">
                    <label class="text-sm font-medium">Număr card</label>
                    <div class="h-11 rounded-md border border-input bg-background px-3 flex items-center text-muted-foreground text-sm font-mono">
                      Plata este procesată de Stripe — se încarcă aici câmpul securizat
                    </div>
                  </div>
                  <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-2">
                      <label class="text-sm font-medium">Expirare</label>
                      <div class="h-11 rounded-md border border-input bg-background px-3 flex items-center text-muted-foreground text-sm font-mono">MM / AA</div>
                    </div>
                    <div class="space-y-2">
                      <label class="text-sm font-medium">CVC</label>
                      <div class="h-11 rounded-md border border-input bg-background px-3 flex items-center text-muted-foreground text-sm font-mono">•••</div>
                    </div>
                  </div>
                  <div class="text-xs text-muted-foreground flex items-center gap-1.5 pt-2">
                    <Lock class="size-3.5" :stroke-width="2" />
                    Datele cardului nu ajung niciodată la Rapidport. Procesare prin Stripe cu 3D Secure.
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
                    <span class="text-muted-foreground">Parteneri + articole</span>
                    <span class="font-mono tabular-nums">3.188</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Facturi + note</span>
                    <span class="font-mono tabular-nums">24.712</span>
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
                    <span class="text-muted-foreground">TVA 19%</span>
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
                  :disabled="!consent"
                  as-child
                >
                  <NuxtLink :to="`/job/${jobId}/result`">
                    <Check class="size-4 mr-1" :stroke-width="2.5" />
                    Plătește {{ total }} RON
                  </NuxtLink>
                </Button>

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
