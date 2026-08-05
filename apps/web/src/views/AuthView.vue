<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Password from "primevue/password";
import { toApiError } from "@/api/errors";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const mode = ref<"signin" | "signup">(
  route.query.mode === "signup" ? "signup" : "signin",
);
const email = ref("");
const password = ref("");
const displayName = ref("");
const submitting = ref(false);
const formError = ref<string | null>(null);

const title = computed(() =>
  mode.value === "signin" ? "Sign in" : "Create account",
);

watch(
  () => route.query.mode,
  (m) => {
    if (m === "signup" || m === "signin") {
      mode.value = m;
    }
  },
);

function safeRedirect(): string {
  const raw = String(route.query.redirect ?? "");
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/";
}

async function submit() {
  formError.value = null;
  const em = email.value.trim();
  const pw = password.value;
  if (!em || !pw) {
    formError.value = "Email and password are required.";
    return;
  }
  if (mode.value === "signup" && pw.length < 8) {
    formError.value = "Password must be at least 8 characters.";
    return;
  }
  submitting.value = true;
  try {
    if (mode.value === "signup") {
      await auth.signUp(em, pw, displayName.value.trim() || undefined);
    } else {
      await auth.signIn(em, pw);
    }
    await router.replace(safeRedirect());
  } catch (e) {
    const err = toApiError(e);
    if (mode.value === "signin" && err.code === "USER_NOT_FOUND") {
      mode.value = "signup";
      formError.value =
        "Couldn’t sign in. Create an account if you’re new, or go back if you already have one.";
      return;
    }
    formError.value = err.message;
  } finally {
    submitting.value = false;
  }
}

function switchMode(next: "signin" | "signup") {
  mode.value = next;
  formError.value = null;
  const query = { ...route.query };
  if (next === "signup") query.mode = "signup";
  else delete query.mode;
  void router.replace({ query });
}
</script>

<template>
  <section class="tl-card mx-auto max-w-md space-y-4" aria-labelledby="auth-title">
    <router-link to="/" class="text-xs text-tl-accent no-underline"
      >← All groups</router-link
    >
    <h1 id="auth-title" class="text-2xl font-semibold text-tl">{{ title }}</h1>
    <p class="text-sm text-tl-muted">
      Shared groups need an account so the same email works on every device. No
      confirmation email is sent.
    </p>

    <div class="flex gap-2">
      <Button
        label="Sign in"
        size="small"
        :severity="mode === 'signin' ? undefined : 'secondary'"
        :outlined="mode !== 'signin'"
        @click="switchMode('signin')"
      />
      <Button
        label="Sign up"
        size="small"
        :severity="mode === 'signup' ? undefined : 'secondary'"
        :outlined="mode !== 'signup'"
        @click="switchMode('signup')"
      />
    </div>

    <form class="space-y-3" @submit.prevent="submit">
      <div v-if="mode === 'signup'">
        <label class="tl-input-label" for="auth-name">Display name</label>
        <InputText
          id="auth-name"
          v-model="displayName"
          class="w-full"
          placeholder="How others see you"
          autocomplete="name"
        />
      </div>
      <div>
        <label class="tl-input-label" for="auth-email">Email</label>
        <InputText
          id="auth-email"
          v-model="email"
          type="email"
          class="w-full"
          placeholder="you@example.com"
          autocomplete="email"
        />
      </div>
      <div>
        <label class="tl-input-label" for="auth-password">Password</label>
        <Password
          input-id="auth-password"
          v-model="password"
          class="w-full"
          input-class="w-full"
          :feedback="mode === 'signup'"
          toggle-mask
          autocomplete="current-password"
        />
      </div>

      <div v-if="formError" class="tl-alert" role="alert">{{ formError }}</div>

      <Button
        type="submit"
        :label="mode === 'signin' ? 'Sign in' : 'Create account'"
        icon="pi pi-sign-in"
        class="w-full"
        :loading="submitting"
      />
    </form>
  </section>
</template>
