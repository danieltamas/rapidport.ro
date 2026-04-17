<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { ArrowRight, Upload, Eye, Download, Check, Mail, Terminal, ChevronRight } from 'lucide-vue-next'

useHead({
  title: 'Rapidport — De la WinMentor la SAGA în 15 minute',
  meta: [
    { name: 'description', content: 'Migrare completă WinMentor → SAGA, cu verificare pas cu pas și suport pentru sincronizări delta.' },
  ],
})

const stats = [
  { value: '498', unit: 'tables', caption: 'analyzed per migration' },
  { value: '17,284', unit: 'records', caption: 'converted in 3 minutes' },
  { value: '99.8%', unit: 'success', caption: 'SAGA import success rate' },
]

const steps = [
  { n: '01', icon: Upload, title: 'Upload', ro: 'Încarcă', body: 'Export the WinMentor company archive. Rapidport validates structure before the cargo leaves port.' },
  { n: '02', icon: Eye, title: 'Review', ro: 'Verifică', body: 'AI maps 800+ fields; you approve low-confidence mappings. Every record accounted for.' },
  { n: '03', icon: Download, title: 'Ship', ro: 'Descarcă', body: 'DBF + XML bundle for SAGA Import Date, plus a full conversion report. Done.' },
]

const plans = [
  {
    name: 'STANDARD',
    price: '499',
    tagline: 'For most cabinets.',
    features: [
      'Complete WinMentor → SAGA migration',
      'AI-assisted mapping for 800+ fields',
      'Detailed conversion report (JSON + PDF)',
      '3 delta syncs within 30 days',
      'Email support, 24h SLA',
    ],
    cta: 'Start migration',
    primary: true,
  },
  {
    name: 'HEAVY',
    price: '799',
    tagline: 'For large or complex migrations.',
    features: [
      'Everything in Standard',
      'Databases over 5 GB',
      'Unlimited delta syncs for 30 days',
      'Priority phone support',
      'Manual mapping adjustments included',
    ],
    cta: 'Choose Heavy',
    primary: false,
  },
]

const faqs = [
  { q: 'Datele mele sunt în siguranță?', a: 'Nu stocăm permanent conținutul fișierelor. Arhiva se șterge automat după 30 de zile. Emailurile sunt hash-uite în jurnale, CIF-urile redactate. Profilul de mapare e salvat fără datele companiei.' },
  { q: 'Ce se întâmplă dacă SAGA respinge un fișier?', a: 'Raportul conversiei identifică exact înregistrările problemă. Refacem conversia cu ajustări gratuit în primele 30 zile. Dacă fișierele nu trec importul SAGA, refund integral.' },
  { q: 'Ce versiuni WinMentor sunt suportate?', a: 'WinMentor 8.x și 9.x, testate pe peste 50 de companii reale. Pentru alte versiuni trimiteți o arhivă de test înainte de plată.' },
  { q: 'Cât durează o migrare?', a: 'Între 3 și 15 minute pentru cele mai multe cabinete. Bazele de date mari (peste 5 GB) pot ajunge la o oră. Vedeți progresul în timp real pe pagina de status.' },
  { q: 'Pot migra mai multe companii?', a: 'Fiecare migrare se tarifează separat. Clienții cu peste 5 firme primesc preț de volum — scrieți-ne.' },
  { q: 'Ce este o „sincronizare delta"?', a: 'După migrarea inițială pot apărea tranzacții noi în WinMentor. O sincronizare delta aduce DOAR aceste înregistrări noi în SAGA, fără să refacă toată conversia.' },
]
</script>

