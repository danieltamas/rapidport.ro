import type * as CookieConsentType from 'vanilla-cookieconsent'

declare module '#app' {
  interface NuxtApp {
    $cookieConsent: typeof CookieConsentType
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $cookieConsent: typeof CookieConsentType
  }
}

export {}
