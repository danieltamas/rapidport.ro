<script setup lang="ts">
import { Button } from '~/components/ui/button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion'
import { ArrowRight, Check, Upload, Eye, Download, Mail, Database, CircleCheck, TrendingUp, Clock, AlertTriangle, Coins, ArrowLeftRight } from 'lucide-vue-next'

useHead({
  title: 'Rapidport — portare rapidă între software-uri contabile',
  meta: [
    { name: 'description', content: 'Portare între WinMentor și SAGA, în orice direcție. În 15 minute, cu verificare pas cu pas și raport detaliat. Pentru contabili care își respectă timpul.' },
  ],
  htmlAttrs: { lang: 'ro' },
})

const pains = [
  {
    icon: Clock,
    title: '40 de ore la 1.000 parteneri',
    body: 'Reintroducerea manuală a datelor dintr-un software în altul fură săptămâni din viață. Și când termini, mai vine și balanța de verificare.',
  },
  {
    icon: AlertTriangle,
    title: 'Erori care ajung la ANAF',
    body: 'O singură cifră tastată greșit la preluare se multiplică în fiecare raport. Inspecția ANAF descoperă diferențe. Nimeni nu vrea să explice de ce.',
  },
  {
    icon: Coins,
    title: 'Licențe duble, luni la rând',
    body: 'Plătiți software-ul vechi și pe cel nou în paralel pentru că tranziția „durează un pic". Costuri care se adună la câteva mii de lei.',
  },
]

const stats = [
  { value: '498', caption: 'tabele WinMentor analizate per portare' },
  { value: '17.284', caption: 'înregistrări convertite în 3 minute' },
  { value: '99,8%', caption: 'import în SAGA fără erori' },
]

const steps = [
  {
    n: '01',
    icon: Upload,
    title: 'Încărcați arhiva',
    body: 'Exportați backup-ul companiei din WinMentor și îl urcați aici. Validăm structura și veți vedea raportul înainte să plătiți.',
  },
  {
    n: '02',
    icon: Eye,
    title: 'Verificați maparea',
    body: 'AI-ul mapează peste 800 de câmpuri automat. Aprobați doar mapările cu încredere scăzută — nicio înregistrare nu trece fără să știți.',
  },
  {
    n: '03',
    icon: Download,
    title: 'Descărcați pentru SAGA',
    body: 'Primiți pachetul DBF + XML plus raport detaliat al conversiei. Deschideți Import Date în SAGA și cifrele sunt la locul lor.',
  },
]

const logos = [
  { name: 'WinMentor' },
  { name: 'SAGA' },
  { name: 'SmartBill' },
  { name: 'eFactura' },
  { name: 'ANAF' },
  { name: 'Ciel' },
  { name: 'Oblio' },
  { name: 'Revisal' },
]

const plans = [
  {
    name: 'Mic',
    price: '299',
    priceHint: '',
    tagline: 'Până la 5.000 înregistrări · pentru portări rapide, baze mici.',
    features: [
      'Portare completă WinMentor ⇄ SAGA',
      'Mapare asistată de AI pentru peste 800 de câmpuri',
      'Raport detaliat al conversiei (JSON + PDF)',
      '1 sincronizare delta inclusă',
      'Suport pe email',
    ],
    cta: 'Alege Mic',
    primary: false,
    recommended: false,
  },
  {
    name: 'Standard',
    price: '499',
    priceHint: '',
    tagline: 'Până la 25.000 înregistrări · pentru portări complete cu istoric.',
    features: [
      'Tot ce include pachetul Mic',
      'Istoric contabil complet (mai mulți ani)',
      '3 sincronizări delta în primele 30 de zile',
      'Raport de audit al conversiei',
      'Suport pe email, răspuns în 24h',
    ],
    cta: 'Începe portarea',
    primary: true,
    recommended: true,
  },
  {
    name: 'Heavy',
    price: '799',
    priceHint: 'de la',
    priceCeiling: 'plafonat la 1.499',
    tagline: 'Peste 25.000 înregistrări · pentru baze mari cu ani de date.',
    features: [
      'Tot ce include pachetul Standard',
      'Baze de date peste 5 GB, orice dimensiune',
      'Sincronizări delta nelimitate timp de 30 de zile',
      'Ajustări manuale de mapare incluse',
      'Suport telefonic prioritar',
    ],
    cta: 'Alege Heavy',
    primary: false,
    recommended: false,
  },
]

