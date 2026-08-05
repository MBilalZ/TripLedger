import { ref } from "vue";
import { createInvite, type InviteRow, listInvites, revokeInvite } from "@/api/invites";
import { isSupabaseConfigured } from "@/api/supabase";
import { useAuthStore } from "@/stores/auth";
import { useWorkspaceStore } from "@/stores/workspace";
import { useFeedback } from "./useFeedback";

export function useInviteLink(tripId: () => string) {
  const auth = useAuthStore();
  const workspace = useWorkspaceStore();
  const { success, error, warn } = useFeedback();
  const inviting = ref(false);
  const invites = ref<InviteRow[]>([]);
  const loadingInvites = ref(false);

  function inviteUrl(token: string) {
    return new URL(
      `join/${token}`,
      `${window.location.origin}${import.meta.env.BASE_URL}`,
    ).href;
  }

  async function refreshInvites() {
    if (!auth.cloud || !workspace.isOwner) {
      invites.value = [];
      return;
    }
    loadingInvites.value = true;
    try {
      invites.value = await listInvites(tripId());
    } catch (e) {
      error("Could not load invites", e, 4000);
    } finally {
      loadingInvites.value = false;
    }
  }

  async function copyInviteLink() {
    if (!isSupabaseConfigured() || !auth.cloud) {
      warn(
        "Shared invites need Supabase",
        "Configure cloud env vars to invite members by link.",
      );
      return;
    }
    if (!workspace.isOwner) {
      warn("Owner only", "Only the group owner can create invite links.");
      return;
    }
    inviting.value = true;
    try {
      const token = await createInvite(tripId());
      await navigator.clipboard.writeText(inviteUrl(token));
      success("Invite link copied (expires in 7 days)", 4000);
      await refreshInvites();
    } catch (e) {
      error("Invite failed", e, 4000);
    } finally {
      inviting.value = false;
    }
  }

  async function copyExisting(token: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl(token));
      success("Invite link copied", 3000);
    } catch (e) {
      error("Copy failed", e);
    }
  }

  async function revoke(token: string) {
    try {
      await revokeInvite(token);
      success("Invite revoked");
      await refreshInvites();
    } catch (e) {
      error("Revoke failed", e, 4000);
    }
  }

  return {
    inviting,
    invites,
    loadingInvites,
    copyInviteLink,
    copyExisting,
    revoke,
    refreshInvites,
  };
}
