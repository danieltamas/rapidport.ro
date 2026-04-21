<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { Download, FileText, CircleCheck, ArrowLeft, RefreshCw, Mail, CircleAlert } from 'lucide-vue-next'

const route = useRoute()
const jobId = computed(() => String(route.params.id))

useHead({
  title: () => `Pachet gata #${jobId.value.slice(0, 8)} — Rapidport`,
  htmlAttrs: { lang: 'ro' },
})

type Job = {
  id: string
  status: string
  progressStage: string | null
  // Null for jobs created with direction='auto' before worker discover has
  // resolved the concrete direction (schema nullable since migration 0008).
  sourceSoftware: string | null
  targetSoftware: string | null
  billingEmail: string | null
  deltaSyncsUsed: number | null
  deltaSyncsAllowed: number | null
}

const { data: job, refresh } = await useAsyncData(
  () => `job-${jobId.value}`,
  () =>
    $fetch<Job>(`/api/jobs/${jobId.value}`, {
      headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined,
    }),
  { default: () => null },
)

const isReady = computed(() => job.value?.status === 'succeeded')
const srcLabel = computed(() => job.value?.sourceSoftware ?? 'sistemul sursă')
const tgtLabel = computed(() => job.value?.targetSoftware ?? 'sistemul țintă')
const idShort = computed(() => jobId.value.slice(0, 8))
const downloadUrl = computed(() => `/api/jobs/${jobId.value}/download`)
const used = computed(() => job.value?.deltaSyncsUsed ?? 0)
const allowed = computed(() => job.value?.deltaSyncsAllowed ?? 3)
const remaining = computed(() => Math.max(0, allowed.value - used.value))