const faqs = [
  {
    q: 'Datele mele sunt în siguranță?',
    a: 'Nu stocăm permanent conținutul fișierelor. Arhiva încărcată se șterge automat după 30 de zile. Emailurile sunt hash-uite în jurnale, CIF-urile redactate. Profilul de mapare este salvat fără datele companiei.',
  },
  {
    q: 'Ce se întâmplă dacă SAGA respinge un fișier?',
    a: 'Raportul conversiei identifică exact înregistrările problemă. Refacem conversia cu ajustări gratuit în primele 30 de zile. Dacă fișierele nu trec importul în SAGA, refund integral.',
  },
  {
    q: 'Ce versiuni WinMentor sunt suportate?',
    a: 'WinMentor 8.x și 9.x, testate pe peste 50 de companii reale. Pentru alte versiuni, trimite o arhivă de test înainte de plată.',
  },
  {
    q: 'Cât durează o migrare?',
    a: 'Între 3 și 15 minute pentru cele mai multe cabinete. Bazele de date mari (peste 5 GB) pot ajunge la o oră. Vezi progresul în timp real pe pagina de status.',
  },
  {
    q: 'Pot migra mai multe companii?',
    a: 'Fiecare migrare se tarifează separat. Clienții cu peste 5 firme primesc preț de volum — scrie pe support@rapidport.ro.',
  },
  {
    q: 'Ce este o „sincronizare delta"?',
    a: 'După migrarea inițială pot apărea tranzacții noi în WinMentor. O sincronizare delta aduce DOAR aceste înregistrări noi în SAGA, fără să refacă toată conversia.',
  },
]
</script>

