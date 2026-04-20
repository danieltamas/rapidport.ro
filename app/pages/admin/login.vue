<script setup lang="ts">
// Admin login — opens Google OAuth in a popup, waits for postMessage from
// /oauth/close, navigates on success. Mirrors the working lexito.ro pattern.
// COOP set to 'same-origin-allow-popups' in nuxt.config.ts so window.opener
// survives the popup's cross-origin nav to Google.
//
// Fallback: if popup is blocked, full-redirect to /api/auth/google/start
// (the server path still supports that legacy flow when ?popup is absent).
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
    default: return errorCode.value ? 'Autentificare eșuată. Încercați din nou.' : null
  }
})

const signingIn = ref(false)
let popupRef: Window | null = null
let messageHandler: ((ev: MessageEvent) => void) | null = null
let closeWatcher: ReturnType<typeof setInterval> | null = null

function cleanup() {
  if (messageHandler) {
    window.removeEventListener('message', messageHandler)
    messageHandler = null
  }
  if (closeWatcher) {
    clearInterval(closeWatcher)
    closeWatcher = null
  }
  try { popupRef?.close() } catch { /* ignore */ }
  popupRef = null
}

function signIn() {
  if (signingIn.value) return
  errorCode.value = null

  // Open synchronously in response to the click — browsers block popups
  // opened after async code.
  const width = 500
  const height = 650
  const left = Math.max(0, Math.round(window.screen.width / 2 - width / 2))
  const top = Math.max(0, Math.round(window.screen.height / 2 - height / 2))
  const features = `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`

  const popup = window.open('/api/auth/google/start?popup=1', 'rapidport-admin-oauth', features)

  if (!popup) {
    // Popup blocked — fall back to a full-page redirect (no popup flag so
    // callback 303s back to /admin on success).
    window.location.href = '/api/auth/google/start'
    return
  }

  popupRef = popup
  popup.focus()
  signingIn.value = true

  messageHandler = async (ev: MessageEvent) => {
    // Only accept messages from our own origin.
    if (ev.origin !== window.location.origin) return
    const data = ev.data as { source?: string; type?: string; error?: string | null } | null
    if (!data || data.source !== 'rapidport-admin-oauth') return

    cleanup()
    if (data.type === 'success') {
      await navigateTo('/admin')
    } else {
      errorCode.value = data.error ?? 'unknown'
      signingIn.value = false
    }
  }
  window.addEventListener('message', messageHandler)

  // If the user manually closes the popup without the flow finishing (X'd the
  // window, or closed after a non-allowlisted Google email), nothing
  // postMessages us and the UI would sit in "Se așteaptă autentificarea…"
  // forever. Poll popup.closed; on close, give postMessage one more tick
  // to deliver, then reset.
  closeWatcher = setInterval(() => {
    if (!popup.closed) return
    clearInterval(closeWatcher!)
    closeWatcher = null
    setTimeout(() => {
      if (!signingIn.value) return // message already handled
      cleanup()
      if (!errorCode.value) errorCode.value = 'popup_closed'
      signingIn.value = false
    }, 400)
  }, 400)
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
