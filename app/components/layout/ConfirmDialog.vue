<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'

// Reusable confirmation modal with fade + zoom transitions via the shadcn Dialog
// primitive. Parent controls `open` via v-model:open. On confirm the parent does
// the work (often async) and toggles open=false when done. `loading` shows a
// spinner on the confirm button and disables both actions during the async op.
//
// Variants:
//   default     — confirm = primary (accent) button
//   destructive — confirm = destructive outline (red-on-transparent per SPEC UI)
const props = withDefaults(
  defineProps<{
    title: string
    description?: string
    confirmLabel?: string
    cancelLabel?: string
    variant?: 'default' | 'destructive'
    loading?: boolean
  }>(),
  {
    confirmLabel: 'Confirmă',
    cancelLabel: 'Anulează',
    variant: 'default',
    loading: false,
    description: undefined,
  },
)

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

const open = defineModel<boolean>('open', { default: false })

function handleCancel() {
  if (props.loading) return
  emit('cancel')
  open.value = false
}

function handleConfirm() {
  if (props.loading) return
  emit('confirm')
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent
      class="rounded-2xl border-border bg-card p-0 overflow-hidden shadow-2xl"
      @escape-key-down="handleCancel"
      @pointer-down-outside="handleCancel"
      @interact-outside="handleCancel"
    >
      <div class="p-6">
        <DialogHeader class="space-y-2 text-left">
          <DialogTitle class="text-lg font-semibold tracking-tight">
            {{ title }}
          </DialogTitle>
          <DialogDescription v-if="description" class="text-sm text-muted-foreground leading-relaxed">
            {{ description }}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter class="mt-6 gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            class="rounded-full h-10 px-5 text-sm"
            :disabled="loading"
            @click="handleCancel"
          >
            {{ cancelLabel }}
          </Button>
          <Button
            v-if="variant === 'destructive'"
            type="button"
            variant="outline"
            class="rounded-full h-10 px-5 text-sm border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive"
            :disabled="loading"
            @click="handleConfirm"
          >
            <Loader2 v-if="loading" class="size-4 mr-1.5 animate-spin" :stroke-width="2" />
            {{ confirmLabel }}
          </Button>
          <Button
            v-else
            type="button"
            class="rounded-full h-10 px-5 text-sm"
            :disabled="loading"
            @click="handleConfirm"
          >
            <Loader2 v-if="loading" class="size-4 mr-1.5 animate-spin" :stroke-width="2" />
            {{ confirmLabel }}
          </Button>
        </DialogFooter>
      </div>
    </DialogContent>
  </Dialog>
</template>
