<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import Toast from "primevue/toast";
import ConfirmDialog from "primevue/confirmdialog";
import Button from "primevue/button";
import { isSupabaseConfigured } from "@/api/supabase";
import PwaInstallBanner from "@/components/PwaInstallBanner.vue";
import { useTheme } from "@/composables/useTheme";
import { useAuthStore } from "@/stores/auth";
import { useTripsStore } from "@/stores/trips";

const { isDark, toggle } = useTheme();
const auth = useAuthStore();
const trips = useTripsStore();
const router = useRouter();

onMounted(() => {
  void auth.initAuth().then(() => {
    if (auth.cloud || !isSupabaseConfigured()) {
      return trips.refresh();
    }
  });
});

async function onSignOut() {
  await auth.signOut();
  await router.push({ name: "auth" });
}
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
          <template v-if="isSupabaseConfigured()">
            <template v-if="auth.isSignedIn">
              <span class="tl-tagline max-w-[10rem] truncate sm:max-w-xs">{{
                auth.displayLabel
              }}</span>
              <Button
                label="Sign out"
                size="small"
                severity="secondary"
                text
                @click="onSignOut"
              />
            </template>
            <Button
              v-else
              label="Sign in"
              size="small"
              severity="secondary"
              text
              @click="router.push({ name: 'auth' })"
            />
          </template>
          <span v-else class="tl-tagline">Local · this device</span>
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
    <PwaInstallBanner />
  </div>
</template>
