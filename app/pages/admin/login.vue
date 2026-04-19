<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { LogIn, AlertTriangle } from 'lucide-vue-next'

useHead({
  title: 'Admin — Rapidport',
  meta: [{ name: 'robots', content: 'noindex,nofollow' }],
})

const route = useRoute()
const errorCode = computed(() => route.query.error as string | undefined)
const errorMsg = computed(() => {
  switch (errorCode.value) {
    case 'oauth_declined': return 'Autentificarea Google a fost anulată.'
    case 'oauth_state_invalid': return 'Sesiunea de autentificare a expirat. Încercați din nou.'
    case 'oauth_not_allowlisted': return 'Adresa nu este în lista de administratori.'
    default: return errorCode.value ? 'Autentificare eșuată. Încercați din nou.' : null
  }
})
</script>

<template>
  <div class="bg-background text-foreground min-h-dvh flex flex-col">
    <!-- Admin red reminder banner top-right -->
    <div class="fixed top-3 right-4 z-50 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 text-destructive px-3 py-1.5 text-xs font-mono uppercase tracking-wider">
      <AlertTriangle class="size-3.5" :stroke-width="2" />
      ADMIN — all actions logged
    </div>

    <main class="flex-1 flex items-center justify-center px-6 py-24">
      <div class="w-full max-w-sm">
        <div class="text-sm font-mono uppercase tracking-wider text-muted-foreground mb-4">
          Admin
        </div>
        <h1 class="text-3xl font-semibold tracking-tight mb-6">
          Sign in
        </h1>
        <p class="text-sm text-muted-foreground mb-10 leading-relaxed">
          Admin access is restricted to the allowlist in <code class="font-mono text-xs">ADMIN_EMAILS</code>.
          Every action is recorded to the admin audit log.
        </p>

        <Button as="a" href="/api/auth/google/start" class="w-full h-12 text-base font-medium">
          <LogIn class="size-4 mr-2" :stroke-width="2" />
          Sign in with Google
        </Button>

        <p v-if="errorMsg" class="mt-6 text-sm text-destructive" role="alert">
          {{ errorMsg }}
        </p>
      </div>
    </main>
  </div>
</template>
