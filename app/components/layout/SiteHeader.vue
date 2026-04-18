<script setup lang="ts">
</script>

<template>
  <nav class="sticky top-0 z-50 bg-background/85 backdrop-blur-md border-b border-border">
    <div class="mx-auto max-w-[1280px] px-6 h-16 flex items-center justify-between">
      <div class="flex items-center gap-10">
        <a href="/" class="flex items-center gap-2 text-xl font-bold tracking-tight">
          <span class="text-primary">■</span>
          <span>Rapidport</span>
        </a>
        <div class="hidden md:flex items-center gap-7 text-[15px] text-muted-foreground">
          <a href="/#cum" class="hover:text-foreground transition-colors">Cum funcționează</a>
          <a href="/#pret" class="hover:text-foreground transition-colors">Preț</a>
          <a href="/#intrebari" class="hover:text-foreground transition-colors">Întrebări</a>
          <a href="/upload" class="hover:text-foreground transition-colors">Portează</a>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <a
          href="/auth/login"
          class="hidden sm:inline-flex items-center justify-center rounded-full h-10 px-4 text-sm font-medium cursor-pointer hover:bg-accent transition-colors"
        >
          Autentificare
        </a>
        <a
          href="/upload"
          class="inline-flex items-center justify-center rounded-full h-10 px-5 text-sm font-medium cursor-pointer bg-primary text-primary-foreground shadow-sm hover:bg-[color:var(--accent-hover)] active:bg-[color:var(--accent-pressed)] transition-colors"
        >
          Începe portarea
        </a>
      </div>
    </div>
  </nav>
</template>
