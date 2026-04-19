// Global Nitro middleware: sets security response headers on every response.
// Spec: SPEC.md §S.1 "Transport & Headers".
//
// CSP posture:
//   - Development: CSP is DISABLED. Nuxt/Vite emit inline bootstrap scripts and
//     HMR styles; the strict CSP would block them and the app would not hydrate.
//     All other security headers still apply.
//   - Production: the strict CSP below is applied. NOTE: Nuxt SSR also emits an
//     inline __NUXT__ payload <script> in prod, which this CSP blocks. Before
//     going live we MUST add nonce machinery (per-request nonce threaded into
//     the CSP header AND into the emitted script/style tags). Options: nuxt-security
//     module, or a manual Nitro render hook. Tracked as a Phase 2 pre-gate item.

const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' https://js.stripe.com https://accounts.google.com",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.stripe.com https://accounts.google.com",
  "frame-src https://js.stripe.com https://accounts.google.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

const permissionsPolicy =
  'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")'

const isDev = process.env.NODE_ENV !== 'production'

export default defineEventHandler((event) => {
  setResponseHeader(
    event,
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload',
  )
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  setResponseHeader(event, 'X-Frame-Options', 'DENY')
  setResponseHeader(event, 'Referrer-Policy', 'strict-origin-when-cross-origin')
  setResponseHeader(event, 'Permissions-Policy', permissionsPolicy)
  if (!isDev) {
    setResponseHeader(event, 'Content-Security-Policy', cspDirectives)
  }
})
