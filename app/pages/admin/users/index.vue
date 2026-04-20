<script setup lang="ts">
// Admin — users list. Sourced from GET /api/admin/users with filters
// (state, q), URL-synced pagination and sort. Row click → detail page.
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'

definePageMeta({ layout: 'admin' })

useHead({
  title: 'Admin Users — Rapidport',
  meta: [{ name: 'robots', content: 'noindex,nofollow' }],
})

type UserRow = {
  id: string
  email: string
  createdAt: string
  lastLoginAt: string | null
  deletedAt: string | null
  blockedAt: string | null
  blockedReason: string | null
}

type UsersResponse = {
  rows: UserRow[]
  page: number
  pageSize: number
  total: number
}

const route = useRoute()
const router = useRouter()

const STATE_OPTIONS = ['all', 'active', 'blocked', 'deleted'] as const
const SORT_OPTIONS = ['createdAt', 'lastLoginAt', 'email'] as const
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const

const state = ref<string>(typeof route.query.state === 'string' ? route.query.state : 'all')
const q = ref<string>(typeof route.query.q === 'string' ? route.query.q : '')
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
  if (state.value && state.value !== 'all') p.state = state.value
  if (q.value.trim()) p.q = q.value.trim()
  return p
})

const { data, pending, error, refresh } = await useAsyncData<UsersResponse>(
  'admin-users',
  () =>
    $fetch<UsersResponse>('/api/admin/users', {
      query: queryParams.value,
      headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined,
    }),
  {
    watch: [queryParams],
    default: () => ({ rows: [], page: 1, pageSize: 25, total: 0 }),
  },
)

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

const qInput = ref(q.value)
function applySearch() {
  q.value = qInput.value
  resetPage()
}

function toggleOrder() {
  order.value = order.value === 'asc' ? 'desc' : 'asc'
  resetPage()
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
function userState(row: UserRow): UserState {
  if (row.deletedAt) return 'DELETED'
  if (row.blockedAt) return 'BLOCKED'
  return 'ACTIVE'
}

function stateBadgeClass(s: UserState): string {
  const base = 'inline-block rounded border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide'
  switch (s) {
    case 'ACTIVE':
      return `${base} border-emerald-500/40 text-emerald-400 bg-emerald-500/10`
    case 'BLOCKED':
      return `${base} border-amber-500/40 text-amber-400 bg-amber-500/10`
    case 'DELETED':
      return `${base} border-destructive/50 text-destructive bg-destructive/10`
  }
}

function goTo(id: string) {
  router.push(`/admin/users/${id}`)
}
</script>

<template>
  <div class="px-6 py-6 max-w-[1600px] mx-auto">
    <div class="flex items-end justify-between gap-4 mb-6">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">Users</h1>
        <p class="text-xs text-muted-foreground mt-1 font-mono">
          Accounts — filter by state, search by email
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
      <div class="md:col-span-2">
        <label class="block text-[11px] uppercase tracking-wide text-muted-foreground mb-1">State</label>
        <select
          v-model="state"
          class="w-full h-9 px-2 rounded border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          @change="resetPage"
        >
          <option v-for="s in STATE_OPTIONS" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>

      <div class="md:col-span-5">
        <label class="block text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
          Search (email substring)
        </label>
        <div class="flex gap-2">
          <Input
            v-model="qInput"
            placeholder="name@example.com"
            class="text-sm"
            @keydown.enter="applySearch"
          />
          <Button type="button" variant="secondary" class="h-9" @click="applySearch">Apply</Button>
        </div>
      </div>

      <div class="md:col-span-3">
        <label class="block text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Sort</label>
        <div class="flex gap-2">
          <select
            v-model="sort"
            class="flex-1 h-9 px-2 rounded border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            @change="resetPage"
          >
            <option v-for="s in SORT_OPTIONS" :key="s" :value="s">{{ s }}</option>
          </select>
          <Button type="button" variant="secondary" class="h-9 font-mono" @click="toggleOrder">
            {{ order === 'asc' ? '↑ asc' : '↓ desc' }}
          </Button>
        </div>
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
      Failed to load users: {{ error.message }}
    </div>

    <!-- Table -->
    <div class="border border-border rounded overflow-x-auto bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead class="w-[7rem]">ID</TableHead>
            <TableHead>Email</TableHead>
            <TableHead class="w-[8rem]">State</TableHead>
            <TableHead class="w-[12rem]">Created</TableHead>
            <TableHead class="w-[12rem]">Last login</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <template v-if="data && data.rows.length > 0">
            <TableRow
              v-for="row in data.rows"
              :key="row.id"
              class="cursor-pointer"
              @click="goTo(row.id)"
            >
              <TableCell class="font-mono text-xs">{{ shortHex(row.id, 8) }}</TableCell>
              <TableCell class="text-sm">
                <NuxtLink
                  :to="`/admin/users/${row.id}`"
                  class="text-primary hover:underline"
                  @click.stop
                >
                  {{ row.email }}
                </NuxtLink>
              </TableCell>
              <TableCell>
                <span :class="stateBadgeClass(userState(row))">{{ userState(row) }}</span>
              </TableCell>
              <TableCell class="font-mono text-xs">{{ formatDate(row.createdAt) }}</TableCell>
              <TableCell class="font-mono text-xs">{{ formatDate(row.lastLoginAt) }}</TableCell>
            </TableRow>
          </template>
          <TableEmpty v-else :colspan="5">
            <span v-if="pending" class="text-muted-foreground">Loading…</span>
            <span v-else>No users match your filters.</span>
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