// Resync action — POST + refresh.
const resyncing = ref(false)
const resyncError = ref<string | null>(null)
async function triggerResync() {
  if (resyncing.value || remaining.value === 0) return
  resyncing.value = true
  resyncError.value = null
  try {
    await $fetch(`/api/jobs/${jobId.value}/resync`, { method: 'POST' })
    await refresh()
    await navigateTo(`/job/${jobId.value}/status`)
  } catch (err) {
    const e = err as { data?: { error?: string } }
    resyncError.value = e?.data?.error ?? 'Eroare necunoscută'
  } finally {
    resyncing.value = false
  }
}
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

          <!-- Not-ready state — protect against direct nav to /result before status='succeeded' -->
          <div v-if="!isReady" class="rounded-2xl border border-border bg-card p-8 text-center">
            <CircleAlert class="size-8 text-muted-foreground mx-auto mb-4" :stroke-width="1.5" />
            <div class="text-lg font-semibold mb-2">Pachetul nu este încă gata</div>
            <p class="text-sm text-muted-foreground mb-6">
              Conversia migrării <span class="font-mono">#{{ idShort }}</span> nu s-a încheiat încă.
            </p>
            <Button as-child class="rounded-full h-10 px-5">
              <NuxtLink :to="`/job/${jobId}/status`">Vezi statusul</NuxtLink>
            </Button>
          </div>

          <template v-else>
            <!-- Success hero -->
            <div class="text-center mb-14">
              <div class="size-16 rounded-full bg-success/10 text-success grid place-items-center mx-auto mb-6">
                <CircleCheck class="size-8" :stroke-width="2" />
              </div>
              <div class="text-sm font-medium text-primary mb-3">Pachet gata</div>
              <h1 class="text-4xl md:text-5xl font-bold tracking-tight leading-tight" style="color: #000;">
                Portarea a reușit.
              </h1>
              <p class="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">
                Pachetul cu fișierele de import pentru SAGA este gata de descărcare.
              </p>
            </div>

            <!-- Download big CTA -->
            <div class="rounded-2xl border border-primary/30 bg-primary/5 p-6 md:p-8 mb-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div>
                <div class="text-xl font-bold mb-1" style="color: #000;">Descărcați pachetul SAGA</div>
                <div class="text-sm text-muted-foreground">
                  ZIP unic cu fișierele de import + raport.pdf + raport.json · link valabil 30 de zile
                </div>
              </div>
              <Button class="rounded-full h-12 px-7 font-medium text-base shrink-0" as-child>
                <a :href="downloadUrl">
                  <Download class="size-4 mr-1" :stroke-width="2" />
                  Descarcă ZIP
                </a>
              </Button>
            </div>

            <!-- Bundle contents — generic; the worker writes a fixed set per the canonical pipeline -->
            <div class="mb-10">
              <h2 class="text-lg font-semibold mb-4">Conținut pachet</h2>
              <div class="border border-border rounded-2xl bg-card divide-y divide-border">
                <div class="flex items-start gap-4 px-5 py-4">
                  <FileText class="size-5 text-muted-foreground shrink-0 mt-0.5" :stroke-width="1.5" />
                  <div class="text-sm text-foreground leading-relaxed">
                    Fișierele de import în SAGA (DBF + XML pe lună) generate din arhiva
                    <span class="font-mono">{{ srcLabel }}</span> originală.
                  </div>
                </div>
                <div class="flex items-start gap-4 px-5 py-4">
                  <FileText class="size-5 text-muted-foreground shrink-0 mt-0.5" :stroke-width="1.5" />
                  <div class="text-sm text-foreground leading-relaxed">
                    <span class="font-mono">raport.pdf</span> — raportul complet al conversiei (în română).
                  </div>
                </div>
                <div class="flex items-start gap-4 px-5 py-4">
                  <FileText class="size-5 text-muted-foreground shrink-0 mt-0.5" :stroke-width="1.5" />
                  <div class="text-sm text-foreground leading-relaxed">
                    <span class="font-mono">raport.json</span> — datele structurate ale conversiei (pentru integrare).
                  </div>
                </div>
              </div>
            </div>

            <!-- Next actions -->
            <div class="grid md:grid-cols-2 gap-4">
              <div class="rounded-2xl border border-border bg-card p-6">
                <FileText class="size-5 text-primary mb-3" :stroke-width="2" />
                <div class="font-semibold mb-2">Ghid Import Date în SAGA</div>
                <p class="text-sm text-muted-foreground mb-4 leading-relaxed">
                  Ordinea corectă a importurilor, setări recomandate și ce să verificați după.
                </p>
                <Button variant="outline" size="sm" class="rounded-full h-9" as-child>
                  <a href="/guide/saga-import.pdf" target="_blank" rel="noopener">Deschide ghid PDF</a>
                </Button>
              </div>
              <div class="rounded-2xl border border-border bg-card p-6">
                <RefreshCw class="size-5 text-primary mb-3" :stroke-width="2" />
                <div class="font-semibold mb-2">Sincronizări delta ({{ remaining }} rămase din {{ allowed }})</div>
                <p class="text-sm text-muted-foreground mb-4 leading-relaxed">
                  Dacă apar facturi noi în {{ srcLabel }} între timp, le aducem incremental în {{ tgtLabel }}.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  class="rounded-full h-9"
                  :disabled="resyncing || remaining === 0"
                  @click="triggerResync"
                >
                  <Loader2 v-if="resyncing" class="size-4 mr-1 animate-spin" :stroke-width="2" />
                  {{ remaining === 0 ? 'Cota epuizată' : 'Programează delta sync' }}
                </Button>
                <div v-if="resyncError" class="mt-3 text-xs text-destructive">
                  {{ resyncError === 'delta_sync_quota_exhausted' ? 'Cota a fost epuizată.' : `Eroare: ${resyncError}` }}
                </div>
              </div>
            </div>

            <div v-if="job?.billingEmail" class="mt-10 text-sm text-muted-foreground flex items-center gap-2">
              <Mail class="size-4" :stroke-width="2" />
              Notificările au fost trimise la <span class="text-foreground font-medium">{{ job.billingEmail }}</span>.
            </div>
          </template>
        </div>
      </section>
    </main>

    <LayoutSiteFooter />
  </div>
</template>
