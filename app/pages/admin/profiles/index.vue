<script setup lang="ts">
// Admin · Mapping profiles — list, filter, paginate, promote/hide.
definePageMeta({ layout: 'admin' })

useHead({
  title: 'Admin · Profiles — Rapidport',
  meta: [{ name: 'robots', content: 'noindex,nofollow' }],
})

type ProfileRow = {
  id: string
  name: string
  sourceSoftwareVersion: string
  targetSoftwareVersion: string
  isPublic: boolean
  adoptionCount: number
  userId: string
  createdAt: string
}

type ProfilesResponse = {
  rows: ProfileRow[]
  page: number
  pageSize: number
  total: number
}

type Visibility = 'all' | 'public' | 'private'
type SortKey = 'adoptionCount' | 'createdAt' | 'name'
type SortOrder = 'asc' | 'desc'

const route = useRoute()
const router = useRouter()

function qpString(k: string, dflt: string): string {
  const v = route.query[k]
  if (Array.isArray(v)) return String(v[0] ?? dflt)
  return typeof v === 'string' && v.length > 0 ? v : dflt
}
function qpInt(k: string, dflt: number): number {
  const s = qpString(k, '')
  const n = parseInt(s, 10)
  return Number.isFinite(n) && n > 0 ? n : dflt
}

const visibility = ref<Visibility>((['all', 'public', 'private'].includes(qpString('isPublic', 'all')) ? qpString('isPublic', 'all') : 'all') as Visibility)
const sort = ref<SortKey>((['adoptionCount', 'createdAt', 'name'].includes(qpString('sort', 'adoptionCount')) ? qpString('sort', 'adoptionCount') : 'adoptionCount') as SortKey)
const order = ref<SortOrder>((qpString('order', 'desc') === 'asc' ? 'asc' : 'desc'))
const page = ref<number>(qpInt('page', 1))
const pageSize = ref<number>(qpInt('pageSize', 25))

const reqHeaders = import.meta.server ? useRequestHeaders(['cookie']) : undefined

const query = computed(() => {
  const q: Record<string, string> = {
    page: String(page.value),
    pageSize: String(pageSize.value),
    sort: sort.value,
    order: order.value,
  }
  if (visibility.value !== 'all') {
    q.isPublic = visibility.value === 'public' ? 'true' : 'false'
  }
  return q
})

const { data, pending, refresh, error } = await useAsyncData<ProfilesResponse>(
  'admin-profiles',
  () =>
    $fetch<ProfilesResponse>('/api/admin/profiles', {
      query: query.value,
      headers: reqHeaders,
    }),
  {
    watch: [query],
    default: () => ({ rows: [], page: 1, pageSize: 25, total: 0 }),
  },
)

const rows = computed<ProfileRow[]>(() => data.value?.rows ?? [])
const total = computed<number>(() => data.value?.total ?? 0)
const totalPages = computed<number>(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

// URL sync
watch([visibility, sort, order, page, pageSize], () => {
  const q: Record<string, string> = {
    sort: sort.value,
    order: order.value,
    page: String(page.value),
    pageSize: String(pageSize.value),
  }
  if (visibility.value !== 'all') q.isPublic = visibility.value === 'public' ? 'true' : 'false'
  router.replace({ query: q })
})

function onFilterChange(): void {
  page.value = 1
}

function fmtInt(n: number): string {
  return n.toLocaleString('en-US')
}
function fmtDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 19).replace('T', ' ') + 'Z'
}
function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id
}

// Dialog state for promote/hide
type DialogKind = 'promote' | 'hide'
const dialogOpen = ref(false)
const dialogKind = ref<DialogKind>('promote')
const dialogTarget = ref<ProfileRow | null>(null)
const reason = ref('')
const submitting = ref(false)
const dialogError = ref<string | null>(null)

function openDialog(kind: DialogKind, row: ProfileRow): void {
  dialogKind.value = kind
  dialogTarget.value = row
  reason.value = ''
  dialogError.value = null
  dialogOpen.value = true
}

function closeDialog(): void {
  if (submitting.value) return
  dialogOpen.value = false
  dialogTarget.value = null
  reason.value = ''
  dialogError.value = null
}

