import type { User } from "@supabase/supabase-js";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { toApiError } from "@/services/errors";
import {
  signOut as apiSignOut,
  fetchUserProfile,
  getSession,
  isSupabaseConfigured,
  onAuthStateChange,
  signInWithPassword,
  signUpWithPassword,
  type UserProfile,
  updateProfileDisplayName,
} from "@/services/supabase";

export const useAuthStore = defineStore("auth", () => {
  const configured = ref(isSupabaseConfigured());
  const authReady = ref(!isSupabaseConfigured());
  const authError = ref<string | null>(null);
  const user = ref<User | null>(null);
  const profile = ref<UserProfile | null>(null);

  const isSignedIn = computed(() => !!user.value);
  /** Cloud data mode: Supabase configured and user signed in. */
  const cloud = computed(() => configured.value && isSignedIn.value);
  const displayLabel = computed(
    () => profile.value?.displayName || profile.value?.email || user.value?.email || null,
  );

  let unsub: (() => void) | null = null;

  async function syncFromSession() {
    configured.value = isSupabaseConfigured();
    if (!configured.value) {
      user.value = null;
      profile.value = null;
      authError.value = null;
      return;
    }
    let session = await getSession();
    // Drop legacy anonymous sessions — email/password only.
    if (session?.user?.is_anonymous) {
      await apiSignOut();
      session = null;
    }
    user.value = session?.user ?? null;
    profile.value = user.value ? await fetchUserProfile(user.value) : null;
    authError.value = null;
  }

  async function initAuth() {
    if (!isSupabaseConfigured()) {
      configured.value = false;
      user.value = null;
      profile.value = null;
      authReady.value = true;
      return;
    }
    try {
      await syncFromSession();
      if (!unsub) {
        unsub = onAuthStateChange(() => {
          void syncFromSession();
        });
      }
    } catch (e) {
      authError.value = toApiError(e).message;
      user.value = null;
      profile.value = null;
    } finally {
      authReady.value = true;
    }
  }

  async function signUp(email: string, password: string, displayName?: string) {
    await signUpWithPassword(email, password, displayName);
    await syncFromSession();
  }

  async function signIn(email: string, password: string) {
    await signInWithPassword(email, password);
    await syncFromSession();
  }

  async function signOut() {
    await apiSignOut();
    user.value = null;
    profile.value = null;
  }

  async function setDisplayName(name: string) {
    await updateProfileDisplayName(name);
    if (user.value) {
      profile.value = await fetchUserProfile(user.value);
    }
  }

  return {
    configured,
    cloud,
    authReady,
    authError,
    user,
    profile,
    isSignedIn,
    displayLabel,
    initAuth,
    signUp,
    signIn,
    signOut,
    setDisplayName,
    syncFromSession,
  };
});
