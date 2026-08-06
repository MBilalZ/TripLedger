import { computed, ref, watch } from "vue";

export type MainTab = "expenses" | "balances" | "settle" | "pools" | "payments" | "more";

export type MoreSection = "menu" | "people";

export type PaymentPrefill = {
  paidById: string;
  receivedById: string;
  amountRupees: number;
  reason?: string;
};

const MAIN_TABS: ReadonlySet<MainTab> = new Set([
  "expenses",
  "balances",
  "settle",
  "pools",
  "payments",
  "more",
]);

const MORE_SECTIONS: ReadonlySet<MoreSection> = new Set(["menu", "people"]);

type PersistedTripUi = {
  activeTab: MainTab;
  moreSection: MoreSection;
};

function storageKey(tripId: string) {
  return `tl:tripUi:${tripId}`;
}

function readPersisted(tripId: string): PersistedTripUi | null {
  if (typeof localStorage === "undefined" || !tripId) return null;
  try {
    const raw = localStorage.getItem(storageKey(tripId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedTripUi>;
    const activeTab = parsed.activeTab;
    const moreSection = parsed.moreSection;
    if (
      typeof activeTab !== "string" ||
      !MAIN_TABS.has(activeTab as MainTab) ||
      typeof moreSection !== "string" ||
      !MORE_SECTIONS.has(moreSection as MoreSection)
    ) {
      return null;
    }
    return {
      activeTab: activeTab as MainTab,
      moreSection: moreSection as MoreSection,
    };
  } catch {
    return null;
  }
}

function writePersisted(tripId: string, ui: PersistedTripUi) {
  if (typeof localStorage === "undefined" || !tripId) return;
  try {
    localStorage.setItem(storageKey(tripId), JSON.stringify(ui));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function useTripTabs(tripId: () => string) {
  const initial = readPersisted(tripId());
  const activeTab = ref<MainTab>(initial?.activeTab ?? "expenses");
  const moreSection = ref<MoreSection>(initial?.moreSection ?? "menu");
  const paymentPrefill = ref<PaymentPrefill | null>(null);

  const moreTitle = computed(() => {
    if (moreSection.value === "people") return "Friends";
    return "More";
  });

  function persist() {
    writePersisted(tripId(), {
      activeTab: activeTab.value,
      moreSection: moreSection.value,
    });
  }

  watch(
    () => tripId(),
    (id) => {
      const saved = readPersisted(id);
      activeTab.value = saved?.activeTab ?? "expenses";
      moreSection.value = saved?.moreSection ?? "menu";
      paymentPrefill.value = null;
    },
  );

  function setTab(tab: MainTab) {
    if (tab === "more" && activeTab.value === "more") {
      moreSection.value = "menu";
    } else if (tab !== "more") {
      moreSection.value = "menu";
    }
    activeTab.value = tab;
    persist();
  }

  function openMore(section: MoreSection = "menu") {
    moreSection.value = section;
    activeTab.value = "more";
    persist();
  }

  function setMoreSection(section: MoreSection) {
    moreSection.value = section;
    persist();
  }

  function openPaymentsWithPrefill(prefill: PaymentPrefill) {
    paymentPrefill.value = prefill;
    activeTab.value = "payments";
    persist();
  }

  function consumePaymentPrefill(): PaymentPrefill | null {
    const value = paymentPrefill.value;
    paymentPrefill.value = null;
    return value;
  }

  return {
    activeTab,
    moreSection,
    moreTitle,
    paymentPrefill,
    setTab,
    openMore,
    setMoreSection,
    openPaymentsWithPrefill,
    consumePaymentPrefill,
  };
}