<template>
  <div class="font-sans antialiased selection:bg-primary/30">

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- TOP NAV                                                             -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <nav class="sticky top-0 z-50 bg-background/90 backdrop-blur-sm border-b border-border">
      <div class="mx-auto max-w-[1400px] px-6 h-14 flex items-center justify-between">
        <div class="flex items-center gap-8">
          <div class="flex items-center gap-2.5">
            <div class="size-2 bg-primary rounded-none"></div>
            <span class="font-mono text-sm font-medium tracking-tight">rapidport</span>
            <span class="font-mono text-[10px] text-muted-foreground uppercase tracking-widest ml-1">v1 · ro</span>
          </div>
          <div class="hidden md:flex items-center gap-6 text-xs font-mono uppercase tracking-wider text-muted-foreground">
            <a href="#how" class="hover:text-foreground transition-colors">How</a>
            <a href="#pricing" class="hover:text-foreground transition-colors">Pricing</a>
            <a href="#faq" class="hover:text-foreground transition-colors">FAQ</a>
            <a href="#docs" class="hover:text-foreground transition-colors">Docs</a>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="ghost" size="sm" class="h-8 font-mono text-xs uppercase tracking-wider">
            support@rapidport.ro
          </Button>
          <Button size="sm" class="h-8 font-mono text-xs uppercase tracking-wider">
            Start migration
            <ChevronRight class="size-3 ml-0.5" />
          </Button>
        </div>
      </div>
    </nav>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- HERO — DARK, tall, terminal hint                                    -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <section class="bg-background text-foreground border-b border-border">
      <div class="mx-auto max-w-[1400px] px-6 py-20 md:py-28 grid md:grid-cols-12 gap-8">
        <div class="md:col-span-7">
          <div class="flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-10">
            <span class="inline-block size-1.5 bg-primary rounded-none"></span>
            <span>WinMentor → SAGA · 2026 release</span>
          </div>
          <h1 class="text-[clamp(2.75rem,7vw,6rem)] font-semibold tracking-[-0.035em] leading-[0.95]">
            From WinMentor<br>
            to SAGA<br>
            <span class="text-muted-foreground">in 15 minutes.</span>
          </h1>
          <p class="mt-10 font-mono text-sm text-muted-foreground max-w-xl leading-relaxed">
            <span class="text-foreground">Portul de trecere între software-uri contabile.</span><br>
            Complete migration with step-by-step verification and delta sync support.
            Your accounting data doesn't get stuck between systems.
          </p>
          <div class="mt-12 flex flex-wrap gap-3">
            <Button size="lg" class="h-12 px-6 font-mono text-xs uppercase tracking-widest rounded-none">
              Start migration
              <ArrowRight class="size-4 ml-2" :stroke-width="1.5" />
            </Button>
            <Button size="lg" variant="outline" class="h-12 px-6 font-mono text-xs uppercase tracking-widest rounded-none">
              See how it works
            </Button>
          </div>
        </div>

        <div class="md:col-span-5 flex items-end">
          <!-- terminal-ish block: MinIO signature -->
          <div class="w-full border border-border bg-[#0f0f0f] font-mono text-[11px] leading-relaxed">
            <div class="flex items-center gap-2 border-b border-border px-4 py-2.5 text-muted-foreground">
              <Terminal class="size-3" :stroke-width="1.5" />
              <span class="uppercase tracking-wider">convert.log</span>
              <span class="ml-auto text-primary">· live</span>
            </div>
            <pre class="px-4 py-4 text-muted-foreground whitespace-pre-wrap"><span class="text-foreground">[00:00]</span> extract winmentor_2026-04-09.tgz → 19,600 files
