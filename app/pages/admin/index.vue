<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { AlertTriangle, LogOut } from 'lucide-vue-next'

useHead({
  title: 'Admin — Rapidport',
  meta: [{ name: 'robots', content: 'noindex,nofollow' }],
})

// Minimal stub — real dashboard lands with the pages-admin group.
// If unauthenticated, middleware/admin-auth.ts will have already 401'd before here.

const submitting = ref(false)

function readCsrf(): string {
  if (import.meta.server) return ''
  const m = document.cookie.match(/(?:^|;\s*)rp_csrf=([^;]+)/)
  return m && m[1] ? decodeURIComponent(m[1]) : ''
}

async function logout() {
  submitting.value = true
  try {
    await $fetch('/api/admin/logout', {
      method: 'POST',
      headers: { 'x-csrf-token': readCsrf() },
    })
    await navigateTo('/admin/login')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="bg-background text-foreground min-h-dvh flex flex-col">
    <div class="fixed top-3 right-4 z-50 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 text-destructive px-3 py-1.5 text-xs font-mono uppercase tracking-wider">
      <AlertTriangle class="size-3.5" :stroke-width="2" />
      ADMIN — all actions logged
    </div>

    <main class="flex-1 px-6 py-20 max-w-5xl mx-auto w-full">
      <div class="text-sm font-mono uppercase tracking-wider text-muted-foreground mb-4">
        Admin / Home
      </div>
      <h1 class="text-4xl font-semibold tracking-tight mb-4">
        Dashboard
      </h1>
      <p class="text-muted-foreground mb-12 leading-relaxed">
        You are signed in. The full dashboard ships with the <code class="font-mono text-xs">pages-admin</code> group
        (stats, jobs, users, payments, AI usage, audit, errors, settings). This is a placeholder so the OAuth flow
        has somewhere to land.
      </p>

      <div class="flex items-center gap-3">
        <Button variant="outline" :disabled="submitting" class="h-10" @click="logout">
          <LogOut class="size-4 mr-2" :stroke-width="2" />
          <span v-if="!submitting">Sign out</span>
          <span v-else>Signing out…</span>
        </Button>
      </div>
    </main>
  </div>
</template>
