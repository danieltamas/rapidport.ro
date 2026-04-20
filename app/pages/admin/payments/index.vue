<script setup lang="ts">
// Admin — payments list. Sourced from GET /api/admin/payments with
// filters (status, q, refunded), URL-synced pagination and sort.
// Refund action is not performed here; clicking a job link takes the
// admin to the job-detail page where refunds are issued.
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'

definePageMeta({ layout: 'admin' })

useHead({
  title: 'Admin Payments — Rapidport',
  meta: [{ name: 'robots', content: 'noindex,nofollow' }],
})

type PaymentRow = {
  id: string
  jobId: string
  stripePaymentIntentId: string | null
  amount: number
  currency: string
  status: string
  refundedAmount: number
  refundedAt: string | null
  smartbillInvoiceId: string | null
  createdAt: string
  billingEmail: string | null
}

type PaymentsResponse = {
  rows: PaymentRow[]
  page: number
  pageSize: number
  total: number
}

const route = useRoute()
const router = useRouter()

const STATUS_OPTIONS = [
  'all',
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
  'processing',
  'requires_capture',
  'canceled',
  'succeeded',
  'failed',
] as const

const REFUNDED_OPTIONS = ['all', 'no', 'partial', 'yes'] as const
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const

const status = ref<string>(typeof route.query.status === 'string' ? route.query.status : 'all')
const q = ref<string>(typeof route.query.q === 'string' ? route.query.q : '')
const refunded = ref<string>(typeof route.query.refunded === 'string' ? route.query.refunded : 'all')
const page = ref<number>(Number(route.query.page) > 0 ? Number(route.query.page) : 1)
const pageSize = ref<number>(Number(route.query.pageSize) > 0 ? Number(route.query.pageSize) : 25)
const sort = ref<string>(typeof route.query.sort === 'string' ? route.query.sort : 'createdAt')
const order = ref<string>(route.query.order === 'asc' ? 'asc' : 'desc')

const queryParams = computed(() => {
  const p: Record<string, string> = {
    page: String(page.value),
    pageSize: String(pageSize.value),
    sort: sort.value,
    order: order.value,
  }
  if (status.value && status.value !== 'all') p.status = status.value
  if (q.value.trim()) p.q = q.value.trim()
  if (refunded.value && refunded.value !== 'all') p.refunded = refunded.value
  return p
})

const { data, pending, error, refresh } = await useAsyncData<PaymentsResponse>(
  'admin-payments',
  () =>
    $fetch<PaymentsResponse>('/api/admin/payments', {
      query: queryParams.value,
      headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined,
    }),
  {
    watch: [queryParams],
    default: () => ({ rows: [], page: 1, pageSize: 25, total: 0 }),
  },
)

// Keep URL in sync with current filters/pagination.
watch(
  queryParams,
  (params) => {
    router.replace({ query: params })
  },
  { flush: 'post' },
)

const totalPages = computed(() => {
  const total = data.value?.total ?? 0
  const size = data.value?.pageSize ?? pageSize.value
  return Math.max(1, Math.ceil(total / size))
})

function resetPage() {
  page.value = 1
}

function prevPage() {
  if (page.value > 1) page.value -= 1
}

function nextPage() {
  if (page.value < totalPages.value) page.value += 1
}

// Search is URL-bound; submit on Enter / button click rather than on every keystroke.
const qInput = ref(q.value)
function applySearch() {
  q.value = qInput.value
  resetPage()
}

// --- formatting helpers ---
const RON_FORMATTER = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatAmount(bani: number, currency: string): string {
  const value = (bani ?? 0) / 100
  const code = (currency ?? 'RON').toUpperCase()
  return `${RON_FORMATTER.format(value)} ${code}`
}

function formatRefund(bani: number, currency: string): string {
  if (!bani || bani <= 0) return '—'
  return formatAmount(bani, currency)
}

function shortHex(id: string | null | undefined, chars = 8): string {
  if (!id) return '—'
  return id.slice(0, chars)
}

function formatCreated(iso: string): string {
  if (!iso) return '—'
  // Keep it short and mono-friendly: 2026-04-20 13:45:02Z
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}Z`
}

function statusBadgeClass(s: string): string {
  const base = 'inline-block rounded border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide'
  switch (s) {
    case 'succeeded':
      return `${base} border-emerald-500/40 text-emerald-400 bg-emerald-500/10`
    case 'failed':
    case 'canceled':
      return `${base} border-destructive/50 text-destructive bg-destructive/10`
    default:
      return `${base} border-border text-muted-foreground bg-muted/30`
  }
}

function smartbillUrl(invoiceId: string): string {
  // SmartBill invoice deep-link — admins with SmartBill access land on the invoice page.
  return `https://cloud.smartbill.ro/ro/invoice/${encodeURIComponent(invoiceId)}`
}
</script>

