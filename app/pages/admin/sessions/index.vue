<script setup lang="ts">
// Admin sessions viewer — lists active admin sessions, allows revoking non-current ones.
// Current session cannot be revoked (server returns 409 cannot_revoke_current_session;
// we mirror with disabled UI). English-only per CLAUDE.md §UI Design System.
import { RefreshCw } from 'lucide-vue-next'
import { Button } from '~/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'
import ConfirmDialog from '~/components/layout/ConfirmDialog.vue'

definePageMeta({ layout: 'admin' })

useHead({
  title: 'Admin Sessions — Rapidport',
  meta: [{ name: 'robots', content: 'noindex,nofollow' }],
})

type SessionRow = {
  id: string
  adminEmail: string
  ipHash: string | null
  userAgent: string | null
  createdAt: string
  expiresAt: string
  isCurrent: boolean
}

type SessionsResponse = {
  rows: SessionRow[]
}

const { data, pending, refresh, error } = await useAsyncData<SessionsResponse>(
  'admin-sessions',
  () =>
    $fetch<SessionsResponse>('/api/admin/sessions', {
      headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined,
    }),
  { default: () => ({ rows: [] }) },
)

// --- Revoke flow ---------------------------------------------------------------
const confirmOpen = ref(false)
const revoking = ref(false)
const target = ref<SessionRow | null>(null)
const revokeError = ref<string | null>(null)

function readCsrf(): string {
  if (import.meta.server) return ''
  const m = document.cookie.match(/(?:^|;\s*)rp_csrf=([^;]+)/)
  return m && m[1] ? decodeURIComponent(m[1]) : ''
}

function askRevoke(row: SessionRow) {
  if (row.isCurrent) return
  target.value = row
  revokeError.value = null
  confirmOpen.value = true
}

async function doRevoke() {
  if (!target.value || revoking.value) return
  revoking.value = true
  revokeError.value = null
  try {
    await $fetch(`/api/admin/sessions/${target.value.id}`, {
      method: 'DELETE',
      headers: { 'x-csrf-token': readCsrf() },
    })
    confirmOpen.value = false
    target.value = null
    await refresh()
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string, message?: string }, statusMessage?: string, message?: string }
    revokeError.value = err?.data?.statusMessage || err?.data?.message || err?.statusMessage || err?.message || 'Failed to revoke session.'
  } finally {
    revoking.value = false
  }
}

function shortId(id: string | null | undefined, n = 8): string {
  if (!id) return '—'
  return id.length > n ? id.slice(0, n) : id
}

function shortIso(iso: string): string {
  return iso.length >= 19 ? `${iso.slice(0, 19)}Z` : iso
}
</script>

<template>
  <div class="px-6 py-6 max-w-[1400px] mx-auto">
    <div class="flex items-end justify-between gap-4 mb-6">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">Active admin sessions</h1>
        <p class="text-xs text-muted-foreground mt-1 font-mono">
          {{ data?.rows.length ?? 0 }} session{{ (data?.rows.length ?? 0) === 1 ? '' : 's' }}
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

    <div v-if="error" class="rounded border border-destructive/40 bg-destructive/10 text-destructive p-4 text-sm mb-4">
      Failed to load sessions: {{ error.message }}
    </div>

    <div v-if="revokeError" class="rounded border border-destructive/40 bg-destructive/10 text-destructive p-4 text-sm mb-4">
      {{ revokeError }}
    </div>

    <div class="border border-border bg-card rounded overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow class="hover:bg-transparent">
            <TableHead class="h-10 text-[11px] uppercase tracking-wide text-muted-foreground font-medium w-[120px]">ID</TableHead>
            <TableHead class="h-10 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Admin</TableHead>
            <TableHead class="h-10 text-[11px] uppercase tracking-wide text-muted-foreground font-medium w-[120px]">IP hash</TableHead>
            <TableHead class="h-10 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">User-agent</TableHead>
            <TableHead class="h-10 text-[11px] uppercase tracking-wide text-muted-foreground font-medium w-[180px]">Created</TableHead>
            <TableHead class="h-10 text-[11px] uppercase tracking-wide text-muted-foreground font-medium w-[180px]">Expires</TableHead>
            <TableHead class="h-10 text-[11px] uppercase tracking-wide text-muted-foreground font-medium w-[120px]">Current</TableHead>
            <TableHead class="h-10 text-[11px] uppercase tracking-wide text-muted-foreground font-medium text-right w-[120px]">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow
            v-for="row in data?.rows ?? []"
            :key="row.id"
            class="h-10 border-b-border"
          >
            <TableCell class="font-mono text-xs">{{ shortId(row.id, 8) }}</TableCell>
            <TableCell class="text-xs truncate max-w-[220px]">{{ row.adminEmail }}</TableCell>
            <TableCell class="font-mono text-xs text-muted-foreground">{{ shortId(row.ipHash, 8) }}</TableCell>
            <TableCell class="text-xs text-muted-foreground truncate max-w-[320px]">{{ row.userAgent || '—' }}</TableCell>
            <TableCell class="font-mono text-xs text-muted-foreground">{{ shortIso(row.createdAt) }}</TableCell>
            <TableCell class="font-mono text-xs text-muted-foreground">{{ shortIso(row.expiresAt) }}</TableCell>
            <TableCell>
              <span
                v-if="row.isCurrent"
                class="inline-flex items-center rounded border border-primary/50 text-primary px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide"
              >
                CURRENT
              </span>
              <span v-else class="text-muted-foreground text-xs">—</span>
            </TableCell>
            <TableCell class="text-right">
              <Button
                type="button"
                variant="outline"
                size="sm"
                class="h-8 rounded border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                :disabled="row.isCurrent"
                :title="row.isCurrent ? 'Cannot revoke the current session' : 'Revoke this session'"
                @click="askRevoke(row)"
              >
                Revoke
              </Button>
            </TableCell>
          </TableRow>
          <TableRow v-if="(data?.rows.length ?? 0) === 0" class="hover:bg-transparent">
            <TableCell colspan="8" class="text-center text-sm text-muted-foreground py-10">
              {{ pending ? 'Loading…' : 'No active admin sessions.' }}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <ConfirmDialog
      v-model:open="confirmOpen"
      title="Revoke this session?"
      :description="target ? `The admin session ${shortId(target.id, 8)} for ${target.adminEmail} will be revoked immediately. Any active requests will be rejected on the next call.` : undefined"
      confirm-label="Revoke"
      cancel-label="Cancel"
      variant="destructive"
      :loading="revoking"
      @confirm="doRevoke"
    />
  </div>
</template>
