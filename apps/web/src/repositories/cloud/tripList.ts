import * as tripsApi from "@/api/trips";
import type { TripListRepo } from "../types";

export const cloudTripListRepo: TripListRepo = {
  list: () => tripsApi.listTrips(),
  create: (name, options) => tripsApi.createTrip(name, options),
  delete: (tripId) => tripsApi.deleteTrip(tripId),
  touch: (tripId) => tripsApi.touchTrip(tripId),
};