<template>
  <div class="px-4 md:px-6 py-6 max-w-[1400px] mx-auto">
    <div class="flex items-end justify-between gap-4 mb-6">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">Payments</h1>
        <p class="text-xs text-muted-foreground mt-1 font-mono">
          Stripe intents · refunds issued from the job detail page
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
    <div class="grid grid-cols-1 md:grid-cols-12 gap-3 mb-4">
      <div class="md:col-span-3">
        <label class="block text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Status</label>
        <select
          v-model="status"
          class="w-full h-9 px-2 rounded border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          @change="resetPage"
        >
          <option v-for="s in STATUS_OPTIONS" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>

      <div class="md:col-span-4">
        <label class="block text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
          Search (Stripe intent id or job id prefix)
        </label>
        <div class="flex gap-2">
          <Input
            v-model="qInput"
            placeholder="pi_… or job id prefix"
            class="font-mono text-sm"
            @keydown.enter="applySearch"
          />
          <Button type="button" variant="secondary" class="h-9" @click="applySearch">Apply</Button>
        </div>
      </div>

      <div class="md:col-span-3">
        <label class="block text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Refunded</label>
        <select
          v-model="refunded"
          class="w-full h-9 px-2 rounded border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          @change="resetPage"
        >
          <option v-for="r in REFUNDED_OPTIONS" :key="r" :value="r">{{ r }}</option>
        </select>
      </div>

      <div class="md:col-span-2">
        <label class="block text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Page size</label>
        <select
          v-model.number="pageSize"
          class="w-full h-9 px-2 rounded border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          @change="resetPage"
        >
          <option v-for="n in PAGE_SIZE_OPTIONS" :key="n" :value="n">{{ n }}</option>
        </select>
      </div>
    </div>

    <div
      v-if="error"
      class="rounded border border-destructive/40 bg-destructive/10 text-destructive p-4 text-sm mb-4"
    >
      Failed to load payments: {{ error.message }}
    </div>

    <!-- Table -->
    <div class="border border-border rounded overflow-x-auto bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead class="w-[7rem]">ID</TableHead>
            <TableHead class="w-[11rem]">Stripe Intent</TableHead>
            <TableHead class="w-[7rem]">Job</TableHead>
            <TableHead class="text-right w-[9rem]">Amount</TableHead>
            <TableHead class="w-[8rem]">Status</TableHead>
            <TableHead class="text-right w-[9rem]">Refunded</TableHead>
            <TableHead class="w-[7rem]">Invoice</TableHead>
            <TableHead>Billing email</TableHead>
            <TableHead class="w-[12rem]">Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <template v-if="data && data.rows.length > 0">
            <TableRow v-for="row in data.rows" :key="row.id">
              <TableCell class="font-mono text-xs">{{ shortHex(row.id, 8) }}</TableCell>
              <TableCell class="font-mono text-xs">{{ shortHex(row.stripePaymentIntentId, 14) }}</TableCell>
              <TableCell>
                <NuxtLink
                  :to="`/admin/jobs/${row.jobId}`"
                  class="font-mono text-xs text-primary hover:underline"
                >
                  {{ shortHex(row.jobId, 8) }}
                </NuxtLink>
              </TableCell>
              <TableCell class="font-mono text-xs text-right tabular-nums">
                {{ formatAmount(row.amount, row.currency) }}
              </TableCell>
              <TableCell>
                <span :class="statusBadgeClass(row.status)">{{ row.status }}</span>
              </TableCell>
              <TableCell class="font-mono text-xs text-right tabular-nums">
                {{ formatRefund(row.refundedAmount, row.currency) }}
              </TableCell>
              <TableCell class="font-mono text-xs">
                <a
                  v-if="row.smartbillInvoiceId"
                  :href="smartbillUrl(row.smartbillInvoiceId)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-primary hover:underline"
                >
                  {{ row.smartbillInvoiceId }}
                </a>
                <span v-else class="text-muted-foreground">—</span>
              </TableCell>
              <TableCell class="text-xs">
                {{ row.billingEmail ?? '—' }}
              </TableCell>
              <TableCell class="font-mono text-xs">{{ formatCreated(row.createdAt) }}</TableCell>
            </TableRow>
          </template>
          <TableEmpty v-else :colspan="9">
            <span v-if="pending" class="text-muted-foreground">Loading…</span>
            <span v-else>No payments match your filters.</span>
          </TableEmpty>
        </TableBody>
      </Table>
    </div>

    <!-- Pagination -->
    <div class="flex items-center justify-between mt-4 text-xs">
      <div class="font-mono text-muted-foreground">
        page {{ data?.page ?? page }} of {{ totalPages }} · {{ data?.total ?? 0 }} total
      </div>
      <div class="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          class="h-8"
          :disabled="page <= 1 || pending"
          @click="prevPage"
        >
          Prev
        </Button>
        <Button
          type="button"
          variant="secondary"
          class="h-8"
          :disabled="page >= totalPages || pending"
          @click="nextPage"
        >
          Next
        </Button>
      </div>
    </div>
  </div>
</template>
