<script setup lang="ts">
// Admin login — opens Google OAuth in a popup, polls /api/auth/admin-session
// for the cookie to land, then navigates to /admin. We deliberately DO NOT
// use postMessage/window.opener — nuxt-security's COOP severs the opener
// reference when the popup visits accounts.google.com, which makes any
// postMessage-based handshake silently drop.
import { Button } from '~/components/ui/button'
import { LogIn, Loader2 } from 'lucide-vue-next'

useHead({
  title: 'Admin — Rapidport',
  meta: [{ name: 'robots', content: 'noindex,nofollow' }],
})

const route = useRoute()
const initialError = (route.query.error as string | undefined) ?? null
const errorCode = ref<string | null>(initialError)
const errorMsg = computed(() => {
  switch (errorCode.value) {
    case 'oauth_declined': return 'Autentificarea a fost anulată.'
    case 'oauth_state_invalid':
    case 'oauth_state_expired': return 'Sesiunea de autentificare a expirat. Încercați din nou.'
    case 'oauth_not_allowlisted': return 'Contul Google nu este autorizat pentru acces admin.'
    case 'oauth_email_not_verified': return 'Adresa de email nu este verificată la Google.'
    case 'popup_blocked': return 'Popup-ul a fost blocat de browser. Activați popup-urile pentru această pagină sau încercați din nou.'
    case 'popup_closed': return 'Fereastra de autentificare a fost închisă înainte de finalizare.'
    case 'popup_timeout': return 'Autentificarea a durat prea mult. Încercați din nou.'
    default: return errorCode.value ? 'Autentificare eșuată. Încercați din nou.' : null
  }
})

const signingIn = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null
let closeWatcher: ReturnType<typeof setInterval> | null = null
let timeoutTimer: ReturnType<typeof setTimeout> | null = null

function cleanup() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  if (closeWatcher) { clearInterval(closeWatcher); closeWatcher = null }
  if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null }
}

async function checkSession(): Promise<boolean> {
  try {
    const res = await $fetch<{ authed: boolean; email?: string }>('/api/auth/admin-session')
    return res.authed === true
  } catch {
    return false
  }
}

async function signIn() {
  if (signingIn.value) return
  signingIn.value = true
  errorCode.value = null
  cleanup()

  const w = 500
  const h = 620
  const left = Math.max(0, window.screenX + Math.round((window.outerWidth - w) / 2))
  const top = Math.max(0, window.screenY + Math.round((window.outerHeight - h) / 2))

  const popupRef = window.open(
    '/api/auth/google/start?popup=1',
    'rapidport-admin-oauth',
    `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`,
  )

  if (!popupRef) {
    signingIn.value = false
    errorCode.value = 'popup_blocked'
    return
  }
  const popup: Window = popupRef

  let authed = false

  async function finishSuccess() {
    if (authed) return
    authed = true
    cleanup()
    try { popup.close() } catch { /* already closed */ }
    await navigateTo('/admin')
  }

  // Poll session every 750ms. Cookie lands when callback.get.ts runs successfully.
  pollTimer = setInterval(async () => {
    if (await checkSession()) await finishSuccess()
  }, 750)

  // Watch for user closing the popup manually. Short delay after a close to
  // give the final poll tick one more chance (the callback sets the cookie
  // just before redirecting to /oauth/close which then window.close()s).
  closeWatcher = setInterval(() => {
    if (!popup.closed) return
    // Popup is gone — one final session check to catch races.
    setTimeout(async () => {
      if (authed) return
      if (await checkSession()) {
        await finishSuccess()
        return
      }
      cleanup()
      if (!errorCode.value) errorCode.value = 'popup_closed'
      signingIn.value = false
    }, 300)
  }, 500)

  // Hard timeout — 3 minutes — so we don't poll forever if the user walks away.
  timeoutTimer = setTimeout(async () => {
    if (authed) return
    cleanup()
    try { popup.close() } catch { /* noop */ }
    if (!errorCode.value) errorCode.value = 'popup_timeout'
    signingIn.value = false
  }, 3 * 60 * 1000)
}

onBeforeUnmount(cleanup)
</script>

<template>
  <div class="bg-background text-foreground min-h-dvh flex flex-col">
    <LayoutSiteHeader />

    <main class="flex-1 flex items-center justify-center px-6 py-16">
      <div class="w-full max-w-sm">
        <h1 class="text-3xl font-semibold tracking-tight mb-3">
          Autentificare admin
        </h1>
        <p class="text-sm text-muted-foreground mb-10 leading-relaxed">
          Continuați cu contul Google autorizat.
        </p>

        <Button
          class="w-full h-12 text-base font-medium"
          :disabled="signingIn"
          @click="signIn"
        >
          <Loader2 v-if="signingIn" class="size-4 mr-2 animate-spin" :stroke-width="2" />
          <LogIn v-else class="size-4 mr-2" :stroke-width="2" />
          {{ signingIn ? 'Se așteaptă autentificarea…' : 'Continuă cu Google' }}
        </Button>

        <p v-if="errorMsg" class="mt-6 text-sm text-destructive" role="alert">
          {{ errorMsg }}
        </p>
      </div>
    </main>

    <LayoutSiteFooter />
  </div>
</template>
