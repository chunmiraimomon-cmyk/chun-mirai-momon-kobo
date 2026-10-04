import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  boostDurationForLevel,
  canUpgradeHeldItem,
  fireLevelPattern,
  homingBreaksOnSpikes,
  homingCreatesShockwave,
  maxItemLevel,
  SHIELD_DURATION_MS,
  SPIKE_OWNER_GRACE_MS,
  SPIKE_ORBIT_DURATION_MS,
  shieldRivalSpeedBonusForLevel,
  shieldSpeedCapForLevel,
  spikeGrantsGuard,
  spikeCollisionIsActive,
  spikeLevelLaneOffsets,
  spikeOrbitsKart,
  upgradeHeldItemLevel,
} from "../lib/item-levels.mjs";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("holding a standard item upgrades it to level three while NOVA never upgrades", () => {
  assert.equal(upgradeHeldItemLevel("FIRE", 1), 2);
  assert.equal(upgradeHeldItemLevel("FIRE", 2), 3);
  assert.equal(upgradeHeldItemLevel("FIRE", 3), 3);
  assert.equal(maxItemLevel("NOVA"), 1);
  assert.equal(canUpgradeHeldItem("NOVA", 1), false);
  assert.equal(canUpgradeHeldItem("EMPTY", 0), false);
});

test("FIRE levels use one, two and three increasingly large radial shots", () => {
  assert.deepEqual(fireLevelPattern(1), { angles: [0], scale: 1 });
  assert.deepEqual(fireLevelPattern(2), { angles: [-0.09, 0.09], scale: 2 });
  assert.deepEqual(fireLevelPattern(3), { angles: [-0.16, 0, 0.16], scale: 3 });
});

test("SPIKES level one is placed while levels two and three orbit the kart", () => {
  assert.deepEqual(spikeLevelLaneOffsets(1), [0]);
  assert.equal(spikeOrbitsKart(1), false);
  assert.equal(spikeOrbitsKart(2), true);
  assert.equal(spikeOrbitsKart(3), true);
  assert.equal(spikeGrantsGuard(2), false);
  assert.equal(spikeGrantsGuard(3), true);
  assert.equal(SPIKE_ORBIT_DURATION_MS, 10000);
  assert.match(page, /trap\.mode === "orbit"/);
  assert.match(page, /actorOrbitGuard/);
  assert.match(page, /const spikeGuardAuras = racerMeshes\.map/);
  assert.match(page, /isSpikeGuardAttack\(attack\)/);
  assert.match(page, /mode === "orbit" \? now \+ SPIKE_ORBIT_DURATION_MS/);
});

test("SPIKES owner alone receives the 650ms placement grace while rivals and homing collide immediately", () => {
  const placedAt = 1000;
  const armedAt = placedAt + SPIKE_OWNER_GRACE_MS;
  assert.equal(SPIKE_OWNER_GRACE_MS, 650);
  assert.equal(spikeCollisionIsActive(2, 2, armedAt, placedAt), false, "owner is safe immediately after placement");
  assert.equal(spikeCollisionIsActive(2, 2, armedAt, armedAt - 1), false, "owner grace lasts the full 650ms");
  assert.equal(spikeCollisionIsActive(2, 2, armedAt, armedAt), true, "owner becomes hittable at 650ms");
  assert.equal(spikeCollisionIsActive(2, 1, armedAt, placedAt), true, "another racer collides immediately");
  assert.equal(spikeCollisionIsActive(2, 2, armedAt, placedAt, true), true, "homing collides immediately even when fired by the owner");
  assert.doesNotMatch(page, /if \(now < trap\.armedAt\) return/);
  assert.match(page, /spikeCollisionIsActive\(trap\.owner, actorId, trap\.armedAt, now\)/);
  assert.match(page, /spikeCollisionIsActive\(trap\.owner, projectile\.owner, trap\.armedAt, now, true\)/);
});

test("BOOST lasts three, five and seven seconds", () => {
  assert.equal(boostDurationForLevel(1), 3000);
  assert.equal(boostDurationForLevel(2), 5000);
  assert.equal(boostDurationForLevel(3), 7000);
  assert.match(page, /LV\.1 3秒　LV\.2 5秒　LV\.3 7秒/);
});

test("SHIELD has a ten second limit and gains speed then the Aurora effect", () => {
  assert.equal(SHIELD_DURATION_MS, 10000);
  assert.equal(shieldSpeedCapForLevel(1), 0);
  assert.equal(shieldSpeedCapForLevel(2), 36.5);
  assert.equal(shieldSpeedCapForLevel(3), 38);
  assert.equal(shieldRivalSpeedBonusForLevel(2), 2.5);
  assert.equal(shieldRivalSpeedBonusForLevel(3), 4);
  assert.match(page, /if \(itemLevel >= 3\)/);
  assert.match(page, /playerState\.auroraUntil = shieldUntil/);
});

test("HOMING level one breaks on spikes and level three creates an impact wave", () => {
  assert.equal(homingBreaksOnSpikes(1), true);
  assert.equal(homingBreaksOnSpikes(2), false);
  assert.equal(homingBreaksOnSpikes(3), false);
  assert.equal(homingCreatesShockwave(2), false);
  assert.equal(homingCreatesShockwave(3), true);
  assert.match(page, /homingBreaksOnSpikes\(projectile\.level\)/);
  assert.match(page, /HOMING_LV3_SHOCKWAVE_RADIUS/);
});

test("AURORA is removed from the item roster and item box upgrades are wired for every racer", () => {
  assert.match(page, /type ItemType = "EMPTY" \| "FIRE" \| "HOMING" \| "BOOST" \| "SPIKES" \| "SHIELD" \| "NOVA"/);
  assert.doesNotMatch(page, /AURORA: \{ icon:/);
  assert.match(page, /canUpgradeHeldItem\(currentItem, currentLevel\)/);
  assert.match(page, /upgradeHeldItemLevel\(currentItem, currentLevel\)/);
});

test("the race HUD uses item graphics and a large level badge instead of an item name", () => {
  assert.match(page, /function ItemGraphic/);
  assert.match(page, /item-graphic-\$\{item\.toLowerCase\(\)\}/);
  assert.match(page, /className="item-slot-visual"/);
  assert.match(page, /className=\{`item-level-badge/);
  const hudStart = page.indexOf("className={`item-slot");
  const hudEnd = page.indexOf("className=\"camera-mode\"", hudStart);
  const hud = page.slice(hudStart, hudEnd);
  assert.doesNotMatch(hud, />\{itemDisplayName\}</);
});
