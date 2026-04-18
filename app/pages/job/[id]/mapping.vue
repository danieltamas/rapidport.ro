<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { ArrowRight, ArrowLeft, CircleCheck, CircleAlert, Search, Monitor, Wand2 } from 'lucide-vue-next'

const route = useRoute()
const jobId = computed(() => String(route.params.id))

useHead({
  title: () => `Mapare câmpuri #${jobId.value.slice(0, 8)} — Rapidport`,
  htmlAttrs: { lang: 'ro' },
})

const q = ref('')
const filter = ref<'all' | 'review' | 'ai' | 'rule'>('review')

type Row = { source: string; target: string; confidence: number; kind: 'rule' | 'ai' | 'review'; sample: string }

const mappings: Row[] = [
  { source: 'NPART.CodFis', target: 'terti.cif', confidence: 1, kind: 'rule', sample: 'RO12345678' },
  { source: 'NPART.Denumire', target: 'terti.nume', confidence: 1, kind: 'rule', sample: 'SC EXEMPLU SRL' },
  { source: 'NPART.Adresa', target: 'terti.adresa', confidence: 1, kind: 'rule', sample: 'Str. X nr. 1, Cluj' },
  { source: 'NPART.TipPlatit', target: 'terti.tip_pers', confidence: 0.94, kind: 'ai', sample: '"PJ" → "juridica"' },
  { source: 'NPART.Observatii2', target: 'terti.mentiuni', confidence: 0.61, kind: 'review', sample: '"trim. IV"' },
  { source: 'NART.CodArt', target: 'articole.cod', confidence: 1, kind: 'rule', sample: 'ART00123' },
  { source: 'NART.UnitateMasura', target: 'articole.um', confidence: 1, kind: 'rule', sample: 'buc' },
  { source: 'NART.CotaTVA', target: 'articole.tva_cod', confidence: 0.86, kind: 'ai', sample: '19 → "V19"' },
  { source: 'NART.CategorieXYZ', target: '— neidentificat —', confidence: 0.42, kind: 'review', sample: '"A1"' },
  { source: 'INTRARI.NrDoc', target: 'intrari.numar', confidence: 1, kind: 'rule', sample: 'FAC-000847' },
  { source: 'INTRARI.DataDoc', target: 'intrari.data', confidence: 1, kind: 'rule', sample: '2024-06-15' },
  { source: 'INTRARI.TipPlata', target: 'intrari.metoda', confidence: 0.73, kind: 'review', sample: '"virament bancar"' },
]

const counts = computed(() => ({
  all: mappings.length,
  rule: mappings.filter(m => m.kind === 'rule').length,
  ai: mappings.filter(m => m.kind === 'ai').length,
  review: mappings.filter(m => m.kind === 'review').length,
}))

const filtered = computed(() => mappings.filter(m => {
  if (filter.value !== 'all' && m.kind !== filter.value) return false
  if (!q.value) return true
  const needle = q.value.toLowerCase()
  return m.source.toLowerCase().includes(needle) || m.target.toLowerCase().includes(needle)
}))
</script>

