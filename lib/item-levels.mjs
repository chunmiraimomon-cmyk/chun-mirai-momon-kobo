export const MAX_ITEM_LEVEL = 3;
export const SHIELD_DURATION_MS = 10000;
export const SPIKE_ORBIT_DURATION_MS = 10000;
export const SPIKE_OWNER_GRACE_MS = 650;
export const HOMING_LV3_SHOCKWAVE_RADIUS = 4.8;

export const spikeCollisionIsActive = (trapOwner, targetOwner, armedAt, now, targetIsHoming = false) => (
  targetIsHoming || targetOwner !== trapOwner || now >= armedAt
);

export const maxItemLevel = (item) => (
  item === "EMPTY" ? 0 : item === "NOVA" ? 1 : MAX_ITEM_LEVEL
);

export const canUpgradeHeldItem = (item, level) => (
  item !== "EMPTY" && level < maxItemLevel(item)
);

export const upgradeHeldItemLevel = (item, level) => (
  canUpgradeHeldItem(item, level) ? Math.min(MAX_ITEM_LEVEL, level + 1) : level
);

export const fireLevelPattern = (level) => {
  if (level >= 3) return { angles: [-0.16, 0, 0.16], scale: 3 };
  if (level === 2) return { angles: [-0.09, 0.09], scale: 2 };
  return { angles: [0], scale: 1 };
};

export const spikeLevelLaneOffsets = () => [0];
export const spikeOrbitsKart = (level) => level >= 2;
export const spikeGrantsGuard = (level) => level >= 3;

export const boostDurationForLevel = (level) => (
  level >= 3 ? 7000 : level === 2 ? 5000 : 3000
);

export const shieldSpeedCapForLevel = (level) => (
  level >= 3 ? 38 : level === 2 ? 36.5 : 0
);

export const shieldRivalSpeedBonusForLevel = (level) => (
  level >= 3 ? 4 : level === 2 ? 2.5 : 0
);

export const homingBreaksOnSpikes = (level) => level <= 1;
export const homingCreatesShockwave = (level) => level >= 3;
