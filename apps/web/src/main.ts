import { definePreset } from "@primevue/themes";
import Aura from "@primevue/themes/aura";
import { createPinia } from "pinia";
import PrimeVue from "primevue/config";
import ConfirmationService from "primevue/confirmationservice";
import ToastService from "primevue/toastservice";
import Tooltip from "primevue/tooltip";
import { createApp } from "vue";
import App from "./App.vue";
import { initTheme } from "./composables/useTheme";
import { reportError } from "./lib/reportError";
import { initPwaInstallCapture, registerPwaUpdates } from "./pwa";
import router from "./router";
import { startSyncEngine } from "./sync/engine";
import "./style.css";

initPwaInstallCapture();
registerPwaUpdates();
startSyncEngine();

const TripLedgerPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: "{teal.50}",
      100: "{teal.100}",
      200: "{teal.200}",
      300: "{teal.300}",
      400: "{teal.400}",
      500: "{teal.500}",
      600: "{teal.600}",
      700: "{teal.700}",
      800: "{teal.800}",
      900: "{teal.900}",
      950: "{teal.950}",
    },
  },
});

initTheme();

const app = createApp(App);
app.config.errorHandler = (err, _instance, info) => {
  reportError(err, { tag: "vue.errorHandler", info });
};
app.use(createPinia());
app.use(router);
app.use(PrimeVue, {
  theme: {
    preset: TripLedgerPreset,
    options: {
      darkModeSelector: ".dark",
      cssLayer: false,
    },
  },
});
app.use(ToastService);
app.use(ConfirmationService);
app.directive("tooltip", Tooltip);
app.mount("#app");
