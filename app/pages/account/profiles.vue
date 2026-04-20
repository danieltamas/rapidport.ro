<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { ArrowLeft, Upload as UploadIcon, Trash2, Plus, Layers, Info } from 'lucide-vue-next'

useHead({
  title: 'Profiluri de mapare — Rapidport',
  htmlAttrs: { lang: 'ro' },
})

// Only the user's own saved overrides live here. No public/community concept
// shown to the user — the platform learns from every migration into mapping_cache
// invisibly; there's nothing to toggle or share. Admin can curate in /admin/profiles.
const profiles = [
  {
    id: 'p_3c4d',
    name: 'Cabinet Exemplu — retail',
    direction: 'WinMentor → SAGA',
    savedFromJob: '#4821',
    savedAt: 'acum 2 săptămâni',
    lastUsed: 'ieri',
    overrides: 7,
  },
]

const hasProfiles = profiles.length > 0
</script>

<template>
  <div class="bg-background text-foreground min-h-dvh flex flex-col">
    <LayoutSiteHeader />

    <main class="flex-1">
      <section>
        <div class="mx-auto max-w-[1280px] px-6 py-14">
          <NuxtLink to="/account" class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft class="size-4" :stroke-width="2" />
            Contul meu
          </NuxtLink>

          <div class="mb-10">
            <h1 class="text-3xl md:text-4xl font-bold tracking-tight leading-tight" style="color: #000;">
              Profiluri de mapare
            </h1>
            <p class="mt-2 text-muted-foreground max-w-3xl leading-relaxed">
              Profilurile sunt suprapuneri manuale peste maparea standard — le folosiți doar când vreți să forțați un câmp să meargă altundeva decât în mod implicit, pentru un client specific.
            </p>
          </div>

          <!-- Explainer card -->
          <div class="rounded-2xl border border-primary/30 bg-primary/5 p-5 md:p-6 mb-10 flex items-start gap-4">
            <div class="size-10 rounded-xl bg-primary text-primary-foreground grid place-items-center shrink-0">
              <Info class="size-5" :stroke-width="2" />
            </div>
            <div class="text-sm leading-relaxed">
              <div class="font-semibold mb-1">Nu trebuie să salvați nimic pentru mapare automată.</div>
              <p class="text-muted-foreground">
                Maparea standard (peste 800 de câmpuri) se îmbunătățește de la sine cu fiecare portare. Folosiți profilurile doar dacă aveți un client cu un setup diferit și vreți să păstrați acele corecții pentru portări viitoare pe același client.
              </p>
            </div>
          </div>

          <!-- Empty state -->
          <div v-if="!hasProfiles" class="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
            <div class="size-14 rounded-full bg-muted grid place-items-center mx-auto mb-5">
              <Layers class="size-6 text-muted-foreground" :stroke-width="2" />
            </div>
            <h2 class="text-lg font-semibold mb-2">Nu aveți profiluri salvate</h2>
            <p class="text-sm text-muted-foreground max-w-md mx-auto mb-6">
              Când faceți ajustări manuale la mapare într-o portare, puteți alege „Salvează ca profil" la final ca să le refolosiți.
            </p>
            <Button class="rounded-full h-11 px-5" as-child>
              <NuxtLink to="/upload">
                <Plus class="size-4 mr-1" :stroke-width="2" />
                Portare nouă
              </NuxtLink>
            </Button>
          </div>

          <!-- Profiles list -->
          <div v-else class="border border-border rounded-2xl bg-card overflow-hidden">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th class="text-left px-5 py-3 font-semibold">Nume profil</th>
                  <th class="text-left px-5 py-3 font-semibold">Direcție</th>
                  <th class="text-right px-5 py-3 font-semibold w-32">Suprapuneri</th>
                  <th class="text-left px-5 py-3 font-semibold w-44">Salvat</th>
                  <th class="text-left px-5 py-3 font-semibold w-44">Ultima folosință</th>
                  <th class="text-right px-5 py-3 font-semibold w-44">Acțiuni</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in profiles" :key="p.id" class="border-b border-border last:border-b-0 align-middle">
                  <td class="px-5 py-4">
                    <div class="font-semibold">{{ p.name }}</div>
                    <div class="text-xs text-muted-foreground mt-0.5">din portarea {{ p.savedFromJob }}</div>
                  </td>
                  <td class="px-5 py-4 font-mono text-xs text-muted-foreground">{{ p.direction }}</td>
                  <td class="px-5 py-4 text-right font-mono tabular-nums">{{ p.overrides }}</td>
                  <td class="px-5 py-4 text-muted-foreground">{{ p.savedAt }}</td>
                  <td class="px-5 py-4 text-muted-foreground">{{ p.lastUsed }}</td>
                  <td class="px-5 py-4">
                    <div class="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm" class="rounded-full h-8 px-3 text-xs" as-child>
                        <NuxtLink to="/upload">
                          <UploadIcon class="size-3.5 mr-1" :stroke-width="2" />
                          Folosește
                        </NuxtLink>
                      </Button>
                      <Button variant="ghost" size="icon" class="rounded-full h-8 w-8 text-muted-foreground hover:text-destructive">
                        <Trash2 class="size-4" :stroke-width="2" />
                      </Button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>

    <LayoutSiteFooter />
  </div>
</template>
