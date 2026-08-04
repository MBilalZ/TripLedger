<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import InputNumber from "primevue/inputnumber";
import Select from "primevue/select";
import Textarea from "primevue/textarea";
import Tag from "primevue/tag";
import Checkbox from "primevue/checkbox";
import Menu from "primevue/menu";
import type { MenuItem } from "primevue/menuitem";
import { formatPkr, paisaToRupees } from "@tripledger/engine";
import type {
  SettlementRounding,
  SplitMode,
  TransferMode,
} from "@tripledger/types";
import { useTripWorkspace } from "@/composables/useTripWorkspace";
import { downloadTripJson } from "@/lib/backup";
import { copyWhatsAppSummary } from "@/lib/whatsapp";
import { exportTripExcel } from "@/lib/exportExcel";
import { exportTripPdf } from "@/lib/exportPdf";
import { useTripsStore } from "@/stores/trips";
import SplitMatrix, {
  type SplitPerson,
} from "@/components/SplitMatrix.vue";

type MainTab = "expenses" | "balances" | "settle" | "more";
type MoreSection = "menu" | "people" | "pools" | "adjustments";

const props = defineProps<{ tripId: string }>();
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();
const trips = useTripsStore();
const activeTab = ref<MainTab>("expenses");
const moreSection = ref<MoreSection>("menu");
const exportMenu = ref<InstanceType<typeof Menu> | null>(null);

const {
  trip,
  participants,
  pools,
  expenses,
  expenseSplits,
  adjustments,
  settlement,
  loading,
  participantName,
  poolName,
  addParticipant,
  removeParticipant,
  updateParticipant,
  updateTrip,
  addPool,
  removePool,
  updatePool,
  setPoolSplitMode,
  upsertPoolMember,
  poolMember,
  addExpense,
  reviseExpense,
  voidExpense,
  addAdjustment,
  updateAdjustment,
  removeAdjustment,
  updateSettlementSettings,
} = useTripWorkspace(() => props.tripId);

const SPLIT_MODES: { label: string; value: SplitMode }[] = [
  { label: "Equal", value: "equal" },
  { label: "Shares / heads", value: "shares" },
  { label: "Percent", value: "percent" },
  { label: "Exact amounts", value: "exact" },
];

const TRANSFER_MODES: { label: string; value: TransferMode }[] = [
  { label: "Minimize transactions", value: "minimize" },
  { label: "Settle to one person", value: "settle_to_one" },
  { label: "Pairwise (proportional)", value: "pairwise" },
];

const ROUNDING_MODES: { label: string; value: SettlementRounding }[] = [
  { label: "Whole rupees", value: "rupee" },
  { label: "Exact paisa", value: "none" },
];

const categories = ["Fuel", "Food", "Hotel", "Toll", "Shopping", "Misc"];

const editingTrip = ref(false);
const tripNameDraft = ref("");
const tripCurrencyDraft = ref("PKR");

const editingParticipantId = ref<string | null>(null);
const newParticipant = ref("");

const editingPoolId = ref<string | null>(null);
const newPool = ref("");
const poolNameDraft = ref("");

const editingExpenseId = ref<string | null>(null);
const useCustomSplit = ref(false);
const customSplitMode = ref<SplitMode>("equal");
const customSplits = ref<SplitPerson[]>([]);

const editingAdjustmentId = ref<string | null>(null);

const expenseForm = reactive({
  description: "",
  category: "Misc",
  poolId: "",
  paidById: "",
  amountRupees: null as number | null,
  date: new Date().toISOString().slice(0, 10),
  notes: "",
});
const adjForm = reactive({
  fromId: "",
  toId: "",
  amountRupees: null as number | null,
  reason: "",
});

watch(
  [participants, useCustomSplit],
  () => {
    if (!useCustomSplit.value) return;
    customSplits.value = participants.value.map((p) => {
      const prev = customSplits.value.find((x) => x.participantId === p.id);
      return (
        prev ?? {
          participantId: p.id,
          displayName: p.displayName,
          included: true,
          shares: 1,
          percentBps: 0,
          exactPaisa: 0,
        }
      );
    });
  },
  { immediate: true },
);

const balanced = computed(() => settlement.value?.consistency.ok ?? false);
const expenseFormTitle = computed(() =>
  editingExpenseId.value ? "Edit expense" : "Add expense",
);
const adjFormTitle = computed(() =>
  editingAdjustmentId.value ? "Edit adjustment" : "Add adjustment",
);

