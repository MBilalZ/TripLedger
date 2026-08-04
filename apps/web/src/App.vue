<script setup lang="ts">
import Toast from "primevue/toast";
import ConfirmDialog from "primevue/confirmdialog";
import { useTheme } from "@/composables/useTheme";

const { isDark, toggle } = useTheme();
</script>

<template>
  <div class="min-h-screen bg-tl">
    <Toast position="top-center" />
    <ConfirmDialog />
    <header class="tl-app-header">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <router-link to="/" class="flex items-center gap-2 no-underline">
          <span class="tl-brand-mark">TL</span>
          <span class="text-lg font-semibold tracking-tight text-tl"
            >TripLedger</span
          >
        </router-link>
        <div class="flex items-center gap-2">
          <span class="tl-tagline">Offline · $0 forever</span>
          <button
            type="button"
            class="tl-icon-btn"
            :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
            @click="toggle"
          >
            <i :class="isDark ? 'pi pi-sun' : 'pi pi-moon'" />
          </button>
        </div>
      </div>
    </header>
    <main class="mx-auto max-w-6xl px-4 py-6">
      <router-view />
    </main>
  </div>
</template>
