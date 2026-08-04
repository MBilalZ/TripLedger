export class ApiError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly cause?: unknown;

  constructor(
    message: string,
    opts: { code?: string; status?: number; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.code = opts.code ?? "API_ERROR";
    this.status = opts.status;
    this.cause = opts.cause;
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error && typeof error === "object") {
    const e = error as {
      message?: string;
      code?: string;
      status?: number;
      name?: string;
    };
    if (typeof e.message === "string" && e.message) {
      return new ApiError(e.message, {
        code: e.code ?? e.name ?? "SUPABASE_ERROR",
        status: e.status,
        cause: error,
      });
    }
  }

  if (error instanceof Error) {
    return new ApiError(error.message, { cause: error });
  }

  return new ApiError(String(error));
}
