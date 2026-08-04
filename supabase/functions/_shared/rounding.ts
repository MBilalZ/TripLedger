import { PAISA_PER_RUPEE } from "./money.ts";

export interface RoundedBalance {
  participantId: string;
  /** Exact balance in paisa */
  exactPaisa: number;
  /** Whole-rupee balance in paisa (multiple of 100), Σ == 0 */
  roundedPaisa: number;
}

/**
 * Round each balance to the nearest whole rupee (100 paisa) such that the
 * sum of rounded balances remains exactly 0.
 */
export function roundBalancesToRupees(
  balances: Array<{ participantId: string; balancePaisa: number }>,
): RoundedBalance[] {
  if (balances.length === 0) return [];

  const prelim = balances.map((b) => {
    const rupees = b.balancePaisa / PAISA_PER_RUPEE;
    const roundedRupees = Math.round(rupees);
    const frac = Math.abs(rupees - roundedRupees);
    return {
      participantId: b.participantId,
      exactPaisa: b.balancePaisa,
      roundedPaisa: roundedRupees * PAISA_PER_RUPEE,
      // Distance from .5 decides who absorbs residual; keep signed frac for ties
      fracDistance: Math.abs(rupees - Math.trunc(rupees) - 0.5),
      absExact: Math.abs(b.balancePaisa),
    };
  });

  let residual =
    prelim.reduce((s, p) => s + p.roundedPaisa, 0); /* should be near 0 */

  if (residual === 0) {
    return prelim.map(({ participantId, exactPaisa, roundedPaisa }) => ({
      participantId,
      exactPaisa,
      roundedPaisa,
    }));
  }

  // Residual is in paisa and a multiple of 100 when all rounds are whole rupees.
  // Adjust ±1 rupee at a time on parties closest to a rounding boundary /
  // largest absolute balance so Σ returns to 0.
  const step = residual > 0 ? -PAISA_PER_RUPEE : PAISA_PER_RUPEE;
  const steps = Math.abs(residual) / PAISA_PER_RUPEE;

  const order = [...prelim].sort((a, b) => {
    // Prefer parties closest to a .5 rounding boundary, then larger |balance|
    if (a.fracDistance !== b.fracDistance) {
      return a.fracDistance - b.fracDistance;
    }
    if (b.absExact !== a.absExact) return b.absExact - a.absExact;
    return a.participantId.localeCompare(b.participantId);
  });

  for (let n = 0; n < steps; n += 1) {
    const target = order[n % order.length]!;
    target.roundedPaisa += step;
  }

  return prelim.map(({ participantId, exactPaisa, roundedPaisa }) => ({
    participantId,
    exactPaisa,
    roundedPaisa,
  }));
}
