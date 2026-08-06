import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { toApiError } from "@/services/errors";

export function useFeedback() {
  const toast = useToast();
  const confirm = useConfirm();

  function success(summary: string, life = 2000) {
    toast.add({ severity: "success", summary, life });
  }

  function errorDetail(detail?: unknown): string | undefined {
    if (detail == null || detail === "") return undefined;
    return toApiError(detail).message;
  }

  function error(summary: string, detail?: unknown, life = 3000) {
    toast.add({
      severity: "error",
      summary,
      detail: errorDetail(detail),
      life,
    });
  }

  function warn(summary: string, detail?: string, life = 4000) {
    toast.add({ severity: "warn", summary, detail, life });
  }

  async function run(
    action: () => Promise<void>,
    opts: { success?: string; error?: string } = {},
  ) {
    try {
      await action();
      if (opts.success) success(opts.success);
    } catch (e) {
      error(opts.error ?? "Failed", e);
    }
  }

  function confirmDanger(opts: {
    message: string;
    header: string;
    onAccept: () => void | Promise<void>;
  }) {
    confirm.require({
      message: opts.message,
      header: opts.header,
      icon: "pi pi-exclamation-triangle",
      acceptLabel: "Confirm",
      rejectLabel: "Cancel",
      acceptClass: "p-button-danger",
      rejectClass: "p-button-secondary p-button-outlined",
      defaultFocus: "reject",
      accept: () => {
        void opts.onAccept();
      },
    });
  }

  function confirmAction(opts: {
    message: string;
    header: string;
    onAccept: () => void | Promise<void>;
  }) {
    confirm.require({
      message: opts.message,
      header: opts.header,
      icon: "pi pi-info-circle",
      acceptLabel: "Confirm",
      rejectLabel: "Cancel",
      rejectClass: "p-button-secondary p-button-outlined",
      defaultFocus: "reject",
      accept: () => {
        void opts.onAccept();
      },
    });
  }

  return {
    toast,
    confirm,
    success,
    error,
    warn,
    run,
    confirmDanger,
    confirmAction,
  };
}
