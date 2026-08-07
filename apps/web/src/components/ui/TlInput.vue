<script setup lang="ts">
import InputText from "primevue/inputtext";

withDefaults(
  defineProps<{
    id?: string;
    type?: string;
    placeholder?: string;
    disabled?: boolean;
    autocomplete?: string;
    maxlength?: number | string;
  }>(),
  {
    type: "text",
  },
);

const model = defineModel<string>({ default: "" });
</script>

<template>
  <InputText
    :id="id"
    v-model="model"
    :type="type"
    :placeholder="placeholder"
    :disabled="disabled"
    :autocomplete="autocomplete"
    :maxlength="maxlength"
    class="w-full"
  />
</template>
