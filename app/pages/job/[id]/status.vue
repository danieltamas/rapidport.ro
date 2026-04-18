<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { Check, Loader2, CircleAlert, Clock, FileText, ArrowRight, RefreshCw } from 'lucide-vue-next'

const route = useRoute()
const jobId = computed(() => String(route.params.id))

useHead({
  title: () => `Portare #${jobId.value.slice(0, 8)} — Rapidport`,
  htmlAttrs: { lang: 'ro' },
})

// Mocked live state — wave 4 will connect to SSE /api/jobs/[id]/events
const stages = [
  { id: 'upload', label: 'Încărcare', status: 'done', time: '00:08' },
  { id: 'discover', label: 'Analiză structură', status: 'done', time: '00:12' },
  { id: 'map', label: 'Mapare câmpuri (AI)', status: 'done', time: '01:47' },
  { id: 'review', label: 'Revizuire', status: 'active', time: null },
  { id: 'pay', label: 'Plată', status: 'pending', time: null },
  { id: 'convert', label: 'Generare SAGA', status: 'pending', time: null },
  { id: 'ready', label: 'Gata de descărcare', status: 'pending', time: null },
]

const log = [
  { t: '00:00', msg: 'arhivă primită · winmentor_2026-04-09.tgz · 8.1 MB' },
  { t: '00:02', msg: 'extract → 19.600 fișiere · 447 tabele root · 51 foldere lunare' },
  { t: '00:05', msg: 'detect: WinMentor 9.2 · CP852 · 847 parteneri · 2.341 articole' },
  { t: '00:09', msg: 'mapare regulă: 647 câmpuri · AI: 58 câmpuri · review: 12 câmpuri' },
  { t: '01:52', msg: 'raport de analiză gata — așteaptă revizuire', mark: 'attention' },
]

const stats = { partners: 847, articles: 2341, invoices: 18240, journal: 6472 }
</script>

