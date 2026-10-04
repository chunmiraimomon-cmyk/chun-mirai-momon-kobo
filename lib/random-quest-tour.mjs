export const CREATOR_THEMES = ["city", "jungle", "starlight", "cloud"];

export const CREATOR_THEME_LABELS = {
  city: "CITY",
  jungle: "JUNGLE",
  starlight: "STARLIGHT",
  cloud: "CLOUD SEA",
};

const PART_IDS = [
  "straight",
  "curve-left",
  "curve-right",
  "s-curve",
  "uphill",
  "downhill",
  "uphill-continuous",
  "downhill-continuous",
];

const HAZARD_DEFAULTS = {
  monkey: { lane: 0, interval: 8, speed: 1, width: 5, intensity: 1 },
  "cloud-beam": { lane: -4, interval: 10, speed: 1, width: 7, intensity: 1 },
  river: { lane: 0, interval: 8, speed: 1.15, width: 8, intensity: 2 },
  "shooting-star": { lane: 0, interval: 5, speed: 1, width: 10, intensity: 2 },
  cannon: { lane: 0, interval: 6, speed: 1, width: 10, intensity: 1 },
};

const HAZARD_IDS = Object.keys(HAZARD_DEFAULTS);

export const MIN_RANDOM_QUEST_PARTS = 30;
export const MAX_RANDOM_QUEST_PARTS = 50;
export const SLOPE_PART_RISE = 8;
export const MIN_OVERPASS_VERTICAL_CLEARANCE = SLOPE_PART_RISE * 3;
// A random road-breaker may remove either the left or right half, never both.
// Keep a small gap from the center seam because the renderer treats touching a
// half-road boundary as an overlap.
export const RANDOM_ROAD_BREAKER_MAX_WIDTH = 9.6;
export const RANDOM_ROAD_BREAKER_LANE_CENTER = 5;
export const RANDOM_QUEST_COMBO_WINDOW_MS = 5000;
// The visible corridor includes the 20m road plus curbs and guardrails, so the
// planner reserves a little more than the rendered edge-to-edge width.
const ROAD_CENTERLINE_OVERLAP_DISTANCE = 26;
const TURN_RADIANS = Math.PI / 3;
const TAU = Math.PI * 2;
const PART_GEOMETRY = {
  straight: { length: 34, turn: 0, rise: 0 },
  "curve-left": { length: 38, turn: TURN_RADIANS, rise: 0 },
  "curve-right": { length: 38, turn: -TURN_RADIANS, rise: 0 },
  "s-curve": { length: 48, turn: 0, rise: 0 },
  uphill: { length: 40, turn: 0, rise: SLOPE_PART_RISE },
  downhill: { length: 40, turn: 0, rise: -SLOPE_PART_RISE },
  "uphill-continuous": { length: 40, turn: 0, rise: SLOPE_PART_RISE },
  "downhill-continuous": { length: 40, turn: 0, rise: -SLOPE_PART_RISE },
};

export function normalizeCreatorTheme(value) {
  return CREATOR_THEMES.includes(value) ? value : "city";
}

export function createSeededRandom(seed) {
  let state = (Number(seed) || 1) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function shuffleWithRandom(values, random) {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [next[index], next[target]] = [next[target], next[index]];
  }
  return next;
}

function samplePlannedPart(partId, start, startHeading) {
  const part = PART_GEOMETRY[partId] ?? PART_GEOMETRY.straight;
  const steps = partId === "s-curve" || Math.abs(part.turn) > 0 ? 9 : 7;
  const points = [start];
  let [x, y, z] = start;
  for (let step = 1; step <= steps; step += 1) {
    const amount = step / steps;
    const smoothAmount = amount * amount * (3 - 2 * amount);
    const continuousSlope = partId === "uphill-continuous" || partId === "downhill-continuous";
    const headingOffset = partId === "s-curve"
      ? Math.sin(amount * TAU) * 0.38
      : part.turn * smoothAmount;
    const nextHeading = startHeading + headingOffset;
    x += Math.sin(nextHeading) * (part.length / steps);
    z += Math.cos(nextHeading) * (part.length / steps);
    y = start[1] + part.rise * (continuousSlope ? amount : smoothAmount);
    points.push([x, y, z]);
  }
  return { points, endHeading: startHeading + part.turn };
}

export function sampleRandomQuestCourse(parts) {
  const partPaths = [];
  let point = [0, 4, 0];
  let heading = 0;
  parts.forEach((partId) => {
    const sampled = samplePlannedPart(partId, point, heading);
    partPaths.push(sampled.points);
    point = sampled.points[sampled.points.length - 1];
    heading = sampled.endHeading;
  });
  return { partPaths, end: point, endHeading: heading };
}

