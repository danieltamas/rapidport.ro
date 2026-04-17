// https://nuxt.com/docs/api/configuration/nuxt-config

// Dev is served behind rundev's reverse proxy at https://rapidport.ro — same origin as prod.
// Nuxt itself stays plain HTTP on 3015; rundev terminates SSL.
// The security-baseline task will later move CORS + security headers into a proper middleware;
// this is the bootstrap-era config so the dev app works end-to-end through the reverse proxy.
const APP_ORIGIN = 'https://rapidport.ro'

export default defineNuxtConfig({
  ssr: true,
  css: [
    '@fontsource/inter/400.css',
    '@fontsource/inter/500.css',
    '@fontsource/inter/600.css',
    '@fontsource/jetbrains-mono/400.css',
  ],
  typescript: {
    strict: true,
    typeCheck: false,
  },
  devtools: {
    enabled: false,
  },
  devServer: {
    port: 3015,
  },
  nitro: {
    experimental: {
      websocket: true,
    },
    // CORS for /api/**. Dev allows the rapidport.ro reverse-proxy origin + localhost;
    // prod locks to the canonical origin. Credentials: true so cookies flow through.
    routeRules: {
      '/api/**': {
        cors: true,
        headers: {
          'Access-Control-Allow-Origin': APP_ORIGIN,
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-CSRF-Token,X-Job-Token',
        },
      },
    },
  },
  // Vite dev-server config: accept the rapidport.ro Host header from the reverse proxy.
  // HMR is left at Vite defaults — if HMR doesn't reconnect through the proxy we can opt in
  // to wss/clientPort=443 once we know the proxy's exact WebSocket handling.
  vite: {
    server: {
      allowedHosts: ['rapidport.ro', 'localhost', '127.0.0.1'],
    },
  },
  compatibilityDate: '2025-01-01',
})
