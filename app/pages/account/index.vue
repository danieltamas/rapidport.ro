<script setup lang="ts">
import { Button } from '~/components/ui/button'
import {
  ArrowRight,
  Receipt,
  Database,
  Download,
  CircleCheck,
  Clock,
  CircleAlert,
  FileText,
  Settings,
  Layers,
} from 'lucide-vue-next'

useHead({
  title: 'Contul meu — Rapidport',
  htmlAttrs: { lang: 'ro' },
})

// Real API calls land with api-jobs-list + api-payments-list + smartbill-client
// tasks. Until then, these mocks represent the shape + copy so the product is
// testable end-to-end.
const { data: session } = useAsyncData(
  'session',
  () => $fetch<{ email: string | null }>('/api/auth/session', {
    headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined,
  }),
  { lazy: true, default: () => ({ email: null }) },
)

type MigrationStatus = 'ready' | 'expired' | 'failed' | 'pending'

const recentMigrations: Array<{
  id: string
  client: string
  cif: string
  direction: string
  date: string
  status: MigrationStatus
  statusLabel: string
  downloadAvailable: boolean
  expiresIn: string | null
}> = [
  { id: 'job_a1b2', client: 'SC Cabinet Exemplu SRL', cif: 'RO12345678', direction: 'WinMentor → SAGA', date: 'acum 3 zile', status: 'ready', statusLabel: 'Gata', downloadAvailable: true, expiresIn: '27 de zile' },
  { id: 'job_c3d4', client: 'SC Beta Retail SRL', cif: 'RO87654321', direction: 'SAGA → WinMentor', date: 'acum 2 săptămâni', status: 'ready', statusLabel: 'Gata', downloadAvailable: true, expiresIn: '16 zile' },
  { id: 'job_e5f6', client: 'SC Gamma Servicii SRL', cif: 'RO11223344', direction: 'WinMentor → SAGA', date: 'acum 1 lună', status: 'expired', statusLabel: 'Expirat', downloadAvailable: false, expiresIn: null },
]

const recentInvoices = [
  {
    id: 'inv_1',
    series: 'RAPIDPORT-2026-0048',
    date: '2026-04-18',
    amount: 499,
    status: 'paid' as const,
    pdfUrl: '#',
  },
  {
    id: 'inv_2',
    series: 'RAPIDPORT-2026-0031',
    date: '2026-04-05',
    amount: 299,
    status: 'paid' as const,
    pdfUrl: '#',
  },
  {
    id: 'inv_3',
    series: 'RAPIDPORT-2026-0019',
    date: '2026-03-22',
    amount: 499,
    status: 'paid' as const,
    pdfUrl: '#',
  },
]

// Aggregate counters (computed from the full history server-side; stubbed here).
const stats = {
  totalMigrations: 12,
  totalSpent: 3294, // RON, excluding VAT
  spentThisMonth: 798,
  downloadsAvailable: 2,
}

function statusColor(status: MigrationStatus) {
  switch (status) {
    case 'ready': return 'bg-success/10 text-success'
    case 'expired': return 'bg-muted text-muted-foreground'
    case 'failed': return 'bg-destructive/10 text-destructive'
    case 'pending': return 'bg-primary/10 text-primary'
  }
}

const formatRon = (n: number) =>
  new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
</script>