function cyclicPartDistance(left, right, count) {
  const direct = Math.abs(left - right);
  return Math.min(direct, count - direct);
}

function closestPointToSegment2d(point, start, end) {
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const lengthSq = dx * dx + dz * dz;
  const amount = lengthSq > 1e-9
    ? Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[2] - start[2]) * dz) / lengthSq))
    : 0;
  const x = start[0] + dx * amount;
  const z = start[2] + dz * amount;
  return {
    distance: Math.hypot(point[0] - x, point[2] - z),
    y: start[1] + (end[1] - start[1]) * amount,
  };
}

function partPairClearance(leftPath, rightPath) {
  let horizontal = Number.POSITIVE_INFINITY;
  let vertical = Number.POSITIVE_INFINITY;
  const inspect = (point, path) => {
    for (let index = 1; index < path.length; index += 1) {
      const closest = closestPointToSegment2d(point, path[index - 1], path[index]);
      if (closest.distance < horizontal) {
        horizontal = closest.distance;
        vertical = Math.abs(point[1] - closest.y);
      }
    }
  };
  leftPath.forEach((point) => inspect(point, rightPath));
  rightPath.forEach((point) => inspect(point, leftPath));
  return { horizontal, vertical };
}

export function isRandomQuestPartClearanceSafe(horizontal, vertical) {
  return horizontal >= ROAD_CENTERLINE_OVERLAP_DISTANCE
    || vertical + 1e-6 >= MIN_OVERPASS_VERTICAL_CLEARANCE;
}

export function validateRandomQuestCourse(parts) {
  const sampled = sampleRandomQuestCourse(parts);
  const unsafeOverlaps = [];
  const allowedOverpasses = [];
  for (let left = 0; left < sampled.partPaths.length; left += 1) {
    for (let right = left + 1; right < sampled.partPaths.length; right += 1) {
      if (cyclicPartDistance(left, right, sampled.partPaths.length) <= 2) continue;
      const clearance = partPairClearance(sampled.partPaths[left], sampled.partPaths[right]);
      if (clearance.horizontal >= ROAD_CENTERLINE_OVERLAP_DISTANCE) continue;
      const record = { left, right, ...clearance };
      if (isRandomQuestPartClearanceSafe(clearance.horizontal, clearance.vertical)) allowedOverpasses.push(record);
      else unsafeOverlaps.push(record);
    }
  }
  const start = sampled.partPaths[0]?.[0] ?? [0, 4, 0];
  const closureDistance = Math.hypot(sampled.end[0] - start[0], sampled.end[2] - start[2]);
  const closureHeight = Math.abs(sampled.end[1] - start[1]);
  const normalizedHeading = Math.atan2(Math.sin(sampled.endHeading), Math.cos(sampled.endHeading));
  const partCountValid = parts.length >= MIN_RANDOM_QUEST_PARTS && parts.length <= MAX_RANDOM_QUEST_PARTS;
  const valid = partCountValid
    && closureDistance < 0.01
    && closureHeight < 0.01
    && Math.abs(normalizedHeading) < 0.0001
    && unsafeOverlaps.length === 0;
  return {
    valid,
    partCountValid,
    closureDistance,
    closureHeight,
    headingError: Math.abs(normalizedHeading),
    unsafeOverlaps,
    allowedOverpasses,
  };
}

function balancedSideCounts(targetPartCount, random) {
  const sideTotal = (targetPartCount - 6) / 2;
  const base = Math.floor(sideTotal / 3);
  const counts = [base, base, base];
  for (let index = 0; index < sideTotal - base * 3; index += 1) counts[index] += 1;
  return shuffleWithRandom(counts, random);
}

function variedNeutralSideParts(count, random) {
  // Every side contains both turn directions and at least two turn-neutral
  // positions. Equal left/right counts preserve the planned side heading,
  // while their shuffled order creates switchbacks, chicanes, and hairpins.
  const maximumCurvePairs = Math.max(1, Math.floor((count - 2) / 2));
  const minimumCurvePairs = count >= 6 ? 2 : 1;
  const curvePairs = minimumCurvePairs
    + Math.floor(random() * (maximumCurvePairs - minimumCurvePairs + 1));
  const parts = [];
  for (let index = 0; index < curvePairs; index += 1) {
    parts.push("curve-left", "curve-right");
  }
  while (parts.length < count) parts.push(random() < 0.52 ? "s-curve" : "straight");
  return shuffleWithRandom(parts, random);
}

