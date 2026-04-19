// Global Nitro middleware: sets security response headers on every response.
// Spec: SPEC.md §S.1 "Transport & Headers". CSP forbids inline and eval scripts.

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
  setResponseHeader(event, 'Content-Security-Policy', cspDirectives)
})
