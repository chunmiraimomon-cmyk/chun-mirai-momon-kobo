"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type * as Three from "three";

type ThreeModule = typeof Three;
type GamePhase = "title" | "cup-select" | "countdown" | "racing" | "finished" | "championship";
type ItemType = "EMPTY" | "FIRE" | "HOMING" | "BOOST" | "AURORA" | "SPIKES" | "SHIELD" | "NOVA";
type AttackType = "FIRE" | "HOMING" | "AURORA" | "SPIKES" | "NOVA" | "MONKEY";
type DriverAnimal = "otter" | "fox" | "cat" | "corgi";
type CourseId = "city" | "jungle" | "starlight" | "river" | "cloud" | "pirate";
type CupId = "basic" | "adventure";
type GamepadInput = { connected: boolean; steer: number; gas: number; brake: number; drift: boolean; item: boolean };

type Racer = {
  name: string;
  badge: string;
  color: number;
  accent: number;
  progress: number;
  pace: number;
  lane: number;
};

const TAU = Math.PI * 2;
const COURSE_WIDTH = 10;
const SIDEWALK_EDGE = COURSE_WIDTH + 2.6;
const BARRIER_LANE = COURSE_WIDTH + 2.45;
const DECK_HALF_WIDTH = COURSE_WIDTH + 2.8;
const BARRIER_LIMIT = COURSE_WIDTH + 0.9;
const KART_RIDE_HEIGHT = 0.02;
const WORLD_GROUND_Y = -0.52;
const PLAYER_START_PROGRESS = -0.058;
const JUMP_MIN_SPEED = 23;
const JUMP_GRAVITY = 9.81;
const JUMP_COOLDOWN_MS = 900;
const TOTAL_LAPS = 3;
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
    tagline: "SEVEN-COLOR SKYWAY // METEOR STORM",
    description: "星雲の間を7色の光路で駆け抜ける天空コース。降り注ぐ流れ星を見切れ。",
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
    tagline: "DECK DESCENT + LANTERN HOLD // CANNONBALL CROSSING",
    description: "巨大海賊船の甲板からランプの灯る船倉へ降り、横切る大砲の玉を抜けて甲板へ戻る船上コース。",
    distance: "810M",
    rawPoints: [
      [0, 13, 170], [-20, 13, 168], [-36, 12, 160], [-48, 10, 145],
      [-55, 7, 122], [-58, 3, 96], [-58, 1, 68], [-57, 1, 38],
      [-54, 1, 8], [-48, 1, -22], [-38, 1, -48], [-24, 1, -68],
      [-8, 1, -80], [10, 1, -82], [28, 1, -70], [42, 1, -52],
      [50, 1, -28], [55, 1, 0], [58, 1, 30], [58, 1, 60],
      [56, 1, 90], [52, 3, 116], [46, 7, 138], [35, 11, 155],
      [20, 13, 166], [8, 13, 170],
    ],
  },
];

