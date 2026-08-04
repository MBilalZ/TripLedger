import { createRouter, createWebHistory } from "vue-router";
import HomeView from "@/views/HomeView.vue";
import JoinTripView from "@/views/JoinTripView.vue";
import NewTripView from "@/views/NewTripView.vue";
import TripView from "@/views/TripView.vue";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", name: "home", component: HomeView },
    { path: "/trips/new", name: "new-trip", component: NewTripView },
    {
      path: "/join/:token",
      name: "join",
      component: JoinTripView,
      props: true,
    },
    { path: "/trips/:tripId", name: "trip", component: TripView, props: true },
  ],
});

export default router;
