<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();

const tabs = [
  { name: "home", label: "Groups", icon: "pi pi-users", path: "/" },
  { name: "activity", label: "Activity", icon: "pi pi-chart-line", path: "/activity" },
  { name: "account", label: "Account", icon: "pi pi-user", path: "/account" },
] as const;

const activeName = computed(() => {
  if (route.name === "activity") return "activity";
  if (route.name === "account") return "account";
  return "home";
});

function go(path: string) {
  void router.push(path);
}
</script>

<template>
  <nav class="tl-bottom-nav tl-bottom-nav--app" aria-label="App sections">
    <button
      v-for="tab in tabs"
      :key="tab.name"
      type="button"
      :class="{ 'is-active': activeName === tab.name }"
      :aria-current="activeName === tab.name ? 'page' : undefined"
      @click="go(tab.path)"
    >
      <i :class="tab.icon" aria-hidden="true" />
      {{ tab.label }}
    </button>
  </nav>
</template>
