<script setup lang="ts">
// Admin layout. English-only per CLAUDE.md (admin is for Dani). Dark mode default.
// Sidebar 240px collapsible to 64px. Persistent ADMIN red banner top-right.
// Per SPEC §"UI Design System": dense, monospace for IDs, no emoji in chrome.
import {
  LayoutDashboard,
  Briefcase,
  CreditCard,
  Users,
  Cpu,
  FolderOpen,
  ClipboardList,
  KeyRound,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-vue-next'

const route = useRoute()
const collapsed = ref(false)

// Force dark mode on <html> while mounted under this layout. Putting `class="dark"`
// on the layout root alone was unreliable — some shadcn primitives (Dialog portals,
// tooltips) render outside the layout's DOM subtree, so they'd pick up the light
// :root palette and look off. Scoping to <html> fixes both.
useHead({
  htmlAttrs: { class: 'dark' },
  meta: [{ name: 'robots', content: 'noindex,nofollow' }],
})

const nav = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard },
  { to: '/admin/jobs', label: 'Jobs', icon: Briefcase },
  { to: '/admin/payments', label: 'Payments', icon: CreditCard },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/ai', label: 'AI Usage', icon: Cpu },
  { to: '/admin/profiles', label: 'Profiles', icon: FolderOpen },
  { to: '/admin/audit', label: 'Audit', icon: ClipboardList },
  { to: '/admin/sessions', label: 'Sessions', icon: KeyRound },
] as const

const isActive = (to: string) =>
  to === '/admin' ? route.path === '/admin' : route.path.startsWith(to)

function readCsrf(): string {
  if (import.meta.server) return ''
  const m = document.cookie.match(/(?:^|;\s*)rp_csrf=([^;]+)/)
  return m && m[1] ? decodeURIComponent(m[1]) : ''
}

const loggingOut = ref(false)
async function logout() {
  if (loggingOut.value) return
  loggingOut.value = true
  try {
    await $fetch('/api/admin/logout', {
      method: 'POST',
      headers: { 'x-csrf-token': readCsrf() },
    })
  } finally {
    await navigateTo('/admin/login')
  }
}
</script>

<template>
  <div class="min-h-dvh bg-background text-foreground flex">
    <!-- Sidebar -->
    <aside
      class="border-r border-border bg-card flex flex-col transition-[width] duration-150 ease-out"
      :class="collapsed ? 'w-16' : 'w-60'"
    >
      <div
        class="h-14 flex items-center border-b border-border px-4 shrink-0"
        :class="collapsed ? 'justify-center' : 'justify-between'"
      >
        <NuxtLink v-if="!collapsed" to="/admin" class="font-bold text-sm tracking-tight">
          rapidport <span class="text-muted-foreground font-normal">/ admin</span>
        </NuxtLink>
        <button
          type="button"
          class="size-7 grid place-items-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
          @click="collapsed = !collapsed"
        >
          <ChevronRight v-if="collapsed" class="size-4" :stroke-width="2" />
          <ChevronLeft v-else class="size-4" :stroke-width="2" />
        </button>
      </div>

      <nav class="flex-1 py-3 overflow-y-auto">
        <NuxtLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-3 px-4 py-2 text-sm transition-colors"
          :class="[
            isActive(item.to)
              ? 'bg-muted text-foreground border-l-2 border-primary -ml-px'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/40 border-l-2 border-transparent -ml-px',
            collapsed ? 'justify-center px-0' : '',
          ]"
        >
          <component :is="item.icon" class="size-4 shrink-0" :stroke-width="2" />
          <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
        </NuxtLink>
      </nav>

      <div class="border-t border-border p-3">
        <button
          type="button"
          class="w-full flex items-center gap-3 px-2 py-2 text-sm rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 cursor-pointer transition-colors"
          :class="collapsed ? 'justify-center' : ''"
          :disabled="loggingOut"
          @click="logout"
        >
          <LogOut class="size-4 shrink-0" :stroke-width="2" />
          <span v-if="!collapsed">{{ loggingOut ? 'Signing out…' : 'Sign out' }}</span>
        </button>
      </div>
    </aside>

    <!-- Main column -->
    <div class="flex-1 flex flex-col min-w-0">
      <header class="h-14 border-b border-border bg-card flex items-center justify-between px-6 shrink-0">
        <div class="text-sm text-muted-foreground font-mono truncate">
          {{ route.path }}
        </div>
        <div
          class="flex items-center gap-2 bg-destructive/10 text-destructive border border-destructive/30 px-2.5 py-1 rounded text-[11px] font-medium uppercase tracking-wide"
        >
          ADMIN — all actions logged
        </div>
      </header>

      <main class="flex-1 overflow-y-auto">
        <slot />
      </main>
    </div>
  </div>
</template>
