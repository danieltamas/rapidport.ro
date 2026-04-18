import * as CookieConsent from 'vanilla-cookieconsent'
import 'vanilla-cookieconsent/dist/cookieconsent.css'

// Rapidport cookie consent — GDPR compliant, Romanian-first, minimal scope.
// Only strict-necessary cookies in v1 (csrf-token, job_access_*); no analytics/tracking/ads.
// Themed light-default + signature red accent via tailwind.css override.

export default defineNuxtPlugin(() => {
  CookieConsent.run({
    guiOptions: {
      consentModal: { layout: 'box inline', position: 'bottom right' },
      preferencesModal: { layout: 'box' },
    },
    categories: {
      necessary: { enabled: true, readOnly: true },
    },
    language: {
      default: 'ro',
      translations: {
        ro: {
          consentModal: {
            title: 'Cookie-uri',
            description:
              'Folosim doar cookie-uri strict necesare (CSRF + token de acces la portarea activă). Nu folosim tracking, analiză sau publicitate.',
            acceptAllBtn: 'Am înțeles',
            showPreferencesBtn: 'Detalii',
            footer:
              '<a href="/legal/privacy">Politica de confidențialitate</a> · <a href="/legal/terms">Termeni și condiții</a>',
          },
          preferencesModal: {
            title: 'Preferințe cookie-uri',
            acceptAllBtn: 'Am înțeles',
            savePreferencesBtn: 'Salvează preferințele',
            closeIconLabel: 'Închide',
            sections: [
              {
                title: 'Cookie-uri strict necesare',
                description:
                  'Aceste cookie-uri sunt esențiale pentru funcționarea aplicației și nu pot fi dezactivate.',
                linkedCategory: 'necessary',
                cookieTable: {
                  headers: {
                    name: 'Nume',
                    domain: 'Domeniu',
                    description: 'Descriere',
                    expiration: 'Expirare',
                  },
                  body: [
                    {
                      name: 'csrf-token',
                      domain: 'rapidport.ro',
                      description:
                        'Protejează formularele împotriva atacurilor CSRF (Cross-Site Request Forgery).',
                      expiration: 'Sesiune',
                    },
                    {
                      name: 'job_access_*',
                      domain: 'rapidport.ro',
                      description:
                        'Token de acces la o portare activă — permite accesul la raport și descărcare fără cont.',
                      expiration: '30 zile',
                    },
                  ],
                },
              },
              {
                title: 'Mai multe informații',
                description:
                  'Nu folosim cookie-uri de tracking, analiză sau publicitate. Întrebări: <a href="mailto:support@rapidport.ro">support@rapidport.ro</a>.',
              },
            ],
          },
        },
      },
    },
  })

  // Expose individual methods as Nuxt provide helpers for components.
  // Providing the whole module namespace occasionally gets stripped by
  // bundler/tree-shake; concrete function handles are robust.
  return {
    provide: {
      showCookiePreferences: () => CookieConsent.showPreferences(),
      showCookieConsent: () => CookieConsent.show(true),
      hideCookieConsent: () => CookieConsent.hide(),
    },
  }
})
