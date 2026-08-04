import { ref } from "vue";
import { createInvite } from "@/api/invites";
import { isSupabaseConfigured } from "@/api/supabase";
import { useAuthStore } from "@/stores/auth";
import { useFeedback } from "./useFeedback";

export function useInviteLink(tripId: () => string) {
  const auth = useAuthStore();
  const { success, error, warn } = useFeedback();
  const inviting = ref(false);

  async function copyInviteLink() {
    if (!isSupabaseConfigured() || !auth.cloud) {
      warn(
        "Shared invites need Supabase",
        "Configure cloud env vars to invite members by link.",
      );
      return;
    }
    inviting.value = true;
    try {
      const token = await createInvite(tripId());
      const url = new URL(
        `join/${token}`,
        `${window.location.origin}${import.meta.env.BASE_URL}`,
      ).href;
      await navigator.clipboard.writeText(url);
      success("Invite link copied", 4000);
    } catch (e) {
      error("Invite failed", e, 4000);
    } finally {
      inviting.value = false;
    }
  }

  return { inviting, copyInviteLink };
}
