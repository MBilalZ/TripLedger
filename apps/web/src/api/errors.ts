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

const FRIENDLY: Array<{ match: RegExp; message: string; code: string }> = [
  {
    match: /not authenticated/i,
    message: "Please sign in and try again.",
    code: "AUTH_REQUIRED",
  },
  {
    match: /invite not found/i,
    message: "This invite link is invalid.",
    code: "INVITE_NOT_FOUND",
  },
  {
    match: /invite has been revoked/i,
    message: "This invite has been revoked.",
    code: "INVITE_REVOKED",
  },
  {
    match: /invite has expired/i,
    message: "This invite has expired. Ask the trip owner for a new link.",
    code: "INVITE_EXPIRED",
  },
  {
    match: /RATE_LIMIT/i,
    message: "Too many attempts. Please wait and try again.",
    code: "RATE_LIMIT",
  },
  {
    match: /trip is full/i,
    message: "This trip has reached the member limit.",
    code: "TRIP_FULL",
  },
  {
    match: /display name must be/i,
    message: "Display name must be 1–80 characters.",
    code: "DISPLAY_NAME",
  },
  {
    match: /sole owner cannot leave/i,
    message: "The only owner cannot leave. Transfer ownership or delete the trip.",
    code: "SOLE_OWNER",
  },
  {
    match: /cannot delete a participant linked to a trip owner/i,
    message: "You cannot remove the trip owner’s person entry.",
    code: "OWNER_PARTICIPANT",
  },
  {
    match: /not a trip member/i,
    message: "You are not a member of this trip.",
    code: "NOT_MEMBER",
  },
  {
    match: /Invalid login credentials/i,
    message: "Incorrect email or password.",
    code: "BAD_CREDENTIALS",
  },
];

export function friendlyApiMessage(raw: string): string {
  for (const rule of FRIENDLY) {
    if (rule.match.test(raw)) return rule.message;
  }
  // Strip Postgres raise exception prefixes
  const cleaned = raw
    .replace(/^.*ERROR:\s*/i, "")
    .replace(/\s+CONTEXT:[\s\S]*$/i, "")
    .trim();
  if (cleaned.length > 0 && cleaned.length < 160 && !/^[A-Z_]+$/.test(cleaned)) {
    return cleaned;
  }
  return "Something went wrong. Please try again.";
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return new ApiError(friendlyApiMessage(error.message), {
      code: error.code,
      status: error.status,
      cause: error.cause ?? error,
    });
  }

  if (error && typeof error === "object") {
    const e = error as {
      message?: string;
      code?: string;
      status?: number;
      name?: string;
    };
    if (typeof e.message === "string" && e.message) {
      const friendly = friendlyApiMessage(e.message);
      const matched = FRIENDLY.find((r) => r.match.test(e.message!));
      return new ApiError(friendly, {
        code: matched?.code ?? e.code ?? e.name ?? "SUPABASE_ERROR",
        status: e.status,
        cause: error,
      });
    }
  }

  if (error instanceof Error) {
    return new ApiError(friendlyApiMessage(error.message), { cause: error });
  }

  return new ApiError("Something went wrong. Please try again.");
}
