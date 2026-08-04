import { computed, onMounted, ref, watch } from "vue";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "tl-theme";

const preference = ref<ThemePreference>("system");
const systemDark = ref(false);
let media: MediaQueryList | null = null;
let initialized = false;

function readStored(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

function isDarkResolved(pref: ThemePreference, sysDark: boolean) {
  return pref === "dark" || (pref === "system" && sysDark);
}

function applyDom(dark: boolean) {
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", dark ? "#0f766e" : "#0d9488");
  }
}

function onSystemChange(e: MediaQueryListEvent) {
  systemDark.value = e.matches;
}

function ensureInit() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  preference.value = readStored();
  media = window.matchMedia("(prefers-color-scheme: dark)");
  systemDark.value = media.matches;
  media.addEventListener("change", onSystemChange);
  applyDom(isDarkResolved(preference.value, systemDark.value));
}

export function useTheme() {
  ensureInit();

  const isDark = computed(() =>
    isDarkResolved(preference.value, systemDark.value),
  );

  watch([preference, systemDark], () => {
    applyDom(isDark.value);
  });

  onMounted(() => {
    ensureInit();
  });

  function setPreference(next: ThemePreference) {
    preference.value = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  /** Cycle light ↔ dark (system becomes light or dark based on current resolved). */
  function toggle() {
    setPreference(isDark.value ? "light" : "dark");
  }

  return {
    preference,
    isDark,
    setPreference,
    toggle,
  };
}

/** Call once at app bootstrap before mount. */
export function initTheme() {
  ensureInit();
}
