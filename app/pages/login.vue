<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { PinInput, PinInputGroup, PinInputSlot } from '~/components/ui/pin-input'
import { ArrowLeft } from 'lucide-vue-next'

useHead({
  title: 'Autentificare — Rapidport',
  meta: [{ name: 'description', content: 'Autentificare prin cod pe email. Fără parole.' }],
  htmlAttrs: { lang: 'ro' },
})

type Step = 'email' | 'code'

const route = useRoute()
const nextPath = computed(() => {
  const raw = route.query.next
  if (typeof raw !== 'string') return undefined
  if (!/^\/(?!\/)(?!\\)/.test(raw)) return undefined
  return raw
})

const step = ref<Step>('email')
const email = ref<string>('')
const pin = ref<number[]>([])
const submitting = ref(false)
const errorMsg = ref<string | null>(null)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const isValidEmail = computed(() => EMAIL_RE.test(String(email.value).trim()))
const code = computed(() => pin.value.map((n) => String(n)).join(''))
const isValidCode = computed(() => pin.value.length === 6 && /^\d{6}$/.test(code.value))

function readCsrf(): string {
  if (import.meta.server) return ''
  const m = document.cookie.match(/(?:^|;\s*)rp_csrf=([^;]+)/)
  return m && m[1] ? decodeURIComponent(m[1]) : ''
}

async function requestCode() {
  if (!isValidEmail.value) return
  submitting.value = true
  errorMsg.value = null
  try {
    await $fetch('/api/auth/magic-link', {
      method: 'POST',
      headers: { 'x-csrf-token': readCsrf() },
      body: { email: email.value.trim().toLowerCase() },
    })
    step.value = 'code'
    pin.value = []
    // Focus the first pin slot on next tick
    await nextTick()
    const firstSlot = document.querySelector<HTMLInputElement>('[data-pin-slot] input, [data-pin-input]')
    firstSlot?.focus()
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    errorMsg.value = status === 429
      ? 'Prea multe cereri. Încercați peste o oră.'
      : 'Nu am putut trimite codul. Încercați din nou în câteva momente.'
  } finally {
    submitting.value = false
  }
}

async function verifyCode() {
  if (!isValidCode.value) return
  submitting.value = true
  errorMsg.value = null
  try {
    const res = await $fetch<{ redirectTo: string }>('/api/auth/verify', {
      method: 'POST',
      headers: { 'x-csrf-token': readCsrf() },
      body: {
        email: email.value.trim().toLowerCase(),
        code: code.value.trim(),
        ...(nextPath.value ? { next: nextPath.value } : {}),
      },
    })
    // Invalidate any cached useAsyncData('session') so the header refetches after
    // login (without this, a header mounted before login stays showing 'Autentificare'
    // on the next SPA navigation).
    await refreshNuxtData('session')
    await navigateTo(res.redirectTo ?? '/account', { external: false })
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    const message = (err as { statusMessage?: string })?.statusMessage
    errorMsg.value = status === 400
      ? (message || 'Cod invalid sau expirat.')
      : 'Eroare la verificare. Încercați din nou.'
    pin.value = []
    // Refocus first slot for retry
    await nextTick()
    document.querySelector<HTMLInputElement>('[data-pin-slot] input, [data-pin-input]')?.focus()
  } finally {
    submitting.value = false
  }
}

function backToEmail() {
  step.value = 'email'
  pin.value = []
  errorMsg.value = null
}

// Reka UI emits 'complete' once all slots are filled. Auto-verify kicks off
// immediately — the user doesn't have to hit the button. Watcher guards against
// partial state (e.g. after an error when pin is reset).
function onPinComplete() {
  if (isValidCode.value && !submitting.value) {
    verifyCode()
  }
}
</script>

<template>
  <div class="bg-background text-foreground min-h-dvh flex flex-col">
    <LayoutSiteHeader />

    <main class="flex-1 flex items-center justify-center px-6 py-24 md:py-32">
      <div class="w-full max-w-md">
        <!-- STEP 1: email -->
        <div v-if="step === 'email'">
          <div class="text-sm font-medium text-primary mb-4">Autentificare</div>
          <h1 class="text-3xl md:text-4xl font-bold tracking-tight leading-[1.15] mb-5">
            Intrați cu un cod pe email.
          </h1>
          <p class="text-base text-muted-foreground leading-relaxed mb-12">
            Fără parole. Trimitem un cod de 6 cifre valabil 15 minute pe emailul pe care îl folosiți pentru portări.
          </p>

          <form class="space-y-6" @submit.prevent="requestCode">
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
              :disabled="!isValidEmail || submitting"
            >
              <span v-if="!submitting">Trimite codul</span>
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

        <!-- STEP 2: code -->
        <div v-else>
          <button
            class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 cursor-pointer"
            @click="backToEmail"
          >
            <ArrowLeft class="size-4" :stroke-width="2" />
            Schimbă emailul
          </button>

          <h1 class="text-3xl md:text-4xl font-bold tracking-tight leading-[1.15] mb-5">
            Introduceți codul.
          </h1>
          <p class="text-base text-muted-foreground leading-relaxed mb-10">
            Am trimis un cod de 6 cifre la <span class="text-foreground font-medium">{{ email }}</span>.
            Verificați și folderul de spam.
          </p>

          <form class="space-y-6" @submit.prevent="verifyCode">
            <div class="space-y-3">
              <label class="block text-sm font-medium">Cod de 6 cifre</label>
              <PinInput
                v-model="pin"
                type="number"
                :otp="true"
                :disabled="submitting"
                class="gap-2 justify-between"
                @complete="onPinComplete"
              >
                <PinInputGroup class="gap-2">
                  <PinInputSlot
                    v-for="i in 6"
                    :key="i - 1"
                    :index="i - 1"
                    data-pin-slot
                    class="h-14 w-full rounded-md border border-input bg-background text-2xl font-mono font-semibold tracking-tight focus:ring-2 focus:ring-ring focus:border-ring transition-all"
                  />
                </PinInputGroup>
              </PinInput>
            </div>
            <Button
              type="submit"
              class="rounded-full h-12 w-full text-base font-medium"
              :disabled="!isValidCode || submitting"
            >
              <span v-if="!submitting">Verifică și intră</span>
              <span v-else>Se verifică…</span>
            </Button>
            <p v-if="errorMsg" class="text-sm text-destructive text-center" role="alert">
              {{ errorMsg }}
            </p>
          </form>

          <button
            class="mt-10 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer w-full text-center"
            :disabled="submitting"
            @click="requestCode"
          >
            Nu ați primit codul? Retrimite
          </button>
        </div>
      </div>
    </main>

    <LayoutSiteFooter />
  </div>
</template>
