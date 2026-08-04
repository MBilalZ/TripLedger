import type { PostgrestError } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured, requireUser } from "./supabase";
import { ApiError, toApiError } from "./errors";

export type ApiResult<T> = { data: T; error: PostgrestError | null };

type Interceptor = {
  onRequest?: () => Promise<void> | void;
  onError?: (error: ApiError) => void;
};

const interceptors: Interceptor[] = [];

export function addApiInterceptor(interceptor: Interceptor): () => void {
  interceptors.push(interceptor);
  return () => {
    const i = interceptors.indexOf(interceptor);
    if (i >= 0) interceptors.splice(i, 1);
  };
}

async function runRequestHooks() {
  for (const i of interceptors) {
    await i.onRequest?.();
  }
}

function runErrorHooks(error: ApiError) {
  for (const i of interceptors) {
    i.onError?.(error);
  }
}

/**
 * Run a Supabase call through the shared pipeline:
 * ensure auth (when configured), unwrap { data, error }, normalize errors.
 */
async function runPipeline<T>(
  fn: () => Promise<T>,
  opts: { requireAuth?: boolean } = {},
): Promise<T> {
  const requireAuth = opts.requireAuth ?? true;
  try {
    if (requireAuth && isSupabaseConfigured()) {
      await requireUser();
    }
    await runRequestHooks();
    return await fn();
  } catch (e) {
    const err = toApiError(e);
    runErrorHooks(err);
    throw err;
  }
}

export async function apiCall<T>(
  fn: (sb: ReturnType<typeof getSupabase>) => PromiseLike<ApiResult<T>>,
  opts: { requireAuth?: boolean } = {},
): Promise<T> {
  return runPipeline(async () => {
    const { data, error } = await fn(getSupabase());
    if (error) throw toApiError(error);
    if (data === null || data === undefined) {
      throw new ApiError("API returned empty response", {
        code: "EMPTY_RESPONSE",
      });
    }
    return data;
  }, opts);
}

/** Like apiCall but for mutations that only care about error. */
export async function apiMutate(
  fn: (
    sb: ReturnType<typeof getSupabase>,
  ) => PromiseLike<{ error: PostgrestError | null }>,
  opts: { requireAuth?: boolean } = {},
): Promise<void> {
  await runPipeline(async () => {
    const { error } = await fn(getSupabase());
    if (error) throw toApiError(error);
  }, opts);
}
