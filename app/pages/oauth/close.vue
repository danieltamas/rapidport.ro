<script setup lang="ts">
// Minimal page the OAuth callback redirects the popup to. The only job is to
// close the window. Using a real Nuxt page (instead of raw HTML from the API)
// means the CSP nonce is applied automatically — no inline-script blocking.
//
// We don't need to message the opener here: the parent page polls
// /api/auth/admin-session, so it sees the session cookie land without relying
// on window.opener (COOP would kill that anyway once the popup has visited
// accounts.google.com).
useHead({
  title: 'Signing in…',
  meta: [{ name: 'robots', content: 'noindex,nofollow' }],
})
definePageMeta({ layout: false })

onMounted(() => {
  // Give the parent's next poll tick a moment to observe the new cookie before
  // the window disappears, then close. If window.close() is refused by the
  // browser, the fallback text stays visible and the user can close manually.
  setTimeout(() => {
    try { window.close() } catch { /* noop */ }
  }, 150)
})
</script>

<template>
  <div style="font-family: system-ui, -apple-system, sans-serif; padding: 32px; color: #525252;">
    <p>You can close this window.</p>
  </div>
</template>
