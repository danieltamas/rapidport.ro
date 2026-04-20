<script setup lang="ts">
// Popup's final stop after the OAuth callback. Signals the parent via
// BroadcastChannel (same-origin IPC — not blocked by COOP, not blocked by
// CSP since this is a real Nuxt page) and closes itself.
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
  // Broadcast first, then close. Named channel shared with admin/login.vue.
  try {
    const ch = new BroadcastChannel('rapidport-admin-oauth')
    ch.postMessage({ source: 'rapidport-admin-oauth', status, code })
    ch.close()
  } catch {
    // BroadcastChannel not supported (very old browser) — parent's session
    // poll will still eventually catch up on success. Error cases in unsupported
    // browsers just surface as 'popup_closed'.
  }
  // Small delay so the browser has committed the session cookie before the
  // parent's follow-up fetch runs (subtle timing on some engines).
  setTimeout(() => {
    try { window.close() } catch { /* refused by browser */ }
  }, 120)
})
</script>

<template>
  <div style="font-family: system-ui, -apple-system, sans-serif; padding: 32px; color: #525252;">
    <p>You can close this window.</p>
  </div>
</template>