const moreTitle = computed(() => {
  if (moreSection.value === "people") return "People";
  if (moreSection.value === "pools") return "Pools";
  if (moreSection.value === "adjustments") return "Adjustments";
  return "More";
});

const reversedExpenses = computed(() => [...expenses.value].reverse());

function setTab(tab: MainTab) {
  if (tab === "more" && activeTab.value === "more") {
    moreSection.value = "menu";
  } else if (tab !== "more") {
    moreSection.value = "menu";
  }
  activeTab.value = tab;
}

function openMore(section: MoreSection) {
  moreSection.value = section;
  activeTab.value = "more";
}

function peopleForPool(poolId: string): SplitPerson[] {
  return participants.value.map((p) => {
    const m = poolMember(poolId, p.id);
    return {
      participantId: p.id,
      displayName: p.displayName,
      included: m?.included ?? false,
      shares: m?.shares ?? 1,
      percentBps: m?.percentBps ?? 0,
      exactPaisa: m?.exactPaisa ?? 0,
    };
  });
}

function poolTotal(poolId: string) {
  return settlement.value?.pools.find((p) => p.poolId === poolId)?.totalPaisa ?? 0;
}

async function onPoolMemberChange(
  poolId: string,
  participantId: string,
  patch: Partial<SplitPerson>,
) {
  await upsertPoolMember(poolId, participantId, {
    included: patch.included,
    shares: patch.shares,
    percentBps: patch.percentBps,
    exactPaisa: patch.exactPaisa,
  });
}

function startEditTrip() {
  if (!trip.value) return;
  editingTrip.value = true;
  tripNameDraft.value = trip.value.name;
  tripCurrencyDraft.value = trip.value.currency;
}

function cancelEditTrip() {
  editingTrip.value = false;
}

async function saveTrip() {
  try {
    await updateTrip({
      name: tripNameDraft.value,
      currency: tripCurrencyDraft.value,
    });
    editingTrip.value = false;
    toast.add({ severity: "success", summary: "Trip updated", life: 2000 });
  } catch (e) {
    toast.add({
      severity: "error",
      summary: "Failed",
      detail: e instanceof Error ? e.message : String(e),
      life: 3000,
    });
  }
}

function startEditParticipant(id: string, name: string) {
  editingParticipantId.value = id;
  newParticipant.value = name;
}

function cancelEditParticipant() {
  editingParticipantId.value = null;
  newParticipant.value = "";
}

async function saveParticipant() {
  try {
    if (editingParticipantId.value) {
      await updateParticipant(editingParticipantId.value, {
        displayName: newParticipant.value,
      });
      toast.add({ severity: "success", summary: "Person updated", life: 2000 });
    } else {
      await addParticipant(newParticipant.value);
      toast.add({ severity: "success", summary: "Person added", life: 2000 });
    }
    cancelEditParticipant();
  } catch (e) {
    toast.add({
      severity: "error",
      summary: "Failed",
      detail: e instanceof Error ? e.message : String(e),
      life: 3000,
    });
  }
}

function startEditPoolName(id: string, name: string) {
  editingPoolId.value = id;
  poolNameDraft.value = name;
}

function cancelEditPoolName() {
  editingPoolId.value = null;
  poolNameDraft.value = "";
}

async function savePoolName() {
  if (!editingPoolId.value) return;
  try {
    await updatePool(editingPoolId.value, { name: poolNameDraft.value });
    cancelEditPoolName();
    toast.add({ severity: "success", summary: "Pool updated", life: 2000 });
  } catch (e) {
    toast.add({
      severity: "error",
      summary: "Failed",
      detail: e instanceof Error ? e.message : String(e),
      life: 3000,
    });
  }
}

function clearExpenseForm() {
  editingExpenseId.value = null;
  expenseForm.description = "";
  expenseForm.category = "Misc";
  expenseForm.poolId = pools.value[0]?.id ?? "";
  expenseForm.paidById = participants.value[0]?.id ?? "";
  expenseForm.amountRupees = null;
  expenseForm.date = new Date().toISOString().slice(0, 10);
  expenseForm.notes = "";
  useCustomSplit.value = false;
  customSplitMode.value = "equal";
  customSplits.value = [];
}

