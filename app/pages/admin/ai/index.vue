<script setup lang="ts">
// Admin · AI usage dashboard — 30d trend, unmapped fields, low-confidence mappings.
import { Cpu, TrendingUp, AlertTriangle, Coins } from 'lucide-vue-next'

definePageMeta({ layout: 'admin' })

useHead({
  title: 'Admin · AI — Rapidport',
  meta: [{ name: 'robots', content: 'noindex,nofollow' }],
})

type TrendDay = {
  day: string
  tokensIn: number
  tokensOut: number
  costUsd: number
  calls: number
}

type UnmappedField = {
  sourceSoftware: string
  tableName: string
  fieldName: string
  missCount: number
}

type LowConfidenceMapping = {
  id: string
  sourceSoftware: string
  tableName: string
  fieldName: string
  targetField: string
  confidence: number
  hitCount: number
  createdAt: string
}

type AiResponse = {
  trend30d: TrendDay[]
  topUnmappedFields: UnmappedField[]
  lowConfidenceMappings: LowConfidenceMapping[]
}

const reqHeaders = import.meta.server ? useRequestHeaders(['cookie']) : undefined

const { data, pending, refresh, error } = await useAsyncData(
  'admin-ai',
  () =>
    $fetch<AiResponse>('/api/admin/ai', {
      headers: reqHeaders,
    }),
  { default: () => null },
)

const trend = computed<TrendDay[]>(() => data.value?.trend30d ?? [])
const unmapped = computed<UnmappedField[]>(() => data.value?.topUnmappedFields ?? [])
const lowConf = computed<LowConfidenceMapping[]>(() => data.value?.lowConfidenceMappings ?? [])

const totals = computed(() => {
  const t = trend.value
  return {
    tokensIn: t.reduce((a, d) => a + (d.tokensIn || 0), 0),
    tokensOut: t.reduce((a, d) => a + (d.tokensOut || 0), 0),
    costUsd: t.reduce((a, d) => a + (d.costUsd || 0), 0),
    calls: t.reduce((a, d) => a + (d.calls || 0), 0),
  }
})

const maxCost = computed(() => {
  const vals = trend.value.map(d => d.costUsd || 0)
  const m = vals.length ? Math.max(...vals) : 0
  return m > 0 ? m : 1
})

function fmtInt(n: number): string {
  return n.toLocaleString('en-US')
}

function fmtCost(n: number): string {
  return `$${n.toFixed(4)}`
}

function fmtDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 19).replace('T', ' ') + 'Z'
}

function fmtDay(day: string): string {
  // day is YYYY-MM-DD; show MM-DD for compact bar tooltips.
  return day.length >= 10 ? day.slice(5) : day
}

function confidenceClass(c: number): string {
  if (c < 0.5) return 'text-destructive'
  if (c < 0.7) return 'text-[color:var(--accent-primary)]'
  return 'text-foreground'
}

function barHeightPct(cost: number): number {
  return Math.max(2, Math.round((cost / maxCost.value) * 100))
}
</script>

