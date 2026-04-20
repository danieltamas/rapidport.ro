<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { Monitor, Smartphone, Download, Trash2, LogOut, Mail, ArrowLeft } from 'lucide-vue-next'

useHead({
  title: 'Securitate cont — Rapidport',
  htmlAttrs: { lang: 'ro' },
})

type SessionRow = {
  id: string
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
  expiresAt: string
  current: boolean
}
type Account = { email: string; createdAt: string }

// Cookie-forwarded SSR fetches so the header + page render already-authenticated.
const reqHeaders = import.meta.server ? useRequestHeaders(['cookie']) : undefined

const { data: account } = await useAsyncData<Account | null>(
  'me-account',
  () => $fetch<Account>('/api/me/account', { headers: reqHeaders }),
  { default: () => null },
)

const { data: sessionList, refresh: refreshSessions } = await useAsyncData<SessionRow[]>(
  'me-sessions',
  () => $fetch<SessionRow[]>('/api/me/sessions', { headers: reqHeaders }),
  { default: () => [] },
)

function readCsrf(): string {
  if (import.meta.server) return ''
  const m = document.cookie.match(/(?:^|;\s*)rp_csrf=([^;]+)/)
  return m && m[1] ? decodeURIComponent(m[1]) : ''
}

// Device-label heuristic from UA — cheap, not bulletproof.
function deviceLabel(ua: string | null): string {
  if (!ua) return 'Dispozitiv necunoscut'
  const os = /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'Mac'
    : /iPhone|iPad/.test(ua) ? 'iPhone'
    : /Android/.test(ua) ? 'Android'
    : /Linux/.test(ua) ? 'Linux'
    : 'Altul'
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Browser'
  return `${os} · ${browser}`
}

function isMobile(ua: string | null): boolean {
  return !!ua && /iPhone|iPad|Android/.test(ua)
}

function formatRelativeRO(iso: string): string {
  const t = new Date(iso).getTime()
  const diff = Date.now() - t
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'acum câteva secunde'
  if (mins < 60) return `acum ${mins} ${mins === 1 ? 'minut' : 'minute'}`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `acum ${hours} ${hours === 1 ? 'oră' : 'ore'}`
  const days = Math.floor(hours / 24)
  if (days < 30) return `acum ${days} ${days === 1 ? 'zi' : 'zile'}`
  const months = Math.floor(days / 30)
  return `acum ${months} ${months === 1 ? 'lună' : 'luni'}`
}

