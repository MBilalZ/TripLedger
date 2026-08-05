import * as tripsApi from "@/api/trips";
import type { TripListRepo } from "../types";

export const cloudTripListRepo: TripListRepo = {
  list: () => tripsApi.listTrips(),
  create: (name, options) => tripsApi.createTrip(name, options),
  delete: (tripId) => tripsApi.deleteTrip(tripId),
  leave: async (tripId) => {
    const r = await tripsApi.leaveTrip(tripId);
    return { action: r.action, promotedUserId: r.promotedUserId };
  },
  touch: (tripId) => tripsApi.touchTrip(tripId),
};
