<script setup lang="ts">
import type { NuxtError } from '#app'
import { Button } from '~/components/ui/button'

const props = defineProps<{ error: NuxtError }>()

const status = computed(() => props.error.statusCode ?? 500)
const isNotFound = computed(() => status.value === 404)

const title = computed(() =>
  isNotFound.value ? 'Pagina nu a fost găsită' : 'Ceva nu a mers bine'
)
const message = computed(() =>
  isNotFound.value
    ? 'Adresa pe care ai accesat-o nu există sau a fost mutată.'
    : 'Am avut o problemă neașteptată. Încearcă din nou în câteva momente.'
)

function goHome() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <div class="bg-background text-foreground min-h-dvh flex flex-col">
    <LayoutSiteHeader />

    <main class="flex-1 flex items-center justify-center px-6 py-20">
      <div class="w-full max-w-xl">
        <div class="font-mono text-sm tracking-wider text-muted-foreground mb-6">
          ERROR / {{ status }}
        </div>
        <h1 class="text-4xl font-semibold tracking-tight mb-4">
          {{ title }}
        </h1>
        <p class="text-base text-muted-foreground mb-10 leading-relaxed">
          {{ message }}
        </p>
        <div class="flex items-center gap-3">
          <Button class="rounded-full h-12 px-6 text-base font-medium" @click="goHome">
            Înapoi la pagina principală
          </Button>
          <a
            href="mailto:support@rapidport.ro"
            class="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Contact
          </a>
        </div>
      </div>
    </main>

    <LayoutSiteFooter />
  </div>
</template>
