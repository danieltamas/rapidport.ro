<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { ArrowRight, ArrowLeft, CircleCheck, CircleAlert, Layers } from 'lucide-vue-next'

const route = useRoute()
const jobId = computed(() => String(route.params.id))

useHead({
  title: () => `Analiză structură #${jobId.value.slice(0, 8)} — Rapidport`,
  htmlAttrs: { lang: 'ro' },
})

const categories = [
  { key: 'core', label: 'Nomenclator principal', count: 38, desc: 'NPART, NART, NGEST, NPLAN, angajați, contracte' },
  { key: 'txn', label: 'Tranzacțional (lunar)', count: 24, desc: 'INTRARI, IESIRI, NOTE, CASH, BANK × 51 luni' },
  { key: 'lookup', label: 'Listă statică (lookup)', count: 17, desc: 'NLOCATII, NMONEDE, NJUDETE — păstrate dacă SAGA nu le are' },
  { key: 'skip', label: 'Ignorate', count: 368, desc: 'Config, cache, declarații D394/D406 (SAGA le generează)' },
]

const tables = [
  { name: 'NPART.DB', cls: 'Nomenclator', desc: 'Parteneri (furnizori + clienți)', rows: 847, parser: 'standard', enc: 'CP852' },
  { name: 'NART.DB', cls: 'Nomenclator', desc: 'Articole', rows: 2341, parser: 'standard', enc: 'CP852' },
  { name: 'NGEST.DB', cls: 'Nomenclator', desc: 'Gestiuni', rows: 18, parser: 'standard', enc: 'CP852' },
  { name: 'NPLAN.DB', cls: 'Nomenclator', desc: 'Plan de conturi', rows: 412, parser: 'standard', enc: 'CP852' },
  { name: 'INTRARI.DB', cls: 'Tranzacțional', desc: 'Facturi primite (toate lunile)', rows: 9287, parser: 'standard', enc: 'CP852' },
  { name: 'IESIRI.DB', cls: 'Tranzacțional', desc: 'Facturi emise', rows: 8953, parser: 'standard', enc: 'CP852' },
  { name: 'NOTE.DB', cls: 'Tranzacțional', desc: 'Note contabile', rows: 6472, parser: 'standard', enc: 'CP852' },
  { name: 'BUGET1.DB', cls: 'Nomenclator', desc: 'Buget categorii', rows: 45, parser: 'fallback', enc: 'CP1250' },
]
</script>

<template>
  <div class="bg-background text-foreground min-h-dvh flex flex-col">
    <LayoutSiteHeader />

    <main class="flex-1">
      <section class="border-b border-border">
        <div class="mx-auto max-w-[1280px] px-6 py-14">
          <div class="mb-8">
            <NuxtLink :to="`/job/${jobId}/status`" class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft class="size-4" :stroke-width="2" />
              Înapoi la status
            </NuxtLink>
          </div>

          <div class="mb-10">
            <div class="text-sm font-medium text-primary mb-2">Analiză structură</div>
            <h1 class="text-3xl md:text-4xl font-bold tracking-tight leading-tight mb-3" style="color: #000;">
              19.600 fișiere · 447 tabele root · 51 luni
            </h1>
            <p class="text-lg text-muted-foreground max-w-2xl leading-relaxed">
              WinMentor 9.2 · codare CP852 · perioadă dec. 2021 – feb. 2026. Cifrele de mai jos vin din arhiva dvs., nu sunt estimări.
            </p>
          </div>

          <!-- Categories summary -->
          <div class="grid md:grid-cols-4 gap-4 mb-10">
            <div
              v-for="cat in categories"
              :key="cat.key"
              class="rounded-2xl border border-border bg-card p-6"
            >
              <div class="flex items-center gap-2 mb-3">
                <Layers class="size-4 text-muted-foreground" :stroke-width="2" />
                <span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ cat.label }}</span>
              </div>
              <div class="text-3xl font-bold tabular-nums mb-2">{{ cat.count }}</div>
              <div class="text-xs text-muted-foreground leading-relaxed">{{ cat.desc }}</div>
            </div>
          </div>

          <!-- Tables list -->
          <div>
            <div class="flex items-baseline justify-between mb-4">
              <h2 class="text-xl font-bold tracking-tight">Tabele identificate</h2>
              <span class="text-xs text-muted-foreground">arătate primele 8 din 79 relevante</span>
            </div>
            <div class="border border-border rounded-2xl bg-card overflow-hidden">
              <div class="grid grid-cols-[1.3fr_1fr_2fr_0.8fr_0.6fr_0.7fr] gap-4 px-5 py-3 border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <div>Tabelă</div>
                <div>Clasificare</div>
                <div>Descriere</div>
                <div class="text-right">Rânduri</div>
                <div>Codare</div>
                <div>Parser</div>
              </div>
              <div
                v-for="t in tables"
                :key="t.name"
                class="grid grid-cols-[1.3fr_1fr_2fr_0.8fr_0.6fr_0.7fr] gap-4 px-5 py-3 border-b border-border last:border-b-0 text-sm items-center"
              >
                <div class="font-mono text-sm">{{ t.name }}</div>
                <div class="text-muted-foreground">{{ t.cls }}</div>
                <div class="text-muted-foreground text-sm">{{ t.desc }}</div>
                <div class="text-right font-mono tabular-nums">{{ t.rows.toLocaleString('ro-RO') }}</div>
                <div class="font-mono text-xs text-muted-foreground">{{ t.enc }}</div>
                <div>
                  <span
                    class="inline-flex items-center gap-1 text-xs font-medium"
                    :class="t.parser === 'standard' ? 'text-success' : 'text-warning'"
                  >
                    <CircleCheck v-if="t.parser === 'standard'" class="size-3" :stroke-width="2.5" />
                    <CircleAlert v-else class="size-3" :stroke-width="2.5" />
                    {{ t.parser }}
                  </span>
                </div>
              </div>
            </div>
            <div class="mt-4 text-sm text-muted-foreground">
              1 tabelă folosește parser-ul de rezervă (Paradox non-standard) — este normal pentru BUGET1.DB în versiunile WinMentor 9.x.
            </div>
          </div>

          <!-- CTA -->
          <div class="mt-10 flex justify-end gap-3">
            <Button variant="outline" class="rounded-full h-12 px-5" as-child>
              <NuxtLink :to="`/job/${jobId}/status`">Înapoi</NuxtLink>
            </Button>
            <Button class="rounded-full h-12 px-7 font-medium" as-child>
              <NuxtLink :to="`/job/${jobId}/mapping`">
                Continuă la mapare
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
