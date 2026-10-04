import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  accelerateGiantLeapVelocity,
  advanceHomingProgress,
  airborneFinishZoneFraction,
  cameraViewForViewport,
  canActivateItem,
  cometGateResult,
  cpuCometGateTarget,
  cpuOverchargeTarget,
  CPU_VECTOR_DIRECTION_EPSILON,
  cpuVectorTurboRemainsActive,
  crashDurationForAttack,
  chooseRecordedShortcutStarAvoidance,
  extractRecordedLineShortcuts,
  finalLapCheckpointFromGroundContact,
  gojoRecordedShortcutApproachPhase,
  freeDriveSpeedCap,
  finishLineCrossingFraction,
  giantLeapChargeAngle,
  GIANT_LEAP_CHARGE_DURATION_MS,
  GIANT_LEAP_MAX_ANGLE,
  GIANT_LEAP_SPEED_MULTIPLIER,
  GIANT_LOW_DASH_DURATION_MS,
  giantLeapProfileForAngle,
  giantLeapVerticalVelocity,
  hasFullyClearedGuardrail,
  overlapsGuardrailByFraction,
  isApproachingRoad,
  isInsideAirborneFinishZone,
  isShieldableAttack,
  isSpikeGuardAttack,
  isWithinRoadFootprint,
  isWithinFinishRoadHeight,
  pointToSegmentDistance3d,
  rankingProgressFromGroundContact,
  resolveTrackedCourseProgress,
  recordedShortcutFlightPosition,
  resolveOverchargeDrift,
  SKILL_TURBO_DURATION_MS,
  takeoffGravity,
  updateBelowCourseRecovery,
  VOLT_CRITICAL_MAX,
  VOLT_CRITICAL_MIN,
  VOLT_SUCCESS_MAX,
  VOLT_SUCCESS_MIN,
  vectorTurboRemainsActive,
} from "../lib/race-rules.mjs";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("starlight Gojo replays the large recorded Ghost shortcut instead of the old fixed route", async () => {
  const record = JSON.parse(await readFile(new URL("../public/data/gojo-lines/starlight.json", import.meta.url), "utf8"));
  const shortcuts = extractRecordedLineShortcuts({ samples: record.samples });
  assert.equal(shortcuts.length, 4);
  assert.deepEqual(shortcuts[0], {
    key: "recorded-line:191",
    startProgress: 0.867625,
    targetProgress: 1.098875,
    startLane: -10.9,
    targetLane: -8.51,
  });
  assert.ok(shortcuts.every((shortcut) => shortcut.targetProgress - shortcut.startProgress > 0.19));
  assert.match(pageSource, /const recordedShortcut = findRecordedGojoShortcut\(index \+ 1\)/);
  assert.match(pageSource, /if \(shortcut\.recordedTurbo\) \{[\s\S]{0,180}rival\.driftBoost = Math\.max\(rival\.driftBoost, 1\)/);
  assert.match(pageSource, /rival\.speed = Math\.max\(rival\.speed, rival\.pace \+ 10\.5\)/);
  assert.match(pageSource, /rival\.lane = rival\.shortcutTargetLane/);
});

test("river Gojo replays the shortcut contained in the new official line", async () => {
  const record = JSON.parse(await readFile(new URL("../public/data/gojo-lines/river.json", import.meta.url), "utf8"));
  const shortcuts = extractRecordedLineShortcuts({ samples: record.samples });
  assert.equal(shortcuts.length, 1);
  assert.deepEqual(shortcuts[0], {
    key: "recorded-line:291",
    startProgress: 1.610125,
    targetProgress: 1.737,
    startLane: -10.9,
    targetLane: -0.692,
  });
  assert.match(pageSource, /courseDefinition\.id === "starlight" \|\| courseDefinition\.id === "river"/);
});

test("recorded Gojo lines remain subordinate to item seeking and obstacle avoidance", () => {
  assert.match(pageSource, /gojoPickupLane \?\? gojoLineAhead\?\.lane/);
  assert.match(pageSource, /Number\.isFinite\(rival\.avoidanceThreatDistance\)[\s\S]{0,100}\? rival\.avoidanceRouteLane[\s\S]{0,100}: gojoLineAhead\?\.lane/);
});

test("Gojo reserves the Ghost takeoff before ordinary road jump physics can claim it", () => {
  assert.equal(gojoRecordedShortcutApproachPhase({ distanceToRecordedTakeoff: 81 }), "none");
  assert.equal(gojoRecordedShortcutApproachPhase({ distanceToRecordedTakeoff: 50 }), "reserve");
  assert.equal(gojoRecordedShortcutApproachPhase({ distanceToRecordedTakeoff: 24 }), "launch");
  assert.equal(gojoRecordedShortcutApproachPhase({ distanceToRecordedTakeoff: 1 }), "launch");
  assert.equal(gojoRecordedShortcutApproachPhase({ distanceToRecordedTakeoff: -3 }), "none");
  assert.match(pageSource, /!gojoRecordedShortcutReserved && rivalWorldSpeed >= JUMP_MIN_SPEED/);
});

test("recorded shortcut flight is the straight shortest line between takeoff and landing", () => {
  assert.deepEqual(recordedShortcutFlightPosition({
    startX: -10,
    startZ: 20,
    endX: 30,
    endZ: -20,
    progress: 0.5,
  }), { x: 10, z: 0 });
  assert.deepEqual(recordedShortcutFlightPosition({
    startX: -10,
    startZ: 20,
    endX: 30,
    endZ: -20,
    progress: 2,
  }), { x: 30, z: -20 });
  assert.match(pageSource, /const shortcutBase = recordedShortcutFlightPosition/);
});

test("Gojo never selects GIANT or an unrecorded shortcut and actively seeks items", () => {
  const skillPlanner = pageSource.slice(
    pageSource.indexOf("const chooseGojoSkill"),
    pageSource.indexOf("const activateActorItem"),
  );
  assert.doesNotMatch(skillPlanner, /"GIANT"|findRivalShortcut|pendingRivalShortcuts\.set/);
  assert.match(pageSource, /rival\.name === "Gojo"[\s\S]{0,160}now \+ 180 \+ Math\.random\(\) \* 320/);
  assert.match(pageSource, /let gojoPickupLane: number \| null = null/);
  assert.match(pageSource, /GOJO_ITEM_PICKUP_RADIUS = 3\.4/);
  assert.match(pageSource, /const shouldGojoUseHeldItem =/);
  assert.match(pageSource, /item === "HOMING"\) return targetOnePlaceAhead\(actorId\) !== null/);
  assert.match(pageSource, /item === "BOOST"[\s\S]{0,500}Math\.abs\(headingDelta\) <= 0\.12/);
  assert.match(pageSource, /skillOrder\.some\(\(skill\) => activateSkillById/);
});

test("starlight Gojo avoids falling stars during the recorded turbo jump without waiting", () => {
  const common = {
    startX: 0,
    startY: 10,
    startZ: 0,
    endX: 100,
    endZ: 0,
    currentProgress: 0.1,
    duration: 2,
    launchVelocity: 10,
    gravity: 10,
  };
  const avoidance = chooseRecordedShortcutStarAvoidance({
    ...common,
    stars: [{ x: 50, y: 25, z: 0, fallSpeed: 10 }],
  });
  assert.equal(Math.abs(avoidance), 5.2);
  assert.equal(chooseRecordedShortcutStarAvoidance({
    ...common,
    stars: [{ x: 50, y: 25, z: 20, fallSpeed: 10 }],
  }), 0);
  assert.match(pageSource, /shortcutAvoidTarget = rival\.name === "Gojo"/);
  assert.doesNotMatch(pageSource, /recordedShortcutBlockedUntil|delayRecordedShortcut/);
});

test("only FIRE, HOMING and SHIELD can be used during a crash", () => {
  for (const item of ["FIRE", "HOMING", "SHIELD"]) assert.equal(canActivateItem(item, true), true, item);
  for (const item of ["BOOST", "SPIKES", "NOVA", "EMPTY"]) assert.equal(canActivateItem(item, true), false, item);
});

test("every non-empty item remains usable while drifting or driving normally", () => {
  for (const item of ["FIRE", "HOMING", "SHIELD", "BOOST", "SPIKES", "NOVA"]) {
    assert.equal(canActivateItem(item, false), true, item);
  }
});

test("item boost momentum keeps legacy gravity through the takeoff grace window", () => {
  const common = { drifting: false, driftBoost: 0, jumpGravity: 9.81, strongGravity: 12.75 };
  assert.equal(takeoffGravity({ ...common, now: 3_400, boostGravityUntil: 3_500 }), 9.81);
  assert.equal(takeoffGravity({ ...common, now: 3_500, boostGravityUntil: 3_500 }), 12.75);
});

test("homing progress keeps its own speed after closing the longitudinal gap", () => {
  const courseLength = 870;
  let missile = 0;
  let target = 20 / courseLength;
  for (let frame = 0; frame < 180; frame += 1) {
    target += (34 / courseLength) / 60;
    missile = advanceHomingProgress({
      projectileProgress: missile,
      targetProgress: target,
      projectileSpeed: 49,
      courseLength,
      dt: 1 / 60,
    });
  }
  assert.ok((missile - target) * courseLength > 20);
});

test("homing collision checks the complete visible movement segment", () => {
  assert.equal(pointToSegmentDistance3d({
    point: { x: 0, y: 0.5, z: 0 },
    start: { x: -2, y: 0, z: 0 },
    end: { x: 2, y: 0, z: 0 },
  }), 0.5);
  assert.match(pageSource, /projectile\.terminalPursuit/);
  assert.match(pageSource, /Math\.min\(directDistance, sweptDistance\) < hitDistance/);
});

test("ranking progress advances only while the kart is touching the road", () => {
  assert.equal(rankingProgressFromGroundContact({
    previousRankingProgress: 1.25,
    courseProgress: 1.31,
    airborne: false,
  }), 1.31);
  assert.equal(rankingProgressFromGroundContact({
    previousRankingProgress: 1.25,
    courseProgress: 1.62,
    airborne: true,
  }), 1.25);
  assert.match(pageSource, /rankingProgress: PLAYER_START_PROGRESS/);
  assert.match(pageSource, /const position = actorRank\(0\)/);
});

test("course progress accepts only a nearby continuous section and updates progress and its anchor together", () => {
  const result = resolveTrackedCourseProgress({
    currentProgress: 1.99,
    lastU: 0.99,
    candidateU: 0.01,
    candidateDistance: 1.2,
    maxDistance: 10.1,
    minimumProgress: -0.01,
  });
  assert.equal(result.accepted, true);
  assert.ok(Math.abs(result.delta - 0.02) < 1e-12);
  assert.ok(Math.abs(result.progress - 2.01) < 1e-12);
  assert.ok(Math.abs(result.lastU - 0.01) < 1e-12);
});

test("an implausible nearby section cannot poison the next lap-tracking anchor", () => {
  const base = {
    currentProgress: 1.24,
    lastU: 0.24,
    candidateDistance: 2,
    maxDistance: 10.1,
    minimumProgress: -0.01,
  };
  assert.deepEqual(resolveTrackedCourseProgress({ ...base, candidateU: 0.47 }), {
    accepted: false,
    delta: 0,
    progress: 1.24,
    lastU: 0.24,
  });
  assert.deepEqual(resolveTrackedCourseProgress({ ...base, candidateU: 0.26, candidateDistance: 14 }), {
    accepted: false,
    delta: 0,
    progress: 1.24,
    lastU: 0.24,
  });
  assert.match(pageSource, /const trackedProgress = resolveTrackedCourseProgress/);
  assert.match(pageSource, /playerState\.lastU = trackedProgress\.lastU/);
});

test("the finish line records only crossings within the road width and at or above its surface", () => {
  const common = {
    finishPoint: { x: 0, y: 0, z: 0 },
    finishForward: { x: 0, z: 1 },
    finishNormal: { x: 1, z: 0 },
    finishHalfWidth: 10,
    checkpointReached: true,
  };
  assert.equal(finishLineCrossingFraction({
    ...common,
    previousPosition: { x: 2, y: 80, z: -4 },
    currentPosition: { x: 2, y: 77, z: 6 },
  }), 0.4);
  assert.equal(finishLineCrossingFraction({
    ...common,
    previousPosition: { x: 2, y: 0, z: -2 },
    currentPosition: { x: 2, y: 0, z: 8 },
  }), 0.2);
  assert.equal(finishLineCrossingFraction({
    ...common,
    previousPosition: { x: 2, y: -8, z: -4 },
    currentPosition: { x: 2, y: -6, z: 6 },
  }), null);
  assert.equal(finishLineCrossingFraction({
    ...common,
    previousPosition: { x: 2, y: -3, z: -4 },
    currentPosition: { x: 2, y: 3, z: 6 },
  }), null);
  assert.equal(finishLineCrossingFraction({
    ...common,
    previousPosition: { x: 2, y: -0.1, z: -4 },
    currentPosition: { x: 2, y: -0.1, z: 6 },
  }), 0.4);
  assert.equal(finishLineCrossingFraction({
    ...common,
    previousPosition: { x: 2, y: -0.13, z: -4 },
    currentPosition: { x: 2, y: -0.13, z: 6 },
  }), null);
  assert.equal(finishLineCrossingFraction({
    ...common,
    previousPosition: { x: 14, y: 80, z: -4 },
    currentPosition: { x: 14, y: 77, z: 6 },
  }), null);
  assert.equal(finishLineCrossingFraction({
    ...common,
    checkpointReached: false,
    previousPosition: { x: 2, y: 80, z: -4 },
    currentPosition: { x: 2, y: 77, z: 6 },
  }), null);
  assert.match(pageSource, /crossings\.sort\(\(a, b\) => a\.fraction - b\.fraction/);
  assert.doesNotMatch(pageSource, /playerState\.progress >= totalLaps - 0\.005/);
});

test("the final checkpoint is armed by any grounded road contact at or beyond halfway", () => {
  const common = { previousReached: false, totalLaps: 3 };
  assert.equal(finalLapCheckpointFromGroundContact({
    ...common,
    courseProgress: 2.49,
    airborne: false,
  }), false);
  assert.equal(finalLapCheckpointFromGroundContact({
    ...common,
    courseProgress: 2.7,
    airborne: true,
  }), false);
  assert.equal(finalLapCheckpointFromGroundContact({
    ...common,
    courseProgress: 2.7,
    airborne: false,
  }), true);
  assert.equal(finalLapCheckpointFromGroundContact({
    ...common,
    courseProgress: 2.7,
    airborne: false,
    offRoad: true,
  }), false);
  assert.equal(finalLapCheckpointFromGroundContact({
    previousReached: true,
    courseProgress: 2.1,
    totalLaps: 3,
    airborne: false,
  }), true);
  assert.equal(finalLapCheckpointFromGroundContact({
    previousReached: false,
    courseProgress: 4.6,
    totalLaps: 5,
    airborne: false,
  }), true);
  assert.match(pageSource, /const finishCheckpointReached = actorIds\.map\(\(\) => false\)/);
  assert.match(pageSource, /finishCheckpointReached\[actorId\] = finalLapCheckpointFromGroundContact/);
  assert.match(pageSource, /courseProgress: actorProgress\(actorId\)/);
});

test("a long final-lap jump stays eligible after grounded contact beyond halfway", () => {
  const crossing = {
    // One physics step spans 180 world units, reproducing a very fast kart
    // moving from well before to well beyond the visible finish line.
    previousPosition: { x: 2, y: 18, z: -75 },
    currentPosition: { x: 2, y: 16, z: 105 },
    finishPoint: { x: 0, y: 0, z: 0 },
    finishForward: { x: 0, z: 1 },
    finishNormal: { x: 1, z: 0 },
    finishHalfWidth: 10,
  };

  assert.equal(finishLineCrossingFraction({ ...crossing, checkpointReached: false }), null);
  const highSpeedFraction = finishLineCrossingFraction({ ...crossing, checkpointReached: true });
  assert.ok(Math.abs(highSpeedFraction - 5 / 12) < 1e-9);
  assert.doesNotMatch(pageSource, /const finishArmingProgress/);
});

test("only an airborne kart can finish from the road area beyond the finish line", () => {
  const common = {
    checkpointReached: true,
    previousInside: false,
    currentInside: true,
    entryFraction: 0.37,
  };
  assert.equal(airborneFinishZoneFraction({ ...common, airborne: true }), 0.37);
  assert.equal(airborneFinishZoneFraction({ ...common, airborne: false }), null);
  assert.equal(airborneFinishZoneFraction({ ...common, airborne: true, checkpointReached: false }), null);
  assert.equal(airborneFinishZoneFraction({ ...common, airborne: true, currentInside: false }), null);
  assert.equal(airborneFinishZoneFraction({ ...common, airborne: true, previousInside: true }), null);
  assert.match(pageSource, /checkpointReached: finishCheckpointReached\[actorId\]/);
  assert.match(pageSource, /postFinishZoneEntryFraction/);
  assert.doesNotMatch(pageSource, /overPostFinishRoad:/);
  assert.doesNotMatch(pageSource, /airborneFinishZoneFraction\(\{[\s\S]{0,300}currentCourseProgress:/);
});

test("the airborne finish zone excludes every position below its local road surface", () => {
  const common = {
    finishPoint: { x: 0, y: 5, z: 0 },
    finishForward: { x: 0, z: 1 },
    roadSamples: [
      { x: 0, y: 5, z: 0, u: 0 },
      { x: 0, y: 8, z: 20, u: 0.1 },
    ],
    overheadRoadSamples: [
      { x: 0, y: 20, z: 20, u: 0.65 },
    ],
    radius: 12,
  };
  assert.equal(isInsideAirborneFinishZone({ ...common, position: { x: 4, y: 12, z: 20 } }), true);
  assert.equal(isInsideAirborneFinishZone({ ...common, position: { x: 4, y: 8, z: 20 } }), true);
  assert.equal(isInsideAirborneFinishZone({ ...common, position: { x: 4, y: 7.7, z: 20 } }), false);
  assert.equal(isInsideAirborneFinishZone({ ...common, position: { x: 4, y: 19.7, z: 20 } }), true);
  assert.equal(isInsideAirborneFinishZone({ ...common, position: { x: 4, y: 20, z: 20 } }), false);
  assert.equal(isInsideAirborneFinishZone({ ...common, position: { x: 4, y: 12, z: -1 } }), false);
  assert.match(pageSource, /roadSamples: postFinishZoneSamples/);
  assert.match(pageSource, /overheadRoadSamples: finishLayerSamples/);
});

test("a road overhead caps both the direct and extended airborne finish area", () => {
  const roadSamples = [{ x: 0, y: 0, z: 0, u: 0 }];
  const overheadRoadSamples = [{ x: 0, y: 12, z: 0, u: 0.6 }];
  assert.equal(isWithinFinishRoadHeight({
    position: { x: 0, y: 11.5, z: 0 },
    roadSamples,
    overheadRoadSamples,
    radius: 10,
  }), true);
  assert.equal(isWithinFinishRoadHeight({
    position: { x: 0, y: 12, z: 0 },
    roadSamples,
    overheadRoadSamples,
    radius: 10,
  }), false);
  const crossing = {
    previousPosition: { x: 0, y: 12, z: -2 },
    currentPosition: { x: 0, y: 12, z: 2 },
    finishPoint: { x: 0, y: 0, z: 0 },
    finishForward: { x: 0, z: 1 },
    finishNormal: { x: 1, z: 0 },
    finishHalfWidth: 10,
    checkpointReached: true,
    roadSamples,
    overheadRoadSamples,
    roadRadius: 10,
  };
  assert.equal(finishLineCrossingFraction(crossing), null);
  assert.equal(finishLineCrossingFraction({
    ...crossing,
    previousPosition: { x: 0, y: 11.5, z: -2 },
    currentPosition: { x: 0, y: 11.5, z: 2 },
  }), 0.5);
});

test("the redesigned character skills no longer crash opponents", () => {
  for (const attack of ["PIXEL", "VOLT", "COMET"]) assert.equal(crashDurationForAttack(attack, 1160), 1160, attack);
  for (const attack of ["FIRE", "HOMING", "AURORA", "SPIKES", "NOVA", "MONKEY", "CANNON"]) {
    assert.equal(crashDurationForAttack(attack, 1160), 1160, attack);
  }
  assert.match(pageSource, /skillName: "VECTOR TURBO"/);
  assert.match(pageSource, /skillName: "OVERCHARGE DRIFT"/);
  assert.match(pageSource, /skillName: "COMET STREAM"/);
});

test("shield and aurora still cover direct course attacks", () => {
  for (const attack of ["MONKEY", "CANNON", "SHOOTING_STAR"]) {
    assert.equal(isShieldableAttack(attack), true, attack);
  }
  for (const attack of ["PIXEL", "VOLT", "COMET"]) assert.equal(isShieldableAttack(attack), false, attack);
  assert.equal(isShieldableAttack("NOVA"), false);
});

test("SPIKES level three guards only against item attacks", () => {
  for (const attack of ["FIRE", "HOMING", "AURORA", "SPIKES", "NOVA"]) {
    assert.equal(isSpikeGuardAttack(attack), true, attack);
  }
  for (const attack of ["PIXEL", "VOLT", "COMET", "MONKEY", "CANNON", "SHOOTING_STAR"]) {
    assert.equal(isSpikeGuardAttack(attack), false, attack);
  }
});

test("VECTOR TURBO continues only while steering stays neutral", () => {
  assert.equal(vectorTurboRemainsActive({ active: true, steer: 0 }), true);
  assert.equal(vectorTurboRemainsActive({ active: true, steer: 0.07 }), true);
  assert.equal(vectorTurboRemainsActive({ active: true, steer: 0.09 }), false);
  assert.equal(vectorTurboRemainsActive({ active: true, steer: 0, airborne: true }), true);
  assert.equal(vectorTurboRemainsActive({ active: true, steer: 0, crashing: true }), false);
});

test("CPU VECTOR TURBO has no timer and ends after even a small direction change", () => {
  assert.equal(CPU_VECTOR_DIRECTION_EPSILON, 0.0025);
  assert.equal(cpuVectorTurboRemainsActive({ active: true, startHeading: 0, currentHeading: 0 }), true);
  assert.equal(cpuVectorTurboRemainsActive({ active: true, startHeading: 0, currentHeading: 0.002 }), true);
  assert.equal(cpuVectorTurboRemainsActive({ active: true, startHeading: 0, currentHeading: 0.003 }), false);
  assert.equal(cpuVectorTurboRemainsActive({ active: true, startHeading: Math.PI - 0.001, currentHeading: -Math.PI + 0.001 }), true);
  assert.equal(cpuVectorTurboRemainsActive({ active: true, startHeading: 0, currentHeading: 0, crashing: true }), false);
  assert.doesNotMatch(pageSource, /cpuVectorDurationMs|vectorDurationActive|vectorSteerDemand/);
  const cpuLoop = pageSource.indexOf("rivalStates.forEach((rival, index) => {");
  const directionCheck = pageSource.indexOf("const vectorTravelPose = actorPose(index + 1)", cpuLoop);
  const shortcutBranch = pageSource.indexOf("if (rival.shortcutActive)", cpuLoop);
  assert.ok(directionCheck > cpuLoop && directionCheck < shortcutBranch, "direction monitoring must run before ground/air branches");
});

test("OVERCHARGE DRIFT distinguishes the orange and red release bands", () => {
  assert.deepEqual(resolveOverchargeDrift({ charge: 0.4, released: false }), { outcome: "charging", boost: 0 });
  assert.equal(VOLT_SUCCESS_MIN, 0.7);
  assert.equal(VOLT_SUCCESS_MAX, 0.8);
  assert.equal(VOLT_CRITICAL_MIN, 0.73);
  assert.equal(VOLT_CRITICAL_MAX, 0.77);
  assert.equal(SKILL_TURBO_DURATION_MS, 3000);
  assert.equal(resolveOverchargeDrift({ charge: 0.699, released: true }).outcome, "undercharge");
  assert.deepEqual(resolveOverchargeDrift({ charge: 0.7, released: true }), {
    outcome: "success", boost: 1, multiplier: 1, durationMs: 3000,
  });
  assert.deepEqual(resolveOverchargeDrift({ charge: 0.75, released: true }), {
    outcome: "critical-success", boost: 1, multiplier: 1.5, durationMs: 3000,
  });
  assert.deepEqual(resolveOverchargeDrift({ charge: 0.8, released: true }), {
    outcome: "success", boost: 1, multiplier: 1, durationMs: 3000,
  });
  assert.deepEqual(resolveOverchargeDrift({ charge: 0.801, released: true }), { outcome: "overheat", boost: 0 });
  assert.deepEqual(resolveOverchargeDrift({ charge: 1, released: false }), { outcome: "overheat", boost: 0 });
  assert.match(pageSource, /pendingVoltReleaseBoost/);
  assert.match(pageSource, /ITEM_PICKUP_RADIUS = 2\.65/);
});

test("CPU skill outcomes follow the requested regular and Gojo distributions", () => {
  assert.equal(cpuOverchargeTarget({ gojo: false, roll: 0.199 }).tier, "critical");
  assert.equal(cpuOverchargeTarget({ gojo: false, roll: 0.2 }).tier, "orange");
  assert.equal(cpuOverchargeTarget({ gojo: true, roll: 0.399 }).tier, "critical");
  assert.equal(cpuOverchargeTarget({ gojo: true, roll: 0.4 }).tier, "orange");

  assert.equal(cpuCometGateTarget({ gojo: false, roll: 0.299 }), 1);
  assert.equal(cpuCometGateTarget({ gojo: false, roll: 0.3 }), 2);
  assert.equal(cpuCometGateTarget({ gojo: false, roll: 0.899 }), 2);
  assert.equal(cpuCometGateTarget({ gojo: false, roll: 0.9 }), 3);
  assert.equal(cpuCometGateTarget({ gojo: true, roll: 0.099 }), 1);
  assert.equal(cpuCometGateTarget({ gojo: true, roll: 0.1 }), 2);
  assert.equal(cpuCometGateTarget({ gojo: true, roll: 0.599 }), 2);
  assert.equal(cpuCometGateTarget({ gojo: true, roll: 0.6 }), 3);
});

test("skill UI exposes the activation instructions, success feedback, and twenty-second cooldowns", () => {
  assert.equal((pageSource.match(/cooldownMs: 20000/g) ?? []).length, 5);
  assert.match(pageSource, /左右入力するまで加速！！/);
  assert.match(pageSource, /BOOST UNTIL YOU STEER!!/);
  assert.match(pageSource, /赤いラインでドリフト解除！！/);
  assert.match(pageSource, /RELEASE DRIFT IN THE RED ZONE!!/);
  assert.match(pageSource, /輪をくぐれ！！/);
  assert.match(pageSource, /PASS THROUGH THE RINGS!!/);
  assert.match(pageSource, /voltState\.outcome === "critical-success" \? "Success!!" : "Success"/);
  assert.match(pageSource, /voltState\.outcome === "critical-success" \? "critical" : "orange"/);
  assert.match(pageSource, /`Success×\$\{completedGateCount\}`/);
  assert.match(pageSource, /volt-success-band/);
  assert.match(pageSource, /volt-critical-band/);
});

test("signature skill boosts use the revised acceleration and duration tiers", () => {
  assert.match(pageSource, /playerState\.vectorTurboActive \? 3 : 0/);
  assert.match(pageSource, /rival\.vectorTurboActive \? 3 : 0/);
  assert.match(pageSource, /clamp\(multiplier, 0\.7, 3\)/);
  assert.match(pageSource, /completedGateCount === 1 \? 0\.7 : completedGateCount === 2 \? 1 : 1\.5/);
  assert.match(pageSource, /completedGateCount === 1 \? 2000 : 3000/);
});

test("COMET STREAM gates pass only through their visible lane and fail after overshoot", () => {
  const common = { gateProgress: 1.2, gateLane: 3, courseLength: 900 };
  assert.equal(cometGateResult({ ...common, actorProgress: 1.2, actorLane: 3 }), "passed");
  assert.equal(cometGateResult({ ...common, actorProgress: 1.2, actorLane: -3 }), "pending");
  assert.equal(cometGateResult({ ...common, actorProgress: 1.211, actorLane: 3 }), "missed");
});

test("COMET STREAM keeps wide gate spacing while guiding bends that hide the next ring", () => {
  assert.match(pageSource, /COMET_GATE_SPACING_METERS = 42/);
  assert.match(pageSource, /COMET_GATE_VISIBLE_SEARCH_METERS = 60/);
  assert.match(pageSource, /for \(let distanceMeters = COMET_GATE_SPACING_METERS;/);
  assert.match(pageSource, /chooseCometGatePlacement\(actorProgress\(owner\), actorPose\(owner\), gateLanes\[0\]\)/);
  assert.match(pageSource, /cometGateTimeoutFor\(owner, firstGatePlacement\.distanceMeters\)/);
  assert.match(pageSource, /className="comet-gate-pointer"/);
  assert.match(pageSource, /cometGatePointer\.dataset\.gate/);
  assert.match(cssSource, /\.comet-gate-pointer\s*\{/);
  assert.match(cssSource, /\.comet-gate-pointer\.onscreen/);
});

test("pirate course uploads every major deck and interior section before countdown", () => {
  assert.match(pageSource, /PIRATE_RENDER_WARMUP_PROGRESS = \[0\.02, 0\.12, 0\.22, 0\.32, 0\.42, 0\.52, 0\.62, 0\.72, 0\.82, 0\.92\]/);
  assert.match(pageSource, /courseDefinition\.id === "pirate"[\s\S]{0,120}phaseRef\.current === "loading"[\s\S]{0,120}!readyReported/);
  assert.match(pageSource, /const warmupPose = course\.pointAt\(pirateWarmupProgress\)/);
  assert.match(pageSource, /presentation\.render\(dt, player\.position, false, false, cameraView\.fov, true\);\s*courseRenderWarmupIndex \+= 1/);
  assert.match(pageSource, /courseRenderWarmupIndex >= PIRATE_RENDER_WARMUP_PROGRESS\.length[\s\S]{0,100}camera\.position\.set\(0, 0, 0\)/);
});

test("the race loop survives one-off frame errors and item boxes have a two-second pickup lockout", () => {
  assert.match(pageSource, /frame = requestAnimationFrame\(animate\);\s*let frameStage/);
  assert.match(pageSource, /catch \(error\) \{\s*physicsAccumulatorMs = 0/);
  assert.match(pageSource, /RACE_FAULT_STORAGE_KEY/);
  assert.match(pageSource, /webglcontextlost/);
  assert.match(pageSource, /ITEM_PICKUP_COOLDOWN_MS = 2000/);
  assert.match(pageSource, /now < itemPickupReadyAt\[actorId\]/);
  assert.match(pageSource, /itemPickupReadyAt\[actorId\] = now \+ ITEM_PICKUP_COOLDOWN_MS/);
});

test("persistent race faults are throttled and can be exported from the game", () => {
  assert.match(pageSource, /if \(now - lastRaceFaultAt < 1000\) return;\s*lastRaceFaultAt = now;\s*console\.error/);
  assert.match(pageSource, /onRaceFault\(diagnostic\)/);
  assert.match(pageSource, /window\.localStorage\.getItem\(RACE_FAULT_STORAGE_KEY\)/);
  assert.match(pageSource, /navigator\.clipboard\.writeText\(report\)/);
  assert.match(pageSource, /FREEZE DIAGNOSTIC/);
});

test("CPU skill scheduling never reads drift variables after their driving scope closes", () => {
  const skillTailStart = pageSource.indexOf("if (skillsEnabled && evolutionFeatures.skills && !rival.skillScheduled)");
  const skillTailEnd = pageSource.indexOf("if (recordFinishLineCrossings())", skillTailStart);
  assert.ok(skillTailStart > 0 && skillTailEnd > skillTailStart);
  const skillTail = pageSource.slice(skillTailStart, skillTailEnd);
  assert.doesNotMatch(skillTail, /\bwantsDrift\b/);
  assert.doesNotMatch(skillTail, /\bturnSeverity\b/);
  assert.match(pageSource, /cpuSkillWantsDrift = wantsDrift;/);
  assert.match(pageSource, /cpuSkillTurnSeverity = turnSeverity;/);
  assert.match(pageSource, /cpuSkillSteer = wantsDrift \|\| turnSeverity/);
});

test("portrait screens widen the camera instead of cropping the race view", () => {
  const landscape = cameraViewForViewport({ width: 1920, height: 1080 });
  const portrait = cameraViewForViewport({ width: 390, height: 844 });
  assert.equal(landscape.portrait, false);
  assert.equal(portrait.portrait, true);
  assert.ok(portrait.fov > landscape.fov);
  assert.ok(portrait.chaseDistance > landscape.chaseDistance);
  assert.ok(portrait.lookAhead > landscape.lookAhead);
});

test("GIANT LEAP inherits the road vertical speed on flat and sloped roads", () => {
  const jumpImpulse = Math.sqrt(2 * 12.75 * 6.3);
  assert.equal(giantLeapVerticalVelocity({ surfaceVerticalVelocity: 0, gravity: 12.75, height: 6.3 }), jumpImpulse);
  assert.equal(giantLeapVerticalVelocity({ surfaceVerticalVelocity: 6, gravity: 12.75, height: 6.3 }), jumpImpulse + 6);
  assert.equal(giantLeapVerticalVelocity({ surfaceVerticalVelocity: -4, gravity: 12.75, height: 6.3 }), jumpImpulse - 4);
  assert.match(pageSource, /height: leapProfile\.height/);
});

test("GIANT LEAP accelerates the complete launch vector by 1.3 without changing its direction", () => {
  assert.equal(GIANT_LEAP_SPEED_MULTIPLIER, 1.3);
  const forwardLaunch = accelerateGiantLeapVelocity({ forwardVelocity: 20, verticalVelocity: 8 });
  assert.deepEqual(forwardLaunch, { forwardVelocity: 26, verticalVelocity: 10.4 });
  assert.equal(forwardLaunch.verticalVelocity / forwardLaunch.forwardVelocity, 8 / 20);

  const reverseLaunch = accelerateGiantLeapVelocity({ forwardVelocity: -20, verticalVelocity: 8 });
  assert.deepEqual(reverseLaunch, { forwardVelocity: -26, verticalVelocity: 10.4 });
  assert.match(pageSource, /const acceleratedLaunch = accelerateGiantLeapVelocity\(\{\s*forwardVelocity: baseForwardVelocity,\s*verticalVelocity: baseVerticalVelocity/);
  assert.match(pageSource, /playerState\.speed = acceleratedLaunch\.forwardVelocity/);
  assert.match(pageSource, /playerState\.verticalVelocity = acceleratedLaunch\.verticalVelocity/);
});

test("GIANT LEAP charge reaches 75 degrees in 1.8 seconds", () => {
  assert.equal(GIANT_LEAP_MAX_ANGLE, 75);
  assert.equal(GIANT_LEAP_CHARGE_DURATION_MS, 1800);
  assert.equal(giantLeapChargeAngle({ elapsedMs: 0 }), 0);
  assert.equal(giantLeapChargeAngle({ elapsedMs: 720 }), 30);
  assert.equal(giantLeapChargeAngle({ elapsedMs: 1200 }), 50);
  assert.equal(giantLeapChargeAngle({ elapsedMs: 1680 }), 70);
  assert.equal(giantLeapChargeAngle({ elapsedMs: 9999 }), 75);
});

test("GIANT LEAP angle bands reject mistakes and select distinct flights", () => {
  assert.equal(giantLeapProfileForAngle(9.99).outcome, "undercharge");
  assert.equal(giantLeapProfileForAngle(10).outcome, "low-dash");
  assert.equal(giantLeapProfileForAngle(29.99).outcome, "low-dash");
  assert.equal(giantLeapProfileForAngle(30).outcome, "long-jump");
  assert.equal(giantLeapProfileForAngle(49.99).outcome, "long-jump");
  assert.equal(giantLeapProfileForAngle(50).outcome, "high-jump");
  assert.equal(giantLeapProfileForAngle(69.99).outcome, "high-jump");
  assert.equal(giantLeapProfileForAngle(70).outcome, "overcharge");
});

test("GIANT LEAP low dash cannot clear the guardrail while higher bands can", () => {
  const lowDash = giantLeapProfileForAngle(29.99);
  const longJump = giantLeapProfileForAngle(30);
  const highJump = giantLeapProfileForAngle(60);
  assert.ok(lowDash.height < 0.55);
  assert.ok(lowDash.minimumForwardSpeed > 0);
  assert.equal(GIANT_LOW_DASH_DURATION_MS, 2000);
  assert.equal(lowDash.durationMs, 2000);
  assert.ok(longJump.height > 0.55);
  assert.ok(highJump.height > longJump.height);
  assert.ok(highJump.forwardSpeedMultiplier < longJump.forwardSpeedMultiplier);
  assert.match(pageSource, /const canClearBarrier = playerState\.airborne\s*&& !playerState\.giantLowDashActive/);
  assert.match(pageSource, /playerState\.giantLowDashUntil = now \+ GIANT_LOW_DASH_DURATION_MS/);
  assert.match(pageSource, /const giantLowDashBoosting = now < playerState\.giantLowDashUntil/);
});

test("GIANT LEAP can be charged and relaunched while already airborne", () => {
  const chargeGuard = pageSource.slice(
    pageSource.indexOf("const beginPlayerGiantCharge"),
    pageSource.indexOf("const releasePlayerGiantCharge"),
  );
  assert.doesNotMatch(chargeGuard, /playerState\.airborne/);
  assert.match(pageSource, /const launchedFromAir = playerState\.airborne/);
  assert.match(pageSource, /if \(!launchedFromAir\) \{\s*playerState\.recoveryProgress/);
  assert.match(pageSource, /if \(!launchedFromAir\) playerState\.y = nearest\.pose\.y \+ 0\.04/);
});

test("GIANT LEAP uses press, hold and release on every player input path", () => {
  assert.match(pageSource, /if \(useSkill && !skillPressed\) beginPlayerGiantCharge\(now\)/);
  assert.match(pageSource, /playerState\.giantLeapCharging && \(!useSkill \|\| now - playerState\.giantLeapChargeStartedAt >= GIANT_LEAP_CHARGE_DURATION_MS\)/);
  assert.match(pageSource, /pointer\.skillHold = true/);
  assert.match(pageSource, /if \(pointer\.skillHold\) \{/);
});

test("landing checks vertical motion relative to an uphill or downhill road", () => {
  assert.equal(isApproachingRoad({ airVerticalVelocity: 5, surfaceVerticalVelocity: 7 }), true);
  assert.equal(isApproachingRoad({ airVerticalVelocity: 8, surfaceVerticalVelocity: 7 }), false);
  assert.equal(isApproachingRoad({ airVerticalVelocity: -3, surfaceVerticalVelocity: -1 }), true);
});

test("airborne karts never receive the off-road speed cap", () => {
  const common = { roadSpeedCap: 34, offRoadSpeedCap: 13 };
  assert.equal(freeDriveSpeedCap({ ...common, airborne: false, onRoad: false, currentSpeed: 31 }), 13);
  assert.equal(freeDriveSpeedCap({ ...common, airborne: true, onRoad: false, currentSpeed: 31 }), 34);
  assert.equal(freeDriveSpeedCap({ ...common, airborne: true, onRoad: false, currentSpeed: 42 }), 42);
});

test("fall recovery starts below the course floor and triggers two seconds later", () => {
  const aboveCourse = updateBelowCourseRecovery({
    now: 1000,
    altitude: 3,
    lowestRoadHeight: 3,
    belowCourseSince: null,
  });
  assert.deepEqual(aboveCourse, { belowCourseSince: null, shouldRecover: false });

  const crossedBelow = updateBelowCourseRecovery({
    now: 1500,
    altitude: 2.99,
    lowestRoadHeight: 3,
    belowCourseSince: null,
  });
  assert.deepEqual(crossedBelow, { belowCourseSince: 1500, shouldRecover: false });
  assert.equal(updateBelowCourseRecovery({
    now: 3499,
    altitude: -5,
    lowestRoadHeight: 3,
    belowCourseSince: crossedBelow.belowCourseSince,
  }).shouldRecover, false);
  assert.equal(updateBelowCourseRecovery({
    now: 3500,
    altitude: -5,
    lowestRoadHeight: 3,
    belowCourseSince: crossedBelow.belowCourseSince,
  }).shouldRecover, true);

  const returnedAbove = updateBelowCourseRecovery({
    now: 2000,
    altitude: 3.01,
    lowestRoadHeight: 3,
    belowCourseSince: crossedBelow.belowCourseSince,
  });
  assert.deepEqual(returnedAbove, { belowCourseSince: null, shouldRecover: false });
});

test("the race derives its floor from the current course and no longer uses an airborne timeout", () => {
  assert.match(pageSource, /const lowestRoadHeight = samples\.reduce/);
  assert.match(pageSource, /lowestRoadHeight: course\.lowestRoadHeight/);
  assert.doesNotMatch(pageSource, /fallRecoveryExpired/);
});

test("landing requires visual contact with the road footprint", () => {
  const common = { roadHalfWidth: 10, contactMargin: 0.35 };
  assert.equal(isWithinRoadFootprint({ ...common, surfaceDistance: 8, lane: 8 }), true);
  assert.equal(isWithinRoadFootprint({ ...common, surfaceDistance: 10.3, lane: 10.2 }), true);
  assert.equal(isWithinRoadFootprint({ ...common, surfaceDistance: 10.9, lane: 10.9 }), false);
  assert.equal(isWithinRoadFootprint({ ...common, surfaceDistance: 24, lane: 0 }), false);
  assert.equal(isWithinRoadFootprint({ ...common, surfaceDistance: 9, lane: 12 }), false);
});

test("one fifth of the kart touching the road is enough to land", () => {
  const common = {
    roadHalfWidth: 10,
    kartHalfWidth: 1.55,
    minimumKartOverlapFraction: 0.2,
  };
  assert.equal(isWithinRoadFootprint({ ...common, surfaceDistance: 10.93, lane: 10.93 }), true);
  assert.equal(isWithinRoadFootprint({ ...common, surfaceDistance: 10.94, lane: 10.94 }), false);
  assert.equal(isWithinRoadFootprint({ ...common, surfaceDistance: 10.2, lane: -10.2 }), true);
});

test("a guardrail jump starts falling only after the whole kart clears the rail", () => {
  const common = { guardrailLane: 12.45, kartHalfWidth: 1.55 };
  assert.equal(hasFullyClearedGuardrail({ ...common, lane: 10.9 }), false);
  assert.equal(hasFullyClearedGuardrail({ ...common, lane: 13.99 }), false);
  assert.equal(hasFullyClearedGuardrail({ ...common, lane: 14.01 }), true);
  assert.equal(hasFullyClearedGuardrail({ ...common, lane: -14.01 }), true);
});

test("one fifth of the kart crossing a guardrail is enough to catch the landing", () => {
  const common = {
    guardrailLane: 12.45,
    kartHalfWidth: 1.55,
    minimumKartOverlapFraction: 0.2,
  };
  assert.equal(overlapsGuardrailByFraction({ ...common, lane: 11.52 }), true);
  assert.equal(overlapsGuardrailByFraction({ ...common, lane: 11.51 }), false);
  assert.equal(overlapsGuardrailByFraction({ ...common, lane: 12.45 }), true);
  assert.equal(overlapsGuardrailByFraction({ ...common, lane: 13.38 }), true);
  assert.equal(overlapsGuardrailByFraction({ ...common, lane: 13.39 }), false);
  assert.equal(overlapsGuardrailByFraction({ ...common, lane: -12.45 }), true);
});

test("guardrail falls cannot use height-only landing recovery", () => {
  assert.match(pageSource, /const reachedRoadSurface = playerState\.offTrackSince\s*\? sweptRoadCrossing/);
  assert.match(pageSource, /roadHalfWidth: playerState\.offTrackSince \? COURSE_WIDTH : BARRIER_LIMIT/);
  assert.match(pageSource, /if \(!playerState\.offTrackSince && Math\.abs\(lateralOffset\) > BARRIER_LIMIT\)/);
  assert.match(pageSource, /const clearedWholeKart = hasFullyClearedGuardrail/);
});
