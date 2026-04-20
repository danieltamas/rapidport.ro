<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { Check, Loader2, CircleAlert, Clock, ArrowRight, RefreshCw, Download } from 'lucide-vue-next'

const route = useRoute()
const jobId = computed(() => String(route.params.id))

useHead({
  title: () => `Portare #${jobId.value.slice(0, 8)} — Rapidport`,
  htmlAttrs: { lang: 'ro' },
})

type Job = {
  id: string
  status: string
  progressStage: string | null
  progressPct: number | null
  sourceSoftware: string
  targetSoftware: string
  uploadFilename: string | null
  uploadSize: number | null
  billingEmail: string | null
}

// Initial fetch (SSR-safe with cookie-forward so the anonymous-job cookie + user
// session both reach the API). assertJobAccess on the server enforces ownership.
const { data: job, refresh } = await useAsyncData(
  () => `job-${jobId.value}`,
  () =>
    $fetch<Job>(`/api/jobs/${jobId.value}`, {
      headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined,
    }),
  { default: () => null },
)

// Reactive live state — overlaid by SSE on the client.
const live = ref<{ stage: string | null; pct: number; status: string }>({
  stage: job.value?.progressStage ?? null,
  pct: job.value?.progressPct ?? 0,
  status: job.value?.status ?? 'created',
})

// Stage timeline. Order = canonical pipeline order; we derive each row's display
// state from `live.status` + `live.stage`.
const STAGE_ORDER = [
  { id: 'awaiting_upload', label: 'Încărcare' },
  { id: 'uploaded', label: 'Fișier primit' },
  { id: 'queued', label: 'În coadă' },
  { id: 'extracting', label: 'Extragere' },
  { id: 'parsing', label: 'Analiză structură' },
  { id: 'mapping', label: 'Mapare câmpuri' },
  { id: 'reviewing', label: 'Revizuire' },
  { id: 'paid', label: 'Plată confirmată' },
  { id: 'generating', label: 'Generare SAGA' },
  { id: 'reporting', label: 'Raport' },
  { id: 'done', label: 'Gata de descărcare' },
] as const

type StageRow = { id: string; label: string; state: 'done' | 'active' | 'pending' | 'failed' }

const stages = computed<StageRow[]>(() => {
  const currentIdx = STAGE_ORDER.findIndex((s) => s.id === live.value.stage)
  const failed = live.value.status === 'failed'
  return STAGE_ORDER.map((s, idx) => {
    if (failed && idx === currentIdx) return { ...s, state: 'failed' }
    if (currentIdx === -1) return { ...s, state: 'pending' }
    if (idx < currentIdx) return { ...s, state: 'done' }
    if (idx === currentIdx) return { ...s, state: 'active' }
    return { ...s, state: 'pending' }
  })
})

const isTerminal = computed(() => ['succeeded', 'failed', 'expired'].includes(live.value.status))
const isSucceeded = computed(() => live.value.status === 'succeeded')
const isFailed = computed(() => live.value.status === 'failed')

const cta = computed<{ kind: 'review' | 'pay' | 'result' | 'none'; label: string; href: string } | null>(() => {
  if (!job.value) return null
  if (isSucceeded.value) {
    return { kind: 'result', label: 'Vezi pachetul', href: `/job/${jobId.value}/result` }
  }
  if (live.value.stage === 'reviewing' || live.value.stage === 'mapping') {
    return { kind: 'review', label: 'Începe revizuirea', href: `/job/${jobId.value}/mapping` }
  }
  if (live.value.status === 'mapped' || live.value.stage === 'reviewing') {
    return { kind: 'pay', label: 'Plătește', href: `/job/${jobId.value}/pay` }
  }
  return null
})

// Live SSE — client only; closed automatically on terminal state or unmount.
let es: EventSource | null = null
onMounted(() => {
  if (isTerminal.value) return
  es = new EventSource(`/api/jobs/${jobId.value}/events`)
  es.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data) as Partial<typeof live.value> & { timeout?: boolean }
      if (data.timeout) {
        es?.close()
        return
      }
      if (typeof data.stage !== 'undefined') live.value.stage = data.stage as string | null
      if (typeof data.pct !== 'undefined') live.value.pct = data.pct as number
      if (typeof data.status !== 'undefined') live.value.status = data.status as string
    } catch {
      // ignore malformed frame
    }
  }
  es.onerror = () => {
    // Native EventSource auto-retries; nothing to do.
  }
})
onBeforeUnmount(() => {
  es?.close()
})

const idShort = computed(() => jobId.value.slice(0, 8))
const direction = computed(() =>
  job.value ? `${job.value.sourceSoftware} → ${job.value.targetSoftware}` : '',
)
</script>

