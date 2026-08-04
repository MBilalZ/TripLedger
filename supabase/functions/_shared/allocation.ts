import type { Id, SplitLine, SplitMode } from "./types.ts";

export interface ShareSlice {
  participantId: Id;
  weight: number;
  sharePaisa: number;
}

export interface AllocateResult {
  slices: ShareSlice[];
  error?: string;
}

/**
 * Allocate total proportional to integer weights via largest-remainder.
 */
export function allocateByWeights(
  totalPaisa: number,
  members: Array<{ participantId: Id; weight: number }>,
): AllocateResult {
  if (totalPaisa < 0) {
    return { slices: [], error: "totalPaisa must be >= 0" };
  }
  const active = members.filter((m) => m.weight > 0);
  if (active.length === 0) {
    if (totalPaisa === 0) return { slices: [] };
    return { slices: [], error: "No participants with positive weight" };
  }

  const weightSum = active.reduce((sum, m) => sum + m.weight, 0);
  if (weightSum <= 0) {
    return { slices: [], error: "Weight sum must be > 0" };
  }

  for (const m of active) {
    if (
      !Number.isSafeInteger(m.weight) ||
      m.weight > Number.MAX_SAFE_INTEGER / Math.max(totalPaisa, 1)
    ) {
      return {
        slices: [],
        error: "Split weights too large for safe integer allocation",
      };
    }
  }
  if (
    totalPaisa > 0 &&
    weightSum > 0 &&
    totalPaisa > Number.MAX_SAFE_INTEGER / weightSum
  ) {
    return {
      slices: [],
      error: "Amount too large for safe integer allocation",
    };
  }

  const floors = active.map((m) => {
    const numerator = totalPaisa * m.weight;
    const floor = Math.floor(numerator / weightSum);
    const remainder = numerator - floor * weightSum;
    return {
      participantId: m.participantId,
      weight: m.weight,
      sharePaisa: floor,
      remainder,
    };
  });

  let leftover = totalPaisa - floors.reduce((s, f) => s + f.sharePaisa, 0);
  const order = [...floors].sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    return a.participantId.localeCompare(b.participantId);
  });

  let i = 0;
  while (leftover > 0 && order.length > 0) {
    order[i % order.length]!.sharePaisa += 1;
    leftover -= 1;
    i += 1;
  }

  return {
    slices: floors.map((f) => ({
      participantId: f.participantId,
      weight: f.weight,
      sharePaisa: f.sharePaisa,
    })),
  };
}

/** @deprecated use allocateByWeights — kept for call-site clarity */
export function allocateByHeadcount(
  totalPaisa: number,
  members: Array<{ participantId: Id; headCount: number }>,
): Array<{ participantId: Id; headCount: number; sharePaisa: number }> {
  const result = allocateByWeights(
    totalPaisa,
    members.map((m) => ({
      participantId: m.participantId,
      weight: m.headCount,
    })),
  );
  if (result.error) throw new Error(result.error);
  return result.slices.map((s) => ({
    participantId: s.participantId,
    headCount: s.weight,
    sharePaisa: s.sharePaisa,
  }));
}

function includedLines(lines: SplitLine[]): SplitLine[] {
  return lines.filter((l) => l.included);
}

/**
 * Allocate an expense/pool amount according to split mode.
 */
export function allocateSplit(
  totalPaisa: number,
  mode: SplitMode,
  lines: SplitLine[],
): AllocateResult {
  const active = includedLines(lines);

  if (mode === "exact") {
    if (active.length === 0) {
      return {
        slices: [],
        error:
          totalPaisa === 0
            ? undefined
            : "Exact split needs at least one included participant",
      };
    }
    const sum = active.reduce((s, l) => s + l.exactPaisa, 0);
    if (sum !== totalPaisa) {
      return {
        slices: [],
        error: `Exact amounts sum to ${sum} paisa, expected ${totalPaisa}`,
      };
    }
    for (const l of active) {
      if (!Number.isInteger(l.exactPaisa) || l.exactPaisa < 0) {
        return {
          slices: [],
          error: `Invalid exact amount for ${l.participantId}`,
        };
      }
    }
    return {
      slices: active.map((l) => ({
        participantId: l.participantId,
        weight: l.exactPaisa,
        sharePaisa: l.exactPaisa,
      })),
    };
  }

  if (mode === "percent") {
    const bpsSum = active.reduce((s, l) => s + l.percentBps, 0);
    if (bpsSum !== 10_000) {
      return {
        slices: [],
        error: `Percentages must sum to 100% (got ${bpsSum / 100}%)`,
      };
    }
    return allocateByWeights(
      totalPaisa,
      active.map((l) => ({
        participantId: l.participantId,
        weight: l.percentBps,
      })),
    );
  }

  if (mode === "equal") {
    return allocateByWeights(
      totalPaisa,
      active.map((l) => ({
        participantId: l.participantId,
        weight: 1,
      })),
    );
  }

  // shares
  for (const l of active) {
    if (!Number.isInteger(l.shares) || l.shares < 1) {
      return {
        slices: [],
        error: `Shares must be integer >= 1 for ${l.participantId}`,
      };
    }
  }
  return allocateByWeights(
    totalPaisa,
    active.map((l) => ({
      participantId: l.participantId,
      weight: l.shares,
    })),
  );
}

export function defaultSplitLine(participantId: Id): SplitLine {
  return {
    participantId,
    included: true,
    shares: 1,
    percentBps: 0,
    exactPaisa: 0,
  };
}
