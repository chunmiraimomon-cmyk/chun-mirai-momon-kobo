import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  gojoRaceTuning,
  isUltimateGojoUnlocked,
  STANDARD_GOJO_DRIFT_RELEASE_CHARGE,
  STANDARD_GOJO_ITEM_LOOKAHEAD_METERS,
  STANDARD_GOJO_ITEM_PICKUP_RADIUS,
  STANDARD_GOJO_PACE,
  STANDARD_GOJO_SKILL_COOLDOWN_MS,
  ULTIMATE_GOJO_DRIFT_RELEASE_CHARGE,
  ULTIMATE_GOJO_ITEM_LOOKAHEAD_METERS,
  ULTIMATE_GOJO_ITEM_PICKUP_RADIUS,
  ULTIMATE_GOJO_PACE,
  ULTIMATE_GOJO_SKILL_COOLDOWN_MS,
} from "../lib/ultimate-gojo.mjs";

test("ultimate Gojo unlock requires every achievement", () => {
  const ids = ["A", "B", "C"];
  assert.equal(isUltimateGojoUnlocked({ achievementIds: ids, unlocked: { A: 1, B: 2, C: 3 } }), true);
  assert.equal(isUltimateGojoUnlocked({ achievementIds: ids, unlocked: { A: 1, C: 3 } }), false);
  assert.equal(isUltimateGojoUnlocked({ achievementIds: [], unlocked: {} }), false);
});

test("ultimate Gojo receives stronger ghostless-racing execution without changing normal Gojo", () => {
  assert.deepEqual(gojoRaceTuning(), {
    pace: STANDARD_GOJO_PACE,
    skillCooldownMs: STANDARD_GOJO_SKILL_COOLDOWN_MS,
    driftReleaseCharge: STANDARD_GOJO_DRIFT_RELEASE_CHARGE,
    itemLookaheadMeters: STANDARD_GOJO_ITEM_LOOKAHEAD_METERS,
    itemPickupRadius: STANDARD_GOJO_ITEM_PICKUP_RADIUS,
  });
  assert.deepEqual(gojoRaceTuning({ ultimate: true }), {
    pace: ULTIMATE_GOJO_PACE,
    skillCooldownMs: ULTIMATE_GOJO_SKILL_COOLDOWN_MS,
    driftReleaseCharge: ULTIMATE_GOJO_DRIFT_RELEASE_CHARGE,
    itemLookaheadMeters: ULTIMATE_GOJO_ITEM_LOOKAHEAD_METERS,
    itemPickupRadius: ULTIMATE_GOJO_ITEM_PICKUP_RADIUS,
  });
  assert.equal(ULTIMATE_GOJO_PACE - STANDARD_GOJO_PACE, 3);
  assert.equal(ULTIMATE_GOJO_SKILL_COOLDOWN_MS, 15000);
  assert.equal(ULTIMATE_GOJO_DRIFT_RELEASE_CHARGE, 0.82);
  assert.equal(ULTIMATE_GOJO_ITEM_LOOKAHEAD_METERS, 118);
});

test("players and CPU racers share the same skill activation visuals", () => {
  const pageSource = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /spawnSkillEffect\(actorId, skill, now, "activate"\)/);
  assert.match(pageSource, /spawnSkillEffect\(0, "GIANT", now, "activate"\)/);
  assert.match(pageSource, /spawnSkillEffect\(index \+ 1, "VOLT", now,/);
  assert.match(pageSource, /spawnSkillEffect\(stream\.owner, "COMET", now,/);
});

test("the unlocked mode offers all six official courses and a standalone duel", () => {
  const pageSource = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /phase === "ultimate-gojo-select"/);
  assert.match(pageSource, /TIME_TRIAL_COURSE_IDS\.map\(\(courseId, index\) =>/);
  assert.match(pageSource, /ultimateGojo=\{ultimateGojoActive\}/);
  assert.match(pageSource, /const confirmUltimateGojoBriefing = useCallback\(\(\) => beginRace\(2\)/);
});
