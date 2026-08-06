/**
 * Invisible entitlement flags for a future subscription model.
 * During UAT / public testing every feature is unlocked — no Pro UI.
 */
export type Feature = "charts" | "exports" | "advanced_splits" | "activity_feed";

/** UAT: everything open. Flip individual flags when subscription lands. */
const FLAGS: Record<Feature, boolean> = {
  charts: true,
  exports: true,
  advanced_splits: true,
  activity_feed: true,
};

export function isEnabled(feature: Feature): boolean {
  return FLAGS[feature] ?? true;
}
