export { ApiError, toApiError } from "./errors";
export { apiCall, apiMutate, addApiInterceptor } from "./client";
export {
  isSupabaseConfigured,
  getSupabase,
  ensureAuthSession,
  currentUserId,
} from "./supabase";
export * as tripsApi from "./trips";
export * as participantsApi from "./participants";
export * as poolsApi from "./pools";
export * as expensesApi from "./expenses";
export * as adjustmentsApi from "./adjustments";
export * as invitesApi from "./invites";
export * as workspaceApi from "./workspace";
export * as realtimeApi from "./realtime";
export type { CreateTripOptions } from "./trips";
export type { WorkspaceSnapshot } from "./workspace";
