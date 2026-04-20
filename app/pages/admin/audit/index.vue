<script setup lang="ts">
// Admin audit log viewer — lists rows from admin_audit_log via /api/admin/audit.
// URL-synced filters + pagination. SSR-fetched first page.
// English-only per CLAUDE.md §UI Design System (admin is for Dani).
import { RefreshCw, Search, X } from 'lucide-vue-next'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'

definePageMeta({ layout: 'admin' })

useHead({
  title: 'Admin Audit — Rapidport',
  meta: [{ name: 'robots', content: 'noindex,nofollow' }],
})

type AuditRow = {
  id: string
  adminEmail: string
  action: string
  targetType: string | null
  targetId: string | null
  details: unknown
  ipHash: string | null
  userAgent: string | null
  createdAt: string
}

type AuditResponse = {
  rows: AuditRow[]
  page: number
  pageSize: number
  total: number
}

const route = useRoute()
const router = useRouter()

// Filter state — initialized from URL query so the page is shareable/refreshable.
const q = route.query
const filters = reactive({
  adminEmail: typeof q.adminEmail === 'string' ? q.adminEmail : '',
  action: typeof q.action === 'string' ? q.action : '',
  targetType: typeof q.targetType === 'string' ? q.targetType : '',
  since: typeof q.since === 'string' ? q.since : '',
  until: typeof q.until === 'string' ? q.until : '',
  pageSize: typeof q.pageSize === 'string' ? Number(q.pageSize) || 25 : 25,
})
const page = ref(typeof q.page === 'string' ? Number(q.page) || 1 : 1)

