import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "home",
      component: () => import("@/views/HomeView.vue"),
    },
    {
      path: "/trips/new",
      name: "new-trip",
      component: () => import("@/views/NewTripView.vue"),
    },
    {
      path: "/join/:token",
      name: "join",
      component: () => import("@/views/JoinTripView.vue"),
      props: true,
    },
    {
      path: "/trips/:tripId",
      name: "trip",
      component: () => import("@/views/TripView.vue"),
      props: true,
    },
  ],
});

export default router;
