import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  advanceRandomQuestCombo,
  CREATOR_THEMES,
  generateRandomQuestTour,
  insertRandomQuestScore,
  isRandomQuestPartClearanceSafe,
  MAX_RANDOM_QUEST_PARTS,
  MIN_OVERPASS_VERTICAL_CLEARANCE,
  MIN_RANDOM_QUEST_PARTS,
  RANDOM_ROAD_BREAKER_LANE_CENTER,
  RANDOM_ROAD_BREAKER_MAX_WIDTH,
  randomQuestRoundScore,
  validateRandomQuestCourse,
} from "../lib/random-quest-tour.mjs";

test("one quest tour uses three distinct scenery themes and stays deterministic for its seed", () => {
  const first = generateRandomQuestTour(0x12345678);
  const second = generateRandomQuestTour(0x12345678);
  assert.deepEqual(first, second);
  assert.equal(first.courses.length, 3);
  assert.equal(new Set(first.courses.map((course) => course.theme)).size, 3);
  first.courses.forEach((course) => assert.ok(CREATOR_THEMES.includes(course.theme)));
});

test("the three generated rounds use 30 to 50 prevalidated parts and reachable hazard sections", () => {
  const tour = generateRandomQuestTour(99181);
  assert.deepEqual(tour.courses.map((course) => course.hazards.length), [4, 6, 8]);
  tour.courses.forEach((course) => {
    assert.ok(course.parts.length >= MIN_RANDOM_QUEST_PARTS);
    assert.ok(course.parts.length <= MAX_RANDOM_QUEST_PARTS);
    const validation = validateRandomQuestCourse(course.parts);
    assert.equal(validation.valid, true);
    assert.ok(validation.closureDistance < 0.01);
    assert.ok(validation.closureHeight < 0.01);
    assert.equal(validation.unsafeOverlaps.length, 0);
    validation.allowedOverpasses.forEach((overpass) => {
      assert.ok(overpass.vertical >= MIN_OVERPASS_VERTICAL_CLEARANCE);
    });
    assert.equal(course.quests.length, 5);
    course.hazards.forEach((hazard) => {
      assert.ok(hazard.partIndex >= 2);
      assert.ok(hazard.partIndex < course.parts.length);
      assert.ok(hazard.lane >= -7 && hazard.lane <= 7);
      assert.ok(hazard.speed >= 0.5 && hazard.speed <= 2);
      if (hazard.type === "cloud-beam") {
        assert.equal(Math.abs(hazard.lane), RANDOM_ROAD_BREAKER_LANE_CENTER);
        assert.ok(hazard.width <= RANDOM_ROAD_BREAKER_MAX_WIDTH);
        const nearCenterEdge = hazard.lane > 0
          ? hazard.lane - hazard.width / 2
          : hazard.lane + hazard.width / 2;
        assert.ok(hazard.lane > 0 ? nearCenterEdge > 0 : nearCenterEdge < 0);
      }
    });
  });
});

test("hundreds of seeds never emit a broken plan and remain reference-like", () => {
  for (let seed = 1; seed <= 256; seed += 1) {
    const tour = generateRandomQuestTour(seed);
    tour.courses.forEach((course, roundIndex) => {
      const validation = validateRandomQuestCourse(course.parts);
      assert.equal(validation.valid, true, `seed ${seed}: ${JSON.stringify(validation)}`);
      assert.equal(validation.unsafeOverlaps.length, 0);
      const leftCurves = course.parts.filter((part) => part === "curve-left").length;
      const rightCurves = course.parts.filter((part) => part === "curve-right").length;
      const slopes = course.parts.filter((part) => /^(uphill|downhill)/.test(part)).length;
      assert.ok(leftCurves > 0 && rightCurves > 0);
      assert.ok((leftCurves + rightCurves) / course.parts.length >= 0.4);
      assert.equal(slopes, [6, 8, 12][roundIndex]);
    });
  }
});

test("random road destruction always leaves the opposite half drivable", () => {
  let breakerCount = 0;
  for (let seed = 1; seed <= 512; seed += 1) {
    const tour = generateRandomQuestTour(seed);
    tour.courses.flatMap((course) => course.hazards).forEach((hazard) => {
      if (hazard.type !== "cloud-beam") return;
      breakerCount += 1;
      assert.equal(Math.abs(hazard.lane), RANDOM_ROAD_BREAKER_LANE_CENTER);
      assert.ok(hazard.width <= RANDOM_ROAD_BREAKER_MAX_WIDTH);
      const minimum = hazard.lane - hazard.width / 2;
      const maximum = hazard.lane + hazard.width / 2;
      assert.ok(maximum < 0 || minimum > 0, JSON.stringify(hazard));
    });
  }
  assert.ok(breakerCount > 0);
});

