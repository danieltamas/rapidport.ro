<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import { Upload, File, ShieldCheck, Clock, Info } from 'lucide-vue-next'

useHead({
  title: 'Încarcă arhiva — Rapidport',
  meta: [{ name: 'description', content: 'Încărcați arhiva din WinMentor sau SAGA. Detectăm direcția automat și validăm structura înainte să plătiți.' }],
  htmlAttrs: { lang: 'ro' },
})

const sourceOptions = [
  { id: 'winmentor', label: 'WinMentor', sub: 'export → SAGA' },
  { id: 'saga', label: 'SAGA', sub: 'export → WinMentor' },
  { id: 'auto', label: 'Detectează automat', sub: 'pe baza structurii arhivei' },
]

const source = ref<'winmentor' | 'saga' | 'auto'>('auto')

const file = ref<File | null>(null)
const dragover = ref(false)

function onDrop(e: DragEvent) {
  e.preventDefault()
  dragover.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) file.value = f
}

function onPick(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) file.value = f
}

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}
</script>

<template>
  <div class="bg-background text-foreground min-h-dvh flex flex-col">
    <LayoutSiteHeader />

    <main class="flex-1">
      <section class="relative overflow-hidden border-b border-border">
        <div class="pointer-events-none absolute -top-40 right-[-8rem] size-[38rem] rounded-full bg-gradient-to-br from-primary/20 via-primary/5 to-transparent blur-3xl" />

        <div class="relative mx-auto max-w-3xl px-6 py-20">
          <div class="text-sm font-medium text-primary mb-3">Pas 1 din 3 · Încărcare</div>
          <h1 class="text-4xl md:text-5xl font-bold tracking-tight leading-tight mb-4" style="color: #000;">
            Încărcați arhiva.
          </h1>
          <p class="text-lg text-muted-foreground mb-10 max-w-xl">
            Exportați backup-ul companiei din <strong class="text-foreground">WinMentor</strong> sau <strong class="text-foreground">SAGA</strong> (fișier <code class="font-mono text-sm">.tgz</code>, <code class="font-mono text-sm">.zip</code>, <code class="font-mono text-sm">.7z</code> sau <code class="font-mono text-sm">.rar</code>) și trageți-l mai jos. Detectăm direcția portării automat și validăm structura înainte să plătiți.
          </p>

          <div class="mb-6">
            <label class="block text-sm font-medium mb-3">Software sursă</label>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                v-for="opt in sourceOptions"
                :key="opt.id"
                type="button"
                class="rounded-xl border p-4 text-left transition-all cursor-pointer"
                :class="source === opt.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card hover:border-primary/40'"
                @click="source = opt.id as typeof source"
              >
                <div class="flex items-center gap-2">
                  <div
                    class="size-4 rounded-full border-2 grid place-items-center"
                    :class="source === opt.id ? 'border-primary' : 'border-border'"
                  >
                    <div v-if="source === opt.id" class="size-2 rounded-full bg-primary" />
                  </div>
                  <div class="font-semibold text-sm">{{ opt.label }}</div>
                </div>
                <div class="mt-1 text-xs text-muted-foreground ml-6">{{ opt.sub }}</div>
              </button>
            </div>
          </div>

          <div
            class="rounded-2xl border-2 border-dashed p-12 text-center transition-all cursor-pointer"
            :class="dragover ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40'"
            @dragover.prevent="dragover = true"
            @dragleave.prevent="dragover = false"
            @drop="onDrop"
            @click="($refs.filePick as HTMLInputElement)?.click()"
          >
            <input
              ref="filePick"
              type="file"
              accept=".tgz,.zip,.7z,.rar,application/gzip,application/zip,application/x-7z-compressed,application/x-rar-compressed"
              class="hidden"
              @change="onPick"
            >
            <div v-if="!file" class="flex flex-col items-center gap-4">
              <div class="size-14 rounded-full bg-primary/10 text-primary grid place-items-center">
                <Upload class="size-6" :stroke-width="2" />
              </div>
              <div>
                <div class="text-lg font-semibold">Trageți arhiva aici</div>
                <div class="text-sm text-muted-foreground mt-1">
                  sau apăsați pentru a selecta un fișier
                </div>
                <div class="text-xs text-muted-foreground mt-2">
                  max. 500 MB arhivă comprimată · acoperă baze de până la ~5 GB necomprimate
                </div>
              </div>
            </div>
            <div v-else class="flex items-center justify-center gap-4 text-left">
              <div class="size-14 rounded-full bg-success/10 text-success grid place-items-center">
                <File class="size-6" :stroke-width="2" />
              </div>
              <div>
                <div class="font-semibold">{{ file.name }}</div>
                <div class="text-sm text-muted-foreground">{{ fmtSize(file.size) }} · gata de încărcare</div>
              </div>
            </div>
          </div>

          <div class="mt-8 flex flex-wrap gap-3">
            <Button
              class="rounded-full h-12 px-7 text-base font-medium"
              :disabled="!file"
            >
              Continuă spre validare
            </Button>
            <Button
              v-if="file"
              variant="ghost"
              class="rounded-full h-12 px-5 text-base font-medium"
              @click="file = null"
            >
              Schimbă arhiva
            </Button>
          </div>

          <div class="mt-10 grid sm:grid-cols-3 gap-4">
            <Card class="border-border">
              <CardContent class="pt-6">
                <ShieldCheck class="size-5 text-primary mb-3" :stroke-width="2" />
                <div class="text-sm font-semibold mb-1">Validare înainte de plată</div>
                <div class="text-xs text-muted-foreground leading-relaxed">Analizăm arhiva și vă arătăm raportul înainte să cereți plata.</div>
              </CardContent>
            </Card>
            <Card class="border-border">
              <CardContent class="pt-6">
                <Clock class="size-5 text-primary mb-3" :stroke-width="2" />
                <div class="text-sm font-semibold mb-1">3 – 15 minute</div>
                <div class="text-xs text-muted-foreground leading-relaxed">Majoritatea portărilor se termină sub 15 minute. Baze mari: până la o oră.</div>
              </CardContent>
            </Card>
            <Card class="border-border">
              <CardContent class="pt-6">
                <Info class="size-5 text-primary mb-3" :stroke-width="2" />
                <div class="text-sm font-semibold mb-1">Date stocate temporar</div>
                <div class="text-xs text-muted-foreground leading-relaxed">Arhiva și fișierele generate se șterg automat după 30 de zile.</div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </main>

    <LayoutSiteFooter />
  </div>
</template>
