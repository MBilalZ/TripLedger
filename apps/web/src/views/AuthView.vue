<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Password from "primevue/password";
import TlButton from "@/components/ui/TlButton.vue";
import TlChip from "@/components/ui/TlChip.vue";
import TlInput from "@/components/ui/TlInput.vue";
import TlLabel from "@/components/ui/TlLabel.vue";
import { toApiError } from "@/services/errors";
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

    <div class="tl-chip-bar">
      <TlChip :active="mode === 'signin'" @click="switchMode('signin')">
        Sign in
      </TlChip>
      <TlChip :active="mode === 'signup'" @click="switchMode('signup')">
        Sign up
      </TlChip>
    </div>

    <form class="space-y-3" @submit.prevent="submit">
      <div v-if="mode === 'signup'">
        <TlLabel html-for="auth-name">Display name</TlLabel>
        <TlInput
          id="auth-name"
          v-model="displayName"
          placeholder="How others see you"
          autocomplete="name"
        />
      </div>
      <div>
        <TlLabel html-for="auth-email">Email</TlLabel>
        <TlInput
          id="auth-email"
          v-model="email"
          type="email"
          placeholder="you@example.com"
          autocomplete="email"
        />
      </div>
      <div>
        <TlLabel html-for="auth-password">Password</TlLabel>
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

      <TlButton
        type="submit"
        :label="mode === 'signin' ? 'Sign in' : 'Create account'"
        icon="sign-in"
        class="w-full"
        :loading="submitting"
      />
    </form>
  </section>
</template>
