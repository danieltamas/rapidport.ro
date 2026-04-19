<script setup lang="ts">
import type { NuxtError } from '#app'
import { Button } from '~/components/ui/button'

const props = defineProps<{ error: NuxtError }>()

const status = computed(() => props.error.statusCode ?? 500)
const isNotFound = computed(() => status.value === 404)

// Romanian copy (user-facing). English fallback would be admin-side, but admin routes
// don't hit error.vue — they render inside their own layout before errors surface here.
const title = computed(() =>
  isNotFound.value ? 'Pagina nu a fost găsită' : 'Ceva nu a mers bine'
)
const message = computed(() =>
  isNotFound.value
    ? 'Adresa pe care ai accesat-o nu există sau a fost mutată.'
    : 'Am avut o problemă neașteptată. Încearcă din nou în câteva momente.'
)

function handleClearError() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <div class="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
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
        <Button @click="handleClearError">
          Înapoi la pagina principală
        </Button>
        <a
          href="mailto:hello@rapidport.ro"
          class="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Contact
        </a>
      </div>
    </div>
  </div>
</template>
