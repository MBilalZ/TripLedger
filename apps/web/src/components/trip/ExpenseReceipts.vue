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
const fileInput = ref<HTMLInputElement | null>(null);

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
  <div class="space-y-2 border-t border-tl pt-2">
    <div class="flex items-center justify-between gap-2">
      <div>
        <div class="text-xs font-medium text-tl-muted">Receipts</div>
        <div v-if="!auth.cloud" class="text-xs text-tl-muted">
          Sign in with cloud to attach images or PDFs.
        </div>
      </div>
      <template v-if="auth.cloud">
        <input
          ref="fileInput"
          type="file"
          class="sr-only"
          accept="image/*,application/pdf"
          :disabled="uploading"
          @change="onFile"
        />
        <Button
          label="Attach"
          icon="pi pi-camera"
          size="small"
          outlined
          :loading="uploading"
          @click="fileInput?.click()"
        />
      </template>
    </div>
    <template v-if="auth.cloud">
      <p v-if="loading" class="text-xs text-tl-muted">Loading…</p>
      <ul v-else class="m-0 list-none space-y-1 p-0">
        <li
          v-for="r in receipts"
          :key="r.id"
          class="flex items-center justify-between gap-2 rounded-md bg-tl-elevated px-2 py-1.5 text-sm"
        >
          <button
            type="button"
            class="truncate text-left text-tl-accent underline"
            @click="openReceipt(r)"
          >
            <i
              class="pi mr-1"
              :class="
                r.contentType.startsWith('image/') ? 'pi-image' : 'pi-file'
              "
              aria-hidden="true"
            />
            {{ r.contentType.startsWith("image/") ? "Photo" : "PDF" }}
            · {{ Math.round(r.byteSize / 1024) }} KB
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
        <li v-if="!receipts.length" class="text-xs text-tl-muted">
          No receipts yet — attach a photo of the bill.
        </li>
      </ul>
    </template>
  </div>
</template>