type CupDefinition = { id: CupId; name: string; subtitle: string; courseIds: CourseId[] };
const CUPS: CupDefinition[] = [
  { id: "basic", name: "BASIC CUP", subtitle: "CITY · JUNGLE · STARLIGHT", courseIds: ["city", "jungle", "starlight"] },
  { id: "adventure", name: "ADVENTURE CUP", subtitle: "RIVER · CLOUD · PIRATE SHIP", courseIds: ["river", "cloud", "pirate"] },
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

const RIVALS: Racer[] = [
  { name: "PIXEL", badge: "PX", color: 0xe95277, accent: 0xffd8e2, progress: -0.012, pace: 34, lane: -1.9 },
  { name: "VOLT", badge: "VT", color: 0x7657d5, accent: 0xe7ddff, progress: -0.026, pace: 34, lane: 1.4 },
  { name: "COMET", badge: "CM", color: 0xf3a62f, accent: 0xffefd1, progress: -0.041, pace: 34, lane: -0.3 },
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function readGamepadInput(): GamepadInput {
  const bridgedInput = (globalThis as typeof globalThis & { __EVOLUTION_GAMEPAD_INPUT__?: GamepadInput }).__EVOLUTION_GAMEPAD_INPUT__;
  if (bridgedInput) return bridgedInput;
  if (typeof navigator === "undefined" || !navigator.getGamepads) return { connected: false, steer: 0, gas: 0, brake: 0, drift: false, item: false };
  let pads: ArrayLike<Gamepad | null>;
  try {
    pads = navigator.getGamepads();
  } catch {
    return { connected: false, steer: 0, gas: 0, brake: 0, drift: false, item: false };
  }
  let pad: Gamepad | null = null;
  for (let index = 0; index < pads.length; index += 1) {
    const candidate = pads[index];
    if (candidate?.connected) {
      pad = candidate;
      break;
    }
  }
  if (!pad) return { connected: false, steer: 0, gas: 0, brake: 0, drift: false, item: false };
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
  nearest: (x: number, z: number, hintU?: number) => { u: number; distance: number; pose: CoursePose };
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

  return { length: curve.getLength(), pointAt, nearest, isClearFromRoad };
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
  head.scale.set(animal === "corgi" ? 1.08 : 1, 1, animal === "fox" ? 1.08 : 1);
  const muzzle = add(new THREE.SphereGeometry(0.29, 24, 16), lightFur, 0, -0.11, 0.43, headPivot);
  muzzle.scale.set(animal === "otter" ? 1.22 : 1, 0.72, 0.72);
  const nose = add(new THREE.SphereGeometry(0.095, 18, 12), black, 0, -0.03, 0.67, headPivot);
  nose.scale.set(1.2, 0.82, 0.72);
  [-1, 1].forEach((side) => {
    const eyeMesh = add(new THREE.SphereGeometry(0.065, 18, 12), eye, side * 0.18, 0.1, 0.47, headPivot);
    eyeMesh.scale.set(0.85, 1.12, 0.58);
    const brow = add(new THREE.BoxGeometry(0.18, 0.035, 0.045), darkFur, side * 0.18, 0.22, 0.46, headPivot);
    brow.rotation.z = side * -0.12;
  });

  if (animal === "otter") {
    [-1, 1].forEach((side) => {
      const ear = add(new THREE.SphereGeometry(0.17, 22, 14), fur, side * 0.36, 0.35, -0.02, headPivot);
      ear.scale.set(0.72, 1, 0.62);
      add(new THREE.SphereGeometry(0.09, 18, 12), lightFur, side * 0.36, 0.35, 0.08, headPivot);
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
    kart.add(mesh);
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
  kart.add(driver);
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
  const skyColor = starlight ? 0x03061d : cloud || pirate ? 0x69c8f4 : jungle || river ? 0x69a97a : 0x9bd5f2;
  scene.background = new THREE.Color(skyColor);
  scene.fog = new THREE.Fog(starlight ? 0x090c2d : cloud || pirate ? 0x8ad7f6 : jungle || river ? 0x65966e : 0xb9def0, starlight ? 230 : 190, starlight ? 560 : 490);

  const oceanTime = { value: 0 };
  const groundMaterial = pirate
    ? new THREE.MeshPhysicalMaterial({ color: 0x087fba, emissive: 0x043b62, emissiveIntensity: 0.16, roughness: 0.14, metalness: 0.08, clearcoat: 0.82, clearcoatRoughness: 0.16 })
    : new THREE.MeshStandardMaterial({ color: cloud ? 0x85cbed : starlight ? 0x07091d : jungle || river ? 0x315f2f : 0x78976a, roughness: 0.98 });
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

  const concrete = new THREE.MeshStandardMaterial({ color: pirate ? 0x6f4325 : starlight ? 0x171b43 : jungle || river ? 0x9b825f : 0xc9c8bd, roughness: 0.88, metalness: 0.02 });
  if (!cloud) {
    const leftWalk = new THREE.Mesh(makeCourseStripGeometry(THREE, course, SIDEWALK_EDGE, COURSE_WIDTH, 0.02), concrete);
    const rightWalk = new THREE.Mesh(makeCourseStripGeometry(THREE, course, -COURSE_WIDTH, -SIDEWALK_EDGE, 0.02), concrete);
    leftWalk.receiveShadow = true;
    rightWalk.receiveShadow = true;
    scene.add(leftWalk, rightWalk);
  }

  if (starlight) {
    const prismColors = [0xee3f56, 0xff8b32, 0xffd94a, 0x42d66d, 0x39dce6, 0x4386ee, 0x9d56e8];
    const bandWidth = (COURSE_WIDTH * 2) / prismColors.length;
    prismColors.forEach((color, index) => {
      const left = COURSE_WIDTH - bandWidth * index;
      const right = left - bandWidth;
      const band = new THREE.Mesh(
        makeCourseStripGeometry(THREE, course, left, right, 0.055 + index * 0.0003),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.24, roughness: 0.38, metalness: 0.28 }),
      );
      band.receiveShadow = true;
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
        patch.userData.origin = origin;
        scene.add(patch);
        cloudPatches.push(patch);
      });
    }
    scene.userData.cloudPatches = cloudPatches;
  } else {
    const road = new THREE.Mesh(
      makeCourseStripGeometry(THREE, course, COURSE_WIDTH, -COURSE_WIDTH, 0.05),
      new THREE.MeshStandardMaterial({ color: pirate ? 0x8a552c : river ? 0x5d513c : jungle ? 0x4a4438 : 0x41464b, roughness: 0.88, metalness: 0.03 }),
    );
    road.receiveShadow = true;
    scene.add(road);

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
        return { channelIndex, progress, laneOffset, speed: 5.2 + (index % 7) * 0.42, phase: index * 0.73 };
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

  const deckMaterial = new THREE.MeshStandardMaterial({ color: pirate ? 0x4f2d1c : starlight ? 0x151735 : jungle || river ? 0x665442 : 0x74787a, roughness: 0.82, metalness: 0.12, side: THREE.DoubleSide });
  if (!cloud) {
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
  if (!cloud) {
    const laneMat = new THREE.MeshStandardMaterial({ color: starlight ? 0xe9f7ff : 0xf8f3df, emissive: starlight ? 0x77aaff : 0x000000, emissiveIntensity: starlight ? 0.8 : 0, roughness: 0.82 });
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
    new THREE.MeshStandardMaterial({ color: starlight ? 0xcff7ff : jungle ? 0xd3ba72 : 0xf7f1e7, emissive: starlight ? 0x4f9ac9 : 0x000000, emissiveIntensity: starlight ? 0.6 : 0, roughness: 0.72 }),
    new THREE.MeshStandardMaterial({ color: starlight ? 0x8b57d8 : jungle ? 0x4b7a38 : 0xc83f3f, emissive: starlight ? 0x4d258f : 0x000000, emissiveIntensity: starlight ? 0.6 : 0, roughness: 0.7 }),
  ];
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
    mesh.castShadow = true;
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
        const pane = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.2, 0.72, 0.07),
          glassMats[(index + row + column + 3) % glassMats.length],
        );
        pane.position.set(column * w * 0.27, y, -d / 2 - 0.04);
        group.add(pane);
      }
    }

    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.36, 0.55, d * 0.4), new THREE.MeshStandardMaterial({ color: 0x7d8586, roughness: 0.62, metalness: 0.32 }));
    roof.position.y = h + 0.27;
    roof.castShadow = true;
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
  }

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x76523a, roughness: 0.95 });
  const leafMats = [0x3f8249, 0x4f9656, 0x327241].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
  const makeTree = (x: number, y: number, z: number, size: number, index: number) => {
    if (!course.isClearFromRoad(x, z, COURSE_WIDTH + size * 1.2 + 1.2)) return;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * size, 0.23 * size, 2.15 * size, 14), trunkMat);
    trunk.position.set(x, y + 1.05 * size, z);
    trunk.castShadow = true;
    scene.add(trunk);
    [[0, 2.35, 0], [-0.42, 2.08, 0.08], [0.38, 2.12, -0.05]].forEach(([ox, oy, oz], crown) => {
      const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry((0.82 - crown * 0.05) * size, 2), leafMats[(index + crown) % leafMats.length]);
      leaves.position.set(x + ox * size, y + oy * size, z + oz * size);
      leaves.castShadow = true;
      scene.add(leaves);
    });
  };
  const environmentTreeCount = jungle ? 128 : river ? 164 : starlight || cloud || pirate ? 0 : 76;
  for (let i = 0; i < environmentTreeCount; i += 1) {
    const side = i % 2 === 0 ? 1 : -1;
    const point = course.pointAt(i / environmentTreeCount + 0.004, side * (jungle || river ? 18 + (i % 3) * 3.8 : 18.2));
    makeTree(point.x, point.y, point.z, river ? 1.28 + (i % 5) * 0.16 : jungle ? 1.05 + (i % 5) * 0.13 : 0.76 + (i % 4) * 0.07, i);
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
      rock.castShadow = true;
      scene.add(rock);
      for (let leafIndex = 0; leafIndex < 4; leafIndex += 1) {
        const leaf = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 1.25, 5, 12), fernMat);
        leaf.position.set(point.x, point.y + 1.1, point.z);
        leaf.rotation.set(Math.PI / 2.8, leafIndex * Math.PI / 2 + i, 0);
        scene.add(leaf);
      }
    }
  }

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3d4549, metalness: 0.72, roughness: 0.35 });
  for (let i = 0; i < (definition.id === "city" ? 52 : 0); i += 1) {
    const side = i % 2 === 0 ? 1 : -1;
    const point = course.pointAt(i / 52, side * 15.3);
    const x = point.x;
    const z = point.z;
    if (!course.isClearFromRoad(x, z, COURSE_WIDTH + 2.1)) continue;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.11, 4.1, 16), poleMat);
    pole.position.set(x, point.y + 2.05, z);
    pole.castShadow = true;
    scene.add(pole);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.8, 12), poleMat);
    arm.position.set(x, point.y + 3.98, z);
    arm.rotation.z = Math.PI / 2;
    arm.rotation.y = point.heading;
    scene.add(arm);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 12), new THREE.MeshStandardMaterial({ color: 0xfff6d7, emissive: 0xffdf96, emissiveIntensity: 0.28 }));
    lamp.position.set(x + point.nx * 0.35, point.y + 3.9, z + point.nz * 0.35);
    scene.add(lamp);
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
    scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xeaf4ff, size: 0.72, transparent: true, opacity: 0.92, depthWrite: false })));
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(16, 64, 40),
      new THREE.MeshStandardMaterial({ color: 0xbfd8ff, emissive: 0x5577bb, emissiveIntensity: 0.72, roughness: 0.78 }),
    );
    moon.position.set(-155, 108, -180);
    scene.add(moon);
    const crystalColors = [0x59e4ff, 0xc975ff, 0xffd95d];
    for (let i = 0; i < 44; i += 1) {
      const side = i % 2 === 0 ? 1 : -1;
      const point = course.pointAt(i / 44 + 0.01, side * (22 + (i % 4) * 5));
      if (!course.isClearFromRoad(point.x, point.z, COURSE_WIDTH + 4)) continue;
      const color = crystalColors[i % crystalColors.length];
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(1.6 + (i % 3) * 0.55, 1),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.72, roughness: 0.22, metalness: 0.5 }),
      );
      crystal.position.set(point.x, point.y + 2.3 + (i % 2) * 1.2, point.z);
      crystal.rotation.set(i * 0.2, i * 0.7, i * 0.13);
      scene.add(crystal);
    }
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
      const hullSide = new THREE.Mesh(new THREE.BoxGeometry(8.5, 12.5, 205), outerWood);
      hullSide.position.set(side * 62, 4.9, 27);
      hullSide.rotation.z = side * -0.11;
      hullSide.castShadow = true;
      hullSide.receiveShadow = true;
      scene.add(hullSide);
      const bowSide = new THREE.Mesh(new THREE.BoxGeometry(8.5, 12.5, 72), hullWood);
      bowSide.position.set(side * 43, 5, 147);
      bowSide.rotation.set(0, -side * 0.53, side * -0.12);
      bowSide.castShadow = true;
      scene.add(bowSide);
      const deckWing = new THREE.Mesh(new THREE.BoxGeometry(8, 1.3, 196), outerWood);
      deckWing.position.set(side * 58, 12.1, 27);
      deckWing.receiveShadow = true;
      scene.add(deckWing);
      for (let index = 0; index < 16; index += 1) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.52, 11.5, 1.2), iron);
        rib.position.set(side * 58.2, 5, -61 + index * 11.8);
        rib.rotation.z = side * -0.08;
        scene.add(rib);
      }
    });
    const stern = new THREE.Mesh(new THREE.BoxGeometry(124, 12.5, 8), hullWood);
    stern.position.set(0, 4.9, -76);
    stern.castShadow = true;
    scene.add(stern);
    const bowDeck = new THREE.Mesh(new THREE.BoxGeometry(108, 1.25, 35), outerWood);
    bowDeck.position.set(0, 12.15, 145);
    bowDeck.receiveShadow = true;
    scene.add(bowDeck);
    const sternDeck = new THREE.Mesh(new THREE.BoxGeometry(112, 1.25, 35), outerWood);
    sternDeck.position.set(0, 12.15, -64);
    scene.add(sternDeck);

    const interiorStart = 0.2;
    const interiorEnd = 0.8;
    const roofStart = 0.255;
    const roofEnd = 0.745;
    const leftWall = new THREE.Mesh(makeCourseWallSegmentGeometry(THREE, course, interiorStart, interiorEnd, 13.4, 7.25, -0.4), innerWood);
    const rightWall = new THREE.Mesh(makeCourseWallSegmentGeometry(THREE, course, interiorStart, interiorEnd, -13.4, 7.25, -0.4), innerWood);
    const roof = new THREE.Mesh(makeCourseSegmentGeometry(THREE, course, roofStart, roofEnd, 13.7, -13.7, 7.25, undefined, 340), darkCeiling);
    leftWall.receiveShadow = true;
    rightWall.receiveShadow = true;
    roof.castShadow = true;
    roof.receiveShadow = true;
    scene.add(leftWall, rightWall, roof);

    for (let index = 0; index < 30; index += 1) {
      const u = roofStart + (index / 29) * (roofEnd - roofStart);
      const point = course.pointAt(u);
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.55, 28.5), hullWood);
      beam.position.set(point.x, point.y + 6.9, point.z);
      beam.rotation.y = point.heading;
      beam.castShadow = true;
      scene.add(beam);
      if (index % 4 === 1) {
        const side = index % 8 < 4 ? 1 : -1;
        const lampPoint = course.pointAt(u, side * 11.7);
        const lampGroup = new THREE.Group();
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.78, 0.42), brass);
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 12), new THREE.MeshBasicMaterial({ color: 0xffc15e }));
        lampGroup.add(frame, glow);
        lampGroup.position.set(lampPoint.x, lampPoint.y + 3.9, lampPoint.z);
        scene.add(lampGroup);
        const lantern = new THREE.PointLight(0xff9f3d, 11, 24, 1.75);
        lantern.position.copy(lampGroup.position);
        scene.add(lantern);
      }
    }

    const entrancePose = course.pointAt(interiorStart - 0.012);
    const entrance = new THREE.Group();
    const entranceBeam = new THREE.Mesh(new THREE.BoxGeometry(26.5, 1.15, 1.2), outerWood);
    entranceBeam.position.y = 7.15;
    entrance.add(entranceBeam);
    [-1, 1].forEach((side) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(1.15, 7.5, 1.2), outerWood);
      post.position.set(side * 12.6, 3.5, 0);
      entrance.add(post);
    });
    const skullMat = new THREE.MeshStandardMaterial({ color: 0xd8c7a3, roughness: 0.78 });
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.9, 24, 18), skullMat);
    skull.scale.set(0.82, 1, 0.72);
    skull.position.set(0, 8.15, 0.15);
    entrance.add(skull);
    [-1, 1].forEach((side) => {
      const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.2, 12), skullMat);
      bone.position.set(0, 7.65, 0.25);
      bone.rotation.z = side * 0.82;
      entrance.add(bone);
    });
    entrance.position.set(entrancePose.x, entrancePose.y, entrancePose.z);
    entrance.rotation.y = entrancePose.heading;
    scene.add(entrance);

    [0.29, 0.38, 0.54, 0.63, 0.74, 0.81].forEach((u, chestIndex) => {
      const side = chestIndex % 2 === 0 ? 1 : -1;
      const point = course.pointAt(u, side * 15.8);
      const chest = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.25, 1.85), outerWood);
      base.position.y = 0.72;
      base.castShadow = true;
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

    [0.035, 0.94].forEach((u, mastIndex) => {
      const point = course.pointAt(u, mastIndex === 0 ? 23 : -23);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 1.05, 34, 24), hullWood);
      mast.position.set(point.x, 28.5, point.z);
      mast.castShadow = true;
      scene.add(mast);
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(24, 16, 10, 7), new THREE.MeshStandardMaterial({ color: 0xd8c7a3, roughness: 0.9, side: THREE.DoubleSide }));
      sail.position.set(point.x, 34, point.z);
      sail.rotation.y = point.heading + Math.PI / 2;
      scene.add(sail);
    });
    const anchorRing = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.38, 18, 48), iron);
    anchorRing.position.set(0, 16, 151);
    anchorRing.rotation.x = Math.PI / 2;
    scene.add(anchorRing);

    const gullMaterial = new THREE.MeshStandardMaterial({ color: 0xf7fbff, emissive: 0xb9dded, emissiveIntensity: 0.12, roughness: 0.78 });
    const gullBeak = new THREE.MeshStandardMaterial({ color: 0xf1a22c, roughness: 0.7 });
    const seagulls: Three.Group[] = [];
    for (let index = 0; index < 16; index += 1) {
      const gull = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.62, 5, 12), gullMaterial);
      body.rotation.x = Math.PI / 2;
      body.castShadow = true;
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
      gull.userData.radiusX = 58 + (index % 5) * 18;
      gull.userData.radiusZ = 78 + (index % 4) * 24;
      gull.userData.height = 28 + (index % 6) * 5.2;
      gull.userData.speed = 0.000075 + (index % 4) * 0.000012;
      scene.add(gull);
      seagulls.push(gull);
    }
    scene.userData.seagulls = seagulls;
  }

  scene.add(new THREE.HemisphereLight(starlight ? 0x8aaaff : jungle || river ? 0xcdecc6 : pirate ? 0xb9dfff : 0xd9f2ff, starlight ? 0x090b22 : jungle || river ? 0x294528 : pirate ? 0x201009 : 0x657b55, starlight ? 1.45 : pirate ? 1.35 : 2.15));
  const sun = new THREE.DirectionalLight(starlight ? 0x91b7ff : 0xfff2d2, starlight ? 2.1 : pirate ? 2.45 : 3.25);
  sun.position.set(-86, 135, 58);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -145;
  sun.shadow.camera.right = 145;
  sun.shadow.camera.top = 125;
  sun.shadow.camera.bottom = -125;
  sun.shadow.camera.far = 340;
  sun.shadow.bias = -0.00018;
  scene.add(sun);
}

