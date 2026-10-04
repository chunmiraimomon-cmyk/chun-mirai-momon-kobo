"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as Three from "three";

type ThreeModule = typeof Three;
type GamePhase = "title" | "cup-select" | "character-select" | "course-create" | "countdown" | "racing" | "finished" | "gojo-intro" | "gojo-finished" | "championship" | "creator-finished";
type ItemType = "EMPTY" | "FIRE" | "HOMING" | "BOOST" | "AURORA" | "SPIKES" | "SHIELD" | "NOVA";
type AttackType = "FIRE" | "HOMING" | "AURORA" | "SPIKES" | "NOVA" | "MONKEY" | "CANNON" | "PIXEL" | "VOLT" | "COMET";
type DriverAnimal = "otter" | "fox" | "cat" | "corgi" | "monkey";
type CourseId = "city" | "jungle" | "starlight" | "river" | "cloud" | "pirate" | "custom";
type CupId = "basic" | "adventure";
type SkillId = "PIXEL" | "VOLT" | "COMET" | "GIANT";
type RacerName = SkillId | "Gojo";
type GamepadInput = { connected: boolean; steer: number; gas: number; brake: number; drift: boolean; item: boolean; skill: boolean };
type CharacterSelectSource = "cup" | "creator";
type CreatorGojoMode = "off" | "duel" | "field";
type KartMotionState = "grounded" | "airborne" | "falling" | "crashing";

const TAU = Math.PI * 2;
const COURSE_WIDTH = 10;
const SIDEWALK_EDGE = COURSE_WIDTH + 2.6;
const BARRIER_LANE = COURSE_WIDTH + 2.45;
const DECK_HALF_WIDTH = COURSE_WIDTH + 2.8;
const BARRIER_LIMIT = COURSE_WIDTH + 0.9;
const KART_RIDE_HEIGHT = 0.02;
const KART_FRONT_AXLE_OFFSET = 1.43;
const KART_REAR_AXLE_OFFSET = 1.31;
const WORLD_GROUND_Y = -0.52;
const PLAYER_START_PROGRESS = -0.058;
const JUMP_MIN_SPEED = 23;
const JUMP_GRAVITY = 9.81;
const JUMP_COOLDOWN_MS = 900;
const PHYSICS_STEP_MS = 1000 / 60;
const PHYSICS_STEP_SECONDS = 1 / 60;
const MAX_PHYSICS_STEPS = 5;
const TOTAL_LAPS = 3;
const lapCountForCourse = (courseId: CourseId) => courseId === "starlight" ? 5 : TOTAL_LAPS;
const MAX_CREATOR_PARTS = 50;
const STANDARD_ITEMS: Exclude<ItemType, "EMPTY" | "NOVA">[] = ["FIRE", "HOMING", "BOOST", "AURORA", "SPIKES", "SHIELD"];
const ITEM_ROW_PROGRESS = [0.12, 0.35, 0.59, 0.82];
const ITEM_ROW_LANES = [-6, -2, 2, 6];
const RACE_POINTS = [5, 3, 1, 0] as const;

type CourseDefinition = {
  id: CourseId;
  name: string;
  title: string;
  tagline: string;
  description: string;
  distance: string;
  rawPoints: Array<[number, number, number]>;
};

type CoursePartType = "straight" | "curve-left" | "curve-right" | "s-curve" | "uphill" | "downhill" | "uphill-continuous" | "downhill-continuous";
type CreatorHazardType = "monkey" | "cloud-beam" | "river" | "shooting-star" | "cannon";
type CreatorHazardPlacement = {
  id: string;
  type: CreatorHazardType;
  partIndex: number;
  lane: number;
  interval: number;
  speed: number;
  width: number;
  intensity: number;
  enabled: boolean;
};
type SavedCreatorCourse = { name: string; parts: CoursePartType[]; hazards?: CreatorHazardPlacement[]; savedAt: number };
type CoursePartDefinition = {
  id: CoursePartType;
  label: string;
  icon: string;
  description: string;
  length: number;
  turn: number;
  rise: number;
};

const CREATOR_STORAGE_KEY = "prism-circuit-custom-course-v1";
const MAX_CREATOR_HAZARDS = 24;
const COURSE_PARTS: CoursePartDefinition[] = [
  { id: "straight", label: "STRAIGHT", icon: "━", description: "標準直線", length: 34, turn: 0, rise: 0 },
  { id: "curve-left", label: "LEFT CURVE", icon: "↰", description: "左60°カーブ", length: 38, turn: Math.PI / 3, rise: 0 },
  { id: "curve-right", label: "RIGHT CURVE", icon: "↱", description: "右60°カーブ", length: 38, turn: -Math.PI / 3, rise: 0 },
  { id: "s-curve", label: "S-CURVE", icon: "〰", description: "左右連続カーブ", length: 48, turn: 0, rise: 0 },
  { id: "uphill", label: "UPHILL", icon: "↗", description: "なめらかな上り坂", length: 40, turn: 0, rise: 8 },
  { id: "downhill", label: "DOWNHILL", icon: "↘", description: "なめらかな下り坂", length: 40, turn: 0, rise: -8 },
  { id: "uphill-continuous", label: "STEADY UP", icon: "⤴", description: "端まで一定勾配・連結用", length: 40, turn: 0, rise: 8 },
  { id: "downhill-continuous", label: "STEADY DOWN", icon: "⤵", description: "端まで一定勾配・連結用", length: 40, turn: 0, rise: -8 },
];
const CREATOR_HAZARDS: Array<{
  id: CreatorHazardType;
  label: string;
  icon: string;
  description: string;
  color: string;
  defaults: Pick<CreatorHazardPlacement, "lane" | "interval" | "speed" | "width" | "intensity">;
}> = [
  { id: "monkey", label: "TRAP MONKEY", icon: "●", description: "移動しながら針山を設置", color: "#c88955", defaults: { lane: 0, interval: 8, speed: 1, width: 5, intensity: 1 } },
  { id: "cloud-beam", label: "CLOUD BREAKER", icon: "┃", description: "光柱で路面を一時破壊", color: "#6feaff", defaults: { lane: -4, interval: 10, speed: 1, width: 7, intensity: 1 } },
  { id: "river", label: "FLOWING RIVER", icon: "≋", description: "流れる加速水路", color: "#39bdf0", defaults: { lane: 0, interval: 8, speed: 1.15, width: 8, intensity: 2 } },
  { id: "shooting-star", label: "SHOOTING STAR", icon: "★", description: "上空から流れ星が落下", color: "#ffe477", defaults: { lane: 0, interval: 5, speed: 1, width: 10, intensity: 2 } },
  { id: "cannon", label: "CANNON", icon: "●", description: "横方向へ大玉を発射", color: "#ff8a5a", defaults: { lane: 0, interval: 6, speed: 1, width: 10, intensity: 1 } },
];
const DEFAULT_CREATOR_PARTS: CoursePartType[] = [
  "straight", "curve-left", "uphill", "curve-left", "straight", "curve-left",
  "s-curve", "curve-left", "downhill", "curve-left", "straight", "curve-left",
];

type CreatorOpenPath = {
  points: Array<[number, number, number]>;
  startHeading: number;
  endHeading: number;
};

function sampleCreatorPart(
  partId: CoursePartType,
  start: [number, number, number],
  startHeading: number,
): CreatorOpenPath {
  const part = COURSE_PARTS.find((entry) => entry.id === partId) ?? COURSE_PARTS[0];
  const steps = partId === "s-curve" || Math.abs(part.turn) > 0 ? 9 : 7;
  const points: Array<[number, number, number]> = [start];
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
  return { points, startHeading, endHeading: startHeading + part.turn };
}

function buildCreatorOpenPath(parts: CoursePartType[]): CreatorOpenPath {
  const activeParts = parts.length ? parts : ["straight"];
  const points: Array<[number, number, number]> = [[0, 4, 0]];
  let heading = 0;

  activeParts.forEach((partId) => {
    const sampled = sampleCreatorPart(partId, points[points.length - 1], heading);
    points.push(...sampled.points.slice(1));
    heading = sampled.endHeading;
  });
  return { points, startHeading: 0, endHeading: heading };
}

function buildCreatorPartPaths(parts: CoursePartType[]): Array<Array<[number, number, number]>> {
  const activeParts = parts.length ? parts : ["straight"];
  const paths: Array<Array<[number, number, number]>> = [];
  let point: [number, number, number] = [0, 4, 0];
  let heading = 0;
  activeParts.forEach((partId) => {
    const sampled = sampleCreatorPart(partId, point, heading);
    paths.push(sampled.points);
    point = sampled.points[sampled.points.length - 1];
    heading = sampled.endHeading;
  });
  return paths;
}

function creatorPartRange(parts: CoursePartType[], partIndex: number) {
  const lengths = parts.map((partId) => COURSE_PARTS.find((part) => part.id === partId)?.length ?? 34);
  const total = Math.max(1, lengths.reduce((sum, length) => sum + length, 0));
  const safeIndex = clamp(Math.round(partIndex), 0, Math.max(0, parts.length - 1));
  const start = lengths.slice(0, safeIndex).reduce((sum, length) => sum + length, 0) / total;
  const end = start + (lengths[safeIndex] ?? 34) / total;
  return { start, end, center: (start + end) / 2 };
}

function normalizeCreatorHazard(value: Partial<CreatorHazardPlacement>, partsLength: number): CreatorHazardPlacement | null {
  const type = CREATOR_HAZARDS.some((hazard) => hazard.id === value.type) ? value.type as CreatorHazardType : null;
  if (!type || partsLength < 1) return null;
  const definition = CREATOR_HAZARDS.find((hazard) => hazard.id === type) ?? CREATOR_HAZARDS[0];
  return {
    id: typeof value.id === "string" && value.id ? value.id : `hazard-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    partIndex: clamp(Math.round(Number(value.partIndex) || 0), 0, partsLength - 1),
    lane: clamp(Number(value.lane) || 0, -7, 7),
    interval: clamp(Number(value.interval) || definition.defaults.interval, 2, 15),
    speed: clamp(Number(value.speed) || definition.defaults.speed, 0.5, 2),
    width: clamp(Number(value.width) || definition.defaults.width, 2, 12),
    intensity: clamp(Math.round(Number(value.intensity) || definition.defaults.intensity), 1, 3),
    enabled: value.enabled !== false,
  };
}

function buildCreatorGhostPath(
  parts: CoursePartType[],
  partId: CoursePartType,
  side: "front" | "back",
): CreatorOpenPath {
  const openPath = buildCreatorOpenPath(parts);
  if (side === "back") {
    return sampleCreatorPart(partId, openPath.points[openPath.points.length - 1], openPath.endHeading);
  }
  const part = COURSE_PARTS.find((entry) => entry.id === partId) ?? COURSE_PARTS[0];
  const sampled = sampleCreatorPart(partId, [0, openPath.points[0][1] - part.rise, 0], -part.turn);
  const end = sampled.points[sampled.points.length - 1];
  return {
    points: sampled.points.map(([x, y, z]) => [x - end[0], y, z - end[2]]),
    startHeading: sampled.startHeading,
    endHeading: sampled.endHeading,
  };
}

function buildCreatorRawPoints(parts: CoursePartType[]): Array<[number, number, number]> {
  const points = buildCreatorOpenPath(parts).points;

  const start = points[0];
  const end = points[points.length - 1];
  const driftX = end[0] - start[0];
  const driftY = end[1] - start[1];
  const driftZ = end[2] - start[2];
  const corrected = points.map(([pointX, pointY, pointZ], index) => {
    const amount = index / Math.max(1, points.length - 1);
    return [
      pointX - driftX * amount,
      pointY - driftY * amount,
      pointZ - driftZ * amount,
    ] as [number, number, number];
  }).slice(0, -1);

  const centerX = corrected.reduce((sum, point) => sum + point[0], 0) / corrected.length;
  const centerZ = corrected.reduce((sum, point) => sum + point[2], 0) / corrected.length;
  const minY = Math.min(...corrected.map((point) => point[1]));
  const heightOffset = 3 - minY;
  return corrected.map(([pointX, pointY, pointZ]) => [
    pointX - centerX,
    pointY + heightOffset,
    pointZ - centerZ,
  ]);
}

function buildCreatorCourseDefinition(name: string, parts: CoursePartType[]): CourseDefinition {
  const activeParts = parts.length ? parts : ["straight"];
  const estimatedDistance = activeParts.reduce((sum, partId) => {
    return sum + (COURSE_PARTS.find((part) => part.id === partId)?.length ?? 34);
  }, 0);
  return {
    id: "custom",
    name: name.trim().slice(0, 24) || "MY CIRCUIT",
    title: "BUILD. TEST. RACE.",
    tagline: `${activeParts.length} PARTS // AUTO CONNECTED`,
    description: "コースクリエイトモードで組み立てたオリジナル3Dコース。",
    distance: `${Math.round(estimatedDistance)}M`,
    rawPoints: buildCreatorRawPoints(activeParts),
  };
}

const COURSES: CourseDefinition[] = [
  {
    id: "city",
    name: "CENTRAL CITY",
    title: "OWN THE AVENUE.",
    tagline: "S-CURVE + HAIRPIN // DAYLIGHT GRID",
    description: "連続S字、減速必須の都心ヘアピン、長いスロープを駆け抜ける立体市街地コース。",
    distance: "870M",
    rawPoints: [
      [0, 2, 165], [-40, 2, 162], [-80, 3, 150], [-120, 6, 132],
      [-150, 9, 108], [-170, 13, 75], [-175, 18, 35], [-170, 24, -10],
      [-160, 29, -55], [-135, 32, -95], [-100, 32, -125], [-60, 30, -135],
      [-20, 27, -125], [20, 24, -140], [60, 21, -128], [100, 18, -135],
      [140, 15, -112], [165, 12, -80], [180, 9, -42], [190, 6, 0],
      [190, 5, 45], [185, 5, 68], [170, 5, 88], [146, 5, 94],
      [132, 6, 90], [120, 6, 80], [110, 7, 70], [98, 8, 64],
      [86, 8, 64], [74, 9, 70], [66, 9, 82], [64, 10, 96],
      [68, 10, 110], [74, 10, 124], [83, 9, 138], [82, 8, 151],
      [72, 7, 161], [58, 6, 165], [44, 4, 164], [20, 3, 165],
    ],
  },
  {
    id: "jungle",
    name: "EMERALD CANOPY",
    title: "RACE THE WILD.",
    tagline: "HAIRPINS + RIDGE RUN // MONKEY MAYHEM",
    description: "密林の尾根、滝沿いのヘアピン、うねる谷間を抜けるテクニカルコース。猿の罠に注意。",
    distance: "800M",
    rawPoints: [
      [0, 3, 168], [-35, 4, 165], [-65, 6, 150], [-78, 8, 135],
      [-88, 10, 118], [-89, 13, 101], [-101, 17, 88], [-130, 21, 80], [-154, 26, 58],
      [-158, 31, 25], [-142, 36, -8], [-118, 40, -28], [-102, 42, -55],
      [-72, 43, -80], [-35, 40, -78], [-4, 36, -60], [10, 33, -50],
      [20, 31, -34], [18, 28, -16], [14, 26, -4], [14, 24, 7],
      [20, 23, 14], [30, 22, 17], [42, 20, 14], [48, 19, 7],
      [55, 18, -5], [62, 16, -18],
      [55, 13, -50], [71, 10, -78], [104, 8, -86], [137, 7, -64],
      [153, 6, -30], [150, 6, 8], [135, 8, 38], [112, 12, 58],
      [102, 16, 84], [103, 18, 101], [99, 19, 116], [90, 19, 128],
      [80, 18, 138], [68, 16, 143], [56, 14, 151], [43, 11, 160], [20, 6, 170],
    ],
  },
  {
    id: "starlight",
    name: "CELESTIAL PRISM",
    title: "CHASE THE STARS.",
    tagline: "DAYLIGHT TO STARFALL // TIME-SHIFT CIRCUIT",
    description: "青空から夕焼け、星空へ移り変わる天空コース。夜になると七色の路面と流れ星が現れる。",
    distance: "790M",
    rawPoints: [
      [0, 12, 174], [-52, 14, 166], [-98, 19, 144], [-132, 27, 108],
      [-158, 36, 62], [-166, 46, 15], [-150, 54, -30], [-118, 60, -65],
      [-78, 63, -86], [-38, 60, -74], [-5, 54, -96], [36, 46, -108],
      [78, 38, -88], [118, 31, -92], [151, 25, -59], [170, 20, -17],
      [168, 17, 28], [150, 15, 66], [134, 17, 84], [113, 20, 91],
      [94, 24, 84], [82, 28, 68], [68, 31, 60], [54, 30, 62],
      [47, 28, 70], [45, 27, 81], [49, 25, 92], [58, 24, 101],
      [66, 23, 110], [69, 22, 121], [68, 21, 128], [64, 21, 135], [58, 20, 140],
      [46, 19, 147], [35, 18, 151],
    ],
  },
  {
    id: "river",
    name: "RAPIDWOOD RUN",
    title: "RIDE THE CURRENT.",
    tagline: "CHOOSE THE CURRENT + DRIFTING LOGS // DEEP JUNGLE",
    description: "密林の路面を横切る急流を狙い、水の加速と流木の押し戻しを読みながら駆け抜けるリバーコース。",
    distance: "840M",
    rawPoints: [
      [0, 5, 172], [-42, 5, 168], [-82, 6, 151], [-116, 8, 124],
      [-139, 10, 91], [-151, 8, 53], [-146, 5, 18], [-132, 3, -16],
      [-108, 2, -46], [-78, 2, -69], [-42, 2, -75], [-12, 2, -63],
      [15, 3, -77], [46, 4, -84], [77, 6, -72], [102, 8, -48],
      [118, 11, -18], [123, 13, 15], [115, 11, 45], [96, 8, 67],
      [76, 5, 72], [58, 3, 64], [43, 2, 51], [26, 2, 42],
      [10, 2, 46], [-2, 2, 59], [-4, 3, 75], [7, 4, 89],
      [26, 5, 97], [45, 6, 103], [59, 7, 116], [61, 7, 132],
      [52, 6, 148], [33, 5, 163], [15, 5, 171],
    ],
  },
  {
    id: "cloud",
    name: "CLOUDLOFT CIRCUIT",
    title: "TRUST THE SKY.",
    tagline: "HALF-LANE CLOUD GAPS + BEANSTALKS // OPEN BLUE",
    description: "青空に連なる雲の路面を渡り、予告後に半分だけ消える足場と巨大な豆の木を避ける天空コース。",
    distance: "760M",
    rawPoints: [
      [0, 48, 164], [-40, 50, 160], [-76, 54, 145], [-105, 59, 119],
      [-124, 65, 86], [-128, 70, 48], [-119, 73, 12], [-99, 71, -21],
      [-72, 66, -47], [-38, 60, -60], [-7, 56, -54], [19, 55, -68],
      [50, 57, -73], [80, 61, -60], [105, 66, -34], [118, 70, -2],
      [116, 72, 31], [101, 69, 56], [79, 64, 66], [59, 61, 60],
      [42, 60, 48], [25, 61, 43], [11, 63, 50], [5, 66, 64],
      [12, 68, 79], [27, 67, 91], [43, 63, 101], [52, 59, 117],
      [50, 55, 135], [37, 51, 151], [18, 49, 161],
    ],
  },
  {
    id: "pirate",
    name: "BLACKWAKE GALLEON",
    title: "BOARD THE STORM.",
    tagline: "DECK S-BENDS + LANTERN HOLD // CANNONBALL CROSSING",
    description: "巨大海賊船の甲板からランプの灯る船倉へ降り、横切る大砲の玉を抜けて甲板へ戻る船上コース。",
    distance: "1,180M",
    rawPoints: [
      [0, 13, 270], [-23.29, 12.33, 266.93], [-45, 11.67, 257.94], [-63.64, 11, 243.64],
      [-77.94, 10.33, 225], [-86.93, 9.67, 203.29], [-90, 9, 180], [-87.74, 8.33, 165],
      [-81.65, 7.67, 150], [-73.55, 7, 135], [-65.95, 6.33, 120], [-61.33, 5.67, 105],
      [-61.5, 5, 90], [-67.05, 4.33, 75], [-77.2, 3.67, 60], [-90, 3, 45],
      [-102.8, 2.33, 30], [-112.95, 1.67, 15], [-118.5, 1, 0], [-118.67, 1, -15],
      [-114.05, 1, -30], [-106.45, 1, -45], [-98.35, 1, -60], [-92.26, 1, -75],
      [-90, 1, -90], [-86.93, 1, -113.29], [-77.94, 1, -135], [-63.64, 1, -153.64],
      [-45, 1, -167.94], [-23.29, 1, -176.93], [0, 1, -180], [23.29, 1, -176.93],
      [45, 1, -167.94], [63.64, 1, -153.64], [77.94, 1, -135], [86.93, 1, -113.29],
      [90, 1, -90], [92.26, 1, -75], [98.35, 1, -60], [106.45, 1, -45],
      [114.05, 1, -30], [118.67, 1, -15], [118.5, 1, 0], [112.95, 1.67, 15],
      [102.8, 2.33, 30], [90, 3, 45], [77.2, 3.67, 60], [67.05, 4.33, 75],
      [61.5, 5, 90], [61.33, 5.67, 105], [65.95, 6.33, 120], [73.55, 7, 135],
      [81.65, 7.67, 150], [87.74, 8.33, 165], [90, 9, 180], [86.93, 9.67, 203.29],
      [77.94, 10.33, 225], [63.64, 11, 243.64], [45, 11.67, 257.94], [23.29, 12.33, 266.93],
      [10, 13, 269.5],
    ],
  },
];

type CpuShortcut = { start: number; end: number };
const CPU_SHORTCUTS: Partial<Record<CourseId, readonly CpuShortcut[]>> = {
  city: [{ start: 0.878, end: 0.978 }],
  jungle: [{ start: 0.572, end: 0.667 }],
  starlight: [{ start: 0.783, end: 0.922 }],
  river: [{ start: 0.708, end: 0.914 }],
  cloud: [{ start: 0.706, end: 0.911 }],
};

type CupDefinition = { id: CupId; name: string; subtitle: string; courseIds: CourseId[] };
const CUPS: CupDefinition[] = [
  { id: "basic", name: "BASIC CUP", subtitle: "CITY · JUNGLE · STARLIGHT", courseIds: ["city", "jungle", "starlight"] },
  { id: "adventure", name: "ADVENTURE CUP", subtitle: "RIVER · PIRATE SHIP · CLOUD", courseIds: ["river", "pirate", "cloud"] },
];
const courseById = (id: CourseId) => COURSES.find((course) => course.id === id) ?? COURSES[0];
type RiverChannel = { start: number; end: number; lane: number; halfWidth: number };
const RIVER_CHANNELS: RiverChannel[] = [
  { start: 0.1, end: 0.235, lane: -4.1, halfWidth: 4.7 },
  { start: 0.265, end: 0.345, lane: 4.3, halfWidth: 4.4 },
  { start: 0.49, end: 0.605, lane: 0.2, halfWidth: 4.8 },
  { start: 0.635, end: 0.725, lane: -4.2, halfWidth: 4.35 },
  { start: 0.82, end: 0.93, lane: 4.05, halfWidth: 4.55 },
];
const riverChannelAt = (progress: number, lane: number) => {
  const u = wrap01(progress);
  return RIVER_CHANNELS.find((channel) => u >= channel.start && u <= channel.end && Math.abs(lane - channel.lane) <= channel.halfWidth);
};
const riverChannelForProgress = (progress: number) => {
  const u = wrap01(progress);
  return RIVER_CHANNELS.find((channel) => u >= channel.start && u <= channel.end);
};

type CharacterDefinition = {
  name: RacerName;
  badge: string;
  color: number;
  accent: number;
  animal: DriverAnimal;
  skillName: string;
  skillDescription: string;
  cooldownMs: number;
};

const CHARACTERS: CharacterDefinition[] = [
  {
    name: "GIANT",
    badge: "GT",
    color: 0x20aeb3,
    accent: 0xf0ffff,
    animal: "otter",
    skillName: "GIANT LEAP",
    skillDescription: "その場からカート2台分の高さへ跳ぶ。発動時の速度を保ったまま通常ジャンプへ移行。",
    cooldownMs: 8000,
  },
  {
    name: "PIXEL",
    badge: "PX",
    color: 0xe95277,
    accent: 0xffd8e2,
    animal: "fox",
    skillName: "CHAIN SEEKER",
    skillDescription: "発動時に自分より上位の全キャラを固定し、対象全員へ1回ずつ命中するまで路面を追い続ける特殊ホーミング弾。",
    cooldownMs: 18000,
  },
  {
    name: "VOLT",
    badge: "VT",
    color: 0x7657d5,
    accent: 0xe7ddff,
    animal: "cat",
    skillName: "SHOCK RING",
    skillDescription: "自分の周囲へ強力な振動波を放ち、近くにいる敵機をクラッシュさせる。",
    cooldownMs: 12000,
  },
  {
    name: "COMET",
    badge: "CM",
    color: 0xf3a62f,
    accent: 0xffefd1,
    animal: "corgi",
    skillName: "METEOR SHOWER",
    skillDescription: "5秒間、コース上へ通常隕石を降らせる。通常隕石には耐性を持つが、Gojoの青い隕石は命中する。",
    cooldownMs: 20000,
  },
];

const GOJO_CHARACTER: CharacterDefinition = {
  name: "Gojo",
  badge: "GJ",
  color: 0xff4f9d,
  accent: 0xffd7e9,
  animal: "monkey",
  skillName: "OMNI INSTINCT",
  skillDescription: "全キャラクターの固有スキルを状況に合わせて使い分ける。METEOR SHOWERでは専用の青い隕石を降らせる。",
  cooldownMs: 9500,
};

const characterSkill = (character: CharacterDefinition): SkillId =>
  character.name === "Gojo" ? "PIXEL" : character.name;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function readGamepadInput(): GamepadInput {
  const bridgedInput = (globalThis as typeof globalThis & { __EVOLUTION_GAMEPAD_INPUT__?: GamepadInput }).__EVOLUTION_GAMEPAD_INPUT__;
  if (bridgedInput) return bridgedInput;
  if (typeof navigator === "undefined" || !navigator.getGamepads) return { connected: false, steer: 0, gas: 0, brake: 0, drift: false, item: false, skill: false };
  let pads: ArrayLike<Gamepad | null>;
  try {
    pads = navigator.getGamepads();
  } catch {
    return { connected: false, steer: 0, gas: 0, brake: 0, drift: false, item: false, skill: false };
  }
  let pad: Gamepad | null = null;
  for (let index = 0; index < pads.length; index += 1) {
    const candidate = pads[index];
    if (candidate?.connected) {
      pad = candidate;
      break;
    }
  }
  if (!pad) return { connected: false, steer: 0, gas: 0, brake: 0, drift: false, item: false, skill: false };
  const buttonValue = (index: number) => pad?.buttons[index]?.value ?? 0;
  const buttonPressed = (index: number) => Boolean(pad?.buttons[index]?.pressed || buttonValue(index) > 0.55);
  const rawStick = pad.axes[0] ?? 0;
  const deadzone = 0.22;
  const stick = Math.abs(rawStick) <= deadzone
    ? 0
    : Math.sign(rawStick) * ((Math.abs(rawStick) - deadzone) / (1 - deadzone));
  const dpad = (buttonPressed(14) ? 1 : 0) + (buttonPressed(15) ? -1 : 0);
  return {
    connected: true,
    steer: dpad !== 0 ? dpad : -stick,
    gas: Math.max(buttonValue(7), buttonPressed(0) ? 1 : 0),
    brake: Math.max(buttonValue(6), buttonPressed(1) ? 1 : 0),
    drift: buttonPressed(4) || buttonPressed(5),
    item: buttonPressed(2),
    skill: buttonPressed(3),
  };
}

function formatTime(ms: number) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const centis = Math.floor((ms % 1000) / 10);
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${centis.toString().padStart(2, "0")}`;
}

type CoursePose = { x: number; y: number; z: number; heading: number; pitch: number; nx: number; nz: number };
type RaceCourse = {
  length: number;
  pointAt: (u: number, lane?: number) => CoursePose;
  sampledPointAtInto: (u: number, lane: number, target: CoursePose) => CoursePose;
  nearest: (x: number, z: number, hintU?: number) => { u: number; distance: number; pose: CoursePose };
  nearestSurface: (x: number, y: number, z: number, hintU?: number) => { u: number; distance: number; pose: CoursePose };
  isClearFromRoad: (x: number, z: number, clearance: number, ignoreU?: number, ignoreRange?: number) => boolean;
};

function wrap01(value: number) {
  return ((value % 1) + 1) % 1;
}

function progressDelta(next: number, previous: number) {
  let delta = next - previous;
  if (delta > 0.5) delta -= 1;
  if (delta < -0.5) delta += 1;
  return delta;
}

function createRaceCourse(THREE: ThreeModule, definition: CourseDefinition): RaceCourse {
  const points = definition.rawPoints.map(([x, y, z]) => new THREE.Vector3(x * 0.72, y, z * 0.72));
  const curve = new THREE.CatmullRomCurve3(points, true, "centripetal");
  const sampleCount = 1600;

  const pointAt = (u: number, lane = 0): CoursePose => {
    const wrapped = wrap01(u);
    const point = curve.getPointAt(wrapped);
    const tangent = curve.getTangentAt(wrapped).normalize();
    const horizontal = new THREE.Vector3(tangent.x, 0, tangent.z).normalize();
    const nx = horizontal.z;
    const nz = -horizontal.x;
    return {
      x: point.x + nx * lane,
      y: point.y,
      z: point.z + nz * lane,
      heading: Math.atan2(horizontal.x, horizontal.z),
      pitch: -Math.atan2(tangent.y, Math.hypot(tangent.x, tangent.z)),
      nx,
      nz,
    };
  };

  const samples = Array.from({ length: sampleCount }, (_, index) => ({ u: index / sampleCount, pose: pointAt(index / sampleCount) }));
  const sampledPointAtInto = (u: number, lane: number, target: CoursePose) => {
    const scaled = wrap01(u) * sampleCount;
    const lowerIndex = Math.floor(scaled) % sampleCount;
    const upperIndex = (lowerIndex + 1) % sampleCount;
    const amount = scaled - Math.floor(scaled);
    const lower = samples[lowerIndex].pose;
    const upper = samples[upperIndex].pose;
    let nx = lower.nx + (upper.nx - lower.nx) * amount;
    let nz = lower.nz + (upper.nz - lower.nz) * amount;
    const normalLength = Math.hypot(nx, nz) || 1;
    nx /= normalLength;
    nz /= normalLength;
    target.x = lower.x + (upper.x - lower.x) * amount + nx * lane;
    target.y = lower.y + (upper.y - lower.y) * amount;
    target.z = lower.z + (upper.z - lower.z) * amount + nz * lane;
    target.heading = Math.atan2(-nz, nx);
    target.pitch = lower.pitch + (upper.pitch - lower.pitch) * amount;
    target.nx = nx;
    target.nz = nz;
    return target;
  };
  const isClearFromRoad = (x: number, z: number, clearance: number, ignoreU?: number, ignoreRange = 0) => {
    const clearanceSq = clearance ** 2;
    return samples.every((sample) => {
      if (ignoreU !== undefined && Math.abs(progressDelta(sample.u, ignoreU)) < ignoreRange) return true;
      return (sample.pose.x - x) ** 2 + (sample.pose.z - z) ** 2 >= clearanceSq;
    });
  };
  const nearest = (x: number, z: number, hintU?: number) => {
    let bestIndex = 0;
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    const consider = (index: number) => {
      const wrappedIndex = ((index % sampleCount) + sampleCount) % sampleCount;
      const pose = samples[wrappedIndex].pose;
      const distanceSq = (pose.x - x) ** 2 + (pose.z - z) ** 2;
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        bestIndex = wrappedIndex;
      }
    };
    if (hintU === undefined) {
      for (let index = 0; index < sampleCount; index += 1) consider(index);
    } else {
      const center = Math.round(wrap01(hintU) * sampleCount);
      for (let offset = -42; offset <= 42; offset += 1) consider(center + offset);
      if (bestDistanceSq > 28 ** 2) for (let index = 0; index < sampleCount; index += 1) consider(index);
    }
    const u = bestIndex / sampleCount;
    return { u, distance: Math.sqrt(bestDistanceSq), pose: samples[bestIndex].pose };
  };
  const nearestSurface = (x: number, y: number, z: number, hintU?: number) => {
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    let bestHorizontalDistanceSq = Number.POSITIVE_INFINITY;
    const considerTrackedSurface = (index: number) => {
      const wrappedIndex = ((index % sampleCount) + sampleCount) % sampleCount;
      const pose = samples[wrappedIndex].pose;
      const horizontalDistanceSq = (pose.x - x) ** 2 + (pose.z - z) ** 2;
      const continuityDistance = hintU === undefined ? 0 : progressDelta(samples[wrappedIndex].u, hintU);
      // While a kart is following a known road section, the closest point in X/Z
      // must define the road height. Weighting the old kart Y here made the lookup
      // cling to a point behind the kart on slopes, which visually buried the kart
      // uphill and left it floating downhill.
      const score = horizontalDistanceSq + continuityDistance * continuityDistance * 24;
      if (score < bestScore) {
        bestScore = score;
        bestHorizontalDistanceSq = horizontalDistanceSq;
        bestIndex = wrappedIndex;
      }
    };
    if (hintU !== undefined) {
      const center = Math.round(wrap01(hintU) * sampleCount);
      for (let offset = -48; offset <= 48; offset += 1) considerTrackedSurface(center + offset);
    }
    const localSurfaceIsPlausible = (
      hintU !== undefined
      && bestHorizontalDistanceSq <= (BARRIER_LIMIT + 4) ** 2
    );
    if (!localSurfaceIsPlausible) {
      bestScore = Number.POSITIVE_INFINITY;
      bestHorizontalDistanceSq = Number.POSITIVE_INFINITY;
      const considerLandingSurface = (index: number) => {
        const wrappedIndex = ((index % sampleCount) + sampleCount) % sampleCount;
        const pose = samples[wrappedIndex].pose;
        const horizontalDistanceSq = (pose.x - x) ** 2 + (pose.z - z) ** 2;
        const roadEdgeDistance = Math.max(0, Math.sqrt(horizontalDistanceSq) - BARRIER_LIMIT);
        const verticalDistance = pose.y - y;
        const score = (
          roadEdgeDistance * roadEdgeDistance
          + verticalDistance * verticalDistance * 3.2
          + horizontalDistanceSq * 0.001
        );
        if (score < bestScore) {
          bestScore = score;
          bestHorizontalDistanceSq = horizontalDistanceSq;
          bestIndex = wrappedIndex;
        }
      };
      for (let index = 0; index < sampleCount; index += 8) considerLandingSurface(index);
      const coarseBest = bestIndex;
      for (let offset = -12; offset <= 12; offset += 1) considerLandingSurface(coarseBest + offset);
    }
    const u = bestIndex / sampleCount;
    return { u, distance: Math.sqrt(bestHorizontalDistanceSq), pose: samples[bestIndex].pose };
  };

  return { length: curve.getLength(), pointAt, sampledPointAtInto, nearest, nearestSurface, isClearFromRoad };
}

function makeCourseStripGeometry(THREE: ThreeModule, course: RaceCourse, leftLane: number, rightLane: number, yOffset = 0) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const segments = 1440;
  for (let i = 0; i <= segments; i += 1) {
    const u = i / segments;
    const left = course.pointAt(u, leftLane);
    const right = course.pointAt(u, rightLane);
    positions.push(left.x, left.y + yOffset, left.z, right.x, right.y + yOffset, right.z);
    uvs.push(u, 1, u, 0);
    if (i < segments) {
      const vertex = i * 2;
      indices.push(vertex, vertex + 1, vertex + 2, vertex + 2, vertex + 1, vertex + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeCourseSegmentGeometry(
  THREE: ThreeModule,
  course: RaceCourse,
  startU: number,
  endU: number,
  leftLane: number,
  rightLane: number,
  yOffset = 0,
  origin?: CoursePose,
  segmentCount = 48,
) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const originX = origin?.x ?? 0;
  const originY = origin?.y ?? 0;
  const originZ = origin?.z ?? 0;
  for (let index = 0; index <= segmentCount; index += 1) {
    const amount = index / segmentCount;
    const u = startU + (endU - startU) * amount;
    const left = course.pointAt(u, leftLane);
    const right = course.pointAt(u, rightLane);
    positions.push(
      left.x - originX, left.y + yOffset - originY, left.z - originZ,
      right.x - originX, right.y + yOffset - originY, right.z - originZ,
    );
    uvs.push(amount, 1, amount, 0);
    if (index < segmentCount) {
      const vertex = index * 2;
      indices.push(vertex, vertex + 1, vertex + 2, vertex + 2, vertex + 1, vertex + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeCourseInteriorDeckGeometry(THREE: ThreeModule, course: RaceCourse, lane: number, depth: number) {
  const shape = new THREE.Shape();
  const segments = 480;
  for (let index = 0; index < segments; index += 1) {
    const point = course.pointAt(index / segments, lane);
    if (index === 0) shape.moveTo(point.x, point.z);
    else shape.lineTo(point.x, point.z);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function makeCourseWallSegmentGeometry(
  THREE: ThreeModule,
  course: RaceCourse,
  startU: number,
  endU: number,
  lane: number,
  topOffset: number,
  bottomOffset: number,
  segmentCount = 160,
) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let index = 0; index <= segmentCount; index += 1) {
    const amount = index / segmentCount;
    const point = course.pointAt(startU + (endU - startU) * amount, lane);
    positions.push(point.x, point.y + topOffset, point.z, point.x, point.y + bottomOffset, point.z);
    uvs.push(amount * 10, 1, amount * 10, 0);
    if (index < segmentCount) {
      const vertex = index * 2;
      indices.push(vertex, vertex + 2, vertex + 1, vertex + 2, vertex + 3, vertex + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeCourseEdgeGeometry(THREE: ThreeModule, course: RaceCourse, lane: number, topOffset: number, bottomOffset: number) {
  const positions: number[] = [];
  const indices: number[] = [];
  const segments = 1440;
  for (let i = 0; i <= segments; i += 1) {
    const point = course.pointAt(i / segments, lane);
    positions.push(point.x, point.y + topOffset, point.z, point.x, point.y + bottomOffset, point.z);
    if (i < segments) {
      const vertex = i * 2;
      indices.push(vertex, vertex + 2, vertex + 1, vertex + 2, vertex + 3, vertex + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createAnimalDriver(THREE: ThreeModule, animal: DriverAnimal, suitColor: number) {
  const driver = new THREE.Group();
  driver.position.set(0, 0.86, -0.35);

  const animalColors: Record<DriverAnimal, { fur: number; light: number; dark: number }> = {
    otter: { fur: 0x9a6040, light: 0xf1d2ac, dark: 0x34231d },
    fox: { fur: 0xe86c2b, light: 0xffead5, dark: 0x43251f },
    cat: { fur: 0x343a43, light: 0xdde1e4, dark: 0x10151a },
    corgi: { fur: 0xd98a2c, light: 0xffefd0, dark: 0x42281c },
    monkey: { fur: 0xf07aa9, light: 0xffd2e1, dark: 0x6d294d },
  };
  const colors = animalColors[animal];
  const fur = new THREE.MeshStandardMaterial({ color: colors.fur, roughness: 0.72 });
  const lightFur = new THREE.MeshStandardMaterial({ color: colors.light, roughness: 0.78 });
  const darkFur = new THREE.MeshStandardMaterial({ color: colors.dark, roughness: 0.68 });
  const black = new THREE.MeshPhysicalMaterial({ color: 0x0b0f13, roughness: 0.16, clearcoat: 0.72 });
  const eye = new THREE.MeshPhysicalMaterial({ color: 0x16110d, roughness: 0.08, clearcoat: 1 });
  const suit = new THREE.MeshPhysicalMaterial({ color: suitColor, roughness: 0.28, metalness: 0.18, clearcoat: 0.72 });
  const suitTrim = new THREE.MeshStandardMaterial({ color: 0xe8eef0, roughness: 0.34, metalness: 0.28 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x202933, roughness: 0.46 });

  const add = (geometry: Three.BufferGeometry, material: Three.Material, x: number, y: number, z: number, parent: Three.Object3D = driver) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const torso = add(new THREE.SphereGeometry(0.62, 28, 20), suit, 0, 0.44, 0);
  torso.scale.set(0.9, 0.92, 0.72);
  const chest = add(new THREE.BoxGeometry(0.68, 0.08, 0.08), suitTrim, 0, 0.48, 0.52);
  chest.rotation.z = 0.03;

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 1.15, 0.12);
  driver.add(headPivot);
  const head = add(new THREE.SphereGeometry(0.52, 32, 24), fur, 0, 0, 0, headPivot);
  head.scale.set(animal === "corgi" ? 1.08 : animal === "monkey" ? 1.03 : 1, animal === "monkey" ? 1.06 : 1, animal === "fox" ? 1.08 : 1);
  const muzzle = add(new THREE.SphereGeometry(0.29, 24, 16), lightFur, 0, -0.11, 0.43, headPivot);
  muzzle.scale.set(animal === "otter" ? 1.22 : animal === "monkey" ? 1.34 : 1, animal === "monkey" ? 0.82 : 0.72, 0.72);
  const nose = add(new THREE.SphereGeometry(0.095, 18, 12), black, 0, -0.03, 0.67, headPivot);
  nose.scale.set(1.2, 0.82, 0.72);
  [-1, 1].forEach((side) => {
    const eyeMesh = add(new THREE.SphereGeometry(0.065, 18, 12), eye, side * 0.18, 0.1, 0.47, headPivot);
    eyeMesh.scale.set(0.85, 1.12, 0.58);
    const brow = add(new THREE.BoxGeometry(0.18, 0.035, 0.045), darkFur, side * 0.18, 0.22, 0.46, headPivot);
    brow.rotation.z = side * -0.12;
  });

  if (animal === "otter" || animal === "monkey") {
    [-1, 1].forEach((side) => {
      const monkey = animal === "monkey";
      const ear = add(new THREE.SphereGeometry(monkey ? 0.23 : 0.17, 22, 14), monkey ? lightFur : fur, side * (monkey ? 0.43 : 0.36), monkey ? 0.22 : 0.35, -0.02, headPivot);
      ear.scale.set(monkey ? 0.9 : 0.72, 1, monkey ? 0.54 : 0.62);
      add(new THREE.SphereGeometry(monkey ? 0.115 : 0.09, 18, 12), monkey ? fur : lightFur, side * (monkey ? 0.43 : 0.36), monkey ? 0.22 : 0.35, 0.08, headPivot);
    });
  } else {
    const earHeight = animal === "corgi" ? 0.62 : animal === "fox" ? 0.56 : 0.44;
    const earWidth = animal === "corgi" ? 0.23 : 0.19;
    [-1, 1].forEach((side) => {
      const ear = add(new THREE.ConeGeometry(earWidth, earHeight, 4), fur, side * 0.34, 0.47, -0.01, headPivot);
      ear.rotation.y = Math.PI / 4;
      ear.rotation.z = side * (animal === "corgi" ? -0.12 : -0.06);
    });
  }

  if (animal === "fox") {
    [-1, 1].forEach((side) => {
      const cheek = add(new THREE.SphereGeometry(0.2, 20, 14), lightFur, side * 0.22, -0.08, 0.39, headPivot);
      cheek.scale.set(1, 0.78, 0.7);
    });
    const tail = add(new THREE.CapsuleGeometry(0.18, 0.64, 10, 20), fur, 0.48, 0.32, -0.38);
    tail.rotation.z = -0.62;
    add(new THREE.SphereGeometry(0.2, 22, 14), lightFur, 0.7, 0.13, -0.39).scale.set(0.82, 1.16, 0.82);
  } else if (animal === "cat") {
    const tail = add(new THREE.TorusGeometry(0.34, 0.075, 12, 30, Math.PI * 1.35), fur, 0.38, 0.4, -0.5);
    tail.rotation.z = -0.28;
  } else if (animal === "corgi") {
    const blaze = add(new THREE.SphereGeometry(0.17, 20, 14), lightFur, 0, 0.19, 0.47, headPivot);
    blaze.scale.set(0.6, 1.25, 0.45);
    add(new THREE.SphereGeometry(0.19, 20, 14), lightFur, 0, 0.37, -0.53).scale.set(1.15, 0.8, 0.85);
  } else if (animal === "monkey") {
    const facePatch = add(new THREE.SphereGeometry(0.39, 24, 18), lightFur, 0, -0.01, 0.25, headPivot);
    facePatch.scale.set(0.9, 1.02, 0.58);
    const tail = add(new THREE.TorusGeometry(0.38, 0.075, 12, 34, Math.PI * 1.62), fur, 0.42, 0.37, -0.52);
    tail.rotation.set(Math.PI / 2, 0.18, -0.34);
  } else {
    const tail = add(new THREE.CapsuleGeometry(0.14, 0.5, 8, 18), fur, 0.4, 0.29, -0.41);
    tail.rotation.z = -0.68;
  }
  [-1, 1].forEach((side) => {
    const arm = add(new THREE.CapsuleGeometry(0.13, 0.48, 8, 16), suit, side * 0.49, 0.39, 0.29);
    arm.rotation.z = side * 0.86;
    arm.rotation.x = 0.38;
    const hand = add(new THREE.SphereGeometry(0.16, 20, 14), glove, side * 0.29, 0.29, 0.62);
    hand.scale.set(1, 0.85, 1.1);
  });

  driver.userData.headPivot = headPivot;
  return driver;
}

function createKart(THREE: ThreeModule, color: number, accent: number, player = false, animal: DriverAnimal = "otter") {
  const kart = new THREE.Group();
  const visualRoot = new THREE.Group();
  kart.add(visualRoot);
  kart.userData.visualRoot = visualRoot;
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x121519, roughness: 0.84, metalness: 0.08 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x313a43, roughness: 0.3, metalness: 0.9 });
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.2,
    metalness: 0.58,
    clearcoat: 1,
    clearcoatRoughness: 0.13,
  });
  const accentMat = new THREE.MeshPhysicalMaterial({ color: accent, roughness: 0.22, metalness: 0.42, clearcoat: 0.9 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2c3, emissive: 0xffe1a1, emissiveIntensity: 0.9, roughness: 0.18 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xb21324, emissive: 0xff203c, emissiveIntensity: 0.65 });

  const addPart = (geometry: Three.BufferGeometry, material: Three.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    visualRoot.add(mesh);
    return mesh;
  };

  addPart(new THREE.BoxGeometry(2.3, 0.42, 3.45, 3, 2, 4), bodyMat, 0, 0.68, 0);
  const nose = addPart(new THREE.SphereGeometry(1, 32, 18), bodyMat, 0, 0.67, 1.74);
  nose.scale.set(1.03, 0.34, 1.22);
  addPart(new THREE.BoxGeometry(2.8, 0.18, 0.32, 4, 2, 2), accentMat, 0, 0.43, 2.73);

  [-1, 1].forEach((side) => {
    const sidePod = addPart(new THREE.SphereGeometry(0.62, 24, 14), bodyMat, side * 1.02, 0.67, 0.18);
    sidePod.scale.set(0.82, 0.46, 1.65);
    const fenderFront = addPart(new THREE.TorusGeometry(0.62, 0.11, 12, 28, Math.PI), bodyMat, side * 1.27, 0.71, 1.43);
    fenderFront.rotation.y = Math.PI / 2;
    fenderFront.rotation.z = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    const fenderRear = addPart(new THREE.TorusGeometry(0.62, 0.11, 12, 28, Math.PI), bodyMat, side * 1.27, 0.71, -1.28);
    fenderRear.rotation.y = Math.PI / 2;
    fenderRear.rotation.z = side > 0 ? Math.PI / 2 : -Math.PI / 2;
  });

  const seat = addPart(new THREE.BoxGeometry(1.08, 1.05, 0.72, 3, 4, 3), tireMat, 0, 1.18, -0.42);
  seat.rotation.x = -0.12;
  const driver = createAnimalDriver(THREE, animal, color);
  visualRoot.add(driver);
  kart.userData.driver = driver;

  const wheel = addPart(new THREE.TorusGeometry(0.24, 0.055, 12, 28), metal, 0, 1.06, 0.5);
  wheel.rotation.x = Math.PI / 2;
  addPart(new THREE.CylinderGeometry(0.045, 0.045, 0.55, 16), metal, 0, 0.95, 0.5).rotation.z = Math.PI / 2;

  addPart(new THREE.BoxGeometry(2.75, 0.14, 0.5, 5, 2, 2), bodyMat, 0, 1.17, -2.03);
  [-0.82, 0.82].forEach((x) => addPart(new THREE.BoxGeometry(0.13, 0.64, 0.17), metal, x, 0.88, -1.86));

  const wheelGeometry = new THREE.CylinderGeometry(0.55, 0.55, 0.46, 32, 3);
  [[-1.3, 1.43], [1.3, 1.43], [-1.3, -1.31], [1.3, -1.31]].forEach(([x, z]) => {
    const tire = addPart(wheelGeometry, tireMat, x, 0.58, z);
    tire.rotation.z = Math.PI / 2;
    const rim = addPart(new THREE.CylinderGeometry(0.24, 0.24, 0.48, 28, 2), metal, x, 0.58, z);
    rim.rotation.z = Math.PI / 2;
    const hub = addPart(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 20), accentMat, x, 0.58, z);
    hub.rotation.z = Math.PI / 2;
  });

  [-0.52, 0.52].forEach((x) => {
    addPart(new THREE.SphereGeometry(0.14, 20, 12), lampMat, x, 0.72, 2.57).scale.set(1.2, 0.78, 0.48);
    addPart(new THREE.BoxGeometry(0.3, 0.13, 0.08), tailMat, x, 0.81, -1.78);
    const exhaust = addPart(new THREE.CylinderGeometry(0.1, 0.13, 0.64, 20), metal, x * 1.45, 0.43, -2.0);
    exhaust.rotation.x = Math.PI / 2;
  });

  kart.scale.setScalar(player ? 1.04 : 0.92);
  return kart;
}

function animateKartDriver(THREE: ThreeModule, kart: Three.Group, steer: number, drifting: boolean, dt: number) {
  const driver = kart.userData.driver as Three.Group | undefined;
  if (!driver) return;
  const response = 1 - Math.pow(0.025, dt);
  const lean = drifting ? 0.17 : 0.08;
  driver.rotation.y = THREE.MathUtils.lerp(driver.rotation.y, steer * (drifting ? 0.18 : 0.1), response);
  driver.rotation.z = THREE.MathUtils.lerp(driver.rotation.z, -steer * lean, response);
  const head = driver.userData.headPivot as Three.Group | undefined;
  if (head) head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, steer * 0.1, response);
}

function addBarrier(THREE: ThreeModule, scene: Three.Scene, course: RaceCourse, lane: number, height: number, color = 0xb7c0c5) {
  const railMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.82 });
  const segments = 600;
  const rail = new THREE.InstancedMesh(new THREE.BoxGeometry(1.3, 0.16, 0.12), railMat, segments);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.86, 0.1), railMat, segments / 2);
  const dummy = new THREE.Object3D();
  const railAxis = new THREE.Vector3(1, 0, 0);
  const railDirection = new THREE.Vector3();
  for (let i = 0; i < segments; i += 1) {
    const point = course.pointAt(i / segments, lane);
    const next = course.pointAt((i + 1) / segments, lane);
    railDirection.set(next.x - point.x, next.y - point.y, next.z - point.z);
    dummy.position.set(point.x, point.y + height, point.z);
    dummy.quaternion.setFromUnitVectors(railAxis, railDirection.clone().normalize());
    dummy.scale.set(railDirection.length() / 1.3 + 0.05, 1, 1);
    dummy.updateMatrix();
    rail.setMatrixAt(i, dummy.matrix);
    if (i % 2 === 0) {
      dummy.position.set(point.x, point.y + height - 0.3, point.z);
      dummy.quaternion.identity();
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      posts.setMatrixAt(i / 2, dummy.matrix);
    }
  }
  rail.instanceMatrix.needsUpdate = true;
  posts.instanceMatrix.needsUpdate = true;
  rail.castShadow = true;
  posts.castShadow = true;
  scene.add(rail, posts);
}

function addWorld(THREE: ThreeModule, scene: Three.Scene, course: RaceCourse, definition: CourseDefinition) {
  const jungle = definition.id === "jungle";
  const starlight = definition.id === "starlight";
  const river = definition.id === "river";
  const cloud = definition.id === "cloud";
  const pirate = definition.id === "pirate";
  let starlightRoadMaterial: Three.MeshStandardMaterial | undefined;
  let starlightRoadMesh: Three.Mesh | undefined;
  const starlightPrismMaterials: Three.MeshStandardMaterial[] = [];
  let starlightLaneMaterial: Three.MeshStandardMaterial | undefined;
  let starlightCurbMaterials: Three.MeshStandardMaterial[] | undefined;
  let starlightStarField: Three.Points | undefined;
  let starlightStarMaterial: Three.PointsMaterial | undefined;
  let starlightMoon: Three.Mesh | undefined;
  let starlightMoonMaterial: Three.MeshStandardMaterial | undefined;
  let starlightSunDisc: Three.Mesh | undefined;
  let starlightSunDiscMaterial: Three.MeshBasicMaterial | undefined;
  let starlightCrystalGroup: Three.Group | undefined;
  const starlightCrystalMaterials: Three.MeshStandardMaterial[] = [];
  const skyColor = starlight ? 0x78c9ed : cloud || pirate ? 0x69c8f4 : jungle || river ? 0x69a97a : 0x9bd5f2;
  scene.background = new THREE.Color(skyColor);
  scene.fog = new THREE.Fog(starlight ? 0xa9ddf2 : cloud || pirate ? 0x8ad7f6 : jungle || river ? 0x65966e : 0xb9def0, starlight ? 230 : 190, starlight ? 560 : 490);

  const oceanTime = { value: 0 };
  const groundMaterial = pirate
    ? new THREE.MeshPhysicalMaterial({ color: 0x087fba, emissive: 0x043b62, emissiveIntensity: 0.16, roughness: 0.14, metalness: 0.08, clearcoat: 0.82, clearcoatRoughness: 0.16 })
    : new THREE.MeshStandardMaterial({ color: cloud ? 0x85cbed : starlight ? 0x78c9ed : jungle || river ? 0x315f2f : 0x78976a, roughness: 0.98 });
  if (pirate) {
    groundMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.oceanTime = oceanTime;
      shader.vertexShader = `uniform float oceanTime;\n${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\ntransformed.z += sin(position.x * 0.045 + oceanTime * 1.8) * 0.22 + sin(position.y * 0.06 - oceanTime * 1.25) * 0.14;",
      );
    };
    groundMaterial.customProgramCacheKey = () => "blackwake-ocean-v1";
    scene.userData.oceanTime = oceanTime;
  }
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(pirate ? 1400 : 520, pirate ? 1400 : 520, pirate ? 80 : 32, pirate ? 80 : 32),
    groundMaterial,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = WORLD_GROUND_Y;
  ground.receiveShadow = true;
  scene.add(ground);

  const concrete = new THREE.MeshStandardMaterial({ color: pirate ? 0x6f4325 : starlight ? 0xbfc7ca : jungle || river ? 0x9b825f : 0xc9c8bd, roughness: 0.88, metalness: 0.02 });
  if (!cloud && definition.id !== "custom") {
    const leftWalk = new THREE.Mesh(makeCourseStripGeometry(THREE, course, SIDEWALK_EDGE, COURSE_WIDTH, 0.02), concrete);
    const rightWalk = new THREE.Mesh(makeCourseStripGeometry(THREE, course, -COURSE_WIDTH, -SIDEWALK_EDGE, 0.02), concrete);
    leftWalk.receiveShadow = true;
    rightWalk.receiveShadow = true;
    scene.add(leftWalk, rightWalk);
  }

  if (starlight) {
    starlightRoadMaterial = new THREE.MeshStandardMaterial({
      color: 0x41464b,
      emissive: 0x000000,
      emissiveIntensity: 0,
      roughness: 0.88,
      metalness: 0.03,
    });
    const baseRoad = new THREE.Mesh(
      makeCourseStripGeometry(THREE, course, COURSE_WIDTH, -COURSE_WIDTH, 0.05),
      starlightRoadMaterial,
    );
    baseRoad.receiveShadow = true;
    starlightRoadMesh = baseRoad;
    scene.add(baseRoad);
    const prismColors = [0xee3f56, 0xff8b32, 0xffd94a, 0x42d66d, 0x39dce6, 0x4386ee, 0x9d56e8];
    const bandWidth = (COURSE_WIDTH * 2) / prismColors.length;
    prismColors.forEach((color, index) => {
      const left = COURSE_WIDTH - bandWidth * index;
      const right = left - bandWidth;
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0,
        roughness: 0.38,
        metalness: 0.28,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -4,
      });
      starlightPrismMaterials.push(material);
      const band = new THREE.Mesh(
        makeCourseStripGeometry(THREE, course, left, right, 0.085),
        material,
      );
      band.receiveShadow = true;
      band.renderOrder = 2;
      scene.add(band);
    });
  } else if (cloud) {
    const cloudPatches: Three.Group[] = [];
    const cloudPuffMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xb7e7ff, emissiveIntensity: 0.08, roughness: 1 });
    const puffGeometries = [
      new THREE.SphereGeometry(1.65, 16, 11),
      new THREE.SphereGeometry(2.05, 18, 12),
      new THREE.SphereGeometry(2.4, 18, 12),
    ];
    const warningBeamAuraGeometry = new THREE.CylinderGeometry(1.15, 2.8, 80, 20, 1, true);
    const warningBeamCoreGeometry = new THREE.CylinderGeometry(0.22, 0.68, 80, 14);
    const warningImpactGeometry = new THREE.TorusGeometry(3.15, 0.24, 14, 48);
    const tileCount = 72;
    for (let index = 0; index < tileCount; index += 1) {
      const startU = index / tileCount;
      const endU = (index + 1) / tileCount + 0.00045;
      [-1, 1].forEach((side) => {
        const leftLane = side > 0 ? COURSE_WIDTH + 0.15 : 0.25;
        const rightLane = side > 0 ? -0.25 : -COURSE_WIDTH - 0.15;
        const centerLane = side * COURSE_WIDTH * 0.5;
        const origin = course.pointAt((startU + endU) * 0.5, centerLane);
        const patch = new THREE.Group();
        patch.position.set(origin.x, origin.y, origin.z);
        const surfaceMaterial = new THREE.MeshStandardMaterial({
          color: 0xf8fcff,
          emissive: 0x9cddff,
          emissiveIntensity: 0.1,
          roughness: 0.95,
          transparent: true,
          opacity: 0.98,
          side: THREE.DoubleSide,
        });
        const surface = new THREE.Mesh(
          makeCourseSegmentGeometry(THREE, course, startU, endU, leftLane, rightLane, 0.08, origin, 12),
          surfaceMaterial,
        );
        surface.receiveShadow = true;
        patch.add(surface);
        const warningMaterial = new THREE.MeshBasicMaterial({
          color: 0xff5a24,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const warningSurface = new THREE.Mesh(
          makeCourseSegmentGeometry(THREE, course, startU, endU, leftLane, rightLane, 0.2, origin, 12),
          warningMaterial,
        );
        warningSurface.visible = false;
        patch.add(warningSurface);
        const warningStripes = new THREE.Group();
        for (let stripeIndex = 0; stripeIndex < 6; stripeIndex += 1) {
          const stripeStart = startU + (endU - startU) * (stripeIndex / 6);
          const stripeEnd = startU + (endU - startU) * ((stripeIndex + 0.48) / 6);
          const stripe = new THREE.Mesh(
            makeCourseSegmentGeometry(THREE, course, stripeStart, stripeEnd, leftLane, rightLane, 0.255, origin, 3),
            new THREE.MeshBasicMaterial({
              color: stripeIndex % 2 === 0 ? 0xffe14b : 0xff391f,
              transparent: true,
              opacity: 0.88,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
              side: THREE.DoubleSide,
            }),
          );
          warningStripes.add(stripe);
        }
        warningStripes.visible = false;
        patch.add(warningStripes);
        const warningMarkers = new THREE.Group();
        [0.28, 0.72].forEach((amount) => {
          const point = course.pointAt(startU + (endU - startU) * amount, centerLane);
          const marker = new THREE.Mesh(
            new THREE.TorusGeometry(1.45, 0.22, 14, 40),
            new THREE.MeshBasicMaterial({ color: 0xffdc54, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
          );
          marker.position.set(point.x - origin.x, point.y - origin.y + 2.1, point.z - origin.z);
          marker.rotation.x = Math.PI / 2;
          warningMarkers.add(marker);
        });
        warningMarkers.visible = false;
        patch.add(warningMarkers);
        const warningBeam = new THREE.Group();
        warningBeam.position.set(origin.x, origin.y + 0.28, origin.z);
        warningBeam.visible = false;
        const beamAuraMaterial = new THREE.MeshBasicMaterial({
          color: 0x68e8ff,
          transparent: true,
          opacity: 0.35,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const beamCoreMaterial = new THREE.MeshBasicMaterial({
          color: 0xfff5a8,
          transparent: true,
          opacity: 0.88,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const beamAura = new THREE.Mesh(warningBeamAuraGeometry, beamAuraMaterial);
        const beamCore = new THREE.Mesh(warningBeamCoreGeometry, beamCoreMaterial);
        beamAura.scale.y = 0.01;
        beamCore.scale.y = 0.01;
        beamAura.renderOrder = 7;
        beamCore.renderOrder = 8;
        warningBeam.add(beamAura, beamCore);
        const beamImpacts = new THREE.Group();
        [1, 1.48].forEach((ringScale, ringIndex) => {
          const impact = new THREE.Mesh(
            warningImpactGeometry,
            new THREE.MeshBasicMaterial({
              color: ringIndex === 0 ? 0xfff06a : 0x66eaff,
              transparent: true,
              opacity: 0.9,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            }),
          );
          impact.position.y = 0.42 + ringIndex * 0.12;
          impact.rotation.x = Math.PI / 2;
          impact.scale.setScalar(ringScale);
          beamImpacts.add(impact);
        });
        beamImpacts.visible = false;
        warningBeam.add(beamImpacts);
        scene.add(warningBeam);
        [0.12, 0.38, 0.66, 0.9].forEach((amount, puffIndex) => {
          const u = startU + (endU - startU) * amount;
          const lane = side * (1.3 + ((puffIndex * 2.35 + index * 0.87) % 7.8));
          const point = course.pointAt(u, lane);
          const puff = new THREE.Mesh(puffGeometries[(index + puffIndex) % puffGeometries.length], cloudPuffMaterial);
          puff.position.set(point.x - origin.x, point.y - origin.y + 0.12 + (puffIndex % 2) * 0.08, point.z - origin.z);
          puff.scale.set(1.25 + (puffIndex % 2) * 0.22, 0.42 + (puffIndex % 3) * 0.07, 1.05);
          puff.receiveShadow = true;
          patch.add(puff);
        });
        patch.userData.index = index;
        patch.userData.side = side;
        patch.userData.surfaceMaterial = surfaceMaterial;
        patch.userData.warningSurface = warningSurface;
        patch.userData.warningMaterial = warningMaterial;
        patch.userData.warningStripes = warningStripes;
        patch.userData.warningMarkers = warningMarkers;
        patch.userData.warningBeam = warningBeam;
        patch.userData.beamAura = beamAura;
        patch.userData.beamCore = beamCore;
        patch.userData.beamImpacts = beamImpacts;
        patch.userData.beamAuraMaterial = beamAuraMaterial;
        patch.userData.beamCoreMaterial = beamCoreMaterial;
        patch.userData.origin = origin;
        scene.add(patch);
        cloudPatches.push(patch);
      });
    }
    scene.userData.cloudPatches = cloudPatches;
  } else {
    if (definition.id === "custom") {
      const customRoadPatches: Three.Group[] = [];
      const tileCount = 72;
      for (let index = 0; index < tileCount; index += 1) {
        const startU = index / tileCount;
        const endU = (index + 1) / tileCount + 0.0004;
        [-1, 1].forEach((side) => {
          const leftLane = side > 0 ? COURSE_WIDTH + 0.08 : 0.08;
          const rightLane = side > 0 ? -0.08 : -COURSE_WIDTH - 0.08;
          const centerLane = side * COURSE_WIDTH * 0.5;
          const origin = course.pointAt((startU + endU) * 0.5, centerLane);
          const patch = new THREE.Group();
          patch.position.set(origin.x, origin.y, origin.z);
          const surfaceMaterial = new THREE.MeshStandardMaterial({
            color: 0x41464b,
            emissive: 0x223339,
            emissiveIntensity: 0,
            roughness: 0.88,
            metalness: 0.03,
            transparent: true,
            opacity: 1,
            side: THREE.DoubleSide,
          });
          const surface = new THREE.Mesh(
            makeCourseSegmentGeometry(THREE, course, startU, endU, leftLane, rightLane, 0.05, origin, 8),
            surfaceMaterial,
          );
          surface.receiveShadow = true;
          patch.add(surface);
          if (side > 0 && index % 2 === 0) {
            const laneDash = new THREE.Mesh(
              makeCourseSegmentGeometry(THREE, course, startU + 0.0018, endU - 0.0018, 0.14, -0.14, 0.115, origin, 4),
              new THREE.MeshStandardMaterial({ color: 0xf8f3df, roughness: 0.82 }),
            );
            patch.add(laneDash);
          }
          const warningMaterial = new THREE.MeshBasicMaterial({
            color: 0xff8b32,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          });
          const warningSurface = new THREE.Mesh(
            makeCourseSegmentGeometry(THREE, course, startU, endU, leftLane, rightLane, 0.18, origin, 8),
            warningMaterial,
          );
          warningSurface.visible = false;
          patch.add(warningSurface);
          patch.userData.index = index;
          patch.userData.side = side;
          patch.userData.surfaceMaterial = surfaceMaterial;
          patch.userData.warningSurface = warningSurface;
          patch.userData.warningMaterial = warningMaterial;
          scene.add(patch);
          customRoadPatches.push(patch);
        });
      }
      scene.userData.customRoadPatches = customRoadPatches;
    } else {
      const road = new THREE.Mesh(
        makeCourseStripGeometry(THREE, course, COURSE_WIDTH, -COURSE_WIDTH, 0.05),
        new THREE.MeshStandardMaterial({ color: pirate ? 0x8a552c : river ? 0x5d513c : jungle ? 0x4a4438 : 0x41464b, roughness: 0.88, metalness: 0.03 }),
      );
      road.receiveShadow = true;
      scene.add(road);
    }

    if (river) {
      const waterUniforms: Array<{ value: number }> = [];
      RIVER_CHANNELS.forEach((channel, channelIndex) => {
        const flowTime = { value: 0 };
        waterUniforms.push(flowTime);
        const waterMaterial = new THREE.MeshPhysicalMaterial({
          color: channelIndex % 2 ? 0x159fd0 : 0x18aada,
          emissive: 0x075a7c,
          emissiveIntensity: 0.2,
          roughness: 0.08,
          metalness: 0.02,
          transparent: true,
          opacity: 0.76,
          transmission: 0.16,
          clearcoat: 0.9,
          clearcoatRoughness: 0.12,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        waterMaterial.onBeforeCompile = (shader) => {
          shader.uniforms.flowTime = flowTime;
          shader.vertexShader = `uniform float flowTime;\n${shader.vertexShader}`;
          shader.vertexShader = shader.vertexShader.replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\ntransformed.y += sin(position.x * 0.34 + position.z * 0.21 + flowTime * 3.1) * 0.075 + sin(position.x * 0.13 - position.z * 0.29 + flowTime * 2.2) * 0.045;",
          );
        };
        waterMaterial.customProgramCacheKey = () => "rapidwood-flow-v2";
        const water = new THREE.Mesh(
          makeCourseSegmentGeometry(
            THREE,
            course,
            channel.start,
            channel.end,
            clamp(channel.lane + channel.halfWidth, -COURSE_WIDTH + 0.2, COURSE_WIDTH - 0.2),
            clamp(channel.lane - channel.halfWidth, -COURSE_WIDTH + 0.2, COURSE_WIDTH - 0.2),
            0.46,
            undefined,
            180,
          ),
          waterMaterial,
        );
        water.renderOrder = 2;
        scene.add(water);
      });
      const flowParticleCount = 150;
      const flowPositions = new Float32Array(flowParticleCount * 3);
      const flowParticles = Array.from({ length: flowParticleCount }, (_, index) => {
        const channelIndex = index % RIVER_CHANNELS.length;
        const channel = RIVER_CHANNELS[channelIndex];
        const progress = channel.start + ((index * 0.6180339) % 1) * (channel.end - channel.start);
        const laneOffset = (((index * 37) % 100) / 100 - 0.5) * channel.halfWidth * 1.6;
        const point = course.pointAt(progress, channel.lane + laneOffset);
        flowPositions[index * 3] = point.x;
        flowPositions[index * 3 + 1] = point.y + 0.54;
        flowPositions[index * 3 + 2] = point.z;
        return { channelIndex, progress, laneOffset, speed: 5.2 + (index % 7) * 0.42, phase: index * 0.73, pose: point };
      });
      const flowGeometry = new THREE.BufferGeometry();
      flowGeometry.setAttribute("position", new THREE.BufferAttribute(flowPositions, 3));
      const flowPoints = new THREE.Points(flowGeometry, new THREE.PointsMaterial({
        color: 0xd7faff,
        size: 0.27,
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      flowPoints.renderOrder = 3;
      scene.add(flowPoints);
      scene.userData.waterUniforms = waterUniforms;
      scene.userData.waterFlow = { points: flowPoints, particles: flowParticles };
    }
  }

  const deckMaterial = new THREE.MeshStandardMaterial({ color: pirate ? 0x4f2d1c : starlight ? 0x50565d : jungle || river ? 0x665442 : 0x74787a, roughness: 0.82, metalness: 0.12, side: THREE.DoubleSide });
  if (!cloud && definition.id !== "custom") {
    const underside = new THREE.Mesh(
      makeCourseStripGeometry(THREE, course, DECK_HALF_WIDTH, -DECK_HALF_WIDTH, -0.52),
      deckMaterial,
    );
    underside.receiveShadow = true;
    const leftDeckEdge = new THREE.Mesh(makeCourseEdgeGeometry(THREE, course, DECK_HALF_WIDTH, 0.02, -0.52), deckMaterial);
    const rightDeckEdge = new THREE.Mesh(makeCourseEdgeGeometry(THREE, course, -DECK_HALF_WIDTH, 0.02, -0.52), deckMaterial);
    leftDeckEdge.receiveShadow = true;
    rightDeckEdge.receiveShadow = true;
    scene.add(underside, leftDeckEdge, rightDeckEdge);
  }

  addBarrier(THREE, scene, course, BARRIER_LANE, 0.8, starlight || cloud ? 0x9ddcff : pirate ? 0x5c351f : jungle || river ? 0x765533 : 0xb7c0c5);
  addBarrier(THREE, scene, course, -BARRIER_LANE, 0.8, starlight || cloud ? 0x9ddcff : pirate ? 0x5c351f : jungle || river ? 0x765533 : 0xb7c0c5);

  const courseAxis = new THREE.Vector3(1, 0, 0);
  const courseDirection = new THREE.Vector3();
  if (!cloud && definition.id !== "custom") {
    const laneMat = new THREE.MeshStandardMaterial({ color: starlight ? 0xffffff : 0xf8f3df, emissive: starlight ? 0x77aaff : 0x000000, emissiveIntensity: 0, roughness: 0.82 });
    if (starlight) starlightLaneMaterial = laneMat;
    const dashCount = 210;
    const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 0.035, 0.14), laneMat, dashCount);
    const dashDummy = new THREE.Object3D();
    for (let i = 0; i < dashCount; i += 1) {
      const point = course.pointAt((i + 0.5) / dashCount);
      const next = course.pointAt((i + 0.8) / dashCount);
      courseDirection.set(next.x - point.x, next.y - point.y, next.z - point.z).normalize();
      dashDummy.position.set(point.x, point.y + 0.105, point.z);
      dashDummy.quaternion.setFromUnitVectors(courseAxis, courseDirection);
      dashDummy.scale.set(i % 2 === 0 ? 1 : 0.06, 1, 1);
      dashDummy.updateMatrix();
      dashes.setMatrixAt(i, dashDummy.matrix);
    }
    dashes.instanceMatrix.needsUpdate = true;
    scene.add(dashes);
  }

  const curbMats = [
    new THREE.MeshStandardMaterial({ color: starlight ? 0xf7f1e7 : jungle ? 0xd3ba72 : 0xf7f1e7, emissive: starlight ? 0x4f9ac9 : 0x000000, emissiveIntensity: 0, roughness: 0.72 }),
    new THREE.MeshStandardMaterial({ color: starlight ? 0xc83f3f : jungle ? 0x4b7a38 : 0xc83f3f, emissive: starlight ? 0x4d258f : 0x000000, emissiveIntensity: 0, roughness: 0.7 }),
  ];
  if (starlight) starlightCurbMaterials = curbMats;
  const curbSegments = 420;
  const curbMeshes = curbMats.map((material) => new THREE.InstancedMesh(new THREE.BoxGeometry(1.55, 0.12, 0.44), material, curbSegments));
  const curbCounters = [0, 0];
  const curbDummy = new THREE.Object3D();
  [-COURSE_WIDTH - 0.18, COURSE_WIDTH + 0.18].forEach((lane) => {
    for (let i = 0; i < curbSegments; i += 1) {
      const point = course.pointAt(i / curbSegments, lane);
      const next = course.pointAt((i + 1) / curbSegments, lane);
      const materialIndex = i % 2;
      courseDirection.set(next.x - point.x, next.y - point.y, next.z - point.z);
      curbDummy.position.set(point.x, point.y + 0.13, point.z);
      curbDummy.quaternion.setFromUnitVectors(courseAxis, courseDirection.clone().normalize());
      curbDummy.scale.set(courseDirection.length() / 1.55 + 0.06, 1, 1);
      curbDummy.updateMatrix();
      curbMeshes[materialIndex].setMatrixAt(curbCounters[materialIndex], curbDummy.matrix);
      curbCounters[materialIndex] += 1;
    }
  });
  curbMeshes.forEach((mesh) => {
    mesh.count = curbCounters[curbMeshes.indexOf(mesh)];
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    scene.add(mesh);
  });

  for (let i = -10; i <= 10; i += 1) {
    const start = course.pointAt(0, i);
    const tile = new THREE.Mesh(
      new THREE.BoxGeometry(1.06, 0.045, 1.06),
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0xf5f5ef : 0x20252a, roughness: 0.68 }),
    );
    tile.position.set(start.x, start.y + 0.11, start.z);
    tile.rotation.y = start.heading;
    scene.add(tile);
  }

  const buildingColors = [0xd8d3c8, 0xc5d2d5, 0xd9c9bd, 0xb9c7d2, 0xdedbd2];
  const glassMats = [0x6f9eaf, 0x568198, 0x8ab1bd].map((color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.14, metalness: 0.48, clearcoat: 0.6 }));
  const windowCapacity = definition.id === "city" ? 62 * 7 * 3 : 1;
  const windowGeometry = new THREE.BoxGeometry(1, 1, 0.07);
  const windowMeshes = glassMats.map((material) => new THREE.InstancedMesh(windowGeometry, material, windowCapacity));
  const windowCounts = [0, 0, 0];
  const windowDummy = new THREE.Object3D();
  const windowPosition = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const makeBuilding = (x: number, z: number, w: number, d: number, h: number, index: number, rotation: number) => {
    const footprintRadius = Math.hypot(w, d) * 0.52;
    if (!course.isClearFromRoad(x, z, COURSE_WIDTH + footprintRadius + 2.2)) return;
    const group = new THREE.Group();
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d, 3, Math.max(3, Math.floor(h / 2)), 3),
      new THREE.MeshStandardMaterial({ color: buildingColors[index % buildingColors.length], roughness: 0.68, metalness: 0.04 }),
    );
    shell.position.y = h / 2;
    shell.castShadow = true;
    shell.receiveShadow = true;
    group.add(shell);

    const rows = Math.min(7, Math.max(3, Math.floor(h / 3)));
    for (let row = 0; row < rows; row += 1) {
      const y = 1.7 + row * ((h - 2.4) / rows);
      for (let column = -1; column <= 1; column += 1) {
        const materialIndex = (index + row + column + 3) % glassMats.length;
        windowPosition
          .set(column * w * 0.27, y, -d / 2 - 0.04)
          .applyAxisAngle(worldUp, rotation);
        windowDummy.position.set(x + windowPosition.x, windowPosition.y, z + windowPosition.z);
        windowDummy.rotation.set(0, rotation, 0);
        windowDummy.scale.set(w * 0.2, 0.72, 1);
        windowDummy.updateMatrix();
        windowMeshes[materialIndex].setMatrixAt(windowCounts[materialIndex], windowDummy.matrix);
        windowCounts[materialIndex] += 1;
      }
    }

    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.36, 0.55, d * 0.4), new THREE.MeshStandardMaterial({ color: 0x7d8586, roughness: 0.62, metalness: 0.32 }));
    roof.position.y = h + 0.27;
    roof.castShadow = false;
    group.add(roof);
    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    scene.add(group);
  };

  if (definition.id === "city") {
    for (let i = 0; i < 62; i += 1) {
      const side = i % 2 === 0 ? 1 : -1;
      const u = wrap01(i / 62 + 0.009 * Math.sin(i * 2.1));
      const point = course.pointAt(u, side * (28 + (i % 3) * 7));
      makeBuilding(
        point.x,
        point.z,
        4.5 + (i % 3) * 1.25,
        4.2 + ((i + 1) % 3) * 1.1,
        10 + (i * 7 % 22),
        i,
        point.heading + (side > 0 ? Math.PI : 0),
      );
    }
    windowMeshes.forEach((mesh, materialIndex) => {
      mesh.count = windowCounts[materialIndex];
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = false;
      scene.add(mesh);
    });
  }

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x76523a, roughness: 0.95 });
  const leafMats = [0x3f8249, 0x4f9656, 0x327241].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
  const environmentTreeCount = jungle ? 128 : river ? 164 : starlight || cloud || pirate ? 0 : 76;
  const treeCapacity = Math.max(1, environmentTreeCount);
  const trunkInstances = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.23, 2.15, 14), trunkMat, treeCapacity);
  const leafGeometry = new THREE.IcosahedronGeometry(1, 2);
  const leafInstances = leafMats.map((material) => new THREE.InstancedMesh(leafGeometry, material, treeCapacity * 3));
  const leafCounts = [0, 0, 0];
  const treeDummy = new THREE.Object3D();
  let trunkCount = 0;
  const makeTree = (x: number, y: number, z: number, size: number, index: number) => {
    if (!course.isClearFromRoad(x, z, COURSE_WIDTH + size * 1.2 + 1.2)) return;
    treeDummy.position.set(x, y + 1.05 * size, z);
    treeDummy.rotation.set(0, 0, 0);
    treeDummy.scale.setScalar(size);
    treeDummy.updateMatrix();
    trunkInstances.setMatrixAt(trunkCount, treeDummy.matrix);
    trunkCount += 1;
    [[0, 2.35, 0], [-0.42, 2.08, 0.08], [0.38, 2.12, -0.05]].forEach(([ox, oy, oz], crown) => {
      const materialIndex = (index + crown) % leafMats.length;
      const crownScale = (0.82 - crown * 0.05) * size;
      treeDummy.position.set(x + ox * size, y + oy * size, z + oz * size);
      treeDummy.rotation.set(0, 0, 0);
      treeDummy.scale.setScalar(crownScale);
      treeDummy.updateMatrix();
      leafInstances[materialIndex].setMatrixAt(leafCounts[materialIndex], treeDummy.matrix);
      leafCounts[materialIndex] += 1;
    });
  };
  for (let i = 0; i < environmentTreeCount; i += 1) {
    const side = i % 2 === 0 ? 1 : -1;
    const point = course.pointAt(i / environmentTreeCount + 0.004, side * (jungle || river ? 18 + (i % 3) * 3.8 : 18.2));
    makeTree(point.x, point.y, point.z, river ? 1.28 + (i % 5) * 0.16 : jungle ? 1.05 + (i % 5) * 0.13 : 0.76 + (i % 4) * 0.07, i);
  }
  if (environmentTreeCount > 0) {
    trunkInstances.count = trunkCount;
    trunkInstances.instanceMatrix.needsUpdate = true;
    trunkInstances.castShadow = true;
    scene.add(trunkInstances);
    leafInstances.forEach((mesh, materialIndex) => {
      mesh.count = leafCounts[materialIndex];
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = false;
      scene.add(mesh);
    });
  }

  if (jungle || river) {
    const rockMats = [0x59624b, 0x69745a, 0x4e5945].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.98 }));
    const fernMat = new THREE.MeshStandardMaterial({ color: 0x2c7e3c, roughness: 0.9, side: THREE.DoubleSide });
    for (let i = 0; i < 54; i += 1) {
      const side = i % 2 === 0 ? 1 : -1;
      const point = course.pointAt(i / 54 + 0.006, side * (24 + (i % 4) * 2.8));
      if (!course.isClearFromRoad(point.x, point.z, COURSE_WIDTH + 3.6)) continue;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6 + (i % 4) * 0.42, 1), rockMats[i % rockMats.length]);
      rock.scale.set(1.25, 0.85 + (i % 3) * 0.2, 1);
      rock.position.set(point.x, point.y + 0.9, point.z);
      rock.rotation.set(i * 0.31, i * 0.63, i * 0.17);
      rock.castShadow = false;
      scene.add(rock);
      for (let leafIndex = 0; leafIndex < 4; leafIndex += 1) {
        const leaf = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 1.25, 5, 12), fernMat);
        leaf.position.set(point.x, point.y + 1.1, point.z);
        leaf.rotation.set(Math.PI / 2.8, leafIndex * Math.PI / 2 + i, 0);
        leaf.castShadow = false;
        scene.add(leaf);
      }
    }
  }

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3d4549, metalness: 0.72, roughness: 0.35 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff6d7, emissive: 0xffdf96, emissiveIntensity: 0.28 });
  const streetlightCapacity = definition.id === "city" ? 52 : 1;
  const poleInstances = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.075, 0.11, 4.1, 16), poleMat, streetlightCapacity);
  const armInstances = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.055, 0.8, 12), poleMat, streetlightCapacity);
  const lampInstances = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 20, 12), lampMat, streetlightCapacity);
  const streetlightDummy = new THREE.Object3D();
  let streetlightCount = 0;
  for (let i = 0; i < (definition.id === "city" ? 52 : 0); i += 1) {
    const side = i % 2 === 0 ? 1 : -1;
    const point = course.pointAt(i / 52, side * 15.3);
    const x = point.x;
    const z = point.z;
    if (!course.isClearFromRoad(x, z, COURSE_WIDTH + 2.1)) continue;
    streetlightDummy.position.set(x, point.y + 2.05, z);
    streetlightDummy.rotation.set(0, 0, 0);
    streetlightDummy.scale.set(1, 1, 1);
    streetlightDummy.updateMatrix();
    poleInstances.setMatrixAt(streetlightCount, streetlightDummy.matrix);
    streetlightDummy.position.set(x, point.y + 3.98, z);
    streetlightDummy.rotation.set(0, point.heading, Math.PI / 2);
    streetlightDummy.updateMatrix();
    armInstances.setMatrixAt(streetlightCount, streetlightDummy.matrix);
    streetlightDummy.position.set(x + point.nx * 0.35, point.y + 3.9, z + point.nz * 0.35);
    streetlightDummy.rotation.set(0, 0, 0);
    streetlightDummy.updateMatrix();
    lampInstances.setMatrixAt(streetlightCount, streetlightDummy.matrix);
    streetlightCount += 1;
  }
  if (streetlightCount > 0) {
    [poleInstances, armInstances, lampInstances].forEach((mesh) => {
      mesh.count = streetlightCount;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = false;
      scene.add(mesh);
    });
  }

  const supportMat = new THREE.MeshStandardMaterial({ color: 0x8c9293, roughness: 0.7, metalness: 0.24 });
  for (let i = 0; i < (cloud || pirate ? 0 : 80); i += 1) {
    const u = i / 80;
    const point = course.pointAt(u);
    if (point.y < 2.2) continue;
    [-COURSE_WIDTH - 1.35, COURSE_WIDTH + 1.35].forEach((lane) => {
      const supportPoint = course.pointAt(u, lane);
      if (!course.isClearFromRoad(supportPoint.x, supportPoint.z, COURSE_WIDTH + 1.2, u, 0.055)) return;
      const support = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.62, point.y + 0.5, 18), supportMat);
      support.position.set(supportPoint.x, point.y / 2 - 0.25, supportPoint.z);
      support.castShadow = true;
      support.receiveShadow = true;
      scene.add(support);
    });
  }

  if (!starlight) {
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: jungle ? 0.58 : 0.88 });
    [[-145, 56, -125], [30, 65, -155], [152, 52, 18], [-128, 61, 118], [86, 72, 132]].forEach(([x, y, z], cloudIndex) => {
      const cloud = new THREE.Group();
      for (let i = 0; i < 5; i += 1) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(4 + (i % 3), 24, 16), cloudMat);
        puff.position.set((i - 2) * 4.5, Math.sin(i * 1.7) * 1.6, (i % 2) * 2.2);
        puff.scale.y = 0.72;
        cloud.add(puff);
      }
      cloud.position.set(x + cloudIndex * 2, y, z);
      scene.add(cloud);
    });
  } else {
    const starPositions = new Float32Array(1500 * 3);
    for (let i = 0; i < 1500; i += 1) {
      const angle = (i * 2.399963 + Math.sin(i) * 0.2) % TAU;
      const radius = 130 + (i % 41) * 4.8;
      starPositions[i * 3] = Math.cos(angle) * radius;
      starPositions[i * 3 + 1] = 18 + (i % 73) * 2.15;
      starPositions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    starlightStarMaterial = new THREE.PointsMaterial({ color: 0xeaf4ff, size: 0.72, transparent: true, opacity: 0, depthWrite: false });
    starlightStarField = new THREE.Points(starGeometry, starlightStarMaterial);
    starlightStarField.visible = false;
    scene.add(starlightStarField);
    starlightMoonMaterial = new THREE.MeshStandardMaterial({
      color: 0xbfd8ff,
      emissive: 0x5577bb,
      emissiveIntensity: 0,
      roughness: 0.78,
      transparent: true,
      opacity: 0,
    });
    starlightMoon = new THREE.Mesh(
      new THREE.SphereGeometry(16, 64, 40),
      starlightMoonMaterial,
    );
    starlightMoon.position.set(-155, 108, -180);
    starlightMoon.visible = false;
    scene.add(starlightMoon);
    starlightSunDiscMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff2bd,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });
    starlightSunDisc = new THREE.Mesh(new THREE.SphereGeometry(12, 40, 28), starlightSunDiscMaterial);
    starlightSunDisc.position.set(155, 92, -210);
    scene.add(starlightSunDisc);
    starlightCrystalGroup = new THREE.Group();
    const crystalColors = [0x59e4ff, 0xc975ff, 0xffd95d];
    for (let i = 0; i < 44; i += 1) {
      const side = i % 2 === 0 ? 1 : -1;
      const point = course.pointAt(i / 44 + 0.01, side * (22 + (i % 4) * 5));
      if (!course.isClearFromRoad(point.x, point.z, COURSE_WIDTH + 4)) continue;
      const color = crystalColors[i % crystalColors.length];
      const crystalMaterial = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0,
        roughness: 0.22,
        metalness: 0.5,
        transparent: true,
        opacity: 0,
      });
      starlightCrystalMaterials.push(crystalMaterial);
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(1.6 + (i % 3) * 0.55, 1),
        crystalMaterial,
      );
      crystal.position.set(point.x, point.y + 2.3 + (i % 2) * 1.2, point.z);
      crystal.rotation.set(i * 0.2, i * 0.7, i * 0.13);
      starlightCrystalGroup.add(crystal);
    }
    starlightCrystalGroup.visible = false;
    scene.add(starlightCrystalGroup);
  }

  if (pirate) {
    const hullWood = new THREE.MeshStandardMaterial({ color: 0x3b1d12, roughness: 0.92, metalness: 0.04 });
    const outerWood = new THREE.MeshStandardMaterial({ color: 0x562c19, roughness: 0.88, metalness: 0.04 });
    const innerWood = new THREE.MeshStandardMaterial({ color: 0x6f3f22, emissive: 0x1c0802, emissiveIntensity: 0.18, roughness: 0.94, side: THREE.DoubleSide });
    const darkCeiling = new THREE.MeshStandardMaterial({ color: 0x28140d, emissive: 0x090302, emissiveIntensity: 0.12, roughness: 0.98, side: THREE.DoubleSide });
    const iron = new THREE.MeshStandardMaterial({ color: 0x20262b, roughness: 0.34, metalness: 0.82 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xb87922, emissive: 0x4d2100, emissiveIntensity: 0.28, roughness: 0.3, metalness: 0.76 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc928, emissive: 0x8a3d00, emissiveIntensity: 0.45, roughness: 0.22, metalness: 0.84 });

    [-1, 1].forEach((side) => {
      const hullSide = new THREE.Mesh(new THREE.BoxGeometry(12, 17, 380), outerWood);
      hullSide.position.set(side * 115, 5.5, 30);
      hullSide.rotation.z = side * -0.11;
      hullSide.castShadow = true;
      hullSide.receiveShadow = true;
      scene.add(hullSide);
      const bowSide = new THREE.Mesh(new THREE.BoxGeometry(12, 17, 112), hullWood);
      bowSide.position.set(side * 80, 5.8, 235);
      bowSide.rotation.set(0, -side * 0.53, side * -0.12);
      bowSide.castShadow = true;
      scene.add(bowSide);
      const deckWing = new THREE.Mesh(new THREE.BoxGeometry(10, 1.4, 365), outerWood);
      deckWing.position.set(side * 110, 12.1, 30);
      deckWing.receiveShadow = true;
      scene.add(deckWing);
      for (let index = 0; index < 27; index += 1) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.62, 14.5, 1.4), iron);
        rib.position.set(side * 110.2, 5.2, -145 + index * 13.6);
        rib.rotation.z = side * -0.08;
        scene.add(rib);
      }
    });
    const stern = new THREE.Mesh(new THREE.BoxGeometry(230, 17, 12), hullWood);
    stern.position.set(0, 5.5, -158);
    stern.castShadow = true;
    scene.add(stern);
    const bowDeck = new THREE.Mesh(new THREE.BoxGeometry(205, 1.25, 34), outerWood);
    bowDeck.position.set(0, 12.15, 240);
    bowDeck.receiveShadow = true;
    scene.add(bowDeck);
    const sternDeck = new THREE.Mesh(new THREE.BoxGeometry(205, 1.25, 20), outerWood);
    sternDeck.position.set(0, 12.15, -166);
    scene.add(sternDeck);

    // The center is the exposed upper deck and stays level with the start/finish deck.
    const centralDeckY = 12.15;
    const centralDeckTop = centralDeckY + 0.63;
    const centralDeck = new THREE.Mesh(
      makeCourseInteriorDeckGeometry(THREE, course, -BARRIER_LANE - 1.45, 1.25),
      innerWood,
    );
    centralDeck.position.y = centralDeckTop;
    centralDeck.receiveShadow = true;
    centralDeck.castShadow = true;
    scene.add(centralDeck);

    const addCargoCrate = (x: number, z: number, size: number, rotation = 0, deckY = centralDeckTop) => {
      if (!course.isClearFromRoad(x, z, COURSE_WIDTH + size * 2.25 + 0.7)) return;
      const crate = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(3.2 * size, 2.9 * size, 3.2 * size), outerWood);
      box.position.y = 1.45 * size;
      box.castShadow = false;
      crate.add(box);
      [-1, 1].forEach((side) => {
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.24 * size, 3.02 * size, 3.28 * size), iron);
        band.position.set(side * 1.05 * size, 1.45 * size, 0);
        crate.add(band);
      });
      const crossbar = new THREE.Mesh(new THREE.BoxGeometry(3.3 * size, 0.22 * size, 0.26 * size), brass);
      crossbar.position.y = 1.45 * size;
      crate.add(crossbar);
      crate.position.set(x, deckY, z);
      crate.rotation.y = rotation;
      scene.add(crate);
    };
    const addCargoBarrel = (x: number, z: number, size: number, deckY = centralDeckTop) => {
      if (!course.isClearFromRoad(x, z, COURSE_WIDTH + size * 1.55 + 0.65)) return;
      const barrel = new THREE.Group();
      const cask = new THREE.Mesh(new THREE.CylinderGeometry(1.18 * size, 1.05 * size, 2.8 * size, 24), outerWood);
      cask.position.y = 1.4 * size;
      cask.castShadow = false;
      barrel.add(cask);
      [0.36, 1.4, 2.44].forEach((y) => {
        const band = new THREE.Mesh(new THREE.TorusGeometry(1.1 * size, 0.09 * size, 10, 28), iron);
        band.position.y = y * size;
        band.rotation.x = Math.PI / 2;
        barrel.add(band);
      });
      barrel.position.set(x, deckY, z);
      scene.add(barrel);
    };
    [
      [-17, -31, 1.15, 0.12], [-10, -34, 0.9, -0.18], [15, -21, 1.05, 0.24],
      [19, 22, 1.2, -0.15], [-18, 39, 1, 0.32], [12, 71, 1.16, -0.2],
      [-14, 76, 0.86, 0.18], [20, 55, 0.82, -0.1], [-41, 112, 1.08, 0.2],
      [39, 96, 0.96, -0.24], [-37, -84, 1.12, 0.15], [34, -102, 0.9, -0.18],
    ].forEach(([x, z, size, rotation]) => addCargoCrate(x, z, size, rotation));
    [
      [-21, -16, 1], [-16, -12, 0.88], [20, -2, 1.05], [-21, 14, 1.08],
      [16, 34, 0.92], [-18, 61, 1.02], [21, 82, 0.94], [-42, 126, 1.06],
      [43, 118, 0.9], [-38, -65, 1.02], [40, -91, 0.95],
    ].forEach(([x, z, size]) => addCargoBarrel(x, z, size));
    [-78, -5, 48, 116].forEach((z, ropeIndex) => {
      const ropeCoil = new THREE.Mesh(
        new THREE.TorusGeometry(2.05 + (ropeIndex % 2) * 0.35, 0.18, 12, 48),
        new THREE.MeshStandardMaterial({ color: 0xb18a55, roughness: 1 }),
      );
      ropeCoil.position.set(ropeIndex % 2 ? -5 : 6, centralDeckTop + 0.1, z);
      ropeCoil.rotation.x = Math.PI / 2;
      scene.add(ropeCoil);
    });

    const interiorStart = 0.2;
    const interiorEnd = 0.8;
    const roofStart = 0.205;
    const roofEnd = 0.795;
    const cabinHeight = 8.4;
    const leftWall = new THREE.Mesh(makeCourseWallSegmentGeometry(THREE, course, interiorStart, interiorEnd, 14.35, cabinHeight, -0.75, 560), innerWood);
    const rightWall = new THREE.Mesh(makeCourseWallSegmentGeometry(THREE, course, interiorStart, interiorEnd, -14.35, cabinHeight, -0.75, 560), innerWood);
    const roof = new THREE.Mesh(makeCourseSegmentGeometry(THREE, course, roofStart, roofEnd, 14.55, -14.55, cabinHeight, undefined, 680), darkCeiling);
    const outerLeftWall = new THREE.Mesh(makeCourseWallSegmentGeometry(THREE, course, roofStart, roofEnd, 14.65, cabinHeight + 0.45, -1.35, 560), hullWood);
    const outerRightWall = new THREE.Mesh(makeCourseWallSegmentGeometry(THREE, course, roofStart, roofEnd, -14.65, cabinHeight + 0.45, -1.35, 560), hullWood);
    leftWall.receiveShadow = true;
    rightWall.receiveShadow = true;
    roof.castShadow = true;
    roof.receiveShadow = true;
    outerLeftWall.castShadow = true;
    outerRightWall.castShadow = true;
    scene.add(leftWall, rightWall, roof, outerLeftWall, outerRightWall);

    const beamInstances = new THREE.InstancedMesh(new THREE.BoxGeometry(0.48, 0.55, 28.5), hullWood, 44);
    const beamDummy = new THREE.Object3D();
    for (let index = 0; index < 44; index += 1) {
      const u = roofStart + (index / 43) * (roofEnd - roofStart);
      const point = course.pointAt(u);
      beamDummy.position.set(point.x, point.y + cabinHeight - 0.32, point.z);
      beamDummy.rotation.set(0, point.heading, 0);
      beamDummy.scale.set(1, 1, 1);
      beamDummy.updateMatrix();
      beamInstances.setMatrixAt(index, beamDummy.matrix);
      if (index % 4 === 1) {
        const side = index % 8 < 4 ? 1 : -1;
        const lampPoint = course.pointAt(u, side * 11.7);
        const lampGroup = new THREE.Group();
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.78, 0.42), brass);
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 12), new THREE.MeshBasicMaterial({ color: 0xffc15e }));
        frame.castShadow = false;
        glow.castShadow = false;
        lampGroup.add(frame, glow);
        lampGroup.position.set(lampPoint.x, lampPoint.y + 3.9, lampPoint.z);
        scene.add(lampGroup);
        const lantern = new THREE.PointLight(0xff9f3d, 11, 24, 1.75);
        lantern.position.copy(lampGroup.position);
        scene.add(lantern);
      }
    }
    beamInstances.instanceMatrix.needsUpdate = true;
    beamInstances.castShadow = true;
    scene.add(beamInstances);

    const skullMat = new THREE.MeshStandardMaterial({ color: 0xd8c7a3, roughness: 0.78 });
    const addShipPortal = (u: number) => {
      const portalPose = course.pointAt(u);
      const portal = new THREE.Group();
      const portalBeam = new THREE.Mesh(new THREE.BoxGeometry(29.2, 1.35, 1.8), outerWood);
      portalBeam.position.y = cabinHeight - 0.15;
      portalBeam.castShadow = true;
      portal.add(portalBeam);
      [-1, 1].forEach((side) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(1.55, cabinHeight + 0.3, 1.8), outerWood);
        post.position.set(side * 13.55, cabinHeight * 0.48, 0);
        post.castShadow = true;
        portal.add(post);
      });
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.9, 24, 18), skullMat);
      skull.scale.set(0.82, 1, 0.72);
      skull.position.set(0, cabinHeight + 0.82, 0.2);
      portal.add(skull);
      [-1, 1].forEach((side) => {
        const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.2, 12), skullMat);
        bone.position.set(0, cabinHeight + 0.32, 0.25);
        bone.rotation.z = side * 0.82;
        portal.add(bone);
      });
      portal.position.set(portalPose.x, portalPose.y, portalPose.z);
      portal.rotation.y = portalPose.heading;
      scene.add(portal);
    };
    addShipPortal(interiorStart);
    addShipPortal(interiorEnd);

    [0.29, 0.38, 0.54, 0.63, 0.74, 0.81].forEach((u, chestIndex) => {
      const side = chestIndex % 2 === 0 ? 1 : -1;
      const point = course.pointAt(u, side * 15.8);
      const chest = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.25, 1.85), outerWood);
      base.position.y = 0.72;
      base.castShadow = false;
      chest.add(base);
      const band = new THREE.Mesh(new THREE.BoxGeometry(2.78, 0.22, 1.92), brass);
      band.position.y = 1.12;
      chest.add(band);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(2.72, 0.3, 1.82), outerWood);
      lid.position.set(0, 1.78, 0.54);
      lid.rotation.x = -0.82;
      chest.add(lid);
      for (let coinIndex = 0; coinIndex < 24; coinIndex += 1) {
        const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.075, 14), gold);
        const overflow = coinIndex >= 17;
        coin.position.set(
          overflow ? -side * (1.35 + (coinIndex - 17) * 0.28) : ((coinIndex * 37) % 19) / 19 * 2.6 - 1.3,
          overflow ? 0.12 + (coinIndex % 2) * 0.05 : 1.25 + (coinIndex % 5) * 0.105,
          overflow ? ((coinIndex * 0.71) % 1) * 2.3 - 1.15 : ((coinIndex * 23) % 17) / 17 * 2.25 - 0.72,
        );
        coin.rotation.set(coinIndex * 0.31, coinIndex * 0.47, coinIndex * 0.19);
        chest.add(coin);
      }
      chest.position.set(point.x, point.y, point.z);
      chest.rotation.y = point.heading;
      scene.add(chest);
    });

    const sailCanvas = new THREE.MeshStandardMaterial({ color: 0xd9c7a1, emissive: 0x3b2411, emissiveIntensity: 0.08, roughness: 0.94, side: THREE.DoubleSide });
    const riggingMaterial = new THREE.LineBasicMaterial({ color: 0x24140c, transparent: true, opacity: 0.92 });
    const addRigging = (from: Three.Vector3, to: Three.Vector3) => {
      const rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, to]), riggingMaterial);
      scene.add(rope);
    };
    [
      { z: 108, height: 68, width: 42 },
      { z: 20, height: 76, width: 48 },
      { z: -72, height: 62, width: 38 },
    ].forEach(({ z, height, width }, mastIndex) => {
      const baseY = centralDeckTop;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 1.28, height, 28), outerWood);
      mast.position.set(0, baseY + height / 2, z);
      mast.castShadow = true;
      scene.add(mast);
      [0.57, 0.79].forEach((heightAmount, yardIndex) => {
        const yardY = baseY + height * heightAmount;
        const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, width + yardIndex * 4, 18), hullWood);
        yard.position.set(0, yardY, z);
        yard.rotation.z = Math.PI / 2;
        yard.castShadow = true;
        scene.add(yard);
        if (yardIndex === 0) {
          const sail = new THREE.Mesh(new THREE.PlaneGeometry(width - 2, 16, 12, 8), sailCanvas);
          sail.position.set(0, yardY - 8.5, z + 0.34);
          sail.rotation.x = -0.035;
          sail.castShadow = true;
          scene.add(sail);
        }
      });
      const pennant = new THREE.Mesh(
        new THREE.PlaneGeometry(8.5, 2.8),
        new THREE.MeshStandardMaterial({ color: mastIndex ? 0x8f1717 : 0x18191c, roughness: 0.84, side: THREE.DoubleSide }),
      );
      pennant.position.set(4.2, baseY + height - 1.2, z);
      scene.add(pennant);
      const mastTop = new THREE.Vector3(0, baseY + height - 0.5, z);
      const riggingAnchorY = centralDeckTop + 10.5;
      addRigging(mastTop, new THREE.Vector3(-90, riggingAnchorY, z + 46));
      addRigging(mastTop, new THREE.Vector3(90, riggingAnchorY, z + 46));
      addRigging(mastTop, new THREE.Vector3(-90, riggingAnchorY, z - 46));
      addRigging(mastTop, new THREE.Vector3(90, riggingAnchorY, z - 46));
    });
    addRigging(new THREE.Vector3(0, centralDeckTop + 67.5, 108), new THREE.Vector3(0, centralDeckTop + 75.5, 20));
    addRigging(new THREE.Vector3(0, centralDeckTop + 75.5, 20), new THREE.Vector3(0, centralDeckTop + 61.5, -72));

    // Captain's cabin and quarterdeck silhouette make the ship readable at a glance.
    const cabin = new THREE.Group();
    const cabinBody = new THREE.Mesh(new THREE.BoxGeometry(58, 12, 28), outerWood);
    cabinBody.position.y = 6;
    cabinBody.castShadow = true;
    cabin.add(cabinBody);
    const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(64, 1.5, 33), darkCeiling);
    cabinRoof.position.y = 12.65;
    cabinRoof.castShadow = true;
    cabin.add(cabinRoof);
    const cabinDoor = new THREE.Mesh(new THREE.BoxGeometry(4.2, 7.3, 0.42), hullWood);
    cabinDoor.position.set(0, 3.75, -14.22);
    cabin.add(cabinDoor);
    const cabinWindowMaterial = new THREE.MeshStandardMaterial({ color: 0xffbd54, emissive: 0xff7a12, emissiveIntensity: 1.35, roughness: 0.2, metalness: 0.16 });
    [-22, -14, -7, 7, 14, 22].forEach((x) => {
      const window = new THREE.Mesh(new THREE.BoxGeometry(3.7, 3.15, 0.5), cabinWindowMaterial);
      window.position.set(x, 6.4, -14.3);
      window.castShadow = false;
      cabin.add(window);
      const windowCross = new THREE.Mesh(new THREE.BoxGeometry(0.24, 3.25, 0.58), brass);
      windowCross.position.copy(window.position);
      windowCross.position.z -= 0.05;
      windowCross.castShadow = false;
      cabin.add(windowCross);
    });
    const cabinSkull = new THREE.Mesh(new THREE.SphereGeometry(1.15, 24, 18), skullMat);
    cabinSkull.scale.set(0.82, 1, 0.7);
    cabinSkull.position.set(0, 10.7, -14.7);
    cabin.add(cabinSkull);
    cabin.position.set(0, centralDeckTop, 242);
    scene.add(cabin);

    const helm = new THREE.Group();
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.25, 14, 36), outerWood);
    wheel.position.y = 3.25;
    helm.add(wheel);
    for (let spokeIndex = 0; spokeIndex < 8; spokeIndex += 1) {
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 4.7, 10), brass);
      spoke.position.y = 3.25;
      spoke.rotation.z = (spokeIndex / 8) * Math.PI;
      helm.add(spoke);
    }
    const helmStand = new THREE.Mesh(new THREE.BoxGeometry(0.9, 3.5, 1.4), iron);
    helmStand.position.y = 1.5;
    helm.add(helmStand);
    helm.position.set(42, centralDeckTop + 0.04, 221);
    scene.add(helm);

    [[-64, 240, 1.15], [62, 237, 1.02], [-66, -166, 1.08], [64, -164, 0.95]].forEach(([x, z, size]) => addCargoBarrel(x, z, size, centralDeckTop));
    [[-52, 246, 1.08, 0.12], [51, 248, 1.18, -0.16], [-56, -169, 0.98, 0.22], [54, -166, 1.08, -0.18]].forEach(
      ([x, z, size, rotation]) => addCargoCrate(x, z, size, rotation, centralDeckTop),
    );
    [-88, 88].forEach((x) => {
      const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.84, 3, 18), iron);
      bollard.position.set(x, 14.25, 224);
      scene.add(bollard);
    });
    const anchorRing = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.38, 18, 48), iron);
    anchorRing.position.set(0, 16, 254);
    anchorRing.rotation.x = Math.PI / 2;
    scene.add(anchorRing);

    const gullMaterial = new THREE.MeshStandardMaterial({ color: 0xf7fbff, emissive: 0xb9dded, emissiveIntensity: 0.12, roughness: 0.78 });
    const gullBeak = new THREE.MeshStandardMaterial({ color: 0xf1a22c, roughness: 0.7 });
    const seagulls: Three.Group[] = [];
    for (let index = 0; index < 16; index += 1) {
      const gull = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.62, 5, 12), gullMaterial);
      body.rotation.x = Math.PI / 2;
      body.castShadow = false;
      gull.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10), gullMaterial);
      head.position.z = 0.48;
      gull.add(head);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.28, 10), gullBeak);
      beak.position.z = 0.72;
      beak.rotation.x = Math.PI / 2;
      gull.add(beak);
      [-1, 1].forEach((side) => {
        const pivot = new THREE.Group();
        pivot.name = side < 0 ? "wing-left" : "wing-right";
        pivot.position.x = side * 0.12;
        const wing = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.055, 0.36), gullMaterial);
        wing.position.x = side * 0.66;
        pivot.add(wing);
        gull.add(pivot);
      });
      gull.scale.setScalar(1.35 + (index % 4) * 0.17);
      gull.userData.phase = index * 0.83;
      gull.userData.radiusX = 104 + (index % 5) * 24;
      gull.userData.radiusZ = 138 + (index % 4) * 34;
      gull.userData.height = 36 + (index % 6) * 6.2;
      gull.userData.speed = 0.000075 + (index % 4) * 0.000012;
      scene.add(gull);
      seagulls.push(gull);
    }
    scene.userData.seagulls = seagulls;
  }

  const hemisphere = new THREE.HemisphereLight(starlight ? 0xd9f2ff : jungle || river ? 0xcdecc6 : pirate ? 0xb9dfff : 0xd9f2ff, starlight ? 0x657b55 : jungle || river ? 0x294528 : pirate ? 0x201009 : 0x657b55, starlight ? 2.15 : pirate ? 1.35 : 2.15);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xfff2d2, starlight ? 3.25 : pirate ? 2.45 : 3.25);
  sun.position.set(-86, 135, 58);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = pirate ? -235 : -145;
  sun.shadow.camera.right = pirate ? 235 : 145;
  sun.shadow.camera.top = pirate ? 225 : 125;
  sun.shadow.camera.bottom = pirate ? -225 : -125;
  sun.shadow.camera.far = pirate ? 520 : 340;
  sun.shadow.bias = -0.00018;
  scene.add(sun);
  if (
    starlight
    && starlightRoadMaterial
    && starlightRoadMesh
    && starlightLaneMaterial
    && starlightCurbMaterials
    && starlightStarField
    && starlightStarMaterial
    && starlightMoon
    && starlightMoonMaterial
    && starlightSunDisc
    && starlightSunDiscMaterial
    && starlightCrystalGroup
  ) {
    scene.userData.starlightCycle = {
      groundMaterial,
      concrete,
      roadMesh: starlightRoadMesh,
      roadMaterial: starlightRoadMaterial,
      prismMaterials: starlightPrismMaterials,
      deckMaterial,
      laneMaterial: starlightLaneMaterial,
      curbMaterials: starlightCurbMaterials,
      starField: starlightStarField,
      starMaterial: starlightStarMaterial,
      moon: starlightMoon,
      moonMaterial: starlightMoonMaterial,
      sunDisc: starlightSunDisc,
      sunDiscMaterial: starlightSunDiscMaterial,
      crystalGroup: starlightCrystalGroup,
      crystalMaterials: starlightCrystalMaterials,
      hemisphere,
      sun,
    };
  }
  return sun;
}

function CourseCreatorWorld({
  parts,
  selectedPart,
  connectAt,
  editMode,
  placementValid,
  focusPartIndex,
  hazards,
  selectedHazardId,
  onConnectAtChange,
  onPlace,
}: {
  parts: CoursePartType[];
  selectedPart: CoursePartType;
  connectAt: "front" | "back";
  editMode: "road" | "hazards";
  placementValid: boolean;
  focusPartIndex: number | null;
  hazards: CreatorHazardPlacement[];
  selectedHazardId: string | null;
  onConnectAtChange: (side: "front" | "back") => void;
  onPlace: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const cameraStateRef = useRef<{ target: [number, number, number]; yaw: number; pitch: number; distance: number } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let renderer: Three.WebGLRenderer | null = null;
    let scene: Three.Scene | null = null;
    let observer: ResizeObserver | null = null;
    let animationFrame = 0;
    let rememberCameraState: (() => void) | null = null;

    void (async () => {
      const THREE = await import("three");
      if (disposed) return;
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x86cfe9);
      scene.fog = new THREE.Fog(0x86cfe9, 220, 620);
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1200);
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.shadowMap.enabled = false;
      renderer.domElement.setAttribute("aria-label", "接続点と仮置き道路を直接操作できる3Dコース編集画面");
      host.replaceChildren(renderer.domElement);

      const openPath = buildCreatorOpenPath(parts);
      const partPaths = buildCreatorPartPaths(parts);
      const ghostPath = buildCreatorGhostPath(parts, selectedPart, connectAt);
      const worldPoint = ([x, y, z]: [number, number, number]) => new THREE.Vector3(x * 0.72, y, z * 0.72);
      const makeOpenStripGeometry = (
        sourcePoints: Array<[number, number, number]>,
        halfWidth: number,
        yOffset: number,
      ) => {
        const curve = new THREE.CatmullRomCurve3(sourcePoints.map(worldPoint), false, "centripetal");
        const segments = Math.max(20, sourcePoints.length * 5);
        const vertices: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        const normal = new THREE.Vector3();
        for (let index = 0; index <= segments; index += 1) {
          const amount = index / segments;
          const point = curve.getPointAt(amount);
          const tangent = curve.getTangentAt(amount).normalize();
          normal.set(tangent.z, 0, -tangent.x).normalize();
          [-1, 1].forEach((side) => {
            vertices.push(
              point.x + normal.x * halfWidth * side,
              point.y + yOffset,
              point.z + normal.z * halfWidth * side,
            );
            uvs.push(side < 0 ? 0 : 1, amount * 8);
          });
          if (index < segments) {
            const base = index * 2;
            indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
          }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        return geometry;
      };
      const offsetOpenPath = (
        sourcePoints: Array<[number, number, number]>,
        lane: number,
      ): Array<[number, number, number]> => {
        const sourceLane = lane / 0.72;
        return sourcePoints.map((point, index) => {
          const previous = sourcePoints[Math.max(0, index - 1)];
          const next = sourcePoints[Math.min(sourcePoints.length - 1, index + 1)];
          const dx = next[0] - previous[0];
          const dz = next[2] - previous[2];
          const length = Math.max(0.0001, Math.hypot(dx, dz));
          return [
            point[0] + dz / length * sourceLane,
            point[1],
            point[2] - dx / length * sourceLane,
          ];
        });
      };

      const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x3e484b, roughness: 0.82, metalness: 0.05 });
      const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0xe7efe9, roughness: 0.72 });
      const railMaterial = new THREE.MeshStandardMaterial({ color: 0x273a43, roughness: 0.34, metalness: 0.72 });
      const road = new THREE.Mesh(makeOpenStripGeometry(openPath.points, COURSE_WIDTH, 0.08), roadMaterial);
      const underside = new THREE.Mesh(makeOpenStripGeometry(openPath.points, COURSE_WIDTH + 0.8, -0.55), edgeMaterial);
      scene.add(underside, road);
      const focusedPartPath = focusPartIndex === null ? null : partPaths[focusPartIndex] ?? null;
      const focusedPartMaterial = focusedPartPath
        ? new THREE.MeshStandardMaterial({
          color: 0xffe06d,
          emissive: 0xffb72e,
          emissiveIntensity: 1.45,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          roughness: 0.2,
        })
        : null;
      const focusedPartRoad = focusedPartPath && focusedPartMaterial
        ? new THREE.Mesh(makeOpenStripGeometry(focusedPartPath, COURSE_WIDTH + 0.14, 0.24), focusedPartMaterial)
        : null;
      if (focusedPartRoad) scene.add(focusedPartRoad);

      const openCurve = new THREE.CatmullRomCurve3(openPath.points.map(worldPoint), false, "centripetal");
      const railSegments = Math.max(40, Math.min(180, openPath.points.length * 4));
      const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.18, 0.13), railMaterial, railSegments * 2);
      const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), railMaterial, Math.ceil(railSegments / 4) * 2);
      const dummy = new THREE.Object3D();
      const railAxis = new THREE.Vector3(1, 0, 0);
      const direction = new THREE.Vector3();
      const lateral = new THREE.Vector3();
      let railIndex = 0;
      let postIndex = 0;
      [-BARRIER_LANE, BARRIER_LANE].forEach((lane) => {
        for (let index = 0; index < railSegments; index += 1) {
          const amount = index / railSegments;
          const nextAmount = (index + 1) / railSegments;
          const center = openCurve.getPointAt(amount);
          const nextCenter = openCurve.getPointAt(nextAmount);
          const tangent = openCurve.getTangentAt(amount).normalize();
          lateral.set(tangent.z, 0, -tangent.x).normalize().multiplyScalar(lane);
          const point = center.clone().add(lateral);
          const nextTangent = openCurve.getTangentAt(nextAmount).normalize();
          const nextPoint = nextCenter.clone().add(new THREE.Vector3(nextTangent.z, 0, -nextTangent.x).normalize().multiplyScalar(lane));
          direction.copy(nextPoint).sub(point);
          dummy.position.set(point.x, point.y + 0.78, point.z);
          dummy.quaternion.setFromUnitVectors(railAxis, direction.clone().normalize());
          dummy.scale.set(direction.length(), 1, 1);
          dummy.updateMatrix();
          rails.setMatrixAt(railIndex, dummy.matrix);
          railIndex += 1;
          if (index % 4 === 0) {
            dummy.position.set(point.x, point.y + 0.37, point.z);
            dummy.quaternion.identity();
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            posts.setMatrixAt(postIndex, dummy.matrix);
            postIndex += 1;
          }
        }
      });
      rails.count = railIndex;
      posts.count = postIndex;
      rails.instanceMatrix.needsUpdate = true;
      posts.instanceMatrix.needsUpdate = true;
      scene.add(rails, posts);

      const ghostMaterial = new THREE.MeshStandardMaterial({
        color: placementValid ? 0x5ffff0 : 0xff5f68,
        emissive: placementValid ? 0x126e77 : 0x76151b,
        emissiveIntensity: 1.1,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        roughness: 0.28,
        metalness: 0.12,
      });
      const ghostRoad = new THREE.Mesh(makeOpenStripGeometry(ghostPath.points, COURSE_WIDTH, 0.16), ghostMaterial);
      ghostRoad.userData.creatorTarget = "ghost";
      ghostRoad.visible = editMode === "road";
      scene.add(ghostRoad);

      const hazardMarkers: Three.Group[] = [];
      hazards.filter((hazard) => hazard.enabled).forEach((hazard) => {
        const path = partPaths[hazard.partIndex];
        if (!path?.length) return;
        const centerIndex = Math.floor(path.length / 2);
        const centerPoint = worldPoint(path[centerIndex]);
        const previousPoint = worldPoint(path[Math.max(0, centerIndex - 1)]);
        const nextPoint = worldPoint(path[Math.min(path.length - 1, centerIndex + 1)]);
        const tangent = nextPoint.clone().sub(previousPoint).setY(0).normalize();
        const normal = new THREE.Vector3(tangent.z, 0, -tangent.x);
        centerPoint.addScaledVector(normal, hazard.lane);
        const definition = CREATOR_HAZARDS.find((entry) => entry.id === hazard.type) ?? CREATOR_HAZARDS[0];
        const marker = new THREE.Group();
        marker.userData.hazardId = hazard.id;
        marker.userData.selected = hazard.id === selectedHazardId;
        if (hazard.type === "river") {
          const waterPath = offsetOpenPath(path, hazard.lane);
          const foam = new THREE.Mesh(
            makeOpenStripGeometry(waterPath, hazard.width / 2 + 0.18, 0.3),
            new THREE.MeshBasicMaterial({
              color: 0xb9f2f8,
              transparent: true,
              opacity: 0.18,
              depthWrite: false,
              side: THREE.DoubleSide,
            }),
          );
          foam.renderOrder = 3;
          marker.add(foam);
          const waterMaterial = new THREE.MeshPhysicalMaterial({
            color: 0x46c9e2,
            emissive: 0x073748,
            emissiveIntensity: hazard.id === selectedHazardId ? 0.28 : 0.14,
            transparent: true,
            opacity: 0.54,
            roughness: 0.08,
            metalness: 0.02,
            transmission: 0.34,
            clearcoat: 0.88,
            clearcoatRoughness: 0.12,
            depthWrite: false,
            side: THREE.DoubleSide,
          });
          const water = new THREE.Mesh(
            makeOpenStripGeometry(waterPath, hazard.width / 2, 0.34),
            waterMaterial,
          );
          water.renderOrder = 4;
          marker.add(water);
          const flowMaterials: Three.MeshBasicMaterial[] = [];
          [-0.28, 0, 0.28].forEach((laneRatio, flowIndex) => {
            const flowMaterial = new THREE.MeshBasicMaterial({
              color: 0xc9f4f7,
              transparent: true,
              opacity: 0.22,
              depthWrite: false,
              side: THREE.DoubleSide,
            });
            const flowPath = offsetOpenPath(path, hazard.lane + hazard.width * laneRatio);
            const flow = new THREE.Mesh(
              makeOpenStripGeometry(flowPath, 0.08 + flowIndex * 0.025, 0.4),
              flowMaterial,
            );
            flow.renderOrder = 5;
            marker.add(flow);
            flowMaterials.push(flowMaterial);
          });
          marker.userData.waterMaterial = waterMaterial;
          marker.userData.flowMaterials = flowMaterials;
        } else if (hazard.type === "cloud-beam") {
          const beam = new THREE.Mesh(
            new THREE.CylinderGeometry(Math.max(1.2, hazard.width * 0.25), Math.max(1.8, hazard.width * 0.4), 32, 20, 1, true),
            new THREE.MeshBasicMaterial({ color: 0x78efff, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false }),
          );
          beam.position.y = 16;
          marker.add(beam);
        } else if (hazard.type === "shooting-star") {
          const star = new THREE.Mesh(
            new THREE.OctahedronGeometry(1.35, 1),
            new THREE.MeshStandardMaterial({ color: 0xffe477, emissive: 0xffb423, emissiveIntensity: 1.7, roughness: 0.22 }),
          );
          star.position.y = 3.2;
          star.rotation.z = Math.PI / 4;
          marker.add(star);
          const trail = new THREE.Mesh(
            new THREE.ConeGeometry(0.72, 4.2, 12),
            new THREE.MeshBasicMaterial({ color: 0x86ddff, transparent: true, opacity: 0.48, blending: THREE.AdditiveBlending, depthWrite: false }),
          );
          trail.position.set(1.7, 5.1, 0);
          trail.rotation.z = -Math.PI / 3;
          marker.add(trail);
        } else if (hazard.type === "cannon") {
          const iron = new THREE.MeshStandardMaterial({ color: 0x22292e, emissive: 0x35120a, emissiveIntensity: 0.45, roughness: 0.3, metalness: 0.82 });
          const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.92, 4.5, 20), iron);
          barrel.rotation.z = Math.PI / 2;
          barrel.position.y = 1.15;
          marker.add(barrel);
          const ball = new THREE.Mesh(new THREE.SphereGeometry(0.92, 20, 14), iron);
          ball.position.set(2.9, 1.15, 0);
          marker.add(ball);
        } else {
          const fur = new THREE.MeshStandardMaterial({ color: 0x87522f, emissive: 0x2b1005, emissiveIntensity: 0.35, roughness: 0.82 });
          const body = new THREE.Mesh(new THREE.SphereGeometry(0.78, 18, 14), fur);
          body.scale.set(0.82, 1.16, 0.78);
          body.position.y = 1.1;
          marker.add(body);
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 14), fur);
          head.position.y = 2.05;
          marker.add(head);
          [-1, 1].forEach((side) => {
            const ear = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), fur);
            ear.position.set(side * 0.54, 2.16, 0);
            marker.add(ear);
          });
        }
        if (hazard.type !== "river") {
          marker.position.copy(centerPoint);
          marker.rotation.y = Math.atan2(tangent.x, tangent.z);
        }
        marker.userData.baseScale = 0.92 + hazard.intensity * 0.08;
        marker.scale.setScalar(marker.userData.baseScale);
        marker.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.castShadow = false;
          const material = object.material as Three.MeshStandardMaterial;
          if (hazard.type !== "river" && hazard.id === selectedHazardId && "emissive" in material && material.emissive) {
            material.emissive.set(definition.color);
            material.emissiveIntensity = 1.6;
          }
        });
        scene.add(marker);
        hazardMarkers.push(marker);
      });

      const ringGeometry = new THREE.TorusGeometry(2.35, 0.22, 12, 40);
      const inactiveRingMaterial = new THREE.MeshBasicMaterial({ color: 0x9dc7cf, transparent: true, opacity: 0.72 });
      const activeRingMaterial = new THREE.MeshBasicMaterial({ color: 0xffdc63 });
      const frontMarker = new THREE.Mesh(ringGeometry, connectAt === "front" ? activeRingMaterial : inactiveRingMaterial);
      const backMarker = new THREE.Mesh(ringGeometry, connectAt === "back" ? activeRingMaterial : inactiveRingMaterial);
      const frontPoint = worldPoint(openPath.points[0]);
      const backPoint = worldPoint(openPath.points[openPath.points.length - 1]);
      frontMarker.position.copy(frontPoint).add(new THREE.Vector3(0, 0.35, 0));
      backMarker.position.copy(backPoint).add(new THREE.Vector3(0, 0.35, 0));
      frontMarker.rotation.x = Math.PI / 2;
      backMarker.rotation.x = Math.PI / 2;
      frontMarker.userData.creatorTarget = "front";
      backMarker.userData.creatorTarget = "back";
      frontMarker.visible = editMode === "road";
      backMarker.visible = editMode === "road";
      scene.add(frontMarker, backMarker);

      const activeGhostPoint = worldPoint(connectAt === "back"
        ? ghostPath.points[ghostPath.points.length - 1]
        : ghostPath.points[0]);
      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(1.15, 3, 14),
        new THREE.MeshBasicMaterial({ color: placementValid ? 0xffdc63 : 0xff5f68 }),
      );
      arrow.position.copy(activeGhostPoint).add(new THREE.Vector3(0, 2.5, 0));
      arrow.rotation.x = Math.PI;
      arrow.visible = editMode === "road";
      scene.add(arrow);

      const previewPoints = [...openPath.points, ...ghostPath.points];
      const bounds = previewPoints.reduce((acc, point) => ({
        minX: Math.min(acc.minX, point[0]),
        maxX: Math.max(acc.maxX, point[0]),
        minY: Math.min(acc.minY, point[1]),
        maxY: Math.max(acc.maxY, point[1]),
        minZ: Math.min(acc.minZ, point[2]),
        maxZ: Math.max(acc.maxZ, point[2]),
      }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity });
      const center = new THREE.Vector3(
        (bounds.minX + bounds.maxX) * 0.36,
        (bounds.minY + bounds.maxY) / 2,
        (bounds.minZ + bounds.maxZ) * 0.36,
      );
      const radius = Math.max(70, (bounds.maxX - bounds.minX) * 0.72, (bounds.maxZ - bounds.minZ) * 0.72);
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(radius * 3.3, radius * 3.3),
        new THREE.MeshStandardMaterial({ color: 0x4d8157, roughness: 1 }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = bounds.minY - 1;
      scene.add(ground);
      const grid = new THREE.GridHelper(radius * 2.7, 36, 0x86d7c9, 0x5a987d);
      grid.position.y = bounds.minY - 0.95;
      scene.add(grid);

      scene.add(new THREE.HemisphereLight(0xdff7ff, 0x48624d, 2.1));
      const sun = new THREE.DirectionalLight(0xfff0c7, 3);
      sun.position.set(-80, 130, 70);
      scene.add(sun);

      const focusedWorldPoint = focusedPartPath
        ? worldPoint(focusedPartPath[Math.floor(focusedPartPath.length / 2)])
        : activeGhostPoint.clone();
      const previousCameraState = cameraStateRef.current;
      const cameraTarget = previousCameraState
        ? new THREE.Vector3(...previousCameraState.target)
        : focusedWorldPoint.clone();
      const focusStartTarget = cameraTarget.clone();
      const focusEndTarget = focusedWorldPoint.clone();
      const focusStartedAt = performance.now();
      let focusInterrupted = false;
      let cameraYaw = previousCameraState?.yaw ?? (connectAt === "back" ? Math.PI * 0.78 : -Math.PI * 0.22);
      let cameraPitch = previousCameraState?.pitch ?? 0.58;
      let cameraDistance = previousCameraState?.distance ?? clamp(radius * 0.42, 34, 88);
      const focusStartDistance = cameraDistance;
      const focusEndDistance = focusedPartPath ? clamp(cameraDistance, 30, 48) : cameraDistance;
      const positionCamera = () => {
        const horizontal = Math.cos(cameraPitch) * cameraDistance;
        camera.position.set(
          cameraTarget.x + Math.sin(cameraYaw) * horizontal,
          cameraTarget.y + Math.sin(cameraPitch) * cameraDistance,
          cameraTarget.z + Math.cos(cameraYaw) * horizontal,
        );
        camera.lookAt(cameraTarget.x, cameraTarget.y + 1, cameraTarget.z);
      };
      const panCamera = (movementX: number, movementY: number) => {
        const scale = cameraDistance * 0.0023;
        const screenRight = new THREE.Vector3(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));
        const screenForward = new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
        cameraTarget.addScaledVector(screenRight, -movementX * scale);
        cameraTarget.addScaledVector(screenForward, movementY * scale);
        focusInterrupted = true;
      };
      rememberCameraState = () => {
        cameraStateRef.current = {
          target: [cameraTarget.x, cameraTarget.y, cameraTarget.z],
          yaw: cameraYaw,
          pitch: cameraPitch,
          distance: cameraDistance,
        };
      };

      let pointerTravel = 0;
      const activePointers = new Map<number, { x: number; y: number; mode: "orbit" | "pan" }>();
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const targets = editMode === "road" ? [frontMarker, backMarker, ghostRoad] : [];
      const raycastTarget = (event: PointerEvent) => {
        if (!renderer) return null;
        const bounds = renderer.domElement.getBoundingClientRect();
        pointer.set(
          ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
          -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
        );
        raycaster.setFromCamera(pointer, camera);
        return raycaster.intersectObjects(targets, false)[0]?.object ?? null;
      };
      const onPointerDown = (event: PointerEvent) => {
        event.preventDefault();
        activePointers.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
          mode: event.button === 2 || event.shiftKey ? "pan" : "orbit",
        });
        pointerTravel = activePointers.size > 1 ? 100 : 0;
        renderer?.domElement.setPointerCapture(event.pointerId);
      };
      const onPointerMove = (event: PointerEvent) => {
        if (!renderer) return;
        const activePointer = activePointers.get(event.pointerId);
        if (activePointer) {
          if (activePointers.size >= 2) {
            const before = Array.from(activePointers.values());
            const previousCenterX = before.reduce((sum, entry) => sum + entry.x, 0) / before.length;
            const previousCenterY = before.reduce((sum, entry) => sum + entry.y, 0) / before.length;
            const previousDistance = Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y);
            activePointer.x = event.clientX;
            activePointer.y = event.clientY;
            const after = Array.from(activePointers.values());
            const nextCenterX = after.reduce((sum, entry) => sum + entry.x, 0) / after.length;
            const nextCenterY = after.reduce((sum, entry) => sum + entry.y, 0) / after.length;
            const nextDistance = Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y);
            panCamera(nextCenterX - previousCenterX, nextCenterY - previousCenterY);
            cameraDistance = clamp(cameraDistance - (nextDistance - previousDistance) * 0.24, 22, 120);
            pointerTravel = 100;
            return;
          }
          const movementX = event.clientX - activePointer.x;
          const movementY = event.clientY - activePointer.y;
          pointerTravel += Math.abs(movementX) + Math.abs(movementY);
          if (pointerTravel > 3) {
            if (activePointer.mode === "pan") {
              panCamera(movementX, movementY);
            } else {
              cameraYaw -= movementX * 0.006;
              cameraPitch = clamp(cameraPitch + movementY * 0.0045, 0.18, 1.2);
              focusInterrupted = true;
            }
          }
          activePointer.x = event.clientX;
          activePointer.y = event.clientY;
        } else {
          renderer.domElement.style.cursor = raycastTarget(event) ? "pointer" : "grab";
        }
      };
      const onPointerUp = (event: PointerEvent) => {
        const activePointer = activePointers.get(event.pointerId);
        if (!activePointer) return;
        const canClick = activePointers.size === 1 && pointerTravel <= 8 && activePointer.mode === "orbit";
        if (canClick) {
          const target = raycastTarget(event)?.userData.creatorTarget;
          if (target === "front" || target === "back") onConnectAtChange(target);
          if (target === "ghost" && placementValid) onPlace();
        }
        activePointers.delete(event.pointerId);
        if (renderer?.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
        pointerTravel = activePointers.size ? 100 : 0;
      };
      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        cameraDistance = clamp(cameraDistance + event.deltaY * 0.035, 22, 120);
        focusInterrupted = true;
      };
      const onContextMenu = (event: MouseEvent) => event.preventDefault();
      renderer.domElement.style.touchAction = "none";
      renderer.domElement.addEventListener("pointerdown", onPointerDown);
      renderer.domElement.addEventListener("pointermove", onPointerMove);
      renderer.domElement.addEventListener("pointerup", onPointerUp);
      renderer.domElement.addEventListener("pointercancel", onPointerUp);
      renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
      renderer.domElement.addEventListener("contextmenu", onContextMenu);

      const render = (now: number) => {
        if (!renderer || !scene || disposed) return;
        if (!focusInterrupted) {
          const focusAmount = clamp((now - focusStartedAt) / 520, 0, 1);
          const easedFocus = focusAmount * focusAmount * (3 - 2 * focusAmount);
          cameraTarget.lerpVectors(focusStartTarget, focusEndTarget, easedFocus);
          cameraDistance = focusStartDistance + (focusEndDistance - focusStartDistance) * easedFocus;
        }
        const pulse = 1 + Math.sin(now * 0.006) * 0.13;
        frontMarker.scale.setScalar(connectAt === "front" ? pulse : 1);
        backMarker.scale.setScalar(connectAt === "back" ? pulse : 1);
        ghostMaterial.opacity = 0.42 + (Math.sin(now * 0.005) + 1) * 0.08;
        if (focusedPartMaterial) {
          focusedPartMaterial.opacity = 0.58 + (Math.sin(now * 0.009) + 1) * 0.16;
          focusedPartMaterial.emissiveIntensity = 1.25 + (Math.sin(now * 0.009) + 1) * 0.55;
        }
        hazardMarkers.forEach((marker, index) => {
          const baseScale = marker.userData.baseScale as number;
          const selectedPulse = marker.userData.selected ? 1 + Math.sin(now * 0.009) * 0.12 : 1;
          marker.scale.setScalar(baseScale * selectedPulse);
          if (marker.children.length && marker.userData.selected) marker.rotation.y += Math.sin(now * 0.004 + index) * 0.0008;
          const waterMaterial = marker.userData.waterMaterial as Three.MeshPhysicalMaterial | undefined;
          if (waterMaterial) {
            waterMaterial.emissiveIntensity = 0.12 + Math.sin(now * 0.0045 + index) * 0.035;
            waterMaterial.opacity = 0.5 + Math.sin(now * 0.0033 + index) * 0.045;
          }
          const flowMaterials = marker.userData.flowMaterials as Three.MeshBasicMaterial[] | undefined;
          flowMaterials?.forEach((material, flowIndex) => {
            material.opacity = 0.12 + Math.abs(Math.sin(now * 0.0065 - flowIndex * 0.9 + index)) * 0.24;
          });
        });
        let pad: Gamepad | null = null;
        try {
          pad = Array.from(navigator.getGamepads?.() ?? []).find((entry) => entry?.connected) ?? null;
        } catch {
          pad = null;
        }
        const orbitX = Math.abs(pad?.axes[2] ?? 0) > 0.16 ? pad?.axes[2] ?? 0 : 0;
        const orbitY = Math.abs(pad?.axes[3] ?? 0) > 0.16 ? pad?.axes[3] ?? 0 : 0;
        const panModifier = (pad?.buttons[7]?.value ?? 0) > 0.4;
        if (panModifier) {
          if (orbitX || orbitY) panCamera(orbitX * 7, orbitY * 7);
        } else {
          cameraYaw -= orbitX * 0.025;
          cameraPitch = clamp(cameraPitch + orbitY * 0.018, 0.18, 1.2);
          if (orbitX || orbitY) focusInterrupted = true;
        }
        positionCamera();
        renderer.render(scene, camera);
        animationFrame = requestAnimationFrame(render);
      };
      const resize = () => {
        if (!renderer) return;
        const width = Math.max(1, host.clientWidth);
        const height = Math.max(1, host.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();
      positionCamera();
      animationFrame = requestAnimationFrame(render);
    })();

    return () => {
      rememberCameraState?.();
      disposed = true;
      observer?.disconnect();
      cancelAnimationFrame(animationFrame);
      if (scene) {
        scene.traverse((object) => {
          if (!(object instanceof Object) || !("geometry" in object)) return;
          const mesh = object as Three.Mesh;
          mesh.geometry?.dispose();
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach((material) => material?.dispose());
        });
      }
      renderer?.dispose();
      host.replaceChildren();
    };
  }, [connectAt, editMode, focusPartIndex, hazards, onConnectAtChange, onPlace, parts, placementValid, selectedHazardId, selectedPart]);

  const selected = COURSE_PARTS.find((part) => part.id === selectedPart) ?? COURSE_PARTS[0];
  return (
    <div className="creator-world-shell">
      <div className="creator-webgl-host" ref={hostRef} />
      {editMode === "road" ? (
        <div className={`creator-placement-hint ${placementValid ? "" : "invalid"}`}>
          <b>{selected.icon} {selected.label}</b>
          <span>半透明の道路をクリックして設置 · 接続リングで前後を変更</span>
        </div>
      ) : (
        <div className="creator-placement-hint hazard">
          <b>HAZARD EDIT</b>
          <span>道路区間を選択し、種類・位置・間隔・速度・強度を設定</span>
        </div>
      )}
      <div className="creator-camera-hint">DRAG：回転　SHIFT / 右DRAG：視点移動　2本指：移動＋拡大縮小　R2＋右STICK：移動</div>
    </div>
  );
}

function CreatorMiniMap({ parts, connectAt }: { parts: CoursePartType[]; connectAt: "front" | "back" }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const points = buildCreatorOpenPath(parts).points;
    const xs = points.map((point) => point[0]);
    const zs = points.map((point) => point[2]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxZ - minZ);
    const scale = Math.min(204 / width, 132 / height);
    const mapPoint = (point: [number, number, number]) => ({
      x: 120 + (point[0] - (minX + maxX) / 2) * scale,
      y: 78 + (point[2] - (minZ + maxZ) / 2) * scale,
    });
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#071d28";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#72e9df";
    context.lineWidth = 5;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    points.forEach((point, index) => {
      const mapped = mapPoint(point);
      if (index === 0) context.moveTo(mapped.x, mapped.y);
      else context.lineTo(mapped.x, mapped.y);
    });
    context.stroke();
    const start = mapPoint(points[0]);
    const end = mapPoint(points[points.length - 1]);
    [[start, "front"], [end, "back"]].forEach(([rawPoint, side]) => {
      const point = rawPoint as { x: number; y: number };
      context.beginPath();
      context.arc(point.x, point.y, side === connectAt ? 7 : 4, 0, TAU);
      context.fillStyle = side === connectAt ? "#ffdc63" : "#b7cfd4";
      context.fill();
    });
  }, [connectAt, parts]);
  return <canvas className="creator-mini-map" ref={canvasRef} width="240" height="156" aria-label="作成中コースの全体図" />;
}

function RaceWorld({
  phase,
  runId,
  courseDefinition,
  selectedCharacterIndex,
  gojoChallenge,
  gojoField,
  itemsEnabled,
  skillsEnabled,
  creatorParts,
  creatorHazards,
  onTelemetry,
  onFinish,
  onItemChange,
  onShieldChange,
  onSkillChange,
}: {
  phase: GamePhase;
  runId: number;
  courseDefinition: CourseDefinition;
  selectedCharacterIndex: number;
  gojoChallenge: boolean;
  gojoField: boolean;
  itemsEnabled: boolean;
  skillsEnabled: boolean;
  creatorParts: CoursePartType[];
  creatorHazards: CreatorHazardPlacement[];
  onTelemetry: (speed: number, progress: number, position: number, driftGauge: number, driftDashing: boolean) => void;
  onFinish: (time: number, position: number, order: number[]) => void;
  onItemChange: (item: ItemType) => void;
  onShieldChange: (active: boolean) => void;
  onSkillChange: (remainingMs: number, totalMs: number, active: boolean) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef(phase);
  const keys = useRef<Record<string, boolean>>({});
  const touch = useRef({ left: false, right: false, gas: false, brake: false, item: false, skill: false, drift: false });
  const mobileAutoDrive = useRef(false);
  const activeTouchPointers = useRef(new Map<number, {
    side: "left" | "right";
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    startedAt: number;
    drift: boolean;
    didSwipe: boolean;
  }>());
  const lastTouchTapAt = useRef({ left: 0, right: 0 });
  const touchActionTimers = useRef({ item: 0, skill: 0 });
  const [webglError, setWebglError] = useState(false);
  const [gamepadConnected, setGamepadConnected] = useState(false);

  useEffect(() => {
    phaseRef.current = phase;
    if (phase !== "racing") {
      activeTouchPointers.current.clear();
      touch.current.left = false;
      touch.current.right = false;
      touch.current.drift = false;
      touch.current.item = false;
      touch.current.skill = false;
    }
  }, [phase]);

  useEffect(() => {
    const coarsePointer = window.matchMedia("(hover: none) and (pointer: coarse)");
    const syncMobileMode = () => {
      mobileAutoDrive.current =
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (coarsePointer.matches && navigator.maxTouchPoints > 0 && Math.min(window.innerWidth, window.innerHeight) <= 1000);
    };
    syncMobileMode();
    coarsePointer.addEventListener?.("change", syncMobileMode);
    window.addEventListener("resize", syncMobileMode);
    return () => {
      coarsePointer.removeEventListener?.("change", syncMobileMode);
      window.removeEventListener("resize", syncMobileMode);
      window.clearTimeout(touchActionTimers.current.item);
      window.clearTimeout(touchActionTimers.current.skill);
    };
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", "e", "q", "shift", " "].includes(event.key.toLowerCase())) event.preventDefault();
      keys.current[event.key.toLowerCase()] = true;
    };
    const up = (event: KeyboardEvent) => { keys.current[event.key.toLowerCase()] = false; };
    const clearControls = () => {
      keys.current = {};
      (Object.keys(touch.current) as Array<keyof typeof touch.current>).forEach((key) => { touch.current[key] = false; });
      activeTouchPointers.current.clear();
    };
    const visibilityChanged = () => { if (document.hidden) clearControls(); };
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clearControls);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clearControls);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, []);

  useEffect(() => {
    const syncGamepad = () => setGamepadConnected(readGamepadInput().connected);
    window.addEventListener("gamepadconnected", syncGamepad);
    window.addEventListener("gamepaddisconnected", syncGamepad);
    syncGamepad();
    return () => {
      window.removeEventListener("gamepadconnected", syncGamepad);
      window.removeEventListener("gamepaddisconnected", syncGamepad);
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let disposeThree: (() => void) | undefined;

    void import("three").then((THREE) => {
      if (disposed) return;
      let renderer: Three.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      } catch {
        setWebglError(true);
        return;
      }

      const mobileRenderTarget =
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (navigator.maxTouchPoints > 1 && Math.min(window.innerWidth, window.innerHeight) <= 900);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobileRenderTarget ? 1 : 1.25));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.06;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.setAttribute("aria-label", `${courseDefinition.name}を走る自機後方視点の3Dカートレース`);
      renderer.domElement.setAttribute("role", "img");
      host.prepend(renderer.domElement);

      const scene = new THREE.Scene();
      const course = createRaceCourse(THREE, courseDefinition);
      const totalLaps = lapCountForCourse(courseDefinition.id);
      const sun = addWorld(THREE, scene, course, courseDefinition);
      const oceanTime = scene.userData.oceanTime as { value: number } | undefined;
      const seagulls = (scene.userData.seagulls ?? []) as Three.Group[];
      const starlightCycle = scene.userData.starlightCycle as {
        groundMaterial: Three.MeshStandardMaterial;
        concrete: Three.MeshStandardMaterial;
        roadMesh: Three.Mesh;
        roadMaterial: Three.MeshStandardMaterial;
        prismMaterials: Three.MeshStandardMaterial[];
        deckMaterial: Three.MeshStandardMaterial;
        laneMaterial: Three.MeshStandardMaterial;
        curbMaterials: Three.MeshStandardMaterial[];
        starField: Three.Points;
        starMaterial: Three.PointsMaterial;
        moon: Three.Mesh;
        moonMaterial: Three.MeshStandardMaterial;
        sunDisc: Three.Mesh;
        sunDiscMaterial: Three.MeshBasicMaterial;
        crystalGroup: Three.Group;
        crystalMaterials: Three.MeshStandardMaterial[];
        hemisphere: Three.HemisphereLight;
        sun: Three.DirectionalLight;
      } | undefined;
      const starlightColors = starlightCycle ? {
        daySky: new THREE.Color(0x78c9ed),
        sunsetSky: new THREE.Color(0xf28a62),
        nightSky: new THREE.Color(0x03061d),
        dayFog: new THREE.Color(0xa9ddf2),
        sunsetFog: new THREE.Color(0xf4aa78),
        nightFog: new THREE.Color(0x090c2d),
        dayGround: new THREE.Color(0x78c9ed),
        sunsetGround: new THREE.Color(0xd97a58),
        nightGround: new THREE.Color(0x07091d),
        dayRoad: new THREE.Color(0x41464b),
        sunsetRoad: new THREE.Color(0x765143),
        nightRoad: new THREE.Color(0x171b43),
        dayConcrete: new THREE.Color(0xbfc7ca),
        sunsetConcrete: new THREE.Color(0xd99a79),
        nightConcrete: new THREE.Color(0x171b43),
        dayDeck: new THREE.Color(0x50565d),
        sunsetDeck: new THREE.Color(0x704539),
        nightDeck: new THREE.Color(0x151735),
        dayHemiSky: new THREE.Color(0xd9f2ff),
        sunsetHemiSky: new THREE.Color(0xffbd8c),
        nightHemiSky: new THREE.Color(0x8aaaff),
        dayHemiGround: new THREE.Color(0x657b55),
        sunsetHemiGround: new THREE.Color(0x6f3025),
        nightHemiGround: new THREE.Color(0x090b22),
        daySun: new THREE.Color(0xfff2d2),
        sunsetSun: new THREE.Color(0xff8b52),
        nightSun: new THREE.Color(0x91b7ff),
        dayCurbA: new THREE.Color(0xf7f1e7),
        sunsetCurbA: new THREE.Color(0xffd3b0),
        nightCurbA: new THREE.Color(0xcff7ff),
        dayCurbB: new THREE.Color(0xc83f3f),
        sunsetCurbB: new THREE.Color(0xe86142),
        nightCurbB: new THREE.Color(0x8b57d8),
        sunsetRoadGlow: new THREE.Color(0xff6a28),
        nightRoadGlow: new THREE.Color(0x263b91),
      } : undefined;
      const mixStarlightColor = (
        target: Three.Color,
        day: Three.Color,
        sunset: Three.Color,
        night: Three.Color,
        dayToSunset: number,
        sunsetToNight: number,
      ) => target.copy(day).lerp(sunset, dayToSunset).lerp(night, sunsetToNight);
      const smoothTimeTransition = (seconds: number, startSeconds: number, endSeconds: number) => {
        const amount = clamp((seconds - startSeconds) / (endSeconds - startSeconds), 0, 1);
        return amount * amount * (3 - 2 * amount);
      };
      const miniMapCanvas = host.querySelector<HTMLCanvasElement>(".mini-map-canvas");
      const miniMapContext = miniMapCanvas?.getContext("2d") ?? null;
      const miniMapSamples = Array.from({ length: 180 }, (_, index) => course.pointAt(index / 180));
      const miniMapBounds = miniMapSamples.reduce((bounds, point) => ({
        minX: Math.min(bounds.minX, point.x), maxX: Math.max(bounds.maxX, point.x),
        minZ: Math.min(bounds.minZ, point.z), maxZ: Math.max(bounds.maxZ, point.z),
      }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
      const camera = new THREE.PerspectiveCamera(57, 16 / 9, 0.1, 620);

      const selectedCharacter = CHARACTERS[selectedCharacterIndex] ?? CHARACTERS[0];
      const rivalCharacters = gojoChallenge
        ? [GOJO_CHARACTER]
        : [
            ...CHARACTERS.filter((_, index) => index !== selectedCharacterIndex),
            ...(gojoField ? [GOJO_CHARACTER] : []),
          ];
      const actorCharacters = [selectedCharacter, ...rivalCharacters];
      const actorCount = actorCharacters.length;
      const actorIds = Array.from({ length: actorCount }, (_, actorId) => actorId);
      const gridSlots = [
        { progress: gojoChallenge ? -0.031 : -0.012, lane: -1.9 },
        { progress: -0.026, lane: 1.4 },
        { progress: -0.041, lane: -0.3 },
        { progress: -0.052, lane: 3.1 },
      ];
      const player = createKart(THREE, selectedCharacter.color, selectedCharacter.accent, true, selectedCharacter.animal);
      const start = course.pointAt(PLAYER_START_PROGRESS);
      const getKartRoadSupport = (progress: number, lane: number) => {
        const front = course.pointAt(progress + KART_FRONT_AXLE_OFFSET / course.length, lane);
        const rear = course.pointAt(progress - KART_REAR_AXLE_OFFSET / course.length, lane);
        const horizontalAxleDistance = Math.max(0.001, Math.hypot(front.x - rear.x, front.z - rear.z));
        const axleSpan = KART_FRONT_AXLE_OFFSET + KART_REAR_AXLE_OFFSET;
        return {
          pitch: -Math.atan2(front.y - rear.y, horizontalAxleDistance),
          centerY: THREE.MathUtils.lerp(rear.y, front.y, KART_REAR_AXLE_OFFSET / axleSpan),
        };
      };
      const startSupport = getKartRoadSupport(PLAYER_START_PROGRESS, 0);
      const playerVisualRoot = player.userData.visualRoot as Three.Group;
      player.position.set(start.x, start.y + KART_RIDE_HEIGHT, start.z);
      player.rotation.y = start.heading;
      playerVisualRoot.rotation.x = startSupport.pitch;
      scene.add(player);
      const turboFlames = new THREE.Group();
      const turboOuterMaterial = new THREE.MeshBasicMaterial({
        color: 0x249dff,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const turboInnerMaterial = new THREE.MeshBasicMaterial({
        color: 0xc9f7ff,
        transparent: true,
        opacity: 0.94,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      [-0.76, 0.76].forEach((x) => {
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.42, 16, 1, true), turboOuterMaterial);
        flame.position.set(x, 0.43, -2.58);
        flame.rotation.x = -Math.PI / 2;
        flame.castShadow = false;
        turboFlames.add(flame);
        const core = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.92, 12, 1, true), turboInnerMaterial);
        core.position.set(x, 0.43, -2.48);
        core.rotation.x = -Math.PI / 2;
        core.castShadow = false;
        turboFlames.add(core);
      });
      turboFlames.visible = false;
      playerVisualRoot.add(turboFlames);

      const rivalStates = rivalCharacters.map((character, index) => ({
        name: character.name,
        badge: character.badge,
        color: character.color,
        accent: character.accent,
        progress: gridSlots[index].progress,
        pace: character.name === "Gojo" ? 35 : 34,
        lane: gridSlots[index].lane,
        character,
        motionState: "grounded" as KartMotionState,
        item: "EMPTY" as ItemType,
        shield: false,
        crashStart: 0,
        crashUntil: 0,
        boostUntil: 0,
        auroraUntil: 0,
        drifting: false,
        driftCharge: 0,
        driftBoost: 0,
        driftSide: 0,
        airborne: false,
        airY: course.pointAt(gridSlots[index].progress, gridSlots[index].lane).y,
        airSpeed: 0,
        verticalVelocity: 0,
        surfaceVerticalVelocity: 0,
        airborneSince: 0,
        jumpCooldownUntil: 0,
        landingImpactUntil: 0,
        cloudFallUntil: 0,
        useAt: 0,
        skillReadyAt: 0,
        skillInitialDelay: character.name === "Gojo" ? 3600 : 4200 + index * 1900,
        skillScheduled: false,
        gojoLastCometAt: 0,
        shortcutActive: false,
        shortcutProgress: 0,
        shortcutDuration: 1,
        shortcutStartProgress: 0,
        shortcutTargetProgress: 0,
        shortcutFromX: 0,
        shortcutFromY: 0,
        shortcutFromZ: 0,
        shortcutToX: 0,
        shortcutToY: 0,
        shortcutToZ: 0,
        shortcutX: 0,
        shortcutZ: 0,
        shortcutHeading: 0,
        shortcutKeys: new Set<string>(),
      }));
      const rivalMeshes = rivalStates.map((rival, index) => {
        const mesh = createKart(THREE, rival.color, rival.accent, false, rival.character.animal);
        scene.add(mesh);
        return mesh;
      });

      const pickupMaterial = new THREE.MeshPhysicalMaterial({ color: 0x45d6f1, emissive: 0x128eb8, emissiveIntensity: 0.72, roughness: 0.12, metalness: 0.25, transmission: 0.23, transparent: true, opacity: 0.9 });
      const pickupInnerMaterial = new THREE.MeshStandardMaterial({ color: 0xffd45c, emissive: 0xf1a91d, emissiveIntensity: 0.9, roughness: 0.24, metalness: 0.42 });
      const itemRowLanes = gojoChallenge ? [-3, 3] : gojoField ? [-7, -3.5, 0, 3.5, 7] : ITEM_ROW_LANES;
      const pickupPoints = itemsEnabled ? ITEM_ROW_PROGRESS.flatMap((u, rowIndex) => itemRowLanes.map((lane, laneIndex) => {
        const p = course.pointAt(u, lane);
        const group = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.25, 1.25, 4, 4, 4), pickupMaterial);
        box.rotation.set(0.18, Math.PI / 4, 0.15);
        box.castShadow = false;
        group.add(box);
        const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 1), pickupInnerMaterial);
        core.castShadow = false;
        group.add(core);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.83, 0.055, 12, 36), pickupInnerMaterial);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
        group.position.set(p.x, p.y + 1.35, p.z);
        scene.add(group);
        return { group, x: p.x, y: p.y, z: p.z, baseY: p.y + 1.35, active: true, respawnAt: 0, rowIndex, laneIndex };
      })) : [];

      const racerMeshes = [player, ...rivalMeshes];
      const racerVisualRoots = racerMeshes.map((mesh) => mesh.userData.visualRoot as Three.Group);
      const shieldBubbles = racerMeshes.map((mesh) => {
        const material = new THREE.MeshPhysicalMaterial({ color: 0x65dcff, emissive: 0x299fcb, emissiveIntensity: 0.5, transparent: true, opacity: 0.21, roughness: 0.05, metalness: 0.04, side: THREE.BackSide, depthWrite: false });
        const bubble = new THREE.Mesh(new THREE.SphereGeometry(2.45, 40, 28), material);
        bubble.position.y = 1.15;
        bubble.renderOrder = 3;
        bubble.visible = false;
        mesh.add(bubble);
        return bubble;
      });
      const auroraAuras = racerMeshes.map((mesh) => {
        const material = new THREE.MeshStandardMaterial({ color: 0xffef72, emissive: 0xffc928, emissiveIntensity: 1.8, transparent: true, opacity: 0.34, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
        const aura = new THREE.Mesh(new THREE.SphereGeometry(2.55, 36, 24), material);
        aura.position.y = 1.1;
        aura.renderOrder = 4;
        aura.visible = false;
        mesh.add(aura);
        return aura;
      });

      const novaWaveMaterial = new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0, wireframe: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const novaWave = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), novaWaveMaterial);
      const novaRingMaterials = [0xfff3a6, 0xffa52f, 0xff4e3a].map((color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      const novaRings = novaRingMaterials.map((material, index) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35 + index * 0.42, 0.11 - index * 0.02, 16, 72), material);
        ring.rotation.x = Math.PI / 2 + index * 0.18;
        return ring;
      });
      const novaParticlePositions: number[] = [];
      for (let i = 0; i < 110; i += 1) {
        const angle = i * 2.39996;
        const radius = 0.7 + (i % 11) * 0.055;
        novaParticlePositions.push(Math.cos(angle) * radius, ((i % 9) - 4) * 0.12, Math.sin(angle) * radius);
      }
      const novaParticleGeometry = new THREE.BufferGeometry();
      novaParticleGeometry.setAttribute("position", new THREE.Float32BufferAttribute(novaParticlePositions, 3));
      const novaParticleMaterial = new THREE.PointsMaterial({ color: 0xffed8b, size: 0.22, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const novaParticles = new THREE.Points(novaParticleGeometry, novaParticleMaterial);
      const novaEffect = new THREE.Group();
      novaEffect.add(novaWave, novaParticles, ...novaRings);
      novaEffect.visible = false;
      scene.add(novaEffect);

      const novaHitBursts = racerMeshes.map((mesh, actorId) => {
        const material = new THREE.MeshBasicMaterial({ color: actorId === 0 ? 0xfff4aa : 0xff643d, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const burst = new THREE.Mesh(new THREE.IcosahedronGeometry(1.35, 2), material);
        burst.position.y = 1.1;
        burst.visible = false;
        mesh.add(burst);
        return { burst, material };
      });

      const projectileMaterial = new THREE.MeshStandardMaterial({ color: 0xff6b16, emissive: 0xff3100, emissiveIntensity: 2.2, roughness: 0.3 });
      const projectileCoreMaterial = new THREE.MeshStandardMaterial({ color: 0xfff3ae, emissive: 0xffc23c, emissiveIntensity: 2.5, roughness: 0.2 });
      const homingMaterial = new THREE.MeshPhysicalMaterial({ color: 0xe9564f, emissive: 0xa71918, emissiveIntensity: 0.8, roughness: 0.22, metalness: 0.58, clearcoat: 0.8 });
      const pixelMaterial = new THREE.MeshPhysicalMaterial({ color: 0x58f4ff, emissive: 0xe9368d, emissiveIntensity: 1.6, roughness: 0.18, metalness: 0.46, clearcoat: 0.92 });
      const spikeMaterial = new THREE.MeshStandardMaterial({ color: 0x5d6267, roughness: 0.28, metalness: 0.88 });
      const trapBaseMaterial = new THREE.MeshStandardMaterial({ color: 0x262d31, roughness: 0.54, metalness: 0.5 });

      type ProjectileState = {
        kind: "FIRE" | "HOMING" | "PIXEL";
        owner: number;
        target: number | null;
        remainingTargets: number[];
        group: Three.Group;
        progress: number;
        lane: number;
        directionX: number;
        directionZ: number;
        surfaceU: number;
        surfaceY: number;
        nextSurfaceSampleAt: number;
        age: number;
        active: boolean;
      };
      type TrapState = { owner: number; group: Three.Group; x: number; y: number; z: number; armedAt: number; expiresAt: number; active: boolean };
      type MonkeyState = { group: Three.Group; progress: number; lane: number; direction: number; wanderPhase: number; nextTrapAt: number; actionUntil: number };
      type ShootingStarState = { group: Three.Group; warning: Three.Mesh; progress: number; lane: number; y: number; fallSpeed: number; active: boolean };
      type SkillMeteorState = { group: Three.Group; warning: Three.Mesh; progress: number; lane: number; y: number; fallSpeed: number; owner: number; blue: boolean; active: boolean };
      type ShockWaveState = { group: Three.Group; material: Three.MeshBasicMaterial; startedAt: number; active: boolean };
      type CometStormState = { owner: number; until: number; nextSpawnAt: number };
      type ShatterState = { group: Three.Group; startedAt: number; active: boolean };
      type FlowLogState = { group: Three.Group; progress: number; lane: number; phase: number; channelIndex: number };
      type StaticObstacleState = { group: Three.Group; progress: number; lane: number };
      type CannonState = { group: Three.Group; ball: Three.Group; progress: number; phase: number; lane: number; side: number };
      type CustomHazardState = {
        config: CreatorHazardPlacement;
        start: number;
        end: number;
        center: number;
        group: Three.Group;
        effect: Three.Group | null;
        nextAt: number;
      };
      type WaterFlowParticle = { channelIndex: number; progress: number; laneOffset: number; speed: number; phase: number; pose: CoursePose };
      const projectiles: ProjectileState[] = [];
      const traps: TrapState[] = [];
      const shootingStars: ShootingStarState[] = [];
      const skillMeteors: SkillMeteorState[] = [];
      const shockWaves: ShockWaveState[] = [];
      const cometStorms: CometStormState[] = [];
      const shatters: ShatterState[] = [];
      const projectilePools: Record<ProjectileState["kind"], ProjectileState[]> = { FIRE: [], HOMING: [], PIXEL: [] };
      const trapPool: TrapState[] = [];
      const shootingStarPool: ShootingStarState[] = [];
      const skillMeteorPool: SkillMeteorState[] = [];
      const shockWavePool: ShockWaveState[] = [];
      const shatterPool: ShatterState[] = [];
      type PooledVisualState = { group: Three.Group; active: boolean; warning?: Three.Mesh };
      const releaseInactiveVisuals = <T extends PooledVisualState>(
        items: T[],
        selectPool: (item: T) => T[],
      ) => {
        for (let index = items.length - 1; index >= 0; index -= 1) {
          const item = items[index];
          if (item.active) continue;
          scene.remove(item.group);
          if (item.warning) scene.remove(item.warning);
          items.splice(index, 1);
          selectPool(item).push(item);
        }
      };
      const auroraContactTimes = new Map<string, number>();
      const monkeyContactCooldowns = new Map<string, number>();
      const obstacleContactCooldowns = new Map<string, number>();
      const rivalBodyContacts = new Set<number>();
      const pendingRivalShortcuts = new Map<number, {
        key: string;
        targetProgress: number;
      }>();
      const flowingLogs: FlowLogState[] = [];
      const beanstalks: StaticObstacleState[] = [];
      const cannons: CannonState[] = [];
      const customHazardStates: CustomHazardState[] = [];
      const cloudPatches = (scene.userData.cloudPatches ?? []) as Three.Group[];
      const cloudGapKeys = new Set<string>();
      const customRoadPatches = (scene.userData.customRoadPatches ?? []) as Three.Group[];
      const customRoadGapKeys = new Set<string>();
      const selectedCloudGapKeys = new Set<string>();
      let nextCloudGapChangeAt = 0;
      let cloudGapCycleStartedAt = 0;
      const waterUniforms = (scene.userData.waterUniforms ?? []) as Array<{ value: number }>;
      const waterFlow = scene.userData.waterFlow as { points: Three.Points; particles: WaterFlowParticle[] } | undefined;
      let lastWaterFlowUpdateAt = 0;

      const monkeys: MonkeyState[] = [];
      if (courseDefinition.id === "jungle") {
        const monkeyFur = new THREE.MeshStandardMaterial({ color: 0x81502f, roughness: 0.86 });
        const monkeyFace = new THREE.MeshStandardMaterial({ color: 0xe4b477, roughness: 0.82 });
        const monkeyDark = new THREE.MeshStandardMaterial({ color: 0x2d1a12, roughness: 0.72 });
        const monkeyStartLanes = [-5.4, 3.2, -1.6, 5.1];
        [0.17, 0.39, 0.63, 0.86].forEach((progress, index) => {
          const lane = monkeyStartLanes[index];
          const direction = index % 3 === 1 ? -1 : 1;
          const point = course.pointAt(progress, lane);
          const group = new THREE.Group();
          const body = new THREE.Mesh(new THREE.SphereGeometry(0.72, 28, 20), monkeyFur);
          body.scale.set(0.88, 1.18, 0.8);
          body.position.y = 1.05;
          group.add(body);
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 30, 22), monkeyFur);
          head.position.y = 2.04;
          group.add(head);
          const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.38, 24, 18), monkeyFace);
          muzzle.scale.set(1, 0.76, 0.6);
          muzzle.position.set(0, 1.9, -0.47);
          group.add(muzzle);
          [-1, 1].forEach((earSide) => {
            const ear = new THREE.Mesh(new THREE.SphereGeometry(0.23, 20, 14), monkeyFace);
            ear.position.set(earSide * 0.56, 2.18, -0.02);
            group.add(ear);
            const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.88, 6, 14), monkeyFur);
            arm.position.set(earSide * 0.72, 1.12, -0.03);
            arm.rotation.z = earSide * -0.55;
            arm.name = `arm-${earSide}`;
            group.add(arm);
          });
          const tail = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.11, 12, 34, Math.PI * 1.55), monkeyFur);
          tail.position.set(0.45, 1.06, 0.34);
          tail.rotation.set(Math.PI / 2, 0.35, 0.2);
          group.add(tail);
          [-1, 1].forEach((eyeSide) => {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), monkeyDark);
            eye.position.set(eyeSide * 0.18, 2.1, -0.56);
            group.add(eye);
          });
          group.position.set(point.x, point.y + 0.03, point.z);
          group.rotation.y = point.heading + (direction > 0 ? Math.PI : 0);
          group.scale.setScalar(1.12);
          group.traverse((object) => { if (object instanceof THREE.Mesh) object.castShadow = true; });
          scene.add(group);
          monkeys.push({ group, progress, lane, direction, wanderPhase: index * 1.73, nextTrapAt: 0, actionUntil: 0 });
        });
      }

      if (courseDefinition.id === "river") {
        const bark = new THREE.MeshStandardMaterial({ color: 0x6d3f22, roughness: 0.96 });
        const cut = new THREE.MeshStandardMaterial({ color: 0xc4965f, roughness: 0.9 });
        RIVER_CHANNELS.forEach((channel, index) => {
          const progress = channel.start + (channel.end - channel.start) * 0.35;
          const lane = channel.lane + (index % 2 ? 1 : -1) * Math.min(1.5, channel.halfWidth * 0.3);
          const point = course.pointAt(progress, lane);
          const group = new THREE.Group();
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.68, 5.4, 22), [cut, bark, cut]);
          trunk.rotation.z = Math.PI / 2;
          trunk.position.y = 0.55;
          trunk.castShadow = true;
          group.add(trunk);
          [-1.3, 1.1].forEach((offset, branchIndex) => {
            const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.24, 1.55, 14), bark);
            branch.position.set(offset, 0.95, 0);
            branch.rotation.z = branchIndex ? -0.8 : 0.8;
            group.add(branch);
          });
          group.position.set(point.x, point.y + 0.34, point.z);
          group.rotation.y = point.heading;
          scene.add(group);
          flowingLogs.push({ group, progress, lane, phase: index * 1.71, channelIndex: index });
        });
      }

      if (courseDefinition.id === "cloud") {
        const stalkMat = new THREE.MeshStandardMaterial({ color: 0x3c9b3f, roughness: 0.82 });
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x69c751, roughness: 0.86, side: THREE.DoubleSide });
        [0.18, 0.41, 0.68, 0.86].forEach((progress, index) => {
          const lane = [-4.8, 4.2, -1.8, 5.3][index];
          const point = course.pointAt(progress, lane);
          const group = new THREE.Group();
          const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 1.2, 18 + index * 2.4, 28), stalkMat);
          stalk.position.y = 8.5 + index * 1.2;
          stalk.castShadow = true;
          group.add(stalk);
          for (let leafIndex = 0; leafIndex < 7; leafIndex += 1) {
            const leaf = new THREE.Mesh(new THREE.SphereGeometry(1.8 + (leafIndex % 2) * 0.35, 20, 12), leafMat);
            const angle = leafIndex * 2.15;
            leaf.scale.set(1.8, 0.35, 0.8);
            leaf.position.set(Math.cos(angle) * 2.2, 3.6 + leafIndex * 2.1, Math.sin(angle) * 2.2);
            leaf.rotation.y = -angle;
            leaf.castShadow = false;
            group.add(leaf);
          }
          group.position.set(point.x, point.y, point.z);
          scene.add(group);
          beanstalks.push({ group, progress, lane });
        });
      }

      if (courseDefinition.id === "pirate") {
        const iron = new THREE.MeshStandardMaterial({ color: 0x252a2e, roughness: 0.3, metalness: 0.88 });
        const wood = new THREE.MeshStandardMaterial({ color: 0x6d4024, roughness: 0.9 });
        const ballMaterial = new THREE.MeshStandardMaterial({ color: 0x12171b, emissive: 0x2a0c02, emissiveIntensity: 0.4, roughness: 0.22, metalness: 0.78 });
        const smokeMaterial = new THREE.MeshBasicMaterial({ color: 0xc5bbb0, transparent: true, opacity: 0.5, depthWrite: false });
        [0.28, 0.49, 0.72].forEach((progress, index) => {
          const side = index % 2 === 0 ? 1 : -1;
          const point = course.pointAt(progress, side * 16.2);
          const group = new THREE.Group();
          const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 1.05, 5.8, 28), iron);
          barrel.rotation.z = Math.PI / 2;
          barrel.position.set(-side * 1.15, 1.65, 0);
          barrel.castShadow = true;
          group.add(barrel);
          const carriage = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.8, 2.7), wood);
          carriage.position.y = 0.55;
          carriage.castShadow = true;
          group.add(carriage);
          [-1, 1].forEach((side) => {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.35, 22), iron);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(side * 1.25, 0.45, 1.25);
            group.add(wheel);
          });
          group.position.set(point.x, point.y, point.z);
          group.rotation.y = point.heading;
          scene.add(group);
          const ball = new THREE.Group();
          const core = new THREE.Mesh(new THREE.SphereGeometry(1.18, 28, 20), ballMaterial);
          core.castShadow = false;
          ball.add(core);
          for (let smokeIndex = 0; smokeIndex < 3; smokeIndex += 1) {
            const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.42 + smokeIndex * 0.13, 14, 10), smokeMaterial);
            smoke.position.x = side * (1.35 + smokeIndex * 0.62);
            smoke.scale.y = 0.72;
            ball.add(smoke);
          }
          ball.visible = false;
          scene.add(ball);
          cannons.push({ group, ball, progress, phase: index * 0.29, lane: side * 14.2, side });
        });
      }

      if (courseDefinition.id === "custom" && creatorParts.length && creatorHazards.length) {
        creatorHazards.filter((hazard) => hazard.enabled).forEach((config) => {
          const range = creatorPartRange(creatorParts, config.partIndex);
          const group = new THREE.Group();
          let effect: Three.Group | null = null;
          if (config.type === "river") {
            const waterLeft = clamp(config.lane + config.width / 2, -COURSE_WIDTH + 0.2, COURSE_WIDTH - 0.2);
            const waterRight = clamp(config.lane - config.width / 2, -COURSE_WIDTH + 0.2, COURSE_WIDTH - 0.2);
            const foamMaterial = new THREE.MeshBasicMaterial({
              color: 0xb9f2f8,
              transparent: true,
              opacity: 0.18,
              depthWrite: false,
              side: THREE.DoubleSide,
            });
            const foam = new THREE.Mesh(
              makeCourseSegmentGeometry(
                THREE,
                course,
                range.start,
                range.end,
                clamp(waterLeft + 0.18, -COURSE_WIDTH + 0.08, COURSE_WIDTH - 0.08),
                clamp(waterRight - 0.18, -COURSE_WIDTH + 0.08, COURSE_WIDTH - 0.08),
                0.29,
                undefined,
                40,
              ),
              foamMaterial,
            );
            foam.renderOrder = 3;
            group.add(foam);
            const waterMaterial = new THREE.MeshPhysicalMaterial({
              color: 0x40c4dd,
              emissive: 0x073747,
              emissiveIntensity: 0.15,
              transparent: true,
              opacity: 0.56,
              roughness: 0.08,
              metalness: 0.02,
              transmission: 0.32,
              clearcoat: 0.9,
              clearcoatRoughness: 0.12,
              depthWrite: false,
              side: THREE.DoubleSide,
            });
            const water = new THREE.Mesh(
              makeCourseSegmentGeometry(THREE, course, range.start, range.end, waterLeft, waterRight, 0.34, undefined, 40),
              waterMaterial,
            );
            water.renderOrder = 4;
            group.add(water);
            const flowMaterials = Array.from({ length: 3 }, () => new THREE.MeshBasicMaterial({
              color: 0xc9f4f7,
              transparent: true,
              opacity: 0.22,
              depthWrite: false,
              side: THREE.DoubleSide,
            }));
            const riverLength = Math.max(0.0001, range.end - range.start);
            for (let flowIndex = 0; flowIndex < 9; flowIndex += 1) {
              const flowStart = range.start + riverLength * ((flowIndex + 0.12) / 9);
              const flowEnd = Math.min(range.end, flowStart + riverLength * 0.042);
              const laneCenter = clamp(
                config.lane + ((flowIndex % 3) - 1) * config.width * 0.22,
                waterRight + 0.16,
                waterLeft - 0.16,
              );
              const flow = new THREE.Mesh(
                makeCourseSegmentGeometry(THREE, course, flowStart, flowEnd, laneCenter + 0.13, laneCenter - 0.13, 0.41, undefined, 4),
                flowMaterials[flowIndex % flowMaterials.length],
              );
              flow.renderOrder = 5;
              group.add(flow);
            }
            group.userData.waterMaterial = waterMaterial;
            group.userData.foamMaterial = foamMaterial;
            group.userData.flowMaterials = flowMaterials;
          } else if (config.type === "cloud-beam") {
            const point = course.pointAt(range.center, config.lane);
            const beam = new THREE.Mesh(
              new THREE.CylinderGeometry(Math.max(1.1, config.width * 0.22), Math.max(1.8, config.width * 0.42), 80, 24, 1, true),
              new THREE.MeshBasicMaterial({ color: 0x70efff, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false }),
            );
            beam.position.y = 40;
            group.add(beam);
            const impact = new THREE.Mesh(
              new THREE.RingGeometry(0.6, Math.max(2, config.width * 0.52), 36),
              new THREE.MeshBasicMaterial({ color: 0xc8fbff, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
            );
            impact.rotation.x = -Math.PI / 2;
            impact.position.y = 0.18;
            group.add(impact);
            group.position.set(point.x, point.y, point.z);
          } else if (config.type === "monkey") {
            const point = course.pointAt(range.center, config.lane);
            const fur = new THREE.MeshStandardMaterial({ color: 0x82502e, roughness: 0.85 });
            const face = new THREE.MeshStandardMaterial({ color: 0xe0ad72, roughness: 0.8 });
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.72, 22, 16), fur);
            body.scale.set(0.86, 1.18, 0.82);
            body.position.y = 1.05;
            group.add(body);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 22, 16), fur);
            head.position.y = 2.02;
            group.add(head);
            const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.35, 18, 12), face);
            muzzle.position.set(0, 1.9, -0.46);
            group.add(muzzle);
            [-1, 1].forEach((side) => {
              const ear = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), face);
              ear.position.set(side * 0.55, 2.16, 0);
              group.add(ear);
            });
            group.position.set(point.x, point.y, point.z);
          } else if (config.type === "cannon") {
            const side = config.lane >= 0 ? 1 : -1;
            const point = course.pointAt(range.center, side * 14.5);
            const iron = new THREE.MeshStandardMaterial({ color: 0x20272c, roughness: 0.28, metalness: 0.86 });
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 1.02, 5.2, 24), iron);
            barrel.rotation.z = Math.PI / 2;
            barrel.position.y = 1.45;
            group.add(barrel);
            const carriage = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.75, 2.4), new THREE.MeshStandardMaterial({ color: 0x704226, roughness: 0.9 }));
            carriage.position.y = 0.5;
            group.add(carriage);
            group.position.set(point.x, point.y, point.z);
            group.rotation.y = point.heading;
            effect = new THREE.Group();
            effect.add(new THREE.Mesh(new THREE.SphereGeometry(1.15, 24, 18), iron));
            effect.visible = false;
            scene.add(effect);
          }
          if (group.children.length) scene.add(group);
          customHazardStates.push({ config, start: range.start, end: range.end, center: range.center, group, effect, nextAt: 0 });
        });
      }

      const updateCustomRoadBreakers = (now: number, active: boolean) => {
        customRoadGapKeys.clear();
        customRoadPatches.forEach((patch) => {
          patch.scale.setScalar(1);
          const material = patch.userData.surfaceMaterial as Three.MeshStandardMaterial;
          const warningSurface = patch.userData.warningSurface as Three.Mesh;
          const warningMaterial = patch.userData.warningMaterial as Three.MeshBasicMaterial;
          material.opacity = 1;
          material.emissiveIntensity = 0;
          warningSurface.visible = false;
          warningMaterial.opacity = 0;
        });
        const tileCount = Math.max(1, customRoadPatches.length / 2);
        customHazardStates.forEach((state, stateIndex) => {
          if (state.config.type !== "cloud-beam") return;
          const { config } = state;
          if (!active || !config.enabled) {
            state.group.visible = false;
            state.nextAt = 0;
            return;
          }
          if (!state.nextAt) state.nextAt = now;
          const warningMs = clamp(2700 / config.speed, 1250, 3600);
          const shrinkMs = clamp(720 / config.speed, 380, 1100);
          const missingMs = 1200 + config.intensity * 650;
          const restoreMs = 950;
          const actionMs = warningMs + shrinkMs + missingMs + restoreMs;
          const cycleMs = Math.max(actionMs + 650, config.interval * 1000);
          let age = now - state.nextAt;
          if (age >= cycleMs) {
            state.nextAt = now;
            age = 0;
          }
          const shrinking = age >= warningMs && age < warningMs + shrinkMs;
          const missing = age >= warningMs + shrinkMs && age < warningMs + shrinkMs + missingMs;
          const restoring = age >= warningMs + shrinkMs + missingMs && age < actionMs;
          const warning = age < warningMs;
          const beamVisible = age < warningMs + shrinkMs + 180;
          state.group.visible = beamVisible;
          const beam = state.group.children[0] as Three.Mesh | undefined;
          const impact = state.group.children[1] as Three.Mesh | undefined;
          if (beam) {
            const descent = clamp(age / warningMs, 0.015, 1);
            const beamLength = 1 - (1 - descent) ** 3;
            const pulse = 1 + Math.sin(now * 0.015 + stateIndex) * 0.14;
            beam.scale.set(pulse, beamLength, pulse);
            beam.position.y = 80 - beamLength * 40;
            const beamMaterial = beam.material as Three.MeshBasicMaterial;
            beamMaterial.opacity = shrinking ? 0.88 : 0.24 + Math.abs(Math.sin(now * 0.012)) * 0.34;
          }
          if (impact) {
            impact.visible = age > warningMs * 0.72 && beamVisible;
            const impactPulse = 0.82 + ((now * 0.002 + stateIndex * 0.31) % 1) * 1.2;
            impact.scale.setScalar(impactPulse);
            impact.rotation.z = now * 0.003;
          }

          const longitudinalRadius = config.width / Math.max(1, course.length);
          customRoadPatches.forEach((patch) => {
            const patchIndex = Number(patch.userData.index);
            const patchSide = Number(patch.userData.side);
            const patchCenter = (patchIndex + 0.5) / tileCount;
            const circularDistance = Math.abs((((patchCenter - state.center) + 0.5) % 1 + 1) % 1 - 0.5);
            const patchMinLane = patchSide > 0 ? 0 : -COURSE_WIDTH;
            const patchMaxLane = patchSide > 0 ? COURSE_WIDTH : 0;
            const effectMinLane = config.lane - config.width / 2;
            const effectMaxLane = config.lane + config.width / 2;
            const laneOverlaps = effectMaxLane >= patchMinLane && effectMinLane <= patchMaxLane;
            if (!laneOverlaps || circularDistance > longitudinalRadius / 2 + 0.5 / tileCount) return;

            const material = patch.userData.surfaceMaterial as Three.MeshStandardMaterial;
            const warningSurface = patch.userData.warningSurface as Three.Mesh;
            const warningMaterial = patch.userData.warningMaterial as Three.MeshBasicMaterial;
            let scale = 1;
            let opacity = 1;
            if (warning) {
              const warningAmount = clamp(age / warningMs, 0, 1);
              scale = 1 - warningAmount * 0.12 + Math.sin(now * 0.019) * 0.025;
              opacity = 0.62 + Math.sin(now * 0.021) * 0.2;
              material.emissiveIntensity = Math.max(material.emissiveIntensity, 0.8 + Math.sin(now * 0.02) * 0.28);
              warningSurface.visible = true;
              warningMaterial.opacity = 0.34 + Math.abs(Math.sin(now * 0.016)) * 0.5;
            } else if (shrinking) {
              const amount = clamp((age - warningMs) / shrinkMs, 0, 1);
              scale = 0.88 * (1 - amount) + 0.035;
              opacity = 0.9 * (1 - amount);
              material.emissiveIntensity = Math.max(material.emissiveIntensity, 0.72);
              warningSurface.visible = true;
              warningMaterial.opacity = Math.max(0, 0.72 * (1 - amount));
              if (amount > 0.68) customRoadGapKeys.add(`${patchIndex}:${patchSide}`);
            } else if (missing) {
              scale = 0.035;
              opacity = 0;
              customRoadGapKeys.add(`${patchIndex}:${patchSide}`);
            } else if (restoring) {
              const amount = clamp((age - warningMs - shrinkMs - missingMs) / restoreMs, 0, 1);
              scale = 0.035 + amount * 0.965;
              opacity = amount;
              material.emissiveIntensity = Math.max(material.emissiveIntensity, 0.42 * (1 - amount));
              if (amount < 0.3) customRoadGapKeys.add(`${patchIndex}:${patchSide}`);
            }
            const nextScale = Math.min(patch.scale.x, Math.max(0.035, scale));
            patch.scale.setScalar(nextScale);
            material.opacity = Math.min(material.opacity, clamp(opacity, 0, 1));
          });
        });
      };

      const exhaustCount = 72;
      const exhaustPositions = new Float32Array(exhaustCount * 3);
      const exhaustLife = new Float32Array(exhaustCount);
      const exhaustGeometry = new THREE.BufferGeometry();
      exhaustGeometry.setAttribute("position", new THREE.BufferAttribute(exhaustPositions, 3));
      const exhaust = new THREE.Points(exhaustGeometry, new THREE.PointsMaterial({ color: 0xbfeeff, size: 0.24, transparent: true, opacity: 0.56, depthWrite: false }));
      scene.add(exhaust);
      let exhaustCursor = 0;

      const driveSparkCount = 160;
      const driveSparkPositions = new Float32Array(driveSparkCount * 3);
      const driveSparkColors = new Float32Array(driveSparkCount * 3);
      const driveSparkVelocities = new Float32Array(driveSparkCount * 3);
      const driveSparkLife = new Float32Array(driveSparkCount);
      for (let index = 0; index < driveSparkCount; index += 1) driveSparkPositions[index * 3 + 1] = -1000;
      const driveSparkGeometry = new THREE.BufferGeometry();
      driveSparkGeometry.setAttribute("position", new THREE.BufferAttribute(driveSparkPositions, 3));
      driveSparkGeometry.setAttribute("color", new THREE.BufferAttribute(driveSparkColors, 3));
      const driveSparks = new THREE.Points(
        driveSparkGeometry,
        new THREE.PointsMaterial({
          size: 0.18,
          vertexColors: true,
          transparent: true,
          opacity: 0.96,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          sizeAttenuation: true,
        }),
      );
      driveSparks.frustumCulled = false;
      scene.add(driveSparks);
      let driveSparkCursor = 0;
      const emitDriveSpark = (
        x: number,
        y: number,
        z: number,
        heading: number,
        color: readonly [number, number, number],
        sideVelocity = 0,
        intensity = 1,
        verticalBias = 0,
      ) => {
        const index = driveSparkCursor;
        const base = index * 3;
        const forwardX = Math.sin(heading);
        const forwardZ = Math.cos(heading);
        const rightX = Math.cos(heading);
        const rightZ = -Math.sin(heading);
        const backwardSpeed = (4.5 + Math.random() * 7) * intensity;
        const randomSide = sideVelocity + (Math.random() - 0.5) * 4.5 * intensity;
        driveSparkPositions[base] = x;
        driveSparkPositions[base + 1] = y;
        driveSparkPositions[base + 2] = z;
        driveSparkVelocities[base] = -forwardX * backwardSpeed + rightX * randomSide;
        driveSparkVelocities[base + 1] = verticalBias + (1.2 + Math.random() * 3.4) * intensity;
        driveSparkVelocities[base + 2] = -forwardZ * backwardSpeed + rightZ * randomSide;
        driveSparkColors[base] = color[0];
        driveSparkColors[base + 1] = color[1];
        driveSparkColors[base + 2] = color[2];
        driveSparkLife[index] = (0.24 + Math.random() * 0.32) * Math.max(0.72, intensity);
        driveSparkCursor = (driveSparkCursor + 1) % driveSparkCount;
      };

      const turboBurstSparkCount = 22;
      const turboBurstSparkPositions = new Float32Array(turboBurstSparkCount * 2 * 3);
      const turboBurstSparkColors = new Float32Array(turboBurstSparkCount * 2 * 3);
      const turboBurstSparkBaseColors = new Float32Array(turboBurstSparkCount * 3);
      const turboBurstSparkVelocities = new Float32Array(turboBurstSparkCount * 3);
      const turboBurstSparkLife = new Float32Array(turboBurstSparkCount);
      const turboBurstSparkMaxLife = new Float32Array(turboBurstSparkCount);
      for (let index = 0; index < turboBurstSparkCount; index += 1) {
        turboBurstSparkPositions[index * 6 + 1] = -1000;
        turboBurstSparkPositions[index * 6 + 4] = -1000;
      }
      const turboBurstSparkGeometry = new THREE.BufferGeometry();
      turboBurstSparkGeometry.setAttribute("position", new THREE.BufferAttribute(turboBurstSparkPositions, 3));
      turboBurstSparkGeometry.setAttribute("color", new THREE.BufferAttribute(turboBurstSparkColors, 3));
      const turboBurstSparks = new THREE.LineSegments(
        turboBurstSparkGeometry,
        new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.88,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      turboBurstSparks.frustumCulled = false;
      player.add(turboBurstSparks);
      const emitTurboBurstSparks = () => {
        for (let index = 0; index < turboBurstSparkCount; index += 1) {
          const angle = (index / turboBurstSparkCount) * TAU + (Math.random() - 0.5) * 0.16;
          const sideDirection = Math.cos(angle);
          const verticalDirection = Math.sin(angle);
          const radialSpeed = 7.5 + Math.random() * 5;
          const originSide = sideDirection * (0.18 + Math.random() * 0.2);
          const originY = verticalDirection * 0.18;
          const vertexBase = index * 6;
          const velocityBase = index * 3;
          const originX = originSide;
          const originZ = -1.62;
          turboBurstSparkPositions[vertexBase] = originX;
          turboBurstSparkPositions[vertexBase + 1] = 0.68 + originY;
          turboBurstSparkPositions[vertexBase + 2] = originZ;
          turboBurstSparkPositions[vertexBase + 3] = originX;
          turboBurstSparkPositions[vertexBase + 4] = 0.68 + originY;
          turboBurstSparkPositions[vertexBase + 5] = originZ;
          turboBurstSparkVelocities[velocityBase] = sideDirection * radialSpeed;
          turboBurstSparkVelocities[velocityBase + 1] = verticalDirection * radialSpeed * 0.72 + 1.2;
          turboBurstSparkVelocities[velocityBase + 2] = -(4.8 + Math.random() * 3.2);
          const bright = index % 4 === 0 ? 1 : 0.74 + Math.random() * 0.18;
          turboBurstSparkBaseColors[velocityBase] = 0.22 * bright;
          turboBurstSparkBaseColors[velocityBase + 1] = 0.78 * bright;
          turboBurstSparkBaseColors[velocityBase + 2] = 1 * bright;
          turboBurstSparkLife[index] = 0.2 + Math.random() * 0.16;
          turboBurstSparkMaxLife[index] = turboBurstSparkLife[index];
        }
        turboBurstSparkGeometry.attributes.position.needsUpdate = true;
      };

      const driftDustCount = 64;
      const driftDustPositions = new Float32Array(driftDustCount * 3);
      const driftDustColors = new Float32Array(driftDustCount * 3);
      const driftDustSizes = new Float32Array(driftDustCount);
      const driftDustAlphas = new Float32Array(driftDustCount);
      const driftDustVelocities = new Float32Array(driftDustCount * 3);
      const driftDustLife = new Float32Array(driftDustCount);
      const driftDustMaxLife = new Float32Array(driftDustCount);
      for (let index = 0; index < driftDustCount; index += 1) driftDustPositions[index * 3 + 1] = -1000;
      const driftDustGeometry = new THREE.BufferGeometry();
      driftDustGeometry.setAttribute("position", new THREE.BufferAttribute(driftDustPositions, 3));
      driftDustGeometry.setAttribute("color", new THREE.BufferAttribute(driftDustColors, 3));
      driftDustGeometry.setAttribute("puffSize", new THREE.BufferAttribute(driftDustSizes, 1));
      driftDustGeometry.setAttribute("puffAlpha", new THREE.BufferAttribute(driftDustAlphas, 1));
      const driftDustMaterial = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        vertexShader: `
          attribute vec3 color;
          attribute float puffSize;
          attribute float puffAlpha;
          varying vec3 vColor;
          varying float vAlpha;
          void main() {
            vColor = color;
            vAlpha = puffAlpha;
            vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * viewPosition;
            gl_PointSize = puffSize * (260.0 / max(1.0, -viewPosition.z));
          }
        `,
        fragmentShader: `
          varying vec3 vColor;
          varying float vAlpha;
          void main() {
            float distanceFromCenter = length(gl_PointCoord - vec2(0.5));
            float softEdge = 1.0 - smoothstep(0.24, 0.5, distanceFromCenter);
            float cloudyCenter = 0.84 + (1.0 - distanceFromCenter * 2.0) * 0.16;
            gl_FragColor = vec4(vColor * cloudyCenter, vAlpha * softEdge);
          }
        `,
      });
      const driftDust = new THREE.Points(driftDustGeometry, driftDustMaterial);
      driftDust.frustumCulled = false;
      scene.add(driftDust);
      let driftDustCursor = 0;
      const emitDriftDust = (x: number, y: number, z: number, heading: number, sideVelocity = 0) => {
        const index = driftDustCursor;
        const base = index * 3;
        const forwardX = Math.sin(heading);
        const forwardZ = Math.cos(heading);
        const rightX = Math.cos(heading);
        const rightZ = -Math.sin(heading);
        const backwardSpeed = 1.9 + Math.random() * 3.1;
        const randomSide = sideVelocity + (Math.random() - 0.5) * 1.8;
        const shade = 0.7 + Math.random() * 0.22;
        driftDustPositions[base] = x;
        driftDustPositions[base + 1] = y;
        driftDustPositions[base + 2] = z;
        driftDustColors[base] = shade;
        driftDustColors[base + 1] = Math.min(1, shade + 0.025);
        driftDustColors[base + 2] = Math.min(1, shade + 0.02);
        driftDustSizes[index] = 0.48 + Math.random() * 0.36;
        driftDustAlphas[index] = 0.5 + Math.random() * 0.18;
        driftDustVelocities[base] = -forwardX * backwardSpeed + rightX * randomSide;
        driftDustVelocities[base + 1] = 0.55 + Math.random() * 0.8;
        driftDustVelocities[base + 2] = -forwardZ * backwardSpeed + rightZ * randomSide;
        driftDustLife[index] = 0.52 + Math.random() * 0.3;
        driftDustMaxLife[index] = driftDustLife[index];
        driftDustCursor = (driftDustCursor + 1) % driftDustCount;
      };

      const playerState = {
        motionState: "grounded" as KartMotionState,
        x: start.x,
        y: start.y,
        z: start.z,
        heading: start.heading,
        pitch: startSupport.pitch,
        speed: 0,
        progress: PLAYER_START_PROGRESS,
        lastU: wrap01(PLAYER_START_PROGRESS),
        shield: false,
        crashStart: 0,
        crashUntil: 0,
        wasCrashing: false,
        boostUntil: 0,
        auroraUntil: 0,
        drifting: false,
        driftCharge: 0,
        driftBoost: 0,
        driftSide: 0,
        wallBounceUntil: 0,
        wallBounceSide: 0,
        groundY: start.y,
        airborne: false,
        verticalVelocity: 0,
        surfaceVerticalVelocity: 0,
        airborneSince: 0,
        jumpCooldownUntil: 0,
        landingImpactUntil: 0,
        offTrackSince: 0,
        recoveryProgress: PLAYER_START_PROGRESS,
        recoveryU: wrap01(PLAYER_START_PROGRESS),
        recoveryLane: 0,
        skillReadyAt: 0,
      };
      type KartRenderTransform = { position: Three.Vector3; quaternion: Three.Quaternion; visualQuaternion: Three.Quaternion };
      type PlayerRenderPose = { x: number; y: number; z: number; heading: number; groundY: number; airborne: boolean };
      const previousKartTransforms: KartRenderTransform[] = racerMeshes.map((mesh) => ({
        position: mesh.position.clone(),
        quaternion: mesh.quaternion.clone(),
        visualQuaternion: (mesh.userData.visualRoot as Three.Group).quaternion.clone(),
      }));
      const currentKartTransforms: KartRenderTransform[] = racerMeshes.map((mesh) => ({
        position: mesh.position.clone(),
        quaternion: mesh.quaternion.clone(),
        visualQuaternion: (mesh.userData.visualRoot as Three.Group).quaternion.clone(),
      }));
      const makePlayerRenderPose = (): PlayerRenderPose => ({
        x: playerState.x,
        y: playerState.y,
        z: playerState.z,
        heading: playerState.heading,
        groundY: playerState.groundY,
        airborne: playerState.airborne,
      });
      let previousPlayerRenderPose = makePlayerRenderPose();
      let currentPlayerRenderPose = makePlayerRenderPose();
      let kartTransformSnapshotsReady = false;
      const captureKartRenderState = () => {
        racerMeshes.forEach((mesh, index) => {
          if (kartTransformSnapshotsReady) {
            previousKartTransforms[index].position.copy(currentKartTransforms[index].position);
            previousKartTransforms[index].quaternion.copy(currentKartTransforms[index].quaternion);
            previousKartTransforms[index].visualQuaternion.copy(currentKartTransforms[index].visualQuaternion);
          }
          currentKartTransforms[index].position.copy(mesh.position);
          currentKartTransforms[index].quaternion.copy(mesh.quaternion);
          currentKartTransforms[index].visualQuaternion.copy(racerVisualRoots[index].quaternion);
          if (!kartTransformSnapshotsReady) {
            previousKartTransforms[index].position.copy(mesh.position);
            previousKartTransforms[index].quaternion.copy(mesh.quaternion);
            previousKartTransforms[index].visualQuaternion.copy(racerVisualRoots[index].quaternion);
          }
        });
        if (kartTransformSnapshotsReady) {
          previousPlayerRenderPose = { ...currentPlayerRenderPose };
        }
        currentPlayerRenderPose = makePlayerRenderPose();
        if (!kartTransformSnapshotsReady) previousPlayerRenderPose = { ...currentPlayerRenderPose };
        kartTransformSnapshotsReady = true;
      };
      const interpolateAngle = (from: number, to: number, amount: number) => (
        from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * amount
      );
      let heldItem: ItemType = "EMPTY";
      let itemPressed = false;
      let skillPressed = false;
      let novaFlashUntil = 0;
      let novaStarted = -10000;
      const novaHitUntil = Array(actorCount).fill(0);
      let raceStart = 0;
      let nextShootingStarAt = 0;
      let previousFrameAt = performance.now();
      let simulationNow = previousFrameAt;
      let physicsAccumulatorMs = 0;
      let frame = 0;
      let hudTick = 0;
      let finished = false;
      let lastMiniMapDraw = 0;
      let wasDriftDashing = false;
      let driftTurboFadeStartedAt = -10000;
      const DRIFT_TURBO_FADE_MS = 460;

      const drawMiniMapFace = (
        context: CanvasRenderingContext2D,
        character: CharacterDefinition,
        x: number,
        y: number,
        playerMarker: boolean,
      ) => {
        const radius = 11;
        const palettes: Record<DriverAnimal, { fur: string; inner: string; muzzle: string }> = {
          otter: { fur: "#9a603c", inner: "#d9a47d", muzzle: "#efd5b7" },
          fox: { fur: "#e86c2b", inner: "#3a201d", muzzle: "#fff0df" },
          cat: { fur: "#4c4a58", inner: "#8d7188", muzzle: "#d7d2cf" },
          corgi: { fur: "#d99a45", inner: "#f1c07e", muzzle: "#fff0d8" },
          monkey: { fur: "#f07aa9", inner: "#ffbfd5", muzzle: "#ffd6e3" },
        };
        const palette = palettes[character.animal];
        context.save();
        context.translate(x, y);
        context.shadowColor = "rgba(0,0,0,.72)";
        context.shadowBlur = 5;
        context.lineJoin = "round";
        context.lineCap = "round";
        context.strokeStyle = playerMarker ? "#63fff3" : "#ffffff";
        context.lineWidth = playerMarker ? 3.2 : 2;
        context.fillStyle = "rgba(4,18,27,.9)";
        context.beginPath();
        context.arc(0, 0, radius + 2.5, 0, TAU);
        context.fill();
        context.stroke();
        context.shadowBlur = 0;

        context.fillStyle = palette.fur;
        if (character.animal === "fox" || character.animal === "cat" || character.animal === "corgi") {
          const earHeight = character.animal === "corgi" ? 10 : 8;
          [-1, 1].forEach((side) => {
            context.beginPath();
            context.moveTo(side * 3, -7);
            context.lineTo(side * 10, -radius - earHeight);
            context.lineTo(side * 11, -3);
            context.closePath();
            context.fill();
            context.strokeStyle = palette.inner;
            context.lineWidth = 2.2;
            context.stroke();
          });
        } else {
          [-1, 1].forEach((side) => {
            context.beginPath();
            context.arc(side * (character.animal === "monkey" ? 10 : 8.5), -3, character.animal === "monkey" ? 5 : 4.2, 0, TAU);
            context.fillStyle = palette.inner;
            context.fill();
          });
        }

        context.fillStyle = palette.fur;
        context.beginPath();
        context.ellipse(0, 0, radius * 0.88, radius, 0, 0, TAU);
        context.fill();
        context.fillStyle = palette.muzzle;
        context.beginPath();
        context.ellipse(0, 4.2, character.animal === "monkey" ? 7.4 : 6.4, character.animal === "monkey" ? 6 : 4.9, 0, 0, TAU);
        context.fill();
        context.fillStyle = "#ffffff";
        [-1, 1].forEach((side) => {
          context.beginPath();
          context.arc(side * 3.6, -2.2, 2.15, 0, TAU);
          context.fill();
          context.fillStyle = "#1b1717";
          context.beginPath();
          context.arc(side * 3.6, -2.1, 1.15, 0, TAU);
          context.fill();
          context.fillStyle = "#ffffff";
        });
        context.fillStyle = "#211a18";
        context.beginPath();
        context.ellipse(0, 2.8, 2.3, 1.7, 0, 0, TAU);
        context.fill();
        context.restore();
      };

      const drawMiniMap = (now: number) => {
        if (!miniMapCanvas || !miniMapContext || now - lastMiniMapDraw < 55) return;
        lastMiniMapDraw = now;
        const width = miniMapCanvas.width;
        const height = miniMapCanvas.height;
        const padding = 17;
        const spanX = Math.max(1, miniMapBounds.maxX - miniMapBounds.minX);
        const spanZ = Math.max(1, miniMapBounds.maxZ - miniMapBounds.minZ);
        const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanZ);
        const offsetX = (width - spanX * scale) / 2;
        const offsetY = (height - spanZ * scale) / 2;
        const project = (x: number, z: number) => ({
          x: offsetX + (x - miniMapBounds.minX) * scale,
          y: offsetY + (z - miniMapBounds.minZ) * scale,
        });
        miniMapContext.clearRect(0, 0, width, height);
        miniMapContext.fillStyle = "rgba(5,20,29,.82)";
        miniMapContext.fillRect(0, 0, width, height);
        miniMapContext.lineJoin = "round";
        miniMapContext.lineCap = "round";
        miniMapContext.beginPath();
        miniMapSamples.forEach((sample, index) => {
          const point = project(sample.x, sample.z);
          if (index === 0) miniMapContext.moveTo(point.x, point.y);
          else miniMapContext.lineTo(point.x, point.y);
        });
        miniMapContext.closePath();
        miniMapContext.strokeStyle = "rgba(0,0,0,.74)";
        miniMapContext.lineWidth = 8;
        miniMapContext.stroke();
        miniMapContext.strokeStyle = courseDefinition.id === "starlight" ? "#b99aff" : courseDefinition.id === "river" ? "#62dff5" : courseDefinition.id === "cloud" ? "#f7fdff" : courseDefinition.id === "pirate" ? "#d79b58" : "#8ee8df";
        miniMapContext.lineWidth = 3.5;
        miniMapContext.stroke();
        const startPoint = project(miniMapSamples[0].x, miniMapSamples[0].z);
        miniMapContext.fillStyle = "#ffd45c";
        miniMapContext.fillRect(startPoint.x - 2, startPoint.y - 6, 4, 12);
        const actors = [
          { x: playerState.x, z: playerState.z, character: selectedCharacter, actorId: 0 },
          ...rivalStates.map((rival, index) => {
            const pose = rival.shortcutActive
              ? { x: rival.shortcutX, z: rival.shortcutZ }
              : course.pointAt(rival.progress, rival.lane);
            return { x: pose.x, z: pose.z, character: actorCharacters[index + 1], actorId: index + 1 };
          }),
        ];
        [...actors].reverse().forEach((actor) => {
          const point = project(actor.x, actor.z);
          drawMiniMapFace(miniMapContext, actor.character, point.x, point.y, actor.actorId === 0);
        });
      };

      const actorProgress = (actorId: number) => actorId === 0 ? playerState.progress : rivalStates[actorId - 1].progress;
      const actorLane = (actorId: number) => {
        if (actorId !== 0) return rivalStates[actorId - 1].lane;
        const nearest = course.pointAt(playerState.lastU);
        return clamp(
          (playerState.x - nearest.x) * nearest.nx + (playerState.z - nearest.z) * nearest.nz,
          -BARRIER_LIMIT,
          BARRIER_LIMIT,
        );
      };
      const actorPose = (actorId: number) => {
        if (actorId === 0) return { x: playerState.x, y: playerState.y, z: playerState.z, heading: playerState.heading, pitch: playerState.pitch, nx: Math.cos(playerState.heading), nz: -Math.sin(playerState.heading) };
        const rival = rivalStates[actorId - 1];
        if (rival.shortcutActive) {
          const pitch = clamp(-Math.atan2(rival.verticalVelocity, Math.max(8, rival.airSpeed)), -0.42, 0.42);
          return {
            x: rival.shortcutX,
            y: rival.airY,
            z: rival.shortcutZ,
            heading: rival.shortcutHeading,
            pitch,
            nx: Math.cos(rival.shortcutHeading),
            nz: -Math.sin(rival.shortcutHeading),
          };
        }
        const pose = course.pointAt(rival.progress, rival.lane);
        if (rival.airborne) return { ...pose, y: rival.airY };
        return { ...pose, pitch: getKartRoadSupport(rival.progress, rival.lane).pitch };
      };
      const actorRank = (actorId: number) => 1 + actorIds.filter((otherId) => otherId !== actorId && actorProgress(otherId) > actorProgress(actorId)).length;
      const getRoadSeparationProfile = (progress: number, lane: number, horizontalSpeed: number, verticalSpeed: number) => {
        const center = course.pointAt(progress, lane);
        const sampleTimes = [0.08, 0.14, 0.22, 0.34];
        let nearClearance = Number.NEGATIVE_INFINITY;
        let maxClearance = Number.NEGATIVE_INFINITY;
        let maxRoadDrop = 0;
        sampleTimes.forEach((time) => {
          const roadAhead = course.pointAt(progress + (horizontalSpeed * time) / course.length, lane);
          const inertialY = center.y + verticalSpeed * time - 0.5 * JUMP_GRAVITY * time * time;
          const clearance = inertialY - roadAhead.y;
          if (time <= 0.14) nearClearance = Math.max(nearClearance, clearance);
          maxClearance = Math.max(maxClearance, clearance);
          maxRoadDrop = Math.max(maxRoadDrop, center.y - roadAhead.y);
        });
        return {
          separatesFromRoad: maxRoadDrop > 0.16 && nearClearance > 0.035 && maxClearance > 0.12,
        };
      };
      const syncKartMotionStates = (now: number) => {
        playerState.motionState = now < playerState.crashUntil
          ? "crashing"
          : playerState.offTrackSince
            ? "falling"
            : playerState.airborne
              ? "airborne"
              : "grounded";
        rivalStates.forEach((rival) => {
          rival.motionState = now < rival.crashUntil
            ? "crashing"
            : rival.cloudFallUntil
              ? "falling"
              : rival.airborne || rival.shortcutActive
                ? "airborne"
                : "grounded";
        });
      };
      const findSweptRoadContact = (
        from: { x: number; y: number; z: number },
        to: { x: number; y: number; z: number },
        hintU?: number,
      ) => {
        const travel = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
        const sampleCount = Math.round(clamp(Math.ceil(travel / 0.55), 2, 8));
        let currentHint = hintU;
        const startSurface = course.nearestSurface(from.x, from.y, from.z, currentHint);
        let previousClearance = from.y - startSurface.pose.y;
        for (let index = 1; index <= sampleCount; index += 1) {
          const amount = index / sampleCount;
          const x = THREE.MathUtils.lerp(from.x, to.x, amount);
          const y = THREE.MathUtils.lerp(from.y, to.y, amount);
          const z = THREE.MathUtils.lerp(from.z, to.z, amount);
          const surface = course.nearestSurface(x, y, z, currentHint);
          const lane = (x - surface.pose.x) * surface.pose.nx + (z - surface.pose.z) * surface.pose.nz;
          const clearance = y - surface.pose.y;
          const followsCurrentSection = currentHint === undefined || Math.abs(progressDelta(surface.u, currentHint)) < 0.08;
          if (
            followsCurrentSection
            && Math.abs(lane) <= BARRIER_LIMIT
            && previousClearance >= -0.08
            && clearance <= 0.035
          ) {
            return { surface, lane, amount };
          }
          if (followsCurrentSection) currentHint = surface.u;
          previousClearance = clearance;
        }
        return null;
      };
      const recoverPlayerFromFall = (now: number) => {
        const recovery = course.pointAt(playerState.recoveryU, playerState.recoveryLane);
        playerState.x = recovery.x;
        playerState.y = recovery.y;
        playerState.z = recovery.z;
        playerState.heading = recovery.heading;
        playerState.pitch = getKartRoadSupport(playerState.recoveryU, playerState.recoveryLane).pitch;
        playerState.speed = 8;
        playerState.progress = playerState.recoveryProgress;
        playerState.lastU = playerState.recoveryU;
        playerState.groundY = recovery.y;
        playerState.airborne = false;
        playerState.motionState = "grounded";
        playerState.airborneSince = 0;
        playerState.verticalVelocity = 0;
        playerState.surfaceVerticalVelocity = 0;
        playerState.offTrackSince = 0;
        playerState.drifting = false;
        playerState.driftCharge = 0;
        playerState.landingImpactUntil = now + 360;
        playerState.jumpCooldownUntil = now + JUMP_COOLDOWN_MS;
      };
      const actorCrashing = (actorId: number, now: number) => actorId === 0
        ? playerState.motionState === "crashing" || now < playerState.crashUntil
        : rivalStates[actorId - 1].motionState === "crashing" || now < rivalStates[actorId - 1].crashUntil;
      const actorAirborne = (actorId: number) => actorId === 0
        ? playerState.motionState === "airborne" || playerState.motionState === "falling" || playerState.airborne
        : rivalStates[actorId - 1].motionState === "airborne" || rivalStates[actorId - 1].motionState === "falling" || rivalStates[actorId - 1].airborne;
      const actorHasShield = (actorId: number) => actorId === 0 ? playerState.shield : rivalStates[actorId - 1].shield;
      const actorAuroraUntil = (actorId: number) => actorId === 0 ? playerState.auroraUntil : rivalStates[actorId - 1].auroraUntil;
      const setActorShield = (actorId: number, active: boolean) => {
        if (actorId === 0) {
          playerState.shield = active;
          onShieldChange(active);
        } else {
          rivalStates[actorId - 1].shield = active;
        }
      };
      const setActorItem = (actorId: number, item: ItemType, now: number) => {
        if (actorId === 0) {
          heldItem = item;
          onItemChange(item);
        } else {
          const rival = rivalStates[actorId - 1];
          rival.item = item;
          rival.useAt = item === "EMPTY" ? 0 : now + 750 + Math.random() * 1850;
        }
      };
      const actorItem = (actorId: number) => actorId === 0 ? heldItem : rivalStates[actorId - 1].item;
      const rollItem = (rank: number): ItemType => {
        if (rank === actorCount && Math.random() < 0.05) return "NOVA";
        const weighted = rank >= 3
          ? ["HOMING", "BOOST", "BOOST", "AURORA", "SPIKES", "SHIELD", "FIRE"] as ItemType[]
          : [...STANDARD_ITEMS, "FIRE", "SPIKES"] as ItemType[];
        return weighted[Math.floor(Math.random() * weighted.length)];
      };
      const crashActor = (actorId: number, now: number) => {
        if (actorCrashing(actorId, now)) return false;
        if (actorId === 0) {
          const road = course.nearestSurface(playerState.x, playerState.y, playerState.z, playerState.lastU).pose;
          playerState.crashStart = now;
          playerState.crashUntil = now + 1450;
          playerState.speed = 0;
          playerState.y = road.y;
          playerState.groundY = road.y;
          playerState.airborne = false;
          playerState.motionState = "crashing";
          playerState.verticalVelocity = 0;
          playerState.surfaceVerticalVelocity = 0;
          playerState.offTrackSince = 0;
          playerState.jumpCooldownUntil = now + JUMP_COOLDOWN_MS;
          playerState.drifting = false;
          playerState.driftCharge = 0;
          playerState.driftBoost = 0;
        } else {
          const rival = rivalStates[actorId - 1];
          rival.crashStart = now;
          rival.crashUntil = now + 1450;
          rival.shortcutActive = false;
          rival.shortcutProgress = 0;
          pendingRivalShortcuts.delete(actorId);
          rival.airborne = false;
          rival.motionState = "crashing";
          rival.airY = course.pointAt(rival.progress, rival.lane).y;
          rival.airSpeed = 0;
          rival.cloudFallUntil = 0;
          rival.verticalVelocity = 0;
          rival.surfaceVerticalVelocity = 0;
          rival.jumpCooldownUntil = now + JUMP_COOLDOWN_MS;
          rival.drifting = false;
          rival.driftCharge = 0;
          rival.driftBoost = 0;
        }
        return true;
      };
      const bumpActor = (actorId: number, obstacleLane: number, now: number) => {
        const lane = actorLane(actorId);
        const side = Math.sign(lane - obstacleLane) || (actorId % 2 === 0 ? 1 : -1);
        if (actorId === 0) {
          const nearest = course.nearestSurface(playerState.x, playerState.y, playerState.z, playerState.lastU);
          const bumpedLane = clamp(lane + side * 1.05, -BARRIER_LIMIT + 0.45, BARRIER_LIMIT - 0.45);
          playerState.x = nearest.pose.x + nearest.pose.nx * bumpedLane;
          playerState.z = nearest.pose.z + nearest.pose.nz * bumpedLane;
          playerState.wallBounceUntil = now + 180;
          playerState.wallBounceSide = -side;
        } else {
          const rival = rivalStates[actorId - 1];
          rival.lane = clamp(rival.lane + side * 1.05, -BARRIER_LIMIT + 0.45, BARRIER_LIMIT - 0.45);
        }
      };
      const attackActor = (targetId: number, attack: AttackType, now: number) => {
        if (actorCrashing(targetId, now)) return "ignored" as const;
        if (attack === "MONKEY") {
          const hadShield = actorHasShield(targetId);
          if (hadShield) setActorShield(targetId, false);
          if (hadShield || now < actorAuroraUntil(targetId)) return "blocked" as const;
        }
        const shieldable = attack === "FIRE" || attack === "HOMING" || attack === "AURORA" || attack === "SPIKES" || attack === "MONKEY" || attack === "CANNON" || attack === "PIXEL" || attack === "VOLT" || attack === "COMET";
        if (shieldable && now < actorAuroraUntil(targetId)) return "blocked" as const;
        if (shieldable && actorHasShield(targetId)) {
          setActorShield(targetId, false);
          return "blocked" as const;
        }
        crashActor(targetId, now);
        return "crashed" as const;
      };
      const targetOnePlaceAhead = (actorId: number) => {
        const ownerProgress = actorProgress(actorId);
        return actorIds
          .filter((targetId) => targetId !== actorId && actorProgress(targetId) > ownerProgress)
          .sort((a, b) => actorProgress(a) - actorProgress(b))[0] ?? null;
      };
      const makeFireMesh = () => {
        const group = new THREE.Group();
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.45, 22, 14), projectileMaterial);
        flame.scale.set(0.78, 0.78, 1.65);
        flame.castShadow = false;
        group.add(flame);
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 12), projectileCoreMaterial);
        core.position.z = 0.28;
        group.add(core);
        return group;
      };
      const makeHomingMesh = () => {
        const group = new THREE.Group();
        const shell = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.72, 8, 18), homingMaterial);
        shell.rotation.x = Math.PI / 2;
        shell.castShadow = false;
        group.add(shell);
        [-1, 1].forEach((side) => {
          const fin = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.07, 0.45), homingMaterial);
          fin.position.set(side * 0.28, 0, -0.18);
          group.add(fin);
        });
        return group;
      };
      const makePixelMesh = () => {
        const group = new THREE.Group();
        const core = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 0.72, 3, 3, 3), pixelMaterial);
        core.rotation.set(0.22, Math.PI / 4, 0.18);
        core.castShadow = false;
        group.add(core);
        for (let index = 0; index < 6; index += 1) {
          const pixel = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), pixelMaterial);
          pixel.position.set((index % 2 ? 1 : -1) * (0.52 + index * 0.09), ((index % 3) - 1) * 0.28, -0.28 - index * 0.26);
          group.add(pixel);
        }
        return group;
      };
      const spawnProjectile = (actorId: number, kind: "FIRE" | "HOMING" | "PIXEL") => {
        const pose = actorPose(actorId);
        const remainingTargets = kind === "PIXEL"
          ? actorIds
            .filter((targetId) => targetId !== actorId && actorProgress(targetId) > actorProgress(actorId))
            .sort((a, b) => actorProgress(a) - actorProgress(b))
          : [];
        const target: number | null = kind === "PIXEL"
          ? remainingTargets[0] ?? null
          : kind === "HOMING"
            ? targetOnePlaceAhead(actorId)
            : null;
        if ((kind === "HOMING" || kind === "PIXEL") && target === null) return false;
        const resolvedKind = kind;
        const pooled = projectilePools[resolvedKind].pop();
        const group = pooled?.group ?? (resolvedKind === "FIRE" ? makeFireMesh() : resolvedKind === "PIXEL" ? makePixelMesh() : makeHomingMesh());
        group.visible = true;
        group.rotation.set(0, pose.heading, 0);
        group.scale.setScalar(1);
        group.position.set(pose.x + Math.sin(pose.heading) * 2.6, pose.y + 0.85, pose.z + Math.cos(pose.heading) * 2.6);
        scene.add(group);
        const projectile = pooled ?? {
          kind: resolvedKind,
          owner: actorId,
          target,
          remainingTargets,
          group,
          progress: 0,
          lane: 0,
          directionX: 0,
          directionZ: 1,
          surfaceU: 0,
          surfaceY: 0,
          nextSurfaceSampleAt: 0,
          age: 0,
          active: true,
        };
        projectile.kind = resolvedKind;
        projectile.owner = actorId;
        projectile.target = target;
        projectile.remainingTargets = remainingTargets;
        projectile.progress = actorProgress(actorId) + 2.7 / course.length;
        projectile.lane = actorLane(actorId);
        projectile.directionX = Math.sin(pose.heading);
        projectile.directionZ = Math.cos(pose.heading);
        projectile.surfaceU = wrap01(actorProgress(actorId));
        projectile.surfaceY = pose.y + 0.86;
        projectile.nextSurfaceSampleAt = 0;
        projectile.age = 0;
        projectile.active = true;
        projectiles.push(projectile);
        return true;
      };
      const makeTrapMesh = () => {
        const group = new THREE.Group();
        const base = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.12, 0.15, 32), trapBaseMaterial);
        base.position.y = 0.1;
        base.castShadow = false;
        group.add(base);
        [[0, 0], [-0.48, -0.32], [0.48, -0.32], [-0.42, 0.38], [0.42, 0.38]].forEach(([x, z]) => {
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.86, 18), spikeMaterial);
          spike.position.set(x, 0.52, z);
          spike.castShadow = false;
          group.add(spike);
        });
        return group;
      };
      const createTrapAt = (owner: number, progress: number, lane: number, now: number) => {
        const pose = course.pointAt(progress, lane);
        const pooled = trapPool.pop();
        const group = pooled?.group ?? makeTrapMesh();
        const x = pose.x;
        const z = pose.z;
        group.visible = true;
        group.scale.setScalar(1);
        group.position.set(x, pose.y + 0.03, z);
        group.rotation.set(pose.pitch, pose.heading, 0);
        scene.add(group);
        const trap = pooled ?? { owner, group, x, y: pose.y, z, armedAt: 0, expiresAt: 0, active: true };
        trap.owner = owner;
        trap.x = x;
        trap.y = pose.y;
        trap.z = z;
        trap.armedAt = now + 650;
        trap.expiresAt = now + 22000;
        trap.active = true;
        traps.push(trap);
      };
      const spawnTrap = (actorId: number, now: number) => {
        createTrapAt(actorId, actorProgress(actorId) - 2.45 / course.length, actorLane(actorId), now);
      };
      const spawnShootingStar = (forcedProgress?: number, forcedLane?: number, speedScale = 1) => {
        const progress = forcedProgress ?? playerState.progress + 0.025 + Math.random() * 0.075;
        const lane = forcedLane ?? -7.2 + Math.random() * 14.4;
        const point = course.pointAt(progress, lane);
        const pooled = shootingStarPool.pop();
        let group = pooled?.group;
        let warning = pooled?.warning;
        if (!group || !warning) {
          group = new THREE.Group();
          const starShape = new THREE.Shape();
          for (let index = 0; index < 10; index += 1) {
            const radius = index % 2 === 0 ? 1.08 : 0.46;
            const angle = Math.PI / 2 + index * Math.PI / 5;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            if (index === 0) starShape.moveTo(x, y);
            else starShape.lineTo(x, y);
          }
          starShape.closePath();
          const starGeometry = new THREE.ExtrudeGeometry(starShape, { depth: 0.28, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.1, bevelThickness: 0.08, curveSegments: 12 });
          starGeometry.center();
          const coreMaterial = new THREE.MeshStandardMaterial({ color: 0xfff49a, emissive: 0xffc928, emissiveIntensity: 3.2, roughness: 0.15, metalness: 0.18 });
          const core = new THREE.Mesh(starGeometry, coreMaterial);
          core.castShadow = false;
          group.add(core);
          const halo = new THREE.Mesh(
            starGeometry.clone(),
            new THREE.MeshBasicMaterial({ color: 0x84ddff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
          );
          halo.scale.setScalar(1.36);
          halo.position.z = -0.08;
          group.add(halo);
          for (let index = 0; index < 3; index += 1) {
            const trail = new THREE.Mesh(
              new THREE.CapsuleGeometry(0.13 - index * 0.018, 1.8 - index * 0.24, 6, 16),
              new THREE.MeshBasicMaterial({ color: index === 1 ? 0xc088ff : 0x72dcff, transparent: true, opacity: 0.78 - index * 0.15, blending: THREE.AdditiveBlending, depthWrite: false }),
            );
            trail.position.set(1.18 + index * 0.36, 1.05 - index * 0.45, -0.02);
            trail.rotation.z = -Math.PI / 4;
            group.add(trail);
          }
          const warningMaterial = new THREE.MeshBasicMaterial({ color: 0xffec70, transparent: true, opacity: 0.72, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
          warning = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.25, 40), warningMaterial);
        }
        group.visible = true;
        group.rotation.set(0, 0, 0);
        group.scale.setScalar(1.34);
        warning.visible = true;
        warning.scale.setScalar(1);
        warning.rotation.x = -Math.PI / 2 + point.pitch;
        warning.rotation.y = point.heading;
        warning.position.set(point.x, point.y + 0.12, point.z);
        scene.add(warning);
        const y = point.y + 27 + Math.random() * 10;
        group.position.set(point.x, y, point.z);
        scene.add(group);
        const star = pooled ?? { group, warning, progress, lane, y, fallSpeed: 0, active: true };
        star.progress = progress;
        star.lane = lane;
        star.y = y;
        star.fallSpeed = (18 + Math.random() * 5) * speedScale;
        star.active = true;
        shootingStars.push(star);
      };
      const shatterShootingStar = (star: ShootingStarState, now: number) => {
        if (!star.active) return;
        star.active = false;
        star.group.visible = false;
        star.warning.visible = false;
        const point = course.pointAt(star.progress, star.lane);
        const pooled = shatterPool.pop();
        let group = pooled?.group;
        if (!group) {
          group = new THREE.Group();
          const colors = [0xdffaff, 0x66dcff, 0xae79ff, 0xffef88];
          for (let index = 0; index < 16; index += 1) {
            const color = colors[index % colors.length];
            const fragment = new THREE.Mesh(
              new THREE.TetrahedronGeometry(0.13 + (index % 4) * 0.07, 0),
              new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }),
            );
            const angle = (index / 16) * TAU;
            const initialVelocity = new THREE.Vector3(Math.cos(angle) * (2.5 + index % 3), 2.8 + (index % 5), Math.sin(angle) * (2.5 + (index + 1) % 3));
            fragment.userData.initialVelocity = initialVelocity;
            fragment.userData.velocity = initialVelocity.clone();
            group.add(fragment);
          }
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.25, 0.6, 40),
            new THREE.MeshBasicMaterial({ color: 0xbdefff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
          );
          ring.rotation.x = -Math.PI / 2;
          ring.name = "impact-ring";
          group.add(ring);
        }
        group.visible = true;
        group.scale.setScalar(1);
        group.children.forEach((fragment) => {
          fragment.position.set(0, 0, 0);
          fragment.rotation.set(fragment.name === "impact-ring" ? -Math.PI / 2 : 0, 0, 0);
          fragment.scale.setScalar(1);
          if (fragment instanceof THREE.Mesh) {
            const material = fragment.material as Three.Material & { opacity?: number };
            if ("opacity" in material) material.opacity = fragment.name === "impact-ring" ? 0.9 : 1;
          }
          const initialVelocity = fragment.userData.initialVelocity as Three.Vector3 | undefined;
          const velocity = fragment.userData.velocity as Three.Vector3 | undefined;
          if (initialVelocity && velocity) velocity.copy(initialVelocity);
        });
        group.position.set(point.x, point.y + 0.22, point.z);
        scene.add(group);
        const shatter = pooled ?? { group, startedAt: now, active: true };
        shatter.startedAt = now;
        shatter.active = true;
        shatters.push(shatter);
      };
      const spawnSkillMeteor = (owner: number) => {
        const progress = actorProgress(owner) + 0.018 + Math.random() * 0.11;
        const lane = -7.4 + Math.random() * 14.8;
        const point = course.pointAt(progress, lane);
        const blue = actorCharacters[owner].name === "Gojo";
        const pooled = skillMeteorPool.pop();
        let group = pooled?.group;
        let warning = pooled?.warning;
        if (!group || !warning) {
          group = new THREE.Group();
          const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x57433d, emissive: 0xff4d17, emissiveIntensity: 0.85, roughness: 0.88 });
          const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.92, 1), rockMaterial);
          rock.name = "skill-meteor-rock";
          rock.scale.set(1.05, 0.86, 1.28);
          rock.castShadow = false;
          group.add(rock);
          const crust = new THREE.Mesh(
            new THREE.IcosahedronGeometry(1.08, 1),
            new THREE.MeshBasicMaterial({ color: 0xff7a21, transparent: true, opacity: 0.26, wireframe: true, blending: THREE.AdditiveBlending, depthWrite: false }),
          );
          crust.name = "skill-meteor-crust";
          group.add(crust);
          for (let index = 0; index < 4; index += 1) {
            const trail = new THREE.Mesh(
              new THREE.CapsuleGeometry(0.18 - index * 0.025, 1.7 + index * 0.35, 6, 14),
              new THREE.MeshBasicMaterial({ color: index < 2 ? 0xffad32 : 0xff3b1c, transparent: true, opacity: 0.78 - index * 0.13, blending: THREE.AdditiveBlending, depthWrite: false }),
            );
            trail.name = `skill-meteor-trail-${index}`;
            trail.position.set(0.28 * Math.sin(index), 1.45 + index * 0.48, 0.18 * Math.cos(index));
            group.add(trail);
          }
          warning = new THREE.Mesh(
            new THREE.RingGeometry(0.92, 1.45, 40),
            new THREE.MeshBasicMaterial({ color: 0xff6a24, transparent: true, opacity: 0.82, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
          );
        }
        const rock = group.getObjectByName("skill-meteor-rock");
        if (rock instanceof THREE.Mesh) {
          const material = rock.material as Three.MeshStandardMaterial;
          material.color.setHex(blue ? 0x193c6b : 0x57433d);
          material.emissive.setHex(blue ? 0x168cff : 0xff4d17);
          material.emissiveIntensity = blue ? 1.5 : 0.85;
        }
        const crust = group.getObjectByName("skill-meteor-crust");
        if (crust instanceof THREE.Mesh) {
          (crust.material as Three.MeshBasicMaterial).color.setHex(blue ? 0x57ddff : 0xff7a21);
        }
        const normalTrailColors = [0xffad32, 0xffad32, 0xff3b1c, 0xff3b1c];
        const blueTrailColors = [0xd5f8ff, 0x64dcff, 0x249cff, 0x315cff];
        for (let index = 0; index < 4; index += 1) {
          const trail = group.getObjectByName(`skill-meteor-trail-${index}`);
          if (trail instanceof THREE.Mesh) {
            (trail.material as Three.MeshBasicMaterial).color.setHex((blue ? blueTrailColors : normalTrailColors)[index]);
          }
        }
        (warning.material as Three.MeshBasicMaterial).color.setHex(blue ? 0x35cfff : 0xff6a24);
        group.visible = true;
        group.rotation.set(0, 0, 0);
        group.scale.setScalar(1);
        warning.visible = true;
        warning.scale.setScalar(1);
        warning.rotation.x = -Math.PI / 2 + point.pitch;
        warning.rotation.y = point.heading;
        warning.position.set(point.x, point.y + 0.13, point.z);
        scene.add(warning);
        const y = point.y + 24 + Math.random() * 12;
        group.position.set(point.x, y, point.z);
        scene.add(group);
        const meteor = pooled ?? { group, warning, progress, lane, y, fallSpeed: 0, owner, blue, active: true };
        meteor.progress = progress;
        meteor.lane = lane;
        meteor.y = y;
        meteor.fallSpeed = 17 + Math.random() * 6;
        meteor.owner = owner;
        meteor.blue = blue;
        meteor.active = true;
        skillMeteors.push(meteor);
      };
      const createShockWave = (actorId: number, now: number) => {
        const pose = actorPose(actorId);
        const pooled = shockWavePool.pop();
        let group = pooled?.group;
        let material = pooled?.material;
        if (!group || !material) {
          material = new THREE.MeshBasicMaterial({ color: 0xbca8ff, transparent: true, opacity: 0.92, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
          const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.18, 18, 96), material);
          ring.rotation.x = Math.PI / 2;
          group = new THREE.Group();
          group.add(ring);
          for (let index = 0; index < 3; index += 1) {
            const arc = new THREE.Mesh(new THREE.TorusGeometry(1.35 + index * 0.22, 0.045, 10, 72), material.clone());
            arc.rotation.set(Math.PI / 2 + index * 0.2, index * 0.4, index * 0.7);
            group.add(arc);
          }
        }
        group.visible = true;
        group.scale.setScalar(1);
        group.children.forEach((child) => {
          if (child instanceof THREE.Mesh) (child.material as Three.MeshBasicMaterial).opacity = 0.92;
        });
        group.position.set(pose.x, pose.y + 0.75, pose.z);
        scene.add(group);
        const wave = pooled ?? { group, material, startedAt: now, active: true };
        wave.startedAt = now;
        wave.active = true;
        shockWaves.push(wave);
        for (let targetId = 0; targetId < actorCount; targetId += 1) {
          if (targetId === actorId) continue;
          const target = actorPose(targetId);
          if (Math.hypot(target.x - pose.x, target.z - pose.z) <= 14 && Math.abs(target.y - pose.y) <= 4.5) {
            attackActor(targetId, "VOLT", now);
            novaHitUntil[targetId] = now + 650;
          }
        }
      };
      const findRivalShortcut = (actorId: number, searchDistance = 4) => {
        const rival = rivalStates[actorId - 1];
        if (!rival || rival.airborne || rival.shortcutActive) return null;
        const shortcuts = CPU_SHORTCUTS[courseDefinition.id] ?? [];
        const currentLap = Math.max(0, Math.floor(rival.progress));
        for (let lap = currentLap; lap <= currentLap + 1; lap += 1) {
          for (const shortcut of shortcuts) {
            const startProgress = lap + shortcut.start;
            const targetProgress = lap + shortcut.end;
            const distanceToTakeoff = (startProgress - rival.progress) * course.length;
            const key = `${lap}:${shortcut.start}`;
            if (
              distanceToTakeoff >= 0 &&
              distanceToTakeoff <= searchDistance &&
              targetProgress < totalLaps - 0.006 &&
              !rival.shortcutKeys.has(key)
            ) {
              return { key, targetProgress };
            }
          }
        }
        return null;
      };
      const launchGiantJump = (actorId: number, now: number) => {
        if (actorId === 0) {
          if (playerState.airborne) return false;
          const nearest = course.nearestSurface(playerState.x, playerState.y, playerState.z, playerState.lastU);
          playerState.recoveryProgress = playerState.progress;
          playerState.recoveryU = nearest.u;
          playerState.recoveryLane = actorLane(0);
          playerState.airborne = true;
          playerState.motionState = "airborne";
          playerState.airborneSince = now;
          playerState.verticalVelocity = Math.sqrt(2 * JUMP_GRAVITY * 4.2);
          playerState.y = playerState.groundY + 0.04;
          playerState.drifting = false;
          playerState.driftCharge = 0;
          return true;
        }
        const rival = rivalStates[actorId - 1];
        const shortcut = pendingRivalShortcuts.get(actorId);
        if (rival.airborne || !shortcut) return false;
        const road = course.pointAt(rival.progress, rival.lane);
        const landing = course.pointAt(shortcut.targetProgress, rival.lane);
        const deltaX = landing.x - road.x;
        const deltaZ = landing.z - road.z;
        const horizontalDistance = Math.hypot(deltaX, deltaZ);
        if (horizontalDistance < 8) {
          pendingRivalShortcuts.delete(actorId);
          return false;
        }
        const launchSpeed = rival.pace
          * (now < rival.boostUntil ? 1.42 : now < rival.auroraUntil ? 1.07 : 1)
          * (rival.driftBoost > 0.001 ? 1.12 : 1);
        const duration = clamp(horizontalDistance / Math.max(24, launchSpeed), 1.05, 2.85);
        rival.shortcutActive = true;
        rival.shortcutProgress = 0;
        rival.shortcutDuration = duration;
        rival.shortcutStartProgress = rival.progress;
        rival.shortcutTargetProgress = shortcut.targetProgress;
        rival.shortcutFromX = road.x;
        rival.shortcutFromY = road.y;
        rival.shortcutFromZ = road.z;
        rival.shortcutToX = landing.x;
        rival.shortcutToY = landing.y;
        rival.shortcutToZ = landing.z;
        rival.shortcutX = road.x;
        rival.shortcutZ = road.z;
        rival.shortcutHeading = Math.atan2(deltaX, deltaZ);
        rival.shortcutKeys.add(shortcut.key);
        pendingRivalShortcuts.delete(actorId);
        rival.airborne = true;
        rival.motionState = "airborne";
        rival.airborneSince = now;
        rival.airSpeed = launchSpeed;
        rival.verticalVelocity = (landing.y - road.y + 0.5 * JUMP_GRAVITY * duration * duration) / duration;
        rival.airY = road.y + 0.04;
        rival.drifting = false;
        rival.driftCharge = 0;
        return true;
      };
      const activateSkillById = (actorId: number, skill: SkillId, now: number) => {
        if (!skillsEnabled) return false;
        const character = actorCharacters[actorId];
        const readyAt = actorId === 0 ? playerState.skillReadyAt : rivalStates[actorId - 1].skillReadyAt;
        if (now < readyAt || actorCrashing(actorId, now)) return false;
        let activated = true;
        if (skill === "PIXEL") activated = spawnProjectile(actorId, "PIXEL");
        if (skill === "VOLT") createShockWave(actorId, now);
        if (skill === "COMET") cometStorms.push({ owner: actorId, until: now + 5000, nextSpawnAt: now });
        if (skill === "GIANT") activated = launchGiantJump(actorId, now);
        if (!activated) return false;
        if (actorId > 0 && character.name === "Gojo" && skill === "COMET") {
          rivalStates[actorId - 1].gojoLastCometAt = now;
        }
        if (actorId === 0) playerState.skillReadyAt = now + character.cooldownMs;
        else rivalStates[actorId - 1].skillReadyAt = now + character.cooldownMs + (character.name === "Gojo" ? 0 : Math.random() * 2400);
        return true;
      };
      const activateActorSkill = (actorId: number, now: number) =>
        activateSkillById(actorId, characterSkill(actorCharacters[actorId]), now);
      const chooseGojoSkill = (actorId: number, now: number): SkillId | null => {
        const rival = rivalStates[actorId - 1];
        const shortcut = findRivalShortcut(actorId);
        if (shortcut) {
          pendingRivalShortcuts.set(actorId, shortcut);
          return "GIANT";
        }
        const cometDue = rival.gojoLastCometAt > 0
          ? now - rival.gojoLastCometAt >= 30000
          : Boolean(raceStart && now - raceStart >= 14000);
        if (!cometDue && findRivalShortcut(actorId, rival.pace * GOJO_CHARACTER.cooldownMs / 1000 + 18)) {
          return null;
        }
        const gojoPose = actorPose(actorId);
        const playerPose = actorPose(0);
        const playerLead = actorProgress(0) - actorProgress(actorId);
        const separation = Math.hypot(gojoPose.x - playerPose.x, gojoPose.y - playerPose.y, gojoPose.z - playerPose.z);
        if (playerLead > 0.13 || cometDue) return "COMET";
        if (separation <= 12 && Math.abs(gojoPose.y - playerPose.y) <= 4.5) return "VOLT";
        if (playerLead > 0.012) return "PIXEL";
        return null;
      };
      const activateActorItem = (actorId: number, now: number) => {
        if (!itemsEnabled) return;
        const item = actorItem(actorId);
        if (item === "EMPTY" || actorCrashing(actorId, now)) return;
        if (item === "FIRE") spawnProjectile(actorId, "FIRE");
        if (item === "HOMING") spawnProjectile(actorId, "HOMING");
        if (item === "SPIKES") spawnTrap(actorId, now);
        if (item === "SHIELD") setActorShield(actorId, true);
        if (item === "BOOST") {
          if (actorId === 0) {
            playerState.boostUntil = now + 2000;
            playerState.speed = Math.max(playerState.speed, 41);
          } else {
            rivalStates[actorId - 1].boostUntil = now + 2000;
          }
        }
        if (item === "AURORA") {
          if (actorId === 0) {
            playerState.auroraUntil = now + 5000;
          } else {
            rivalStates[actorId - 1].auroraUntil = now + 5000;
          }
        }
        if (item === "NOVA") {
          const origin = actorPose(actorId);
          novaEffect.position.set(origin.x, origin.y + 0.8, origin.z);
          novaStarted = now;
          for (let targetId = 0; targetId < actorCount; targetId += 1) {
            if (targetId !== actorId) {
              attackActor(targetId, "NOVA", now);
              novaHitUntil[targetId] = now + 950;
            }
          }
          novaFlashUntil = now + 1050;
        }
        setActorItem(actorId, "EMPTY", now);
      };

      const resize = () => {
        const width = Math.max(1, host.clientWidth);
        const height = Math.max(1, host.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();

      const simulateStep = (now: number, dt: number, deltaMs: number) => {
        syncKartMotionStates(now);
        const racing = phaseRef.current === "racing" && !finished;
        if (racing && !raceStart) raceStart = now;
        const raceElapsedSeconds = raceStart ? Math.max(0, (now - raceStart) / 1000) : 0;
        const playerCrashing = playerState.motionState === "crashing";
        const controllerInput = readGamepadInput();
        const keyboardLeft = Boolean(keys.current.arrowleft || keys.current.a || touch.current.left);
        const keyboardRight = Boolean(keys.current.arrowright || keys.current.d || touch.current.right);
        const digitalSteer = (keyboardLeft ? 1 : 0) + (keyboardRight ? -1 : 0);
        const playerInputSteer = digitalSteer !== 0 ? digitalSteer : controllerInput.steer;

        if (courseDefinition.id === "starlight" && starlightCycle && starlightColors) {
          const dayToSunset = smoothTimeTransition(raceElapsedSeconds, 20, 25);
          const sunsetToNight = smoothTimeTransition(raceElapsedSeconds, 45, 50);
          const scalarCycle = (day: number, sunset: number, night: number) => (
            THREE.MathUtils.lerp(THREE.MathUtils.lerp(day, sunset, dayToSunset), night, sunsetToNight)
          );
          if (scene.background instanceof THREE.Color) {
            mixStarlightColor(scene.background, starlightColors.daySky, starlightColors.sunsetSky, starlightColors.nightSky, dayToSunset, sunsetToNight);
          }
          if (scene.fog instanceof THREE.Fog) {
            mixStarlightColor(scene.fog.color, starlightColors.dayFog, starlightColors.sunsetFog, starlightColors.nightFog, dayToSunset, sunsetToNight);
          }
          mixStarlightColor(starlightCycle.groundMaterial.color, starlightColors.dayGround, starlightColors.sunsetGround, starlightColors.nightGround, dayToSunset, sunsetToNight);
          mixStarlightColor(starlightCycle.concrete.color, starlightColors.dayConcrete, starlightColors.sunsetConcrete, starlightColors.nightConcrete, dayToSunset, sunsetToNight);
          mixStarlightColor(starlightCycle.roadMaterial.color, starlightColors.dayRoad, starlightColors.sunsetRoad, starlightColors.nightRoad, dayToSunset, sunsetToNight);
          starlightCycle.roadMaterial.emissive.copy(starlightColors.sunsetRoadGlow).lerp(starlightColors.nightRoadGlow, sunsetToNight);
          starlightCycle.roadMaterial.emissiveIntensity = 0.14 * dayToSunset * (1 - sunsetToNight) + 0.06 * sunsetToNight;
          mixStarlightColor(starlightCycle.deckMaterial.color, starlightColors.dayDeck, starlightColors.sunsetDeck, starlightColors.nightDeck, dayToSunset, sunsetToNight);
          starlightCycle.prismMaterials.forEach((material) => {
            material.opacity = sunsetToNight;
            material.emissiveIntensity = 0.24 * sunsetToNight;
          });
          starlightCycle.roadMesh.visible = sunsetToNight < 0.995;
          starlightCycle.laneMaterial.emissiveIntensity = 0.8 * sunsetToNight;
          mixStarlightColor(starlightCycle.curbMaterials[0].color, starlightColors.dayCurbA, starlightColors.sunsetCurbA, starlightColors.nightCurbA, dayToSunset, sunsetToNight);
          mixStarlightColor(starlightCycle.curbMaterials[1].color, starlightColors.dayCurbB, starlightColors.sunsetCurbB, starlightColors.nightCurbB, dayToSunset, sunsetToNight);
          starlightCycle.curbMaterials.forEach((material) => {
            material.emissiveIntensity = 0.6 * sunsetToNight;
          });
          starlightCycle.starField.visible = sunsetToNight > 0.002;
          starlightCycle.starMaterial.opacity = 0.92 * sunsetToNight;
          starlightCycle.moon.visible = sunsetToNight > 0.002;
          starlightCycle.moonMaterial.opacity = sunsetToNight;
          starlightCycle.moonMaterial.emissiveIntensity = 0.72 * sunsetToNight;
          starlightCycle.crystalGroup.visible = sunsetToNight > 0.002;
          starlightCycle.crystalMaterials.forEach((material) => {
            material.opacity = sunsetToNight;
            material.emissiveIntensity = 0.72 * sunsetToNight;
          });
          starlightCycle.sunDisc.visible = sunsetToNight < 0.998;
          starlightCycle.sunDiscMaterial.opacity = 0.82 * (1 - sunsetToNight);
          starlightCycle.sunDiscMaterial.color.copy(starlightColors.daySun).lerp(starlightColors.sunsetSun, dayToSunset);
          mixStarlightColor(starlightCycle.hemisphere.color, starlightColors.dayHemiSky, starlightColors.sunsetHemiSky, starlightColors.nightHemiSky, dayToSunset, sunsetToNight);
          mixStarlightColor(starlightCycle.hemisphere.groundColor, starlightColors.dayHemiGround, starlightColors.sunsetHemiGround, starlightColors.nightHemiGround, dayToSunset, sunsetToNight);
          starlightCycle.hemisphere.intensity = scalarCycle(2.15, 2, 1.45);
          mixStarlightColor(starlightCycle.sun.color, starlightColors.daySun, starlightColors.sunsetSun, starlightColors.nightSun, dayToSunset, sunsetToNight);
          starlightCycle.sun.intensity = scalarCycle(3.25, 3.05, 2.1);
        }

        if (oceanTime) oceanTime.value = now * 0.001;
        if (courseDefinition.id === "pirate") {
          seagulls.forEach((gull) => {
            const angle = now * gull.userData.speed + gull.userData.phase;
            const radiusX = gull.userData.radiusX as number;
            const radiusZ = gull.userData.radiusZ as number;
            const x = Math.cos(angle) * radiusX;
            const z = 38 + Math.sin(angle) * radiusZ;
            const y = (gull.userData.height as number) + Math.sin(now * 0.0014 + gull.userData.phase) * 2.4;
            gull.position.set(x, y, z);
            const dx = -Math.sin(angle) * radiusX;
            const dz = Math.cos(angle) * radiusZ;
            gull.rotation.y = Math.atan2(dx, dz);
            const flap = Math.sin(now * 0.009 + gull.userData.phase) * 0.48;
            const leftWing = gull.getObjectByName("wing-left");
            const rightWing = gull.getObjectByName("wing-right");
            if (leftWing) leftWing.rotation.z = -0.18 - flap;
            if (rightWing) rightWing.rotation.z = 0.18 + flap;
          });
        }

        if (racing && courseDefinition.id === "cloud") {
          const tileCount = Math.max(1, cloudPatches.length / 2);
          if (!nextCloudGapChangeAt || now >= nextCloudGapChangeAt) {
            selectedCloudGapKeys.clear();
            const playerTile = Math.floor(wrap01(playerState.progress) * tileCount);
            const chosen: number[] = [];
            for (let attempt = 0; attempt < 30 && chosen.length < 3; attempt += 1) {
              const candidate = 7 + Math.floor(Math.random() * Math.max(1, tileCount - 14));
              const awayFromPlayer = Math.abs(candidate - playerTile) > 6;
              const awayFromOtherGaps = chosen.every((index) => Math.abs(index - candidate) > 8);
              if (awayFromPlayer && awayFromOtherGaps) chosen.push(candidate);
            }
            chosen.forEach((index, choiceIndex) => {
              const side = (index + choiceIndex) % 2 === 0 ? 1 : -1;
              selectedCloudGapKeys.add(`${index}:${side}`);
            });
            cloudGapCycleStartedAt = now;
            nextCloudGapChangeAt = now + 8000;
          }
          cloudGapKeys.clear();
          const age = now - cloudGapCycleStartedAt;
          cloudPatches.forEach((patch) => {
            const key = `${patch.userData.index}:${patch.userData.side}`;
            const selected = selectedCloudGapKeys.has(key);
            const material = patch.userData.surfaceMaterial as Three.MeshStandardMaterial;
            const warningSurface = patch.userData.warningSurface as Three.Mesh;
            const warningMaterial = patch.userData.warningMaterial as Three.MeshBasicMaterial;
            const warningStripes = patch.userData.warningStripes as Three.Group;
            const warningMarkers = patch.userData.warningMarkers as Three.Group;
            const warningBeam = patch.userData.warningBeam as Three.Group;
            const beamAura = patch.userData.beamAura as Three.Mesh;
            const beamCore = patch.userData.beamCore as Three.Mesh;
            const beamImpacts = patch.userData.beamImpacts as Three.Group;
            const beamAuraMaterial = patch.userData.beamAuraMaterial as Three.MeshBasicMaterial;
            const beamCoreMaterial = patch.userData.beamCoreMaterial as Three.MeshBasicMaterial;
            let scale = 1;
            let opacity = 0.98;
            let emissive = 0.1;
            const showingWarning = selected && age >= 0 && age < 3200;
            const showingBeam = selected && age >= 0 && age < 3500;
            warningSurface.visible = showingWarning;
            warningStripes.visible = showingWarning;
            warningMarkers.visible = showingWarning;
            warningBeam.visible = showingBeam;
            warningMaterial.opacity = showingWarning ? 0.42 + Math.abs(Math.sin(now * 0.014)) * 0.48 : 0;
            if (showingBeam) {
              const descent = clamp(age / 2050, 0.015, 1);
              const beamLength = 1 - (1 - descent) ** 3;
              beamAura.scale.set(1 + Math.sin(now * 0.012) * 0.14, beamLength, 1 + Math.sin(now * 0.012) * 0.14);
              beamCore.scale.set(1, beamLength, 1);
              beamAura.position.y = 80 - beamLength * 40;
              beamCore.position.y = 80 - beamLength * 40;
              beamAuraMaterial.opacity = 0.23 + Math.abs(Math.sin(now * 0.01)) * 0.25;
              beamCoreMaterial.opacity = age > 2300 ? 1 : 0.64 + Math.abs(Math.sin(now * 0.017)) * 0.3;
              beamImpacts.visible = beamLength > 0.91;
              beamImpacts.children.forEach((impact, impactIndex) => {
                const pulse = 0.82 + ((now * 0.0018 + impactIndex * 0.38) % 1) * 1.45;
                impact.scale.setScalar(pulse * (impactIndex ? 1.34 : 1));
                impact.rotation.z = now * 0.0028 * (impactIndex ? -1 : 1);
                const impactMaterial = (impact as Three.Mesh).material as Three.MeshBasicMaterial;
                impactMaterial.opacity = age > 2500 ? 1 : 0.52 + Math.abs(Math.sin(now * 0.016)) * 0.42;
              });
            }
            if (showingWarning) {
              const warningPulse = 1 + Math.sin(now * 0.018) * 0.28;
              warningStripes.position.y = Math.sin(now * 0.018) * 0.045;
              warningMarkers.children.forEach((marker, markerIndex) => {
                marker.scale.setScalar(warningPulse + markerIndex * 0.08);
                marker.rotation.z = now * 0.0035 * (markerIndex ? -1 : 1);
              });
            }
            if (selected && age < 2500) {
              const warning = clamp(age / 2500, 0, 1);
              scale = 1 - warning * 0.18 + Math.sin(now * 0.018) * 0.025;
              opacity = 0.56 + Math.sin(now * 0.02) * 0.24;
              emissive = 0.88 + Math.sin(now * 0.02) * 0.35;
            } else if (selected && age < 3200) {
              const vanish = clamp((age - 2500) / 700, 0, 1);
              scale = 0.82 * (1 - vanish) + 0.035;
              opacity = 0.82 * (1 - vanish);
              emissive = 0.7;
              if (vanish > 0.72) cloudGapKeys.add(key);
            } else if (selected && age < 5500) {
              scale = 0.035;
              opacity = 0;
              cloudGapKeys.add(key);
            } else if (selected && age < 6800) {
              const returnAmount = clamp((age - 5500) / 1300, 0, 1);
              scale = 0.035 + returnAmount * 0.965;
              opacity = returnAmount * 0.98;
              emissive = 0.42 * (1 - returnAmount) + 0.1;
              if (returnAmount < 0.28) cloudGapKeys.add(key);
            }
            patch.scale.setScalar(Math.max(0.035, scale));
            material.opacity = clamp(opacity, 0, 1);
            material.emissiveIntensity = emissive;
          });
        }

        updateCustomRoadBreakers(now, racing && courseDefinition.id === "custom");

        if (!playerCrashing && playerState.wasCrashing) {
          const nearest = course.nearestSurface(playerState.x, playerState.y, playerState.z, playerState.lastU);
          const recovery = course.pointAt(nearest.u);
          playerState.x = recovery.x;
          playerState.y = recovery.y;
          playerState.z = recovery.z;
          playerState.heading = recovery.heading;
          playerState.pitch = getKartRoadSupport(nearest.u, 0).pitch;
          playerState.lastU = nearest.u;
          playerState.speed = 9;
          playerState.groundY = recovery.y;
          playerState.airborne = false;
          playerState.motionState = "grounded";
          playerState.verticalVelocity = 0;
          playerState.surfaceVerticalVelocity = 0;
          playerState.offTrackSince = 0;
          playerState.jumpCooldownUntil = now + JUMP_COOLDOWN_MS;
        }
        playerState.wasCrashing = playerCrashing;

        if (racing && !playerCrashing) {
          const gas = mobileAutoDrive.current
            ? 1
            : Math.max(keys.current.arrowup || keys.current.w || touch.current.gas ? 1 : 0, controllerInput.gas);
          const brake = Math.max(keys.current.arrowdown || keys.current.s || touch.current.brake ? 1 : 0, controllerInput.brake);
          const useItem = Boolean(keys.current[" "] || keys.current.e || touch.current.item || controllerInput.item);
          if (itemsEnabled && useItem && !itemPressed && heldItem !== "EMPTY") {
            activateActorItem(0, now);
          }
          itemPressed = Boolean(useItem);
          const useSkill = Boolean(keys.current.q || touch.current.skill || controllerInput.skill);
          if (skillsEnabled && useSkill && !skillPressed) activateActorSkill(0, now);
          skillPressed = useSkill;

          const boosting = now < playerState.boostUntil;
          const auroraActive = now < playerState.auroraUntil;
          const nearestBefore = course.nearestSurface(playerState.x, playerState.y, playerState.z, playerState.lastU);
          const previousMotionPosition = { x: playerState.x, y: playerState.y, z: playerState.z };
          const laneBefore = (playerState.x - nearestBefore.pose.x) * nearestBefore.pose.nx + (playerState.z - nearestBefore.pose.z) * nearestBefore.pose.nz;
          const activeRiverChannel = courseDefinition.id === "river" ? riverChannelAt(playerState.progress, laneBefore) : undefined;
          const riverFlowActive = Boolean(activeRiverChannel && !playerState.airborne);
          if (!playerState.airborne && gas > 0) playerState.speed += (boosting ? 39 : 23) * gas * dt;
          if (!playerState.airborne && brake > 0) playerState.speed -= 30 * brake * dt;
          if (riverFlowActive && playerState.speed > 2) playerState.speed += 3.4 * dt;
          if (riverFlowActive && activeRiverChannel) {
            const currentPull = clamp(activeRiverChannel.lane - laneBefore, -2.2, 2.2) * 0.24 * dt;
            playerState.x += nearestBefore.pose.nx * currentPull;
            playerState.z += nearestBefore.pose.nz * currentPull;
          }
          const onRoad = nearestBefore.distance <= BARRIER_LIMIT + 0.1;
          const steering = playerInputSteer;
          const driftHeld = Boolean(keys.current.shift || touch.current.drift || controllerInput.drift);
          const drifting = !playerState.airborne && driftHeld && steering !== 0 && Math.abs(playerState.speed) > 11 && onRoad;
          if (drifting) {
            playerState.driftCharge = clamp(playerState.driftCharge + dt * 0.46, 0, 1);
            playerState.driftSide = steering;
          } else if (playerState.drifting) {
            if (playerState.driftCharge >= 0.08) playerState.driftBoost = Math.max(playerState.driftBoost, playerState.driftCharge);
            playerState.driftCharge = 0;
          }
          playerState.drifting = drifting;
          const driftDashing = !drifting && playerState.driftBoost > 0.001;
          const driftTurboJustStarted = driftDashing && !wasDriftDashing;
          const driftTurboJustEnded = !driftDashing && wasDriftDashing;
          if (driftTurboJustStarted) {
            driftTurboFadeStartedAt = -10000;
          }
          if (driftTurboJustEnded) driftTurboFadeStartedAt = now;
          wasDriftDashing = driftDashing;
          if (driftDashing && !playerState.airborne) {
            playerState.speed += (18 + playerState.driftBoost * 7) * dt;
            playerState.driftBoost = Math.max(0, playerState.driftBoost - dt * 0.36);
          }
          const steerGrip = clamp(Math.abs(playerState.speed) / 8, 0.18, 1);
          const airSteer = playerState.airborne ? 0.62 : 1;
          playerState.heading += steering * (drifting ? 2.12 : 1.72) * dt * steerGrip * airSteer * (playerState.speed >= 0 ? 1 : -1);
          const rollingDrag = playerState.airborne ? 0.9992 : onRoad ? (drifting ? 0.992 : 0.988) : 0.925;
          playerState.speed *= Math.pow(rollingDrag, deltaMs / 16.67);
          playerState.speed = clamp(playerState.speed, -8, boosting ? 49 : driftDashing ? 44.5 : auroraActive ? 36.5 : riverFlowActive ? 36.2 : onRoad ? 34 : 13);
          playerState.x += Math.sin(playerState.heading) * playerState.speed * dt;
          playerState.z += Math.cos(playerState.heading) * playerState.speed * dt;
          if (drifting) {
            playerState.x -= nearestBefore.pose.nx * steering * Math.abs(playerState.speed) * 0.03 * dt;
            playerState.z -= nearestBefore.pose.nz * steering * Math.abs(playerState.speed) * 0.03 * dt;
          }

          let nearestAfter = course.nearestSurface(playerState.x, playerState.y, playerState.z, nearestBefore.u);
          let lateralOffset = (playerState.x - nearestAfter.pose.x) * nearestAfter.pose.nx + (playerState.z - nearestAfter.pose.z) * nearestAfter.pose.nz;
          if (Math.abs(lateralOffset) > BARRIER_LIMIT) {
            const wallSide = Math.sign(lateralOffset);
            const canClearBarrier = playerState.airborne && playerState.y > nearestAfter.pose.y + 0.55;
            if (canClearBarrier) {
              if (!playerState.offTrackSince) {
                const exitDelta = progressDelta(nearestAfter.u, playerState.lastU);
                playerState.offTrackSince = now;
                playerState.recoveryProgress = Math.max(
                  PLAYER_START_PROGRESS,
                  playerState.progress + (Math.abs(exitDelta) < 0.08 ? exitDelta : 0),
                );
                playerState.recoveryU = nearestAfter.u;
                playerState.recoveryLane = wallSide * (BARRIER_LIMIT - 0.48);
              }
            } else {
              const boundaryLane = wallSide * (BARRIER_LIMIT - 0.28);
              playerState.x = nearestAfter.pose.x + nearestAfter.pose.nx * boundaryLane;
              playerState.z = nearestAfter.pose.z + nearestAfter.pose.nz * boundaryLane;
              playerState.wallBounceUntil = now + 180;
              playerState.wallBounceSide = wallSide;
              nearestAfter = course.nearestSurface(playerState.x, playerState.y, playerState.z, nearestAfter.u);
              lateralOffset = (playerState.x - nearestAfter.pose.x) * nearestAfter.pose.nx + (playerState.z - nearestAfter.pose.z) * nearestAfter.pose.nz;
            }
          }
          if (playerState.offTrackSince) {
            nearestAfter = course.nearestSurface(playerState.x, playerState.y, playerState.z);
            lateralOffset = (playerState.x - nearestAfter.pose.x) * nearestAfter.pose.nx + (playerState.z - nearestAfter.pose.z) * nearestAfter.pose.nz;
          }
          const nextProgressDelta = progressDelta(nearestAfter.u, playerState.lastU);
          if (!playerState.offTrackSince) {
            if (nearestAfter.distance <= BARRIER_LIMIT + 0.1 && Math.abs(nextProgressDelta) < 0.08) playerState.progress += nextProgressDelta;
            playerState.progress = Math.max(PLAYER_START_PROGRESS, playerState.progress);
            playerState.lastU = nearestAfter.u;
          }
          const previousGroundY = playerState.groundY;
          playerState.groundY = nearestAfter.pose.y;
          const maxSurfaceVerticalSpeed = Math.max(4, Math.abs(playerState.speed) * 0.72);
          const measuredSurfaceVerticalSpeed = clamp(
            (playerState.groundY - previousGroundY) / Math.max(dt, 0.001),
            -maxSurfaceVerticalSpeed,
            maxSurfaceVerticalSpeed,
          );
          const cloudTileCount = Math.max(1, cloudPatches.length / 2);
          const cloudTileIndex = Math.floor(wrap01(nearestAfter.u) * cloudTileCount) % cloudTileCount;
          const cloudSide = lateralOffset >= 0 ? 1 : -1;
          const cloudRoadMissing = courseDefinition.id === "cloud" && cloudGapKeys.has(`${cloudTileIndex}:${cloudSide}`);
          const customRoadTileCount = Math.max(1, customRoadPatches.length / 2);
          const customRoadTileIndex = Math.floor(wrap01(nearestAfter.u) * customRoadTileCount) % customRoadTileCount;
          const customRoadMissing = courseDefinition.id === "custom" && customRoadGapKeys.has(`${customRoadTileIndex}:${cloudSide}`);
          const roadMissing = cloudRoadMissing || customRoadMissing;
          if (!playerState.airborne && roadMissing && Math.abs(lateralOffset) <= COURSE_WIDTH) {
            const safeU = wrap01(playerState.lastU - 0.035);
            playerState.recoveryProgress = Math.max(PLAYER_START_PROGRESS, playerState.progress + progressDelta(safeU, playerState.lastU));
            playerState.recoveryU = safeU;
            playerState.recoveryLane = clamp(lateralOffset, -COURSE_WIDTH + 0.5, COURSE_WIDTH - 0.5);
            playerState.airborne = true;
            playerState.motionState = "falling";
            playerState.airborneSince = now;
            playerState.offTrackSince = now;
            playerState.verticalVelocity = Math.min(0, playerState.surfaceVerticalVelocity);
            playerState.y = playerState.groundY + 0.02;
            playerState.drifting = false;
            playerState.driftCharge = 0;
          }
          if (playerState.airborne) {
            const previousAirY = playerState.y;
            playerState.verticalVelocity -= JUMP_GRAVITY * dt;
            playerState.y += playerState.verticalVelocity * dt;
            const flightPitch = clamp(-Math.atan2(playerState.verticalVelocity, Math.max(8, Math.abs(playerState.speed))), -0.32, 0.36);
            playerState.pitch = THREE.MathUtils.lerp(playerState.pitch, flightPitch, 0.1);
            const overRoad = Math.abs(lateralOffset) <= BARRIER_LIMIT && !roadMissing;
            const previousRoadClearance = previousAirY - previousGroundY;
            const currentRoadClearance = playerState.y - playerState.groundY;
            const descendingTowardRoad = playerState.verticalVelocity <= 0.05;
            const sweptRoadContact = descendingTowardRoad
              ? findSweptRoadContact(
                  previousMotionPosition,
                  { x: playerState.x, y: playerState.y, z: playerState.z },
                  playerState.offTrackSince ? undefined : nearestBefore.u,
                )
              : null;
            const sweptRoadCrossing = Boolean(overRoad && !roadMissing && sweptRoadContact);
            const crossedRoadFromAbove = (
              overRoad
              && descendingTowardRoad
              && previousRoadClearance >= -0.08
              && currentRoadClearance <= 0.025
            );
            const landingCatchDepth = (
              Math.abs(playerState.verticalVelocity * dt)
              + Math.abs(playerState.groundY - previousGroundY)
              + 0.18
            );
            const shallowRoadPenetration = (
              overRoad
              && descendingTowardRoad
              && currentRoadClearance <= 0.025
              && currentRoadClearance >= -landingCatchDepth
            );
            const reachedRoadSurface = sweptRoadCrossing || crossedRoadFromAbove || (!playerState.offTrackSince && shallowRoadPenetration);
            if (now - playerState.airborneSince > 90 && reachedRoadSurface) {
              if (playerState.offTrackSince) {
                playerState.progress = Math.max(
                  PLAYER_START_PROGRESS,
                  playerState.recoveryProgress + progressDelta(nearestAfter.u, playerState.recoveryU),
                );
                playerState.lastU = nearestAfter.u;
                playerState.offTrackSince = 0;
              }
              playerState.airborne = false;
              playerState.motionState = "grounded";
              playerState.y = playerState.groundY;
              playerState.verticalVelocity = 0;
              playerState.surfaceVerticalVelocity = measuredSurfaceVerticalSpeed;
              playerState.pitch = getKartRoadSupport(nearestAfter.u, lateralOffset).pitch;
              playerState.landingImpactUntil = now + 360;
              playerState.jumpCooldownUntil = Math.max(playerState.jumpCooldownUntil, now + 650);
            } else if (
              !Number.isFinite(playerState.y)
              || playerState.y <= WORLD_GROUND_Y
              || now - (playerState.offTrackSince || playerState.airborneSince) >= 7000
            ) {
              recoverPlayerFromFall(now);
            }
          } else {
            const jumpLane = clamp(lateralOffset, -BARRIER_LIMIT, BARRIER_LIMIT);
            const horizontalSpeed = Math.abs(playerState.speed);
            const separationProfile = getRoadSeparationProfile(
              playerState.progress,
              jumpLane,
              horizontalSpeed,
              playerState.surfaceVerticalVelocity,
            );
            if (horizontalSpeed >= JUMP_MIN_SPEED && now >= playerState.jumpCooldownUntil && separationProfile.separatesFromRoad) {
              playerState.recoveryProgress = playerState.progress;
              playerState.recoveryU = playerState.lastU;
              playerState.recoveryLane = jumpLane;
              playerState.airborne = true;
              playerState.motionState = "airborne";
              playerState.airborneSince = now;
              playerState.verticalVelocity = playerState.surfaceVerticalVelocity;
              playerState.y = Math.max(
                playerState.groundY + 0.03,
                playerState.y + playerState.verticalVelocity * dt - 0.5 * JUMP_GRAVITY * dt * dt,
              );
              playerState.pitch = clamp(-Math.atan2(playerState.verticalVelocity, Math.max(8, horizontalSpeed)), -0.32, 0.36);
              playerState.drifting = false;
              playerState.driftCharge = 0;
              playerState.jumpCooldownUntil = now + JUMP_COOLDOWN_MS;
            } else {
              const suspensionResponse = 1 - Math.exp(-dt / 0.11);
              playerState.surfaceVerticalVelocity = THREE.MathUtils.lerp(
                playerState.surfaceVerticalVelocity,
                measuredSurfaceVerticalSpeed,
                suspensionResponse,
              );
              playerState.y = playerState.groundY;
              playerState.pitch = getKartRoadSupport(nearestAfter.u, lateralOffset).pitch;
            }
          }

          if ((gas || boosting || driftDashing || drifting || auroraActive) && Math.abs(playerState.speed) > 4) {
            exhaustLife[exhaustCursor] = 1;
            const base = exhaustCursor * 3;
            exhaustPositions[base] = playerState.x - Math.sin(playerState.heading) * 2.1 + (Math.random() - 0.5) * 0.35;
            exhaustPositions[base + 1] = playerState.y + 0.58 + Math.random() * 0.2;
            exhaustPositions[base + 2] = playerState.z - Math.cos(playerState.heading) * 2.1 + (Math.random() - 0.5) * 0.35;
            exhaustCursor = (exhaustCursor + 1) % exhaustCount;
          }

          const effectForwardX = Math.sin(playerState.heading);
          const effectForwardZ = Math.cos(playerState.heading);
          const effectRightX = Math.cos(playerState.heading);
          const effectRightZ = -Math.sin(playerState.heading);
          if (drifting && onRoad && !playerState.airborne) {
            [-1, 1].forEach((side) => {
              if (Math.random() > 0.2) {
                const dustX = playerState.x - effectForwardX * 1.18 + effectRightX * side * 1.2;
                const dustZ = playerState.z - effectForwardZ * 1.18 + effectRightZ * side * 1.2;
                emitDriftDust(dustX, playerState.y + 0.12, dustZ, playerState.heading, side * 0.95);
              }
            });
          }
          if ((boosting || driftDashing) && !playerState.airborne) {
            for (let sparkIndex = 0; sparkIndex < (driftDashing ? 3 : 2); sparkIndex += 1) {
              emitDriveSpark(
                playerState.x - effectForwardX * (2.05 + Math.random() * 0.45) + effectRightX * (Math.random() - 0.5) * 1.2,
                playerState.y + 0.4 + Math.random() * 0.36,
                playerState.z - effectForwardZ * (2.05 + Math.random() * 0.45) + effectRightZ * (Math.random() - 0.5) * 1.2,
                playerState.heading,
                sparkIndex % 2 === 0 ? [0.12, 0.74, 1] : [0.72, 0.96, 1],
              );
            }
          }
          if (driftTurboJustStarted && !playerState.airborne) {
            emitTurboBurstSparks();
          }

          const driftTurboFade = clamp(1 - (now - driftTurboFadeStartedAt) / DRIFT_TURBO_FADE_MS, 0, 1);
          const turboVisualActive = boosting || driftDashing || driftTurboFade > 0;
          turboFlames.visible = turboVisualActive && !playerState.airborne && !playerCrashing;
          if (turboFlames.visible) {
            const driftStrength = driftDashing
              ? clamp(0.64 + playerState.driftBoost * 0.72, 0.64, 1.32)
              : driftTurboFade > 0
                ? 0.22 + driftTurboFade * 0.48
                : 1;
            const flamePulse = driftStrength * (0.86 + Math.random() * 0.3);
            turboFlames.scale.set(1, 1, flamePulse);
            turboOuterMaterial.opacity = (boosting ? 0.76 : 0.68) * Math.max(0.28, driftStrength);
            turboInnerMaterial.opacity = (boosting ? 0.98 : 0.9) * Math.max(0.34, driftStrength);
            if (!boosting && !driftDashing && driftTurboFade > 0 && Math.random() > 0.38) {
              emitDriveSpark(
                playerState.x - effectForwardX * 2.18 + effectRightX * (Math.random() - 0.5) * 1.35,
                playerState.y + 0.35 + Math.random() * 0.25,
                playerState.z - effectForwardZ * 2.18 + effectRightZ * (Math.random() - 0.5) * 1.35,
                playerState.heading,
                Math.random() > 0.45 ? [0.2, 0.76, 1] : [0.82, 0.98, 1],
                0,
                0.72 * driftTurboFade,
              );
            }
          }

          const position = 1 + rivalStates.filter((rival) => rival.progress > playerState.progress).length;
          if (now - hudTick > 80) {
            hudTick = now;
            onTelemetry(
              Math.max(0, playerState.speed * 7.1),
              playerState.progress,
              position,
              drifting ? playerState.driftCharge : playerState.driftBoost,
              driftDashing,
            );
            onSkillChange(
              Math.max(0, playerState.skillReadyAt - now),
              selectedCharacter.cooldownMs,
              selectedCharacter.name === "COMET" && cometStorms.some((storm) => storm.owner === 0 && now < storm.until),
            );
          }
          if (playerState.progress >= totalLaps - 0.005) {
            finished = true;
            playerState.speed *= 0.45;
            const finishOrder = [...actorIds].sort((a, b) => actorProgress(b) - actorProgress(a));
            onFinish(now - raceStart, finishOrder.indexOf(0) + 1, finishOrder);
          }
        } else {
          if (!racing) {
            itemPressed = false;
            skillPressed = false;
          }
          playerState.speed *= 0.94;
          if (phaseRef.current !== "racing") raceStart = 0;
        }

        if (racing) {
          rivalStates.forEach((rival, index) => {
            if (now >= rival.crashUntil) {
              if (rival.shortcutActive) {
                const previousProgress = rival.shortcutProgress;
                rival.shortcutProgress = Math.min(1, rival.shortcutProgress + dt / rival.shortcutDuration);
                const flightStep = (rival.shortcutProgress - previousProgress) * rival.shortcutDuration;
                rival.progress = THREE.MathUtils.lerp(
                  rival.shortcutStartProgress,
                  rival.shortcutTargetProgress,
                  rival.shortcutProgress,
                );
                rival.shortcutX = THREE.MathUtils.lerp(rival.shortcutFromX, rival.shortcutToX, rival.shortcutProgress);
                rival.shortcutZ = THREE.MathUtils.lerp(rival.shortcutFromZ, rival.shortcutToZ, rival.shortcutProgress);
                rival.airY += rival.verticalVelocity * flightStep - 0.5 * JUMP_GRAVITY * flightStep * flightStep;
                rival.verticalVelocity -= JUMP_GRAVITY * flightStep;
                rival.drifting = false;
                rival.driftCharge = 0;
                if (rival.shortcutProgress >= 1) {
                  rival.shortcutActive = false;
                  rival.airborne = false;
                  rival.motionState = "grounded";
                  rival.progress = rival.shortcutTargetProgress;
                  rival.airY = rival.shortcutToY;
                  rival.verticalVelocity = 0;
                  rival.surfaceVerticalVelocity = 0;
                  rival.landingImpactUntil = now + 330;
                  rival.jumpCooldownUntil = now + JUMP_COOLDOWN_MS;
                }
              } else {
              if (courseDefinition.id === "river") {
                const channel = riverChannelForProgress(rival.progress + 0.012);
                if (channel) rival.lane = THREE.MathUtils.lerp(rival.lane, channel.lane, 1 - Math.exp(-dt * 1.6));
              }
              const current = course.pointAt(rival.progress, rival.lane);
              const ahead = course.pointAt(rival.progress + 0.012, rival.lane);
              let turn = ahead.heading - current.heading;
              if (turn > Math.PI) turn -= TAU;
              if (turn < -Math.PI) turn += TAU;
              const wantsDrift = !rival.airborne && Math.abs(turn) > 0.065;
              if (wantsDrift) {
                rival.drifting = true;
                rival.driftSide = Math.sign(turn);
                rival.driftCharge = clamp(rival.driftCharge + dt * 0.42, 0, 1);
              } else if (rival.drifting) {
                if (rival.driftCharge >= 0.08) rival.driftBoost = Math.max(rival.driftBoost, rival.driftCharge);
                rival.driftCharge = 0;
                rival.drifting = false;
              }
              const driftPace = rival.driftBoost > 0.001 ? 1.12 : 1;
              rival.driftBoost = Math.max(0, rival.driftBoost - dt * 0.38);
              const riverPace = courseDefinition.id === "river" && riverChannelAt(rival.progress, rival.lane) ? 1.055 : 1;
              const paceBoost = (now < rival.boostUntil ? 1.42 : now < rival.auroraUntil ? 1.07 : 1) * driftPace * riverPace;
              const cornerPace = wantsDrift ? 0.9 : 1;
              const groundWorldSpeed = rival.pace * paceBoost * cornerPace;
              const previousRivalAirY = rival.airY;
              const previousRivalRoadY = current.y;
              if (rival.airborne) rival.airSpeed *= Math.pow(0.9992, deltaMs / 16.67);
              const rivalWorldSpeed = rival.airborne ? rival.airSpeed : groundWorldSpeed;
              rival.progress += (rivalWorldSpeed / course.length) * dt;
              const roadPoint = course.pointAt(rival.progress, rival.lane);
              const rivalCloudTileCount = Math.max(1, cloudPatches.length / 2);
              const rivalCloudTileIndex = Math.floor(wrap01(rival.progress) * rivalCloudTileCount) % rivalCloudTileCount;
              const rivalCloudSide = rival.lane >= 0 ? 1 : -1;
              const rivalCloudRoadMissing = courseDefinition.id === "cloud" && cloudGapKeys.has(`${rivalCloudTileIndex}:${rivalCloudSide}`);
              const rivalCustomRoadTileCount = Math.max(1, customRoadPatches.length / 2);
              const rivalCustomRoadTileIndex = Math.floor(wrap01(rival.progress) * rivalCustomRoadTileCount) % rivalCustomRoadTileCount;
              const rivalCustomRoadMissing = courseDefinition.id === "custom" && customRoadGapKeys.has(`${rivalCustomRoadTileIndex}:${rivalCloudSide}`);
              const rivalRoadMissing = rivalCloudRoadMissing || rivalCustomRoadMissing;
              const maxSurfaceVerticalSpeed = Math.max(4, rivalWorldSpeed * 0.72);
              const measuredSurfaceVerticalSpeed = clamp(
                (roadPoint.y - current.y) / Math.max(dt, 0.001),
                -maxSurfaceVerticalSpeed,
                maxSurfaceVerticalSpeed,
              );
              if (rival.airborne) {
                rival.verticalVelocity -= JUMP_GRAVITY * dt;
                rival.airY += rival.verticalVelocity * dt;
                const previousClearance = previousRivalAirY - previousRivalRoadY;
                const currentClearance = rival.airY - roadPoint.y;
                const landingCatchDepth = Math.abs(rival.verticalVelocity * dt) + Math.abs(roadPoint.y - previousRivalRoadY) + 0.18;
                const sweptRivalLanding = rival.verticalVelocity <= 0.05 && (
                  (previousClearance >= -0.08 && currentClearance <= 0.025)
                  || (currentClearance <= 0.025 && currentClearance >= -landingCatchDepth)
                );
                if (rival.cloudFallUntil && now >= rival.cloudFallUntil) {
                  rival.cloudFallUntil = 0;
                  crashActor(index + 1, now);
                } else if (!rival.cloudFallUntil && !rivalRoadMissing && now - rival.airborneSince > 90 && sweptRivalLanding) {
                  rival.airborne = false;
                  rival.motionState = "grounded";
                  rival.airY = roadPoint.y;
                  rival.airSpeed = 0;
                  rival.verticalVelocity = 0;
                  rival.surfaceVerticalVelocity = measuredSurfaceVerticalSpeed;
                  rival.landingImpactUntil = now + 330;
                  rival.jumpCooldownUntil = Math.max(rival.jumpCooldownUntil, now + 650);
                }
              } else {
                const separationProfile = getRoadSeparationProfile(
                  rival.progress,
                  rival.lane,
                  rivalWorldSpeed,
                  rival.surfaceVerticalVelocity,
                );
                if (rivalRoadMissing) {
                  rival.airborne = true;
                  rival.motionState = "falling";
                  rival.airborneSince = now;
                  rival.airSpeed = rivalWorldSpeed;
                  rival.verticalVelocity = Math.min(0, rival.surfaceVerticalVelocity);
                  rival.airY = roadPoint.y + 0.02;
                  rival.cloudFallUntil = now + 1050;
                  rival.drifting = false;
                  rival.driftCharge = 0;
                } else if (rivalWorldSpeed >= JUMP_MIN_SPEED && now >= rival.jumpCooldownUntil && separationProfile.separatesFromRoad) {
                  rival.airborne = true;
                  rival.motionState = "airborne";
                  rival.airborneSince = now;
                  rival.airSpeed = rivalWorldSpeed;
                  rival.verticalVelocity = rival.surfaceVerticalVelocity;
                  rival.airY = Math.max(
                    roadPoint.y + 0.03,
                    rival.airY + rival.verticalVelocity * dt - 0.5 * JUMP_GRAVITY * dt * dt,
                  );
                  rival.drifting = false;
                  rival.driftCharge = 0;
                  rival.jumpCooldownUntil = now + JUMP_COOLDOWN_MS;
                } else {
                  const suspensionResponse = 1 - Math.exp(-dt / 0.11);
                  rival.surfaceVerticalVelocity = THREE.MathUtils.lerp(
                    rival.surfaceVerticalVelocity,
                    measuredSurfaceVerticalSpeed,
                    suspensionResponse,
                  );
                  rival.airY = roadPoint.y;
                }
              }
              }
              if (itemsEnabled && rival.item !== "EMPTY" && now >= rival.useAt) activateActorItem(index + 1, now);
              if (skillsEnabled && !rival.skillScheduled) {
                rival.skillReadyAt = now + rival.skillInitialDelay;
                rival.skillScheduled = true;
              }
              if (skillsEnabled && now >= rival.skillReadyAt) {
                const actorId = index + 1;
                if (rival.character.name === "Gojo") {
                  const chosenSkill = chooseGojoSkill(actorId, now);
                  if (chosenSkill && !activateSkillById(actorId, chosenSkill, now) && chosenSkill === "GIANT") {
                    pendingRivalShortcuts.delete(actorId);
                    activateSkillById(actorId, "PIXEL", now);
                  }
                } else if (rival.character.name === "GIANT") {
                  const shortcut = actorRank(actorId) >= 3 ? findRivalShortcut(actorId) : null;
                  if (shortcut) {
                    pendingRivalShortcuts.set(actorId, shortcut);
                    if (!activateSkillById(actorId, "GIANT", now)) pendingRivalShortcuts.delete(actorId);
                  }
                } else {
                  activateActorSkill(actorId, now);
                }
              }
            }
          });

          if (courseDefinition.id === "jungle") {
            monkeys.forEach((monkey, index) => {
              const roamSpeed = (3.4 + index * 0.42) / course.length;
              monkey.progress = wrap01(monkey.progress + monkey.direction * roamSpeed * dt);
              monkey.lane = Math.sin(now * (0.00062 + index * 0.00005) + monkey.wanderPhase) * 6.7;
              const monkeyPose = course.pointAt(monkey.progress, monkey.lane);
              if (!monkey.nextTrapAt) monkey.nextTrapAt = now + 2400 + index * 980;
              if (now >= monkey.nextTrapAt) {
                createTrapAt(-1, monkey.progress - monkey.direction * 1.4 / course.length, monkey.lane, now);
                monkey.actionUntil = now + 850;
                monkey.nextTrapAt = now + 7200 + Math.random() * 4200;
              }
              const acting = now < monkey.actionUntil;
              const walkingBounce = Math.abs(Math.sin(now * 0.009 + index)) * 0.13;
              monkey.group.position.set(monkeyPose.x, monkeyPose.y + 0.03 + (acting ? Math.abs(Math.sin(now * 0.018)) * 0.36 : walkingBounce), monkeyPose.z);
              monkey.group.rotation.y = monkeyPose.heading + (monkey.direction > 0 ? Math.PI : 0);
              monkey.group.rotation.z = acting ? Math.sin(now * 0.022) * 0.12 : 0;
              monkey.group.children.forEach((part) => {
                if (part.name.startsWith("arm-")) part.rotation.x = acting ? -1.1 + Math.sin(now * 0.026) * 0.5 : 0;
              });
              for (let actorId = 0; actorId < actorCount; actorId += 1) {
                const pose = actorPose(actorId);
                if (Math.hypot(monkeyPose.x - pose.x, monkeyPose.y + 1.05 - (pose.y + 0.8), monkeyPose.z - pose.z) < 2.05) {
                  const contactKey = `${index}:${actorId}`;
                  if (now >= (monkeyContactCooldowns.get(contactKey) ?? 0)) {
                    const result = attackActor(actorId, "MONKEY", now);
                    monkeyContactCooldowns.set(contactKey, now + (result === "blocked" ? 900 : 1500));
                  }
                }
              }
            });
          }

          if (courseDefinition.id === "river") {
            waterUniforms.forEach((uniform, index) => { uniform.value = now * 0.001 + index * 0.73; });
            if (waterFlow && (!lastWaterFlowUpdateAt || now - lastWaterFlowUpdateAt >= 33)) {
              const flowDt = lastWaterFlowUpdateAt ? Math.min(0.08, (now - lastWaterFlowUpdateAt) / 1000) : dt;
              lastWaterFlowUpdateAt = now;
              const positions = waterFlow.points.geometry.getAttribute("position") as Three.BufferAttribute;
              waterFlow.particles.forEach((particle, particleIndex) => {
                const channel = RIVER_CHANNELS[particle.channelIndex];
                particle.progress += (particle.speed / course.length) * flowDt;
                if (particle.progress > channel.end) particle.progress = channel.start + (particle.progress - channel.end);
                const lane = channel.lane + particle.laneOffset + Math.sin(now * 0.0015 + particle.phase) * 0.18;
                const point = course.sampledPointAtInto(particle.progress, lane, particle.pose);
                positions.setXYZ(particleIndex, point.x, point.y + 0.54 + Math.sin(now * 0.006 + particle.phase) * 0.06, point.z);
              });
              positions.needsUpdate = true;
            }
            flowingLogs.forEach((log, index) => {
              const channel = RIVER_CHANNELS[log.channelIndex];
              log.progress = wrap01(log.progress + (2.6 + index * 0.16) * dt / course.length);
              if (log.progress > channel.end || log.progress < channel.start) log.progress = channel.start + 0.008;
              log.lane = channel.lane + Math.sin(now * 0.0008 + log.phase) * Math.max(0.5, channel.halfWidth - 1.35) * 0.62;
              const pose = course.pointAt(log.progress, log.lane);
              log.group.position.set(pose.x, pose.y + 0.36 + Math.sin(now * 0.004 + log.phase) * 0.08, pose.z);
              log.group.rotation.y = pose.heading + Math.sin(now * 0.0012 + log.phase) * 0.22;
              log.group.rotation.x = Math.sin(now * 0.002 + log.phase) * 0.06;
              for (let actorId = 0; actorId < actorCount; actorId += 1) {
                if (actorCrashing(actorId, now)) continue;
                const actor = actorPose(actorId);
                if (Math.hypot(pose.x - actor.x, pose.y + 0.8 - actor.y, pose.z - actor.z) < 2.7) {
                  const key = `log-${index}-${actorId}`;
                  if (now >= (obstacleContactCooldowns.get(key) ?? 0)) {
                    bumpActor(actorId, log.lane, now);
                    obstacleContactCooldowns.set(key, now + 520);
                  }
                }
              }
            });
          }

          if (courseDefinition.id === "cloud") {
            beanstalks.forEach((beanstalk, index) => {
              const pose = course.pointAt(beanstalk.progress, beanstalk.lane);
              beanstalk.group.rotation.y = Math.sin(now * 0.00035 + index) * 0.08;
              for (let actorId = 0; actorId < actorCount; actorId += 1) {
                if (actorCrashing(actorId, now)) continue;
                const actor = actorPose(actorId);
                if (Math.hypot(pose.x - actor.x, pose.z - actor.z) < 2.45 && Math.abs(pose.y - actor.y) < 3.2) {
                  const key = `bean-${index}-${actorId}`;
                  if (now >= (obstacleContactCooldowns.get(key) ?? 0)) {
                    bumpActor(actorId, beanstalk.lane, now);
                    obstacleContactCooldowns.set(key, now + 520);
                  }
                }
              }
            });
          }

          if (courseDefinition.id === "pirate") {
            cannons.forEach((cannon, index) => {
              const cycle = wrap01(now * 0.00024 + cannon.phase);
              const firing = cycle >= 0.18 && cycle <= 0.78;
              cannon.ball.visible = firing;
              cannon.group.rotation.z = cycle < 0.24 ? Math.sin(clamp((cycle - 0.18) / 0.06, 0, 1) * Math.PI) * cannon.side * 0.08 : 0;
              if (!firing) return;
              const flight = clamp((cycle - 0.18) / 0.6, 0, 1);
              cannon.lane = cannon.side * (14.4 - flight * 28.8);
              const pose = course.pointAt(cannon.progress, cannon.lane);
              cannon.ball.position.set(pose.x, pose.y + 1.15 + Math.sin(flight * Math.PI) * 0.52, pose.z);
              cannon.ball.rotation.y = pose.heading;
              cannon.ball.scale.setScalar(1 + Math.sin(flight * Math.PI) * 0.08);
              for (let actorId = 0; actorId < actorCount; actorId += 1) {
                const actor = actorPose(actorId);
                if (Math.hypot(pose.x - actor.x, pose.y + 1 - actor.y, pose.z - actor.z) < 3.15) {
                  const key = `cannon-${index}-${actorId}`;
                  if (now >= (obstacleContactCooldowns.get(key) ?? 0)) {
                    attackActor(actorId, "CANNON", now);
                    obstacleContactCooldowns.set(key, now + 1700);
                  }
                }
              }
            });
          }

          if (courseDefinition.id === "custom" && customHazardStates.length) {
            const inRange = (progress: number, start: number, end: number) => {
              const wrapped = wrap01(progress);
              return wrapped >= start && wrapped <= end;
            };
            customHazardStates.forEach((state, index) => {
              const { config } = state;
              if (!config.enabled) return;
              if (config.type === "monkey") {
                const movement = (Math.sin(now * 0.00055 * config.speed + index * 1.7) + 1) / 2;
                const monkeyProgress = state.start + (state.end - state.start) * (0.1 + movement * 0.8);
                const monkeyLane = clamp(config.lane + Math.sin(now * 0.0009 * config.speed + index) * config.width * 0.32, -7, 7);
                const pose = course.pointAt(monkeyProgress, monkeyLane);
                state.group.position.set(pose.x, pose.y + Math.abs(Math.sin(now * 0.008)) * 0.12, pose.z);
                state.group.rotation.y = pose.heading + (Math.cos(now * 0.00055 * config.speed + index * 1.7) > 0 ? Math.PI : 0);
                if (!state.nextAt) state.nextAt = now + config.interval * 600;
                if (now >= state.nextAt) {
                  createTrapAt(-1, monkeyProgress, monkeyLane, now);
                  state.nextAt = now + config.interval * 1000;
                }
                for (let actorId = 0; actorId < actorCount; actorId += 1) {
                  const actor = actorPose(actorId);
                  if (Math.hypot(pose.x - actor.x, pose.z - actor.z) < 2.05 && Math.abs(pose.y - actor.y) < 2.8) {
                    const key = `custom-monkey-${index}-${actorId}`;
                    if (now >= (obstacleContactCooldowns.get(key) ?? 0)) {
                      attackActor(actorId, "MONKEY", now);
                      obstacleContactCooldowns.set(key, now + 1300);
                    }
                  }
                }
              } else if (config.type === "cloud-beam") {
                // The warning beam, missing road and recovery are updated before
                // vehicle physics so this uses the same fall behavior as the cloud course.
              } else if (config.type === "river") {
                const waterMaterial = state.group.userData.waterMaterial as Three.MeshPhysicalMaterial | undefined;
                if (waterMaterial) {
                  waterMaterial.emissiveIntensity = 0.12 + Math.sin(now * 0.0045 * config.speed + index) * 0.035;
                  waterMaterial.opacity = 0.52 + Math.sin(now * 0.0033 * config.speed + index) * 0.045;
                }
                const foamMaterial = state.group.userData.foamMaterial as Three.MeshBasicMaterial | undefined;
                if (foamMaterial) foamMaterial.opacity = 0.1 + Math.abs(Math.sin(now * 0.0052 * config.speed + index)) * 0.14;
                const flowMaterials = state.group.userData.flowMaterials as Three.MeshBasicMaterial[] | undefined;
                flowMaterials?.forEach((material, flowIndex) => {
                  material.opacity = 0.1 + Math.abs(Math.sin(now * 0.007 * config.speed - flowIndex * 0.72 + index)) * 0.26;
                });
                for (let actorId = 0; actorId < actorCount; actorId += 1) {
                  if (!inRange(actorProgress(actorId), state.start, state.end)) continue;
                  if (Math.abs(actorLane(actorId) - config.lane) > config.width / 2) continue;
                  if (actorId === 0) {
                    playerState.speed += dt * (1.2 + config.intensity * 0.75) * config.speed;
                  } else {
                    rivalStates[actorId - 1].progress += dt * (0.75 + config.intensity * 0.28) * config.speed / course.length;
                  }
                }
              } else if (config.type === "cannon" && state.effect) {
                const cycleMs = Math.max(2200, config.interval * 1000 / config.speed);
                const cycle = (now % cycleMs) / cycleMs;
                const firing = cycle >= 0.18 && cycle <= 0.78;
                state.effect.visible = firing;
                if (firing) {
                  const side = config.lane >= 0 ? 1 : -1;
                  const flight = clamp((cycle - 0.18) / 0.6, 0, 1);
                  const ballLane = side * (14.4 - flight * 28.8);
                  const pose = course.pointAt(state.center, ballLane);
                  state.effect.position.set(pose.x, pose.y + 1.15 + Math.sin(flight * Math.PI) * 0.55, pose.z);
                  state.effect.scale.setScalar(0.85 + config.intensity * 0.18);
                  for (let actorId = 0; actorId < actorCount; actorId += 1) {
                    const actor = actorPose(actorId);
                    if (Math.hypot(pose.x - actor.x, pose.y + 1 - actor.y, pose.z - actor.z) < 2.8 + config.intensity * 0.25) {
                      const key = `custom-cannon-${index}-${actorId}`;
                      if (now >= (obstacleContactCooldowns.get(key) ?? 0)) {
                        attackActor(actorId, "CANNON", now);
                        obstacleContactCooldowns.set(key, now + 1600);
                      }
                    }
                  }
                }
              } else if (config.type === "shooting-star") {
                if (!state.nextAt) state.nextAt = now + 700;
                if (now >= state.nextAt) {
                  for (let starIndex = 0; starIndex < config.intensity; starIndex += 1) {
                    const progress = state.start + Math.random() * Math.max(0.001, state.end - state.start);
                    const lane = clamp(config.lane + (Math.random() - 0.5) * config.width, -7.2, 7.2);
                    spawnShootingStar(progress, lane, config.speed);
                  }
                  state.nextAt = now + config.interval * 1000;
                }
              }
            });
          }

          const starlightShootingStarsEnabled = courseDefinition.id === "starlight" && racing && raceElapsedSeconds >= 50;
          if (starlightShootingStarsEnabled) {
            if (!nextShootingStarAt) nextShootingStarAt = now + 900;
            if (now >= nextShootingStarAt) {
              spawnShootingStar();
              const frequencyMultiplier = raceElapsedSeconds >= 70 ? 2 : 1;
              nextShootingStarAt = now + (950 + Math.random() * 850) / frequencyMultiplier;
            }
          }

          if (courseDefinition.id === "starlight" || (courseDefinition.id === "custom" && customHazardStates.some((state) => state.config.type === "shooting-star" && state.config.enabled))) {
            shootingStars.forEach((star) => {
              if (!star.active) return;
              const roadPoint = course.pointAt(star.progress, star.lane);
              star.y -= star.fallSpeed * dt;
              star.group.position.set(roadPoint.x, star.y, roadPoint.z);
              star.group.quaternion.copy(camera.quaternion);
              star.group.rotateZ(Math.sin(now * 0.004 + star.progress * 17) * 0.22);
              const warningPulse = 1 + Math.sin(now * 0.018) * 0.24;
              star.warning.scale.setScalar(warningPulse);
              let hitRacer = false;
              for (let actorId = 0; actorId < actorCount; actorId += 1) {
                const pose = actorPose(actorId);
                if (Math.hypot(roadPoint.x - pose.x, roadPoint.z - pose.z) < 2.05 && Math.abs(star.y - (pose.y + 0.9)) < 1.65) {
                  crashActor(actorId, now);
                  novaHitUntil[actorId] = now + 620;
                  hitRacer = true;
                  break;
                }
              }
              if (hitRacer || star.y <= roadPoint.y + 0.35) shatterShootingStar(star, now);
            });
            releaseInactiveVisuals(shootingStars, () => shootingStarPool);
          }

          for (let index = cometStorms.length - 1; index >= 0; index -= 1) {
            const storm = cometStorms[index];
            if (now >= storm.until) {
              cometStorms.splice(index, 1);
              continue;
            }
            if (now >= storm.nextSpawnAt) {
              spawnSkillMeteor(storm.owner);
              storm.nextSpawnAt = now + 330 + Math.random() * 240;
            }
          }
          skillMeteors.forEach((meteor) => {
            if (!meteor.active) return;
            const roadPoint = course.pointAt(meteor.progress, meteor.lane);
            meteor.y -= meteor.fallSpeed * dt;
            meteor.group.position.set(roadPoint.x, meteor.y, roadPoint.z);
            meteor.group.rotation.x += dt * 4.8;
            meteor.group.rotation.z += dt * 3.6;
            meteor.warning.scale.setScalar(1 + Math.sin(now * 0.021 + meteor.progress * 11) * 0.3);
            let hitRacer = false;
            for (let actorId = 0; actorId < actorCount; actorId += 1) {
              const targetName = actorCharacters[actorId].name;
              const immuneToMeteor = meteor.blue ? targetName === "Gojo" : targetName === "COMET";
              if (actorId === meteor.owner || immuneToMeteor) continue;
              const pose = actorPose(actorId);
              if (Math.hypot(roadPoint.x - pose.x, roadPoint.z - pose.z) < 2.2 && Math.abs(meteor.y - (pose.y + 0.9)) < 1.75) {
                attackActor(actorId, "COMET", now);
                novaHitUntil[actorId] = now + 720;
                hitRacer = true;
                break;
              }
            }
            if (hitRacer || meteor.y <= roadPoint.y + 0.35) shatterShootingStar(meteor, now);
          });
          releaseInactiveVisuals(skillMeteors, () => skillMeteorPool);
          shockWaves.forEach((wave) => {
            if (!wave.active) return;
            const age = (now - wave.startedAt) / 1000;
            if (age >= 0.85) {
              wave.active = false;
              wave.group.visible = false;
              return;
            }
            const scale = 1 + age * 12.5;
            wave.group.scale.setScalar(scale);
            wave.group.children.forEach((child) => {
              if (!(child instanceof THREE.Mesh)) return;
              const material = child.material as Three.MeshBasicMaterial;
              material.opacity = Math.max(0, 0.9 * (1 - age / 0.85));
            });
          });
          releaseInactiveVisuals(shockWaves, () => shockWavePool);

          shatters.forEach((shatter) => {
            if (!shatter.active) return;
            const age = (now - shatter.startedAt) / 1000;
            if (age > 1.05) {
              shatter.active = false;
              shatter.group.visible = false;
              return;
            }
            shatter.group.children.forEach((fragment) => {
              const material = fragment instanceof THREE.Mesh ? fragment.material as Three.Material & { opacity?: number } : null;
              if (fragment.name === "impact-ring") {
                fragment.scale.setScalar(1 + age * 8);
                if (material && "opacity" in material) material.opacity = Math.max(0, 0.9 - age);
                return;
              }
              const velocity = fragment.userData.velocity as Three.Vector3 | undefined;
              if (!velocity) return;
              fragment.position.addScaledVector(velocity, dt);
              velocity.y -= 9.5 * dt;
              fragment.rotation.x += dt * 8;
              fragment.rotation.y += dt * 11;
              if (material && "opacity" in material) material.opacity = Math.max(0, 1 - age);
            });
          });
          releaseInactiveVisuals(shatters, () => shatterPool);

          pickupPoints.forEach((pickup) => {
            if (!pickup.active && now >= pickup.respawnAt) {
              pickup.active = true;
              pickup.group.visible = true;
            }
            if (!pickup.active) return;
            for (let actorId = 0; actorId < actorCount; actorId += 1) {
              if (actorItem(actorId) !== "EMPTY" || actorCrashing(actorId, now)) continue;
              const pose = actorPose(actorId);
              if (Math.hypot(pickup.x - pose.x, pickup.y - pose.y, pickup.z - pose.z) < 1.82) {
                pickup.active = false;
                pickup.group.visible = false;
                pickup.respawnAt = now + 6000;
                setActorItem(actorId, rollItem(actorRank(actorId)), now);
                break;
              }
            }
          });

          projectiles.forEach((projectile) => {
            if (!projectile.active) return;
            projectile.age += dt;
            const projectileSpeed = projectile.kind === "FIRE" ? 43 : projectile.kind === "PIXEL" ? 52 : 49;
            if (
              projectile.kind !== "FIRE"
              && (
                projectile.target === null
                || !Number.isInteger(projectile.target)
                || projectile.target < 0
                || projectile.target >= actorCount
              )
            ) {
              projectile.active = false;
              projectile.group.visible = false;
              return;
            }
            if (projectile.kind === "FIRE") {
              const previousY = projectile.group.position.y;
              projectile.group.position.x += projectile.directionX * projectileSpeed * dt;
              projectile.group.position.z += projectile.directionZ * projectileSpeed * dt;
              if (projectile.age >= projectile.nextSurfaceSampleAt) {
                const roadBelow = course.nearest(
                  projectile.group.position.x,
                  projectile.group.position.z,
                  projectile.surfaceU,
                );
                projectile.surfaceU = roadBelow.u;
                projectile.surfaceY = roadBelow.pose.y + 0.86;
                projectile.nextSurfaceSampleAt = projectile.age + 0.05;
              }
              projectile.group.position.y = THREE.MathUtils.lerp(
                projectile.group.position.y,
                projectile.surfaceY,
                1 - Math.pow(0.0008, dt),
              );
              projectile.group.rotation.y = Math.atan2(projectile.directionX, projectile.directionZ);
              const verticalTravel = projectile.group.position.y - previousY;
              projectile.group.rotation.x = THREE.MathUtils.lerp(
                projectile.group.rotation.x,
                -Math.atan2(verticalTravel, Math.max(0.01, projectileSpeed * dt)),
                0.28,
              );
              projectile.group.rotation.z += dt * 4;
            } else if (projectile.target !== null) {
              const targetProgress = actorProgress(projectile.target);
              let progressGap = targetProgress - projectile.progress;
              if (progressGap < -1.5 / course.length) {
                projectile.progress = targetProgress - 3 / course.length;
                progressGap = targetProgress - projectile.progress;
              }
              projectile.progress += Math.min(
                (projectileSpeed / course.length) * dt,
                Math.max(0, progressGap),
              );
              projectile.lane = THREE.MathUtils.lerp(
                projectile.lane,
                actorLane(projectile.target),
                1 - Math.pow(0.012, dt),
              );
              const roadPoint = course.pointAt(projectile.progress, projectile.lane);
              const previousX = projectile.group.position.x;
              const previousZ = projectile.group.position.z;
              const homingResponse = 1 - Math.pow(0.0004, dt);
              projectile.group.position.x = THREE.MathUtils.lerp(projectile.group.position.x, roadPoint.x, homingResponse);
              projectile.group.position.y = THREE.MathUtils.lerp(
                projectile.group.position.y,
                roadPoint.y + 0.86 + Math.sin(now * 0.012) * 0.08,
                homingResponse,
              );
              projectile.group.position.z = THREE.MathUtils.lerp(projectile.group.position.z, roadPoint.z, homingResponse);
              const moveX = projectile.group.position.x - previousX;
              const moveZ = projectile.group.position.z - previousZ;
              if (Math.hypot(moveX, moveZ) > 0.001) projectile.group.rotation.y = Math.atan2(moveX, moveZ);
              projectile.group.rotation.x = THREE.MathUtils.lerp(projectile.group.rotation.x, roadPoint.pitch, 0.25);
              if (projectile.kind === "PIXEL") projectile.group.rotation.z += dt * 2.8;
            }
            const targets = (projectile.kind === "HOMING" || projectile.kind === "PIXEL") && projectile.target !== null ? [projectile.target] : actorIds;
            for (const targetId of targets) {
              if (
                targetId === projectile.owner
                || (projectile.kind !== "FIRE" && actorAirborne(targetId))
              ) continue;
              const pose = actorPose(targetId);
              const directDistance = Math.hypot(
                projectile.group.position.x - pose.x,
                projectile.group.position.y - (pose.y + 0.85),
                projectile.group.position.z - pose.z,
              );
              const lockedTargetReached = projectile.kind !== "FIRE" && projectile.target === targetId
                && Math.abs(actorProgress(targetId) - projectile.progress) * course.length < 0.42;
              if (directDistance < 1.85 || lockedTargetReached) {
                attackActor(targetId, projectile.kind, now);
                if (projectile.kind === "PIXEL") {
                  projectile.remainingTargets = projectile.remainingTargets.filter((id) => id !== targetId);
                  projectile.target = projectile.remainingTargets.reduce<number | null>((nearest, id) => {
                    if (nearest === null) return id;
                    return Math.abs(actorProgress(id) - projectile.progress) < Math.abs(actorProgress(nearest) - projectile.progress) ? id : nearest;
                  }, null);
                  if (projectile.target !== null) {
                    projectile.progress = Math.min(projectile.progress, actorProgress(projectile.target) - 3 / course.length);
                  }
                  if (projectile.target === null) {
                    projectile.active = false;
                    projectile.group.visible = false;
                  }
                } else {
                  projectile.active = false;
                  projectile.group.visible = false;
                }
                break;
              }
            }
            if (projectile.kind === "FIRE" && projectile.age > 3.4) {
              projectile.active = false;
              projectile.group.visible = false;
            }
          });
          releaseInactiveVisuals(projectiles, (projectile) => projectilePools[projectile.kind]);

          traps.forEach((trap) => {
            if (!trap.active) return;
            if (now >= trap.expiresAt) {
              trap.active = false;
              trap.group.visible = false;
              return;
            }
            if (now < trap.armedAt) return;
            for (let actorId = 0; actorId < actorCount; actorId += 1) {
              const pose = actorPose(actorId);
              if (Math.hypot(trap.x - pose.x, trap.y - pose.y, trap.z - pose.z) < 1.68) {
                attackActor(actorId, "SPIKES", now);
                trap.active = false;
                trap.group.visible = false;
                break;
              }
            }
          });
          releaseInactiveVisuals(traps, () => trapPool);

          for (let attackerId = 0; attackerId < actorCount; attackerId += 1) {
            const auroraUntil = attackerId === 0 ? playerState.auroraUntil : rivalStates[attackerId - 1].auroraUntil;
            if (now >= auroraUntil || actorCrashing(attackerId, now)) continue;
            const attackerPose = actorPose(attackerId);
            for (let targetId = 0; targetId < actorCount; targetId += 1) {
              if (targetId === attackerId) continue;
              const key = `${attackerId}-${targetId}`;
              if (now - (auroraContactTimes.get(key) ?? 0) < 1050) continue;
              const targetPose = actorPose(targetId);
              if (Math.hypot(attackerPose.x - targetPose.x, attackerPose.y - targetPose.y, attackerPose.z - targetPose.z) < 2.7) {
                attackActor(targetId, "AURORA", now);
                auroraContactTimes.set(key, now);
              }
            }
          }

          rivalStates.forEach((rival, index) => {
            const point = actorPose(index + 1);
            const deltaX = playerState.x - point.x;
            const deltaZ = playerState.z - point.z;
            const planarDistance = Math.hypot(deltaX, deltaZ);
            const verticalDistance = Math.abs(point.y - playerState.y);
            const bodyContact = planarDistance < 2.7 && verticalDistance < 1.35
              && now >= rival.auroraUntil && now >= playerState.auroraUntil;
            if (bodyContact) {
              if (!rivalBodyContacts.has(index)) playerState.speed *= 0.92;
              rivalBodyContacts.add(index);
              const fallbackX = -Math.sin(playerState.heading);
              const fallbackZ = -Math.cos(playerState.heading);
              const normalX = planarDistance > 0.001 ? deltaX / planarDistance : fallbackX;
              const normalZ = planarDistance > 0.001 ? deltaZ / planarDistance : fallbackZ;
              const separation = Math.min(0.72, 2.72 - planarDistance);
              playerState.x += normalX * separation;
              playerState.z += normalZ * separation;
            } else if (planarDistance > 3.05 || verticalDistance >= 1.35) {
              rivalBodyContacts.delete(index);
            }
          });
        }

        const playerLandingRemaining = playerState.landingImpactUntil - now;
        const playerLandingPhase = playerLandingRemaining > 0 ? 1 - playerLandingRemaining / 360 : 1;
        const playerLandingLift = playerLandingRemaining > 0 ? Math.sin(playerLandingPhase * Math.PI) * 0.09 : 0;
        const playerWaterDepth = courseDefinition.id === "river" && riverChannelAt(playerState.progress, actorLane(0)) && !playerState.airborne ? 0.36 : 0;
        const playerRoadSupport = getKartRoadSupport(playerState.lastU, actorLane(0));
        const playerSupportOffset = playerState.airborne ? 0 : playerRoadSupport.centerY - playerState.groundY;
        const playerVisualPitch = playerState.airborne ? playerState.pitch : playerRoadSupport.pitch;
        player.position.set(playerState.x, playerState.y + playerSupportOffset + KART_RIDE_HEIGHT + playerLandingLift - playerWaterDepth, playerState.z);
        const playerSteer = playerInputSteer;
        animateKartDriver(THREE, player, playerSteer, playerState.drifting, dt);
        player.rotation.x = 0;
        player.rotation.z = 0;
        playerVisualRoot.rotation.y = 0;
        if (playerCrashing) {
          const crashPhase = clamp((now - playerState.crashStart) / (playerState.crashUntil - playerState.crashStart), 0, 1);
          player.rotation.y = playerState.heading + crashPhase * TAU * 2.5;
          playerVisualRoot.rotation.x = playerVisualPitch + Math.sin(crashPhase * Math.PI * 5) * 0.18;
          playerVisualRoot.rotation.z = Math.sin(crashPhase * Math.PI * 4) * 0.32;
        } else {
          player.rotation.y = playerState.heading;
          const landingPitch = playerLandingRemaining > 0 ? Math.sin(playerLandingPhase * Math.PI * 2) * 0.09 : 0;
          playerVisualRoot.rotation.x = playerVisualPitch + landingPitch;
          const bounceRemaining = playerState.wallBounceUntil - now;
          const bouncePhase = bounceRemaining > 0 ? 1 - bounceRemaining / 180 : 1;
          const bounceRoll = bounceRemaining > 0 ? -playerState.wallBounceSide * Math.sin(bouncePhase * Math.PI) * 0.11 : 0;
          const steeringRoll = playerSteer * (playerState.drifting ? 0.13 : 0.055);
          playerVisualRoot.rotation.z = steeringRoll + bounceRoll;
        }

      rivalStates.forEach((rival, index) => {
        const point = actorPose(index + 1);
        const landingRemaining = rival.landingImpactUntil - now;
        const landingPhase = landingRemaining > 0 ? 1 - landingRemaining / 330 : 1;
        const landingLift = landingRemaining > 0 ? Math.sin(landingPhase * Math.PI) * 0.08 : 0;
        const rivalWaterDepth = courseDefinition.id === "river" && riverChannelAt(rival.progress, rival.lane) && !rival.airborne ? 0.36 : 0;
        const rivalRoadSupport = getKartRoadSupport(rival.progress, rival.lane);
        const rivalSupportOffset = rival.airborne || rival.shortcutActive ? 0 : rivalRoadSupport.centerY - point.y;
        rivalMeshes[index].position.set(point.x, point.y + rivalSupportOffset + KART_RIDE_HEIGHT + landingLift - rivalWaterDepth, point.z);
        const lookAhead = rival.shortcutActive ? point : course.pointAt(rival.progress + 0.006, rival.lane);
        let rivalTurn = lookAhead.heading - point.heading;
        if (rivalTurn > Math.PI) rivalTurn -= TAU;
        if (rivalTurn < -Math.PI) rivalTurn += TAU;
        const rivalSteer = rivalTurn > 0.035 ? 1 : rivalTurn < -0.035 ? -1 : 0;
        animateKartDriver(THREE, rivalMeshes[index], rivalSteer, rival.drifting, dt);
        const rivalVisualRoot = racerVisualRoots[index + 1];
        rivalMeshes[index].rotation.x = 0;
        rivalMeshes[index].rotation.z = 0;
        rivalVisualRoot.rotation.y = 0;
        if (now < rival.crashUntil) {
          const crashPhase = clamp((now - rival.crashStart) / (rival.crashUntil - rival.crashStart), 0, 1);
          rivalMeshes[index].rotation.y = point.heading + crashPhase * TAU * 2.5;
          rivalVisualRoot.rotation.x = point.pitch + Math.sin(crashPhase * Math.PI * 5) * 0.18;
          rivalVisualRoot.rotation.z = Math.sin(crashPhase * Math.PI * 4) * 0.32;
        } else {
          rivalMeshes[index].rotation.y = point.heading;
          const flightPitch = rival.airborne
            ? clamp(-Math.atan2(rival.verticalVelocity, Math.max(8, rival.pace)), -0.32, 0.36)
            : point.pitch + (landingRemaining > 0 ? Math.sin(landingPhase * Math.PI * 2) * 0.08 : 0);
          rivalVisualRoot.rotation.x = flightPitch;
          rivalVisualRoot.rotation.z = rival.drifting ? rival.driftSide * 0.12 : 0;
        }
        if (rival.drifting && !rival.airborne && Math.random() > 0.34) {
          const forwardX = Math.sin(point.heading);
          const forwardZ = Math.cos(point.heading);
          const rightX = Math.cos(point.heading);
          const rightZ = -Math.sin(point.heading);
          [-1, 1].forEach((side) => {
            emitDriftDust(
              point.x - forwardX * 1.12 + rightX * side * 1.08,
              point.y + 0.12,
              point.z - forwardZ * 1.12 + rightZ * side * 1.08,
              point.heading,
              side * 0.8,
            );
          });
        }
      });
      pickupPoints.forEach((pickup) => {
        pickup.group.rotation.y += dt * 1.35;
        pickup.group.position.y = pickup.baseY + Math.sin(now * 0.003 + pickup.rowIndex * 0.7 + pickup.laneIndex * 0.18) * 0.14;
      });

        shieldBubbles.forEach((bubble, actorId) => {
          bubble.visible = actorHasShield(actorId) || now < actorAuroraUntil(actorId);
          bubble.rotation.y += dt * 0.7;
        });
        auroraAuras.forEach((aura, actorId) => {
          const auroraUntil = actorId === 0 ? playerState.auroraUntil : rivalStates[actorId - 1].auroraUntil;
          const active = now < auroraUntil;
          aura.visible = active;
          aura.rotation.y += dt * 1.8;
          aura.scale.setScalar(1 + Math.sin(now * 0.012 + actorId) * 0.05);
        });

        const novaAge = now - novaStarted;
        const novaActive = novaAge >= 0 && novaAge < 1150;
        novaEffect.visible = novaActive;
        if (novaActive) {
          const novaProgress = clamp(novaAge / 1150, 0, 1);
          const waveScale = 1 + novaProgress * 34;
          novaWave.scale.setScalar(waveScale);
          novaWave.rotation.y += dt * 2.8;
          novaWaveMaterial.opacity = (1 - novaProgress) * 0.7;
          novaParticles.scale.setScalar(1 + novaProgress * 28);
          novaParticles.rotation.y += dt * 4.2;
          novaParticleMaterial.opacity = (1 - novaProgress) * 0.95;
          novaRings.forEach((ring, index) => {
            ring.scale.setScalar(1 + novaProgress * (18 + index * 3));
            ring.rotation.z += dt * (2.4 + index * 0.8);
            novaRingMaterials[index].opacity = (1 - novaProgress) * (0.9 - index * 0.14);
          });
        }
        novaHitBursts.forEach(({ burst, material }, actorId) => {
          const remaining = novaHitUntil[actorId] - now;
          const active = remaining > 0;
          burst.visible = active;
          if (active) {
            const impactProgress = 1 - remaining / 950;
            burst.scale.setScalar(0.7 + impactProgress * 3.8);
            burst.rotation.y += dt * 7;
            burst.rotation.x += dt * 4;
            material.opacity = (1 - impactProgress) * 0.92;
          }
        });

        host.classList.toggle("focus-boost", now < playerState.boostUntil);
        host.classList.toggle("nova-flash", now < novaFlashUntil);
        host.classList.toggle("airborne", playerState.airborne);
        host.classList.toggle("landing-impact", playerLandingRemaining > 0);

        for (let i = 0; i < exhaustCount; i += 1) {
          if (exhaustLife[i] <= 0) continue;
          exhaustLife[i] -= dt * 1.7;
          exhaustPositions[i * 3 + 1] += dt * 0.6;
        }
        exhaustGeometry.attributes.position.needsUpdate = true;
        for (let index = 0; index < driveSparkCount; index += 1) {
          if (driveSparkLife[index] <= 0) continue;
          const base = index * 3;
          driveSparkLife[index] -= dt;
          if (driveSparkLife[index] <= 0) {
            driveSparkPositions[base + 1] = -1000;
            continue;
          }
          driveSparkPositions[base] += driveSparkVelocities[base] * dt;
          driveSparkPositions[base + 1] += driveSparkVelocities[base + 1] * dt;
          driveSparkPositions[base + 2] += driveSparkVelocities[base + 2] * dt;
          driveSparkVelocities[base + 1] -= 8.6 * dt;
          const fade = clamp(driveSparkLife[index] * 2.2, 0.18, 1);
          driveSparkColors[base] *= fade;
          driveSparkColors[base + 1] *= fade;
          driveSparkColors[base + 2] *= fade;
        }
        driveSparkGeometry.attributes.position.needsUpdate = true;
        driveSparkGeometry.attributes.color.needsUpdate = true;
        for (let index = 0; index < turboBurstSparkCount; index += 1) {
          if (turboBurstSparkLife[index] <= 0) continue;
          const vertexBase = index * 6;
          const velocityBase = index * 3;
          turboBurstSparkLife[index] -= dt;
          if (turboBurstSparkLife[index] <= 0) {
            turboBurstSparkPositions[vertexBase + 1] = -1000;
            turboBurstSparkPositions[vertexBase + 4] = -1000;
            continue;
          }
          const velocityX = turboBurstSparkVelocities[velocityBase];
          const velocityY = turboBurstSparkVelocities[velocityBase + 1];
          const velocityZ = turboBurstSparkVelocities[velocityBase + 2];
          turboBurstSparkPositions[vertexBase] += velocityX * dt;
          turboBurstSparkPositions[vertexBase + 1] += velocityY * dt;
          turboBurstSparkPositions[vertexBase + 2] += velocityZ * dt;
          turboBurstSparkPositions[vertexBase + 3] += velocityX * dt * 0.62;
          turboBurstSparkPositions[vertexBase + 4] += velocityY * dt * 0.62;
          turboBurstSparkPositions[vertexBase + 5] += velocityZ * dt * 0.62;
          turboBurstSparkVelocities[velocityBase + 1] -= 4.2 * dt;
          const lifeRatio = clamp(turboBurstSparkLife[index] / turboBurstSparkMaxLife[index], 0, 1);
          const brightness = Math.pow(lifeRatio, 1.45);
          for (let vertex = 0; vertex < 2; vertex += 1) {
            const colorBase = vertexBase + vertex * 3;
            turboBurstSparkColors[colorBase] = turboBurstSparkBaseColors[velocityBase] * brightness;
            turboBurstSparkColors[colorBase + 1] = turboBurstSparkBaseColors[velocityBase + 1] * brightness;
            turboBurstSparkColors[colorBase + 2] = turboBurstSparkBaseColors[velocityBase + 2] * brightness;
          }
        }
        turboBurstSparkGeometry.attributes.position.needsUpdate = true;
        turboBurstSparkGeometry.attributes.color.needsUpdate = true;
        const dustDrag = Math.pow(0.2, dt);
        for (let index = 0; index < driftDustCount; index += 1) {
          if (driftDustLife[index] <= 0) continue;
          const base = index * 3;
          driftDustLife[index] -= dt;
          if (driftDustLife[index] <= 0) {
            driftDustAlphas[index] = 0;
            driftDustPositions[base + 1] = -1000;
            continue;
          }
          const lifeRatio = clamp(driftDustLife[index] / driftDustMaxLife[index], 0, 1);
          driftDustPositions[base] += driftDustVelocities[base] * dt;
          driftDustPositions[base + 1] += driftDustVelocities[base + 1] * dt;
          driftDustPositions[base + 2] += driftDustVelocities[base + 2] * dt;
          driftDustVelocities[base] *= dustDrag;
          driftDustVelocities[base + 1] = driftDustVelocities[base + 1] * dustDrag + dt * 0.18;
          driftDustVelocities[base + 2] *= dustDrag;
          driftDustSizes[index] += dt * (0.74 + (1 - lifeRatio) * 0.82);
          driftDustAlphas[index] = Math.pow(lifeRatio, 1.35) * 0.62;
        }
        driftDustGeometry.attributes.position.needsUpdate = true;
        driftDustGeometry.attributes.color.needsUpdate = true;
        driftDustGeometry.attributes.puffSize.needsUpdate = true;
        driftDustGeometry.attributes.puffAlpha.needsUpdate = true;

        syncKartMotionStates(now);
        captureKartRenderState();
      };

      const renderFrame = (now: number, dt: number) => {
        const interpolationAmount = clamp(physicsAccumulatorMs / PHYSICS_STEP_MS, 0, 1);
        if (kartTransformSnapshotsReady) {
          racerMeshes.forEach((mesh, index) => {
            mesh.position.lerpVectors(
              previousKartTransforms[index].position,
              currentKartTransforms[index].position,
              interpolationAmount,
            );
            mesh.quaternion
              .copy(previousKartTransforms[index].quaternion)
              .slerp(currentKartTransforms[index].quaternion, interpolationAmount);
            racerVisualRoots[index].quaternion
              .copy(previousKartTransforms[index].visualQuaternion)
              .slerp(currentKartTransforms[index].visualQuaternion, interpolationAmount);
          });
        }
        const renderedPlayerPose = {
          x: THREE.MathUtils.lerp(previousPlayerRenderPose.x, currentPlayerRenderPose.x, interpolationAmount),
          y: THREE.MathUtils.lerp(previousPlayerRenderPose.y, currentPlayerRenderPose.y, interpolationAmount),
          z: THREE.MathUtils.lerp(previousPlayerRenderPose.z, currentPlayerRenderPose.z, interpolationAmount),
          heading: interpolateAngle(previousPlayerRenderPose.heading, currentPlayerRenderPose.heading, interpolationAmount),
          groundY: THREE.MathUtils.lerp(previousPlayerRenderPose.groundY, currentPlayerRenderPose.groundY, interpolationAmount),
          airborne: currentPlayerRenderPose.airborne,
        };
        const raceElapsedSeconds = raceStart ? Math.max(0, (simulationNow - raceStart) / 1000) : 0;
        const forward = new THREE.Vector3(Math.sin(renderedPlayerPose.heading), 0, Math.cos(renderedPlayerPose.heading));
        const flightClearance = renderedPlayerPose.airborne ? Math.max(0, renderedPlayerPose.y - renderedPlayerPose.groundY) : 0;
        const cameraBaseY = renderedPlayerPose.airborne
          ? renderedPlayerPose.y - Math.min(1.1, flightClearance * 0.22)
          : renderedPlayerPose.y;
        const desiredCamera = new THREE.Vector3(renderedPlayerPose.x, cameraBaseY, renderedPlayerPose.z)
          .addScaledVector(forward, -6.4)
          .add(new THREE.Vector3(0, 3.75, 0));
        if (camera.position.lengthSq() === 0) camera.position.copy(desiredCamera);
        camera.position.lerp(desiredCamera, 1 - Math.pow(0.015, dt));
        if (now < novaFlashUntil) {
          const shake = ((novaFlashUntil - now) / 1050) * 0.34;
          camera.position.x += Math.sin(now * 0.12) * shake;
          camera.position.y += Math.cos(now * 0.17) * shake * 0.55;
        }
        const lookAtY = renderedPlayerPose.y + 0.95;
        camera.lookAt(new THREE.Vector3(renderedPlayerPose.x, lookAtY, renderedPlayerPose.z).addScaledVector(forward, 6));

        if (courseDefinition.id === "pirate") {
          const pirateU = wrap01(playerState.progress);
          const insideShip = pirateU >= 0.2 && pirateU <= 0.8;
          renderer.toneMappingExposure = THREE.MathUtils.lerp(renderer.toneMappingExposure, insideShip ? 0.72 : 1.06, 0.045);
        } else if (courseDefinition.id === "starlight") {
          const sunsetToNight = smoothTimeTransition(raceElapsedSeconds, 45, 50);
          const dayToSunset = smoothTimeTransition(raceElapsedSeconds, 20, 25);
          const targetExposure = THREE.MathUtils.lerp(THREE.MathUtils.lerp(1.06, 1.12, dayToSunset), 0.96, sunsetToNight);
          renderer.toneMappingExposure = THREE.MathUtils.lerp(renderer.toneMappingExposure, targetExposure, 0.045);
        } else {
          renderer.toneMappingExposure = THREE.MathUtils.lerp(renderer.toneMappingExposure, 1.06, 0.045);
        }
        drawMiniMap(now);
        renderer.render(scene, camera);
      };

      const animate = (frameNow: number) => {
        const rawFrameDeltaMs = Math.max(0, frameNow - previousFrameAt);
        const physicsBudgetMs = PHYSICS_STEP_MS * MAX_PHYSICS_STEPS;
        const frameDeltaMs = Math.min(rawFrameDeltaMs, physicsBudgetMs);
        previousFrameAt = frameNow;
        simulationNow += Math.max(0, rawFrameDeltaMs - frameDeltaMs);
        physicsAccumulatorMs = Math.min(
          physicsAccumulatorMs + frameDeltaMs,
          physicsBudgetMs,
        );
        let steps = 0;
        while (physicsAccumulatorMs >= PHYSICS_STEP_MS && steps < MAX_PHYSICS_STEPS) {
          simulationNow += PHYSICS_STEP_MS;
          simulateStep(simulationNow, PHYSICS_STEP_SECONDS, PHYSICS_STEP_MS);
          physicsAccumulatorMs -= PHYSICS_STEP_MS;
          steps += 1;
        }
        renderFrame(frameNow, clamp(rawFrameDeltaMs / 1000, 0.001, 0.1));
        frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);

      disposeThree = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        host.classList.remove("focus-boost", "nova-flash", "airborne", "landing-impact");
        const disposedGeometries = new Set<Three.BufferGeometry>();
        const disposedMaterials = new Set<Three.Material>();
        const disposeObject = (object: Three.Object3D) => {
          if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.LineSegments || object instanceof THREE.InstancedMesh) {
            if (object.geometry && !disposedGeometries.has(object.geometry)) {
              disposedGeometries.add(object.geometry);
              object.geometry.dispose();
            }
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => {
              if (!material || disposedMaterials.has(material)) return;
              disposedMaterials.add(material);
              material.dispose();
            });
          }
        };
        scene.traverse(disposeObject);
        const pooledRoots: Three.Object3D[] = [
          ...Object.values(projectilePools).flatMap((pool) => pool.map((item) => item.group)),
          ...trapPool.map((item) => item.group),
          ...shootingStarPool.flatMap((item) => [item.group, item.warning]),
          ...skillMeteorPool.flatMap((item) => [item.group, item.warning]),
          ...shockWavePool.map((item) => item.group),
          ...shatterPool.map((item) => item.group),
        ];
        pooledRoots.forEach((root) => root.traverse(disposeObject));
        renderer.dispose();
        renderer.domElement.remove();
      };
    });

    return () => {
      disposed = true;
      disposeThree?.();
    };
  }, [courseDefinition, creatorHazards, creatorParts, gojoChallenge, gojoField, runId, selectedCharacterIndex, itemsEnabled, skillsEnabled, onFinish, onItemChange, onShieldChange, onSkillChange, onTelemetry]);

  const syncTouchSteering = () => {
    const pointers = Array.from(activeTouchPointers.current.values());
    touch.current.left = pointers.some((pointer) => pointer.side === "left");
    touch.current.right = pointers.some((pointer) => pointer.side === "right");
    touch.current.drift = pointers.some((pointer) => pointer.drift);
  };
  const pulseTouchAction = (action: "item" | "skill") => {
    touch.current[action] = true;
    window.clearTimeout(touchActionTimers.current[action]);
    touchActionTimers.current[action] = window.setTimeout(() => {
      touch.current[action] = false;
    }, 150);
  };
  const beginTouchGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = event.currentTarget.getBoundingClientRect();
    const side = event.clientX < bounds.left + bounds.width / 2 ? "left" : "right";
    const now = performance.now();
    const drift = now - lastTouchTapAt.current[side] <= 360;
    if (drift) lastTouchTapAt.current[side] = 0;
    activeTouchPointers.current.set(event.pointerId, {
      side,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      startedAt: now,
      drift,
      didSwipe: false,
    });
    syncTouchSteering();
  };
  const moveTouchGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const pointer = activeTouchPointers.current.get(event.pointerId);
    if (!pointer) return;
    event.preventDefault();
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    const verticalTravel = event.clientY - pointer.startY;
    const horizontalTravel = event.clientX - pointer.startX;
    if (!pointer.didSwipe && Math.abs(verticalTravel) >= 42 && Math.abs(verticalTravel) > Math.abs(horizontalTravel) * 1.08) {
      pointer.didSwipe = true;
      if (verticalTravel > 0 && itemsEnabled) pulseTouchAction("item");
      if (verticalTravel < 0 && skillsEnabled) pulseTouchAction("skill");
    }
    syncTouchSteering();
  };
  const finishTouchGesture = (event: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const pointer = activeTouchPointers.current.get(event.pointerId);
    if (!pointer) return;
    event.preventDefault();
    const travel = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY);
    const heldFor = performance.now() - pointer.startedAt;
    if (!cancelled && !pointer.didSwipe && !pointer.drift && travel < 24 && heldFor < 280) {
      lastTouchTapAt.current[pointer.side] = performance.now();
    }
    activeTouchPointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    syncTouchSteering();
  };

  return (
    <div className="webgl-host" ref={hostRef}>
      {webglError && <div className="webgl-error">この端末ではWebGLを開始できませんでした。ブラウザの3D描画設定をご確認ください。</div>}
      <div className="nova-impact" aria-hidden="true" />
      <div className={`controller-chip ${gamepadConnected ? "connected" : ""}`} aria-live="polite">
        <i /> {gamepadConnected ? "PS4 PAD CONNECTED" : "PS4 PAD READY"}
      </div>
      <div className="mini-map" aria-label="コースミニマップ">
        <span>COURSE MAP</span>
        <canvas className="mini-map-canvas" width="240" height="180" />
      </div>
      <div className="jump-indicator" aria-hidden="true"><i /> AIRBORNE <span>GRAVITY ACTIVE</span></div>
      <div
        className={`mobile-gesture-layer ${phase === "racing" ? "active" : ""}`}
        aria-label="スマホ操作領域。左右タップでハンドル、ダブルタップ後の長押しでドリフト、上フリックでスキル、下フリックでアイテム"
        onPointerDown={beginTouchGesture}
        onPointerMove={moveTouchGesture}
        onPointerUp={(event) => finishTouchGesture(event)}
        onPointerCancel={(event) => finishTouchGesture(event, true)}
        onContextMenu={(event) => event.preventDefault()}
      >
        <span className="gesture-zone gesture-zone-left">TAP / HOLD<br />STEER LEFT</span>
        <span className="gesture-zone gesture-zone-right">TAP / HOLD<br />STEER RIGHT</span>
        <small>↑ SKILL　↓ ITEM　DOUBLE TAP + HOLD：DRIFT　AUTO ACCEL</small>
      </div>
    </div>
  );
}

const ITEM_LABELS: Record<ItemType, { icon: string; name: string }> = {
  EMPTY: { icon: "—", name: "NO ITEM" },
  FIRE: { icon: "◆", name: "FIRE" },
  HOMING: { icon: "◎", name: "HOMING" },
  BOOST: { icon: "⚡", name: "BOOST" },
  AURORA: { icon: "✦", name: "AURORA" },
  SPIKES: { icon: "▲", name: "SPIKES" },
  SHIELD: { icon: "◉", name: "SHIELD" },
  NOVA: { icon: "✹", name: "NOVA" },
};

export default function Home() {
  const [phase, setPhase] = useState<GamePhase>("title");
  const [titleMenuFocus, setTitleMenuFocus] = useState<0 | 1>(0);
  const titleMenuFocusRef = useRef<0 | 1>(0);
  const [selectedCupIndex, setSelectedCupIndex] = useState(0);
  const [selectedCharacterIndex, setSelectedCharacterIndex] = useState(0);
  const [characterSelectSource, setCharacterSelectSource] = useState<CharacterSelectSource>("cup");
  const [cupMenuFocus, setCupMenuFocus] = useState<0 | 1 | 2 | 3>(0);
  const [itemOptionEnabled, setItemOptionEnabled] = useState(true);
  const [skillOptionEnabled, setSkillOptionEnabled] = useState(true);
  const [activeItemsEnabled, setActiveItemsEnabled] = useState(true);
  const [activeSkillsEnabled, setActiveSkillsEnabled] = useState(true);
  const [activeCupId, setActiveCupId] = useState<CupId>("basic");
  const [courseIndex, setCourseIndex] = useState(0);
  const [scores, setScores] = useState([0, 0, 0, 0]);
  const [lastOrder, setLastOrder] = useState([0, 1, 2, 3]);
  const [cupPlacements, setCupPlacements] = useState<number[]>([]);
  const [gojoChallenge, setGojoChallenge] = useState(false);
  const [countdown, setCountdown] = useState("3");
  const [runId, setRunId] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [position, setPosition] = useState(4);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [finishTime, setFinishTime] = useState(0);
  const [finishPosition, setFinishPosition] = useState(1);
  const [item, setItem] = useState<ItemType>("EMPTY");
  const [shieldActive, setShieldActive] = useState(false);
  const [driftGauge, setDriftGauge] = useState(0);
  const [driftDashing, setDriftDashing] = useState(false);
  const [skillRemaining, setSkillRemaining] = useState(0);
  const [skillCooldown, setSkillCooldown] = useState(CHARACTERS[0].cooldownMs);
  const [skillActive, setSkillActive] = useState(false);
  const [creatorEditMode, setCreatorEditMode] = useState<"road" | "hazards">("road");
  const [creatorParts, setCreatorParts] = useState<CoursePartType[]>(DEFAULT_CREATOR_PARTS);
  const [creatorPartType, setCreatorPartType] = useState<CoursePartType>("straight");
  const [creatorHazardType, setCreatorHazardType] = useState<CreatorHazardType>("monkey");
  const [creatorHazards, setCreatorHazards] = useState<CreatorHazardPlacement[]>([]);
  const [creatorSelectedHazardId, setCreatorSelectedHazardId] = useState<string | null>(null);
  const [creatorConnectAt, setCreatorConnectAt] = useState<"front" | "back">("back");
  const [creatorCourseName, setCreatorCourseName] = useState("MY CIRCUIT");
  const [savedCreatorCourse, setSavedCreatorCourse] = useState<SavedCreatorCourse | null>(null);
  const [creatorNotice, setCreatorNotice] = useState("半透明の道路を選び、光る接続点へ設置してください。");
  const [creatorUndoStack, setCreatorUndoStack] = useState<CoursePartType[][]>([]);
  const [creatorRedoStack, setCreatorRedoStack] = useState<CoursePartType[][]>([]);
  const [creatorSelectedPartIndex, setCreatorSelectedPartIndex] = useState<number | null>(null);
  const [creatorTestMode, setCreatorTestMode] = useState(false);
  const [creatorTestDefinition, setCreatorTestDefinition] = useState<CourseDefinition | null>(null);
  const [creatorTestHazards, setCreatorTestHazards] = useState<CreatorHazardPlacement[]>([]);
  const [creatorRaceItemsEnabled, setCreatorRaceItemsEnabled] = useState(true);
  const [creatorRaceSkillsEnabled, setCreatorRaceSkillsEnabled] = useState(true);
  const [creatorGojoMode, setCreatorGojoMode] = useState<CreatorGojoMode>("off");
  const timerStart = useRef(0);
  const menuPadHeld = useRef({
    left: false, right: false, up: false, down: false, confirm: false, back: false,
    previousPart: false, nextPart: false, redo: false, exit: false,
  });
  const creatorDefinition = useMemo(
    () => buildCreatorCourseDefinition(creatorCourseName, creatorParts),
    [creatorCourseName, creatorParts],
  );

  useEffect(() => {
    if (phase !== "racing") return;
    timerStart.current = performance.now();
    const timer = window.setInterval(() => setElapsed(performance.now() - timerStart.current), 31);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CREATOR_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as SavedCreatorCourse;
      if (!Array.isArray(parsed.parts) || !parsed.parts.length) return;
      const validParts = parsed.parts.filter((part): part is CoursePartType => COURSE_PARTS.some((entry) => entry.id === part));
      if (!validParts.length) return;
      const restoredParts = validParts.slice(0, MAX_CREATOR_PARTS);
      const restoredHazards = (Array.isArray(parsed.hazards) ? parsed.hazards : [])
        .map((hazard) => normalizeCreatorHazard(hazard, restoredParts.length))
        .filter((hazard): hazard is CreatorHazardPlacement => Boolean(hazard))
        .slice(0, MAX_CREATOR_HAZARDS);
      const restored = {
        name: parsed.name || "MY CIRCUIT",
        parts: restoredParts,
        hazards: restoredHazards,
        savedAt: parsed.savedAt || Date.now(),
      };
      setSavedCreatorCourse(restored);
    } catch {
      setSavedCreatorCourse(null);
    }
  }, []);

  const beginRace = useCallback((fieldSize = 4) => {
    setRunId((value) => value + 1);
    setSpeed(0);
    setPosition(fieldSize);
    setProgress(0);
    setElapsed(0);
    setItem("EMPTY");
    setShieldActive(false);
    setDriftGauge(0);
    setDriftDashing(false);
    setSkillRemaining(0);
    setSkillCooldown(CHARACTERS[selectedCharacterIndex].cooldownMs);
    setSkillActive(false);
    setCountdown("3");
    setPhase("countdown");
    ["2", "1", "GO!"].forEach((value, index) => window.setTimeout(() => setCountdown(value), (index + 1) * 700));
    window.setTimeout(() => setPhase("racing"), 2800);
  }, [selectedCharacterIndex]);

  const startSelectedCup = useCallback(() => {
    const cup = CUPS[selectedCupIndex];
    setActiveCupId(cup.id);
    setCourseIndex(0);
    setScores([0, 0, 0, 0]);
    setLastOrder([0, 1, 2, 3]);
    setCupPlacements([]);
    setGojoChallenge(false);
    setActiveItemsEnabled(itemOptionEnabled);
    setActiveSkillsEnabled(skillOptionEnabled);
    setCharacterSelectSource("cup");
    setPhase("character-select");
  }, [itemOptionEnabled, selectedCupIndex, skillOptionEnabled]);

  const startSelectedCharacter = useCallback(() => {
    const creatorFieldSize = creatorGojoMode === "duel" ? 2 : creatorGojoMode === "field" ? 5 : 4;
    beginRace(characterSelectSource === "creator" ? creatorFieldSize : 4);
  }, [beginRace, characterSelectSource, creatorGojoMode]);

  const backFromCharacterSelect = useCallback(() => {
    if (characterSelectSource === "creator") {
      setCreatorTestMode(false);
      setCreatorSelectedPartIndex(null);
      setPhase("course-create");
      return;
    }
    setCupMenuFocus(0);
    setPhase("cup-select");
  }, [characterSelectSource]);

  const openCupSelect = useCallback(() => {
    setCreatorTestMode(false);
    setCupMenuFocus(0);
    setPhase("cup-select");
  }, []);
  const openCourseCreator = useCallback(() => {
    setCreatorTestMode(false);
    setCreatorSelectedPartIndex(null);
    setCreatorNotice("パーツを選ぶと接続点へ半透明で表示されます。道路を押して設置してください。");
    setPhase("course-create");
  }, []);
  const returnToCupSelect = useCallback(() => {
    setCreatorTestMode(false);
    setGojoChallenge(false);
    const currentCupIndex = Math.max(0, CUPS.findIndex((cup) => cup.id === activeCupId));
    setSelectedCupIndex(currentCupIndex);
    setCupMenuFocus(0);
    setPhase("cup-select");
  }, [activeCupId]);

  const nextCourse = useCallback(() => {
    setCourseIndex((value) => Math.min(2, value + 1));
    beginRace();
  }, [beginRace]);

  const startGojoChallenge = useCallback(() => {
    setGojoChallenge(true);
    beginRace(2);
  }, [beginRace]);

  const showChampionshipAfterGojo = useCallback(() => {
    setGojoChallenge(false);
    setPhase("championship");
  }, []);

  const selectCreatorPartOffset = useCallback((offset: number) => {
    setCreatorPartType((current) => {
      const currentIndex = Math.max(0, COURSE_PARTS.findIndex((part) => part.id === current));
      return COURSE_PARTS[(currentIndex + offset + COURSE_PARTS.length) % COURSE_PARTS.length].id;
    });
  }, []);
  const selectCreatorHazardOffset = useCallback((offset: number) => {
    setCreatorHazardType((current) => {
      const currentIndex = Math.max(0, CREATOR_HAZARDS.findIndex((hazard) => hazard.id === current));
      return CREATOR_HAZARDS[(currentIndex + offset + CREATOR_HAZARDS.length) % CREATOR_HAZARDS.length].id;
    });
  }, []);
  const rememberCreatorEdit = useCallback((current: CoursePartType[]) => {
    setCreatorUndoStack((stack) => [...stack.slice(-39), current]);
    setCreatorRedoStack([]);
  }, []);
  const addCreatorPart = useCallback(() => {
    if (creatorParts.length >= MAX_CREATOR_PARTS) {
      setCreatorNotice(`パーツ数が上限の${MAX_CREATOR_PARTS}個に達しています。不要なパーツを削除してください。`);
      return;
    }
    rememberCreatorEdit(creatorParts);
    const next = creatorConnectAt === "front"
      ? [creatorPartType, ...creatorParts]
      : [...creatorParts, creatorPartType];
    setCreatorParts(next);
    if (creatorConnectAt === "front") {
      setCreatorHazards((hazards) => hazards.map((hazard) => ({ ...hazard, partIndex: hazard.partIndex + 1 })));
    }
    setCreatorSelectedPartIndex(null);
    setCreatorNotice(`${COURSE_PARTS.find((part) => part.id === creatorPartType)?.label ?? "PART"}を光る接続点へ設置しました。`);
  }, [creatorConnectAt, creatorPartType, creatorParts, rememberCreatorEdit]);
  const undoCreatorPart = useCallback(() => {
    const previous = creatorUndoStack[creatorUndoStack.length - 1];
    if (!previous) {
      setCreatorNotice("これ以上戻せる操作はありません。");
      return;
    }
    setCreatorRedoStack((stack) => [...stack.slice(-39), creatorParts]);
    setCreatorUndoStack((stack) => stack.slice(0, -1));
    setCreatorParts(previous);
    setCreatorHazards((hazards) => hazards
      .filter((hazard) => hazard.partIndex < previous.length)
      .map((hazard) => ({ ...hazard, partIndex: clamp(hazard.partIndex, 0, previous.length - 1) })));
    setCreatorSelectedHazardId(null);
    setCreatorSelectedPartIndex(null);
    setCreatorNotice("直前の編集を元に戻しました。");
  }, [creatorParts, creatorUndoStack]);
  const redoCreatorPart = useCallback(() => {
    const next = creatorRedoStack[creatorRedoStack.length - 1];
    if (!next) {
      setCreatorNotice("やり直せる操作はありません。");
      return;
    }
    setCreatorUndoStack((stack) => [...stack.slice(-39), creatorParts]);
    setCreatorRedoStack((stack) => stack.slice(0, -1));
    setCreatorParts(next);
    setCreatorHazards((hazards) => hazards
      .filter((hazard) => hazard.partIndex < next.length)
      .map((hazard) => ({ ...hazard, partIndex: clamp(hazard.partIndex, 0, next.length - 1) })));
    setCreatorSelectedHazardId(null);
    setCreatorSelectedPartIndex(null);
    setCreatorNotice("取り消した編集をやり直しました。");
  }, [creatorParts, creatorRedoStack]);
  const selectOrRemoveCreatorPart = useCallback((index: number) => {
    const partId = creatorParts[index];
    const label = COURSE_PARTS.find((entry) => entry.id === partId)?.label ?? "PART";
    if (creatorEditMode === "hazards") {
      setCreatorSelectedPartIndex(index);
      setCreatorSelectedHazardId(null);
      setCreatorNotice(`${index + 1}番目の${label}をお邪魔要素の配置区間に選択しました。`);
      return;
    }
    if (creatorSelectedPartIndex !== index) {
      setCreatorSelectedPartIndex(index);
      setCreatorNotice(`${index + 1}番目の${label}を選択しました。点灯したパーツを確認し、もう一度押すと削除します。`);
      return;
    }
    if (creatorParts.length <= 1) {
      setCreatorNotice("最低1個の道路パーツが必要です。");
      return;
    }
    rememberCreatorEdit(creatorParts);
    setCreatorParts(creatorParts.filter((_, partIndex) => partIndex !== index));
    setCreatorHazards((hazards) => hazards
      .filter((hazard) => hazard.partIndex !== index)
      .map((hazard) => ({ ...hazard, partIndex: hazard.partIndex > index ? hazard.partIndex - 1 : hazard.partIndex })));
    setCreatorSelectedHazardId(null);
    setCreatorSelectedPartIndex(null);
    setCreatorNotice(`${index + 1}番目の${label}を削除し、前後を再接続しました。`);
  }, [creatorEditMode, creatorParts, creatorSelectedPartIndex, rememberCreatorEdit]);
  const resetCreatorCourse = useCallback(() => {
    rememberCreatorEdit(creatorParts);
    setCreatorParts(DEFAULT_CREATOR_PARTS);
    setCreatorHazards([]);
    setCreatorSelectedHazardId(null);
    setCreatorCourseName("MY CIRCUIT");
    setCreatorSelectedPartIndex(null);
    setCreatorNotice("初期サンプルコースへ戻しました。");
  }, [creatorParts, rememberCreatorEdit]);
  const addCreatorHazard = useCallback(() => {
    if (creatorSelectedPartIndex === null) {
      setCreatorNotice("先に下のパーツ番号から、お邪魔要素を置く道路区間を選択してください。");
      return;
    }
    if (creatorHazards.length >= MAX_CREATOR_HAZARDS) {
      setCreatorNotice(`お邪魔要素は最大${MAX_CREATOR_HAZARDS}個まで配置できます。`);
      return;
    }
    const definition = CREATOR_HAZARDS.find((hazard) => hazard.id === creatorHazardType) ?? CREATOR_HAZARDS[0];
    const placement: CreatorHazardPlacement = {
      id: `hazard-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: creatorHazardType,
      partIndex: creatorSelectedPartIndex,
      ...definition.defaults,
      enabled: true,
    };
    setCreatorHazards((hazards) => [...hazards, placement]);
    setCreatorSelectedHazardId(placement.id);
    setCreatorNotice(`${creatorSelectedPartIndex + 1}番目の区間へ${definition.label}を配置しました。右上で詳細を調整できます。`);
  }, [creatorHazardType, creatorHazards.length, creatorSelectedPartIndex]);
  const selectCreatorHazard = useCallback((hazard: CreatorHazardPlacement) => {
    setCreatorSelectedHazardId(hazard.id);
    setCreatorSelectedPartIndex(hazard.partIndex);
    const definition = CREATOR_HAZARDS.find((entry) => entry.id === hazard.type) ?? CREATOR_HAZARDS[0];
    setCreatorNotice(`${definition.label}を選択しました。右上の設定がテスト走行へ反映されます。`);
  }, []);
  const updateCreatorHazard = useCallback((patch: Partial<CreatorHazardPlacement>) => {
    if (!creatorSelectedHazardId) return;
    setCreatorHazards((hazards) => hazards.map((hazard) => {
      if (hazard.id !== creatorSelectedHazardId) return hazard;
      return normalizeCreatorHazard({ ...hazard, ...patch }, creatorParts.length) ?? hazard;
    }));
  }, [creatorParts.length, creatorSelectedHazardId]);
  const deleteCreatorHazard = useCallback(() => {
    if (!creatorSelectedHazardId) return;
    setCreatorHazards((hazards) => hazards.filter((hazard) => hazard.id !== creatorSelectedHazardId));
    setCreatorSelectedHazardId(null);
    setCreatorNotice("選択中のお邪魔要素を削除しました。道路パーツには影響しません。");
  }, [creatorSelectedHazardId]);
  const saveCreatorCourse = useCallback(() => {
    if (creatorParts.length < 6) {
      setCreatorNotice("保存には6個以上のパーツが必要です。");
      return;
    }
    const saved = { name: creatorDefinition.name, parts: creatorParts, hazards: creatorHazards, savedAt: Date.now() };
    try {
      window.localStorage.setItem(CREATOR_STORAGE_KEY, JSON.stringify(saved));
      setSavedCreatorCourse(saved);
      setCreatorNotice(`${saved.name}をこの端末へ保存しました。`);
    } catch {
      setCreatorNotice("端末への保存に失敗しました。ブラウザの保存設定を確認してください。");
    }
  }, [creatorDefinition.name, creatorHazards, creatorParts]);
  const loadCreatorCourse = useCallback(() => {
    if (!savedCreatorCourse) {
      setCreatorNotice("保存済みコースはありません。");
      return;
    }
    rememberCreatorEdit(creatorParts);
    setCreatorCourseName(savedCreatorCourse.name);
    setCreatorParts(savedCreatorCourse.parts.slice(0, MAX_CREATOR_PARTS));
    setCreatorHazards((savedCreatorCourse.hazards ?? [])
      .map((hazard) => normalizeCreatorHazard(hazard, savedCreatorCourse.parts.length))
      .filter((hazard): hazard is CreatorHazardPlacement => Boolean(hazard))
      .slice(0, MAX_CREATOR_HAZARDS));
    setCreatorSelectedHazardId(null);
    setCreatorSelectedPartIndex(null);
    setCreatorNotice(`${savedCreatorCourse.name}を読み込みました。`);
  }, [creatorParts, rememberCreatorEdit, savedCreatorCourse]);
  const testCreatorCourse = useCallback(() => {
    if (creatorParts.length < 6) {
      setCreatorNotice("テスト走行には6個以上のパーツが必要です。");
      return;
    }
    setCreatorTestDefinition(creatorDefinition);
    setCreatorTestHazards(creatorHazards.filter((hazard) => hazard.enabled));
    setCreatorTestMode(true);
    setActiveItemsEnabled(creatorRaceItemsEnabled);
    setActiveSkillsEnabled(creatorRaceSkillsEnabled);
    setCharacterSelectSource("creator");
    setPhase("character-select");
  }, [creatorDefinition, creatorHazards, creatorParts.length, creatorRaceItemsEnabled, creatorRaceSkillsEnabled]);
  const returnToCreator = useCallback(() => {
    setCreatorTestMode(false);
    setCreatorSelectedPartIndex(null);
    setCreatorNotice("テスト走行を終了しました。編集を続けられます。");
    setPhase("course-create");
  }, []);

  const handleTelemetry = useCallback((nextSpeed: number, nextProgress: number, nextPosition: number, nextDriftGauge: number, nextDriftDashing: boolean) => {
    setSpeed(Math.round(nextSpeed));
    setProgress(clamp(nextProgress, 0, 5));
    setPosition(nextPosition);
    setDriftGauge(clamp(nextDriftGauge, 0, 1));
    setDriftDashing(nextDriftDashing);
  }, []);

  const handleFinish = useCallback((time: number, nextPosition: number, order: number[]) => {
    setFinishTime(time);
    setFinishPosition(nextPosition);
    if (creatorTestMode) {
      setElapsed(time);
      setSpeed(0);
      setPhase("creator-finished");
      return;
    }
    if (gojoChallenge) {
      setElapsed(time);
      setSpeed(0);
      setPhase("gojo-finished");
      return;
    }
    setLastOrder(order);
    setScores((current) => {
      const next = [...current];
      order.forEach((actorId, rank) => { next[actorId] += RACE_POINTS[rank] ?? 0; });
      return next;
    });
    const nextPlacements = [...cupPlacements, nextPosition];
    setCupPlacements(nextPlacements);
    setElapsed(time);
    setSpeed(0);
    const perfectCup = courseIndex === 2 && nextPlacements.length === 3 && nextPlacements.every((placement) => placement === 1);
    setPhase(courseIndex === 2 ? (perfectCup ? "gojo-intro" : "championship") : "finished");
  }, [courseIndex, creatorTestMode, cupPlacements, gojoChallenge]);

  const handleItemChange = useCallback((nextItem: ItemType) => setItem(nextItem), []);
  const handleShieldChange = useCallback((active: boolean) => setShieldActive(active), []);
  const handleSkillChange = useCallback((remainingMs: number, totalMs: number, active: boolean) => {
    setSkillRemaining(remainingMs);
    setSkillCooldown(totalMs);
    setSkillActive(active);
  }, []);

  useEffect(() => {
    const handleMenuKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const target = event.target as HTMLElement | null;
      const editingText = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if (phase === "title") {
        if (key === "arrowup" || key === "arrowdown" || key === "w" || key === "s") {
          event.preventDefault();
          const nextFocus = key === "arrowup" || key === "w" ? 0 : 1;
          titleMenuFocusRef.current = nextFocus;
          setTitleMenuFocus(nextFocus);
        } else if (key === "c") {
          event.preventDefault();
          openCourseCreator();
        } else if (key === "enter" || key === " ") {
          event.preventDefault();
          if (titleMenuFocusRef.current === 0) openCupSelect();
          else openCourseCreator();
        }
      } else if (phase === "cup-select") {
        if (key === "arrowup" || key === "w") {
          event.preventDefault();
          setCupMenuFocus((value) => Math.max(0, value - 1) as 0 | 1 | 2 | 3);
        } else if (key === "arrowdown" || key === "s") {
          event.preventDefault();
          setCupMenuFocus((value) => Math.min(3, value + 1) as 0 | 1 | 2 | 3);
        } else if (key === "arrowleft" || key === "a") {
          event.preventDefault();
          if (cupMenuFocus === 0) setSelectedCupIndex((value) => (value + CUPS.length - 1) % CUPS.length);
          if (cupMenuFocus === 1) setItemOptionEnabled((value) => !value);
          if (cupMenuFocus === 2) setSkillOptionEnabled((value) => !value);
        } else if (key === "arrowright" || key === "d") {
          event.preventDefault();
          if (cupMenuFocus === 0) setSelectedCupIndex((value) => (value + 1) % CUPS.length);
          if (cupMenuFocus === 1) setItemOptionEnabled((value) => !value);
          if (cupMenuFocus === 2) setSkillOptionEnabled((value) => !value);
        } else if (key === "enter" || key === " ") {
          event.preventDefault();
          if (cupMenuFocus === 1) setItemOptionEnabled((value) => !value);
          else if (cupMenuFocus === 2) setSkillOptionEnabled((value) => !value);
          else startSelectedCup();
        } else if (key === "escape" || key === "backspace") {
          setPhase("title");
        }
      } else if (phase === "character-select") {
        if (key === "arrowleft" || key === "a") {
          event.preventDefault();
          setSelectedCharacterIndex((value) => (value + CHARACTERS.length - 1) % CHARACTERS.length);
        } else if (key === "arrowright" || key === "d") {
          event.preventDefault();
          setSelectedCharacterIndex((value) => (value + 1) % CHARACTERS.length);
        } else if (key === "enter" || key === " ") {
          event.preventDefault();
          startSelectedCharacter();
        } else if (key === "escape" || key === "backspace") {
          backFromCharacterSelect();
        }
      } else if (phase === "finished" && (key === "enter" || key === " ")) {
        event.preventDefault();
        nextCourse();
      } else if (phase === "gojo-intro" && (key === "enter" || key === " ")) {
        event.preventDefault();
        startGojoChallenge();
      } else if (phase === "gojo-finished" && (key === "enter" || key === " ")) {
        event.preventDefault();
        showChampionshipAfterGojo();
      } else if (phase === "championship" && (key === "enter" || key === " ")) {
        event.preventDefault();
        returnToCupSelect();
      } else if (phase === "course-create") {
        if (editingText && key !== "escape") return;
        if (key === "arrowleft" || key === "a") {
          event.preventDefault();
          if (creatorEditMode === "road") selectCreatorPartOffset(-1);
          else selectCreatorHazardOffset(-1);
        } else if (key === "arrowright" || key === "d") {
          event.preventDefault();
          if (creatorEditMode === "road") selectCreatorPartOffset(1);
          else selectCreatorHazardOffset(1);
        } else if (key === "arrowup" || key === "w") {
          event.preventDefault();
          if (creatorEditMode === "road") setCreatorConnectAt("front");
          else setCreatorSelectedPartIndex((index) => Math.max(0, (index ?? creatorParts.length - 1) - 1));
        } else if (key === "arrowdown" || key === "s") {
          event.preventDefault();
          if (creatorEditMode === "road") setCreatorConnectAt("back");
          else setCreatorSelectedPartIndex((index) => Math.min(creatorParts.length - 1, (index ?? 0) + 1));
        } else if (key === "enter" || key === " ") {
          event.preventDefault();
          if (creatorEditMode === "road") addCreatorPart();
          else addCreatorHazard();
        } else if ((event.ctrlKey && key === "z") || key === "backspace") {
          event.preventDefault();
          if (creatorEditMode === "road") undoCreatorPart();
          else deleteCreatorHazard();
        } else if ((event.ctrlKey && key === "y") || key === "y") {
          event.preventDefault();
          redoCreatorPart();
        } else if (key === "tab") {
          event.preventDefault();
          setCreatorEditMode((mode) => mode === "road" ? "hazards" : "road");
        } else if (key === "escape") {
          event.preventDefault();
          setPhase("title");
        }
      } else if (phase === "creator-finished" && (key === "enter" || key === " ")) {
        event.preventDefault();
        returnToCreator();
      }
    };
    window.addEventListener("keydown", handleMenuKey, { passive: false });
    return () => window.removeEventListener("keydown", handleMenuKey);
  }, [addCreatorHazard, addCreatorPart, backFromCharacterSelect, creatorEditMode, creatorParts.length, cupMenuFocus, deleteCreatorHazard, phase, nextCourse, openCourseCreator, openCupSelect, redoCreatorPart, returnToCreator, returnToCupSelect, selectCreatorHazardOffset, selectCreatorPartOffset, showChampionshipAfterGojo, startGojoChallenge, startSelectedCharacter, startSelectedCup, undoCreatorPart]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      let pad: Gamepad | null = null;
      try {
        const pads = navigator.getGamepads?.() ?? [];
        for (let index = 0; index < pads.length; index += 1) {
          if (pads[index]?.connected) { pad = pads[index]; break; }
        }
      } catch {
        pad = null;
      }
      const pressed = (index: number) => Boolean(pad?.buttons[index]?.pressed || (pad?.buttons[index]?.value ?? 0) > 0.55);
      const axis = pad?.axes[0] ?? 0;
      const verticalAxis = pad?.axes[1] ?? 0;
      const current = {
        left: pressed(14) || axis < -0.62,
        right: pressed(15) || axis > 0.62,
        up: pressed(12) || verticalAxis < -0.62,
        down: pressed(13) || verticalAxis > 0.62,
        confirm: pressed(0),
        back: pressed(1),
        previousPart: pressed(4),
        nextPart: pressed(5),
        redo: pressed(3),
        exit: pressed(9),
      };
      const previous = menuPadHeld.current;
      if (phase === "title") {
        if (current.up && !previous.up) {
          titleMenuFocusRef.current = 0;
          setTitleMenuFocus(0);
        }
        if (current.down && !previous.down) {
          titleMenuFocusRef.current = 1;
          setTitleMenuFocus(1);
        }
        if (current.confirm && !previous.confirm) {
          if (titleMenuFocusRef.current === 0) openCupSelect();
          else openCourseCreator();
        }
      } else if (phase === "cup-select") {
        if (current.up && !previous.up) setCupMenuFocus((value) => Math.max(0, value - 1) as 0 | 1 | 2 | 3);
        if (current.down && !previous.down) setCupMenuFocus((value) => Math.min(3, value + 1) as 0 | 1 | 2 | 3);
        if (current.left && !previous.left) {
          if (cupMenuFocus === 0) setSelectedCupIndex((value) => (value + CUPS.length - 1) % CUPS.length);
          if (cupMenuFocus === 1) setItemOptionEnabled((value) => !value);
          if (cupMenuFocus === 2) setSkillOptionEnabled((value) => !value);
        }
        if (current.right && !previous.right) {
          if (cupMenuFocus === 0) setSelectedCupIndex((value) => (value + 1) % CUPS.length);
          if (cupMenuFocus === 1) setItemOptionEnabled((value) => !value);
          if (cupMenuFocus === 2) setSkillOptionEnabled((value) => !value);
        }
        if (current.confirm && !previous.confirm) {
          if (cupMenuFocus === 1) setItemOptionEnabled((value) => !value);
          else if (cupMenuFocus === 2) setSkillOptionEnabled((value) => !value);
          else startSelectedCup();
        }
        if (current.back && !previous.back) setPhase("title");
      } else if (phase === "character-select") {
        if (current.left && !previous.left) setSelectedCharacterIndex((value) => (value + CHARACTERS.length - 1) % CHARACTERS.length);
        if (current.right && !previous.right) setSelectedCharacterIndex((value) => (value + 1) % CHARACTERS.length);
        if (current.confirm && !previous.confirm) startSelectedCharacter();
        if (current.back && !previous.back) backFromCharacterSelect();
      } else if (phase === "finished" && current.confirm && !previous.confirm) {
        nextCourse();
      } else if (phase === "gojo-intro" && current.confirm && !previous.confirm) {
        startGojoChallenge();
      } else if (phase === "gojo-finished" && current.confirm && !previous.confirm) {
        showChampionshipAfterGojo();
      } else if (phase === "championship" && current.confirm && !previous.confirm) {
        returnToCupSelect();
      } else if (phase === "course-create") {
        if ((current.left && !previous.left) || (current.previousPart && !previous.previousPart)) {
          if (creatorEditMode === "road") selectCreatorPartOffset(-1);
          else selectCreatorHazardOffset(-1);
        }
        if ((current.right && !previous.right) || (current.nextPart && !previous.nextPart)) {
          if (creatorEditMode === "road") selectCreatorPartOffset(1);
          else selectCreatorHazardOffset(1);
        }
        if (current.up && !previous.up) {
          if (creatorEditMode === "road") setCreatorConnectAt("front");
          else setCreatorSelectedPartIndex((index) => Math.max(0, (index ?? creatorParts.length - 1) - 1));
        }
        if (current.down && !previous.down) {
          if (creatorEditMode === "road") setCreatorConnectAt("back");
          else setCreatorSelectedPartIndex((index) => Math.min(creatorParts.length - 1, (index ?? 0) + 1));
        }
        if (current.confirm && !previous.confirm) {
          if (creatorEditMode === "road") addCreatorPart();
          else addCreatorHazard();
        }
        if (current.back && !previous.back) {
          if (creatorEditMode === "road") undoCreatorPart();
          else deleteCreatorHazard();
        }
        if (current.redo && !previous.redo) redoCreatorPart();
        if (current.exit && !previous.exit) setPhase("title");
      } else if (phase === "creator-finished" && current.confirm && !previous.confirm) {
        returnToCreator();
      }
      menuPadHeld.current = current;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [addCreatorHazard, addCreatorPart, backFromCharacterSelect, creatorEditMode, creatorParts.length, cupMenuFocus, deleteCreatorHazard, phase, nextCourse, openCourseCreator, openCupSelect, redoCreatorPart, returnToCreator, returnToCupSelect, selectCreatorHazardOffset, selectCreatorPartOffset, showChampionshipAfterGojo, startGojoChallenge, startSelectedCharacter, startSelectedCup, undoCreatorPart]);

  const selectedCharacter = CHARACTERS[selectedCharacterIndex] ?? CHARACTERS[0];
  const championshipRoster = [selectedCharacter, ...CHARACTERS.filter((_, index) => index !== selectedCharacterIndex)];
  const creatorGojoDuel = creatorTestMode && creatorGojoMode === "duel";
  const creatorGojoField = creatorTestMode && creatorGojoMode === "field";
  const raceRoster = gojoChallenge || creatorGojoDuel
    ? [selectedCharacter, GOJO_CHARACTER]
    : creatorGojoField
      ? [...championshipRoster, GOJO_CHARACTER]
      : championshipRoster;
  const leaderboard = raceRoster.slice(1).map((racer) => ({ name: racer.name, badge: racer.badge, color: racer.name.toLowerCase(), player: false }));
  leaderboard.splice(position - 1, 0, { name: selectedCharacter.name, badge: selectedCharacter.badge, color: selectedCharacter.name.toLowerCase(), player: true });
  const itemLabel = activeItemsEnabled ? ITEM_LABELS[item] : { icon: "×", name: "ITEMS OFF" };
  const activeCup = CUPS.find((cup) => cup.id === activeCupId) ?? CUPS[0];
  const cupCourses = activeCup.courseIds.map(courseById);
  const cupCourseDefinition = cupCourses[courseIndex] ?? cupCourses[0];
  const courseDefinition = creatorTestMode && creatorTestDefinition
    ? creatorTestDefinition
    : phase === "course-create"
      ? creatorDefinition
      : cupCourseDefinition;
  const courseLapCount = lapCountForCourse(courseDefinition.id);
  const currentLap = Math.min(courseLapCount, Math.floor(Math.max(0, progress)) + 1);
  const racePercent = clamp(progress / courseLapCount, 0, 1) * 100;
  const creatorHeights = creatorDefinition.rawPoints.map((point) => point[1]);
  const creatorHeightRange = Math.round(Math.max(...creatorHeights) - Math.min(...creatorHeights));
  const creatorPlacementValid = creatorEditMode === "road" && creatorParts.length < MAX_CREATOR_PARTS;
  const selectedCreatorHazard = creatorHazards.find((hazard) => hazard.id === creatorSelectedHazardId) ?? null;
  const creatorFocusPartIndex = selectedCreatorHazard?.partIndex ?? creatorSelectedPartIndex;
  const racerNames = raceRoster.map((racer) => racer.name);
  const championshipRacerNames = championshipRoster.map((racer) => racer.name);
  const skillReady = activeSkillsEnabled && skillRemaining <= 0;
  const skillCharge = activeSkillsEnabled ? (skillCooldown > 0 ? clamp(1 - skillRemaining / skillCooldown, 0, 1) : 1) : 0;
  const championshipOrder = [0, 1, 2, 3].sort((a, b) => scores[b] - scores[a] || lastOrder.indexOf(a) - lastOrder.indexOf(b));
  const raceResultRows = lastOrder.map((actorId, rank) => ({ actorId, rank: rank + 1, points: RACE_POINTS[rank] }));
  const raceRound = gojoChallenge ? 4 : courseIndex + 1;
  const raceFieldSize = raceRoster.length;
  const creatorGojoLabel = creatorGojoMode === "duel" ? "1 VS 1" : creatorGojoMode === "field" ? "5 RACERS" : "OFF";
  const creatorRaceActive = activeItemsEnabled || activeSkillsEnabled || creatorGojoMode !== "off";
  const speedNeedleAngle = -126 + clamp(speed / 400, 0, 1) * 252;

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#race" aria-label="City Circuit ホーム">
          <span className="brand-mark">CC</span>
          <span><b>PRISM</b> CIRCUIT <small>3D</small></span>
        </a>
        <div className="status-pill"><i /> {phase === "course-create" ? "COURSE CREATE · AUTO CONNECT" : creatorTestMode ? `CUSTOM COURSE · ${creatorGojoMode === "duel" ? "GOJO DUEL" : creatorGojoMode === "field" ? "5 RACERS + GOJO" : activeItemsEnabled || activeSkillsEnabled ? "FULL RACE" : "TEST DRIVE"}` : gojoChallenge ? `${activeCup.name} · SECRET DUEL` : `${activeCup.name} · THREE-COURSE GRAND PRIX`}</div>
        <div className="sound-pill">{phase === "course-create" ? "EDITOR" : "CAM"} <span>{phase === "course-create" ? "3D BUILD VIEW" : "FIXED CHASE / 03"}</span></div>
      </header>

      <section className="race-intro">
        {phase === "course-create" ? (
          <>
            <div>
              <div className="eyebrow"><span>BUILD</span> {courseDefinition.name} · COURSE CREATOR</div>
              <h1>SHAPE THE <em>ROAD.</em></h1>
            </div>
            <p>パーツは接続点の方向と高さへ自動的に吸着します。<br />保存後も読み込み、再編集、テスト走行が可能です。</p>
          </>
        ) : (
          <>
            <div>
              <div className="eyebrow"><span>{creatorTestMode ? (creatorRaceActive ? "RACE" : "TEST") : `0${raceRound}`}</span> {courseDefinition.name} · {creatorTestMode ? "CUSTOM COURSE" : gojoChallenge ? "SECRET 1 VS 1" : "GRAND PRIX"}</div>
              <h1>{courseDefinition.title.split(" ").slice(0, -1).join(" ")} <em>{courseDefinition.title.split(" ").slice(-1)}</em></h1>
            </div>
            <p>{courseDefinition.description}<br />{creatorTestMode ? (creatorRaceActive ? "作成コースでCPUと3ラップのレース。エディターの対戦人数・アイテム・スキル設定を反映します。" : "作成した接続と高低差を3ラップの実走で確認します。") : `このコースは${courseLapCount}ラップ。3戦の獲得ポイントで総合優勝を争う。`}</p>
          </>
        )}
      </section>

      <section className={`game-layout theme-${courseDefinition.id}`} id="race" aria-label={`${courseDefinition.name} 3Dカートレースゲーム`}>
        <div className={`game-stage theme-${courseDefinition.id}`}>
          {phase !== "course-create" && (
            <>
              <div className="game-hud">
                <div className="position"><b>{position}</b><span>/{raceFieldSize}<br />POSITION</span></div>
                <div className="lap"><span>LAP</span><b>{currentLap}/{courseLapCount}</b></div>
                <div className={`item-slot ${activeItemsEnabled && item !== "EMPTY" ? "loaded" : ""} ${!activeItemsEnabled ? "disabled" : ""}`}>
                  <span>{activeItemsEnabled ? "ITEM" : "ITEM OPTION"} {shieldActive && <em>SHIELD ON</em>}</span><b><i>{itemLabel.icon}</i>{itemLabel.name}</b>
                </div>
                <div className="camera-mode"><span>CAMERA</span><b>FIXED CHASE</b></div>
                <div className="timer"><span>RACE TIME</span><b>{formatTime(elapsed)}</b></div>
              </div>

              <div className="speedometer" aria-label={`速度 ${speed}キロメートル毎時`}>
                <div className="speedometer-dial">
                  <div className="speedometer-arc" aria-hidden="true" />
                  <div className="speedometer-ticks" aria-hidden="true" />
                  <div className="speedometer-numbers" aria-hidden="true">
                    <span className="n0">0</span><span className="n1">1</span><span className="n2">2</span>
                    <span className="n3">3</span><span className="n4">4</span><span className="n5">5</span>
                    <span className="n6">6</span><span className="n7">7</span><span className="n8">8</span>
                  </div>
                  <i className="speedometer-needle" style={{ transform: `translateX(-50%) rotate(${speedNeedleAngle}deg)` }} />
                  <i className="speedometer-hub" />
                  <b>{speed}</b>
                  <span className="speedometer-unit">KM/H</span>
                </div>
              </div>

              {(driftGauge > 0 || driftDashing) && (
                <div className={`drift-meter ${driftDashing ? "dashing" : "charging"}`} aria-label={`ドリフトターボゲージ ${Math.round(driftGauge * 100)}%`}>
                  <i className="drift-bolt" aria-hidden="true">ϟ</i>
                  <div className="drift-meter-body">
                    <div className="drift-meter-fill" style={{ width: `${driftGauge * 100}%` }} />
                    <span className="drift-meter-segments" aria-hidden="true" />
                  </div>
                  <b>{driftDashing ? "DRIFT TURBO" : "DRIFT"}</b>
                </div>
              )}

              <div className={`skill-meter ${skillReady ? "ready" : ""} ${skillActive ? "active" : ""} ${!activeSkillsEnabled ? "disabled" : ""}`} aria-label={activeSkillsEnabled ? `${selectedCharacter.skillName} ${skillReady ? "READY" : `${Math.ceil(skillRemaining / 1000)}秒`}` : "スキル無効"}>
                <span>SKILL // {activeSkillsEnabled ? selectedCharacter.skillName : "DISABLED"}</span>
                <div><i style={{ width: `${skillCharge * 100}%` }} /></div>
                <b>{activeSkillsEnabled ? (skillReady ? "READY" : `${Math.ceil(skillRemaining / 1000)}s`) : "OFF"}</b>
              </div>
            </>
          )}

          {phase === "course-create" ? (
            <CourseCreatorWorld
              parts={creatorParts}
              selectedPart={creatorPartType}
              connectAt={creatorConnectAt}
              editMode={creatorEditMode}
              placementValid={creatorPlacementValid}
              focusPartIndex={creatorFocusPartIndex}
              hazards={creatorHazards}
              selectedHazardId={creatorSelectedHazardId}
              onConnectAtChange={setCreatorConnectAt}
              onPlace={addCreatorPart}
            />
          ) : (
            <RaceWorld phase={phase} runId={runId} courseDefinition={courseDefinition} selectedCharacterIndex={selectedCharacterIndex} gojoChallenge={gojoChallenge || creatorGojoDuel} gojoField={creatorGojoField} itemsEnabled={activeItemsEnabled} skillsEnabled={activeSkillsEnabled} creatorParts={creatorParts} creatorHazards={creatorTestHazards} onTelemetry={handleTelemetry} onFinish={handleFinish} onItemChange={handleItemChange} onShieldChange={handleShieldChange} onSkillChange={handleSkillChange} />
          )}

          {phase === "title" && (
            <div className="game-overlay title-overlay">
              <div className="overlay-kicker">FULL 3D · SIX COURSES · TWO CUPS</div>
              <h2>PRISM<br /><span>CIRCUIT 3D.</span></h2>
              <p>2つのカップ、6つのコース。3戦の合計ポイントでチャンピオンを決めろ。<span className="pad-help">CONTROLLER：× / A　 KEYBOARD：ENTER</span></p>
              <div className="title-actions">
                <button className={`race-button ${titleMenuFocus === 0 ? "menu-focus" : ""}`} onMouseEnter={() => { titleMenuFocusRef.current = 0; setTitleMenuFocus(0); }} onClick={openCupSelect}>SELECT CUP <span>→</span></button>
                <button className={`race-button creator-button ${titleMenuFocus === 1 ? "menu-focus" : ""}`} onMouseEnter={() => { titleMenuFocusRef.current = 1; setTitleMenuFocus(1); }} onClick={openCourseCreator}>COURSE CREATE <span>＋</span></button>
              </div>
              <div className="controller-prompt">↑ ↓：MODE　× / A・ENTER：決定　C：COURSE CREATE</div>
            </div>
          )}

          {phase === "course-create" && (
            <div className="game-overlay course-creator-overlay">
              <div className="creator-head-panel">
                <div className="creator-panel-heading">
                  <span>DIRECT BUILD // LIVE PREVIEW</span>
                  <button onClick={() => setPhase("title")} aria-label="タイトルへ戻る">×</button>
                </div>
                <label className="creator-name">
                  <span>COURSE NAME</span>
                  <input value={creatorCourseName} maxLength={24} onChange={(event) => setCreatorCourseName(event.target.value)} />
                </label>
                <p className="creator-notice">{creatorNotice}</p>
              </div>

              <div className={`creator-endpoint-panel ${creatorEditMode === "hazards" ? "hazard-mode" : ""}`}>
                {creatorEditMode === "road" ? (
                  <>
                    <div className="creator-section-label">ACTIVE CONNECTION</div>
                    <div className="creator-connect-toggle">
                      <button className={creatorConnectAt === "front" ? "selected" : ""} onClick={() => setCreatorConnectAt("front")}>● FRONT</button>
                      <button className={creatorConnectAt === "back" ? "selected" : ""} onClick={() => setCreatorConnectAt("back")}>BACK ●</button>
                    </div>
                    <small>3D画面の接続リングを押しても切り替えられます</small>
                    <div className="creator-build-actions">
                      <button onClick={undoCreatorPart} disabled={!creatorUndoStack.length}>↶ UNDO</button>
                      <button onClick={redoCreatorPart} disabled={!creatorRedoStack.length}>REDO ↷</button>
                      <button onClick={resetCreatorCourse}>RESET</button>
                    </div>
                  </>
                ) : selectedCreatorHazard ? (
                  <div className="creator-hazard-settings">
                    <div className="creator-section-label">HAZARD DETAILS</div>
                    <b>{CREATOR_HAZARDS.find((hazard) => hazard.id === selectedCreatorHazard.type)?.label}</b>
                    <label>
                      <span>LANE POSITION <em>{selectedCreatorHazard.lane > 0 ? `R ${selectedCreatorHazard.lane}` : selectedCreatorHazard.lane < 0 ? `L ${Math.abs(selectedCreatorHazard.lane)}` : "CENTER"}</em></span>
                      <input type="range" min="-7" max="7" step="1" value={selectedCreatorHazard.lane} onChange={(event) => updateCreatorHazard({ lane: Number(event.target.value) })} />
                    </label>
                    {selectedCreatorHazard.type !== "river" && (
                      <label>
                        <span>INTERVAL <em>{selectedCreatorHazard.interval.toFixed(1)}s</em></span>
                        <input type="range" min="2" max="15" step="0.5" value={selectedCreatorHazard.interval} onChange={(event) => updateCreatorHazard({ interval: Number(event.target.value) })} />
                      </label>
                    )}
                    <label>
                      <span>{selectedCreatorHazard.type === "river" ? "FLOW SPEED" : selectedCreatorHazard.type === "monkey" ? "MOVE SPEED" : selectedCreatorHazard.type === "cannon" ? "SHOT SPEED" : selectedCreatorHazard.type === "cloud-beam" ? "BEAM SPEED" : "ACTION SPEED"} <em>×{selectedCreatorHazard.speed.toFixed(1)}</em></span>
                      <input type="range" min="0.5" max="2" step="0.1" value={selectedCreatorHazard.speed} onChange={(event) => updateCreatorHazard({ speed: Number(event.target.value) })} />
                    </label>
                    <label>
                      <span>{selectedCreatorHazard.type === "monkey" ? "PATROL WIDTH" : selectedCreatorHazard.type === "cloud-beam" ? "BREAK AREA" : "EFFECT WIDTH"} <em>{selectedCreatorHazard.width.toFixed(0)}m</em></span>
                      <input type="range" min="2" max="12" step="1" value={selectedCreatorHazard.width} onChange={(event) => updateCreatorHazard({ width: Number(event.target.value) })} />
                    </label>
                    <label>
                      <span>{selectedCreatorHazard.type === "river" ? "BOOST LEVEL" : selectedCreatorHazard.type === "cloud-beam" ? "GAP DURATION" : "INTENSITY"} <em>LV.{selectedCreatorHazard.intensity}</em></span>
                      <input type="range" min="1" max="3" step="1" value={selectedCreatorHazard.intensity} onChange={(event) => updateCreatorHazard({ intensity: Number(event.target.value) })} />
                    </label>
                    <div className="creator-hazard-setting-actions">
                      <button className={selectedCreatorHazard.enabled ? "enabled" : ""} onClick={() => updateCreatorHazard({ enabled: !selectedCreatorHazard.enabled })}>{selectedCreatorHazard.enabled ? "ENABLED" : "DISABLED"}</button>
                      <button className="delete" onClick={deleteCreatorHazard}>DELETE</button>
                    </div>
                  </div>
                ) : (
                  <div className="creator-hazard-empty">
                    <div className="creator-section-label">HAZARD DETAILS</div>
                    <b>SELECT A HAZARD</b>
                    <p>道路区間へお邪魔要素を追加するか、配置済みの要素を選ぶと詳細設定を表示します。</p>
                  </div>
                )}
              </div>

              <div className="creator-panel">
                <div className="creator-dock-heading">
                  <div className="creator-mode-tabs">
                    <button
                      className={creatorEditMode === "road" ? "selected" : ""}
                      onClick={() => {
                        setCreatorEditMode("road");
                        setCreatorSelectedHazardId(null);
                        setCreatorNotice("道路パーツの配置・選択・削除モードへ切り替えました。");
                      }}
                    >ROAD PARTS</button>
                    <button
                      className={creatorEditMode === "hazards" ? "selected" : ""}
                      onClick={() => {
                        setCreatorEditMode("hazards");
                        setCreatorSelectedPartIndex((index) => index ?? Math.max(0, creatorParts.length - 1));
                        setCreatorNotice("道路区間を選び、お邪魔要素を配置して詳細を調整してください。");
                      }}
                    >HAZARDS <i>{creatorHazards.length}</i></button>
                  </div>
                  <small>{creatorEditMode === "road" ? "道路を選択して接続" : "区間を選択してお邪魔要素を追加"}</small>
                </div>
                {creatorEditMode === "road" ? (
                  <>
                    <div className="creator-part-carousel">
                      {COURSE_PARTS.map((part) => (
                        <button
                          className={creatorPartType === part.id ? "selected" : ""}
                          key={part.id}
                          onClick={() => setCreatorPartType(part.id)}
                          aria-pressed={creatorPartType === part.id}
                        >
                          <i>{part.icon}</i><span>{part.label}<small>{part.description}</small></span>
                        </button>
                      ))}
                    </div>

                    <div className="creator-place-row">
                      <div className="creator-sequence" aria-label="現在のコースパーツ">
                        {creatorParts.map((partId, index) => {
                          const part = COURSE_PARTS.find((entry) => entry.id === partId) ?? COURSE_PARTS[0];
                          return (
                            <button
                              className={creatorSelectedPartIndex === index ? "selected" : ""}
                              key={`${partId}-${index}`}
                              title={creatorSelectedPartIndex === index
                                ? `${index + 1}. ${part.label}を削除する`
                                : `${index + 1}. ${part.label}を選択して確認する`}
                              onClick={() => selectOrRemoveCreatorPart(index)}
                              aria-pressed={creatorSelectedPartIndex === index}
                            >
                              <b>{String(index + 1).padStart(2, "0")}</b><i>{part.icon}</i>
                            </button>
                          );
                        })}
                      </div>
                      <button className="creator-place-button" disabled={!creatorPlacementValid} onClick={addCreatorPart}>
                        <b>PLACE PART</b>
                        <span>{creatorConnectAt === "front" ? "FRONT" : "BACK"}へ自動接続 ＋</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="creator-hazard-carousel">
                      {CREATOR_HAZARDS.map((hazard) => (
                        <button
                          className={creatorHazardType === hazard.id ? "selected" : ""}
                          key={hazard.id}
                          onClick={() => setCreatorHazardType(hazard.id)}
                          aria-pressed={creatorHazardType === hazard.id}
                        >
                          <i style={{ color: hazard.color }}>{hazard.icon}</i>
                          <span>{hazard.label}<small>{hazard.description}</small></span>
                        </button>
                      ))}
                    </div>
                    <div className="creator-hazard-place-row">
                      <div>
                        <span>01　SELECT ROAD SECTION</span>
                        <div className="creator-sequence" aria-label="お邪魔要素を配置するコース区間">
                          {creatorParts.map((partId, index) => {
                            const part = COURSE_PARTS.find((entry) => entry.id === partId) ?? COURSE_PARTS[0];
                            return (
                              <button
                                className={creatorSelectedPartIndex === index ? "selected" : ""}
                                key={`hazard-part-${partId}-${index}`}
                                title={`${index + 1}. ${part.label}へ配置`}
                                onClick={() => selectOrRemoveCreatorPart(index)}
                                aria-pressed={creatorSelectedPartIndex === index}
                              >
                                <b>{String(index + 1).padStart(2, "0")}</b><i>{part.icon}</i>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <button className="creator-place-button hazard" disabled={creatorSelectedPartIndex === null || creatorHazards.length >= MAX_CREATOR_HAZARDS} onClick={addCreatorHazard}>
                        <b>ADD HAZARD</b>
                        <span>選択区間へ配置 ＋</span>
                      </button>
                    </div>
                    <div className="creator-hazard-list" aria-label="配置済みのお邪魔要素">
                      {creatorHazards.length ? creatorHazards.map((hazard, index) => {
                        const definition = CREATOR_HAZARDS.find((entry) => entry.id === hazard.type) ?? CREATOR_HAZARDS[0];
                        return (
                          <button
                            className={`${hazard.id === creatorSelectedHazardId ? "selected" : ""} ${hazard.enabled ? "" : "disabled"}`}
                            key={hazard.id}
                            onClick={() => selectCreatorHazard(hazard)}
                          >
                            <i style={{ color: definition.color }}>{definition.icon}</i>
                            <span>{String(index + 1).padStart(2, "0")} · {definition.label}<small>PART {hazard.partIndex + 1} · {hazard.enabled ? "ON" : "OFF"}</small></span>
                          </button>
                        );
                      }) : <p>配置済みのお邪魔要素はありません。</p>}
                    </div>
                  </>
                )}

                <div className="creator-dock-footer">
                  <div className="creator-stats">
                    <span><b>{creatorParts.length}/{MAX_CREATOR_PARTS}</b> PARTS</span>
                    <span><b>{creatorHazards.length}/{MAX_CREATOR_HAZARDS}</b> HAZARDS</span>
                    <span><b>{creatorDefinition.distance}</b> LENGTH</span>
                    <span><b>{creatorHeightRange}M</b> HEIGHT</span>
                    <span><b>AUTO</b> LOOP</span>
                  </div>
                  <div className="creator-file-actions">
                    <button onClick={saveCreatorCourse}>SAVE</button>
                    <button onClick={loadCreatorCourse} disabled={!savedCreatorCourse}>LOAD</button>
                    <button
                      className={`creator-race-option ${creatorRaceItemsEnabled ? "enabled" : ""}`}
                      aria-pressed={creatorRaceItemsEnabled}
                      onClick={() => setCreatorRaceItemsEnabled((enabled) => !enabled)}
                    >
                      ITEMS <b>{creatorRaceItemsEnabled ? "ON" : "OFF"}</b>
                    </button>
                    <button
                      className={`creator-race-option ${creatorRaceSkillsEnabled ? "enabled" : ""}`}
                      aria-pressed={creatorRaceSkillsEnabled}
                      onClick={() => setCreatorRaceSkillsEnabled((enabled) => !enabled)}
                    >
                      SKILLS <b>{creatorRaceSkillsEnabled ? "ON" : "OFF"}</b>
                    </button>
                    <button
                      className={`creator-race-option creator-gojo-option ${creatorGojoMode !== "off" ? "enabled" : ""}`}
                      aria-label={`Gojo race setting: ${creatorGojoLabel}`}
                      onClick={() => setCreatorGojoMode((mode) => mode === "off" ? "duel" : mode === "duel" ? "field" : "off")}
                    >
                      GOJO <b>{creatorGojoLabel}</b>
                    </button>
                    <button className="test" onClick={testCreatorCourse}>{creatorRaceItemsEnabled || creatorRaceSkillsEnabled || creatorGojoMode !== "off" ? "START RACE" : "TEST DRIVE"} <span>→</span></button>
                  </div>
                </div>
                <small className="creator-save-status">{savedCreatorCourse ? `SAVED：${savedCreatorCourse.name} · ${new Date(savedCreatorCourse.savedAt).toLocaleDateString("ja-JP")}` : "NO SAVED COURSE"}</small>
              </div>
            </div>
          )}

          {phase === "cup-select" && (
            <div className="game-overlay cup-select-overlay">
              <div className="overlay-kicker">CHOOSE YOUR THREE-RACE CHAMPIONSHIP</div>
              <h2>SELECT<br /><span>A CUP.</span></h2>
              <div className="cup-grid">
                {CUPS.map((cup, index) => (
                  <button
                    className={`cup-card cup-${cup.id} ${selectedCupIndex === index ? "selected" : ""} ${cupMenuFocus === 0 ? "menu-focus" : ""}`}
                    key={cup.id}
                    onClick={() => { setSelectedCupIndex(index); setCupMenuFocus(0); }}
                    onMouseEnter={() => { setSelectedCupIndex(index); setCupMenuFocus(0); }}
                    aria-pressed={selectedCupIndex === index}
                  >
                    <b>0{index + 1}</b>
                    <span>{cup.name}<small>{cup.subtitle}</small></span>
                    <em>{cup.courseIds.map(courseById).map((course) => course.name).join(" / ")}</em>
                  </button>
                ))}
              </div>
              <div className="race-options" role="group" aria-label="レースオプション">
                <span>RACE OPTIONS</span>
                <button
                  className={`${itemOptionEnabled ? "enabled" : "disabled"} ${cupMenuFocus === 1 ? "menu-focus" : ""}`}
                  onClick={() => setItemOptionEnabled((value) => !value)}
                  onMouseEnter={() => setCupMenuFocus(1)}
                  aria-pressed={itemOptionEnabled}
                >
                  <i>ITEMS</i><small>アイテムボックスと全レーサーのアイテム使用</small><b>{itemOptionEnabled ? "ON" : "OFF"}</b>
                </button>
                <button
                  className={`${skillOptionEnabled ? "enabled" : "disabled"} ${cupMenuFocus === 2 ? "menu-focus" : ""}`}
                  onClick={() => setSkillOptionEnabled((value) => !value)}
                  onMouseEnter={() => setCupMenuFocus(2)}
                  aria-pressed={skillOptionEnabled}
                >
                  <i>SKILLS</i><small>プレイヤーとCPUのキャラクター固有スキル</small><b>{skillOptionEnabled ? "ON" : "OFF"}</b>
                </button>
              </div>
              <div className="course-preview-row cup-course-row">
                {CUPS[selectedCupIndex].courseIds.map(courseById).map((course, index) => (
                  <div className={`course-preview course-${course.id}`} key={course.id}>
                    <b>0{index + 1}</b><span>{course.name}<small>{course.tagline}</small></span>
                  </div>
                ))}
              </div>
              <p>↑ ↓：項目選択　← →：変更　× / A：決定・切替　○ / B：戻る</p>
              <button className={`race-button ${cupMenuFocus === 3 ? "menu-focus" : ""}`} onClick={startSelectedCup} onMouseEnter={() => setCupMenuFocus(3)}>CHOOSE CHARACTER <span>→</span></button>
            </div>
          )}

          {phase === "character-select" && (
            <div className="game-overlay character-select-overlay">
              <div className="overlay-kicker">{characterSelectSource === "creator" ? `${creatorDefinition.name} // CUSTOM COURSE` : activeCup.name} // CHOOSE YOUR RACER</div>
              <h2>SELECT<br /><span>A CHARACTER.</span></h2>
              <div className="character-grid">
                {CHARACTERS.map((character, index) => (
                  <button
                    className={`character-card character-${character.name.toLowerCase()} ${selectedCharacterIndex === index ? "selected" : ""}`}
                    key={character.name}
                    onClick={() => setSelectedCharacterIndex(index)}
                    onMouseEnter={() => setSelectedCharacterIndex(index)}
                    aria-pressed={selectedCharacterIndex === index}
                  >
                    <div className={`character-face face-${character.animal}`} aria-hidden="true">
                      <i className="face-ear face-ear-left" />
                      <i className="face-ear face-ear-right" />
                      <span className="face-head">
                        <i className="face-eye face-eye-left" />
                        <i className="face-eye face-eye-right" />
                        <i className="face-muzzle" />
                        <i className="face-nose" />
                      </span>
                    </div>
                    <strong>{character.name}</strong>
                    <span>{character.skillName}</span>
                    <p>{character.skillDescription}</p>
                    <em>COOLDOWN {character.cooldownMs / 1000}s</em>
                  </button>
                ))}
              </div>
              <p>← → / LEFT STICK：キャラ選択　× / A：決定　○ / B：戻る</p>
              <div className="character-select-actions">
                <button className="character-back-button" onClick={backFromCharacterSelect}>← BACK</button>
                <button className="race-button" onClick={startSelectedCharacter}>{characterSelectSource === "creator" ? "START CUSTOM RACE" : "RACE"} AS {selectedCharacter.name} <span>→</span></button>
              </div>
            </div>
          )}

          {phase === "countdown" && <div key={countdown} className={`countdown ${countdown === "GO!" ? "go" : ""}`}>{countdown}</div>}

          {phase === "finished" && (
            <div className="game-overlay finish-overlay">
              <div className="overlay-kicker">ROUND {courseIndex + 1} COMPLETE · {courseDefinition.name}</div>
              <h2>{finishPosition === 1 ? "COURSE" : "POINTS"}<br /><span>{finishPosition === 1 ? "WINNER." : "SECURED."}</span></h2>
              <div className="finish-result"><b>{finishPosition}<sup>{finishPosition === 1 ? "ST" : finishPosition === 2 ? "ND" : finishPosition === 3 ? "RD" : "TH"}</sup></b><span>{formatTime(finishTime)}</span></div>
              <div className="result-grid">
                {raceResultRows.map((result) => <span key={result.actorId}><b>{result.rank}. {racerNames[result.actorId]}</b><em>+{result.points} PT</em></span>)}
              </div>
              <button className="race-button" onClick={nextCourse}>NEXT · {cupCourses[courseIndex + 1]?.name} <span>→</span></button>
            </div>
          )}

          {phase === "gojo-intro" && (
            <div className="game-overlay finish-overlay gojo-overlay">
              <div className="overlay-kicker">PERFECT CUP · ALL THREE RACES WON</div>
              <h2>SECRET<br /><span>CHALLENGER.</span></h2>
              <div className="gojo-reveal">
                <div className="character-face face-monkey" aria-hidden="true">
                  <i className="face-ear face-ear-left" />
                  <i className="face-ear face-ear-right" />
                  <span className="face-head">
                    <i className="face-eye face-eye-left" />
                    <i className="face-eye face-eye-right" />
                    <i className="face-muzzle" />
                    <i className="face-nose" />
                  </span>
                </div>
                <div><b>GOJO</b><span>PINK MONKEY · CPU ONLY</span><p>4つの固有スキルを状況判断で使い分ける。第3コースで、最後の1対1勝負。</p></div>
              </div>
              <button className="race-button gojo-button" onClick={startGojoChallenge}>RACE 04 · FACE GOJO <span>→</span></button>
              <small className="pad-help">ENTER / A · START SECRET DUEL</small>
            </div>
          )}

          {phase === "gojo-finished" && (
            <div className="game-overlay finish-overlay gojo-overlay">
              <div className="overlay-kicker">SECRET DUEL COMPLETE · {courseDefinition.name}</div>
              <h2>{finishPosition === 1 ? "GOJO" : "SECRET RIVAL"}<br /><span>{finishPosition === 1 ? "DEFEATED." : "WINS."}</span></h2>
              <div className="finish-result"><b>{finishPosition}<sup>{finishPosition === 1 ? "ST" : "ND"}</sup></b><span>{formatTime(finishTime)}</span></div>
              <p>{finishPosition === 1 ? "隠しCPU Gojoとの1対1に勝利しました。" : "Gojoは再挑戦を待っています。カップの総合結果へ進みます。"}</p>
              <button className="race-button gojo-button" onClick={showChampionshipAfterGojo}>GRAND PRIX RESULTS <span>→</span></button>
            </div>
          )}

          {phase === "championship" && (
            <div className="game-overlay finish-overlay championship-overlay">
              <div className="overlay-kicker">THREE COURSES COMPLETE · GRAND PRIX FINAL</div>
              <h2>{championshipRacerNames[championshipOrder[0]]} IS<br /><span>CHAMPION.</span></h2>
              <div className="championship-table">
                {championshipOrder.map((actorId, rank) => (
                  <div className={actorId === 0 ? "player-score" : ""} key={actorId}>
                    <b>0{rank + 1}</b><span>{championshipRacerNames[actorId]}</span><em>{scores[actorId]} PT</em>
                  </div>
                ))}
              </div>
              <button className="race-button" onClick={returnToCupSelect}>BACK TO CUP SELECT <span>↻</span></button>
            </div>
          )}

          {phase === "creator-finished" && (
            <div className="game-overlay finish-overlay creator-finish-overlay">
              <div className="overlay-kicker">CUSTOM COURSE {creatorRaceActive ? "RACE" : "TEST"} COMPLETE · {courseDefinition.name}</div>
              <h2>{creatorRaceActive ? "RACE" : "TEST"}<br /><span>COMPLETE.</span></h2>
              <div className="finish-result"><b>{finishPosition}<sup>{finishPosition === 1 ? "ST" : finishPosition === 2 ? "ND" : finishPosition === 3 ? "RD" : "TH"}</sup></b><span>{formatTime(finishTime)}</span></div>
              <p>接続、高低差、カーブを確認しました。エディターへ戻って編集を続けられます。</p>
              <button className="race-button" onClick={returnToCreator}>BACK TO EDITOR <span>↻</span></button>
            </div>
          )}
        </div>

        {phase === "course-create" ? (
          <aside className="race-panel creator-guide-panel">
            <div className="panel-heading"><span>COURSE MAP</span><b>{creatorEditMode === "road" ? `${creatorConnectAt.toUpperCase()} END` : `${creatorHazards.length} HAZARDS`}</b></div>
            <CreatorMiniMap parts={creatorParts} connectAt={creatorConnectAt} />
            <div className="progress-track"><i style={{ width: `${Math.min(100, creatorParts.length / MAX_CREATOR_PARTS * 100)}%` }} /></div>
            <div className="creator-guide-card">
              <b>1. {creatorEditMode === "road" ? "SELECT" : "SECTION"}</b>
              <p>{creatorEditMode === "road" ? "画面下から道路を選ぶと、選択中の接続点へ半透明で仮置きされます。" : "画面下の番号から、お邪魔要素を配置する道路区間を選びます。"}</p>
            </div>
            <div className="creator-guide-card">
              <b>2. {creatorEditMode === "road" ? "PLACE" : "HAZARD"}</b>
              <p>{creatorEditMode === "road" ? "半透明の道路をクリックするか決定ボタンを押すだけで、向きと高さを合わせて設置します。" : "猿・光柱・川・流れ星・大砲から種類を選び、選択区間へ追加します。"}</p>
            </div>
            <div className="creator-guide-card">
              <b>3. {creatorEditMode === "road" ? "EDIT" : "TUNE"}</b>
              <p>{creatorEditMode === "road" ? "下のパーツ番号を1回押すと対象へ移動して点灯し、同じ番号をもう1回押すと削除します。" : "配置済み要素を選ぶと、位置・間隔・速度・幅・強度・有効状態を調整できます。"}</p>
            </div>
            <div className="creator-guide-card">
              <b>4. TEST</b>
              <p>{creatorEditMode === "road" ? "始点と終点はテスト時に自動で閉じます。戻す／やり直すで何度でも調整できます。" : "テスト走行では設定値どおりに作動します。保存データにも一緒に記録されます。"}</p>
            </div>
            <div className="creator-pad-map"><span>PAD</span><b>{creatorEditMode === "road" ? "左STICK 道路 · 右STICK 回転 · R2＋右STICK 視点移動 · ×設置 · ○戻す · △やり直す" : "左右 種類 · 上下 区間 · ×追加 · ○選択要素を削除 · TAB モード変更"}</b></div>
            <div className="render-badge"><b>{creatorDefinition.distance} · {creatorDefinition.name}</b><span>{creatorDefinition.tagline}</span></div>
          </aside>
        ) : (
        <aside className="race-panel">
          <div className="panel-heading"><span>ROUND {raceRound}/{gojoChallenge ? 4 : 3} · {courseDefinition.name}</span><b>{Math.round(racePercent)}%</b></div>
          <div className="progress-track"><i style={{ width: `${racePercent}%` }} /></div>
          <div className="leaderboard">
            {leaderboard.map((racer, index) => (
              <div className={`racer-row ${racer.player ? "active" : ""}`} key={`${racer.name}-${index}`}>
                <b className="rank">0{index + 1}</b>
                <span className={`avatar ${racer.color}`}>{racer.badge}</span>
                <span className="racer-name">{racer.name}<small>{racer.player ? "PLAYER ONE" : racer.name === "Gojo" ? "SECRET CPU" : "CITY CREW"}</small></span>
                <span className="racer-dot" />
              </div>
            ))}
          </div>
          <div className="grand-prix-score">
            <span>GRAND PRIX POINTS</span>
            {gojoChallenge ? (
              <>
                <div><b>{selectedCharacter.name}</b><i>CHALLENGER</i></div>
                <div><b>Gojo</b><i>SECRET CPU</i></div>
              </>
            ) : championshipOrder.map((actorId) => (
              <div key={actorId}><b>{championshipRacerNames[actorId]}</b><i>{scores[actorId]} PT</i></div>
            ))}
            <small>{gojoChallenge ? "BONUS DUEL · NO CHAMPIONSHIP POINTS" : "1ST 5 · 2ND 3 · 3RD 1 · 4TH 0"}</small>
          </div>
          <div className="control-card">
            <span>DRIVE CONTROLS</span>
            <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div>
            <p>アクセル・ブレーキ・ステアリング　SHIFT：ドリフト<br />ITEM：{activeItemsEnabled ? "SPACE / E / □" : "OFF"}　SKILL：{activeSkillsEnabled ? "Q / △" : "OFF"}</p>
          </div>
          <div className={`skill-card ${skillReady ? "ready" : ""} ${!activeSkillsEnabled ? "disabled" : ""}`}>
            <i>{selectedCharacter.badge}</i>
            <span><b>{activeSkillsEnabled ? selectedCharacter.skillName : "SKILLS OFF"}</b>{activeSkillsEnabled ? selectedCharacter.skillDescription : "このカップでは全レーサーの固有スキルが無効です。"}<small>{activeSkillsEnabled ? (skillReady ? "Q / △ で発動可能" : `再使用まで ${Math.ceil(skillRemaining / 1000)}秒`) : "CUP OPTION"}</small></span>
          </div>
          <div className={`item-card ${activeItemsEnabled && item !== "EMPTY" ? "loaded" : ""} ${!activeItemsEnabled ? "disabled" : ""}`}>
            <i>{itemLabel.icon}</i><span><b>{itemLabel.name}</b>{activeItemsEnabled ? (item === "EMPTY" ? "横一列のアイテムボックスを狙おう" : "SPACE / E で使用") : "このカップではアイテムボックスとアイテム使用が無効です。"}</span>
          </div>
          {shieldActive && <div className="shield-chip">◉ SHIELD ACTIVE · 1 HIT</div>}
          <div className={`item-guide ${!activeItemsEnabled ? "disabled" : ""}`}>{activeItemsEnabled ? <><b>7 ITEMS</b><span>◆ FIRE　◎ HOMING　⚡ BOOST　✦ AURORA</span><span>▲ SPIKES　◉ SHIELD　✹ NOVA (LAST 5%)</span></> : <><b>ITEMS OFF</b><span>ITEM BOXES HIDDEN · ALL RACERS</span></>}</div>
          <div className="render-badge"><b>{courseDefinition.distance} · {courseDefinition.name}</b><span>{courseDefinition.tagline}</span></div>
        </aside>
        )}
      </section>

      <footer><span>PRISM CIRCUIT © 2026</span><span>FULL 3D BROWSER ARCADE</span><span>SIX WORLDS. TWO CUPS. CREATE YOUR OWN.</span></footer>
    </main>
  );
}
