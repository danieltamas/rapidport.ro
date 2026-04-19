<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { CircleCheck, CircleAlert, Loader2 } from 'lucide-vue-next'

useHead({
  title: 'Autentificare — Rapidport',
  htmlAttrs: { lang: 'ro' },
})

const route = useRoute()
const status = ref<'loading' | 'ok' | 'expired' | 'invalid'>('loading')

onMounted(async () => {
  const token = route.query.token
  if (!token) {
    status.value = 'invalid'
    return
  }
  // TODO: GET /api/auth/verify?token=... (Wave 4 backend)
  await new Promise(r => setTimeout(r, 600))
  status.value = 'ok'
})
</script>

<template>
  <div class="bg-background text-foreground min-h-dvh flex flex-col">
    <LayoutSiteHeader />

    <main class="flex-1 flex items-center justify-center px-6 py-20">
      <div class="w-full max-w-md text-center">

        <div v-if="status === 'loading'">
          <div class="size-14 rounded-full bg-muted grid place-items-center mx-auto mb-6">
            <Loader2 class="size-6 text-muted-foreground animate-spin" :stroke-width="2" />
          </div>
          <h1 class="text-2xl font-bold tracking-tight mb-2">Verificăm linkul…</h1>
          <p class="text-muted-foreground">Un moment.</p>
        </div>

        <div v-else-if="status === 'ok'">
          <div class="size-14 rounded-full bg-success/10 text-success grid place-items-center mx-auto mb-6">
            <CircleCheck class="size-7" :stroke-width="2" />
          </div>
          <h1 class="text-2xl font-bold tracking-tight mb-2">Autentificat.</h1>
          <p class="text-muted-foreground mb-8">Vă redirecționăm către contul dvs.</p>
          <Button class="rounded-full h-12 px-6 text-base font-medium" as-child>
            <NuxtLink to="/profiles">Continuă</NuxtLink>
          </Button>
        </div>

        <div v-else-if="status === 'expired'">
          <div class="size-14 rounded-full bg-warning/10 text-warning grid place-items-center mx-auto mb-6">
            <CircleAlert class="size-7" :stroke-width="2" />
          </div>
          <h1 class="text-2xl font-bold tracking-tight mb-2">Linkul a expirat.</h1>
          <p class="text-muted-foreground mb-8">Linkurile sunt valabile 15 minute. Cereți unul nou.</p>
          <Button class="rounded-full h-12 px-6 text-base font-medium" as-child>
            <NuxtLink to="/login">Trimite alt link</NuxtLink>
          </Button>
        </div>

        <div v-else>
          <div class="size-14 rounded-full bg-destructive/10 text-destructive grid place-items-center mx-auto mb-6">
            <CircleAlert class="size-7" :stroke-width="2" />
          </div>
          <h1 class="text-2xl font-bold tracking-tight mb-2">Link invalid.</h1>
          <p class="text-muted-foreground mb-8">Linkul nu poate fi folosit. Cereți unul nou sau contactați-ne.</p>
          <div class="flex flex-col gap-2">
            <Button class="rounded-full h-12 px-6 text-base font-medium" as-child>
              <NuxtLink to="/login">Trimite alt link</NuxtLink>
            </Button>
            <Button variant="ghost" class="rounded-full h-12 px-6 text-base font-medium" as-child>
              <a href="mailto:support@rapidport.ro">Contactează suportul</a>
            </Button>
          </div>
        </div>

      </div>
    </main>

    <LayoutSiteFooter />
  </div>
</template>
