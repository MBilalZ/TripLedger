import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";

export function useFeedback() {
  const toast = useToast();
  const confirm = useConfirm();

  function success(summary: string, life = 2000) {
    toast.add({ severity: "success", summary, life });
  }

  function error(summary: string, detail?: unknown, life = 3000) {
    toast.add({
      severity: "error",
      summary,
      detail: detail instanceof Error ? detail.message : detail ? String(detail) : undefined,
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
      acceptClass: "p-button-danger",
      accept: () => {
        void opts.onAccept();
      },
    });
  }

  return { toast, confirm, success, error, warn, run, confirmDanger };
}
