<script setup lang="ts">
// Admin job detail + actions — /api/admin/jobs/[id] + action endpoints.
// Spec: CLAUDE.md "Admin UI Design System"; SPEC.md §"Admin Dashboard".
// English-only admin copy. Every mutation includes x-csrf-token.
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { Input } from '~/components/ui/input'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'

definePageMeta({ layout: 'admin' })

useHead({
  title: 'Job — Rapidport Admin',
  meta: [{ name: 'robots', content: 'noindex,nofollow' }],
})

type Job = {
  id: string
  status: string
  progressStage: string | null
  progressPct: number | null
  sourceSoftware: string | null
  targetSoftware: string | null
  uploadFilename: string | null
  uploadSize: number | null
  uploadDiskFilename: string | null
  billingEmail: string | null
  createdAt: string | null
  updatedAt: string | null
  deltaSyncsUsed: number | null
  deltaSyncsAllowed: number | null
  expiresAt: string | null
  [k: string]: unknown
}
type Payment = {
  id: string
  jobId: string
  stripePaymentIntentId: string | null
  amount: number
  currency: string | null
  status: string
  refundedAmount: number
  createdAt: string | null
  [k: string]: unknown
}
type AuditRow = {
  id: string
  jobId: string | null
  action: string
  actor: string | null
  details: unknown
  createdAt: string | null
  [k: string]: unknown
}
type DetailResponse = { job: Job; payments: Payment[]; audit: AuditRow[] }

const route = useRoute()
const jobId = computed(() => String(route.params.id))

const { data, pending, error, refresh } = await useAsyncData<DetailResponse>(
  () => `admin-job-${jobId.value}`,
  () =>
    $fetch<DetailResponse>(`/api/admin/jobs/${jobId.value}`, {
      headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined,
    }),
  { default: () => null as unknown as DetailResponse, watch: [jobId] },
)

// --- CSRF helper (mirrors admin layout) ---
function readCsrf(): string {
  if (import.meta.server) return ''
  const m = document.cookie.match(/(?:^|;\s*)rp_csrf=([^;]+)/)
  return m && m[1] ? decodeURIComponent(m[1]) : ''
}

