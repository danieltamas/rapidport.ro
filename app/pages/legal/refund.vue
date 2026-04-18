<script setup lang="ts">
useHead({
  title: 'Politica de refund — Rapidport',
  meta: [{ name: 'description', content: 'Când și cum se acordă refund pentru portări Rapidport.' }],
  htmlAttrs: { lang: 'ro' },
})
</script>

<template>
  <LayoutLegalPage
    title="Politica de refund"
    subtitle="Când și cum vă returnăm banii, simplu și direct."
    last-updated="17 aprilie 2026"
  >
    <h2>Pe scurt</h2>
    <p>
      Dacă fișierele generate nu trec importul în SAGA și nu putem ajusta conversia în
      <strong>30 de zile</strong> de la plată, vă returnăm <strong>integral</strong> suma
      plătită.
    </p>

    <h2>Când primiți refund integral</h2>
    <ul>
      <li>SAGA respinge fișierele generate și nu putem identifica o soluție în 30 de zile</li>
      <li>Descoperim o eroare tehnică de partea noastră care împiedică finalizarea portării</li>
      <li>Arhiva nu poate fi procesată din cauza unui bug al Rapidport (nu din cauza arhivei corupte)</li>
    </ul>

    <h2>Când NU primiți refund</h2>
    <ul>
      <li>Arhiva WinMentor este coruptă sau incompletă</li>
      <li>Versiunea WinMentor nu este suportată și ați fost avertizat în etapa de validare</li>
      <li>Ați pornit portarea cu date incorecte și ați descărcat fișierele (sunteți deja în posesia lor)</li>
      <li>Sincronizări delta deja efectuate (nu sunt refundabile separat de portarea de bază)</li>
    </ul>

    <h2>Cum cereți refund</h2>
    <p>
      Trimiteți un email la <a href="mailto:support@rapidport.ro">support@rapidport.ro</a>
      cu:
    </p>
    <ul>
      <li>ID-ul portării (îl găsiți în email-ul de confirmare)</li>
      <li>Factura fiscală (numărul și data)</li>
      <li>O descriere scurtă a problemei</li>
    </ul>
    <p>
      Răspundem în 2 zile lucrătoare. Dacă refund-ul este aprobat, primiți:
    </p>
    <ul>
      <li>Returnarea sumei pe cardul bancar folosit (3–5 zile lucrătoare prin Stripe)</li>
      <li>Un document de storno emis prin SmartBill, transmis și către ANAF prin eFactura</li>
    </ul>

    <h2>Validare gratuită înainte de plată</h2>
    <p>
      Pentru a minimiza situațiile de refund, oferim <strong>validare gratuită</strong> a
      arhivei înainte de plată. Dacă validarea arată probleme de compatibilitate, veți fi
      anunțat și nu vi se va cere plata.
    </p>

    <h2>Întrebări</h2>
    <p>
      Pentru orice clarificări privind refund-ul, scrieți la
      <a href="mailto:support@rapidport.ro">support@rapidport.ro</a>. Răspundem în 24 de
      ore pe zilele lucrătoare.
    </p>
  </LayoutLegalPage>
</template>