function formatDateRO(iso: string): string {
  return new Date(iso).toLocaleDateString('ro-RO', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

// UI state for modals + pending actions.
const revokeAllOpen = ref(false)
const revokeAllLoading = ref(false)

const pendingRevokeId = ref<string | null>(null)
const revokeSessionOpen = ref(false)
const revokeSessionLoading = ref(false)

const deleteAccountOpen = ref(false)
const deleteAccountLoading = ref(false)

async function revokeAllOthers() {
  revokeAllLoading.value = true
  try {
    await $fetch('/api/me/sessions', {
      method: 'DELETE',
      headers: { 'x-csrf-token': readCsrf() },
    })
    await refreshSessions()
  } finally {
    revokeAllLoading.value = false
    revokeAllOpen.value = false
  }
}

function openRevokeSession(id: string) {
  pendingRevokeId.value = id
  revokeSessionOpen.value = true
}

async function revokeOneSession() {
  if (!pendingRevokeId.value) return
  revokeSessionLoading.value = true
  try {
    await $fetch(`/api/me/sessions/${pendingRevokeId.value}`, {
      method: 'DELETE',
      headers: { 'x-csrf-token': readCsrf() },
    })
    await refreshSessions()
  } finally {
    revokeSessionLoading.value = false
    revokeSessionOpen.value = false
    pendingRevokeId.value = null
  }
}

async function deleteAccount() {
  deleteAccountLoading.value = true
  try {
    await $fetch('/api/me', {
      method: 'DELETE',
      headers: { 'x-csrf-token': readCsrf() },
    })
  } catch {
    // Fall through — even on server-side failure we clear the session cookie
    // client-side so the user is logged out regardless. The server also clears
    // it on success.
  }
  deleteAccountLoading.value = false
  deleteAccountOpen.value = false
  // Hard reload to wipe any cached useAsyncData('session') state before landing.
  if (import.meta.client) {
    window.location.href = '/?deleted=1'
  }
}

const exportLoading = ref(false)
async function exportData() {
  if (exportLoading.value) return
  exportLoading.value = true
  try {
    // Navigate directly to the endpoint so the browser handles the Content-
    // Disposition attachment and triggers the download. Cookies flow automatically.
    // Using window.location keeps the UX simple (no blob fetch + URL.createObjectURL).
    window.location.href = '/api/me/export'
    // Give the browser a moment to kick off the download before re-enabling the button.
    setTimeout(() => { exportLoading.value = false }, 1500)
  } catch {
    exportLoading.value = false
  }
}
</script>

<template>
  <div class="bg-background text-foreground min-h-dvh flex flex-col">
    <LayoutSiteHeader />

    <main class="flex-1">
      <section>
        <div class="mx-auto max-w-[900px] px-6 py-14">
          <NuxtLink to="/account" class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft class="size-4" :stroke-width="2" />
            Contul meu
          </NuxtLink>

          <div class="mb-10">
            <h1 class="text-3xl md:text-4xl font-bold tracking-tight leading-tight" style="color: #000;">
              Securitate și acces
            </h1>
          </div>

          <!-- Account info -->
          <div class="rounded-2xl border border-border bg-card p-6 md:p-8 mb-6">
            <h2 class="text-lg font-semibold mb-5">Cont</h2>
            <dl class="space-y-4 text-sm">
              <div class="flex items-center justify-between">
                <dt class="text-muted-foreground flex items-center gap-2">
                  <Mail class="size-4" :stroke-width="2" />
                  Email
                </dt>
                <dd class="font-mono">{{ account?.email ?? '—' }}</dd>
              </div>
              <div class="flex items-center justify-between">
                <dt class="text-muted-foreground">Cont creat</dt>
                <dd>{{ account?.createdAt ? formatDateRO(account.createdAt) : '—' }}</dd>
              </div>
              <div class="flex items-center justify-between">
                <dt class="text-muted-foreground">Autentificare</dt>
                <dd class="text-muted-foreground">cod de 6 cifre pe email (fără parolă)</dd>
              </div>
            </dl>
          </div>

          <!-- Active sessions -->
          <div class="rounded-2xl border border-border bg-card overflow-hidden mb-6">
            <div class="px-6 py-5 border-b border-border flex items-center justify-between">
              <h2 class="text-lg font-semibold">Sesiuni active</h2>
              <Button
                variant="ghost"
                size="sm"
                class="rounded-full h-9 text-xs"
                :disabled="sessionList.length < 2"
                @click="revokeAllOpen = true"
              >
                <LogOut class="size-3.5 mr-1" :stroke-width="2" />
                Deconectează celelalte
              </Button>
            </div>
            <div v-if="sessionList.length === 0" class="px-6 py-8 text-center text-sm text-muted-foreground">
              Niciuna (ciudat — ar trebui să existe cel puțin una).
            </div>
            <div
              v-for="s in sessionList"
              :key="s.id"
              class="flex items-center gap-4 px-6 py-4 border-b border-border last:border-b-0"
            >
              <component
                :is="isMobile(s.userAgent) ? Smartphone : Monitor"
                class="size-5 text-muted-foreground shrink-0"
                :stroke-width="1.5"
              />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-sm truncate">{{ deviceLabel(s.userAgent) }}</span>
                  <span v-if="s.current" class="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-success/10 text-success">curent</span>
                </div>
                <div class="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                  <span class="font-mono">{{ s.ipAddress ?? 'IP necunoscut' }}</span>
                  <span>·</span>
                  <span>{{ formatRelativeRO(s.createdAt) }}</span>
                </div>
              </div>
              <Button
                v-if="!s.current"
                variant="ghost"
                size="sm"
                class="rounded-full h-8 text-xs"
                @click="openRevokeSession(s.id)"
              >
                Revocă
              </Button>
            </div>
          </div>

          <!-- Data export -->
          <div class="rounded-2xl border border-border bg-card p-6 md:p-8 mb-6">
            <h2 class="text-lg font-semibold mb-2">Export date (GDPR)</h2>
            <p class="text-sm text-muted-foreground mb-5 leading-relaxed">
              Descărcați un fișier JSON cu toate datele pe care le avem despre contul dvs.: portări,
              plăți, profiluri de mapare, sesiuni, jurnal de evenimente.
            </p>
            <Button variant="outline" class="rounded-full h-10" :disabled="exportLoading" @click="exportData">
              <Download class="size-4 mr-1" :stroke-width="2" />
              <span v-if="!exportLoading">Descarcă datele mele</span>
              <span v-else>Se pregătește…</span>
            </Button>
          </div>

          <!-- Danger zone -->
          <div class="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 md:p-8">
            <h2 class="text-lg font-semibold mb-2 text-destructive">Ștergere cont</h2>
            <p class="text-sm text-muted-foreground mb-5 leading-relaxed">
              Ștergem toate datele dvs. din sistemul nostru: profiluri, sesiuni, jurnal
              de portări. Facturile rămân în sistem cât cere legea (10 ani). Acțiunea este
              ireversibilă.
            </p>
            <Button variant="outline" class="rounded-full h-10 border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive" @click="deleteAccountOpen = true">
              <Trash2 class="size-4 mr-1" :stroke-width="2" />
              Șterge contul
            </Button>
          </div>
        </div>
      </section>
    </main>

    <LayoutSiteFooter />

    <LayoutConfirmDialog
      v-model:open="revokeAllOpen"
      variant="destructive"
      title="Deconectează celelalte sesiuni?"
      description="Veți rămâne conectat pe acest dispozitiv. Toate celelalte vor fi deconectate imediat."
      confirm-label="Deconectează"
      cancel-label="Anulează"
      :loading="revokeAllLoading"
      @confirm="revokeAllOthers"
    />

    <LayoutConfirmDialog
      v-model:open="revokeSessionOpen"
      variant="destructive"
      title="Revocă această sesiune?"
      description="Dispozitivul va fi deconectat imediat. Va trebui să introducă un cod nou pentru a reintra."
      confirm-label="Revocă"
      cancel-label="Anulează"
      :loading="revokeSessionLoading"
      @confirm="revokeOneSession"
    />

    <LayoutConfirmDialog
      v-model:open="deleteAccountOpen"
      variant="destructive"
      :title="`Ștergeți contul ${account?.email ?? ''}?`"
      description="Acțiunea este ireversibilă. Portările active vor continua până la livrare, dar nu veți mai putea accesa istoricul. Facturile fiscale rămân păstrate conform legii."
      confirm-label="Da, șterge definitiv"
      cancel-label="Anulează"
      :loading="deleteAccountLoading"
      @confirm="deleteAccount"
    />
  </div>
</template>
