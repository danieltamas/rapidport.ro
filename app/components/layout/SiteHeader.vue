<script setup lang="ts">
import { User, LogOut } from 'lucide-vue-next'

// Fetches the current session for header auth state. Cached per-request in SSR,
// re-fetched on client navigation. Always 200; email is null when unauthenticated.
const { data: session, refresh: refreshSession } = await useFetch<{ email: string | null }>(
  '/api/auth/session',
  { key: 'session' },
)

const isLoggedIn = computed(() => Boolean(session.value?.email))
const menuOpen = ref(false)

function readCsrf(): string {
  if (import.meta.server) return ''
  const m = document.cookie.match(/(?:^|;\s*)rp_csrf=([^;]+)/)
  return m && m[1] ? decodeURIComponent(m[1]) : ''
}

async function logout() {
  try {
    await $fetch('/api/auth/session', {
      method: 'DELETE',
      headers: { 'x-csrf-token': readCsrf() },
    })
  } catch {
    // Even if the server call fails, drop the local state so the UI reflects intent.
  }
  menuOpen.value = false
  await refreshSession()
  await navigateTo('/', { external: false })
}

// Close menu on outside click
onMounted(() => {
  const handler = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (!target.closest('[data-user-menu]')) menuOpen.value = false
  }
  document.addEventListener('click', handler)
  onBeforeUnmount(() => document.removeEventListener('click', handler))
})
</script>

<template>
  <nav class="sticky top-0 z-50 bg-background/85 backdrop-blur-md border-b border-border">
    <div class="mx-auto max-w-[1280px] px-6 h-16 flex items-center justify-between">
      <div class="flex items-center gap-10">
        <a href="/" class="flex items-center gap-2 text-xl font-bold tracking-tight">
          <span class="text-primary">■</span>
          <span>Rapidport</span>
        </a>
        <div class="hidden md:flex items-center gap-7 text-[15px] text-muted-foreground">
          <a href="/#cum" class="hover:text-foreground transition-colors">Cum funcționează</a>
          <a href="/#pret" class="hover:text-foreground transition-colors">Preț</a>
          <a href="/#intrebari" class="hover:text-foreground transition-colors">Întrebări</a>
          <a href="/upload" class="hover:text-foreground transition-colors">Portează</a>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <!-- Logged-out -->
        <template v-if="!isLoggedIn">
          <a
            href="/login"
            class="hidden sm:inline-flex items-center justify-center rounded-full h-10 px-4 text-sm font-medium cursor-pointer hover:bg-accent transition-colors"
          >
            Autentificare
          </a>
          <a
            href="/upload"
            class="inline-flex items-center justify-center rounded-full h-10 px-5 text-sm font-medium cursor-pointer bg-primary text-primary-foreground shadow-sm hover:bg-[color:var(--accent-hover)] active:bg-[color:var(--accent-pressed)] transition-colors"
          >
            Începe portarea
          </a>
        </template>

        <!-- Logged-in -->
        <template v-else>
          <a
            href="/upload"
            class="hidden sm:inline-flex items-center justify-center rounded-full h-10 px-5 text-sm font-medium cursor-pointer bg-primary text-primary-foreground shadow-sm hover:bg-[color:var(--accent-hover)] active:bg-[color:var(--accent-pressed)] transition-colors"
          >
            Portare nouă
          </a>

          <div class="relative" data-user-menu>
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-full h-10 px-3 text-sm font-medium cursor-pointer hover:bg-accent transition-colors"
              :aria-expanded="menuOpen"
              @click="menuOpen = !menuOpen"
            >
              <span class="inline-flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User class="size-4" :stroke-width="2.25" />
              </span>
              <span class="hidden sm:inline max-w-[160px] truncate">{{ session?.email }}</span>
            </button>

            <div
              v-if="menuOpen"
              class="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-popover text-popover-foreground shadow-lg overflow-hidden"
            >
              <div class="px-3 py-2.5 border-b border-border">
                <div class="text-xs text-muted-foreground">Autentificat ca</div>
                <div class="text-sm font-medium truncate">{{ session?.email }}</div>
              </div>
              <NuxtLink
                to="/account"
                class="block px-3 py-2 text-sm hover:bg-accent transition-colors"
                @click="menuOpen = false"
              >
                Contul meu
              </NuxtLink>
              <NuxtLink
                to="/account/security"
                class="block px-3 py-2 text-sm hover:bg-accent transition-colors"
                @click="menuOpen = false"
              >
                Securitate
              </NuxtLink>
              <button
                type="button"
                class="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors border-t border-border cursor-pointer"
                @click="logout"
              >
                <LogOut class="size-4" :stroke-width="2" />
                Ieșire din cont
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </nav>
</template>
