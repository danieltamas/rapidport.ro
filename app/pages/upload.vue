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
const submitting = ref(false)
const errorMsg = ref<string | null>(null)
// Upload progress 0–100. Null when we haven't started yet / after error.
// Tracked via XHR `upload.onprogress`; $fetch/fetch don't expose upload events.
const progress = ref<number | null>(null)

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

function readCsrf(): string {
  if (import.meta.server) return ''
  const m = document.cookie.match(/(?:^|;\s*)rp_csrf=([^;]+)/)
  return m && m[1] ? decodeURIComponent(m[1]) : ''
}

// /api/jobs accepts 'auto' — when the user picks "Detectează automat" we pass
// it through verbatim and the worker's discover stage resolves + persists the
// concrete direction after inspecting the archive.
function resolveDirection(): { sourceSoftware: 'winmentor' | 'saga' | 'auto'; targetSoftware: 'winmentor' | 'saga' | 'auto' } {
  if (source.value === 'winmentor') return { sourceSoftware: 'winmentor', targetSoftware: 'saga' }
  if (source.value === 'saga') return { sourceSoftware: 'saga', targetSoftware: 'winmentor' }
  return { sourceSoftware: 'auto', targetSoftware: 'auto' }
}

type UploadError = { statusCode: number; errorCode: string | null }

// Upload via XHR (not $fetch) because upload progress events require the
// XHR `upload.onprogress` callback — the Fetch API + $fetch don't expose
// upload-side progress. Response body is parsed best-effort to extract
// our `data.error` string tag for the caller's error mapping.
function xhrUpload(jobId: string, body: FormData, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', `/api/jobs/${jobId}/upload`)
    xhr.setRequestHeader('x-csrf-token', readCsrf())
    // No explicit Content-Type — the browser sets multipart/form-data with
    // the correct boundary when FormData is sent. Manually setting it breaks
    // the boundary and the server can't parse the multipart body.
    xhr.withCredentials = true
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)))
      }
    }
    xhr.onerror = () => reject({ statusCode: 0, errorCode: null } satisfies UploadError)
    xhr.onabort = () => reject({ statusCode: 0, errorCode: null } satisfies UploadError)
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
        return
      }
      let errorCode: string | null = null
      try {
        const parsed = JSON.parse(xhr.responseText) as { data?: { error?: string } }
        errorCode = typeof parsed?.data?.error === 'string' ? parsed.data.error : null
      } catch {
        // non-JSON body (proxy HTML error page, etc.) — leave errorCode null
      }
      reject({ statusCode: xhr.status, errorCode } satisfies UploadError)
    }
    xhr.send(body)
  })
}

function mapError(status: number | undefined, code: string | null | undefined): string {
  if (status === 413 || code === 'payload_too_large') {
    return 'Arhiva depășește 500 MB. Exportați o bază mai mică sau ne scrieți pe email.'
  }
  if (status === 415 || code === 'unsupported_archive_type') {
    return 'Format nerecunoscut. Acceptăm .tgz, .zip, .7z, .rar.'
  }
  if (status === 429) {
    return 'Prea multe încărcări. Încercați peste o oră.'
  }
  return 'Încărcarea a eșuat. Verificați conexiunea și încercați din nou.'
}

async function submit() {
  if (!file.value || submitting.value) return
  submitting.value = true
  errorMsg.value = null
  progress.value = 0
  try {
    const { sourceSoftware, targetSoftware } = resolveDirection()

    const created = await $fetch<{ id: string }>('/api/jobs', {
      method: 'POST',
      headers: { 'x-csrf-token': readCsrf() },
      body: { sourceSoftware, targetSoftware },
    })

    const form = new FormData()
    form.append('file', file.value)
    await xhrUpload(created.id, form, (pct) => {
      progress.value = pct
    })

    await navigateTo(`/job/${created.id}/discovery`)
  } catch (err: unknown) {
    // Two error shapes to unwrap: $fetch's FetchError (POST /api/jobs path) and
    // our xhrUpload's UploadError shape.
    const fetchStatus = (err as { statusCode?: number })?.statusCode
    const fetchCode = (err as { data?: { error?: string } })?.data?.error
    const uploadErr = err as Partial<UploadError>
    const status = uploadErr?.statusCode ?? fetchStatus
    const code = uploadErr?.errorCode ?? fetchCode ?? null
    errorMsg.value = mapError(status, code)
    progress.value = null
  } finally {
    submitting.value = false
  }
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
                <div class="text-sm text-muted-foreground">
                  {{ fmtSize(file.size) }} ·
                  <span v-if="progress === null">gata de încărcare</span>
                  <span v-else-if="progress < 100">se încarcă…</span>
                  <span v-else>încărcat · se procesează</span>
                </div>
              </div>
            </div>
          </div>

          <div v-if="submitting && progress !== null" class="mt-6">
            <div class="flex items-center gap-3">
              <div class="flex-1 h-1 rounded-full bg-border overflow-hidden" role="progressbar" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100">
                <div class="h-full bg-primary transition-[width] duration-150 ease-out" :style="{ width: `${progress}%` }" />
              </div>
              <div class="font-mono text-xs text-muted-foreground tabular-nums w-10 text-right">{{ progress }}%</div>
            </div>
          </div>

          <div class="mt-8 flex flex-wrap gap-3">
            <Button
              class="rounded-full h-12 px-7 text-base font-medium"
              :disabled="!file || submitting"
              @click="submit"
            >
              <span v-if="!submitting">Continuă spre validare</span>
              <span v-else>Se încarcă…</span>
            </Button>
            <Button
              v-if="file && !submitting"
              variant="ghost"
              class="rounded-full h-12 px-5 text-base font-medium"
              @click="file = null"
            >
              Schimbă arhiva
            </Button>
          </div>

          <p v-if="errorMsg" class="mt-4 text-sm text-destructive" role="alert">
            {{ errorMsg }}
          </p>

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
