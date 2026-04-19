<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Mail, Check } from 'lucide-vue-next'

useHead({
  title: 'Autentificare — Rapidport',
  meta: [{ name: 'description', content: 'Autentificare prin link pe email. Fără parole.' }],
  htmlAttrs: { lang: 'ro' },
})

const email = ref<string>('')
const sent = ref(false)
const submitting = ref(false)
const errorMsg = ref<string | null>(null)

function readCsrf(): string {
  if (import.meta.server) return ''
  const m = document.cookie.match(/(?:^|;\s*)rp_csrf=([^;]+)/)
  return m && m[1] ? decodeURIComponent(m[1]) : ''
}

async function submit() {
  if (!email.value) return
  submitting.value = true
  errorMsg.value = null
  try {
    await $fetch('/api/auth/magic-link', {
      method: 'POST',
      headers: { 'x-csrf-token': readCsrf() },
      body: { email: String(email.value) },
    })
    sent.value = true
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    errorMsg.value = status === 429
      ? 'Prea multe cereri. Încercați peste o oră.'
      : 'Nu am putut trimite linkul. Încercați din nou în câteva momente.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="bg-background text-foreground min-h-dvh flex flex-col">
    <LayoutSiteHeader />

    <main class="flex-1 flex items-center justify-center px-6 py-24 md:py-32">
      <div class="w-full max-w-md">
        <div v-if="!sent">
          <div class="text-sm font-medium text-primary mb-4">Autentificare</div>
          <h1 class="text-3xl md:text-4xl font-bold tracking-tight leading-[1.15] mb-5">
            Intrați cu un link pe email.
          </h1>
          <p class="text-base text-muted-foreground leading-relaxed mb-12">
            Fără parole. Trimitem un link valabil 15 minute pe emailul pe care îl folosiți pentru portări.
          </p>

          <form class="space-y-6" @submit.prevent="submit">
            <div class="space-y-2.5">
              <label for="email" class="block text-sm font-medium">Email</label>
              <Input
                id="email"
                v-model="email"
                type="email"
                required
                autocomplete="email"
                placeholder="email@cabinet.ro"
                class="h-12 text-base"
              />
            </div>
            <Button
              type="submit"
              class="rounded-full h-12 w-full text-base font-medium"
              :disabled="!email || submitting"
            >
              <span v-if="!submitting">Trimite link de autentificare</span>
              <span v-else>Se trimite…</span>
            </Button>
            <p v-if="errorMsg" class="text-sm text-destructive text-center" role="alert">
              {{ errorMsg }}
            </p>
          </form>

          <p class="mt-10 text-xs text-muted-foreground text-center leading-relaxed">
            Continuând, sunteți de acord cu
            <NuxtLink to="/legal/terms" class="text-primary hover:underline">termenii</NuxtLink>
            și
            <NuxtLink to="/legal/privacy" class="text-primary hover:underline">politica de confidențialitate</NuxtLink>.
          </p>
        </div>

        <div v-else class="text-center">
          <div class="size-16 rounded-full bg-success/10 text-success grid place-items-center mx-auto mb-8">
            <Mail class="size-7" :stroke-width="2" />
          </div>
          <h1 class="text-3xl font-bold tracking-tight mb-4">Verificați emailul.</h1>
          <p class="text-muted-foreground leading-relaxed mb-10 max-w-sm mx-auto">
            Am trimis un link la <span class="text-foreground font-medium">{{ email }}</span>. Valabil 15 minute.
          </p>
          <div class="space-y-3 text-sm text-muted-foreground mb-10">
            <div class="flex items-center justify-center gap-2.5">
              <Check class="size-4 text-primary" :stroke-width="2.5" />
              Verificați și folderul de spam
            </div>
            <div class="flex items-center justify-center gap-2.5">
              <Check class="size-4 text-primary" :stroke-width="2.5" />
              Linkul deschide Rapidport în același browser
            </div>
          </div>
          <button
            class="text-sm text-primary hover:underline cursor-pointer"
            @click="sent = false"
          >
            Trimite din nou
          </button>
        </div>
      </div>
    </main>

    <LayoutSiteFooter />
  </div>
</template>
