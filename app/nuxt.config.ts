// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: true,
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
