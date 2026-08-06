import { computed, ref } from "vue";

export type MainTab = "expenses" | "balances" | "settle" | "pools" | "payments" | "more";

export type MoreSection = "menu" | "people";

export type PaymentPrefill = {
  paidById: string;
  receivedById: string;
  amountRupees: number;
  reason?: string;
};

export function useTripTabs() {
  const activeTab = ref<MainTab>("expenses");
  const moreSection = ref<MoreSection>("menu");
  const paymentPrefill = ref<PaymentPrefill | null>(null);

  const moreTitle = computed(() => {
    if (moreSection.value === "people") return "Friends";
    return "More";
  });

  function setTab(tab: MainTab) {
    if (tab === "more" && activeTab.value === "more") {
      moreSection.value = "menu";
    } else if (tab !== "more") {
      moreSection.value = "menu";
    }
    activeTab.value = tab;
  }

  function openMore(section: MoreSection = "menu") {
    moreSection.value = section;
    activeTab.value = "more";
  }

  function openPaymentsWithPrefill(prefill: PaymentPrefill) {
    paymentPrefill.value = prefill;
    activeTab.value = "payments";
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
    openPaymentsWithPrefill,
    consumePaymentPrefill,
  };
}