<span class="text-foreground">[00:02]</span> discover 447 tables + 51 monthly folders
<span class="text-foreground">[00:05]</span> map fields  <span class="text-primary">rule:647</span>  <span class="text-foreground">ai:58</span>  review:12
<span class="text-foreground">[00:09]</span> generate <span class="text-primary">terti.dbf</span> · 847 partners
<span class="text-foreground">[00:09]</span> generate <span class="text-primary">articole.dbf</span> · 2,341 articles
<span class="text-foreground">[00:11]</span> generate <span class="text-primary">intrari/*.xml</span> · 18,240 invoices
<span class="text-foreground">[00:12]</span> report.pdf <span class="text-primary">ready</span> · 3.2 MB
<span class="text-foreground">[00:13]</span> <span class="text-[color:var(--success)]">done</span>  99.8% mapped  2 manual flags</pre>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- STATS BAND — LIGHT, big mono numbers                                -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <section class="light bg-background text-foreground border-b border-border">
      <div class="mx-auto max-w-[1400px] px-6 py-24 grid md:grid-cols-3 divide-x divide-border">
        <div
          v-for="(stat, idx) in stats"
          :key="stat.caption"
          class="px-0 md:px-8 first:pl-0 py-6 md:py-4"
        >
          <div class="flex items-baseline justify-between mb-6">
            <span class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              stat.{{ String(idx + 1).padStart(2, '0') }}
            </span>
            <span class="font-mono text-[10px] uppercase tracking-widest text-primary">{{ stat.unit }}</span>
          </div>
          <div class="font-mono text-7xl font-medium tracking-[-0.04em] text-foreground">
            {{ stat.value }}
          </div>
          <div class="mt-4 text-sm text-muted-foreground max-w-xs">
            {{ stat.caption }}
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- HOW IT WORKS — DARK, grid with dividers                             -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <section id="how" class="bg-background text-foreground border-b border-border">
      <div class="mx-auto max-w-[1400px] px-6 py-24">
        <div class="grid md:grid-cols-12 gap-8 mb-16">
          <div class="md:col-span-4">
            <div class="font-mono text-[10px] uppercase tracking-widest text-primary mb-4">
              § 01 · workflow
            </div>
            <h2 class="text-4xl md:text-5xl font-semibold tracking-[-0.025em] leading-tight">
              Three steps.<br>Zero surprises.
            </h2>
          </div>
          <div class="md:col-span-7 md:col-start-6 flex items-end">
            <p class="font-mono text-sm text-muted-foreground leading-relaxed">
              Verificăm fiecare înregistrare înainte de a pleca din port.
              Every record checked before shipping.
            </p>
          </div>
        </div>

        <div class="grid md:grid-cols-3 border border-border divide-y md:divide-y-0 md:divide-x divide-border">
          <div
            v-for="step in steps"
            :key="step.n"
            class="p-10"
          >
            <div class="flex items-center justify-between mb-12">
              <span class="font-mono text-xs text-primary uppercase tracking-widest">{{ step.n }}</span>
              <component :is="step.icon" class="size-5 text-muted-foreground" :stroke-width="1.25" />
            </div>
            <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              {{ step.ro }}
            </div>
            <h3 class="text-2xl font-semibold mb-4 tracking-tight">{{ step.title }}</h3>
            <p class="text-sm text-muted-foreground leading-relaxed">{{ step.body }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- PRICING — LIGHT                                                     -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <section id="pricing" class="light bg-background text-foreground border-b border-border">
      <div class="mx-auto max-w-[1400px] px-6 py-24">
        <div class="grid md:grid-cols-12 gap-8 mb-16">
          <div class="md:col-span-4">
            <div class="font-mono text-[10px] uppercase tracking-widest text-primary mb-4">
              § 02 · pricing
            </div>
            <h2 class="text-4xl md:text-5xl font-semibold tracking-[-0.025em] leading-tight">
              One-time.<br>No subscription.
            </h2>
          </div>
          <div class="md:col-span-7 md:col-start-6 flex items-end">
            <p class="font-mono text-sm text-muted-foreground leading-relaxed">
              Plătești pentru migrare, nu pentru timp de așteptare.
              Price includes VAT. eFactura via SmartBill, ANAF-compliant.
            </p>
          </div>
        </div>

        <div class="grid md:grid-cols-2 border border-border divide-y md:divide-y-0 md:divide-x divide-border">
          <div
            v-for="plan in plans"
            :key="plan.name"
            class="p-10"
            :class="plan.primary ? 'bg-background' : 'bg-card'"
          >
            <div class="flex items-center justify-between mb-10">
              <span class="font-mono text-xs uppercase tracking-widest">
                {{ plan.name }}
              </span>
              <span
                v-if="plan.primary"
                class="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 bg-primary text-primary-foreground"
              >
                recommended
              </span>
            </div>
            <div class="flex items-baseline gap-2 mb-6">
              <span class="font-mono text-7xl font-medium tracking-[-0.04em]">{{ plan.price }}</span>
              <span class="font-mono text-sm text-muted-foreground uppercase">RON</span>
            </div>
            <p class="text-sm text-muted-foreground mb-10 leading-relaxed">{{ plan.tagline }}</p>
            <ul class="space-y-3 mb-10">
              <li
                v-for="feature in plan.features"
                :key="feature"
                class="flex items-start gap-3 font-mono text-[12px] leading-relaxed"
              >
                <Check class="size-3.5 text-primary mt-0.5 shrink-0" :stroke-width="2" />
                <span class="text-foreground/90">{{ feature }}</span>
              </li>
            </ul>
            <Button
              :variant="plan.primary ? 'default' : 'outline'"
              size="lg"
              class="h-12 w-full font-mono text-xs uppercase tracking-widest rounded-none"
            >
              {{ plan.cta }}
            </Button>
          </div>
        </div>

        <p class="mt-8 font-mono text-[11px] text-muted-foreground leading-relaxed max-w-2xl">
          Additional delta sync after the included allowance: 99 RON per run.
          Invoice format: LEXITO-RO-[YYYY]-[NNNN] via SmartBill integration.
        </p>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- FAQ — DARK                                                          -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <section id="faq" class="bg-background text-foreground border-b border-border">
      <div class="mx-auto max-w-[1400px] px-6 py-24">
        <div class="grid md:grid-cols-12 gap-8 mb-12">
          <div class="md:col-span-4">
            <div class="font-mono text-[10px] uppercase tracking-widest text-primary mb-4">
              § 03 · faq
            </div>
            <h2 class="text-4xl md:text-5xl font-semibold tracking-[-0.025em] leading-tight">
              Questions<br>accountants ask.
            </h2>
          </div>
          <div class="md:col-span-8 border-t border-border">
            <details
              v-for="item in faqs"
              :key="item.q"
              class="group border-b border-border"
            >
              <summary class="flex cursor-pointer items-center justify-between py-6 list-none">
                <span class="text-base md:text-lg pr-8 leading-snug">{{ item.q }}</span>
                <span class="font-mono text-xl text-muted-foreground shrink-0 group-open:rotate-45 transition-transform duration-150">+</span>
              </summary>
              <p class="pb-6 pr-10 font-mono text-sm text-muted-foreground leading-relaxed">
                {{ item.a }}
              </p>
            </details>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- CTA — LIGHT                                                         -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <section class="light bg-background text-foreground border-b border-border">
      <div class="mx-auto max-w-[1400px] px-6 py-24 flex flex-col items-start gap-8">
        <h2 class="text-4xl md:text-6xl font-semibold tracking-[-0.03em] leading-[1] max-w-3xl">
          Ready to cast off?
        </h2>
        <p class="font-mono text-sm text-muted-foreground max-w-xl">
          No signup required. Upload the archive, we validate it before you pay.
        </p>
        <Button size="lg" class="h-14 px-8 font-mono text-sm uppercase tracking-widest rounded-none">
          Start migration
          <ArrowRight class="size-4 ml-3" :stroke-width="1.5" />
        </Button>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- FOOTER — DARK                                                       -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <footer class="bg-background text-foreground">
      <div class="mx-auto max-w-[1400px] px-6 py-16">
        <div class="grid md:grid-cols-12 gap-8 pb-12 border-b border-border">
          <div class="md:col-span-4">
            <div class="flex items-center gap-2.5 mb-4">
              <div class="size-2 bg-primary rounded-none"></div>
              <span class="font-mono text-sm font-medium">rapidport</span>
            </div>
            <p class="font-mono text-xs text-muted-foreground leading-relaxed max-w-xs">
              Portul de trecere între software-uri contabile.<br>
              WinMentor → SAGA. Made for Romanian accountants.
            </p>
          </div>
          <div class="md:col-span-2 md:col-start-7">
            <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-4">
              Product
            </div>
            <ul class="space-y-2 font-mono text-xs">
              <li><a href="#how" class="hover:text-primary transition-colors">How it works</a></li>
              <li><a href="#pricing" class="hover:text-primary transition-colors">Pricing</a></li>
              <li><a href="#faq" class="hover:text-primary transition-colors">FAQ</a></li>
            </ul>
          </div>
          <div class="md:col-span-2">
            <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-4">
              Contact
            </div>
            <ul class="space-y-2 font-mono text-xs">
              <li>
                <a href="mailto:support@rapidport.ro" class="hover:text-primary transition-colors flex items-center gap-1.5">
                  <Mail class="size-3" :stroke-width="1.5" />
                  support@rapidport.ro
                </a>
              </li>
            </ul>
          </div>
          <div class="md:col-span-2">
            <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-4">
              Legal
            </div>
            <ul class="space-y-2 font-mono text-xs">
              <li><a href="/legal/terms" class="hover:text-primary transition-colors">Terms</a></li>
              <li><a href="/legal/privacy" class="hover:text-primary transition-colors">Privacy</a></li>
              <li><a href="/legal/dpa" class="hover:text-primary transition-colors">DPA</a></li>
              <li><a href="/legal/refund" class="hover:text-primary transition-colors">Refund</a></li>
            </ul>
          </div>
        </div>
        <div class="pt-6 flex flex-wrap items-center justify-between gap-4 font-mono text-[11px] text-muted-foreground">
          <span>© 2026 Rapidport · Cluj-Napoca, RO</span>
          <span class="text-foreground/50">const port = new Rapidport()</span>
        </div>
      </div>
    </footer>
  </div>
</template>