function inverseSlope(part) {
  if (part === "uphill-continuous") return "downhill-continuous";
  if (part === "downhill-continuous") return "uphill-continuous";
  if (part === "uphill") return "downhill";
  return "uphill";
}

function addVariedElevation(sides, random, roundIndex) {
  const slopePairs = [3, 4, 6][Math.max(0, Math.min(2, roundIndex))];
  const eligible = [];
  sides.slice(0, 3).forEach((side, sideIndex) => {
    side.forEach((part, partIndex) => {
      if (part === "straight" || part === "s-curve") eligible.push([sideIndex, partIndex]);
    });
  });
  const selected = shuffleWithRandom(eligible, random).slice(0, slopePairs);
  let plannedHeight = 0;
  selected.forEach(([sideIndex, partIndex], index) => {
    const continuous = random() < 0.72;
    const climb = plannedHeight <= -8
      ? true
      : plannedHeight >= 16
        ? false
        : index === 0 || random() < 0.58;
    const slope = climb
      ? continuous ? "uphill-continuous" : "uphill"
      : continuous ? "downhill-continuous" : "downhill";
    sides[sideIndex][partIndex] = slope;
    sides[sideIndex + 3][partIndex] = inverseSlope(slope);
    plannedHeight += PART_GEOMETRY[slope].rise;
  });
}

function planLoopParts(random, roundIndex, forceFlat = false) {
  const targetRanges = [[30, 36], [36, 44], [42, 50]];
  const [minimum, maximum] = targetRanges[Math.max(0, Math.min(2, roundIndex))];
  const evenChoices = Array.from({ length: (maximum - minimum) / 2 + 1 }, (_, index) => minimum + index * 2);
  const targetPartCount = evenChoices[Math.floor(random() * evenChoices.length)] ?? minimum;
  const sideCounts = balancedSideCounts(targetPartCount, random);
  const baseSides = sideCounts.map((count) => variedNeutralSideParts(count, random));
  const sides = [...baseSides.map((side) => [...side]), ...baseSides.map((side) => [...side])];
  if (!forceFlat) addVariedElevation(sides, random, roundIndex);
  const turn = random() < 0.5 ? "curve-left" : "curve-right";
  return sides.flatMap((side) => [...side, turn]);
}

function generateParts(random, roundIndex) {
  // Plan the complete loop first. Only a route that passes closure and the
  // whole-course visual-corridor overlap check is allowed to reach rendering.
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const candidate = planLoopParts(random, roundIndex);
    if (validateRandomQuestCourse(candidate).valid) return candidate;
  }
  const fallback = planLoopParts(() => 0, roundIndex, true);
  if (validateRandomQuestCourse(fallback).valid) return fallback;
  throw new Error("Unable to construct a valid random quest course plan");
}

function generateHazards(random, roundIndex, partCount) {
  const count = 4 + roundIndex * 2;
  const availableParts = shuffleWithRandom(
    Array.from({ length: Math.max(1, partCount - 3) }, (_, index) => index + 2),
    random,
  );
  return Array.from({ length: count }, (_, index) => {
    const type = HAZARD_IDS[Math.floor(random() * HAZARD_IDS.length)] ?? "monkey";
    const defaults = HAZARD_DEFAULTS[type];
    const laneSteps = [-6, -4, -2, 0, 2, 4, 6];
    let lane = laneSteps[Math.floor(random() * laneSteps.length)];
    const danger = roundIndex * 0.15 + random() * 0.12;
    let width = Math.min(12, defaults.width + (roundIndex >= 2 && index % 2 === 0 ? 1 : 0));
    if (type === "cloud-beam") {
      // Center the missing section wholly inside one road half. A centered
      // breaker used to overlap both half-road meshes and make the course
      // temporarily impossible to traverse.
      const side = lane === 0 ? (random() < 0.5 ? -1 : 1) : Math.sign(lane);
      lane = side * RANDOM_ROAD_BREAKER_LANE_CENTER;
      width = Math.min(width, RANDOM_ROAD_BREAKER_MAX_WIDTH);
    }
    return {
      id: `tour-${roundIndex}-${index}`,
      type,
      partIndex: availableParts[index % availableParts.length] ?? Math.min(partCount - 2, index + 2),
      lane,
      interval: type === "river" ? defaults.interval : Math.max(2, Math.round((defaults.interval * (1 - danger)) * 2) / 2),
      speed: Math.min(2, Math.round((defaults.speed + danger) * 10) / 10),
      width,
      intensity: Math.min(3, defaults.intensity + (roundIndex >= 2 && index % 3 === 0 ? 1 : 0)),
      enabled: true,
    };
  });
}

