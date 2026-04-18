<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { Download, FileText, CircleCheck, ArrowLeft, RefreshCw, Mail } from 'lucide-vue-next'

const route = useRoute()
const jobId = computed(() => String(route.params.id))

useHead({
  title: () => `Pachet gata #${jobId.value.slice(0, 8)} — Rapidport`,
  htmlAttrs: { lang: 'ro' },
})

const files = [
  { name: 'terti.dbf', size: '412 KB', desc: '847 parteneri pentru secțiunea Terți din SAGA' },
  { name: 'articole.dbf', size: '1,3 MB', desc: '2.341 articole' },
  { name: 'articole_contabile.csv', size: '186 KB', desc: 'mapare articole → conturi' },
  { name: 'intrari/', size: '4,7 MB', desc: '47 fișiere XML — facturi primite per lună' },
  { name: 'iesiri/', size: '5,1 MB', desc: '47 fișiere XML — facturi emise per lună' },
  { name: 'note_contabile/', size: '2,8 MB', desc: '47 fișiere XML — note contabile per lună' },
  { name: 'raport.pdf', size: '3,2 MB', desc: 'raport complet al conversiei (în română)' },
  { name: 'raport.json', size: '812 KB', desc: 'date structurate ale conversiei (pentru integrare)' },
]

const stats = { partners: 847, articles: 2341, invoices: 18240, journal: 6472, mapped: 99.8, skipped: 12 }
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

          <!-- Success hero -->
          <div class="text-center mb-14">
            <div class="size-16 rounded-full bg-success/10 text-success grid place-items-center mx-auto mb-6">
              <CircleCheck class="size-8" :stroke-width="2" />
            </div>
            <div class="text-sm font-medium text-primary mb-3">Pachet gata · pas 3 din 3</div>
            <h1 class="text-4xl md:text-5xl font-bold tracking-tight leading-tight" style="color: #000;">
              Portarea a reușit.
            </h1>
            <p class="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">
              {{ stats.mapped }}% din câmpuri mapate · {{ stats.skipped }} înregistrări cu mențiuni în raport.
              Pachetul pentru Import Date în SAGA este gata.
            </p>
          </div>

          <!-- Stats -->
          <div class="grid md:grid-cols-4 border border-border rounded-2xl bg-card divide-x md:divide-x divide-y md:divide-y-0 divide-border overflow-hidden mb-10">
            <div class="p-6">
              <div class="text-xs text-muted-foreground mb-1">Parteneri</div>
              <div class="text-3xl font-bold tabular-nums">{{ stats.partners.toLocaleString('ro-RO') }}</div>
            </div>
            <div class="p-6">
              <div class="text-xs text-muted-foreground mb-1">Articole</div>
              <div class="text-3xl font-bold tabular-nums">{{ stats.articles.toLocaleString('ro-RO') }}</div>
            </div>
            <div class="p-6">
              <div class="text-xs text-muted-foreground mb-1">Facturi</div>
              <div class="text-3xl font-bold tabular-nums">{{ stats.invoices.toLocaleString('ro-RO') }}</div>
            </div>
            <div class="p-6">
              <div class="text-xs text-muted-foreground mb-1">Note contabile</div>
              <div class="text-3xl font-bold tabular-nums">{{ stats.journal.toLocaleString('ro-RO') }}</div>
            </div>
          </div>

          <!-- Download big CTA -->
          <div class="rounded-2xl border border-primary/30 bg-primary/5 p-6 md:p-8 mb-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <div class="text-xl font-bold mb-1" style="color: #000;">Descărcați pachetul SAGA</div>
              <div class="text-sm text-muted-foreground">
                ZIP unic cu toate fișierele · 17,8 MB · link valabil 30 de zile
              </div>
            </div>
            <Button class="rounded-full h-12 px-7 font-medium text-base shrink-0">
              <Download class="size-4 mr-1" :stroke-width="2" />
              Descarcă ZIP (17,8 MB)
            </Button>
          </div>

          <!-- File list -->
          <div>
            <h2 class="text-lg font-semibold mb-4">Conținut pachet</h2>
            <div class="border border-border rounded-2xl bg-card divide-y divide-border">
              <div
                v-for="f in files"
                :key="f.name"
                class="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors"
              >
                <FileText class="size-5 text-muted-foreground shrink-0" :stroke-width="1.5" />
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-3">
                    <span class="font-mono text-sm font-medium truncate">{{ f.name }}</span>
                    <span class="font-mono text-xs text-muted-foreground shrink-0">{{ f.size }}</span>
                  </div>
                  <div class="text-xs text-muted-foreground mt-1 truncate">{{ f.desc }}</div>
                </div>
                <Button variant="ghost" size="sm" class="rounded-full h-8 px-3 text-xs shrink-0">
                  <Download class="size-3.5" :stroke-width="2" />
                </Button>
              </div>
            </div>
          </div>

          <!-- Next actions -->
          <div class="mt-10 grid md:grid-cols-2 gap-4">
            <div class="rounded-2xl border border-border bg-card p-6">
              <FileText class="size-5 text-primary mb-3" :stroke-width="2" />
              <div class="font-semibold mb-2">Ghid Import Date în SAGA</div>
              <p class="text-sm text-muted-foreground mb-4 leading-relaxed">
                Ordinea corectă a importurilor, setări recomandate și ce să verificați după.
              </p>
              <Button variant="outline" size="sm" class="rounded-full h-9">
                Deschide ghid PDF
              </Button>
            </div>
            <div class="rounded-2xl border border-border bg-card p-6">
              <RefreshCw class="size-5 text-primary mb-3" :stroke-width="2" />
              <div class="font-semibold mb-2">Sincronizări delta (3 incluse)</div>
              <p class="text-sm text-muted-foreground mb-4 leading-relaxed">
                Dacă apar facturi noi în WinMentor între timp, le aducem incremental în SAGA.
              </p>
              <Button variant="outline" size="sm" class="rounded-full h-9">
                Programează delta sync
              </Button>
            </div>
          </div>

          <div class="mt-10 text-sm text-muted-foreground flex items-center gap-2">
            <Mail class="size-4" :stroke-width="2" />
            Factura și link-ul de descărcare au fost trimise la <span class="text-foreground font-medium">contact@cabinet-exemplu.ro</span>.
          </div>
        </div>
      </section>
    </main>

    <LayoutSiteFooter />
  </div>
</template>
