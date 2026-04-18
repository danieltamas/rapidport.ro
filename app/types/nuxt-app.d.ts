declare module '#app' {
  interface NuxtApp {
    $showCookiePreferences: () => void
    $showCookieConsent: () => void
    $hideCookieConsent: () => void
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $showCookiePreferences: () => void
    $showCookieConsent: () => void
    $hideCookieConsent: () => void
  }
}

export {}
