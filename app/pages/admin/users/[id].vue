<script setup lang="ts">
// Admin — user detail. Sourced from GET /api/admin/users/[id] with
// stats + recent jobs. Action buttons (grant-syncs / block / unblock /
// delete) call the dedicated endpoints with x-csrf-token. On success
// the user payload is refetched.
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { ArrowLeft } from 'lucide-vue-next'

definePageMeta({ layout: 'admin' })

useHead({
  title: 'Admin User — Rapidport',
  meta: [{ name: 'robots', content: 'noindex,nofollow' }],
})

type UserDetail = {
  id: string
  email: string
  createdAt: string
  lastLoginAt: string | null
  deletedAt: string | null
  blockedAt: string | null
  blockedReason: string | null
}

type JobRow = {
  id: string
  status: string
  sourceSystem: string | null
  targetSystem: string | null
  createdAt: string
}

type Stats = {
  jobsTotal: number
  paymentsTotal: number
  paymentsSucceeded: number
  revenueBani: number
}

type DetailResponse = {
  user: UserDetail
  stats: Stats
  recentJobs: JobRow[]
}

const route = useRoute()
const userId = computed(() => String(route.params.id))

const { data, pending, error, refresh } = await useAsyncData<DetailResponse>(
  () => `admin-user-${userId.value}`,
  () =>
    $fetch<DetailResponse>(`/api/admin/users/${userId.value}`, {
      headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined,
    }),
  {
    watch: [userId],
    default: () => null as unknown as DetailResponse,
  },
)

// --- helpers ---
const RON_FORMATTER = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatRon(bani: number): string {
  return `${RON_FORMATTER.format((bani ?? 0) / 100)} RON`
}