function readCsrf(): string {
  if (import.meta.server) return ''
  const m = document.cookie.match(/(?:^|;\s*)rp_csrf=([^;]+)/)
  return m && m[1] ? decodeURIComponent(m[1]) : ''
}

async function submitDialog(): Promise<void> {
  if (!dialogTarget.value) return
  const r = reason.value.trim()
  if (r.length < 3) {
    dialogError.value = 'Reason is required (min. 3 characters).'
    return
  }
  submitting.value = true
  dialogError.value = null
  try {
    const action = dialogKind.value === 'promote' ? 'promote' : 'hide'
    await $fetch(`/api/admin/profiles/${dialogTarget.value.id}/${action}`, {
      method: 'POST',
      headers: { 'x-csrf-token': readCsrf() },
      body: { reason: r },
    })
    dialogOpen.value = false
    dialogTarget.value = null
    reason.value = ''
    await refresh()
  } catch (e: unknown) {
    const msg = (e as { data?: { message?: string }, message?: string })?.data?.message
      ?? (e as { message?: string })?.message
      ?? 'Request failed.'
    dialogError.value = msg
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="px-6 py-6 max-w-[1400px] mx-auto">
    <div class="flex items-end justify-between gap-4 mb-6">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">Mapping profiles</h1>
        <p class="text-xs text-muted-foreground mt-1 font-mono">
          {{ fmtInt(total) }} total · page {{ page }}/{{ totalPages }}
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
    <div class="flex flex-wrap items-end gap-3 mb-4">
      <label class="flex flex-col gap-1">
        <span class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Visibility</span>
        <select
          v-model="visibility"
          class="h-9 rounded-md border border-input bg-background px-2 text-sm"
          @change="onFilterChange"
        >
          <option value="all">All</option>
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Sort</span>
        <select
          v-model="sort"
          class="h-9 rounded-md border border-input bg-background px-2 text-sm"
          @change="onFilterChange"
        >
          <option value="adoptionCount">Adoption count</option>
          <option value="createdAt">Created</option>
          <option value="name">Name</option>
        </select>
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Order</span>
        <select
          v-model="order"
          class="h-9 rounded-md border border-input bg-background px-2 text-sm"
          @change="onFilterChange"
        >
          <option value="desc">Desc</option>
          <option value="asc">Asc</option>
        </select>
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Page size</span>
        <select
          v-model.number="pageSize"
          class="h-9 rounded-md border border-input bg-background px-2 text-sm"
          @change="onFilterChange"
        >
          <option :value="10">10</option>
          <option :value="25">25</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
        </select>
      </label>
    </div>

    <div
      v-if="error"
      class="rounded border border-destructive/40 bg-destructive/10 text-destructive p-4 text-sm mb-4"
    >
      Failed to load profiles: {{ error.message }}
    </div>

    <!-- Table -->
    <div class="border border-border bg-card rounded overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr class="border-b border-border">
            <th class="text-left font-medium px-3 py-2">Name</th>
            <th class="text-left font-medium px-3 py-2">Source ver.</th>
            <th class="text-left font-medium px-3 py-2">Target ver.</th>
            <th class="text-left font-medium px-3 py-2">Visibility</th>
            <th class="text-right font-medium px-3 py-2">Adoption</th>
            <th class="text-left font-medium px-3 py-2">Owner</th>
            <th class="text-left font-medium px-3 py-2">Created</th>
            <th class="text-right font-medium px-3 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="rows.length === 0">
            <td colspan="8" class="px-3 py-6 text-center text-muted-foreground text-xs">
              {{ pending ? 'Loading…' : 'No profiles found.' }}
            </td>
          </tr>
          <tr
            v-for="r in rows"
            :key="r.id"
            class="border-b border-border last:border-b-0 hover:bg-muted/20"
            style="height: 40px"
          >
            <td class="px-3">{{ r.name }}</td>
            <td class="px-3 font-mono text-xs">{{ r.sourceSoftwareVersion }}</td>
            <td class="px-3 font-mono text-xs">{{ r.targetSoftwareVersion }}</td>
            <td class="px-3">
              <span
                class="inline-block rounded-[4px] border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide"
                :class="r.isPublic
                  ? 'border-[color:var(--accent-primary)]/50 text-[color:var(--accent-primary)]'
                  : 'border-border text-muted-foreground'"
              >
                {{ r.isPublic ? 'Public' : 'Private' }}
              </span>
            </td>
            <td class="px-3 text-right font-mono tabular-nums">{{ fmtInt(r.adoptionCount) }}</td>
            <td class="px-3 font-mono text-xs text-muted-foreground">{{ shortId(r.userId) }}</td>
            <td class="px-3 font-mono text-xs text-muted-foreground">{{ fmtDate(r.createdAt) }}</td>
            <td class="px-3 text-right">
              <button
                v-if="r.isPublic"
                type="button"
                class="h-8 px-3 rounded-md border border-destructive/50 text-destructive text-xs font-medium hover:bg-destructive/10 transition-colors cursor-pointer"
                @click="openDialog('hide', r)"
              >
                Hide
              </button>
              <button
                v-else
                type="button"
                class="h-8 px-3 rounded-md border border-input bg-background text-xs font-medium hover:border-primary/40 hover:bg-accent transition-colors cursor-pointer"
                @click="openDialog('promote', r)"
              >
                Promote
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div class="flex items-center justify-between mt-4 text-xs text-muted-foreground">
      <div class="font-mono">
        {{ fmtInt((page - 1) * pageSize + (rows.length > 0 ? 1 : 0)) }}–{{ fmtInt((page - 1) * pageSize + rows.length) }}
        of {{ fmtInt(total) }}
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="h-8 px-3 rounded-md border border-input bg-background text-xs font-medium hover:border-primary/40 hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="page <= 1 || pending"
          @click="page = Math.max(1, page - 1)"
        >
          Prev
        </button>
        <span class="font-mono">{{ page }} / {{ totalPages }}</span>
        <button
          type="button"
          class="h-8 px-3 rounded-md border border-input bg-background text-xs font-medium hover:border-primary/40 hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="page >= totalPages || pending"
          @click="page = Math.min(totalPages, page + 1)"
        >
          Next
        </button>
      </div>
    </div>

    <!-- Confirm dialog (inline, no shared component dependency) -->
    <div
      v-if="dialogOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      @click.self="closeDialog"
    >
      <div
        role="dialog"
        aria-modal="true"
        class="w-full max-w-md rounded border border-border bg-card shadow-xl"
      >
        <div class="border-b border-border px-4 py-3">
          <h3 class="text-sm font-semibold">
            {{ dialogKind === 'promote' ? 'Promote to public' : 'Hide from public' }}
          </h3>
          <p class="text-xs text-muted-foreground mt-1 font-mono">
            {{ dialogTarget?.name }} · {{ shortId(dialogTarget?.id ?? '') }}
          </p>
        </div>

        <div class="px-4 py-3 space-y-3">
          <label class="flex flex-col gap-1">
            <span class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Reason</span>
            <textarea
              v-model="reason"
              rows="3"
              class="rounded-md border border-input bg-background px-2 py-1 text-sm"
              :placeholder="dialogKind === 'promote' ? 'Why promote this profile?' : 'Why hide this profile?'"
            />
          </label>
          <p v-if="dialogError" class="text-xs text-destructive">{{ dialogError }}</p>
        </div>

        <div class="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            class="h-9 px-3 rounded-md border border-input bg-background text-xs font-medium hover:border-primary/40 hover:bg-accent transition-colors cursor-pointer disabled:opacity-50"
            :disabled="submitting"
            @click="closeDialog"
          >
            Cancel
          </button>
          <button
            type="button"
            :class="[
              'h-9 px-3 rounded-md text-xs font-medium transition-colors cursor-pointer disabled:opacity-50',
              dialogKind === 'hide'
                ? 'border border-destructive/50 text-destructive hover:bg-destructive/10'
                : 'bg-primary text-primary-foreground hover:bg-[color:var(--accent-hover)]',
            ]"
            :disabled="submitting"
            @click="submitDialog"
          >
            {{ submitting ? 'Working…' : (dialogKind === 'promote' ? 'Promote' : 'Hide') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