// Convert datetime-local (YYYY-MM-DDTHH:mm) to ISO string; empty → undefined.
function toIso(v: string): string | undefined {
  if (!v) return undefined
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

const queryPayload = computed(() => {
  const payload: Record<string, string | number> = {
    page: page.value,
    pageSize: filters.pageSize,
  }
  if (filters.adminEmail) payload.adminEmail = filters.adminEmail
  if (filters.action) payload.action = filters.action
  if (filters.targetType) payload.targetType = filters.targetType
  const since = toIso(filters.since)
  const until = toIso(filters.until)
  if (since) payload.since = since
  if (until) payload.until = until
  return payload
})

const { data, pending, refresh, error } = await useAsyncData<AuditResponse>(
  'admin-audit',
  () =>
    $fetch<AuditResponse>('/api/admin/audit', {
      query: queryPayload.value,
      headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined,
    }),
  {
    default: () => ({ rows: [], page: 1, pageSize: 25, total: 0 }),
    watch: [queryPayload],
  },
)

// Mirror filters + page into URL (replace, not push — no history spam).
watch(
  [queryPayload],
  () => {
    const q2: Record<string, string> = {}
    for (const [k, v] of Object.entries(queryPayload.value)) {
      q2[k] = String(v)
    }
    router.replace({ query: q2 })
  },
  { flush: 'post' },
)

function applyFilters() {
  page.value = 1
}

function clearFilters() {
  filters.adminEmail = ''
  filters.action = ''
  filters.targetType = ''
  filters.since = ''
  filters.until = ''
  filters.pageSize = 25
  page.value = 1
}

const totalPages = computed(() => {
  const total = data.value?.total ?? 0
  const size = data.value?.pageSize ?? filters.pageSize
  return Math.max(1, Math.ceil(total / size))
})

function prevPage() {
  if (page.value > 1) page.value -= 1
}
function nextPage() {
  if (page.value < totalPages.value) page.value += 1
}

// Row expand state — map of row id -> open?
const expanded = ref<Record<string, boolean>>({})
function toggleExpand(id: string) {
  expanded.value = { ...expanded.value, [id]: !expanded.value[id] }
}

function shortId(id: string | null | undefined, n = 8): string {
  if (!id) return '—'
  return id.length > n ? id.slice(0, n) : id
}

function shortIso(iso: string): string {
  // 2026-04-20T09:14:03Z
  return iso.length >= 19 ? `${iso.slice(0, 19)}Z` : iso
}

function targetLink(row: AuditRow): string | null {
  if (!row.targetId) return null
  if (row.targetType === 'job') return `/admin/jobs/${row.targetId}`
  if (row.targetType === 'user') return `/admin/users/${row.targetId}`
  return null
}

function formatDetails(d: unknown): string {
  if (d == null) return '—'
  try {
    return JSON.stringify(d, null, 2)
  } catch {
    return String(d)
  }
}
</script>

<template>
  <div class="px-6 py-6 max-w-[1400px] mx-auto">
    <div class="flex items-end justify-between gap-4 mb-6">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">Audit log</h1>
        <p class="text-xs text-muted-foreground mt-1 font-mono">
          {{ data?.total ?? 0 }} records · page {{ data?.page ?? page }}/{{ totalPages }}
        </p>
      </div>
      <button
        type="button"
        class="text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
        :disabled="pending"
        @click="refresh()"
      >
        <RefreshCw class="size-3" :class="pending ? 'animate-spin' : ''" :stroke-width="2" />
        {{ pending ? 'Refreshing…' : 'Refresh' }}
      </button>
    </div>

    <!-- Filter bar -->
    <form
      class="border border-border bg-card rounded p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3"
      @submit.prevent="applyFilters"
    >
      <label class="flex flex-col gap-1">
        <span class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Admin email</span>
        <Input v-model="filters.adminEmail" type="text" placeholder="admin@…" class="h-9 text-xs" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Action</span>
        <Input v-model="filters.action" type="text" placeholder="e.g. refund_job" class="h-9 text-xs font-mono" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Target type</span>
        <Input v-model="filters.targetType" type="text" placeholder="job / user / payment" class="h-9 text-xs font-mono" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Since</span>
        <Input v-model="filters.since" type="datetime-local" class="h-9 text-xs font-mono" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Until</span>
        <Input v-model="filters.until" type="datetime-local" class="h-9 text-xs font-mono" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Page size</span>
        <select
          v-model.number="filters.pageSize"
          class="h-9 rounded-md border border-input bg-background px-3 text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option :value="25">25</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
          <option :value="200">200</option>
        </select>
      </label>

      <div class="col-span-full flex items-center gap-2 pt-1">
        <Button type="submit" size="sm" class="h-9 rounded">
          <Search class="size-3.5" :stroke-width="2" />
          Apply
        </Button>
        <Button type="button" variant="ghost" size="sm" class="h-9 rounded" @click="clearFilters">
          <X class="size-3.5" :stroke-width="2" />
          Clear
        </Button>
      </div>
    </form>

    <div v-if="error" class="rounded border border-destructive/40 bg-destructive/10 text-destructive p-4 text-sm mb-4">
      Failed to load audit log: {{ error.message }}
    </div>

    <!-- Table -->
    <div class="border border-border bg-card rounded overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow class="hover:bg-transparent">
            <TableHead class="h-10 text-[11px] uppercase tracking-wide text-muted-foreground font-medium w-[180px]">When</TableHead>
            <TableHead class="h-10 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Admin</TableHead>
            <TableHead class="h-10 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Action</TableHead>
            <TableHead class="h-10 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Target</TableHead>
            <TableHead class="h-10 text-[11px] uppercase tracking-wide text-muted-foreground font-medium w-[120px]">IP hash</TableHead>
            <TableHead class="h-10 text-[11px] uppercase tracking-wide text-muted-foreground font-medium text-right w-[100px]">Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <template v-if="data && data.rows.length > 0">
            <template v-for="row in data.rows" :key="row.id">
              <TableRow class="h-10 border-b-border">
                <TableCell class="font-mono text-xs text-muted-foreground">{{ shortIso(row.createdAt) }}</TableCell>
                <TableCell class="text-xs truncate max-w-[220px]">{{ row.adminEmail }}</TableCell>
                <TableCell>
                  <span class="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide">
                    {{ row.action }}
                  </span>
                </TableCell>
                <TableCell class="font-mono text-xs">
                  <template v-if="row.targetType && row.targetId">
                    <NuxtLink
                      v-if="targetLink(row)"
                      :to="targetLink(row)!"
                      class="text-foreground hover:text-primary underline-offset-2 hover:underline"
                    >
                      {{ row.targetType }} #{{ shortId(row.targetId) }}
                    </NuxtLink>
                    <span v-else class="text-muted-foreground">
                      {{ row.targetType }} #{{ shortId(row.targetId) }}
                    </span>
                  </template>
                  <span v-else class="text-muted-foreground">—</span>
                </TableCell>
                <TableCell class="font-mono text-xs text-muted-foreground">{{ shortId(row.ipHash, 8) }}</TableCell>
                <TableCell class="text-right">
                  <button
                    type="button"
                    class="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                    @click="toggleExpand(row.id)"
                  >
                    {{ expanded[row.id] ? 'Hide' : 'Show' }}
                  </button>
                </TableCell>
              </TableRow>
              <TableRow v-if="expanded[row.id]" class="hover:bg-transparent">
                <TableCell colspan="6" class="bg-muted/30 p-0">
                  <div class="p-4 space-y-2">
                    <div v-if="row.userAgent" class="text-[11px] text-muted-foreground">
                      <span class="uppercase tracking-wide font-medium">User-agent: </span>
                      <span class="font-mono">{{ row.userAgent }}</span>
                    </div>
                    <div>
                      <div class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Details</div>
                      <pre class="font-mono text-xs bg-background border border-border rounded p-3 overflow-x-auto whitespace-pre-wrap break-words">{{ formatDetails(row.details) }}</pre>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            </template>
          </template>
          <TableRow v-else class="hover:bg-transparent">
            <TableCell colspan="6" class="text-center text-sm text-muted-foreground py-10">
              {{ pending ? 'Loading…' : 'No audit entries match these filters.' }}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <!-- Pagination -->
    <div class="flex items-center justify-between mt-4 text-xs">
      <div class="text-muted-foreground font-mono">
        {{ data?.total ?? 0 }} total · {{ data?.pageSize ?? filters.pageSize }}/page
      </div>
      <div class="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          class="h-8 rounded"
          :disabled="page <= 1 || pending"
          @click="prevPage"
        >
          Prev
        </Button>
        <span class="font-mono text-muted-foreground tabular-nums">
          {{ data?.page ?? page }} / {{ totalPages }}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          class="h-8 rounded"
          :disabled="page >= totalPages || pending"
          @click="nextPage"
        >
          Next
        </Button>
      </div>
    </div>
  </div>
</template>
