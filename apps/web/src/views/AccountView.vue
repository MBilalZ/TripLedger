<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { isSupabaseConfigured } from "@/services/supabase";
import { toApiError } from "@/services/errors";
import PushNotifyToggle from "@/components/PushNotifyToggle.vue";
import { useFeedback } from "@/composables/useFeedback";
import { useTheme } from "@/composables/useTheme";
import { useAuthStore } from "@/stores/auth";
import pkg from "../../package.json";

const auth = useAuthStore();
const router = useRouter();
const { isDark, toggle } = useTheme();
const { success, error } = useFeedback();

const nameDraft = ref("");
const saving = ref(false);
const version = pkg.version;

onMounted(async () => {
  if (!auth.authReady) await auth.initAuth();
  nameDraft.value = auth.profile?.displayName ?? "";
});

const email = computed(
  () => auth.profile?.email || auth.user?.email || "Local device",
);

const nameDirty = computed(() => {
  const saved = (auth.profile?.displayName ?? "").trim();
  return nameDraft.value.trim() !== saved;
});

async function saveName() {
  if (!auth.cloud) return;
  const next = nameDraft.value.trim();
  if (!next) {
    error("Name required", new Error("Enter a display name"));
    return;
  }
  saving.value = true;
  try {
    await auth.setDisplayName(next);
    success("Profile updated");
  } catch (e) {
    error("Could not save", e);
  } finally {
    saving.value = false;
  }
}

async function onSignOut() {
  try {
    await auth.signOut();
    await router.push({ name: "auth" });
  } catch (e) {
    error("Sign out failed", toApiError(e));
  }
}
</script>

<template>
  <div class="tl-has-bottom-nav space-y-4">
    <section class="tl-card">
      <h1 class="mb-4 text-2xl font-semibold text-tl">Account</h1>
      <div class="flex items-start gap-3">
        <div class="tl-avatar-lg" aria-hidden="true">
          {{ (auth.displayLabel || "TL").slice(0, 1).toUpperCase() }}
        </div>
        <div class="min-w-0 flex-1">
          <div class="font-medium text-tl">
            {{ auth.displayLabel || "Guest" }}
          </div>
          <div class="text-sm text-tl-muted">{{ email }}</div>
        </div>
      </div>
    </section>

    <section v-if="auth.cloud" class="tl-card space-y-3">
      <h2 class="tl-section-title">Profile</h2>
      <div>
        <label class="tl-input-label">Display name</label>
        <InputText v-model="nameDraft" class="w-full" />
      </div>
      <Button
        v-if="nameDirty"
        label="Save name"
        icon="pi pi-check"
        size="small"
        :loading="saving"
        @click="saveName"
      />
    </section>

    <section class="tl-card space-y-1">
      <h2 class="tl-section-title">Preferences</h2>
      <button type="button" class="tl-list-row w-full text-left" @click="toggle">
        <div>
          <div class="font-medium">Appearance</div>
          <div class="text-xs text-tl-muted">
            {{ isDark ? "Dark mode" : "Light mode" }}
          </div>
        </div>
        <i :class="isDark ? 'pi pi-moon' : 'pi pi-sun'" class="text-tl-muted" />
      </button>
      <div class="tl-list-row">
        <div>
          <div class="font-medium">Push notifications</div>
          <div class="text-xs text-tl-muted">Trip updates on this device</div>
        </div>
        <PushNotifyToggle />
      </div>
      <div class="tl-list-row">
        <div>
          <div class="font-medium">Currency</div>
          <div class="text-xs text-tl-muted">PKR only</div>
        </div>
        <span class="text-sm text-tl-muted">PKR</span>
      </div>
    </section>

    <section class="tl-card space-y-3">
      <template v-if="isSupabaseConfigured() && auth.isSignedIn">
        <Button
          label="Log out"
          icon="pi pi-sign-out"
          severity="secondary"
          outlined
          class="w-full"
          @click="onSignOut"
        />
      </template>
      <template v-else-if="isSupabaseConfigured()">
        <Button
          label="Sign in"
          icon="pi pi-sign-in"
          class="w-full"
          @click="router.push({ name: 'auth' })"
        />
      </template>
      <p class="text-center text-xs text-tl-muted">
        TripLedger v{{ version }} · Group expense tracking for trips with
        different sharing groups.
      </p>
    </section>
  </div>
</template>