<template>
  <div class="bg-background text-foreground min-h-dvh flex flex-col">
    <LayoutSiteHeader />

    <main class="flex-1">
      <section class="border-b border-border">
        <div class="mx-auto max-w-[1280px] px-6 py-14">
          <div class="flex flex-wrap items-end justify-between gap-6 mb-10">
            <div>
              <div class="text-sm font-medium text-primary mb-2">Status migrare</div>
              <h1 class="text-3xl md:text-4xl font-bold tracking-tight leading-tight" style="color: #000;">
                Portare <span class="font-mono text-muted-foreground text-2xl md:text-3xl">#{{ idShort }}</span>
              </h1>
              <div v-if="job" class="mt-3 text-sm text-muted-foreground uppercase tracking-wide">
                {{ direction }}
              </div>
            </div>
            <div
              v-if="isFailed"
              class="flex items-center gap-2 bg-destructive/10 text-destructive border border-destructive/20 px-3 py-1.5 rounded-full text-sm font-medium"
            >
              <CircleAlert class="size-4" :stroke-width="2" />
              Migrarea a eșuat
            </div>
            <div
              v-else-if="isSucceeded"
              class="flex items-center gap-2 bg-success/10 text-success border border-success/20 px-3 py-1.5 rounded-full text-sm font-medium"
            >
              <Check class="size-4" :stroke-width="2" />
              Pachet gata
            </div>
            <div
              v-else
              class="flex items-center gap-2 bg-muted text-muted-foreground border border-border px-3 py-1.5 rounded-full text-sm font-medium"
            >
              <Loader2 class="size-4 animate-spin" :stroke-width="2" />
              {{ live.pct }}%
            </div>
          </div>

          <!-- Stage timeline -->
          <div class="grid md:grid-cols-11 gap-0 border border-border rounded-2xl overflow-hidden bg-card">
            <div
              v-for="(s, idx) in stages"
              :key="s.id"
              class="p-3 md:p-4 relative"
              :class="[
                idx < stages.length - 1 ? 'md:border-r border-border' : '',
                idx < stages.length - 1 ? 'border-b md:border-b-0' : '',
              ]"
            >
              <div class="flex items-center gap-2 mb-2">
                <div
                  class="size-6 rounded-full grid place-items-center shrink-0"
                  :class="{
                    'bg-primary text-primary-foreground': s.state === 'done',
                    'bg-warning/20 text-warning': s.state === 'active',
                    'bg-destructive/20 text-destructive': s.state === 'failed',
                    'bg-muted text-muted-foreground': s.state === 'pending',
                  }"
                >
                  <Check v-if="s.state === 'done'" class="size-3.5" :stroke-width="3" />
                  <Loader2 v-else-if="s.state === 'active'" class="size-3.5 animate-spin" :stroke-width="2.5" />
                  <CircleAlert v-else-if="s.state === 'failed'" class="size-3.5" :stroke-width="2.5" />
                  <span v-else class="text-[10px] font-mono">{{ String(idx + 1).padStart(2, '0') }}</span>
                </div>
              </div>
              <div class="text-xs font-medium leading-tight">{{ s.label }}</div>
            </div>
          </div>

          <!-- Primary CTA -->
          <div
            v-if="cta"
            class="mt-10 rounded-2xl border border-primary/30 bg-primary/5 p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
          >
            <div class="flex-1">
              <div class="text-lg font-semibold mb-1">
                <template v-if="cta.kind === 'review'">Maparea câmpurilor așteaptă verificarea</template>
                <template v-else-if="cta.kind === 'pay'">Maparea e confirmată — următorul pas: plată</template>
                <template v-else-if="cta.kind === 'result'">Conversia s-a încheiat cu succes</template>
              </div>
              <div class="text-sm text-muted-foreground leading-relaxed">
                <template v-if="cta.kind === 'review'">Verificați rezultatul mapării și confirmați înainte de plată.</template>
                <template v-else-if="cta.kind === 'pay'">Finalizați plata pentru a începe generarea pachetului SAGA.</template>
                <template v-else-if="cta.kind === 'result'">Pachetul cu fișierele de import e gata de descărcare.</template>
              </div>
            </div>
            <div class="flex gap-3 shrink-0">
              <Button class="rounded-full h-12 px-7 font-medium" as-child>
                <NuxtLink :to="cta.href">
                  {{ cta.label }}
                  <ArrowRight v-if="cta.kind !== 'result'" class="size-4 ml-1" :stroke-width="2" />
                  <Download v-else class="size-4 ml-1" :stroke-width="2" />
                </NuxtLink>
              </Button>
            </div>
          </div>

          <div class="mt-8 text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
            <Clock class="size-3.5" :stroke-width="2" />
            Arhiva și pachetul generat se șterg automat după 30 de zile. Salvați acest link sau adăugați-l la favorite.
            <button
              type="button"
              class="text-primary hover:underline ml-auto flex items-center gap-1 cursor-pointer"
              @click="refresh()"
            >
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
