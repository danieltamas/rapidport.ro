<script setup lang="ts">
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog'
import { Monitor, Smartphone, Download, Trash2, LogOut, Mail } from 'lucide-vue-next'

useHead({
  title: 'Securitate cont — Rapidport',
  htmlAttrs: { lang: 'ro' },
})

const sessions = [
  { id: 's1', device: 'Mac · Chrome 132', ip: '86.120.xx.xx', location: 'Cluj-Napoca, RO', created: 'acum 2 zile', current: true },
  { id: 's2', device: 'iPhone · Safari', ip: '86.120.xx.xx', location: 'Cluj-Napoca, RO', created: 'ieri', current: false },
  { id: 's3', device: 'Windows · Firefox', ip: '109.99.xx.xx', location: 'București, RO', created: 'acum 6 zile', current: false },
]

const email = 'contact@cabinet-exemplu.ro'
const registered = '14 martie 2026'

const deleteOpen = ref(false)
const logoutOpen = ref(false)
</script>

<template>
  <div class="bg-background text-foreground min-h-dvh flex flex-col">
    <LayoutSiteHeader />

    <main class="flex-1">
      <section class="border-b border-border">
        <div class="mx-auto max-w-[900px] px-6 py-14">
          <div class="mb-10">
            <div class="text-sm font-medium text-primary mb-2">Contul dvs.</div>
            <h1 class="text-3xl md:text-4xl font-bold tracking-tight leading-tight" style="color: #000;">
              Securitate și acces
            </h1>
          </div>

          <!-- Account info -->
          <div class="rounded-2xl border border-border bg-card p-6 md:p-8 mb-6">
            <h2 class="text-lg font-semibold mb-5">Cont</h2>
            <dl class="space-y-4 text-sm">
              <div class="flex items-center justify-between">
                <dt class="text-muted-foreground flex items-center gap-2">
                  <Mail class="size-4" :stroke-width="2" />
                  Email
                </dt>
                <dd class="font-mono">{{ email }}</dd>
              </div>
              <div class="flex items-center justify-between">
                <dt class="text-muted-foreground">Cont creat</dt>
                <dd>{{ registered }}</dd>
              </div>
              <div class="flex items-center justify-between">
                <dt class="text-muted-foreground">Autentificare</dt>
                <dd class="text-muted-foreground">magic link pe email (fără parolă)</dd>
              </div>
            </dl>
          </div>

          <!-- Active sessions -->
          <div class="rounded-2xl border border-border bg-card overflow-hidden mb-6">
            <div class="px-6 py-5 border-b border-border flex items-center justify-between">
              <h2 class="text-lg font-semibold">Sesiuni active</h2>
              <Dialog v-model:open="logoutOpen">
                <DialogTrigger as-child>
                  <Button variant="ghost" size="sm" class="rounded-full h-9 text-xs">
                    <LogOut class="size-3.5 mr-1" :stroke-width="2" />
                    Deconectează tot
                  </Button>
                </DialogTrigger>
                <DialogContent class="sm:max-w-md rounded-2xl">
                  <DialogHeader>
                    <DialogTitle>Deconectează toate sesiunile?</DialogTitle>
                    <DialogDescription>
                      Veți fi deconectat de pe toate dispozitivele, inclusiv acesta. Veți primi un email cu link nou de autentificare la următoarea încercare.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter class="gap-2 sm:gap-2">
                    <Button variant="ghost" class="rounded-full" @click="logoutOpen = false">Anulează</Button>
                    <Button variant="destructive" class="rounded-full">Deconectează tot</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <div
              v-for="s in sessions"
              :key="s.id"
              class="flex items-center gap-4 px-6 py-4 border-b border-border last:border-b-0"
            >
              <component
                :is="s.device.includes('iPhone') || s.device.includes('Android') ? Smartphone : Monitor"
                class="size-5 text-muted-foreground shrink-0"
                :stroke-width="1.5"
              />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-sm truncate">{{ s.device }}</span>
                  <span v-if="s.current" class="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-success/10 text-success">curent</span>
                </div>
                <div class="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                  <span class="font-mono">{{ s.ip }}</span>
                  <span>·</span>
                  <span>{{ s.location }}</span>
                  <span>·</span>
                  <span>{{ s.created }}</span>
                </div>
              </div>
              <Button v-if="!s.current" variant="ghost" size="sm" class="rounded-full h-8 text-xs">
                Revocă
              </Button>
            </div>
          </div>

          <!-- Data export -->
          <div class="rounded-2xl border border-border bg-card p-6 md:p-8 mb-6">
            <h2 class="text-lg font-semibold mb-2">Export date (GDPR)</h2>
            <p class="text-sm text-muted-foreground mb-5 leading-relaxed">
              Primiți un fișier JSON cu toate datele pe care le avem despre contul dvs.: portări,
              facturi, profiluri de mapare, sesiuni. Trimis pe email în cel mult 24h.
            </p>
            <Button variant="outline" class="rounded-full h-10">
              <Download class="size-4 mr-1" :stroke-width="2" />
              Cere exportul datelor
            </Button>
          </div>

          <!-- Danger zone -->
          <div class="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 md:p-8">
            <h2 class="text-lg font-semibold mb-2 text-destructive">Ștergere cont</h2>
            <p class="text-sm text-muted-foreground mb-5 leading-relaxed">
              Ștergem toate datele dvs. din sistemul nostru: profiluri, sesiuni, jurnal
              de portări. Facturile rămân în sistem cât cere legea (10 ani). Acțiunea este
              ireversibilă.
            </p>
            <Dialog v-model:open="deleteOpen">
              <DialogTrigger as-child>
                <Button variant="destructive" class="rounded-full h-10">
                  <Trash2 class="size-4 mr-1" :stroke-width="2" />
                  Șterge contul
                </Button>
              </DialogTrigger>
              <DialogContent class="sm:max-w-md rounded-2xl">
                <DialogHeader>
                  <DialogTitle>Ștergeți contul {{ email }}?</DialogTitle>
                  <DialogDescription>
                    Acțiunea este ireversibilă. Portările active vor continua până la livrare, dar nu veți mai putea accesa istoricul. Facturile fiscale rămân păstrate conform legii.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter class="gap-2 sm:gap-2">
                  <Button variant="ghost" class="rounded-full" @click="deleteOpen = false">Anulează</Button>
                  <Button variant="destructive" class="rounded-full">Da, șterge definitiv</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </section>
    </main>

    <LayoutSiteFooter />
  </div>
</template>
