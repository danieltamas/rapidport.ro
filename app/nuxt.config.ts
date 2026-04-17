// https://nuxt.com/docs/api/configuration/nuxt-config
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
  },
  compatibilityDate: '2025-01-01',
})