function RaceWorld({
  phase,
  runId,
  courseDefinition,
  onTelemetry,
  onFinish,
  onItemChange,
  onShieldChange,
}: {
  phase: GamePhase;
  runId: number;
  courseDefinition: CourseDefinition;
  onTelemetry: (speed: number, progress: number, position: number, driftGauge: number, driftDashing: boolean) => void;
  onFinish: (time: number, position: number, order: number[]) => void;
  onItemChange: (item: ItemType) => void;
  onShieldChange: (active: boolean) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef(phase);
  const keys = useRef<Record<string, boolean>>({});
  const touch = useRef({ left: false, right: false, gas: false, brake: false, item: false, drift: false });
  const [webglError, setWebglError] = useState(false);
  const [gamepadConnected, setGamepadConnected] = useState(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", "e", "shift", " "].includes(event.key.toLowerCase())) event.preventDefault();
      keys.current[event.key.toLowerCase()] = true;
    };
    const up = (event: KeyboardEvent) => { keys.current[event.key.toLowerCase()] = false; };
    const clearControls = () => {
      keys.current = {};
      (Object.keys(touch.current) as Array<keyof typeof touch.current>).forEach((key) => { touch.current[key] = false; });
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

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
      addWorld(THREE, scene, course, courseDefinition);
      const oceanTime = scene.userData.oceanTime as { value: number } | undefined;
      const seagulls = (scene.userData.seagulls ?? []) as Three.Group[];
      const miniMapCanvas = host.querySelector<HTMLCanvasElement>(".mini-map-canvas");
      const miniMapContext = miniMapCanvas?.getContext("2d") ?? null;
      const miniMapSamples = Array.from({ length: 180 }, (_, index) => course.pointAt(index / 180));
      const miniMapBounds = miniMapSamples.reduce((bounds, point) => ({
        minX: Math.min(bounds.minX, point.x), maxX: Math.max(bounds.maxX, point.x),
        minZ: Math.min(bounds.minZ, point.z), maxZ: Math.max(bounds.maxZ, point.z),
      }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
      const camera = new THREE.PerspectiveCamera(57, 16 / 9, 0.1, 620);

      const driverAnimals: DriverAnimal[] = ["otter", "fox", "cat", "corgi"];
      const player = createKart(THREE, 0x20aeb3, 0xf0ffff, true, driverAnimals[0]);
      const start = course.pointAt(PLAYER_START_PROGRESS);
      player.position.set(start.x, start.y + KART_RIDE_HEIGHT, start.z);
      player.rotation.y = start.heading;
      scene.add(player);

      const rivalStates = RIVALS.map((rival) => ({
        ...rival,
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
        airY: course.pointAt(rival.progress, rival.lane).y,
        airSpeed: 0,
        verticalVelocity: 0,
        surfaceVerticalVelocity: 0,
        airborneSince: 0,
        jumpCooldownUntil: 0,
        landingImpactUntil: 0,
        cloudFallUntil: 0,
        useAt: 0,
      }));
      const rivalMeshes = rivalStates.map((rival, index) => {
        const mesh = createKart(THREE, rival.color, rival.accent, false, driverAnimals[index + 1]);
        scene.add(mesh);
        return mesh;
      });

      const pickupMaterial = new THREE.MeshPhysicalMaterial({ color: 0x45d6f1, emissive: 0x128eb8, emissiveIntensity: 0.72, roughness: 0.12, metalness: 0.25, transmission: 0.23, transparent: true, opacity: 0.9 });
      const pickupInnerMaterial = new THREE.MeshStandardMaterial({ color: 0xffd45c, emissive: 0xf1a91d, emissiveIntensity: 0.9, roughness: 0.24, metalness: 0.42 });
      const pickupPoints = ITEM_ROW_PROGRESS.flatMap((u, rowIndex) => ITEM_ROW_LANES.map((lane, laneIndex) => {
        const p = course.pointAt(u, lane);
        const group = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.25, 1.25, 4, 4, 4), pickupMaterial);
        box.rotation.set(0.18, Math.PI / 4, 0.15);
        box.castShadow = true;
        group.add(box);
        const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 1), pickupInnerMaterial);
        core.castShadow = true;
        group.add(core);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.83, 0.055, 12, 36), pickupInnerMaterial);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
        group.position.set(p.x, p.y + 1.35, p.z);
        scene.add(group);
        return { group, x: p.x, y: p.y, z: p.z, baseY: p.y + 1.35, active: true, respawnAt: 0, rowIndex, laneIndex };
      }));

      const racerMeshes = [player, ...rivalMeshes];
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
        const glow = new THREE.PointLight(0xffd63a, 0, 9, 2);
        glow.position.y = 1.2;
        mesh.add(glow);
        return { aura, glow };
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
        const glow = new THREE.PointLight(0xff5a35, 0, 12, 2);
        glow.position.y = 1.1;
        mesh.add(glow);
        return { burst, material, glow };
      });

      const projectileMaterial = new THREE.MeshStandardMaterial({ color: 0xff6b16, emissive: 0xff3100, emissiveIntensity: 2.2, roughness: 0.3 });
      const projectileCoreMaterial = new THREE.MeshStandardMaterial({ color: 0xfff3ae, emissive: 0xffc23c, emissiveIntensity: 2.5, roughness: 0.2 });
      const homingMaterial = new THREE.MeshPhysicalMaterial({ color: 0xe9564f, emissive: 0xa71918, emissiveIntensity: 0.8, roughness: 0.22, metalness: 0.58, clearcoat: 0.8 });
      const spikeMaterial = new THREE.MeshStandardMaterial({ color: 0x5d6267, roughness: 0.28, metalness: 0.88 });
      const trapBaseMaterial = new THREE.MeshStandardMaterial({ color: 0x262d31, roughness: 0.54, metalness: 0.5 });

      type ProjectileState = {
        kind: "FIRE" | "HOMING";
        owner: number;
        target: number | null;
        group: Three.Group;
        progress: number;
        lane: number;
        age: number;
        active: boolean;
      };
      type TrapState = { owner: number; group: Three.Group; x: number; y: number; z: number; armedAt: number; expiresAt: number; active: boolean };
      type MonkeyState = { group: Three.Group; progress: number; lane: number; direction: number; wanderPhase: number; nextTrapAt: number; actionUntil: number };
      type ShootingStarState = { group: Three.Group; warning: Three.Mesh; progress: number; lane: number; y: number; fallSpeed: number; active: boolean };
      type ShatterState = { group: Three.Group; startedAt: number };
      type FlowLogState = { group: Three.Group; progress: number; lane: number; phase: number; channelIndex: number };
      type StaticObstacleState = { group: Three.Group; progress: number; lane: number };
      type CannonState = { group: Three.Group; ball: Three.Group; progress: number; phase: number; lane: number; side: number };
      type WaterFlowParticle = { channelIndex: number; progress: number; laneOffset: number; speed: number; phase: number };
      const projectiles: ProjectileState[] = [];
      const traps: TrapState[] = [];
      const shootingStars: ShootingStarState[] = [];
      const shatters: ShatterState[] = [];
      const auroraContactTimes = new Map<string, number>();
      const monkeyContactCooldowns = new Map<string, number>();
      const obstacleContactCooldowns = new Map<string, number>();
      const flowingLogs: FlowLogState[] = [];
      const beanstalks: StaticObstacleState[] = [];
      const cannons: CannonState[] = [];
      const cloudPatches = (scene.userData.cloudPatches ?? []) as Three.Group[];
      const cloudGapKeys = new Set<string>();
      const selectedCloudGapKeys = new Set<string>();
      let nextCloudGapChangeAt = 0;
      let cloudGapCycleStartedAt = 0;
      const waterUniforms = (scene.userData.waterUniforms ?? []) as Array<{ value: number }>;
      const waterFlow = scene.userData.waterFlow as { points: Three.Points; particles: WaterFlowParticle[] } | undefined;

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
          core.castShadow = true;
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

      const exhaustCount = 72;
      const exhaustPositions = new Float32Array(exhaustCount * 3);
      const exhaustLife = new Float32Array(exhaustCount);
      const exhaustGeometry = new THREE.BufferGeometry();
      exhaustGeometry.setAttribute("position", new THREE.BufferAttribute(exhaustPositions, 3));
      const exhaust = new THREE.Points(exhaustGeometry, new THREE.PointsMaterial({ color: 0xbfeeff, size: 0.24, transparent: true, opacity: 0.56, depthWrite: false }));
      scene.add(exhaust);
      let exhaustCursor = 0;

      const playerState = {
        x: start.x,
        y: start.y,
        z: start.z,
        heading: start.heading,
        pitch: start.pitch,
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
      };
      let heldItem: ItemType = "EMPTY";
      let itemPressed = false;
      let novaFlashUntil = 0;
      let novaStarted = -10000;
      const novaHitUntil = [0, 0, 0, 0];
      let raceStart = 0;
      let nextShootingStarAt = 0;
      let previous = performance.now();
      let frame = 0;
      let hudTick = 0;
      let finished = false;
      let lastMiniMapDraw = 0;

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
          { x: playerState.x, z: playerState.z, color: "#37f3ee", radius: 5 },
          ...rivalStates.map((rival, index) => {
            const pose = course.pointAt(rival.progress, rival.lane);
            return { x: pose.x, z: pose.z, color: ["#ef5a81", "#8d72ef", "#ffb13b"][index], radius: 4 };
          }),
        ];
        actors.forEach((actor, index) => {
          const point = project(actor.x, actor.z);
          miniMapContext.beginPath();
          miniMapContext.arc(point.x, point.y, actor.radius, 0, TAU);
          miniMapContext.fillStyle = actor.color;
          miniMapContext.fill();
          miniMapContext.lineWidth = index === 0 ? 2 : 1;
          miniMapContext.strokeStyle = "#ffffff";
          miniMapContext.stroke();
        });
      };

      const actorProgress = (actorId: number) => actorId === 0 ? playerState.progress : rivalStates[actorId - 1].progress;
      const actorLane = (actorId: number) => {
        if (actorId !== 0) return rivalStates[actorId - 1].lane;
        const nearest = course.nearest(playerState.x, playerState.z, playerState.lastU);
        return clamp(
          (playerState.x - nearest.pose.x) * nearest.pose.nx + (playerState.z - nearest.pose.z) * nearest.pose.nz,
          -BARRIER_LIMIT,
          BARRIER_LIMIT,
        );
      };
      const actorPose = (actorId: number) => {
        if (actorId === 0) return { x: playerState.x, y: playerState.y, z: playerState.z, heading: playerState.heading, pitch: playerState.pitch, nx: Math.cos(playerState.heading), nz: -Math.sin(playerState.heading) };
        const rival = rivalStates[actorId - 1];
        const pose = course.pointAt(rival.progress, rival.lane);
        return rival.airborne ? { ...pose, y: rival.airY } : pose;
      };
      const actorRank = (actorId: number) => 1 + [0, 1, 2, 3].filter((otherId) => otherId !== actorId && actorProgress(otherId) > actorProgress(actorId)).length;
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
      const recoverPlayerFromFall = (now: number) => {
        const recovery = course.pointAt(playerState.recoveryU, playerState.recoveryLane);
        playerState.x = recovery.x;
        playerState.y = recovery.y;
        playerState.z = recovery.z;
        playerState.heading = recovery.heading;
        playerState.pitch = recovery.pitch;
        playerState.speed = 8;
        playerState.progress = playerState.recoveryProgress;
        playerState.lastU = playerState.recoveryU;
        playerState.groundY = recovery.y;
        playerState.airborne = false;
        playerState.airborneSince = 0;
        playerState.verticalVelocity = 0;
        playerState.surfaceVerticalVelocity = 0;
        playerState.offTrackSince = 0;
        playerState.drifting = false;
        playerState.driftCharge = 0;
        playerState.landingImpactUntil = now + 360;
        playerState.jumpCooldownUntil = now + JUMP_COOLDOWN_MS;
      };
      const actorCrashing = (actorId: number, now: number) => actorId === 0 ? now < playerState.crashUntil : now < rivalStates[actorId - 1].crashUntil;
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
        if (rank === 4 && Math.random() < 0.05) return "NOVA";
        const weighted = rank >= 3
          ? ["HOMING", "BOOST", "BOOST", "AURORA", "SPIKES", "SHIELD", "FIRE"] as ItemType[]
          : [...STANDARD_ITEMS, "FIRE", "SPIKES"] as ItemType[];
        return weighted[Math.floor(Math.random() * weighted.length)];
      };
      const crashActor = (actorId: number, now: number) => {
        if (actorCrashing(actorId, now)) return false;
        if (actorId === 0) {
          const road = course.nearest(playerState.x, playerState.z, playerState.lastU).pose;
          playerState.crashStart = now;
          playerState.crashUntil = now + 1450;
          playerState.speed = 0;
          playerState.y = road.y;
          playerState.groundY = road.y;
          playerState.airborne = false;
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
          rival.airborne = false;
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
          const nearest = course.nearest(playerState.x, playerState.z, playerState.lastU);
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
        const shieldable = attack === "FIRE" || attack === "HOMING" || attack === "AURORA" || attack === "SPIKES" || attack === "MONKEY";
        if (shieldable && now < actorAuroraUntil(targetId)) return "blocked" as const;
        if (shieldable && actorHasShield(targetId)) {
          setActorShield(targetId, false);
          return "blocked" as const;
        }
        crashActor(targetId, now);
        return "crashed" as const;
      };
      const targetOnePlaceAhead = (actorId: number) => {
        const order = [0, 1, 2, 3].sort((a, b) => actorProgress(b) - actorProgress(a));
        const index = order.indexOf(actorId);
        return index > 0 ? order[index - 1] : null;
      };
      const makeFireMesh = () => {
        const group = new THREE.Group();
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.45, 22, 14), projectileMaterial);
        flame.scale.set(0.78, 0.78, 1.65);
        flame.castShadow = true;
        group.add(flame);
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 12), projectileCoreMaterial);
        core.position.z = 0.28;
        group.add(core);
        const light = new THREE.PointLight(0xff591d, 16, 7, 2);
        group.add(light);
        return group;
      };
      const makeHomingMesh = () => {
        const group = new THREE.Group();
        const shell = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.72, 8, 18), homingMaterial);
        shell.rotation.x = Math.PI / 2;
        shell.castShadow = true;
        group.add(shell);
        [-1, 1].forEach((side) => {
          const fin = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.07, 0.45), homingMaterial);
          fin.position.set(side * 0.28, 0, -0.18);
          group.add(fin);
        });
        const light = new THREE.PointLight(0xff7c29, 9, 6, 2);
        light.position.z = -0.55;
        group.add(light);
        return group;
      };
      const spawnProjectile = (actorId: number, kind: "FIRE" | "HOMING") => {
        const pose = actorPose(actorId);
        const target = kind === "HOMING" ? targetOnePlaceAhead(actorId) : null;
        const resolvedKind = kind === "HOMING" && target === null ? "FIRE" : kind;
        const group = resolvedKind === "FIRE" ? makeFireMesh() : makeHomingMesh();
        group.position.set(pose.x + Math.sin(pose.heading) * 2.6, pose.y + 0.85, pose.z + Math.cos(pose.heading) * 2.6);
        group.rotation.y = pose.heading;
        scene.add(group);
        projectiles.push({
          kind: resolvedKind,
          owner: actorId,
          target,
          group,
          progress: actorProgress(actorId) + 2.7 / course.length,
          lane: actorLane(actorId),
          age: 0,
          active: true,
        });
      };
      const createTrapAt = (owner: number, progress: number, lane: number, now: number) => {
        const pose = course.pointAt(progress, lane);
        const group = new THREE.Group();
        const base = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.12, 0.15, 32), trapBaseMaterial);
        base.position.y = 0.1;
        base.castShadow = true;
        group.add(base);
        [[0, 0], [-0.48, -0.32], [0.48, -0.32], [-0.42, 0.38], [0.42, 0.38]].forEach(([x, z]) => {
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.86, 18), spikeMaterial);
          spike.position.set(x, 0.52, z);
          spike.castShadow = true;
          group.add(spike);
        });
        const x = pose.x;
        const z = pose.z;
        group.position.set(x, pose.y + 0.03, z);
        group.rotation.x = pose.pitch;
        group.rotation.y = pose.heading;
        scene.add(group);
        traps.push({ owner, group, x, y: pose.y, z, armedAt: now + 650, expiresAt: now + 22000, active: true });
      };
      const spawnTrap = (actorId: number, now: number) => {
        createTrapAt(actorId, actorProgress(actorId) - 2.45 / course.length, actorLane(actorId), now);
      };
      const spawnShootingStar = () => {
        const progress = playerState.progress + 0.025 + Math.random() * 0.075;
        const lane = -7.2 + Math.random() * 14.4;
        const point = course.pointAt(progress, lane);
        const group = new THREE.Group();
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
        core.castShadow = true;
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
        const starLight = new THREE.PointLight(0xffdf66, 24, 11, 2);
        starLight.position.z = 0.5;
        group.add(starLight);
        group.scale.setScalar(1.34);
        const warningMaterial = new THREE.MeshBasicMaterial({ color: 0xffec70, transparent: true, opacity: 0.72, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
        const warning = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.25, 40), warningMaterial);
        warning.rotation.x = -Math.PI / 2 + point.pitch;
        warning.rotation.y = point.heading;
        warning.position.set(point.x, point.y + 0.12, point.z);
        scene.add(warning);
        const y = point.y + 27 + Math.random() * 10;
        group.position.set(point.x, y, point.z);
        scene.add(group);
        shootingStars.push({ group, warning, progress, lane, y, fallSpeed: 18 + Math.random() * 5, active: true });
      };
      const shatterShootingStar = (star: ShootingStarState, now: number) => {
        if (!star.active) return;
        star.active = false;
        star.group.visible = false;
        star.warning.visible = false;
        const point = course.pointAt(star.progress, star.lane);
        const group = new THREE.Group();
        const colors = [0xdffaff, 0x66dcff, 0xae79ff, 0xffef88];
        for (let index = 0; index < 16; index += 1) {
          const color = colors[index % colors.length];
          const fragment = new THREE.Mesh(
            new THREE.TetrahedronGeometry(0.13 + (index % 4) * 0.07, 0),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }),
          );
          const angle = (index / 16) * TAU;
          fragment.userData.velocity = new THREE.Vector3(Math.cos(angle) * (2.5 + index % 3), 2.8 + (index % 5), Math.sin(angle) * (2.5 + (index + 1) % 3));
          group.add(fragment);
        }
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.25, 0.6, 40),
          new THREE.MeshBasicMaterial({ color: 0xbdefff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.name = "impact-ring";
        group.add(ring);
        group.position.set(point.x, point.y + 0.22, point.z);
        scene.add(group);
        shatters.push({ group, startedAt: now });
      };
      const activateActorItem = (actorId: number, now: number) => {
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
          for (let targetId = 0; targetId < 4; targetId += 1) {
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

      const animate = (now: number) => {
        const deltaMs = Math.min(32, now - previous);
        const dt = deltaMs / 1000;
        previous = now;
        const racing = phaseRef.current === "racing" && !finished;
        const playerCrashing = now < playerState.crashUntil;
        const controllerInput = readGamepadInput();
        const keyboardLeft = Boolean(keys.current.arrowleft || keys.current.a || touch.current.left);
        const keyboardRight = Boolean(keys.current.arrowright || keys.current.d || touch.current.right);
        const digitalSteer = (keyboardLeft ? 1 : 0) + (keyboardRight ? -1 : 0);
        const playerInputSteer = digitalSteer !== 0 ? digitalSteer : controllerInput.steer;

        if (oceanTime) oceanTime.value = now * 0.001;
        if (courseDefinition.id === "pirate") {
          seagulls.forEach((gull) => {
            const angle = now * gull.userData.speed + gull.userData.phase;
            const radiusX = gull.userData.radiusX as number;
            const radiusZ = gull.userData.radiusZ as number;
            const x = Math.cos(angle) * radiusX;
            const z = 28 + Math.sin(angle) * radiusZ;
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
            let scale = 1;
            let opacity = 0.98;
            let emissive = 0.1;
            const showingWarning = selected && age >= 0 && age < 3200;
            warningSurface.visible = showingWarning;
            warningStripes.visible = showingWarning;
            warningMarkers.visible = showingWarning;
            warningMaterial.opacity = showingWarning ? 0.42 + Math.abs(Math.sin(now * 0.014)) * 0.48 : 0;
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

        if (!playerCrashing && playerState.wasCrashing) {
          const nearest = course.nearest(playerState.x, playerState.z, playerState.lastU);
          const recovery = course.pointAt(nearest.u);
          playerState.x = recovery.x;
          playerState.y = recovery.y;
          playerState.z = recovery.z;
          playerState.heading = recovery.heading;
          playerState.pitch = recovery.pitch;
          playerState.lastU = nearest.u;
          playerState.speed = 9;
          playerState.groundY = recovery.y;
          playerState.airborne = false;
          playerState.verticalVelocity = 0;
          playerState.surfaceVerticalVelocity = 0;
          playerState.offTrackSince = 0;
          playerState.jumpCooldownUntil = now + JUMP_COOLDOWN_MS;
        }
        playerState.wasCrashing = playerCrashing;

        if (racing && !playerCrashing) {
          if (!raceStart) raceStart = now;
          const gas = Math.max(keys.current.arrowup || keys.current.w || touch.current.gas ? 1 : 0, controllerInput.gas);
          const brake = Math.max(keys.current.arrowdown || keys.current.s || touch.current.brake ? 1 : 0, controllerInput.brake);
          const useItem = Boolean(keys.current[" "] || keys.current.e || touch.current.item || controllerInput.item);
          if (useItem && !itemPressed && heldItem !== "EMPTY") {
            activateActorItem(0, now);
          }
          itemPressed = Boolean(useItem);

          const boosting = now < playerState.boostUntil;
          const auroraActive = now < playerState.auroraUntil;
          const nearestBefore = course.nearest(playerState.x, playerState.z, playerState.lastU);
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

          let nearestAfter = course.nearest(playerState.x, playerState.z, nearestBefore.u);
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
              nearestAfter = course.nearest(playerState.x, playerState.z, nearestAfter.u);
              lateralOffset = (playerState.x - nearestAfter.pose.x) * nearestAfter.pose.nx + (playerState.z - nearestAfter.pose.z) * nearestAfter.pose.nz;
            }
          }
          if (playerState.offTrackSince) {
            nearestAfter = course.nearest(playerState.x, playerState.z);
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
          if (!playerState.airborne && cloudRoadMissing && Math.abs(lateralOffset) <= COURSE_WIDTH) {
            const safeU = wrap01(playerState.lastU - 0.035);
            playerState.recoveryProgress = Math.max(PLAYER_START_PROGRESS, playerState.progress + progressDelta(safeU, playerState.lastU));
            playerState.recoveryU = safeU;
            playerState.recoveryLane = clamp(lateralOffset, -COURSE_WIDTH + 0.5, COURSE_WIDTH - 0.5);
            playerState.airborne = true;
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
            const overRoad = Math.abs(lateralOffset) <= BARRIER_LIMIT && !cloudRoadMissing;
            const roadPenetration = overRoad && playerState.y <= playerState.groundY + 0.025;
            const crossedRoadFromAbove = previousAirY >= playerState.groundY + 0.02 && roadPenetration;
            const reachedRoadSurface = playerState.offTrackSince ? crossedRoadFromAbove : roadPenetration;
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
              playerState.y = playerState.groundY;
              playerState.verticalVelocity = 0;
              playerState.surfaceVerticalVelocity = measuredSurfaceVerticalSpeed;
              playerState.pitch = nearestAfter.pose.pitch;
              playerState.landingImpactUntil = now + 360;
              playerState.jumpCooldownUntil = Math.max(playerState.jumpCooldownUntil, now + 650);
            } else if (
              !Number.isFinite(playerState.y)
              || playerState.y <= WORLD_GROUND_Y
              || now - (playerState.offTrackSince || playerState.airborneSince) >= 4000
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
              playerState.pitch = THREE.MathUtils.lerp(playerState.pitch, nearestAfter.pose.pitch, 0.15);
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
          }
          if (playerState.progress >= TOTAL_LAPS - 0.005) {
            finished = true;
            playerState.speed *= 0.45;
            const finishOrder = [0, 1, 2, 3].sort((a, b) => actorProgress(b) - actorProgress(a));
            onFinish(now - raceStart, finishOrder.indexOf(0) + 1, finishOrder);
          }
        } else {
          if (!racing) itemPressed = false;
          playerState.speed *= 0.94;
          if (phaseRef.current !== "racing") raceStart = 0;
        }

        if (racing) {
          rivalStates.forEach((rival, index) => {
            if (now >= rival.crashUntil) {
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
              if (rival.airborne) rival.airSpeed *= Math.pow(0.9992, deltaMs / 16.67);
              const rivalWorldSpeed = rival.airborne ? rival.airSpeed : groundWorldSpeed;
              rival.progress += (rivalWorldSpeed / course.length) * dt;
              const roadPoint = course.pointAt(rival.progress, rival.lane);
              const rivalCloudTileCount = Math.max(1, cloudPatches.length / 2);
              const rivalCloudTileIndex = Math.floor(wrap01(rival.progress) * rivalCloudTileCount) % rivalCloudTileCount;
              const rivalCloudSide = rival.lane >= 0 ? 1 : -1;
              const rivalCloudRoadMissing = courseDefinition.id === "cloud" && cloudGapKeys.has(`${rivalCloudTileIndex}:${rivalCloudSide}`);
              const maxSurfaceVerticalSpeed = Math.max(4, rivalWorldSpeed * 0.72);
              const measuredSurfaceVerticalSpeed = clamp(
                (roadPoint.y - current.y) / Math.max(dt, 0.001),
                -maxSurfaceVerticalSpeed,
                maxSurfaceVerticalSpeed,
              );
              if (rival.airborne) {
                rival.verticalVelocity -= JUMP_GRAVITY * dt;
                rival.airY += rival.verticalVelocity * dt;
                if (rival.cloudFallUntil && now >= rival.cloudFallUntil) {
                  rival.cloudFallUntil = 0;
                  crashActor(index + 1, now);
                } else if (!rival.cloudFallUntil && !rivalCloudRoadMissing && now - rival.airborneSince > 90 && rival.airY <= roadPoint.y + 0.025) {
                  rival.airborne = false;
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
                if (rivalCloudRoadMissing) {
                  rival.airborne = true;
                  rival.airborneSince = now;
                  rival.airSpeed = rivalWorldSpeed;
                  rival.verticalVelocity = Math.min(0, rival.surfaceVerticalVelocity);
                  rival.airY = roadPoint.y + 0.02;
                  rival.cloudFallUntil = now + 1050;
                  rival.drifting = false;
                  rival.driftCharge = 0;
                } else if (rivalWorldSpeed >= JUMP_MIN_SPEED && now >= rival.jumpCooldownUntil && separationProfile.separatesFromRoad) {
                  rival.airborne = true;
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
              if (rival.item !== "EMPTY" && now >= rival.useAt) activateActorItem(index + 1, now);
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
              for (let actorId = 0; actorId < 4; actorId += 1) {
                if (actorCrashing(actorId, now)) continue;
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
            if (waterFlow) {
              const positions = waterFlow.points.geometry.getAttribute("position") as Three.BufferAttribute;
              waterFlow.particles.forEach((particle, particleIndex) => {
                const channel = RIVER_CHANNELS[particle.channelIndex];
                particle.progress += (particle.speed / course.length) * dt;
                if (particle.progress > channel.end) particle.progress = channel.start + (particle.progress - channel.end);
                const lane = channel.lane + particle.laneOffset + Math.sin(now * 0.0015 + particle.phase) * 0.18;
                const point = course.pointAt(particle.progress, lane);
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
              for (let actorId = 0; actorId < 4; actorId += 1) {
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
              for (let actorId = 0; actorId < 4; actorId += 1) {
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
              for (let actorId = 0; actorId < 4; actorId += 1) {
                if (actorCrashing(actorId, now)) continue;
                const actor = actorPose(actorId);
                if (Math.hypot(pose.x - actor.x, pose.y + 1 - actor.y, pose.z - actor.z) < 3.15) {
                  const key = `cannon-${index}-${actorId}`;
                  if (now >= (obstacleContactCooldowns.get(key) ?? 0)) {
                    crashActor(actorId, now);
                    obstacleContactCooldowns.set(key, now + 1700);
                  }
                }
              }
            });
          }

          if (courseDefinition.id === "starlight") {
            if (!nextShootingStarAt) nextShootingStarAt = now + 900;
            if (now >= nextShootingStarAt) {
              spawnShootingStar();
              nextShootingStarAt = now + 950 + Math.random() * 850;
            }
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
              for (let actorId = 0; actorId < 4; actorId += 1) {
                if (actorCrashing(actorId, now)) continue;
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
          }

          shatters.forEach((shatter) => {
            const age = (now - shatter.startedAt) / 1000;
            if (age > 1.05) {
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

          pickupPoints.forEach((pickup) => {
            if (!pickup.active && now >= pickup.respawnAt) {
              pickup.active = true;
              pickup.group.visible = true;
            }
            if (!pickup.active) return;
            for (let actorId = 0; actorId < 4; actorId += 1) {
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
            const projectileSpeed = projectile.kind === "FIRE" ? 43 : 49;
            projectile.progress += (projectileSpeed / course.length) * dt;
            if (projectile.kind === "HOMING" && projectile.target !== null) {
              projectile.lane = THREE.MathUtils.lerp(projectile.lane, actorLane(projectile.target), 1 - Math.pow(0.035, dt));
            }
            const point = course.pointAt(projectile.progress, projectile.lane);
            projectile.group.position.set(point.x, point.y + 0.86 + (projectile.kind === "HOMING" ? Math.sin(now * 0.012) * 0.08 : 0), point.z);
            projectile.group.rotation.y = point.heading;
            projectile.group.rotation.x = point.pitch;
            if (projectile.kind === "FIRE") projectile.group.rotation.z += dt * 4;
            const targets = projectile.kind === "HOMING" && projectile.target !== null ? [projectile.target] : [0, 1, 2, 3];
            for (const targetId of targets) {
              if (targetId === projectile.owner || actorCrashing(targetId, now)) continue;
              const pose = actorPose(targetId);
              if (Math.hypot(projectile.group.position.x - pose.x, projectile.group.position.y - (pose.y + 0.85), projectile.group.position.z - pose.z) < 1.75) {
                attackActor(targetId, projectile.kind, now);
                projectile.active = false;
                projectile.group.visible = false;
                break;
              }
            }
            if (projectile.age > (projectile.kind === "FIRE" ? 3.4 : 9)) {
              projectile.active = false;
              projectile.group.visible = false;
            }
          });

          traps.forEach((trap) => {
            if (!trap.active) return;
            if (now >= trap.expiresAt) {
              trap.active = false;
              trap.group.visible = false;
              return;
            }
            if (now < trap.armedAt) return;
            for (let actorId = 0; actorId < 4; actorId += 1) {
              if (actorCrashing(actorId, now)) continue;
              const pose = actorPose(actorId);
              if (Math.hypot(trap.x - pose.x, trap.y - pose.y, trap.z - pose.z) < 1.68) {
                attackActor(actorId, "SPIKES", now);
                trap.active = false;
                trap.group.visible = false;
                break;
              }
            }
          });

          for (let attackerId = 0; attackerId < 4; attackerId += 1) {
            const auroraUntil = attackerId === 0 ? playerState.auroraUntil : rivalStates[attackerId - 1].auroraUntil;
            if (now >= auroraUntil || actorCrashing(attackerId, now)) continue;
            const attackerPose = actorPose(attackerId);
            for (let targetId = 0; targetId < 4; targetId += 1) {
              if (targetId === attackerId || actorCrashing(targetId, now)) continue;
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
            const distance = Math.hypot(point.x - playerState.x, point.y - playerState.y, point.z - playerState.z);
            if (distance < 2.7 && now >= rival.auroraUntil && now >= playerState.auroraUntil && !playerCrashing) {
              playerState.speed *= 0.78;
            }
          });
        }

        const playerLandingRemaining = playerState.landingImpactUntil - now;
        const playerLandingPhase = playerLandingRemaining > 0 ? 1 - playerLandingRemaining / 360 : 1;
        const playerLandingLift = playerLandingRemaining > 0 ? Math.sin(playerLandingPhase * Math.PI) * 0.09 : 0;
        const playerWaterDepth = courseDefinition.id === "river" && riverChannelAt(playerState.progress, actorLane(0)) && !playerState.airborne ? 0.36 : 0;
        player.position.set(playerState.x, playerState.y + KART_RIDE_HEIGHT + playerLandingLift - playerWaterDepth, playerState.z);
        const playerSteer = playerInputSteer;
        animateKartDriver(THREE, player, playerSteer, playerState.drifting, dt);
        if (playerCrashing) {
          const crashPhase = clamp((now - playerState.crashStart) / (playerState.crashUntil - playerState.crashStart), 0, 1);
          player.rotation.y = playerState.heading + crashPhase * TAU * 2.5;
          player.rotation.x = playerState.pitch + Math.sin(crashPhase * Math.PI * 5) * 0.18;
          player.rotation.z = Math.sin(crashPhase * Math.PI * 4) * 0.32;
        } else {
          player.rotation.y = playerState.heading;
          const landingPitch = playerLandingRemaining > 0 ? Math.sin(playerLandingPhase * Math.PI * 2) * 0.09 : 0;
          player.rotation.x = THREE.MathUtils.lerp(player.rotation.x, playerState.pitch + landingPitch, playerState.airborne ? 0.12 : 0.2);
          const bounceRemaining = playerState.wallBounceUntil - now;
          const bouncePhase = bounceRemaining > 0 ? 1 - bounceRemaining / 180 : 1;
          const bounceRoll = bounceRemaining > 0 ? -playerState.wallBounceSide * Math.sin(bouncePhase * Math.PI) * 0.11 : 0;
          const steeringRoll = playerSteer * (playerState.drifting ? 0.13 : 0.055);
          player.rotation.z = THREE.MathUtils.lerp(player.rotation.z, steeringRoll + bounceRoll, 0.18);
        }

      rivalStates.forEach((rival, index) => {
        const point = course.pointAt(rival.progress, rival.lane);
        const landingRemaining = rival.landingImpactUntil - now;
        const landingPhase = landingRemaining > 0 ? 1 - landingRemaining / 330 : 1;
        const landingLift = landingRemaining > 0 ? Math.sin(landingPhase * Math.PI) * 0.08 : 0;
        const rivalWaterDepth = courseDefinition.id === "river" && riverChannelAt(rival.progress, rival.lane) && !rival.airborne ? 0.36 : 0;
        rivalMeshes[index].position.set(point.x, (rival.airborne ? rival.airY : point.y) + KART_RIDE_HEIGHT + landingLift - rivalWaterDepth, point.z);
        const lookAhead = course.pointAt(rival.progress + 0.006, rival.lane);
        let rivalTurn = lookAhead.heading - point.heading;
        if (rivalTurn > Math.PI) rivalTurn -= TAU;
        if (rivalTurn < -Math.PI) rivalTurn += TAU;
        const rivalSteer = rivalTurn > 0.035 ? 1 : rivalTurn < -0.035 ? -1 : 0;
        animateKartDriver(THREE, rivalMeshes[index], rivalSteer, rival.drifting, dt);
        if (now < rival.crashUntil) {
          const crashPhase = clamp((now - rival.crashStart) / (rival.crashUntil - rival.crashStart), 0, 1);
          rivalMeshes[index].rotation.y = point.heading + crashPhase * TAU * 2.5;
          rivalMeshes[index].rotation.x = point.pitch + Math.sin(crashPhase * Math.PI * 5) * 0.18;
          rivalMeshes[index].rotation.z = Math.sin(crashPhase * Math.PI * 4) * 0.32;
        } else {
          rivalMeshes[index].rotation.y = point.heading;
          const flightPitch = rival.airborne
            ? clamp(-Math.atan2(rival.verticalVelocity, Math.max(8, rival.pace)), -0.32, 0.36)
            : point.pitch + (landingRemaining > 0 ? Math.sin(landingPhase * Math.PI * 2) * 0.08 : 0);
          rivalMeshes[index].rotation.x = THREE.MathUtils.lerp(rivalMeshes[index].rotation.x, flightPitch, rival.airborne ? 0.12 : 0.2);
          rivalMeshes[index].rotation.z = THREE.MathUtils.lerp(rivalMeshes[index].rotation.z, rival.drifting ? rival.driftSide * 0.12 : 0, 0.2);
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
        auroraAuras.forEach(({ aura, glow }, actorId) => {
          const auroraUntil = actorId === 0 ? playerState.auroraUntil : rivalStates[actorId - 1].auroraUntil;
          const active = now < auroraUntil;
          aura.visible = active;
          aura.rotation.y += dt * 1.8;
          aura.scale.setScalar(1 + Math.sin(now * 0.012 + actorId) * 0.05);
          glow.intensity = active ? 17 + Math.sin(now * 0.02) * 4 : 0;
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
        novaHitBursts.forEach(({ burst, material, glow }, actorId) => {
          const remaining = novaHitUntil[actorId] - now;
          const active = remaining > 0;
          burst.visible = active;
          if (active) {
            const impactProgress = 1 - remaining / 950;
            burst.scale.setScalar(0.7 + impactProgress * 3.8);
            burst.rotation.y += dt * 7;
            burst.rotation.x += dt * 4;
            material.opacity = (1 - impactProgress) * 0.92;
            glow.intensity = (1 - impactProgress) * 36;
          } else {
            glow.intensity = 0;
          }
        });

        host.classList.toggle("focus-boost", now < playerState.boostUntil || playerState.driftBoost > 0.001);
        host.classList.toggle("nova-flash", now < novaFlashUntil);
        host.classList.toggle("airborne", playerState.airborne);
        host.classList.toggle("landing-impact", playerLandingRemaining > 0);

        for (let i = 0; i < exhaustCount; i += 1) {
          if (exhaustLife[i] <= 0) continue;
          exhaustLife[i] -= dt * 1.7;
          exhaustPositions[i * 3 + 1] += dt * 0.6;
        }
        exhaustGeometry.attributes.position.needsUpdate = true;

        const forward = new THREE.Vector3(Math.sin(playerState.heading), 0, Math.cos(playerState.heading));
        const flightClearance = playerState.airborne ? Math.max(0, playerState.y - playerState.groundY) : 0;
        const cameraBaseY = playerState.airborne
          ? playerState.y - Math.min(1.1, flightClearance * 0.22)
          : playerState.y;
        const desiredCamera = new THREE.Vector3(playerState.x, cameraBaseY, playerState.z)
          .addScaledVector(forward, -6.4)
          .add(new THREE.Vector3(0, 3.75, 0));
        if (camera.position.lengthSq() === 0) camera.position.copy(desiredCamera);
        camera.position.lerp(desiredCamera, 1 - Math.pow(0.015, dt));
        if (now < novaFlashUntil) {
          const shake = ((novaFlashUntil - now) / 1050) * 0.34;
          camera.position.x += Math.sin(now * 0.12) * shake;
          camera.position.y += Math.cos(now * 0.17) * shake * 0.55;
        }
        const lookAtY = playerState.y + 0.95;
        camera.lookAt(new THREE.Vector3(playerState.x, lookAtY, playerState.z).addScaledVector(forward, 6));

        if (courseDefinition.id === "pirate") {
          const pirateU = wrap01(playerState.progress);
          const insideShip = pirateU >= 0.22 && pirateU <= 0.78;
          renderer.toneMappingExposure = THREE.MathUtils.lerp(renderer.toneMappingExposure, insideShip ? 0.72 : 1.06, 0.045);
        } else {
          renderer.toneMappingExposure = THREE.MathUtils.lerp(renderer.toneMappingExposure, 1.06, 0.045);
        }
        drawMiniMap(now);
        renderer.render(scene, camera);
        frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);

      disposeThree = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        host.classList.remove("focus-boost", "nova-flash", "airborne", "landing-impact");
        scene.traverse((object) => {
          if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.InstancedMesh) {
            object.geometry?.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => material?.dispose());
          }
        });
        renderer.dispose();
        renderer.domElement.remove();
      };
    });

    return () => {
      disposed = true;
      disposeThree?.();
    };
  }, [courseDefinition, runId, onFinish, onItemChange, onShieldChange, onTelemetry]);

  const bindTouch = (key: keyof typeof touch.current) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      touch.current[key] = true;
    },
    onPointerUp: () => { touch.current[key] = false; },
    onPointerCancel: () => { touch.current[key] = false; },
    onPointerLeave: () => { touch.current[key] = false; },
  });

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
      <div className="touch-controls" aria-label="タッチ操作">
        <div className="touch-cluster">
          <button {...bindTouch("left")} aria-label="左へ曲がる">←</button>
          <button {...bindTouch("right")} aria-label="右へ曲がる">→</button>
        </div>
        <div className="action-cluster">
          <button className="item-button" {...bindTouch("item")} aria-label="アイテムを使う">ITEM</button>
          <button className="drift-button" {...bindTouch("drift")} aria-label="ドリフト">DRIFT</button>
        </div>
        <div className="touch-cluster">
          <button className="brake" {...bindTouch("brake")} aria-label="ブレーキ">BRAKE</button>
          <button className="gas" {...bindTouch("gas")} aria-label="アクセル">GO</button>
        </div>
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
  const [selectedCupIndex, setSelectedCupIndex] = useState(0);
  const [activeCupId, setActiveCupId] = useState<CupId>("basic");
  const [courseIndex, setCourseIndex] = useState(0);
  const [scores, setScores] = useState([0, 0, 0, 0]);
  const [lastOrder, setLastOrder] = useState([0, 1, 2, 3]);
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
  const timerStart = useRef(0);
  const menuPadHeld = useRef({ left: false, right: false, confirm: false, back: false });

  useEffect(() => {
    if (phase !== "racing") return;
    timerStart.current = performance.now();
    const timer = window.setInterval(() => setElapsed(performance.now() - timerStart.current), 31);
    return () => window.clearInterval(timer);
  }, [phase]);

  const beginRace = useCallback(() => {
    setRunId((value) => value + 1);
    setSpeed(0);
    setPosition(4);
    setProgress(0);
    setElapsed(0);
    setItem("EMPTY");
    setShieldActive(false);
    setDriftGauge(0);
    setDriftDashing(false);
    setCountdown("3");
    setPhase("countdown");
    ["2", "1", "GO!"].forEach((value, index) => window.setTimeout(() => setCountdown(value), (index + 1) * 700));
    window.setTimeout(() => setPhase("racing"), 2800);
  }, []);

  const startSelectedCup = useCallback(() => {
    const cup = CUPS[selectedCupIndex];
    setActiveCupId(cup.id);
    setCourseIndex(0);
    setScores([0, 0, 0, 0]);
    setLastOrder([0, 1, 2, 3]);
    beginRace();
  }, [beginRace, selectedCupIndex]);

  const openCupSelect = useCallback(() => setPhase("cup-select"), []);
  const returnToCupSelect = useCallback(() => {
    const currentCupIndex = Math.max(0, CUPS.findIndex((cup) => cup.id === activeCupId));
    setSelectedCupIndex(currentCupIndex);
    setPhase("cup-select");
  }, [activeCupId]);

  const nextCourse = useCallback(() => {
    setCourseIndex((value) => Math.min(2, value + 1));
    beginRace();
  }, [beginRace]);

  const handleTelemetry = useCallback((nextSpeed: number, nextProgress: number, nextPosition: number, nextDriftGauge: number, nextDriftDashing: boolean) => {
    setSpeed(Math.round(nextSpeed));
    setProgress(clamp(nextProgress, 0, TOTAL_LAPS));
    setPosition(nextPosition);
    setDriftGauge(clamp(nextDriftGauge, 0, 1));
    setDriftDashing(nextDriftDashing);
  }, []);

  const handleFinish = useCallback((time: number, nextPosition: number, order: number[]) => {
    setFinishTime(time);
    setFinishPosition(nextPosition);
    setLastOrder(order);
    setScores((current) => {
      const next = [...current];
      order.forEach((actorId, rank) => { next[actorId] += RACE_POINTS[rank] ?? 0; });
      return next;
    });
    setElapsed(time);
    setSpeed(0);
    setPhase(courseIndex === 2 ? "championship" : "finished");
  }, [courseIndex]);

  const handleItemChange = useCallback((nextItem: ItemType) => setItem(nextItem), []);
  const handleShieldChange = useCallback((active: boolean) => setShieldActive(active), []);

  useEffect(() => {
    const handleMenuKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (phase === "title" && (key === "enter" || key === " ")) {
        event.preventDefault();
        openCupSelect();
      } else if (phase === "cup-select") {
        if (key === "arrowleft" || key === "a") {
          event.preventDefault();
          setSelectedCupIndex((value) => (value + CUPS.length - 1) % CUPS.length);
        } else if (key === "arrowright" || key === "d") {
          event.preventDefault();
          setSelectedCupIndex((value) => (value + 1) % CUPS.length);
        } else if (key === "enter" || key === " ") {
          event.preventDefault();
          startSelectedCup();
        } else if (key === "escape" || key === "backspace") {
          setPhase("title");
        }
      } else if (phase === "finished" && (key === "enter" || key === " ")) {
        event.preventDefault();
        nextCourse();
      } else if (phase === "championship" && (key === "enter" || key === " ")) {
        event.preventDefault();
        returnToCupSelect();
      }
    };
    window.addEventListener("keydown", handleMenuKey, { passive: false });
    return () => window.removeEventListener("keydown", handleMenuKey);
  }, [phase, nextCourse, openCupSelect, returnToCupSelect, startSelectedCup]);

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
      const current = {
        left: pressed(14) || axis < -0.62,
        right: pressed(15) || axis > 0.62,
        confirm: pressed(0),
        back: pressed(1),
      };
      const previous = menuPadHeld.current;
      if (phase === "title" && current.confirm && !previous.confirm) {
        openCupSelect();
      } else if (phase === "cup-select") {
        if (current.left && !previous.left) setSelectedCupIndex((value) => (value + CUPS.length - 1) % CUPS.length);
        if (current.right && !previous.right) setSelectedCupIndex((value) => (value + 1) % CUPS.length);
        if (current.confirm && !previous.confirm) startSelectedCup();
        if (current.back && !previous.back) setPhase("title");
      } else if (phase === "finished" && current.confirm && !previous.confirm) {
        nextCourse();
      } else if (phase === "championship" && current.confirm && !previous.confirm) {
        returnToCupSelect();
      }
      menuPadHeld.current = current;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, nextCourse, openCupSelect, returnToCupSelect, startSelectedCup]);

  const leaderboard = RIVALS.map((rival) => ({ name: rival.name, badge: rival.badge, color: rival.name.toLowerCase() }));
  leaderboard.splice(position - 1, 0, { name: "YOU", badge: "ME", color: "cyan" });
  const currentLap = Math.min(TOTAL_LAPS, Math.floor(Math.max(0, progress)) + 1);
  const racePercent = clamp(progress / TOTAL_LAPS, 0, 1) * 100;
  const itemLabel = ITEM_LABELS[item];
  const activeCup = CUPS.find((cup) => cup.id === activeCupId) ?? CUPS[0];
  const cupCourses = activeCup.courseIds.map(courseById);
  const courseDefinition = cupCourses[courseIndex] ?? cupCourses[0];
  const racerNames = ["YOU", ...RIVALS.map((rival) => rival.name)];
  const championshipOrder = [0, 1, 2, 3].sort((a, b) => scores[b] - scores[a] || lastOrder.indexOf(a) - lastOrder.indexOf(b));
  const raceResultRows = lastOrder.map((actorId, rank) => ({ actorId, rank: rank + 1, points: RACE_POINTS[rank] }));

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#race" aria-label="City Circuit ホーム">
          <span className="brand-mark">CC</span>
          <span><b>PRISM</b> CIRCUIT <small>3D</small></span>
        </a>
        <div className="status-pill"><i /> {activeCup.name} · THREE-COURSE GRAND PRIX</div>
        <div className="sound-pill">CAM <span>FIXED CHASE / 03</span></div>
      </header>

      <section className="race-intro">
        <div>
          <div className="eyebrow"><span>0{courseIndex + 1}</span> {courseDefinition.name} · GRAND PRIX</div>
          <h1>{courseDefinition.title.split(" ").slice(0, -1).join(" ")} <em>{courseDefinition.title.split(" ").slice(-1)}</em></h1>
        </div>
        <p>{courseDefinition.description}<br />各コース3ラップ。3戦の獲得ポイントで総合優勝を争う。</p>
      </section>

      <section className={`game-layout theme-${courseDefinition.id}`} id="race" aria-label={`${courseDefinition.name} 3Dカートレースゲーム`}>
        <div className={`game-stage theme-${courseDefinition.id}`}>
          <div className="game-hud">
            <div className="position"><b>{position}</b><span>/4<br />POSITION</span></div>
            <div className="lap"><span>LAP</span><b>{currentLap}/{TOTAL_LAPS}</b></div>
            <div className={`item-slot ${item !== "EMPTY" ? "loaded" : ""}`}>
              <span>ITEM {shieldActive && <em>SHIELD ON</em>}</span><b><i>{itemLabel.icon}</i>{itemLabel.name}</b>
            </div>
            <div className="camera-mode"><span>CAMERA</span><b>FIXED CHASE</b></div>
            <div className="timer"><span>RACE TIME</span><b>{formatTime(elapsed)}</b></div>
            <div className="speed"><b>{speed}</b><span>KM/H</span></div>
          </div>

          <div className={`drift-meter ${driftDashing ? "dashing" : driftGauge > 0 ? "charging" : ""}`} aria-label={`ドリフトゲージ ${Math.round(driftGauge * 100)}%`}>
            <span>{driftDashing ? "DRIFT DASH" : "DRIFT"}</span>
            <div><i style={{ width: `${driftGauge * 100}%` }} /></div>
            <b>{Math.round(driftGauge * 100)}</b>
          </div>

          <RaceWorld phase={phase} runId={runId} courseDefinition={courseDefinition} onTelemetry={handleTelemetry} onFinish={handleFinish} onItemChange={handleItemChange} onShieldChange={handleShieldChange} />

          {phase === "title" && (
            <div className="game-overlay title-overlay">
              <div className="overlay-kicker">FULL 3D · SIX COURSES · TWO CUPS</div>
              <h2>PRISM<br /><span>CIRCUIT 3D.</span></h2>
              <p>2つのカップ、6つのコース。3戦の合計ポイントでチャンピオンを決めろ。<span className="pad-help">CONTROLLER：× / A　 KEYBOARD：ENTER</span></p>
              <button className="race-button" onClick={openCupSelect}>SELECT CUP <span>→</span></button>
              <div className="controller-prompt">PRESS × / A OR ENTER</div>
            </div>
          )}

          {phase === "cup-select" && (
            <div className="game-overlay cup-select-overlay">
              <div className="overlay-kicker">CHOOSE YOUR THREE-RACE CHAMPIONSHIP</div>
              <h2>SELECT<br /><span>A CUP.</span></h2>
              <div className="cup-grid">
                {CUPS.map((cup, index) => (
                  <button
                    className={`cup-card cup-${cup.id} ${selectedCupIndex === index ? "selected" : ""}`}
                    key={cup.id}
                    onClick={() => setSelectedCupIndex(index)}
                    onMouseEnter={() => setSelectedCupIndex(index)}
                    aria-pressed={selectedCupIndex === index}
                  >
                    <b>0{index + 1}</b>
                    <span>{cup.name}<small>{cup.subtitle}</small></span>
                    <em>{cup.courseIds.map(courseById).map((course) => course.name).join(" / ")}</em>
                  </button>
                ))}
              </div>
              <div className="course-preview-row cup-course-row">
                {CUPS[selectedCupIndex].courseIds.map(courseById).map((course, index) => (
                  <div className={`course-preview course-${course.id}`} key={course.id}>
                    <b>0{index + 1}</b><span>{course.name}<small>{course.tagline}</small></span>
                  </div>
                ))}
              </div>
              <p>← → / LEFT STICK：カップ選択　× / A：決定　○ / B：戻る</p>
              <button className="race-button" onClick={startSelectedCup}>START {CUPS[selectedCupIndex].name} <span>→</span></button>
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

          {phase === "championship" && (
            <div className="game-overlay finish-overlay championship-overlay">
              <div className="overlay-kicker">THREE COURSES COMPLETE · GRAND PRIX FINAL</div>
              <h2>{championshipOrder[0] === 0 ? "YOU ARE" : `${racerNames[championshipOrder[0]]} IS`}<br /><span>CHAMPION.</span></h2>
              <div className="championship-table">
                {championshipOrder.map((actorId, rank) => (
                  <div className={actorId === 0 ? "player-score" : ""} key={actorId}>
                    <b>0{rank + 1}</b><span>{racerNames[actorId]}</span><em>{scores[actorId]} PT</em>
                  </div>
                ))}
              </div>
              <button className="race-button" onClick={returnToCupSelect}>BACK TO CUP SELECT <span>↻</span></button>
            </div>
          )}
        </div>

        <aside className="race-panel">
          <div className="panel-heading"><span>ROUND {courseIndex + 1}/3 · {courseDefinition.name}</span><b>{Math.round(racePercent)}%</b></div>
          <div className="progress-track"><i style={{ width: `${racePercent}%` }} /></div>
          <div className="leaderboard">
            {leaderboard.map((racer, index) => (
              <div className={`racer-row ${racer.name === "YOU" ? "active" : ""}`} key={racer.name}>
                <b className="rank">0{index + 1}</b>
                <span className={`avatar ${racer.color}`}>{racer.badge}</span>
                <span className="racer-name">{racer.name}<small>{racer.name === "YOU" ? "PLAYER ONE" : "CITY CREW"}</small></span>
                <span className="racer-dot" />
              </div>
            ))}
          </div>
          <div className="grand-prix-score">
            <span>GRAND PRIX POINTS</span>
            {championshipOrder.map((actorId) => (
              <div key={actorId}><b>{racerNames[actorId]}</b><i>{scores[actorId]} PT</i></div>
            ))}
            <small>1ST 5 · 2ND 3 · 3RD 1 · 4TH 0</small>
          </div>
          <div className="control-card">
            <span>DRIVE CONTROLS</span>
            <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div>
            <p>アクセル・ブレーキ・ステアリング　SHIFT：ドリフト<br />PS4：左スティック／十字キー・R2・L2・L1/R1・□</p>
          </div>
          <div className={`item-card ${item !== "EMPTY" ? "loaded" : ""}`}>
            <i>{itemLabel.icon}</i><span><b>{itemLabel.name}</b>{item === "EMPTY" ? "横一列のアイテムボックスを狙おう" : "SPACE / E で使用"}</span>
          </div>
          {shieldActive && <div className="shield-chip">◉ SHIELD ACTIVE · 1 HIT</div>}
          <div className="item-guide"><b>7 ITEMS</b><span>◆ FIRE　◎ HOMING　⚡ BOOST　✦ AURORA</span><span>▲ SPIKES　◉ SHIELD　✹ NOVA (LAST 5%)</span></div>
          <div className="render-badge"><b>{courseDefinition.distance} · {courseDefinition.name}</b><span>{courseDefinition.tagline}</span></div>
        </aside>
      </section>

      <footer><span>PRISM CIRCUIT © 2026</span><span>FULL 3D BROWSER ARCADE</span><span>SIX WORLDS. TWO CUPS.</span></footer>
    </main>
  );
}
