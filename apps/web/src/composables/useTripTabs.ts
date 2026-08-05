import { computed, ref } from "vue";

export type MainTab = "expenses" | "balances" | "settle" | "more";
export type MoreSection = "menu" | "people" | "pools" | "adjustments";

export function useTripTabs() {
  const activeTab = ref<MainTab>("expenses");
  const moreSection = ref<MoreSection>("menu");

  const moreTitle = computed(() => {
    if (moreSection.value === "people") return "Friends";
    if (moreSection.value === "pools") return "Pools";
    if (moreSection.value === "adjustments") return "Payments";
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

  function openMore(section: MoreSection) {
    moreSection.value = section;
    activeTab.value = "more";
  }

  return { activeTab, moreSection, moreTitle, setTab, openMore };
}
