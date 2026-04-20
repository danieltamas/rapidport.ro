<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { ArrowLeft, Download, CircleCheck } from 'lucide-vue-next'

useHead({
  title: 'Facturi — Rapidport',
  htmlAttrs: { lang: 'ro' },
})

// Stub — real data lands with api-jobs-list + smartbill-client.
const invoices = [
  { id: 'inv_1', series: 'RAPIDPORT-2026-0048', date: '2026-04-18', amount: 499, jobRef: 'SC Cabinet Exemplu SRL', pdfUrl: '#' },
  { id: 'inv_2', series: 'RAPIDPORT-2026-0031', date: '2026-04-05', amount: 299, jobRef: 'SC Beta Retail SRL', pdfUrl: '#' },
  { id: 'inv_3', series: 'RAPIDPORT-2026-0019', date: '2026-03-22', amount: 499, jobRef: 'SC Gamma Servicii SRL', pdfUrl: '#' },
  { id: 'inv_4', series: 'RAPIDPORT-2026-0012', date: '2026-03-08', amount: 299, jobRef: 'SC Delta Contabilitate SRL', pdfUrl: '#' },
]

const vatRate = 0.19
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

          <div class="mb-10">
            <h1 class="text-3xl md:text-4xl font-bold tracking-tight leading-tight" style="color: #000;">
              Facturi
            </h1>
            <p class="mt-2 text-muted-foreground max-w-2xl">
              Facturi SmartBill emise automat după plată, transmise către ANAF prin eFactura. Le puteți descărca oricând pentru contabilitatea dvs.
            </p>
          </div>

          <div class="border border-border rounded-2xl bg-card overflow-hidden">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th class="text-left px-5 py-3 font-semibold">Serie + număr</th>
                  <th class="text-left px-5 py-3 font-semibold w-36">Data</th>
                  <th class="text-left px-5 py-3 font-semibold">Portare</th>
                  <th class="text-right px-5 py-3 font-semibold w-36">Fără TVA</th>
                  <th class="text-right px-5 py-3 font-semibold w-32">TVA 19%</th>
                  <th class="text-right px-5 py-3 font-semibold w-36">Total</th>
                  <th class="text-left px-5 py-3 font-semibold w-28">Status</th>
                  <th class="text-right px-5 py-3 font-semibold w-28">PDF</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="inv in invoices" :key="inv.id" class="border-b border-border last:border-b-0 align-middle">
                  <td class="px-5 py-4 font-mono text-xs">{{ inv.series }}</td>
                  <td class="px-5 py-4 text-muted-foreground">{{ inv.date }}</td>
                  <td class="px-5 py-4">{{ inv.jobRef }}</td>
                  <td class="px-5 py-4 text-right font-mono tabular-nums">{{ formatRon(inv.amount) }}</td>
                  <td class="px-5 py-4 text-right font-mono tabular-nums text-muted-foreground">{{ formatRon(inv.amount * vatRate) }}</td>
                  <td class="px-5 py-4 text-right font-mono tabular-nums font-semibold">{{ formatRon(inv.amount * (1 + vatRate)) }}</td>
                  <td class="px-5 py-4">
                    <span class="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-success/10 text-success">
                      <CircleCheck class="size-3" :stroke-width="2.5" />
                      Plătit
                    </span>
                  </td>
                  <td class="px-5 py-4">
                    <div class="flex justify-end">
                      <Button variant="ghost" size="sm" class="rounded-full h-8 px-3 text-xs" as-child>
                        <a :href="inv.pdfUrl">
                          <Download class="size-3.5 mr-1" :stroke-width="2" />
                          Descarcă
                        </a>
                      </Button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p class="mt-6 text-xs text-muted-foreground max-w-3xl">
            Emitent: Gamerina SRL (CUI RO43020532). Facturile sunt transmise automat către ANAF prin canalul eFactura. Dacă aveți nevoie de o refacere a facturii (date diferite de facturare), scrieți la <a href="mailto:support@rapidport.ro" class="text-primary hover:underline">support@rapidport.ro</a>.
          </p>
        </div>
      </section>
    </main>

    <LayoutSiteFooter />
  </div>
</template>
