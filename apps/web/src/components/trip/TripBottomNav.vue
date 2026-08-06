<script setup lang="ts">
import type { MainTab } from "@/composables/useTripTabs";

defineProps<{ activeTab: MainTab }>();
const emit = defineEmits<{ setTab: [tab: MainTab] }>();

const tabs: { id: MainTab; label: string; icon: string }[] = [
  { id: "expenses", label: "Expenses", icon: "pi pi-receipt" },
  { id: "balances", label: "Balances", icon: "pi pi-chart-bar" },
  { id: "settle", label: "Settle", icon: "pi pi-sync" },
  { id: "payments", label: "Payments", icon: "pi pi-wallet" },
  { id: "more", label: "More", icon: "pi pi-ellipsis-h" },
];
</script>

<template>
  <nav class="tl-bottom-nav tl-bottom-nav--trip" aria-label="Group sections">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      :class="{ 'is-active': activeTab === tab.id }"
      :aria-current="activeTab === tab.id ? 'page' : undefined"
      @click="emit('setTab', tab.id)"
    >
      <i :class="tab.icon" aria-hidden="true" />
      {{ tab.label }}
    </button>
  </nav>
</template>
