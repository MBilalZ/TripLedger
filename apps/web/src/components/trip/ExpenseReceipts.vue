<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import Button from "primevue/button";
import {
  deleteReceipt,
  getReceiptSignedUrl,
  listReceipts,
  uploadReceipt,
  type ExpenseReceiptMeta,
} from "@/api/receipts";
import { useAuthStore } from "@/stores/auth";
import { useFeedback } from "@/composables/useFeedback";

const props = defineProps<{
  tripId: string;
  expenseId: string;
}>();

const auth = useAuthStore();
const { success, error } = useFeedback();
const receipts = ref<ExpenseReceiptMeta[]>([]);
const loading = ref(false);
const uploading = ref(false);

async function refresh() {
  if (!auth.cloud) {
    receipts.value = [];
    return;
  }
  loading.value = true;
  try {
    receipts.value = await listReceipts(props.tripId, props.expenseId);
  } catch (e) {
    error("Receipts", e);
  } finally {
    loading.value = false;
  }
}

async function onFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  uploading.value = true;
  try {
    await uploadReceipt(props.tripId, props.expenseId, file);
    success("Receipt uploaded");
    await refresh();
  } catch (e) {
    error("Upload failed", e);
  } finally {
    uploading.value = false;
  }
}

async function openReceipt(r: ExpenseReceiptMeta) {
  try {
    const url = await getReceiptSignedUrl(r.storagePath);
    window.open(url, "_blank", "noopener,noreferrer");
  } catch (e) {
    error("Could not open receipt", e);
  }
}

async function remove(r: ExpenseReceiptMeta) {
  try {
    await deleteReceipt(r.id, r.storagePath);
    success("Receipt deleted");
    await refresh();
  } catch (e) {
    error("Delete failed", e);
  }
}

onMounted(refresh);
watch(
  () => [props.tripId, props.expenseId],
  () => void refresh(),
);
</script>

<template>
  <div v-if="auth.cloud" class="space-y-2 border-t border-tl-border pt-2">
    <div class="flex items-center justify-between gap-2">
      <span class="text-xs font-medium text-tl-muted">Receipts</span>
      <label class="inline-flex">
        <input
          type="file"
          class="sr-only"
          accept="image/*,application/pdf"
          :disabled="uploading"
          @change="onFile"
        />
        <Button
          as="span"
          label="Attach"
          icon="pi pi-paperclip"
          size="small"
          text
          :loading="uploading"
        />
      </label>
    </div>
    <p v-if="loading" class="text-xs text-tl-muted">Loading…</p>
    <ul v-else class="m-0 list-none space-y-1 p-0">
      <li
        v-for="r in receipts"
        :key="r.id"
        class="flex items-center justify-between gap-2 text-sm"
      >
        <button
          type="button"
          class="truncate text-left text-tl-accent underline"
          @click="openReceipt(r)"
        >
          {{ r.contentType.startsWith("image/") ? "Image" : "File" }}
          ({{ Math.round(r.byteSize / 1024) }} KB)
        </button>
        <Button
          icon="pi pi-trash"
          severity="danger"
          text
          rounded
          size="small"
          aria-label="Delete receipt"
          @click="remove(r)"
        />
      </li>
      <li v-if="!receipts.length" class="text-xs text-tl-muted">No receipts</li>
    </ul>
  </div>
</template>
