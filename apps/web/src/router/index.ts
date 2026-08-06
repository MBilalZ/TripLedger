import { createRouter, createWebHistory } from "vue-router";
import { isSupabaseConfigured } from "@/api/supabase";
import { useAuthStore } from "@/stores/auth";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "home",
      component: () => import("@/views/HomeView.vue"),
    },
    {
      path: "/activity",
      name: "activity",
      component: () => import("@/views/ActivityView.vue"),
    },
    {
      path: "/account",
      name: "account",
      component: () => import("@/views/AccountView.vue"),
    },
    {
      path: "/auth",
      name: "auth",
      component: () => import("@/views/AuthView.vue"),
      meta: { guestOnly: true },
    },
    {
      path: "/trips/new",
      name: "new-trip",
      component: () => import("@/views/NewTripView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/join/:token",
      name: "join",
      component: () => import("@/views/JoinTripView.vue"),
      props: true,
      meta: { requiresAuth: true },
    },
    {
      path: "/trips/:tripId",
      name: "trip",
      component: () => import("@/views/TripView.vue"),
      props: true,
      meta: { requiresAuth: true },
    },
  ],
});

router.beforeEach(async (to) => {
  if (!isSupabaseConfigured()) return true;

  const auth = useAuthStore();
  if (!auth.authReady) {
    await auth.initAuth();
  }

  if (to.meta.requiresAuth && !auth.isSignedIn) {
    return {
      name: "auth",
      query: { redirect: to.fullPath },
    };
  }

  if (to.meta.guestOnly && auth.isSignedIn) {
    const redirect = String(to.query.redirect ?? "");
    if (redirect.startsWith("/") && !redirect.startsWith("//")) {
      return redirect;
    }
    return { name: "home" };
  }

  return true;
});

export default router;