<template>
  <div class="px-6 py-6 max-w-[1400px]">
    <div class="flex items-end justify-between gap-4 mb-6">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">AI usage</h1>
        <p class="text-xs text-muted-foreground mt-1 font-mono">
          claude-haiku-4-5 · last 30 days
        </p>
      </div>
      <button
        type="button"
        class="text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors disabled:opacity-50"
        :disabled="pending"
        @click="refresh()"
      >
        {{ pending ? 'Refreshing…' : 'Refresh' }}
      </button>
    </div>

    <div
      v-if="error"
      class="rounded border border-destructive/40 bg-destructive/10 text-destructive p-4 text-sm mb-6"
    >
      Failed to load AI stats: {{ error.message }}
    </div>

    <!-- Section 1 · 30-day trend -->
    <section class="mb-8">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
        30-day trend
      </h2>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div class="border border-border bg-card rounded p-4">
          <div class="flex items-center justify-between mb-3">
            <span class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Tokens in</span>
            <TrendingUp class="size-4 text-muted-foreground" :stroke-width="1.5" />
          </div>
          <div class="text-2xl font-semibold tabular-nums font-mono">{{ fmtInt(totals.tokensIn) }}</div>
        </div>
        <div class="border border-border bg-card rounded p-4">
          <div class="flex items-center justify-between mb-3">
            <span class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Tokens out</span>
            <TrendingUp class="size-4 text-muted-foreground" :stroke-width="1.5" />
          </div>
          <div class="text-2xl font-semibold tabular-nums font-mono">{{ fmtInt(totals.tokensOut) }}</div>
        </div>
        <div class="border border-border bg-card rounded p-4">
          <div class="flex items-center justify-between mb-3">
            <span class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Cost USD</span>
            <Coins class="size-4 text-muted-foreground" :stroke-width="1.5" />
          </div>
          <div class="text-2xl font-semibold tabular-nums font-mono">{{ fmtCost(totals.costUsd) }}</div>
        </div>
        <div class="border border-border bg-card rounded p-4">
          <div class="flex items-center justify-between mb-3">
            <span class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Calls</span>
            <Cpu class="size-4 text-muted-foreground" :stroke-width="1.5" />
          </div>
          <div class="text-2xl font-semibold tabular-nums font-mono">{{ fmtInt(totals.calls) }}</div>
        </div>
      </div>

      <div class="border border-border bg-card rounded p-4">
        <div class="flex items-center justify-between mb-3">
          <span class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
            Daily cost (USD)
          </span>
          <span class="text-[11px] text-muted-foreground font-mono">max {{ fmtCost(maxCost) }}</span>
        </div>

        <div v-if="trend.length === 0" class="text-xs text-muted-foreground py-8 text-center">
          No AI activity recorded in the last 30 days.
        </div>

        <div v-else class="flex items-end gap-[3px] h-32">
          <div
            v-for="d in trend"
            :key="d.day"
            class="flex-1 min-w-[4px] bg-[color:var(--accent-primary)]/80 hover:bg-[color:var(--accent-primary)] transition-colors"
            :style="{ height: barHeightPct(d.costUsd) + '%' }"
            :title="`${d.day} · ${fmtCost(d.costUsd)} · ${fmtInt(d.calls)} calls`"
          />
        </div>

        <div v-if="trend.length > 0" class="mt-2 flex justify-between text-[10px] text-muted-foreground font-mono">
          <span>{{ fmtDay(trend[0]?.day ?? '') }}</span>
          <span>{{ fmtDay(trend[trend.length - 1]?.day ?? '') }}</span>
        </div>
      </div>
    </section>

    <!-- Section 2 · Top unmapped fields -->
    <section class="mb-8">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
        Top unmapped fields
      </h2>

      <div v-if="unmapped.length === 0" class="text-xs text-muted-foreground border border-dashed border-border rounded p-4">
        Worker doesn't yet log mapping misses — see TODO in api/admin/ai/index.get.ts
      </div>

      <div v-else class="border border-border bg-card rounded overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr class="border-b border-border">
              <th class="text-left font-medium px-3 py-2">Source software</th>
              <th class="text-left font-medium px-3 py-2">Table</th>
              <th class="text-left font-medium px-3 py-2">Field</th>
              <th class="text-right font-medium px-3 py-2">Misses</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="u in unmapped"
              :key="`${u.sourceSoftware}-${u.tableName}-${u.fieldName}`"
              class="border-b border-border last:border-b-0 hover:bg-muted/20"
              style="height: 40px"
            >
              <td class="px-3">{{ u.sourceSoftware }}</td>
              <td class="px-3 font-mono text-xs">{{ u.tableName }}</td>
              <td class="px-3 font-mono text-xs">{{ u.fieldName }}</td>
              <td class="px-3 text-right font-mono tabular-nums">{{ fmtInt(u.missCount) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Section 3 · Low-confidence mappings -->
    <section>
      <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
        <AlertTriangle class="size-4 text-muted-foreground" :stroke-width="1.5" />
        Low-confidence mappings
      </h2>

      <div v-if="lowConf.length === 0" class="text-xs text-muted-foreground border border-dashed border-border rounded p-4">
        No low-confidence mappings cached.
      </div>

      <div v-else class="border border-border bg-card rounded overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr class="border-b border-border">
              <th class="text-left font-medium px-3 py-2">Source</th>
              <th class="text-left font-medium px-3 py-2">Table.field</th>
              <th class="text-left font-medium px-3 py-2">Target</th>
              <th class="text-right font-medium px-3 py-2">Confidence</th>
              <th class="text-right font-medium px-3 py-2">Hits</th>
              <th class="text-left font-medium px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="m in lowConf"
              :key="m.id"
              class="border-b border-border last:border-b-0 hover:bg-muted/20"
              style="height: 40px"
            >
              <td class="px-3">{{ m.sourceSoftware }}</td>
              <td class="px-3 font-mono text-xs">{{ m.tableName }}.{{ m.fieldName }}</td>
              <td class="px-3 font-mono text-xs">{{ m.targetField }}</td>
              <td class="px-3 text-right font-mono tabular-nums" :class="confidenceClass(m.confidence)">
                {{ m.confidence.toFixed(2) }}
              </td>
              <td class="px-3 text-right font-mono tabular-nums">{{ fmtInt(m.hitCount) }}</td>
              <td class="px-3 font-mono text-xs text-muted-foreground">{{ fmtDate(m.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div v-if="!data && !error" class="mt-6 text-sm text-muted-foreground">
      Loading…
    </div>
  </div>
</template>
