<script setup lang="ts">
useHead({
  title: 'Politica de confidențialitate — Rapidport',
  meta: [{ name: 'description', content: 'Cum prelucrăm datele dvs. cu caracter personal.' }],
  htmlAttrs: { lang: 'ro' },
})

const { $cookieConsent } = useNuxtApp()

function openCookiePrefs(event: Event) {
  event.preventDefault()
  $cookieConsent?.showPreferences?.()
}
</script>

<template>
  <LayoutLegalPage
    title="Politica de confidențialitate"
    subtitle="Cum prelucrăm datele dvs. cu caracter personal, conform GDPR."
    last-updated="17 aprilie 2026"
  >
    <h2>1. Operatorul de date</h2>
    <p>
      <strong>Gamerina SRL</strong>, CUI <code>RO43020532</code>, Str. Cometei 2/4,
      400493, Cluj-Napoca, România. Contact:
      <a href="mailto:support@rapidport.ro">support@rapidport.ro</a>.
    </p>

    <h2>2. Ce date colectăm</h2>
    <p>
      Colectăm strict minimul necesar pentru a opera serviciul:
    </p>
    <ul>
      <li><strong>Adresa de email</strong> — pentru autentificare prin magic link, trimitere facturi și link-uri de descărcare</li>
      <li><strong>Date de facturare</strong> — CUI, denumire firmă, adresă — colectate doar la plata</li>
      <li><strong>Adresa IP</strong> — hash-uită, folosită pentru rate-limiting și protecție CSRF; nu se stochează în clar</li>
      <li><strong>Conținutul arhivelor WinMentor</strong> — procesat temporar, șters automat după 30 de zile</li>
    </ul>

    <h2>3. Ce NU facem cu datele</h2>
    <ul>
      <li>Nu trimitem emailuri de marketing decât dacă vă abonați explicit</li>
      <li>Nu vindem și nu partajăm date cu terți (exceptând procesatorii tehnici necesari — Stripe, SmartBill, Resend, Anthropic)</li>
      <li>Nu folosim cookie-uri de tracking, analiză sau publicitate</li>
      <li>Nu stocăm permanent conținutul fișierelor — doar metadate necesare funcționării</li>
    </ul>

    <h2>4. Temeiul legal</h2>
    <ul>
      <li><strong>Executarea contractului</strong> — pentru procesarea arhivei și livrarea serviciului</li>
      <li><strong>Obligație legală</strong> — pentru facturare și raportare fiscală către ANAF</li>
      <li><strong>Interes legitim</strong> — pentru securitatea aplicației și prevenirea abuzurilor</li>
    </ul>

    <h2>5. Cât timp păstrăm datele</h2>
    <ul>
      <li>Arhivele și fișierele generate — <strong>30 de zile</strong>, apoi șterse automat</li>
      <li>Conturile de utilizator — până la ștergere la cerere</li>
      <li>Facturile fiscale — <strong>10 ani</strong>, conform legislației române</li>
      <li>Jurnalele de audit — 2 ani, anonimizate după ștergerea contului</li>
    </ul>

    <h2>6. Subprocesatori</h2>
    <p>
      Folosim următorii procesatori tehnici:
    </p>
    <ul>
      <li><strong>Stripe Payments Europe, Ltd.</strong> — procesare plăți cu cardul</li>
      <li><strong>SmartBill / Intelligent IT SRL</strong> — emitere facturi fiscale și transmitere eFactura</li>
      <li><strong>Resend Inc.</strong> — trimitere emailuri tranzacționale</li>
      <li><strong>Anthropic PBC</strong> — analiză AI a câmpurilor necunoscute (fără date cu caracter personal transmise)</li>
      <li><strong>Hetzner Online GmbH</strong> — găzduire servere, centre de date în UE</li>
    </ul>

    <h2>7. Drepturile dvs. conform GDPR</h2>
    <ul>
      <li><strong>Acces</strong> — puteți solicita o copie a datelor pe care le deținem despre dvs.</li>
      <li><strong>Rectificare</strong> — puteți cere corectarea datelor incorecte</li>
      <li><strong>Ștergere</strong> — puteți cere ștergerea contului și a datelor asociate (exceptând facturile cu obligație fiscală de păstrare)</li>
      <li><strong>Portabilitate</strong> — export JSON al datelor dvs. la cerere</li>
      <li><strong>Opoziție</strong> — la prelucrări bazate pe interes legitim</li>
      <li><strong>Reclamație</strong> — la Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (<a href="https://www.dataprotection.ro">dataprotection.ro</a>)</li>
    </ul>
    <p>
      Solicitările se trimit la <a href="mailto:support@rapidport.ro">support@rapidport.ro</a>
      și le procesăm în maximum 30 de zile.
    </p>

    <h2>8. Securitatea datelor</h2>
    <ul>
      <li>HTTPS obligatoriu pe toate conexiunile, cu HSTS preload</li>
      <li>Conexiuni la baza de date criptate SSL</li>
      <li>Parolele nu se folosesc — autentificare prin magic link cu tokene valabile 15 minute</li>
      <li>Containerele de procesare rulează fără privilegii, cu memorie și CPU limitate</li>
      <li>Rate-limiting pentru prevenirea abuzurilor</li>
    </ul>

    <h2>9. Cookie-uri</h2>
    <p>
      Folosim un singur cookie strict necesar (<code>csrf-token</code>) pentru protecția
      formularelor, și un token de acces temporar (<code>job_access_*</code>) pentru a vă
      permite accesul la o portare activă fără cont. Detalii la
      <a href="#" @click="openCookiePrefs">Preferințe cookie-uri</a>.
    </p>
  </LayoutLegalPage>
</template>
