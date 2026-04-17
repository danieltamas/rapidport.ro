<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Badge } from '~/components/ui/badge'
</script>

<template>
  <div class="min-h-dvh flex items-center justify-center p-4">
    <Card class="max-w-md w-full">
      <CardHeader>
        <div class="flex items-center justify-between gap-4">
          <CardTitle>Rapidport</CardTitle>
          <Badge variant="outline">in progress</Badge>
        </div>
        <CardDescription>
          WinMentor → SAGA migration tool. Bootstrap complete; pages coming.
        </CardDescription>
      </CardHeader>
      <CardContent class="flex gap-2">
        <Button variant="default">Primary</Button>
        <Button variant="outline">Secondary</Button>
      </CardContent>
    </Card>
  </div>
</template>
