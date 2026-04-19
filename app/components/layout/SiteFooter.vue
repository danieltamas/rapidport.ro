<script setup lang="ts">
import { Mail } from 'lucide-vue-next'

// Import CookieConsent directly — v3 is a singleton, .run() in the client plugin
// sets up state, this import hits the same instance. Bypasses Nuxt provide entirely.
function openCookiePrefs() {
  if (typeof window === 'undefined') return
  import('vanilla-cookieconsent').then((cc) => {
    cc.showPreferences()
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[cookie-consent] showPreferences failed', err)
  })
}
</script>

<template>
  <footer class="border-t border-border">
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
            <li><NuxtLink to="/#cum" class="hover:text-primary transition-colors">Cum funcționează</NuxtLink></li>
            <li><NuxtLink to="/#pret" class="hover:text-primary transition-colors">Preț</NuxtLink></li>
            <li><NuxtLink to="/#intrebari" class="hover:text-primary transition-colors">Întrebări</NuxtLink></li>
            <li><NuxtLink to="/upload" class="hover:text-primary transition-colors">Începe portarea</NuxtLink></li>
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
            <li><NuxtLink to="/login" class="hover:text-primary transition-colors">Autentificare</NuxtLink></li>
          </ul>
        </div>
        <div class="md:col-span-2">
          <div class="text-xs font-semibold text-foreground mb-4">Legal</div>
          <ul class="space-y-2 text-sm text-muted-foreground">
            <li><NuxtLink to="/legal/terms" class="hover:text-primary transition-colors">Termeni și condiții</NuxtLink></li>
            <li><NuxtLink to="/legal/privacy" class="hover:text-primary transition-colors">Confidențialitate</NuxtLink></li>
            <li><NuxtLink to="/legal/dpa" class="hover:text-primary transition-colors">DPA (GDPR)</NuxtLink></li>
            <li><NuxtLink to="/legal/refund" class="hover:text-primary transition-colors">Politica de refund</NuxtLink></li>
          </ul>
        </div>
      </div>

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
            class="hover:text-primary transition-colors cursor-pointer"
            @click="openCookiePrefs"
          >
            Preferințe cookie-uri
          </button>
          <span class="text-muted-foreground/60">Rapidport · portare rapidă</span>
        </div>
      </div>
    </div>
  </footer>
</template>
