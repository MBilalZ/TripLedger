<script setup lang="ts">
import { computed, useAttrs } from "vue";
import Button from "primevue/button";

export type TlIconButtonVariant = "default" | "danger" | "secondary" | "bordered";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    /** PrimeIcons class, e.g. `pi pi-pencil`, or short name `pencil`. */
    icon: string;
    /** Accessible name (also accepts aria-label attr). */
    ariaLabel?: string;
    variant?: TlIconButtonVariant;
    disabled?: boolean;
    class?: string | Record<string, boolean> | Array<string | Record<string, boolean>>;
  }>(),
  {
    variant: "default",
  },
);

const attrs = useAttrs();

const resolvedAriaLabel = computed(() => {
  const fromAttr = attrs["aria-label"];
  if (typeof fromAttr === "string" && fromAttr) return fromAttr;
  return props.ariaLabel ?? "";
});

const iconClass = computed(() => {
  if (props.icon.startsWith("pi ")) return props.icon;
  if (props.icon.startsWith("pi-")) return `pi ${props.icon}`;
  return `pi pi-${props.icon}`;
});

const useNative = computed(() => props.variant === "bordered");

const severity = computed(() => {
  if (props.variant === "danger") return "danger";
  if (props.variant === "secondary") return "secondary";
  return undefined;
});

const passthroughAttrs = computed(() => {
  const { class: _c, "aria-label": _a, ...rest } = attrs as Record<string, unknown>;
  return rest;
});
</script>

<template>
  <button
    v-if="useNative"
    type="button"
    class="tl-icon-btn"
    :class="props.class"
    :aria-label="resolvedAriaLabel"
    :disabled="disabled"
    v-bind="passthroughAttrs"
  >
    <i :class="iconClass" aria-hidden="true" />
  </button>
  <Button
    v-else
    :icon="iconClass"
    text
    rounded
    :severity="severity"
    :disabled="disabled"
    :aria-label="resolvedAriaLabel"
    :class="props.class"
    v-bind="passthroughAttrs"
  />
</template>