function startEditExpense(expenseId: string) {
  const e = expenses.value.find((x) => x.id === expenseId);
  if (!e) return;
  editingExpenseId.value = expenseId;
  expenseForm.description = e.description;
  expenseForm.category = e.category || "Misc";
  expenseForm.poolId = e.poolId;
  expenseForm.paidById = e.paidById;
  expenseForm.amountRupees = paisaToRupees(e.amountPaisa);
  expenseForm.date = e.date;
  expenseForm.notes = e.notes;
  useCustomSplit.value = !!e.splitMode;
  customSplitMode.value = e.splitMode ?? "equal";
  if (e.splitMode) {
    const splits = expenseSplits.value.filter((s) => s.expenseId === e.id);
    customSplits.value = participants.value.map((p) => {
      const s = splits.find((x) => x.participantId === p.id);
      return {
        participantId: p.id,
        displayName: p.displayName,
        included: s?.included ?? false,
        shares: s?.shares ?? 1,
        percentBps: s?.percentBps ?? 0,
        exactPaisa: s?.exactPaisa ?? 0,
      };
    });
  }
}

function expensePayload() {
  return {
    ...expenseForm,
    amountRupees: Number(expenseForm.amountRupees ?? 0),
    splitMode: useCustomSplit.value ? customSplitMode.value : null,
    splits: useCustomSplit.value
      ? customSplits.value.map((s) => ({
          participantId: s.participantId,
          included: s.included,
          shares: s.shares,
          percentBps: s.percentBps,
          exactPaisa: s.exactPaisa,
        }))
      : undefined,
  };
}

async function onSaveExpense() {
  try {
    if (!expenseForm.poolId) expenseForm.poolId = pools.value[0]?.id ?? "";
    if (!expenseForm.paidById)
      expenseForm.paidById = participants.value[0]?.id ?? "";
    const payload = expensePayload();
    if (editingExpenseId.value) {
      await reviseExpense(editingExpenseId.value, payload);
      toast.add({ severity: "success", summary: "Expense updated", life: 2000 });
    } else {
      await addExpense(payload);
      toast.add({ severity: "success", summary: "Expense added", life: 2000 });
    }
    clearExpenseForm();
  } catch (e) {
    toast.add({
      severity: "error",
      summary: "Failed",
      detail: e instanceof Error ? e.message : String(e),
      life: 3000,
    });
  }
}

function clearAdjForm() {
  editingAdjustmentId.value = null;
  adjForm.fromId = "";
  adjForm.toId = "";
  adjForm.amountRupees = null;
  adjForm.reason = "";
}

function startEditAdjustment(id: string) {
  const a = adjustments.value.find((x) => x.id === id);
  if (!a) return;
  editingAdjustmentId.value = id;
  adjForm.fromId = a.fromId;
  adjForm.toId = a.toId;
  adjForm.amountRupees = paisaToRupees(a.amountPaisa);
  adjForm.reason = a.reason;
}

async function onSaveAdj() {
  try {
    const payload = {
      fromId: adjForm.fromId,
      toId: adjForm.toId,
      amountRupees: Number(adjForm.amountRupees ?? 0),
      reason: adjForm.reason,
    };
    if (editingAdjustmentId.value) {
      await updateAdjustment(editingAdjustmentId.value, payload);
      toast.add({
        severity: "success",
        summary: "Adjustment updated",
        life: 2000,
      });
    } else {
      await addAdjustment(payload);
      toast.add({
        severity: "success",
        summary: "Adjustment added",
        life: 2000,
      });
    }
    clearAdjForm();
  } catch (e) {
    toast.add({
      severity: "error",
      summary: "Failed",
      detail: e instanceof Error ? e.message : String(e),
      life: 3000,
    });
  }
}

async function copyWa() {
  if (!trip.value || !settlement.value) return;
  if (!settlement.value.consistency.ok) {
    toast.add({
      severity: "warn",
      summary: "Not balanced",
      detail: "Fix consistency errors before sharing settlement",
      life: 4000,
    });
    return;
  }
  await copyWhatsAppSummary(trip.value.name, settlement.value);
  toast.add({ severity: "success", summary: "Copied for WhatsApp", life: 2000 });
}

function deleteTrip() {
  confirm.require({
    message: "Delete this trip from this device?",
    header: "Confirm",
    icon: "pi pi-exclamation-triangle",
    accept: async () => {
      await trips.deleteTrip(props.tripId);
      router.push("/");
    },
  });
}