test("overlapping parts require the height of three complete slope parts", () => {
  assert.equal(isRandomQuestPartClearanceSafe(25.9, MIN_OVERPASS_VERTICAL_CLEARANCE - 0.01), false);
  assert.equal(isRandomQuestPartClearanceSafe(25.9, MIN_OVERPASS_VERTICAL_CLEARANCE), true);
  assert.equal(isRandomQuestPartClearanceSafe(26, 0), true);
});

test("quest score breakdown and the local top five are stable", () => {
  assert.deepEqual(randomQuestRoundScore({ position: 1, questPoints: 500, actionPoints: 83, completedCount: 4, noCrash: true }), {
    questPoints: 500,
    actionPoints: 83,
    chainBonus: 75,
    positionPoints: 500,
    noCrashBonus: 200,
    total: 1358,
  });
  assert.deepEqual(insertRandomQuestScore([400, 900, 700, 300, 200], 800), [900, 800, 700, 400, 300]);
});

test("successful actions build a five-second combo without capping total action points", () => {
  const first = advanceRandomQuestCombo({ previousCount: 0, lastSuccessAt: 0, now: 1000, basePoints: 5 });
  assert.deepEqual(first, { count: 1, multiplier: 1, awardedPoints: 5, lastSuccessAt: 1000 });
  const second = advanceRandomQuestCombo({ previousCount: first.count, lastSuccessAt: first.lastSuccessAt, now: 5900, basePoints: 5 });
  assert.deepEqual(second, { count: 2, multiplier: 1.5, awardedPoints: 8, lastSuccessAt: 5900 });
  const third = advanceRandomQuestCombo({ previousCount: second.count, lastSuccessAt: second.lastSuccessAt, now: 10900, basePoints: 15 });
  assert.deepEqual(third, { count: 3, multiplier: 2, awardedPoints: 30, lastSuccessAt: 10900 });
  const fourth = advanceRandomQuestCombo({ previousCount: third.count, lastSuccessAt: third.lastSuccessAt, now: 10901, basePoints: 15 });
  assert.deepEqual(fourth, { count: 4, multiplier: 3, awardedPoints: 45, lastSuccessAt: 10901 });
  const reset = advanceRandomQuestCombo({ previousCount: 999, lastSuccessAt: fourth.lastSuccessAt, now: 15902, basePoints: 5 });
  assert.deepEqual(reset, { count: 1, multiplier: 1, awardedPoints: 5, lastSuccessAt: 15902 });
});

test("creator themes, the quest HUD, score breakdown and final top five are connected to the game UI", async () => {
  const [page, courseCode] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/course-code.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /RANDOM QUEST TOUR/);
  assert.match(page, /creator-theme-selector/);
  assert.match(page, /random-quest-hud/);
  assert.match(page, /random-quest-combo/);
  assert.match(page, /randomQuestComboDisplay\.count >= 2/);
  assert.match(page, /window\.setTimeout\(\(\) => \{[\s\S]{0,180}setRandomQuestComboDisplay\(null\)[\s\S]{0,100}\}, 3000\)/);
  assert.match(page, /awardRandomQuestAction\("DRIFT TURBO", 5\)/);
  assert.match(page, /awardRandomQuestAction\("ITEM HIT", 15\)/);
  assert.match(page, /onRunEvent\("item-hit"\)/);
  assert.match(page, /ITEM_ATTACK_SCORE_TYPES = new Set<AttackType>\(\["FIRE", "HOMING", "SPIKES", "NOVA"\]\)/);
  assert.match(page, /random-quest-score-breakdown/);
  assert.match(page, /LOCAL TOP 5/);
  assert.match(page, /generateRandomQuestTour/);
  assert.match(courseCode, /COURSE_CODE_PREFIX_V1 = "KC1-"/);
  assert.match(courseCode, /COURSE_CODE_PREFIX_V2 = "KC2-"/);
  assert.match(courseCode, /const theme = themed \? COURSE_CODE_THEMES\[reader\.read\(2\)\] : "city"/);
});
