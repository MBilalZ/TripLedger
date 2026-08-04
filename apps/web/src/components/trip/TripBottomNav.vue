<script setup lang="ts">
import type { MainTab } from "@/composables/useTripTabs";

defineProps<{ activeTab: MainTab }>();
const emit = defineEmits<{ setTab: [tab: MainTab] }>();
</script>

<template>
  <nav class="tl-bottom-nav" aria-label="Trip sections">
    <button
      type="button"
      :class="{ 'is-active': activeTab === 'expenses' }"
      :aria-current="activeTab === 'expenses' ? 'page' : undefined"
      @click="emit('setTab', 'expenses')"
    >
      <i class="pi pi-receipt" aria-hidden="true" />
      Expenses
    </button>
    <button
      type="button"
      :class="{ 'is-active': activeTab === 'balances' }"
      :aria-current="activeTab === 'balances' ? 'page' : undefined"
      @click="emit('setTab', 'balances')"
    >
      <i class="pi pi-chart-bar" aria-hidden="true" />
      Balances
    </button>
    <button
      type="button"
      :class="{ 'is-active': activeTab === 'settle' }"
      :aria-current="activeTab === 'settle' ? 'page' : undefined"
      @click="emit('setTab', 'settle')"
    >
      <i class="pi pi-sync" aria-hidden="true" />
      Settle
    </button>
    <button
      type="button"
      :class="{ 'is-active': activeTab === 'more' }"
      :aria-current="activeTab === 'more' ? 'page' : undefined"
      @click="emit('setTab', 'more')"
    >
      <i class="pi pi-ellipsis-h" aria-hidden="true" />
      More
    </button>
  </nav>
</template>