function shortHex(id: string | null | undefined, chars = 8): string {
  if (!id) return '—'
  return id.slice(0, chars)
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}Z`
}

type UserState = 'ACTIVE' | 'BLOCKED' | 'DELETED'
function userState(u: UserDetail | null | undefined): UserState | null {
  if (!u) return null
  if (u.deletedAt) return 'DELETED'
  if (u.blockedAt) return 'BLOCKED'
  return 'ACTIVE'
}

function stateBadgeClass(s: UserState): string {
  const base = 'inline-block rounded border px-2 py-0.5 text-[11px] font-mono uppercase tracking-wide'
  switch (s) {
    case 'ACTIVE':
      return `${base} border-emerald-500/40 text-emerald-400 bg-emerald-500/10`
    case 'BLOCKED':
      return `${base} border-amber-500/40 text-amber-400 bg-amber-500/10`
    case 'DELETED':
      return `${base} border-destructive/50 text-destructive bg-destructive/10`
  }
}

function jobStatusBadgeClass(s: string): string {
  const base = 'inline-block rounded border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide'
  switch (s) {
    case 'succeeded':
    case 'ready':
      return `${base} border-emerald-500/40 text-emerald-400 bg-emerald-500/10`
    case 'failed':
    case 'canceled':
      return `${base} border-destructive/50 text-destructive bg-destructive/10`
    default:
      return `${base} border-border text-muted-foreground bg-muted/30`
  }
}

function readCsrf(): string {
  if (import.meta.server) return ''
  const m = document.cookie.match(/(?:^|;\s*)rp_csrf=([^;]+)/)
  return m && m[1] ? decodeURIComponent(m[1]) : ''
}

// --- dialog state ---
const grantOpen = ref(false)
const blockOpen = ref(false)
const unblockOpen = ref(false)
const deleteOpen = ref(false)

const grantAdditional = ref<number>(1)
const grantReason = ref('')
const blockReason = ref('')
const unblockReason = ref('')
const deleteReason = ref('')
const deleteConfirm = ref('')

const actionPending = ref(false)
const actionError = ref<string | null>(null)

function resetDialogs() {
  grantOpen.value = false
  blockOpen.value = false
  unblockOpen.value = false
  deleteOpen.value = false
  grantAdditional.value = 1
  grantReason.value = ''
  blockReason.value = ''
  unblockReason.value = ''
  deleteReason.value = ''
  deleteConfirm.value = ''
  actionError.value = null
}

async function callAction(method: 'POST' | 'DELETE', path: string, body: Record<string, unknown>) {
  actionPending.value = true
  actionError.value = null
  try {
    await $fetch(path, {
      method,
      body,
      headers: { 'x-csrf-token': readCsrf() },
    })
    resetDialogs()
    await refresh()
  } catch (err: unknown) {
    const e = err as { data?: { message?: string }; message?: string }
    actionError.value = e?.data?.message ?? e?.message ?? 'Request failed.'
  } finally {
    actionPending.value = false
  }
}

async function submitGrant() {
  const n = Number(grantAdditional.value)
  if (!Number.isInteger(n) || n < 1 || n > 20) {
    actionError.value = 'Additional must be an integer between 1 and 20.'
    return
  }
  if (!grantReason.value.trim()) {
    actionError.value = 'Reason is required.'
    return
  }
  await callAction('POST', `/api/admin/users/${userId.value}/grant-syncs`, {
    additional: n,
    reason: grantReason.value.trim(),
  })
}

async function submitBlock() {
  if (!blockReason.value.trim()) {
    actionError.value = 'Reason is required.'
    return
  }
  await callAction('POST', `/api/admin/users/${userId.value}/block`, {
    reason: blockReason.value.trim(),
  })
}

async function submitUnblock() {
  if (!unblockReason.value.trim()) {
    actionError.value = 'Reason is required.'
    return
  }
  await callAction('POST', `/api/admin/users/${userId.value}/unblock`, {
    reason: unblockReason.value.trim(),
  })
}

async function submitDelete() {
  if (deleteConfirm.value !== 'DELETE') {
    actionError.value = 'Type DELETE to confirm.'
    return
  }
  if (!deleteReason.value.trim()) {
    actionError.value = 'Reason is required.'
    return
  }
  await callAction('DELETE', `/api/admin/users/${userId.value}`, {
    reason: deleteReason.value.trim(),
  })
}

// --- disabled flags ---
const isDeleted = computed(() => !!data.value?.user?.deletedAt)
const isBlocked = computed(() => !!data.value?.user?.blockedAt && !data.value?.user?.deletedAt)

const grantDisabled = computed(() => isDeleted.value)
const blockDisabled = computed(() => isDeleted.value || isBlocked.value)
const unblockDisabled = computed(() => !isBlocked.value)
const deleteDisabled = computed(() => isDeleted.value)
</script>

<template>
  <div class="px-6 py-6 max-w-[1400px] mx-auto">
    <!-- Back link + header -->
    <div class="mb-4">
      <NuxtLink
        to="/admin/users"
        class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft class="size-3.5" :stroke-width="2" />
        Back to users
      </NuxtLink>
    </div>

    <div
      v-if="error"
      class="rounded border border-destructive/40 bg-destructive/10 text-destructive p-4 text-sm mb-4"
    >
      Failed to load user: {{ error.message }}
    </div>

    <div v-if="!data && !error" class="text-sm text-muted-foreground">Loading…</div>

    <template v-if="data">
      <div class="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 class="text-xl font-semibold tracking-tight">{{ data.user.email }}</h1>
          <div class="mt-2 flex items-center gap-2">
            <span v-if="userState(data.user)" :class="stateBadgeClass(userState(data.user)!)">
              {{ userState(data.user) }}
            </span>
            <span class="font-mono text-xs text-muted-foreground">{{ data.user.id }}</span>
          </div>
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

      <!-- Two-column: metadata + actions -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div class="lg:col-span-2 border border-border bg-card rounded p-5">
          <div class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-4">
            Metadata
          </div>
          <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt class="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">ID</dt>
              <dd class="font-mono text-xs break-all">{{ data.user.id }}</dd>
            </div>
            <div>
              <dt class="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">Email</dt>
              <dd>{{ data.user.email }}</dd>
            </div>
            <div>
              <dt class="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">Created</dt>
              <dd class="font-mono text-xs">{{ formatDate(data.user.createdAt) }}</dd>
            </div>
            <div>
              <dt class="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">Last login</dt>
              <dd class="font-mono text-xs">{{ formatDate(data.user.lastLoginAt) }}</dd>
            </div>
            <div>
              <dt class="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">Blocked at</dt>
              <dd class="font-mono text-xs">{{ formatDate(data.user.blockedAt) }}</dd>
            </div>
            <div>
              <dt class="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">Deleted at</dt>
              <dd class="font-mono text-xs">{{ formatDate(data.user.deletedAt) }}</dd>
            </div>
            <div class="sm:col-span-2">
              <dt class="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">Blocked reason</dt>
              <dd class="text-sm">{{ data.user.blockedReason ?? '—' }}</dd>
            </div>
          </dl>
        </div>

        <div class="border border-border bg-card rounded p-5">
          <div class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-4">
            Actions
          </div>
          <div class="flex flex-col gap-2">
            <Button
              type="button"
              variant="secondary"
              class="h-10 justify-start"
              :disabled="grantDisabled"
              @click="grantOpen = true"
            >
              Grant syncs
            </Button>
            <Button
              type="button"
              variant="secondary"
              class="h-10 justify-start"
              :disabled="blockDisabled"
              @click="blockOpen = true"
            >
              Block
            </Button>
            <Button
              type="button"
              variant="secondary"
              class="h-10 justify-start"
              :disabled="unblockDisabled"
              @click="unblockOpen = true"
            >
              Unblock
            </Button>
            <Button
              type="button"
              variant="outline"
              class="h-10 justify-start border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive"
              :disabled="deleteDisabled"
              @click="deleteOpen = true"
            >
              Delete (GDPR)
            </Button>
          </div>
        </div>
      </div>

      <!-- Stats strip -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div class="border border-border bg-card rounded p-4">
          <div class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
            Jobs total
          </div>
          <div class="text-2xl font-semibold tabular-nums font-mono">
            {{ data.stats.jobsTotal.toLocaleString('en-US') }}
          </div>
        </div>
        <div class="border border-border bg-card rounded p-4">
          <div class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
            Payments total
          </div>
          <div class="text-2xl font-semibold tabular-nums font-mono">
            {{ data.stats.paymentsTotal.toLocaleString('en-US') }}
          </div>
        </div>
        <div class="border border-border bg-card rounded p-4">
          <div class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
            Payments succeeded
          </div>
          <div class="text-2xl font-semibold tabular-nums font-mono">
            {{ data.stats.paymentsSucceeded.toLocaleString('en-US') }}
          </div>
        </div>
        <div class="border border-border bg-card rounded p-4">
          <div class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
            Revenue
          </div>
          <div class="text-2xl font-semibold tabular-nums font-mono">
            {{ formatRon(data.stats.revenueBani) }}
          </div>
        </div>
      </div>

      <!-- Recent jobs -->
      <div class="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
        Recent jobs
      </div>
      <div class="border border-border rounded overflow-x-auto bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="w-[7rem]">ID</TableHead>
              <TableHead class="w-[9rem]">Status</TableHead>
              <TableHead>Source → Target</TableHead>
              <TableHead class="w-[12rem]">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-if="data.recentJobs.length > 0">
              <TableRow v-for="job in data.recentJobs" :key="job.id">
                <TableCell class="font-mono text-xs">
                  <NuxtLink
                    :to="`/admin/jobs/${job.id}`"
                    class="text-primary hover:underline"
                  >
                    {{ shortHex(job.id, 8) }}
                  </NuxtLink>
                </TableCell>
                <TableCell>
                  <span :class="jobStatusBadgeClass(job.status)">{{ job.status }}</span>
                </TableCell>
                <TableCell class="text-sm">
                  <span class="font-mono text-xs">
                    {{ job.sourceSystem ?? '—' }} → {{ job.targetSystem ?? '—' }}
                  </span>
                </TableCell>
                <TableCell class="font-mono text-xs">{{ formatDate(job.createdAt) }}</TableCell>
              </TableRow>
            </template>
            <TableEmpty v-else :colspan="4">
              <span class="text-muted-foreground">No jobs recorded.</span>
            </TableEmpty>
          </TableBody>
        </Table>
      </div>
    </template>

    <!-- Grant syncs dialog -->
    <Dialog v-model:open="grantOpen" @update:open="(o) => { if (!o) { actionError = null } }">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant syncs</DialogTitle>
          <DialogDescription>
            Grant additional delta-sync credits to this user. Recorded in the audit log.
          </DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-3">
          <div>
            <label class="block text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              Additional (1–20)
            </label>
            <Input
              v-model.number="grantAdditional"
              type="number"
              min="1"
              max="20"
              class="font-mono text-sm"
            />
          </div>
          <div>
            <label class="block text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              Reason
            </label>
            <textarea
              v-model="grantReason"
              rows="3"
              class="w-full rounded border border-input bg-background text-sm p-2 focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Why are you granting these?"
            />
          </div>
          <p v-if="actionError" class="text-sm text-destructive" role="alert">{{ actionError }}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" :disabled="actionPending" @click="grantOpen = false">
            Cancel
          </Button>
          <Button type="button" :disabled="actionPending" @click="submitGrant">
            {{ actionPending ? 'Saving…' : 'Grant' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Block dialog -->
    <Dialog v-model:open="blockOpen" @update:open="(o) => { if (!o) { actionError = null } }">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Block user</DialogTitle>
          <DialogDescription>
            The user will be signed out and denied further access until unblocked.
          </DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-3">
          <div>
            <label class="block text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              Reason
            </label>
            <textarea
              v-model="blockReason"
              rows="3"
              class="w-full rounded border border-input bg-background text-sm p-2 focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Why are you blocking this user?"
            />
          </div>
          <p v-if="actionError" class="text-sm text-destructive" role="alert">{{ actionError }}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" :disabled="actionPending" @click="blockOpen = false">
            Cancel
          </Button>
          <Button type="button" :disabled="actionPending" @click="submitBlock">
            {{ actionPending ? 'Saving…' : 'Block' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Unblock dialog -->
    <Dialog v-model:open="unblockOpen" @update:open="(o) => { if (!o) { actionError = null } }">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unblock user</DialogTitle>
          <DialogDescription>
            The user will regain access immediately.
          </DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-3">
          <div>
            <label class="block text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              Reason
            </label>
            <textarea
              v-model="unblockReason"
              rows="3"
              class="w-full rounded border border-input bg-background text-sm p-2 focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Why are you unblocking this user?"
            />
          </div>
          <p v-if="actionError" class="text-sm text-destructive" role="alert">{{ actionError }}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" :disabled="actionPending" @click="unblockOpen = false">
            Cancel
          </Button>
          <Button type="button" :disabled="actionPending" @click="submitUnblock">
            {{ actionPending ? 'Saving…' : 'Unblock' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Delete (GDPR) dialog -->
    <Dialog v-model:open="deleteOpen" @update:open="(o) => { if (!o) { actionError = null } }">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete user (GDPR)</DialogTitle>
          <DialogDescription>
            This will soft-delete the account and purge personal data per GDPR policy.
            This cannot be undone. Type <span class="font-mono">DELETE</span> to confirm.
          </DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-3">
          <div>
            <label class="block text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              Reason
            </label>
            <textarea
              v-model="deleteReason"
              rows="3"
              class="w-full rounded border border-input bg-background text-sm p-2 focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Why are you deleting this account?"
            />
          </div>
          <div>
            <label class="block text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              Type DELETE to confirm
            </label>
            <Input v-model="deleteConfirm" class="font-mono text-sm" placeholder="DELETE" />
          </div>
          <p v-if="actionError" class="text-sm text-destructive" role="alert">{{ actionError }}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" :disabled="actionPending" @click="deleteOpen = false">
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            :disabled="actionPending || deleteConfirm !== 'DELETE'"
            @click="submitDelete"
          >
            {{ actionPending ? 'Deleting…' : 'Delete' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
