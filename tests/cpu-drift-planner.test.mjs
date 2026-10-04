import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("CPU corner plans reserve at least three seconds before the predicted exit", () => {
  const minimumMs = Number(source.match(/CPU_MIN_CURVE_DRIFT_MS = (\d+)/)?.[1]);
  const marginMs = Number(source.match(/CPU_DRIFT_PLAN_MARGIN_MS = (\d+)/)?.[1]);
  assert.equal(minimumMs, 3000);
  assert.ok(marginMs >= 250 && marginMs <= 500);

  const speed = 34;
  const exitMeters = 190;
  const plannedStartMeters = exitMeters - speed * ((minimumMs + marginMs) / 1000);
  assert.ok((exitMeters - plannedStartMeters) / speed >= 3);
  assert.match(source, /Math\.min\(setupStartProgress, minimumDurationStartProgress\)/);
});

test("every detected CPU corner starts without a random or safety-cost veto", () => {
  assert.match(source, /Every detected corner is mandatory/);
  assert.match(source, /rival\.driftDecisionMade = setupReady;\s*rival\.wantsDrift|rival\.driftDecisionMade = setupReady;\s*wantsDrift = setupReady;/);
  const mandatoryBlock = source.slice(
    source.indexOf("Every detected corner is mandatory"),
    source.indexOf("if (!evolutionFeatures.drift)"),
  );
  assert.doesNotMatch(mandatoryBlock, /Math\.random|safeExit\.cost\s*</);
});

test("normal CPU releases at half a gauge while ghostless Ultimate Gojo commits longer", () => {
  assert.match(source, /const minimumDriftActive = now < rival\.driftMinimumUntil/);
  assert.match(source, /CPU_DRIFT_TURBO_PRIORITY_CHARGE = 0\.5/);
  assert.match(source, /const driftReleaseCharge = rival\.name === "Gojo" && ultimateGojoGenericAi/);
  assert.match(source, /: CPU_DRIFT_TURBO_PRIORITY_CHARGE/);
  assert.match(source, /const driftTurboReady = rival\.driftCharge >= driftReleaseCharge/);
  assert.match(source, /minimumDriftActive = now < rival\.driftMinimumUntil && !driftTurboReady/);
  assert.match(source, /&& !driftTurboReady\s*&& \(minimumDriftActive/);
  assert.match(source, /rival\.driftMinimumUntil = now \+ CPU_MIN_CURVE_DRIFT_MS/);
});

test("Gojo treats warned cloud gaps as dynamic route closures without inventing a shortcut", () => {
  assert.match(source, /const planGojoCloudAvoidance =/);
  assert.match(source, /selectedCloudGapKeys\.has\(key\)/);
  assert.match(source, /ageAtArrival >= 2150 && ageAtArrival <= 6150/);
  assert.match(source, /routePreferredLane = gojoCloudAvoiding \? rival\.cloudAvoidLane/);
  assert.doesNotMatch(source, /key: `cloud-gap:\$\{gojoCloudPlan\.key\}`/);
  assert.match(source, /may not invent a jump that was absent from the recorded line/);
});

test("CPU drift safety replans around walls, traffic, and course hazards", () => {
  assert.match(source, /rival\.driftSafetyCheckAt = now \+ 90/);
  assert.match(source, /for \(let otherId = 0; otherId < actorCount; otherId \+= 1\)/);
  assert.match(source, /const immediateThreats = cpuLaneThreats\(rival\.progress, now\)/);
  assert.match(source, /const barrierLane = CPU_DRIFT_SAFETY_LANE_LIMIT/);
});

test("CPU plans obstacle avoidance for 500 meters without braking", () => {
  assert.match(source, /CPU_OBSTACLE_LOOKAHEAD_METERS = 500/);
  assert.match(source, /CPU_OBSTACLE_ROUTE_STEP_METERS = 25/);
  assert.match(source, /const planCpuObstacleRoute =/);
  assert.match(source, /rival\.avoidanceRouteCheckAt = now \+ CPU_OBSTACLE_REPLAN_MS/);
  assert.match(source, /rival\.avoidanceRouteLane = avoidancePlan\.lane/);
  assert.doesNotMatch(source, /collisionSpeedCap/);
});