// --- Helpers ---
function statusVariant(s: string | undefined): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (!s) return 'secondary'
  if (s === 'succeeded') return 'default'
  if (s === 'failed') return 'destructive'
  if (s === 'paid' || s === 'mapped' || s === 'reviewing') return 'default'
  return 'secondary'
}
function idShort(id: string | undefined | null): string {
  return id ? id.slice(0, 8) : '—'
}
function formatSize(bytes: number | null | undefined): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return iso.slice(0, 19).replace('T', ' ') + 'Z'
}
function baniToRon(b: number): string {
  return (b / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// --- Derived ---
const succeededPayment = computed<Payment | null>(() => {
  const ps = data.value?.payments ?? []
  return ps.find((p) => p.status === 'succeeded') ?? null
})
const refundableBani = computed<number>(() => {
  const p = succeededPayment.value
  if (!p) return 0
  return Math.max(0, (p.amount ?? 0) - (p.refundedAmount ?? 0))
})
const hasSucceededPayment = computed(() => Boolean(succeededPayment.value))
const jobIsSucceeded = computed(() => data.value?.job?.status === 'succeeded')
const hasUpload = computed(() => Boolean(data.value?.job?.uploadDiskFilename))
const deleteBlocked = computed(() => (data.value?.payments ?? []).some((p) => p.status === 'succeeded'))

// --- Action state ---
type ActionName = 'refund' | 'extend' | 'resend' | 'force' | 'rerun' | 'delete'
const openDialog = ref<ActionName | null>(null)
const submitting = ref(false)
const actionError = ref<string | null>(null)
const actionWarnings = ref<string[]>([])

// Form values
const refundAmountRon = ref<string>('')
const refundReason = ref<string>('')

const extendAdditional = ref<number>(1)
const extendReason = ref<string>('')

const resendReason = ref<string>('')

const STATUSES_FORCE = ['created', 'paid', 'mapped', 'reviewing', 'succeeded', 'failed', 'expired'] as const
const forceTo = ref<string>('succeeded')
const forceReason = ref<string>('')

const rerunReason = ref<string>('')

const deleteReason = ref<string>('')

function openAction(a: ActionName) {
  actionError.value = null
  actionWarnings.value = []
  if (a === 'refund') {
    refundAmountRon.value = refundableBani.value > 0 ? (refundableBani.value / 100).toFixed(2) : ''
    refundReason.value = ''
  } else if (a === 'extend') {
    extendAdditional.value = 1
    extendReason.value = ''
  } else if (a === 'resend') {
    resendReason.value = ''
  } else if (a === 'force') {
    forceTo.value = 'succeeded'
    forceReason.value = ''
  } else if (a === 'rerun') {
    rerunReason.value = ''
  } else if (a === 'delete') {
    deleteReason.value = ''
  }
  openDialog.value = a
}

function closeDialog() {
  if (submitting.value) return
  openDialog.value = null
  actionError.value = null
  actionWarnings.value = []
}

type ApiError = { statusCode?: number; data?: { message?: string; warnings?: string[]; statusMessage?: string }; message?: string }
function extractError(e: unknown): { message: string; warnings?: string[] } {
  const err = e as ApiError
  const msg = err?.data?.message || err?.data?.statusMessage || err?.message || 'Request failed'
  const warnings = Array.isArray(err?.data?.warnings) ? err.data!.warnings : undefined
  return { message: msg, warnings }
}

async function postAction(path: string, body: Record<string, unknown>): Promise<void> {
  submitting.value = true
  actionError.value = null
  actionWarnings.value = []
  try {
    await $fetch(path, {
      method: 'POST',
      headers: { 'x-csrf-token': readCsrf() },
      body,
    })
    openDialog.value = null
    await refresh()
  } catch (e) {
    const { message, warnings } = extractError(e)
    actionError.value = message
    if (warnings) actionWarnings.value = warnings
  } finally {
    submitting.value = false
  }
}

async function deleteJob(): Promise<void> {
  submitting.value = true
  actionError.value = null
  try {
    await $fetch(`/api/admin/jobs/${jobId.value}`, {
      method: 'DELETE',
      headers: { 'x-csrf-token': readCsrf() },
      body: { reason: deleteReason.value },
    })
    openDialog.value = null
    // After delete, navigate back to list.
    await navigateTo('/admin/jobs')
  } catch (e) {
    const { message } = extractError(e)
    actionError.value = message
  } finally {
    submitting.value = false
  }
}

function submitRefund() {
  const ronNum = Number(refundAmountRon.value)
  const body: Record<string, unknown> = { reason: refundReason.value }
  if (refundAmountRon.value && Number.isFinite(ronNum) && ronNum > 0) {
    body.amount = Math.round(ronNum * 100) // bani
  }
  return postAction(`/api/admin/jobs/${jobId.value}/refund`, body)
}
function submitExtend() {
  return postAction(`/api/admin/jobs/${jobId.value}/extend-syncs`, {
    additional: extendAdditional.value,
    reason: extendReason.value,
  })
}
function submitResend() {
  return postAction(`/api/admin/jobs/${jobId.value}/resend-download`, {
    reason: resendReason.value || undefined,
  })
}
function submitForce() {
  const from = data.value?.job?.status ?? ''
  return postAction(`/api/admin/jobs/${jobId.value}/force-state`, {
    from,
    to: forceTo.value,
    reason: forceReason.value,
  })
}
function submitRerun() {
  return postAction(`/api/admin/jobs/${jobId.value}/re-run`, {
    reason: rerunReason.value,
  })
}
</script>

<template>
  <div class="px-4 md:px-6 py-6 max-w-[1400px] mx-auto">
    <div class="flex items-end justify-between gap-4 mb-6">
      <div class="flex items-center gap-3">
        <NuxtLink to="/admin/jobs" class="text-xs text-muted-foreground hover:text-foreground transition-colors">
          ← Back to list
        </NuxtLink>
        <span class="text-muted-foreground">·</span>
        <h1 class="text-xl font-semibold tracking-tight">
          Job <span class="font-mono text-lg">#{{ idShort(data?.job?.id ?? jobId) }}</span>
        </h1>
        <Badge v-if="data?.job" :variant="statusVariant(data.job.status)" class="font-mono uppercase text-[10px] rounded">
          {{ data.job.status }}
        </Badge>
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

    <div v-if="error" class="rounded border border-destructive/40 bg-destructive/10 text-destructive p-4 text-sm mb-4">
      Failed to load job: {{ error.message }}
    </div>

    <div v-if="!data && !error" class="text-sm text-muted-foreground">Loading…</div>

    <div v-if="data?.job" class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <!-- Metadata (2 cols on md) -->
      <Card class="md:col-span-2">
        <CardHeader>
          <CardTitle class="text-sm">Job metadata</CardTitle>
        </CardHeader>
        <CardContent>
          <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt class="text-[11px] uppercase tracking-wide text-muted-foreground">ID</dt>
              <dd class="font-mono break-all">{{ data.job.id }}</dd>
            </div>
            <div>
              <dt class="text-[11px] uppercase tracking-wide text-muted-foreground">Status</dt>
              <dd class="font-mono uppercase">{{ data.job.status }}</dd>
            </div>
            <div>
              <dt class="text-[11px] uppercase tracking-wide text-muted-foreground">Stage</dt>
              <dd class="font-mono">{{ data.job.progressStage ?? '—' }}</dd>
            </div>
            <div>
              <dt class="text-[11px] uppercase tracking-wide text-muted-foreground">Progress</dt>
              <dd class="font-mono">{{ data.job.progressPct != null ? `${data.job.progressPct}%` : '—' }}</dd>
            </div>
            <div>
              <dt class="text-[11px] uppercase tracking-wide text-muted-foreground">Source</dt>
              <dd class="font-mono">{{ data.job.sourceSoftware ?? '—' }}</dd>
            </div>
            <div>
              <dt class="text-[11px] uppercase tracking-wide text-muted-foreground">Target</dt>
              <dd class="font-mono">{{ data.job.targetSoftware ?? '—' }}</dd>
            </div>
            <div>
              <dt class="text-[11px] uppercase tracking-wide text-muted-foreground">Upload filename</dt>
              <dd class="font-mono break-all">{{ data.job.uploadFilename ?? '—' }}</dd>
            </div>
            <div>
              <dt class="text-[11px] uppercase tracking-wide text-muted-foreground">Upload size</dt>
              <dd class="font-mono">{{ formatSize(data.job.uploadSize) }}</dd>
            </div>
            <div>
              <dt class="text-[11px] uppercase tracking-wide text-muted-foreground">Billing email</dt>
              <dd class="font-mono break-all">{{ data.job.billingEmail ?? '—' }}</dd>
            </div>
            <div>
              <dt class="text-[11px] uppercase tracking-wide text-muted-foreground">Delta syncs</dt>
              <dd class="font-mono">
                {{ data.job.deltaSyncsUsed ?? 0 }} / {{ data.job.deltaSyncsAllowed ?? 0 }}
              </dd>
            </div>
            <div>
              <dt class="text-[11px] uppercase tracking-wide text-muted-foreground">Expires at</dt>
              <dd class="font-mono">{{ formatDate(data.job.expiresAt) }}</dd>
            </div>
            <div>
              <dt class="text-[11px] uppercase tracking-wide text-muted-foreground">Created</dt>
              <dd class="font-mono">{{ formatDate(data.job.createdAt) }}</dd>
            </div>
            <div>
              <dt class="text-[11px] uppercase tracking-wide text-muted-foreground">Updated</dt>
              <dd class="font-mono">{{ formatDate(data.job.updatedAt) }}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <!-- Actions -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Actions</CardTitle>
        </CardHeader>
        <CardContent class="flex flex-col gap-2">
          <Button variant="outline" :disabled="!hasSucceededPayment" @click="openAction('refund')">Refund</Button>
          <Button variant="outline" @click="openAction('extend')">Extend syncs</Button>
          <Button variant="outline" :disabled="!jobIsSucceeded" @click="openAction('resend')">Resend download</Button>
          <Button variant="outline" @click="openAction('force')">Force state</Button>
          <Button variant="outline" :disabled="!hasUpload" @click="openAction('rerun')">Re-run</Button>
          <div class="h-px bg-border my-1" />
          <Button variant="destructive" :disabled="deleteBlocked" @click="openAction('delete')">Delete</Button>
          <p v-if="deleteBlocked" class="text-[11px] text-muted-foreground mt-1">
            Blocked: job has a succeeded payment. Refund first.
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Payments -->
    <section class="mb-8">
      <h2 class="text-sm font-semibold tracking-tight mb-3">Payments</h2>
      <div class="border border-border rounded bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="w-[110px]">ID</TableHead>
              <TableHead>Intent ID</TableHead>
              <TableHead class="text-right w-[120px]">Amount (RON)</TableHead>
              <TableHead class="w-[120px]">Status</TableHead>
              <TableHead class="text-right w-[140px]">Refunded (RON)</TableHead>
              <TableHead class="w-[180px]">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-if="data?.payments && data.payments.length">
              <TableRow v-for="p in data.payments" :key="p.id">
                <TableCell class="font-mono text-xs">{{ idShort(p.id) }}</TableCell>
                <TableCell class="font-mono text-xs break-all">{{ p.stripePaymentIntentId ?? '—' }}</TableCell>
                <TableCell class="text-right font-mono text-xs tabular-nums">{{ baniToRon(p.amount ?? 0) }}</TableCell>
                <TableCell>
                  <Badge :variant="statusVariant(p.status)" class="font-mono uppercase text-[10px] rounded">
                    {{ p.status }}
                  </Badge>
                </TableCell>
                <TableCell class="text-right font-mono text-xs tabular-nums">{{ baniToRon(p.refundedAmount ?? 0) }}</TableCell>
                <TableCell class="font-mono text-xs text-muted-foreground">{{ formatDate(p.createdAt) }}</TableCell>
              </TableRow>
            </template>
            <TableEmpty v-else :colspan="6">No payments on file.</TableEmpty>
          </TableBody>
        </Table>
      </div>
    </section>

    <!-- Audit log -->
    <section class="mb-8">
      <h2 class="text-sm font-semibold tracking-tight mb-3">Audit log (last 50)</h2>
      <div class="border border-border rounded bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="w-[180px]">When</TableHead>
              <TableHead class="w-[180px]">Action</TableHead>
              <TableHead class="w-[180px]">Actor</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-if="data?.audit && data.audit.length">
              <TableRow v-for="a in data.audit" :key="a.id">
                <TableCell class="font-mono text-xs text-muted-foreground">{{ formatDate(a.createdAt) }}</TableCell>
                <TableCell class="font-mono text-xs">{{ a.action }}</TableCell>
                <TableCell class="font-mono text-xs break-all">{{ a.actor ?? '—' }}</TableCell>
                <TableCell class="font-mono text-[11px] text-muted-foreground break-all">
                  <span v-if="a.details != null">{{ typeof a.details === 'string' ? a.details : JSON.stringify(a.details) }}</span>
                  <span v-else>—</span>
                </TableCell>
              </TableRow>
            </template>
            <TableEmpty v-else :colspan="4">No audit entries.</TableEmpty>
          </TableBody>
        </Table>
      </div>
    </section>

    <!-- Refund dialog -->
    <Dialog :open="openDialog === 'refund'" @update:open="(v) => { if (!v) closeDialog() }">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refund payment</DialogTitle>
          <DialogDescription>
            Max refundable: <span class="font-mono">{{ baniToRon(refundableBani) }} RON</span>. Leave amount blank to refund the full remaining balance.
          </DialogDescription>
        </DialogHeader>
        <div class="grid gap-3 py-2">
          <div class="grid gap-1">
            <label class="text-[11px] uppercase tracking-wide text-muted-foreground" for="refund-amount">Amount (RON)</label>
            <Input id="refund-amount" v-model="refundAmountRon" type="number" step="0.01" min="0" placeholder="e.g. 49.00" />
          </div>
          <div class="grid gap-1">
            <label class="text-[11px] uppercase tracking-wide text-muted-foreground" for="refund-reason">Reason</label>
            <textarea
              id="refund-reason"
              v-model="refundReason"
              rows="3"
              class="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Required — recorded in the audit log."
            />
          </div>
          <div v-if="actionError" class="rounded border border-destructive/40 bg-destructive/10 text-destructive p-3 text-sm">
            {{ actionError }}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" :disabled="submitting" @click="closeDialog">Cancel</Button>
          <Button variant="destructive" :disabled="submitting || !refundReason.trim()" @click="submitRefund">
            {{ submitting ? 'Refunding…' : 'Confirm refund' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Extend syncs dialog -->
    <Dialog :open="openDialog === 'extend'" @update:open="(v) => { if (!v) closeDialog() }">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend syncs</DialogTitle>
          <DialogDescription>Grant additional delta syncs (1 – 20).</DialogDescription>
        </DialogHeader>
        <div class="grid gap-3 py-2">
          <div class="grid gap-1">
            <label class="text-[11px] uppercase tracking-wide text-muted-foreground" for="extend-additional">Additional syncs</label>
            <Input id="extend-additional" v-model.number="extendAdditional" type="number" min="1" max="20" />
          </div>
          <div class="grid gap-1">
            <label class="text-[11px] uppercase tracking-wide text-muted-foreground" for="extend-reason">Reason</label>
            <textarea
              id="extend-reason"
              v-model="extendReason"
              rows="3"
              class="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Required — recorded in the audit log."
            />
          </div>
          <div v-if="actionError" class="rounded border border-destructive/40 bg-destructive/10 text-destructive p-3 text-sm">
            {{ actionError }}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" :disabled="submitting" @click="closeDialog">Cancel</Button>
          <Button
            :disabled="submitting || !extendReason.trim() || extendAdditional < 1 || extendAdditional > 20"
            @click="submitExtend"
          >
            {{ submitting ? 'Extending…' : 'Confirm extend' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Resend download dialog -->
    <Dialog :open="openDialog === 'resend'" @update:open="(v) => { if (!v) closeDialog() }">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resend download email</DialogTitle>
          <DialogDescription>Email the customer a fresh download link for the converted archive.</DialogDescription>
        </DialogHeader>
        <div class="grid gap-3 py-2">
          <div class="grid gap-1">
            <label class="text-[11px] uppercase tracking-wide text-muted-foreground" for="resend-reason">Reason (optional)</label>
            <textarea
              id="resend-reason"
              v-model="resendReason"
              rows="3"
              class="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Optional — recorded in the audit log."
            />
          </div>
          <div v-if="actionError" class="rounded border border-destructive/40 bg-destructive/10 text-destructive p-3 text-sm">
            {{ actionError }}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" :disabled="submitting" @click="closeDialog">Cancel</Button>
          <Button :disabled="submitting" @click="submitResend">
            {{ submitting ? 'Sending…' : 'Send' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Force state dialog -->
    <Dialog :open="openDialog === 'force'" @update:open="(v) => { if (!v) closeDialog() }">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Force state transition</DialogTitle>
          <DialogDescription>Manually move the job to a new status. The server will reject illegal transitions.</DialogDescription>
        </DialogHeader>
        <div class="grid gap-3 py-2">
          <div class="grid gap-1">
            <label class="text-[11px] uppercase tracking-wide text-muted-foreground">From</label>
            <div class="font-mono text-sm uppercase">{{ data?.job?.status ?? '—' }}</div>
          </div>
          <div class="grid gap-1">
            <label class="text-[11px] uppercase tracking-wide text-muted-foreground" for="force-to">To</label>
            <select
              id="force-to"
              v-model="forceTo"
              class="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option v-for="s in STATUSES_FORCE" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
          <div class="grid gap-1">
            <label class="text-[11px] uppercase tracking-wide text-muted-foreground" for="force-reason">Reason</label>
            <textarea
              id="force-reason"
              v-model="forceReason"
              rows="3"
              class="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Required — recorded in the audit log."
            />
          </div>
          <div v-if="actionWarnings.length" class="rounded border border-yellow-500/40 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 p-3 text-sm">
            <div class="font-medium mb-1">Warnings</div>
            <ul class="list-disc list-inside space-y-0.5 text-[12px]">
              <li v-for="(w, i) in actionWarnings" :key="i">{{ w }}</li>
            </ul>
          </div>
          <div v-if="actionError" class="rounded border border-destructive/40 bg-destructive/10 text-destructive p-3 text-sm">
            {{ actionError }}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" :disabled="submitting" @click="closeDialog">Cancel</Button>
          <Button
            variant="destructive"
            :disabled="submitting || !forceReason.trim() || forceTo === data?.job?.status"
            @click="submitForce"
          >
            {{ submitting ? 'Forcing…' : 'Force transition' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Re-run dialog -->
    <Dialog :open="openDialog === 'rerun'" @update:open="(v) => { if (!v) closeDialog() }">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Re-run conversion</DialogTitle>
          <DialogDescription>Re-queue the worker against the existing upload. Will overwrite prior output.</DialogDescription>
        </DialogHeader>
        <div class="grid gap-3 py-2">
          <div class="grid gap-1">
            <label class="text-[11px] uppercase tracking-wide text-muted-foreground" for="rerun-reason">Reason</label>
            <textarea
              id="rerun-reason"
              v-model="rerunReason"
              rows="3"
              class="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Required — recorded in the audit log."
            />
          </div>
          <div v-if="actionError" class="rounded border border-destructive/40 bg-destructive/10 text-destructive p-3 text-sm">
            {{ actionError }}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" :disabled="submitting" @click="closeDialog">Cancel</Button>
          <Button :disabled="submitting || !rerunReason.trim()" @click="submitRerun">
            {{ submitting ? 'Queuing…' : 'Re-run' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Delete dialog -->
    <Dialog :open="openDialog === 'delete'" @update:open="(v) => { if (!v) closeDialog() }">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete job</DialogTitle>
          <DialogDescription>
            Irreversible. Removes the job record, associated files on disk, and marks artifacts as deleted.
          </DialogDescription>
        </DialogHeader>
        <div class="grid gap-3 py-2">
          <div class="grid gap-1">
            <label class="text-[11px] uppercase tracking-wide text-muted-foreground" for="delete-reason">Reason</label>
            <textarea
              id="delete-reason"
              v-model="deleteReason"
              rows="3"
              class="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Required — recorded in the audit log."
            />
          </div>
          <div v-if="actionError" class="rounded border border-destructive/40 bg-destructive/10 text-destructive p-3 text-sm">
            {{ actionError }}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" :disabled="submitting" @click="closeDialog">Cancel</Button>
          <Button variant="destructive" :disabled="submitting || !deleteReason.trim()" @click="deleteJob">
            {{ submitting ? 'Deleting…' : 'Delete job' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
