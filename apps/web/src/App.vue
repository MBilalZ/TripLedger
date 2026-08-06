<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import Toast from "primevue/toast";
import ConfirmDialog from "primevue/confirmdialog";
import { isSupabaseConfigured } from "@/api/supabase";
import AppBottomNav from "@/components/AppBottomNav.vue";
import PwaInstallBanner from "@/components/PwaInstallBanner.vue";
import { useAuthStore } from "@/stores/auth";
import { useTripsStore } from "@/stores/trips";

const auth = useAuthStore();
const trips = useTripsStore();
const route = useRoute();

onMounted(() => {
  void auth.initAuth().then(() => {
    if (auth.cloud || !isSupabaseConfigured()) {
      return trips.refresh();
    }
  });
});

const showAppNav = computed(() => {
  const name = String(route.name ?? "");
  return name === "home" || name === "activity" || name === "account";
});

const showHeader = computed(() => {
  const name = String(route.name ?? "");
  return name !== "auth";
});
</script>

<template>
  <div class="min-h-screen bg-tl">
    <Toast position="top-center" />
    <ConfirmDialog :draggable="false" />
    <header v-if="showHeader" class="tl-app-header">
      <div class="tl-app-header__inner">
        <router-link to="/" class="tl-app-header__brand">
          <span class="tl-brand-mark">TL</span>
          <span class="tl-app-header__brand-name">TripLedger</span>
        </router-link>
      </div>
    </header>
    <main class="tl-app-main" :class="{ 'tl-app-main--with-nav': showAppNav }">
      <router-view />
    </main>
    <AppBottomNav v-if="showAppNav" />
    <PwaInstallBanner />
  </div>
</template>
