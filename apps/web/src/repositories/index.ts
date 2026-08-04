import { useAuthStore } from "@/stores/auth";
import { cloudTripListRepo } from "./cloud/tripList";
import { cloudWorkspaceRepo } from "./cloud/workspace";
import { localTripListRepo } from "./local/tripList";
import { localWorkspaceRepo } from "./local/workspace";
import type { TripListRepo, WorkspaceRepo } from "./types";

export type {
  AdjustmentInput,
  CreateTripOptions,
  ExpenseInput,
  PoolMemberPatch,
  TripListRepo,
  WorkspaceRepo,
  WorkspaceSnapshot,
} from "./types";

export function getTripRepos(): TripListRepo {
  const auth = useAuthStore();
  return auth.cloud ? cloudTripListRepo : localTripListRepo;
}

export function getWorkspaceRepo(): WorkspaceRepo {
  const auth = useAuthStore();
  return auth.cloud ? cloudWorkspaceRepo : localWorkspaceRepo;
}
