<script setup lang="ts">
useHead({
  title: 'Termeni și condiții — Rapidport',
  meta: [{ name: 'description', content: 'Termenii și condițiile serviciului Rapidport.' }],
  htmlAttrs: { lang: 'ro' },
})
</script>

<template>
  <LayoutLegalPage
    title="Termeni și condiții"
    subtitle="Condițiile generale de utilizare a serviciului Rapidport."
    last-updated="17 aprilie 2026"
  >
    <h2>1. Cine suntem</h2>
    <p>
      Rapidport este un serviciu online de portare a datelor contabile între software-uri
      românești, operat de <strong>Gamerina SRL</strong>, CUI <code>RO43020532</code>,
      cu sediul în Str. Cometei 2/4, 400493, Cluj-Napoca, România.
    </p>
    <p>
      Pentru orice întrebare legată de acești termeni, ne puteți contacta la
      <a href="mailto:support@rapidport.ro">support@rapidport.ro</a>.
    </p>

    <h2>2. Serviciul oferit</h2>
    <p>
      Rapidport vă permite să convertiți arhivele de date din WinMentor într-un format
      acceptat la importul în SAGA. Serviciul include:
    </p>
    <ul>
      <li>Analiza automată a structurii arhivei WinMentor</li>
      <li>Maparea câmpurilor cu asistență AI (Haiku de la Anthropic)</li>
      <li>Generarea pachetului de fișiere pentru importul în SAGA (DBF + XML)</li>
      <li>Un raport detaliat al conversiei, în format JSON și PDF</li>
      <li>Sincronizări delta pentru tranzacțiile apărute după migrarea inițială</li>
    </ul>

    <h2>3. Plata și prețurile</h2>
    <p>
      Prețurile curente pentru pachetele Standard (499 RON) și Heavy (799 RON) includ TVA.
      Plata se face o singură dată, prin card bancar (Stripe). Factura fiscală este emisă
      automat prin SmartBill și transmisă către ANAF prin sistemul eFactura.
    </p>
    <p>
      Sincronizările delta suplimentare, după epuizarea celor incluse, se tarifează la
      99 RON per rulare.
    </p>

    <h2>4. Politica de refund</h2>
    <p>
      Dacă fișierele generate nu trec importul în SAGA și nu putem ajusta conversia în
      30 de zile de la plată, vă returnăm integral suma plătită. Detaliile complete ale
      politicii de refund sunt disponibile la
      <NuxtLink to="/legal/refund">Politica de refund</NuxtLink>.
    </p>

    <h2>5. Datele dvs.</h2>
    <p>
      Nu stocăm permanent conținutul fișierelor. Arhivele încărcate și pachetele SAGA
      generate se șterg automat după 30 de zile. Emailurile sunt hash-uite în jurnale,
      CIF-urile redactate. Profilurile de mapare sunt salvate fără datele companiei.
    </p>
    <p>
      Detalii complete despre prelucrarea datelor cu caracter personal sunt disponibile
      la <NuxtLink to="/legal/privacy">Politica de confidențialitate</NuxtLink> și
      <NuxtLink to="/legal/dpa">Acordul de Prelucrare a Datelor (DPA)</NuxtLink>.
    </p>

    <h2>6. Garanțiile și limitele răspunderii</h2>
    <p>
      Rapidport depune toate eforturile rezonabile pentru exactitatea conversiei, dar
      <strong>vă recomandăm întotdeauna să verificați rezultatul</strong> în SAGA
      înainte de a folosi datele pentru declarații fiscale sau raportări. Raportul de
      conversie identifică înregistrările cu potențiale probleme.
    </p>
    <p>
      Nu răspundem pentru pierderi indirecte (pierderi de profit, amenzi fiscale,
      penalizări contractuale) rezultate din utilizarea datelor convertite, cu excepția
      cazurilor prevăzute de lege.
    </p>

    <h2>7. Utilizare acceptabilă</h2>
    <p>
      Este interzisă utilizarea Rapidport pentru:
    </p>
    <ul>
      <li>Date care nu vă aparțin sau pentru care nu aveți drept legal de prelucrare</li>
      <li>Tentative de acces neautorizat la sistem sau la datele altor utilizatori</li>
      <li>Încărcarea de fișiere malițioase sau arhive special construite pentru a exploata vulnerabilități</li>
    </ul>

    <h2>8. Modificarea termenilor</h2>
    <p>
      Putem actualiza acești termeni pentru a reflecta schimbări legale, tehnice sau de serviciu.
      Versiunea curentă este disponibilă la această pagină, cu data ultimei actualizări vizibilă
      în partea de sus.
    </p>

    <h2>9. Legea aplicabilă</h2>
    <p>
      Acești termeni sunt guvernați de legislația română. Orice litigiu va fi soluționat
      de instanțele competente din Cluj-Napoca, România.
    </p>
  </LayoutLegalPage>
</template>
