<script setup lang="ts">
// Admin jobs list — paginated + filterable over /api/admin/jobs.
// Spec: CLAUDE.md "Admin UI Design System"; SPEC.md §"Admin Dashboard".
// Admin copy is English-only. CSRF not needed here (GET only).
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { Input } from '~/components/ui/input'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'

definePageMeta({ layout: 'admin' })

useHead({
  title: 'Jobs — Rapidport Admin',
  meta: [{ name: 'robots', content: 'noindex,nofollow' }],
})

type JobRow = {
  id: string
  status: string
  progressStage: string | null
  progressPct: number | null
  sourceSoftware: string | null
  targetSoftware: string | null
  uploadFilename: string | null
  uploadSize: number | null
  billingEmail: string | null
  createdAt: string | null
  updatedAt: string | null
}
type JobsResponse = { rows: JobRow[]; page: number; pageSize: number; total: number }

const route = useRoute()
const router = useRouter()

// Filter state — seeded from URL so SSR + back/forward work.
const STATUSES = ['all', 'created', 'paid', 'succeeded', 'failed', 'expired'] as const
type StatusFilter = (typeof STATUSES)[number]
const PAGE_SIZES = [50, 100] as const

function parseStatus(v: unknown): StatusFilter {
  return (STATUSES as readonly string[]).includes(v as string) ? (v as StatusFilter) : 'all'
}
function parsePageSize(v: unknown): 50 | 100 {
  const n = Number(v)
  return n === 100 ? 100 : 50
}
function parsePage(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}

const status = ref<StatusFilter>(parseStatus(route.query.status))
const q = ref<string>(typeof route.query.q === 'string' ? route.query.q : '')
const qInput = ref<string>(q.value)
const page = ref<number>(parsePage(route.query.page))
const pageSize = ref<50 | 100>(parsePageSize(route.query.pageSize))

// Debounce search.
let qDebounce: ReturnType<typeof setTimeout> | null = null
watch(qInput, (v) => {
  if (qDebounce) clearTimeout(qDebounce)
  qDebounce = setTimeout(() => {
    q.value = v.trim()
    page.value = 1
  }, 300)
})

// Keep URL in sync.
watch([status, q, page, pageSize], ([s, qv, p, ps]) => {
  const query: Record<string, string> = {}
  if (s !== 'all') query.status = s
  if (qv) query.q = qv
  if (p !== 1) query.page = String(p)
  if (ps !== 50) query.pageSize = String(ps)
  router.replace({ query })
})

const apiQuery = computed(() => {
  const params: Record<string, string | number> = {
    page: page.value,
    pageSize: pageSize.value,
  }
  if (status.value !== 'all') params.status = status.value
  if (q.value) params.q = q.value
  return params
})

const { data, pending, error, refresh } = await useAsyncData<JobsResponse>(
  'admin-jobs-list',
  () =>
    $fetch<JobsResponse>('/api/admin/jobs', {
      query: apiQuery.value,
      headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined,
    }),
  {
    default: () => ({ rows: [], page: 1, pageSize: 50, total: 0 }),
    watch: [apiQuery],
  },
)

const totalPages = computed(() => {
  const t = data.value?.total ?? 0
  const ps = data.value?.pageSize ?? pageSize.value
  return Math.max(1, Math.ceil(t / ps))
})

function statusVariant(s: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (s === 'succeeded') return 'default'
  if (s === 'failed') return 'destructive'
  if (s === 'paid' || s === 'mapped' || s === 'reviewing') return 'default'
  return 'secondary' // created / expired / other
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return iso.slice(0, 19).replace('T', ' ') + 'Z'
}

function idShort(id: string): string {
  return id.slice(0, 8)
}

function prev() {
  if (page.value > 1) page.value -= 1
}
function next() {
  if (page.value < totalPages.value) page.value += 1
}
</script>

