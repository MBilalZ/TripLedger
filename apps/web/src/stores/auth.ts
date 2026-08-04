import { defineStore } from "pinia";
import { ref } from "vue";
import { ensureAuthSession, isSupabaseConfigured } from "@/api/supabase";

export const useAuthStore = defineStore("auth", () => {
  const cloud = ref(isSupabaseConfigured());
  const authReady = ref(!isSupabaseConfigured());
  const authError = ref<string | null>(null);

  async function initAuth() {
    if (!isSupabaseConfigured()) {
      cloud.value = false;
      authReady.value = true;
      return;
    }
    try {
      await ensureAuthSession();
      cloud.value = true;
      authError.value = null;
    } catch (e) {
      authError.value =
        e instanceof Error ? e.message : "Could not sign in anonymously";
      cloud.value = false;
    } finally {
      authReady.value = true;
    }
  }

  return {
    cloud,
    authReady,
    authError,
    initAuth,
  };
});
