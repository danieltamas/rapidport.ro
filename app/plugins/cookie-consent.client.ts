import * as CookieConsent from 'vanilla-cookieconsent'
import 'vanilla-cookieconsent/dist/cookieconsent.css'

// Rapidport cookie consent — GDPR compliant, Romanian-first, minimal scope.
// Only one strict-necessary cookie in v1 (CSRF token); no analytics/tracking/ads.
// Styled to match the site's light-default theme + signature red accent.

export default defineNuxtPlugin(() => {
  CookieConsent.run({
    guiOptions: {
      consentModal: {
        layout: 'box inline',
        position: 'bottom right',
      },
      preferencesModal: {
        layout: 'box',
      },
    },

    categories: {
      necessary: {
        enabled: true,
        readOnly: true,
      },
    },

    language: {
      default: 'ro',
      translations: {
        ro: {
          consentModal: {
            title: 'Cookie-uri',
            description:
              'Folosim un singur cookie strict necesar (CSRF) pentru protecția formularelor. Nu folosim cookie-uri de tracking, analiză sau publicitate.',
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
                        'Token de acces pentru o portare activă — permite accesul la raport și descărcare fără cont.',
                      expiration: '30 zile',
                    },
                  ],
                },
              },
              {
                title: 'Mai multe informații',
                description:
                  'Nu folosim cookie-uri de tracking, analiză sau publicitate. Pentru întrebări, scrieți la <a href="mailto:support@rapidport.ro">support@rapidport.ro</a>.',
              },
            ],
          },
        },
      },
    },
  })
})
