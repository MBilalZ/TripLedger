<script setup lang="ts">
import TripPoolsSection from "./TripPoolsSection.vue";

defineProps<{ visible: boolean }>();
</script>

<template>
  <div v-show="visible" class="space-y-4">
    <div class="tl-card">
      <h2 class="tl-section-title mb-1">Pools</h2>
      <p class="text-sm text-tl-muted">
        Named sharing groups inside this trip — Hotel, BBQ, Fuel, and so on. Each
        pool has its own members and default split. Expenses inherit who shares
        from the pool you pick.
      </p>
    </div>
    <TripPoolsSection />
  </div>
</template>
