<script setup lang="ts">
import { Button } from '~/components/ui/button'
import {
  ArrowRight,
  ArrowLeft,
  Download,
  CircleCheck,
  CircleAlert,
  RefreshCw,
} from 'lucide-vue-next'

useHead({
  title: 'Portările mele — Rapidport',
  htmlAttrs: { lang: 'ro' },
})

// Stub list — real data lands with api-jobs-list.
const migrations = [
  { id: 'job_a1b2', client: 'SC Cabinet Exemplu SRL', cif: 'RO12345678', direction: 'WinMentor → SAGA', date: 'acum 3 zile', records: 17284, amount: 499, status: 'ready' as const, statusLabel: 'Gata', downloadAvailable: true, expiresIn: '27 de zile', deltaSyncsRemaining: 3 },
  { id: 'job_c3d4', client: 'SC Beta Retail SRL', cif: 'RO87654321', direction: 'SAGA → WinMentor', date: 'acum 2 săptămâni', records: 8340, amount: 299, status: 'ready' as const, statusLabel: 'Gata', downloadAvailable: true, expiresIn: '16 zile', deltaSyncsRemaining: 1 },
  { id: 'job_e5f6', client: 'SC Gamma Servicii SRL', cif: 'RO11223344', direction: 'WinMentor → SAGA', date: 'acum 1 lună', records: 4102, amount: 299, status: 'expired' as const, statusLabel: 'Expirat', downloadAvailable: false, expiresIn: null, deltaSyncsRemaining: 0 },
]

function statusColor(status: 'ready' | 'expired' | 'failed' | 'pending') {
  switch (status) {
    case 'ready': return 'bg-success/10 text-success'
    case 'expired': return 'bg-muted text-muted-foreground'
    case 'failed': return 'bg-destructive/10 text-destructive'
    case 'pending': return 'bg-primary/10 text-primary'
  }
}

const formatNum = (n: number) => new Intl.NumberFormat('ro-RO').format(n)
const formatRon = (n: number) => new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 0 }).format(n)
</script>

<template>
  <div class="bg-background text-foreground min-h-dvh flex flex-col">
    <LayoutSiteHeader />

    <main class="flex-1">
      <section>
        <div class="mx-auto max-w-[1280px] px-6 py-14">
          <NuxtLink to="/account" class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft class="size-4" :stroke-width="2" />
            Contul meu
          </NuxtLink>

          <div class="flex flex-wrap items-end justify-between gap-4 mb-10">
            <div>
              <h1 class="text-3xl md:text-4xl font-bold tracking-tight leading-tight" style="color: #000;">
                Portările mele
              </h1>
              <p class="mt-2 text-muted-foreground max-w-2xl">
                Toate portările efectuate. Fișierele rezultate se păstrează 30 de zile; după aceea rămân doar datele de audit.
              </p>
            </div>
            <Button class="rounded-full h-11 px-5" as-child>
              <NuxtLink to="/upload">
                Portare nouă
                <ArrowRight class="size-4 ml-1" :stroke-width="2" />
              </NuxtLink>
            </Button>
          </div>

          <div class="border border-border rounded-2xl bg-card overflow-hidden">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th class="text-left px-5 py-3 font-semibold">Client</th>
                  <th class="text-left px-5 py-3 font-semibold">Direcție</th>
                  <th class="text-right px-5 py-3 font-semibold w-32">Înregistrări</th>
                  <th class="text-right px-5 py-3 font-semibold w-32">Sumă</th>
                  <th class="text-left px-5 py-3 font-semibold w-36">Data</th>
                  <th class="text-left px-5 py-3 font-semibold w-28">Status</th>
                  <th class="text-right px-5 py-3 font-semibold w-48">Acțiuni</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="m in migrations" :key="m.id" class="border-b border-border last:border-b-0 align-middle">
                  <td class="px-5 py-4">
                    <div class="font-semibold">{{ m.client }}</div>
                    <div class="text-xs text-muted-foreground mt-0.5 font-mono">{{ m.cif }}</div>
                  </td>
                  <td class="px-5 py-4 font-mono text-xs text-muted-foreground">{{ m.direction }}</td>
                  <td class="px-5 py-4 text-right font-mono tabular-nums">{{ formatNum(m.records) }}</td>
                  <td class="px-5 py-4 text-right font-mono tabular-nums">{{ formatRon(m.amount) }} RON</td>
                  <td class="px-5 py-4 text-muted-foreground">{{ m.date }}</td>
                  <td class="px-5 py-4">
                    <span class="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" :class="statusColor(m.status)">
                      <CircleCheck v-if="m.status === 'ready'" class="size-3" :stroke-width="2.5" />
                      <CircleAlert v-else class="size-3" :stroke-width="2.5" />
                      {{ m.statusLabel }}
                    </span>
                  </td>
                  <td class="px-5 py-4">
                    <div class="flex gap-1 justify-end">
                      <Button v-if="m.downloadAvailable" variant="ghost" size="sm" class="rounded-full h-8 px-3 text-xs" as-child>
                        <NuxtLink :to="`/job/${m.id}/result`">
                          <Download class="size-3.5 mr-1" :stroke-width="2" />
                          Descarcă
                        </NuxtLink>
                      </Button>
                      <Button v-if="m.downloadAvailable && m.deltaSyncsRemaining > 0" variant="ghost" size="sm" class="rounded-full h-8 px-3 text-xs">
                        <RefreshCw class="size-3.5 mr-1" :stroke-width="2" />
                        Sincronizare ({{ m.deltaSyncsRemaining }})
                      </Button>
                      <span v-if="!m.downloadAvailable" class="text-xs text-muted-foreground px-3">Fișiere expirate</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p class="mt-6 text-xs text-muted-foreground max-w-3xl">
            După 30 de zile de la finalizarea unei portări, fișierele se șterg automat conform politicii GDPR. Datele de audit (cine, când, ce sumă) rămân în sistem pentru conformitate.
          </p>
        </div>
      </section>
    </main>

    <LayoutSiteFooter />
  </div>
</template>