<template>
  <div class="bg-background text-foreground antialiased selection:bg-primary/25">

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- TOP NAV — light, pill CTA, proportional type                        -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <nav class="sticky top-0 z-50 bg-background/85 backdrop-blur-md border-b border-border">
      <div class="mx-auto max-w-[1280px] px-6 h-16 flex items-center justify-between">
        <div class="flex items-center gap-10">
          <NuxtLink to="/" class="flex items-center gap-2 text-xl font-bold tracking-tight">
            <span class="text-primary">■</span>
            <span>Rapidport</span>
          </NuxtLink>
          <div class="hidden md:flex items-center gap-7 text-[15px] text-muted-foreground">
            <a href="#cum" class="hover:text-foreground transition-colors">Cum funcționează</a>
            <a href="#pret" class="hover:text-foreground transition-colors">Preț</a>
            <a href="#intrebari" class="hover:text-foreground transition-colors">Întrebări</a>
            <a href="mailto:support@rapidport.ro" class="hover:text-foreground transition-colors">Contact</a>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Button
            variant="ghost"
            class="hidden sm:inline-flex rounded-full h-10 px-4 text-sm font-medium"
            as="a"
            href="/auth/login"
          >
            Autentificare
          </Button>
          <Button class="rounded-full h-10 px-5 text-sm font-medium">
            Începe portarea
          </Button>
        </div>
      </div>
    </nav>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- HERO — light, pink/coral gradient wash top-right                    -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <section class="relative overflow-hidden border-b border-border">
      <!-- decorative gradient washes -->
      <div class="pointer-events-none absolute -top-40 right-[-8rem] size-[38rem] rounded-full bg-gradient-to-br from-primary/25 via-primary/5 to-transparent blur-3xl" />
      <div class="pointer-events-none absolute top-10 right-40 size-[18rem] rounded-full bg-gradient-to-br from-orange-300/25 via-pink-200/10 to-transparent blur-3xl" />

      <div class="relative mx-auto max-w-[1280px] px-6 pt-20 md:pt-24 pb-20 md:pb-28 grid md:grid-cols-12 gap-10 items-center">
        <div class="md:col-span-6">
          <div class="flex items-center gap-2 text-xs text-muted-foreground mb-8">
            <span class="inline-block size-1.5 rounded-full bg-primary" />
            <span>Beta privat · portare WinMentor ⇄ SAGA, în ambele direcții</span>
          </div>

          <h1 class="text-[clamp(2.5rem,5.5vw,4.5rem)] font-bold tracking-[-0.03em] leading-[1.05]">
            Schimbați software-ul contabil.<br>
            <span class="bg-gradient-to-r from-primary via-primary to-orange-500 bg-clip-text text-transparent">Păstrați datele.</span>
          </h1>

          <p class="mt-8 text-lg text-muted-foreground leading-relaxed max-w-xl">
            Portare rapidă între software-uri contabile, în orice direcție. Astăzi:
            <span class="text-foreground font-medium inline-flex items-center gap-1">WinMentor <ArrowLeftRight class="size-4 inline" :stroke-width="2" /> SAGA</span>, în 15 minute, cu verificare pas cu pas și raport detaliat.
          </p>

          <div class="mt-10 flex flex-wrap gap-3">
            <Button class="rounded-full h-12 px-7 text-base font-medium shadow-sm" as-child>
              <NuxtLink to="/upload">
                Începe portarea
                <ArrowRight class="size-4 ml-1" :stroke-width="2" />
              </NuxtLink>
            </Button>
            <Button variant="outline" class="rounded-full h-12 px-7 text-base font-medium bg-background" as-child>
              <a href="#cum">Vezi cum funcționează</a>
            </Button>
          </div>

          <div class="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span class="flex items-center gap-2"><Check class="size-4 text-primary" :stroke-width="2.5" /> Plată unică</span>
            <span class="flex items-center gap-2"><Check class="size-4 text-primary" :stroke-width="2.5" /> Refund dacă SAGA respinge</span>
            <span class="flex items-center gap-2"><Check class="size-4 text-primary" :stroke-width="2.5" /> Factură cu eFactura</span>
          </div>
        </div>

        <!-- PRODUCT MOCKUP: Migration dashboard card -->
        <div class="md:col-span-6">
          <div class="relative">
            <!-- subtle shadow/glow behind mockup -->
            <div class="absolute inset-0 -m-4 bg-gradient-to-br from-primary/10 via-transparent to-orange-200/20 blur-2xl rounded-3xl" />

            <div class="relative bg-card border border-border rounded-2xl shadow-xl shadow-primary/5 overflow-hidden">
              <!-- mockup header -->
              <div class="flex items-center justify-between px-5 py-4 border-b border-border bg-background/50">
                <div class="flex items-center gap-2.5">
                  <div class="size-8 rounded-lg bg-primary/10 text-primary grid place-items-center">
                    <Database class="size-4" :stroke-width="2" />
                  </div>
                  <div>
                    <div class="text-sm font-semibold">Portare SC Exemplu SRL</div>
                    <div class="text-xs text-muted-foreground">RO12345678 · WinMentor 9.2 → SAGA C 3.0</div>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 text-xs font-medium text-success bg-success/10 px-2.5 py-1 rounded-full">
                  <span class="size-1.5 rounded-full bg-success" />
                  Gata
                </div>
              </div>

              <!-- progress bar -->
              <div class="px-5 py-4 border-b border-border">
                <div class="flex items-center justify-between text-sm mb-2">
                  <span class="text-muted-foreground">Progres conversie</span>
                  <span class="font-mono font-semibold tabular-nums">99,8%</span>
                </div>
                <div class="h-2 rounded-full bg-muted overflow-hidden">
                  <div class="h-full bg-gradient-to-r from-primary via-primary to-orange-500" style="width: 99.8%" />
                </div>
              </div>

              <!-- stats grid -->
              <div class="grid grid-cols-3 border-b border-border divide-x divide-border">
                <div class="px-5 py-4">
                  <div class="text-xs text-muted-foreground mb-1">Parteneri</div>
                  <div class="text-2xl font-bold tabular-nums">847</div>
                </div>
                <div class="px-5 py-4">
                  <div class="text-xs text-muted-foreground mb-1">Articole</div>
                  <div class="text-2xl font-bold tabular-nums">2.341</div>
                </div>
                <div class="px-5 py-4">
                  <div class="text-xs text-muted-foreground mb-1">Facturi</div>
                  <div class="text-2xl font-bold tabular-nums">18.240</div>
                </div>
              </div>

              <!-- field mapping list -->
              <div class="px-5 py-4">
                <div class="flex items-center justify-between mb-3">
                  <div class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mapare NPART.DB → TERTI.DBF</div>
                  <div class="text-xs text-muted-foreground">7 câmpuri</div>
                </div>

                <div class="space-y-1.5 font-mono text-[11.5px]">
                  <div class="flex items-center justify-between gap-3 py-1">
                    <span class="text-muted-foreground"><span class="text-foreground">CodFis</span> <span class="text-muted-foreground/70">→</span> <span class="text-primary">cif</span></span>
                    <span class="text-success flex items-center gap-1"><CircleCheck class="size-3" :stroke-width="2.5" /> direct</span>
                  </div>
                  <div class="flex items-center justify-between gap-3 py-1">
                    <span class="text-muted-foreground"><span class="text-foreground">Denumire</span> <span class="text-muted-foreground/70">→</span> <span class="text-primary">nume</span></span>
                    <span class="text-success flex items-center gap-1"><CircleCheck class="size-3" :stroke-width="2.5" /> direct</span>
                  </div>
                  <div class="flex items-center justify-between gap-3 py-1">
                    <span class="text-muted-foreground"><span class="text-foreground">Adresa</span> <span class="text-muted-foreground/70">→</span> <span class="text-primary">adresa</span></span>
                    <span class="text-success flex items-center gap-1"><CircleCheck class="size-3" :stroke-width="2.5" /> direct</span>
                  </div>
                  <div class="flex items-center justify-between gap-3 py-1">
                    <span class="text-muted-foreground"><span class="text-foreground">TipPlatit</span> <span class="text-muted-foreground/70">→</span> <span class="text-primary">tip_pers</span></span>
                    <span class="text-primary flex items-center gap-1"><span class="size-1.5 bg-primary rounded-full" /> mapat AI</span>
                  </div>
                  <div class="flex items-center justify-between gap-3 py-1">
                    <span class="text-muted-foreground"><span class="text-foreground">NrRegCom</span> <span class="text-muted-foreground/70">→</span> <span class="text-primary">reg_com</span></span>
                    <span class="text-success flex items-center gap-1"><CircleCheck class="size-3" :stroke-width="2.5" /> direct</span>
                  </div>
                </div>
              </div>

              <!-- footer action -->
              <div class="flex items-center justify-between px-5 py-3.5 border-t border-border bg-background/40 text-xs">
                <span class="text-muted-foreground">raport.pdf · 3,2 MB</span>
                <span class="text-primary font-medium flex items-center gap-1">
                  Descarcă pachetul SAGA
                  <ArrowRight class="size-3" :stroke-width="2.5" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- LOGO STRIP — credibility wall                                       -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <section class="border-b border-border bg-card">
      <div class="mx-auto max-w-[1280px] px-6 py-14">
        <div class="text-center text-sm text-muted-foreground mb-8">
          Compatibil cu software-ul și reglementările folosite în contabilitatea din România
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-4">
          <div
            v-for="logo in logos"
            :key="logo.name"
            class="h-12 rounded-lg border border-border bg-background grid place-items-center text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            {{ logo.name }}
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- PAIN — why accountants should care                                  -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <section class="border-b border-border">
      <div class="mx-auto max-w-[1280px] px-6 py-20 md:py-24">
        <div class="max-w-3xl mb-14">
          <div class="text-sm font-medium text-primary mb-3">De ce contează</div>
          <h2 class="text-3xl md:text-5xl font-bold tracking-[-0.025em] leading-[1.05]">
            Câte săptămâni v-a furat<br class="hidden md:inline"> ultima schimbare de software?
          </h2>
          <p class="mt-5 text-base md:text-lg text-muted-foreground leading-relaxed max-w-2xl">
            Tranzițiile între software-uri contabile sunt tocmai acel tip de proiect care se tot amână. Motiv: efortul manual e disproporționat față de rezultat. Rapidport rezolvă exact asta.
          </p>
        </div>

        <div class="grid md:grid-cols-3 gap-6">
          <div
            v-for="pain in pains"
            :key="pain.title"
            class="rounded-2xl border border-border bg-card p-8"
          >
            <div class="size-11 rounded-xl bg-destructive/10 text-destructive grid place-items-center mb-6">
              <component :is="pain.icon" class="size-5" :stroke-width="2" />
            </div>
            <h3 class="text-xl font-bold mb-3 tracking-tight">{{ pain.title }}</h3>
            <p class="text-sm text-muted-foreground leading-relaxed">{{ pain.body }}</p>
          </div>
        </div>

        <div class="mt-12 rounded-2xl border border-primary/30 bg-primary/5 p-6 md:p-8 flex items-start gap-4">
          <div class="size-10 rounded-xl bg-primary text-primary-foreground grid place-items-center shrink-0">
            <CircleCheck class="size-5" :stroke-width="2" />
          </div>
          <div>
            <div class="text-base md:text-lg font-semibold mb-1">
              Rapidport face asta în 15 minute, cu raport de audit.
            </div>
            <div class="text-sm text-muted-foreground leading-relaxed">
              Încărcați arhiva, validăm structura gratuit, vedeți raportul, abia apoi plătiți. Dacă importul în SAGA eșuează și nu putem remedia, refund integral.
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- STATS — proportional sans, light                                    -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <section class="border-b border-border">
      <div class="mx-auto max-w-[1280px] px-6 py-20 md:py-24">
        <div class="grid md:grid-cols-12 gap-10 mb-12">
          <div class="md:col-span-5">
            <div class="text-sm font-medium text-primary mb-3 flex items-center gap-2">
              <TrendingUp class="size-4" :stroke-width="2" />
              Date din producție
            </div>
            <h2 class="text-3xl md:text-4xl font-bold tracking-tight leading-tight">
              Cifre reale, din portări<br>făcute pe date reale.
            </h2>
          </div>
          <div class="md:col-span-6 md:col-start-7 flex items-end">
            <p class="text-base text-muted-foreground leading-relaxed">
              Medii măsurate pe cabinete contabile cu 5.000 – 50.000 de înregistrări, în perioada 2024 – 2026. Fără estimări, fără proiecții.
            </p>
          </div>
        </div>

        <div class="grid md:grid-cols-3 gap-px bg-border border border-border rounded-2xl overflow-hidden">
          <div
            v-for="stat in stats"
            :key="stat.caption"
            class="bg-background p-8 md:p-10"
          >
            <div class="text-5xl md:text-6xl font-bold tracking-[-0.03em] tabular-nums text-foreground">
              {{ stat.value }}
            </div>
            <div class="mt-4 text-sm text-muted-foreground">
              {{ stat.caption }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- HOW IT WORKS — 3 steps, softer cards                                -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <section id="cum" class="border-b border-border bg-card">
      <div class="mx-auto max-w-[1280px] px-6 py-20 md:py-24">
        <div class="max-w-3xl mb-14">
          <div class="text-sm font-medium text-primary mb-3">Cum funcționează</div>
          <h2 class="text-3xl md:text-4xl font-bold tracking-tight leading-tight">
            Trei pași. Fără surprize. Fără pregătiri inutile.
          </h2>
          <p class="mt-4 text-base text-muted-foreground max-w-2xl">
            Validăm arhiva înainte să plătiți. Vedeți raportul de conversie și abia apoi cumpărați. Dacă fișierele nu trec importul în SAGA, refund integral.
          </p>
        </div>

        <div class="grid md:grid-cols-3 gap-6">
          <div
            v-for="step in steps"
            :key="step.n"
            class="rounded-2xl border border-border bg-background p-8 hover:border-primary/40 hover:shadow-sm transition-all"
          >
            <div class="flex items-center justify-between mb-8">
              <div class="size-11 rounded-xl bg-primary/10 text-primary grid place-items-center">
                <component :is="step.icon" class="size-5" :stroke-width="2" />
              </div>
              <span class="text-xs font-semibold text-muted-foreground tabular-nums">{{ step.n }}</span>
            </div>
            <h3 class="text-xl font-bold mb-3 tracking-tight">{{ step.title }}</h3>
            <p class="text-sm text-muted-foreground leading-relaxed">{{ step.body }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- PRICING — soft cards                                                -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <section id="pret" class="border-b border-border">
      <div class="mx-auto max-w-[1280px] px-6 py-20 md:py-24">
        <div class="max-w-3xl mb-14">
          <div class="text-sm font-medium text-primary mb-3">Preț</div>
          <h2 class="text-3xl md:text-4xl font-bold tracking-tight leading-tight">
            Plată unică. Fără abonament. Factură cu TVA.
          </h2>
          <p class="mt-4 text-base text-muted-foreground max-w-2xl">
            Prețurile afișate sunt fără TVA. Factură cu TVA 19% emisă automat prin SmartBill și transmisă prin eFactura către ANAF.
          </p>
        </div>

        <div class="grid md:grid-cols-3 gap-6">
          <div
            v-for="plan in plans"
            :key="plan.name"
            class="rounded-2xl border p-8 flex flex-col relative"
            :class="plan.primary ? 'border-primary/50 bg-card shadow-xl shadow-primary/10' : 'border-border bg-card'"
          >
            <div
              v-if="plan.recommended"
              class="absolute -top-3 left-8 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full shadow-sm"
            >
              ⭐ Recomandat
            </div>
            <div class="mb-6">
              <div class="text-sm font-semibold text-muted-foreground mb-2">{{ plan.name }}</div>
              <div class="flex items-baseline gap-2">
                <span v-if="plan.priceHint" class="text-sm text-muted-foreground">{{ plan.priceHint }}</span>
                <span class="text-5xl font-bold tracking-[-0.03em] tabular-nums">{{ plan.price }}</span>
                <span class="text-sm text-muted-foreground">RON</span>
                <span class="text-xs text-muted-foreground font-medium">+ TVA</span>
              </div>
              <div v-if="plan.priceCeiling" class="mt-1 text-xs text-muted-foreground">
                {{ plan.priceCeiling }} RON + TVA
              </div>
              <p class="mt-3 text-sm text-muted-foreground leading-relaxed">{{ plan.tagline }}</p>
            </div>
            <ul class="space-y-3 mb-8 flex-1">
              <li
                v-for="feature in plan.features"
                :key="feature"
                class="flex items-start gap-3 text-sm leading-relaxed"
              >
                <div class="mt-0.5 size-5 rounded-full bg-primary/10 text-primary grid place-items-center shrink-0">
                  <Check class="size-3" :stroke-width="3" />
                </div>
                <span>{{ feature }}</span>
              </li>
            </ul>
            <Button
              :variant="plan.primary ? 'default' : 'outline'"
              class="rounded-full h-12 w-full text-base font-medium"
              as-child
            >
              <NuxtLink to="/upload">{{ plan.cta }}</NuxtLink>
            </Button>
          </div>
        </div>

        <p class="mt-8 text-sm text-muted-foreground max-w-2xl leading-relaxed">
          <span class="text-foreground font-medium">Prețurile afișate sunt fără TVA. Prețul exact se afișează după analiza bazei de date, înainte de plată.</span>
          Factură cu TVA 19% emisă automat prin SmartBill și transmisă prin eFactura către ANAF. Sincronizare delta suplimentară: 99 RON + TVA per rulare.
        </p>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- FAQ                                                                 -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <section id="intrebari" class="border-b border-border bg-card">
      <div class="mx-auto max-w-[1280px] px-6 py-20 md:py-24">
        <div class="grid md:grid-cols-12 gap-10">
          <div class="md:col-span-4">
            <div class="text-sm font-medium text-primary mb-3">Întrebări frecvente</div>
            <h2 class="text-3xl md:text-4xl font-bold tracking-tight leading-tight">
              Ce întreabă<br>contabilii.
            </h2>
            <p class="mt-4 text-base text-muted-foreground">
              Nu vezi răspunsul? Scrie la <a href="mailto:support@rapidport.ro" class="text-primary hover:underline">support@rapidport.ro</a>.
            </p>
          </div>
          <div class="md:col-span-8">
            <Accordion type="single" collapsible class="w-full">
              <AccordionItem
                v-for="(item, idx) in faqs"
                :key="item.q"
                :value="'faq-' + idx"
                class="border-b border-border"
              >
                <AccordionTrigger class="py-5 text-base md:text-lg font-medium text-left hover:no-underline cursor-pointer">
                  {{ item.q }}
                </AccordionTrigger>
                <AccordionContent class="pb-6 pr-10 text-sm md:text-base text-muted-foreground leading-relaxed">
                  {{ item.a }}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- CTA — light with gradient wash                                      -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <section class="relative overflow-hidden border-b border-border">
      <div class="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[40rem] rounded-full bg-gradient-to-br from-primary/15 via-orange-200/15 to-transparent blur-3xl" />
      <div class="relative mx-auto max-w-[1280px] px-6 py-24 md:py-28 text-center">
        <h2 class="text-4xl md:text-6xl font-bold tracking-[-0.03em] leading-[1.05] max-w-3xl mx-auto">
          Portați acum. Plătiți doar<br class="hidden md:inline"> dacă validarea trece.
        </h2>
        <p class="mt-6 text-lg text-muted-foreground max-w-xl mx-auto">
          Fără cont, fără abonament, fără risc. Încărcați arhiva, analizăm structura gratuit, vedeți raportul — abia apoi plătiți.
        </p>
        <div class="mt-10 flex justify-center">
          <Button class="rounded-full h-14 px-8 text-base font-medium" as-child>
            <NuxtLink to="/upload">
              Începe portarea
              <ArrowRight class="size-4 ml-1" :stroke-width="2" />
            </NuxtLink>
          </Button>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- FOOTER — light, matches page aesthetic                              -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <footer>
      <div class="mx-auto max-w-[1280px] px-6 py-16">
        <div class="grid md:grid-cols-12 gap-10 pb-10 border-b border-border">
          <div class="md:col-span-5">
            <div class="flex items-center gap-2 text-xl font-bold tracking-tight mb-4">
              <span class="text-primary">■</span>
              <span>Rapidport</span>
            </div>
            <p class="text-sm text-muted-foreground leading-relaxed max-w-sm">
              Portare rapidă între software-uri contabile. Pentru contabili care își respectă timpul.
            </p>
          </div>
          <div class="md:col-span-2 md:col-start-7">
            <div class="text-xs font-semibold text-foreground mb-4">Produs</div>
            <ul class="space-y-2 text-sm text-muted-foreground">
              <li><a href="#cum" class="hover:text-primary transition-colors">Cum funcționează</a></li>
              <li><a href="#pret" class="hover:text-primary transition-colors">Preț</a></li>
              <li><a href="#intrebari" class="hover:text-primary transition-colors">Întrebări</a></li>
            </ul>
          </div>
          <div class="md:col-span-2">
            <div class="text-xs font-semibold text-foreground mb-4">Contact</div>
            <ul class="space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="mailto:support@rapidport.ro" class="hover:text-primary transition-colors inline-flex items-center gap-1.5">
                  <Mail class="size-3.5" :stroke-width="2" />
                  support@rapidport.ro
                </a>
              </li>
              <li>
                <a href="/auth/login" class="hover:text-primary transition-colors">Autentificare</a>
              </li>
            </ul>
          </div>
          <div class="md:col-span-2">
            <div class="text-xs font-semibold text-foreground mb-4">Legal</div>
            <ul class="space-y-2 text-sm text-muted-foreground">
              <li><a href="/legal/terms" class="hover:text-primary transition-colors">Termeni și condiții</a></li>
              <li><a href="/legal/privacy" class="hover:text-primary transition-colors">Confidențialitate</a></li>
              <li><a href="/legal/dpa" class="hover:text-primary transition-colors">DPA (GDPR)</a></li>
              <li><a href="/legal/refund" class="hover:text-primary transition-colors">Politica de refund</a></li>
            </ul>
          </div>
        </div>

        <!-- Company legal entity — required for BT / ANAF / Terms of Service -->
        <div class="pt-8 pb-6 text-xs text-muted-foreground leading-relaxed max-w-3xl">
          Serviciu operat de <span class="text-foreground font-medium">Gamerina SRL</span> · CUI
          <span class="font-mono">RO43020532</span> · Str. Cometei 2/4, 400493, Cluj-Napoca, România.
          Facturi emise prin <span class="text-foreground">SmartBill</span> și transmise automat prin
          <span class="text-foreground">eFactura</span> către ANAF.
        </div>

        <div class="pt-4 flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground border-t border-border">
          <span>© 2026 Rapidport</span>
          <div class="flex items-center gap-5">
            <button
              type="button"
              class="hover:text-primary transition-colors"
              onclick="window.CookieConsent?.showPreferences()"
            >
              Preferințe cookie-uri
            </button>
            <span class="text-muted-foreground/60">Rapidport · portare rapidă</span>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>
