import type { SettleTripResult } from "@tripledger/types";
import type { MenuItem } from "primevue/menuitem";
import { computed, type Ref } from "vue";
import { useRouter } from "vue-router";
import type { TripRow } from "@/db/dexie";
import { useTripsStore } from "@/stores/trips";
import { useFeedback } from "./useFeedback";

export function useTripExports(opts: {
  tripId: () => string;
  trip: Ref<TripRow | null>;
  settlement: Ref<SettleTripResult | null>;
}) {
  const trips = useTripsStore();
  const router = useRouter();
  const { success, error, warn, confirmDanger } = useFeedback();

  function assertBalancedForExport(): boolean {
    if (!opts.settlement.value?.consistency.ok) {
      warn(
        "Not balanced",
        "Fix consistency errors before sharing or exporting settlement",
      );
      return false;
    }
    return true;
  }

  async function copyWa() {
    if (!opts.trip.value || !opts.settlement.value) return;
    if (!assertBalancedForExport()) return;
    try {
      const { copyWhatsAppSummary } = await import("@/lib/whatsapp");
      await copyWhatsAppSummary(
        opts.trip.value.name,
        opts.settlement.value,
        opts.trip.value.settlementRounding,
      );
      success("Copied for WhatsApp");
    } catch (e) {
      error("Copy failed", e, 4000);
    }
  }

  async function runExport(
    label: string,
    action: () => Promise<void>,
    requireBalanced: boolean,
  ) {
    if (requireBalanced && !assertBalancedForExport()) return;
    try {
      await action();
      success(`${label} ready`);
    } catch (e) {
      error(`${label} failed`, e, 4000);
    }
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
      command: () =>
        runExport(
          "Excel",
          async () => {
            const { exportTripExcel } = await import("@/lib/exportExcel");
            await exportTripExcel(opts.tripId());
          },
          true,
        ),
    },
    {
      label: "PDF",
      icon: "pi pi-file-pdf",
      command: () =>
        runExport(
          "PDF",
          async () => {
            const { exportTripPdf } = await import("@/lib/exportPdf");
            await exportTripPdf(opts.tripId());
          },
          true,
        ),
    },
    {
      label: "JSON",
      icon: "pi pi-download",
      command: () =>
        runExport(
          "JSON",
          async () => {
            const { downloadTripJson } = await import("@/lib/backup");
            await downloadTripJson(opts.tripId());
          },
          false,
        ),
    },
  ]);

  function deleteTrip() {
    confirmDanger({
      message: "Delete this trip from this device?",
      header: "Delete trip",
      onAccept: async () => {
        await trips.deleteTrip(opts.tripId());
        router.push("/");
      },
    });
  }

  function formatTransferAmount(amountRupees: number) {
    if (!opts.trip.value) return "";
    return opts.trip.value.settlementRounding === "none"
      ? amountRupees.toLocaleString("en-PK", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : Math.round(amountRupees).toLocaleString("en-PK");
  }

  return {
    exportItems,
    deleteTrip,
    formatTransferAmount,
  };
}
