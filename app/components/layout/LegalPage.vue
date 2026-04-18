<script setup lang="ts">
defineProps<{ title: string; lastUpdated: string; subtitle?: string }>()
</script>

<template>
  <div class="bg-background text-foreground min-h-dvh flex flex-col">
    <LayoutSiteHeader />

    <main class="flex-1">
      <article class="mx-auto max-w-3xl px-6 py-20">
        <div class="text-sm font-medium text-primary mb-3">Legal</div>
        <h1 class="text-4xl md:text-5xl font-bold tracking-tight leading-tight mb-3">{{ title }}</h1>
        <p v-if="subtitle" class="text-lg text-muted-foreground mb-4">{{ subtitle }}</p>
        <div class="text-sm text-muted-foreground mb-12">
          Ultima actualizare: <span class="font-mono">{{ lastUpdated }}</span>
        </div>

        <div class="prose-ro">
          <slot />
        </div>
      </article>
    </main>

    <LayoutSiteFooter />
  </div>
</template>

<style scoped>
.prose-ro :deep(h2) {
  font-size: 1.375rem;
  font-weight: 600;
  margin-top: 2.5rem;
  margin-bottom: 0.75rem;
  letter-spacing: -0.01em;
}
.prose-ro :deep(h3) {
  font-size: 1.075rem;
  font-weight: 600;
  margin-top: 1.75rem;
  margin-bottom: 0.5rem;
}
.prose-ro :deep(p),
.prose-ro :deep(li) {
  color: var(--text-secondary);
  line-height: 1.7;
  font-size: 0.9375rem;
}
.prose-ro :deep(p) {
  margin-bottom: 1rem;
}
.prose-ro :deep(ul) {
  list-style: disc;
  padding-left: 1.25rem;
  margin-bottom: 1rem;
}
.prose-ro :deep(li) {
  margin-bottom: 0.5rem;
}
.prose-ro :deep(strong) {
  color: var(--text-primary);
  font-weight: 600;
}
.prose-ro :deep(a) {
  color: var(--accent-primary);
  text-decoration: none;
}
.prose-ro :deep(a:hover) {
  text-decoration: underline;
}
.prose-ro :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.85em;
  background: var(--bg-secondary);
  padding: 0.1em 0.35em;
  border-radius: 3px;
}
</style>
