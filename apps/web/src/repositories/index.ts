import { useAuthStore } from "@/stores/auth";
import { syncCloudTripListRepo } from "./cloud/syncTripList";
import { syncCloudWorkspaceRepo } from "./cloud/syncWorkspace";
import { localTripListRepo } from "./local/tripList";
import { localWorkspaceRepo } from "./local/workspace";
import type { TripListRepo, WorkspaceRepo } from "./types";

export type {
  AdjustmentInput,
  CreateTripOptions,
  ExpenseInput,
  LeaveTripResult,
  PoolMemberPatch,
  TripListRepo,
  WorkspaceRepo,
  WorkspaceSnapshot,
} from "./types";

export function getTripRepos(): TripListRepo {
  const auth = useAuthStore();
  return auth.cloud ? syncCloudTripListRepo : localTripListRepo;
}

export function getWorkspaceRepo(): WorkspaceRepo {
  const auth = useAuthStore();
  return auth.cloud ? syncCloudWorkspaceRepo : localWorkspaceRepo;
}
