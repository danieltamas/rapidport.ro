<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { Plus, Users, Upload as UploadIcon, Trash2, Share2 } from 'lucide-vue-next'

useHead({
  title: 'Profiluri de mapare — Rapidport',
  htmlAttrs: { lang: 'ro' },
})

const profiles = [
  {
    id: 'p_1a2b',
    name: 'WinMentor 9.x standard',
    direction: 'WinMentor → SAGA',
    adoption: 47,
    lastUsed: 'acum 3 zile',
    public: true,
    owner: 'rapidport (profil oficial)',
  },
  {
    id: 'p_3c4d',
    name: 'Cabinet Exemplu — retail',
    direction: 'WinMentor → SAGA',
    adoption: 4,
    lastUsed: 'ieri',
    public: false,
    owner: 'dvs.',
  },
  {
    id: 'p_5e6f',
    name: 'SAGA C 3.0 → WinMentor (reversă)',
    direction: 'SAGA → WinMentor',
    adoption: 12,
    lastUsed: 'acum 1 săptămână',
    public: true,
    owner: 'rapidport (profil oficial)',
  },
]
</script>

<template>
  <div class="bg-background text-foreground min-h-dvh flex flex-col">
    <LayoutSiteHeader />

    <main class="flex-1">
      <section class="border-b border-border">
        <div class="mx-auto max-w-[1280px] px-6 py-14">
          <div class="flex flex-wrap items-end justify-between gap-4 mb-10">
            <div>
              <div class="text-sm font-medium text-primary mb-2">Contul dvs.</div>
              <h1 class="text-3xl md:text-4xl font-bold tracking-tight leading-tight" style="color: #000;">
                Profiluri de mapare
              </h1>
              <p class="mt-2 text-muted-foreground max-w-2xl">
                Refolosiți mapările validate pe portări ulterioare. Profilurile pot fi private sau partajate public — nu conțin date de companie, doar asocieri de câmpuri.
              </p>
            </div>
            <Button class="rounded-full h-11 px-5" as-child>
              <NuxtLink to="/upload">
                <Plus class="size-4 mr-1" :stroke-width="2" />
                Profil nou (dintr-o portare)
              </NuxtLink>
            </Button>
          </div>

          <div class="border border-border rounded-2xl bg-card overflow-hidden">
            <div class="grid grid-cols-[2fr_1.2fr_0.8fr_1fr_0.8fr_auto] gap-4 px-5 py-3 border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <div>Profil</div>
              <div>Direcție</div>
              <div class="text-right">Adoptări</div>
              <div>Ultima folosință</div>
              <div>Vizibilitate</div>
              <div></div>
            </div>
            <div
              v-for="p in profiles"
              :key="p.id"
              class="grid grid-cols-[2fr_1.2fr_0.8fr_1fr_0.8fr_auto] gap-4 px-5 py-4 border-b border-border last:border-b-0 items-center text-sm"
            >
              <div>
                <div class="font-semibold">{{ p.name }}</div>
                <div class="text-xs text-muted-foreground mt-0.5">{{ p.owner }}</div>
              </div>
              <div class="font-mono text-xs text-muted-foreground">{{ p.direction }}</div>
              <div class="text-right">
                <span class="inline-flex items-center gap-1 font-mono tabular-nums text-sm">
                  <Users class="size-3.5 text-muted-foreground" :stroke-width="2" />
                  {{ p.adoption }}
                </span>
              </div>
              <div class="text-muted-foreground">{{ p.lastUsed }}</div>
              <div>
                <span
                  class="text-xs font-medium px-2 py-0.5 rounded-full"
                  :class="p.public ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
                >
                  {{ p.public ? 'public' : 'privat' }}
                </span>
              </div>
              <div class="flex gap-1 justify-end">
                <Button variant="ghost" size="sm" class="rounded-full h-8 px-3 text-xs" as-child>
                  <NuxtLink to="/upload">
                    <UploadIcon class="size-3.5 mr-1" :stroke-width="2" />
                    Folosește
                  </NuxtLink>
                </Button>
                <Button v-if="!p.public" variant="ghost" size="icon-sm" class="rounded-full text-muted-foreground">
                  <Share2 class="size-4" :stroke-width="2" />
                </Button>
                <Button v-if="!p.public" variant="ghost" size="icon-sm" class="rounded-full text-muted-foreground hover:text-destructive">
                  <Trash2 class="size-4" :stroke-width="2" />
                </Button>
              </div>
            </div>
          </div>

          <p class="mt-6 text-xs text-muted-foreground max-w-2xl">
            Profilurile publice sunt moderate. Păstrăm doar mapările de câmpuri, niciodată datele companiei.
            Puteți oricând să ștergeți un profil privat sau să îl transformați din public în privat.
          </p>
        </div>
      </section>
    </main>

    <LayoutSiteFooter />
  </div>
</template>
