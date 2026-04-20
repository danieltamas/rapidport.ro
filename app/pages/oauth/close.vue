<script setup lang="ts">
// Popup's final stop after the OAuth callback. postMessage's the opener with
// status + optional error code, then closes. COOP is 'same-origin-allow-popups'
// globally (nuxt.config.ts), so window.opener remains accessible here even
// after the popup visited accounts.google.com mid-flow.
//
// Query: ?status=ok|error[&code=...]
useHead({
  title: 'Signing in…',
  meta: [{ name: 'robots', content: 'noindex,nofollow' }],
})
definePageMeta({ layout: false })

const route = useRoute()
const status = (route.query.status as string | undefined) === 'ok' ? 'ok' : 'error'
const code = (route.query.code as string | undefined) ?? null

onMounted(() => {
  const payload = {
    source: 'rapidport-admin-oauth',
    type: status === 'ok' ? 'success' : 'error',
    error: status === 'error' ? code : null,
  }
  try {
    if (window.opener) {
      window.opener.postMessage(payload, window.location.origin)
    }
  } catch { /* ignore */ }
  // Close after a short delay so the message is delivered before teardown.
  setTimeout(() => { try { window.close() } catch { /* noop */ } }, 100)
})
</script>

<template>
  <div style="font-family: system-ui, -apple-system, sans-serif; padding: 32px; color: #525252;">
    <p>You can close this window.</p>
  </div>
</template>