function questPool(roundIndex) {
  return [
    { kind: "speed", label: `${190 + roundIndex * 20} KM/Hへ到達`, target: 190 + roundIndex * 20, reward: 100 + roundIndex * 25, unit: "KM/H", timeLimitMs: 35000 },
    { kind: "drift", label: `ドリフトターボを${2 + roundIndex}回発動`, target: 2 + roundIndex, reward: 100 + roundIndex * 25, unit: "回", timeLimitMs: 42000 },
    { kind: "overtake", label: `${1 + Math.min(1, roundIndex)}台追い抜く`, target: 1 + Math.min(1, roundIndex), reward: 100 + roundIndex * 25, unit: "台", timeLimitMs: 38000 },
    { kind: "item-level", label: `アイテムをLV.${roundIndex >= 2 ? 3 : 2}まで育てる`, target: roundIndex >= 2 ? 3 : 2, reward: roundIndex >= 2 ? 200 : 125, unit: "LV", timeLimitMs: 45000 },
    { kind: "clean", label: `${10 + roundIndex * 2}秒間クラッシュしない`, target: 10 + roundIndex * 2, reward: 125 + roundIndex * 25, unit: "秒", timeLimitMs: 32000 },
    { kind: "first-hold", label: `1位を${5 + roundIndex * 2}秒間維持`, target: 5 + roundIndex * 2, reward: 175 + roundIndex * 25, unit: "秒", timeLimitMs: 45000 },
    { kind: "shield", label: "シールドで攻撃を防ぐ", target: 1, reward: 200, unit: "回", timeLimitMs: 45000 },
  ];
}

function generateQuests(random, roundIndex) {
  return shuffleWithRandom(questPool(roundIndex), random).slice(0, 5).map((quest, index) => ({
    ...quest,
    id: `quest-${roundIndex}-${index}-${quest.kind}`,
  }));
}

export function generateRandomQuestTour(seed = Date.now()) {
  const normalizedSeed = (Number(seed) || Date.now()) >>> 0;
  const random = createSeededRandom(normalizedSeed);
  const themes = shuffleWithRandom(CREATOR_THEMES, random).slice(0, 3);
  const courses = themes.map((theme, roundIndex) => {
    const parts = generateParts(random, roundIndex);
    return {
      name: `QUEST CIRCUIT ${String(roundIndex + 1).padStart(2, "0")}`,
      theme,
      parts,
      hazards: generateHazards(random, roundIndex, parts.length),
      quests: generateQuests(random, roundIndex),
    };
  });
  return { version: 4, seed: normalizedSeed, courses };
}

export function racePositionPoints(position) {
  return [500, 350, 250, 150, 100][Math.max(0, Math.min(4, Math.round(position) - 1))] ?? 0;
}

export function insertRandomQuestScore(scores, score) {
  return [...(Array.isArray(scores) ? scores : []), Math.max(0, Math.round(Number(score) || 0))]
    .sort((left, right) => right - left)
    .slice(0, 5);
}

export function randomQuestComboMultiplier(comboCount) {
  if (comboCount >= 4) return 3;
  if (comboCount === 3) return 2;
  if (comboCount === 2) return 1.5;
  return 1;
}

export function advanceRandomQuestCombo({
  previousCount,
  lastSuccessAt,
  now,
  basePoints,
}) {
  const continued = previousCount > 0
    && now >= lastSuccessAt
    && now - lastSuccessAt <= RANDOM_QUEST_COMBO_WINDOW_MS;
  const count = continued ? previousCount + 1 : 1;
  const multiplier = randomQuestComboMultiplier(count);
  return {
    count,
    multiplier,
    awardedPoints: Math.round(Math.max(0, basePoints) * multiplier),
    lastSuccessAt: now,
  };
}

export function randomQuestRoundScore({ position, questPoints, actionPoints = 0, completedCount, noCrash }) {
  const chainBonus = Math.min(100, Math.max(0, completedCount - 1) * 25);
  const positionPoints = racePositionPoints(position);
  const noCrashBonus = noCrash ? 200 : 0;
  return {
    questPoints,
    actionPoints,
    chainBonus,
    positionPoints,
    noCrashBonus,
    total: questPoints + actionPoints + chainBonus + positionPoints + noCrashBonus,
  };
}

export const RANDOM_QUEST_PART_IDS = PART_IDS;