function formatTransferAmount(amountRupees: number) {
  if (!trip.value) return "";
  return trip.value.settlementRounding === "none"
    ? amountRupees.toLocaleString("en-PK", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : Math.round(amountRupees).toLocaleString("en-PK");
}

const exportItems = computed<MenuItem[]>(() => [
  {
    label: "WhatsApp",
    icon: "pi pi-whatsapp",
    command: () => copyWa(),
  },
  {
    label: "Excel",
    icon: "pi pi-file-excel",
    command: () => exportTripExcel(props.tripId),
  },
  {
    label: "PDF",
    icon: "pi pi-file-pdf",
    command: () => exportTripPdf(props.tripId),
  },
  {
    label: "JSON",
    icon: "pi pi-download",
    command: () => downloadTripJson(props.tripId),
  },
  { separator: true },
  {
    label: "Delete trip",
    icon: "pi pi-trash",
    class: "tl-menu-danger",
    command: () => deleteTrip(),
  },
]);

function toggleExport(event: Event) {
  exportMenu.value?.toggle(event);
}

const chartByCategory = computed(() => {
  const map = new Map<string, number>();
  for (const e of expenses.value) {
    map.set(
      e.category || "Misc",
      (map.get(e.category || "Misc") ?? 0) + e.amountPaisa,
    );
  }
  const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
  return [...map.entries()]
    .map(([name, paisa]) => ({
      name,
      paisa,
      pct: Math.round((paisa / total) * 100),
    }))
    .sort((a, b) => b.paisa - a.paisa);
});
</script>

<template>
  <div v-if="loading" class="text-tl-muted">Loading…</div>
  <div v-else-if="!trip" class="tl-card">Trip not found.</div>
  <div v-else class="tl-has-bottom-nav space-y-4">
    <!-- Trip header -->
    <div class="tl-card space-y-3">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex-1">
          <router-link to="/" class="text-xs text-tl-accent no-underline"
            >← All trips</router-link
          >
          <div v-if="!editingTrip" class="mt-1 flex flex-wrap items-center gap-2">
            <h1 class="text-2xl font-semibold text-tl">{{ trip.name }}</h1>
            <Button
              icon="pi pi-pencil"
              text
              rounded
              size="small"
              v-tooltip="'Edit trip'"
              @click="startEditTrip"
            />
            <span class="text-sm text-tl-muted">{{ trip.currency }}</span>
          </div>
          <div v-else class="mt-2 flex flex-col gap-2">
            <div>
              <label class="tl-input-label">Trip name</label>
              <InputText v-model="tripNameDraft" class="w-full" />
            </div>
            <div class="flex flex-wrap items-end gap-2">
              <div>
                <label class="tl-input-label">Currency</label>
                <InputText v-model="tripCurrencyDraft" class="w-24" />
              </div>
              <Button label="Save" size="small" @click="saveTrip" />
              <Button
                label="Cancel"
                size="small"
                severity="secondary"
                outlined
                @click="cancelEditTrip"
              />
            </div>
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <Tag
              :severity="balanced ? 'success' : 'danger'"
              :value="balanced ? 'Balanced' : 'Consistency error'"
            />
            <span class="text-sm text-tl-muted">
              Total {{ formatPkr(settlement?.summary.tripTotalPaisa ?? 0, 0) }}
            </span>
          </div>
        </div>
        <div>
          <Button
            icon="pi pi-share-alt"
            severity="secondary"
            outlined
            rounded
            aria-haspopup="true"
            aria-controls="trip_export_menu"
            v-tooltip="'Share & export'"
            @click="toggleExport"
          />
          <Menu
            id="trip_export_menu"
            ref="exportMenu"
            :model="exportItems"
            popup
          />
        </div>
      </div>
    </div>

    <!-- Expenses -->
    <div v-show="activeTab === 'expenses'" class="space-y-4">
      <div class="tl-card grid gap-3">
        <div class="flex items-center justify-between">
          <h3 class="tl-section-title mb-0">{{ expenseFormTitle }}</h3>
          <Button
            v-if="editingExpenseId"
            label="Cancel"
            size="small"
            severity="secondary"
            text
            @click="clearExpenseForm"
          />
        </div>
        <div>
          <label class="tl-input-label">Description</label>
          <InputText v-model="expenseForm.description" class="w-full" />
        </div>
        <div>
          <label class="tl-input-label">Amount (Rs)</label>
          <InputNumber
            v-model="expenseForm.amountRupees"
            class="w-full"
            :min-fraction-digits="0"
            :max-fraction-digits="2"
          />
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label class="tl-input-label">Pool</label>
            <Select
              v-model="expenseForm.poolId"
              :options="pools"
              option-label="name"
              option-value="id"
              placeholder="Select pool"
              class="w-full"
            />
          </div>
          <div>
            <label class="tl-input-label">Paid by</label>
            <Select
              v-model="expenseForm.paidById"
              :options="participants"
              option-label="displayName"
              option-value="id"
              placeholder="Payer"
              class="w-full"
            />
          </div>
          <div>
            <label class="tl-input-label">Category</label>
            <Select
              v-model="expenseForm.category"
              :options="categories"
              class="w-full"
            />
          </div>
          <div>
            <label class="tl-input-label">Date</label>
            <InputText v-model="expenseForm.date" type="date" class="w-full" />
          </div>
        </div>
        <div>
          <label class="tl-input-label">Notes</label>
          <Textarea v-model="expenseForm.notes" rows="2" class="w-full" />
        </div>
        <div class="flex items-center gap-2">
          <Checkbox v-model="useCustomSplit" binary input-id="custom-split" />
          <label for="custom-split" class="text-sm"
            >Custom split (override pool default)</label
          >
        </div>
        <div v-if="useCustomSplit" class="space-y-3">
          <Select
            v-model="customSplitMode"
            :options="SPLIT_MODES"
            option-label="label"
            option-value="value"
            class="w-full"
          />
          <SplitMatrix
            :mode="customSplitMode"
            :people="customSplits"
            :total-paisa="Math.round(Number(expenseForm.amountRupees ?? 0) * 100)"
            @change="
              (pid, patch) => {
                const row = customSplits.find((x) => x.participantId === pid);
                if (row) Object.assign(row, patch);
              }
            "
          />
        </div>
        <div class="flex flex-wrap gap-2">
          <Button
            :label="editingExpenseId ? 'Save expense' : 'Add expense'"
            :icon="editingExpenseId ? 'pi pi-check' : 'pi pi-plus'"
            @click="onSaveExpense"
          />
        </div>
      </div>

      <div class="tl-card">
        <h3 class="tl-section-title">Expenses</h3>
        <p v-if="!reversedExpenses.length" class="text-sm text-tl-muted">
          No expenses yet.
        </p>
        <div
          v-for="e in reversedExpenses"
          :key="e.id"
          class="tl-expense-card"
          :class="{ 'is-editing': editingExpenseId === e.id }"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="font-medium text-tl">{{ e.description }}</div>
              <div class="mt-1 text-xs text-tl-muted">
                {{ e.date }} · {{ e.category }} · {{ poolName(e.poolId) }}
              </div>
              <div class="mt-1 text-xs text-tl-muted">
                Paid by {{ participantName(e.paidById) }} ·
                {{ e.splitMode ? `custom · ${e.splitMode}` : "pool default" }}
              </div>
            </div>
            <div class="text-right">
              <div class="font-semibold text-tl-accent-bright">
                {{ formatPkr(e.amountPaisa) }}
              </div>
              <div class="mt-1 flex justify-end gap-1">
                <Button
                  icon="pi pi-pencil"
                  text
                  rounded
                  size="small"
                  @click="startEditExpense(e.id)"
                />
                <Button
                  icon="pi pi-trash"
                  text
                  severity="danger"
                  rounded
                  size="small"
                  @click="voidExpense(e.id)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Balances (was Dashboard) -->
    <div v-show="activeTab === 'balances'" class="space-y-4">
      <div class="tl-card">
        <h2 class="tl-section-title">Per person</h2>
        <div
          v-for="p in settlement?.participants ?? []"
          :key="p.participantId"
          class="tl-list-row"
        >
          <div class="min-w-0">
            <div class="font-medium text-tl">{{ p.displayName }}</div>
            <div class="text-xs text-tl-muted">
              Paid {{ formatPkr(p.paidPaisa, 0) }} · Share
              {{ formatPkr(p.sharePaisa) }}
            </div>
          </div>
          <div
            class="font-semibold"
            :class="p.balancePaisa >= 0 ? 'money-pos' : 'money-neg'"
          >
            {{ formatPkr(p.balancePaisa) }}
          </div>
        </div>
        <p
          v-if="!(settlement?.participants.length)"
          class="text-sm text-tl-muted"
        >
          Add people to see balances.
        </p>
      </div>

      <div class="tl-card">
        <h2 class="tl-section-title">Pools</h2>
        <div
          v-for="p in settlement?.pools ?? []"
          :key="p.poolId"
          class="tl-list-row"
        >
          <span class="text-sm"
            >{{ p.name }}
            <span class="text-tl-muted"
              >({{ p.splitMode
              }}{{ p.headCount ? ` · ${p.headCount}` : "" }})</span
            ></span
          >
          <span class="font-medium">{{ formatPkr(p.totalPaisa, 0) }}</span>
        </div>
        <h3 class="mb-2 mt-4 text-sm text-tl-muted">By category</h3>
        <div class="space-y-2">
          <div v-for="c in chartByCategory" :key="c.name">
            <div class="mb-1 flex justify-between text-xs text-tl-muted">
              <span>{{ c.name }}</span>
              <span>{{ formatPkr(c.paisa, 0) }} · {{ c.pct }}%</span>
            </div>
            <div class="tl-bar-track">
              <div class="tl-bar-fill" :style="{ width: `${c.pct}%` }" />
            </div>
          </div>
        </div>
      </div>

      <div class="tl-card">
        <h2 class="tl-section-title">Who pays whom</h2>
        <div v-if="!balanced" class="tl-alert mb-3">
          <div class="font-medium">Settlement blocked</div>
          <ul class="mt-1 list-disc pl-5">
            <li
              v-for="(v, i) in settlement?.consistency.violations ?? []"
              :key="i"
            >
              {{ v.id }}: {{ v.message }}
            </li>
          </ul>
        </div>
        <div
          v-else-if="!(settlement?.settlements.length)"
          class="text-tl-muted text-sm"
        >
          All settled — nothing to pay.
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="(t, i) in settlement?.settlements"
            :key="i"
            class="tl-transfer-card"
          >
            <span
              ><strong>{{ t.fromName }}</strong> →
              <strong>{{ t.toName }}</strong></span
            >
            <span class="text-lg font-semibold text-tl-accent-bright">
              Rs. {{ formatTransferAmount(t.amountRupees) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Settle -->
    <div v-show="activeTab === 'settle'" class="space-y-4">
      <div class="tl-card grid gap-4">
        <div>
          <label class="tl-input-label">Transfer strategy</label>
          <Select
            :model-value="trip.transferMode"
            :options="TRANSFER_MODES"
            option-label="label"
            option-value="value"
            class="w-full"
            @update:model-value="
              (v) => updateSettlementSettings({ transferMode: v as TransferMode })
            "
          />
          <p class="mt-1 text-xs text-tl-muted">
            Minimize = fewest payments. Settle to one = everyone pays/receives
            via a hub. Pairwise = each debtor pays each creditor
            proportionally.
          </p>
        </div>
        <div>
          <label class="tl-input-label">Rounding</label>
          <Select
            :model-value="trip.settlementRounding"
            :options="ROUNDING_MODES"
            option-label="label"
            option-value="value"
            class="w-full"
            @update:model-value="
              (v) =>
                updateSettlementSettings({
                  settlementRounding: v as SettlementRounding,
                })
            "
          />
        </div>
        <div v-if="trip.transferMode === 'settle_to_one'">
          <label class="tl-input-label">Hub person</label>
          <Select
            :model-value="trip.settlementHubId ?? ''"
            :options="[
              { id: '', displayName: 'Largest creditor (auto)' },
              ...participants,
            ]"
            option-label="displayName"
            option-value="id"
            class="w-full"
            @update:model-value="
              (v) =>
                updateSettlementSettings({
                  settlementHubId: v ? String(v) : null,
                })
            "
          />
        </div>
      </div>
      <div class="tl-card">
        <h2 class="tl-section-title">Preview</h2>
        <div
          v-for="(t, i) in settlement?.settlements ?? []"
          :key="i"
          class="tl-transfer-card mb-2"
        >
          <span class="text-sm">{{ t.fromName }} → {{ t.toName }}</span>
          <span class="font-semibold text-tl-accent-bright">{{
            formatPkr(t.amountPaisa)
          }}</span>
        </div>
        <p
          v-if="!(settlement?.settlements.length)"
          class="text-tl-muted text-sm"
        >
          No transfers needed.
        </p>
      </div>
    </div>

    <!-- More -->
    <div v-show="activeTab === 'more'" class="space-y-4">
      <template v-if="moreSection === 'menu'">
        <div class="tl-card space-y-1">
          <h2 class="tl-section-title">Manage trip</h2>
          <button type="button" class="tl-list-row w-full text-left" @click="openMore('people')">
            <div>
              <div class="font-medium">People</div>
              <div class="text-xs text-tl-muted">
                {{ participants.length }} participant(s)
              </div>
            </div>
            <i class="pi pi-chevron-right text-tl-muted" />
          </button>
          <button type="button" class="tl-list-row w-full text-left" @click="openMore('pools')">
            <div>
              <div class="font-medium">Pools</div>
              <div class="text-xs text-tl-muted">
                {{ pools.length }} pool(s)
              </div>
            </div>
            <i class="pi pi-chevron-right text-tl-muted" />
          </button>
          <button
            type="button"
            class="tl-list-row w-full text-left"
            @click="openMore('adjustments')"
          >
            <div>
              <div class="font-medium">Adjustments</div>
              <div class="text-xs text-tl-muted">
                {{ adjustments.length }} adjustment(s)
              </div>
            </div>
            <i class="pi pi-chevron-right text-tl-muted" />
          </button>
        </div>
      </template>

      <template v-else>
        <div class="flex items-center gap-2">
          <Button
            icon="pi pi-arrow-left"
            text
            rounded
            @click="moreSection = 'menu'"
          />
          <h2 class="text-lg font-semibold text-tl">{{ moreTitle }}</h2>
        </div>

        <!-- People -->
        <div v-if="moreSection === 'people'" class="tl-card space-y-3">
          <div class="flex flex-col gap-2 sm:flex-row">
            <InputText
              v-model="newParticipant"
              :placeholder="editingParticipantId ? 'Edit name' : 'Name'"
              class="w-full"
              @keyup.enter="saveParticipant"
            />
            <div class="flex gap-2">
              <Button
                :label="editingParticipantId ? 'Save' : 'Add'"
                :icon="editingParticipantId ? 'pi pi-check' : 'pi pi-plus'"
                @click="saveParticipant"
              />
              <Button
                v-if="editingParticipantId"
                label="Cancel"
                severity="secondary"
                outlined
                @click="cancelEditParticipant"
              />
            </div>
          </div>
          <div class="divide-y">
            <div
              v-for="p in participants"
              :key="p.id"
              class="tl-list-row"
            >
              <span>{{ p.displayName }}</span>
              <div class="flex gap-1">
                <Button
                  icon="pi pi-pencil"
                  text
                  rounded
                  @click="startEditParticipant(p.id, p.displayName)"
                />
                <Button
                  icon="pi pi-times"
                  severity="danger"
                  text
                  rounded
                  @click="removeParticipant(p.id)"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Pools -->
        <div v-else-if="moreSection === 'pools'" class="space-y-4">
          <div class="tl-card flex flex-col gap-2 sm:flex-row">
            <InputText
              v-model="newPool"
              placeholder="Pool name (e.g. Part A)"
              class="w-full"
              @keyup.enter="
                addPool(newPool);
                newPool = '';
              "
            />
            <Button
              label="Add pool"
              @click="
                addPool(newPool);
                newPool = '';
              "
            />
          </div>
          <div v-for="pool in pools" :key="pool.id" class="tl-card">
            <div class="mb-3 flex flex-col gap-2">
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <template v-if="editingPoolId === pool.id">
                  <InputText v-model="poolNameDraft" class="w-full" />
                  <Button icon="pi pi-check" size="small" @click="savePoolName" />
                  <Button
                    icon="pi pi-times"
                    size="small"
                    severity="secondary"
                    outlined
                    @click="cancelEditPoolName"
                  />
                </template>
                <template v-else>
                  <h3 class="font-medium text-tl-accent-bright">
                    {{ pool.name }}
                  </h3>
                  <Button
                    icon="pi pi-pencil"
                    text
                    rounded
                    size="small"
                    @click="startEditPoolName(pool.id, pool.name)"
                  />
                  <Button
                    icon="pi pi-trash"
                    severity="danger"
                    text
                    class="ml-auto"
                    @click="removePool(pool.id)"
                  />
                </template>
              </div>
              <Select
                :model-value="pool.splitMode"
                :options="SPLIT_MODES"
                option-label="label"
                option-value="value"
                class="w-full"
                @update:model-value="
                  (v) => setPoolSplitMode(pool.id, v as SplitMode)
                "
              />
            </div>
            <SplitMatrix
              :mode="pool.splitMode"
              :people="peopleForPool(pool.id)"
              :total-paisa="poolTotal(pool.id)"
              @change="(pid, patch) => onPoolMemberChange(pool.id, pid, patch)"
            />
          </div>
        </div>

        <!-- Adjustments -->
        <div v-else class="space-y-4">
          <div class="tl-card grid gap-3">
            <div class="flex items-center justify-between">
              <h3 class="tl-section-title mb-0">{{ adjFormTitle }}</h3>
              <Button
                v-if="editingAdjustmentId"
                label="Cancel"
                size="small"
                severity="secondary"
                text
                @click="clearAdjForm"
              />
            </div>
            <div>
              <label class="tl-input-label">From (owes)</label>
              <Select
                v-model="adjForm.fromId"
                :options="participants"
                option-label="displayName"
                option-value="id"
                class="w-full"
              />
            </div>
            <div>
              <label class="tl-input-label">To (is owed)</label>
              <Select
                v-model="adjForm.toId"
                :options="participants"
                option-label="displayName"
                option-value="id"
                class="w-full"
              />
            </div>
            <div>
              <label class="tl-input-label">Amount (Rs)</label>
              <InputNumber
                v-model="adjForm.amountRupees"
                class="w-full"
                :min-fraction-digits="0"
                :max-fraction-digits="2"
              />
            </div>
            <div>
              <label class="tl-input-label">Reason</label>
              <InputText v-model="adjForm.reason" class="w-full" />
            </div>
            <div class="flex flex-wrap gap-2">
              <Button
                :label="
                  editingAdjustmentId ? 'Save adjustment' : 'Add adjustment'
                "
                :icon="editingAdjustmentId ? 'pi pi-check' : 'pi pi-plus'"
                @click="onSaveAdj"
              />
            </div>
          </div>
          <div class="tl-card">
            <div
              v-for="a in adjustments"
              :key="a.id"
              class="tl-list-row"
              :class="{ 'is-editing': editingAdjustmentId === a.id }"
            >
              <div class="min-w-0 text-sm">
                <div>
                  {{ participantName(a.fromId) }} →
                  {{ participantName(a.toId) }}
                </div>
                <div class="font-medium text-tl-accent-bright">
                  {{ formatPkr(a.amountPaisa) }}
                </div>
                <div v-if="a.reason" class="text-xs text-tl-muted">
                  {{ a.reason }}
                </div>
              </div>
              <div class="flex gap-1">
                <Button
                  icon="pi pi-pencil"
                  text
                  rounded
                  @click="startEditAdjustment(a.id)"
                />
                <Button
                  icon="pi pi-times"
                  text
                  severity="danger"
                  @click="removeAdjustment(a.id)"
                />
              </div>
            </div>
            <p v-if="!adjustments.length" class="text-sm text-tl-muted">
              No adjustments yet.
            </p>
          </div>
        </div>
      </template>
    </div>

    <!-- Bottom nav -->
    <nav class="tl-bottom-nav" aria-label="Trip sections">
      <button
        type="button"
        :class="{ 'is-active': activeTab === 'expenses' }"
        @click="setTab('expenses')"
      >
        <i class="pi pi-receipt" />
        Expenses
      </button>
      <button
        type="button"
        :class="{ 'is-active': activeTab === 'balances' }"
        @click="setTab('balances')"
      >
        <i class="pi pi-chart-bar" />
        Balances
      </button>
      <button
        type="button"
        :class="{ 'is-active': activeTab === 'settle' }"
        @click="setTab('settle')"
      >
        <i class="pi pi-sync" />
        Settle
      </button>
      <button
        type="button"
        :class="{ 'is-active': activeTab === 'more' }"
        @click="setTab('more')"
      >
        <i class="pi pi-ellipsis-h" />
        More
      </button>
    </nav>
  </div>
</template>