<template>
  <div class="bg-background text-foreground min-h-dvh flex flex-col">
    <LayoutSiteHeader />

    <main class="flex-1">
      <!-- Desktop-only banner -->
      <div class="lg:hidden bg-warning/10 border-b border-warning/20">
        <div class="mx-auto max-w-[1280px] px-6 py-4 flex items-start gap-3">
          <Monitor class="size-5 text-warning shrink-0 mt-0.5" :stroke-width="2" />
          <div class="text-sm text-warning">
            <strong>Folosiți un laptop sau desktop.</strong> Maparea a 800+ câmpuri nu este uzabilă pe telefon. Linkul de status este salvat — reveniți de pe calculator.
          </div>
        </div>
      </div>

      <section class="border-b border-border">
        <div class="mx-auto max-w-[1280px] px-6 py-12">
          <div class="mb-8">
            <NuxtLink :to="`/job/${jobId}/status`" class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft class="size-4" :stroke-width="2" />
              Înapoi la status
            </NuxtLink>
          </div>

          <div class="flex flex-wrap items-end justify-between gap-6 mb-8">
            <div>
              <div class="text-sm font-medium text-primary mb-2">Pas 2 din 3 · Mapare</div>
              <h1 class="text-3xl md:text-4xl font-bold tracking-tight leading-tight" style="color: #000;">
                Revizuiți maparea câmpurilor
              </h1>
              <p class="mt-2 text-muted-foreground max-w-2xl">
                {{ counts.rule }} mapate prin regulă · {{ counts.ai }} mapate AI cu încredere &gt; 70% · <strong class="text-warning">{{ counts.review }} necesită aprobare</strong>
              </p>
            </div>
            <div class="flex gap-2 text-sm">
              <button
                v-for="(label, key) in { review: `Necesită revizuire (${counts.review})`, ai: `AI (${counts.ai})`, rule: `Regulă (${counts.rule})`, all: `Toate (${counts.all})` }"
                :key="key"
                class="px-3 py-1.5 rounded-full border transition-colors cursor-pointer"
                :class="filter === key ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:border-primary/40'"
                @click="filter = key as typeof filter"
              >
                {{ label }}
              </button>
            </div>
          </div>

          <div class="mb-4 relative max-w-md">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" :stroke-width="2" />
            <Input v-model="q" placeholder="Caută după nume câmp sursă sau țintă…" class="pl-10 h-11" />
          </div>

          <div class="border border-border rounded-2xl bg-card overflow-hidden">
            <div class="grid grid-cols-[2fr_2fr_1.5fr_0.8fr_1fr] gap-4 px-5 py-3 border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <div>Câmp sursă</div>
              <div>Câmp țintă</div>
              <div>Exemplu</div>
              <div>Încredere</div>
              <div class="text-right">Acțiune</div>
            </div>
            <div
              v-for="m in filtered"
              :key="m.source"
              class="grid grid-cols-[2fr_2fr_1.5fr_0.8fr_1fr] gap-4 px-5 py-3 border-b border-border last:border-b-0 text-sm items-center"
              :class="m.kind === 'review' ? 'bg-warning/5' : ''"
            >
              <div class="font-mono text-sm">{{ m.source }}</div>
              <div class="font-mono text-sm flex items-center gap-2">
                <span class="text-primary">→</span>
                <span :class="m.target.startsWith('—') ? 'text-destructive' : ''">{{ m.target }}</span>
              </div>
              <div class="font-mono text-xs text-muted-foreground truncate">{{ m.sample }}</div>
              <div>
                <div class="flex items-center gap-2">
                  <div class="w-14 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      class="h-full rounded-full"
                      :class="m.confidence >= 0.9 ? 'bg-success' : m.confidence >= 0.7 ? 'bg-primary' : 'bg-warning'"
                      :style="{ width: `${Math.round(m.confidence * 100)}%` }"
                    />
                  </div>
                  <span class="text-xs font-mono tabular-nums">{{ Math.round(m.confidence * 100) }}%</span>
                </div>
              </div>
              <div class="flex justify-end gap-1">
                <Button
                  v-if="m.kind === 'review'"
                  size="sm"
                  class="rounded-full h-8 px-3 text-xs"
                >
                  Aprobă
                </Button>
                <Button
                  v-else
                  variant="ghost"
                  size="sm"
                  class="rounded-full h-8 px-3 text-xs text-muted-foreground"
                >
                  Schimbă
                </Button>
              </div>
            </div>
          </div>

          <div v-if="filtered.length === 0" class="text-center py-12 text-muted-foreground text-sm">
            Niciun câmp nu se potrivește filtrului curent.
          </div>

          <!-- CTA -->
          <div class="mt-10 rounded-2xl border border-primary/30 bg-primary/5 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <div class="font-semibold mb-1 flex items-center gap-2">
                <Wand2 class="size-4 text-primary" :stroke-width="2" />
                Maparea este gata de conversie
              </div>
              <div class="text-sm text-muted-foreground">
                {{ counts.review }} câmpuri aprobate · 0 rămase. Prețul final: <strong class="text-foreground">499 RON + TVA</strong> (pachet Standard).
              </div>
            </div>
            <Button class="rounded-full h-12 px-7 font-medium shrink-0" as-child>
              <NuxtLink :to="`/job/${jobId}/pay`">
                Continuă la plată
                <ArrowRight class="size-4 ml-1" :stroke-width="2" />
              </NuxtLink>
            </Button>
          </div>
        </div>
      </section>
    </main>

    <LayoutSiteFooter />
  </div>
</template>
