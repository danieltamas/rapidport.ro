// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite'

// Dev is served behind rundev's reverse proxy at https://rapidport.ro — same origin as prod.
// Nuxt itself stays plain HTTP on 3015; rundev terminates SSL.
// The security-baseline task will later move CORS + security headers into a proper middleware;
// this is the bootstrap-era config so the dev app works end-to-end through the reverse proxy.
const APP_ORIGIN = 'https://rapidport.ro'

export default defineNuxtConfig({
  ssr: true,
  telemetry: false,

  modules: ['shadcn-nuxt', 'nuxt-security'],

  shadcn: {
    prefix: '',
    componentDir: './components/ui',
  },

  // Opt into Nuxt 4 defaults now — new project, no legacy to break.
  // srcDir stays '.' because our source files live at the project root (pages/, server/, theme/
  // alongside nuxt.config.ts), not in the Nuxt-4-default app/ subfolder.
  future: {
    compatibilityVersion: 4,
  },
  srcDir: '.',

  debug: process.env.NODE_ENV === 'development',

  // Dev memory footprint controls — parity with the wam.3.0 / wam.4.0 configs.
  // Before these, this project's `nuxt dev` sat at ~1 GB RSS while other Nuxt
  // projects on the same machine ran at ~300–400 MB. Each setting below targets
  // a specific retention source:
  //  - sourcemap: false  → sourcemaps are held in memory per source module; HMR
  //                        round-trips compound it. Biggest single win.
  //  - experimental.watcher: 'chokidar' → the default `parcel` watcher on macOS
  //                        allocates per-file FS handles + kernel event queues
  //                        that balloon with a big node_modules tree.
  //  - experimental.appManifest: false → removes one more watcher + a build-time
  //                        manifest that's useless for a non-PWA app.
  sourcemap: false,
  experimental: {
    watcher: 'chokidar',
    appManifest: false,
  },

  app: {
    head: {
      htmlAttrs: {
        lang: 'ro',
      },
    },
  },

  css: [
    '~/assets/css/tailwind.css',
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
    // Force IPv4 — Node 22 + macOS resolves "localhost" IPv6-first by default,
    // binding the socket to ::1 only. rundev (and most local proxies) dial 127.0.0.1,
    // which then fails to connect. Explicit 127.0.0.1 makes the socket IPv4-only and
    // reachable from any local proxy or client that assumes IPv4.
    host: '127.0.0.1',
    port: 3015,
  },
  nitro: {
    // Explicit deploy target — matches SPEC §"Architecture Overview" Docker setup.
    preset: 'node-server',
    // Smaller prod bundles; zero dev cost.
    compressPublicAssets: {
      gzip: true,
      brotli: true,
    },
    experimental: {
      websocket: true,
    },
    // Skip Nitro's auto-regenerated tsconfig — every dev restart rewrote it,
    // which churned the TS server cache. Our own tsconfig extends .nuxt/tsconfig
    // so this is safe.
    typescript: { generateTsConfig: false },
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
    plugins: [tailwindcss()],
    server: {
      // Leading dot = wildcard for the subdomain. `.trycloudflare.com` lets ad-hoc
      // `cloudflared tunnel --url http://localhost:3015` shares with the team work
      // without re-editing this file every time the random subdomain rotates.
      allowedHosts: ['rapidport.ro', 'localhost', '127.0.0.1', '.trycloudflare.com'],
    },
  },
  compatibilityDate: '2025-10-15',

  // nuxt-security owns CSP + headers (replaces the hand-rolled
  // server/middleware/security-headers.ts). Nonces are injected into SSR inline
  // scripts/styles so the strict CSP works with Nuxt/Vite payloads.
  //
  // Our own middleware stays: csrf.ts (double-submit cookie) + rate-limit.ts
  // (table-backed per SPEC §S.10). nuxt-security's rateLimiter/csrf are off
  // because we already implement them with our chosen semantics.
  security: {
    nonce: true,
    sri: true,
    rateLimiter: false,
    csrf: false,
    corsHandler: false, // Nitro routeRules above handle CORS for /api/**
    strict: false,
    hidePoweredBy: true,
    removeLoggers: process.env.NODE_ENV === 'production',
    ssg: {
      hashScripts: true,
      hashStyles: process.env.NODE_ENV === 'production',
      nitroHeaders: true,
      exportToPresets: true,
    },
    headers: {
      crossOriginResourcePolicy: 'cross-origin',
      // COEP require-corp would block cross-origin resources (Google OAuth,
      // Stripe) that don't send their own CORP — disable.
      crossOriginEmbedderPolicy: false,
      // COOP must be 'unsafe-none' for the admin OAuth popup flow to work.
      // Rationale: 'same-origin-allow-popups' only retains the opener when the
      // popup sets COOP to 'unsafe-none' — popups that inherit our OWN COOP
      // (same-origin-allow-popups) still get their opener severed, which was
      // producing "window.closed blocked by COOP" in the browser console and
      // breaking window.opener.postMessage from /oauth/close. Lexito works
      // because its gateway doesn't set COOP at all. Setting 'unsafe-none'
      // globally is equivalent for our purposes — we already rely on SameSite
      // cookies + CSRF tokens + CSP rather than COOP for cross-context isolation.
      crossOriginOpenerPolicy: 'unsafe-none',
      referrerPolicy: 'strict-origin-when-cross-origin',
      contentSecurityPolicy: {
        'base-uri': ["'self'"],
        'object-src': ["'none'"],
        'script-src-attr': ["'none'"],
        'script-src': [
          "'self'",
          "'strict-dynamic'",
          "'nonce-{{nonce}}'",
          'https://js.stripe.com',
          'https://accounts.google.com',
        ],
        'style-src': ["'self'", "'nonce-{{nonce}}'", 'https:'],
        'style-src-elem': ["'self'", "'nonce-{{nonce}}'", 'https:'],
        // Inline style attributes on elements (Vue sometimes emits these).
        'style-src-attr': ["'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'connect-src': [
          "'self'",
          'https://api.stripe.com',
          'https://accounts.google.com',
        ],
        'font-src': ["'self'", 'data:'],
        'frame-src': ['https://js.stripe.com', 'https://accounts.google.com'],
        'frame-ancestors': ["'none'"],
        'form-action': ["'self'"],
        'upgrade-insecure-requests': true,
      },
      permissionsPolicy: {
        camera: [],
        microphone: [],
        geolocation: [],
        payment: ['self', '"https://js.stripe.com"'],
      },
      strictTransportSecurity: {
        maxAge: 31536000,
        includeSubdomains: true,
        preload: true,
      },
    },
  },
})