<template>
  <div class="px-6 py-6 max-w-[1400px]">
    <div class="flex items-end justify-between gap-4 mb-6">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">Jobs</h1>
        <p class="text-xs text-muted-foreground mt-1 font-mono">
          {{ data?.total ?? 0 }} total
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

    <!-- Filter bar -->
    <div class="flex flex-wrap items-center gap-3 mb-4">
      <div class="flex items-center gap-2">
        <label class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium" for="f-status">Status</label>
        <select
          id="f-status"
          v-model="status"
          class="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          @change="page = 1"
        >
          <option v-for="s in STATUSES" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>

      <div class="flex items-center gap-2 flex-1 min-w-[220px] max-w-md">
        <label class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium" for="f-search">Search</label>
        <Input
          id="f-search"
          v-model="qInput"
          placeholder="Job id or billing email"
          class="h-9"
        />
      </div>

      <div class="flex items-center gap-2">
        <label class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium" for="f-pagesize">Per page</label>
        <select
          id="f-pagesize"
          v-model.number="pageSize"
          class="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          @change="page = 1"
        >
          <option v-for="n in PAGE_SIZES" :key="n" :value="n">{{ n }}</option>
        </select>
      </div>
    </div>

    <div v-if="error" class="rounded border border-destructive/40 bg-destructive/10 text-destructive p-4 text-sm mb-4">
      Failed to load jobs: {{ error.message }}
    </div>

    <!-- Table -->
    <div class="border border-border rounded bg-card overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead class="w-[110px]">ID</TableHead>
            <TableHead class="w-[120px]">Status</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Src → Tgt</TableHead>
            <TableHead class="text-right w-[110px]">Upload</TableHead>
            <TableHead>Billing email</TableHead>
            <TableHead class="w-[180px]">Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <template v-if="data && data.rows.length">
            <TableRow v-for="row in data.rows" :key="row.id">
              <TableCell class="font-mono text-xs">
                <NuxtLink :to="`/admin/jobs/${row.id}`" class="text-primary hover:underline">
                  {{ idShort(row.id) }}
                </NuxtLink>
              </TableCell>
              <TableCell>
                <Badge :variant="statusVariant(row.status)" class="font-mono uppercase text-[10px] rounded">
                  {{ row.status }}
                </Badge>
              </TableCell>
              <TableCell class="text-xs text-muted-foreground">
                <span v-if="row.progressStage">{{ row.progressStage }}</span>
                <span v-if="row.progressPct != null" class="font-mono ml-1">{{ row.progressPct }}%</span>
                <span v-if="!row.progressStage && row.progressPct == null">—</span>
              </TableCell>
              <TableCell class="text-xs">
                <span class="font-mono">{{ row.sourceSoftware ?? '—' }}</span>
                <span class="text-muted-foreground mx-1">→</span>
                <span class="font-mono">{{ row.targetSoftware ?? '—' }}</span>
              </TableCell>
              <TableCell class="text-right font-mono text-xs tabular-nums">
                {{ formatSize(row.uploadSize) }}
              </TableCell>
              <TableCell class="text-xs">{{ row.billingEmail ?? '—' }}</TableCell>
              <TableCell class="font-mono text-xs text-muted-foreground">{{ formatDate(row.createdAt) }}</TableCell>
            </TableRow>
          </template>
          <TableEmpty v-else :colspan="7">
            <span v-if="pending">Loading…</span>
            <span v-else>No jobs match your filters.</span>
          </TableEmpty>
        </TableBody>
      </Table>
    </div>

    <!-- Pagination -->
    <div class="flex items-center justify-between mt-4">
      <div class="text-xs text-muted-foreground font-mono">
        page {{ data?.page ?? page }} of {{ totalPages }} · {{ data?.total ?? 0 }} total
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" :disabled="page <= 1 || pending" @click="prev">Prev</Button>
        <Button variant="outline" size="sm" :disabled="page >= totalPages || pending" @click="next">Next</Button>
      </div>
    </div>
  </div>
</template>