<template>
  <div class="bg-background text-foreground min-h-dvh flex flex-col">
    <LayoutSiteHeader />

    <main class="flex-1">
      <section>
        <div class="mx-auto max-w-[1280px] px-6 py-14">
          <!-- Header row -->
          <div class="flex flex-wrap items-end justify-between gap-4 mb-10">
            <div>
              <div class="text-sm font-medium text-primary mb-2">Contul dvs.</div>
              <h1 class="text-3xl md:text-4xl font-bold tracking-tight leading-tight" style="color: #000;">
                Bună, {{ session?.email?.split('@')[0] ?? 'colaborator' }}.
              </h1>
              <p class="mt-2 text-muted-foreground max-w-2xl">
                Portările recente, facturile pentru contabilitatea dvs. și setările contului — într-un singur loc.
              </p>
            </div>
            <Button class="rounded-full h-11 px-5" as-child>
              <NuxtLink to="/upload">
                Portare nouă
                <ArrowRight class="size-4 ml-1" :stroke-width="2" />
              </NuxtLink>
            </Button>
          </div>

          <!-- Stat cards -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            <div class="rounded-2xl border border-border bg-card p-5">
              <div class="text-xs uppercase tracking-wide text-muted-foreground mb-2">Portări totale</div>
              <div class="text-3xl font-bold tabular-nums">{{ stats.totalMigrations }}</div>
            </div>
            <div class="rounded-2xl border border-border bg-card p-5">
              <div class="text-xs uppercase tracking-wide text-muted-foreground mb-2">Cheltuit total</div>
              <div class="text-3xl font-bold tabular-nums">{{ formatRon(stats.totalSpent) }} <span class="text-base font-medium text-muted-foreground">RON</span></div>
              <div class="text-xs text-muted-foreground mt-1">fără TVA</div>
            </div>
            <div class="rounded-2xl border border-border bg-card p-5">
              <div class="text-xs uppercase tracking-wide text-muted-foreground mb-2">Luna aceasta</div>
              <div class="text-3xl font-bold tabular-nums">{{ formatRon(stats.spentThisMonth) }} <span class="text-base font-medium text-muted-foreground">RON</span></div>
              <div class="text-xs text-muted-foreground mt-1">fără TVA</div>
            </div>
            <div class="rounded-2xl border border-border bg-card p-5">
              <div class="text-xs uppercase tracking-wide text-muted-foreground mb-2">Descărcări disponibile</div>
              <div class="text-3xl font-bold tabular-nums">{{ stats.downloadsAvailable }}</div>
              <div class="text-xs text-muted-foreground mt-1">fișiere în cele 30 zile</div>
            </div>
          </div>

          <!-- Recent migrations -->
          <div class="mb-12">
            <div class="flex items-end justify-between mb-4">
              <div>
                <div class="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  <Database class="size-4" :stroke-width="2" />
                  Portări recente
                </div>
                <p class="text-sm text-muted-foreground">Ultimele trei. Fișierele se păstrează 30 de zile după finalizare.</p>
              </div>
              <NuxtLink to="/account/migrations" class="text-sm text-primary hover:underline flex items-center gap-1">
                Toate portările
                <ArrowRight class="size-3.5" :stroke-width="2" />
              </NuxtLink>
            </div>

            <div class="border border-border rounded-2xl bg-card overflow-hidden">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th class="text-left px-5 py-3 font-semibold">Client</th>
                    <th class="text-left px-5 py-3 font-semibold">Direcție</th>
                    <th class="text-left px-5 py-3 font-semibold w-36">Data</th>
                    <th class="text-left px-5 py-3 font-semibold w-28">Status</th>
                    <th class="text-right px-5 py-3 font-semibold w-44">Acțiuni</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="m in recentMigrations"
                    :key="m.id"
                    class="border-b border-border last:border-b-0 align-middle"
                  >
                    <td class="px-5 py-4">
                      <div class="font-semibold">{{ m.client }}</div>
                      <div class="text-xs text-muted-foreground mt-0.5 font-mono">{{ m.cif }}</div>
                    </td>
                    <td class="px-5 py-4 font-mono text-xs text-muted-foreground">{{ m.direction }}</td>
                    <td class="px-5 py-4 text-muted-foreground">{{ m.date }}</td>
                    <td class="px-5 py-4">
                      <span class="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" :class="statusColor(m.status)">
                        <CircleCheck v-if="m.status === 'ready'" class="size-3" :stroke-width="2.5" />
                        <Clock v-else-if="m.status === 'pending'" class="size-3" :stroke-width="2.5" />
                        <CircleAlert v-else class="size-3" :stroke-width="2.5" />
                        {{ m.statusLabel }}
                      </span>
                    </td>
                    <td class="px-5 py-4">
                      <div class="flex gap-1 justify-end">
                        <Button
                          v-if="m.downloadAvailable"
                          variant="ghost"
                          size="sm"
                          class="rounded-full h-8 px-3 text-xs"
                          as-child
                        >
                          <NuxtLink :to="`/job/${m.id}/result`">
                            <Download class="size-3.5 mr-1" :stroke-width="2" />
                            Descarcă
                          </NuxtLink>
                        </Button>
                        <span v-else class="text-xs text-muted-foreground px-3">Fișiere expirate</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Invoices -->
          <div class="mb-12">
            <div class="flex items-end justify-between mb-4">
              <div>
                <div class="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  <Receipt class="size-4" :stroke-width="2" />
                  Facturi recente
                </div>
                <p class="text-sm text-muted-foreground">Facturi SmartBill emise automat după plată. Le puteți descărca oricând.</p>
              </div>
              <NuxtLink to="/account/invoices" class="text-sm text-primary hover:underline flex items-center gap-1">
                Toate facturile
                <ArrowRight class="size-3.5" :stroke-width="2" />
              </NuxtLink>
            </div>

            <div class="border border-border rounded-2xl bg-card overflow-hidden">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th class="text-left px-5 py-3 font-semibold">Serie + număr</th>
                    <th class="text-left px-5 py-3 font-semibold w-36">Data</th>
                    <th class="text-right px-5 py-3 font-semibold w-36">Sumă fără TVA</th>
                    <th class="text-left px-5 py-3 font-semibold w-28">Status</th>
                    <th class="text-right px-5 py-3 font-semibold w-36">Acțiuni</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="inv in recentInvoices"
                    :key="inv.id"
                    class="border-b border-border last:border-b-0 align-middle"
                  >
                    <td class="px-5 py-4 font-mono text-xs">{{ inv.series }}</td>
                    <td class="px-5 py-4 text-muted-foreground">{{ inv.date }}</td>
                    <td class="px-5 py-4 text-right font-mono tabular-nums">{{ formatRon(inv.amount) }} RON</td>
                    <td class="px-5 py-4">
                      <span class="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-success/10 text-success">
                        <CircleCheck class="size-3" :stroke-width="2.5" />
                        Plătit
                      </span>
                    </td>
                    <td class="px-5 py-4">
                      <div class="flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" class="rounded-full h-8 px-3 text-xs" as-child>
                          <a :href="inv.pdfUrl">
                            <Download class="size-3.5 mr-1" :stroke-width="2" />
                            PDF
                          </a>
                        </Button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Quick links -->
          <div class="grid md:grid-cols-3 gap-4">
            <NuxtLink
              to="/account/security"
              class="group rounded-2xl border border-border bg-card p-5 hover:border-primary/40 transition-colors"
            >
              <Settings class="size-5 text-muted-foreground group-hover:text-primary transition-colors mb-3" :stroke-width="2" />
              <div class="font-semibold mb-1">Securitate</div>
              <p class="text-sm text-muted-foreground">Sesiuni active, ștergere cont, export GDPR.</p>
            </NuxtLink>

            <NuxtLink
              to="/account/invoices"
              class="group rounded-2xl border border-border bg-card p-5 hover:border-primary/40 transition-colors"
            >
              <FileText class="size-5 text-muted-foreground group-hover:text-primary transition-colors mb-3" :stroke-width="2" />
              <div class="font-semibold mb-1">Toate facturile</div>
              <p class="text-sm text-muted-foreground">Istoric complet cu PDF-uri descărcabile.</p>
            </NuxtLink>

            <NuxtLink
              to="/account/profiles"
              class="group rounded-2xl border border-border bg-card p-5 hover:border-primary/40 transition-colors"
            >
              <Layers class="size-5 text-muted-foreground group-hover:text-primary transition-colors mb-3" :stroke-width="2" />
              <div class="font-semibold mb-1">Profiluri de mapare</div>
              <p class="text-sm text-muted-foreground">Suprapuneri manuale peste maparea standard. Pentru cazuri speciale.</p>
            </NuxtLink>
          </div>
        </div>
      </section>
    </main>

    <LayoutSiteFooter />
  </div>
</template>
