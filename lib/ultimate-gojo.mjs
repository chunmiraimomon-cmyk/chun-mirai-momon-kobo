export const STANDARD_GOJO_PACE = 35;
export const ULTIMATE_GOJO_PACE = 38;
export const STANDARD_GOJO_SKILL_COOLDOWN_MS = 20000;
export const ULTIMATE_GOJO_SKILL_COOLDOWN_MS = 15000;
export const STANDARD_GOJO_DRIFT_RELEASE_CHARGE = 0.5;
export const ULTIMATE_GOJO_DRIFT_RELEASE_CHARGE = 0.82;
export const STANDARD_GOJO_ITEM_LOOKAHEAD_METERS = 78;
export const ULTIMATE_GOJO_ITEM_LOOKAHEAD_METERS = 118;
export const STANDARD_GOJO_ITEM_PICKUP_RADIUS = 3.4;
export const ULTIMATE_GOJO_ITEM_PICKUP_RADIUS = 4.25;

export const isUltimateGojoUnlocked = ({ achievementIds, unlocked }) => (
  achievementIds.length > 0
  && achievementIds.every((achievementId) => Number(unlocked?.[achievementId]) > 0)
);

export const gojoRaceTuning = ({ ultimate = false } = {}) => ({
  pace: ultimate ? ULTIMATE_GOJO_PACE : STANDARD_GOJO_PACE,
  skillCooldownMs: ultimate
    ? ULTIMATE_GOJO_SKILL_COOLDOWN_MS
    : STANDARD_GOJO_SKILL_COOLDOWN_MS,
  driftReleaseCharge: ultimate
    ? ULTIMATE_GOJO_DRIFT_RELEASE_CHARGE
    : STANDARD_GOJO_DRIFT_RELEASE_CHARGE,
  itemLookaheadMeters: ultimate
    ? ULTIMATE_GOJO_ITEM_LOOKAHEAD_METERS
    : STANDARD_GOJO_ITEM_LOOKAHEAD_METERS,
  itemPickupRadius: ultimate
    ? ULTIMATE_GOJO_ITEM_PICKUP_RADIUS
    : STANDARD_GOJO_ITEM_PICKUP_RADIUS,
});
