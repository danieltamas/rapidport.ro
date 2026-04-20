<script setup lang="ts">
// Admin overview — dashboard numbers from /api/admin/stats.
import { Briefcase, CreditCard, CircleCheck, CircleAlert, Cpu, Users as UsersIcon, TrendingUp } from 'lucide-vue-next'

definePageMeta({ layout: 'admin' })

useHead({
  title: 'Admin Overview — Rapidport',
  meta: [{ name: 'robots', content: 'noindex,nofollow' }],
})

type Stats = {
  jobsTotal: number
  jobsPaidLast30d: number
  jobsSucceededLast30d: number
  jobsFailedLast30d: number
  revenueLast30dBani: number
  aiCostLast30dUsd: number
  usersTotal: number
}

const { data: stats, pending, refresh, error } = await useAsyncData(
  'admin-stats',
  () =>
    $fetch<Stats>('/api/admin/stats', {
      headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined,
    }),
  { default: () => null },
)

const cards = computed(() => {
  if (!stats.value) return []
  const s = stats.value
  return [
    { label: 'Total jobs', value: s.jobsTotal.toLocaleString('en-US'), icon: Briefcase, hint: 'all-time' },
    { label: 'Revenue · 30d', value: `${(s.revenueLast30dBani / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON`, icon: TrendingUp, hint: 'succeeded payments' },
    { label: 'Paid · 30d', value: s.jobsPaidLast30d.toLocaleString('en-US'), icon: CreditCard, hint: 'jobs with status=paid' },
    { label: 'Succeeded · 30d', value: s.jobsSucceededLast30d.toLocaleString('en-US'), icon: CircleCheck, hint: 'conversions completed' },
    { label: 'Failed · 30d', value: s.jobsFailedLast30d.toLocaleString('en-US'), icon: CircleAlert, hint: 'errors' },
    { label: 'AI cost · 30d', value: `$${s.aiCostLast30dUsd.toFixed(4)}`, icon: Cpu, hint: 'Anthropic Haiku' },
    { label: 'Users', value: s.usersTotal.toLocaleString('en-US'), icon: UsersIcon, hint: 'active' },
  ]
})
</script>

<template>
  <div class="px-4 md:px-6 py-6 max-w-[1400px] mx-auto">
    <div class="flex items-end justify-between gap-4 mb-6">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">Overview</h1>
        <p class="text-xs text-muted-foreground mt-1 font-mono">live · {{ new Date().toISOString().slice(0, 19) }}Z</p>
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

    <div v-if="error" class="rounded border border-destructive/40 bg-destructive/10 text-destructive p-4 text-sm mb-6">
      Failed to load stats: {{ error.message }}
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <div
        v-for="c in cards"
        :key="c.label"
        class="border border-border bg-card rounded p-4"
      >
        <div class="flex items-center justify-between mb-3">
          <span class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{{ c.label }}</span>
          <component :is="c.icon" class="size-4 text-muted-foreground" :stroke-width="1.5" />
        </div>
        <div class="text-2xl font-semibold tabular-nums font-mono">{{ c.value }}</div>
        <div class="text-[11px] text-muted-foreground mt-1">{{ c.hint }}</div>
      </div>
    </div>

    <div v-if="!stats && !error" class="mt-6 text-sm text-muted-foreground">
      Loading…
    </div>
  </div>
</template>
