<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { Plus, Users, Upload as UploadIcon, Trash2, Share2 } from 'lucide-vue-next'

useHead({
  title: 'Contul meu — Rapidport',
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
      <section>
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
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th class="text-left px-5 py-3 font-semibold">Profil</th>
                  <th class="text-left px-5 py-3 font-semibold">Direcție</th>
                  <th class="text-right px-5 py-3 font-semibold w-28">Adoptări</th>
                  <th class="text-left px-5 py-3 font-semibold w-44">Ultima folosință</th>
                  <th class="text-left px-5 py-3 font-semibold w-28">Vizibilitate</th>
                  <th class="text-right px-5 py-3 font-semibold w-56">Acțiuni</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="p in profiles"
                  :key="p.id"
                  class="border-b border-border last:border-b-0 align-middle"
                >
                  <td class="px-5 py-4">
                    <div class="font-semibold">{{ p.name }}</div>
                    <div class="text-xs text-muted-foreground mt-0.5">{{ p.owner }}</div>
                  </td>
                  <td class="px-5 py-4 font-mono text-xs text-muted-foreground">
                    {{ p.direction }}
                  </td>
                  <td class="px-5 py-4 text-right">
                    <span class="inline-flex items-center gap-1 font-mono tabular-nums text-sm">
                      <Users class="size-3.5 text-muted-foreground" :stroke-width="2" />
                      {{ p.adoption }}
                    </span>
                  </td>
                  <td class="px-5 py-4 text-muted-foreground">{{ p.lastUsed }}</td>
                  <td class="px-5 py-4">
                    <span
                      class="text-xs font-medium px-2 py-0.5 rounded-full"
                      :class="p.public ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
                    >
                      {{ p.public ? 'public' : 'privat' }}
                    </span>
                  </td>
                  <td class="px-5 py-4">
                    <div class="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm" class="rounded-full h-8 px-3 text-xs" as-child>
                        <NuxtLink to="/upload">
                          <UploadIcon class="size-3.5 mr-1" :stroke-width="2" />
                          Folosește
                        </NuxtLink>
                      </Button>
                      <Button v-if="!p.public" variant="ghost" size="icon" class="rounded-full h-8 w-8 text-muted-foreground">
                        <Share2 class="size-4" :stroke-width="2" />
                      </Button>
                      <Button v-if="!p.public" variant="ghost" size="icon" class="rounded-full h-8 w-8 text-muted-foreground hover:text-destructive">
                        <Trash2 class="size-4" :stroke-width="2" />
                      </Button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
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
