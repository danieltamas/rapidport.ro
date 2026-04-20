<script setup lang="ts">
// Admin layout. English-only per CLAUDE.md (admin is for Dani). Dark mode default.
// Responsive: desktop (md+) shows a persistent 240/64px collapsible sidebar;
// mobile shows a slide-in drawer behind a hamburger button in the topbar.
// Persistent ADMIN red banner top-right on every breakpoint.
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
  Menu,
  X,
} from 'lucide-vue-next'

// Force dark mode on <html> so shadcn portals (Dialog, tooltip) that render
// outside the layout subtree also pick up the dark palette.
useHead({
  htmlAttrs: { class: 'dark' },
  meta: [{ name: 'robots', content: 'noindex,nofollow' }],
})

const route = useRoute()

// Desktop sidebar collapse state (to 64px with icons only).
const collapsed = ref(false)
// Mobile drawer state (slide-in overlay).
const mobileOpen = ref(false)

// Close mobile drawer on route change.
watch(() => route.path, () => { mobileOpen.value = false })

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
    <!-- Desktop sidebar (md and up) -->
    <aside
      class="hidden md:flex border-r border-border bg-card flex-col transition-[width] duration-150 ease-out shrink-0"
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

    <!-- Mobile drawer overlay + panel (below md). -->
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="mobileOpen"
        class="fixed inset-0 bg-black/60 z-40 md:hidden"
        @click="mobileOpen = false"
      />
    </Transition>
    <Transition
      enter-active-class="transition-transform duration-150 ease-out"
      enter-from-class="-translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="transition-transform duration-150 ease-in"
      leave-from-class="translate-x-0"
      leave-to-class="-translate-x-full"
    >
      <aside
        v-if="mobileOpen"
        class="fixed left-0 top-0 bottom-0 w-72 max-w-[85%] bg-card border-r border-border z-50 md:hidden flex flex-col"
      >
        <div class="h-14 flex items-center justify-between border-b border-border px-4 shrink-0">
          <NuxtLink to="/admin" class="font-bold text-sm tracking-tight" @click="mobileOpen = false">
            rapidport <span class="text-muted-foreground font-normal">/ admin</span>
          </NuxtLink>
          <button
            type="button"
            class="size-8 grid place-items-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            aria-label="Close menu"
            @click="mobileOpen = false"
          >
            <X class="size-4" :stroke-width="2" />
          </button>
        </div>
        <nav class="flex-1 py-3 overflow-y-auto">
          <NuxtLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="flex items-center gap-3 px-4 py-3 text-sm transition-colors border-l-2"
            :class="
              isActive(item.to)
                ? 'bg-muted text-foreground border-primary -ml-px'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40 border-transparent -ml-px'
            "
          >
            <component :is="item.icon" class="size-4 shrink-0" :stroke-width="2" />
            <span class="truncate">{{ item.label }}</span>
          </NuxtLink>
        </nav>
        <div class="border-t border-border p-3">
          <button
            type="button"
            class="w-full flex items-center gap-3 px-2 py-3 text-sm rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 cursor-pointer transition-colors"
            :disabled="loggingOut"
            @click="logout"
          >
            <LogOut class="size-4 shrink-0" :stroke-width="2" />
            <span>{{ loggingOut ? 'Signing out…' : 'Sign out' }}</span>
          </button>
        </div>
      </aside>
    </Transition>

    <!-- Main column -->
    <div class="flex-1 flex flex-col min-w-0">
      <header class="h-14 border-b border-border bg-card flex items-center justify-between gap-2 px-3 md:px-6 shrink-0">
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <!-- Hamburger (mobile only) -->
          <button
            type="button"
            class="size-9 grid place-items-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer md:hidden shrink-0"
            aria-label="Open menu"
            @click="mobileOpen = true"
          >
            <Menu class="size-5" :stroke-width="2" />
          </button>
          <div class="text-sm text-muted-foreground font-mono truncate">
            {{ route.path }}
          </div>
        </div>
        <div
          class="flex items-center gap-2 bg-destructive/10 text-destructive border border-destructive/30 px-2 md:px-2.5 py-1 rounded text-[10px] md:text-[11px] font-medium uppercase tracking-wide shrink-0"
        >
          <span class="hidden md:inline">ADMIN — all actions logged</span>
          <span class="md:hidden">ADMIN · logged</span>
        </div>
      </header>

      <main class="flex-1 overflow-y-auto">
        <slot />
      </main>
    </div>
  </div>
</template>