<template>
  <div class="bg-background text-foreground min-h-dvh flex flex-col">
    <LayoutSiteHeader />

    <main class="flex-1">
      <section class="border-b border-border">
        <div class="mx-auto max-w-[1280px] px-6 py-14">
          <div class="flex flex-wrap items-end justify-between gap-6 mb-10">
            <div>
              <div class="text-sm font-medium text-primary mb-2">Pas 2 din 3 · Revizuire</div>
              <h1 class="text-3xl md:text-4xl font-bold tracking-tight leading-tight" style="color: #000;">
                Portare <span class="font-mono text-muted-foreground text-2xl md:text-3xl">#{{ jobId.slice(0, 8) }}</span>
              </h1>
              <div class="mt-3 text-sm text-muted-foreground">
                WinMentor 9.2 → SAGA C 3.0 · SC Exemplu SRL · RO12345678
              </div>
            </div>
            <div class="flex items-center gap-2 bg-warning/10 text-warning border border-warning/20 px-3 py-1.5 rounded-full text-sm font-medium">
              <CircleAlert class="size-4" :stroke-width="2" />
              Așteaptă revizuire
            </div>
          </div>

          <!-- Stage timeline -->
          <div class="grid md:grid-cols-7 gap-0 border border-border rounded-2xl overflow-hidden bg-card">
            <div
              v-for="(s, idx) in stages"
              :key="s.id"
              class="p-4 md:p-5 relative"
              :class="[
                idx < stages.length - 1 ? 'md:border-r border-border' : '',
                idx < stages.length - 1 ? 'border-b md:border-b-0' : '',
              ]"
            >
              <div class="flex items-center gap-2 mb-2">
                <div
                  class="size-6 rounded-full grid place-items-center shrink-0"
                  :class="{
                    'bg-primary text-primary-foreground': s.status === 'done',
                    'bg-warning/20 text-warning': s.status === 'active',
                    'bg-muted text-muted-foreground': s.status === 'pending',
                  }"
                >
                  <Check v-if="s.status === 'done'" class="size-3.5" :stroke-width="3" />
                  <Loader2 v-else-if="s.status === 'active'" class="size-3.5 animate-spin" :stroke-width="2.5" />
                  <span v-else class="text-[10px] font-mono">{{ String(idx + 1).padStart(2, '0') }}</span>
                </div>
                <div class="text-xs font-mono text-muted-foreground tabular-nums">
                  {{ s.time || '—' }}
                </div>
              </div>
              <div class="text-sm font-semibold">{{ s.label }}</div>
            </div>
          </div>

          <!-- Stats from discovery -->
          <div class="mt-6 grid grid-cols-2 md:grid-cols-4 border border-border rounded-2xl bg-card divide-x md:divide-x divide-y-0 md:divide-y-0 divide-border overflow-hidden">
            <div class="p-5">
              <div class="text-xs text-muted-foreground mb-1">Parteneri</div>
              <div class="text-2xl font-bold tabular-nums">{{ stats.partners.toLocaleString('ro-RO') }}</div>
            </div>
            <div class="p-5">
              <div class="text-xs text-muted-foreground mb-1">Articole</div>
              <div class="text-2xl font-bold tabular-nums">{{ stats.articles.toLocaleString('ro-RO') }}</div>
            </div>
            <div class="p-5">
              <div class="text-xs text-muted-foreground mb-1">Facturi</div>
              <div class="text-2xl font-bold tabular-nums">{{ stats.invoices.toLocaleString('ro-RO') }}</div>
            </div>
            <div class="p-5">
              <div class="text-xs text-muted-foreground mb-1">Note contabile</div>
              <div class="text-2xl font-bold tabular-nums">{{ stats.journal.toLocaleString('ro-RO') }}</div>
            </div>
          </div>

          <!-- Event log -->
          <div class="mt-8">
            <div class="text-sm font-semibold mb-3">Jurnal evenimente</div>
            <div class="border border-border rounded-xl bg-card divide-y divide-border">
              <div
                v-for="(e, i) in log"
                :key="i"
                class="flex items-start gap-4 px-4 py-3 font-mono text-xs"
              >
                <span class="text-muted-foreground tabular-nums shrink-0">{{ e.t }}</span>
                <span
                  :class="e.mark === 'attention' ? 'text-warning font-medium' : 'text-foreground'"
                >
                  {{ e.msg }}
                </span>
              </div>
            </div>
          </div>

          <!-- Primary CTA -->
          <div class="mt-10 rounded-2xl border border-primary/30 bg-primary/5 p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div class="flex-1">
              <div class="text-lg font-semibold mb-1">Revizuiți maparea câmpurilor</div>
              <div class="text-sm text-muted-foreground leading-relaxed">
                12 câmpuri au încredere scăzută și necesită aprobarea dvs. Restul de 705 câmpuri au fost mapate automat.
              </div>
            </div>
            <div class="flex gap-3 shrink-0">
              <Button variant="outline" class="rounded-full h-12 px-5" as-child>
                <NuxtLink :to="`/job/${jobId}/discovery`">
                  <FileText class="size-4 mr-1" :stroke-width="2" />
                  Vezi analiza
                </NuxtLink>
              </Button>
              <Button class="rounded-full h-12 px-7 font-medium" as-child>
                <NuxtLink :to="`/job/${jobId}/mapping`">
                  Începe revizuirea
                  <ArrowRight class="size-4 ml-1" :stroke-width="2" />
                </NuxtLink>
              </Button>
            </div>
          </div>

          <div class="mt-6 text-xs text-muted-foreground flex items-center gap-2">
            <Clock class="size-3.5" :stroke-width="2" />
            Arhiva și pachetul generat se șterg automat după 30 de zile. Link-ul de status este al dvs. —
            salvați-l sau adăugați-l la favorite.
            <button class="text-primary hover:underline ml-auto flex items-center gap-1 cursor-pointer">
              <RefreshCw class="size-3" :stroke-width="2" />
              Reîmprospătează
            </button>
          </div>
        </div>
      </section>
    </main>

    <LayoutSiteFooter />
  </div>
</template>
