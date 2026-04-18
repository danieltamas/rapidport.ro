<script setup lang="ts">
useHead({
  title: 'DPA — Acord de prelucrare a datelor — Rapidport',
  meta: [{ name: 'description', content: 'Acordul de Prelucrare a Datelor conform GDPR art. 28.' }],
  htmlAttrs: { lang: 'ro' },
})
</script>

<template>
  <LayoutLegalPage
    title="Acord de prelucrare a datelor (DPA)"
    subtitle="Conform GDPR articolul 28, în relația contabil-cabinet → Rapidport."
    last-updated="17 aprilie 2026"
  >
    <h2>1. Părțile</h2>
    <p>
      Acest acord se încheie între:
    </p>
    <ul>
      <li><strong>Operatorul</strong> — cabinetul contabil sau contabilul care folosește Rapidport pentru portarea datelor unui client</li>
      <li><strong>Persoana împuternicită</strong> — <strong>Gamerina SRL</strong>, CUI <code>RO43020532</code>, Str. Cometei 2/4, 400493, Cluj-Napoca</li>
    </ul>

    <h2>2. Obiectul prelucrării</h2>
    <p>
      Gamerina SRL procesează, în calitate de persoană împuternicită, arhivele WinMentor
      ale clienților dvs., în scopul convertirii acestora într-un format acceptat la importul
      în SAGA.
    </p>

    <h2>3. Durata prelucrării</h2>
    <p>
      Arhivele și fișierele generate sunt păstrate maxim <strong>30 de zile</strong> de la
      încărcare, apoi șterse automat. Raportul de conversie, anonimizat, este păstrat pentru
      auditul operațiunii. Profilurile de mapare, fără date de companie, pot fi păstrate
      pentru utilizare repetată.
    </p>

    <h2>4. Categorii de persoane vizate</h2>
    <ul>
      <li>Reprezentanți ai partenerilor (furnizori, clienți) ai companiei migrate</li>
      <li>Angajați ai companiei migrate (dacă apar în nomenclatoare)</li>
      <li>Administratorul cabinetului contabil, ca utilizator al Rapidport</li>
    </ul>

    <h2>5. Tipuri de date prelucrate</h2>
    <ul>
      <li>Nume, CUI/CNP, adresă, IBAN, număr de telefon — pentru partenerii companiei</li>
      <li>Înregistrări contabile: facturi, plăți, note contabile</li>
      <li>Email-ul operatorului (cabinetul contabil)</li>
    </ul>

    <h2>6. Măsuri tehnice și organizatorice</h2>
    <ul>
      <li>HTTPS obligatoriu, criptare în tranzit și la conexiunea cu baza de date</li>
      <li>Arhive stocate doar pe volume criptate la nivel de disc</li>
      <li>Containere de procesare fără privilegii, izolate în rețea, cu limite de resurse</li>
      <li>Autentificare prin magic link cu tokene single-use, valabile 15 minute</li>
      <li>Jurnalizare auditabilă a tuturor accesărilor admin; PII redactat în jurnale</li>
      <li>Ștergere automată după 30 zile, irreversibilă</li>
    </ul>

    <h2>7. Subprocesatori autorizați</h2>
    <p>
      Gamerina SRL folosește următorii subprocesatori, aprobați de Operator prin acceptarea
      acestui DPA:
    </p>
    <ul>
      <li><strong>Hetzner Online GmbH</strong> (Germania) — infrastructură de găzduire, centre de date în UE</li>
      <li><strong>Stripe Payments Europe, Ltd.</strong> (Irlanda) — procesare plăți</li>
      <li><strong>Intelligent IT SRL / SmartBill</strong> (România) — emitere facturi, transmitere eFactura</li>
      <li><strong>Resend Inc.</strong> (SUA) — trimitere emailuri tranzacționale (cu mecanism SCC)</li>
      <li><strong>Anthropic PBC</strong> (SUA) — analiză AI (NUMAI nume de câmpuri tehnice, fără date personale)</li>
    </ul>
    <p>
      Operatorul va fi notificat cu 30 de zile înainte de orice modificare a listei de
      subprocesatori și poate ridica obiecții prin scrisoare la
      <a href="mailto:support@rapidport.ro">support@rapidport.ro</a>.
    </p>

    <h2>8. Drepturile persoanelor vizate</h2>
    <p>
      La cererea Operatorului, Gamerina SRL oferă asistență rezonabilă pentru a răspunde
      cererilor de acces, rectificare, ștergere, portabilitate sau opoziție din partea
      persoanelor vizate. Timpul de răspuns este de maximum 5 zile lucrătoare.
    </p>

    <h2>9. Notificarea incidentelor</h2>
    <p>
      În cazul unei încălcări a securității datelor, Gamerina SRL va notifica Operatorul
      în maximum <strong>72 de ore</strong> de la descoperire, conform GDPR art. 33.
      Notificarea va include natura incidentului, numărul de persoane și înregistrări
      afectate, măsurile luate și recomandările către Operator.
    </p>

    <h2>10. Returnarea și ștergerea datelor</h2>
    <p>
      La expirarea celor 30 de zile sau la cererea Operatorului, toate datele sunt șterse
      definitiv din sistemele Gamerina SRL și ale subprocesatorilor, cu excepția celor
      necesare îndeplinirii obligațiilor legale (facturile fiscale — păstrate 10 ani
      conform legislației române).
    </p>

    <h2>11. Aplicabilitate</h2>
    <p>
      Acest DPA intră în vigoare odată cu acceptarea
      <NuxtLink to="/legal/terms">Termenilor și condițiilor</NuxtLink> și rămâne valabil
      pe durata utilizării serviciului Rapidport.
    </p>

    <h2>12. Legea aplicabilă</h2>
    <p>
      Regulamentul (UE) 2016/679 (GDPR) și Legea 190/2018 privind măsurile de punere în
      aplicare a GDPR în România.
    </p>
  </LayoutLegalPage>
</template>
