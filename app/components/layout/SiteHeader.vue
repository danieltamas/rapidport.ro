<script setup lang="ts">
import { buttonVariants } from '~/components/ui/button'
import { cn } from '~/lib/utils'
</script>

<template>
  <nav class="sticky top-0 z-50 bg-background/85 backdrop-blur-md border-b border-border">
    <div class="mx-auto max-w-[1280px] px-6 h-16 flex items-center justify-between">
      <div class="flex items-center gap-10">
        <NuxtLink to="/" class="flex items-center gap-2 text-xl font-bold tracking-tight">
          <span class="text-primary">■</span>
          <span>Rapidport</span>
        </NuxtLink>
        <div class="hidden md:flex items-center gap-7 text-[15px] text-muted-foreground">
          <NuxtLink to="/#cum" class="hover:text-foreground transition-colors">Cum funcționează</NuxtLink>
          <NuxtLink to="/#pret" class="hover:text-foreground transition-colors">Preț</NuxtLink>
          <NuxtLink to="/#intrebari" class="hover:text-foreground transition-colors">Întrebări</NuxtLink>
          <NuxtLink to="/upload" class="hover:text-foreground transition-colors">Portează</NuxtLink>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <NuxtLink
          to="/auth/login"
          :class="cn(buttonVariants({ variant: 'ghost' }), 'hidden sm:inline-flex rounded-full h-10 px-4 text-sm font-medium')"
        >
          Autentificare
        </NuxtLink>
        <NuxtLink
          to="/upload"
          :class="cn(buttonVariants({ variant: 'default' }), 'rounded-full h-10 px-5 text-sm font-medium')"
        >
          Începe portarea
        </NuxtLink>
      </div>
    </div>
  </nav>
</template>
