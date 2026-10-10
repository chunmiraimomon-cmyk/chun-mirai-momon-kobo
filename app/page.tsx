"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RacePauseButton } from "./race-pause-button";
import { createGeneratedTextureSet, markGeneratedSurface } from "./generated-material-textures";
import { addSkillAccent, createRaceVisualEffects, wetRoadForSpray } from "./race-visual-effects";
import { createDriftVisualEffects, type TireSurfaceContact } from "./drift-visual-effects";
import { createTurboExhaustVisual } from "./turbo-exhaust-visual";
import { createCourseBackdrop, applyBackdropGroundDetail } from "./course-backdrop";
import { createHeroMoonGeometry, createHeroMoonMaterial } from "./backdrop-sky-sea";
import { createCloudRoadPatchGeometry, createCloudRoadMaterial } from "./cloud-road-visual";
import { createOctopusForeshadowArms, pirateOctopusApproach, pirateOctopusPeekY } from "./pirate-horizon";
import { createPirateBreachVisual, getPirateBreachPose, PIRATE_BREACH_TRIGGER_PROGRESS, PIRATE_BREACH_SETTLED_MS } from "./pirate-breach-visual";
import type * as Three from "three";
import {
  KEYBOARD_GLITCH_PAIR_MS,
  KeyboardTransitionFilter,
} from "../lib/keyboard-transition-filter.mjs";
import {
  advanceHomingProgress,
  airborneFinishZoneFraction,
  cameraViewForViewport,
  canActivateItem,
  cpuCometGateTarget,
  cpuOverchargeTarget,
  cpuVectorTurboRemainsActive,
  cometGateResult,
  crashDurationForAttack,
  chooseRecordedShortcutStarAvoidance,
  extractRecordedLineShortcuts,
  freeDriveSpeedCap,
  gojoRecordedShortcutApproachPhase,
  accelerateGiantLeapVelocity,
  giantLeapVerticalVelocity,
  hasFullyClearedGuardrail,
  overlapsGuardrailByFraction,
  isApproachingRoad,
  isInsideAirborneFinishZone,
  finalLapCheckpointFromGroundContact,
  isShieldableAttack,
  isSpikeGuardAttack,
  isWithinRoadFootprint,
  finishLineCrossingFraction,
  giantLeapChargeAngle,
  GIANT_LEAP_CHARGE_DURATION_MS,
  GIANT_LEAP_MAX_ANGLE,
  GIANT_LOW_DASH_DURATION_MS,
  giantLeapProfileForAngle,
  pointToSegmentDistance3d,
  rankingProgressFromGroundContact,
  resolveTrackedCourseProgress,
  recordedShortcutFlightPosition,
  resolveOverchargeDrift,
  SKILL_TURBO_DURATION_MS,
  takeoffGravity,
  VOLT_CRITICAL_MAX,
  VOLT_CRITICAL_MIN,
  updateBelowCourseRecovery,
  VOLT_SUCCESS_MAX,
  VOLT_SUCCESS_MIN,
  vectorTurboRemainsActive,
} from "../lib/race-rules.mjs";
import {
  boostDurationForLevel,
  canUpgradeHeldItem,
  fireLevelPattern,
  HOMING_LV3_SHOCKWAVE_RADIUS,
  homingBreaksOnSpikes,
  homingCreatesShockwave,
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
import {
  evolutionFeatureState,
  evolutionStageFor,
} from "../lib/evolution-tour.mjs";
import {
  loadOfficialRaceData,
  mergeNewestRaceRecords,
  overlayOfficialRaceRecords,
} from "../lib/official-race-data.mjs";
import {
  gojoRaceTuning,
  isUltimateGojoUnlocked,
} from "../lib/ultimate-gojo.mjs";
import {
  insertPersonalGhostRecord,
  normalizePersonalGhostStore,
} from "../lib/time-trial-records.mjs";
import {
  advanceRandomQuestCombo,
  CREATOR_THEME_LABELS,
  CREATOR_THEMES,
  generateRandomQuestTour,
  insertRandomQuestScore,
  normalizeCreatorTheme,
  randomQuestRoundScore,
} from "../lib/random-quest-tour.mjs";
import {
  cupMedalForRank,
  cupStandingOrder,
  normalizeCupMedalCabinet,
  recordCupMedal,
  strongestCupMedal,
} from "../lib/cup-awards.mjs";
import { decodeCourseCode, encodeCourseCode } from "./course-code";
import { GameAudioController } from "./game-audio";
import { finishRiverSurface, makeRiverBedMaterial, makeRiverFoamTexture } from "./river-appearance";
import { LegacyEvolutionTour } from "./legacy-evolution-tour";

type ThreeModule = typeof Three;
type GamePhase = "title" | "settings" | "achievements" | "time-trial-select" | "time-trial-finished" | "ultimate-gojo-select" | "ultimate-gojo-finished" | "cup-select" | "character-select" | "race-briefing" | "tuning" | "course-create" | "loading" | "countdown" | "racing" | "finished" | "gojo-intro" | "gojo-finished" | "award-ceremony" | "championship" | "creator-finished" | "random-quest-complete" | "evolution-intro" | "evolution-runtime" | "evolution-finished" | "evolution-complete";
const MENU_PHASES_WITH_BACK: ReadonlySet<GamePhase> = new Set([
  "tuning",
  "settings",
  "achievements",
  "time-trial-select",
  "time-trial-finished",
  "ultimate-gojo-select",
  "ultimate-gojo-finished",
  "cup-select",
  "character-select",
  "race-briefing",
  "course-create",
  "finished",
  "gojo-intro",
  "gojo-finished",
  "award-ceremony",
  "championship",
  "creator-finished",
  "random-quest-complete",
  "evolution-intro",
  "evolution-finished",
  "evolution-complete",
]);
const MENU_PHASES_WITH_INLINE_BACK: ReadonlySet<GamePhase> = new Set([
  "tuning",
  "settings",
  "achievements",
  "time-trial-select",
  "time-trial-finished",
  "ultimate-gojo-select",
  "ultimate-gojo-finished",
  "character-select",
  "race-briefing",
  "course-create",
  "championship",
  "random-quest-complete",
  "evolution-complete",
]);
type ItemType = "EMPTY" | "FIRE" | "HOMING" | "BOOST" | "SPIKES" | "SHIELD" | "NOVA";
type ItemLevel = 0 | 1 | 2 | 3;
type AttackType = "FIRE" | "HOMING" | "AURORA" | "SPIKES" | "NOVA" | "MONKEY" | "CANNON" | "SHOOTING_STAR" | "PIXEL" | "VOLT" | "COMET";
type DriverAnimal = "otter" | "fox" | "cat" | "corgi" | "monkey";
type CourseId = "city" | "jungle" | "starlight" | "river" | "cloud" | "pirate" | "custom";
type CupId = "basic" | "adventure";
type CupMedal = "gold" | "silver" | "bronze";
type CupMedalCabinet = Record<CupMedal, boolean>;
type SkillId = "PIXEL" | "VOLT" | "COMET" | "GIANT";
type RacerName = SkillId | "Gojo";
type GamepadInput = { connected: boolean; steer: number; gas: number; brake: number; drift: boolean; item: boolean; skill: boolean; pause: boolean };
type CharacterSelectSource = "cup" | "creator" | "random-quest" | "evolution" | "time-trial" | "staff-record" | "ultimate-gojo";
type RunMode = "race" | "time-trial" | "staff-record" | "gojo-line-record";
type CreatorGojoMode = "off" | "duel" | "field";
type KartMotionState = "grounded" | "airborne" | "falling" | "crashing";
type KeyAction = "gas" | "brake" | "left" | "right" | "drift" | "item" | "skill" | "pause";
type KeyBindings = Record<KeyAction, [string, string]>;
type GamepadBinding = { kind: "button"; index: number } | { kind: "axis"; index: number; direction: -1 | 1 };
type GamepadBindings = Record<KeyAction, [GamepadBinding | null, GamepadBinding | null]>;
// Device-local setup preferences. DEFAULT is an identity transform of the existing physics.
type MachineTuning = {
  drive: "balanced" | "launch" | "velocity";
  gear: "mid" | "low" | "high";
  tire: "standard" | "grip" | "drift" | "terrain";
  suspension: "standard" | "stable" | "jump" | "soft";
  guide: "none" | "light" | "heavy";
  boost: "standard" | "power" | "long" | "quick";
};
type TuningCategory = keyof MachineTuning;
type TuningPreset = "DEFAULT" | "SPEED" | "DRIFT" | "STABLE" | "CUSTOM";
type MachineParameters = {
  topSpeed: number; lowTorque: number; highTorque: number; mass: number;
  handling: number; highSpeedHandling: number; driftEntry: number; driftTurn: number;
  driftSlip: number; slipResponse: number; chargeRate: number; chargeDelay: number;
  waterCurrent: number; iceSlip: number;
  surfaceFollow: number; bumpLaunch: number; landingBounce: number; airControl: number;
  wallBounce: number; wallChargeRetention: number; wallGuide: number;
  boostDuration: number;
};
type TuningPart = { id: string; name: string; description: string; tradeoff: string; modifiers: Partial<MachineParameters> };
const TUNING_CATEGORIES: { id: TuningCategory; name: string; hint: string; parts: TuningPart[] }[] = [
  { id: "drive", name: "DRIVE UNIT", hint: "速度域ごとの加速曲線", parts: [
    { id: "balanced", name: "BALANCE", description: "低速から高速まで一定の押し出し。従来の加速感。", tradeoff: "突出した速度域はない", modifiers: {} },
    { id: "launch", name: "LAUNCH", description: "発進やコーナー出口で強く加速。高速域では穏やかになる。", tradeoff: "最高速と高速域の伸びは控えめ", modifiers: { lowTorque: 1.26, highTorque: 0.82, topSpeed: 0.96 } },
    { id: "velocity", name: "VELOCITY", description: "高速域で強く伸びる。速度を保てる長い直線向け。", tradeoff: "発進・減速後の復帰は鈍く、高速時は通常・ドリフトとも大回りになる", modifiers: { lowTorque: 0.8, highTorque: 1.26, topSpeed: 1.06, highSpeedHandling: 0.78, driftTurn: 0.93, driftSlip: 1.1 } },
  ] },
  { id: "gear", name: "GEAR UNIT", hint: "立ち上がりと最高速の交換", parts: [
    { id: "mid", name: "MID", description: "標準の伝達比。どの速度域も扱いやすい。", tradeoff: "純正セッティング", modifiers: {} },
    { id: "low", name: "LOW", description: "低速から素早く立ち上がる。曲がりの多いコース向け。", tradeoff: "最高速は低く、高速加速も弱い", modifiers: { lowTorque: 1.18, highTorque: 0.8, topSpeed: 0.95 } },
    { id: "high", name: "HIGH", description: "最高速を伸ばす。長い直線と早めのコーナー進入向け。", tradeoff: "低速加速が鈍く、速度が乗るほどハンドルの効きが弱い。コーナー前の減速が重要", modifiers: { lowTorque: 0.8, highTorque: 1.18, topSpeed: 1.07, highSpeedHandling: 0.72, driftTurn: 0.9, driftSlip: 1.08 } },
  ] },
  { id: "tire", name: "TIRE", hint: "曲がり方・横滑り・路面適性", parts: [
    { id: "standard", name: "STANDARD", description: "従来の通常旋回とドリフト特性。", tradeoff: "純正セッティング", modifiers: {} },
    { id: "grip", name: "GRIP", description: "通常旋回が鋭く安定。ドリフト中の横滑りを抑える。", tradeoff: "ドリフト開始には少し速度が必要", modifiers: { handling: 1.12, driftEntry: 1.13, driftTurn: 0.94, driftSlip: 0.7, slipResponse: 0.82 } },
    { id: "drift", name: "DRIFT", description: "通常旋回もドリフト旋回も鋭い。低めの速度から角度を作りやすく、ゲージも少し早く溜まる。", tradeoff: "切り込みやすいので操作は繊細に。滑り出しの速さと残る横滑りをカウンターで制御", modifiers: { handling: 1.3, driftEntry: 0.78, driftTurn: 1.6, driftSlip: 1.1, slipResponse: 1.35, chargeRate: 1.15 } },
    { id: "terrain", name: "WET GRIP", description: "水流による横押しと、氷結路面の横滑り・旋回低下を軽減。", tradeoff: "乾いた路面の通常旋回は少し穏やか", modifiers: { handling: 0.96, driftSlip: 0.9, waterCurrent: 0.4, iceSlip: 0.25 } },
  ] },
  { id: "suspension", name: "SUSPENSION", hint: "段差・着地・空中操作", parts: [
    { id: "standard", name: "STANDARD", description: "従来の路面追従と空中操作。", tradeoff: "純正セッティング", modifiers: {} },
    { id: "stable", name: "STABLE", description: "路面追従を強め、小さな段差での浮きと着地の揺れを抑える。", tradeoff: "空中での向きの調整は弱め", modifiers: { surfaceFollow: 1.45, bumpLaunch: 0.65, landingBounce: 0.35, airControl: 0.85 } },
    { id: "jump", name: "JUMP", description: "空中のハンドル操作が強く、飛行中の姿勢と方向を調整しやすい。", tradeoff: "自然な跳ね上がりと着地の揺れが増える", modifiers: { airControl: 1.36, bumpLaunch: 1.08, landingBounce: 1.18 } },
    { id: "soft", name: "SOFT", description: "段差の上下変化を吸収し、荒れた路面と着地を穏やかに。", tradeoff: "高速域の通常・ドリフト旋回はわずかに穏やか", modifiers: { surfaceFollow: 0.78, bumpLaunch: 0.8, landingBounce: 0.6, highSpeedHandling: 0.95, airControl: 0.94 } },
  ] },
  { id: "guide", name: "SIDE GUIDE", hint: "独自の側面フィンで接触をいなす", parts: [
    { id: "none", name: "BARE", description: "接触補助なし。軽さを優先する。", tradeoff: "壁への反発とドリフトゲージ損失は標準", modifiers: {} },
    { id: "light", name: "GLIDE FIN", description: "側面フィンが壁接触をいなし、進行方向へ戻しやすくする。", tradeoff: "重量増により通常加速が約6%弱まる", modifiers: { mass: 1.06, wallBounce: 0.65, wallChargeRetention: 0.55 / 0.35, wallGuide: 3 } },
    { id: "heavy", name: "GUARD FIN", description: "大型フィンが反発を強く抑え、壁沿いの速度損失を軽減。", tradeoff: "重量増により通常加速が約14%弱まる", modifiers: { mass: 1.16, wallBounce: 0.35, wallChargeRetention: 0.72 / 0.35, wallGuide: 6 } },
  ] },
  { id: "boost", name: "BOOST UNIT", hint: "加速・最高速は共通。溜め時間と持続を交換", parts: [
    { id: "standard", name: "STANDARD", description: "従来の溜め時間と持続時間。どちらにも偏らない。", tradeoff: "純正セッティング", modifiers: {} },
    { id: "power", name: "RESERVE", description: "同じゲージ量ならターボを20%長く維持。", tradeoff: "ゲージの増加は18%遅く、溜め始めも少し遅い", modifiers: { boostDuration: 1.2, chargeRate: 0.82, chargeDelay: 1.1 } },
    { id: "long", name: "LONG", description: "同じゲージ量ならターボを40%長く維持。", tradeoff: "ゲージの増加は28%遅く、溜め始めも遅い", modifiers: { boostDuration: 1.4, chargeRate: 0.72, chargeDelay: 1.2 } },
    { id: "quick", name: "QUICK", description: "溜め始めが早く、ゲージの増加も25%早い。短いドリフトからターボを繰り返す構成向け。", tradeoff: "同じゲージ量でのターボ持続は10%短い。加速・最高速は共通", modifiers: { boostDuration: 0.9, chargeRate: 1.25, chargeDelay: 0.75 } },
  ] },
];
const MACHINE_PRESETS: Record<Exclude<TuningPreset, "CUSTOM">, MachineTuning> = {
  DEFAULT: { drive: "balanced", gear: "mid", tire: "standard", suspension: "standard", guide: "none", boost: "standard" },
  SPEED: { drive: "velocity", gear: "high", tire: "grip", suspension: "jump", guide: "none", boost: "power" },
  DRIFT: { drive: "launch", gear: "mid", tire: "drift", suspension: "soft", guide: "light", boost: "quick" },
  STABLE: { drive: "launch", gear: "low", tire: "grip", suspension: "stable", guide: "heavy", boost: "long" },
};
function normalizeMachineTuning(value: unknown): MachineTuning {
  const normalized = { ...MACHINE_PRESETS.DEFAULT };
  if (!value || typeof value !== "object" || Array.isArray(value)) return normalized;
  for (const category of TUNING_CATEGORIES) {
    const id = (value as Record<string, unknown>)[category.id];
    if (typeof id === "string" && category.parts.some((part) => part.id === id)) {
      (normalized as Record<TuningCategory, string>)[category.id] = id;
    }
  }
  return normalized;
}
function machineTuningPreset(tuning: MachineTuning): TuningPreset {
  return (Object.keys(MACHINE_PRESETS) as Exclude<TuningPreset, "CUSTOM">[]).find((preset) =>
    TUNING_CATEGORIES.every(({ id }) => MACHINE_PRESETS[preset][id] === tuning[id])) ?? "CUSTOM";
}
function machineTuningParameters(tuning: MachineTuning): MachineParameters {
  const parameters: MachineParameters = {
    topSpeed: 1, lowTorque: 1, highTorque: 1, mass: 1,
    handling: 1, highSpeedHandling: 1, driftEntry: 1, driftTurn: 1,
    driftSlip: 1, slipResponse: 1, chargeRate: 1, chargeDelay: 1,
    waterCurrent: 1, iceSlip: 1,
    surfaceFollow: 1, bumpLaunch: 1, landingBounce: 1, airControl: 1,
    wallBounce: 1, wallChargeRetention: 1, wallGuide: 0,
    boostDuration: 1,
  };
  for (const category of TUNING_CATEGORIES) {
    const part = category.parts.find((entry) => entry.id === tuning[category.id])!;
    for (const [name, modifier] of Object.entries(part.modifiers)) {
      const key = name as keyof MachineParameters;
      if (key === "wallGuide") parameters[key] = modifier;
      else parameters[key] *= modifier;
    }
  }
  return parameters;
}
function machineDriveAcceleration(speed: number, parameters: MachineParameters): number {
  const band = Math.min(1, Math.abs(speed) / (34 * parameters.topSpeed));
  const curve = band * band * (3 - 2 * band);
  return 23 * (parameters.lowTorque + (parameters.highTorque - parameters.lowTorque) * curve) / parameters.mass;
}
function machineHandlingScale(speed: number, parameters: MachineParameters, drifting = false): number {
  const highBand = Math.max(0, Math.min(1, (Math.abs(speed) - 16) / 18));
  return (drifting ? parameters.driftTurn : parameters.handling) * (1 + (parameters.highSpeedHandling - 1) * highBand);
}
function machineTuningStats(tuning: MachineTuning): { name: string; value: number }[] {
  const p = machineTuningParameters(tuning);
  const score = (value: number) => Math.round(Math.max(0, Math.min(100, value)));
  return [
    { name: "TOP SPEED", value: score(60 + (p.topSpeed - 1) * 180) },
    { name: "ACCELERATION", value: score(60 + ((p.lowTorque * 0.7 + p.highTorque * 0.3) / p.mass - 1) * 70) },
    { name: "HANDLING", value: score(60 + (p.handling * p.highSpeedHandling - 1) * 130) },
    { name: "DRIFT", value: score(60 + (p.driftTurn * p.highSpeedHandling * p.driftSlip / p.driftEntry - 1) * 24) },
    { name: "STABILITY", value: score(60 + (1 - p.landingBounce) * 22 + (1 - p.wallBounce) * 18 + (1 - p.driftSlip) * 12) },
    { name: "BOOST", value: score(60 + (p.boostDuration * 0.5 + p.chargeRate * 0.5 - 1) * 65) },
  ];
}
type AchievementId = "FIRST_WIN" | "CUP_MASTER" | "PERFECT" | "DRIFT_MASTER" | "AIRBORNE" | "COMEBACK" | "DEFENDER" | "GOJO_DEFEATED" | "COURSE_DESIGNER" | "EVOLUTION_WITNESS";
type AchievementDefinition = { id: AchievementId; icon: string; name: string; description: string };
type AchievementStore = { unlocked: Partial<Record<AchievementId, number>>; shieldBlocks: number };
type GhostSample = [timeMs: number, x: number, y: number, z: number, heading: number, pitch: number, flags: number];
type GhostRecord = {
  version: 1;
  courseId: CourseId;
  character: RacerName;
  timeMs: number;
  createdAt: number;
  kind: "personal" | "staff";
  samples: GhostSample[];
};
type GhostStore = { personal: Partial<Record<CourseId, GhostRecord[]>>; staff: Partial<Record<CourseId, GhostRecord>> };
type GojoLineSample = [progress: number, lane: number, flags: number];
type GojoLineRecord = { version: 1; courseId: CourseId; createdAt: number; samples: GojoLineSample[] };
type GojoLineStore = Partial<Record<CourseId, GojoLineRecord>>;
type RaceRunStats = { crashCount: number; driftTurbos: number; shieldBlocks: number; clearedGuardrail: boolean; wasLast: boolean };
type RaceRunEvent = "drift-turbo" | "item-hit" | "shield-block" | "guardrail-clear" | "crash";
type RaceFinishPayload = { time: number; position: number; order: number[]; stats: RaceRunStats; ghostSamples: GhostSample[]; gojoLineSamples: GojoLineSample[] };
type SkillFeedbackTone = "instruction" | "orange" | "critical" | "comet" | "comet-critical";
type SkillFeedback = { id: number; text: string; tone: SkillFeedbackTone };
type TimeTrialResult = {
  time: number;
  personalBest: number;
  personalTimes: number[];
  resultRank: number | null;
  isNewBest: boolean;
  staffTime?: number;
};

const TAU = Math.PI * 2;
const COURSE_WIDTH = 10;
const SIDEWALK_EDGE = COURSE_WIDTH + 2.6;
const BARRIER_LANE = COURSE_WIDTH + 2.45;
const DECK_HALF_WIDTH = COURSE_WIDTH + 2.8;
const BARRIER_LIMIT = COURSE_WIDTH + 0.9;
const KART_COLLISION_HALF_WIDTH = 1.55;
const KART_LANDING_OVERLAP_FRACTION = 0.2;
const ITEM_ATTACK_SCORE_TYPES = new Set<AttackType>(["FIRE", "HOMING", "SPIKES", "NOVA"]);
const GUARDRAIL_TOP_OFFSET = 0.88;
const KART_RIDE_HEIGHT = 0.02;
const KART_FRONT_AXLE_OFFSET = 1.43;
const KART_REAR_AXLE_OFFSET = 1.31;
const WORLD_GROUND_Y = -0.52;
const PLAYER_START_PROGRESS = -0.058;
const JUMP_MIN_SPEED = 23;
const JUMP_GRAVITY = 9.81;
const STRONG_JUMP_GRAVITY = 12.75;
const JUMP_COOLDOWN_MS = 900;
const VOLT_CHARGE_RATE = 0.28;
const VOLT_ACTIVE_WINDOW_MS = 8000;
const VOLT_OVERHEAT_MS = 1800;
const COMET_GATE_SPACING_METERS = 42;
const COMET_GATE_VISIBLE_SEARCH_METERS = 60;
const COMET_GATE_TIMEOUT_MS = 3200;
// Reduce daylight glare without dimming the existing night/interior presets.
const RACE_DAY_EXPOSURE = 0.9;
const PIRATE_RENDER_WARMUP_PROGRESS = [0.02, 0.12, 0.22, 0.32, 0.42, 0.52, 0.62, 0.72, 0.82, 0.92] as const;
const ITEM_TURBO_ACCELERATION = 39;
const ITEM_TURBO_SPEED_CAP = 49;
const ITEM_PICKUP_RADIUS = 2.65;
const GOJO_ITEM_PICKUP_RADIUS = 3.4;
const ITEM_PICKUP_COOLDOWN_MS = 2000;
const RACE_FAULT_STORAGE_KEY = "prism-circuit-race-fault-v1";

type RaceFaultDiagnostic = {
  recordedAt: string;
  course: string;
  stage: string;
  raceElapsedMs: number;
  phase: string;
  error: { name: string; message: string; stack: string };
  player: Record<string, unknown>;
  activeObjects: Record<string, number>;
  renderer: Record<string, number>;
};
const PHYSICS_STEP_MS = 1000 / 60;
const PHYSICS_STEP_SECONDS = 1 / 60;
const MAX_PHYSICS_STEPS = 5;
const CRASH_DURATION_MS = 1160;
const TOTAL_LAPS = 3;
const lapCountForCourse = (courseId: CourseId) => courseId === "starlight" ? 5 : TOTAL_LAPS;
const MAX_CREATOR_PARTS = 50;
const STANDARD_ITEMS: Exclude<ItemType, "EMPTY" | "NOVA">[] = ["FIRE", "HOMING", "BOOST", "SPIKES", "SHIELD"];
const ITEM_ROW_PROGRESS = [0.12, 0.35, 0.59, 0.82];
const ITEM_ROW_LANES = [-6, -2, 2, 6];
const RACE_POINTS = [5, 3, 1, 0] as const;
const SETTINGS_STORAGE_KEY = "prism-circuit-settings-v1";
const ACHIEVEMENT_STORAGE_KEY = "prism-circuit-achievements-v1";
const GHOST_STORAGE_KEY = "prism-circuit-time-trial-ghosts-v1";
const GOJO_LINE_STORAGE_KEY = "prism-circuit-gojo-lines-v1";
const RANDOM_QUEST_SCORES_STORAGE_KEY = "prism-circuit-random-quest-scores-v1";
const BASIC_CUP_MEDAL_STORAGE_KEY = "prism-circuit-basic-cup-medal-v1";
const BASIC_CUP_MEDALS_STORAGE_KEY = "prism-circuit-basic-cup-medals-v1";
const ADVENTURE_CUP_MEDAL_STORAGE_KEY = "prism-circuit-adventure-cup-medal-v1";
const ADVENTURE_CUP_MEDALS_STORAGE_KEY = "prism-circuit-adventure-cup-medals-v1";
const GHOST_SAMPLE_INTERVAL_MS = 100;
const TIME_TRIAL_COURSE_IDS: CourseId[] = ["city", "jungle", "starlight", "river", "pirate", "cloud"];
const ACHIEVEMENTS: AchievementDefinition[] = [
  { id: "FIRST_WIN", icon: "01", name: "初勝利", description: "初めて1位になる" },
  { id: "CUP_MASTER", icon: "CP", name: "完全制覇", description: "1カップの全コースを1位でクリア" },
  { id: "PERFECT", icon: "PF", name: "パーフェクト", description: "一度もクラッシュせず優勝" },
  { id: "DRIFT_MASTER", icon: "DR", name: "ドリフト職人", description: "1レースでドリフトターボを10回発動" },
  { id: "AIRBORNE", icon: "FL", name: "空飛ぶカート", description: "ジャンプでガードレール越えに成功" },
  { id: "COMEBACK", icon: "RV", name: "逆転王", description: "最下位から1位になる" },
  { id: "DEFENDER", icon: "SH", name: "防御の達人", description: "シールドで攻撃を3回防ぐ" },
  { id: "GOJO_DEFEATED", icon: "GJ", name: "Gojo撃破", description: "一対一でGojoに勝つ" },
  { id: "COURSE_DESIGNER", icon: "CR", name: "コース設計者", description: "クリエイトコースを完成・保存" },
  { id: "EVOLUTION_WITNESS", icon: "EV", name: "開発史の証人", description: "EVOLUTION TOURを完走" },
];
const CUP_MEDAL_DEFINITIONS: Array<{ id: CupMedal; name: string; rank: string; placement: number }> = [
  { id: "gold", name: "金賞", rank: "1ST", placement: 1 },
  { id: "silver", name: "銀賞", rank: "2ND", placement: 2 },
  { id: "bronze", name: "銅賞", rank: "3RD", placement: 3 },
];
const DEFAULT_KEY_BINDINGS: KeyBindings = {
  gas: ["arrowup", "w"],
  brake: ["arrowdown", "s"],
  left: ["arrowleft", "a"],
  right: ["arrowright", "d"],
  drift: ["shift", ""],
  item: ["space", "e"],
  skill: ["q", ""],
  pause: ["escape", ""],
};
const DEFAULT_GAMEPAD_BINDINGS: GamepadBindings = {
  gas: [{ kind: "button", index: 7 }, { kind: "button", index: 0 }],
  brake: [{ kind: "button", index: 6 }, { kind: "button", index: 1 }],
  left: [{ kind: "axis", index: 0, direction: -1 }, { kind: "button", index: 14 }],
  right: [{ kind: "axis", index: 0, direction: 1 }, { kind: "button", index: 15 }],
  drift: [{ kind: "button", index: 4 }, { kind: "button", index: 5 }],
  item: [{ kind: "button", index: 2 }, null],
  skill: [{ kind: "button", index: 3 }, null],
  pause: [{ kind: "button", index: 9 }, null],
};
const KEY_ACTIONS: Array<{ id: KeyAction; label: string; hint: string }> = [
  { id: "gas", label: "ACCEL", hint: "アクセル" },
  { id: "brake", label: "BRAKE", hint: "ブレーキ" },
  { id: "left", label: "STEER LEFT", hint: "左ハンドル" },
  { id: "right", label: "STEER RIGHT", hint: "右ハンドル" },
  { id: "drift", label: "DRIFT", hint: "ドリフト" },
  { id: "item", label: "ITEM", hint: "アイテム" },
  { id: "skill", label: "SKILL", hint: "スキル" },
  { id: "pause", label: "PAUSE", hint: "タイトルへ戻る" },
];
const normalizeBindingKey = (key: string) => key === " " ? "space" : key.toLowerCase();
const normalizeBindingCode = (code: string) => {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  const codes: Record<string, string> = {
    ArrowUp: "arrowup", ArrowDown: "arrowdown", ArrowLeft: "arrowleft", ArrowRight: "arrowright",
    Space: "space", ShiftLeft: "shift", ShiftRight: "shift", ControlLeft: "control", ControlRight: "control",
    AltLeft: "alt", AltRight: "alt", Enter: "enter", Escape: "escape", Tab: "tab",
  };
  return codes[code] ?? "";
};
const displayBindingKey = (key: string) => {
  if (!key) return "NONE";
  if (key.startsWith("mouse:")) return `MOUSE ${Number(key.slice(6)) + 1}`;
  const labels: Record<string, string> = {
    arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→",
    space: "SPACE", shift: "SHIFT", control: "CTRL", alt: "ALT",
  };
  return labels[key] ?? key.toUpperCase();
};
const cloneKeyBindings = (bindings: KeyBindings): KeyBindings => ({
  gas: [...bindings.gas], brake: [...bindings.brake], left: [...bindings.left], right: [...bindings.right],
  drift: [...bindings.drift], item: [...bindings.item], skill: [...bindings.skill], pause: [...bindings.pause],
});
const cloneGamepadBinding = (binding: GamepadBinding | null): GamepadBinding | null => binding ? { ...binding } : null;
const cloneGamepadBindings = (bindings: GamepadBindings): GamepadBindings => ({
  gas: [cloneGamepadBinding(bindings.gas[0]), cloneGamepadBinding(bindings.gas[1])],
  brake: [cloneGamepadBinding(bindings.brake[0]), cloneGamepadBinding(bindings.brake[1])],
  left: [cloneGamepadBinding(bindings.left[0]), cloneGamepadBinding(bindings.left[1])],
  right: [cloneGamepadBinding(bindings.right[0]), cloneGamepadBinding(bindings.right[1])],
  drift: [cloneGamepadBinding(bindings.drift[0]), cloneGamepadBinding(bindings.drift[1])],
  item: [cloneGamepadBinding(bindings.item[0]), cloneGamepadBinding(bindings.item[1])],
  skill: [cloneGamepadBinding(bindings.skill[0]), cloneGamepadBinding(bindings.skill[1])],
  pause: [cloneGamepadBinding(bindings.pause[0]), cloneGamepadBinding(bindings.pause[1])],
});
const displayGamepadBinding = (binding: GamepadBinding | null) => {
  if (!binding) return "NONE";
  if (binding.kind === "button") {
    const labels: Record<number, string> = {
      0: "× / A",
      1: "○ / B",
      2: "□ / X",
      3: "△ / Y",
      4: "L1 / LB",
      5: "R1 / RB",
      6: "L2 / LT",
      7: "R2 / RT",
      9: "OPTIONS / PAUSE",
      12: "D-PAD ↑",
      13: "D-PAD ↓",
      14: "D-PAD ←",
      15: "D-PAD →",
    };
    return labels[binding.index] ?? `BUTTON ${binding.index}`;
  }
  if (binding.index === 0) return `LEFT STICK ${binding.direction < 0 ? "←" : "→"}`;
  if (binding.index === 1) return `LEFT STICK ${binding.direction < 0 ? "↑" : "↓"}`;
  return `AXIS ${binding.index} ${binding.direction < 0 ? "−" : "+"}`;
};
const sameGamepadBinding = (left: GamepadBinding | null, right: GamepadBinding | null) => Boolean(
  left && right && left.kind === right.kind && left.index === right.index &&
  (left.kind === "button" || (right.kind === "axis" && left.direction === right.direction)),
);
const normalizeStoredGamepadBinding = (value: unknown): GamepadBinding | null | undefined => {
  if (value === null) return null;
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as { kind?: unknown; index?: unknown; direction?: unknown };
  if (!Number.isInteger(candidate.index) || (candidate.index as number) < 0 || (candidate.index as number) > 63) return undefined;
  if (candidate.kind === "button") return { kind: "button", index: candidate.index as number };
  if (candidate.kind === "axis" && (candidate.direction === -1 || candidate.direction === 1)) {
    return { kind: "axis", index: candidate.index as number, direction: candidate.direction };
  }
  return undefined;
};
type CourseDefinition = {
  id: CourseId;
  name: string;
  title: string;
  tagline: string;
  description: string;
  distance: string;
  rawPoints: Array<[number, number, number]>;
  theme?: CreatorTheme;
};

type CoursePartType = "straight" | "curve-left" | "curve-right" | "s-curve" | "uphill" | "downhill" | "uphill-continuous" | "downhill-continuous";
type CreatorHazardType = "monkey" | "cloud-beam" | "river" | "shooting-star" | "cannon";
type CreatorTheme = "city" | "jungle" | "starlight" | "cloud";
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
type SavedCreatorCourse = { name: string; parts: CoursePartType[]; hazards?: CreatorHazardPlacement[]; theme?: CreatorTheme; savedAt: number };
type RandomQuestKind = "speed" | "drift" | "overtake" | "item-level" | "clean" | "first-hold" | "shield";
type RandomQuestDefinition = { id: string; kind: RandomQuestKind; label: string; target: number; reward: number; unit: string; timeLimitMs: number };
type RandomQuestCourse = { name: string; theme: CreatorTheme; parts: CoursePartType[]; hazards: CreatorHazardPlacement[]; quests: RandomQuestDefinition[] };
type RandomQuestTour = { version: 4; seed: number; courses: RandomQuestCourse[] };
type RandomQuestRuntime = {
  activeIndex: number;
  value: number;
  completed: RandomQuestDefinition[];
  failed: RandomQuestDefinition[];
  activeStartedAt: number;
  lastTelemetryAt: number;
  lastPosition: number;
  actionPoints: number;
};
type RandomQuestComboDisplay = {
  id: number;
  count: number;
  multiplier: number;
  awardedPoints: number;
  label: string;
};
type RandomQuestRoundResult = {
  courseIndex: number;
  position: number;
  cleared: number;
  failed: number;
  questPoints: number;
  actionPoints: number;
  chainBonus: number;
  positionPoints: number;
  noCrashBonus: number;
  total: number;
};
const emptyRandomQuestRuntime = (): RandomQuestRuntime => ({
  activeIndex: 0,
  value: 0,
  completed: [],
  failed: [],
  activeStartedAt: 0,
  lastTelemetryAt: 0,
  lastPosition: 4,
  actionPoints: 0,
});
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
  const activeParts: CoursePartType[] = parts.length ? parts : ["straight"];
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
  const activeParts: CoursePartType[] = parts.length ? parts : ["straight"];
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

function buildCreatorCourseDefinition(name: string, parts: CoursePartType[], theme: CreatorTheme = "city"): CourseDefinition {
  const activeParts: CoursePartType[] = parts.length ? parts : ["straight"];
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
    theme,
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

type EvolutionMilestone = {
  version: string;
  name: string;
  description: string;
};
type EvolutionChapter = {
  courseId: CourseId;
  number: string;
  title: string;
  subtitle: string;
  milestones: [EvolutionMilestone, EvolutionMilestone, EvolutionMilestone];
};

const EVOLUTION_CHAPTERS: EvolutionChapter[] = [
  {
    courseId: "city",
    number: "01",
    title: "THE FIRST ROAD",
    subtitle: "平面試作から、後方視点の3Dレースへ。",
    milestones: [
      { version: "V01", name: "FLAT PROTOTYPE", description: "板状の道路と最低限の操作だけで走った最初期。" },
      { version: "V04", name: "CHASE CAMERA", description: "自機後方カメラと3Dカートが登場。まだ曲がり方は素朴。" },
      { version: "V12", name: "ITEMS ONLINE", description: "アイテムボックスが加わり、レースらしい駆け引きが始まる。" },
    ],
  },
  {
    courseId: "city",
    number: "02",
    title: "ELEVATION CHAOS",
    subtitle: "上と下が重なった道路から、滑らかな立体コースへ。",
    milestones: [
      { version: "V18", name: "OVERLAP DISASTER", description: "高低差不足で上段と下段が重なった、伝説の道路サンドイッチ。" },
      { version: "V22", name: "STAIRCASE CURVES", description: "直線板を貼った高低差カーブ。走る道路というより巨大な階段。" },
      { version: "V31", name: "SMOOTH SLOPES", description: "曲面と十分な高低差を得て、現在につながる立体コースへ。" },
    ],
  },
  {
    courseId: "river",
    number: "03",
    title: "WATER EXPERIMENTS",
    subtitle: "水色の板から、流れに押される急流へ。",
    milestones: [
      { version: "V38", name: "CYAN BOARD", description: "川のつもりが、どう見ても水色の床だった時代。" },
      { version: "V43", name: "VERTICAL WATER", description: "流れを作ろうとして水の板が縦に刺さった実験期。" },
      { version: "V49", name: "RAPIDWOOD FLOW", description: "透明感、流れ、横断水流を備えた密林の急流へ完成。" },
    ],
  },
  {
    courseId: "cloud",
    number: "04",
    title: "CLOUD EXPERIMENTS",
    subtitle: "白い板から、消えて崩れる雲上路面へ。",
    milestones: [
      { version: "V51", name: "WHITE BOARD", description: "雲のつもりで置いた白い板。ふわふわ感は行方不明。" },
      { version: "V55", name: "CLOUD WALL", description: "雲パーツが直角に立ち、路面へ豪快に刺さった試行錯誤。" },
      { version: "V68", name: "CLOUDLOFT", description: "立体的な雲、消失予告、天候変化を備えた現在の空へ。" },
    ],
  },
];

const evolutionMilestoneAt = (chapterIndex: number, progress: number) => {
  const chapter = EVOLUTION_CHAPTERS[clamp(Math.trunc(chapterIndex), 0, EVOLUTION_CHAPTERS.length - 1)];
  const localLap = clamp(Math.floor(Math.max(0, progress)), 0, 2);
  return { chapter, localLap, milestone: chapter.milestones[localLap], stage: evolutionStageFor(chapterIndex, progress) };
};
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
    skillDescription: "地上・空中でスキルを押し続け、角度メーターを狙って離す。低角度は2秒間の低空ダッシュ、中角度は遠距離、高角度は高く短く跳ぶ。溜め不足・溜めすぎでは跳べない。",
    cooldownMs: 20000,
  },
  {
    name: "PIXEL",
    badge: "PX",
    color: 0xe95277,
    accent: 0xffd8e2,
    animal: "fox",
    skillName: "VECTOR TURBO",
    skillDescription: "左右を入力しない間、ターボアイテムの3倍の速度で加速する。ハンドルを切った瞬間に終了する直線勝負のスキル。",
    cooldownMs: 20000,
  },
  {
    name: "VOLT",
    badge: "VT",
    color: 0x7657d5,
    accent: 0xe7ddff,
    animal: "cat",
    skillName: "OVERCHARGE DRIFT",
    skillDescription: "次のドリフトを70～80%で離すと通常ターボが3秒継続。73～77%の赤い帯なら、ターボアイテムの1.5倍速が3秒続く。",
    cooldownMs: 20000,
  },
  {
    name: "COMET",
    badge: "CM",
    color: 0xf3a62f,
    accent: 0xffefd1,
    animal: "corgi",
    skillName: "COMET STREAM",
    skillDescription: "光輪を通るたび加速が強化。1個目は通常ターボの70%を2秒、2個目は通常ターボを3秒、3個目は1.5倍を3秒。",
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
  skillDescription: "全キャラクターの固有スキルを状況に合わせて使い分ける。直線・ドリフト・光輪・ショートカットをコース状況から選択する。",
  cooldownMs: 20000,
};

type CpuDriftPhase = "entry" | "hold" | "counter" | "exit";

const CPU_MIN_CURVE_DRIFT_MS = 3000;
const CPU_DRIFT_PLAN_MARGIN_MS = 320;
const CPU_DRIFT_TURBO_PRIORITY_CHARGE = 0.5;
const CPU_DRIFT_SAFETY_LANE_LIMIT = BARRIER_LIMIT - 1.45;
const CPU_OBSTACLE_LOOKAHEAD_METERS = 500;
const CPU_OBSTACLE_ROUTE_STEP_METERS = 25;
const CPU_OBSTACLE_REPLAN_MS = 120;

const CPU_DRIFT_PROFILES: Record<RacerName, { entryThreshold: number; chance: number; commitmentMs: number }> = {
  PIXEL: { entryThreshold: 0.058, chance: 0.74, commitmentMs: 720 },
  VOLT: { entryThreshold: 0.05, chance: 0.88, commitmentMs: 820 },
  COMET: { entryThreshold: 0.067, chance: 0.6, commitmentMs: 650 },
  GIANT: { entryThreshold: 0.06, chance: 0.7, commitmentMs: 700 },
  Gojo: { entryThreshold: 0.04, chance: 0.99, commitmentMs: 1350 },
};

const characterSkill = (character: CharacterDefinition): SkillId =>
  character.name === "Gojo" ? "PIXEL" : character.name;

const skillCooldownFor = (character: CharacterDefinition) => character.cooldownMs;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function readGamepadInput(bindings: GamepadBindings = DEFAULT_GAMEPAD_BINDINGS): GamepadInput {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return { connected: false, steer: 0, gas: 0, brake: 0, drift: false, item: false, skill: false, pause: false };
  let pads: ArrayLike<Gamepad | null>;
  try {
    pads = navigator.getGamepads();
  } catch {
    return { connected: false, steer: 0, gas: 0, brake: 0, drift: false, item: false, skill: false, pause: false };
  }
  const connectedPads: Gamepad[] = [];
  for (let index = 0; index < pads.length; index += 1) {
    const candidate = pads[index];
    if (candidate?.connected) connectedPads.push(candidate);
  }
  if (!connectedPads.length) return { connected: false, steer: 0, gas: 0, brake: 0, drift: false, item: false, skill: false, pause: false };
  const bindingValue = (pad: Gamepad, binding: GamepadBinding | null) => {
    if (!binding) return 0;
    if (binding.kind === "button") {
      const button = pad.buttons[binding.index];
      return Math.max(button?.value ?? 0, button?.pressed ? 1 : 0);
    }
    const directed = (pad.axes[binding.index] ?? 0) * binding.direction;
    const deadzone = 0.22;
    return directed <= deadzone ? 0 : clamp((directed - deadzone) / (1 - deadzone), 0, 1);
  };
  const actionValue = (action: KeyAction) => connectedPads.reduce((maximum, pad) => Math.max(
    maximum,
    bindingValue(pad, bindings[action][0]),
    bindingValue(pad, bindings[action][1]),
  ), 0);
  const left = actionValue("left");
  const right = actionValue("right");
  return {
    connected: true,
    steer: clamp(left - right, -1, 1),
    gas: actionValue("gas"),
    brake: actionValue("brake"),
    drift: actionValue("drift") > 0.55,
    item: actionValue("item") > 0.55,
    skill: actionValue("skill") > 0.55,
    pause: actionValue("pause") > 0.55,
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
  lowestRoadHeight: number;
  pointAt: (u: number, lane?: number) => CoursePose;
  sampledPointAtInto: (u: number, lane: number, target: CoursePose) => CoursePose;
  nearest: (x: number, z: number, hintU?: number) => { u: number; distance: number; pose: CoursePose };
  nearestSurface: (x: number, y: number, z: number, hintU?: number) => { u: number; distance: number; pose: CoursePose };
  isClearFromRoad: (x: number, z: number, clearance: number, ignoreU?: number, ignoreRange?: number) => boolean;
};

// Render-only detail budget. Physics, landing, ranking and collision sampling continue
// to use RaceCourse's independent 1600-point representation above/below this block.
const LOW_POLY_VISUAL_DETAIL = Object.freeze({
  courseStripSegments: 1440,
  courseEdgeSegments: 1440,
  interiorDeckSegments: 480,
  barrierSegments: 360,
  curbSegments: 280,
  laneDashCount: 144,
  roundSides: 8,
  softRoundSides: 10,
});

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
  const lowestRoadHeight = samples.reduce(
    (lowest, sample) => Math.min(lowest, sample.pose.y),
    Number.POSITIVE_INFINITY,
  );
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

  return { length: curve.getLength(), lowestRoadHeight, pointAt, sampledPointAtInto, nearest, nearestSurface, isClearFromRoad };
}

function makeCourseStripGeometry(THREE: ThreeModule, course: RaceCourse, leftLane: number, rightLane: number, yOffset = 0) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const segments = LOW_POLY_VISUAL_DETAIL.courseStripSegments;
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
  const segments = LOW_POLY_VISUAL_DETAIL.interiorDeckSegments;
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
  const segments = LOW_POLY_VISUAL_DETAIL.courseEdgeSegments;
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

function makeLowPolyHullSectionGeometry(
  THREE: ThreeModule,
  width: number,
  height: number,
  depth: number,
  bowScale = 0.22,
) {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const halfDepth = depth / 2;
  const bowHalfWidth = halfWidth * bowScale;
  const positions = new Float32Array([
    -halfWidth, halfHeight, -halfDepth,
    halfWidth, halfHeight, -halfDepth,
    -halfWidth * 0.68, -halfHeight, -halfDepth,
    halfWidth * 0.68, -halfHeight, -halfDepth,
    -bowHalfWidth, halfHeight, halfDepth,
    bowHalfWidth, halfHeight, halfDepth,
    -bowHalfWidth * 0.42, -halfHeight * 0.55, halfDepth,
    bowHalfWidth * 0.42, -halfHeight * 0.55, halfDepth,
  ]);
  const indices = [
    0, 1, 4, 1, 5, 4,
    2, 6, 3, 3, 6, 7,
    0, 4, 2, 2, 4, 6,
    1, 3, 5, 3, 7, 5,
    0, 2, 1, 1, 2, 3,
    4, 5, 6, 5, 7, 6,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createAnimalDriver(THREE: ThreeModule, animal: DriverAnimal, suitColor: number) {
  const driver = new THREE.Group();
  driver.position.set(0, 0.84, -0.34);

  const animalColors: Record<DriverAnimal, { fur: number; light: number; dark: number }> = {
    otter: { fur: 0xa86f43, light: 0xdeb683, dark: 0x34231d },
    fox: { fur: 0xe86c2b, light: 0xffead5, dark: 0x43251f },
    cat: { fur: 0x343a43, light: 0xdde1e4, dark: 0x10151a },
    corgi: { fur: 0xd98a2c, light: 0xffefd0, dark: 0x42281c },
    monkey: { fur: 0xf07aa9, light: 0xffd2e1, dark: 0x6d294d },
  };
  const colors = animalColors[animal];
  const fur = new THREE.MeshPhysicalMaterial({ color: colors.fur, roughness: 0.85, sheen: 0.45, sheenRoughness: 0.9, sheenColor: colors.light });
  const lightFur = new THREE.MeshStandardMaterial({ color: colors.light, roughness: 0.88 });
  const darkFur = new THREE.MeshStandardMaterial({ color: colors.dark, roughness: 0.82 });
  const black = new THREE.MeshPhysicalMaterial({ color: 0x0b0f13, roughness: 0.16, clearcoat: 0.72 });
  const eye = new THREE.MeshPhysicalMaterial({ color: 0x16110d, roughness: 0.08, clearcoat: 1 });
  const harness = new THREE.MeshStandardMaterial({ color: suitColor, roughness: 0.5, metalness: 0.08, flatShading: true });
  [fur, lightFur, darkFur].forEach((material) => markGeneratedSurface(material, "fur", "uv"));
  markGeneratedSurface(harness, "fabric");

  const add = (geometry: Three.BufferGeometry, material: Three.Material, x: number, y: number, z: number, parent: Three.Object3D = driver) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const torso = add(new THREE.SphereGeometry(0.58, 24, 16), fur, 0, 0.44, 0);
  torso.scale.set(0.9, 1.02, 0.76);
  const belly = add(new THREE.SphereGeometry(0.29, 20, 12), lightFur, 0, 0.38, 0.37);
  belly.scale.set(0.82, 1.08, 0.34);
  const collar = add(new THREE.TorusGeometry(0.34, 0.035, 6, 18, Math.PI), harness, 0, 0.73, 0.08);
  collar.rotation.x = Math.PI / 2;
  collar.rotation.z = Math.PI / 2;

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 1.18, 0.12);
  driver.add(headPivot);
  const head = add(new THREE.SphereGeometry(0.58, 28, 20), fur, 0, 0, 0, headPivot);
  head.scale.set(animal === "corgi" ? 1.08 : animal === "monkey" ? 1.03 : 1, animal === "monkey" ? 1.06 : 1, animal === "fox" ? 1.08 : 1);
  const muzzle = add(new THREE.SphereGeometry(0.3, 20, 14), lightFur, 0, -0.12, 0.45, headPivot);
  muzzle.scale.set(animal === "otter" ? 1.22 : animal === "monkey" ? 1.34 : 1, animal === "monkey" ? 0.82 : 0.72, 0.72);
  const nose = add(new THREE.SphereGeometry(0.1, 16, 12), black, 0, -0.035, 0.68, headPivot);
  nose.scale.set(1.2, 0.82, 0.72);
  // The fox head is deeper than the other heads, so the shared eye depth used
  // to bury both eyes inside its face. Keep every eye just outside its own
  // head surface instead of relying on one depth for all silhouettes.
  const eyeDepth = animal === "fox" ? 0.625 : 0.565;
  [-1, 1].forEach((side) => {
    const eyeMesh = add(new THREE.SphereGeometry(0.068, 10, 8), eye, side * 0.18, 0.1, eyeDepth, headPivot);
    eyeMesh.scale.set(0.85, 1.12, 0.58);
    const catchlight = add(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), side * 0.18 - 0.017, 0.126, eyeDepth + 0.034, headPivot);
    catchlight.scale.z = 0.35;
  });
  [-1, 1].forEach((side) => {
    const mouth = add(new THREE.CylinderGeometry(0.014, 0.014, 0.13, 6), darkFur, side * 0.045, -0.17, 0.65, headPivot);
    mouth.rotation.z = side * 0.62;
  });

  if (animal === "otter" || animal === "monkey") {
    [-1, 1].forEach((side) => {
      const monkey = animal === "monkey";
      const ear = add(new THREE.DodecahedronGeometry(monkey ? 0.23 : 0.19, 0), monkey ? lightFur : fur, side * (monkey ? 0.43 : 0.39), monkey ? 0.22 : 0.36, -0.02, headPivot);
      ear.scale.set(monkey ? 0.9 : 0.82, 1, monkey ? 0.54 : 0.66);
      add(new THREE.DodecahedronGeometry(monkey ? 0.115 : 0.095, 0), monkey ? fur : lightFur, side * (monkey ? 0.43 : 0.39), monkey ? 0.22 : 0.36, 0.09, headPivot);
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
      const cheek = add(new THREE.DodecahedronGeometry(0.2, 0), lightFur, side * 0.22, -0.08, 0.39, headPivot);
      cheek.scale.set(1, 0.78, 0.7);
    });
    const tail = add(new THREE.CapsuleGeometry(0.18, 0.64, 10, 20), fur, 0.48, 0.32, -0.38);
    tail.rotation.z = -0.62;
    add(new THREE.DodecahedronGeometry(0.2, 0), lightFur, 0.7, 0.13, -0.39).scale.set(0.82, 1.16, 0.82);
  } else if (animal === "cat") {
    const tail = add(new THREE.TorusGeometry(0.34, 0.075, 12, 30, Math.PI * 1.35), fur, 0.38, 0.4, -0.5);
    tail.rotation.z = -0.28;
  } else if (animal === "corgi") {
    const blaze = add(new THREE.DodecahedronGeometry(0.17, 0), lightFur, 0, 0.19, 0.47, headPivot);
    blaze.scale.set(0.6, 1.25, 0.45);
    add(new THREE.DodecahedronGeometry(0.19, 0), lightFur, 0, 0.37, -0.53).scale.set(1.15, 0.8, 0.85);
  } else if (animal === "monkey") {
    const facePatch = add(new THREE.IcosahedronGeometry(0.39, 1), lightFur, 0, -0.01, 0.25, headPivot);
    facePatch.scale.set(0.9, 1.02, 0.58);
    const tail = add(new THREE.TorusGeometry(0.38, 0.075, 12, 34, Math.PI * 1.62), fur, 0.42, 0.37, -0.52);
    tail.rotation.set(Math.PI / 2, 0.18, -0.34);
  } else {
    const tail = add(new THREE.CapsuleGeometry(0.14, 0.5, 8, 18), fur, 0.4, 0.29, -0.41);
    tail.rotation.z = -0.68;
  }
  const addDriverLimbSegment = (from: Three.Vector3, to: Three.Vector3, radius = 0.135) => {
    const direction = to.clone().sub(from);
    const length = direction.length();
    const segment = add(
      new THREE.CylinderGeometry(radius * 0.92, radius, length, 8),
      fur,
      (from.x + to.x) / 2,
      (from.y + to.y) / 2,
      (from.z + to.z) / 2,
    );
    segment.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    );
    return segment;
  };
  [-1, 1].forEach((side) => {
    const shoulder = new THREE.Vector3(side * 0.42, 0.53, 0.08);
    const elbow = new THREE.Vector3(side * 0.49, 0.34, 0.45);
    // In driver-local coordinates this is the left/right rim of the wheel at
    // bodyRoot (0, 1.08, 0.48), so both hands visibly grip the steering ring.
    const steeringGripTarget = new THREE.Vector3(side * 0.27, 0.24, 0.81);
    addDriverLimbSegment(shoulder, elbow, 0.145);
    addDriverLimbSegment(elbow, steeringGripTarget, 0.13);
    const elbowJoint = add(new THREE.DodecahedronGeometry(0.145, 0), fur, elbow.x, elbow.y, elbow.z);
    elbowJoint.scale.set(0.95, 0.92, 0.95);
    const hand = add(
      new THREE.DodecahedronGeometry(0.17, 0),
      fur,
      steeringGripTarget.x,
      steeringGripTarget.y,
      steeringGripTarget.z,
    );
    hand.scale.set(1, 0.86, 1.08);
  });

  driver.userData.headPivot = headPivot;
  return driver;
}

// Visual timing only: the hazard still owns its route, trap schedule and collisions.
function monkeyTrapPose(now: number, nextTrapAt: number, lastPlacedAt: number) {
  const smooth = (value: number) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
  const recovering = lastPlacedAt > 0 && now >= lastPlacedAt && now - lastPlacedAt < 850;
  const preparation = nextTrapAt > now ? smooth((now - nextTrapAt + 1050) / 1050) : 1;
  const recovery = recovering ? smooth((now - lastPlacedAt) / 850) : 0;
  const carryAmount = recovering ? 1 - recovery : lastPlacedAt <= 0 ? 1 : smooth((2800 - (nextTrapAt - now)) / 450);
  return { reach: recovering ? 1 - recovery : preparation, carrying: !recovering && carryAmount > 0.01, carryAmount };
}

function makeTrapMonkeyVisual(THREE: ThreeModule, makeCarriedTrap: () => Three.Group) {
  const root = new THREE.Group();
  root.name = "trap-monkey";
  const fur = markGeneratedSurface(new THREE.MeshStandardMaterial({ color: 0x81502f, roughness: 0.86 }), "fur", "uv");
  const face = markGeneratedSurface(new THREE.MeshStandardMaterial({ color: 0xe4b477, roughness: 0.82 }), "fur", "uv");
  const dark = new THREE.MeshStandardMaterial({ color: 0x2d1a12, roughness: 0.72 });
  const ball = new THREE.SphereGeometry(1, 20, 14);
  const link = new THREE.CylinderGeometry(0.83, 1, 1, 10);
  const roundedLimb = new THREE.CapsuleGeometry(1, 1, 4, 10);
  const digitGeometry = new THREE.CapsuleGeometry(0.025, 0.026, 3, 6);
  const ellipsoid = (parent: Three.Object3D, name: string, material: Three.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const mesh = new THREE.Mesh(ball, material);
    mesh.name = name; mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); parent.add(mesh); return mesh;
  };
  const pivot = (parent: Three.Object3D, name: string) => {
    const joint = new THREE.Group(); joint.name = name; parent.add(joint); return joint;
  };
  // Keep the original round-bodied, large-headed cartoon monkey, not realistic anatomy.
  // Hidden pelvis -> lumbar -> thorax -> neck joints animate that familiar silhouette.
  const pelvis = pivot(root, "monkey-pelvis");
  const lumbar = pivot(pelvis, "monkey-lumbar");
  const thorax = pivot(lumbar, "monkey-thorax");
  const neck = pivot(thorax, "monkey-neck");
  const head = pivot(neck, "monkey-head");
  const bodyMesh = ellipsoid(thorax, "monkey-body", fur, 0, -0.25, 0.1, 0.72 * 0.88, 0.72 * 1.18, 0.72 * 0.8);
  ellipsoid(head, "monkey-cranium", fur, 0, 0, 0, 0.62, 0.62, 0.62);
  ellipsoid(head, "monkey-muzzle", face, 0, -0.14, -0.47, 0.38, 0.38 * 0.76, 0.38 * 0.6);
  ellipsoid(head, "monkey-nose", dark, 0, -0.10, -0.676, 0.075, 0.04, 0.035);
  ellipsoid(head, "monkey-mouth", dark, 0, -0.235, -0.677, 0.075, 0.012, 0.014);
  for (const side of [-1, 1]) {
    ellipsoid(head, `monkey-ear-${side}`, face, side * 0.56, 0.14, -0.02, 0.23, 0.23, 0.23);
    ellipsoid(head, `monkey-eye-${side}`, dark, side * 0.18, 0.06, -0.56, 0.062, 0.062, 0.042);
  }
  const down = new THREE.Vector3(0, -1, 0);
  const axis = new THREE.Vector3(), pole = new THREE.Vector3(), scratch = new THREE.Vector3();
  const upperQ = new THREE.Quaternion(), lowerQ = new THREE.Quaternion();
  const inverseRoot = new THREE.Matrix4();
  const bodyPoint = new THREE.Vector3(), worldPosition = new THREE.Vector3(), worldScale = new THREE.Vector3(), drop = new THREE.Vector3();
  const makeLimb = (side: number, arm: boolean) => {
    const name = `monkey-${arm ? "arm" : "leg"}-${side}`;
    const base = pivot(root, `${name}-${arm ? "shoulder" : "hip"}`);
    const upper = pivot(base, `${name}-upper`);
    const elbow = pivot(upper, `${name}-${arm ? "elbow" : "knee"}`);
    const lower = pivot(elbow, `${name}-lower`);
    const end = pivot(lower, `${name}-${arm ? "wrist" : "ankle"}`);
    const palm = pivot(end, `${name}-${arm ? "hand" : "foot"}`);
    const upperLength = arm ? 0.61 : 0.50, lowerLength = arm ? 0.59 : 0.48;
    const upperMesh = new THREE.Mesh(roundedLimb, fur), lowerMesh = new THREE.Mesh(roundedLimb, fur);
    upperMesh.scale.set(arm ? 0.16 : 0.20, upperLength / 3, arm ? 0.16 : 0.19);
    lowerMesh.scale.set(arm ? 0.13 : 0.15, lowerLength / 3, arm ? 0.13 : 0.15);
    upperMesh.position.y = -upperLength / 2; lowerMesh.position.y = -lowerLength / 2;
    upper.add(upperMesh); lower.add(lowerMesh);
    elbow.position.y = -upperLength; end.position.y = -lowerLength;
    ellipsoid(base, `${name}-root-blend`, fur, 0, 0, 0, arm ? 0.20 : 0.22, 0.21, 0.20);
    ellipsoid(elbow, `${name}-joint-blend`, fur, 0, 0, 0, 0.145, 0.15, 0.145);
    ellipsoid(end, `${name}-end-blend`, face, 0, 0, 0, 0.10, 0.09, 0.10);
    ellipsoid(palm, `${name}-palm`, face, 0, -0.015, -0.045, arm ? 0.15 : 0.19, arm ? 0.11 : 0.09, arm ? 0.14 : 0.23);
    const fingers: { base: Three.Group; tip: Three.Group }[] = [];
    // Five separate digits, each with proximal and distal flexion; thumbs oppose the grip.
    for (let digit = 0; digit < 5; digit++) {
      const finger = pivot(palm, `${name}-digit-${digit}`);
      const tip = pivot(finger, `${name}-digit-${digit}-tip`);
      const thumb = digit === 0;
      finger.position.set(thumb ? -side * 0.12 : (digit - 2.5) * 0.047, -0.017, thumb ? -0.02 : arm ? -0.125 : -0.20);
      finger.rotation.y = thumb ? -side * 0.75 : (digit - 2.5) * -0.04;
      tip.position.z = -0.046;
      const proximal = new THREE.Mesh(digitGeometry, face), distal = new THREE.Mesh(digitGeometry, face);
      proximal.rotation.x = Math.PI / 2; distal.rotation.x = Math.PI / 2;
      proximal.position.z = -0.022; distal.position.z = -0.022;
      if (!arm) { proximal.scale.set(0.8, 0.95, 0.8); distal.scale.set(0.8, 0.9, 0.8); }
      finger.add(proximal); tip.add(distal); fingers.push({ base: finger, tip });
    }
    return { side, arm, base, upper, elbow, lower, end, palm, fingers, upperLength, lowerLength,
      start: new THREE.Vector3(), middle: new THREE.Vector3(), target: new THREE.Vector3(),
      anchor: new THREE.Vector3(), swingStart: new THREE.Vector3(), swingEnd: new THREE.Vector3(),
      contact: false, gaitContact: false, cycle: -1, initialized: false, lift: 0 };
  };
  const arms = [-1, 1].map(side => makeLimb(side, true));
  const legs = [-1, 1].map(side => makeLimb(side, false));
  const limbs = [...legs, ...arms];
  const tail: Three.Group[] = [];
  let tailParent: Three.Object3D = pelvis;
  for (let i = 0; i < 8; i++) {
    const joint = pivot(tailParent, `monkey-tail-${i}`);
    joint.position.set(i === 0 ? 0.34 : 0, i === 0 ? 0.09 : 0, i === 0 ? 0.27 : 0.35);
    const segment = new THREE.Mesh(link, fur);
    const radius = 0.11 - i * 0.007;
    segment.scale.set(radius, 0.38, radius); segment.rotation.x = Math.PI / 2; segment.position.z = 0.175;
    joint.add(segment); tail.push(joint); tailParent = joint;
  }
  const carriedTrap = makeCarriedTrap(); carriedTrap.name = "monkey-carried-trap";
  root.add(carriedTrap); // A visual prop only: never inserted into the live trap collection.
  let travelled = 0, lastX = Number.NaN, lastZ = 0, lastTime = 0, heading = 0;
  let movement = 0;
  const solve = (limb: typeof arms[number], bendZ: number) => {
    axis.subVectors(limb.target, limb.start);
    const distance = clamp(axis.length(), 0.025, limb.upperLength + limb.lowerLength - 0.002);
    axis.normalize();
    limb.target.copy(limb.start).addScaledVector(axis, distance);
    const along = (limb.upperLength ** 2 - limb.lowerLength ** 2 + distance ** 2) / (2 * distance);
    const across = Math.sqrt(Math.max(0, limb.upperLength ** 2 - along ** 2));
    pole.set(limb.side * (limb.arm ? 0.32 : 0.12), 0, bendZ);
    pole.addScaledVector(axis, -pole.dot(axis)).normalize();
    limb.middle.copy(limb.start).addScaledVector(axis, along).addScaledVector(pole, across);
    limb.base.position.copy(limb.start);
    upperQ.setFromUnitVectors(down, scratch.subVectors(limb.middle, limb.start).normalize());
    lowerQ.setFromUnitVectors(down, scratch.subVectors(limb.target, limb.middle).normalize());
    limb.upper.quaternion.copy(upperQ);
    limb.lower.quaternion.copy(upperQ).invert().multiply(lowerQ);
    // Independent wrist/ankle keeps the palm flat at contact, then rolls through toe-off.
    limb.end.quaternion.copy(lowerQ).invert();
    limb.palm.rotation.set(limb.contact ? 0 : -limb.lift * (limb.arm ? 0.45 : 0.65), 0, 0);
  };
  const toWorldContact = (limb: typeof arms[number], stepOffset: number, travelHeading: number, target: Three.Vector3, slopeX: number, slopeZ: number) => {
    target.set(limb.side * 0.31, 0.11, 0.10).applyMatrix4(root.matrixWorld);
    // Predict contact in the direction of actual movement, even while looking at the trap.
    target.x -= Math.sin(travelHeading) * stepOffset * worldScale.x;
    target.z -= Math.cos(travelHeading) * stepOffset * worldScale.x;
    target.y = worldPosition.y + 0.11 * worldScale.y + (target.x - worldPosition.x) * slopeX + (target.z - worldPosition.z) * slopeZ;
  };
  const update = (now: number, nextTrapAt: number, lastPlacedAt: number, placement: Pick<CoursePose, "x" | "y" | "z">) => {
    root.getWorldPosition(worldPosition); root.getWorldScale(worldScale);
    const initial = !Number.isFinite(lastX);
    const dx = initial ? 0 : worldPosition.x - lastX, dz = initial ? 0 : worldPosition.z - lastZ;
    const distance = Math.hypot(dx, dz);
    const dt = initial ? 0 : clamp((now - lastTime) / 1000, 0, 0.1);
    const teleported = distance > 2.5 || now < lastTime;
    const moving = distance > 0.00001 && !teleported;
    if (moving) travelled += distance / Math.max(0.001, worldScale.x);
    movement = moving ? 1 : movement * Math.max(0, 1 - dt * 10);
    const pose = monkeyTrapPose(now, nextTrapAt, lastPlacedAt);
    const walkingHeading = moving ? Math.atan2(-dx, -dz) : heading;
    const placementDistance = Math.hypot(worldPosition.x - placement.x, worldPosition.z - placement.z);
    const placingHeading = placementDistance > 0.15 ? Math.atan2(worldPosition.x - placement.x, worldPosition.z - placement.z) : walkingHeading;
    const turning = Math.atan2(Math.sin(placingHeading - walkingHeading), Math.cos(placingHeading - walkingHeading));
    const desiredHeading = walkingHeading + turning * pose.reach;
    const delta = Math.atan2(Math.sin(desiredHeading - heading), Math.cos(desiredHeading - heading));
    heading = initial || teleported ? desiredHeading : heading + clamp(delta, -dt * 7, dt * 7);
    root.rotation.set(0, heading, 0); root.updateMatrixWorld(true);
    inverseRoot.copy(root.matrixWorld).invert();
    drop.set(placement.x, placement.y + 0.03, placement.z).applyMatrix4(inverseRoot);
    const slopeDenominator = Math.max(0.1, placementDistance ** 2);
    const roadDelta = worldPosition.y - (placement.y + 0.03);
    const slopeX = clamp(roadDelta * (worldPosition.x - placement.x) / slopeDenominator, -0.65, 0.65);
    const slopeZ = clamp(roadDelta * (worldPosition.z - placement.z) / slopeDenominator, -0.65, 0.65);
    const phase = travelled / 1.1;
    const carry = pose.carryAmount;
    const crouch = pose.reach;
    // Cute bipedal gait: feet support the body; empty arms swing, occupied arms carry.
    const sway = Math.sin(phase * TAU) * 0.045 * movement * (1 - crouch);
    pelvis.position.set(sway, 0.97 - crouch * 0.22 + Math.cos(phase * TAU * 2) * 0.012 * movement * (1 - crouch), 0.10);
    pelvis.rotation.set(0, -sway * 0.65, sway * 0.75);
    lumbar.position.set(0, 0.11, -0.10 - crouch * 0.18);
    lumbar.rotation.set(0, sway * 0.6, -sway * 0.5);
    thorax.position.set(0, 0.22 - crouch * 0.34, -0.10);
    thorax.rotation.set(0, sway * 0.2, -sway * 0.7);
    bodyMesh.scale.y = 0.72 * 1.18 - crouch * 0.35;
    bodyMesh.position.y = -0.25 + crouch * 0.05;
    neck.position.set(0, 0.58, 0.02);
    neck.rotation.set(crouch * 0.20, -sway * 0.6, -sway * 0.3);
    head.position.set(0, 0.15, -0.035);
    head.rotation.x = -crouch * 0.08;
    root.updateMatrixWorld(true);
    const fullTrapScale = 1 / Math.max(0.001, worldScale.x);
    carriedTrap.scale.setScalar(fullTrapScale);
    carriedTrap.visible = pose.carrying;
    carriedTrap.position.set(0, 0.81 - crouch * 0.12, -0.74);
    carriedTrap.position.lerp(drop, crouch);
    carriedTrap.rotation.set(0, 0, 0);
    for (const limb of limbs) {
      const body = limb.arm ? thorax : pelvis;
      bodyPoint.set(limb.side * (limb.arm ? 0.52 : 0.27), limb.arm ? -0.02 : -0.055, 0);
      limb.start.copy(bodyPoint.applyMatrix4(body.matrixWorld).applyMatrix4(inverseRoot));
      if (limb.arm) {
        const swing = Math.sin(phase * TAU + (limb.side > 0 ? Math.PI : 0)) * movement * (1 - crouch);
        limb.target.set(limb.side * 0.72, 0.63 + Math.max(0, swing) * 0.09, -0.08 + swing * 0.25);
        scratch.copy(carriedTrap.position).add(bodyPoint.set(limb.side * 0.87 * fullTrapScale, 0.16 * fullTrapScale, 0));
        limb.target.lerp(scratch, carry);
        limb.contact = false; limb.lift = 0;
        solve(limb, 1);
        const grip = carry * 0.85;
        limb.palm.rotation.set(0.18 * carry, 0, -limb.side * 1.10 * carry);
        for (let i = 0; i < limb.fingers.length; i++) {
          limb.fingers[i].base.rotation.x = grip * (i === 0 ? -0.62 : -0.88);
          limb.fingers[i].tip.rotation.x = -grip * 1.05;
        }
        continue;
      }
      const offset = limb.side < 0 ? 0 : 0.5;
      const absolutePhase = phase + offset;
      const cycle = Math.floor(absolutePhase), t = absolutePhase - cycle;
      const duty = 0.68;
      const stance = t < duty;
      const stride = 1.10;
      if (initial || teleported || !limb.initialized) {
        toWorldContact(limb, stride * (duty * 0.5 - t), walkingHeading, limb.anchor, slopeX, slopeZ);
        limb.swingStart.copy(limb.anchor); limb.swingEnd.copy(limb.anchor);
        limb.cycle = cycle; limb.gaitContact = stance; limb.initialized = true;
      }
      if (stance) {
        if (!limb.gaitContact || cycle !== limb.cycle) limb.anchor.copy(limb.swingEnd);
        limb.target.copy(limb.anchor).applyMatrix4(inverseRoot);
        limb.lift = 0;
      } else {
        if (limb.gaitContact || cycle !== limb.cycle) {
          limb.swingStart.copy(limb.anchor);
          toWorldContact(limb, stride * (duty * 0.5 + 1 - duty), walkingHeading, limb.swingEnd, slopeX, slopeZ);
        }
        const u = (t - duty) / (1 - duty), eased = u * u * (3 - 2 * u);
        limb.target.copy(limb.swingStart).lerp(limb.swingEnd, eased);
        limb.lift = Math.sin(Math.PI * u);
        limb.target.y += limb.lift * 0.15 * worldScale.y;
        limb.target.applyMatrix4(inverseRoot);
      }
      limb.contact = stance; limb.gaitContact = stance; limb.cycle = cycle;
      solve(limb, -1);
      for (let i = 0; i < limb.fingers.length; i++) {
        limb.fingers[i].base.rotation.x = -limb.lift * 0.20;
        limb.fingers[i].tip.rotation.x = -limb.lift * 0.20;
      }
    }
    for (let i = 0; i < tail.length; i++) {
      tail[i].rotation.set(0.02 + Math.sin(phase * TAU - i * 0.48) * 0.035 * movement,
        (i === 0 ? 0.15 : 0.58) + Math.sin(phase * TAU - i * 0.39) * 0.045 * movement, sway * -0.35);
    }
    // Keep stance paws planted at the reach limit: bend/lower the body, not the foot.
    // This only deforms the visual skeleton and never moves the gameplay hazard root.
    let supportDrop = 0;
    for (const leg of legs) {
      if (!leg.contact) continue;
      scratch.copy(leg.anchor).applyMatrix4(inverseRoot);
      const horizontal = (leg.start.x - scratch.x) ** 2 + (leg.start.z - scratch.z) ** 2;
      const reach = leg.upperLength + leg.lowerLength - 0.006;
      supportDrop = Math.max(supportDrop, leg.start.y - scratch.y - Math.sqrt(Math.max(0, reach ** 2 - horizontal)));
    }
    if (supportDrop > 0) {
      pelvis.position.y -= Math.min(0.20, supportDrop + 0.002);
      root.updateMatrixWorld(true);
      for (const limb of limbs) {
        bodyPoint.set(limb.side * (limb.arm ? 0.52 : 0.27), limb.arm ? -0.02 : -0.055, 0);
        limb.start.copy(bodyPoint.applyMatrix4((limb.arm ? thorax : pelvis).matrixWorld).applyMatrix4(inverseRoot));
        if (limb.contact) limb.target.copy(limb.anchor).applyMatrix4(inverseRoot);
        solve(limb, limb.arm ? 1 : -1);
        if (limb.arm) limb.palm.rotation.set(0.18 * carry, 0, -limb.side * 1.10 * carry);
      }
    }
    lastX = worldPosition.x; lastZ = worldPosition.z; lastTime = now;
  };
  update(0, 1e12, 0, { x: 0, y: -0.03, z: 1.4 });
  lastX = Number.NaN;
  root.traverse(object => { if (object instanceof THREE.Mesh) object.castShadow = true; });
  return { root, update, carriedTrap, pelvis, thorax, arms, legs };
}

function makeKartHoodGeometry(THREE: ThreeModule) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    -0.96, 0.34, -0.28,
    0.96, 0.34, -0.28,
    -0.96, 1.08, -0.28,
    0.96, 1.08, -0.28,
    -0.62, 0.32, 2.24,
    0.62, 0.32, 2.24,
    -0.62, 0.58, 2.24,
    0.62, 0.58, 2.24,
  ], 3));
  geometry.setIndex([
    0, 1, 5, 0, 5, 4,
    2, 6, 7, 2, 7, 3,
    0, 4, 6, 0, 6, 2,
    1, 3, 7, 1, 7, 5,
    0, 2, 3, 0, 3, 1,
    4, 5, 7, 4, 7, 6,
  ]);
  geometry.computeVertexNormals();
  return geometry;
}

export function createKart(THREE: ThreeModule, color: number, accent: number, player = false, animal: DriverAnimal = "otter") {
  const kart = new THREE.Group();
  const visualRoot = new THREE.Group();
  kart.add(visualRoot);
  kart.userData.visualRoot = visualRoot;
  const bodyRoot = new THREE.Group();
  bodyRoot.position.y = 0.1;
  visualRoot.add(bodyRoot);
  const bodyShade = new THREE.Color(color).multiplyScalar(0.68);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x16191c, roughness: 0.91, metalness: 0 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xc7d0d7, roughness: 0.24, metalness: 0.9 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x222b32, roughness: 0.42, metalness: 0.72 });
  const bodyMat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.27, metalness: 0.32, clearcoat: 1, clearcoatRoughness: 0.15 });
  const bodyShadeMat = new THREE.MeshPhysicalMaterial({ color: bodyShade, roughness: 0.34, metalness: 0.32, clearcoat: 0.8 });
  const accentMat = new THREE.MeshPhysicalMaterial({ color: accent, roughness: 0.24, metalness: 0.4, clearcoat: 1 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2c3, emissive: 0xffe1a1, emissiveIntensity: 0.9, roughness: 0.18 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xb21324, emissive: 0xff203c, emissiveIntensity: 0.65 });
  [bodyMat, bodyShadeMat, accentMat].forEach((material) => markGeneratedSurface(material, "paint"));
  [metal, darkMetal].forEach((material) => markGeneratedSurface(material, "metal"));
  markGeneratedSurface(tireMat, "rubber", "uv");
  const seatMat = markGeneratedSurface(new THREE.MeshStandardMaterial({ color: 0x222b32, roughness: 0.84 }), "fabric");

  const addPart = (geometry: Three.BufferGeometry, material: Three.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    bodyRoot.add(mesh);
    return mesh;
  };

  addPart(new THREE.BoxGeometry(2.14, 0.28, 3.68), bodyShadeMat, 0, 0.42, 0.02);
  addPart(makeKartHoodGeometry(THREE), bodyMat, 0, 0, 0);
  addPart(new THREE.BoxGeometry(2.16, 0.44, 0.86), bodyMat, 0, 0.66, -1.46);
  [-1, 1].forEach((side) => {
    const sill = addPart(new THREE.BoxGeometry(0.34, 0.34, 2.18), bodyShadeMat, side * 0.99, 0.58, -0.26);
    sill.rotation.z = side * -0.035;
  });

  const seat = addPart(new THREE.BoxGeometry(0.98, 0.88, 0.58), seatMat, 0, 1.12, -0.69);
  seat.rotation.x = -0.12;
  const driver = createAnimalDriver(THREE, animal, color);
  bodyRoot.add(driver);
  kart.userData.driver = driver;

  const steering = new THREE.Group();
  steering.position.set(0, 1.08, 0.48);
  steering.rotation.x = -0.34;
  bodyRoot.add(steering);
  const steeringRing = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.045, 8, 20), darkMetal);
  steeringRing.castShadow = true;
  steering.add(steeringRing);
  const steeringHub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 10), metal);
  steeringHub.rotation.x = Math.PI / 2;
  steering.add(steeringHub);
  [-1.05, 0, 1.05].forEach((angle) => {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.25, 0.035), metal);
    spoke.position.set(Math.sin(angle) * 0.12, Math.cos(angle) * 0.12, 0);
    spoke.rotation.z = -angle;
    spoke.castShadow = true;
    steering.add(spoke);
  });

  const frontBumper = addPart(new THREE.BoxGeometry(2.48, 0.16, 0.25), metal, 0, 0.3, 2.48);
  frontBumper.rotation.x = -0.025;
  [-0.78, 0.78].forEach((x) => addPart(new THREE.BoxGeometry(0.12, 0.12, 0.44), darkMetal, x, 0.34, 2.25));

  const wheelRadius = 0.6;
  const wheelCenterY = 0.63;
  const wheelGeometry = new THREE.CylinderGeometry(wheelRadius - 0.015, wheelRadius - 0.015, 0.36, 32, 1);
  const wheelPivots: Three.Group[] = [];
  [-1.31, 1.43].forEach((z) => {
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 2.62, 10), darkMetal);
    axle.position.set(0, wheelCenterY, z);
    axle.rotation.z = Math.PI / 2;
    axle.castShadow = true;
    visualRoot.add(axle);
  });
  [[-1.3, 1.43], [1.3, 1.43], [-1.3, -1.31], [1.3, -1.31]].forEach(([x, z]) => {
    const wheelPivot = new THREE.Group();
    wheelPivot.position.set(x, wheelCenterY, z);
    visualRoot.add(wheelPivot);
    const tire = new THREE.Mesh(wheelGeometry, tireMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    tire.receiveShadow = true;
    wheelPivot.add(tire);
    [-0.17, 0.17].forEach((sidewall) => {
      const shoulder = new THREE.Mesh(new THREE.TorusGeometry(0.49, 0.11, 10, 32), tireMat);
      shoulder.rotation.y = Math.PI / 2; shoulder.position.x = sidewall;
      shoulder.castShadow = true; wheelPivot.add(shoulder);
    });
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.5, 24, 1), darkMetal);
    rim.rotation.z = Math.PI / 2;
    rim.castShadow = true;
    wheelPivot.add(rim);
    const wheelFace = x > 0 ? 0.262 : -0.262;
    const rimLip = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.025, 8, 24), metal);
    rimLip.rotation.y = Math.PI / 2; rimLip.position.x = wheelFace;
    wheelPivot.add(rimLip);
    const spokeMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.22, 0.048), metal, 5);
    const spokePose = new THREE.Object3D();
    for (let spokeIndex = 0; spokeIndex < 5; spokeIndex++) {
      const angle = spokeIndex * TAU / 5;
      spokePose.position.set(wheelFace, Math.sin(angle) * 0.17, Math.cos(angle) * 0.17);
      spokePose.rotation.x = Math.PI / 2 - angle;
      spokePose.updateMatrix(); spokeMesh.setMatrixAt(spokeIndex, spokePose.matrix);
    }
    wheelPivot.add(spokeMesh);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.52, 10), accentMat);
    hub.rotation.z = Math.PI / 2;
    hub.castShadow = true;
    wheelPivot.add(hub);
    wheelPivots.push(wheelPivot);
  });
  kart.userData.wheels = wheelPivots;
  kart.userData.wheelRadius = wheelRadius;

  [-0.52, 0.52].forEach((x) => {
    addPart(new THREE.BoxGeometry(0.3, 0.2, 0.12), darkMetal, x, 0.54, 2.37);
    addPart(new THREE.DodecahedronGeometry(0.11, 0), lampMat, x, 0.56, 2.45).scale.set(1.18, 0.8, 0.56);
    addPart(new THREE.BoxGeometry(0.3, 0.13, 0.08), tailMat, x, 0.74, -1.9);
  });

  // Sculpted side pods, twin exhausts and a rear aerofoil give the kart a
  // readable mechanical silhouette without moving its wheels/contact points.
  const podShape = new THREE.Shape();
  podShape.moveTo(-0.16, -0.75); podShape.quadraticCurveTo(-0.3, -0.75, -0.3, -0.5);
  podShape.lineTo(-0.3, 0.7); podShape.quadraticCurveTo(0, 0.98, 0.25, 0.62);
  podShape.lineTo(0.25, -0.58); podShape.quadraticCurveTo(0.22, -0.75, -0.16, -0.75);
  const podGeometry = new THREE.ExtrudeGeometry(podShape, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 3, steps: 1, curveSegments: 8 });
  [-1, 1].forEach((side) => {
    const pod = addPart(podGeometry, bodyMat, side * 0.99, 0.56, -0.26);
    pod.rotation.x = Math.PI / 2;
    addPart(new THREE.BoxGeometry(0.08, 0.12, 0.85), accentMat, side * 1.28, 0.54, -0.15);
    const exhaust = addPart(new THREE.CylinderGeometry(0.16, 0.19, 0.46, 16, 1, true), metal, side * 0.68, 0.52, -1.99);
    exhaust.rotation.x = Math.PI / 2;
    const throat = addPart(new THREE.CircleGeometry(0.125, 16), darkMetal, side * 0.68, 0.52, -2.225);
    throat.rotation.y = Math.PI;
    addPart(new THREE.BoxGeometry(0.09, 0.47, 0.12), darkMetal, side * 0.72, 1.06, -1.71);
    const wingEnd = addPart(new THREE.BoxGeometry(0.06, 0.31, 0.48), accentMat, side * 1.16, 1.36, -1.73);
    wingEnd.rotation.x = -0.1;
  });
  const wing = addPart(new THREE.BoxGeometry(2.3, 0.095, 0.5), bodyMat, 0, 1.3, -1.73);
  wing.rotation.x = -0.11;
  addPart(new THREE.BoxGeometry(0.12, 0.035, 1.3), accentMat, 0, 0.84, 1.35);

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

function rotateKartWheels(kart: Three.Group, forwardSpeed: number, dt: number) {
  const wheels = kart.userData.wheels as Three.Group[] | undefined;
  const radius = (kart.userData.wheelRadius as number | undefined) ?? 0.6;
  if (!wheels?.length || !Number.isFinite(forwardSpeed) || dt <= 0) return;
  const rotationDelta = (forwardSpeed * dt) / radius;
  wheels.forEach((wheel) => { wheel.rotation.x += rotationDelta; });
}

function addBarrier(THREE: ThreeModule, scene: Three.Scene, course: RaceCourse, lane: number, height: number, color = 0xb7c0c5) {
  const railMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.82 });
  markGeneratedSurface(railMat, color === 0x5c351f || color === 0x765533 ? "wood" : "metal");
  const segments = LOW_POLY_VISUAL_DETAIL.barrierSegments;
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

type EvolutionVisualSet = {
  groups: Three.Group[];
  cloudPatches: Three.Group[];
  activeLocalStage: number;
};

function addEvolutionArtifacts(
  THREE: ThreeModule,
  scene: Three.Scene,
  course: RaceCourse,
  chapterIndex: number,
): EvolutionVisualSet {
  const groups = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
  groups.forEach((group, index) => {
    group.name = `evolution-stage-${index}`;
    group.visible = index === 0;
    scene.add(group);
  });

  const addPlateTrack = (
    group: Three.Group,
    color: number,
    options: { yOffset?: number; opacity?: number; verticalEvery?: number; width?: number; gaps?: boolean; alternatingHeight?: boolean } = {},
  ) => {
    const count = 84;
    const length = course.length / count + 1.9;
    const width = options.width ?? COURSE_WIDTH * 2.03;
    const geometry = new THREE.BoxGeometry(width, 0.2, length);
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.05,
      roughness: 0.82,
      transparent: (options.opacity ?? 1) < 1,
      opacity: options.opacity ?? 1,
      depthWrite: (options.opacity ?? 1) >= 0.85,
      side: THREE.DoubleSide,
    });
    const plates = new THREE.InstancedMesh(geometry, material, count);
    const dummy = new THREE.Object3D();
    for (let index = 0; index < count; index += 1) {
      const pose = course.pointAt((index + 0.5) / count);
      const gap = options.gaps && index % 13 === 7;
      const alternatingHeight = options.alternatingHeight ? (index % 3 - 1) * 0.16 : 0;
      dummy.position.set(pose.x, pose.y + 0.18 + (options.yOffset ?? 0) + alternatingHeight, pose.z);
      dummy.rotation.set(0, pose.heading, 0);
      dummy.scale.set(gap ? 0.08 : 1, gap ? 0.08 : 1, gap ? 0.08 : 1);
      dummy.updateMatrix();
      plates.setMatrixAt(index, dummy.matrix);
    }
    plates.instanceMatrix.needsUpdate = true;
    plates.castShadow = false;
    plates.receiveShadow = false;
    plates.renderOrder = 4;
    group.add(plates);

    if (options.verticalEvery) {
      const verticalCount = Math.ceil(count / options.verticalEvery);
      const verticalGeometry = new THREE.BoxGeometry(width, 0.2, Math.min(length * 1.7, 13));
      const verticalMaterial = material.clone();
      verticalMaterial.opacity = Math.min(0.82, options.opacity ?? 0.82);
      verticalMaterial.transparent = true;
      verticalMaterial.depthWrite = false;
      const fins = new THREE.InstancedMesh(verticalGeometry, verticalMaterial, verticalCount);
      for (let index = 0; index < verticalCount; index += 1) {
        const pose = course.pointAt(((index * options.verticalEvery) + 0.5) / count);
        dummy.position.set(pose.x, pose.y + 4.8 + (options.yOffset ?? 0), pose.z);
        dummy.rotation.set(Math.PI / 2, pose.heading, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        fins.setMatrixAt(index, dummy.matrix);
      }
      fins.instanceMatrix.needsUpdate = true;
      fins.renderOrder = 5;
      group.add(fins);
    }
  };

  if (chapterIndex === 0) {
    addPlateTrack(groups[0], 0x30363d, { gaps: true, alternatingHeight: true });
    addPlateTrack(groups[1], 0x42494f, { alternatingHeight: true });
  } else if (chapterIndex === 1) {
    addPlateTrack(groups[0], 0x30373a, { yOffset: 4.25, gaps: true });
    addPlateTrack(groups[0], 0x697176, { yOffset: -0.3, alternatingHeight: true });
    addPlateTrack(groups[1], 0x565d61, { alternatingHeight: true, verticalEvery: 11 });
  } else if (chapterIndex === 2) {
    addPlateTrack(groups[0], 0x23b9d5, { opacity: 0.7, gaps: true, width: COURSE_WIDTH * 1.45 });
    addPlateTrack(groups[1], 0x18bcd5, { opacity: 0.58, verticalEvery: 7, width: COURSE_WIDTH * 1.55 });
  } else {
    addPlateTrack(groups[0], 0xffffff, { opacity: 0.98, gaps: true, width: COURSE_WIDTH * 2.08 });
    addPlateTrack(groups[1], 0xf5fbff, { opacity: 0.92, verticalEvery: 6, width: COURSE_WIDTH * 2.08 });
  }

  return {
    groups,
    cloudPatches: (scene.userData.cloudPatches ?? []) as Three.Group[],
    activeLocalStage: -1,
  };
}

function showEvolutionStage(visuals: EvolutionVisualSet, localStage: number) {
  if (visuals.activeLocalStage === localStage) return;
  visuals.activeLocalStage = localStage;
  visuals.groups.forEach((group, index) => { group.visible = index === localStage; });
  visuals.cloudPatches.forEach((patch) => { patch.visible = localStage === 2; });
}

function addWorld(THREE: ThreeModule, scene: Three.Scene, course: RaceCourse, definition: CourseDefinition) {
  const visualTheme = definition.id === "custom" ? definition.theme ?? "city" : definition.id;
  const jungle = visualTheme === "jungle";
  const starlightScenery = visualTheme === "starlight";
  const cloudScenery = visualTheme === "cloud";
  const starlight = definition.id === "starlight";
  const river = visualTheme === "river";
  const cloud = definition.id === "cloud";
  const pirate = visualTheme === "pirate";
  let starlightRoadMaterial: Three.MeshStandardMaterial | undefined;
  let starlightRoadMesh: Three.Mesh | undefined;
  const starlightPrismMaterials: Three.MeshStandardMaterial[] = [];
  let starlightLaneMaterial: Three.MeshStandardMaterial | undefined;
  let starlightCurbMaterials: Three.MeshStandardMaterial[] | undefined;
  let starlightStarField: Three.Points | undefined;
  let starlightStarMaterial: Three.PointsMaterial | undefined;
  let starlightMoon: Three.Mesh | undefined;
  let starlightMoonMaterial: Three.MeshStandardMaterial | undefined;
  let starlightMoonGlowMaterial: Three.MeshBasicMaterial | undefined;
  let starlightSunDisc: Three.Mesh | undefined;
  let starlightSunDiscMaterial: Three.MeshBasicMaterial | undefined;
  let starlightCrystalGroup: Three.Group | undefined;
  const starlightCrystalMaterials: Three.MeshStandardMaterial[] = [];
  const cloudSurfaceMaterials: Three.MeshStandardMaterial[] = [];
  let cloudPuffMaterial: Three.MeshStandardMaterial | undefined;
  let cloudStormClouds: Three.InstancedMesh | undefined;
  let cloudRain: Three.Points | undefined;
  let cloudRainPositions: Float32Array | undefined;
  let cloudHalo: Three.Group | undefined;
  let cloudHaloMaterials: Three.MeshBasicMaterial[] | undefined;
  let cloudIceCrystals: Three.Points | undefined;
  let cloudIcePositions: Float32Array | undefined;
  let pirateStormClouds: Three.InstancedMesh | undefined;
  let pirateRain: Three.Points | undefined;
  let pirateRainPositions: Float32Array | undefined;
  let pirateSailMaterial: Three.MeshStandardMaterial | undefined;
  let pirateFloodMaterial: Three.MeshPhysicalMaterial | undefined;
  const skyColor = starlightScenery ? 0x07112b : cloudScenery || pirate ? 0x69c8f4 : jungle || river ? 0x69a97a : 0x9bd5f2;
  scene.background = new THREE.Color(skyColor);
  scene.fog = new THREE.Fog(starlightScenery ? 0x07112b : cloudScenery || pirate ? 0x8ad7f6 : jungle || river ? 0x65966e : 0xb9def0, starlightScenery ? 250 : 190, starlightScenery ? 620 : 490);

  const oceanTime = { value: 0 };
  const groundMaterial = pirate
    ? new THREE.MeshPhysicalMaterial({ color: 0x087fba, emissive: 0x043b62, emissiveIntensity: 0.16, roughness: 0.14, metalness: 0.08, clearcoat: 0.82, clearcoatRoughness: 0.16 })
    : new THREE.MeshStandardMaterial({ color: cloudScenery ? 0x85cbed : starlightScenery ? 0x08142e : jungle || river ? 0x315f2f : 0x78976a, roughness: 0.98 });
  if (!pirate && !cloudScenery && !starlightScenery) {
    applyBackdropGroundDetail(groundMaterial, jungle || river);
    markGeneratedSurface(groundMaterial, "grass", "local");
  }
  if (pirate) markGeneratedSurface(groundMaterial, "water");
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
    new THREE.PlaneGeometry(1800, 1800, pirate ? 28 : 12, pirate ? 28 : 12),
    groundMaterial,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = WORLD_GROUND_Y;
  // Sky courses have empty air below them; this is not the physical road.
  ground.visible = !starlightScenery && !cloudScenery;
  ground.receiveShadow = true;
  scene.add(ground);
  // Scenery is deliberately separate from the road queries and landing geometry.
  const courseBackdrop = createCourseBackdrop(THREE, scene, course, visualTheme, WORLD_GROUND_Y);
  scene.userData.courseBackdrop = courseBackdrop.group;
  if (starlightScenery) courseBackdrop.group.userData.setNightStrength?.(starlight ? 0 : 1);

  if (definition.id === "custom" && starlightScenery) {
    const starPositions = new Float32Array(720 * 3);
    for (let index = 0; index < 720; index += 1) {
      const angle = (index * 2.399963229728653) % TAU;
      const radius = 180 + (index * 47) % 430;
      starPositions[index * 3] = Math.sin(angle) * radius;
      starPositions[index * 3 + 1] = 55 + (index * 73) % 250;
      starPositions[index * 3 + 2] = Math.cos(angle) * radius;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xe9f5ff, size: 1.35, sizeAttenuation: true }));
    scene.add(stars);
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(22, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xfff4c9 }),
    );
    moon.position.set(-145, 130, -225);
    scene.add(moon);
    const moonLight = new THREE.DirectionalLight(0xc8e1ff, 2.1);
    moonLight.position.copy(moon.position);
    scene.add(moonLight);
  }

  // Custom cloud courses use the same sparse sculpted backdrop, without a
  // second ninety-blob cloud layer superimposed on it.

  const concrete = new THREE.MeshStandardMaterial({ color: pirate ? 0x6f4325 : starlightScenery ? 0x7f8bad : jungle || river ? 0x9b825f : 0xc9c8bd, roughness: 0.88, metalness: 0.02 });
  markGeneratedSurface(concrete, pirate ? "wood" : "stone", "world");
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
    markGeneratedSurface(starlightRoadMaterial, "asphalt", "world");
    const baseRoad = new THREE.Mesh(
      makeCourseStripGeometry(THREE, course, COURSE_WIDTH, -COURSE_WIDTH, 0.05),
      starlightRoadMaterial,
    );
    baseRoad.receiveShadow = true;
    starlightRoadMaterial.userData.roadSurface = true;
    starlightRoadMesh = baseRoad;
    scene.add(baseRoad);
    const prismMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x233a68,
      emissiveIntensity: 0,
      roughness: 0.24,
      metalness: 0.72,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    prismMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = `varying vec3 vPrismWorldPosition;\n${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvPrismWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );
      shader.fragmentShader = `varying vec3 vPrismWorldPosition;\n${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <normal_fragment_begin>",
        `#include <normal_fragment_begin>
        float prismIncidence = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
        float prismFresnel = pow(1.0 - prismIncidence, 1.35);
        float prismPhase = fract((1.0 - prismIncidence) * 0.82 + dot(vPrismWorldPosition.xz, vec2(0.0055, -0.0038)));
        vec3 prismWave = abs(fract(prismPhase + vec3(0.0, 0.6666667, 0.3333333)) * 6.0 - 3.0);
        vec3 prismColor = clamp(prismWave - 1.0, 0.0, 1.0);
        prismColor = mix(prismColor, vec3(1.0), 0.08 + prismFresnel * 0.16);
        diffuseColor.rgb = mix(diffuseColor.rgb, prismColor, 0.9);
        diffuseColor.rgb *= 1.03 + prismFresnel * 0.32;`,
      );
    };
    prismMaterial.customProgramCacheKey = () => "starlight-camera-prism-v1";
    markGeneratedSurface(prismMaterial, "ice", "world");
    starlightPrismMaterials.push(prismMaterial);
    const prismRoad = new THREE.Mesh(
      makeCourseStripGeometry(THREE, course, COURSE_WIDTH, -COURSE_WIDTH, 0.085),
      prismMaterial,
    );
    prismRoad.receiveShadow = true;
    prismRoad.renderOrder = 2;
    scene.add(prismRoad);
  } else if (cloud) {
    const cloudPatches: Three.Group[] = [];
    const warningBeamAuraGeometry = new THREE.CylinderGeometry(1.15, 2.8, 80, 10, 1, true);
    const warningBeamCoreGeometry = new THREE.CylinderGeometry(0.22, 0.68, 80, 8);
    const warningImpactGeometry = new THREE.TorusGeometry(3.15, 0.24, 8, 24);
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
        const surfaceMaterial = createCloudRoadMaterial(THREE);
        cloudPuffMaterial ??= surfaceMaterial;
        cloudSurfaceMaterials.push(surfaceMaterial);
        const surface = new THREE.Mesh(
          createCloudRoadPatchGeometry(THREE, course, { startU, endU, side, halfWidth: COURSE_WIDTH, origin }),
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
          makeCourseSegmentGeometry(THREE, course, startU, endU, leftLane, rightLane, 1.9, origin, 12),
          warningMaterial,
        );
        warningSurface.visible = false;
        patch.add(warningSurface);
        const warningStripes = new THREE.Group();
        for (let stripeIndex = 0; stripeIndex < 6; stripeIndex += 1) {
          const stripeStart = startU + (endU - startU) * (stripeIndex / 6);
          const stripeEnd = startU + (endU - startU) * ((stripeIndex + 0.48) / 6);
          const stripe = new THREE.Mesh(
            makeCourseSegmentGeometry(THREE, course, stripeStart, stripeEnd, leftLane, rightLane, 1.96, origin, 3),
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
            new THREE.TorusGeometry(1.45, 0.22, 8, 24),
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
          impact.position.y = 1.55 + ringIndex * 0.12;
          impact.rotation.x = Math.PI / 2;
          impact.scale.setScalar(ringScale);
          beamImpacts.add(impact);
        });
        beamImpacts.visible = false;
        warningBeam.add(beamImpacts);
        scene.add(warningBeam);
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
          surfaceMaterial.userData.roadSurface = true;
          markGeneratedSurface(surfaceMaterial, jungle ? "earth" : "asphalt", "world");
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
      road.material.userData.roadSurface = true;
      markGeneratedSurface(road.material, pirate ? "wood" : jungle || river ? "earth" : "asphalt", "world");
      scene.add(road);
    }

    if (river) {
      const waterUniforms: Array<{ value: number }> = [];
      const waterMaterials: Three.MeshPhysicalMaterial[] = [];
      const waterMeshes: Three.Mesh[] = [];
      const riverFoamTexture = makeRiverFoamTexture(THREE);
      scene.userData.riverFoamTexture = riverFoamTexture;
      const riverBedMaterial = makeRiverBedMaterial(THREE);
      markGeneratedSurface(riverBedMaterial, "earth", "uv", [5, 3]);
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
        finishRiverSurface(THREE, waterMaterial, flowTime, {
          length: (channel.end - channel.start) * course.length,
          width: channel.halfWidth * 2,
          fadeEnds: true,
        });
        waterMaterials.push(waterMaterial);
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
            72,
          ),
          waterMaterial,
        );
        water.renderOrder = 2;
        scene.add(water);
        waterMeshes.push(water);
        const riverBed = new THREE.Mesh(water.geometry.clone(), riverBedMaterial);
        riverBed.position.y = -0.39;
        riverBed.receiveShadow = true;
        scene.add(riverBed);
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
        map: riverFoamTexture,
        color: 0xc4d7c7,
        size: 0.48,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }));
      flowPoints.renderOrder = 3;
      scene.add(flowPoints);

      const gate = new THREE.Group();
      const gatePose = course.pointAt(0.472, 29);
      gate.position.set(gatePose.x, gatePose.y, gatePose.z);
      gate.rotation.y = gatePose.heading;
      const damFlowX = -gatePose.nx;
      const damFlowZ = -gatePose.nz;
      const findDamCrossings = (flowX: number, flowZ: number, fallbackProgress?: number) => {
        const candidates: Array<{ progress: number; distance: number; along: number; roadY: number }> = [];
        const sampleCount = 720;
        for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
          const progress = sampleIndex / sampleCount;
          const point = course.pointAt(progress, 0);
          const deltaX = point.x - gatePose.x;
          const deltaZ = point.z - gatePose.z;
          candidates.push({
            progress,
            distance: Math.abs(deltaX * -flowZ + deltaZ * flowX),
            along: deltaX * flowX + deltaZ * flowZ,
            roadY: point.y,
          });
        }
        const found: Array<{ progress: number; along: number; roadY: number }> = [];
        candidates.forEach((candidate, index) => {
          const previous = candidates[(index - 1 + candidates.length) % candidates.length];
          const next = candidates[(index + 1) % candidates.length];
          const localMinimum = candidate.distance <= previous.distance && candidate.distance <= next.distance;
          const inSpillPath = candidate.along >= 12 && candidate.along <= 172 && candidate.distance < 10.5;
          const separated = found.every((crossing) => Math.abs(progressDelta(candidate.progress, crossing.progress)) > 0.035);
          if (localMinimum && inSpillPath && separated && candidate.progress > 0.02 && candidate.progress < 0.98) {
            found.push({ progress: candidate.progress, along: candidate.along, roadY: candidate.roadY });
          }
        });
        if (fallbackProgress !== undefined && !found.some((crossing) => Math.abs(progressDelta(crossing.progress, fallbackProgress)) < 0.025)) {
          const point = course.pointAt(fallbackProgress);
          const deltaX = point.x - gatePose.x;
          const deltaZ = point.z - gatePose.z;
          found.push({ progress: fallbackProgress, along: deltaX * flowX + deltaZ * flowZ, roadY: point.y });
        }
        return found.sort((a, b) => a.along - b.along);
      };
      const secondaryFlowAngle = -0.3;
      const secondaryFlowX = damFlowX * Math.cos(secondaryFlowAngle) + damFlowZ * Math.sin(secondaryFlowAngle);
      const secondaryFlowZ = -damFlowX * Math.sin(secondaryFlowAngle) + damFlowZ * Math.cos(secondaryFlowAngle);
      const gateStone = new THREE.MeshStandardMaterial({ color: 0x66725b, roughness: 0.94, metalness: 0.03 });
      const gateMoss = new THREE.MeshStandardMaterial({ color: 0x315f35, roughness: 1 });
      markGeneratedSurface(gateStone, "stone");
      markGeneratedSurface(gateMoss, "grass");
      const gateGlyph = new THREE.MeshStandardMaterial({ color: 0x67e6d2, emissive: 0x0f6d62, emissiveIntensity: 0.42, roughness: 0.46 });
      [-25.5, -8.5, 8.5, 25.5].forEach((z, pierIndex) => {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(5.6, 12.5, 6.4), gateStone);
        pier.position.set(0, 5.9, z);
        pier.rotation.z = pierIndex % 2 ? -0.025 : 0.025;
        gate.add(pier);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(6.8, 1.15, 7.5), gateMoss);
        cap.position.set(0, 12.15, z);
        gate.add(cap);
      });
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.8, 2.2, 58), gateStone);
      lintel.position.set(0, 12.05, 0);
      gate.add(lintel);
      const rune = new THREE.Mesh(new THREE.TorusGeometry(1.65, 0.25, 6, 18), gateGlyph);
      rune.position.set(-3.05, 9.1, 0);
      rune.rotation.y = Math.PI / 2;
      gate.add(rune);
      const gatePanels: Three.Mesh[] = [];
      [-17, 0, 17].forEach((z, panelIndex) => {
        const panel = new THREE.Mesh(
          new THREE.BoxGeometry(0.82, 6.2, 10.4),
          new THREE.MeshStandardMaterial({ color: panelIndex % 2 ? 0x4d5c4e : 0x596b58, roughness: 0.72, metalness: 0.25 }),
        );
        panel.position.set(-3.05, 4.75, z);
        panel.userData.closedY = panel.position.y;
        gate.add(panel);
        gatePanels.push(panel);
      });

      const reservoirMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x177fa6,
        emissive: 0x063f5a,
        emissiveIntensity: 0.2,
        roughness: 0.12,
        transparent: true,
        opacity: 0.82,
        clearcoat: 0.82,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const reservoirClock = { value: 0 };
      waterUniforms.push(reservoirClock);
      finishRiverSurface(THREE, reservoirMaterial, reservoirClock, { length: 48, width: 68, direction: -0.18, rapids: 0.04 });
      const reservoir = new THREE.Mesh(new THREE.PlaneGeometry(48, 68, 8, 10), reservoirMaterial);
      reservoir.rotation.x = -Math.PI / 2;
      reservoir.position.set(26, 6.5, 0);
      gate.add(reservoir);
      // Retaining banks enclose the existing reservoir; no new water footprints.
      [-35.5, 35.5].forEach((z) => {
        const bank = new THREE.Mesh(new THREE.BoxGeometry(50, 7.8, 3), gateStone);
        bank.position.set(26, 3.6, z);
        bank.receiveShadow = true;
        gate.add(bank);
      });
      const reservoirBack = new THREE.Mesh(new THREE.BoxGeometry(3, 7.8, 74), gateStone);
      reservoirBack.position.set(51.5, 3.6, 0);
      gate.add(reservoirBack);

      const createDamFlow = (
        angle: number,
        flowX: number,
        flowZ: number,
        crossings: Array<{ progress: number; along: number; roadY: number }>,
        color: number,
        phase: number,
      ) => {
        const flowGroup = new THREE.Group();
        flowGroup.rotation.y = angle;
        gate.add(flowGroup);
        const downstreamCrossing = crossings[crossings.length - 1];
        const downstreamRise = Math.max(0, (downstreamCrossing?.roadY ?? gatePose.y) - gatePose.y + 0.38 - 0.32);
        const downstreamRampStart = (downstreamCrossing?.along ?? 148) - 27;
        const waterMaterial = new THREE.MeshPhysicalMaterial({
          color,
          emissive: 0x0b4f58,
          emissiveIntensity: 0.22,
          roughness: 0.2,
          transparent: true,
          opacity: 0,
          clearcoat: 0.72,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const spillClock = { value: 0 };
        waterUniforms.push(spillClock);
        finishRiverSurface(THREE, waterMaterial, spillClock, { length: 112, width: 18, offset: -107, direction: -1, rapids: 1, junction: "upstream" });
        const waterGeometry = new THREE.PlaneGeometry(112, 18, 56, 8);
        const waterVertices = waterGeometry.getAttribute("position") as Three.BufferAttribute;
        for (let vertexIndex = 0; vertexIndex < waterVertices.count; vertexIndex += 1) {
          const localX = waterVertices.getX(vertexIndex) - 51;
          const spillRise = clamp((localX + 29) / 34, 0, 1);
          waterVertices.setX(vertexIndex, localX);
          waterVertices.setZ(vertexIndex, 0.32 + spillRise * spillRise * 6.05);
        }
        waterVertices.needsUpdate = true;
        waterGeometry.computeVertexNormals();
        const water = new THREE.Mesh(waterGeometry, waterMaterial);
        water.rotation.x = -Math.PI / 2;
        water.visible = false;
        water.renderOrder = 4;
        flowGroup.add(water);

        const extensionMaterial = waterMaterial.clone();
        finishRiverSurface(THREE, extensionMaterial, spillClock, { length: 72, width: 18, offset: -175, direction: -1, rapids: 0.65, junction: "downstream" });
        const extensionGeometry = new THREE.PlaneGeometry(72, 18, 36, 8);
        const extensionVertices = extensionGeometry.getAttribute("position") as Three.BufferAttribute;
        for (let vertexIndex = 0; vertexIndex < extensionVertices.count; vertexIndex += 1) {
          const localX = extensionVertices.getX(vertexIndex) - 139;
          const downstreamDistance = -localX;
          const roadRise = clamp((downstreamDistance - downstreamRampStart) / 25, 0, 1) * downstreamRise;
          extensionVertices.setX(vertexIndex, localX);
          extensionVertices.setZ(vertexIndex, 0.32 + roadRise);
        }
        extensionVertices.needsUpdate = true;
        extensionGeometry.computeVertexNormals();
        const extension = new THREE.Mesh(extensionGeometry, extensionMaterial);
        extension.rotation.x = -Math.PI / 2;
        extension.visible = false;
        extension.renderOrder = 4;
        flowGroup.add(extension);

        const foamCount = 78;
        const foamPositions = new Float32Array(foamCount * 3);
        for (let foamIndex = 0; foamIndex < foamCount; foamIndex += 1) {
          const localX = 2 - (((foamIndex * 37) + phase * 53) % 176);
          const spillRise = clamp((localX + 29) / 34, 0, 1);
          const downstreamDistance = -localX;
          const roadRise = clamp((downstreamDistance - downstreamRampStart) / 25, 0, 1) * downstreamRise;
          foamPositions[foamIndex * 3] = localX;
          foamPositions[foamIndex * 3 + 1] = 0.5 + spillRise * spillRise * 6.05 + roadRise;
          foamPositions[foamIndex * 3 + 2] = -8 + (((foamIndex * 29) + phase * 41) % 160) / 10;
        }
        const foamGeometry = new THREE.BufferGeometry();
        foamGeometry.setAttribute("position", new THREE.BufferAttribute(foamPositions, 3));
        const foam = new THREE.Points(
          foamGeometry,
          new THREE.PointsMaterial({ map: riverFoamTexture, color: 0xc4d7c7, size: 0.65, transparent: true, opacity: 0, depthWrite: false }),
        );
        foam.visible = false;
        foam.frustumCulled = false;
        flowGroup.add(foam);
        return { flowGroup, water, waterMaterial, extension, extensionMaterial, foam, foamPositions, crossings, flowX, flowZ, downstreamRise, downstreamRampStart };
      };
      const damFlows = [
        createDamFlow(0, damFlowX, damFlowZ, findDamCrossings(damFlowX, damFlowZ, 0.472), 0x269bb0, 0),
        createDamFlow(secondaryFlowAngle, secondaryFlowX, secondaryFlowZ, findDamCrossings(secondaryFlowX, secondaryFlowZ), 0x35a8c2, 1),
      ];
      scene.add(gate);

      scene.userData.waterUniforms = waterUniforms;
      scene.userData.waterFlow = { points: flowPoints, particles: flowParticles };
      scene.userData.riverCycle = {
        gate,
        gatePanels,
        reservoir,
        reservoirMaterial,
        damFlows,
        waterMaterials,
        waterMeshes,
        flowMaterial: flowPoints.material,
      };
    }
  }

  const deckMaterial = new THREE.MeshStandardMaterial({ color: pirate ? 0x4f2d1c : starlight ? 0x50565d : jungle || river ? 0x665442 : 0x74787a, roughness: 0.82, metalness: 0.12, side: THREE.DoubleSide });
  markGeneratedSurface(deckMaterial, pirate ? "wood" : "stone");
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
    const dashCount = LOW_POLY_VISUAL_DETAIL.laneDashCount;
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
  const curbSegments = LOW_POLY_VISUAL_DETAIL.curbSegments;
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
    mesh.visible = !cloud; // Cloud crowns define the edge; no painted road kerb.
    scene.add(mesh);
  });

  for (let i = -10; i <= 10; i += 1) {
    const start = course.pointAt(0, i);
    const tile = new THREE.Mesh(
      new THREE.BoxGeometry(1.06, 0.045, 1.06),
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0xf5f5ef : 0x20252a, roughness: 0.68 }),
    );
    tile.position.set(start.x, start.y + (cloud ? 1.8 : 0.11), start.z);
    tile.rotation.y = start.heading;
    scene.add(tile);
  }

  // Decorative architecture and vegetation are batched by createCourseBackdrop.
  // They deliberately do not contribute collision or race-course surfaces.

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3d4549, metalness: 0.72, roughness: 0.35 });
  markGeneratedSurface(poleMat, "metal");
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff6d7, emissive: 0xffdf96, emissiveIntensity: 0.28 });
  const streetlightCapacity = definition.id === "city" ? 52 : 1;
  const poleInstances = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.075, 0.11, 4.1, 8), poleMat, streetlightCapacity);
  const armInstances = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.055, 0.8, 6), poleMat, streetlightCapacity);
  const lampInstances = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.18, 0), lampMat, streetlightCapacity);
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
  markGeneratedSurface(supportMat, "stone");
  for (let i = 0; i < (cloudScenery || starlightScenery || pirate ? 0 : 80); i += 1) {
    const u = i / 80;
    const point = course.pointAt(u);
    if (point.y < 2.2) continue;
    [-COURSE_WIDTH - 1.35, COURSE_WIDTH + 1.35].forEach((lane) => {
      const supportPoint = course.pointAt(u, lane);
      if (!course.isClearFromRoad(supportPoint.x, supportPoint.z, COURSE_WIDTH + 1.2, u, 0.055)) return;
      const support = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.62, point.y + 0.5, 8), supportMat);
      support.position.set(supportPoint.x, point.y / 2 - 0.25, supportPoint.z);
      support.castShadow = true;
      support.receiveShadow = true;
      scene.add(support);
    });
  }

  // Distant daylight clouds are drawn by the layered-atmosphere shader.
  if (starlight) {
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
    starlightMoonMaterial = createHeroMoonMaterial(THREE);
    starlightMoon = new THREE.Mesh(
      createHeroMoonGeometry(THREE),
      starlightMoonMaterial,
    );
    starlightMoon.position.set(0, 138, 0);
    starlightMoonGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0x8fbdff,
      transparent: true,
      opacity: 0,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const moonGlow = new THREE.Mesh(new THREE.SphereGeometry(29, 32, 20), starlightMoonGlowMaterial);
    moonGlow.renderOrder = 1;
    starlightMoon.add(moonGlow);
    starlightMoon.visible = false;
    scene.add(starlightMoon);
    starlightSunDiscMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff2bd,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });
    starlightSunDisc = new THREE.Mesh(new THREE.SphereGeometry(12, 24, 16), starlightSunDiscMaterial);
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
        flatShading: true,
        transparent: true,
        opacity: 0,
      });
      starlightCrystalMaterials.push(crystalMaterial);
      markGeneratedSurface(crystalMaterial, "ice");
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
    const hullWood = new THREE.MeshStandardMaterial({ color: 0x3b1d12, roughness: 0.92, metalness: 0.04, flatShading: true });
    const outerWood = new THREE.MeshStandardMaterial({ color: 0x562c19, roughness: 0.88, metalness: 0.04, flatShading: true });
    const innerWood = new THREE.MeshStandardMaterial({ color: 0x6f3f22, emissive: 0x1c0802, emissiveIntensity: 0.18, roughness: 0.94, side: THREE.DoubleSide, flatShading: true });
    const darkCeiling = new THREE.MeshStandardMaterial({ color: 0x28140d, emissive: 0x090302, emissiveIntensity: 0.12, roughness: 0.98, side: THREE.DoubleSide, flatShading: true });
    const iron = new THREE.MeshStandardMaterial({ color: 0x20262b, roughness: 0.34, metalness: 0.82, flatShading: true });
    const brass = new THREE.MeshStandardMaterial({ color: 0xb87922, emissive: 0x4d2100, emissiveIntensity: 0.28, roughness: 0.3, metalness: 0.76, flatShading: true });
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc928, emissive: 0x8a3d00, emissiveIntensity: 0.45, roughness: 0.22, metalness: 0.84, flatShading: true });
    const gunPortDark = new THREE.MeshStandardMaterial({ color: 0x090b0d, emissive: 0x160501, emissiveIntensity: 0.2, roughness: 0.52, metalness: 0.62 });
    markGeneratedSurface(gunPortDark, "iron");
    const ropeMaterial = new THREE.MeshStandardMaterial({ color: 0xb28a58, roughness: 1 });
    [hullWood, outerWood, innerWood, darkCeiling].forEach((material) => markGeneratedSurface(material, "wood"));
    markGeneratedSurface(iron, "iron");
    [brass, gold].forEach((material) => markGeneratedSurface(material, "metal"));
    markGeneratedSurface(ropeMaterial, "rope", "uv");

    [-1, 1].forEach((side) => {
      const hullSide = new THREE.Mesh(new THREE.BoxGeometry(12, 17, 380), outerWood);
      hullSide.position.set(side * 115, 5.5, 30);
      hullSide.rotation.z = side * -0.11;
      hullSide.castShadow = true;
      hullSide.receiveShadow = true;
      scene.add(hullSide);
      const bowSide = new THREE.Mesh(makeLowPolyHullSectionGeometry(THREE, 12, 17, 112), hullWood);
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
      const cask = new THREE.Mesh(new THREE.CylinderGeometry(1.18 * size, 1.05 * size, 2.8 * size, 10), outerWood);
      cask.position.y = 1.4 * size;
      cask.castShadow = false;
      barrel.add(cask);
      [0.36, 1.4, 2.44].forEach((y) => {
        const band = new THREE.Mesh(new THREE.TorusGeometry(1.1 * size, 0.09 * size, 6, 12), iron);
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
        new THREE.TorusGeometry(2.05 + (ropeIndex % 2) * 0.35, 0.18, 6, 18),
        markGeneratedSurface(new THREE.MeshStandardMaterial({ color: 0xb18a55, roughness: 1 }), "rope", "uv", [6, 1]),
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
    const leftWall = new THREE.Mesh(makeCourseWallSegmentGeometry(THREE, course, interiorStart, interiorEnd, 14.35, cabinHeight, -0.75, 180), innerWood);
    const rightWall = new THREE.Mesh(makeCourseWallSegmentGeometry(THREE, course, interiorStart, interiorEnd, -14.35, cabinHeight, -0.75, 180), innerWood);
    const roof = new THREE.Mesh(makeCourseSegmentGeometry(THREE, course, roofStart, roofEnd, 14.55, -14.55, cabinHeight, undefined, 220), darkCeiling);
    const outerLeftWall = new THREE.Mesh(makeCourseWallSegmentGeometry(THREE, course, roofStart, roofEnd, 14.65, cabinHeight + 0.45, -1.35, 180), hullWood);
    const outerRightWall = new THREE.Mesh(makeCourseWallSegmentGeometry(THREE, course, roofStart, roofEnd, -14.65, cabinHeight + 0.45, -1.35, 180), hullWood);
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
        const glow = new THREE.Mesh(new THREE.OctahedronGeometry(0.27, 0), new THREE.MeshBasicMaterial({ color: 0xffc15e }));
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
      const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), skullMat);
      skull.scale.set(0.82, 1, 0.72);
      skull.position.set(0, cabinHeight + 0.82, 0.2);
      portal.add(skull);
      [-1, 1].forEach((side) => {
        const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.2, 6), skullMat);
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
        const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.075, 8), gold);
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

    // Give each interior stretch a distinct silhouette: gun deck, cargo hold,
    // treasure hold, then the flooded bilge before the climb back to deck.
    [0.235, 0.27, 0.305, 0.34, 0.375].forEach((u, gunIndex) => {
      [-1, 1].forEach((side) => {
        const point = course.pointAt(u, side * 13.75);
        const gunPort = new THREE.Group();
        const opening = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.65, 0.38), gunPortDark);
        opening.position.y = 2.75;
        gunPort.add(opening);
        const frameTop = new THREE.Mesh(new THREE.BoxGeometry(4.25, 0.3, 0.5), brass);
        frameTop.position.y = 4.15;
        gunPort.add(frameTop);
        const cannonMuzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 3.6, 10), iron);
        cannonMuzzle.rotation.z = Math.PI / 2;
        cannonMuzzle.position.set(-side * 1.3, 2.5, 0);
        gunPort.add(cannonMuzzle);
        gunPort.position.set(point.x, point.y, point.z);
        gunPort.rotation.y = point.heading;
        gunPort.userData.gunIndex = gunIndex;
        scene.add(gunPort);
      });
    });

    [0.415, 0.455, 0.495].forEach((u, netIndex) => {
      const side = netIndex % 2 === 0 ? 1 : -1;
      const point = course.pointAt(u, side * 12.9);
      const cargoNet = new THREE.Group();
      for (let ropeIndex = -2; ropeIndex <= 2; ropeIndex += 1) {
        const vertical = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 5.8, 8), ropeMaterial);
        vertical.position.set(ropeIndex * 0.78, 2.9, 0);
        cargoNet.add(vertical);
        const horizontal = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 3.4, 8), ropeMaterial);
        horizontal.position.set(0, 2.9 + ropeIndex * 0.72, 0);
        horizontal.rotation.z = Math.PI / 2;
        cargoNet.add(horizontal);
      }
      cargoNet.position.set(point.x, point.y + 1.4, point.z);
      cargoNet.rotation.y = point.heading;
      scene.add(cargoNet);
    });

    [0.545, 0.585, 0.625].forEach((u, hoardIndex) => {
      const side = hoardIndex % 2 === 0 ? 1 : -1;
      const point = course.pointAt(u, side * 13.1);
      const hoard = new THREE.Group();
      for (let coinIndex = 0; coinIndex < 26; coinIndex += 1) {
        const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12), gold);
        const ring = Math.floor(coinIndex / 8);
        const angle = coinIndex * 2.31;
        coin.position.set(Math.cos(angle) * (0.55 + ring * 0.42), 0.18 + ring * 0.12, Math.sin(angle) * (0.55 + ring * 0.42));
        coin.rotation.set(angle * 0.3, angle, angle * 0.17);
        hoard.add(coin);
      }
      const ruby = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.48, 0),
        new THREE.MeshStandardMaterial({ color: hoardIndex === 1 ? 0x53dfff : 0xd72f55, emissive: hoardIndex === 1 ? 0x0b6d9a : 0x6d071d, emissiveIntensity: 0.8, roughness: 0.18 }),
      );
      ruby.position.y = 0.85;
      hoard.add(ruby);
      hoard.position.set(point.x, point.y + 0.06, point.z);
      scene.add(hoard);
    });

    pirateFloodMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x1d8db6,
      emissive: 0x083e62,
      emissiveIntensity: 0.24,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      roughness: 0.12,
      metalness: 0.02,
      clearcoat: 0.88,
      side: THREE.DoubleSide,
    });
    const floodedBilge = new THREE.Mesh(
      makeCourseSegmentGeometry(THREE, course, 0.665, 0.775, COURSE_WIDTH + 1.1, -COURSE_WIDTH - 1.1, 0.085, undefined, 110),
      pirateFloodMaterial,
    );
    floodedBilge.renderOrder = 3;
    scene.add(floodedBilge);

    const sailCanvas = new THREE.MeshStandardMaterial({ color: 0xd9c7a1, emissive: 0x3b2411, emissiveIntensity: 0.08, roughness: 0.94, side: THREE.DoubleSide, flatShading: true });
    markGeneratedSurface(sailCanvas, "canvas");
    pirateSailMaterial = sailCanvas;
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
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 1.28, height, 10), outerWood);
      mast.position.set(0, baseY + height / 2, z);
      mast.castShadow = true;
      scene.add(mast);
      [0.57, 0.79].forEach((heightAmount, yardIndex) => {
        const yardY = baseY + height * heightAmount;
        const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, width + yardIndex * 4, 8), hullWood);
        yard.position.set(0, yardY, z);
        yard.rotation.z = Math.PI / 2;
        yard.castShadow = true;
        scene.add(yard);
        if (yardIndex === 0) {
          const sail = new THREE.Mesh(new THREE.PlaneGeometry(width - 2, 16, 5, 3), sailCanvas);
          sail.position.set(0, yardY - 8.5, z + 0.34);
          sail.rotation.x = -0.035;
          sail.castShadow = true;
          scene.add(sail);
        }
      });
      const pennant = new THREE.Mesh(
        new THREE.PlaneGeometry(8.5, 2.8),
        markGeneratedSurface(new THREE.MeshStandardMaterial({ color: mastIndex ? 0x8f1717 : 0x18191c, roughness: 0.84, side: THREE.DoubleSide }), "canvas"),
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
    const cabinSkull = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), skullMat);
    cabinSkull.scale.set(0.82, 1, 0.7);
    cabinSkull.position.set(0, 10.7, -14.7);
    cabin.add(cabinSkull);
    cabin.position.set(0, centralDeckTop, 242);
    scene.add(cabin);

    const helm = new THREE.Group();
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.25, 8, 18), outerWood);
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
      const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.84, 3, 8), iron);
      bollard.position.set(x, 14.25, 224);
      scene.add(bollard);
    });
    const anchorRing = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.38, 8, 20), iron);
    anchorRing.position.set(0, 16, 254);
    anchorRing.rotation.x = Math.PI / 2;
    scene.add(anchorRing);

    const gullMaterial = new THREE.MeshStandardMaterial({ color: 0xf7fbff, emissive: 0xb9dded, emissiveIntensity: 0.12, roughness: 0.78, flatShading: true });
    const gullBeak = new THREE.MeshStandardMaterial({ color: 0xf1a22c, roughness: 0.7 });
    const seagulls: Three.Group[] = [];
    for (let index = 0; index < 16; index += 1) {
      const gull = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.62, 3, 6), gullMaterial);
      body.rotation.x = Math.PI / 2;
      body.castShadow = false;
      gull.add(body);
      const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.19, 0), gullMaterial);
      head.position.z = 0.48;
      gull.add(head);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.28, 5), gullBeak);
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

    const stormCloudMaterial = new THREE.MeshStandardMaterial({ color: 0x35445a, emissive: 0x091322, emissiveIntensity: 0.22, roughness: 1 });
    pirateStormClouds = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), stormCloudMaterial, 42);
    const stormDummy = new THREE.Object3D();
    for (let index = 0; index < 42; index += 1) {
      const row = Math.floor(index / 7);
      const column = index % 7;
      stormDummy.position.set(-180 + column * 60 + (row % 2) * 24, 82 + (index % 4) * 7, -245 + row * 100);
      stormDummy.scale.set(25 + (index % 5) * 7, 7 + (index % 3) * 3, 17 + ((index + 2) % 4) * 6);
      stormDummy.rotation.set(0, index * 0.61, 0);
      stormDummy.updateMatrix();
      pirateStormClouds.setMatrixAt(index, stormDummy.matrix);
    }
    pirateStormClouds.instanceMatrix.needsUpdate = true;
    pirateStormClouds.visible = false;
    pirateStormClouds.castShadow = false;
    scene.add(pirateStormClouds);

    const rainCount = 420;
    pirateRainPositions = new Float32Array(rainCount * 3);
    for (let index = 0; index < rainCount; index += 1) {
      pirateRainPositions[index * 3] = -145 + ((index * 73) % 290);
      pirateRainPositions[index * 3 + 1] = 16 + ((index * 47) % 92);
      pirateRainPositions[index * 3 + 2] = -205 + ((index * 109) % 510);
    }
    const rainGeometry = new THREE.BufferGeometry();
    rainGeometry.setAttribute("position", new THREE.BufferAttribute(pirateRainPositions, 3));
    pirateRain = new THREE.Points(
      rainGeometry,
      new THREE.PointsMaterial({ color: 0xb9e5ff, size: 0.28, transparent: true, opacity: 0.78, depthWrite: false }),
    );
    pirateRain.visible = false;
    pirateRain.frustumCulled = false;
    scene.add(pirateRain);
  }

  if (cloud) {
    const stormCloudMaterial = new THREE.MeshStandardMaterial({
      color: 0x53647a,
      emissive: 0x172338,
      emissiveIntensity: 0.16,
      roughness: 1,
      transparent: true,
      opacity: 0,
    });
    cloudStormClouds = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), stormCloudMaterial, 38);
    const stormDummy = new THREE.Object3D();
    for (let index = 0; index < 38; index += 1) {
      const angle = index * 2.39996;
      const radius = 58 + (index % 9) * 14;
      stormDummy.position.set(Math.cos(angle) * radius, 68 + (index % 7) * 5.2, Math.sin(angle) * radius);
      stormDummy.scale.set(12 + (index % 5) * 3.1, 3.8 + (index % 4) * 1.05, 8.5 + (index % 6) * 2.15);
      stormDummy.rotation.y = angle * 0.37;
      stormDummy.updateMatrix();
      cloudStormClouds.setMatrixAt(index, stormDummy.matrix);
    }
    cloudStormClouds.instanceMatrix.needsUpdate = true;
    cloudStormClouds.visible = false;
    cloudStormClouds.castShadow = false;
    cloudStormClouds.frustumCulled = false;
    scene.add(cloudStormClouds);

    const rainCount = 280;
    cloudRainPositions = new Float32Array(rainCount * 3);
    for (let index = 0; index < rainCount; index += 1) {
      cloudRainPositions[index * 3] = -160 + ((index * 73) % 320);
      cloudRainPositions[index * 3 + 1] = 8 + ((index * 47) % 105);
      cloudRainPositions[index * 3 + 2] = -160 + ((index * 109) % 320);
    }
    const rainGeometry = new THREE.BufferGeometry();
    rainGeometry.setAttribute("position", new THREE.BufferAttribute(cloudRainPositions, 3));
    cloudRain = new THREE.Points(
      rainGeometry,
      new THREE.PointsMaterial({ color: 0xc6eaff, size: 0.3, transparent: true, opacity: 0, depthWrite: false }),
    );
    cloudRain.visible = false;
    cloudRain.frustumCulled = false;
    scene.add(cloudRain);

    cloudHalo = new THREE.Group();
    cloudHaloMaterials = [
      new THREE.MeshBasicMaterial({ color: 0xdffbff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide }),
      new THREE.MeshBasicMaterial({ color: 0x7ad9ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide }),
      new THREE.MeshBasicMaterial({ color: 0xbfa7ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide }),
    ];
    [
      { inner: 16.8, outer: 17.45, material: cloudHaloMaterials[0] },
      { inner: 19.1, outer: 19.55, material: cloudHaloMaterials[1] },
      { inner: 21.15, outer: 21.48, material: cloudHaloMaterials[2] },
    ].forEach(({ inner, outer, material }) => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 96), material);
      cloudHalo?.add(ring);
    });
    const haloCoreMaterial = new THREE.MeshBasicMaterial({ color: 0xf7ffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
    cloudHaloMaterials.push(haloCoreMaterial);
    const haloCore = new THREE.Mesh(new THREE.CircleGeometry(5.4, 64), haloCoreMaterial);
    cloudHalo.add(haloCore);
    cloudHalo.visible = false;
    cloudHalo.renderOrder = 20;
    scene.add(cloudHalo);

    const iceCount = 220;
    cloudIcePositions = new Float32Array(iceCount * 3);
    for (let index = 0; index < iceCount; index += 1) {
      cloudIcePositions[index * 3] = -90 + ((index * 73) % 180);
      cloudIcePositions[index * 3 + 1] = 48 + ((index * 47) % 54);
      cloudIcePositions[index * 3 + 2] = -90 + ((index * 109) % 180);
    }
    const iceGeometry = new THREE.BufferGeometry();
    iceGeometry.setAttribute("position", new THREE.BufferAttribute(cloudIcePositions, 3));
    cloudIceCrystals = new THREE.Points(
      iceGeometry,
      new THREE.PointsMaterial({ color: 0xe7fcff, size: 0.42, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    cloudIceCrystals.visible = false;
    cloudIceCrystals.frustumCulled = false;
    scene.add(cloudIceCrystals);
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
  if (cloud && cloudPuffMaterial && cloudStormClouds && cloudRain && cloudRainPositions && cloudHalo && cloudHaloMaterials && cloudIceCrystals && cloudIcePositions) {
    scene.userData.cloudAtmosphere = {
      groundMaterial,
      surfaceMaterials: cloudSurfaceMaterials,
      puffMaterial: cloudPuffMaterial,
      stormClouds: cloudStormClouds,
      rain: cloudRain,
      rainPositions: cloudRainPositions,
      halo: cloudHalo,
      haloMaterials: cloudHaloMaterials,
      iceCrystals: cloudIceCrystals,
      icePositions: cloudIcePositions,
      hemisphere,
      sun,
    };
  }
  if (pirate && pirateStormClouds && pirateRain && pirateRainPositions && pirateSailMaterial && pirateFloodMaterial) {
    scene.userData.pirateAtmosphere = {
      oceanMaterial: groundMaterial,
      stormClouds: pirateStormClouds,
      rain: pirateRain,
      rainPositions: pirateRainPositions,
      sailMaterial: pirateSailMaterial,
      floodMaterial: pirateFloodMaterial,
      hemisphere,
      sun,
    };
  }
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
    && starlightMoonGlowMaterial
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
      moonGlowMaterial: starlightMoonGlowMaterial,
      sunDisc: starlightSunDisc,
      sunDiscMaterial: starlightSunDiscMaterial,
      crystalGroup: starlightCrystalGroup,
      crystalMaterials: starlightCrystalMaterials,
      hemisphere,
      sun,
    };
  }
  scene.userData.lowPolyVisuals = LOW_POLY_VISUAL_DETAIL;
  return sun;
}

function CourseCreatorWorld({
  parts,
  theme,
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
  theme: CreatorTheme;
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
    let generatedTextures: ReturnType<typeof createGeneratedTextureSet> | null = null;

    void (async () => {
      const THREE = await import("three");
      if (disposed) return;
      scene = new THREE.Scene();
      const previewPalette = theme === "starlight"
        ? { sky: 0x07112b, road: 0x323b55, edge: 0x8390af }
        : theme === "jungle"
          ? { sky: 0x69a97a, road: 0x46453b, edge: 0x9b825f }
          : theme === "cloud"
            ? { sky: 0x70cbf4, road: 0x566b78, edge: 0xeaf9ff }
            : { sky: 0x86cfe9, road: 0x3e484b, edge: 0xe7efe9 };
      scene.background = new THREE.Color(previewPalette.sky);
      scene.fog = new THREE.Fog(previewPalette.sky, 220, 620);
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1200);
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      generatedTextures = createGeneratedTextureSet(THREE, renderer);
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

      const roadMaterial = new THREE.MeshStandardMaterial({ color: previewPalette.road, roughness: 0.82, metalness: theme === "starlight" ? 0.3 : 0.05 });
      const edgeMaterial = new THREE.MeshStandardMaterial({ color: previewPalette.edge, roughness: 0.72 });
      const railMaterial = new THREE.MeshStandardMaterial({ color: 0x273a43, roughness: 0.34, metalness: 0.72 });
      markGeneratedSurface(roadMaterial, theme === "jungle" ? "earth" : "asphalt", "world");
      markGeneratedSurface(edgeMaterial, "stone");
      markGeneratedSurface(railMaterial, "metal");
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
            new THREE.CylinderGeometry(Math.max(1.2, hazard.width * 0.25), Math.max(1.8, hazard.width * 0.4), 32, 8, 1, true),
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
            new THREE.ConeGeometry(0.72, 4.2, 6),
            new THREE.MeshBasicMaterial({ color: 0x86ddff, transparent: true, opacity: 0.48, blending: THREE.AdditiveBlending, depthWrite: false }),
          );
          trail.position.set(1.7, 5.1, 0);
          trail.rotation.z = -Math.PI / 3;
          marker.add(trail);
        } else if (hazard.type === "cannon") {
          const iron = new THREE.MeshStandardMaterial({ color: 0x22292e, emissive: 0x35120a, emissiveIntensity: 0.45, roughness: 0.3, metalness: 0.82 });
          markGeneratedSurface(iron, "iron");
          const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.92, 4.5, 10), iron);
          barrel.rotation.z = Math.PI / 2;
          barrel.position.y = 1.15;
          marker.add(barrel);
          const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.92, 1), iron);
          ball.position.set(2.9, 1.15, 0);
          marker.add(ball);
        } else {
          const fur = new THREE.MeshStandardMaterial({ color: 0x87522f, emissive: 0x2b1005, emissiveIntensity: 0.35, roughness: 0.82 });
          markGeneratedSurface(fur, "fur", "uv");
          const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.78, 1), fur);
          body.scale.set(0.82, 1.16, 0.78);
          body.position.y = 1.1;
          marker.add(body);
          const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), fur);
          head.position.y = 2.05;
          marker.add(head);
          [-1, 1].forEach((side) => {
            const ear = new THREE.Mesh(new THREE.DodecahedronGeometry(0.21, 0), fur);
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
        scene?.add(marker);
        hazardMarkers.push(marker);
      });

      const ringGeometry = new THREE.TorusGeometry(2.35, 0.22, 6, 20);
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
        new THREE.ConeGeometry(1.15, 3, 6),
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

      generatedTextures.attach(scene);
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
      generatedTextures?.dispose();
      host.replaceChildren();
    };
  }, [connectAt, editMode, focusPartIndex, hazards, onConnectAtChange, onPlace, parts, placementValid, selectedHazardId, selectedPart, theme]);

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
  paused,
  feedbackTarget,
  runId,
  courseDefinition,
  selectedCharacterIndex,
  machineTuning,
  evolutionMode,
  evolutionChapterIndex,
  gojoChallenge,
  ultimateGojo,
  gojoField,
  itemsEnabled,
  skillsEnabled,
  timeTrialMode,
  recordGojoLine,
  ghostRecords,
  gojoLineRecord,
  keyBindings,
  gamepadBindings,
  audioController,
  creatorParts,
  creatorHazards,
  onTelemetry,
  onFinish,
  onItemChange,
  onShieldChange,
  onSkillChange,
  onRunEvent,
  onRaceFault,
  onReady,
}: {
  phase: GamePhase;
  paused: boolean;
  feedbackTarget: HTMLDivElement | null;
  runId: number;
  courseDefinition: CourseDefinition;
  selectedCharacterIndex: number;
  machineTuning: MachineTuning;
  evolutionMode: boolean;
  evolutionChapterIndex: number;
  gojoChallenge: boolean;
  ultimateGojo: boolean;
  gojoField: boolean;
  itemsEnabled: boolean;
  skillsEnabled: boolean;
  timeTrialMode: boolean;
  recordGojoLine: boolean;
  ghostRecords: GhostRecord[];
  gojoLineRecord: GojoLineRecord | null;
  keyBindings: KeyBindings;
  gamepadBindings: GamepadBindings;
  audioController: GameAudioController;
  creatorParts: CoursePartType[];
  creatorHazards: CreatorHazardPlacement[];
  onTelemetry: (speed: number, progress: number, position: number, driftGauge: number, driftDashing: boolean) => void;
  onFinish: (payload: RaceFinishPayload) => void;
  onItemChange: (item: ItemType, level: ItemLevel) => void;
  onShieldChange: (active: boolean, level: ItemLevel) => void;
  onSkillChange: (remainingMs: number, totalMs: number, active: boolean, actionProgress: number, actionLabel: string) => void;
  onRunEvent: (event: RaceRunEvent) => void;
  onRaceFault: (diagnostic: RaceFaultDiagnostic) => void;
  onReady: (readyRunId: number) => void;
}) {
  const machine = useMemo(() => machineTuningParameters(machineTuning), [machineTuning]);
  const hostRef = useRef<HTMLDivElement>(null);
  const cometGatePointerRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef(phase);
  const pausedRef = useRef(paused);
  const onFinishRef = useRef(onFinish);
  const activeKeyboardCodes = useRef(new Map<string, { aliases: string[]; downOrder: number }>());
  const keyboardDownOrder = useRef(0);
  const touch = useRef({ left: false, right: false, gas: false, brake: false, item: false, skill: false, drift: false, driftOrigin: 0 as -1 | 0 | 1 });
  const mobileAutoDrive = useRef(false);
  const activeTouchPointers = useRef(new Map<number, {
    side: "left" | "right";
    originSide: "left" | "right";
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    startedAt: number;
    drift: boolean;
    didSwipe: boolean;
    skillHold: boolean;
  }>());
  const lastTouchTapAt = useRef({ left: 0, right: 0 });
  const touchActionTimers = useRef({ item: 0, skill: 0 });
  const [webglError, setWebglError] = useState(false);
  const [skillFeedback, setSkillFeedback] = useState<SkillFeedback | null>(null);
  const skillFeedbackTimer = useRef(0);
  const showSkillFeedback = useCallback((text: string, tone: SkillFeedbackTone, durationMs = 1700) => {
    window.clearTimeout(skillFeedbackTimer.current);
    setSkillFeedback({ id: performance.now(), text, tone });
    skillFeedbackTimer.current = window.setTimeout(() => setSkillFeedback(null), durationMs);
  }, []);
  useEffect(() => () => window.clearTimeout(skillFeedbackTimer.current), []);
  const keyboardActionPressed = (action: KeyAction) => {
    const actionBindings = keyBindings[action];
    return Array.from(activeKeyboardCodes.current.values()).some((entry) => (
      entry.aliases.some((alias) => actionBindings.includes(alias))
    ));
  };
  const keyboardSteerValue = () => {
    let latestLeft = -1;
    let latestRight = -1;
    activeKeyboardCodes.current.forEach((entry) => {
      if (entry.aliases.some((alias) => keyBindings.left.includes(alias))) {
        latestLeft = Math.max(latestLeft, entry.downOrder);
      }
      if (entry.aliases.some((alias) => keyBindings.right.includes(alias))) {
        latestRight = Math.max(latestRight, entry.downOrder);
      }
    });
    if (latestLeft < 0 && latestRight < 0) return 0;
    if (latestLeft === latestRight) return 0;
    return latestLeft > latestRight ? 1 : -1;
  };
  const [gamepadConnected, setGamepadConnected] = useState(false);

  useEffect(() => {
    audioController.setScene(phase, courseDefinition.id, gojoChallenge);
  }, [audioController, courseDefinition.id, gojoChallenge, phase]);

  useEffect(() => {
    phaseRef.current = phase;
    if (phase !== "racing") {
      activeTouchPointers.current.clear();
      touch.current.left = false;
      touch.current.right = false;
      touch.current.drift = false;
      touch.current.driftOrigin = 0;
      touch.current.item = false;
      touch.current.skill = false;
    }
  }, [phase]);

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    pausedRef.current = paused;
    if (paused) {
      // Another finger can open the menu while the first still holds a drift.
      // Resume must not restore that stale touch or count it as a double tap.
      activeTouchPointers.current.clear();
      lastTouchTapAt.current = { left: 0, right: 0 };
      touch.current = { left: false, right: false, gas: false, brake: false, item: false, skill: false, drift: false, driftOrigin: 0 };
      window.clearTimeout(touchActionTimers.current.item);
      window.clearTimeout(touchActionTimers.current.skill);
    }
  }, [paused]);

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
    const transitionFilter = new KeyboardTransitionFilter({ thresholdMs: KEYBOARD_GLITCH_PAIR_MS });
    const down = (event: KeyboardEvent) => {
      const aliases = Array.from(new Set([
        normalizeBindingKey(event.key),
        normalizeBindingCode(event.code),
      ].filter(Boolean)));
      const assignedKeys = Object.values(keyBindings).flat();
      const shouldPreventDefault = aliases.some((key) => assignedKeys.includes(key));
      const physicalCode = event.code || `key:${normalizeBindingKey(event.key)}`;
      if (shouldPreventDefault) event.preventDefault();
      if (!event.repeat) {
        activeKeyboardCodes.current.set(physicalCode, {
          aliases,
          downOrder: ++keyboardDownOrder.current,
        });
      }
    };
    const up = (event: KeyboardEvent) => {
      const aliases = Array.from(new Set([
        normalizeBindingKey(event.key),
        normalizeBindingCode(event.code),
      ].filter(Boolean)));
      const physicalCode = event.code || `key:${normalizeBindingKey(event.key)}`;
      const releasedCodes: string[] = [];
      if (activeKeyboardCodes.current.delete(physicalCode)) {
        releasedCodes.push(physicalCode);
      }
      if (!releasedCodes.length) {
        activeKeyboardCodes.current.forEach((entry, activeCode) => {
          if (!entry.aliases.some((alias) => aliases.includes(alias))) return;
          activeKeyboardCodes.current.delete(activeCode);
          releasedCodes.push(activeCode);
        });
      }
    };
    const rawPhysicalId = (event: KeyboardEvent) => (
      event.code || `key:${normalizeBindingKey(event.key)}`
    );
    const rawAliases = (event: KeyboardEvent) => Array.from(new Set([
      normalizeBindingKey(event.key),
      normalizeBindingCode(event.code),
    ].filter(Boolean)));
    const isSteeringEvent = (event: KeyboardEvent) => {
      const aliases = rawAliases(event);
      return aliases.some((alias) => (
        keyBindings.left.includes(alias) || keyBindings.right.includes(alias)
      ));
    };
    const findRawKeyActive = (event: KeyboardEvent) => {
      const physicalId = rawPhysicalId(event);
      const directEntry = activeKeyboardCodes.current.get(physicalId);
      if (directEntry) return { physicalCode: physicalId, entry: directEntry };
      const aliases = rawAliases(event);
      for (const [activeCode, entry] of activeKeyboardCodes.current.entries()) {
        if (entry.aliases.some((alias) => aliases.includes(alias))) {
          return { physicalCode: activeCode, entry };
        }
      }
      return null;
    };
    const filteredDown = (event: KeyboardEvent) => {
      if (!isSteeringEvent(event)) {
        transitionFilter.noteOtherEvent();
        down(event);
        return;
      }
      const result = transitionFilter.handleKeyDown({
        keyId: rawPhysicalId(event),
        payload: event,
        repeat: event.repeat,
        timeStamp: event.timeStamp,
      }, (acceptedEvent: KeyboardEvent) => down(acceptedEvent));
      if (result.restoreState) {
        activeKeyboardCodes.current.set(result.restoreState.physicalCode, {
          aliases: [...result.restoreState.aliases],
          downOrder: result.restoreState.downOrder,
        });
      }
    };
    const filteredUp = (event: KeyboardEvent) => {
      const activeState = findRawKeyActive(event);
      const filterEvent = {
        keyId: rawPhysicalId(event),
        payload: event,
        timeStamp: event.timeStamp,
        wasActive: Boolean(activeState),
        restoreState: activeState
          ? {
              physicalCode: activeState.physicalCode,
              aliases: [...activeState.entry.aliases],
              downOrder: activeState.entry.downOrder,
            }
          : undefined,
      };
      transitionFilter.noteKeyUp(filterEvent);
      if (!isSteeringEvent(event)) {
        up(event);
        return;
      }
      transitionFilter.handleKeyUp({
        ...filterEvent,
        repeat: event.repeat,
      }, (acceptedEvent: KeyboardEvent) => up(acceptedEvent));
    };
    const mouseDown = (event: MouseEvent) => {
      const key = `mouse:${event.button}`;
      if (Object.values(keyBindings).flat().includes(key)) event.preventDefault();
      activeKeyboardCodes.current.set(key, { aliases: [key], downOrder: ++keyboardDownOrder.current });
    };
    const mouseUp = (event: MouseEvent) => { activeKeyboardCodes.current.delete(`mouse:${event.button}`); };
    const contextMenu = (event: MouseEvent) => {
      if (Object.values(keyBindings).flat().includes("mouse:2")) event.preventDefault();
    };
    const clearControls = () => {
      transitionFilter.reset();
      activeKeyboardCodes.current.clear();
      touch.current = { left: false, right: false, gas: false, brake: false, item: false, skill: false, drift: false, driftOrigin: 0 };
      activeTouchPointers.current.clear();
    };
    const blur = () => { clearControls(); };
    const pageHide = () => { clearControls(); };
    const visibilityChanged = () => {
      if (document.hidden) clearControls();
    };
    window.addEventListener("keydown", filteredDown, { passive: false, capture: true });
    window.addEventListener("keyup", filteredUp, { capture: true });
    window.addEventListener("mousedown", mouseDown, { passive: false });
    window.addEventListener("mouseup", mouseUp);
    window.addEventListener("contextmenu", contextMenu);
    window.addEventListener("blur", blur);
    window.addEventListener("pagehide", pageHide);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      clearControls();
      window.removeEventListener("keydown", filteredDown, { capture: true });
      window.removeEventListener("keyup", filteredUp, { capture: true });
      window.removeEventListener("mousedown", mouseDown);
      window.removeEventListener("mouseup", mouseUp);
      window.removeEventListener("contextmenu", contextMenu);
      window.removeEventListener("blur", blur);
      window.removeEventListener("pagehide", pageHide);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [keyBindings]);

  useEffect(() => {
    const syncGamepad = () => setGamepadConnected(readGamepadInput(gamepadBindings).connected);
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

    void Promise.all([import("three"), import("./race-presentation")]).then(([THREE, { createRacePresentation }]) => {
      if (disposed) return;
      let readyReported = false;
      let readyReportTimer = 0;
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
      const normalPixelRatioCap = mobileRenderTarget ? 1 : 1.25;
      renderer.setPixelRatio(Math.min(
        window.devicePixelRatio || 1,
        normalPixelRatioCap,
      ));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = RACE_DAY_EXPOSURE;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.setAttribute("aria-label", `${courseDefinition.name}を走る自機後方視点の3Dカートレース`);
      renderer.domElement.setAttribute("role", "img");
      host.prepend(renderer.domElement);

      const scene = new THREE.Scene();
      const generatedTextures = createGeneratedTextureSet(THREE, renderer);
      let generatedTexturesReady = false;
      const course = createRaceCourse(THREE, courseDefinition);
      const totalLaps = lapCountForCourse(courseDefinition.id);
      const sun = addWorld(THREE, scene, course, courseDefinition);
      const evolutionVisuals = evolutionMode
        ? addEvolutionArtifacts(THREE, scene, course, evolutionChapterIndex)
        : null;
      const oceanTime = scene.userData.oceanTime as { value: number } | undefined;
      const seagulls = (scene.userData.seagulls ?? []) as Three.Group[];
      const pirateAtmosphere = scene.userData.pirateAtmosphere as {
        oceanMaterial: Three.MeshPhysicalMaterial;
        stormClouds: Three.InstancedMesh;
        rain: Three.Points;
        rainPositions: Float32Array;
        sailMaterial: Three.MeshStandardMaterial;
        floodMaterial: Three.MeshPhysicalMaterial;
        hemisphere: Three.HemisphereLight;
        sun: Three.DirectionalLight;
      } | undefined;
      const pirateWeatherColors = pirateAtmosphere ? {
        clearSky: new THREE.Color(0x69c8f4),
        battleSky: new THREE.Color(0x6689a3),
        stormSky: new THREE.Color(0x202b43),
        clearFog: new THREE.Color(0x8ad7f6),
        battleFog: new THREE.Color(0x728b9b),
        stormFog: new THREE.Color(0x273246),
        clearSea: new THREE.Color(0x087fba),
        battleSea: new THREE.Color(0x155f82),
        stormSea: new THREE.Color(0x12374f),
        clearHemi: new THREE.Color(0xb9dfff),
        battleHemi: new THREE.Color(0x93adc1),
        stormHemi: new THREE.Color(0x788ca8),
        clearGround: new THREE.Color(0x201009),
        battleGround: new THREE.Color(0x17131a),
        stormGround: new THREE.Color(0x0a0d16),
        clearSun: new THREE.Color(0xfff2d2),
        battleSun: new THREE.Color(0xd7e0e6),
        stormSun: new THREE.Color(0xa8c8ff),
        clearSail: new THREE.Color(0xd9c7a1),
        stormSail: new THREE.Color(0x847b70),
      } : undefined;
      const cloudAtmosphere = scene.userData.cloudAtmosphere as {
        groundMaterial: Three.MeshStandardMaterial;
        surfaceMaterials: Three.MeshStandardMaterial[];
        puffMaterial: Three.MeshStandardMaterial;
        stormClouds: Three.InstancedMesh;
        rain: Three.Points;
        rainPositions: Float32Array;
        halo: Three.Group;
        haloMaterials: Three.MeshBasicMaterial[];
        iceCrystals: Three.Points;
        icePositions: Float32Array;
        hemisphere: Three.HemisphereLight;
        sun: Three.DirectionalLight;
      } | undefined;
      const cloudWeatherColors = cloudAtmosphere ? {
        daySky: new THREE.Color(0x69c8f4),
        stormSky: new THREE.Color(0x41556f),
        iceSky: new THREE.Color(0x86cdec),
        dayFog: new THREE.Color(0x8ad7f6),
        stormFog: new THREE.Color(0x68788d),
        iceFog: new THREE.Color(0xc8f3ff),
        dayGround: new THREE.Color(0x85cbed),
        stormGround: new THREE.Color(0x61748a),
        iceGround: new THREE.Color(0xa9def2),
        daySurface: new THREE.Color(0xf8fcff),
        stormSurface: new THREE.Color(0xc5d0dc),
        iceSurface: new THREE.Color(0xdffaff),
        dayPuff: new THREE.Color(0xffffff),
        stormPuff: new THREE.Color(0x8e9daf),
        icePuff: new THREE.Color(0xcceeff),
        dayHemi: new THREE.Color(0xd9f2ff),
        stormHemi: new THREE.Color(0xa9bad0),
        iceHemi: new THREE.Color(0xe5fbff),
        dayGroundLight: new THREE.Color(0x657b55),
        stormGroundLight: new THREE.Color(0x3c4657),
        iceGroundLight: new THREE.Color(0x7296ad),
        daySun: new THREE.Color(0xfff2d2),
        stormSun: new THREE.Color(0xc8dcff),
        iceSun: new THREE.Color(0xe8fbff),
        lightningSky: new THREE.Color(0xe8f5ff),
        lightningFog: new THREE.Color(0xd7ecff),
      } : undefined;
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
        moonGlowMaterial: Three.MeshBasicMaterial;
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
        nightSky: new THREE.Color(0x071033),
        dayFog: new THREE.Color(0xa9ddf2),
        sunsetFog: new THREE.Color(0xf4aa78),
        nightFog: new THREE.Color(0x121a42),
        dayGround: new THREE.Color(0x78c9ed),
        sunsetGround: new THREE.Color(0xd97a58),
        nightGround: new THREE.Color(0x111833),
        dayRoad: new THREE.Color(0x41464b),
        sunsetRoad: new THREE.Color(0x765143),
        nightRoad: new THREE.Color(0x2b3568),
        dayConcrete: new THREE.Color(0xbfc7ca),
        sunsetConcrete: new THREE.Color(0xd99a79),
        nightConcrete: new THREE.Color(0x2b3768),
        dayDeck: new THREE.Color(0x50565d),
        sunsetDeck: new THREE.Color(0x704539),
        nightDeck: new THREE.Color(0x252c58),
        dayHemiSky: new THREE.Color(0xd9f2ff),
        sunsetHemiSky: new THREE.Color(0xffbd8c),
        nightHemiSky: new THREE.Color(0xb8ceff),
        dayHemiGround: new THREE.Color(0x657b55),
        sunsetHemiGround: new THREE.Color(0x6f3025),
        nightHemiGround: new THREE.Color(0x20294e),
        daySun: new THREE.Color(0xfff2d2),
        sunsetSun: new THREE.Color(0xff8b52),
        nightSun: new THREE.Color(0xd2e3ff),
        dayCurbA: new THREE.Color(0xf7f1e7),
        sunsetCurbA: new THREE.Color(0xffd3b0),
        nightCurbA: new THREE.Color(0xcff7ff),
        dayCurbB: new THREE.Color(0xc83f3f),
        sunsetCurbB: new THREE.Color(0xe86142),
        nightCurbB: new THREE.Color(0x8b57d8),
        sunsetRoadGlow: new THREE.Color(0xff6a28),
        nightRoadGlow: new THREE.Color(0x4968c4),
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
      const presentation = createRacePresentation(renderer, scene, camera, sun, mobileRenderTarget, courseDefinition.id);
      const visualEffects = createRaceVisualEffects(THREE, scene, mobileRenderTarget,
        courseDefinition.id === "custom" ? courseDefinition.theme : courseDefinition.id);
      let visualStormStrength = 0;
      let cameraView = cameraViewForViewport({ width: 16, height: 9 });
      let courseRenderWarmupIndex = 0;

      const selectedCharacter = CHARACTERS[selectedCharacterIndex] ?? CHARACTERS[0];
      const gojoTuning = gojoRaceTuning({ ultimate: ultimateGojo });
      const gojoUsesRecordedLine = Boolean(
        gojoLineRecord
        && gojoLineRecord.courseId === courseDefinition.id
        && gojoLineRecord.samples.length >= 2,
      );
      const ultimateGojoGenericAi = ultimateGojo && !gojoUsesRecordedLine;
      const rivalCharacters = timeTrialMode
        ? []
        : gojoChallenge
        ? [GOJO_CHARACTER]
        : [
            ...CHARACTERS.filter((_, index) => index !== selectedCharacterIndex),
            ...(gojoField ? [GOJO_CHARACTER] : []),
          ];
      const actorCharacters = [selectedCharacter, ...rivalCharacters];
      const actorCount = actorCharacters.length;
      const actorIds = Array.from({ length: actorCount }, (_, actorId) => actorId);
      const itemPickupReadyAt = Array(actorCount).fill(0) as number[];
      const gridSlots = [
        { progress: gojoChallenge ? -0.031 : -0.012, lane: -1.9 },
        { progress: -0.026, lane: 1.4 },
        { progress: -0.041, lane: -0.3 },
        { progress: -0.052, lane: 3.1 },
      ];
      const player = createKart(THREE, selectedCharacter.color, selectedCharacter.accent, true, selectedCharacter.animal);
      if (machineTuning.guide !== "none") {
        // Original flat, swept-back contact fins, not circular rollers.
        const finMaterial = new THREE.MeshStandardMaterial({ color: machineTuning.guide === "heavy" ? 0x344756 : 0x80d9df, metalness: 0.65, roughness: 0.32 });
        const fins = new THREE.Group();
        const heavy = machineTuning.guide === "heavy";
        for (const side of [-1, 1]) {
          const fin = new THREE.Mesh(new THREE.BoxGeometry(heavy ? 0.22 : 0.13, heavy ? 0.28 : 0.17, heavy ? 1.9 : 1.35), finMaterial);
          fin.position.set(side * 1.26, 0.5, -0.1);
          fin.rotation.y = side * 0.12;
          fins.add(fin);
        }
        (player.userData.visualRoot as Three.Group).add(fins);
      }
      const start = course.pointAt(PLAYER_START_PROGRESS);
      const getKartRoadSupport = (progress: number, lane: number, heading?: number) => {
        const center = course.pointAt(progress, lane);
        const facingDirection = heading === undefined || Math.cos(heading - center.heading) >= 0 ? 1 : -1;
        const front = course.pointAt(progress + facingDirection * KART_FRONT_AXLE_OFFSET / course.length, lane);
        const rear = course.pointAt(progress - facingDirection * KART_REAR_AXLE_OFFSET / course.length, lane);
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
      const ghostVisuals = timeTrialMode ? ghostRecords
        .filter((record) => record.version === 1 && record.courseId === courseDefinition.id && record.samples.length > 1)
        .map((record) => {
          const character = record.character === "Gojo"
            ? GOJO_CHARACTER
            : CHARACTERS.find((entry) => entry.name === record.character) ?? CHARACTERS[0];
          const ghost = createKart(
            THREE,
            record.kind === "staff" ? 0xffb52f : 0x40e9f2,
            record.kind === "staff" ? 0xffe69a : 0xb9ffff,
            false,
            character.animal,
          );
          ghost.name = record.kind === "staff" ? "STAFF GHOST" : "PERSONAL BEST GHOST";
          ghost.visible = false;
          ghost.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            const cloneGhostMaterial = (source: Three.Material) => {
              const material = source.clone();
              material.transparent = true;
              material.opacity = record.kind === "staff" ? 0.42 : 0.28;
              material.depthWrite = false;
              return material;
            };
            object.material = Array.isArray(object.material)
              ? object.material.map(cloneGhostMaterial)
              : cloneGhostMaterial(object.material);
            object.castShadow = false;
            object.receiveShadow = false;
          });
          scene.add(ghost);
          return { record, ghost, cursor: 0 };
        }) : [];
      const turboExhaust = createTurboExhaustVisual(THREE, playerVisualRoot);

      const rivalStates = rivalCharacters.map((character, index) => ({
        name: character.name,
        badge: character.badge,
        color: character.color,
        accent: character.accent,
        progress: gridSlots[index].progress,
        rankingProgress: gridSlots[index].progress,
        pace: character.name === "Gojo" ? gojoTuning.pace : 34,
        speed: 0,
        lane: gridSlots[index].lane,
        homeLane: gridSlots[index].lane,
        character,
        motionState: "grounded" as KartMotionState,
        item: "EMPTY" as ItemType,
        itemLevel: 0 as ItemLevel,
        shield: false,
        shieldLevel: 0 as ItemLevel,
        shieldUntil: 0,
        crashStart: 0,
        crashUntil: 0,
        boostUntil: 0,
        boostGravityUntil: 0,
        skillBoostUntil: 0,
        skillBoostMultiplier: 0,
        auroraUntil: 0,
        drifting: false,
        driftCharge: 0,
        driftBoost: 0,
        driftSide: 0,
        driftSlipVelocity: 0,
        driftCurveSign: 0,
        driftDecisionMade: false,
        driftCommittedUntil: 0,
        driftStartedAt: 0,
        driftMinimumUntil: 0,
        driftDecisionSeed: character.name.split("").reduce((sum, letter) => sum + letter.charCodeAt(0), 0) + index * 97,
        driftApproachKey: -1,
        driftNextScanProgress: gridSlots[index].progress,
        driftApproachSign: 0,
        driftApproachLane: gridSlots[index].lane,
        driftUseInsideLine: false,
        driftExitLane: gridSlots[index].lane,
        driftPhase: "entry" as CpuDriftPhase,
        driftCurveEntryProgress: 0,
        driftCurveExitProgress: 0,
        driftPeakSeverity: 0,
        driftPlannedStartProgress: 0,
        driftSafetyCheckAt: 0,
        driftSafetyLane: gridSlots[index].lane,
        driftSafetyCost: 0,
        avoidanceRouteCheckAt: 0,
        avoidanceRouteLane: gridSlots[index].lane,
        avoidanceThreatDistance: Number.POSITIVE_INFINITY,
        avoidanceRouteCost: 0,
        driftCountersteer: 0,
        driftPreviousSlipAngle: 0,
        driftRecoveryTicks: 0,
        cloudAvoidLane: 0,
        cloudAvoidUntilProgress: -1,
        cloudAvoidKey: "",
        airborne: false,
        airY: course.pointAt(gridSlots[index].progress, gridSlots[index].lane).y,
        airSpeed: 0,
        airGravity: STRONG_JUMP_GRAVITY,
        verticalVelocity: 0,
        surfaceVerticalVelocity: 0,
        airborneSince: 0,
        belowCourseSince: null as number | null,
        jumpCooldownUntil: 0,
        landingImpactUntil: 0,
        cloudFallUntil: 0,
        useAt: 0,
        skillReadyAt: 0,
        skillInitialDelay: character.name === "Gojo" ? gojoTuning.skillCooldownMs : skillCooldownFor(character),
        skillScheduled: false,
        gojoLastCometAt: 0,
        vectorTurboActive: false,
        vectorTurboHeading: course.pointAt(gridSlots[index].progress, gridSlots[index].lane).heading,
        vectorTurboLastX: course.pointAt(gridSlots[index].progress, gridSlots[index].lane).x,
        vectorTurboLastZ: course.pointAt(gridSlots[index].progress, gridSlots[index].lane).z,
        voltOverchargeActive: false,
        voltCharge: 0,
        voltTargetCharge: 0.75,
        voltActiveUntil: 0,
        voltOverheatedUntil: 0,
        voltRejectCurrentDrift: false,
        shortcutActive: false,
        shortcutProgress: 0,
        shortcutDuration: 1,
        shortcutStartProgress: 0,
        shortcutTargetProgress: 0,
        shortcutTargetLane: gridSlots[index].lane,
        shortcutLaunchVelocity: 0,
        shortcutAvoidOffset: 0,
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

      const pickupMaterial = new THREE.MeshPhysicalMaterial({ color: 0x45d6f1, emissive: 0x128eb8, emissiveIntensity: 0.72, roughness: 0.12, metalness: 0.25, transmission: 0.23, transparent: true, opacity: 0.9, flatShading: true });
      visualEffects.decoratePickup(pickupMaterial);
      const pickupInnerMaterial = new THREE.MeshStandardMaterial({ color: 0xffd45c, emissive: 0xf1a91d, emissiveIntensity: 0.9, roughness: 0.24, metalness: 0.42, flatShading: true });
      const itemRowLanes = gojoChallenge ? [-3, 3] : gojoField ? [-7, -3.5, 0, 3.5, 7] : ITEM_ROW_LANES;
      const pickupPoints = itemsEnabled ? ITEM_ROW_PROGRESS.flatMap((u, rowIndex) => itemRowLanes.map((lane, laneIndex) => {
        const p = course.pointAt(u, lane);
        const group = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.25, 1.25), pickupMaterial);
        box.rotation.set(0.18, Math.PI / 4, 0.15);
        box.castShadow = false;
        group.add(box);
        const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 1), pickupInnerMaterial);
        core.castShadow = false;
        group.add(core);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.83, 0.055, 6, 16), pickupInnerMaterial);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
        group.position.set(p.x, p.y + 1.35, p.z);
        scene.add(group);
        return { group, x: p.x, y: p.y, z: p.z, baseY: p.y + 1.35, progress: u, lane, active: true, respawnAt: 0, rowIndex, laneIndex };
      })) : [];

      const racerMeshes = [player, ...rivalMeshes];
      const racerVisualRoots = racerMeshes.map((mesh) => mesh.userData.visualRoot as Three.Group);
      const shieldBubbles = racerMeshes.map((mesh) => {
        const bubble = new THREE.Mesh(new THREE.SphereGeometry(2.45, 24, 16), visualEffects.shieldMaterial);
        bubble.position.y = 1.15;
        bubble.renderOrder = 3;
        bubble.visible = false;
        mesh.add(bubble);
        return bubble;
      });
      const auroraAuras = racerMeshes.map((mesh) => {
        const material = new THREE.MeshStandardMaterial({ color: 0xffef72, emissive: 0xffc928, emissiveIntensity: 1.8, transparent: true, opacity: 0.34, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
        const aura = new THREE.Mesh(new THREE.IcosahedronGeometry(2.55, 2), material);
        aura.position.y = 1.1;
        aura.renderOrder = 4;
        aura.visible = false;
        mesh.add(aura);
        return aura;
      });
      const spikeGuardAuras = racerMeshes.map((mesh) => {
        const guard = new THREE.Group();
        guard.position.y = 1.12;
        guard.visible = false;
        const shellMaterial = new THREE.MeshBasicMaterial({
          color: 0xff53d8,
          transparent: true,
          opacity: 0.48,
          wireframe: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(2.72, 2), shellMaterial);
        shell.renderOrder = 5;
        guard.add(shell);
        [0, Math.PI / 2, Math.PI / 4].forEach((tilt, index) => {
          const ringMaterial = new THREE.MeshBasicMaterial({
            color: index === 1 ? 0x67f4ff : 0xff7ce6,
            transparent: true,
            opacity: 0.78,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          });
          const ring = new THREE.Mesh(new THREE.TorusGeometry(2.86 + index * 0.07, 0.055, 6, 24), ringMaterial);
          ring.rotation.set(Math.PI / 2, tilt, index * 0.55);
          ring.renderOrder = 6;
          guard.add(ring);
        });
        mesh.add(guard);
        return guard;
      });

      const novaWaveMaterial = new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0, wireframe: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const novaWave = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), novaWaveMaterial);
      const novaRingMaterials = [0xfff3a6, 0xffa52f, 0xff4e3a].map((color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      const novaRings = novaRingMaterials.map((material, index) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35 + index * 0.42, 0.11 - index * 0.02, 6, 24), material);
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

      const homingMaterial = new THREE.MeshPhysicalMaterial({ color: 0xe9564f, emissive: 0xa71918, emissiveIntensity: 0.8, roughness: 0.22, metalness: 0.58, clearcoat: 0.8, flatShading: true });
      const pixelMaterial = new THREE.MeshPhysicalMaterial({ color: 0x58f4ff, emissive: 0xe9368d, emissiveIntensity: 1.6, roughness: 0.18, metalness: 0.46, clearcoat: 0.92, flatShading: true });
      const spikeMaterial = new THREE.MeshStandardMaterial({ color: 0x5d6267, roughness: 0.28, metalness: 0.88, flatShading: true });
      const trapBaseMaterial = new THREE.MeshStandardMaterial({ color: 0x262d31, roughness: 0.54, metalness: 0.5, flatShading: true });
      const trapWarningMaterial = new THREE.MeshStandardMaterial({ color: 0xff9b35, emissive: 0xff4f12, emissiveIntensity: 1.65, roughness: 0.28, metalness: 0.34, flatShading: true });

      const makeTrapMesh = () => {
        const group = new THREE.Group();
        const base = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.12, 0.15, 10), trapBaseMaterial);
        base.position.y = 0.1;
        base.castShadow = false;
        group.add(base);
        const warningRing = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.085, 6, 16), trapWarningMaterial);
        warningRing.position.y = 0.17;
        warningRing.rotation.x = Math.PI / 2;
        warningRing.castShadow = false;
        group.add(warningRing);
        [[0, 0], [-0.48, -0.32], [0.48, -0.32], [-0.42, 0.38], [0.42, 0.38]].forEach(([x, z]) => {
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.86, 6), spikeMaterial);
          spike.position.set(x, 0.52, z);
          spike.castShadow = false;
          group.add(spike);
        });
        return group;
      };

      type ProjectileState = {
        kind: "FIRE" | "HOMING" | "PIXEL";
        level: ItemLevel;
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
        terminalPursuit: boolean;
        fxBudget?: number;
        age: number;
        active: boolean;
      };
      type TrapState = {
        owner: number;
        level: ItemLevel;
        mode: "ground" | "orbit";
        group: Three.Group;
        x: number;
        y: number;
        z: number;
        orbitAngle: number;
        orbitRadius: number;
        armedAt: number;
        expiresAt: number;
        active: boolean;
      };
      type MonkeyState = { group: Three.Group; visual: ReturnType<typeof makeTrapMonkeyVisual>; progress: number; lane: number; direction: number; wanderPhase: number; nextTrapAt: number; actionUntil: number; placement: CoursePose | null };
      type ShootingStarState = { group: Three.Group; warning: Three.Mesh; progress: number; lane: number; y: number; fallSpeed: number; active: boolean };
      type SkillMeteorState = { group: Three.Group; warning: Three.Mesh; progress: number; lane: number; y: number; fallSpeed: number; owner: number; blue: boolean; active: boolean };
      type ShockWaveState = { group: Three.Group; material: Three.MeshBasicMaterial; startedAt: number; radius: number; active: boolean };
      type CometStormState = { owner: number; until: number; nextSpawnAt: number };
      type CometStreamState = {
        owner: number;
        gateIndex: number;
        targetGateCount: 1 | 2 | 3;
        gateProgress: number;
        gateDistanceMeters: number;
        gateLanes: [number, number, number];
        group: Three.Group;
        expiresAt: number;
        active: boolean;
      };
      type SkillVisualState = {
        actorId: number;
        skill: SkillId;
        group: Three.Group;
        materials: Three.MeshBasicMaterial[];
        startedAt: number;
        durationMs: number;
        phase: "activate" | "success" | "critical";
      };
      type ShatterState = { group: Three.Group; startedAt: number; active: boolean };
      type FlowLogState = { group: Three.Group; progress: number; lane: number; phase: number; channelIndex: number; surgeOnly: boolean };
      type StaticObstacleState = { group: Three.Group; progress: number; lane: number };
      type CannonState = { group: Three.Group; ball: Three.Group; progress: number; phase: number; lane: number; side: number; pattern: 0 | 1 | 2; shotIndex: number };
      type RollingBarrelState = { group: Three.Group; progress: number; start: number; end: number; phase: number; lanePhase: number };
      type PirateTentacleState = {
        group: Three.Group;
        segments: Three.InstancedMesh;
        suckers: Three.InstancedMesh;
        tip: Three.Mesh;
        curve: Three.CubicBezierCurve3;
        progress: number;
        lane: number;
        hitLane: number;
        targetSide: -1 | 1;
        phase: number;
        slamAmount: number;
        hitHalfWidth: number;
        attackStartedAt: number;
        cooldownUntil: number;
      };
      type CustomHazardState = {
        config: CreatorHazardPlacement;
        start: number;
        end: number;
        center: number;
        group: Three.Group;
        effect: Three.Group | null;
        nextAt: number;
        monkeyPlacedAt?: number;
        monkeyPlacement?: CoursePose;
      };
      type WaterFlowParticle = { channelIndex: number; progress: number; laneOffset: number; speed: number; phase: number; pose: CoursePose };
      const projectiles: ProjectileState[] = [];
      const traps: TrapState[] = [];
      const shootingStars: ShootingStarState[] = [];
      const skillMeteors: SkillMeteorState[] = [];
      const shockWaves: ShockWaveState[] = [];
      const cometStorms: CometStormState[] = [];
      const cometStreams: CometStreamState[] = [];
      const cometPointerProjection = new THREE.Vector3();
      const cometPointerDirection = new THREE.Vector3();
      const cometCameraForward = new THREE.Vector3();
      const skillVisuals: SkillVisualState[] = [];
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
        startLane?: number;
        targetLane?: number;
        recordedTurbo?: boolean;
      }>();
      const flowingLogs: FlowLogState[] = [];
      const beanstalks: StaticObstacleState[] = [];
      const cannons: CannonState[] = [];
      const rollingBarrels: RollingBarrelState[] = [];
      const pirateTentacles: PirateTentacleState[] = [];
      let pirateOctopus: Three.Group | null = null;
      let pirateBreachVisual: ReturnType<typeof createPirateBreachVisual> | null = null;
      let pirateBreachStartedAt = -1; // One entrance per race; attacks unlock after it settles.
      const tentacleSegmentAxis = new THREE.Vector3(0, 1, 0);
      const tentacleSuckerAxis = new THREE.Vector3(0, 0, 1);
      const tentaclePointA = new THREE.Vector3();
      const tentaclePointB = new THREE.Vector3();
      const tentacleMidpoint = new THREE.Vector3();
      const tentacleDirection = new THREE.Vector3();
      const tentacleDummy = new THREE.Object3D();
      const suckerDummy = new THREE.Object3D();
      const customHazardStates: CustomHazardState[] = [];
      const cloudPatches = (scene.userData.cloudPatches ?? []) as Three.Group[];
      const cloudGapKeys = new Set<string>();
      const customRoadPatches = (scene.userData.customRoadPatches ?? []) as Three.Group[];
      const customRoadGapKeys = new Set<string>();
      const selectedCloudGapKeys = new Set<string>();
      let nextCloudGapChangeAt = 0;
      let cloudGapCycleStartedAt = 0;
      let cloudStormStrength = 0;
      let cloudIceStrength = 0;
      let cloudWindAngle = Math.PI / 2;
      let cloudWindStrength = 0;
      let cloudWindTargetStrength = 0;
      let nextCloudWindChangeAt = 0;
      const cloudWindMaterial = new THREE.MeshBasicMaterial({
        color: 0xd9f7ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const cloudWindStreaks = courseDefinition.id === "cloud" && !timeTrialMode
        ? new THREE.InstancedMesh(new THREE.BoxGeometry(0.055, 0.04, 3.2), cloudWindMaterial, 28)
        : null;
      const cloudWindDummy = new THREE.Object3D();
      if (cloudWindStreaks) {
        cloudWindStreaks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        cloudWindStreaks.visible = false;
        cloudWindStreaks.frustumCulled = false;
        scene.add(cloudWindStreaks);
      }
      const waterUniforms = (scene.userData.waterUniforms ?? []) as Array<{ value: number }>;
      const waterFlow = scene.userData.waterFlow as { points: Three.Points; particles: WaterFlowParticle[] } | undefined;
      type RiverDamFlowState = {
        flowGroup: Three.Group;
        water: Three.Mesh;
        waterMaterial: Three.MeshPhysicalMaterial;
        extension: Three.Mesh;
        extensionMaterial: Three.MeshPhysicalMaterial;
        foam: Three.Points;
        foamPositions: Float32Array;
        crossings: Array<{ progress: number; along: number; roadY: number }>;
        flowX: number;
        flowZ: number;
        downstreamRise: number;
        downstreamRampStart: number;
      };
      const riverCycle = scene.userData.riverCycle as {
        gate: Three.Group;
        gatePanels: Three.Mesh[];
        reservoir: Three.Mesh;
        reservoirMaterial: Three.MeshPhysicalMaterial;
        damFlows: RiverDamFlowState[];
        waterMaterials: Three.MeshPhysicalMaterial[];
        waterMeshes: Three.Mesh[];
        flowMaterial: Three.PointsMaterial;
      } | undefined;
      let lastWaterFlowUpdateAt = 0;
      let riverFlowClock = 0;
      let riverSurgeStrength = 0;
      const runtimeRiverChannelAt = (progress: number, lane: number) => {
        const u = wrap01(progress);
        return RIVER_CHANNELS.find((channel) => u >= channel.start && u <= channel.end && Math.abs(lane - channel.lane) <= channel.halfWidth);
      };
      const riverDamFlowAt = (progress: number) => {
        if (!riverCycle || riverSurgeStrength <= 0.04) return undefined;
        const u = wrap01(progress);
        const extensionStrength = clamp((riverSurgeStrength - 0.58) / 0.42, 0, 1);
        const activeReach = Math.max(107, 103 + extensionStrength * 72);
        const halfRange = THREE.MathUtils.lerp(0.0065, 0.0135, riverSurgeStrength);
        return riverCycle.damFlows.find((flow) => flow.crossings.some(
          (crossing) => crossing.along <= activeReach && Math.abs(progressDelta(u, crossing.progress)) <= halfRange,
        ));
      };
      const riverDamCrossingAt = (progress: number) => Boolean(riverDamFlowAt(progress));

      const monkeys: MonkeyState[] = [];
      if (courseDefinition.id === "jungle" && !timeTrialMode) {
        const monkeyStartLanes = [-5.4, 3.2, -1.6, 5.1];
        [0.17, 0.39, 0.63, 0.86].forEach((progress, index) => {
          const lane = monkeyStartLanes[index];
          const direction = index % 3 === 1 ? -1 : 1;
          const point = course.pointAt(progress, lane);
          const visual = makeTrapMonkeyVisual(THREE, makeTrapMesh);
          const group = visual.root;
          group.position.set(point.x, point.y + 0.03, point.z);
          group.rotation.y = point.heading + (direction > 0 ? Math.PI : 0);
          group.scale.setScalar(1.12);
          group.traverse((object) => { if (object instanceof THREE.Mesh) object.castShadow = true; });
          scene.add(group);
          monkeys.push({ group, visual, progress, lane, direction, wanderPhase: index * 1.73, nextTrapAt: 0, actionUntil: 0, placement: null });
        });
      }

      if (courseDefinition.id === "river" && !timeTrialMode) {
        const bark = new THREE.MeshStandardMaterial({ color: 0x6d3f22, roughness: 0.96 });
        const cut = new THREE.MeshStandardMaterial({ color: 0xc4965f, roughness: 0.9 });
        markGeneratedSurface(bark, "bark", "uv", [3, 1.5]);
        markGeneratedSurface(cut, "endgrain", "uv");
        RIVER_CHANNELS.forEach((channel, index) => {
          [false, true].forEach((surgeOnly, logIndex) => {
            const progress = channel.start + (channel.end - channel.start) * (logIndex ? 0.68 : 0.35);
            const lane = channel.lane + ((index + logIndex) % 2 ? 1 : -1) * Math.min(1.5, channel.halfWidth * 0.3);
            const point = course.pointAt(progress, lane);
            const group = new THREE.Group();
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.68, 5.4, 18), [bark, cut, cut]);
            trunk.rotation.z = Math.PI / 2;
            trunk.position.y = 0.55;
            trunk.castShadow = true;
            group.add(trunk);
            [-1.3, 1.1].forEach((offset, branchIndex) => {
              const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.24, 1.55, 12), bark);
              branch.position.set(offset, 0.95, 0);
              branch.rotation.z = branchIndex ? -0.8 : 0.8;
              group.add(branch);
            });
            group.position.set(point.x, point.y + 0.34, point.z);
            group.rotation.y = point.heading;
            group.visible = !surgeOnly;
            scene.add(group);
            flowingLogs.push({ group, progress, lane, phase: index * 1.71 + logIndex * 0.93, channelIndex: index, surgeOnly });
          });
        });
      }

      if (courseDefinition.id === "cloud" && !timeTrialMode) {
        const stalkMat = new THREE.MeshStandardMaterial({ color: 0x3c9b3f, roughness: 0.82 });
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x69c751, roughness: 0.86, side: THREE.DoubleSide });
        markGeneratedSurface(stalkMat, "leaf", "uv", [3, 4]);
        markGeneratedSurface(leafMat, "leaf", "uv");
        [0.18, 0.41, 0.68, 0.86].forEach((progress, index) => {
          const lane = [-4.8, 4.2, -1.8, 5.3][index];
          const point = course.pointAt(progress, lane);
          const group = new THREE.Group();
          const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 1.2, 18 + index * 2.4, 8), stalkMat);
          stalk.position.y = 8.5 + index * 1.2;
          stalk.castShadow = true;
          group.add(stalk);
          for (let leafIndex = 0; leafIndex < 7; leafIndex += 1) {
            const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8 + (leafIndex % 2) * 0.35, 0), leafMat);
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

      if (courseDefinition.id === "pirate" && !timeTrialMode) {
        const iron = new THREE.MeshStandardMaterial({ color: 0x252a2e, roughness: 0.3, metalness: 0.88 });
        const wood = new THREE.MeshStandardMaterial({ color: 0x6d4024, roughness: 0.9 });
        const ballMaterial = new THREE.MeshStandardMaterial({ color: 0x12171b, emissive: 0x2a0c02, emissiveIntensity: 0.4, roughness: 0.22, metalness: 0.78 });
        [iron, ballMaterial].forEach((material) => markGeneratedSurface(material, "iron"));
        markGeneratedSurface(wood, "wood");
        const smokeMaterial = new THREE.MeshBasicMaterial({ color: 0xc5bbb0, transparent: true, opacity: 0.5, depthWrite: false });
        const cannonSpecs: Array<{ progress: number; pattern: 0 | 1 | 2; side: number; shotIndex: number; phase: number }> = [
          { progress: 0.28, pattern: 0, side: 1, shotIndex: 0, phase: 0.04 },
          { progress: 0.49, pattern: 1, side: 1, shotIndex: 0, phase: 0.32 },
          { progress: 0.49, pattern: 1, side: -1, shotIndex: 1, phase: 0.32 },
          { progress: 0.72, pattern: 2, side: 1, shotIndex: 0, phase: 0.61 },
          { progress: 0.72, pattern: 2, side: 1, shotIndex: 1, phase: 0.61 },
          { progress: 0.72, pattern: 2, side: 1, shotIndex: 2, phase: 0.61 },
        ];
        cannonSpecs.forEach(({ progress, pattern, side, shotIndex, phase }) => {
          const point = course.pointAt(progress, side * 16.2);
          const group = new THREE.Group();
          const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 1.05, 5.8, 10), iron);
          barrel.rotation.z = Math.PI / 2;
          barrel.position.set(-side * 1.15, 1.65, 0);
          barrel.castShadow = true;
          group.add(barrel);
          const carriage = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.8, 2.7), wood);
          carriage.position.y = 0.55;
          carriage.castShadow = true;
          group.add(carriage);
          [-1, 1].forEach((side) => {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.35, 10), iron);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(side * 1.25, 0.45, 1.25);
            group.add(wheel);
          });
          group.position.set(point.x, point.y, point.z);
          group.rotation.y = point.heading;
          scene.add(group);
          const ball = new THREE.Group();
          const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.18, 1), ballMaterial);
          core.castShadow = false;
          ball.add(core);
          for (let smokeIndex = 0; smokeIndex < 3; smokeIndex += 1) {
            const smoke = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42 + smokeIndex * 0.13, 0), smokeMaterial);
            smoke.position.x = side * (1.35 + smokeIndex * 0.62);
            smoke.scale.y = 0.72;
            ball.add(smoke);
          }
          ball.visible = false;
          scene.add(ball);
          cannons.push({ group, ball, progress, phase, lane: side * 14.2, side, pattern, shotIndex });
        });

        const rollingBarrelWood = new THREE.MeshStandardMaterial({ color: 0x86502b, roughness: 0.9 });
        const rollingBarrelIron = new THREE.MeshStandardMaterial({ color: 0x252a2e, roughness: 0.34, metalness: 0.82 });
        markGeneratedSurface(rollingBarrelWood, "wood", "uv", [2, 1]);
        markGeneratedSurface(rollingBarrelIron, "iron", "uv");
        for (let index = 0; index < 6; index += 1) {
          const group = new THREE.Group();
          const barrelPivot = new THREE.Group();
          barrelPivot.name = "rolling-barrel-pivot";
          const cask = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 0.98, 2.45, 10), rollingBarrelWood);
          cask.rotation.z = Math.PI / 2;
          barrelPivot.add(cask);
          [-0.82, 0, 0.82].forEach((x) => {
            const band = new THREE.Mesh(new THREE.TorusGeometry(1.03, 0.085, 6, 12), rollingBarrelIron);
            band.rotation.y = Math.PI / 2;
            band.position.x = x;
            barrelPivot.add(band);
          });
          group.add(barrelPivot);
          scene.add(group);
          rollingBarrels.push({ group, progress: 0.4, start: 0.405, end: 0.595, phase: index / 6, lanePhase: index * 1.47 });
        }

        const octopusSkin = new THREE.MeshStandardMaterial({ color: 0xd41420, emissive: 0x5b0508, emissiveIntensity: 0.5, roughness: 0.48, metalness: 0.02 });
        const octopusSucker = new THREE.MeshStandardMaterial({ color: 0xff6b6b, emissive: 0x8a1118, emissiveIntensity: 0.42, roughness: 0.4 });
        markGeneratedSurface(octopusSkin, "skin", "uv");
        markGeneratedSurface(octopusSucker, "skin", "uv", [1, 1]);
        const octopusEye = new THREE.MeshBasicMaterial({ color: 0xfff3b5 });
        pirateOctopus = new THREE.Group();
        pirateOctopus.name = "pirate-octopus";
        const octopusBody = new THREE.Mesh(new THREE.SphereGeometry(10.1, 28, 20), octopusSkin);
        octopusBody.scale.set(1.05, 1.25, 0.96);
        octopusBody.position.y = 9.2;
        pirateOctopus.add(octopusBody);
        [-1, 1].forEach((side) => {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.92, 20, 14), octopusEye);
          eye.position.set(side * 2.9, 11.55, -8.82);
          pirateOctopus?.add(eye);
          const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 10), new THREE.MeshBasicMaterial({ color: 0x4b0003 }));
          pupil.position.set(side * 2.9, 11.45, -9.62);
          pirateOctopus?.add(pupil);
          const eyebrow = new THREE.Mesh(
            new THREE.BoxGeometry(2.85, 0.48, 0.58),
            new THREE.MeshStandardMaterial({ color: 0x2a071e, emissive: 0x18030f, emissiveIntensity: 0.4, roughness: 0.7 }),
          );
          eyebrow.position.set(side * 2.9, 13.0, -9.58);
          eyebrow.rotation.z = side * 0.34;
          pirateOctopus?.add(eyebrow);
        });
        const mouthInner = new THREE.Mesh(
          new THREE.CircleGeometry(1.42, 32),
          new THREE.MeshBasicMaterial({ color: 0x160713, side: THREE.DoubleSide }),
        );
        mouthInner.position.set(0, 8.05, -9.76);
        mouthInner.scale.set(1.15, 0.72, 1);
        pirateOctopus.add(mouthInner);
        const mouthLip = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.31, 12, 32), octopusSucker);
        mouthLip.position.set(0, 8.05, -9.84);
        mouthLip.scale.set(1.15, 0.72, 1);
        pirateOctopus.add(mouthLip);
        const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 10), octopusSucker);
        tongue.position.set(0, 7.58, -9.98);
        tongue.scale.set(1.2, 0.5, 0.3);
        pirateOctopus.add(tongue);
        [-0.6, 0.6].forEach((x) => {
          const fang = new THREE.Mesh(new THREE.ConeGeometry(0.29, 0.9, 6), octopusEye);
          fang.position.set(x, 8.35, -10.05);
          fang.rotation.z = Math.PI;
          pirateOctopus?.add(fang);
        });
        // Positive lane is the ocean-facing (port/left) side of this course.
        const octopusPose = course.pointAt(0.905, 20.5);
        const courseCenter = new THREE.Vector3();
        for (let centerIndex = 0; centerIndex < 64; centerIndex += 1) {
          const centerPoint = course.pointAt(centerIndex / 64);
          courseCenter.add(new THREE.Vector3(centerPoint.x, centerPoint.y, centerPoint.z));
        }
        courseCenter.multiplyScalar(1 / 64);
        // One creature: distant in lap one, just its crown in lap two, then a
        // sudden ship-side breach. The existing attack remains lap-three-only.
        const foreshadowArms = createOctopusForeshadowArms(THREE, octopusSkin, octopusSucker);
        pirateOctopus.add(foreshadowArms);
        pirateOctopus.userData.foreshadowArms = foreshadowArms;
        pirateOctopus.userData.approach = 0;
        pirateOctopus.position.set(octopusPose.x + octopusPose.nx * 185, WORLD_GROUND_Y - 3.2, octopusPose.z + octopusPose.nz * 185);
        pirateOctopus.userData.baseX = octopusPose.x;
        pirateOctopus.userData.baseY = octopusPose.y - 3.3;
        pirateOctopus.userData.baseZ = octopusPose.z;
        pirateOctopus.userData.nx = octopusPose.nx;
        pirateOctopus.userData.nz = octopusPose.nz;
        pirateOctopus.rotation.y = Math.atan2(courseCenter.x - octopusPose.x, courseCenter.z - octopusPose.z) + Math.PI;
        pirateOctopus.userData.baseYaw = pirateOctopus.rotation.y;
        pirateOctopus.visible = true;
        scene.add(pirateOctopus);

        const breachPoint = course.pointAt(0.905, 11.7);
        pirateBreachVisual = createPirateBreachVisual(THREE, wood);
        const breach = pirateBreachVisual.group;
        breach.position.set(breachPoint.x, breachPoint.y + 0.4, breachPoint.z);
        breach.rotation.y = breachPoint.heading;
        breach.visible = false;
        pirateOctopus.userData.breach = breach;
        scene.add(breach);

        [
          { progress: 0.9, lane: 5.0, hitLane: 5.0, phase: 0.35, width: 8.8 },
        ].forEach(({ progress, lane, hitLane, phase, width }) => {
          const group = new THREE.Group();
          const segmentCount = 28;
          const segments = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.46, 1.22, 1, 16), octopusSkin, segmentCount);
          segments.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          segments.castShadow = false;
          segments.frustumCulled = false;
          group.add(segments);
          const suckerCount = 13;
          const suckers = new THREE.InstancedMesh(new THREE.TorusGeometry(0.44, 0.14, 10, 20), octopusSucker, suckerCount);
          suckers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          suckers.frustumCulled = false;
          group.add(suckers);
          const tip = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), octopusSkin);
          tip.scale.set(width * 0.5, 1.25, 3.45);
          tip.castShadow = false;
          tip.frustumCulled = false;
          group.add(tip);
          const bodyConnection = course.pointAt(0.905, 14.6);
          const roadTip = course.pointAt(progress, lane);
          const curve = new THREE.CubicBezierCurve3(
            new THREE.Vector3(bodyConnection.x, bodyConnection.y + 5.4, bodyConnection.z),
            new THREE.Vector3(bodyConnection.x, bodyConnection.y + 8.4, bodyConnection.z),
            new THREE.Vector3(roadTip.x, roadTip.y + 8.4, roadTip.z),
            new THREE.Vector3(roadTip.x, roadTip.y + 1.15, roadTip.z),
          );
          group.visible = false;
          scene.add(group);
          pirateTentacles.push({
            group,
            segments,
            suckers,
            tip,
            curve,
            progress,
            lane,
            hitLane,
            targetSide: 1,
            phase,
            slamAmount: 0,
            hitHalfWidth: width * 0.5,
            attackStartedAt: 0,
            cooldownUntil: 0,
          });
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
              new THREE.CylinderGeometry(Math.max(1.1, config.width * 0.22), Math.max(1.8, config.width * 0.42), 80, 8, 1, true),
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
            const monkeyVisual = makeTrapMonkeyVisual(THREE, makeTrapMesh);
            group.add(monkeyVisual.root);
            group.userData.monkeyVisual = monkeyVisual;
            group.position.set(point.x, point.y, point.z);
          } else if (config.type === "cannon") {
            const side = config.lane >= 0 ? 1 : -1;
            const point = course.pointAt(range.center, side * 14.5);
            const iron = new THREE.MeshStandardMaterial({ color: 0x20272c, roughness: 0.28, metalness: 0.86 });
            markGeneratedSurface(iron, "iron");
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 1.02, 5.2, 10), iron);
            barrel.rotation.z = Math.PI / 2;
            barrel.position.y = 1.45;
            group.add(barrel);
            const carriage = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.75, 2.4), new THREE.MeshStandardMaterial({ color: 0x704226, roughness: 0.9 }));
            markGeneratedSurface(carriage.material, "wood");
            carriage.position.y = 0.5;
            group.add(carriage);
            group.position.set(point.x, point.y, point.z);
            group.rotation.y = point.heading;
            effect = new THREE.Group();
            effect.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), iron));
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
      const exhaust = new THREE.Points(exhaustGeometry, new THREE.PointsMaterial({ map: presentation.glowTexture, color: 0xbfeeff, size: 0.44, transparent: true, opacity: 0.56, depthWrite: false }));
      scene.add(exhaust);
      let exhaustCursor = 0;

      const driftVisualEffects = createDriftVisualEffects(THREE, scene, mobileRenderTarget);
      let pendingTurboBurst = false;

      const playerState = {
        motionState: "grounded" as KartMotionState,
        x: start.x,
        y: start.y,
        z: start.z,
        heading: start.heading,
        pitch: startSupport.pitch,
        speed: 0,
        progress: PLAYER_START_PROGRESS,
        rankingProgress: PLAYER_START_PROGRESS,
        lastU: wrap01(PLAYER_START_PROGRESS),
        shield: false,
        shieldLevel: 0 as ItemLevel,
        shieldUntil: 0,
        crashStart: 0,
        crashUntil: 0,
        wasCrashing: false,
        boostUntil: 0,
        boostGravityUntil: 0,
        skillBoostUntil: 0,
        skillBoostMultiplier: 0,
        auroraUntil: 0,
        drifting: false,
        driftCharge: 0,
        driftChargeSuspended: false,
        driftChargeHoldUntil: 0,
        driftBoost: 0,
        driftBoostUsesTuning: true,
        driftSide: 0,
        driftSlipVelocity: 0,
        driftStartedAt: 0,
        driftEndedAt: -10000,
        driftLastSide: 0,
        driftLinkChain: 0,
        driftLinked: false,
        driftWallHit: false,
        wallBounceUntil: 0,
        wallBounceSide: 0,
        groundY: start.y,
        airborne: false,
        airGravity: STRONG_JUMP_GRAVITY,
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
        giantLeapCharging: false,
        giantLeapChargeStartedAt: 0,
        giantLowDashActive: false,
        giantLowDashUntil: 0,
        vectorTurboActive: false,
        vectorTurboUntil: Number.POSITIVE_INFINITY,
        voltOverchargeActive: false,
        voltCharge: 0,
        voltActiveUntil: 0,
        voltOverheatedUntil: 0,
        voltRejectCurrentDrift: false,
      };
      const suspendPlayerDriftCharge = (now: number) => {
        playerState.driftChargeSuspended = playerState.driftCharge > 0.001;
        playerState.driftChargeHoldUntil = playerState.driftChargeSuspended ? now + 2000 : 0;
        playerState.drifting = false;
        playerState.driftSlipVelocity = 0;
        if (!playerState.driftChargeSuspended) {
          playerState.driftEndedAt = -10000;
          playerState.driftLastSide = 0;
          playerState.driftLinkChain = 0;
          playerState.driftLinked = false;
        }
      };
      const playerTakeoffGravityAt = (now: number) => (
        takeoffGravity({
          now,
          boostGravityUntil: playerState.boostGravityUntil,
          drifting: playerState.drifting,
          driftBoost: playerState.driftBoost,
          jumpGravity: JUMP_GRAVITY,
          strongGravity: STRONG_JUMP_GRAVITY,
        })
      );
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
      let heldItemLevel: ItemLevel = 0;
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
      let postFinishStartedAt = 0;
      let postFinishActorOrder = [...actorIds];
      let lastMiniMapDraw = 0;
      let wasDriftDashing = false;
      let driftTurboFadeStartedAt = -10000;
      let driftTurboVisualStartedAt = -Infinity;
      const DRIFT_TURBO_FADE_MS = 460;
      const runStats: RaceRunStats = { crashCount: 0, driftTurbos: 0, shieldBlocks: 0, clearedGuardrail: false, wasLast: false };
      const recordedGhostSamples: GhostSample[] = [];
      const recordedGojoLineSamples: GojoLineSample[] = [];
      let lastGhostSampleAt = -Infinity;
      const captureGhostSample = (now: number, force = false) => {
        if (!timeTrialMode || !raceStart) return;
        if (!force && now - lastGhostSampleAt < GHOST_SAMPLE_INTERVAL_MS) return;
        lastGhostSampleAt = now;
        recordedGhostSamples.push([
          Math.max(0, Math.round(now - raceStart)),
          Number(playerState.x.toFixed(3)), Number(playerState.y.toFixed(3)), Number(playerState.z.toFixed(3)),
          Number(playerState.heading.toFixed(5)), Number(playerState.pitch.toFixed(5)), playerState.airborne ? 1 : 0,
        ]);
        if (recordGojoLine) {
          const driftFlags = (playerState.drifting ? 1 : 0) | (playerState.driftSide > 0 ? 2 : 0);
          recordedGojoLineSamples.push([
            Number(playerState.progress.toFixed(6)),
            Number(actorLane(0).toFixed(3)),
            driftFlags,
          ]);
        }
      };

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
      const actorRankingProgress = (actorId: number) => actorId === 0 ? playerState.rankingProgress : rivalStates[actorId - 1].rankingProgress;
      const actorSpeed = (actorId: number) => Math.abs(actorId === 0 ? playerState.speed : rivalStates[actorId - 1].speed);
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
      const finishedActorOrder: number[] = [];
      const actorRank = (actorId: number) => {
        const finishedIndex = finishedActorOrder.indexOf(actorId);
        if (finishedIndex >= 0) return finishedIndex + 1;
        return finishedActorOrder.length + 1 + actorIds.filter((otherId) => (
          otherId !== actorId
          && !finishedActorOrder.includes(otherId)
          && actorRankingProgress(otherId) > actorRankingProgress(actorId)
        )).length;
      };
      const finishPose = course.pointAt(0);
      const finishForward = { x: Math.sin(finishPose.heading), z: Math.cos(finishPose.heading) };
      const finishNormal = { x: finishPose.nx, z: finishPose.nz };
      const postFinishZoneProgress = Math.min(0.18, 100 / course.length);
      const postFinishZoneSamples = Array.from({ length: 65 }, (_, index) => {
        const u = postFinishZoneProgress * index / 64;
        return { ...course.pointAt(u), u };
      });
      const finishLayerSamples = Array.from({ length: 800 }, (_, index) => {
        const u = index / 800;
        return { ...course.pointAt(u), u };
      });
      const postFinishZoneRadius = BARRIER_LIMIT + KART_COLLISION_HALF_WIDTH;
      const finishOverheadProgressSeparation = Math.min(0.04, 18 / course.length);
      const isInsidePostFinishAirZone = (position: { x: number; y: number; z: number }) => (
        isInsideAirborneFinishZone({
          position,
          finishPoint: finishPose,
          finishForward,
          roadSamples: postFinishZoneSamples,
          overheadRoadSamples: finishLayerSamples,
          radius: postFinishZoneRadius,
          overheadProgressSeparation: finishOverheadProgressSeparation,
        })
      );
      const postFinishZoneEntryFraction = (
        previousPosition: { x: number; y: number; z: number },
        currentPosition: { x: number; y: number; z: number },
      ) => {
        if (isInsidePostFinishAirZone(previousPosition)) return 0;
        if (!isInsidePostFinishAirZone(currentPosition)) return null;
        let outside = 0;
        let inside = 1;
        for (let iteration = 0; iteration < 9; iteration += 1) {
          const amount = (outside + inside) * 0.5;
          const samplePosition = {
            x: THREE.MathUtils.lerp(previousPosition.x, currentPosition.x, amount),
            y: THREE.MathUtils.lerp(previousPosition.y, currentPosition.y, amount),
            z: THREE.MathUtils.lerp(previousPosition.z, currentPosition.z, amount),
          };
          if (isInsidePostFinishAirZone(samplePosition)) inside = amount;
          else outside = amount;
        }
        return inside;
      };
      const previousFinishSamples = actorIds.map((actorId) => {
        const pose = actorPose(actorId);
        return {
          position: { x: pose.x, y: pose.y, z: pose.z },
        };
      });
      const finishCheckpointReached = actorIds.map(() => false);
      const recordFinishLineCrossings = () => {
        const crossings: Array<{ actorId: number; fraction: number }> = [];
        actorIds.forEach((actorId) => {
          const pose = actorPose(actorId);
          const currentSample = {
            position: { x: pose.x, y: pose.y, z: pose.z },
          };
          const previousSample = previousFinishSamples[actorId];
          const actorOffRoad = actorId === 0
            ? Boolean(playerState.offTrackSince)
            : rivalStates[actorId - 1].shortcutActive;
          finishCheckpointReached[actorId] = finalLapCheckpointFromGroundContact({
            previousReached: finishCheckpointReached[actorId],
            courseProgress: actorProgress(actorId),
            totalLaps,
            airborne: actorAirborne(actorId),
            offRoad: actorOffRoad,
          });
          if (!finishedActorOrder.includes(actorId)) {
            const finishPlaneFraction = finishLineCrossingFraction({
              previousPosition: previousSample.position,
              currentPosition: currentSample.position,
              finishPoint: finishPose,
              finishForward,
              finishNormal,
              finishHalfWidth: BARRIER_LIMIT + KART_COLLISION_HALF_WIDTH,
              checkpointReached: finishCheckpointReached[actorId],
              roadSamples: postFinishZoneSamples,
              overheadRoadSamples: finishLayerSamples,
              roadRadius: postFinishZoneRadius,
              overheadProgressSeparation: finishOverheadProgressSeparation,
            });
            const previousInsidePostFinishZone = isInsidePostFinishAirZone(previousSample.position);
            const currentInsidePostFinishZone = isInsidePostFinishAirZone(currentSample.position);
            const zoneEntryFraction = postFinishZoneEntryFraction(
              previousSample.position,
              currentSample.position,
            );
            const airborneZoneFraction = airborneFinishZoneFraction({
              airborne: actorAirborne(actorId),
              checkpointReached: finishCheckpointReached[actorId],
              previousInside: previousInsidePostFinishZone,
              currentInside: currentInsidePostFinishZone,
              entryFraction: zoneEntryFraction ?? 1,
            });
            const fraction = finishPlaneFraction === null
              ? airborneZoneFraction
              : airborneZoneFraction === null
                ? finishPlaneFraction
                : Math.min(finishPlaneFraction, airborneZoneFraction);
            if (fraction !== null) crossings.push({ actorId, fraction });
          }
          previousFinishSamples[actorId] = currentSample;
        });
        crossings.sort((a, b) => a.fraction - b.fraction || a.actorId - b.actorId);
        crossings.forEach(({ actorId }) => finishedActorOrder.push(actorId));
        return crossings.some(({ actorId }) => actorId === 0);
      };
      const completedFinishOrder = () => [
        ...finishedActorOrder,
        ...actorIds
          .filter((actorId) => !finishedActorOrder.includes(actorId))
          .sort((a, b) => actorRankingProgress(b) - actorRankingProgress(a)),
      ];
      const sampleGojoLineAt = (progress: number, lookAheadMeters = 0) => {
        if (!gojoLineRecord || gojoLineRecord.courseId !== courseDefinition.id || gojoLineRecord.samples.length < 2) return null;
        const samples = gojoLineRecord.samples;
        const target = progress + lookAheadMeters / course.length;
        let low = 0;
        let high = samples.length - 1;
        while (low < high) {
          const middle = Math.floor((low + high) / 2);
          if (samples[middle][0] < target) low = middle + 1;
          else high = middle;
        }
        const nextIndex = clamp(low, 1, samples.length - 1);
        const previous = samples[nextIndex - 1];
        const next = samples[nextIndex];
        const span = Math.max(0.000001, next[0] - previous[0]);
        const amount = clamp((target - previous[0]) / span, 0, 1);
        return {
          lane: THREE.MathUtils.lerp(previous[1], next[1], amount),
          flags: amount < 0.5 ? previous[2] : next[2],
        };
      };
      const recordedGojoShortcuts = (courseDefinition.id === "starlight" || courseDefinition.id === "river")
        && gojoLineRecord?.courseId === courseDefinition.id
        ? extractRecordedLineShortcuts({ samples: gojoLineRecord.samples })
        : [];
      const findRecordedGojoShortcut = (actorId: number, searchDistance = 80) => {
        const rival = rivalStates[actorId - 1];
        if (!rival || rival.name !== "Gojo" || rival.airborne || rival.shortcutActive) return null;
        for (const shortcut of recordedGojoShortcuts) {
          const distanceToTakeoff = (shortcut.startProgress - rival.progress) * course.length;
          if (
            distanceToTakeoff >= -2.5
            && distanceToTakeoff <= searchDistance
            && shortcut.targetProgress < totalLaps - 0.006
            && !rival.shortcutKeys.has(shortcut.key)
          ) return {
            ...shortcut,
            // The line recorder freezes course progress while the kart is in
            // the air. Start from Gojo's current Ghost-following lane before
            // that freeze instead of teleporting to the frozen lane sample.
            startLane: rival.lane,
            distanceToTakeoff,
            recordedTurbo: true,
          };
        }
        return null;
      };
      const planGojoCloudAvoidance = (progress: number, speed: number, now: number) => {
        if (courseDefinition.id !== "cloud" || timeTrialMode || !cloudPatches.length || !cloudGapCycleStartedAt) return null;
        const tileCount = Math.max(1, cloudPatches.length / 2);
        const lookAheadMeters = 82;
        const sampleMeters = Math.max(2.4, (course.length / tileCount) * 0.42);
        const safeSpeed = Math.max(12, speed);
        for (let distance = 0; distance <= lookAheadMeters; distance += sampleMeters) {
          const futureProgress = progress + distance / course.length;
          const wrappedProgress = wrap01(futureProgress);
          const tileIndex = Math.floor(wrappedProgress * tileCount) % tileCount;
          const arrivalAt = now + distance / safeSpeed * 1000;
          const ageAtArrival = arrivalAt - cloudGapCycleStartedAt;
          const sideUnsafe = (side: -1 | 1) => {
            const key = `${tileIndex}:${side}`;
            if (!selectedCloudGapKeys.has(key)) return false;
            // Start steering during the visible beam warning and keep the tile
            // closed until its cloud surface has substantially returned.
            return cloudGapKeys.has(key) || (ageAtArrival >= 2150 && ageAtArrival <= 6150);
          };
          const negativeUnsafe = sideUnsafe(-1);
          const positiveUnsafe = sideUnsafe(1);
          if (negativeUnsafe === positiveUnsafe) continue;
          const unsafeSide: -1 | 1 = positiveUnsafe ? 1 : -1;
          const safeSide: -1 | 1 = unsafeSide === 1 ? -1 : 1;
          const lapBase = Math.floor(futureProgress);
          const tileExitProgress = lapBase + (tileIndex + 1) / tileCount;
          return {
            key: `${cloudGapCycleStartedAt}:${tileIndex}:${unsafeSide}`,
            distance,
            unsafeSide,
            safeLane: safeSide * 5.8,
            exitProgress: tileExitProgress + 9 / course.length,
          };
        }
        return null;
      };
      const findUpcomingCpuCurve = (progress: number, speed: number) => {
        const sampleMeters = 3;
        const sampleProgress = sampleMeters / course.length;
        // Ten kart lengths is roughly 38m. Scan well beyond that so the CPU can
        // finish moving to the inside before it commits to the slide.
        // A three-second slide still needs a long setup at racing speed. Find
        // the bend before the CPU reaches the usual turn-in zone.
        const searchMeters = clamp(150 + speed * 2.15, 190, 250);
        const sampleCount = Math.ceil(searchMeters / sampleMeters);
        let foundEntry = false;
        let quietSamples = 0;
        let curveSign = 0;
        let entryProgress = progress + sampleProgress;
        let exitProgress = progress + searchMeters / course.length;
        let peakSeverity = 0;
        for (let sampleIndex = 1; sampleIndex <= sampleCount; sampleIndex += 1) {
          const sampleU = progress + sampleProgress * sampleIndex;
          const sample = course.pointAt(sampleU);
          const nextSample = course.pointAt(sampleU + sampleProgress);
          let sampleTurn = nextSample.heading - sample.heading;
          if (sampleTurn > Math.PI) sampleTurn -= TAU;
          if (sampleTurn < -Math.PI) sampleTurn += TAU;
          const sampleSeverity = Math.abs(sampleTurn) * (0.012 / sampleProgress);
          const sampleSign = sampleSeverity > 0.018 ? Math.sign(sampleTurn) : 0;
          if (!foundEntry && sampleSign !== 0 && sampleSeverity > 0.024) {
            foundEntry = true;
            curveSign = sampleSign;
            entryProgress = sampleU;
          }
          if (!foundEntry) continue;
          if (sampleSign === curveSign) peakSeverity = Math.max(peakSeverity, sampleSeverity);
          quietSamples = sampleSign !== curveSign || sampleSeverity < 0.014 ? quietSamples + 1 : 0;
          if (quietSamples >= 3) {
            exitProgress = sampleU - sampleProgress * 2;
            break;
          }
        }
        return {
          found: foundEntry,
          sign: curveSign,
          entryProgress,
          exitProgress,
          entryDistanceMeters: Math.max(0, (entryProgress - progress) * course.length),
          peakSeverity,
        };
      };

      type CpuLaneThreat = { progress: number; lane: number; radius: number; weight: number };
      const forwardCourseDistance = (targetProgress: number, fromProgress: number) =>
        wrap01(wrap01(targetProgress) - wrap01(fromProgress)) * course.length;
      const cpuLaneThreats = (progress: number, now: number) => {
        const threats: CpuLaneThreat[] = [];
        const addWrappedThreat = (threatProgress: number, lane: number, radius: number, weight: number) => {
          const distance = forwardCourseDistance(threatProgress, progress);
          if (distance > CPU_OBSTACLE_LOOKAHEAD_METERS) return;
          threats.push({ progress: progress + distance / course.length, lane, radius, weight });
        };
        traps.forEach((trap) => {
          if (!trap.active) return;
          const nearest = course.nearest(trap.x, trap.z, wrap01(progress));
          if (Math.abs(trap.y - nearest.pose.y) < 3.5) {
            const trapLane = (trap.x - nearest.pose.x) * nearest.pose.nx + (trap.z - nearest.pose.z) * nearest.pose.nz;
            addWrappedThreat(nearest.u, trapLane, 2.25, 4.8);
          }
        });
        monkeys.forEach((monkey) => addWrappedThreat(monkey.progress, monkey.lane, 2.7, 4.2));
        flowingLogs.forEach((log) => {
          if (log.group.visible) addWrappedThreat(log.progress, log.lane, 3.1, 3.6);
        });
        beanstalks.forEach((beanstalk) => addWrappedThreat(beanstalk.progress, beanstalk.lane, 2.9, 4.4));
        cannons.forEach((cannon) => {
          if (cannon.ball.visible) addWrappedThreat(cannon.progress, cannon.lane, 3.4, 5.2);
        });
        rollingBarrels.forEach((barrel) => {
          if (barrel.group.visible) {
            const pose = course.nearest(barrel.group.position.x, barrel.group.position.z, wrap01(progress));
            const lane = (barrel.group.position.x - pose.pose.x) * pose.pose.nx + (barrel.group.position.z - pose.pose.z) * pose.pose.nz;
            addWrappedThreat(pose.u, lane, 2.6, 4.3);
          }
        });
        pirateTentacles.forEach((tentacle) => {
          if (tentacle.group.visible && (tentacle.attackStartedAt > 0 || tentacle.slamAmount > 0.1)) {
            addWrappedThreat(tentacle.progress, tentacle.hitLane, tentacle.hitHalfWidth + 1.2, 6.4);
          }
        });
        shootingStars.forEach((star) => {
          if (star.active) addWrappedThreat(star.progress, star.lane, 2.5, 4.7);
        });
        skillMeteors.forEach((meteor) => {
          if (meteor.active) addWrappedThreat(meteor.progress, meteor.lane, 2.5, 4.7);
        });
        customHazardStates.forEach((state) => {
          if (!state.config.enabled || !state.group.visible) return;
          if (state.config.type === "monkey") {
            const pose = course.nearest(state.group.position.x, state.group.position.z, wrap01(progress));
            const lane = (state.group.position.x - pose.pose.x) * pose.pose.nx + (state.group.position.z - pose.pose.z) * pose.pose.nz;
            addWrappedThreat(pose.u, lane, 2.7, 4.2);
          } else if (state.config.type === "cannon" && state.effect?.visible) {
            const pose = course.nearest(state.effect.position.x, state.effect.position.z, wrap01(progress));
            const lane = (state.effect.position.x - pose.pose.x) * pose.pose.nx + (state.effect.position.z - pose.pose.z) * pose.pose.nz;
            addWrappedThreat(pose.u, lane, 3.2, 5.0);
          }
        });
        return threats;
      };

      const planCpuObstacleRoute = ({
        actorId,
        fromProgress,
        fromLane,
        preferredLane,
        now,
      }: {
        actorId: number;
        fromProgress: number;
        fromLane: number;
        preferredLane: number;
        now: number;
      }) => {
        const safeLimit = CPU_DRIFT_SAFETY_LANE_LIMIT;
        const horizonMeters = Math.min(CPU_OBSTACLE_LOOKAHEAD_METERS, Math.max(80, course.length - 12));
        const routeThreats = cpuLaneThreats(fromProgress, now).filter((threat) =>
          (threat.progress - fromProgress) * course.length <= horizonMeters,
        );
        const ownSpeed = Math.max(8, actorSpeed(actorId));

        // Moving racers are added at their predicted catch point. This prevents
        // an overtake path from being planned through a kart that is currently
        // far ahead but will be caught inside the 500 m horizon.
        for (let otherId = 0; otherId < actorCount; otherId += 1) {
          if (otherId === actorId || actorAirborne(otherId)) continue;
          const gapMeters = forwardCourseDistance(actorProgress(otherId), fromProgress);
          if (gapMeters < 1.5 || gapMeters > horizonMeters) continue;
          const closingSpeed = ownSpeed - actorSpeed(otherId);
          const catchDistance = closingSpeed > 0.5
            ? gapMeters * ownSpeed / closingSpeed
            : gapMeters <= 15
              ? gapMeters
              : Number.POSITIVE_INFINITY;
          if (!Number.isFinite(catchDistance) || catchDistance > horizonMeters) continue;
          routeThreats.push({
            progress: fromProgress + catchDistance / course.length,
            lane: actorLane(otherId),
            radius: 2.8,
            weight: 6.2,
          });
        }

        const nearestThreatDistance = routeThreats.reduce(
          (nearest, threat) => Math.min(nearest, Math.max(0, (threat.progress - fromProgress) * course.length)),
          Number.POSITIVE_INFINITY,
        );
        const baseLanes = [-safeLimit, -7.1, -4.75, -2.35, 0, 2.35, 4.75, 7.1, safeLimit, fromLane, preferredLane];
        const laneChoices = [...new Set(baseLanes.map((lane) => clamp(lane, -safeLimit, safeLimit).toFixed(3)))]
          .map(Number)
          .sort((a, b) => a - b);
        const stageCount = Math.ceil(horizonMeters / CPU_OBSTACLE_ROUTE_STEP_METERS);
        type RouteNode = { lane: number; cost: number; firstLane: number };
        let routeNodes: RouteNode[] = [{ lane: clamp(fromLane, -safeLimit, safeLimit), cost: 0, firstLane: fromLane }];

        for (let stage = 1; stage <= stageCount; stage += 1) {
          const stageDistance = Math.min(horizonMeters, stage * CPU_OBSTACLE_ROUTE_STEP_METERS);
          const previousDistance = Math.min(horizonMeters, (stage - 1) * CPU_OBSTACLE_ROUTE_STEP_METERS);
          const segmentMeters = Math.max(1, stageDistance - previousDistance);
          const nextNodes: RouteNode[] = [];
          laneChoices.forEach((candidateLane) => {
            let bestNode: RouteNode | null = null;
            routeNodes.forEach((previousNode) => {
              const laneTravel = Math.abs(candidateLane - previousNode.lane);
              const maxLaneTravel = 4.9 * (segmentMeters / CPU_OBSTACLE_ROUTE_STEP_METERS);
              if (laneTravel > maxLaneTravel + 0.01) return;
              let cost = previousNode.cost
                + laneTravel * 0.16
                + Math.abs(candidateLane - preferredLane) * 0.011;
              const edgeRatio = Math.abs(candidateLane) / safeLimit;
              if (edgeRatio > 0.84) cost += (edgeRatio - 0.84) * 7.5;

              routeThreats.forEach((threat) => {
                const threatDistance = (threat.progress - fromProgress) * course.length;
                if (threatDistance < previousDistance - 3 || threatDistance > stageDistance + 3) return;
                const segmentAmount = clamp((threatDistance - previousDistance) / segmentMeters, 0, 1);
                const laneAtThreat = THREE.MathUtils.lerp(previousNode.lane, candidateLane, segmentAmount);
                const laneGap = Math.abs(laneAtThreat - threat.lane);
                const clearance = threat.radius + 1.45;
                if (laneGap < clearance) {
                  cost += (clearance - laneGap + 1) * threat.weight * 9000;
                } else if (laneGap < clearance + 2.8) {
                  cost += (clearance + 2.8 - laneGap) * threat.weight * 1.8;
                }
              });

              if (!bestNode || cost < bestNode.cost) {
                bestNode = {
                  lane: candidateLane,
                  cost,
                  firstLane: stage === 1 ? candidateLane : previousNode.firstLane,
                };
              }
            });
            if (bestNode) nextNodes.push(bestNode);
          });
          if (!nextNodes.length) break;
          routeNodes = nextNodes;
        }

        const bestRoute = routeNodes.reduce((best, node) => node.cost < best.cost ? node : best, routeNodes[0]);
        return {
          lane: clamp(bestRoute?.firstLane ?? preferredLane, -safeLimit, safeLimit),
          cost: bestRoute?.cost ?? 0,
          nearestThreatDistance,
        };
      };

      const chooseCpuSafeLane = ({
        actorId,
        fromProgress,
        fromLane,
        targetProgress,
        preferredLane,
        now,
      }: {
        actorId: number;
        fromProgress: number;
        fromLane: number;
        targetProgress: number;
        preferredLane: number;
        now: number;
      }) => {
        const safeLimit = BARRIER_LIMIT - 1.25;
        const travelMeters = clamp((targetProgress - fromProgress) * course.length, 8, CPU_OBSTACLE_LOOKAHEAD_METERS);
        const threats = cpuLaneThreats(fromProgress, now);
        const candidateLanes = [
          preferredLane,
          preferredLane - 2.4,
          preferredLane + 2.4,
          preferredLane - 4.8,
          preferredLane + 4.8,
          fromLane,
          0,
        ].map((lane) => clamp(lane, -safeLimit, safeLimit));
        let bestLane = candidateLanes[0];
        let bestCost = Number.POSITIVE_INFINITY;
        candidateLanes.forEach((candidateLane, candidateIndex) => {
          let cost = Math.abs(candidateLane - preferredLane) * 0.34 + candidateIndex * 0.002;
          const edgeRatio = Math.abs(candidateLane) / safeLimit;
          if (edgeRatio > 0.82) cost += (edgeRatio - 0.82) * 8;
          for (let otherId = 0; otherId < actorCount; otherId += 1) {
            if (otherId === actorId || actorAirborne(otherId)) continue;
            const gapMeters = (actorProgress(otherId) - fromProgress) * course.length;
            if (gapMeters < -3.5 || gapMeters > travelMeters + 11) continue;
            const arrivalSeconds = clamp(gapMeters / Math.max(12, actorSpeed(actorId)), 0, 3.2);
            const predictedGap = gapMeters + actorSpeed(otherId) * arrivalSeconds - actorSpeed(actorId) * arrivalSeconds;
            if (predictedGap < -5 || predictedGap > 9) continue;
            const pathAmount = clamp(gapMeters / travelMeters, 0, 1);
            const plannedLane = THREE.MathUtils.lerp(fromLane, candidateLane, pathAmount);
            const laneGap = Math.abs(actorLane(otherId) - plannedLane);
            if (laneGap < 4.2) cost += (4.2 - laneGap) * 2.8 + (9 - Math.abs(predictedGap)) * 0.42;
          }
          threats.forEach((threat) => {
            const distanceMeters = (threat.progress - fromProgress) * course.length;
            if (distanceMeters < -2 || distanceMeters > travelMeters + 4) return;
            const pathAmount = clamp(distanceMeters / travelMeters, 0, 1);
            const plannedLane = THREE.MathUtils.lerp(fromLane, candidateLane, pathAmount);
            const laneGap = Math.abs(threat.lane - plannedLane);
            const clearance = threat.radius + 1.35;
            if (laneGap < clearance) cost += (clearance - laneGap) * threat.weight;
          });
          if (cost < bestCost) {
            bestCost = cost;
            bestLane = candidateLane;
          }
        });
        return { lane: bestLane, cost: bestCost };
      };
      const getRoadSeparationProfile = (
        progress: number,
        lane: number,
        signedTrackSpeed: number,
        verticalSpeed: number,
        gravity = JUMP_GRAVITY,
      ) => {
        const center = course.pointAt(progress, lane);
        const sampleTimes = [0.08, 0.14, 0.22, 0.34];
        let nearClearance = Number.NEGATIVE_INFINITY;
        let maxClearance = Number.NEGATIVE_INFINITY;
        let maxRoadDrop = 0;
        sampleTimes.forEach((time) => {
          const roadAhead = course.pointAt(progress + (signedTrackSpeed * time) / course.length, lane);
          const inertialY = center.y + verticalSpeed * time - 0.5 * gravity * time * time;
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
        let previousGuardrailClearance = from.y - (startSurface.pose.y + GUARDRAIL_TOP_OFFSET);
        for (let index = 1; index <= sampleCount; index += 1) {
          const amount = index / sampleCount;
          const x = THREE.MathUtils.lerp(from.x, to.x, amount);
          const y = THREE.MathUtils.lerp(from.y, to.y, amount);
          const z = THREE.MathUtils.lerp(from.z, to.z, amount);
          const surface = course.nearestSurface(x, y, z, currentHint);
          const lane = (x - surface.pose.x) * surface.pose.nx + (z - surface.pose.z) * surface.pose.nz;
          const clearance = y - surface.pose.y;
          const guardrailClearance = y - (surface.pose.y + GUARDRAIL_TOP_OFFSET);
          const followsCurrentSection = currentHint === undefined || Math.abs(progressDelta(surface.u, currentHint)) < 0.08;
          const withinRoadFootprint = isWithinRoadFootprint({
            surfaceDistance: surface.distance,
            lane,
            // Before the kart clears the guardrail, the logical road support
            // must reach the same center-line boundary as the wall collision.
            // Otherwise a short automatic hop beside the rail can fall through
            // the visible shoulder between the asphalt and the guardrail.
            roadHalfWidth: playerState.offTrackSince ? COURSE_WIDTH : BARRIER_LIMIT,
            kartHalfWidth: KART_COLLISION_HALF_WIDTH,
            minimumKartOverlapFraction: KART_LANDING_OVERLAP_FRACTION,
          });
          const withinGuardrailFootprint = overlapsGuardrailByFraction({
            lane,
            guardrailLane: BARRIER_LANE,
            kartHalfWidth: KART_COLLISION_HALF_WIDTH,
            minimumKartOverlapFraction: KART_LANDING_OVERLAP_FRACTION,
          });
          if (
            followsCurrentSection
            && (
              (withinRoadFootprint && previousClearance >= -0.08 && clearance <= 0.035)
              || (withinGuardrailFootprint && previousGuardrailClearance >= -0.08 && guardrailClearance <= 0.035)
            )
          ) {
            return {
              surface,
              lane,
              amount,
              kind: withinGuardrailFootprint
                && previousGuardrailClearance >= -0.08
                && guardrailClearance <= 0.035
                ? "guardrail" as const
                : "road" as const,
            };
          }
          if (followsCurrentSection) currentHint = surface.u;
          previousClearance = clearance;
          previousGuardrailClearance = guardrailClearance;
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
        playerState.rankingProgress = playerState.recoveryProgress;
        playerState.lastU = playerState.recoveryU;
        playerState.groundY = recovery.y;
        playerState.airborne = false;
        playerState.airGravity = STRONG_JUMP_GRAVITY;
        playerState.motionState = "grounded";
        playerState.airborneSince = 0;
        playerState.belowCourseSince = null;
        playerState.verticalVelocity = 0;
        playerState.surfaceVerticalVelocity = 0;
        playerState.offTrackSince = 0;
        playerState.giantLowDashActive = false;
        playerState.giantLowDashUntil = 0;
        playerState.drifting = false;
        playerState.driftCharge = 0;
        playerState.driftChargeSuspended = false;
        playerState.driftChargeHoldUntil = 0;
        playerState.driftSlipVelocity = 0;
        playerState.driftEndedAt = -10000;
        playerState.driftLastSide = 0;
        playerState.driftLinkChain = 0;
        playerState.driftLinked = false;
        playerState.landingImpactUntil = now + 360;
        playerState.jumpCooldownUntil = now + JUMP_COOLDOWN_MS;
        audioController.play("land");
      };
      const actorCrashing = (actorId: number, now: number) => actorId === 0
        ? playerState.motionState === "crashing" || now < playerState.crashUntil
        : rivalStates[actorId - 1].motionState === "crashing" || now < rivalStates[actorId - 1].crashUntil;
      const actorAirborne = (actorId: number) => actorId === 0
        ? playerState.motionState === "airborne" || playerState.motionState === "falling" || playerState.airborne
        : rivalStates[actorId - 1].motionState === "airborne" || rivalStates[actorId - 1].motionState === "falling" || rivalStates[actorId - 1].airborne;
      const actorHasShield = (actorId: number, now = simulationNow) => actorId === 0
        ? playerState.shield && now < playerState.shieldUntil
        : rivalStates[actorId - 1].shield && now < rivalStates[actorId - 1].shieldUntil;
      const actorOrbitGuard = (actorId: number) => traps.find((trap) =>
        trap.active
        && trap.mode === "orbit"
        && trap.owner === actorId
        && spikeGrantsGuard(trap.level),
      ) ?? null;
      const actorShieldLevel = (actorId: number): ItemLevel => actorId === 0
        ? playerState.shieldLevel
        : rivalStates[actorId - 1].shieldLevel;
      const actorAuroraUntil = (actorId: number) => actorId === 0 ? playerState.auroraUntil : rivalStates[actorId - 1].auroraUntil;
      const setActorShield = (actorId: number, active: boolean, level: ItemLevel = 0, until = 0) => {
        if (actorId === 0) {
          playerState.shield = active;
          playerState.shieldLevel = active ? level : 0;
          playerState.shieldUntil = active ? until : 0;
          if (!active) playerState.auroraUntil = 0;
          onShieldChange(active, active ? level : 0);
        } else {
          const rival = rivalStates[actorId - 1];
          rival.shield = active;
          rival.shieldLevel = active ? level : 0;
          rival.shieldUntil = active ? until : 0;
          if (!active) rival.auroraUntil = 0;
        }
      };
      const setActorItem = (actorId: number, item: ItemType, level: ItemLevel, now: number) => {
        if (actorId === 0) {
          heldItem = item;
          heldItemLevel = item === "EMPTY" ? 0 : level;
          onItemChange(item, heldItemLevel);
        } else {
          const rival = rivalStates[actorId - 1];
          rival.item = item;
          rival.itemLevel = item === "EMPTY" ? 0 : level;
          rival.useAt = item === "EMPTY"
            ? 0
            : rival.name === "Gojo"
              ? now + 180 + Math.random() * 320
              : now + 750 + Math.random() * 1850;
        }
      };
      const actorItem = (actorId: number) => actorId === 0 ? heldItem : rivalStates[actorId - 1].item;
      const actorItemLevel = (actorId: number): ItemLevel => actorId === 0 ? heldItemLevel : rivalStates[actorId - 1].itemLevel;
      const rollItem = (rank: number): ItemType => {
        if (rank === actorCount && Math.random() < 0.05) return "NOVA";
        const weighted = rank >= 3
          ? ["HOMING", "BOOST", "BOOST", "SPIKES", "SHIELD", "SHIELD", "FIRE"] as ItemType[]
          : [...STANDARD_ITEMS, "FIRE", "SPIKES"] as ItemType[];
        return weighted[Math.floor(Math.random() * weighted.length)];
      };
      const crashActor = (actorId: number, now: number, durationMs = CRASH_DURATION_MS) => {
        if (actorCrashing(actorId, now)) return false;
        audioController.play(actorId === 0 ? "crash" : "hit");
        if (actorId === 0) {
          runStats.crashCount += 1;
          onRunEvent("crash");
          const road = course.nearestSurface(playerState.x, playerState.y, playerState.z, playerState.lastU).pose;
          playerState.crashStart = now;
          playerState.crashUntil = now + durationMs;
          playerState.speed = 0;
          playerState.y = road.y;
          playerState.groundY = road.y;
          playerState.airborne = false;
          playerState.belowCourseSince = null;
          playerState.airGravity = STRONG_JUMP_GRAVITY;
          playerState.motionState = "crashing";
          playerState.verticalVelocity = 0;
          playerState.surfaceVerticalVelocity = 0;
          playerState.offTrackSince = 0;
          playerState.jumpCooldownUntil = now + JUMP_COOLDOWN_MS;
          playerState.drifting = false;
          playerState.driftCharge = 0;
          playerState.driftChargeSuspended = false;
          playerState.driftChargeHoldUntil = 0;
          playerState.driftBoost = 0;
          playerState.driftSlipVelocity = 0;
          playerState.driftEndedAt = -10000;
          playerState.driftLastSide = 0;
          playerState.driftLinkChain = 0;
          playerState.driftLinked = false;
          playerState.vectorTurboActive = false;
          playerState.voltOverchargeActive = false;
          playerState.voltCharge = 0;
          playerState.voltRejectCurrentDrift = false;
        } else {
          const rival = rivalStates[actorId - 1];
          rival.crashStart = now;
          rival.crashUntil = now + durationMs;
          rival.shortcutActive = false;
          rival.shortcutProgress = 0;
          pendingRivalShortcuts.delete(actorId);
          rival.airborne = false;
          rival.rankingProgress = rival.progress;
          rival.airGravity = STRONG_JUMP_GRAVITY;
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
          rival.driftSlipVelocity = 0;
          rival.driftDecisionMade = false;
          rival.driftStartedAt = 0;
          rival.driftMinimumUntil = 0;
          rival.driftCurveSign = 0;
          rival.driftApproachKey = -1;
          rival.driftNextScanProgress = rival.progress;
          rival.driftApproachSign = 0;
          rival.driftPeakSeverity = 0;
          rival.driftSafetyCheckAt = 0;
          rival.driftSafetyLane = rival.lane;
          rival.driftSafetyCost = 0;
          rival.avoidanceRouteCheckAt = 0;
          rival.avoidanceRouteLane = rival.lane;
          rival.avoidanceThreatDistance = Number.POSITIVE_INFINITY;
          rival.avoidanceRouteCost = 0;
          rival.driftPhase = "entry";
          rival.driftCountersteer = 0;
          rival.driftPreviousSlipAngle = 0;
          rival.driftRecoveryTicks = 0;
          rival.vectorTurboActive = false;
          rival.voltOverchargeActive = false;
          rival.voltCharge = 0;
          rival.voltRejectCurrentDrift = false;
          rival.speed = 9;
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
      const attackActor = (targetId: number, attack: AttackType, now: number, sourceActorId: number | null = null) => {
        if (actorCrashing(targetId, now)) return "ignored" as const;
        const shieldable = isShieldableAttack(attack);
        if (shieldable && now < actorAuroraUntil(targetId)) {
          if (targetId === 0) audioController.play("shield");
          return "blocked" as const;
        }
        if (isSpikeGuardAttack(attack)) {
          const orbitGuard = actorOrbitGuard(targetId);
          if (orbitGuard) {
            orbitGuard.active = false;
            orbitGuard.group.visible = false;
            if (targetId === 0) {
              audioController.play("shield");
              runStats.shieldBlocks += 1;
              onRunEvent("shield-block");
            }
            return "blocked" as const;
          }
        }
        if (shieldable && actorHasShield(targetId, now)) {
          setActorShield(targetId, false);
          if (targetId === 0) {
            audioController.play("shield");
            runStats.shieldBlocks += 1;
            onRunEvent("shield-block");
          }
          return "blocked" as const;
        }
        const crashed = crashActor(targetId, now, crashDurationForAttack(attack, CRASH_DURATION_MS));
        if (crashed && sourceActorId === 0 && targetId !== 0 && ITEM_ATTACK_SCORE_TYPES.has(attack)) {
          onRunEvent("item-hit");
        }
        return "crashed" as const;
      };
      const targetOnePlaceAhead = (actorId: number) => {
        const targetRank = actorRank(actorId) - 1;
        return targetRank > 0 ? actorIds.find((targetId) => actorRank(targetId) === targetRank) ?? null : null;
      };
      const makeFireMesh = () => visualEffects.makeFire();
      const makeHomingMesh = () => {
        const group = new THREE.Group();
        const shell = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.72, 4, 8), homingMaterial);
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
        const core = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 0.72), pixelMaterial);
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
      const spawnProjectile = (
        actorId: number,
        kind: "FIRE" | "HOMING" | "PIXEL",
        level: ItemLevel = 1,
        fireAngle = 0,
      ) => {
        const pose = actorPose(actorId);
        const remainingTargets = kind === "PIXEL"
          ? actorIds
            .filter((targetId) => targetId !== actorId && actorRank(targetId) < actorRank(actorId))
            .sort((a, b) => actorRank(b) - actorRank(a))
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
        group.scale.setScalar(kind === "FIRE" ? level : 1);
        group.position.set(pose.x + Math.sin(pose.heading) * 2.6, pose.y + 0.85, pose.z + Math.cos(pose.heading) * 2.6);
        scene.add(group);
        const projectile = pooled ?? {
          kind: resolvedKind,
          level,
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
          terminalPursuit: false,
          age: 0,
          active: true,
        };
        projectile.kind = resolvedKind;
        projectile.level = level;
        projectile.owner = actorId;
        projectile.target = target;
        projectile.remainingTargets = remainingTargets;
        projectile.progress = actorProgress(actorId) + 2.7 / course.length;
        projectile.lane = actorLane(actorId);
        projectile.directionX = Math.sin(pose.heading + fireAngle);
        projectile.directionZ = Math.cos(pose.heading + fireAngle);
        projectile.surfaceU = wrap01(actorProgress(actorId));
        projectile.surfaceY = pose.y + 0.86;
        projectile.nextSurfaceSampleAt = 0;
        projectile.terminalPursuit = false;
        projectile.fxBudget = 0;
        projectile.age = 0;
        projectile.active = true;
        projectiles.push(projectile);
        return true;
      };
      const createTrapAt = (
        owner: number,
        progress: number,
        lane: number,
        now: number,
        level: ItemLevel = 1,
        mode: TrapState["mode"] = "ground",
      ) => {
        const pose = course.pointAt(progress, lane);
        const pooled = trapPool.pop();
        const group = pooled?.group ?? makeTrapMesh();
        const x = pose.x;
        const z = pose.z;
        group.visible = true;
        group.scale.setScalar(mode === "orbit" ? 0.86 : 1);
        group.position.set(x, pose.y + 0.03, z);
        group.rotation.set(pose.pitch, pose.heading, 0);
        scene.add(group);
        const trap = pooled ?? {
          owner,
          level,
          mode,
          group,
          x,
          y: pose.y,
          z,
          orbitAngle: 0,
          orbitRadius: 3.15,
          armedAt: 0,
          expiresAt: 0,
          active: true,
        };
        trap.owner = owner;
        trap.level = level;
        trap.mode = mode;
        trap.x = x;
        trap.y = pose.y;
        trap.z = z;
        trap.orbitAngle = (owner * 1.73 + now * 0.0017) % TAU;
        trap.orbitRadius = 3.15;
        trap.armedAt = now + SPIKE_OWNER_GRACE_MS;
        trap.expiresAt = mode === "orbit" ? now + SPIKE_ORBIT_DURATION_MS : now + 22000;
        trap.active = true;
        traps.push(trap);
      };
      const spawnTrap = (actorId: number, now: number, level: ItemLevel = 1) => {
        const baseLane = actorLane(actorId);
        if (spikeOrbitsKart(level)) {
          createTrapAt(actorId, actorProgress(actorId), baseLane, now, level, "orbit");
          return;
        }
        spikeLevelLaneOffsets(level).forEach((offset) => {
          createTrapAt(
            actorId,
            actorProgress(actorId) - 2.45 / course.length,
            clamp(baseLane + offset, -BARRIER_LIMIT + 1.15, BARRIER_LIMIT - 1.15),
            now,
            level,
          );
        });
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
      const createShockWave = (
        originActorId: number,
        now: number,
        options: { ownerId?: number; radius?: number; attack?: AttackType; color?: number } = {},
      ) => {
        const pose = actorPose(originActorId);
        const ownerId = options.ownerId ?? originActorId;
        const radius = options.radius ?? 14;
        const attack = options.attack ?? "VOLT";
        const color = options.color ?? 0xbca8ff;
        const pooled = shockWavePool.pop();
        let group = pooled?.group;
        let material = pooled?.material;
        if (!group || !material) {
          material = new THREE.MeshBasicMaterial({ color: 0xbca8ff, transparent: true, opacity: 0.92, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
          const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.18, 8, 28), material);
          ring.rotation.x = Math.PI / 2;
          group = new THREE.Group();
          group.add(ring);
          for (let index = 0; index < 3; index += 1) {
            const arc = new THREE.Mesh(new THREE.TorusGeometry(1.35 + index * 0.22, 0.045, 6, 24), material.clone());
            arc.rotation.set(Math.PI / 2 + index * 0.2, index * 0.4, index * 0.7);
            group.add(arc);
          }
        }
        group.visible = true;
        group.scale.setScalar(1);
        group.children.forEach((child) => {
          if (child instanceof THREE.Mesh) {
            const childMaterial = child.material as Three.MeshBasicMaterial;
            childMaterial.opacity = 0.92;
            childMaterial.color.setHex(color);
          }
        });
        group.position.set(pose.x, pose.y + 0.75, pose.z);
        scene.add(group);
        const wave = pooled ?? { group, material, startedAt: now, radius, active: true };
        wave.startedAt = now;
        wave.radius = radius;
        wave.active = true;
        shockWaves.push(wave);
        for (let targetId = 0; targetId < actorCount; targetId += 1) {
          if (targetId === ownerId || targetId === originActorId) continue;
          const target = actorPose(targetId);
          if (Math.hypot(target.x - pose.x, target.z - pose.z) <= radius && Math.abs(target.y - pose.y) <= 4.5) {
            attackActor(targetId, attack, now, ownerId);
            novaHitUntil[targetId] = now + 650;
          }
        }
      };
      const setActorSkillBoost = (actorId: number, now: number, durationMs: number, multiplier = 1) => {
        const normalizedMultiplier = clamp(multiplier, 0.7, 3);
        if (actorId === 0) {
          playerState.boostUntil = Math.max(playerState.boostUntil, now + durationMs);
          playerState.boostGravityUntil = Math.max(playerState.boostGravityUntil, now + durationMs);
          playerState.skillBoostUntil = now + durationMs;
          playerState.skillBoostMultiplier = normalizedMultiplier;
          return;
        }
        const rival = rivalStates[actorId - 1];
        rival.boostUntil = Math.max(rival.boostUntil, now + durationMs);
        rival.boostGravityUntil = Math.max(rival.boostGravityUntil, now + durationMs);
        rival.skillBoostUntil = now + durationMs;
        rival.skillBoostMultiplier = normalizedMultiplier;
      };
      const spawnSkillEffect = (
        actorId: number,
        skill: SkillId,
        now: number,
        phase: SkillVisualState["phase"] = "activate",
      ) => {
        const palette = skill === "PIXEL"
          ? [0x53efff, 0xe8feff]
          : skill === "VOLT"
            ? phase === "critical" ? [0xff3f45, 0xffdc65] : [0xffa62f, 0xefe2ff]
            : skill === "COMET"
              ? phase === "critical" ? [0xbe79ff, 0xffef87] : [0xffbf40, 0x8ff8ff]
              : [0x69fff0, 0xf4ffff];
        const intensity = phase === "critical" ? 1.34 : phase === "success" ? 1.16 : 1;
        const group = new THREE.Group();
        const materials: Three.MeshBasicMaterial[] = [];
        const makeMaterial = (color: number, opacity = 0.92) => {
          const material = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          });
          materials.push(material);
          return material;
        };
        const outerRing = new THREE.Mesh(
          new THREE.TorusGeometry(1.72 * intensity, 0.13 * intensity, 6, 28),
          makeMaterial(palette[0]),
        );
        outerRing.rotation.x = Math.PI / 2;
        outerRing.castShadow = false;
        group.add(outerRing);
        const innerRing = new THREE.Mesh(
          new THREE.TorusGeometry(1.18 * intensity, 0.07 * intensity, 5, 24),
          makeMaterial(palette[1], 0.82),
        );
        innerRing.rotation.x = Math.PI / 2;
        innerRing.rotation.z = Math.PI / 8;
        innerRing.castShadow = false;
        group.add(innerRing);
        const shardCount = skill === "PIXEL" ? 14 : skill === "COMET" ? 12 : 10;
        for (let index = 0; index < shardCount; index += 1) {
          const angle = index / shardCount * TAU;
          const shard = new THREE.Mesh(
            new THREE.OctahedronGeometry((index % 3 === 0 ? 0.2 : 0.12) * intensity, 0),
            makeMaterial(index % 2 ? palette[0] : palette[1], 0.88),
          );
          const radius = (2.05 + (index % 2) * 0.38) * intensity;
          shard.position.set(Math.cos(angle) * radius, 0.18 + (index % 3) * 0.16, Math.sin(angle) * radius);
          shard.rotation.set(angle * 0.7, angle, angle * 0.35);
          shard.castShadow = false;
          group.add(shard);
        }
        if (skill === "GIANT") {
          const liftColumn = new THREE.Mesh(
            new THREE.CylinderGeometry(0.42, 1.55, 3.4, 12, 1, true),
            makeMaterial(palette[0], 0.28),
          );
          liftColumn.position.y = 1.35;
          liftColumn.castShadow = false;
          group.add(liftColumn);
        }
        const pose = actorPose(actorId);
        group.position.set(pose.x, pose.y + 0.58, pose.z);
        scene.add(group);
        addSkillAccent(THREE, group, skill, materials[0]);
        skillVisuals.push({
          actorId,
          skill,
          group,
          materials,
          startedAt: now,
          durationMs: phase === "activate" ? 1250 : phase === "critical" ? 1550 : 1380,
          phase,
        });
      };
      const endCometStream = (stream: CometStreamState) => {
        stream.active = false;
        stream.group.visible = false;
        scene.remove(stream.group);
      };
      const positionCometGate = (stream: CometStreamState) => {
        const point = course.pointAt(stream.gateProgress, stream.gateLanes[stream.gateIndex]);
        stream.group.position.set(point.x, point.y + 2.15, point.z);
        stream.group.rotation.set(0, point.heading, 0);
      };
      const chooseCometGatePlacement = (
        originProgress: number,
        origin: { x: number; y: number; z: number; heading: number },
        gateLane: number,
      ) => {
        const minimumProgress = originProgress + COMET_GATE_SPACING_METERS / course.length;
        let fallback = { progress: minimumProgress, distanceMeters: COMET_GATE_SPACING_METERS };
        let bestViewAngle = Number.POSITIVE_INFINITY;
        for (let distanceMeters = COMET_GATE_SPACING_METERS; distanceMeters <= COMET_GATE_VISIBLE_SEARCH_METERS; distanceMeters += 3) {
          const progress = originProgress + distanceMeters / course.length;
          const candidate = course.pointAt(progress, gateLane);
          const horizontalDistance = Math.hypot(candidate.x - origin.x, candidate.z - origin.z);
          const targetHeading = Math.atan2(candidate.x - origin.x, candidate.z - origin.z);
          let viewAngle = targetHeading - origin.heading;
          if (viewAngle > Math.PI) viewAngle -= TAU;
          if (viewAngle < -Math.PI) viewAngle += TAU;
          const verticalAngle = Math.atan2(candidate.y + 2.15 - origin.y, Math.max(0.001, horizontalDistance));
          const absoluteViewAngle = Math.abs(viewAngle);
          if (absoluteViewAngle < bestViewAngle) {
            bestViewAngle = absoluteViewAngle;
            fallback = { progress, distanceMeters };
          }
          // Never make the challenge denser: search forward from 42m and use
          // the first comfortably visible candidate, or the best 42-60m fallback.
          if (absoluteViewAngle <= 0.6 && Math.abs(verticalAngle) <= 0.45) {
            return { progress, distanceMeters };
          }
        }
        return fallback;
      };
      const cometGateTimeoutFor = (owner: number, distanceMeters: number) => clamp(
        1200 + distanceMeters / Math.max(12, actorSpeed(owner)) * 1000,
        COMET_GATE_TIMEOUT_MS,
        6200,
      );
      const startCometStream = (owner: number, now: number) => {
        const previous = cometStreams.find((stream) => stream.owner === owner && stream.active);
        if (previous) return false;
        const lane = actorLane(owner);
        const direction = lane <= 0 ? 1 : -1;
        const gateLanes: [number, number, number] = [
          clamp(lane + direction * 3.1, -6.8, 6.8),
          clamp(lane - direction * 2.7, -6.8, 6.8),
          clamp(lane + direction * 3.8, -6.8, 6.8),
        ];
        const group = new THREE.Group();
        const ringMaterial = new THREE.MeshBasicMaterial({
          color: 0xffb83f,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.27, 8, 28), ringMaterial);
        ring.castShadow = false;
        group.add(ring);
        const guideBeam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.08, 8.5, 6),
          new THREE.MeshBasicMaterial({ color: 0xffe081, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        guideBeam.position.y = 5.1;
        guideBeam.castShadow = false;
        group.add(guideBeam);
        for (let index = 0; index < 8; index += 1) {
          const shard = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.14, 0),
            new THREE.MeshBasicMaterial({ color: index % 2 ? 0x8cf7ff : 0xffe081, transparent: true, opacity: 0.86, blending: THREE.AdditiveBlending, depthWrite: false }),
          );
          const angle = index / 8 * TAU;
          shard.position.set(Math.cos(angle) * 2.72, Math.sin(angle) * 2.72, 0);
          shard.castShadow = false;
          group.add(shard);
        }
        const firstGatePlacement = chooseCometGatePlacement(actorProgress(owner), actorPose(owner), gateLanes[0]);
        const stream: CometStreamState = {
          owner,
          gateIndex: 0,
          targetGateCount: (owner === 0
            ? 3
            : cpuCometGateTarget({ gojo: actorCharacters[owner].name === "Gojo", roll: Math.random() })) as 1 | 2 | 3,
          gateProgress: firstGatePlacement.progress,
          gateDistanceMeters: firstGatePlacement.distanceMeters,
          gateLanes,
          group,
          expiresAt: now + cometGateTimeoutFor(owner, firstGatePlacement.distanceMeters),
          active: true,
        };
        positionCometGate(stream);
        scene.add(group);
        cometStreams.push(stream);
        return true;
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
      const launchGiantJump = (actorId: number, now: number, leapProfile = giantLeapProfileForAngle(45)) => {
        if (actorId === 0) {
          const launchedFromAir = playerState.airborne;
          const nearest = course.nearestSurface(playerState.x, playerState.y, playerState.z, playerState.lastU);
          const launchLane = actorLane(0);
          const vehicleForwardX = Math.sin(playerState.heading);
          const vehicleForwardZ = Math.cos(playerState.heading);
          const roadForwardX = -nearest.pose.nz;
          const roadForwardZ = nearest.pose.nx;
          const signedTrackSpeed = playerState.speed * (vehicleForwardX * roadForwardX + vehicleForwardZ * roadForwardZ);
          const launchRoadAhead = course.pointAt(
            nearest.u + (signedTrackSpeed * PHYSICS_STEP_SECONDS) / course.length,
            launchLane,
          );
          const maxSurfaceVerticalSpeed = Math.max(4, Math.abs(playerState.speed) * 0.72);
          const launchSurfaceVerticalVelocity = clamp(
            (launchRoadAhead.y - nearest.pose.y) / PHYSICS_STEP_SECONDS,
            -maxSurfaceVerticalSpeed,
            maxSurfaceVerticalSpeed,
          );
          if (!launchedFromAir) {
            playerState.recoveryProgress = playerState.progress;
            playerState.recoveryU = nearest.u;
            playerState.recoveryLane = launchLane;
          }
          const launchGravity = playerTakeoffGravityAt(now);
          playerState.airborne = true;
          playerState.motionState = "airborne";
          playerState.airborneSince = now;
          playerState.belowCourseSince = null;
          playerState.airGravity = launchGravity;
          playerState.giantLowDashActive = leapProfile.outcome === "low-dash";
          if (leapProfile.outcome === "low-dash") {
            playerState.giantLowDashUntil = now + GIANT_LOW_DASH_DURATION_MS;
          }
          const baseVerticalVelocity = giantLeapVerticalVelocity({
            surfaceVerticalVelocity: launchedFromAir ? 0 : launchSurfaceVerticalVelocity,
            gravity: launchGravity,
            height: leapProfile.height,
          });
          const speedDirection = playerState.speed < -0.1 ? -1 : 1;
          const baseForwardVelocity = speedDirection * Math.max(
            Math.abs(playerState.speed) * leapProfile.forwardSpeedMultiplier,
            leapProfile.minimumForwardSpeed,
          );
          const acceleratedLaunch = accelerateGiantLeapVelocity({
            forwardVelocity: baseForwardVelocity,
            verticalVelocity: baseVerticalVelocity,
          });
          // Scale the complete launch vector so the 30% acceleration stays aligned
          // with the chosen jump direction instead of being added along another axis.
          playerState.speed = acceleratedLaunch.forwardVelocity;
          playerState.verticalVelocity = acceleratedLaunch.verticalVelocity;
          playerState.groundY = nearest.pose.y;
          playerState.surfaceVerticalVelocity = launchSurfaceVerticalVelocity;
          if (!launchedFromAir) playerState.y = nearest.pose.y + 0.04;
          suspendPlayerDriftCharge(now);
          return true;
        }
        const rival = rivalStates[actorId - 1];
        const shortcut = pendingRivalShortcuts.get(actorId);
        if (rival.airborne || !shortcut) return false;
        const launchLane = shortcut.startLane ?? rival.lane;
        const targetLane = shortcut.targetLane ?? rival.lane;
        const road = course.pointAt(rival.progress, launchLane);
        const landing = course.pointAt(shortcut.targetProgress, targetLane);
        const deltaX = landing.x - road.x;
        const deltaZ = landing.z - road.z;
        const horizontalDistance = Math.hypot(deltaX, deltaZ);
        if (horizontalDistance < 8) {
          pendingRivalShortcuts.delete(actorId);
          return false;
        }
        if (shortcut.recordedTurbo) {
          rival.driftBoost = Math.max(rival.driftBoost, 1);
          rival.speed = Math.max(rival.speed, rival.pace + 10.5);
        }
        const launchSpeed = Math.max(12, rival.speed);
        const duration = clamp(horizontalDistance / Math.max(24, launchSpeed), 1.05, 2.85);
        const launchGravity = now < rival.boostUntil || rival.driftBoost > 0.001
          ? JUMP_GRAVITY
          : STRONG_JUMP_GRAVITY;
        rival.shortcutActive = true;
        rival.shortcutProgress = 0;
        rival.shortcutDuration = duration;
        rival.shortcutStartProgress = rival.progress;
        rival.shortcutTargetProgress = shortcut.targetProgress;
        rival.shortcutTargetLane = targetLane;
        rival.shortcutFromX = road.x;
        rival.shortcutFromY = road.y;
        rival.shortcutFromZ = road.z;
        rival.shortcutToX = landing.x;
        rival.shortcutToY = landing.y;
        rival.shortcutToZ = landing.z;
        rival.shortcutX = road.x;
        rival.shortcutZ = road.z;
        rival.shortcutHeading = Math.atan2(deltaX, deltaZ);
        rival.lane = launchLane;
        rival.shortcutKeys.add(shortcut.key);
        pendingRivalShortcuts.delete(actorId);
        rival.airborne = true;
        rival.motionState = "airborne";
        rival.airborneSince = now;
        rival.airSpeed = launchSpeed;
        rival.airGravity = launchGravity;
        rival.verticalVelocity = (landing.y - road.y + 0.5 * launchGravity * duration * duration) / duration;
        rival.shortcutLaunchVelocity = rival.verticalVelocity;
        rival.shortcutAvoidOffset = 0;
        rival.airY = road.y + 0.04;
        rival.drifting = false;
        rival.driftCharge = 0;
        rival.driftSlipVelocity = 0;
        rival.driftDecisionMade = false;
        rival.driftStartedAt = 0;
        rival.driftMinimumUntil = 0;
        rival.driftCurveSign = 0;
        rival.driftApproachKey = -1;
        rival.driftNextScanProgress = rival.progress;
        rival.driftApproachSign = 0;
        rival.driftPeakSeverity = 0;
        rival.driftSafetyCheckAt = 0;
        rival.driftSafetyLane = rival.lane;
        rival.driftSafetyCost = 0;
        rival.avoidanceRouteCheckAt = 0;
        rival.avoidanceRouteLane = rival.lane;
        rival.avoidanceThreatDistance = Number.POSITIVE_INFINITY;
        rival.avoidanceRouteCost = 0;
        rival.driftPhase = "entry";
        rival.driftCountersteer = 0;
        rival.driftPreviousSlipAngle = 0;
        rival.driftRecoveryTicks = 0;
        return true;
      };
      const beginPlayerGiantCharge = (now: number) => {
        if (
          !skillsEnabled
          || playerState.giantLeapCharging
          || actorCrashing(0, now)
          || now < playerState.skillReadyAt
        ) return false;
        playerState.giantLeapCharging = true;
        playerState.giantLeapChargeStartedAt = now;
        playerState.skillReadyAt = now + skillCooldownFor(selectedCharacter);
        return true;
      };
      const releasePlayerGiantCharge = (now: number) => {
        if (!playerState.giantLeapCharging) return false;
        const angle = giantLeapChargeAngle({ elapsedMs: now - playerState.giantLeapChargeStartedAt });
        const leapProfile = giantLeapProfileForAngle(angle);
        playerState.giantLeapCharging = false;
        playerState.giantLeapChargeStartedAt = 0;
        if (leapProfile.outcome === "undercharge") {
          showSkillFeedback("CHARGE FAILED", "orange", 1250);
          return false;
        }
        if (leapProfile.outcome === "overcharge") {
          showSkillFeedback("OVERCHARGE", "critical", 1350);
          return false;
        }
        const launched = launchGiantJump(0, now, leapProfile);
        if (!launched) {
          showSkillFeedback("NO JUMP", "orange", 1250);
          return false;
        }
        spawnSkillEffect(0, "GIANT", now, "activate");
        if (leapProfile.outcome === "low-dash") showSkillFeedback("LOW DASH!", "instruction", 1050);
        if (leapProfile.outcome === "long-jump") showSkillFeedback("LONG JUMP!", "orange", 1150);
        if (leapProfile.outcome === "high-jump") showSkillFeedback("HIGH JUMP!", "critical", 1250);
        audioController.playSkill("GIANT", 1);
        return true;
      };
      const activateSkillById = (actorId: number, skill: SkillId, now: number, steer = 0) => {
        if (!skillsEnabled) return false;
        const character = actorCharacters[actorId];
        const readyAt = actorId === 0 ? playerState.skillReadyAt : rivalStates[actorId - 1].skillReadyAt;
        if (now < readyAt || actorCrashing(actorId, now)) return false;
        let activated = true;
        if (skill === "PIXEL") {
          if (Math.abs(steer) > 0.08 || actorAirborne(actorId)) activated = false;
          else if (actorId === 0) {
            playerState.vectorTurboActive = true;
            playerState.vectorTurboUntil = Number.POSITIVE_INFINITY;
          } else {
            const rival = rivalStates[actorId - 1];
            const vectorStart = actorPose(actorId);
            rival.vectorTurboActive = true;
            rival.vectorTurboHeading = vectorStart.heading;
            rival.vectorTurboLastX = vectorStart.x;
            rival.vectorTurboLastZ = vectorStart.z;
          }
        }
        if (skill === "VOLT") {
          if (actorId === 0) {
            if (playerState.voltOverchargeActive) activated = false;
            else {
              playerState.voltOverchargeActive = true;
              playerState.voltCharge = 0;
              playerState.voltActiveUntil = now + VOLT_ACTIVE_WINDOW_MS;
              playerState.voltRejectCurrentDrift = false;
            }
          } else {
            const rival = rivalStates[actorId - 1];
            if (rival.voltOverchargeActive) activated = false;
            else {
              rival.voltOverchargeActive = true;
              rival.voltCharge = 0;
              rival.voltActiveUntil = now + VOLT_ACTIVE_WINDOW_MS;
              rival.voltRejectCurrentDrift = false;
              rival.voltTargetCharge = cpuOverchargeTarget({
                gojo: character.name === "Gojo",
                roll: Math.random(),
                sideRoll: Math.random(),
              }).charge;
            }
          }
        }
        if (skill === "COMET") activated = startCometStream(actorId, now);
        if (skill === "GIANT") activated = launchGiantJump(actorId, now);
        if (!activated) return false;
        spawnSkillEffect(actorId, skill, now, "activate");
        if (actorId === 0) {
          if (skill === "PIXEL") showSkillFeedback("左右入力するまで加速！！\nBOOST UNTIL YOU STEER!!", "instruction", 1900);
          if (skill === "VOLT") showSkillFeedback("赤いラインでドリフト解除！！\nRELEASE DRIFT IN THE RED ZONE!!", "instruction", 2100);
          if (skill === "COMET") showSkillFeedback("輪をくぐれ！！\nPASS THROUGH THE RINGS!!", "instruction", 1900);
        }
        audioController.playSkill(skill, actorId === 0 ? 1 : 0.58);
        if (actorId > 0 && character.name === "Gojo" && skill === "COMET") {
          rivalStates[actorId - 1].gojoLastCometAt = now;
        }
        const cooldownMs = character.name === "Gojo" ? gojoTuning.skillCooldownMs : skillCooldownFor(character);
        if (actorId === 0) playerState.skillReadyAt = now + cooldownMs;
        else rivalStates[actorId - 1].skillReadyAt = now + cooldownMs;
        return true;
      };
      const activateActorSkill = (actorId: number, now: number, steer = 0) =>
        activateSkillById(actorId, characterSkill(actorCharacters[actorId]), now, steer);
      const chooseGojoSkill = (actorId: number, now: number): SkillId | null => {
        const rival = rivalStates[actorId - 1];
        // Gojo's recorded shortcut is launched by the Ghost route player,
        // never by the GIANT skill. All unrecorded shortcut skills are banned.
        if (rival.airborne || rival.shortcutActive) return null;
        const current = course.pointAt(rival.progress, rival.lane);
        const ahead = course.pointAt(rival.progress + 42 / course.length, rival.lane);
        let headingDelta = ahead.heading - current.heading;
        if (headingDelta > Math.PI) headingDelta -= TAU;
        if (headingDelta < -Math.PI) headingDelta += TAU;
        const turnSeverity = Math.abs(headingDelta);
        const cometDue = rival.gojoLastCometAt === 0 || now - rival.gojoLastCometAt >= 20000;
        if (turnSeverity >= 0.08) return "VOLT";
        if (turnSeverity <= 0.008 && Math.abs(rival.lane - rival.avoidanceRouteLane) < 0.3) return "PIXEL";
        if (cometDue) return "COMET";
        return "COMET";
      };
      const shouldGojoUseHeldItem = (actorId: number, now: number) => {
        const rival = rivalStates[actorId - 1];
        const item = rival.item;
        const heldPastTacticalWindow = now - rival.useAt >= 1600;
        if (item === "HOMING") return targetOnePlaceAhead(actorId) !== null;
        if (item === "SHIELD") return !actorHasShield(actorId, now) || rival.shieldUntil - now <= 1500;
        if (item === "NOVA") return actorRank(actorId) > 1 || heldPastTacticalWindow;
        if (item === "BOOST") {
          const current = course.pointAt(rival.progress, rival.lane);
          const ahead = course.pointAt(rival.progress + 34 / course.length, rival.lane);
          let headingDelta = ahead.heading - current.heading;
          if (headingDelta > Math.PI) headingDelta -= TAU;
          if (headingDelta < -Math.PI) headingDelta += TAU;
          return (!rival.airborne && Math.abs(headingDelta) <= 0.12) || heldPastTacticalWindow;
        }
        return item !== "EMPTY";
      };
      const activateActorItem = (actorId: number, now: number) => {
        if (!itemsEnabled) return false;
        const item = actorItem(actorId);
        const itemLevel = Math.max(1, actorItemLevel(actorId)) as ItemLevel;
        if (!canActivateItem(item, actorCrashing(actorId, now))) return false;
        if (item === "FIRE") {
          const pattern = fireLevelPattern(itemLevel);
          pattern.angles.forEach((angle) => spawnProjectile(actorId, "FIRE", itemLevel, angle));
        }
        if (item === "HOMING") spawnProjectile(actorId, "HOMING", itemLevel);
        if (item === "SPIKES") spawnTrap(actorId, now, itemLevel);
        if (item === "SHIELD") {
          const shieldUntil = now + SHIELD_DURATION_MS;
          setActorShield(actorId, true, itemLevel, shieldUntil);
          if (itemLevel >= 3) {
            if (actorId === 0) playerState.auroraUntil = shieldUntil;
            else rivalStates[actorId - 1].auroraUntil = shieldUntil;
          }
        }
        if (item === "BOOST") {
          const boostDuration = boostDurationForLevel(itemLevel);
          if (actorId === 0) {
            playerState.boostUntil = now + boostDuration;
            playerState.boostGravityUntil = now + boostDuration + 1500;
            playerState.speed = Math.max(playerState.speed, 41);
          } else {
            rivalStates[actorId - 1].boostUntil = now + boostDuration;
            rivalStates[actorId - 1].boostGravityUntil = now + boostDuration + 1500;
          }
        }
        if (item === "NOVA") {
          const origin = actorPose(actorId);
          novaEffect.position.set(origin.x, origin.y + 0.8, origin.z);
          novaStarted = now;
          for (let targetId = 0; targetId < actorCount; targetId += 1) {
            if (targetId !== actorId) {
              attackActor(targetId, "NOVA", now, actorId);
              novaHitUntil[targetId] = now + 950;
            }
          }
          novaFlashUntil = now + 1050;
        }
        setActorItem(actorId, "EMPTY", 0, now);
        return true;
      };

      const resize = () => {
        const width = Math.max(1, host.clientWidth);
        const height = Math.max(1, host.clientHeight);
        cameraView = cameraViewForViewport({ width, height });
        presentation.resize(width, height);
        camera.aspect = cameraView.aspect;
        camera.fov = cameraView.fov;
        camera.updateProjectionMatrix();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();

      // Read-only visual contact sampling. This does not participate in landing,
      // collisions, steering, speed, or any other racer-state calculation.
      const tireContactPoint = new THREE.Vector3();
      const tireWorldScale = new THREE.Vector3();
      const tireContacts = actorIds.map(() => [-1, 1].map((): TireSurfaceContact => ({
        x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, visible: false, surfaceKey: "",
      })));
      const skidSurfacePatches = new Map<string, Three.Group>();
      cloudPatches.forEach((patch) => skidSurfacePatches.set(`cloud:${patch.userData.index}:${patch.userData.side}`, patch));
      customRoadPatches.forEach((patch) => skidSurfacePatches.set(`custom:${patch.userData.index}:${patch.userData.side}`, patch));
      const skidSurfaceVisible = (key: string) => {
        const patch = skidSurfacePatches.get(key);
        if (patch && (!patch.visible || patch.scale.x < 0.98 || patch.scale.z < 0.98)) return false;
        return key.startsWith("cloud:") ? !cloudGapKeys.has(key.slice(6))
          : key.startsWith("custom:") ? !customRoadGapKeys.has(key.slice(7)) : true;
      };
      const sampleVisualTireContacts = (actorId: number) => {
        const root = racerVisualRoots[actorId];
        root.updateWorldMatrix(true, false);
        root.getWorldScale(tireWorldScale);
        const hint = actorId === 0 ? playerState.lastU : rivalStates[actorId - 1].progress;
        tireContacts[actorId].forEach((contact, wheel) => {
          tireContactPoint.set(wheel === 0 ? -1.3 : 1.3, 0.63, -1.31).applyMatrix4(root.matrixWorld);
          const tireBottomY = tireContactPoint.y - 0.6 * tireWorldScale.y;
          const surface = course.nearestSurface(tireContactPoint.x, tireBottomY, tireContactPoint.z, hint);
          const p = surface.pose;
          const dx = tireContactPoint.x - p.x, dz = tireContactPoint.z - p.z;
          const lane = dx * p.nx + dz * p.nz;
          const u = wrap01(surface.u);
          const along = dx * Math.sin(p.heading) + dz * Math.cos(p.heading);
          const roadOffset = courseDefinition.id === "cloud" ? 0.08 : courseDefinition.id === "starlight" ? 0.085 : 0.05;
          const roadY = p.y - Math.tan(p.pitch) * along + roadOffset;
          const patches = courseDefinition.id === "cloud" ? cloudPatches : courseDefinition.id === "custom" ? customRoadPatches : [];
          const tileCount = patches.length / 2;
          const gapKey = `${Math.floor(u * tileCount) % Math.max(1, tileCount)}:${lane >= 0 ? 1 : -1}`;
          contact.surfaceKey = tileCount ? `${courseDefinition.id}:${gapKey}` : "";
          const wet = wetRoadForSpray(courseDefinition.id, u, lane, COURSE_WIDTH, true,
            Boolean(runtimeRiverChannelAt(u, lane) || riverDamCrossingAt(u)))
            || courseDefinition.id === "custom" && customHazardStates.some(({ config, start, end }) =>
              config.enabled && config.type === "river" && u >= start && u <= end && Math.abs(lane - config.lane) <= config.width / 2);
          contact.x = tireContactPoint.x; contact.y = roadY + 0.018; contact.z = tireContactPoint.z;
          contact.nx = Math.sin(p.pitch) * Math.sin(p.heading);
          contact.ny = Math.cos(p.pitch);
          contact.nz = Math.sin(p.pitch) * Math.cos(p.heading);
          contact.visible = Math.abs(lane) <= COURSE_WIDTH && Math.abs(tireBottomY - roadY) < 0.75
            && skidSurfaceVisible(contact.surfaceKey) && !wet;
        });
        return tireContacts[actorId];
      };
      let visualDriftContactBudget = 0;

      const simulateStep = (now: number, dt: number, deltaMs: number) => {
        syncKartMotionStates(now);
        const racing = phaseRef.current === "racing" && !finished;
        const postFinishTourActive = phaseRef.current === "finished" && finished && postFinishStartedAt > 0;
        if (playerState.shield && now >= playerState.shieldUntil) setActorShield(0, false);
        rivalStates.forEach((rival, index) => {
          if (rival.shield && now >= rival.shieldUntil) setActorShield(index + 1, false);
        });
        if (racing && !raceStart) {
          raceStart = now;
          playerState.skillReadyAt = now + skillCooldownFor(selectedCharacter);
        }
        const raceElapsedSeconds = raceStart ? Math.max(0, (now - raceStart) / 1000) : 0;
        const evolutionLocalStage = evolutionMode ? clamp(Math.floor(Math.max(0, playerState.progress)), 0, 2) : 2;
        const evolutionStage = evolutionStageFor(evolutionChapterIndex, playerState.progress);
        const evolutionFeatures = evolutionMode
          ? evolutionFeatureState(evolutionStage)
          : { items: true, drift: true, skills: true };
        if (evolutionVisuals) showEvolutionStage(evolutionVisuals, evolutionLocalStage);
        const playerCrashing = playerState.motionState === "crashing";
        if (playerCrashing && playerState.giantLeapCharging) {
          playerState.giantLeapCharging = false;
          playerState.giantLeapChargeStartedAt = 0;
        }
        const controllerInput = readGamepadInput(gamepadBindings);
        const keyboardSteer = keyboardSteerValue();
        const touchSteer = (touch.current.left ? 1 : 0) + (touch.current.right ? -1 : 0);
        const digitalSteer = touchSteer !== 0 ? touchSteer : keyboardSteer;
        const playerInputSteer = digitalSteer !== 0 ? digitalSteer : controllerInput.steer;
        const useItem = Boolean(keyboardActionPressed("item") || touch.current.item || controllerInput.item);
        if (racing) {
          if (itemsEnabled && evolutionFeatures.items && useItem && !itemPressed && heldItem !== "EMPTY") {
            const itemToUse = heldItem;
            if (activateActorItem(0, now)) audioController.playItem(itemToUse);
          }
          itemPressed = useItem;
        } else {
          itemPressed = false;
        }

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
          starlightCycle.roadMaterial.emissiveIntensity = 0.14 * dayToSunset * (1 - sunsetToNight) + 0.13 * sunsetToNight;
          mixStarlightColor(starlightCycle.deckMaterial.color, starlightColors.dayDeck, starlightColors.sunsetDeck, starlightColors.nightDeck, dayToSunset, sunsetToNight);
          starlightCycle.prismMaterials.forEach((material) => {
            material.opacity = sunsetToNight;
            material.emissiveIntensity = 0.58 * sunsetToNight;
          });
          starlightCycle.roadMesh.visible = sunsetToNight < 0.995;
          starlightCycle.laneMaterial.emissiveIntensity = 1.05 * sunsetToNight;
          mixStarlightColor(starlightCycle.curbMaterials[0].color, starlightColors.dayCurbA, starlightColors.sunsetCurbA, starlightColors.nightCurbA, dayToSunset, sunsetToNight);
          mixStarlightColor(starlightCycle.curbMaterials[1].color, starlightColors.dayCurbB, starlightColors.sunsetCurbB, starlightColors.nightCurbB, dayToSunset, sunsetToNight);
          starlightCycle.curbMaterials.forEach((material) => {
            material.emissiveIntensity = 0.82 * sunsetToNight;
          });
          scene.userData.courseBackdrop?.userData.setNightStrength?.(sunsetToNight);
          starlightCycle.starField.visible = sunsetToNight > 0.002;
          starlightCycle.starMaterial.opacity = 0.92 * sunsetToNight;
          starlightCycle.moon.visible = sunsetToNight > 0.002;
          starlightCycle.moonMaterial.opacity = sunsetToNight;
          starlightCycle.moonMaterial.emissiveIntensity = 1.32 * sunsetToNight;
          starlightCycle.moonGlowMaterial.opacity = 0.3 * sunsetToNight;
          starlightCycle.moon.scale.setScalar(0.86 + sunsetToNight * 0.14);
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
          starlightCycle.hemisphere.intensity = scalarCycle(2.15, 2, 2.75);
          mixStarlightColor(starlightCycle.sun.color, starlightColors.daySun, starlightColors.sunsetSun, starlightColors.nightSun, dayToSunset, sunsetToNight);
          starlightCycle.sun.intensity = scalarCycle(3.25, 3.05, 5.1);
          starlightCycle.sun.position.set(
            THREE.MathUtils.lerp(-86, 0, sunsetToNight),
            THREE.MathUtils.lerp(135, 138, sunsetToNight),
            THREE.MathUtils.lerp(58, 0, sunsetToNight),
          );
          (starlightCycle.sun.userData.presentationLightOffset as Three.Vector3 | undefined)?.copy(starlightCycle.sun.position);
        }

        if (courseDefinition.id === "river" && riverCycle) {
          const riverLapIndex = Math.min(2, Math.max(0, Math.floor(playerState.progress)));
          const riverLapFraction = wrap01(Math.max(0, playerState.progress));
          const lapWaterTarget = riverLapIndex === 0 ? 0 : riverLapIndex === 1 ? 0.58 : 1;
          const lapOpening = riverLapIndex === 0 ? 0 : smoothTimeTransition(riverLapFraction, 0, 0.12);
          riverSurgeStrength = Math.max(riverSurgeStrength, lapWaterTarget * lapOpening);
          const gateLift = riverSurgeStrength * 5.7;
          riverCycle.gatePanels.forEach((panel, panelIndex) => {
            panel.position.y = (panel.userData.closedY as number) + gateLift + Math.sin(now * 0.002 + panelIndex) * riverSurgeStrength * 0.08;
          });
          riverCycle.reservoir.position.y = 6.5 - riverSurgeStrength * 0.72;
          riverCycle.reservoirMaterial.emissiveIntensity = 0;
          const extensionStrength = clamp((riverSurgeStrength - 0.58) / 0.42, 0, 1);
          const flowWidthScale = 0.58 + riverSurgeStrength * 0.72;
          const activeReach = Math.max(107, 103 + extensionStrength * 72);
          riverCycle.damFlows.forEach((flow, flowIndex) => {
            flow.water.visible = riverSurgeStrength > 0.015;
            flow.water.scale.y = flowWidthScale;
            flow.waterMaterial.opacity = riverSurgeStrength * (flowIndex === 0 ? 0.82 : 0.76);
            flow.waterMaterial.emissiveIntensity = 0;
            flow.extension.visible = extensionStrength > 0.01;
            flow.extension.scale.set(extensionStrength, flowWidthScale, 1);
            flow.extension.position.x = -103 * (1 - extensionStrength);
            // Keep wave coordinates continuous with the spillway while its
            // existing downstream mesh grows. This changes shading, not reach.
            const extensionCoordinates = flow.extensionMaterial.userData.riverCoordinates;
            extensionCoordinates.size.value.x = 72 * extensionStrength;
            extensionCoordinates.offset.value = -103 - 72 * extensionStrength;
            flow.extensionMaterial.opacity = extensionStrength * (flowIndex === 0 ? 0.84 : 0.78);
            flow.extensionMaterial.emissiveIntensity = 0;
            flow.foam.visible = riverSurgeStrength > 0.035;
            const foamMaterial = flow.foam.material as Three.PointsMaterial;
            foamMaterial.opacity = riverSurgeStrength * 0.64;
            if (!flow.foam.visible) return;
            const foamPositions = flow.foamPositions;
            for (let foamIndex = 0; foamIndex < foamPositions.length; foamIndex += 3) {
              let localX = foamPositions[foamIndex] - dt * (17 + riverSurgeStrength * 22);
              if (localX < -activeReach) localX = 4;
              const spillRise = clamp((localX + 29) / 34, 0, 1);
              const downstreamDistance = -localX;
              const roadRise = clamp((downstreamDistance - flow.downstreamRampStart) / 25, 0, 1) * flow.downstreamRise;
              foamPositions[foamIndex] = localX;
              foamPositions[foamIndex + 1] = 0.5 + spillRise * spillRise * 6.05 + roadRise + Math.sin(now * 0.006 + foamIndex) * 0.07;
              const foamOrdinal = foamIndex / 3;
              const foamBaseZ = -8 + ((foamOrdinal * 29 + flowIndex * 41) % 160) / 10;
              foamPositions[foamIndex + 2] = foamBaseZ * flowWidthScale;
            }
            const foamPosition = flow.foam.geometry.getAttribute("position") as Three.BufferAttribute;
            foamPosition.needsUpdate = true;
          });
        }

        if (courseDefinition.id === "cloud" && !timeTrialMode && cloudAtmosphere && cloudWeatherColors) {
          const stormArrival = smoothTimeTransition(raceElapsedSeconds, 20, 25);
          cloudIceStrength = smoothTimeTransition(raceElapsedSeconds, 45, 50);
          cloudStormStrength = stormArrival * (1 - cloudIceStrength);
          const blendCloudWeather = (target: Three.Color, day: Three.Color, storm: Three.Color, ice: Three.Color) => (
            target.copy(day).lerp(storm, stormArrival).lerp(ice, cloudIceStrength)
          );
          if (scene.background instanceof THREE.Color) {
            blendCloudWeather(scene.background, cloudWeatherColors.daySky, cloudWeatherColors.stormSky, cloudWeatherColors.iceSky);
          }
          if (scene.fog instanceof THREE.Fog) {
            blendCloudWeather(scene.fog.color, cloudWeatherColors.dayFog, cloudWeatherColors.stormFog, cloudWeatherColors.iceFog);
            scene.fog.near = THREE.MathUtils.lerp(THREE.MathUtils.lerp(190, 132, cloudStormStrength), 205, cloudIceStrength);
            scene.fog.far = THREE.MathUtils.lerp(THREE.MathUtils.lerp(490, 365, cloudStormStrength), 535, cloudIceStrength);
          }
          // Once the storm has passed, restore the cloud deck itself to its
          // pre-storm luminance. The halo and ice crystals still distinguish
          // the clear phase without overexposing the entire road surface.
          blendCloudWeather(cloudAtmosphere.groundMaterial.color, cloudWeatherColors.dayGround, cloudWeatherColors.stormGround, cloudWeatherColors.dayGround);
          blendCloudWeather(cloudAtmosphere.puffMaterial.color, cloudWeatherColors.dayPuff, cloudWeatherColors.stormPuff, cloudWeatherColors.dayPuff);
          cloudAtmosphere.puffMaterial.emissive.copy(cloudWeatherColors.daySky).lerp(cloudWeatherColors.stormSky, stormArrival).lerp(cloudWeatherColors.daySky, cloudIceStrength);
          cloudAtmosphere.puffMaterial.emissiveIntensity = 0.08;
          cloudAtmosphere.surfaceMaterials.forEach((material) => {
            blendCloudWeather(material.color, cloudWeatherColors.daySurface, cloudWeatherColors.stormSurface, cloudWeatherColors.daySurface);
            material.emissive.copy(cloudWeatherColors.daySky).lerp(cloudWeatherColors.stormSun, stormArrival).lerp(cloudWeatherColors.daySky, cloudIceStrength);
            material.emissiveIntensity = 0.1;
            material.roughness = 0.95;
          });
          blendCloudWeather(cloudAtmosphere.hemisphere.color, cloudWeatherColors.dayHemi, cloudWeatherColors.stormHemi, cloudWeatherColors.dayHemi);
          blendCloudWeather(cloudAtmosphere.hemisphere.groundColor, cloudWeatherColors.dayGroundLight, cloudWeatherColors.stormGroundLight, cloudWeatherColors.dayGroundLight);
          blendCloudWeather(cloudAtmosphere.sun.color, cloudWeatherColors.daySun, cloudWeatherColors.stormSun, cloudWeatherColors.daySun);
          const lightningCycle = now % 5400;
          const lightningFlash = cloudStormStrength > 0.72 && (lightningCycle < 95 || (lightningCycle > 185 && lightningCycle < 245))
            ? (lightningCycle < 95 ? 1 - lightningCycle / 95 : 1 - (lightningCycle - 185) / 60)
            : 0;
          if (lightningFlash > 0) {
            if (scene.background instanceof THREE.Color) scene.background.lerp(cloudWeatherColors.lightningSky, lightningFlash * 0.86);
            if (scene.fog instanceof THREE.Fog) scene.fog.color.lerp(cloudWeatherColors.lightningFog, lightningFlash * 0.72);
          }
          cloudAtmosphere.hemisphere.intensity = THREE.MathUtils.lerp(2.15, 1.82, cloudStormStrength) + lightningFlash * 1.25;
          cloudAtmosphere.sun.intensity = THREE.MathUtils.lerp(3.25, 2.42, cloudStormStrength) + lightningFlash * 2.6;
          cloudAtmosphere.stormClouds.visible = cloudStormStrength > 0.025;
          const stormCloudMaterial = cloudAtmosphere.stormClouds.material as Three.MeshStandardMaterial;
          stormCloudMaterial.opacity = cloudStormStrength * 0.92;
          stormCloudMaterial.emissiveIntensity = 0.16 + lightningFlash * 0.65;
          cloudAtmosphere.rain.visible = cloudStormStrength > 0.08;
          const rainMaterial = cloudAtmosphere.rain.material as Three.PointsMaterial;
          rainMaterial.opacity = cloudStormStrength * 0.82;

          cloudAtmosphere.halo.visible = cloudIceStrength > 0.01;
          if (cloudAtmosphere.halo.visible) {
            const haloForwardX = Math.sin(playerState.heading);
            const haloForwardZ = Math.cos(playerState.heading);
            cloudAtmosphere.halo.position.set(
              playerState.x + haloForwardX * 138,
              playerState.y + 64,
              playerState.z + haloForwardZ * 138,
            );
            cloudAtmosphere.halo.lookAt(camera.position);
            const haloPulse = 0.92 + Math.sin(now * 0.0015) * 0.08;
            cloudAtmosphere.halo.scale.setScalar(haloPulse);
            cloudAtmosphere.haloMaterials.forEach((material, index) => {
              material.opacity = cloudIceStrength * (index === cloudAtmosphere.haloMaterials.length - 1 ? 0.34 : 0.5 - index * 0.08);
            });
          }
          cloudAtmosphere.iceCrystals.visible = cloudIceStrength > 0.01;
          const iceMaterial = cloudAtmosphere.iceCrystals.material as Three.PointsMaterial;
          iceMaterial.opacity = cloudIceStrength * 0.88;
          if (cloudAtmosphere.iceCrystals.visible) {
            const positions = cloudAtmosphere.icePositions;
            for (let index = 0; index < positions.length; index += 3) {
              positions[index] += Math.sin(now * 0.0012 + index) * dt * 1.8;
              positions[index + 1] -= dt * (0.9 + (index % 9) * 0.08);
              positions[index + 2] += Math.cos(now * 0.001 + index * 0.7) * dt * 1.4;
              if (positions[index + 1] < playerState.groundY - 4 || Math.abs(positions[index] - playerState.x) > 105 || Math.abs(positions[index + 2] - playerState.z) > 105) {
                positions[index] = playerState.x - 90 + ((index * 31) % 180);
                positions[index + 1] = playerState.groundY + 18 + ((index * 13) % 52);
                positions[index + 2] = playerState.z - 90 + ((index * 47) % 180);
              }
            }
            const icePosition = cloudAtmosphere.iceCrystals.geometry.getAttribute("position") as Three.BufferAttribute;
            icePosition.needsUpdate = true;
          }

          if (racing && cloudStormStrength > 0.08) {
            if (!nextCloudWindChangeAt || now >= nextCloudWindChangeAt) {
              const gustAngles = [-Math.PI, -2.36, -1.57, -0.78, 0, 0.78, 1.57, 2.36];
              let nextAngle = gustAngles[Math.floor(Math.random() * gustAngles.length)];
              if (Math.abs(nextAngle - cloudWindAngle) < 0.2) nextAngle = gustAngles[(gustAngles.indexOf(nextAngle) + 2) % gustAngles.length];
              cloudWindAngle = nextAngle;
              cloudWindStrength *= 0.25;
              cloudWindTargetStrength = 1.25 + Math.random() * 0.3;
              nextCloudWindChangeAt = now + 3800 + Math.random() * 2400;
            }
          } else {
            cloudWindTargetStrength = 0;
            nextCloudWindChangeAt = 0;
          }
          const windResponse = 1 - Math.exp(-dt * (cloudWindTargetStrength > cloudWindStrength ? 1.7 : 2.6));
          cloudWindStrength = THREE.MathUtils.lerp(cloudWindStrength, cloudWindTargetStrength * cloudStormStrength, windResponse);
          const windHeading = playerState.heading + cloudWindAngle;
          const windX = Math.sin(windHeading);
          const windZ = Math.cos(windHeading);

          if (cloudAtmosphere.rain.visible) {
            const positions = cloudAtmosphere.rainPositions;
            for (let index = 0; index < positions.length; index += 3) {
              positions[index] += windX * dt * (13 + cloudWindStrength * 12);
              positions[index + 1] -= dt * (48 + (index % 17));
              positions[index + 2] += windZ * dt * (13 + cloudWindStrength * 12);
              if (positions[index + 1] < playerState.groundY - 8) {
                positions[index] = playerState.x - 120 + ((index * 31) % 240);
                positions[index + 1] = playerState.groundY + 72 + ((index * 13) % 42);
                positions[index + 2] = playerState.z - 120 + ((index * 47) % 240);
              }
            }
            const rainPosition = cloudAtmosphere.rain.geometry.getAttribute("position") as Three.BufferAttribute;
            rainPosition.needsUpdate = true;
          }

          if (cloudWindStreaks) {
            cloudWindStreaks.visible = cloudWindStrength > 0.045;
            cloudWindMaterial.opacity = clamp(cloudWindStrength * 0.58, 0, 0.58);
            if (cloudWindStreaks.visible) {
              const forwardX = Math.sin(playerState.heading);
              const forwardZ = Math.cos(playerState.heading);
              for (let index = 0; index < 28; index += 1) {
                const travel = ((now * (0.013 + cloudWindStrength * 0.014) + index * 7.7) % 58) - 29;
                const forwardOffset = ((index * 17) % 47) - 23;
                cloudWindDummy.position.set(
                  playerState.x + windX * travel + forwardX * forwardOffset,
                  playerState.y + 0.8 + (index % 9) * 0.72,
                  playerState.z + windZ * travel + forwardZ * forwardOffset,
                );
                cloudWindDummy.rotation.set(0, windHeading, 0);
                cloudWindDummy.scale.set(1, 1, 0.72 + cloudWindStrength * 0.72);
                cloudWindDummy.updateMatrix();
                cloudWindStreaks.setMatrixAt(index, cloudWindDummy.matrix);
              }
              cloudWindStreaks.instanceMatrix.needsUpdate = true;
            }
          }

        }

        if (oceanTime) oceanTime.value = now * 0.001;
        if (courseDefinition.id === "pirate") {
          const completedLaps = Math.floor(Math.max(0, playerState.progress));
          const pirateLapIndex = Math.min(2, completedLaps);
          const pirateLapFraction = wrap01(Math.max(0, playerState.progress));
          const transitionRaw = clamp(pirateLapFraction / 0.14, 0, 1);
          const transitionEase = transitionRaw * transitionRaw * (3 - 2 * transitionRaw);
          const weatherStage = pirateLapIndex === 0 ? 0 : pirateLapIndex === 1 ? transitionEase : 1 + transitionEase;
          const stormAmount = clamp(weatherStage - 1, 0, 1);
          visualStormStrength = stormAmount;
          if (pirateAtmosphere && pirateWeatherColors) {
            const blendWeather = (target: Three.Color, clear: Three.Color, battle: Three.Color, storm: Three.Color) => {
              if (weatherStage <= 1) target.copy(clear).lerp(battle, weatherStage);
              else target.copy(battle).lerp(storm, weatherStage - 1);
            };
            if (scene.background instanceof THREE.Color) {
              blendWeather(scene.background, pirateWeatherColors.clearSky, pirateWeatherColors.battleSky, pirateWeatherColors.stormSky);
            }
            if (scene.fog instanceof THREE.Fog) {
              blendWeather(scene.fog.color, pirateWeatherColors.clearFog, pirateWeatherColors.battleFog, pirateWeatherColors.stormFog);
              scene.fog.near = THREE.MathUtils.lerp(190, 120, stormAmount);
              scene.fog.far = THREE.MathUtils.lerp(490, 350, stormAmount);
            }
            blendWeather(pirateAtmosphere.oceanMaterial.color, pirateWeatherColors.clearSea, pirateWeatherColors.battleSea, pirateWeatherColors.stormSea);
            blendWeather(pirateAtmosphere.hemisphere.color, pirateWeatherColors.clearHemi, pirateWeatherColors.battleHemi, pirateWeatherColors.stormHemi);
            blendWeather(pirateAtmosphere.hemisphere.groundColor, pirateWeatherColors.clearGround, pirateWeatherColors.battleGround, pirateWeatherColors.stormGround);
            blendWeather(pirateAtmosphere.sun.color, pirateWeatherColors.clearSun, pirateWeatherColors.battleSun, pirateWeatherColors.stormSun);
            const lightningCycle = now % 6900;
            const lightningFlash = stormAmount > 0.72 && (lightningCycle < 105 || (lightningCycle > 210 && lightningCycle < 285))
              ? (lightningCycle < 105 ? 1 - lightningCycle / 105 : 1 - (lightningCycle - 210) / 75)
              : 0;
            pirateAtmosphere.hemisphere.intensity = THREE.MathUtils.lerp(1.48, 1.18, stormAmount) + lightningFlash * 1.9;
            pirateAtmosphere.sun.intensity = THREE.MathUtils.lerp(2.45, 1.58, stormAmount) + lightningFlash * 3.4;
            pirateAtmosphere.stormClouds.visible = weatherStage > 0.08;
            pirateAtmosphere.rain.visible = stormAmount > 0.08;
            pirateAtmosphere.sailMaterial.color.copy(pirateWeatherColors.clearSail).lerp(pirateWeatherColors.stormSail, stormAmount);
            pirateAtmosphere.sailMaterial.emissiveIntensity = 0.08 + lightningFlash * 0.36;
            pirateAtmosphere.floodMaterial.opacity = 0.43 + Math.abs(Math.sin(now * 0.0026)) * 0.11;
            pirateAtmosphere.floodMaterial.emissiveIntensity = 0.2 + Math.abs(Math.sin(now * 0.0034)) * 0.11;
            if (pirateAtmosphere.rain.visible) {
              const positions = pirateAtmosphere.rainPositions;
              for (let index = 0; index < positions.length; index += 3) {
                positions[index + 1] -= dt * (54 + (index % 19));
                positions[index] -= dt * 5.5;
                if (positions[index + 1] < 4) {
                  positions[index + 1] = 96 + ((index * 17) % 24);
                  positions[index] = -145 + ((index * 31) % 290);
                }
              }
              const rainPosition = pirateAtmosphere.rain.geometry.getAttribute("position") as Three.BufferAttribute;
              rainPosition.needsUpdate = true;
            }
          }
          seagulls.forEach((gull) => {
            gull.visible = stormAmount < 0.82;
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

        if (racing && !timeTrialMode && courseDefinition.id === "cloud" && (!evolutionMode || evolutionLocalStage === 2)) {
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
            nextCloudGapChangeAt = now + (cloudStormStrength > 0.55 ? 7000 : raceElapsedSeconds >= 50 ? 9500 : 8000);
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
          playerState.rankingProgress = playerState.progress;
          playerState.speed = 9;
          playerState.groundY = recovery.y;
          playerState.airborne = false;
          playerState.belowCourseSince = null;
          playerState.airGravity = STRONG_JUMP_GRAVITY;
          playerState.motionState = "grounded";
          playerState.giantLowDashActive = false;
          playerState.giantLowDashUntil = 0;
          playerState.verticalVelocity = 0;
          playerState.surfaceVerticalVelocity = 0;
          playerState.offTrackSince = 0;
          playerState.jumpCooldownUntil = now + JUMP_COOLDOWN_MS;
        }
        playerState.wasCrashing = playerCrashing;

        if (racing && !playerCrashing) {
          const gas = mobileAutoDrive.current
            ? 1
            : Math.max(keyboardActionPressed("gas") || touch.current.gas ? 1 : 0, controllerInput.gas);
          const brake = Math.max(keyboardActionPressed("brake") || touch.current.brake ? 1 : 0, controllerInput.brake);
          const useSkill = Boolean(keyboardActionPressed("skill") || touch.current.skill || controllerInput.skill);
          const playerUsesGiantLeap = characterSkill(selectedCharacter) === "GIANT";
          if (skillsEnabled && evolutionFeatures.skills && playerUsesGiantLeap) {
            if (useSkill && !skillPressed) beginPlayerGiantCharge(now);
            if (playerState.giantLeapCharging && (!useSkill || now - playerState.giantLeapChargeStartedAt >= GIANT_LEAP_CHARGE_DURATION_MS)) {
              releasePlayerGiantCharge(now);
            }
          } else if (skillsEnabled && evolutionFeatures.skills && useSkill && !skillPressed) {
            activateActorSkill(0, now, playerInputSteer);
          }
          skillPressed = useSkill;

          const boosting = now < playerState.boostUntil;
          const giantLowDashBoosting = now < playerState.giantLowDashUntil;
          const steering = playerInputSteer;
          playerState.vectorTurboActive = vectorTurboRemainsActive({
            active: playerState.vectorTurboActive,
            steer: steering,
            crashing: playerCrashing,
          });
          const timedSkillBoostMultiplier = now < playerState.skillBoostUntil ? playerState.skillBoostMultiplier : 0;
          const playerSkillTurboMultiplier = Math.max(
            timedSkillBoostMultiplier,
            playerState.vectorTurboActive ? 3 : 0,
          );
          const auroraActive = now < playerState.auroraUntil;
          const shieldSpeedCap = actorHasShield(0, now) ? shieldSpeedCapForLevel(actorShieldLevel(0)) : 0;
          const playerWasAirborneForRanking = playerState.airborne;
          const nearestBefore = course.nearestSurface(playerState.x, playerState.y, playerState.z, playerState.lastU);
          const previousMotionPosition = { x: playerState.x, y: playerState.y, z: playerState.z };
          const laneBefore = (playerState.x - nearestBefore.pose.x) * nearestBefore.pose.nx + (playerState.z - nearestBefore.pose.z) * nearestBefore.pose.nz;
          const activeRiverChannel = courseDefinition.id === "river" ? runtimeRiverChannelAt(playerState.progress, laneBefore) : undefined;
          const activeDamFlow = courseDefinition.id === "river" ? riverDamFlowAt(playerState.progress) : undefined;
          const riverDamFlowActive = Boolean(activeDamFlow && !playerState.airborne);
          const riverFlowActive = Boolean((activeRiverChannel || activeDamFlow) && !playerState.airborne);
          let normalDriveTurboCorrection = 0;
          if (!playerState.airborne && (gas > 0 || playerSkillTurboMultiplier > 0 || giantLowDashBoosting)) {
            const driveAcceleration = playerSkillTurboMultiplier > 0
              ? ITEM_TURBO_ACCELERATION * playerSkillTurboMultiplier
              : boosting ? ITEM_TURBO_ACCELERATION
                : giantLowDashBoosting ? ITEM_TURBO_ACCELERATION * 0.72 : machineDriveAcceleration(playerState.speed, machine);
            playerState.speed += driveAcceleration * (playerSkillTurboMultiplier > 0 || giantLowDashBoosting ? 1 : gas) * dt;
            if (playerSkillTurboMultiplier === 0 && !boosting && !giantLowDashBoosting) {
              // Drift release is resolved below, including its first frame. Remove only the
              // tuned normal-drive difference during that turbo; item/skill rewards stay intact.
              normalDriveTurboCorrection = (23 - driveAcceleration) * gas * dt;
            }
          }
          if (!playerState.airborne && brake > 0) playerState.speed -= 30 * brake * dt;
          if (activeRiverChannel && !playerState.airborne && playerState.speed > 2) playerState.speed += (3.4 + riverSurgeStrength * 4.6) * dt;
          if (riverFlowActive && activeRiverChannel) {
            const currentPull = clamp(activeRiverChannel.lane - laneBefore, -2.2, 2.2) * (0.24 + riverSurgeStrength * 0.34) * dt;
            playerState.x += nearestBefore.pose.nx * currentPull;
            playerState.z += nearestBefore.pose.nz * currentPull;
          }
          if (riverDamFlowActive && activeDamFlow) {
            const crossCurrent = riverSurgeStrength * 5.4 * dt * machine.waterCurrent;
            playerState.x += activeDamFlow.flowX * crossCurrent;
            playerState.z += activeDamFlow.flowZ * crossCurrent;
          }
          const onRoad = nearestBefore.distance <= BARRIER_LIMIT + 0.1;
          if (playerState.voltOverchargeActive && now >= playerState.voltActiveUntil) {
            playerState.voltOverchargeActive = false;
            playerState.voltCharge = 0;
          }
          const driftHeld = Boolean(keyboardActionPressed("drift") || touch.current.drift || controllerInput.drift);
          let suspendedDriftActive = playerState.driftChargeSuspended
            && playerState.driftCharge > 0.001
            && now <= playerState.driftChargeHoldUntil;
          if (playerState.driftChargeSuspended && !suspendedDriftActive) {
            playerState.driftChargeSuspended = false;
            playerState.driftChargeHoldUntil = 0;
            playerState.driftCharge = 0;
            playerState.driftEndedAt = -10000;
            playerState.driftLastSide = 0;
            playerState.driftLinkChain = 0;
            playerState.driftLinked = false;
          }
          if (suspendedDriftActive && !playerState.airborne && !driftHeld) {
            if (playerState.driftCharge >= 0.08 && playerState.driftCharge >= playerState.driftBoost) {
              playerState.driftBoost = playerState.driftCharge;
              playerState.driftBoostUsesTuning = true;
            }
            playerState.driftCharge = 0;
            playerState.driftChargeSuspended = false;
            playerState.driftChargeHoldUntil = 0;
            suspendedDriftActive = false;
          }
          const drifting = !playerState.airborne
            && evolutionFeatures.drift
            && driftHeld
            && (playerState.drifting || suspendedDriftActive || steering !== 0)
            && Math.abs(playerState.speed) > 11 * machine.driftEntry
            && onRoad;
          if (drifting && !playerState.drifting) {
            if (suspendedDriftActive) {
              playerState.driftChargeSuspended = false;
              playerState.driftChargeHoldUntil = 0;
              suspendedDriftActive = false;
            } else {
              const nextDriftSide = touch.current.drift && touch.current.driftOrigin !== 0
                ? touch.current.driftOrigin
                : Math.sign(steering);
              const linkGap = now - playerState.driftEndedAt;
              const linkedSnake = playerState.driftLastSide === -nextDriftSide
                && linkGap >= 60
                && linkGap <= 360
                && Math.abs(playerState.speed) >= 28;
              playerState.driftLinkChain = linkedSnake ? Math.min(3, playerState.driftLinkChain + 1) : 0;
              playerState.driftLinked = linkedSnake;
              playerState.driftStartedAt = now;
              playerState.driftWallHit = false;
              playerState.driftSide = nextDriftSide;
            }
            audioController.play("drift");
          }
          let voltBlocksNormalDriftReward = false;
          let pendingVoltReleaseBoost: number | null = null;
          let pendingVoltSkillBoost: { multiplier: number; durationMs: number } | null = null;
          if (playerState.voltOverchargeActive && drifting) {
            playerState.voltCharge = clamp(playerState.voltCharge + dt * VOLT_CHARGE_RATE, 0, 1);
            const voltState = resolveOverchargeDrift({ charge: playerState.voltCharge, released: false });
            if (voltState.outcome === "overheat") {
              playerState.voltOverchargeActive = false;
              playerState.voltCharge = 0;
              playerState.voltOverheatedUntil = now + VOLT_OVERHEAT_MS;
              playerState.driftBoost = 0;
              playerState.driftCharge = 0;
              playerState.voltRejectCurrentDrift = true;
              voltBlocksNormalDriftReward = true;
            }
          } else if (playerState.voltOverchargeActive && playerState.drifting && !drifting) {
            const voltState = resolveOverchargeDrift({ charge: playerState.voltCharge, released: true });
            playerState.voltOverchargeActive = false;
            playerState.voltCharge = 0;
            voltBlocksNormalDriftReward = true;
            if (voltState.outcome === "overheat") {
              playerState.voltOverheatedUntil = now + VOLT_OVERHEAT_MS;
              playerState.driftBoost = 0;
            } else if (voltState.outcome === "critical-success" || voltState.outcome === "success") {
              spawnSkillEffect(0, "VOLT", now, voltState.outcome === "critical-success" ? "critical" : "success");
              pendingVoltSkillBoost = {
                multiplier: voltState.multiplier,
                durationMs: voltState.durationMs ?? SKILL_TURBO_DURATION_MS,
              };
              showSkillFeedback(
                voltState.outcome === "critical-success" ? "Success!!" : "Success",
                voltState.outcome === "critical-success" ? "critical" : "orange",
                1500,
              );
            } else {
              pendingVoltReleaseBoost = Number.isFinite(voltState.boost)
                ? clamp(voltState.boost, 0, 1)
                : 0;
            }
          }
          if (drifting) {
            const driftElapsed = Math.max(0, (now - playerState.driftStartedAt) / 1000);
            const chargeRamp = driftElapsed < 0.35 * machine.chargeDelay ? 0 : driftElapsed < 0.7 * machine.chargeDelay ? 0.55 : 1;
            const driftRoadAhead = course.pointAt(nearestBefore.u + 0.012);
            let driftRoadTurn = driftRoadAhead.heading - nearestBefore.pose.heading;
            if (driftRoadTurn > Math.PI) driftRoadTurn -= TAU;
            if (driftRoadTurn < -Math.PI) driftRoadTurn += TAU;
            const roadTurnSeverity = Math.abs(driftRoadTurn);
            const matchesRoadCurve = roadTurnSeverity >= 0.028 && Math.sign(driftRoadTurn) === playerState.driftSide;
            const driftChargeRate = matchesRoadCurve ? 0.46 : roadTurnSeverity < 0.028 ? 0.24 : 0.12;
            const snakeLinkMultiplier = 1 + playerState.driftLinkChain * 0.18;
            const driftSpeedMultiplier = clamp((Math.abs(playerState.speed) - 14) / 20, 0.55, 1.08);
            playerState.driftCharge = clamp(
              playerState.driftCharge + dt * driftChargeRate * chargeRamp * snakeLinkMultiplier * driftSpeedMultiplier * machine.chargeRate,
              0,
              1,
            );
          } else if (playerState.drifting) {
            const completedDriftMs = now - playerState.driftStartedAt;
            if (completedDriftMs >= 520 && playerState.driftCharge >= 0.05 && !playerState.driftWallHit) {
              playerState.driftEndedAt = now;
              playerState.driftLastSide = playerState.driftSide;
            } else {
              playerState.driftEndedAt = -10000;
              playerState.driftLastSide = 0;
              playerState.driftLinkChain = 0;
            }
            if (!voltBlocksNormalDriftReward && !playerState.voltRejectCurrentDrift && playerState.driftCharge >= 0.08 && playerState.driftCharge >= playerState.driftBoost) {
              playerState.driftBoost = playerState.driftCharge;
              playerState.driftBoostUsesTuning = true;
            }
            playerState.driftCharge = 0;
            playerState.voltRejectCurrentDrift = false;
          }
          if (pendingVoltReleaseBoost !== null && pendingVoltReleaseBoost >= playerState.driftBoost) {
            playerState.driftBoost = pendingVoltReleaseBoost;
            playerState.driftBoostUsesTuning = false;
          }
          if (pendingVoltSkillBoost !== null) {
            setActorSkillBoost(0, now, pendingVoltSkillBoost.durationMs, pendingVoltSkillBoost.multiplier);
          }
          playerState.drifting = drifting;
          const driftDashing = !drifting && playerState.driftBoost > 0.001;
          const driftTurboJustStarted = driftDashing && !wasDriftDashing;
          const driftTurboJustEnded = !driftDashing && wasDriftDashing;
          if (driftTurboJustStarted) {
            driftTurboFadeStartedAt = -10000;
            driftTurboVisualStartedAt = now;
            audioController.play("driftTurbo");
            runStats.driftTurbos += 1;
            onRunEvent("drift-turbo");
          }
          if (driftTurboJustEnded) driftTurboFadeStartedAt = now;
          wasDriftDashing = driftDashing;
          if (driftDashing && !playerState.airborne) {
            playerState.speed += (9 + playerState.driftBoost * 3.5) * dt
              + (playerState.driftBoostUsesTuning ? normalDriveTurboCorrection : 0);
            playerState.driftBoost = Math.max(0, playerState.driftBoost - dt * 0.45 / (playerState.driftBoostUsesTuning ? machine.boostDuration : 1));
          }
          const steerGrip = clamp(Math.abs(playerState.speed) / 8, 0.18, 1);
          const airSteer = playerState.airborne ? 0.62 * machine.airControl : 1;
          const cloudIceSteer = courseDefinition.id === "cloud" && !playerState.airborne ? 1 - cloudIceStrength * 0.18 * machine.iceSlip : 1;
          if (drifting) {
            const driftSteeringAlignment = clamp(steering * playerState.driftSide, -1, 1);
            const driftTurnRate = driftSteeringAlignment >= 0
              ? THREE.MathUtils.lerp(0.72, 1.34, driftSteeringAlignment)
              : THREE.MathUtils.lerp(0.72, 0.1, -driftSteeringAlignment);
            playerState.heading += playerState.driftSide
              * driftTurnRate
              * machineHandlingScale(playerState.speed, machine, true)
              * dt
              * steerGrip
              * cloudIceSteer
              * (playerState.speed >= 0 ? 1 : -1);
          } else {
            playerState.heading += steering * 1.72 * machineHandlingScale(playerState.speed, machine) * dt * steerGrip * airSteer * cloudIceSteer * (playerState.speed >= 0 ? 1 : -1);
          }
          const rollingDrag = playerState.airborne ? 0.9992 : onRoad ? (drifting ? 0.992 : 0.988) : 0.925;
          playerState.speed *= Math.pow(rollingDrag, deltaMs / 16.67);
          let cloudWindSpeedCapBonus = 0;
          if (courseDefinition.id === "cloud" && cloudWindStrength > 0.025) {
            const windHeading = playerState.heading + cloudWindAngle;
            const forwardWind = Math.sin(windHeading) * Math.sin(playerState.heading) + Math.cos(windHeading) * Math.cos(playerState.heading);
            playerState.speed += forwardWind * cloudWindStrength * 8.6 * dt;
            cloudWindSpeedCapBonus = Math.max(0, forwardWind) * cloudWindStrength * 4.2;
          }
          const normalSpeedCap = freeDriveSpeedCap({
            airborne: playerState.airborne,
            onRoad,
            currentSpeed: playerState.speed,
            roadSpeedCap: 34 * machine.topSpeed,
            offRoadSpeedCap: 13,
          });
          const driftTurboSpeedCap = 39.25;
          const ordinarySpeedCap = boosting
            ? Math.max(ITEM_TURBO_SPEED_CAP, driftDashing ? driftTurboSpeedCap : 0)
            : giantLowDashBoosting ? Math.max(43, normalSpeedCap)
              : driftDashing ? driftTurboSpeedCap
                : shieldSpeedCap > 0 ? shieldSpeedCap
                  : riverFlowActive ? 36.2 + riverSurgeStrength * 2.8 : normalSpeedCap;
          const skillRaisedSpeedCap = playerSkillTurboMultiplier > 0
            ? Math.max(ordinarySpeedCap, ITEM_TURBO_SPEED_CAP * playerSkillTurboMultiplier)
            : ordinarySpeedCap;
          const baseSpeedCap = playerState.voltOverheatedUntil > now ? Math.min(skillRaisedSpeedCap, 28) : skillRaisedSpeedCap;
          playerState.speed = clamp(playerState.speed, -8, baseSpeedCap + cloudWindSpeedCapBonus);
          playerState.x += Math.sin(playerState.heading) * playerState.speed * dt;
          playerState.z += Math.cos(playerState.heading) * playerState.speed * dt;
          const driftSpeed = Math.abs(playerState.speed);
          const driftSlipMultiplier = driftSpeed < 16
            ? 1.5
            : boosting || auroraActive || driftSpeed >= 38
              ? 3
              : 2;
          const driftCentrifugalBase = Math.min(11, Math.max(3.5, driftSpeed * 0.28));
          const driftSlipTarget = drifting
            ? -playerState.driftSide * driftCentrifugalBase * driftSlipMultiplier * machine.driftSlip
            : 0;
          const driftSlipResponse = 1 - Math.exp(-dt * machine.slipResponse / (drifting ? 0.09 : 0.42));
          playerState.driftSlipVelocity = THREE.MathUtils.lerp(
            playerState.driftSlipVelocity,
            driftSlipTarget,
            driftSlipResponse,
          );
          if (!playerState.airborne && onRoad && Math.abs(playerState.driftSlipVelocity) > 0.01) {
            const kartRightX = Math.cos(playerState.heading);
            const kartRightZ = -Math.sin(playerState.heading);
            playerState.x += kartRightX * playerState.driftSlipVelocity * dt;
            playerState.z += kartRightZ * playerState.driftSlipVelocity * dt;
          }
          if (courseDefinition.id === "cloud" && cloudIceStrength > 0.01 && !playerState.airborne && onRoad) {
            const iceSlip = steering * Math.abs(playerState.speed) * cloudIceStrength * 0.012 * dt * machine.iceSlip;
            playerState.x -= nearestBefore.pose.nx * iceSlip;
            playerState.z -= nearestBefore.pose.nz * iceSlip;
          }
          if (courseDefinition.id === "cloud" && cloudWindStrength > 0.025) {
            const windHeading = playerState.heading + cloudWindAngle;
            const windX = Math.sin(windHeading);
            const windZ = Math.cos(windHeading);
            const lateralWind = windX * nearestBefore.pose.nx + windZ * nearestBefore.pose.nz;
            const windPush = lateralWind * cloudWindStrength * (playerState.airborne ? 4.45 : 3.5) * dt;
            playerState.x += nearestBefore.pose.nx * windPush;
            playerState.z += nearestBefore.pose.nz * windPush;
          }

          let nearestAfter = course.nearestSurface(playerState.x, playerState.y, playerState.z, nearestBefore.u);
          let lateralOffset = (playerState.x - nearestAfter.pose.x) * nearestAfter.pose.nx + (playerState.z - nearestAfter.pose.z) * nearestAfter.pose.nz;
          if (!playerState.offTrackSince && Math.abs(lateralOffset) > BARRIER_LIMIT) {
            const wallSide = Math.sign(lateralOffset);
            const canClearBarrier = playerState.airborne
              && !playerState.giantLowDashActive
              && playerState.y > nearestAfter.pose.y + 0.55;
            if (canClearBarrier) {
              const clearedWholeKart = hasFullyClearedGuardrail({
                lane: lateralOffset,
                guardrailLane: BARRIER_LANE,
                kartHalfWidth: KART_COLLISION_HALF_WIDTH,
              });
              if (clearedWholeKart) {
                if (!runStats.clearedGuardrail) {
                  runStats.clearedGuardrail = true;
                  onRunEvent("guardrail-clear");
                }
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
              playerState.driftSlipVelocity *= -0.22 * machine.wallBounce;
              if (machine.wallGuide > 0) {
                // Remove the heading component pushing into the wall. No speed teleport/bonus.
                const tangent = nearestAfter.pose.heading + (Math.cos(nearestAfter.pose.heading - playerState.heading) < 0 ? Math.PI : 0);
                let headingError = tangent - playerState.heading;
                headingError = Math.atan2(Math.sin(headingError), Math.cos(headingError));
                playerState.heading += headingError * (1 - Math.exp(-dt * machine.wallGuide));
              }
              if (playerState.drifting) {
                playerState.driftCharge *= 0.35 * machine.wallChargeRetention;
                playerState.driftLinkChain = 0;
                playerState.driftLinked = false;
                playerState.driftWallHit = true;
              }
              nearestAfter = course.nearestSurface(playerState.x, playerState.y, playerState.z, nearestAfter.u);
              lateralOffset = (playerState.x - nearestAfter.pose.x) * nearestAfter.pose.nx + (playerState.z - nearestAfter.pose.z) * nearestAfter.pose.nz;
            }
          }
          if (playerState.offTrackSince) {
            nearestAfter = course.nearestSurface(playerState.x, playerState.y, playerState.z);
            lateralOffset = (playerState.x - nearestAfter.pose.x) * nearestAfter.pose.nx + (playerState.z - nearestAfter.pose.z) * nearestAfter.pose.nz;
          }
          if (!playerState.offTrackSince) {
            const trackedProgress = resolveTrackedCourseProgress({
              currentProgress: playerState.progress,
              lastU: playerState.lastU,
              candidateU: nearestAfter.u,
              candidateDistance: nearestAfter.distance,
              maxDistance: BARRIER_LIMIT + 0.1,
              maxDelta: 0.08,
              minimumProgress: PLAYER_START_PROGRESS,
            });
            playerState.progress = trackedProgress.progress;
            playerState.lastU = trackedProgress.lastU;
          }
          playerState.rankingProgress = rankingProgressFromGroundContact({
            previousRankingProgress: playerState.rankingProgress,
            courseProgress: playerState.progress,
            airborne: playerWasAirborneForRanking,
          });
          const previousGroundY = playerState.groundY;
          playerState.groundY = nearestAfter.pose.y;
          const maxSurfaceVerticalSpeed = Math.max(4, Math.abs(playerState.speed) * 0.72);
          let measuredSurfaceVerticalSpeed = clamp(
            (playerState.groundY - previousGroundY) / Math.max(dt, 0.001),
            -maxSurfaceVerticalSpeed,
            maxSurfaceVerticalSpeed,
          );
          const cloudTileCount = Math.max(1, cloudPatches.length / 2);
          const cloudTileIndex = Math.floor(wrap01(nearestAfter.u) * cloudTileCount) % cloudTileCount;
          const cloudSide = lateralOffset >= 0 ? 1 : -1;
          const cloudRoadMissing = courseDefinition.id === "cloud"
            && (!evolutionMode || evolutionLocalStage === 2)
            && cloudGapKeys.has(`${cloudTileIndex}:${cloudSide}`);
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
            playerState.belowCourseSince = null;
            playerState.offTrackSince = now;
            playerState.airGravity = playerTakeoffGravityAt(now);
            playerState.verticalVelocity = Math.min(0, playerState.surfaceVerticalVelocity);
            playerState.y = playerState.groundY + 0.02;
            suspendPlayerDriftCharge(now);
          }
          if (playerState.airborne) {
            const previousAirY = playerState.y;
            const playerAirGravity = playerState.airGravity;
            playerState.verticalVelocity -= playerAirGravity * dt;
            playerState.y += playerState.verticalVelocity * dt;
            const flightPitch = clamp(-Math.atan2(playerState.verticalVelocity, Math.max(8, Math.abs(playerState.speed))), -0.32, 0.36);
            playerState.pitch = THREE.MathUtils.lerp(playerState.pitch, flightPitch, 0.1);
            const overRoad = isWithinRoadFootprint({
              surfaceDistance: nearestAfter.distance,
              lane: lateralOffset,
              roadHalfWidth: playerState.offTrackSince ? COURSE_WIDTH : BARRIER_LIMIT,
              kartHalfWidth: KART_COLLISION_HALF_WIDTH,
              minimumKartOverlapFraction: KART_LANDING_OVERLAP_FRACTION,
            }) && !roadMissing;
            const overGuardrail = overlapsGuardrailByFraction({
              lane: lateralOffset,
              guardrailLane: BARRIER_LANE,
              kartHalfWidth: KART_COLLISION_HALF_WIDTH,
              minimumKartOverlapFraction: KART_LANDING_OVERLAP_FRACTION,
            });
            const previousRoadClearance = previousAirY - previousGroundY;
            const currentRoadClearance = playerState.y - playerState.groundY;
            const previousGuardrailClearance = previousAirY - (previousGroundY + GUARDRAIL_TOP_OFFSET);
            const currentGuardrailClearance = playerState.y - (playerState.groundY + GUARDRAIL_TOP_OFFSET);
            const descendingTowardRoad = isApproachingRoad({
              airVerticalVelocity: playerState.verticalVelocity,
              surfaceVerticalVelocity: measuredSurfaceVerticalSpeed,
            });
            const sweptRoadContact = descendingTowardRoad
              ? findSweptRoadContact(
                  previousMotionPosition,
                  { x: playerState.x, y: playerState.y, z: playerState.z },
                  playerState.offTrackSince ? undefined : nearestBefore.u,
                )
              : null;
            const sweptRoadCrossing = Boolean(
              sweptRoadContact
              && (sweptRoadContact.kind === "guardrail" || !roadMissing),
            );
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
            const crossedGuardrailFromAbove = (
              overGuardrail
              && descendingTowardRoad
              && previousGuardrailClearance >= -0.08
              && currentGuardrailClearance <= 0.025
            );
            const shallowGuardrailPenetration = (
              overGuardrail
              && descendingTowardRoad
              && currentGuardrailClearance <= 0.025
              && currentGuardrailClearance >= -landingCatchDepth
            );
            // Once the kart has cleared a guardrail, height equality with a
            // nearby road is not a landing. Only a swept, physical footprint
            // contact can end the fall before altitude-triggered recovery.
            const reachedRoadSurface = playerState.offTrackSince
              ? sweptRoadCrossing
              : sweptRoadCrossing
                || crossedRoadFromAbove
                || shallowRoadPenetration
                || crossedGuardrailFromAbove
                || shallowGuardrailPenetration;
            if (now - playerState.airborneSince > 90 && reachedRoadSurface) {
              const landedOnGuardrail = sweptRoadContact?.kind === "guardrail"
                || crossedGuardrailFromAbove
                || shallowGuardrailPenetration;
              if (sweptRoadContact) {
                nearestAfter = sweptRoadContact.surface;
                lateralOffset = sweptRoadContact.lane;
                playerState.groundY = nearestAfter.pose.y;
                measuredSurfaceVerticalSpeed = clamp(
                  (playerState.groundY - previousGroundY) / Math.max(dt, 0.001),
                  -maxSurfaceVerticalSpeed,
                  maxSurfaceVerticalSpeed,
                );
              }
              if (landedOnGuardrail) {
                const safeLane = Math.sign(lateralOffset || 1) * (BARRIER_LIMIT - 0.28);
                playerState.x = nearestAfter.pose.x + nearestAfter.pose.nx * safeLane;
                playerState.z = nearestAfter.pose.z + nearestAfter.pose.nz * safeLane;
                lateralOffset = safeLane;
              }
              if (playerState.offTrackSince) {
                playerState.progress = Math.max(
                  PLAYER_START_PROGRESS,
                  playerState.recoveryProgress + progressDelta(nearestAfter.u, playerState.recoveryU),
                );
                playerState.lastU = nearestAfter.u;
                playerState.offTrackSince = 0;
              }
              playerState.airborne = false;
              playerState.rankingProgress = playerState.progress;
              playerState.belowCourseSince = null;
              playerState.airGravity = STRONG_JUMP_GRAVITY;
              playerState.motionState = "grounded";
              playerState.giantLowDashActive = false;
              playerState.y = playerState.groundY;
              playerState.verticalVelocity = 0;
              playerState.surfaceVerticalVelocity = measuredSurfaceVerticalSpeed > 0 ? measuredSurfaceVerticalSpeed * machine.landingBounce : measuredSurfaceVerticalSpeed;
              playerState.pitch = getKartRoadSupport(nearestAfter.u, lateralOffset, playerState.heading).pitch;
              playerState.landingImpactUntil = now + 360;
              playerState.jumpCooldownUntil = Math.max(playerState.jumpCooldownUntil, now + 650);
              audioController.play("land");
            } else {
              const recoveryState = updateBelowCourseRecovery({
                now,
                altitude: playerState.y,
                lowestRoadHeight: course.lowestRoadHeight,
                belowCourseSince: playerState.belowCourseSince,
              });
              playerState.belowCourseSince = recoveryState.belowCourseSince;
              if (recoveryState.shouldRecover) recoverPlayerFromFall(now);
            }
          } else {
            const jumpLane = clamp(lateralOffset, -BARRIER_LIMIT, BARRIER_LIMIT);
            const vehicleForwardX = Math.sin(playerState.heading);
            const vehicleForwardZ = Math.cos(playerState.heading);
            const roadForwardX = -nearestAfter.pose.nz;
            const roadForwardZ = nearestAfter.pose.nx;
            const signedTrackSpeed = playerState.speed * (vehicleForwardX * roadForwardX + vehicleForwardZ * roadForwardZ);
            const horizontalSpeed = Math.abs(signedTrackSpeed);
            const takeoffGravity = playerTakeoffGravityAt(now);
            const tunedSurfaceLaunch = playerState.surfaceVerticalVelocity > 0
              ? playerState.surfaceVerticalVelocity * machine.bumpLaunch
              : playerState.surfaceVerticalVelocity;
            const separationProfile = getRoadSeparationProfile(
              nearestAfter.u,
              jumpLane,
              signedTrackSpeed,
              tunedSurfaceLaunch,
              takeoffGravity,
            );
            if (horizontalSpeed >= JUMP_MIN_SPEED && now >= playerState.jumpCooldownUntil && separationProfile.separatesFromRoad) {
              playerState.recoveryProgress = playerState.progress;
              playerState.recoveryU = playerState.lastU;
              playerState.recoveryLane = jumpLane;
              playerState.airborne = true;
              playerState.motionState = "airborne";
              playerState.airborneSince = now;
              playerState.belowCourseSince = null;
              playerState.airGravity = takeoffGravity;
              playerState.verticalVelocity = tunedSurfaceLaunch;
              playerState.y = Math.max(
                playerState.groundY + 0.03,
                playerState.y + playerState.verticalVelocity * dt - 0.5 * takeoffGravity * dt * dt,
              );
              playerState.pitch = clamp(-Math.atan2(playerState.verticalVelocity, Math.max(8, horizontalSpeed)), -0.32, 0.36);
              suspendPlayerDriftCharge(now);
              playerState.jumpCooldownUntil = now + JUMP_COOLDOWN_MS;
              audioController.play("jump");
            } else {
              const suspensionResponse = 1 - Math.exp(-dt * machine.surfaceFollow / 0.11);
              playerState.surfaceVerticalVelocity = THREE.MathUtils.lerp(
                playerState.surfaceVerticalVelocity,
                measuredSurfaceVerticalSpeed,
                suspensionResponse,
              );
              playerState.y = playerState.groundY;
              playerState.pitch = getKartRoadSupport(nearestAfter.u, lateralOffset, playerState.heading).pitch;
            }
          }

          if ((gas || boosting || giantLowDashBoosting || driftDashing || playerState.vectorTurboActive || drifting || auroraActive) && Math.abs(playerState.speed) > 4) {
            exhaustLife[exhaustCursor] = 1;
            const base = exhaustCursor * 3;
            exhaustPositions[base] = playerState.x - Math.sin(playerState.heading) * 2.1 + (Math.random() - 0.5) * 0.35;
            exhaustPositions[base + 1] = playerState.y + 0.58 + Math.random() * 0.2;
            exhaustPositions[base + 2] = playerState.z - Math.cos(playerState.heading) * 2.1 + (Math.random() - 0.5) * 0.35;
            exhaustCursor = (exhaustCursor + 1) % exhaustCount;
          }

          if (driftTurboJustStarted) pendingTurboBurst = true;

          const driftTurboFade = clamp(1 - (now - driftTurboFadeStartedAt) / DRIFT_TURBO_FADE_MS, 0, 1);
          const turboVisualActive = boosting || giantLowDashBoosting || driftDashing || playerState.vectorTurboActive || driftTurboFade > 0;
          {
            const driftStrength = driftDashing || playerState.vectorTurboActive
              ? clamp(0.64 + playerState.driftBoost * 0.72, 0.64, 1.32)
              : driftTurboFade > 0
                ? 0.22 + driftTurboFade * 0.48
                : 1;
            const driftFlame = driftDashing || driftTurboFade > 0;
            turboExhaust.update({
              active: turboVisualActive && !playerState.airborne && !playerCrashing,
              timeSeconds: now * .001,
              strength: driftStrength,
              drift: driftFlame,
              boosting: boosting || giantLowDashBoosting,
              ignitionAge: (now - driftTurboVisualStartedAt) * .001,
            });
          }

          const position = actorRank(0);
          if (actorCount > 1 && now - raceStart >= 3000 && position === actorCount) runStats.wasLast = true;
          captureGhostSample(now);
          if (now - hudTick > 80) {
            hudTick = now;
            onTelemetry(
              Math.max(0, playerState.speed * 7.1),
              playerState.progress,
              position,
              drifting || playerState.driftChargeSuspended ? playerState.driftCharge : playerState.driftBoost,
              driftDashing,
            );
            const playerCometStream = cometStreams.find((stream) => stream.active && stream.owner === 0);
            const giantLeapAngle = playerState.giantLeapCharging
              ? giantLeapChargeAngle({ elapsedMs: now - playerState.giantLeapChargeStartedAt })
              : 0;
            const giantLeapProfile = giantLeapProfileForAngle(giantLeapAngle);
            const playerSkillActive = playerState.giantLeapCharging || playerState.vectorTurboActive || playerState.voltOverchargeActive || Boolean(playerCometStream);
            const playerSkillProgress = playerState.giantLeapCharging
              ? giantLeapAngle / GIANT_LEAP_MAX_ANGLE
              : playerState.voltOverchargeActive
              ? playerState.voltCharge
              : playerCometStream
                ? (playerCometStream.gateIndex + 1) / 3
                : playerState.vectorTurboActive ? 1 : 0;
            const playerSkillLabel = playerState.giantLeapCharging
              ? giantLeapProfile.outcome === "undercharge" ? "HOLD"
                : giantLeapProfile.outcome === "low-dash" ? "LOW DASH"
                  : giantLeapProfile.outcome === "long-jump" ? "LONG JUMP"
                    : giantLeapProfile.outcome === "high-jump" ? "HIGH JUMP" : "OVER"
              : playerState.vectorTurboActive
              ? "NO STEER"
              : playerState.voltOverchargeActive
                ? playerState.voltCharge >= VOLT_CRITICAL_MIN && playerState.voltCharge <= VOLT_CRITICAL_MAX
                  ? "RELEASE!!"
                  : playerState.voltCharge >= VOLT_SUCCESS_MIN && playerState.voltCharge <= VOLT_SUCCESS_MAX
                    ? "RELEASE!"
                    : playerState.voltCharge > VOLT_SUCCESS_MAX ? "DANGER" : "CHARGE"
                : playerCometStream ? `GATE ${playerCometStream.gateIndex + 1}/3` : "";
            onSkillChange(
              Math.max(0, playerState.skillReadyAt - now),
              skillCooldownFor(selectedCharacter),
              playerSkillActive,
              playerSkillProgress,
              playerSkillLabel,
            );
          }
        } else {
          if (!racing) {
            itemPressed = false;
            skillPressed = false;
            playerState.giantLeapCharging = false;
            playerState.giantLeapChargeStartedAt = 0;
            playerState.giantLowDashUntil = 0;
          }
          playerState.speed *= 0.94;
          if (phaseRef.current !== "racing") raceStart = 0;
        }

        if (racing) {
          rivalStates.forEach((rival, index) => {
            // Skill scheduling runs after the crash/driving branch. Keep only
            // values that are valid in both paths outside that block instead
            // of reading block-scoped drift variables after it closes.
            let cpuSkillWantsDrift = rival.drifting;
            let cpuSkillTurnSeverity = 0;
            let cpuSkillSteer = rival.drifting ? 1 : 0;
            let gojoRecordedShortcutReserved = false;
            if (rival.vectorTurboActive) {
              const vectorTravelPose = actorPose(index + 1);
              const vectorTravelX = vectorTravelPose.x - rival.vectorTurboLastX;
              const vectorTravelZ = vectorTravelPose.z - rival.vectorTurboLastZ;
              if (Math.hypot(vectorTravelX, vectorTravelZ) >= 0.04) {
                const vectorTravelHeading = Math.atan2(vectorTravelX, vectorTravelZ);
                rival.vectorTurboActive = cpuVectorTurboRemainsActive({
                  active: rival.vectorTurboActive,
                  startHeading: rival.vectorTurboHeading,
                  currentHeading: vectorTravelHeading,
                  crashing: now < rival.crashUntil,
                });
              }
              rival.vectorTurboLastX = vectorTravelPose.x;
              rival.vectorTurboLastZ = vectorTravelPose.z;
            }
            if (now >= rival.crashUntil) {
              if (!rival.shortcutActive && !rival.airborne) {
                const recordedShortcut = findRecordedGojoShortcut(index + 1);
                const recordedShortcutPhase = recordedShortcut
                  ? gojoRecordedShortcutApproachPhase({
                      distanceToRecordedTakeoff: recordedShortcut.distanceToTakeoff,
                    })
                  : "none";
                gojoRecordedShortcutReserved = recordedShortcutPhase === "reserve" || recordedShortcutPhase === "launch";
                if (recordedShortcut && recordedShortcutPhase === "launch") {
                  pendingRivalShortcuts.set(index + 1, recordedShortcut);
                  launchGiantJump(index + 1, now);
                }
              }
              if (rival.shortcutActive) {
                const previousProgress = rival.shortcutProgress;
                rival.shortcutProgress = Math.min(1, rival.shortcutProgress + dt / rival.shortcutDuration);
                const flightStep = (rival.shortcutProgress - previousProgress) * rival.shortcutDuration;
                rival.progress = THREE.MathUtils.lerp(
                  rival.shortcutStartProgress,
                  rival.shortcutTargetProgress,
                  rival.shortcutProgress,
                );
                const shortcutBase = recordedShortcutFlightPosition({
                  startX: rival.shortcutFromX,
                  startZ: rival.shortcutFromZ,
                  endX: rival.shortcutToX,
                  endZ: rival.shortcutToZ,
                  progress: rival.shortcutProgress,
                });
                const shortcutBaseX = shortcutBase.x;
                const shortcutBaseZ = shortcutBase.z;
                rival.airY += rival.verticalVelocity * flightStep - 0.5 * rival.airGravity * flightStep * flightStep;
                rival.verticalVelocity -= rival.airGravity * flightStep;
                const shortcutAvoidTarget = rival.name === "Gojo" && courseDefinition.id === "starlight"
                  ? chooseRecordedShortcutStarAvoidance({
                      startX: rival.shortcutFromX,
                      startY: rival.shortcutFromY,
                      startZ: rival.shortcutFromZ,
                      endX: rival.shortcutToX,
                      endZ: rival.shortcutToZ,
                      currentProgress: rival.shortcutProgress,
                      duration: rival.shortcutDuration,
                      launchVelocity: rival.shortcutLaunchVelocity,
                      gravity: rival.airGravity,
                      stars: shootingStars.filter((star) => star.active).map((star) => {
                        const starRoad = course.pointAt(star.progress, star.lane);
                        return { x: starRoad.x, y: star.y, z: starRoad.z, fallSpeed: star.fallSpeed };
                      }),
                    })
                  : 0;
                rival.shortcutAvoidOffset = THREE.MathUtils.lerp(
                  rival.shortcutAvoidOffset,
                  shortcutAvoidTarget,
                  1 - Math.exp(-dt * 9),
                );
                const shortcutAvoidBlend = Math.sin(Math.PI * rival.shortcutProgress);
                rival.shortcutX = shortcutBaseX
                  + Math.cos(rival.shortcutHeading) * rival.shortcutAvoidOffset * shortcutAvoidBlend;
                rival.shortcutZ = shortcutBaseZ
                  - Math.sin(rival.shortcutHeading) * rival.shortcutAvoidOffset * shortcutAvoidBlend;
                rival.drifting = false;
                rival.driftCharge = 0;
                rival.driftSlipVelocity = 0;
                rival.driftDecisionMade = false;
                rival.driftStartedAt = 0;
                rival.driftMinimumUntil = 0;
                rival.driftCurveSign = 0;
                rival.driftPhase = "entry";
                rival.driftCountersteer = 0;
                rival.driftPreviousSlipAngle = 0;
                rival.driftRecoveryTicks = 0;
                rival.driftSafetyLane = rival.lane;
                rival.driftSafetyCost = 0;
                rival.avoidanceRouteCheckAt = 0;
                rival.avoidanceRouteLane = rival.lane;
                rival.avoidanceThreatDistance = Number.POSITIVE_INFINITY;
                rival.avoidanceRouteCost = 0;
                if (rival.shortcutProgress >= 1) {
                  rival.shortcutActive = false;
                  rival.airborne = false;
                  rival.airGravity = STRONG_JUMP_GRAVITY;
                  rival.motionState = "grounded";
                  rival.progress = rival.shortcutTargetProgress;
                  rival.rankingProgress = rival.shortcutTargetProgress;
                  rival.lane = rival.shortcutTargetLane;
                  rival.airY = rival.shortcutToY;
                  rival.verticalVelocity = 0;
                  rival.shortcutAvoidOffset = 0;
                  rival.surfaceVerticalVelocity = 0;
                  rival.landingImpactUntil = now + 330;
                  rival.jumpCooldownUntil = now + JUMP_COOLDOWN_MS;
                }
              } else {
              if (courseDefinition.id === "river") {
                const channel = riverChannelForProgress(rival.progress + 0.012);
                if (channel) rival.lane = THREE.MathUtils.lerp(rival.lane, channel.lane, 1 - Math.exp(-dt * 1.6));
                const rivalDamFlow = riverDamFlowAt(rival.progress);
                if (rivalDamFlow) {
                  const flowPose = course.pointAt(rival.progress, rival.lane);
                  const lateralFlow = rivalDamFlow.flowX * flowPose.nx + rivalDamFlow.flowZ * flowPose.nz;
                  rival.lane += lateralFlow * riverSurgeStrength * 4.5 * dt;
                  rival.lane = clamp(rival.lane, -BARRIER_LIMIT + 0.5, BARRIER_LIMIT - 0.5);
                }
              }
              if (courseDefinition.id === "cloud" && cloudWindStrength > 0.025) {
                const windHeading = playerState.heading + cloudWindAngle;
                const windX = Math.sin(windHeading);
                const windZ = Math.cos(windHeading);
                const rivalWindPose = course.pointAt(rival.progress, rival.lane);
                const lateralWind = windX * rivalWindPose.nx + windZ * rivalWindPose.nz;
                rival.lane += lateralWind * cloudWindStrength * 2.12 * dt;
                rival.lane = THREE.MathUtils.lerp(rival.lane, rival.homeLane, 1 - Math.exp(-dt * 0.38));
                rival.lane = clamp(rival.lane, -BARRIER_LIMIT + 0.5, BARRIER_LIMIT - 0.5);
              }
              const current = course.pointAt(rival.progress, rival.lane);
              const ahead = course.pointAt(rival.progress + 0.012, rival.lane);
              const gojoLineNow = rival.name === "Gojo" ? sampleGojoLineAt(rival.progress) : null;
              const gojoLineAhead = rival.name === "Gojo" ? sampleGojoLineAt(rival.progress, 14) : null;
              let gojoPickupLane: number | null = null;
              if (
                rival.name === "Gojo"
                && itemsEnabled
                && now >= itemPickupReadyAt[index + 1]
                && (rival.item === "EMPTY" || canUpgradeHeldItem(rival.item, rival.itemLevel))
              ) {
                let bestPickupScore = Number.POSITIVE_INFINITY;
                const currentLap = Math.floor(rival.progress);
                pickupPoints.forEach((pickup) => {
                  if (!pickup.active) return;
                  let pickupProgress = currentLap + pickup.progress;
                  if (pickupProgress < rival.progress - 0.002) pickupProgress += 1;
                  const distanceMeters = (pickupProgress - rival.progress) * course.length;
                  if (distanceMeters < 3 || distanceMeters > gojoTuning.itemLookaheadMeters) return;
                  const score = distanceMeters * 10 + Math.abs(pickup.lane - rival.lane);
                  if (score >= bestPickupScore) return;
                  bestPickupScore = score;
                  gojoPickupLane = pickup.lane;
                });
              }
              const gojoCloudPlan = rival.name === "Gojo"
                ? planGojoCloudAvoidance(rival.progress, rival.speed, now)
                : null;
              if (gojoCloudPlan) {
                rival.cloudAvoidLane = gojoCloudPlan.safeLane;
                rival.cloudAvoidUntilProgress = Math.max(rival.cloudAvoidUntilProgress, gojoCloudPlan.exitProgress);
                rival.cloudAvoidKey = gojoCloudPlan.key;
              }
              const gojoCloudAvoiding = rival.name === "Gojo"
                && courseDefinition.id === "cloud"
                && rival.progress < rival.cloudAvoidUntilProgress;
              if (!gojoCloudAvoiding && rival.name === "Gojo") {
                rival.cloudAvoidUntilProgress = -1;
                rival.cloudAvoidKey = "";
                const pendingCloudJump = pendingRivalShortcuts.get(index + 1);
                if (pendingCloudJump?.key.startsWith("cloud-gap:")) pendingRivalShortcuts.delete(index + 1);
              }
              // A missing cloud is handled only by early lane planning. Gojo
              // may not invent a jump that was absent from the recorded line.
              const rivalRankForDrift = actorRank(index + 1);
              const storedCurveActive = rival.driftApproachKey >= 0
                && rival.progress <= rival.driftCurveExitProgress + 6 / course.length;
              const shouldScanForCurve = !storedCurveActive && rival.progress >= rival.driftNextScanProgress;
              const scannedCurve = shouldScanForCurve
                ? findUpcomingCpuCurve(rival.progress, Math.max(18, rival.speed))
                : null;
              if (scannedCurve) {
                rival.driftNextScanProgress = scannedCurve.found
                  ? scannedCurve.exitProgress + 6 / course.length
                  : rival.progress + 18 / course.length;
              }
              const upcomingCurve = scannedCurve?.found
                ? scannedCurve
                : storedCurveActive
                  ? {
                      found: true,
                      sign: rival.driftApproachSign,
                      entryProgress: rival.driftCurveEntryProgress,
                      exitProgress: rival.driftCurveExitProgress,
                      entryDistanceMeters: Math.max(0, (rival.driftCurveEntryProgress - rival.progress) * course.length),
                      peakSeverity: rival.driftPeakSeverity,
                    }
                  : {
                      found: false,
                      sign: 0,
                      entryProgress: rival.progress,
                      exitProgress: rival.progress,
                      entryDistanceMeters: 0,
                      peakSeverity: 0,
                    };
              let turn = ahead.heading - current.heading;
              if (turn > Math.PI) turn -= TAU;
              if (turn < -Math.PI) turn += TAU;
              const turnSeverity = Math.abs(turn);
              const curveSign = turnSeverity > 0.028 ? Math.sign(turn) : 0;
              const previewSign = upcomingCurve.found ? upcomingCurve.sign : 0;
              const driftProfile = CPU_DRIFT_PROFILES[rival.name];
              const planningCurveSign = rival.drifting
                ? rival.driftSide
                : curveSign || previewSign || (rival.driftPhase === "entry" ? rival.driftApproachSign : 0);
              if (!rival.drifting && upcomingCurve.found) {
                const activePlanStillAhead = rival.driftApproachKey >= 0
                  && rival.driftApproachSign === previewSign
                  && rival.progress <= rival.driftCurveExitProgress + 6 / course.length;
                if (!activePlanStillAhead) {
                  const approachCornerIndex = Math.floor(wrap01(upcomingCurve.entryProgress) * 96)
                    + Math.floor(Math.max(0, upcomingCurve.entryProgress)) * 113;
                  const lineNoise = Math.abs(Math.sin((rival.driftDecisionSeed + approachCornerIndex + 41) * 9.731) * 19341.17) % 1;
                  rival.driftApproachKey = approachCornerIndex;
                  rival.driftApproachSign = previewSign;
                  rival.driftUseInsideLine = true;
                  const preferredApproachLane = previewSign * (rival.name === "Gojo" ? 6.7 : 5.15 + lineNoise * 1.35);
                  rival.driftApproachLane = chooseCpuSafeLane({
                    actorId: index + 1,
                    fromProgress: rival.progress,
                    fromLane: rival.lane,
                    targetProgress: upcomingCurve.entryProgress,
                    preferredLane: preferredApproachLane,
                    now,
                  }).lane;
                  const setupLeadMeters = clamp(
                    38
                      + Math.max(0, rival.speed - 24) * 0.42
                      + upcomingCurve.peakSeverity * 115
                      + Math.abs(rival.lane - rival.driftApproachLane) * 0.68,
                    34,
                    rival.name === "Gojo" ? 58 : 52,
                  );
                  const expectedDriftSpeed = Math.max(24, rival.speed, rival.pace * 0.94);
                  const minimumDriftMeters = expectedDriftSpeed
                    * ((CPU_MIN_CURVE_DRIFT_MS + CPU_DRIFT_PLAN_MARGIN_MS) / 1000);
                  const setupStartProgress = upcomingCurve.entryProgress - setupLeadMeters / course.length;
                  const minimumDurationStartProgress = upcomingCurve.exitProgress - minimumDriftMeters / course.length;
                  rival.driftCurveEntryProgress = upcomingCurve.entryProgress;
                  rival.driftCurveExitProgress = upcomingCurve.exitProgress;
                  rival.driftPeakSeverity = upcomingCurve.peakSeverity;
                  // Whichever point is earlier wins. On a short bend this can be
                  // far back on the preceding straight, which is intentional.
                  rival.driftPlannedStartProgress = Math.min(setupStartProgress, minimumDurationStartProgress);
                  rival.driftSafetyCheckAt = 0;
                  rival.driftSafetyLane = rival.driftApproachLane;
                  rival.driftSafetyCost = 0;
                  rival.driftPhase = "entry";
                  rival.driftCountersteer = 0;
                  rival.driftPreviousSlipAngle = 0;
                  rival.driftRecoveryTicks = 0;
                }
                const approachLeadMeters = (rival.driftCurveEntryProgress - rival.progress) * course.length;
                const plannedLeadMeters = (rival.driftCurveEntryProgress - rival.driftPlannedStartProgress) * course.length;
                if (approachLeadMeters <= plannedLeadMeters + 30 && turnSeverity < driftProfile.entryThreshold * 1.2) {
                  const approachResponse = 2.8
                    + (rivalRankForDrift >= 4 ? 0.9 : rivalRankForDrift >= 2 ? 0.55 : 0)
                    + (rival.name === "Gojo" ? 0.9 : 0);
                  rival.lane = THREE.MathUtils.lerp(
                    rival.lane,
                    Number.isFinite(rival.avoidanceThreatDistance)
                      ? rival.avoidanceRouteLane
                      : rival.driftApproachLane,
                    1 - Math.exp(-dt * approachResponse),
                  );
                }
              } else if (
                previewSign === 0
                && curveSign === 0
                && !rival.drifting
                && rival.progress > rival.driftCurveExitProgress + 6 / course.length
              ) {
                rival.driftApproachKey = -1;
                rival.driftNextScanProgress = rival.progress;
                rival.driftApproachSign = 0;
                rival.driftPeakSeverity = 0;
                rival.driftSafetyCheckAt = 0;
                rival.driftPhase = "entry";
                rival.driftCountersteer = 0;
                rival.driftPreviousSlipAngle = 0;
                rival.driftRecoveryTicks = 0;
              }
              if (now >= rival.avoidanceRouteCheckAt) {
                const routePreferredLane = gojoCloudAvoiding ? rival.cloudAvoidLane : gojoPickupLane ?? gojoLineAhead?.lane ?? (rival.drifting
                  ? rival.driftExitLane
                  : rival.driftApproachKey >= 0
                    ? rival.driftApproachLane
                    : rival.homeLane);
                const avoidancePlan = planCpuObstacleRoute({
                  actorId: index + 1,
                  fromProgress: rival.progress,
                  fromLane: rival.lane,
                  preferredLane: routePreferredLane,
                  now,
                });
                rival.avoidanceRouteCheckAt = now + CPU_OBSTACLE_REPLAN_MS;
                rival.avoidanceRouteLane = avoidancePlan.lane;
                rival.avoidanceThreatDistance = avoidancePlan.nearestThreatDistance;
                rival.avoidanceRouteCost = avoidancePlan.cost;
                if (gojoCloudAvoiding) {
                  rival.avoidanceRouteLane = rival.cloudAvoidLane;
                  rival.avoidanceThreatDistance = Math.min(
                    rival.avoidanceThreatDistance,
                    gojoCloudPlan?.distance ?? 0,
                  );
                  rival.avoidanceRouteCost = Math.max(rival.avoidanceRouteCost, 100000);
                }
                if (Number.isFinite(rival.avoidanceThreatDistance)) {
                  rival.driftSafetyLane = THREE.MathUtils.lerp(
                    rival.driftSafetyLane,
                    avoidancePlan.lane,
                    0.72,
                  );
                  rival.driftSafetyCost = Math.max(rival.driftSafetyCost, Math.min(24, avoidancePlan.cost));
                }
              }
              if (planningCurveSign === 0) {
                rival.driftCurveSign = 0;
                rival.driftDecisionMade = false;
              } else if (planningCurveSign !== rival.driftCurveSign) {
                rival.driftCurveSign = planningCurveSign;
                rival.driftDecisionMade = false;
              }
              const estimatedDriftSpeed = rival.speed;
              const cpuBarrierLane = BARRIER_LIMIT - 0.5;
              let wantsDrift = rival.drifting;
              if (rival.drifting) {
                const remainingExitMeters = Math.max(0, (rival.driftCurveExitProgress - rival.progress) * course.length);
                const remainingEntryMeters = Math.max(0, (rival.driftCurveEntryProgress - rival.progress) * course.length);
                const driftReleaseCharge = rival.name === "Gojo" && ultimateGojoGenericAi
                  ? gojoTuning.driftReleaseCharge
                  : CPU_DRIFT_TURBO_PRIORITY_CHARGE;
                const driftTurboReady = rival.driftCharge >= driftReleaseCharge;
                // Once half a gauge is secured, cash it out immediately. The
                // minimum commitment only applies while turbo is not ready.
                const minimumDriftActive = now < rival.driftMinimumUntil && !driftTurboReady;
                if (now >= rival.driftSafetyCheckAt) {
                  rival.driftSafetyCheckAt = now + 90;
                  const safetyLookAheadMeters = clamp(24 + estimatedDriftSpeed * 0.72, 32, 54);
                  const preCornerApproach = remainingEntryMeters > Math.max(8, estimatedDriftSpeed * 0.32);
                  const preferredSafetyLane = Number.isFinite(rival.avoidanceThreatDistance)
                    ? rival.avoidanceRouteLane
                    : preCornerApproach
                      ? rival.driftApproachLane
                      : remainingExitMeters > 0
                        ? rival.driftExitLane
                        : rival.homeLane;
                  const safePath = chooseCpuSafeLane({
                    actorId: index + 1,
                    fromProgress: rival.progress,
                    fromLane: rival.lane,
                    targetProgress: rival.progress + safetyLookAheadMeters / course.length,
                    preferredLane: preferredSafetyLane,
                    now,
                  });
                  rival.driftSafetyLane = THREE.MathUtils.lerp(
                    rival.driftSafetyLane,
                    safePath.lane,
                    0.68,
                  );
                  rival.driftSafetyCost = safePath.cost;
                  if (!preCornerApproach && remainingExitMeters > 0) {
                    rival.driftExitLane = THREE.MathUtils.lerp(rival.driftExitLane, safePath.lane, 0.32);
                  }
                }
                const targetLine = minimumDriftActive ? rival.driftSafetyLane : rival.driftExitLane;
                const targetLineError = targetLine - rival.lane;
                const timeToExit = clamp(remainingExitMeters / Math.max(8, estimatedDriftSpeed), 0, 0.9);
                const projectedExitLane = rival.lane + rival.driftSlipVelocity * timeToExit;
                const projectedOvershoot = rival.driftSide > 0
                  ? Math.max(0, rival.driftExitLane - projectedExitLane)
                  : Math.max(0, projectedExitLane - rival.driftExitLane);
                const exitPressure = 1 - clamp(
                  remainingExitMeters / Math.max(14, estimatedDriftSpeed * (rival.name === "Gojo" ? 1.5 : 1.3)),
                  0,
                  1,
                );
                const slipPressure = clamp(Math.abs(rival.driftSlipVelocity) / 13, 0, 1);
                const plannedLaneTravel = Math.max(1, Math.abs(rival.driftExitLane - rival.driftApproachLane));
                const lineCapture = 1 - clamp(Math.abs(targetLineError) / plannedLaneTravel, 0, 1);
                const projectedEdgePressure = clamp(
                  (Math.abs(projectedExitLane) - (cpuBarrierLane - 2.4)) / 2,
                  0,
                  1,
                );
                const targetCountersteer = clamp(
                  clamp(remainingEntryMeters / Math.max(24, estimatedDriftSpeed * 1.35), 0, 1) * 0.58
                    + exitPressure * 0.62
                    + clamp(projectedOvershoot / 4, 0, 1) * 0.38
                    + slipPressure * 0.16
                    + lineCapture * 0.12
                    + projectedEdgePressure * 0.48,
                  0,
                  1,
                );
                rival.driftCountersteer = THREE.MathUtils.lerp(
                  rival.driftCountersteer,
                  targetCountersteer,
                  1 - Math.exp(-dt * (rival.name === "Gojo" ? (ultimateGojoGenericAi ? 9.2 : 7.5) : 5.8)),
                );
                rival.driftPhase = rival.driftCountersteer > 0.16 ? "counter" : "hold";
                const currentSlipAngle = Math.atan2(Math.abs(rival.driftSlipVelocity), Math.max(1, estimatedDriftSpeed));
                const headingReturning = currentSlipAngle < rival.driftPreviousSlipAngle - 0.0008
                  && rival.driftCountersteer > 0.2;
                rival.driftRecoveryTicks = headingReturning ? rival.driftRecoveryTicks + 1 : 0;
                const exitAligned = rival.driftRecoveryTicks >= 2
                  && (remainingExitMeters < Math.max(10, estimatedDriftSpeed * 0.75) || Math.abs(targetLineError) < 1.35);
                if (driftTurboReady || (!minimumDriftActive && (rival.progress >= rival.driftCurveExitProgress || exitAligned))) {
                  rival.driftPhase = "exit";
                }
                rival.driftPreviousSlipAngle = currentSlipAngle;
                const curveAheadAligned = curveSign === rival.driftSide || previewSign === rival.driftSide;
                wantsDrift = !rival.airborne
                  && !driftTurboReady
                  && (minimumDriftActive || (
                    rival.driftPhase !== "exit"
                    && (curveAheadAligned || now < rival.driftCommittedUntil)
                  ));
              } else {
                wantsDrift = false;
                if (
                  !rival.airborne
                  && estimatedDriftSpeed > 8
                  && planningCurveSign !== 0
                  && !rival.driftDecisionMade
                  && (rival.progress >= rival.driftPlannedStartProgress || curveSign !== 0)
                ) {
                  const setupReady = !rival.driftUseInsideLine
                    || Math.abs(rival.lane - rival.driftApproachLane) < (rivalRankForDrift >= 4 ? 2.2 : rivalRankForDrift >= 2 ? 1.95 : 1.7)
                    || rival.progress >= rival.driftCurveEntryProgress - 8 / course.length;
                  const cornerIndex = Math.floor(wrap01(rival.progress) * 96) + Math.floor(Math.max(0, rival.progress)) * 113;
                  const exitNoise = Math.abs(Math.sin((rival.driftDecisionSeed + cornerIndex + 73) * 7.119) * 12743.91) % 1;
                  const preferredExitLane = -planningCurveSign * (rival.name === "Gojo" ? 7.5 : 5.3 + exitNoise * 1.65);
                  const safeExit = chooseCpuSafeLane({
                    actorId: index + 1,
                    fromProgress: rival.progress,
                    fromLane: rival.lane,
                    targetProgress: rival.driftCurveExitProgress,
                    preferredLane: preferredExitLane,
                    now,
                  });
                  // Every detected corner is mandatory. Safety changes the line;
                  // it no longer vetoes the drift itself.
                  rival.driftDecisionMade = setupReady;
                  wantsDrift = setupReady;
                  if (wantsDrift) {
                    const naturalDriftMs = clamp(
                      ((rival.driftCurveExitProgress - rival.progress) * course.length / Math.max(12, rival.speed)) * 1000 + 240,
                      driftProfile.commitmentMs,
                      7200,
                    );
                    rival.driftStartedAt = now;
                    rival.driftMinimumUntil = now + CPU_MIN_CURVE_DRIFT_MS;
                    rival.driftCommittedUntil = now + Math.max(CPU_MIN_CURVE_DRIFT_MS, naturalDriftMs);
                    rival.driftExitLane = safeExit.lane;
                    rival.driftSafetyLane = rival.driftApproachLane;
                    rival.driftSafetyCost = safeExit.cost;
                    rival.driftPhase = "hold";
                    rival.driftCountersteer = 0;
                    rival.driftPreviousSlipAngle = Math.atan2(Math.abs(rival.driftSlipVelocity), Math.max(1, estimatedDriftSpeed));
                    rival.driftRecoveryTicks = 0;
                  }
                }
              }
              if (!evolutionFeatures.drift) wantsDrift = false;
              if (gojoLineNow) {
                const recordedDrifting = (gojoLineNow.flags & 1) !== 0;
                const recordedDriftSide = (gojoLineNow.flags & 2) !== 0 ? 1 : -1;
                const recordedLane = clamp(
                  gojoCloudAvoiding
                    ? rival.cloudAvoidLane
                    : Number.isFinite(rival.avoidanceThreatDistance)
                    ? rival.avoidanceRouteLane
                    : gojoLineAhead?.lane ?? gojoLineNow.lane,
                  -CPU_DRIFT_SAFETY_LANE_LIMIT,
                  CPU_DRIFT_SAFETY_LANE_LIMIT,
                );
                wantsDrift = evolutionFeatures.drift && recordedDrifting && !gojoCloudAvoiding && !rival.airborne && rival.speed > 8;
                rival.driftSafetyLane = recordedLane;
                rival.driftExitLane = recordedLane;
                if (wantsDrift && !rival.drifting) {
                  rival.driftSide = recordedDriftSide;
                  rival.driftStartedAt = now;
                  rival.driftMinimumUntil = now;
                  rival.driftCommittedUntil = now + 8000;
                  rival.driftPhase = "hold";
                  rival.driftCountersteer = 0;
                  rival.driftPreviousSlipAngle = Math.atan2(Math.abs(rival.driftSlipVelocity), Math.max(1, rival.speed));
                  rival.driftRecoveryTicks = 0;
                } else if (wantsDrift) {
                  const lineError = Math.abs(recordedLane - rival.lane);
                  rival.driftCountersteer = THREE.MathUtils.lerp(
                    rival.driftCountersteer,
                    clamp(lineError / 3.6, 0.08, 0.92),
                    1 - Math.exp(-dt * 6.4),
                  );
                }
              }
              if (rival.voltOverchargeActive && rival.drifting && rival.voltCharge >= rival.voltTargetCharge) {
                wantsDrift = false;
              }
              const rivalWasDrifting = rival.drifting;
              let voltBlocksNormalDriftReward = false;
              let pendingVoltReleaseBoost: number | null = null;
              let pendingVoltSkillBoost: { multiplier: number; durationMs: number } | null = null;
              if (rival.voltOverchargeActive && now >= rival.voltActiveUntil) {
                rival.voltOverchargeActive = false;
                rival.voltCharge = 0;
              }
              if (rival.voltOverchargeActive && wantsDrift) {
                rival.voltCharge = clamp(rival.voltCharge + dt * VOLT_CHARGE_RATE, 0, 1);
                const voltState = resolveOverchargeDrift({ charge: rival.voltCharge, released: false });
                if (voltState.outcome === "overheat") {
                  rival.voltOverchargeActive = false;
                  rival.voltCharge = 0;
                  rival.voltOverheatedUntil = now + VOLT_OVERHEAT_MS;
                  rival.driftBoost = 0;
                  rival.driftCharge = 0;
                  rival.voltRejectCurrentDrift = true;
                  voltBlocksNormalDriftReward = true;
                }
              } else if (rival.voltOverchargeActive && rivalWasDrifting && !wantsDrift) {
                const voltState = resolveOverchargeDrift({ charge: rival.voltCharge, released: true });
                rival.voltOverchargeActive = false;
                rival.voltCharge = 0;
                voltBlocksNormalDriftReward = true;
                if (voltState.outcome === "overheat") {
                  rival.voltOverheatedUntil = now + VOLT_OVERHEAT_MS;
                  rival.driftBoost = 0;
                } else if (voltState.outcome === "critical-success" || voltState.outcome === "success") {
                  spawnSkillEffect(index + 1, "VOLT", now, voltState.outcome === "critical-success" ? "critical" : "success");
                  pendingVoltSkillBoost = {
                    multiplier: voltState.multiplier,
                    durationMs: voltState.durationMs ?? SKILL_TURBO_DURATION_MS,
                  };
                } else {
                  pendingVoltReleaseBoost = Number.isFinite(voltState.boost)
                    ? clamp(voltState.boost, 0, 1)
                    : 0;
                }
              }
              if (wantsDrift) {
                if (!rival.drifting) rival.driftSide = planningCurveSign;
                rival.drifting = true;
                rival.driftCharge = clamp(rival.driftCharge + dt * 0.42, 0, 1);
              } else if (rival.drifting) {
                if (!voltBlocksNormalDriftReward && !rival.voltRejectCurrentDrift && rival.driftCharge >= 0.08) rival.driftBoost = Math.max(rival.driftBoost, rival.driftCharge);
                rival.driftCharge = 0;
                rival.voltRejectCurrentDrift = false;
                rival.drifting = false;
                rival.driftPhase = "exit";
              }
              if (pendingVoltReleaseBoost !== null) {
                rival.driftBoost = Math.max(rival.driftBoost, pendingVoltReleaseBoost);
              }
              if (pendingVoltSkillBoost !== null) {
                setActorSkillBoost(index + 1, now, pendingVoltSkillBoost.durationMs, pendingVoltSkillBoost.multiplier);
              }
              const rivalBoosting = now < rival.boostUntil;
              const rivalAuroraActive = now < rival.auroraUntil;
              const rivalShieldSpeedBonus = actorHasShield(index + 1, now)
                ? shieldRivalSpeedBonusForLevel(actorShieldLevel(index + 1))
                : 0;
              const rivalDriftDashing = !wantsDrift && rival.driftBoost > 0.001;
              const timedRivalSkillBoostMultiplier = now < rival.skillBoostUntil ? rival.skillBoostMultiplier : 0;
              const rivalSkillTurboMultiplier = Math.max(
                timedRivalSkillBoostMultiplier,
                rival.vectorTurboActive ? 3 : 0,
              );
              const rivalTakeoffGravity = takeoffGravity({
                now,
                boostGravityUntil: rival.boostGravityUntil,
                drifting: wantsDrift,
                driftBoost: rival.driftBoost,
                jumpGravity: JUMP_GRAVITY,
                strongGravity: STRONG_JUMP_GRAVITY,
              });
              const rivalAirGravity = rival.airborne ? rival.airGravity : rivalTakeoffGravity;
              const rivalInRiver = courseDefinition.id === "river" && Boolean(runtimeRiverChannelAt(rival.progress, rival.lane));
              const rivalWindHeading = playerState.heading + cloudWindAngle;
              const rivalForwardWind = courseDefinition.id === "cloud"
                ? Math.sin(rivalWindHeading) * Math.sin(current.heading) + Math.cos(rivalWindHeading) * Math.cos(current.heading)
                : 0;
              if (!rival.airborne) {
                rival.speed += (rivalSkillTurboMultiplier > 0
                  ? ITEM_TURBO_ACCELERATION * rivalSkillTurboMultiplier
                  : rivalBoosting ? ITEM_TURBO_ACCELERATION : 23) * dt;
                if (rivalDriftDashing) rival.speed += (18 + rival.driftBoost * 7) * dt;
                if (rivalInRiver && rival.speed > 2) rival.speed += (3.4 + riverSurgeStrength * 4.6) * dt;
                if (courseDefinition.id === "cloud" && cloudWindStrength > 0.025) {
                  rival.speed += rivalForwardWind * cloudWindStrength * 8.6 * dt;
                }
                rival.speed *= Math.pow(wantsDrift ? 0.992 : 0.988, deltaMs / 16.67);
                const windCapBonus = Math.max(0, rivalForwardWind) * cloudWindStrength * 4.2;
                const ordinaryRivalSpeedCap = rivalBoosting
                  ? rival.pace + 15
                  : rivalDriftDashing
                    ? rival.pace + 10.5
                    : rivalShieldSpeedBonus > 0
                      ? rival.pace + rivalShieldSpeedBonus
                      : rivalInRiver
                        ? rival.pace + 2.2 + riverSurgeStrength * 2.8
                        : rival.pace;
                const skillRaisedRivalSpeedCap = rivalSkillTurboMultiplier > 0
                  ? Math.max(ordinaryRivalSpeedCap, ITEM_TURBO_SPEED_CAP * rivalSkillTurboMultiplier)
                  : ordinaryRivalSpeedCap;
                const rivalSpeedCap = rival.voltOverheatedUntil > now
                  ? Math.min(skillRaisedRivalSpeedCap, Math.max(22, rival.pace - 7))
                  : skillRaisedRivalSpeedCap;
                rival.speed = clamp(rival.speed, 0, rivalSpeedCap + windCapBonus);
                const rivalActorId = index + 1;
                for (let otherId = 0; otherId < actorCount; otherId += 1) {
                  if (otherId === rivalActorId || actorAirborne(otherId)) continue;
                  const gapMeters = (actorProgress(otherId) - rival.progress) * course.length;
                  const laneGap = actorLane(otherId) - rival.lane;
                  if (gapMeters < -2.5 || gapMeters > 16 || Math.abs(laneGap) > 4.1) continue;
                  const avoidDirection = Math.abs(rival.lane - 3.4) < Math.abs(rival.lane + 3.4) ? -1 : 1;
                  const trafficAvoidanceLane = clamp(
                    actorLane(otherId) + avoidDirection * 4.2,
                    -CPU_DRIFT_SAFETY_LANE_LIMIT,
                    CPU_DRIFT_SAFETY_LANE_LIMIT,
                  );
                  rival.avoidanceRouteLane = trafficAvoidanceLane;
                  rival.avoidanceThreatDistance = Math.min(rival.avoidanceThreatDistance, Math.max(0, gapMeters));
                  rival.driftSafetyLane = trafficAvoidanceLane;
                }
                const immediateThreats = cpuLaneThreats(rival.progress, now);
                immediateThreats.forEach((threat) => {
                  const gapMeters = (threat.progress - rival.progress) * course.length;
                  const clearance = threat.radius + 1.4;
                  const laneGap = threat.lane - rival.lane;
                  if (gapMeters < -1.5 || gapMeters > 18 || Math.abs(laneGap) >= clearance) return;
                  const leftCandidate = clamp(threat.lane - clearance - 0.9, -CPU_DRIFT_SAFETY_LANE_LIMIT, CPU_DRIFT_SAFETY_LANE_LIMIT);
                  const rightCandidate = clamp(threat.lane + clearance + 0.9, -CPU_DRIFT_SAFETY_LANE_LIMIT, CPU_DRIFT_SAFETY_LANE_LIMIT);
                  const emergencyLane = Math.abs(leftCandidate - rival.lane) <= Math.abs(rightCandidate - rival.lane)
                    ? leftCandidate
                    : rightCandidate;
                  rival.avoidanceRouteLane = emergencyLane;
                  rival.avoidanceThreatDistance = Math.min(rival.avoidanceThreatDistance, Math.max(0, gapMeters));
                  rival.driftSafetyLane = emergencyLane;
                });
              }
              if (rivalDriftDashing) rival.driftBoost = Math.max(0, rival.driftBoost - dt * 0.38);
              const groundWorldSpeed = rival.speed;
              const rivalDriftMultiplier = groundWorldSpeed < 16
                ? 1.5
                : rivalBoosting || rivalAuroraActive || groundWorldSpeed >= 38
                  ? 3
                  : 2;
              const rivalCentrifugalBase = Math.min(11, Math.max(3.5, groundWorldSpeed * 0.28));
              const rivalDriftControl = rival.name === "Gojo" ? 0.76 : 1;
              const countersteerControl = THREE.MathUtils.lerp(
                1,
                rival.name === "Gojo" ? 0.2 : 0.34,
                rival.driftCountersteer,
              );
              const unrestrictedDriftTarget = wantsDrift
                ? -rival.driftSide * rivalCentrifugalBase * rivalDriftMultiplier * rivalDriftControl * countersteerControl
                : 0;
              const driftMovesTowardWall = Math.abs(rival.lane) > 0.25
                && Math.sign(unrestrictedDriftTarget) === Math.sign(rival.lane);
              const driftWallRoom = (BARRIER_LIMIT - 0.5) - Math.abs(rival.lane);
              const wallSafetyScale = driftMovesTowardWall ? clamp(driftWallRoom / 3.25, 0.08, 1) : 1;
              const safeLaneError = clamp(rival.driftSafetyLane, -CPU_DRIFT_SAFETY_LANE_LIMIT, CPU_DRIFT_SAFETY_LANE_LIMIT) - rival.lane;
              const safeLaneVelocity = clamp(
                safeLaneError * (rival.name === "Gojo" ? (ultimateGojoGenericAi ? 3.55 : 2.8) : 2.35),
                ultimateGojoGenericAi ? -12.5 : -10.5,
                ultimateGojoGenericAi ? 12.5 : 10.5,
              );
              const pathSafetyBlend = wantsDrift
                ? clamp(0.56 + rival.driftSafetyCost * 0.018, 0.56, 0.82)
                : 0;
              const rivalDriftTarget = THREE.MathUtils.lerp(
                unrestrictedDriftTarget * wallSafetyScale,
                safeLaneVelocity,
                pathSafetyBlend,
              );
              const rivalDriftResponse = 1 - Math.exp(-dt / (wantsDrift ? 0.09 : 0.14));
              rival.driftSlipVelocity = THREE.MathUtils.lerp(
                rival.driftSlipVelocity,
                rivalDriftTarget,
                rivalDriftResponse,
              );
              if (!rival.airborne && Math.abs(rival.driftSlipVelocity) > 0.01) {
                const barrierLane = CPU_DRIFT_SAFETY_LANE_LIMIT;
                const nextLane = rival.lane + rival.driftSlipVelocity * dt;
                if (Math.abs(nextLane) >= barrierLane) {
                  rival.lane = clamp(nextLane, -barrierLane, barrierLane);
                  if (Math.sign(rival.driftSlipVelocity) === Math.sign(rival.lane)) rival.driftSlipVelocity = 0;
                } else {
                  rival.lane = nextLane;
                }
              }
              if (!wantsDrift && !rival.airborne) {
                const recordedCruiseLane = gojoLineAhead?.lane;
                const activeCometStream = cometStreams.find((stream) => stream.active && stream.owner === index + 1);
                const normalTargetLane = Number.isFinite(rival.avoidanceThreatDistance)
                  ? rival.avoidanceRouteLane
                  : activeCometStream?.gateLanes[activeCometStream.gateIndex] ?? gojoPickupLane ?? recordedCruiseLane ?? rival.avoidanceRouteLane;
                const obstacleResponse = Number.isFinite(rival.avoidanceThreatDistance)
                  ? clamp(2.2 + (1 - clamp(rival.avoidanceThreatDistance / CPU_OBSTACLE_LOOKAHEAD_METERS, 0, 1)) * 4.8, 2.2, 7)
                  : activeCometStream
                    ? 5.8
                  : recordedCruiseLane !== undefined
                    ? 4.6
                  : rival.driftApproachKey >= 0
                    ? 2.8
                    : 0.5;
                rival.lane = THREE.MathUtils.lerp(
                  rival.lane,
                  clamp(normalTargetLane, -CPU_DRIFT_SAFETY_LANE_LIMIT, CPU_DRIFT_SAFETY_LANE_LIMIT),
                  1 - Math.exp(-dt * obstacleResponse),
                );
              }
              const previousRivalAirY = rival.airY;
              const previousRivalRoadY = current.y;
              const rivalWasAirborneForRanking = rival.airborne;
              if (rival.airborne) rival.airSpeed *= Math.pow(0.9992, deltaMs / 16.67);
              const rivalWorldSpeed = rival.airborne ? rival.airSpeed : groundWorldSpeed;
              rival.progress += (rivalWorldSpeed / course.length) * dt;
              rival.rankingProgress = rankingProgressFromGroundContact({
                previousRankingProgress: rival.rankingProgress,
                courseProgress: rival.progress,
                airborne: rivalWasAirborneForRanking,
              });
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
                rival.verticalVelocity -= rivalAirGravity * dt;
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
                  rival.rankingProgress = rival.progress;
                  rival.airGravity = STRONG_JUMP_GRAVITY;
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
                  rivalAirGravity,
                );
                if (rivalRoadMissing) {
                  rival.airborne = true;
                  rival.motionState = "falling";
                  rival.airborneSince = now;
                  rival.airSpeed = rivalWorldSpeed;
                  rival.airGravity = rivalTakeoffGravity;
                  rival.verticalVelocity = Math.min(0, rival.surfaceVerticalVelocity);
                  rival.airY = roadPoint.y + 0.02;
                  rival.cloudFallUntil = now + 1050;
                  rival.drifting = false;
                  rival.driftCharge = 0;
                  rival.driftSlipVelocity = 0;
                  rival.driftDecisionMade = false;
                  rival.driftStartedAt = 0;
                  rival.driftMinimumUntil = 0;
                  rival.driftCurveSign = 0;
                  rival.driftApproachKey = -1;
                  rival.driftNextScanProgress = rival.progress;
                  rival.driftApproachSign = 0;
                  rival.driftPeakSeverity = 0;
                  rival.driftSafetyCheckAt = 0;
                  rival.driftSafetyLane = rival.lane;
                  rival.driftSafetyCost = 0;
                  rival.avoidanceRouteCheckAt = 0;
                  rival.avoidanceRouteLane = rival.lane;
                  rival.avoidanceThreatDistance = Number.POSITIVE_INFINITY;
                  rival.avoidanceRouteCost = 0;
                  rival.driftPhase = "entry";
                  rival.driftCountersteer = 0;
                  rival.driftPreviousSlipAngle = 0;
                  rival.driftRecoveryTicks = 0;
                } else if (!gojoRecordedShortcutReserved && rivalWorldSpeed >= JUMP_MIN_SPEED && now >= rival.jumpCooldownUntil && separationProfile.separatesFromRoad) {
                  rival.airborne = true;
                  rival.motionState = "airborne";
                  rival.airborneSince = now;
                  rival.airSpeed = rivalWorldSpeed;
                  rival.airGravity = rivalTakeoffGravity;
                  rival.verticalVelocity = rival.surfaceVerticalVelocity;
                  rival.airY = Math.max(
                    roadPoint.y + 0.03,
                    rival.airY + rival.verticalVelocity * dt - 0.5 * rivalTakeoffGravity * dt * dt,
                  );
                  rival.drifting = false;
                  rival.driftCharge = 0;
                  rival.driftSlipVelocity = 0;
                  rival.driftDecisionMade = false;
                  rival.driftStartedAt = 0;
                  rival.driftMinimumUntil = 0;
                  rival.driftCurveSign = 0;
                  rival.driftApproachKey = -1;
                  rival.driftNextScanProgress = rival.progress;
                  rival.driftApproachSign = 0;
                  rival.driftPeakSeverity = 0;
                  rival.driftSafetyCheckAt = 0;
                  rival.driftSafetyLane = rival.lane;
                  rival.driftSafetyCost = 0;
                  rival.avoidanceRouteCheckAt = 0;
                  rival.avoidanceRouteLane = rival.lane;
                  rival.avoidanceThreatDistance = Number.POSITIVE_INFINITY;
                  rival.avoidanceRouteCost = 0;
                  rival.driftPhase = "entry";
                  rival.driftCountersteer = 0;
                  rival.driftPreviousSlipAngle = 0;
                  rival.driftRecoveryTicks = 0;
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
              cpuSkillWantsDrift = wantsDrift;
              cpuSkillTurnSeverity = turnSeverity;
              cpuSkillSteer = wantsDrift || turnSeverity > 0.08 || Math.abs(rival.avoidanceRouteLane - rival.lane) > 0.65 ? 1 : 0;
              }
              if (
                itemsEnabled
                && evolutionFeatures.items
                && rival.item !== "EMPTY"
                && now >= rival.useAt
                && (rival.name !== "Gojo" || shouldGojoUseHeldItem(index + 1, now))
              ) activateActorItem(index + 1, now);
              if (skillsEnabled && evolutionFeatures.skills && !rival.skillScheduled) {
                rival.skillReadyAt = now + rival.skillInitialDelay;
                rival.skillScheduled = true;
              }
              if (skillsEnabled && evolutionFeatures.skills && now >= rival.skillReadyAt) {
                const actorId = index + 1;
                if (rival.character.name === "Gojo") {
                  const chosenSkill = chooseGojoSkill(actorId, now);
                  const skillOrder: SkillId[] = chosenSkill === "VOLT"
                    ? ["VOLT", "COMET", "PIXEL"]
                    : chosenSkill === "PIXEL"
                      ? ["PIXEL", "COMET", "VOLT"]
                      : ["COMET", "VOLT", "PIXEL"];
                  const activated = chosenSkill
                    ? skillOrder.some((skill) => activateSkillById(actorId, skill, now, cpuSkillSteer))
                    : false;
                  if (!activated) {
                    // Retry the tactical decision without consuming cooldown.
                    rival.skillReadyAt = now + 250;
                  }
                } else if (rival.character.name === "GIANT") {
                  const shortcut = actorRank(actorId) >= 3 ? findRivalShortcut(actorId) : null;
                  if (shortcut) {
                    pendingRivalShortcuts.set(actorId, shortcut);
                    if (!activateSkillById(actorId, "GIANT", now)) pendingRivalShortcuts.delete(actorId);
                  }
                } else {
                  const nativeSkill = characterSkill(rival.character);
                  const skillSetupIsSafe = nativeSkill === "PIXEL"
                    ? cpuSkillSteer === 0 && cpuSkillTurnSeverity <= 0.006 && !rival.airborne
                    : nativeSkill === "COMET"
                      ? !cpuSkillWantsDrift && cpuSkillTurnSeverity <= 0.16
                      : true;
                  if (skillSetupIsSafe) activateActorSkill(actorId, now, cpuSkillSteer);
                }
              }
            }
          });

          if (recordFinishLineCrossings()) {
            finished = true;
            playerState.speed *= 0.45;
            const finishOrder = completedFinishOrder();
            postFinishStartedAt = now;
            postFinishActorOrder = finishOrder;
            audioController.play("finish");
            captureGhostSample(now, true);
            onFinishRef.current({
              time: now - raceStart,
              position: finishOrder.indexOf(0) + 1,
              order: finishOrder,
              stats: { ...runStats },
              ghostSamples: [...recordedGhostSamples],
              gojoLineSamples: [...recordedGojoLineSamples],
            });
          }

          if (courseDefinition.id === "jungle") {
            monkeys.forEach((monkey, index) => {
              const roamSpeed = (3.4 + index * 0.42) / course.length;
              monkey.progress = wrap01(monkey.progress + monkey.direction * roamSpeed * dt);
              monkey.lane = Math.sin(now * (0.00062 + index * 0.00005) + monkey.wanderPhase) * 6.7;
              const monkeyPose = course.pointAt(monkey.progress, monkey.lane);
              const placement = course.pointAt(monkey.progress - monkey.direction * 1.4 / course.length, monkey.lane);
              if (!monkey.nextTrapAt) monkey.nextTrapAt = now + 2400 + index * 980;
              if (now >= monkey.nextTrapAt) {
                createTrapAt(-1, monkey.progress - monkey.direction * 1.4 / course.length, monkey.lane, now);
                monkey.actionUntil = now + 850;
                monkey.placement = placement;
                monkey.nextTrapAt = now + 7200 + Math.random() * 4200;
              }
              monkey.group.position.set(monkeyPose.x, monkeyPose.y + 0.03, monkeyPose.z);
              monkey.visual.update(now, monkey.nextTrapAt, monkey.actionUntil - 850, now < monkey.actionUntil ? monkey.placement ?? placement : placement);
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
            riverFlowClock += dt * (1 + riverSurgeStrength * 2.4);
            waterUniforms.forEach((uniform, index) => { uniform.value = riverFlowClock + index * 0.73; });
            if (waterFlow && (!lastWaterFlowUpdateAt || now - lastWaterFlowUpdateAt >= 33)) {
              const flowDt = lastWaterFlowUpdateAt ? Math.min(0.08, (now - lastWaterFlowUpdateAt) / 1000) : dt;
              lastWaterFlowUpdateAt = now;
              const positions = waterFlow.points.geometry.getAttribute("position") as Three.BufferAttribute;
              waterFlow.particles.forEach((particle, particleIndex) => {
                const channel = RIVER_CHANNELS[particle.channelIndex];
                particle.progress += (particle.speed * (1 + riverSurgeStrength * 1.85) / course.length) * flowDt;
                if (particle.progress > channel.end) particle.progress = channel.start + (particle.progress - channel.end);
                const lane = channel.lane + particle.laneOffset + Math.sin(now * 0.0015 + particle.phase) * 0.18;
                const point = course.sampledPointAtInto(particle.progress, lane, particle.pose);
                positions.setXYZ(particleIndex, point.x, point.y + 0.54 + Math.sin(now * 0.006 + particle.phase) * 0.06, point.z);
              });
              positions.needsUpdate = true;
            }
            flowingLogs.forEach((log, index) => {
              log.group.visible = !log.surgeOnly || riverSurgeStrength > 0.08;
              if (!log.group.visible) return;
              const channel = RIVER_CHANNELS[log.channelIndex];
              log.progress = wrap01(log.progress + (2.6 + index * 0.1) * (1 + riverSurgeStrength * 1.45) * dt / course.length);
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
            const pirateLapIndex = Math.min(2, Math.floor(Math.max(0, playerState.progress)));
            cannons.forEach((cannon, index) => {
              const patternEnabled = cannon.pattern <= pirateLapIndex;
              const baseSpeed = pirateLapIndex >= 2 ? 0.00029 : pirateLapIndex === 1 ? 0.000245 : 0.0002;
              const baseCycle = wrap01(now * baseSpeed + cannon.phase);
              const cycle = cannon.pattern === 1
                ? wrap01(baseCycle + cannon.shotIndex * 0.5)
                : cannon.pattern === 2
                  ? wrap01(baseCycle - cannon.shotIndex * 0.095)
                  : baseCycle;
              const firing = patternEnabled && cycle >= 0.18 && cycle <= 0.72;
              cannon.ball.visible = firing;
              cannon.group.rotation.z = firing && cycle < 0.27 ? Math.sin(clamp((cycle - 0.18) / 0.09, 0, 1) * Math.PI) * cannon.side * 0.1 : 0;
              if (!firing) return;
              const flight = clamp((cycle - 0.18) / 0.54, 0, 1);
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

            const activeBarrels = pirateLapIndex === 0 ? 2 : pirateLapIndex === 1 ? 4 : 6;
            rollingBarrels.forEach((barrel, index) => {
              const active = index < activeBarrels;
              barrel.group.visible = active;
              if (!active) return;
              const travel = wrap01(now * (pirateLapIndex >= 2 ? 0.000095 : 0.000075) + barrel.phase);
              barrel.progress = barrel.start + (barrel.end - barrel.start) * travel;
              const lane = Math.sin(now * 0.00115 + barrel.lanePhase) * (4.6 + (index % 3) * 0.85);
              const pose = course.pointAt(barrel.progress, lane);
              barrel.group.position.set(pose.x, pose.y + 1.02, pose.z);
              barrel.group.rotation.y = pose.heading;
              const pivot = barrel.group.getObjectByName("rolling-barrel-pivot");
              if (pivot) pivot.rotation.x = -now * 0.0048 - index * 0.7;
              for (let actorId = 0; actorId < actorCount; actorId += 1) {
                const actor = actorPose(actorId);
                if (Math.hypot(pose.x - actor.x, pose.y + 0.9 - actor.y, pose.z - actor.z) < 2.15) {
                  const key = `rolling-barrel-${index}-${actorId}`;
                  if (now >= (obstacleContactCooldowns.get(key) ?? 0)) {
                    bumpActor(actorId, lane, now);
                    obstacleContactCooldowns.set(key, now + 620);
                  }
                }
              }
            });

            const octopusActive = pirateLapIndex >= 2;
            // Wait for the player's cabin-exit landmark, never a CPU's approach.
            // A >= threshold also catches fast frames and shortcuts past the marker.
            if (octopusActive && pirateBreachStartedAt < 0
              && wrap01(playerState.progress) >= PIRATE_BREACH_TRIGGER_PROGRESS) {
              pirateBreachStartedAt = now;
            }
            const breachAge = octopusActive && pirateBreachStartedAt >= 0 ? now - pirateBreachStartedAt : -1;
            const octopusAttacksEnabled = octopusActive && breachAge >= PIRATE_BREACH_SETTLED_MS;
            const tentacleMotion = new Map<PirateTentacleState, { slam: number; anticipation: number }>();
            pirateTentacles.forEach((tentacle) => {
              if (!octopusAttacksEnabled) {
                tentacle.attackStartedAt = 0;
                tentacle.cooldownUntil = 0;
                tentacleMotion.set(tentacle, { slam: 0, anticipation: 0 });
                return;
              }
              if (!tentacle.attackStartedAt && now >= tentacle.cooldownUntil) {
                let approaching = false;
                for (let actorId = 0; actorId < actorCount; actorId += 1) {
                  const distanceToTentacle = progressDelta(tentacle.progress, wrap01(actorProgress(actorId))) * course.length;
                  if (distanceToTentacle >= -3 && distanceToTentacle <= 38) {
                    approaching = true;
                    break;
                  }
                }
                if (approaching) {
                  tentacle.targetSide = Math.random() < 0.5 ? -1 : 1;
                  tentacle.lane = tentacle.targetSide * 5.0;
                  tentacle.hitLane = tentacle.lane;
                  tentacle.attackStartedAt = now;
                }
              }
              if (!tentacle.attackStartedAt) {
                tentacleMotion.set(tentacle, { slam: 0, anticipation: 0 });
                return;
              }
              const attackAge = now - tentacle.attackStartedAt;
              let slam = 0;
              let anticipation = 0;
              if (attackAge < 520) anticipation = Math.sin((attackAge / 520) * Math.PI);
              else if (attackAge < 850) slam = (attackAge - 520) / 330;
              else if (attackAge < 1500) slam = 1;
              else if (attackAge < 2200) slam = 1 - (attackAge - 1500) / 700;
              else {
                tentacle.attackStartedAt = 0;
                tentacle.cooldownUntil = now + 1200 + Math.random() * 750;
              }
              tentacleMotion.set(tentacle, { slam: clamp(slam, 0, 1), anticipation });
            });
            const primaryTentacle = pirateTentacles[0];
            const primaryMotion = primaryTentacle ? tentacleMotion.get(primaryTentacle) : undefined;
            const bodySlam = primaryMotion?.slam ?? 0;
            const bodySlamEase = bodySlam * bodySlam * (3 - 2 * bodySlam);
            const bodyAnticipation = primaryMotion?.anticipation ?? 0;
            const breachPose = getPirateBreachPose(breachAge);
            pirateBreachVisual?.update(breachAge);
            if (pirateOctopus) {
              pirateOctopus.visible = !octopusActive || breachPose.revealed;
              const foreshadowArms = pirateOctopus.userData.foreshadowArms as Three.Group | undefined;
              if (foreshadowArms) foreshadowArms.visible = pirateLapIndex === 0;
              if (octopusActive) {
                const sway = Math.sin(now * 0.0015);
                const reach = bodyAnticipation * 0.72 + bodySlamEase * 2.2;
                pirateOctopus.position.x = (pirateOctopus.userData.baseX as number) - (pirateOctopus.userData.nx as number) * reach;
                pirateOctopus.position.y = (pirateOctopus.userData.baseY as number) + Math.sin(now * 0.0024) * 0.68 + bodyAnticipation * 0.92 - bodySlamEase * 0.62 + breachPose.riseOffset;
                pirateOctopus.position.z = (pirateOctopus.userData.baseZ as number) - (pirateOctopus.userData.nz as number) * reach;
                pirateOctopus.rotation.x = -bodyAnticipation * 0.07 + bodySlamEase * 0.13;
                pirateOctopus.rotation.y = (pirateOctopus.userData.baseYaw as number) + sway * 0.025;
                pirateOctopus.rotation.z = sway * 0.045 * (1 - bodySlamEase * 0.55);
                pirateOctopus.scale.set(1 + bodySlamEase * 0.045, 1 - bodySlamEase * 0.055, 1 + bodySlamEase * 0.075);
              } else {
                const approach = Math.max(pirateOctopus.userData.approach as number,
                  pirateOctopusApproach(pirateLapIndex, wrap01(playerState.progress)));
                pirateOctopus.userData.approach = approach;
                const distance = pirateLapIndex === 1
                  ? 72 - 16 * clamp((approach - 0.5) * 2, 0, 1)
                  : 185 * (1 - approach);
                pirateOctopus.position.x = (pirateOctopus.userData.baseX as number) + (pirateOctopus.userData.nx as number) * distance;
                // Keep the crown outside the opaque hull and a little toward
                // the bow, where it can be glimpsed on exiting the cabin.
                pirateOctopus.position.z = (pirateOctopus.userData.baseZ as number) + (pirateOctopus.userData.nz as number) * distance + (pirateLapIndex === 1 ? 40 : 0);
                pirateOctopus.position.y = pirateLapIndex === 1
                  ? pirateOctopusPeekY(15.65, now)
                  : WORLD_GROUND_Y - 3.2 + Math.sin(now * 0.0017) * 0.48;
                pirateOctopus.rotation.set(pirateLapIndex === 1 ? 0 : Math.sin(now * 0.0011) * 0.018,
                  pirateOctopus.userData.baseYaw as number, pirateLapIndex === 1 ? 0 : Math.sin(now * 0.0013) * 0.035);
                pirateOctopus.scale.setScalar(1);
                if (foreshadowArms) foreshadowArms.rotation.y = Math.sin(now * 0.001) * 0.045;
              }
            }
            pirateTentacles.forEach((tentacle, index) => {
              tentacle.group.visible = octopusActive;
              if (!octopusActive) return;
              // Do not change the parent visibility used by CPU danger checks,
              // or any tip position used by hit tests: hide render meshes only.
              tentacle.segments.visible = breachPose.revealed;
              tentacle.suckers.visible = breachPose.revealed;
              tentacle.tip.visible = breachPose.revealed;
              // The entire arm rises with the body instead of its tip popping
              // into the sky. Collision below intentionally reads the original
              // local tip.position, never this presentation-only group offset.
              tentacle.group.position.y = breachPose.riseOffset;
              const slamAmount = tentacleMotion.get(tentacle)?.slam ?? 0;
              tentacle.slamAmount = slamAmount;
              const easedSlam = slamAmount * slamAmount * (3 - 2 * slamAmount);
              const pose = course.pointAt(tentacle.progress, tentacle.lane);
              const bodyX = pirateOctopus?.position.x ?? (pirateOctopus?.userData.baseX as number);
              const bodyY = (pirateOctopus?.position.y ?? (pirateOctopus?.userData.baseY as number)) - breachPose.riseOffset;
              const bodyZ = pirateOctopus?.position.z ?? (pirateOctopus?.userData.baseZ as number);
              const bodyNx = (pirateOctopus?.userData.nx as number) ?? pose.nx;
              const bodyNz = (pirateOctopus?.userData.nz as number) ?? pose.nz;
              tentacle.curve.v0.set(bodyX - bodyNx * 7.8, bodyY + 6.5, bodyZ - bodyNz * 7.8);
              tentacle.curve.v1.set(bodyX - bodyNx * 18.8, bodyY + 10.8 + bodyAnticipation * 2.4, bodyZ - bodyNz * 18.8);
              tentacle.curve.v2.set(pose.x, pose.y + 7.2 + (1 - easedSlam) * 8.2, pose.z);
              tentacle.curve.v3.set(pose.x, pose.y + 1.05 + (1 - easedSlam) * 16.0, pose.z);
              const segmentCount = tentacle.segments.count;
              for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
                tentacle.curve.getPoint(segmentIndex / segmentCount, tentaclePointA);
                tentacle.curve.getPoint((segmentIndex + 1) / segmentCount, tentaclePointB);
                tentacleDirection.subVectors(tentaclePointB, tentaclePointA);
                const segmentLength = Math.max(0.2, tentacleDirection.length());
                tentacleDirection.multiplyScalar(1 / segmentLength);
                tentacleMidpoint.addVectors(tentaclePointA, tentaclePointB).multiplyScalar(0.5);
                tentacleDummy.position.copy(tentacleMidpoint);
                tentacleDummy.quaternion.setFromUnitVectors(tentacleSegmentAxis, tentacleDirection);
                const taper = THREE.MathUtils.lerp(1.62, 0.82, (segmentIndex + 0.5) / segmentCount);
                tentacleDummy.scale.set(taper, segmentLength * 1.1, taper);
                tentacleDummy.updateMatrix();
                tentacle.segments.setMatrixAt(segmentIndex, tentacleDummy.matrix);
              }
              tentacle.segments.instanceMatrix.needsUpdate = true;
              tentacle.tip.position.copy(tentacle.curve.v3);
              tentacle.tip.rotation.y = pose.heading;
              tentacle.tip.scale.set(tentacle.hitHalfWidth, 1.25 + (1 - easedSlam) * 0.2, 3.45);
              const suckerFacing = new THREE.Vector3(-Math.sin(pose.heading), 0, -Math.cos(pose.heading));
              for (let suckerIndex = 0; suckerIndex < tentacle.suckers.count; suckerIndex += 1) {
                const amount = 0.58 + (suckerIndex / Math.max(1, tentacle.suckers.count - 1)) * 0.38;
                tentacle.curve.getPoint(amount, tentaclePointA);
                suckerDummy.position.copy(tentaclePointA).addScaledVector(suckerFacing, 1.08 - suckerIndex * 0.035);
                suckerDummy.quaternion.setFromUnitVectors(tentacleSuckerAxis, suckerFacing);
                const suckerScale = THREE.MathUtils.lerp(1.15, 0.68, suckerIndex / tentacle.suckers.count);
                suckerDummy.scale.set(suckerScale, suckerScale * 0.82, suckerScale);
                suckerDummy.updateMatrix();
                tentacle.suckers.setMatrixAt(suckerIndex, suckerDummy.matrix);
              }
              tentacle.suckers.instanceMatrix.needsUpdate = true;
              if (slamAmount < 0.9) return;
              for (let actorId = 0; actorId < actorCount; actorId += 1) {
                const actor = actorPose(actorId);
                const actorDistanceAlongTrack = Math.abs(progressDelta(wrap01(actorProgress(actorId)), tentacle.progress)) * course.length;
                const actorDistanceAcrossTrack = Math.abs(actorLane(actorId) - tentacle.hitLane);
                if (actorDistanceAlongTrack < 3.45 && actorDistanceAcrossTrack < tentacle.hitHalfWidth && Math.abs(actor.y - tentacle.tip.position.y) < 2.8) {
                  const key = `octopus-${index}-${actorId}`;
                  if (now >= (obstacleContactCooldowns.get(key) ?? 0)) {
                    attackActor(actorId, "CANNON", now);
                    obstacleContactCooldowns.set(key, now + 1500);
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
                state.group.position.set(pose.x, pose.y, pose.z);
                if (!state.nextAt) state.nextAt = now + config.interval * 600;
                if (now >= state.nextAt) {
                  createTrapAt(-1, monkeyProgress, monkeyLane, now);
                  state.monkeyPlacedAt = now;
                  state.monkeyPlacement = pose;
                  state.nextAt = now + config.interval * 1000;
                }
                const monkeyVisual = state.group.userData.monkeyVisual as ReturnType<typeof makeTrapMonkeyVisual>;
                monkeyVisual.update(now, state.nextAt, state.monkeyPlacedAt ?? 0, now - (state.monkeyPlacedAt ?? -1000) < 850 ? state.monkeyPlacement ?? pose : pose);
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
                    rivalStates[actorId - 1].speed += dt * (1.2 + config.intensity * 0.75) * config.speed;
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

          const starlightShootingStarsEnabled = !timeTrialMode && courseDefinition.id === "starlight" && racing && raceElapsedSeconds >= 50;
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
                  const hitResult = attackActor(actorId, "SHOOTING_STAR", now);
                  if (hitResult === "crashed") novaHitUntil[actorId] = now + 620;
                  hitRacer = true;
                  break;
                }
              }
              if (hitRacer || star.y <= roadPoint.y + 0.35) shatterShootingStar(star, now);
            });
            releaseInactiveVisuals(shootingStars, () => shootingStarPool);
          }

          for (let index = cometStreams.length - 1; index >= 0; index -= 1) {
            const stream = cometStreams[index];
            if (!stream.active) {
              cometStreams.splice(index, 1);
              continue;
            }
            stream.group.rotation.z = Math.sin(now * 0.004 + stream.gateIndex) * 0.055;
            stream.group.children.forEach((child, childIndex) => {
              if (childIndex <= 1) return;
              child.rotation.x += dt * (1.8 + childIndex * 0.08);
              child.rotation.y += dt * 2.1;
              child.scale.setScalar(0.84 + Math.sin(now * 0.009 + childIndex) * 0.18);
            });
            const result = cometGateResult({
              actorProgress: actorProgress(stream.owner),
              actorLane: actorLane(stream.owner),
              gateProgress: stream.gateProgress,
              gateLane: stream.gateLanes[stream.gateIndex],
              courseLength: course.length,
            });
            if (actorCrashing(stream.owner, now) || now >= stream.expiresAt || result === "missed") {
              endCometStream(stream);
              cometStreams.splice(index, 1);
              continue;
            }
            if (result === "passed") {
              const completedGateCount = stream.gateIndex + 1;
              spawnSkillEffect(stream.owner, "COMET", now, completedGateCount === 3 ? "critical" : "success");
              const gateBoostMultiplier = completedGateCount === 1 ? 0.7 : completedGateCount === 2 ? 1 : 1.5;
              const gateBoostDurationMs = completedGateCount === 1 ? 2000 : 3000;
              setActorSkillBoost(stream.owner, now, gateBoostDurationMs, gateBoostMultiplier);
              if (stream.owner === 0) {
                showSkillFeedback(
                  `Success×${completedGateCount}`,
                  completedGateCount === 3 ? "comet-critical" : "comet",
                  completedGateCount === 3 ? 1700 : 1250,
                );
              }
              if (completedGateCount >= stream.targetGateCount) {
                endCometStream(stream);
                cometStreams.splice(index, 1);
              } else {
                const previousGateProgress = stream.gateProgress;
                const previousGateLane = stream.gateLanes[stream.gateIndex];
                stream.gateIndex += 1;
                const previousGatePose = course.pointAt(previousGateProgress, previousGateLane);
                const nextGatePlacement = chooseCometGatePlacement(
                  previousGateProgress,
                  previousGatePose,
                  stream.gateLanes[stream.gateIndex],
                );
                stream.gateProgress = nextGatePlacement.progress;
                stream.gateDistanceMeters = nextGatePlacement.distanceMeters;
                stream.expiresAt = now + cometGateTimeoutFor(stream.owner, nextGatePlacement.distanceMeters);
                positionCometGate(stream);
                const ring = stream.group.children[0];
                if (ring instanceof THREE.Mesh) {
                  (ring.material as Three.MeshBasicMaterial).color.setHex(stream.gateIndex === 1 ? 0x58e9ff : 0xa983ff);
                }
              }
            }
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
            const scale = 1 + (age / 0.85) * Math.max(0, wave.radius / 1.15 - 1);
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
            if (!evolutionFeatures.items) {
              pickup.group.visible = false;
              return;
            }
            pickup.group.visible = pickup.active;
            if (!pickup.active && now >= pickup.respawnAt) {
              pickup.active = true;
              pickup.group.visible = true;
            }
            if (!pickup.active) return;
            for (let actorId = 0; actorId < actorCount; actorId += 1) {
              if (now < itemPickupReadyAt[actorId]) continue;
              if (actorCrashing(actorId, now)) continue;
              const currentItem = actorItem(actorId);
              const currentLevel = actorItemLevel(actorId);
              if (currentItem !== "EMPTY" && !canUpgradeHeldItem(currentItem, currentLevel)) continue;
              const pose = actorPose(actorId);
              const pickupPlanarDistance = Math.hypot(pickup.x - pose.x, pickup.z - pose.z);
              const pickupVerticalDistance = Math.abs(pickup.y - pose.y);
              const pickupRadius = actorId > 0 && rivalStates[actorId - 1].name === "Gojo"
                ? ultimateGojo ? gojoTuning.itemPickupRadius : GOJO_ITEM_PICKUP_RADIUS
                : ITEM_PICKUP_RADIUS;
              if (pickupPlanarDistance < pickupRadius && pickupVerticalDistance < 2.25) {
                pickup.active = false;
                pickup.group.visible = false;
                pickup.respawnAt = now + 6000;
                itemPickupReadyAt[actorId] = now + ITEM_PICKUP_COOLDOWN_MS;
                if (currentItem === "EMPTY") {
                  setActorItem(actorId, rollItem(actorRank(actorId)), 1, now);
                } else {
                  setActorItem(actorId, currentItem, upgradeHeldItemLevel(currentItem, currentLevel) as ItemLevel, now);
                }
                if (actorId === 0) audioController.play("pickup");
                break;
              }
            }
          });

          projectiles.forEach((projectile) => {
            if (!projectile.active) return;
            projectile.age += dt;
            const previousProjectilePosition = {
              x: projectile.group.position.x,
              y: projectile.group.position.y,
              z: projectile.group.position.z,
            };
            const baseProjectileSpeed = projectile.kind === "FIRE" ? 43 : projectile.kind === "PIXEL" ? 52 : 49;
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
            const projectileSpeed = projectile.kind !== "FIRE" && projectile.target !== null
              ? Math.max(baseProjectileSpeed, actorSpeed(projectile.target) + 8)
              : baseProjectileSpeed;
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
              const targetLane = actorLane(projectile.target);
              projectile.progress = advanceHomingProgress({
                projectileProgress: projectile.progress,
                targetProgress,
                projectileSpeed,
                courseLength: course.length,
                dt,
              });
              const remainingGapMeters = Math.max(0, (targetProgress - projectile.progress) * course.length);
              const laneResponse = 1 - Math.pow(remainingGapMeters < 12 ? 0.000001 : 0.012, dt);
              projectile.lane = THREE.MathUtils.lerp(
                projectile.lane,
                targetLane,
                laneResponse,
              );
              const roadPoint = course.pointAt(projectile.progress, projectile.lane);
              const homingTargetPose = actorPose(projectile.target);
              const homingTargetPoint = {
                x: homingTargetPose.x,
                y: homingTargetPose.y + 0.85,
                z: homingTargetPose.z,
              };
              const visualGap = Math.hypot(
                homingTargetPoint.x - previousProjectilePosition.x,
                homingTargetPoint.y - previousProjectilePosition.y,
                homingTargetPoint.z - previousProjectilePosition.z,
              );
              projectile.terminalPursuit = !actorAirborne(projectile.target) && (
                projectile.terminalPursuit
                || remainingGapMeters <= 14
                || visualGap <= 18
              );
              const previousX = projectile.group.position.x;
              const previousY = projectile.group.position.y;
              const previousZ = projectile.group.position.z;
              if (projectile.terminalPursuit) {
                const pursuitStep = projectileSpeed * dt;
                const pursuitAmount = visualGap > 0.0001 ? Math.min(1, pursuitStep / visualGap) : 1;
                projectile.group.position.set(
                  THREE.MathUtils.lerp(previousProjectilePosition.x, homingTargetPoint.x, pursuitAmount),
                  THREE.MathUtils.lerp(previousProjectilePosition.y, homingTargetPoint.y, pursuitAmount),
                  THREE.MathUtils.lerp(previousProjectilePosition.z, homingTargetPoint.z, pursuitAmount),
                );
              } else {
                projectile.group.position.set(
                  roadPoint.x,
                  roadPoint.y + 0.86 + Math.sin(now * 0.012) * 0.08,
                  roadPoint.z,
                );
              }
              const moveX = projectile.group.position.x - previousX;
              const moveY = projectile.group.position.y - previousY;
              const moveZ = projectile.group.position.z - previousZ;
              const horizontalMove = Math.hypot(moveX, moveZ);
              if (horizontalMove > 0.001) projectile.group.rotation.y = Math.atan2(moveX, moveZ);
              projectile.group.rotation.x = THREE.MathUtils.lerp(
                projectile.group.rotation.x,
                -Math.atan2(moveY, Math.max(0.01, horizontalMove)),
                0.42,
              );
              if (projectile.kind === "PIXEL") projectile.group.rotation.z += dt * 2.8;
            }
            if (projectile.kind === "HOMING" && homingBreaksOnSpikes(projectile.level)) {
              const hitSpikes = traps.some((trap) => trap.active
                && spikeCollisionIsActive(trap.owner, projectile.owner, trap.armedAt, now, true)
                && Math.hypot(
                projectile.group.position.x - trap.x,
                projectile.group.position.y - (trap.y + 0.55),
                projectile.group.position.z - trap.z,
              ) < 1.75);
              if (hitSpikes) {
                projectile.active = false;
                projectile.group.visible = false;
                return;
              }
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
              const sweptDistance = projectile.kind === "FIRE" ? directDistance : pointToSegmentDistance3d({
                point: { x: pose.x, y: pose.y + 0.85, z: pose.z },
                start: previousProjectilePosition,
                end: {
                  x: projectile.group.position.x,
                  y: projectile.group.position.y,
                  z: projectile.group.position.z,
                },
              });
              const hitDistance = projectile.kind === "FIRE"
                ? 1.85 + Math.max(0, projectile.level - 1) * 0.65
                : 1.85;
              if (Math.min(directDistance, sweptDistance) < hitDistance) {
                const hitResult = attackActor(targetId, projectile.kind, now, projectile.owner);
                if (projectile.kind !== "FIRE") {
                  novaHitUntil[targetId] = Math.max(novaHitUntil[targetId], now + (hitResult === "crashed" ? 650 : 420));
                } else if (hitResult === "crashed") {
                  novaHitUntil[targetId] = now + 420;
                }
                if (projectile.kind === "PIXEL") {
                  projectile.remainingTargets = projectile.remainingTargets.filter((id) => id !== targetId);
                  projectile.target = projectile.remainingTargets.reduce<number | null>((nearest, id) => {
                    if (nearest === null) return id;
                    return Math.abs(actorProgress(id) - projectile.progress) < Math.abs(actorProgress(nearest) - projectile.progress) ? id : nearest;
                  }, null);
                  if (projectile.target !== null) {
                    projectile.progress = Math.min(projectile.progress, actorProgress(projectile.target) - 3 / course.length);
                    projectile.terminalPursuit = false;
                  }
                  if (projectile.target === null) {
                    projectile.active = false;
                    projectile.group.visible = false;
                  }
                } else {
                  if (projectile.kind === "HOMING" && homingCreatesShockwave(projectile.level)) {
                    createShockWave(targetId, now, {
                      ownerId: projectile.owner,
                      radius: HOMING_LV3_SHOCKWAVE_RADIUS,
                      attack: "HOMING",
                      color: 0xff6f55,
                    });
                  }
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
            if (trap.mode === "orbit") {
              const ownerPose = actorPose(trap.owner);
              const angle = trap.orbitAngle + now * 0.00265;
              trap.x = ownerPose.x + Math.cos(angle) * trap.orbitRadius;
              trap.y = ownerPose.y + 0.72;
              trap.z = ownerPose.z + Math.sin(angle) * trap.orbitRadius;
              trap.group.position.set(trap.x, trap.y, trap.z);
              trap.group.rotation.set(0, -angle + Math.PI / 2, Math.sin(now * 0.006) * 0.12);
            }
            for (let actorId = 0; actorId < actorCount; actorId += 1) {
              if (trap.mode === "orbit" && actorId === trap.owner) continue;
              if (!spikeCollisionIsActive(trap.owner, actorId, trap.armedAt, now)) continue;
              const pose = actorPose(actorId);
              if (Math.hypot(trap.x - pose.x, trap.y - pose.y, trap.z - pose.z) < 1.68) {
                const hitResult = attackActor(actorId, "SPIKES", now, trap.owner);
                if (hitResult === "crashed") novaHitUntil[actorId] = now + 420;
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
              if (!rivalBodyContacts.has(index)) {
                playerState.speed *= 0.96;
                rival.speed *= 0.96;
              }
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

        if (postFinishTourActive) {
          const paradeSpeed = 21;
          const paradeAdvance = paradeSpeed * dt / course.length;
          const paradeLaneForActor = (actorId: number) => {
            const orderIndex = Math.max(0, postFinishActorOrder.indexOf(actorId));
            const centeredIndex = orderIndex - (postFinishActorOrder.length - 1) * 0.5;
            return clamp(centeredIndex * 2.25, -BARRIER_LIMIT + 1.35, BARRIER_LIMIT - 1.35);
          };

          const playerLane = paradeLaneForActor(0);
          playerState.progress += paradeAdvance;
          playerState.rankingProgress = playerState.progress;
          playerState.lastU = wrap01(playerState.progress);
          const playerParadePoint = course.pointAt(playerState.progress, playerLane);
          const playerParadeSupport = getKartRoadSupport(playerState.progress, playerLane, playerParadePoint.heading);
          playerState.x = playerParadePoint.x;
          playerState.y = playerParadeSupport.centerY;
          playerState.z = playerParadePoint.z;
          playerState.groundY = playerParadeSupport.centerY;
          playerState.heading = playerParadePoint.heading;
          playerState.pitch = playerParadeSupport.pitch;
          playerState.speed = paradeSpeed;
          playerState.airborne = false;
          playerState.motionState = "grounded";
          playerState.drifting = false;
          playerState.driftBoost = 0;
          playerState.verticalVelocity = 0;

          rivalStates.forEach((rival, index) => {
            const actorId = index + 1;
            rival.progress += paradeAdvance;
            rival.rankingProgress = rival.progress;
            rival.lane = THREE.MathUtils.lerp(rival.lane, paradeLaneForActor(actorId), 1 - Math.pow(0.02, dt));
            const rivalParadePoint = course.pointAt(rival.progress, rival.lane);
            rival.speed = paradeSpeed;
            rival.pace = paradeSpeed;
            rival.airborne = false;
            rival.airY = rivalParadePoint.y;
            rival.motionState = "grounded";
            rival.drifting = false;
            rival.driftBoost = 0;
            rival.verticalVelocity = 0;
            rival.shortcutActive = false;
            rival.crashUntil = 0;
          });
        }

        const playerLandingRemaining = playerState.landingImpactUntil - now;
        const playerLandingPhase = playerLandingRemaining > 0 ? 1 - playerLandingRemaining / 360 : 1;
        const playerLandingLift = playerLandingRemaining > 0 ? Math.sin(playerLandingPhase * Math.PI) * 0.09 * machine.landingBounce : 0;
        const playerInRiverWater = courseDefinition.id === "river" && (runtimeRiverChannelAt(playerState.progress, actorLane(0)) || riverDamCrossingAt(playerState.progress));
        const playerWaterDepth = playerInRiverWater && !playerState.airborne ? 0.36 + riverSurgeStrength * 0.18 : 0;
        const playerRoadSupport = getKartRoadSupport(playerState.lastU, actorLane(0), playerState.heading);
        const playerSupportOffset = playerState.airborne ? 0 : playerRoadSupport.centerY - playerState.groundY;
        const playerVisualPitch = playerState.airborne ? playerState.pitch : playerRoadSupport.pitch;
        player.position.set(playerState.x, playerState.y + playerSupportOffset + KART_RIDE_HEIGHT + playerLandingLift - playerWaterDepth, playerState.z);
        const playerSteer = playerInputSteer;
        animateKartDriver(THREE, player, playerSteer, playerState.drifting, dt);
        rotateKartWheels(player, playerState.speed, dt);
        player.rotation.x = 0;
        player.rotation.z = 0;
        playerVisualRoot.rotation.y = 0;
        if (playerCrashing) {
          const crashPhase = clamp((now - playerState.crashStart) / (playerState.crashUntil - playerState.crashStart), 0, 1);
          player.rotation.y = playerState.heading + crashPhase * TAU * 2;
          playerVisualRoot.rotation.x = playerVisualPitch + Math.sin(crashPhase * Math.PI * 5) * 0.18;
          playerVisualRoot.rotation.z = Math.sin(crashPhase * Math.PI * 4) * 0.32;
        } else {
          player.rotation.y = playerState.heading;
          const landingPitch = playerLandingRemaining > 0 ? Math.sin(playerLandingPhase * Math.PI * 2) * 0.09 * machine.landingBounce : 0;
          playerVisualRoot.rotation.x = playerVisualPitch + landingPitch;
          const bounceRemaining = playerState.wallBounceUntil - now;
          const bouncePhase = bounceRemaining > 0 ? 1 - bounceRemaining / 180 : 1;
          const bounceRoll = bounceRemaining > 0 ? -playerState.wallBounceSide * Math.sin(bouncePhase * Math.PI) * 0.11 * machine.wallBounce : 0;
          const steeringRoll = playerSteer * (playerState.drifting ? 0.13 : 0.055);
          playerVisualRoot.rotation.z = steeringRoll + bounceRoll;
        }
        for (let index = skillVisuals.length - 1; index >= 0; index -= 1) {
          const effect = skillVisuals[index];
          const age = (now - effect.startedAt) / effect.durationMs;
          if (age >= 1) {
            scene.remove(effect.group);
            effect.group.traverse((child) => {
              if (child instanceof THREE.Mesh) child.geometry.dispose();
            });
            effect.materials.forEach((material) => material.dispose());
            skillVisuals.splice(index, 1);
            continue;
          }
          const pose = actorPose(effect.actorId);
          const eased = 1 - Math.pow(1 - clamp(age, 0, 1), 3);
          const fade = 1 - clamp((age - 0.42) / 0.58, 0, 1);
          const phaseScale = effect.phase === "critical" ? 1.18 : effect.phase === "success" ? 1.08 : 1;
          effect.group.position.set(pose.x, pose.y + 0.58 + eased * 0.55, pose.z);
          if (effect.skill === "PIXEL") effect.group.rotation.y = pose.heading;
          else effect.group.rotation.y += dt * (effect.phase === "critical" ? 4.8 : 3.4);
          effect.group.scale.setScalar((0.58 + eased * 0.82) * phaseScale);
          effect.group.children.forEach((child, childIndex) => {
            if (child.name === "skill-accent") return;
            child.rotation.y += dt * (1.2 + childIndex * 0.06);
            if (childIndex > 1) child.position.y += dt * (0.18 + (childIndex % 3) * 0.08);
          });
          effect.materials.forEach((material, materialIndex) => {
            material.opacity = fade * (materialIndex < 2 ? 0.92 : 0.78);
          });
        }

      rivalStates.forEach((rival, index) => {
        const point = actorPose(index + 1);
        const landingRemaining = rival.landingImpactUntil - now;
        const landingPhase = landingRemaining > 0 ? 1 - landingRemaining / 330 : 1;
        const landingLift = landingRemaining > 0 ? Math.sin(landingPhase * Math.PI) * 0.08 : 0;
        const rivalInRiverWater = courseDefinition.id === "river" && (runtimeRiverChannelAt(rival.progress, rival.lane) || riverDamCrossingAt(rival.progress));
        const rivalWaterDepth = rivalInRiverWater && !rival.airborne ? 0.36 + riverSurgeStrength * 0.18 : 0;
        const rivalRoadSupport = getKartRoadSupport(rival.progress, rival.lane);
        const rivalSupportOffset = rival.airborne || rival.shortcutActive ? 0 : rivalRoadSupport.centerY - point.y;
        rivalMeshes[index].position.set(point.x, point.y + rivalSupportOffset + KART_RIDE_HEIGHT + landingLift - rivalWaterDepth, point.z);
        const lookAhead = rival.shortcutActive ? point : course.pointAt(rival.progress + 0.006, rival.lane);
        let rivalTurn = lookAhead.heading - point.heading;
        if (rivalTurn > Math.PI) rivalTurn -= TAU;
        if (rivalTurn < -Math.PI) rivalTurn += TAU;
        const rivalSteer = rival.drifting
          ? rival.driftPhase === "counter" || rival.driftPhase === "exit"
            ? -rival.driftSide
            : rival.driftSide
          : rivalTurn > 0.035
            ? 1
            : rivalTurn < -0.035
              ? -1
              : 0;
        animateKartDriver(THREE, rivalMeshes[index], rivalSteer, rival.drifting, dt);
        rotateKartWheels(rivalMeshes[index], rival.speed, dt);
        const rivalVisualRoot = racerVisualRoots[index + 1];
        rivalMeshes[index].rotation.x = 0;
        rivalMeshes[index].rotation.z = 0;
        rivalVisualRoot.rotation.y = 0;
        if (now < rival.crashUntil) {
          const crashPhase = clamp((now - rival.crashStart) / (rival.crashUntil - rival.crashStart), 0, 1);
          rivalMeshes[index].rotation.y = point.heading + crashPhase * TAU * 2;
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
      });
      pickupPoints.forEach((pickup) => {
        pickup.group.rotation.y += dt * 1.35;
        pickup.group.position.y = pickup.baseY + Math.sin(now * 0.003 + pickup.rowIndex * 0.7 + pickup.laneIndex * 0.18) * 0.14;
      });

        shieldBubbles.forEach((bubble, actorId) => {
          bubble.visible = actorHasShield(actorId) || now < actorAuroraUntil(actorId);
          bubble.rotation.y += dt * 0.7;
        });
        spikeGuardAuras.forEach((aura, actorId) => {
          const active = Boolean(actorOrbitGuard(actorId));
          aura.visible = active;
          if (!active) return;
          aura.rotation.y += dt * 2.25;
          aura.rotation.z -= dt * 0.85;
          aura.scale.setScalar(1 + Math.sin(now * 0.014 + actorId) * 0.065);
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
        host.classList.toggle("vector-surge", playerState.vectorTurboActive);
        host.classList.toggle("nova-flash", now < novaFlashUntil);
        host.classList.toggle("airborne", playerState.airborne);
        host.classList.toggle("landing-impact", playerLandingRemaining > 0);

        for (let i = 0; i < exhaustCount; i += 1) {
          if (exhaustLife[i] <= 0) continue;
          exhaustLife[i] -= dt * 1.7;
          exhaustPositions[i * 3 + 1] += dt * 0.6;
        }
        exhaustGeometry.attributes.position.needsUpdate = true;

        // Appearance only: observe existing contact/water state; never change motion.
        visualDriftContactBudget += dt;
        const sampleDriftContacts = visualDriftContactBudget >= 0.05;
        const visualContactDt = visualDriftContactBudget;
        if (sampleDriftContacts) visualDriftContactBudget %= 0.05;
        actorIds.forEach((actorId) => {
          const drifting = actorId === 0 ? playerState.drifting : rivalStates[actorId - 1].drifting;
          const speed = actorId === 0 ? playerState.speed : rivalStates[actorId - 1].speed;
          const pose = actorPose(actorId);
          const active = racing && drifting && !actorAirborne(actorId) && !actorCrashing(actorId, now)
            && (actorId === 0 || !rivalStates[actorId - 1].shortcutActive)
            && Math.hypot(pose.x - playerState.x, pose.z - playerState.z) < 120;
          if (!active) driftVisualEffects.drift(actorId, tireContacts[actorId], pose.heading, speed, false, dt);
          else if (sampleDriftContacts) driftVisualEffects.drift(actorId, sampleVisualTireContacts(actorId), pose.heading, speed, true, visualContactDt);
        });
        driftVisualEffects.update(dt, skidSurfaceVisible);
        // Start at age zero after advancing older effects, matching the exhaust
        // ignition clock. The current road pitch and steering roll are applied.
        if (pendingTurboBurst) {
          driftVisualEffects.burst(playerVisualRoot, Math.max(0, playerState.speed));
          pendingTurboBurst = false;
        }
        visualEffects.update(dt, now * 0.001);
        if (courseDefinition.id === "river" || courseDefinition.id === "pirate") {
          actorIds.forEach((actorId) => {
            const pose = actorPose(actorId);
            const progress = actorProgress(actorId);
            const lane = actorLane(actorId);
            const nearby = Math.hypot(pose.x - playerState.x, pose.z - playerState.z) < 120;
            const wet = wetRoadForSpray(courseDefinition.id, progress, lane, COURSE_WIDTH,
              !actorAirborne(actorId) && nearby,
              Boolean(runtimeRiverChannelAt(progress, lane) || riverDamCrossingAt(progress)));
            visualEffects.wheelSpray(actorId, { ...pose, y: pose.y + (courseDefinition.id === "river" ? 0.36 : -0.015) },
              actorId === 0 ? playerState.speed : rivalStates[actorId - 1].speed, wet, dt);
          });
        }
        projectiles.forEach((projectile) => {
          if (projectile.active && projectile.kind === "FIRE") {
            visualEffects.fireTrail(projectile.group.position, projectile.group.rotation.y, projectile.level, dt, projectile);
          }
        });

        syncKartMotionStates(now);
        captureKartRenderState();
      };

      const renderFrame = (now: number, dt: number) => {
        const postFinishTourActive = phaseRef.current === "finished" && finished && postFinishStartedAt > 0;
        audioController.updateVehicle(
          Math.max(0, playerState.speed * 7.1),
          (phaseRef.current === "racing" && !finished || postFinishTourActive) && !pausedRef.current,
          playerState.drifting,
          simulationNow < playerState.boostUntil || playerState.driftBoost > 0.001,
          playerState.motionState === "crashing" && simulationNow < playerState.crashUntil,
          { finalLap: playerState.progress >= totalLaps - 1, airborne: playerState.airborne, paused: pausedRef.current },
        );
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
        const ghostElapsedMs = raceStart ? Math.max(0, simulationNow - raceStart) : 0;
        ghostVisuals.forEach((visual) => {
          const samples = visual.record.samples;
          while (visual.cursor + 1 < samples.length && samples[visual.cursor + 1][0] <= ghostElapsedMs) visual.cursor += 1;
          const from = samples[visual.cursor];
          const to = samples[Math.min(samples.length - 1, visual.cursor + 1)];
          if (!from || ghostElapsedMs > visual.record.timeMs + 500) {
            visual.ghost.visible = false;
            return;
          }
          const span = Math.max(1, to[0] - from[0]);
          const amount = clamp((ghostElapsedMs - from[0]) / span, 0, 1);
          visual.ghost.visible = phaseRef.current === "racing";
          visual.ghost.position.set(
            THREE.MathUtils.lerp(from[1], to[1], amount),
            THREE.MathUtils.lerp(from[2], to[2], amount) + KART_RIDE_HEIGHT,
            THREE.MathUtils.lerp(from[3], to[3], amount),
          );
          visual.ghost.rotation.y = interpolateAngle(from[4], to[4], amount);
          (visual.ghost.userData.visualRoot as Three.Group).rotation.x = THREE.MathUtils.lerp(from[5], to[5], amount);
          const ghostSpeed = Math.hypot(to[1] - from[1], to[3] - from[3]) / (span / 1000);
          rotateKartWheels(visual.ghost, ghostSpeed, dt);
        });
        const raceElapsedSeconds = raceStart ? Math.max(0, (simulationNow - raceStart) / 1000) : 0;
        const pirateWarmupProgress = (
          courseDefinition.id === "pirate"
          && phaseRef.current === "loading"
          && !readyReported
        ) ? PIRATE_RENDER_WARMUP_PROGRESS[courseRenderWarmupIndex] : undefined;
        if (pirateWarmupProgress !== undefined) {
          // The ship uses many geometries and materials that are not visible from
          // the starting grid. Render one representative view per preparation
          // frame so their first GPU upload/compile happens behind the overlay,
          // rather than progressively hitching throughout lap one.
          const warmupPose = course.pointAt(pirateWarmupProgress);
          const warmupForwardX = Math.sin(warmupPose.heading);
          const warmupForwardZ = Math.cos(warmupPose.heading);
          camera.position.set(
            warmupPose.x - warmupForwardX * cameraView.chaseDistance,
            warmupPose.y + KART_RIDE_HEIGHT + cameraView.cameraHeight,
            warmupPose.z - warmupForwardZ * cameraView.chaseDistance,
          );
          camera.lookAt(
            warmupPose.x + warmupForwardX * cameraView.lookAhead,
            warmupPose.y + KART_RIDE_HEIGHT + 0.95,
            warmupPose.z + warmupForwardZ * cameraView.lookAhead,
          );
          visualEffects.updateSky(camera, renderer.domElement.height, 0, visualStormStrength);
          // Upload the new wood instances behind the existing loading overlay,
          // not during the sudden entrance in the third lap. No attack clock is
          // started here; hide the preview pose immediately after rendering.
          pirateBreachVisual?.update(300);
          presentation.render(dt, player.position, false, false, cameraView.fov, true);
          courseRenderWarmupIndex += 1;
          pirateBreachVisual?.update(-1);
          if (courseRenderWarmupIndex >= PIRATE_RENDER_WARMUP_PROGRESS.length) {
            camera.position.set(0, 0, 0);
          }
          return;
        }
        if (postFinishTourActive && postFinishActorOrder.length > 0) {
          const actorTourDurationMs = 6400;
          const tourElapsedMs = Math.max(0, simulationNow - postFinishStartedAt);
          const tourIndex = Math.floor(tourElapsedMs / actorTourDurationMs) % postFinishActorOrder.length;
          const actorId = postFinishActorOrder[tourIndex];
          const focusKart = racerMeshes[actorId];
          const tourProgress = (tourElapsedMs % actorTourDurationMs) / actorTourDurationMs;
          const orbitAngle = focusKart.rotation.y + Math.PI + tourProgress * TAU;
          const focusPoint = focusKart.position.clone().add(new THREE.Vector3(0, 1.25, 0));
          const desiredTourCamera = focusPoint.clone().add(new THREE.Vector3(
            Math.sin(orbitAngle) * 9.4,
            4.25 + Math.sin(tourProgress * Math.PI) * 0.7,
            Math.cos(orbitAngle) * 9.4,
          ));
          camera.position.lerp(desiredTourCamera, 1 - Math.pow(0.0025, dt));
          camera.lookAt(focusPoint);
        } else {
          const forward = new THREE.Vector3(Math.sin(renderedPlayerPose.heading), 0, Math.cos(renderedPlayerPose.heading));
          const flightClearance = renderedPlayerPose.airborne ? Math.max(0, renderedPlayerPose.y - renderedPlayerPose.groundY) : 0;
          const cameraBaseY = renderedPlayerPose.airborne
            ? renderedPlayerPose.y - Math.min(1.1, flightClearance * 0.22)
            : renderedPlayerPose.y;
          const desiredCamera = new THREE.Vector3(renderedPlayerPose.x, cameraBaseY, renderedPlayerPose.z)
            .addScaledVector(forward, -cameraView.chaseDistance)
            .add(new THREE.Vector3(0, cameraView.cameraHeight, 0));
          if (camera.position.lengthSq() === 0) camera.position.copy(desiredCamera);
          camera.position.lerp(desiredCamera, 1 - Math.pow(0.015, dt));
          if (now < novaFlashUntil) {
            const shake = ((novaFlashUntil - now) / 1050) * 0.34;
            camera.position.x += Math.sin(now * 0.12) * shake;
            camera.position.y += Math.cos(now * 0.17) * shake * 0.55;
          }
          const lookAtY = renderedPlayerPose.y + 0.95;
          camera.lookAt(new THREE.Vector3(renderedPlayerPose.x, lookAtY, renderedPlayerPose.z).addScaledVector(forward, cameraView.lookAhead));
        }

        const cometGatePointer = cometGatePointerRef.current;
        if (cometGatePointer) {
          const playerCometStream = cometStreams.find((stream) => stream.active && stream.owner === 0);
          if (!playerCometStream || phaseRef.current !== "racing") {
            cometGatePointer.hidden = true;
          } else {
            cometGatePointer.hidden = false;
            camera.updateMatrixWorld();
            cometPointerProjection.copy(playerCometStream.group.position).project(camera);
            camera.getWorldDirection(cometCameraForward);
            cometPointerDirection.copy(playerCometStream.group.position).sub(camera.position);
            const inFront = cometPointerDirection.dot(cometCameraForward) > 0;
            let pointerX = Number.isFinite(cometPointerProjection.x) ? cometPointerProjection.x : 0;
            let pointerY = Number.isFinite(cometPointerProjection.y) ? cometPointerProjection.y : 0;
            if (!inFront) {
              pointerX *= -1;
              pointerY *= -1;
            }
            const onScreen = (
              inFront
              && Math.abs(pointerX) <= 0.78
              && Math.abs(pointerY) <= 0.66
              && cometPointerProjection.z >= -1
              && cometPointerProjection.z <= 1
            );
            if (!onScreen) {
              const edgeScale = Math.max(Math.abs(pointerX) / 0.84, Math.abs(pointerY) / 0.7, 1);
              pointerX /= edgeScale;
              pointerY /= edgeScale;
            }
            const pointerLeft = (clamp(pointerX, -0.84, 0.84) * 0.5 + 0.5) * host.clientWidth;
            const pointerTop = (-clamp(pointerY, -0.7, 0.7) * 0.5 + 0.5) * host.clientHeight - (onScreen ? 48 : 0);
            cometGatePointer.style.left = `${pointerLeft}px`;
            cometGatePointer.style.top = `${pointerTop}px`;
            cometGatePointer.style.setProperty("--gate-angle", `${Math.atan2(-pointerY, pointerX)}rad`);
            cometGatePointer.dataset.gate = `${playerCometStream.gateIndex + 1}/${playerCometStream.targetGateCount}`;
            cometGatePointer.classList.toggle("onscreen", onScreen);
          }
        }

        if (courseDefinition.id === "pirate") {
          const pirateU = wrap01(playerState.progress);
          const insideShip = pirateU >= 0.2 && pirateU <= 0.8;
          const pirateLapIndex = Math.min(2, Math.max(0, Math.floor(playerState.progress)));
          const interiorExposure = pirateLapIndex === 0 ? 0.86 : pirateLapIndex === 1 ? 0.98 : 1.05;
          const exteriorExposure = pirateLapIndex < 2 ? RACE_DAY_EXPOSURE : 0.96;
          renderer.toneMappingExposure = THREE.MathUtils.lerp(renderer.toneMappingExposure, insideShip ? interiorExposure : exteriorExposure, 0.045);
        } else if (courseDefinition.id === "starlight") {
          const sunsetToNight = smoothTimeTransition(raceElapsedSeconds, 45, 50);
          const dayToSunset = smoothTimeTransition(raceElapsedSeconds, 20, 25);
          const targetExposure = THREE.MathUtils.lerp(THREE.MathUtils.lerp(RACE_DAY_EXPOSURE, 0.98, dayToSunset), 1.18, sunsetToNight);
          renderer.toneMappingExposure = THREE.MathUtils.lerp(renderer.toneMappingExposure, targetExposure, 0.045);
        } else if (courseDefinition.id === "river") {
          const targetExposure = RACE_DAY_EXPOSURE - riverSurgeStrength * 0.03;
          renderer.toneMappingExposure = THREE.MathUtils.lerp(renderer.toneMappingExposure, targetExposure, 0.045);
        } else if (courseDefinition.id === "cloud") {
          const stormArrival = smoothTimeTransition(raceElapsedSeconds, 20, 25);
          const iceArrival = smoothTimeTransition(raceElapsedSeconds, 45, 50);
          const targetExposure = THREE.MathUtils.lerp(THREE.MathUtils.lerp(RACE_DAY_EXPOSURE, 1.02, stormArrival), RACE_DAY_EXPOSURE, iceArrival);
          renderer.toneMappingExposure = THREE.MathUtils.lerp(renderer.toneMappingExposure, targetExposure, 0.045);
        } else {
          renderer.toneMappingExposure = THREE.MathUtils.lerp(renderer.toneMappingExposure, RACE_DAY_EXPOSURE, 0.045);
        }
        drawMiniMap(now);
        visualEffects.updateSky(camera, renderer.domElement.height,
          courseDefinition.id === "starlight" ? smoothTimeTransition(raceElapsedSeconds, 45, 50)
            : courseDefinition.id === "custom" && courseDefinition.theme === "starlight" ? 1 : 0,
          courseDefinition.id === "cloud" ? cloudStormStrength : visualStormStrength);
        presentation.render(pausedRef.current ? 0 : dt, player.position,
          phaseRef.current === "racing" && (simulationNow < playerState.boostUntil || playerState.driftBoost > 0.001),
          postFinishTourActive, cameraView.fov);
        if (!readyReported && generatedTexturesReady) {
          readyReported = true;
          // Report readiness only after the first complete GPU-backed frame.
          // This keeps course construction and first-use shader compilation
          // outside the visible countdown.
          readyReportTimer = window.setTimeout(() => {
            if (!disposed) onReady(runId);
          }, 0);
        }
      };

      let lastRaceFaultAt = -Infinity;
      const reportRaceFault = (stage: string, error: unknown, now: number) => {
        const normalizedError = error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack ?? "" }
          : { name: "UnknownError", message: String(error), stack: "" };
        const diagnostic = {
          recordedAt: new Date().toISOString(),
          course: courseDefinition.id,
          stage,
          raceElapsedMs: raceStart ? Math.max(0, Math.round(now - raceStart)) : 0,
          phase: phaseRef.current,
          error: normalizedError,
          player: {
            x: playerState.x,
            y: playerState.y,
            z: playerState.z,
            speed: playerState.speed,
            progress: playerState.progress,
            airborne: playerState.airborne,
            motionState: playerState.motionState,
          },
          activeObjects: {
            projectiles: projectiles.length,
            traps: traps.length,
            shootingStars: shootingStars.length,
            skillMeteors: skillMeteors.length,
            shockWaves: shockWaves.length,
            cometStreams: cometStreams.length,
            shatters: shatters.length,
          },
          renderer: {
            geometries: renderer.info.memory.geometries,
            textures: renderer.info.memory.textures,
            calls: renderer.info.render.calls,
            triangles: renderer.info.render.triangles,
          },
        };
        if (now - lastRaceFaultAt < 1000) return;
        lastRaceFaultAt = now;
        console.error("[PRISM RACE FAULT]", diagnostic);
        try {
          window.localStorage.setItem(RACE_FAULT_STORAGE_KEY, JSON.stringify(diagnostic));
        } catch {
          // A full or unavailable storage area must never stop the race loop.
        }
        onRaceFault(diagnostic);
      };
      const onWebglContextLost = (event: Event) => {
        event.preventDefault();
        reportRaceFault("webgl-context-lost", new Error("WebGL context lost"), performance.now());
      };
      const onWebglContextRestored = () => {
        renderer.resetState();
      };
      renderer.domElement.addEventListener("webglcontextlost", onWebglContextLost);
      renderer.domElement.addEventListener("webglcontextrestored", onWebglContextRestored);

      const animate = (frameNow: number) => {
        // Reserve the next frame first. Previously any one-off exception before
        // the final requestAnimationFrame call permanently stopped the race.
        frame = requestAnimationFrame(animate);
        let frameStage = "frame-start";
        try {
          const rawFrameDeltaMs = Math.max(0, frameNow - previousFrameAt);
          if (pausedRef.current) {
            previousFrameAt = frameNow;
            physicsAccumulatorMs = 0;
            frameStage = "paused-render";
            renderFrame(frameNow, clamp(rawFrameDeltaMs / 1000, 0.001, 0.1));
            return;
          }
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
            frameStage = `physics-step-${steps + 1}`;
            simulateStep(simulationNow, PHYSICS_STEP_SECONDS, PHYSICS_STEP_MS);
            physicsAccumulatorMs -= PHYSICS_STEP_MS;
            steps += 1;
          }
          frameStage = "render";
          renderFrame(frameNow, clamp(rawFrameDeltaMs / 1000, 0.001, 0.1));
        } catch (error) {
          physicsAccumulatorMs = 0;
          previousFrameAt = frameNow;
          reportRaceFault(frameStage, error, frameNow);
        }
      };
      // All world, kart, ghost and hazard materials now exist. One traversal,
      // never a per-frame material rebuild; load behind the course loading UI.
      generatedTextures.attach(scene);
      void Promise.all([generatedTextures.ready(), scene.userData.courseBackdrop?.userData.backdropReady])
        .then(() => { if (!disposed) generatedTexturesReady = true; });
      frame = requestAnimationFrame(animate);

      disposeThree = () => {
        cancelAnimationFrame(frame);
        window.clearTimeout(readyReportTimer);
        audioController.updateVehicle(0, false, false, false, false);
        observer.disconnect();
        renderer.domElement.removeEventListener("webglcontextlost", onWebglContextLost);
        renderer.domElement.removeEventListener("webglcontextrestored", onWebglContextRestored);
        host.classList.remove("focus-boost", "vector-surge", "nova-flash", "airborne", "landing-impact");
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
        visualEffects.disposeUnused();
        (scene.userData.riverFoamTexture as Three.Texture | undefined)?.dispose();
        presentation.dispose();
        generatedTextures.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    });

    return () => {
      disposed = true;
      disposeThree?.();
    };
  }, [audioController, courseDefinition, creatorHazards, creatorParts, evolutionChapterIndex, evolutionMode, ghostRecords, gojoChallenge, ultimateGojo, gojoField, gojoLineRecord, recordGojoLine, runId, selectedCharacterIndex, machine, machineTuning, itemsEnabled, skillsEnabled, timeTrialMode, keyBindings, gamepadBindings, onItemChange, onRaceFault, onReady, onRunEvent, onShieldChange, onSkillChange, onTelemetry, showSkillFeedback]);

  const syncTouchSteering = () => {
    const pointers = Array.from(activeTouchPointers.current.values());
    touch.current.left = pointers.some((pointer) => !pointer.skillHold && pointer.side === "left");
    touch.current.right = pointers.some((pointer) => !pointer.skillHold && pointer.side === "right");
    const driftPointer = pointers.find((pointer) => !pointer.skillHold && pointer.drift);
    touch.current.drift = Boolean(driftPointer);
    // Steering uses +1 for left and -1 for right across keyboard, touch and drift physics.
    touch.current.driftOrigin = driftPointer ? (driftPointer.originSide === "left" ? 1 : -1) : 0;
  };
  const pulseTouchAction = (action: "item" | "skill") => {
    touch.current[action] = true;
    window.clearTimeout(touchActionTimers.current[action]);
    touchActionTimers.current[action] = window.setTimeout(() => {
      touch.current[action] = false;
    }, 150);
  };
  const beginTouchGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pausedRef.current || event.pointerType === "mouse") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = event.currentTarget.getBoundingClientRect();
    const side = event.clientX < bounds.left + bounds.width / 2 ? "left" : "right";
    const now = performance.now();
    const drift = now - lastTouchTapAt.current[side] <= 360;
    if (drift) lastTouchTapAt.current[side] = 0;
    activeTouchPointers.current.set(event.pointerId, {
      side,
      originSide: side,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      startedAt: now,
      drift,
      didSwipe: false,
      skillHold: false,
    });
    syncTouchSteering();
  };
  const moveTouchGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pausedRef.current) return;
    const pointer = activeTouchPointers.current.get(event.pointerId);
    if (!pointer) return;
    event.preventDefault();
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    const bounds = event.currentTarget.getBoundingClientRect();
    pointer.side = event.clientX < bounds.left + bounds.width / 2 ? "left" : "right";
    const verticalTravel = event.clientY - pointer.startY;
    const horizontalTravel = event.clientX - pointer.startX;
    if (!pointer.didSwipe && Math.abs(verticalTravel) >= 42 && Math.abs(verticalTravel) > Math.abs(horizontalTravel) * 1.08) {
      pointer.didSwipe = true;
      if (verticalTravel > 0 && itemsEnabled) pulseTouchAction("item");
      if (verticalTravel < 0 && skillsEnabled) {
        if ((CHARACTERS[selectedCharacterIndex] ?? CHARACTERS[0]).name === "GIANT") {
          pointer.skillHold = true;
          touch.current.skill = true;
        } else {
          pulseTouchAction("skill");
        }
      }
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
    if (pointer.skillHold) {
      touch.current.skill = Array.from(activeTouchPointers.current.values()).some((activePointer) => activePointer.skillHold);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    syncTouchSteering();
  };

  return (
    <div className={`webgl-host phase-${phase}`} ref={hostRef}>
      {webglError && <div className="webgl-error">この端末ではWebGLを開始できませんでした。ブラウザの3D描画設定をご確認ください。</div>}
      {skillFeedback && feedbackTarget && createPortal(
        <div key={skillFeedback.id} className={`skill-feedback ${skillFeedback.tone}`} aria-live="polite">
          {skillFeedback.text.split("\n").map((line, index) => (
            <span key={`${skillFeedback.id}-${index}`} className={index > 0 ? "skill-feedback-english" : undefined}>{line}</span>
          ))}
        </div>, feedbackTarget
      )}
      <div className="nova-impact" aria-hidden="true" />
      <div className={`controller-chip ${gamepadConnected ? "connected" : ""}`} hidden={phase !== "countdown" && phase !== "racing"} aria-live="polite">
        <i /> {gamepadConnected ? "GAMEPAD CONNECTED" : "GAMEPAD READY"}
      </div>
      <div className="mini-map" hidden={phase !== "countdown" && phase !== "racing"} aria-label="コースミニマップ">
        <span>COURSE MAP</span>
        <canvas className="mini-map-canvas" width="240" height="180" />
      </div>
      <div className="comet-gate-pointer" ref={cometGatePointerRef} data-gate="1/3" hidden aria-hidden="true"><i /><span>NEXT RING</span></div>
      <div className="jump-indicator" aria-hidden="true"><i /> AIRBORNE <span>GRAVITY ACTIVE</span></div>
      <div
        className={`mobile-gesture-layer ${phase === "racing" && !paused ? "active" : ""}`}
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
  SPIKES: { icon: "▲", name: "SPIKES" },
  SHIELD: { icon: "◉", name: "SHIELD" },
  NOVA: { icon: "✹", name: "NOVA" },
};

const ITEM_BRIEFING: Array<{
  item: Exclude<ItemType, "EMPTY">;
  description: string;
  levelHint: string;
}> = [
  { item: "FIRE", description: "前方へ一直線に炎を発射。レベルが上がると弾数と大きさが増える。", levelHint: "LV.1 → 3　1発 / 2発 / 3発" },
  { item: "HOMING", description: "発動時に1つ上の順位を狙い、路面に沿って追跡する。", levelHint: "LV.3　命中時に衝撃波" },
  { item: "BOOST", description: "一気に加速する。レベルが高いほどダッシュ時間が長くなる。", levelHint: "LV.1 3秒　LV.2 5秒　LV.3 7秒" },
  { item: "SPIKES", description: "LV.1は路面へ設置。LV.2・LV.3は10秒間自機を旋回し、接触した相手をクラッシュさせる。", levelHint: "LV.3　専用ガードでアイテム・スキルを1回防御" },
  { item: "SHIELD", description: "10秒間の時限シールド。レベルに応じて速度と接触攻撃も強化。", levelHint: "LV.3　オーロラ効果＋最高速UP" },
  { item: "NOVA", description: "最下位でまれに入手。自分以外の全レーサーをクラッシュさせる。", levelHint: "SPECIAL　レベルアップなし" },
];

function ItemGraphic({ item }: { item: ItemType }) {
  return (
    <span className={`item-graphic item-graphic-${item.toLowerCase()}`} aria-hidden="true">
      <i className="item-graphic-core" />
      <i className="item-graphic-detail" />
      <i className="item-graphic-accent" />
    </span>
  );
}

export default function Home() {
  const [phase, setPhase] = useState<GamePhase>("title");
  const [feedbackTarget, setFeedbackTarget] = useState<HTMLDivElement | null>(null);
  const [titleReturnConfirmOpen, setTitleReturnConfirmOpen] = useState(false);
  const [titleReturnFocus, setTitleReturnFocus] = useState<0 | 1>(1);
  const titleReturnFocusRef = useRef<0 | 1>(1);
  const [audioController] = useState(() => new GameAudioController());
  const [titleMenuFocus, setTitleMenuFocus] = useState(0);
  const titleMenuFocusRef = useRef(0);
  const [selectedCupIndex, setSelectedCupIndex] = useState(0);
  const [selectedCharacterIndex, setSelectedCharacterIndex] = useState(0);
  const [characterSelectSource, setCharacterSelectSource] = useState<CharacterSelectSource>("cup");
  const [cupMenuFocus, setCupMenuFocus] = useState<0 | 1 | 2 | 3>(0);
  const [itemOptionEnabled, setItemOptionEnabled] = useState(true);
  const [skillOptionEnabled, setSkillOptionEnabled] = useState(true);
  const [runMode, setRunMode] = useState<RunMode>("race");
  const [timeTrialCourseIndex, setTimeTrialCourseIndex] = useState(0);
  const [ultimateGojoCourseIndex, setUltimateGojoCourseIndex] = useState(0);
  const [achievementStore, setAchievementStore] = useState<AchievementStore>({ unlocked: {}, shieldBlocks: 0 });
  const achievementStoreRef = useRef<AchievementStore>({ unlocked: {}, shieldBlocks: 0 });
  const [achievementToast, setAchievementToast] = useState<AchievementDefinition | null>(null);
  const [raceFaultDiagnostic, setRaceFaultDiagnostic] = useState<RaceFaultDiagnostic | null>(null);
  const [raceFaultReportOpen, setRaceFaultReportOpen] = useState(false);
  const [raceFaultCopyStatus, setRaceFaultCopyStatus] = useState("COPY REPORT");
  const [ghostStore, setGhostStore] = useState<GhostStore>({ personal: {}, staff: {} });
  const ghostStoreRef = useRef<GhostStore>({ personal: {}, staff: {} });
  const [gojoLineStore, setGojoLineStore] = useState<GojoLineStore>({});
  const gojoLineStoreRef = useRef<GojoLineStore>({});
  const [timeTrialResult, setTimeTrialResult] = useState<TimeTrialResult | null>(null);
  const [lastStaffGhost, setLastStaffGhost] = useState<GhostRecord | null>(null);
  const [lastGojoLine, setLastGojoLine] = useState<GojoLineRecord | null>(null);
  const [staffRecorderEnabled, setStaffRecorderEnabled] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [bgmVolume, setBgmVolume] = useState(0.58);
  const [seVolume, setSeVolume] = useState(0.78);
  const [keyBindings, setKeyBindings] = useState<KeyBindings>(() => cloneKeyBindings(DEFAULT_KEY_BINDINGS));
  const [gamepadBindings, setGamepadBindings] = useState<GamepadBindings>(() => cloneGamepadBindings(DEFAULT_GAMEPAD_BINDINGS));
  const [capturingBinding, setCapturingBinding] = useState<{ action: KeyAction; slot: 0 | 1 } | null>(null);
  const [capturingGamepadBinding, setCapturingGamepadBinding] = useState<{ action: KeyAction; slot: 0 | 1 } | null>(null);
  const [inputConfigTab, setInputConfigTab] = useState<"keyboard" | "gamepad">("keyboard");
  const [settingsMenuFocus, setSettingsMenuFocus] = useState(0);
  const [connectedGamepadNames, setConnectedGamepadNames] = useState<string[]>([]);
  const gamepadCaptureStartedAt = useRef(0);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [machineTuning, setMachineTuning] = useState<MachineTuning>(() => ({ ...MACHINE_PRESETS.DEFAULT }));
  const [activeMachineTuning, setActiveMachineTuning] = useState<MachineTuning>(() => ({ ...MACHINE_PRESETS.DEFAULT }));
  const [tuningCategory, setTuningCategory] = useState<TuningCategory>("drive");
  const [tuningCustomMode, setTuningCustomMode] = useState(false);
  const [tuningSaveFailed, setTuningSaveFailed] = useState(false);
  const tuningReturnPhaseRef = useRef<GamePhase>("character-select");
  const tuningPanelRef = useRef<HTMLDivElement>(null);
  const tuningPreset = tuningCustomMode ? "CUSTOM" : machineTuningPreset(machineTuning);
  const selectedTuningCategory = TUNING_CATEGORIES.find(({ id }) => id === tuningCategory)!;
  const tuningStats = useMemo(() => machineTuningStats(machineTuning), [machineTuning]);
  const [gameDataResetConfirming, setGameDataResetConfirming] = useState(false);
  const [activeItemsEnabled, setActiveItemsEnabled] = useState(true);
  const [activeSkillsEnabled, setActiveSkillsEnabled] = useState(true);
  const [activeCupId, setActiveCupId] = useState<CupId>("basic");
  const [courseIndex, setCourseIndex] = useState(0);
  const [evolutionTourActive, setEvolutionTourActive] = useState(false);
  const [evolutionChapterIndex, setEvolutionChapterIndex] = useState(0);
  const [scores, setScores] = useState([0, 0, 0, 0]);
  const [lastOrder, setLastOrder] = useState([0, 1, 2, 3]);
  const [cupPlacements, setCupPlacements] = useState<number[]>([]);
  const [bestBasicCupMedal, setBestBasicCupMedal] = useState<CupMedal | null>(null);
  const [basicCupMedalCabinet, setBasicCupMedalCabinet] = useState<CupMedalCabinet>({ gold: false, silver: false, bronze: false });
  const [bestAdventureCupMedal, setBestAdventureCupMedal] = useState<CupMedal | null>(null);
  const [adventureCupMedalCabinet, setAdventureCupMedalCabinet] = useState<CupMedalCabinet>({ gold: false, silver: false, bronze: false });
  const [awardCeremonyCanContinue, setAwardCeremonyCanContinue] = useState(false);
  const awardCeremonyTimerRef = useRef(0);
  const [gojoChallenge, setGojoChallenge] = useState(false);
  const [ultimateGojoActive, setUltimateGojoActive] = useState(false);
  const [countdown, setCountdown] = useState("3");
  const [runId, setRunId] = useState(0);
  const runIdRef = useRef(0);
  const pendingLoadingRunIdRef = useRef<number | null>(null);
  const loadingStartedAtRef = useRef(0);
  const loadingReadyTimerRef = useRef(0);
  const countdownTimersRef = useRef<number[]>([]);
  const [speed, setSpeed] = useState(0);
  const [position, setPosition] = useState(4);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [finishTime, setFinishTime] = useState(0);
  const [finishPosition, setFinishPosition] = useState(1);
  const [item, setItem] = useState<ItemType>("EMPTY");
  const [itemLevel, setItemLevel] = useState<ItemLevel>(0);
  const [shieldActive, setShieldActive] = useState(false);
  const [shieldLevel, setShieldLevel] = useState<ItemLevel>(0);
  const [driftGauge, setDriftGauge] = useState(0);
  const [driftDashing, setDriftDashing] = useState(false);
  const [skillRemaining, setSkillRemaining] = useState(0);
  const [skillCooldown, setSkillCooldown] = useState(skillCooldownFor(CHARACTERS[0]));
  const [skillActive, setSkillActive] = useState(false);
  const [skillActionProgress, setSkillActionProgress] = useState(0);
  const [skillActionLabel, setSkillActionLabel] = useState("");
  const [creatorEditMode, setCreatorEditMode] = useState<"road" | "hazards">("road");
  const [creatorParts, setCreatorParts] = useState<CoursePartType[]>(DEFAULT_CREATOR_PARTS);
  const [creatorPartType, setCreatorPartType] = useState<CoursePartType>("straight");
  const [creatorHazardType, setCreatorHazardType] = useState<CreatorHazardType>("monkey");
  const [creatorHazards, setCreatorHazards] = useState<CreatorHazardPlacement[]>([]);
  const [creatorSelectedHazardId, setCreatorSelectedHazardId] = useState<string | null>(null);
  const [creatorConnectAt, setCreatorConnectAt] = useState<"front" | "back">("back");
  const [creatorCourseName, setCreatorCourseName] = useState("MY CIRCUIT");
  const [creatorTheme, setCreatorTheme] = useState<CreatorTheme>("city");
  const [savedCreatorCourse, setSavedCreatorCourse] = useState<SavedCreatorCourse | null>(null);
  const [creatorNotice, setCreatorNotice] = useState("半透明の道路を選び、光る接続点へ設置してください。");
  const [creatorCodeOpen, setCreatorCodeOpen] = useState(false);
  const [creatorCodeInput, setCreatorCodeInput] = useState("");
  const [creatorUndoStack, setCreatorUndoStack] = useState<CoursePartType[][]>([]);
  const [creatorRedoStack, setCreatorRedoStack] = useState<CoursePartType[][]>([]);
  const [creatorSelectedPartIndex, setCreatorSelectedPartIndex] = useState<number | null>(null);
  const [creatorTestMode, setCreatorTestMode] = useState(false);
  const [creatorTestDefinition, setCreatorTestDefinition] = useState<CourseDefinition | null>(null);
  const [creatorTestHazards, setCreatorTestHazards] = useState<CreatorHazardPlacement[]>([]);
  const [creatorRaceItemsEnabled, setCreatorRaceItemsEnabled] = useState(true);
  const [creatorRaceSkillsEnabled, setCreatorRaceSkillsEnabled] = useState(true);
  const [creatorGojoMode, setCreatorGojoMode] = useState<CreatorGojoMode>("off");
  const [randomQuestActive, setRandomQuestActive] = useState(false);
  const [randomQuestTour, setRandomQuestTour] = useState<RandomQuestTour | null>(null);
  const [randomQuestRuntime, setRandomQuestRuntime] = useState<RandomQuestRuntime>(() => emptyRandomQuestRuntime());
  const randomQuestRuntimeRef = useRef<RandomQuestRuntime>(emptyRandomQuestRuntime());
  const [randomQuestComboDisplay, setRandomQuestComboDisplay] = useState<RandomQuestComboDisplay | null>(null);
  const randomQuestComboRef = useRef({ count: 0, lastSuccessAt: 0 });
  const randomQuestComboPopIdRef = useRef(0);
  const randomQuestComboTimerRef = useRef(0);
  const [randomQuestRoundResults, setRandomQuestRoundResults] = useState<RandomQuestRoundResult[]>([]);
  const [randomQuestLeaderboard, setRandomQuestLeaderboard] = useState<number[]>([]);
  const [randomQuestFinalScore, setRandomQuestFinalScore] = useState(0);
  const timerStart = useRef(0);
  const menuPadHeld = useRef({
    left: false, right: false, up: false, down: false, confirm: false, back: false,
    previousPart: false, nextPart: false, redo: false, pause: false,
  });
  const creatorDefinition = useMemo(
    () => buildCreatorCourseDefinition(creatorCourseName, creatorParts, creatorTheme),
    [creatorCourseName, creatorParts, creatorTheme],
  );
  const creatorCourseCode = useMemo(() => {
    try {
      return encodeCourseCode(
        creatorParts,
        creatorHazards,
        COURSE_PARTS.map((part) => part.id),
        CREATOR_HAZARDS,
        creatorTheme,
      );
    } catch {
      return "";
    }
  }, [creatorHazards, creatorParts, creatorTheme]);
  const ultimateGojoUnlocked = isUltimateGojoUnlocked({
    achievementIds: ACHIEVEMENTS.map((achievement) => achievement.id),
    unlocked: achievementStore.unlocked,
  });

  const handleRaceFault = useCallback((diagnostic: RaceFaultDiagnostic) => {
    setRaceFaultDiagnostic(diagnostic);
    setRaceFaultReportOpen(true);
    setRaceFaultCopyStatus("COPY REPORT");
  }, []);

  const copyRaceFaultReport = useCallback(async () => {
    if (!raceFaultDiagnostic) return;
    const report = JSON.stringify(raceFaultDiagnostic, null, 2);
    try {
      await navigator.clipboard.writeText(report);
      setRaceFaultCopyStatus("COPIED");
    } catch {
      window.prompt("この診断情報をコピーしてください", report);
    }
  }, [raceFaultDiagnostic]);

  const clearRaceFaultReport = useCallback(() => {
    try { window.localStorage.removeItem(RACE_FAULT_STORAGE_KEY); } catch { /* local persistence is optional */ }
    setRaceFaultDiagnostic(null);
    setRaceFaultReportOpen(false);
    setRaceFaultCopyStatus("COPY REPORT");
  }, []);

  const persistAchievements = useCallback((next: AchievementStore) => {
    achievementStoreRef.current = next;
    setAchievementStore(next);
    try { window.localStorage.setItem(ACHIEVEMENT_STORAGE_KEY, JSON.stringify(next)); } catch { /* local persistence is optional */ }
  }, []);
  const unlockAchievement = useCallback((id: AchievementId) => {
    if (achievementStoreRef.current.unlocked[id]) return;
    const definition = ACHIEVEMENTS.find((entry) => entry.id === id);
    const next = { ...achievementStoreRef.current, unlocked: { ...achievementStoreRef.current.unlocked, [id]: Date.now() } };
    persistAchievements(next);
    if (definition) {
      setAchievementToast(definition);
      window.setTimeout(() => setAchievementToast((current) => current?.id === id ? null : current), 4200);
    }
  }, [persistAchievements]);
  const persistGhostStore = useCallback((next: GhostStore) => {
    ghostStoreRef.current = next;
    setGhostStore(next);
    try { window.localStorage.setItem(GHOST_STORAGE_KEY, JSON.stringify(next)); } catch { /* local persistence is optional */ }
  }, []);
  const persistGojoLineStore = useCallback((next: GojoLineStore) => {
    gojoLineStoreRef.current = next;
    setGojoLineStore(next);
    try { window.localStorage.setItem(GOJO_LINE_STORAGE_KEY, JSON.stringify(next)); } catch { /* local persistence is optional */ }
  }, []);

  useEffect(() => {
    try {
      const savedFault = window.localStorage.getItem(RACE_FAULT_STORAGE_KEY);
      if (savedFault) {
        const parsed = JSON.parse(savedFault) as RaceFaultDiagnostic;
        if (parsed && typeof parsed === "object" && typeof parsed.recordedAt === "string" && typeof parsed.stage === "string") {
          setRaceFaultDiagnostic(parsed);
          setRaceFaultReportOpen(true);
        }
      }
    } catch {
      // Invalid diagnostics must not affect startup.
    }
  }, []);

  useEffect(() => {
    let officialDataCancelled = false;
    try {
      const saved = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          audioMuted?: unknown;
          bgmVolume?: unknown;
          seVolume?: unknown;
          machineTuning?: unknown;
          machineTuningCustom?: unknown;
          keyBindings?: Partial<Record<KeyAction, unknown>>;
          gamepadBindings?: Partial<Record<KeyAction, unknown>>;
        };
        if (typeof parsed.audioMuted === "boolean") setAudioMuted(parsed.audioMuted);
        if (typeof parsed.bgmVolume === "number") setBgmVolume(clamp(parsed.bgmVolume, 0, 1));
        if (typeof parsed.seVolume === "number") setSeVolume(clamp(parsed.seVolume, 0, 1));
        setMachineTuning(normalizeMachineTuning(parsed.machineTuning));
        setTuningCustomMode(parsed.machineTuningCustom === true);
        if (parsed.keyBindings && typeof parsed.keyBindings === "object") {
          const restored = cloneKeyBindings(DEFAULT_KEY_BINDINGS);
          KEY_ACTIONS.forEach(({ id }) => {
            const value = parsed.keyBindings?.[id];
            if (!Array.isArray(value)) return;
            restored[id] = [
              typeof value[0] === "string" ? normalizeBindingKey(value[0]) : restored[id][0],
              typeof value[1] === "string" ? normalizeBindingKey(value[1]) : restored[id][1],
            ];
          });
          setKeyBindings(restored);
        }
        if (parsed.gamepadBindings && typeof parsed.gamepadBindings === "object") {
          const restored = cloneGamepadBindings(DEFAULT_GAMEPAD_BINDINGS);
          KEY_ACTIONS.forEach(({ id }) => {
            const value = parsed.gamepadBindings?.[id];
            if (!Array.isArray(value)) return;
            const first = normalizeStoredGamepadBinding(value[0]);
            const second = normalizeStoredGamepadBinding(value[1]);
            if (first !== undefined) restored[id][0] = first;
            if (second !== undefined) restored[id][1] = second;
          });
          setGamepadBindings(restored);
        }
      }
    } catch {
      setKeyBindings(cloneKeyBindings(DEFAULT_KEY_BINDINGS));
      setGamepadBindings(cloneGamepadBindings(DEFAULT_GAMEPAD_BINDINGS));
    } finally {
      setSettingsLoaded(true);
    }
    try {
      const achievements = JSON.parse(window.localStorage.getItem(ACHIEVEMENT_STORAGE_KEY) || "null") as AchievementStore | null;
      if (achievements?.unlocked) persistAchievements({ unlocked: achievements.unlocked, shieldBlocks: Number(achievements.shieldBlocks) || 0 });
    } catch { /* start with an empty achievement cabinet */ }
    try {
      const legacyMedal = window.localStorage.getItem(BASIC_CUP_MEDAL_STORAGE_KEY);
      const validLegacyMedal = legacyMedal === "gold" || legacyMedal === "silver" || legacyMedal === "bronze" ? legacyMedal : null;
      const storedCabinet = JSON.parse(window.localStorage.getItem(BASIC_CUP_MEDALS_STORAGE_KEY) || "null") as unknown;
      const cabinet = normalizeCupMedalCabinet(storedCabinet, validLegacyMedal) as CupMedalCabinet;
      setBasicCupMedalCabinet(cabinet);
      const recordedBest = validLegacyMedal ?? (cabinet.gold ? "gold" : cabinet.silver ? "silver" : cabinet.bronze ? "bronze" : null);
      if (recordedBest) setBestBasicCupMedal(recordedBest);
    } catch { /* start with no BASIC CUP medal */ }
    try {
      const recordedMedal = window.localStorage.getItem(ADVENTURE_CUP_MEDAL_STORAGE_KEY);
      const validRecordedMedal = recordedMedal === "gold" || recordedMedal === "silver" || recordedMedal === "bronze" ? recordedMedal : null;
      const storedCabinet = JSON.parse(window.localStorage.getItem(ADVENTURE_CUP_MEDALS_STORAGE_KEY) || "null") as unknown;
      const cabinet = normalizeCupMedalCabinet(storedCabinet, validRecordedMedal) as CupMedalCabinet;
      setAdventureCupMedalCabinet(cabinet);
      const recordedBest = validRecordedMedal ?? (cabinet.gold ? "gold" : cabinet.silver ? "silver" : cabinet.bronze ? "bronze" : null);
      if (recordedBest) setBestAdventureCupMedal(recordedBest);
    } catch { /* start with no ADVENTURE CUP medal */ }
    try {
      const ghosts = JSON.parse(window.localStorage.getItem(GHOST_STORAGE_KEY) || "null") as { personal?: unknown; staff?: GhostStore["staff"] } | null;
      if (ghosts?.personal || ghosts?.staff) persistGhostStore({
        personal: normalizePersonalGhostStore(ghosts.personal) as GhostStore["personal"],
        staff: ghosts.staff ?? {},
      });
    } catch { /* start with no ghosts */ }
    try {
      const storedLines = JSON.parse(window.localStorage.getItem(GOJO_LINE_STORAGE_KEY) || "null") as GojoLineStore | null;
      if (storedLines && typeof storedLines === "object") {
        const validLines = Object.fromEntries(Object.entries(storedLines).filter(([, record]) => (
          record?.version === 1 && Array.isArray(record.samples) && record.samples.length > 1
        ))) as GojoLineStore;
        persistGojoLineStore(validLines);
      }
    } catch { /* start with the default Gojo AI */ }
    setStaffRecorderEnabled(new URLSearchParams(window.location.search).get("staffGhost") === "1");

    void loadOfficialRaceData().then(({ staff, gojoLines }) => {
      if (officialDataCancelled) return;
      const nextGhostStore: GhostStore = {
        personal: ghostStoreRef.current.personal,
        staff: mergeNewestRaceRecords(ghostStoreRef.current.staff, staff) as GhostStore["staff"],
      };
      ghostStoreRef.current = nextGhostStore;
      setGhostStore(nextGhostStore);
      // Bundled Gojo lines are the released game data. They must replace any
      // stale admin recording left in this device after a data update.
      const nextGojoLines = overlayOfficialRaceRecords(gojoLineStoreRef.current, gojoLines) as GojoLineStore;
      gojoLineStoreRef.current = nextGojoLines;
      setGojoLineStore(nextGojoLines);
    });

    return () => { officialDataCancelled = true; };
  }, [persistAchievements, persistGhostStore, persistGojoLineStore]);

  useEffect(() => {
    if (!settingsLoaded) return;
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
        audioMuted, bgmVolume, seVolume, keyBindings, gamepadBindings, machineTuning, machineTuningCustom: tuningCustomMode,
      }));
      setTuningSaveFailed(false);
    } catch {
      // Keep the session's setup usable even when this browser denies storage.
      setTuningSaveFailed(true);
    }
  }, [audioMuted, bgmVolume, gamepadBindings, keyBindings, machineTuning, tuningCustomMode, seVolume, settingsLoaded]);

  useEffect(() => {
    audioController.setLevels(bgmVolume, seVolume, audioMuted);
  }, [audioController, audioMuted, bgmVolume, seVolume]);

  useEffect(() => {
    window.clearTimeout(awardCeremonyTimerRef.current);
    awardCeremonyTimerRef.current = 0;
    if (phase !== "award-ceremony") {
      setAwardCeremonyCanContinue(false);
      return;
    }
    setAwardCeremonyCanContinue(false);
    awardCeremonyTimerRef.current = window.setTimeout(() => {
      setAwardCeremonyCanContinue(true);
      awardCeremonyTimerRef.current = 0;
    }, 2000);
    return () => {
      window.clearTimeout(awardCeremonyTimerRef.current);
      awardCeremonyTimerRef.current = 0;
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "award-ceremony") return;
    const playerRank = cupStandingOrder(scores, lastOrder).indexOf(0) + 1;
    const earnedMedal = cupMedalForRank(playerRank) as CupMedal | null;
    if (!earnedMedal) return;
    const bestStorageKey = activeCupId === "basic" ? BASIC_CUP_MEDAL_STORAGE_KEY : ADVENTURE_CUP_MEDAL_STORAGE_KEY;
    const cabinetStorageKey = activeCupId === "basic" ? BASIC_CUP_MEDALS_STORAGE_KEY : ADVENTURE_CUP_MEDALS_STORAGE_KEY;
    const setBestMedal = activeCupId === "basic" ? setBestBasicCupMedal : setBestAdventureCupMedal;
    const setMedalCabinet = activeCupId === "basic" ? setBasicCupMedalCabinet : setAdventureCupMedalCabinet;
    setBestMedal((current) => {
      const strongest = strongestCupMedal(current, earnedMedal) as CupMedal;
      if (strongest === current) return current;
      try { window.localStorage.setItem(bestStorageKey, strongest); } catch { /* local persistence is optional */ }
      return strongest;
    });
    setMedalCabinet((current) => {
      if (current[earnedMedal]) return current;
      const next = recordCupMedal(current, earnedMedal) as CupMedalCabinet;
      try { window.localStorage.setItem(cabinetStorageKey, JSON.stringify(next)); } catch { /* local persistence is optional */ }
      return next;
    });
  }, [activeCupId, lastOrder, phase, scores]);

  useEffect(() => {
    const unlockFromPointer = (event: PointerEvent) => {
      void audioController.unlock().then(() => {
        if ((event.target as Element | null)?.closest("button")) audioController.play("menu");
      });
    };
    const unlockFromKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      void audioController.unlock().then(() => {
        const menuPhase = phase !== "racing" && phase !== "countdown";
        if (menuPhase && !event.repeat && ["Enter", " ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
          audioController.play("menu");
        }
      });
    };
    window.addEventListener("pointerdown", unlockFromPointer, { passive: true });
    window.addEventListener("keydown", unlockFromKey);
    return () => {
      window.removeEventListener("pointerdown", unlockFromPointer);
      window.removeEventListener("keydown", unlockFromKey);
    };
  }, [audioController, phase]);

  useEffect(() => () => audioController.dispose(), [audioController]);

  useEffect(() => {
    if (phase !== "racing" || titleReturnConfirmOpen) return;
    const resumedAt = performance.now();
    const elapsedAtResume = elapsed;
    timerStart.current = resumedAt - elapsedAtResume;
    const timer = window.setInterval(() => setElapsed(elapsedAtResume + performance.now() - resumedAt), 31);
    return () => window.clearInterval(timer);
  }, [phase, titleReturnConfirmOpen]);

  useEffect(() => {
    try {
      const scores = JSON.parse(window.localStorage.getItem(RANDOM_QUEST_SCORES_STORAGE_KEY) || "[]") as unknown;
      if (Array.isArray(scores)) setRandomQuestLeaderboard(scores.filter((score) => Number.isFinite(score)).map(Number).sort((a, b) => b - a).slice(0, 5));
    } catch { /* start with an empty quest-tour leaderboard */ }
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
        theme: normalizeCreatorTheme(parsed.theme) as CreatorTheme,
        savedAt: parsed.savedAt || Date.now(),
      };
      setSavedCreatorCourse(restored);
    } catch {
      setSavedCreatorCourse(null);
    }
  }, []);

  const clearRaceStartTimers = useCallback(() => {
    window.clearTimeout(loadingReadyTimerRef.current);
    loadingReadyTimerRef.current = 0;
    countdownTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    countdownTimersRef.current = [];
  }, []);

  useEffect(() => () => {
    clearRaceStartTimers();
    window.clearTimeout(randomQuestComboTimerRef.current);
  }, [clearRaceStartTimers]);

  const handleCourseReady = useCallback((readyRunId: number) => {
    if (pendingLoadingRunIdRef.current !== readyRunId) return;
    window.clearTimeout(loadingReadyTimerRef.current);
    const minimumPresentationMs = 700;
    const remainingPresentationMs = Math.max(0, minimumPresentationMs - (performance.now() - loadingStartedAtRef.current));
    loadingReadyTimerRef.current = window.setTimeout(() => {
      if (pendingLoadingRunIdRef.current !== readyRunId) return;
      pendingLoadingRunIdRef.current = null;
      setCountdown("3");
      setPhase("countdown");
      audioController.play("countdown");
      countdownTimersRef.current = [
        ...["2", "1", "GO!"].map((value, index) => window.setTimeout(() => {
          setCountdown(value);
          audioController.play(value === "GO!" ? "start" : "countdown");
        }, (index + 1) * 700)),
        window.setTimeout(() => setPhase("racing"), 2800),
      ];
    }, remainingPresentationMs);
  }, [audioController]);

  const resetRandomQuestRuntime = useCallback((initialPosition = 4) => {
    window.clearTimeout(randomQuestComboTimerRef.current);
    randomQuestComboTimerRef.current = 0;
    randomQuestComboRef.current = { count: 0, lastSuccessAt: 0 };
    setRandomQuestComboDisplay(null);
    const next = { ...emptyRandomQuestRuntime(), lastPosition: initialPosition };
    randomQuestRuntimeRef.current = next;
    setRandomQuestRuntime(next);
  }, []);

  const beginRace = useCallback((fieldSize = 4) => {
    clearRaceStartTimers();
    const nextRunId = runIdRef.current + 1;
    runIdRef.current = nextRunId;
    pendingLoadingRunIdRef.current = nextRunId;
    loadingStartedAtRef.current = performance.now();
    setRunId(nextRunId);
    setActiveMachineTuning(normalizeMachineTuning(machineTuning));
    setSpeed(0);
    setPosition(fieldSize);
    setProgress(0);
    setElapsed(0);
    setItem("EMPTY");
    setItemLevel(0);
    setShieldActive(false);
    setShieldLevel(0);
    setDriftGauge(0);
    setDriftDashing(false);
    const initialSkillCooldown = skillCooldownFor(CHARACTERS[selectedCharacterIndex]);
    setSkillRemaining(initialSkillCooldown);
    setSkillCooldown(initialSkillCooldown);
    setSkillActive(false);
    setSkillActionProgress(0);
    setSkillActionLabel("");
    if (randomQuestActive) resetRandomQuestRuntime(fieldSize);
    setCountdown("3");
    setPhase("loading");
    // Keep the browser's audio permission tied to the user's start action,
    // but wait to play the countdown until the 3D scene reports ready.
    void audioController.unlock();
  }, [audioController, clearRaceStartTimers, machineTuning, randomQuestActive, resetRandomQuestRuntime, selectedCharacterIndex]);

  const startSelectedCup = useCallback(() => {
    setRunMode("race");
    setUltimateGojoActive(false);
    setEvolutionTourActive(false);
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
    if (characterSelectSource === "cup" || characterSelectSource === "random-quest") {
      setPhase("race-briefing");
      return;
    }
    if (characterSelectSource === "ultimate-gojo") {
      setPhase("race-briefing");
      return;
    }
    const creatorFieldSize = creatorGojoMode === "duel" ? 2 : creatorGojoMode === "field" ? 5 : 4;
    beginRace(characterSelectSource === "creator" ? creatorFieldSize : characterSelectSource === "time-trial" || characterSelectSource === "staff-record" ? 1 : 4);
  }, [beginRace, characterSelectSource, creatorGojoMode]);

  const confirmRaceBriefing = useCallback(() => beginRace(4), [beginRace]);
  const confirmUltimateGojoBriefing = useCallback(() => beginRace(2), [beginRace]);
  const backFromRaceBriefing = useCallback(() => setPhase("character-select"), []);

  const openMachineTuning = useCallback(() => {
    if (characterSelectSource === "evolution" || !["character-select", "race-briefing", "gojo-intro"].includes(phase)) return;
    tuningReturnPhaseRef.current = phase;
    setPhase("tuning");
  }, [characterSelectSource, phase]);
  const closeMachineTuning = useCallback(() => setPhase(tuningReturnPhaseRef.current), []);
  const navigateMachineTuning = useCallback((direction: "left" | "right" | "up" | "down") => {
    const buttons = Array.from(tuningPanelRef.current?.querySelectorAll<HTMLButtonElement>("button[data-tuning-control]") ?? []);
    if (!buttons.length) return;
    const current = buttons.find((button) => button === document.activeElement);
    if (!current) { buttons[0].focus({ preventScroll: true }); return; }
    const source = current.getBoundingClientRect();
    const sx = source.left + source.width / 2, sy = source.top + source.height / 2;
    const horizontal = direction === "left" || direction === "right";
    const sign = direction === "left" || direction === "up" ? -1 : 1;
    let closest: HTMLButtonElement | undefined;
    let distance = Infinity;
    for (const button of buttons) {
      if (button === current) continue;
      const bounds = button.getBoundingClientRect();
      const dx = bounds.left + bounds.width / 2 - sx, dy = bounds.top + bounds.height / 2 - sy;
      const forward = (horizontal ? dx : dy) * sign;
      const cross = Math.abs(horizontal ? dy : dx);
      if (forward < 2 || (horizontal && cross > Math.max(source.height, bounds.height) * 0.75)) continue;
      const score = forward + cross * 3;
      if (score < distance) { closest = button; distance = score; }
    }
    closest?.focus({ preventScroll: true });
    // Scroll only the garage. scrollIntoView can move the hidden game-stage ancestor.
    if (closest && tuningPanelRef.current) {
      const panelBounds = tuningPanelRef.current.getBoundingClientRect();
      const targetBounds = closest.getBoundingClientRect();
      if (targetBounds.top < panelBounds.top + 12) tuningPanelRef.current.scrollTop -= panelBounds.top + 12 - targetBounds.top;
      else if (targetBounds.bottom > panelBounds.bottom - 12) tuningPanelRef.current.scrollTop += targetBounds.bottom - panelBounds.bottom + 12;
    }
  }, []);
  useEffect(() => {
    if (phase === "tuning") tuningPanelRef.current?.querySelector<HTMLButtonElement>("button[data-tuning-control]")?.focus({ preventScroll: true });
  }, [phase]);

  const backFromCharacterSelect = useCallback(() => {
    if (characterSelectSource === "creator") {
      setCreatorTestMode(false);
      setCreatorSelectedPartIndex(null);
      setPhase("course-create");
      return;
    }
    if (characterSelectSource === "evolution") {
      setPhase("evolution-intro");
      return;
    }
    if (characterSelectSource === "time-trial" || characterSelectSource === "staff-record") {
      setPhase("time-trial-select");
      return;
    }
    if (characterSelectSource === "random-quest") {
      setRandomQuestActive(false);
      setPhase("title");
      return;
    }
    if (characterSelectSource === "ultimate-gojo") {
      setPhase("ultimate-gojo-select");
      return;
    }
    setCupMenuFocus(0);
    setPhase("cup-select");
  }, [characterSelectSource]);

  const openCupSelect = useCallback(() => {
    setRunMode("race");
    setUltimateGojoActive(false);
    setCreatorTestMode(false);
    setEvolutionTourActive(false);
    setCupMenuFocus(0);
    setPhase("cup-select");
  }, []);
  const openTimeTrial = useCallback(() => {
    setRunMode("time-trial");
    setUltimateGojoActive(false);
    setCreatorTestMode(false);
    setEvolutionTourActive(false);
    setTimeTrialResult(null);
    setPhase("time-trial-select");
  }, []);
  const openUltimateGojo = useCallback(() => {
    if (!ultimateGojoUnlocked) {
      setPhase("achievements");
      return;
    }
    setRunMode("race");
    setCreatorTestMode(false);
    setEvolutionTourActive(false);
    setGojoChallenge(false);
    setUltimateGojoActive(true);
    setActiveItemsEnabled(true);
    setActiveSkillsEnabled(true);
    setPhase("ultimate-gojo-select");
  }, [ultimateGojoUnlocked]);
  const startUltimateGojoCharacterSelect = useCallback(() => {
    setRunMode("race");
    setCharacterSelectSource("ultimate-gojo");
    setGojoChallenge(false);
    setUltimateGojoActive(true);
    setActiveItemsEnabled(true);
    setActiveSkillsEnabled(true);
    setPhase("character-select");
  }, []);
  const startTimeTrialCharacterSelect = useCallback((staff = false) => {
    setRunMode(staff ? "staff-record" : "time-trial");
    setCharacterSelectSource(staff ? "staff-record" : "time-trial");
    setActiveItemsEnabled(false);
    setActiveSkillsEnabled(false);
    setTimeTrialResult(null);
    setPhase("character-select");
  }, []);
  const startGojoLineRecord = useCallback(() => {
    setRunMode("gojo-line-record");
    setSelectedCharacterIndex(0);
    setActiveItemsEnabled(false);
    setActiveSkillsEnabled(false);
    setTimeTrialResult(null);
    setLastGojoLine(null);
    beginRace(1);
  }, [beginRace]);
  const openAchievements = useCallback(() => setPhase("achievements"), []);
  const retryTimeTrial = useCallback(() => beginRace(1), [beginRace]);
  const downloadStaffGhost = useCallback(() => {
    if (!lastStaffGhost) return;
    const blob = new Blob([JSON.stringify(lastStaffGhost)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `prism-staff-${lastStaffGhost.courseId}-${Math.round(lastStaffGhost.timeMs)}.ghost.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [lastStaffGhost]);
  const downloadGojoLine = useCallback(() => {
    if (!lastGojoLine) return;
    const blob = new Blob([JSON.stringify(lastGojoLine)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `prism-gojo-line-${lastGojoLine.courseId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [lastGojoLine]);
  const openEvolutionTour = useCallback(() => {
    setCreatorTestMode(false);
    setGojoChallenge(false);
    setUltimateGojoActive(false);
    setEvolutionTourActive(true);
    setEvolutionChapterIndex(0);
    setProgress(0);
    setActiveItemsEnabled(true);
    setActiveSkillsEnabled(true);
    setPhase("evolution-runtime");
  }, []);
  const chooseEvolutionCharacter = useCallback(() => {
    setCharacterSelectSource("evolution");
    setPhase("character-select");
  }, []);
  const openCourseCreator = useCallback(() => {
    setCreatorTestMode(false);
    setRandomQuestActive(false);
    setEvolutionTourActive(false);
    setUltimateGojoActive(false);
    setCreatorSelectedPartIndex(null);
    setCreatorNotice("パーツを選ぶと接続点へ半透明で表示されます。道路を押して設置してください。");
    setPhase("course-create");
  }, []);
  const openRandomQuestTour = useCallback(() => {
    const seedArray = new Uint32Array(1);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(seedArray);
    else seedArray[0] = Date.now() >>> 0;
    const generated = generateRandomQuestTour(seedArray[0]) as RandomQuestTour;
    setRandomQuestTour(generated);
    setRandomQuestActive(true);
    setRandomQuestRoundResults([]);
    setRandomQuestFinalScore(0);
    setCourseIndex(0);
    setCreatorTestMode(false);
    setEvolutionTourActive(false);
    setUltimateGojoActive(false);
    setGojoChallenge(false);
    setRunMode("race");
    setActiveItemsEnabled(true);
    setActiveSkillsEnabled(true);
    setCharacterSelectSource("random-quest");
    setPhase("character-select");
  }, []);
  const openSettings = useCallback(() => {
    setCapturingBinding(null);
    setCapturingGamepadBinding(null);
    setGameDataResetConfirming(false);
    setSettingsMenuFocus(0);
    setPhase("settings");
  }, []);
  const closeSettings = useCallback(() => {
    setCapturingBinding(null);
    setCapturingGamepadBinding(null);
    setGameDataResetConfirming(false);
    titleMenuFocusRef.current = 7;
    setTitleMenuFocus(7);
    setPhase("title");
  }, []);
  const resetAllGameData = useCallback(() => {
    const gameStorageKeys = [
      SETTINGS_STORAGE_KEY,
      ACHIEVEMENT_STORAGE_KEY,
      GHOST_STORAGE_KEY,
      GOJO_LINE_STORAGE_KEY,
      RANDOM_QUEST_SCORES_STORAGE_KEY,
      CREATOR_STORAGE_KEY,
      RACE_FAULT_STORAGE_KEY,
      BASIC_CUP_MEDAL_STORAGE_KEY,
      BASIC_CUP_MEDALS_STORAGE_KEY,
      ADVENTURE_CUP_MEDAL_STORAGE_KEY,
      ADVENTURE_CUP_MEDALS_STORAGE_KEY,
    ];
    gameStorageKeys.forEach((key) => {
      try { window.localStorage.removeItem(key); } catch { /* continue clearing the remaining game data */ }
    });
    window.location.reload();
  }, []);
  const openTitleReturnConfirm = useCallback(() => {
    titleReturnFocusRef.current = 1;
    setTitleReturnFocus(1);
    setTitleReturnConfirmOpen(true);
  }, []);
  const closeTitleReturnConfirm = useCallback(() => {
    setTitleReturnConfirmOpen(false);
  }, []);
  const returnToTitleFromRace = useCallback(() => {
    setTitleReturnConfirmOpen(false);
    setCreatorTestMode(false);
    setGojoChallenge(false);
    setUltimateGojoActive(false);
    setEvolutionTourActive(false);
    setRandomQuestActive(false);
    setRunMode("race");
    setSpeed(0);
    titleMenuFocusRef.current = 0;
    setTitleMenuFocus(0);
    setPhase("title");
  }, []);
  const assignKeyBinding = useCallback((action: KeyAction, slot: 0 | 1, key: string) => {
    setKeyBindings((current) => {
      const next = cloneKeyBindings(current);
      if (key) {
        KEY_ACTIONS.forEach(({ id }) => {
          next[id] = next[id].map((assigned) => assigned === key ? "" : assigned) as [string, string];
        });
      }
      next[action][slot] = key;
      return next;
    });
    setCapturingBinding(null);
    setCapturingGamepadBinding(null);
  }, []);
  const assignGamepadBinding = useCallback((action: KeyAction, slot: 0 | 1, binding: GamepadBinding | null) => {
    setGamepadBindings((current) => {
      const next = cloneGamepadBindings(current);
      if (binding) {
        KEY_ACTIONS.forEach(({ id }) => {
          next[id] = next[id].map((assigned) => sameGamepadBinding(assigned, binding) ? null : assigned) as [GamepadBinding | null, GamepadBinding | null];
        });
      }
      next[action][slot] = cloneGamepadBinding(binding);
      return next;
    });
    setCapturingBinding(null);
    setCapturingGamepadBinding(null);
  }, []);
  const beginGamepadCapture = useCallback((action: KeyAction, slot: 0 | 1) => {
    setCapturingBinding(null);
    gamepadCaptureStartedAt.current = performance.now();
    setCapturingGamepadBinding({ action, slot });
  }, []);
  const resetKeyBindings = useCallback(() => {
    setCapturingBinding(null);
    setCapturingGamepadBinding(null);
    setKeyBindings(cloneKeyBindings(DEFAULT_KEY_BINDINGS));
    setGamepadBindings(cloneGamepadBindings(DEFAULT_GAMEPAD_BINDINGS));
  }, []);

  useEffect(() => {
    if (phase !== "settings" || !capturingBinding) return;
    const captureMouse = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      assignKeyBinding(capturingBinding.action, capturingBinding.slot, `mouse:${event.button}`);
    };
    window.addEventListener("mousedown", captureMouse, true);
    return () => window.removeEventListener("mousedown", captureMouse, true);
  }, [assignKeyBinding, capturingBinding, phase]);

  useEffect(() => {
    if (phase !== "settings") {
      setConnectedGamepadNames([]);
      return;
    }
    let frame = 0;
    let lastSignature = "";
    const tick = () => {
      let pads: ArrayLike<Gamepad | null> = [];
      try {
        pads = navigator.getGamepads?.() ?? [];
      } catch {
        pads = [];
      }
      const connected = Array.from(pads).filter((pad): pad is Gamepad => Boolean(pad?.connected));
      const names = connected.map((pad) => pad.id || `GAMEPAD ${pad.index + 1}`);
      const signature = names.join("|");
      if (signature !== lastSignature) {
        lastSignature = signature;
        setConnectedGamepadNames(names);
      }
      if (capturingGamepadBinding && performance.now() - gamepadCaptureStartedAt.current > 350) {
        capture: for (const pad of connected) {
          for (let index = 0; index < pad.buttons.length; index += 1) {
            const button = pad.buttons[index];
            if (button.pressed || button.value > 0.72) {
              assignGamepadBinding(capturingGamepadBinding.action, capturingGamepadBinding.slot, { kind: "button", index });
              break capture;
            }
          }
          for (let index = 0; index < pad.axes.length; index += 1) {
            const value = pad.axes[index] ?? 0;
            if (Math.abs(value) > 0.72) {
              assignGamepadBinding(capturingGamepadBinding.action, capturingGamepadBinding.slot, {
                kind: "axis",
                index,
                direction: value < 0 ? -1 : 1,
              });
              break capture;
            }
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [assignGamepadBinding, capturingGamepadBinding, phase]);
  const returnToCupSelect = useCallback(() => {
    setCreatorTestMode(false);
    setGojoChallenge(false);
    const currentCupIndex = Math.max(0, CUPS.findIndex((cup) => cup.id === activeCupId));
    setSelectedCupIndex(currentCupIndex);
    setCupMenuFocus(0);
    setPhase("cup-select");
  }, [activeCupId]);

  const nextCourse = useCallback(() => {
    if (randomQuestActive) {
      if (courseIndex < 2) {
        setCourseIndex((value) => value + 1);
        beginRace();
      } else {
        const total = randomQuestRoundResults.reduce((sum, result) => sum + result.total, 0);
        const leaderboard = insertRandomQuestScore(randomQuestLeaderboard, total);
        setRandomQuestFinalScore(total);
        setRandomQuestLeaderboard(leaderboard);
        try { window.localStorage.setItem(RANDOM_QUEST_SCORES_STORAGE_KEY, JSON.stringify(leaderboard)); } catch { /* local persistence is optional */ }
        setPhase("random-quest-complete");
      }
      return;
    }
    setCourseIndex((value) => Math.min(2, value + 1));
    beginRace();
  }, [beginRace, courseIndex, randomQuestActive, randomQuestLeaderboard, randomQuestRoundResults]);

  const nextEvolutionChapter = useCallback(() => {
    setEvolutionChapterIndex((value) => Math.min(EVOLUTION_CHAPTERS.length - 1, value + 1));
    beginRace();
  }, [beginRace]);

  const replayEvolutionTour = useCallback(() => {
    setEvolutionTourActive(true);
    setEvolutionChapterIndex(0);
    setProgress(0);
    setCharacterSelectSource("evolution");
    setPhase("evolution-intro");
  }, []);

  const startGojoChallenge = useCallback(() => {
    setGojoChallenge(true);
    beginRace(2);
  }, [beginRace]);

  const retryUltimateGojo = useCallback(() => beginRace(2), [beginRace]);
  const returnToUltimateGojoSelect = useCallback(() => {
    setGojoChallenge(false);
    setUltimateGojoActive(true);
    setPhase("ultimate-gojo-select");
  }, []);

  const showChampionshipAfterGojo = useCallback(() => {
    setGojoChallenge(false);
    const playerCupRank = cupStandingOrder(scores, lastOrder).indexOf(0) + 1;
    setPhase(playerCupRank <= 3 ? "award-ceremony" : "championship");
  }, [lastOrder, scores]);

  const continueFromAwardCeremony = useCallback(() => {
    if (!awardCeremonyCanContinue) return;
    setPhase("championship");
  }, [awardCeremonyCanContinue]);

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
    const saved = { name: creatorDefinition.name, parts: creatorParts, hazards: creatorHazards, theme: creatorTheme, savedAt: Date.now() };
    try {
      window.localStorage.setItem(CREATOR_STORAGE_KEY, JSON.stringify(saved));
      setSavedCreatorCourse(saved);
      setCreatorNotice(`${saved.name}をこの端末へ保存しました。`);
      unlockAchievement("COURSE_DESIGNER");
    } catch {
      setCreatorNotice("端末への保存に失敗しました。ブラウザの保存設定を確認してください。");
    }
  }, [creatorDefinition.name, creatorHazards, creatorParts, creatorTheme, unlockAchievement]);
  const loadCreatorCourse = useCallback(() => {
    if (!savedCreatorCourse) {
      setCreatorNotice("保存済みコースはありません。");
      return;
    }
    rememberCreatorEdit(creatorParts);
    setCreatorCourseName(savedCreatorCourse.name);
    setCreatorTheme(normalizeCreatorTheme(savedCreatorCourse.theme) as CreatorTheme);
    setCreatorParts(savedCreatorCourse.parts.slice(0, MAX_CREATOR_PARTS));
    setCreatorHazards((savedCreatorCourse.hazards ?? [])
      .map((hazard) => normalizeCreatorHazard(hazard, savedCreatorCourse.parts.length))
      .filter((hazard): hazard is CreatorHazardPlacement => Boolean(hazard))
      .slice(0, MAX_CREATOR_HAZARDS));
    setCreatorSelectedHazardId(null);
    setCreatorSelectedPartIndex(null);
    setCreatorNotice(`${savedCreatorCourse.name}を読み込みました。`);
  }, [creatorParts, rememberCreatorEdit, savedCreatorCourse]);
  const copyCreatorCourseCode = useCallback(async () => {
    if (!creatorCourseCode) {
      setCreatorNotice("現在のコースをコードに変換できませんでした。");
      return;
    }
    try {
      await navigator.clipboard.writeText(creatorCourseCode);
      setCreatorNotice(`コースコードをコピーしました（${creatorCourseCode.length}文字）。`);
    } catch {
      setCreatorCodeInput(creatorCourseCode);
      setCreatorNotice("自動コピーできなかったため、入力欄へコードを表示しました。長押ししてコピーしてください。");
    }
  }, [creatorCourseCode]);
  const importCreatorCourseCode = useCallback(() => {
    if (!creatorCodeInput.trim()) {
      setCreatorNotice("復元するコースコードを入力してください。");
      return;
    }
    try {
      const decoded = decodeCourseCode(
        creatorCodeInput,
        COURSE_PARTS.map((part) => part.id),
        CREATOR_HAZARDS,
      );
      rememberCreatorEdit(creatorParts);
      setCreatorParts(decoded.parts as CoursePartType[]);
      setCreatorHazards(decoded.hazards as CreatorHazardPlacement[]);
      setCreatorTheme(normalizeCreatorTheme(decoded.theme) as CreatorTheme);
      setCreatorSelectedHazardId(null);
      setCreatorSelectedPartIndex(null);
      setCreatorRedoStack([]);
      setCreatorCodeInput("");
      setCreatorCodeOpen(false);
      setCreatorNotice(`コースコードから${decoded.parts.length}パーツ・${decoded.hazards.length}ギミックを復元しました。`);
    } catch (error) {
      setCreatorNotice(error instanceof Error ? error.message : "コースコードを読み取れませんでした。");
    }
  }, [creatorCodeInput, creatorParts, rememberCreatorEdit]);
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

  const advanceRandomQuest = useCallback((signal: "telemetry" | "drift" | "item-level" | "shield" | "crash", payload?: { speed?: number; position?: number; level?: number }) => {
    if (!randomQuestActive || !randomQuestTour) return;
    const quests = randomQuestTour.courses[courseIndex]?.quests ?? [];
    let next = { ...randomQuestRuntimeRef.current };
    const now = performance.now();
    let activeQuest = quests[next.activeIndex];
    if (!activeQuest) return;
    if (!next.activeStartedAt) next = { ...next, activeStartedAt: now, lastTelemetryAt: now };

    if (next.activeStartedAt > 0 && now - next.activeStartedAt >= activeQuest.timeLimitMs) {
      next = {
        ...next,
        activeIndex: next.activeIndex + 1,
        value: 0,
        failed: [...next.failed, activeQuest],
        activeStartedAt: now,
        lastTelemetryAt: now,
      };
      activeQuest = quests[next.activeIndex];
      if (!activeQuest) {
        randomQuestRuntimeRef.current = next;
        setRandomQuestRuntime(next);
        return;
      }
    }

    if (signal === "telemetry") {
      const nextPosition = payload?.position ?? next.lastPosition;
      const deltaSeconds = Math.min(0.25, Math.max(0, (now - (next.lastTelemetryAt || now)) / 1000));
      if (activeQuest.kind === "speed") next.value = Math.max(next.value, payload?.speed ?? 0);
      if (activeQuest.kind === "overtake") next.value += Math.max(0, next.lastPosition - nextPosition);
      if (activeQuest.kind === "clean") next.value += deltaSeconds;
      if (activeQuest.kind === "first-hold") next.value = nextPosition === 1 ? next.value + deltaSeconds : 0;
      next.lastPosition = nextPosition;
      next.lastTelemetryAt = now;
    }
    if (signal === "drift" && activeQuest.kind === "drift") next.value += 1;
    if (signal === "item-level" && activeQuest.kind === "item-level") next.value = Math.max(next.value, payload?.level ?? 0);
    if (signal === "shield" && activeQuest.kind === "shield") next.value += 1;
    if (signal === "crash" && activeQuest.kind === "clean") {
      next.value = 0;
    }

    if (next.value >= activeQuest.target) {
      next = {
        ...next,
        activeIndex: next.activeIndex + 1,
        value: 0,
        completed: [...next.completed, activeQuest],
        activeStartedAt: now,
        lastTelemetryAt: now,
      };
    }
    randomQuestRuntimeRef.current = next;
    setRandomQuestRuntime(next);
  }, [courseIndex, randomQuestActive, randomQuestTour]);

  const awardRandomQuestAction = useCallback((label: string, basePoints: number) => {
    if (!randomQuestActive) return;
    const now = performance.now();
    const combo = advanceRandomQuestCombo({
      previousCount: randomQuestComboRef.current.count,
      lastSuccessAt: randomQuestComboRef.current.lastSuccessAt,
      now,
      basePoints,
    });
    randomQuestComboRef.current = { count: combo.count, lastSuccessAt: combo.lastSuccessAt };
    const nextRuntime = {
      ...randomQuestRuntimeRef.current,
      actionPoints: randomQuestRuntimeRef.current.actionPoints + combo.awardedPoints,
    };
    randomQuestRuntimeRef.current = nextRuntime;
    setRandomQuestRuntime(nextRuntime);
    window.clearTimeout(randomQuestComboTimerRef.current);
    if (combo.count >= 2) {
      setRandomQuestComboDisplay({
        id: ++randomQuestComboPopIdRef.current,
        count: combo.count,
        multiplier: combo.multiplier,
        awardedPoints: combo.awardedPoints,
        label,
      });
      randomQuestComboTimerRef.current = window.setTimeout(() => {
        setRandomQuestComboDisplay(null);
        randomQuestComboTimerRef.current = 0;
      }, 3000);
    } else {
      setRandomQuestComboDisplay(null);
    }
  }, [randomQuestActive]);

  const handleTelemetry = useCallback((nextSpeed: number, nextProgress: number, nextPosition: number, nextDriftGauge: number, nextDriftDashing: boolean) => {
    setSpeed(Math.round(nextSpeed));
    setProgress(clamp(nextProgress, 0, 5));
    setPosition(nextPosition);
    setDriftGauge(clamp(nextDriftGauge, 0, 1));
    setDriftDashing(nextDriftDashing);
    advanceRandomQuest("telemetry", { speed: nextSpeed, position: nextPosition });
  }, [advanceRandomQuest]);

  const handleRunEvent = useCallback((event: RaceRunEvent) => {
    if (event === "drift-turbo") {
      awardRandomQuestAction("DRIFT TURBO", 5);
      advanceRandomQuest("drift");
      return;
    }
    if (event === "item-hit") {
      awardRandomQuestAction("ITEM HIT", 15);
      return;
    }
    if (event === "crash") advanceRandomQuest("crash");
    if (event === "guardrail-clear") unlockAchievement("AIRBORNE");
    if (event === "shield-block") {
      const next = { ...achievementStoreRef.current, shieldBlocks: achievementStoreRef.current.shieldBlocks + 1 };
      persistAchievements(next);
      if (next.shieldBlocks >= 3) unlockAchievement("DEFENDER");
      advanceRandomQuest("shield");
    }
  }, [advanceRandomQuest, awardRandomQuestAction, persistAchievements, unlockAchievement]);

  const handleFinish = useCallback((payload: RaceFinishPayload) => {
    const { time, position: nextPosition, order, stats, ghostSamples, gojoLineSamples } = payload;
    setFinishTime(time);
    setFinishPosition(nextPosition);
    if (stats.driftTurbos >= 10) unlockAchievement("DRIFT_MASTER");
    if (nextPosition === 1 && runMode === "race") {
      unlockAchievement("FIRST_WIN");
      if (stats.crashCount === 0) unlockAchievement("PERFECT");
      if (stats.wasLast) unlockAchievement("COMEBACK");
    }
    if (runMode === "time-trial" || runMode === "staff-record" || runMode === "gojo-line-record") {
      const courseId = TIME_TRIAL_COURSE_IDS[timeTrialCourseIndex] ?? "city";
      if (runMode === "gojo-line-record") {
        const personalRecords = ghostStoreRef.current.personal[courseId] ?? [];
        const lineRecord: GojoLineRecord = {
          version: 1,
          courseId,
          createdAt: Date.now(),
          samples: gojoLineSamples,
        };
        setLastGojoLine(lineRecord);
        persistGojoLineStore({ ...gojoLineStoreRef.current, [courseId]: lineRecord });
        setTimeTrialResult({
          time,
          personalBest: personalRecords[0]?.timeMs ?? 0,
          personalTimes: personalRecords.map((entry) => entry.timeMs),
          resultRank: null,
          isNewBest: false,
          staffTime: ghostStoreRef.current.staff[courseId]?.timeMs,
        });
        setElapsed(time);
        setSpeed(0);
        setPhase("time-trial-finished");
        return;
      }
      const record: GhostRecord = {
        version: 1,
        courseId,
        character: (CHARACTERS[selectedCharacterIndex] ?? CHARACTERS[0]).name,
        timeMs: time,
        createdAt: Date.now(),
        kind: runMode === "staff-record" ? "staff" : "personal",
        samples: ghostSamples,
      };
      if (runMode === "staff-record") {
        const personalRecords = ghostStoreRef.current.personal[courseId] ?? [];
        setLastStaffGhost(record);
        const next = { ...ghostStoreRef.current, staff: { ...ghostStoreRef.current.staff, [courseId]: record } };
        persistGhostStore(next);
        setTimeTrialResult({
          time,
          personalBest: personalRecords[0]?.timeMs ?? 0,
          personalTimes: personalRecords.map((entry) => entry.timeMs),
          resultRank: null,
          isNewBest: false,
          staffTime: time,
        });
      } else {
        const previous = ghostStoreRef.current.personal[courseId] ?? [];
        const ranked = insertPersonalGhostRecord(previous, record) as { records: GhostRecord[]; rank: number | null };
        if (ranked.rank !== null) {
          persistGhostStore({ ...ghostStoreRef.current, personal: { ...ghostStoreRef.current.personal, [courseId]: ranked.records } });
        }
        setTimeTrialResult({
          time,
          personalBest: ranked.records[0]?.timeMs ?? 0,
          personalTimes: ranked.records.map((entry) => entry.timeMs),
          resultRank: ranked.rank,
          isNewBest: ranked.rank === 1,
          staffTime: ghostStoreRef.current.staff[courseId]?.timeMs,
        });
      }
      setElapsed(time);
      setSpeed(0);
      setPhase("time-trial-finished");
      return;
    }
    if (randomQuestActive) {
      const runtime = randomQuestRuntimeRef.current;
      const questPoints = runtime.completed.reduce((sum, quest) => sum + quest.reward, 0);
      const score = randomQuestRoundScore({
        position: nextPosition,
        questPoints,
        actionPoints: runtime.actionPoints,
        completedCount: runtime.completed.length,
        noCrash: stats.crashCount === 0,
      });
      const result: RandomQuestRoundResult = {
        courseIndex,
        position: nextPosition,
        cleared: runtime.completed.length,
        failed: runtime.failed.length,
        ...score,
      };
      setRandomQuestRoundResults((current) => [...current.filter((entry) => entry.courseIndex !== courseIndex), result].sort((a, b) => a.courseIndex - b.courseIndex));
      setLastOrder(order);
      setElapsed(time);
      setSpeed(0);
      setPhase("finished");
      return;
    }
    if (evolutionTourActive) {
      setLastOrder(order);
      setElapsed(time);
      setSpeed(0);
      setPhase(evolutionChapterIndex >= EVOLUTION_CHAPTERS.length - 1 ? "evolution-complete" : "evolution-finished");
      return;
    }
    if (creatorTestMode) {
      setElapsed(time);
      setSpeed(0);
      setPhase("creator-finished");
      return;
    }
    if (ultimateGojoActive) {
      setElapsed(time);
      setSpeed(0);
      setPhase("ultimate-gojo-finished");
      return;
    }
    if (gojoChallenge) {
      setElapsed(time);
      setSpeed(0);
      setPhase("gojo-finished");
      if (nextPosition === 1) unlockAchievement("GOJO_DEFEATED");
      return;
    }
    setLastOrder(order);
    const nextScores = [...scores];
    order.forEach((actorId, rank) => { nextScores[actorId] += RACE_POINTS[rank] ?? 0; });
    setScores(nextScores);
    const nextPlacements = [...cupPlacements, nextPosition];
    setCupPlacements(nextPlacements);
    setElapsed(time);
    setSpeed(0);
    const perfectCup = courseIndex === 2 && nextPlacements.length === 3 && nextPlacements.every((placement) => placement === 1);
    if (perfectCup) unlockAchievement("CUP_MASTER");
    const playerCupRank = cupStandingOrder(nextScores, order).indexOf(0) + 1;
    const cupAwardEarned = playerCupRank <= 3;
    setPhase(courseIndex === 2
      ? (perfectCup ? "gojo-intro" : cupAwardEarned ? "award-ceremony" : "championship")
      : "finished");
  }, [activeCupId, courseIndex, creatorTestMode, cupPlacements, evolutionChapterIndex, evolutionTourActive, gojoChallenge, randomQuestActive, scores, ultimateGojoActive, persistGhostStore, persistGojoLineStore, runMode, selectedCharacterIndex, timeTrialCourseIndex, unlockAchievement]);

  const handleItemChange = useCallback((nextItem: ItemType, nextLevel: ItemLevel) => {
    setItem(nextItem);
    setItemLevel(nextLevel);
    advanceRandomQuest("item-level", { level: nextLevel });
  }, [advanceRandomQuest]);
  const handleShieldChange = useCallback((active: boolean, nextLevel: ItemLevel) => {
    setShieldActive(active);
    setShieldLevel(active ? nextLevel : 0);
  }, []);
  const handleSkillChange = useCallback((remainingMs: number, totalMs: number, active: boolean, actionProgress: number, actionLabel: string) => {
    setSkillRemaining(remainingMs);
    setSkillCooldown(totalMs);
    setSkillActive(active);
    setSkillActionProgress(actionProgress);
    setSkillActionLabel(actionLabel);
  }, []);

  useEffect(() => {
    const handleMenuKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const normalizedKey = normalizeBindingKey(event.key);
      const inputAliases = Array.from(new Set([
        normalizedKey,
        normalizeBindingCode(event.code),
      ].filter(Boolean)));
      const pauseActionPressed = inputAliases.some((alias) => keyBindings.pause.includes(alias));
      const target = event.target as HTMLElement | null;
      const editingText = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if (["character-select", "race-briefing", "gojo-intro"].includes(phase) && (key === "enter" || key === " ")) {
        if (event.repeat) { event.preventDefault(); return; }
        if (target?.closest(".tuning-open-button")) { event.preventDefault(); openMachineTuning(); return; }
      }
      if (phase === "settings" && capturingBinding) {
        event.preventDefault();
        if (key === "escape" && capturingBinding.action !== "pause") setCapturingBinding(null);
        else if (key === "backspace" || key === "delete") assignKeyBinding(capturingBinding.action, capturingBinding.slot, "");
        else assignKeyBinding(capturingBinding.action, capturingBinding.slot, normalizedKey);
        return;
      }
      if (phase === "settings" && capturingGamepadBinding) {
        if (key === "escape") {
          event.preventDefault();
          setCapturingGamepadBinding(null);
        } else if (key === "backspace" || key === "delete") {
          event.preventDefault();
          assignGamepadBinding(capturingGamepadBinding.action, capturingGamepadBinding.slot, null);
        }
        return;
      }
      if (titleReturnConfirmOpen) {
        event.preventDefault();
        if (key === "arrowleft" || key === "arrowup" || key === "a" || key === "w") {
          titleReturnFocusRef.current = 0;
          setTitleReturnFocus(0);
        } else if (key === "arrowright" || key === "arrowdown" || key === "d" || key === "s") {
          titleReturnFocusRef.current = 1;
          setTitleReturnFocus(1);
        } else if (key === "enter" || key === " ") {
          if (titleReturnFocusRef.current === 0) returnToTitleFromRace();
          else closeTitleReturnConfirm();
        } else if (key === "escape" || key === "backspace" || pauseActionPressed) {
          closeTitleReturnConfirm();
        }
        return;
      }
      if (phase === "racing" && pauseActionPressed && !event.repeat) {
        event.preventDefault();
        openTitleReturnConfirm();
        return;
      }
      if (phase === "title") {
        if (key === "arrowup" || key === "arrowdown" || key === "w" || key === "s") {
          event.preventDefault();
          const direction = key === "arrowup" || key === "w" ? -1 : 1;
          const nextFocus = clamp(titleMenuFocusRef.current + direction, 0, 7);
          titleMenuFocusRef.current = nextFocus;
          setTitleMenuFocus(nextFocus);
        } else if (key === "c") {
          event.preventDefault();
          openCourseCreator();
        } else if (key === "v") {
          event.preventDefault();
          openEvolutionTour();
        } else if (key === "r") {
          event.preventDefault();
          openRandomQuestTour();
        } else if (key === "o") {
          event.preventDefault();
          openSettings();
        } else if (key === "enter" || key === " ") {
          event.preventDefault();
          if (titleMenuFocusRef.current === 0) openCupSelect();
          else if (titleMenuFocusRef.current === 1) openTimeTrial();
          else if (titleMenuFocusRef.current === 2) openRandomQuestTour();
          else if (titleMenuFocusRef.current === 3) openEvolutionTour();
          else if (titleMenuFocusRef.current === 4) openCourseCreator();
          else if (titleMenuFocusRef.current === 5) openAchievements();
          else if (titleMenuFocusRef.current === 6) openUltimateGojo();
          else openSettings();
        }
      } else if (phase === "time-trial-select") {
        if (key === "arrowleft" || key === "arrowup" || key === "a" || key === "w") {
          event.preventDefault(); setTimeTrialCourseIndex((value) => (value + TIME_TRIAL_COURSE_IDS.length - 1) % TIME_TRIAL_COURSE_IDS.length);
        } else if (key === "arrowright" || key === "arrowdown" || key === "d" || key === "s") {
          event.preventDefault(); setTimeTrialCourseIndex((value) => (value + 1) % TIME_TRIAL_COURSE_IDS.length);
        } else if (key === "enter" || key === " ") {
          event.preventDefault(); startTimeTrialCharacterSelect(false);
        } else if (key === "escape" || key === "backspace") setPhase("title");
      } else if (phase === "ultimate-gojo-select") {
        if (key === "arrowleft" || key === "arrowup" || key === "a" || key === "w") {
          event.preventDefault(); setUltimateGojoCourseIndex((value) => (value + TIME_TRIAL_COURSE_IDS.length - 1) % TIME_TRIAL_COURSE_IDS.length);
        } else if (key === "arrowright" || key === "arrowdown" || key === "d" || key === "s") {
          event.preventDefault(); setUltimateGojoCourseIndex((value) => (value + 1) % TIME_TRIAL_COURSE_IDS.length);
        } else if (key === "enter" || key === " ") {
          event.preventDefault(); startUltimateGojoCharacterSelect();
        } else if (key === "escape" || key === "backspace") {
          setUltimateGojoActive(false); setPhase("title");
        }
      } else if (phase === "achievements") {
        if (key === "escape" || key === "backspace" || key === "enter" || key === " ") { event.preventDefault(); setPhase("title"); }
      } else if (phase === "settings") {
        if (key === "arrowup" || key === "w") {
          event.preventDefault();
          setSettingsMenuFocus((value) => Math.max(0, value - 1));
        } else if (key === "arrowdown" || key === "s") {
          event.preventDefault();
          setSettingsMenuFocus((value) => Math.min(2, value + 1));
        } else if (key === "arrowleft" || key === "a") {
          event.preventDefault();
          if (settingsMenuFocus === 0) setAudioMuted((value) => !value);
          if (settingsMenuFocus === 1) setBgmVolume((value) => clamp(value - 0.05, 0, 1));
          if (settingsMenuFocus === 2) setSeVolume((value) => clamp(value - 0.05, 0, 1));
        } else if (key === "arrowright" || key === "d") {
          event.preventDefault();
          if (settingsMenuFocus === 0) setAudioMuted((value) => !value);
          if (settingsMenuFocus === 1) setBgmVolume((value) => clamp(value + 0.05, 0, 1));
          if (settingsMenuFocus === 2) setSeVolume((value) => clamp(value + 0.05, 0, 1));
        } else if (key === "enter" || key === " ") {
          event.preventDefault();
          if (settingsMenuFocus === 0) setAudioMuted((value) => !value);
        } else if (key === "escape" || key === "backspace") {
          event.preventDefault();
          closeSettings();
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
      } else if (phase === "tuning") {
        const direction = ({ arrowleft: "left", a: "left", arrowright: "right", d: "right", arrowup: "up", w: "up", arrowdown: "down", s: "down" } as Record<string, "left" | "right" | "up" | "down">)[key];
        if (direction) { event.preventDefault(); navigateMachineTuning(direction); }
        else if (key === "enter" || key === " ") {
          event.preventDefault();
          if (!event.repeat) tuningPanelRef.current?.querySelector<HTMLButtonElement>("button[data-tuning-control]:focus")?.click();
        } else if (key === "escape" || key === "backspace") { event.preventDefault(); closeMachineTuning(); }
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
        } else if (key === "t" || key === "arrowup") {
          event.preventDefault(); openMachineTuning();
        } else if (key === "escape" || key === "backspace") {
          backFromCharacterSelect();
        }
      } else if (phase === "race-briefing") {
        if (key === "enter" || key === " ") {
          event.preventDefault();
          if (characterSelectSource === "ultimate-gojo") confirmUltimateGojoBriefing();
          else confirmRaceBriefing();
        } else if (key === "t" || key === "arrowup") {
          event.preventDefault(); openMachineTuning();
        } else if (key === "escape" || key === "backspace") {
          event.preventDefault();
          backFromRaceBriefing();
        }
      } else if (phase === "evolution-intro") {
        if (key === "enter" || key === " ") {
          event.preventDefault();
          chooseEvolutionCharacter();
        } else if (key === "escape" || key === "backspace") {
          setEvolutionTourActive(false);
          setPhase("title");
        }
      } else if (phase === "evolution-finished") {
        if (key === "enter" || key === " ") {
          event.preventDefault(); nextEvolutionChapter();
        } else if (key === "escape" || key === "backspace") returnToTitleFromRace();
      } else if (phase === "evolution-complete") {
        if (key === "enter" || key === " ") {
          event.preventDefault(); replayEvolutionTour();
        } else if (key === "escape" || key === "backspace") returnToTitleFromRace();
      } else if (phase === "finished") {
        if (key === "enter" || key === " ") {
          event.preventDefault(); nextCourse();
        } else if (key === "escape" || key === "backspace") returnToTitleFromRace();
      } else if (phase === "random-quest-complete") {
        if (key === "enter" || key === " ") {
          event.preventDefault();
          openRandomQuestTour();
        } else if (key === "escape" || key === "backspace") returnToTitleFromRace();
      } else if (phase === "gojo-intro") {
        if (key === "t" || key === "arrowup") { event.preventDefault(); openMachineTuning(); return; }
        if (key === "enter" || key === " ") {
          event.preventDefault(); startGojoChallenge();
        } else if (key === "escape" || key === "backspace") showChampionshipAfterGojo();
      } else if (phase === "gojo-finished") {
        if (key === "enter" || key === " ") {
          event.preventDefault(); showChampionshipAfterGojo();
        } else if (key === "escape" || key === "backspace") showChampionshipAfterGojo();
      } else if (phase === "ultimate-gojo-finished" && (key === "enter" || key === " ")) {
        event.preventDefault();
        retryUltimateGojo();
      } else if (phase === "ultimate-gojo-finished" && (key === "escape" || key === "backspace")) {
        event.preventDefault();
        returnToUltimateGojoSelect();
      } else if (phase === "award-ceremony") {
        if (key === "enter" || key === " ") {
          event.preventDefault(); continueFromAwardCeremony();
        } else if (key === "escape" || key === "backspace") setPhase("championship");
      } else if (phase === "championship") {
        if (key === "enter" || key === " " || key === "escape" || key === "backspace") {
          event.preventDefault(); returnToCupSelect();
        }
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
      } else if (phase === "creator-finished") {
        if (key === "enter" || key === " " || key === "escape" || key === "backspace") {
          event.preventDefault(); returnToCreator();
        }
      } else if (phase === "time-trial-finished") {
        if (key === "enter" || key === " ") {
          event.preventDefault(); retryTimeTrial();
        } else if (key === "escape" || key === "backspace") openTimeTrial();
      }
    };
    window.addEventListener("keydown", handleMenuKey, { passive: false });
    return () => window.removeEventListener("keydown", handleMenuKey);
}, [addCreatorHazard, addCreatorPart, assignGamepadBinding, assignKeyBinding, backFromCharacterSelect, closeMachineTuning, navigateMachineTuning, openMachineTuning, backFromRaceBriefing, capturingBinding, capturingGamepadBinding, characterSelectSource, chooseEvolutionCharacter, closeSettings, closeTitleReturnConfirm, confirmRaceBriefing, confirmUltimateGojoBriefing, continueFromAwardCeremony, creatorEditMode, creatorParts.length, cupMenuFocus, deleteCreatorHazard, keyBindings.pause, nextCourse, nextEvolutionChapter, openAchievements, openCourseCreator, openCupSelect, openEvolutionTour, openSettings, openTimeTrial, openUltimateGojo, openTitleReturnConfirm, phase, redoCreatorPart, replayEvolutionTour, retryTimeTrial, retryUltimateGojo, returnToCreator, returnToCupSelect, returnToTitleFromRace, returnToUltimateGojoSelect, selectCreatorHazardOffset, selectCreatorPartOffset, settingsMenuFocus, showChampionshipAfterGojo, startGojoChallenge, startSelectedCharacter, startSelectedCup, startTimeTrialCharacterSelect, startUltimateGojoCharacterSelect, titleReturnConfirmOpen, undoCreatorPart]);

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
      const configuredPressed = (binding: GamepadBinding | null) => {
        if (!pad || !binding) return false;
        if (binding.kind === "button") return pressed(binding.index);
        return (pad.axes[binding.index] ?? 0) * binding.direction > 0.55;
      };
      const pausePressed = gamepadBindings.pause.some(configuredPressed);
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
        pause: pausePressed,
      };
      const previous = menuPadHeld.current;
      const menuInputStarted = (current.left && !previous.left) || (current.right && !previous.right)
        || (current.up && !previous.up) || (current.down && !previous.down)
        || (current.confirm && !previous.confirm) || (current.back && !previous.back);
      if (menuInputStarted && phase !== "racing" && phase !== "countdown") {
        void audioController.unlock().then(() => audioController.play("menu"));
      }
      if (titleReturnConfirmOpen) {
        if ((current.left && !previous.left) || (current.up && !previous.up)) {
          titleReturnFocusRef.current = 0;
          setTitleReturnFocus(0);
        }
        if ((current.right && !previous.right) || (current.down && !previous.down)) {
          titleReturnFocusRef.current = 1;
          setTitleReturnFocus(1);
        }
        if (current.confirm && !previous.confirm) {
          if (titleReturnFocusRef.current === 0) returnToTitleFromRace();
          else closeTitleReturnConfirm();
        }
        if ((current.back && !previous.back) || (current.pause && !previous.pause)) closeTitleReturnConfirm();
      } else if (phase === "racing" && current.pause && !previous.pause) {
        openTitleReturnConfirm();
      } else if (phase === "title") {
        if (current.up && !previous.up) {
          const nextFocus = Math.max(0, titleMenuFocusRef.current - 1);
          titleMenuFocusRef.current = nextFocus;
          setTitleMenuFocus(nextFocus);
        }
        if (current.down && !previous.down) {
          const nextFocus = Math.min(7, titleMenuFocusRef.current + 1);
          titleMenuFocusRef.current = nextFocus;
          setTitleMenuFocus(nextFocus);
        }
        if (current.confirm && !previous.confirm) {
          if (titleMenuFocusRef.current === 0) openCupSelect();
          else if (titleMenuFocusRef.current === 1) openTimeTrial();
          else if (titleMenuFocusRef.current === 2) openRandomQuestTour();
          else if (titleMenuFocusRef.current === 3) openEvolutionTour();
          else if (titleMenuFocusRef.current === 4) openCourseCreator();
          else if (titleMenuFocusRef.current === 5) openAchievements();
          else if (titleMenuFocusRef.current === 6) openUltimateGojo();
          else openSettings();
        }
      } else if (phase === "time-trial-select") {
        if ((current.left && !previous.left) || (current.up && !previous.up)) setTimeTrialCourseIndex((value) => (value + TIME_TRIAL_COURSE_IDS.length - 1) % TIME_TRIAL_COURSE_IDS.length);
        if ((current.right && !previous.right) || (current.down && !previous.down)) setTimeTrialCourseIndex((value) => (value + 1) % TIME_TRIAL_COURSE_IDS.length);
        if (current.confirm && !previous.confirm) startTimeTrialCharacterSelect(false);
        if (current.back && !previous.back) setPhase("title");
      } else if (phase === "ultimate-gojo-select") {
        if ((current.left && !previous.left) || (current.up && !previous.up)) setUltimateGojoCourseIndex((value) => (value + TIME_TRIAL_COURSE_IDS.length - 1) % TIME_TRIAL_COURSE_IDS.length);
        if ((current.right && !previous.right) || (current.down && !previous.down)) setUltimateGojoCourseIndex((value) => (value + 1) % TIME_TRIAL_COURSE_IDS.length);
        if (current.confirm && !previous.confirm) startUltimateGojoCharacterSelect();
        if (current.back && !previous.back) { setUltimateGojoActive(false); setPhase("title"); }
      } else if (phase === "achievements") {
        if ((current.back && !previous.back) || (current.confirm && !previous.confirm)) setPhase("title");
      } else if (phase === "settings" && !capturingGamepadBinding) {
        if (current.up && !previous.up) setSettingsMenuFocus((value) => Math.max(0, value - 1));
        if (current.down && !previous.down) setSettingsMenuFocus((value) => Math.min(2, value + 1));
        if (current.left && !previous.left) {
          if (settingsMenuFocus === 0) setAudioMuted((value) => !value);
          if (settingsMenuFocus === 1) setBgmVolume((value) => clamp(value - 0.05, 0, 1));
          if (settingsMenuFocus === 2) setSeVolume((value) => clamp(value - 0.05, 0, 1));
        }
        if (current.right && !previous.right) {
          if (settingsMenuFocus === 0) setAudioMuted((value) => !value);
          if (settingsMenuFocus === 1) setBgmVolume((value) => clamp(value + 0.05, 0, 1));
          if (settingsMenuFocus === 2) setSeVolume((value) => clamp(value + 0.05, 0, 1));
        }
        if (current.confirm && !previous.confirm) {
          if (settingsMenuFocus === 0) setAudioMuted((value) => !value);
        }
        if (current.back && !previous.back) closeSettings();
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
      } else if (phase === "tuning") {
        if (current.left && !previous.left) navigateMachineTuning("left");
        if (current.right && !previous.right) navigateMachineTuning("right");
        if (current.up && !previous.up) navigateMachineTuning("up");
        if (current.down && !previous.down) navigateMachineTuning("down");
        if (current.confirm && !previous.confirm) tuningPanelRef.current?.querySelector<HTMLButtonElement>("button[data-tuning-control]:focus")?.click();
        if (current.back && !previous.back) closeMachineTuning();
      } else if (phase === "character-select") {
        if (current.left && !previous.left) setSelectedCharacterIndex((value) => (value + CHARACTERS.length - 1) % CHARACTERS.length);
        if (current.right && !previous.right) setSelectedCharacterIndex((value) => (value + 1) % CHARACTERS.length);
        if (current.confirm && !previous.confirm) startSelectedCharacter();
        if (current.back && !previous.back) backFromCharacterSelect();
        if (current.up && !previous.up) openMachineTuning();
      } else if (phase === "race-briefing") {
        if (current.confirm && !previous.confirm) {
          if (characterSelectSource === "ultimate-gojo") confirmUltimateGojoBriefing();
          else confirmRaceBriefing();
        }
        if (current.back && !previous.back) backFromRaceBriefing();
        if (current.up && !previous.up) openMachineTuning();
      } else if (phase === "evolution-intro") {
        if (current.confirm && !previous.confirm) chooseEvolutionCharacter();
        if (current.back && !previous.back) {
          setEvolutionTourActive(false);
          setPhase("title");
        }
      } else if (phase === "evolution-finished") {
        if (current.confirm && !previous.confirm) nextEvolutionChapter();
        if (current.back && !previous.back) returnToTitleFromRace();
      } else if (phase === "evolution-complete") {
        if (current.confirm && !previous.confirm) replayEvolutionTour();
        if (current.back && !previous.back) returnToTitleFromRace();
      } else if (phase === "finished") {
        if (current.confirm && !previous.confirm) nextCourse();
        if (current.back && !previous.back) returnToTitleFromRace();
      } else if (phase === "random-quest-complete") {
        if (current.confirm && !previous.confirm) openRandomQuestTour();
        if (current.back && !previous.back) returnToTitleFromRace();
      } else if (phase === "gojo-intro") {
        if (current.up && !previous.up) openMachineTuning();
        if (current.confirm && !previous.confirm) startGojoChallenge();
        if (current.back && !previous.back) showChampionshipAfterGojo();
      } else if (phase === "gojo-finished") {
        if ((current.confirm && !previous.confirm) || (current.back && !previous.back)) showChampionshipAfterGojo();
      } else if (phase === "ultimate-gojo-finished") {
        if (current.confirm && !previous.confirm) retryUltimateGojo();
        if (current.back && !previous.back) returnToUltimateGojoSelect();
      } else if (phase === "award-ceremony") {
        if (current.confirm && !previous.confirm) continueFromAwardCeremony();
        if (current.back && !previous.back) setPhase("championship");
      } else if (phase === "championship") {
        if ((current.confirm && !previous.confirm) || (current.back && !previous.back)) returnToCupSelect();
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
        if (current.pause && !previous.pause) setPhase("title");
      } else if (phase === "creator-finished") {
        if ((current.confirm && !previous.confirm) || (current.back && !previous.back)) returnToCreator();
      } else if (phase === "time-trial-finished") {
        if (current.confirm && !previous.confirm) retryTimeTrial();
        if (current.back && !previous.back) openTimeTrial();
      }
      menuPadHeld.current = current;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [addCreatorHazard, addCreatorPart, audioController, backFromCharacterSelect, closeMachineTuning, navigateMachineTuning, openMachineTuning, backFromRaceBriefing, capturingGamepadBinding, characterSelectSource, chooseEvolutionCharacter, closeSettings, closeTitleReturnConfirm, confirmRaceBriefing, confirmUltimateGojoBriefing, continueFromAwardCeremony, creatorEditMode, creatorParts.length, cupMenuFocus, deleteCreatorHazard, gamepadBindings.pause, nextCourse, nextEvolutionChapter, openAchievements, openCourseCreator, openCupSelect, openEvolutionTour, openSettings, openTimeTrial, openUltimateGojo, openTitleReturnConfirm, phase, redoCreatorPart, replayEvolutionTour, retryTimeTrial, retryUltimateGojo, returnToCreator, returnToCupSelect, returnToTitleFromRace, returnToUltimateGojoSelect, selectCreatorHazardOffset, selectCreatorPartOffset, settingsMenuFocus, showChampionshipAfterGojo, startGojoChallenge, startSelectedCharacter, startSelectedCup, startTimeTrialCharacterSelect, startUltimateGojoCharacterSelect, titleReturnConfirmOpen, undoCreatorPart]);

  const selectedCharacter = CHARACTERS[selectedCharacterIndex] ?? CHARACTERS[0];
  const championshipRoster = [selectedCharacter, ...CHARACTERS.filter((_, index) => index !== selectedCharacterIndex)];
  const timeTrialActive = runMode === "time-trial" || runMode === "staff-record" || runMode === "gojo-line-record";
  const creatorGojoDuel = creatorTestMode && creatorGojoMode === "duel";
  const creatorGojoField = creatorTestMode && creatorGojoMode === "field";
  const raceRoster = timeTrialActive
    ? [selectedCharacter]
    : gojoChallenge || ultimateGojoActive || creatorGojoDuel
    ? [selectedCharacter, GOJO_CHARACTER]
    : creatorGojoField
      ? [...championshipRoster, GOJO_CHARACTER]
      : championshipRoster;
  const evolutionMilestone = evolutionMilestoneAt(evolutionChapterIndex, progress);
  const evolutionChapter = evolutionMilestone.chapter;
  const evolutionFeatures = evolutionTourActive
    ? evolutionFeatureState(evolutionMilestone.stage)
    : { items: true, drift: true, skills: true };
  const displayItemsEnabled = activeItemsEnabled && evolutionFeatures.items;
  const displaySkillsEnabled = activeSkillsEnabled && evolutionFeatures.skills;
  const itemLabel = displayItemsEnabled ? ITEM_LABELS[item] : { icon: "×", name: evolutionTourActive ? "NOT INVENTED YET" : "ITEMS OFF" };
  const itemDisplayName = displayItemsEnabled && item !== "EMPTY" && item !== "NOVA"
    ? `${itemLabel.name} · LV.${itemLevel}`
    : itemLabel.name;
  const activeCup = CUPS.find((cup) => cup.id === activeCupId) ?? CUPS[0];
  const bestCupMedals: Record<CupId, CupMedal | null> = {
    basic: bestBasicCupMedal,
    adventure: bestAdventureCupMedal,
  };
  const cupMedalCabinets: Record<CupId, CupMedalCabinet> = {
    basic: basicCupMedalCabinet,
    adventure: adventureCupMedalCabinet,
  };
  const cupCourses = activeCup.courseIds.map(courseById);
  const cupCourseDefinition = cupCourses[courseIndex] ?? cupCourses[0];
  const randomQuestCourse = randomQuestTour?.courses[courseIndex] ?? null;
  const randomQuestDefinition = useMemo(
    () => randomQuestCourse ? buildCreatorCourseDefinition(randomQuestCourse.name, randomQuestCourse.parts, randomQuestCourse.theme) : null,
    [randomQuestCourse],
  );
  const courseDefinition = timeTrialActive
    ? courseById(TIME_TRIAL_COURSE_IDS[timeTrialCourseIndex] ?? "city")
    : ultimateGojoActive
    ? courseById(TIME_TRIAL_COURSE_IDS[ultimateGojoCourseIndex] ?? "city")
    : randomQuestActive && randomQuestDefinition
    ? randomQuestDefinition
    : evolutionTourActive
    ? courseById(EVOLUTION_CHAPTERS[evolutionChapterIndex]?.courseId ?? "city")
    : creatorTestMode && creatorTestDefinition
    ? creatorTestDefinition
    : phase === "course-create"
      ? creatorDefinition
      : cupCourseDefinition;
  const activeCreatorParts = randomQuestActive && randomQuestCourse ? randomQuestCourse.parts : creatorParts;
  const activeCreatorHazards = randomQuestActive && randomQuestCourse ? randomQuestCourse.hazards : creatorTestHazards;
  const activeGhostRecords = useMemo(
    () => timeTrialActive && runMode === "time-trial"
      ? [ghostStore.personal[courseDefinition.id]?.[0], ghostStore.staff[courseDefinition.id]].filter((entry): entry is GhostRecord => Boolean(entry))
      : [],
    [courseDefinition.id, ghostStore.personal, ghostStore.staff, runMode, timeTrialActive],
  );
  const courseLapCount = lapCountForCourse(courseDefinition.id);
  const currentLap = Math.min(courseLapCount, Math.floor(Math.max(0, progress)) + 1);
  const creatorHeights = creatorDefinition.rawPoints.map((point) => point[1]);
  const creatorHeightRange = Math.round(Math.max(...creatorHeights) - Math.min(...creatorHeights));
  const creatorPlacementValid = creatorEditMode === "road" && creatorParts.length < MAX_CREATOR_PARTS;
  const selectedCreatorHazard = creatorHazards.find((hazard) => hazard.id === creatorSelectedHazardId) ?? null;
  const creatorFocusPartIndex = selectedCreatorHazard?.partIndex ?? creatorSelectedPartIndex;
  const racerNames = raceRoster.map((racer) => racer.name);
  const championshipRacerNames = championshipRoster.map((racer) => racer.name);
  const skillReady = displaySkillsEnabled && skillRemaining <= 0;
  const skillCharge = displaySkillsEnabled ? (skillCooldown > 0 ? clamp(1 - skillRemaining / skillCooldown, 0, 1) : 1) : 0;
  const skillMeterCharge = skillActive ? skillActionProgress : skillCharge;
  const giantLeapAngleDegrees = Math.round(skillActionProgress * GIANT_LEAP_MAX_ANGLE);
  const championshipOrder = cupStandingOrder(scores, lastOrder);
  const playerCupRank = championshipOrder.indexOf(0) + 1;
  const currentCupMedal = cupMedalForRank(playerCupRank) as CupMedal | null;
  const awardPodiumOrder = [championshipOrder[1], championshipOrder[0], championshipOrder[2]];
  const raceResultRows = lastOrder.map((actorId, rank) => ({ actorId, rank: rank + 1, points: RACE_POINTS[rank] }));
  const raceFieldSize = raceRoster.length;
  const creatorGojoLabel = creatorGojoMode === "duel" ? "1 VS 1" : creatorGojoMode === "field" ? "5 RACERS" : "OFF";
  const creatorRaceActive = activeItemsEnabled || activeSkillsEnabled || creatorGojoMode !== "off";
  const activeRandomQuest = randomQuestCourse?.quests[randomQuestRuntime.activeIndex] ?? null;
  const randomQuestCurrentPoints = randomQuestRuntime.completed.reduce((sum, quest) => sum + quest.reward, 0) + randomQuestRuntime.actionPoints;
  const randomQuestProgressPercent = activeRandomQuest ? clamp(randomQuestRuntime.value / activeRandomQuest.target, 0, 1) * 100 : 100;
  const currentRandomQuestResult = randomQuestRoundResults.find((result) => result.courseIndex === courseIndex) ?? null;
  const randomQuestTourTotal = randomQuestRoundResults.reduce((sum, result) => sum + result.total, 0);
  const speedNeedleAngle = -126 + clamp(speed / 400, 0, 1) * 252;

  const backFromCurrentMenu = () => {
    if (phase === "tuning") { closeMachineTuning(); return; }
    if (phase === "settings") {
      closeSettings();
      return;
    }
    if (phase === "character-select") {
      backFromCharacterSelect();
      return;
    }
    if (phase === "race-briefing") {
      backFromRaceBriefing();
      return;
    }
    if (phase === "time-trial-finished") {
      openTimeTrial();
      return;
    }
    if (phase === "ultimate-gojo-finished") {
      returnToUltimateGojoSelect();
      return;
    }
    if (phase === "gojo-intro" || phase === "gojo-finished") {
      showChampionshipAfterGojo();
      return;
    }
    if (phase === "award-ceremony") {
      setPhase("championship");
      return;
    }
    if (phase === "championship") {
      returnToCupSelect();
      return;
    }
    if (phase === "creator-finished") {
      returnToCreator();
      return;
    }
    if (phase === "ultimate-gojo-select") setUltimateGojoActive(false);
    returnToTitleFromRace();
  };

  if (evolutionTourActive && phase === "evolution-runtime") {
    return <LegacyEvolutionTour keyBindings={keyBindings} gamepadBindings={gamepadBindings} onExit={returnToTitleFromRace} onComplete={() => unlockAchievement("EVOLUTION_WITNESS")} />;
  }

  const achievementNotice = achievementToast && <div className="achievement-toast" role="status"><i>{achievementToast.icon}</i><span>ACHIEVEMENT UNLOCKED<b>{achievementToast.name}</b><small>{achievementToast.description}</small></span></div>;

  return (
    <main className={phase === "course-create" ? "creator-page" : "expanded-game-page"}>
      {phase !== "racing" && achievementNotice}

      <section className={`game-layout ${phase === "course-create" ? "creator-layout" : "fullscreen-game-layout"} theme-${courseDefinition.id}`} id="race" aria-label={`${courseDefinition.name} 3Dカートレースゲーム`}>
        <div className={`game-stage theme-${courseDefinition.id} ${phase === "racing" || phase === "countdown" ? "race-ui-active" : ""}`}>
          {phase === "racing" && !titleReturnConfirmOpen && !raceFaultReportOpen && (
            <RacePauseButton onPause={openTitleReturnConfirm} />
          )}
          {MENU_PHASES_WITH_BACK.has(phase) && !MENU_PHASES_WITH_INLINE_BACK.has(phase) && !raceFaultReportOpen && (
            <button className="menu-back-button universal-menu-back-button" onClick={backFromCurrentMenu} aria-label="前の画面へ戻る">← BACK</button>
          )}
          {phase !== "course-create" && phase !== "settings" && phase !== "tuning" && (
            <>
              <div className="game-hud">
                <div className="position"><b>{position}</b><span>/{raceFieldSize}<br />POSITION</span></div>
                <div className="lap"><span>LAP</span><b>{currentLap}/{courseLapCount}</b></div>
                <div
                  className={`item-slot ${displayItemsEnabled && item !== "EMPTY" ? "loaded" : ""} ${!displayItemsEnabled ? "disabled" : ""}`}
                  aria-label={displayItemsEnabled ? itemDisplayName : itemLabel.name}
                >
                  <span>{displayItemsEnabled ? "ITEM" : evolutionTourActive ? "HISTORY" : "ITEM OPTION"} {shieldActive && <em>SHIELD LV.{shieldLevel}</em>}</span>
                  <div className="item-slot-visual">
                    <ItemGraphic item={displayItemsEnabled ? item : "EMPTY"} />
                    {displayItemsEnabled && item !== "EMPTY" && (
                      <strong className={`item-level-badge ${item === "NOVA" ? "special" : ""} ${itemLevel >= 3 && item !== "NOVA" ? "max" : ""}`}>
                        <small>{item === "NOVA" ? "SPECIAL" : "LV"}</small>
                        <b>{item === "NOVA" ? "★" : itemLevel}</b>
                      </strong>
                    )}
                  </div>
                </div>
                <div className="camera-mode"><span>CAMERA</span><b>FIXED CHASE</b></div>
                <div className="timer"><span>RACE TIME</span><b>{formatTime(elapsed)}</b></div>
              </div>

              {evolutionTourActive && (phase === "countdown" || phase === "racing") && (
                <div className="evolution-version-banner" key={`${evolutionChapterIndex}-${evolutionMilestone.localLap}`}>
                  <span>DEVELOPMENT MILESTONE</span>
                  <b>{evolutionMilestone.milestone.version} · {evolutionMilestone.milestone.name}</b>
                  <p>{evolutionMilestone.milestone.description}</p>
                  <em>{evolutionMilestone.localLap + 1}/3</em>
                </div>
              )}

              {(phase === "countdown" || phase === "racing") && <div className="speedometer" aria-label={`速度 ${speed}キロメートル毎時`}>
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
              </div>}

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

              <div className="race-status-stack">
              <div className="race-info-stack">
              <div className={`skill-meter ${skillReady ? "ready" : ""} ${skillActive ? "active" : ""} ${skillActive && selectedCharacter.name === "VOLT" ? "volt-active" : ""} ${!displaySkillsEnabled ? "disabled" : ""}`} aria-label={displaySkillsEnabled ? `${selectedCharacter.skillName} ${skillReady ? "READY" : `${Math.ceil(skillRemaining / 1000)}秒`}` : "スキル無効"}>
                <span>SKILL // {displaySkillsEnabled ? selectedCharacter.skillName : evolutionTourActive ? "NOT INVENTED YET" : "DISABLED"}</span>
                <div>
                  <i style={{ width: `${skillMeterCharge * 100}%` }} />
                  {skillActive && selectedCharacter.name === "VOLT" && <em className="volt-success-band" aria-label="成功範囲 70%から80%" />}
                  {skillActive && selectedCharacter.name === "VOLT" && <em className="volt-critical-band" aria-label="大成功範囲 73%から77%" />}
                </div>
                <b>{displaySkillsEnabled ? (skillActive ? skillActionLabel : skillReady ? "READY" : `${Math.ceil(skillRemaining / 1000)}s`) : "OFF"}</b>
              </div>

              {randomQuestActive && (phase === "countdown" || phase === "racing") && (
                <div className={`random-quest-hud ${activeRandomQuest ? "" : "complete"}`}>
                  <header><span>QUEST {Math.min(randomQuestRuntime.activeIndex + 1, randomQuestCourse?.quests.length ?? 5)}/{randomQuestCourse?.quests.length ?? 5}</span><b>ROUND {courseIndex + 1} · {CREATOR_THEME_LABELS[randomQuestCourse?.theme ?? "city"]}</b></header>
                  <strong>{activeRandomQuest?.label ?? "ALL QUESTS CLEARED!!"}</strong>
                  <div><i style={{ width: `${randomQuestProgressPercent}%` }} /></div>
                  <div className="random-quest-hud-footer"><span>{activeRandomQuest ? `${Math.min(activeRandomQuest.target, Math.floor(randomQuestRuntime.value))} / ${activeRandomQuest.target} ${activeRandomQuest.unit}` : `${randomQuestRuntime.completed.length} QUESTS COMPLETE`}</span><b>{randomQuestCurrentPoints} PT</b></div>
                </div>
              )}

              </div>
              <div className="race-action-stack">
              {phase === "racing" && achievementNotice}
              <div className="race-feedback-slot" ref={setFeedbackTarget} />
              {randomQuestActive && phase === "racing" && randomQuestComboDisplay && randomQuestComboDisplay.count >= 2 && (
                <div
                  key={randomQuestComboDisplay.id}
                  className={`random-quest-combo ${randomQuestComboDisplay.count >= 6 ? "legend" : randomQuestComboDisplay.count >= 4 ? "hot" : "rising"}`}
                  aria-label={`${randomQuestComboDisplay.count}コンボ、${randomQuestComboDisplay.awardedPoints}ポイント獲得`}
                >
                  <b>{randomQuestComboDisplay.count}<span>COMBO</span></b>
                  <small>{randomQuestComboDisplay.label}　+{randomQuestComboDisplay.awardedPoints} PT　×{randomQuestComboDisplay.multiplier}</small>
                </div>
              )}

              {skillActive && selectedCharacter.name === "GIANT" && (
                <div className="giant-angle-meter" aria-label={`ジャンプ角度 ${giantLeapAngleDegrees}度`}>
                  <div className="giant-angle-face" aria-hidden="true">
                    <div className="giant-angle-arc" />
                    {Array.from({ length: 16 }, (_, index) => {
                      const angle = index * 5;
                      const zone = angle < 10 ? "under" : angle < 30 ? "dash" : angle < 50 ? "long" : angle < 70 ? "high" : "over";
                      return <span key={angle} className={`giant-angle-tick ${zone}`} style={{ transform: `rotate(${-angle}deg)` }} />;
                    })}
                    <i className="giant-angle-needle" style={{ transform: `rotate(${-giantLeapAngleDegrees}deg)` }} />
                    <i className="giant-angle-hub" />
                  </div>
                  <div className="giant-angle-readout"><b>{giantLeapAngleDegrees}°</b><span>RELEASE TO LAUNCH</span></div>
                  <div className="giant-angle-zones"><span>LOW DASH</span><span>LONG</span><span>HIGH</span></div>
                </div>
              )}
              </div>
              </div>
            </>
          )}

          {phase === "course-create" ? (
            <CourseCreatorWorld
              parts={creatorParts}
              theme={creatorTheme}
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
            <RaceWorld phase={phase} paused={titleReturnConfirmOpen} feedbackTarget={feedbackTarget} runId={runId} courseDefinition={courseDefinition} selectedCharacterIndex={selectedCharacterIndex} machineTuning={activeMachineTuning} evolutionMode={evolutionTourActive} evolutionChapterIndex={evolutionChapterIndex} gojoChallenge={gojoChallenge || ultimateGojoActive || creatorGojoDuel} ultimateGojo={ultimateGojoActive} gojoField={creatorGojoField} itemsEnabled={activeItemsEnabled} skillsEnabled={activeSkillsEnabled} timeTrialMode={timeTrialActive} recordGojoLine={runMode === "gojo-line-record"} ghostRecords={activeGhostRecords} gojoLineRecord={gojoLineStore[courseDefinition.id] ?? null} keyBindings={keyBindings} gamepadBindings={gamepadBindings} audioController={audioController} creatorParts={activeCreatorParts} creatorHazards={activeCreatorHazards} onTelemetry={handleTelemetry} onFinish={handleFinish} onItemChange={handleItemChange} onShieldChange={handleShieldChange} onSkillChange={handleSkillChange} onRunEvent={handleRunEvent} onRaceFault={handleRaceFault} onReady={handleCourseReady} />
          )}

          {raceFaultReportOpen && raceFaultDiagnostic && (
            <div className="race-fault-report" role="dialog" aria-modal="true" aria-labelledby="race-fault-title">
              <section>
                <div className="overlay-kicker">FREEZE DIAGNOSTIC</div>
                <h2 id="race-fault-title">停止原因を記録しました</h2>
                <p>推測修正を避けるため、この内容をコピーしてCodexへ貼り付けてください。</p>
                <dl>
                  <div><dt>COURSE</dt><dd>{raceFaultDiagnostic.course}</dd></div>
                  <div><dt>STAGE</dt><dd>{raceFaultDiagnostic.stage}</dd></div>
                  <div><dt>ERROR</dt><dd>{raceFaultDiagnostic.error.name}: {raceFaultDiagnostic.error.message}</dd></div>
                </dl>
                <pre>{JSON.stringify(raceFaultDiagnostic, null, 2)}</pre>
                <div className="race-fault-actions">
                  <button className="race-button" onClick={() => void copyRaceFaultReport()}>{raceFaultCopyStatus}</button>
                  <button className="secondary-button" onClick={() => setRaceFaultReportOpen(false)}>← BACK</button>
                  <button className="secondary-button danger" onClick={clearRaceFaultReport}>DELETE REPORT</button>
                </div>
              </section>
            </div>
          )}

          {phase === "title" && (
            <div className="game-overlay title-overlay">
              <div className="overlay-kicker">FULL 3D · SIX COURSES · TWO CUPS</div>
              <h2 className="title-logo" aria-label="MOMON GRAND PRIX: PRISM SHIFT">MOMON<br /><span>GRAND PRIX</span></h2>
              <div className="title-logo-shift" aria-hidden="true">PRISM SHIFT</div>
              <p>2つのカップ、6つのコース。3戦の合計ポイントでチャンピオンを決めろ。<span className="pad-help">CONTROLLER：× / A　 KEYBOARD：ENTER</span></p>
              <div className="title-actions">
                <button className={`race-button ${titleMenuFocus === 0 ? "menu-focus" : ""}`} onMouseEnter={() => { titleMenuFocusRef.current = 0; setTitleMenuFocus(0); }} onClick={openCupSelect}>SELECT CUP <span>→</span></button>
                <button className={`race-button time-trial-button ${titleMenuFocus === 1 ? "menu-focus" : ""}`} onMouseEnter={() => { titleMenuFocusRef.current = 1; setTitleMenuFocus(1); }} onClick={openTimeTrial}>TIME ATTACK <span>◷</span></button>
                <button className={`race-button random-quest-button ${titleMenuFocus === 2 ? "menu-focus" : ""}`} onMouseEnter={() => { titleMenuFocusRef.current = 2; setTitleMenuFocus(2); }} onClick={openRandomQuestTour}>RANDOM QUEST TOUR <span>◆</span></button>
                <button className={`race-button evolution-button ${titleMenuFocus === 3 ? "menu-focus" : ""}`} onMouseEnter={() => { titleMenuFocusRef.current = 3; setTitleMenuFocus(3); }} onClick={openEvolutionTour}>EVOLUTION TOUR <span>⌛</span></button>
                <button className={`race-button creator-button ${titleMenuFocus === 4 ? "menu-focus" : ""}`} onMouseEnter={() => { titleMenuFocusRef.current = 4; setTitleMenuFocus(4); }} onClick={openCourseCreator}>COURSE CREATE <span>＋</span></button>
                <button className={`race-button achievements-button ${titleMenuFocus === 5 ? "menu-focus" : ""}`} onMouseEnter={() => { titleMenuFocusRef.current = 5; setTitleMenuFocus(5); }} onClick={openAchievements}>ACHIEVEMENTS <span>{Object.keys(achievementStore.unlocked).length}/10</span></button>
                <button className={`race-button ultimate-gojo-button ${ultimateGojoUnlocked ? "unlocked" : "locked"} ${titleMenuFocus === 6 ? "menu-focus" : ""}`} onMouseEnter={() => { titleMenuFocusRef.current = 6; setTitleMenuFocus(6); }} onClick={openUltimateGojo}>ULTIMATE GOJO <span>{ultimateGojoUnlocked ? "⚡" : `${Object.keys(achievementStore.unlocked).length}/10`}</span></button>
                <button className={`race-button settings-button ${titleMenuFocus === 7 ? "menu-focus" : ""}`} onMouseEnter={() => { titleMenuFocusRef.current = 7; setTitleMenuFocus(7); }} onClick={openSettings}>SETTINGS <span>⚙</span></button>
              </div>
              <div className="controller-prompt">↑ ↓：MODE　× / A・ENTER：決定　R：QUEST　V：EVOLUTION　C：CREATE</div>
            </div>
          )}

          {phase === "settings" && (
            <div className="game-overlay settings-overlay">
              <section className="settings-panel" aria-label="ゲーム設定">
                <div className="settings-heading">
                  <div><small>LIVE 3D PREVIEW</small><h2>SETTINGS.</h2></div>
                  <button onClick={closeSettings} aria-label="設定を閉じる">×</button>
                </div>

                <div className="audio-settings">
                  <div className="settings-section-title"><span>AUDIO MIX</span><small>オリジナルBGM・効果音</small></div>
                  <button
                    className={`settings-toggle audio-toggle ${!audioMuted ? "enabled" : ""} ${settingsMenuFocus === 0 ? "menu-focus" : ""}`}
                    onClick={() => setAudioMuted((value) => !value)}
                    aria-pressed={!audioMuted}
                  >
                    <i /> <span>{audioMuted ? "SOUND OFF" : "SOUND ON"}</span><b>{audioMuted ? "MUTE" : "LIVE"}</b>
                  </button>
                  <div className={`audio-volume-grid ${audioMuted ? "disabled" : ""}`}>
                    <label className={settingsMenuFocus === 1 ? "menu-focus" : ""}>
                      <span>BGM VOLUME <b>{Math.round(bgmVolume * 100)}%</b></span>
                      <input type="range" min="0" max="100" step="1" value={Math.round(bgmVolume * 100)} onChange={(event) => setBgmVolume(Number(event.target.value) / 100)} disabled={audioMuted} />
                    </label>
                    <label className={settingsMenuFocus === 2 ? "menu-focus" : ""}>
                      <span>SE VOLUME <b>{Math.round(seVolume * 100)}%</b></span>
                      <input type="range" min="0" max="100" step="1" value={Math.round(seVolume * 100)} onChange={(event) => setSeVolume(Number(event.target.value) / 100)} disabled={audioMuted} />
                    </label>
                  </div>
                  <p>各コース専用BGMと、エンジン・ドリフト・ターボ・クラッシュ・アイテム・スキルの効果音を調整します。</p>
                </div>

                <div className="key-config">
                  <div className="settings-section-title"><span>INPUT CONFIG</span><small>キーボード・マウス・ゲームパッド</small></div>
                  <div className="input-device-tabs" role="tablist" aria-label="入力デバイス">
                    <button
                      className={inputConfigTab === "keyboard" ? "selected" : ""}
                      onClick={() => {
                        setCapturingBinding(null);
                        setCapturingGamepadBinding(null);
                        setInputConfigTab("keyboard");
                      }}
                    >KEYBOARD / MOUSE</button>
                    <button
                      className={inputConfigTab === "gamepad" ? "selected" : ""}
                      onClick={() => {
                        setCapturingBinding(null);
                        setCapturingGamepadBinding(null);
                        setInputConfigTab("gamepad");
                      }}
                    >GAMEPAD <i>{connectedGamepadNames.length}</i></button>
                  </div>
                  {inputConfigTab === "gamepad" && (
                    <div className={`gamepad-config-status ${connectedGamepadNames.length > 0 ? "connected" : ""}`}>
                      <i />
                      <span>{connectedGamepadNames.length > 0 ? `${connectedGamepadNames.length} GAMEPAD CONNECTED` : "CONNECT OR PRESS A GAMEPAD BUTTON"}</span>
                      <small>{connectedGamepadNames[0] ?? "USB／Bluetooth機器を接続し、ブラウザに認識させてください。"}</small>
                    </div>
                  )}
                  <div className="key-config-grid">
                    {KEY_ACTIONS.map((action) => (
                      <div className="key-config-row" key={action.id}>
                        <span><b>{action.label}</b><small>{action.hint}</small></span>
                        {([0, 1] as const).map((slot) => {
                          const keyboardCapture = capturingBinding?.action === action.id && capturingBinding.slot === slot;
                          const gamepadCapture = capturingGamepadBinding?.action === action.id && capturingGamepadBinding.slot === slot;
                          return inputConfigTab === "keyboard" ? (
                            <button
                              className={keyboardCapture ? "capturing" : ""}
                              key={slot}
                              onClick={() => {
                                setCapturingGamepadBinding(null);
                                setCapturingBinding({ action: action.id, slot });
                              }}
                            >
                              {keyboardCapture ? "PRESS KEY / CLICK…" : displayBindingKey(keyBindings[action.id][slot])}
                            </button>
                          ) : (
                            <button
                              className={gamepadCapture ? "capturing" : ""}
                              key={slot}
                              onClick={() => beginGamepadCapture(action.id, slot)}
                            >
                              {gamepadCapture ? "PRESS / MOVE…" : displayGamepadBinding(gamepadBindings[action.id][slot])}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <div className="key-config-help">
                    <span>{inputConfigTab === "keyboard"
                      ? (capturingBinding ? "割り当てるキーまたはマウスボタンを押してください。Backspaceで解除、Escで中止。" : "キーとマウスボタンを各操作に2つまで登録できます。同じ入力は以前の設定から外れます。")
                      : (capturingGamepadBinding ? "登録するボタンを押すか、スティックを大きく倒してください。Backspaceで解除、Escで中止。" : "Gamepad APIが認識したPS4・Xbox・汎用パッドなどを設定できます。ボタンとスティック軸に対応します。")}</span>
                    <button onClick={resetKeyBindings}>RESET DEFAULT</button>
                  </div>
                </div>

                <div className={`data-reset-settings ${gameDataResetConfirming ? "confirming" : ""}`}>
                  <div className="settings-section-title"><span>GAME DATA RESET</span><small>最初から遊ぶ</small></div>
                  <p>実績・カップメダル・タイムアタック記録・自己ベストゴースト・保存コース・ランキング・操作設定・音量設定を、この端末からすべて消去します。</p>
                  {!gameDataResetConfirming ? (
                    <button className="data-reset-open" onKeyDown={(event) => event.stopPropagation()} onClick={() => setGameDataResetConfirming(true)}>RESET GAME DATA</button>
                  ) : (
                    <div className="data-reset-confirm" role="alert">
                      <strong>本当にすべてのゲームデータを消しますか？</strong>
                      <small>この操作は取り消せません。</small>
                      <span>
                        <button onKeyDown={(event) => event.stopPropagation()} onClick={() => setGameDataResetConfirming(false)}>CANCEL</button>
                        <button className="erase" onKeyDown={(event) => event.stopPropagation()} onClick={resetAllGameData}>YES · ERASE ALL</button>
                      </span>
                    </div>
                  )}
                </div>

                <button className="settings-back" onClick={closeSettings}>SAVE &amp; BACK <span>↩</span></button>
              </section>
              <div className="settings-preview-label"><i /> LIVE COURSE PREVIEW <span>NORMAL VIEW</span></div>
            </div>
          )}

          {phase === "course-create" && (
            <div className="game-overlay course-creator-overlay">
              <div className="creator-head-panel">
                <div className="creator-head-row">
                  <input aria-label="コース名" value={creatorCourseName} maxLength={24} onChange={(event) => setCreatorCourseName(event.target.value)} />
                </div>
                <div className="creator-theme-selector" aria-label="コース景観">
                  {(CREATOR_THEMES as CreatorTheme[]).map((theme) => (
                    <button
                      className={creatorTheme === theme ? "selected" : ""}
                      key={theme}
                      onClick={() => {
                        setCreatorTheme(theme);
                        setCreatorNotice(`${CREATOR_THEME_LABELS[theme]}の景観へ変更しました。路面形状と当たり判定は変わりません。`);
                      }}
                    >{CREATOR_THEME_LABELS[theme]}</button>
                  ))}
                </div>
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

              <details className="creator-guide-overlay" open>
                <summary><span>GUIDE &amp; MAP</span><b>{creatorEditMode === "road" ? `${creatorConnectAt.toUpperCase()} END` : `${creatorHazards.length} HAZARDS`}</b></summary>
                <div className="creator-guide-content">
                  <CreatorMiniMap parts={creatorParts} connectAt={creatorConnectAt} />
                  <div className="progress-track"><i style={{ width: `${Math.min(100, creatorParts.length / MAX_CREATOR_PARTS * 100)}%` }} /></div>
                  <div className="creator-guide-steps">
                    <div className="creator-guide-card">
                      <b>1. {creatorEditMode === "road" ? "SELECT" : "SECTION"}</b>
                      <p>{creatorEditMode === "road" ? "画面下から道路を選ぶと、接続点へ半透明で仮置きされます。" : "画面下の番号から、仕掛けを置く道路区間を選びます。"}</p>
                    </div>
                    <div className="creator-guide-card">
                      <b>2. {creatorEditMode === "road" ? "PLACE" : "TUNE"}</b>
                      <p>{creatorEditMode === "road" ? "仮置き道路か決定ボタンを押すと、向きと高さを合わせて設置します。" : "種類を追加し、位置・速度・幅・強さを右上で調整します。"}</p>
                    </div>
                    <div className="creator-guide-card">
                      <b>3. TEST</b>
                      <p>{creatorEditMode === "road" ? "始点と終点はテスト時に自動接続。何度でも戻して作り直せます。" : "テスト走行では設定値どおり作動し、保存データにも記録されます。"}</p>
                    </div>
                  </div>
                  <div className="creator-pad-map"><span>PAD</span><b>{creatorEditMode === "road" ? "左STICK 道路 · 右STICK 回転 · R2＋右STICK 視点移動 · ×設置" : "左右 種類 · 上下 区間 · ×追加 · ○削除 · TAB モード変更"}</b></div>
                </div>
              </details>

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
                    <button className="creator-exit-button" onClick={backFromCurrentMenu}>← TITLE</button>
                    <button onClick={saveCreatorCourse}>SAVE</button>
                    <button onClick={loadCreatorCourse} disabled={!savedCreatorCourse}>LOAD</button>
                    <button className={creatorCodeOpen ? "code-open" : ""} onClick={() => setCreatorCodeOpen((open) => !open)}>CODE</button>
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
                {creatorCodeOpen && (
                  <section className="creator-code-panel" aria-label="コースコードの出力と入力">
                    <div className="creator-code-heading">
                      <div><b>COURSE CODE</b><small>道路・ギミック・ギミック設定を共有</small></div>
                      <button aria-label="コースコード画面を閉じる" onClick={() => setCreatorCodeOpen(false)}>×</button>
                    </div>
                    <div className="creator-code-columns">
                      <label>
                        <span>現在のコード <em>{creatorCourseCode.length}文字</em></span>
                        <textarea readOnly spellCheck={false} value={creatorCourseCode} onFocus={(event) => event.currentTarget.select()} />
                        <button onClick={copyCreatorCourseCode}>COPY CODE</button>
                      </label>
                      <label>
                        <span>コードを貼り付けて復元</span>
                        <textarea
                          maxLength={512}
                          placeholder="KC1-..."
                          spellCheck={false}
                          value={creatorCodeInput}
                          onChange={(event) => setCreatorCodeInput(event.target.value)}
                        />
                        <button className="import" onClick={importCreatorCourseCode}>IMPORT COURSE</button>
                      </label>
                    </div>
                    <p>コース名、ITEMS、SKILLS、GOJOの対戦設定はコードに含まれません。</p>
                  </section>
                )}
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
                    {bestCupMedals[cup.id] && (
                      <div className={`cup-medal-record medal-${bestCupMedals[cup.id]}`}>
                        <i>★</i>
                        <span>BEST {bestCupMedals[cup.id]?.toUpperCase()}<small>{bestCupMedals[cup.id] === "gold" ? "金賞" : bestCupMedals[cup.id] === "silver" ? "銀賞" : "銅賞"}</small></span>
                      </div>
                    )}
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
              <div className="overlay-kicker">{characterSelectSource === "creator" ? `${creatorDefinition.name} // CUSTOM COURSE` : characterSelectSource === "random-quest" ? "RANDOM QUEST TOUR // THREE UNKNOWN CIRCUITS" : characterSelectSource === "evolution" ? "EVOLUTION TOUR // 12 DEVELOPMENT MILESTONES" : characterSelectSource === "time-trial" ? `${courseDefinition.name} // TIME ATTACK` : characterSelectSource === "staff-record" ? `${courseDefinition.name} // ADMIN STAFF RECORDER` : characterSelectSource === "ultimate-gojo" ? `${courseDefinition.name} // ULTIMATE GOJO DUEL` : activeCup.name} // CHOOSE YOUR RACER</div>
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
                    <em>COOLDOWN {skillCooldownFor(character) / 1000}s</em>
                  </button>
                ))}
              </div>
              <p>← → / LEFT STICK：キャラ選択　× / A：決定　○ / B：戻る{characterSelectSource !== "evolution" && "　T / ↑：TUNING"}</p>
              <div className="character-select-actions">
                <button className="character-back-button" onClick={backFromCharacterSelect}>← BACK</button>
                {characterSelectSource !== "evolution" && <button className="character-back-button tuning-open-button" onClick={openMachineTuning}>TUNING · {tuningPreset}</button>}
                <button className="race-button" onClick={startSelectedCharacter}>{characterSelectSource === "creator" ? "START CUSTOM RACE" : characterSelectSource === "random-quest" ? "START QUEST TOUR" : characterSelectSource === "evolution" ? "START EVOLUTION" : characterSelectSource === "staff-record" ? "RECORD STAFF GHOST" : characterSelectSource === "time-trial" ? "START TIME ATTACK" : characterSelectSource === "ultimate-gojo" ? "CHALLENGE GOJO" : "RACE"} AS {selectedCharacter.name} <span>→</span></button>
              </div>
            </div>
          )}

          {phase === "race-briefing" && (
            <div className="game-overlay race-briefing-overlay" role="dialog" aria-modal="true" aria-labelledby="race-briefing-title">
              <div className="race-briefing-head">
                <span><small>RACE BRIEFING</small><b id="race-briefing-title">操作とバトルを確認</b></span>
                <em>{characterSelectSource === "ultimate-gojo" ? `ULTIMATE GOJO · ${courseDefinition.name}` : characterSelectSource === "random-quest" ? `RANDOM QUEST TOUR · SEED ${randomQuestTour?.seed ?? 0}` : activeCup.name} · {selectedCharacter.name}</em>
              </div>

              <div className="race-briefing-grid">
                <section className="briefing-panel briefing-controls">
                  <header><b>01</b><span>CONTROLS<small>現在のキー設定</small></span></header>
                  <div className="briefing-control-list">
                    {KEY_ACTIONS.map((action) => (
                      <article key={action.id}>
                        <span>{action.hint}<small>{action.label}</small></span>
                        <div>
                          <kbd>{keyBindings[action.id].filter(Boolean).map(displayBindingKey).join(" / ") || "NONE"}</kbd>
                          <em>{gamepadBindings[action.id].filter(Boolean).map(displayGamepadBinding).join(" / ") || "NONE"}</em>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="briefing-touch-help"><b>SMARTPHONE</b><span>自動加速 · 画面左右でハンドル · ダブルタップ＋長押しでドリフト</span><small>↑フリック：スキル　↓フリック：アイテム</small></div>
                </section>

                <section className={`briefing-panel briefing-items ${activeItemsEnabled ? "" : "briefing-disabled"}`}>
                  <header><b>02</b><span>ITEMS<small>{activeItemsEnabled ? "箱を重ねてLV.3へ" : "このカップでは無効"}</small></span><i>{activeItemsEnabled ? "ON" : "OFF"}</i></header>
                  <div className="briefing-item-grid">
                    {ITEM_BRIEFING.map((entry) => (
                      <article key={entry.item}>
                        <ItemGraphic item={entry.item} />
                        <span><b>{ITEM_LABELS[entry.item].name}</b><p>{entry.description}</p><small>{entry.levelHint}</small></span>
                      </article>
                    ))}
                  </div>
                </section>

                <section className={`briefing-panel briefing-skill ${activeSkillsEnabled ? "" : "briefing-disabled"}`}>
                  <header><b>03</b><span>YOUR SKILL<small>{activeSkillsEnabled ? "ゲージ満タンで発動" : "このカップでは無効"}</small></span><i>{activeSkillsEnabled ? "ON" : "OFF"}</i></header>
                  <div className={`briefing-skill-badge character-${selectedCharacter.name.toLowerCase()}`}><i>{selectedCharacter.badge}</i><span><small>{selectedCharacter.name}</small><b>{selectedCharacter.skillName}</b></span></div>
                  <p>{selectedCharacter.skillDescription}</p>
                  <dl><div><dt>COOLDOWN</dt><dd>{skillCooldownFor(selectedCharacter) / 1000} SEC</dd></div><div><dt>START</dt><dd>ゲージ0から</dd></div></dl>
                  <div className="briefing-battle-tip"><b>LEVEL UP</b><span>アイテムを持ったまま次の箱を取ると1段階強化。最大LV.3。</span></div>
                  {characterSelectSource === "ultimate-gojo" && <div className="briefing-battle-tip ultimate"><b>ULTIMATE GOJO</b><span>最高速38・全スキル15秒。スキルの発動波を見て対応せよ。</span></div>}
                </section>
              </div>

              <div className="race-briefing-actions">
                <button className="character-back-button" onClick={backFromRaceBriefing}>← CHARACTER</button>
                <button className="character-back-button tuning-open-button" onClick={openMachineTuning}>TUNING · {tuningPreset}</button>
                <button className="race-button briefing-ok-button" onClick={characterSelectSource === "ultimate-gojo" ? confirmUltimateGojoBriefing : confirmRaceBriefing}>OK · START RACE <span>→</span></button>
              </div>
              <small className="briefing-confirm-help">ENTER / SPACE / × / A：OK　 ESC / ○ / B：戻る　T / ↑：TUNING</small>
            </div>
          )}

          {phase === "tuning" && (
            <div className="game-overlay machine-tuning-overlay" ref={tuningPanelRef} role="dialog" aria-modal="true" aria-labelledby="machine-tuning-title">
              <header className="machine-tuning-header"><div><span>PRE-RACE GARAGE</span><h2 id="machine-tuning-title">MACHINE TUNING</h2></div><b>{selectedCharacter.name} · {tuningPreset}</b></header>
              <div className="machine-tuning-presets" aria-label="チューニングのプリセット">
                {(["DEFAULT", "SPEED", "DRIFT", "STABLE", "CUSTOM"] as TuningPreset[]).map((preset) => (
                  <button key={preset} data-tuning-control aria-pressed={tuningPreset === preset} onClick={() => {
                    setTuningCustomMode(preset === "CUSTOM");
                    if (preset !== "CUSTOM") setMachineTuning({ ...MACHINE_PRESETS[preset] });
                  }}>{preset}</button>
                ))}
              </div>
              <div className="machine-tuning-grid">
                <nav className="machine-tuning-categories" aria-label="パーツカテゴリ">
                  {TUNING_CATEGORIES.map((category, index) => (
                    <button key={category.id} data-tuning-control aria-pressed={tuningCategory === category.id} onClick={() => setTuningCategory(category.id)}>
                      <small>0{index + 1}</small><span><b>{category.name}</b><em>{category.parts.find((part) => part.id === machineTuning[category.id])?.name}</em></span>
                    </button>
                  ))}
                </nav>
                <section className="machine-tuning-parts" aria-label={selectedTuningCategory.name}>
                  <header><h3>{selectedTuningCategory.name}</h3><p>{selectedTuningCategory.hint}</p></header>
                  {selectedTuningCategory.parts.map((part) => (
                    <button key={part.id} data-tuning-control aria-pressed={machineTuning[tuningCategory] === part.id} onClick={() => {
                      setMachineTuning((current) => ({ ...current, [tuningCategory]: part.id }));
                      setTuningCustomMode(true);
                    }}>
                      <span><b>{part.name}</b><em>{machineTuning[tuningCategory] === part.id ? "EQUIPPED" : "SELECT"}</em></span>
                      <p>{part.description}</p><small>{part.tradeoff}</small>
                    </button>
                  ))}
                </section>
                <aside className="machine-tuning-performance" aria-label="現在のマシン性能">
                  <h3>MACHINE PROFILE</h3>
                  <p>数字は性能の目安。ターボの加速・最高速は共通で、BOOSTは溜めやすさと持続の目安です。</p>
                  <dl aria-live="polite">{tuningStats.map((stat) => (
                    <div key={stat.name}><dt>{stat.name}</dt><dd><b>{stat.value}</b><span className="machine-stat-track"><i style={{ width: `${stat.value}%` }} /></span></dd></div>
                  ))}</dl>
                  <div className="machine-tuning-summary"><b>YOUR SETUP</b>{TUNING_CATEGORIES.map((category) => <span key={category.id}>{category.name}<strong>{category.parts.find((part) => part.id === machineTuning[category.id])?.name}</strong></span>)}</div>
                  <small>DEFAULTは従来の挙動。発進・減速後の復帰・通常旋回とターボ持続のバランス重視。CPU・旧バージョンには適用されません。</small>
                </aside>
              </div>
              <footer className="machine-tuning-footer">
                <span role="status">{tuningSaveFailed ? "このブラウザでは保存できません。今回の走行には適用できます。" : "この端末・ブラウザに自動保存。次のレースから適用。"}<small>方向キー / STICK：移動　ENTER / × / A：選択　ESC / ○ / B：戻る</small></span>
                <button data-tuning-control onClick={closeMachineTuning}>BACK · SETUP READY</button>
              </footer>
            </div>
          )}

          {phase === "loading" && (
            <div className={`game-overlay course-loading-overlay loading-${courseDefinition.id}`} role="status" aria-live="polite" aria-label={`${courseDefinition.name}を準備しています`}>
              <div className="course-loading-grid" aria-hidden="true" />
              <div className="course-loading-card">
                <span className="course-loading-kicker">COURSE PREPARATION</span>
                <h2>{courseDefinition.name}</h2>
                <p>{courseDefinition.tagline}</p>
                <div className="course-loading-route" aria-hidden="true">
                  <i /><i /><i /><i /><i />
                  <b />
                </div>
                <div className="course-loading-status">
                  <span>ROAD</span><span>RACERS</span><span>EFFECTS</span>
                </div>
                <strong>コースを準備しています</strong>
                <small>準備が完了するとカウントダウンが始まります</small>
              </div>
            </div>
          )}

          {phase === "countdown" && <div key={countdown} className={`countdown ${countdown === "GO!" ? "go" : ""}`}>{countdown}</div>}

          {titleReturnConfirmOpen && (
            <div className="game-overlay pause-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="pause-confirm-title">
              <div className="pause-confirm-card">
                <div className="overlay-kicker">RACE PAUSED</div>
                <h2 id="pause-confirm-title">RETURN TO<br /><span>TITLE?</span></h2>
                <p>現在のレースを終了してタイトル画面へ戻りますか？</p>
                <div className="pause-confirm-actions">
                  <button
                    className={titleReturnFocus === 0 ? "menu-focus" : ""}
                    onMouseEnter={() => { titleReturnFocusRef.current = 0; setTitleReturnFocus(0); }}
                    onClick={returnToTitleFromRace}
                  >YES<small>メニューへ戻る</small></button>
                  <button
                    className={titleReturnFocus === 1 ? "menu-focus" : ""}
                    onMouseEnter={() => { titleReturnFocusRef.current = 1; setTitleReturnFocus(1); }}
                    onClick={closeTitleReturnConfirm}
                    autoFocus
                  >NO<small>レースを続ける</small></button>
                </div>
                <small>← → / D-PAD：選択　ENTER / ×：決定　ESC / ○：キャンセル</small>
              </div>
            </div>
          )}

          {phase === "time-trial-select" && (
            <div className="game-overlay time-trial-overlay">
              <div className="overlay-kicker">SOLO RUN · PERSONAL BEST + STAFF GHOST</div>
              <h2>TIME<br /><span>ATTACK.</span></h2>
              <div className="time-trial-course-grid">
                {TIME_TRIAL_COURSE_IDS.map((courseId, index) => {
                  const course = courseById(courseId);
                  const personal = ghostStore.personal[courseId] ?? [];
                  const staff = ghostStore.staff[courseId];
                  const gojoLine = gojoLineStore[courseId];
                  return <button key={courseId} className={timeTrialCourseIndex === index ? "selected" : ""} onMouseEnter={() => setTimeTrialCourseIndex(index)} onClick={() => setTimeTrialCourseIndex(index)}>
                    <b>0{index + 1}</b><span>{course.name}<small>{course.tagline}</small></span>
                    <em>PB {personal[0] ? formatTime(personal[0].timeMs) : "--:--.--"}<small>STAFF {staff ? formatTime(staff.timeMs) : "NO DATA"} · GOJO LINE {gojoLine ? "READY" : "NO DATA"}</small></em>
                  </button>;
                })}
              </div>
              <div className="personal-best-ranking" aria-label="自己ベスト上位5件">
                <b>{courseById(TIME_TRIAL_COURSE_IDS[timeTrialCourseIndex] ?? "city").name} · PERSONAL TOP 5</b>
                <ol>{Array.from({ length: 5 }, (_, index) => {
                  const record = (ghostStore.personal[TIME_TRIAL_COURSE_IDS[timeTrialCourseIndex] ?? "city"] ?? [])[index];
                  return <li key={index} className={record ? "recorded" : "empty"}><span>{index + 1}</span><em>{record ? formatTime(record.timeMs) : "--:--.--"}</em></li>;
                })}</ol>
              </div>
              <p>CPU・アイテム・スキルなし。管理者のお手本ラインはGojoだけが通常レースで使用し、ショートカット時は既存AIが優先されます。</p>
              <div className="time-trial-actions">
                <button className="character-back-button" onClick={() => setPhase("title")}>← TITLE</button>
                <button className="race-button" onClick={() => startTimeTrialCharacterSelect(false)}>CHOOSE CHARACTER <span>→</span></button>
                {staffRecorderEnabled && <button className="staff-record-button" onClick={() => startTimeTrialCharacterSelect(true)}>ADMIN · RECORD STAFF GHOST</button>}
                {staffRecorderEnabled && <button className="staff-record-button" onClick={startGojoLineRecord}>ADMIN · RECORD GOJO LINE</button>}
              </div>
              <small>← → / D-PAD：コース選択　ENTER / × / A：決定　ESC / ○ / B：戻る</small>
            </div>
          )}

          {phase === "ultimate-gojo-select" && (
            <div className="game-overlay ultimate-gojo-select-overlay">
              <div className="overlay-kicker">10 / 10 ACHIEVEMENTS · FINAL CHALLENGE UNLOCKED</div>
              <h2>ULTIMATE<br /><span>GOJO.</span></h2>
              <p>好きなコースで本気Gojoと1対1。Ghostがないコースでも長いドリフトと先読み走行を使い、スキルは15秒ごとに使用します。</p>
              <div className="time-trial-course-grid ultimate-gojo-course-grid">
                {TIME_TRIAL_COURSE_IDS.map((courseId, index) => {
                  const course = courseById(courseId);
                  const hasGojoLine = Boolean(gojoLineStore[courseId]);
                  return <button key={courseId} className={ultimateGojoCourseIndex === index ? "selected" : ""} onMouseEnter={() => setUltimateGojoCourseIndex(index)} onClick={() => setUltimateGojoCourseIndex(index)}>
                    <b>0{index + 1}</b><span>{course.name}<small>{course.tagline}</small></span>
                    <em>{hasGojoLine ? "GHOST LINE" : "TACTICAL AI"}<small>{hasGojoLine ? "記録ライン＋専用ショートカット" : "汎用ライン・スキル判断"}</small></em>
                  </button>;
                })}
              </div>
              <div className="ultimate-gojo-tuning">
                <span><small>TOP SPEED</small><b>38</b><em>通常Gojo 35</em></span>
                <span><small>SKILL</small><b>15s</b><em>通常Gojo 20s</em></span>
                <span><small>FORMAT</small><b>1 VS 1</b><em>ITEMS + SKILLS ON</em></span>
              </div>
              <div className="time-trial-actions">
                <button className="character-back-button" onClick={() => { setUltimateGojoActive(false); setPhase("title"); }}>← TITLE</button>
                <button className="race-button ultimate-gojo-start-button" onClick={startUltimateGojoCharacterSelect}>CHOOSE CHARACTER <span>→</span></button>
              </div>
              <small>← → / D-PAD：コース選択　ENTER / × / A：決定　ESC / ○ / B：戻る</small>
            </div>
          )}

          {phase === "achievements" && (
            <div className="game-overlay achievements-overlay">
              <div className="overlay-kicker">LOCAL ACHIEVEMENT CABINET · SAVED ON THIS DEVICE</div>
              <h2>RACING<br /><span>LEGENDS.</span></h2>
              <div className="achievement-medal-cabinets">
                {CUPS.map((cup) => {
                  const cabinet = cupMedalCabinets[cup.id];
                  return <section className={`achievement-medal-cabinet cup-${cup.id}`} aria-label={`${cup.name}メダルコレクション`} key={cup.id}>
                    <header><span>{cup.name} MEDALS</span><small>{Object.values(cabinet).filter(Boolean).length}/3 COLLECTED</small></header>
                    <div>
                      {CUP_MEDAL_DEFINITIONS.map((medal) => {
                        const collected = cabinet[medal.id];
                        return <article className={`achievement-medal medal-${medal.id} ${collected ? "collected" : "locked"}`} key={medal.id}>
                          <i>{collected ? "★" : "?"}</i>
                          <span><b>{medal.name}</b><p>{cup.name}で総合{medal.placement}位</p><small>{collected ? `${medal.rank} · EARNED` : "LOCKED"}</small></span>
                        </article>;
                      })}
                    </div>
                  </section>;
                })}
              </div>
              <div className="achievement-grid">
                {ACHIEVEMENTS.map((achievement) => {
                  const unlockedAt = achievementStore.unlocked[achievement.id];
                  return <article className={unlockedAt ? "unlocked" : "locked"} key={achievement.id}>
                    <i>{unlockedAt ? achievement.icon : "??"}</i><span><b>{achievement.name}</b><p>{achievement.description}</p><small>{unlockedAt ? new Date(unlockedAt).toLocaleDateString("ja-JP") : "LOCKED"}</small></span>
                  </article>;
                })}
              </div>
              <button className="race-button" onClick={() => setPhase("title")}>BACK TO TITLE <span>←</span></button>
            </div>
          )}

          {phase === "time-trial-finished" && timeTrialResult && (
            <div className="game-overlay finish-overlay time-trial-finish-overlay">
              <div className="overlay-kicker">{runMode === "staff-record" ? "ADMIN STAFF GHOST RECORDED" : runMode === "gojo-line-record" ? "ADMIN GOJO LINE RECORDED" : timeTrialResult.isNewBest ? "NEW PERSONAL BEST" : "TIME ATTACK COMPLETE"}</div>
              <h2>{runMode === "staff-record" ? "STAFF DATA" : runMode === "gojo-line-record" ? "GOJO LINE" : timeTrialResult.isNewBest ? "NEW RECORD" : "FINISH TIME"}<br /><span>{formatTime(timeTrialResult.time)}</span></h2>
              <div className="ghost-result-grid">
                <span><b>PERSONAL BEST</b><em>{timeTrialResult.personalBest ? formatTime(timeTrialResult.personalBest) : "NO DATA"}</em></span>
                <span><b>{runMode === "gojo-line-record" ? "GOJO LINE SAMPLES" : "STAFF GHOST"}</b><em>{runMode === "gojo-line-record" ? lastGojoLine?.samples.length ?? 0 : timeTrialResult.staffTime ? formatTime(timeTrialResult.staffTime) : "NO DATA"}</em></span>
              </div>
              {runMode === "time-trial" && <div className="personal-best-ranking finish-ranking" aria-label="今回のコースの自己ベスト上位5件">
                <b>{timeTrialResult.resultRank ? `THIS RUN · ${timeTrialResult.resultRank}位` : "PERSONAL TOP 5"}</b>
                <ol>{Array.from({ length: 5 }, (_, index) => {
                  const rankedTime = timeTrialResult.personalTimes[index];
                  return <li key={index} className={`${rankedTime ? "recorded" : "empty"} ${timeTrialResult.resultRank === index + 1 ? "current" : ""}`}><span>{index + 1}</span><em>{rankedTime ? formatTime(rankedTime) : "--:--.--"}</em></li>;
                })}</ol>
              </div>}
              <div className="time-trial-actions">
                <button className="race-button" onClick={retryTimeTrial}>RETRY <span>↻</span></button>
                {runMode === "staff-record" && lastStaffGhost && <button className="staff-record-button" onClick={downloadStaffGhost}>DOWNLOAD .GHOST.JSON</button>}
                {runMode === "gojo-line-record" && lastGojoLine && <button className="staff-record-button" onClick={downloadGojoLine}>DOWNLOAD .GOJO-LINE.JSON</button>}
                <button className="character-back-button" onClick={openTimeTrial}>COURSE SELECT</button>
              </div>
            </div>
          )}

          {phase === "evolution-intro" && (
            <div className="game-overlay evolution-overlay">
              <div className="overlay-kicker">PLAY THE DEVELOPMENT HISTORY · 4 CHAPTERS / 12 BUILDS</div>
              <h2>EVOLUTION<br /><span>TOUR.</span></h2>
              <p>周回するたびにゲームが進化します。道路が重なる、川が板になる、雲が縦に刺さる――失敗も作品の一部です。</p>
              <div className="evolution-chapter-grid">
                {EVOLUTION_CHAPTERS.map((chapter, index) => (
                  <article className={index === evolutionChapterIndex ? "current" : ""} key={chapter.number}>
                    <b>{chapter.number}</b>
                    <span>{chapter.title}<small>{chapter.subtitle}</small></span>
                    <em>{chapter.milestones[0].version} → {chapter.milestones[2].version}</em>
                  </article>
                ))}
              </div>
              <div className="evolution-safety-note"><b>SAFE RECREATION</b><span>見た目は昔、接地・衝突・落下復帰は現在版。永久落下や操作不能までは再現しません。</span></div>
              <button className="race-button evolution-start-button" onClick={chooseEvolutionCharacter}>CHOOSE CHARACTER <span>→</span></button>
              <small className="pad-help">ENTER / × / A：キャラ選択　ESC / ○ / B：戻る</small>
            </div>
          )}

          {phase === "evolution-finished" && (
            <div className="game-overlay finish-overlay evolution-finish-overlay">
              <div className="overlay-kicker">CHAPTER {evolutionChapter.number} COMPLETE · {evolutionChapter.title}</div>
              <h2>THREE BUILDS<br /><span>EVOLVED.</span></h2>
              <div className="finish-result"><b>{finishPosition}<sup>{finishPosition === 1 ? "ST" : finishPosition === 2 ? "ND" : finishPosition === 3 ? "RD" : "TH"}</sup></b><span>{formatTime(finishTime)}</span></div>
              <div className="evolution-milestone-list">
                {evolutionChapter.milestones.map((milestone) => (
                  <span key={milestone.version}><b>{milestone.version}</b><i>{milestone.name}</i><em>✓</em></span>
                ))}
              </div>
              <button className="race-button evolution-start-button" onClick={nextEvolutionChapter}>NEXT CHAPTER · {EVOLUTION_CHAPTERS[evolutionChapterIndex + 1]?.title} <span>→</span></button>
            </div>
          )}

          {phase === "evolution-complete" && (
            <div className="game-overlay finish-overlay evolution-complete-overlay">
              <div className="overlay-kicker">12 DEVELOPMENT MILESTONES COMPLETE</div>
              <h2>FROM BROKEN<br /><span>TO BRILLIANT.</span></h2>
              <p>水色の板も、道路サンドイッチも、縦に刺さる雲も完走。失敗を消さずに積み重ねたから、現在のMOMON GRAND PRIXがあります。</p>
              <div className="evolution-complete-stats"><b>4<small>CHAPTERS</small></b><b>12<small>BUILDS</small></b><b>1<small>GAME</small></b></div>
              <div className="evolution-complete-actions">
                <button className="race-button evolution-start-button" onClick={replayEvolutionTour}>PLAY AGAIN <span>↻</span></button>
                <button className="character-back-button" onClick={returnToTitleFromRace}>BACK TO TITLE</button>
              </div>
            </div>
          )}

          {phase === "finished" && (
            <div className="game-overlay finish-overlay post-race-tour-overlay">
              <div className="post-race-camera-label"><i /> AUTO CAMERA TOUR · RACERS ON VICTORY LAP</div>
              <section className="post-race-tour-card" aria-label="レース結果">
                {randomQuestActive && currentRandomQuestResult ? (
                  <>
                    <div className="overlay-kicker">QUEST ROUND {courseIndex + 1}/3 COMPLETE · {CREATOR_THEME_LABELS[randomQuestCourse?.theme ?? "city"]}</div>
                    <div className="post-race-primary-result">
                      <span><small>YOUR FINISH</small><b>{finishPosition}<sup>{finishPosition === 1 ? "ST" : finishPosition === 2 ? "ND" : finishPosition === 3 ? "RD" : "TH"}</sup></b></span>
                      <span><small>QUEST CLEAR</small><b>{currentRandomQuestResult.cleared}<sup>/5</sup></b></span>
                    </div>
                    <div className="random-quest-score-breakdown">
                      <span><b>QUEST POINTS</b><em>+{currentRandomQuestResult.questPoints}</em></span>
                      <span><b>ACTION COMBO</b><em>+{currentRandomQuestResult.actionPoints}</em></span>
                      <span><b>QUEST CHAIN</b><em>+{currentRandomQuestResult.chainBonus}</em></span>
                      <span><b>RACE POSITION</b><em>+{currentRandomQuestResult.positionPoints}</em></span>
                      <span><b>NO CRASH</b><em>+{currentRandomQuestResult.noCrashBonus}</em></span>
                      <strong><b>COURSE SCORE</b><em>{currentRandomQuestResult.total}</em></strong>
                      <strong><b>TOUR TOTAL</b><em>{randomQuestTourTotal}</em></strong>
                    </div>
                    <button className="race-button post-race-next-button random-quest-next-button" onClick={nextCourse}>
                      <strong>{courseIndex < 2 ? `NEXT RANDOM COURSE · ${CREATOR_THEME_LABELS[randomQuestTour?.courses[courseIndex + 1]?.theme ?? "city"]}` : "VIEW FINAL SCORE"}</strong><span>→</span>
                      <small>ENTER / SPACE · × / A · TAP</small>
                    </button>
                  </>
                ) : (
                  <>
                    <div className="overlay-kicker">ROUND {courseIndex + 1} COMPLETE · {courseDefinition.name}</div>
                    <div className="post-race-primary-result">
                      <span><small>YOUR FINISH</small><b>{finishPosition}<sup>{finishPosition === 1 ? "ST" : finishPosition === 2 ? "ND" : finishPosition === 3 ? "RD" : "TH"}</sup></b></span>
                      <span><small>RACE TIME</small><b>{formatTime(finishTime)}</b></span>
                    </div>
                    <div className="result-grid post-race-result-grid">
                    {raceResultRows.map((result) => <span key={result.actorId}><b>{result.rank}. {racerNames[result.actorId]}</b><em>+{result.points} PT</em></span>)}
                    </div>
                    <button className="race-button post-race-next-button" onClick={nextCourse}>
                      <strong>NEXT COURSE · {cupCourses[courseIndex + 1]?.name}</strong><span>→</span>
                      <small>ENTER / SPACE · × / A · TAP</small>
                    </button>
                  </>
                )}
              </section>
            </div>
          )}

          {phase === "random-quest-complete" && (
            <div className="game-overlay finish-overlay random-quest-complete-overlay">
              <div className="overlay-kicker">THREE RANDOM CIRCUITS COMPLETE · SEED {randomQuestTour?.seed ?? 0}</div>
              <h2>QUEST TOUR<br /><span>COMPLETE.</span></h2>
              <div className="random-quest-final-score"><small>FINAL SCORE</small><b>{randomQuestFinalScore.toLocaleString()}</b><span>POINTS</span></div>
              <div className="random-quest-round-summary">
                {randomQuestRoundResults.map((result) => (
                  <article key={result.courseIndex}>
                    <b>0{result.courseIndex + 1}</b>
                    <span>{CREATOR_THEME_LABELS[randomQuestTour?.courses[result.courseIndex]?.theme ?? "city"]}<small>{result.cleared}/5 QUESTS · {result.position} PLACE</small></span>
                    <em>{result.total} PT</em>
                  </article>
                ))}
              </div>
              <section className="random-quest-leaderboard">
                <header><span>LOCAL TOP 5</span><small>この端末の記録</small></header>
                {randomQuestLeaderboard.map((score, index) => <div className={score === randomQuestFinalScore ? "current" : ""} key={`${score}-${index}`}><b>{index + 1}</b><span>{score.toLocaleString()} PT</span></div>)}
              </section>
              <div className="random-quest-final-actions">
                <button className="race-button random-quest-button" onClick={openRandomQuestTour}>NEW QUEST TOUR <span>↻</span></button>
                <button className="character-back-button" onClick={returnToTitleFromRace}>BACK TO TITLE</button>
              </div>
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
              <button className="character-back-button tuning-open-button" onClick={openMachineTuning}>TUNING · {tuningPreset}</button>
              <small className="pad-help">ENTER / A · START SECRET DUEL　T / ↑ · TUNING</small>
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

          {phase === "ultimate-gojo-finished" && (
            <div className="game-overlay finish-overlay gojo-overlay ultimate-gojo-finish-overlay">
              <div className="overlay-kicker">ULTIMATE DUEL COMPLETE · {courseDefinition.name}</div>
              <h2>{finishPosition === 1 ? "ULTIMATE GOJO" : "GOJO"}<br /><span>{finishPosition === 1 ? "DEFEATED." : "UNLEASHED."}</span></h2>
              <div className="finish-result"><b>{finishPosition}<sup>{finishPosition === 1 ? "ST" : "ND"}</sup></b><span>{formatTime(finishTime)}</span></div>
              <p>{finishPosition === 1 ? "10個の実績に続き、本気Gojoも撃破しました。" : "15秒スキルの本気Gojoが再戦を待っています。"}</p>
              <div className="ultimate-gojo-finish-actions">
                <button className="race-button ultimate-gojo-start-button" onClick={retryUltimateGojo}>RETRY <span>↻</span></button>
                <button className="character-back-button" onClick={returnToUltimateGojoSelect}>COURSE SELECT</button>
                <button className="character-back-button" onClick={returnToTitleFromRace}>TITLE</button>
              </div>
            </div>
          )}

          {phase === "award-ceremony" && currentCupMedal && (
            <div className={`game-overlay finish-overlay award-ceremony-overlay award-${currentCupMedal}`} aria-live="polite">
              <div className="award-stage-light award-stage-light-left" aria-hidden="true" />
              <div className="award-stage-light award-stage-light-right" aria-hidden="true" />
              <div className="award-confetti" aria-hidden="true">
                {Array.from({ length: currentCupMedal === "gold" ? 42 : 30 }, (_, index) => (
                  <i
                    key={index}
                    style={{
                      left: `${(index * 37) % 100}%`,
                      animationDelay: `${(index % 11) * -0.17}s`,
                      animationDuration: `${2.2 + (index % 7) * 0.18}s`,
                    }}
                  />
                ))}
              </div>
              <div className="overlay-kicker">{activeCup.name} · GRAND PRIX AWARDS</div>
              <h2>{currentCupMedal === "gold" ? "GOLD" : currentCupMedal === "silver" ? "SILVER" : "BRONZE"}<br /><span>AWARD.</span></h2>
              <div className="award-podium" aria-label={`${activeCup.name} 総合表彰台`}>
                {awardPodiumOrder.map((actorId) => {
                  const rank = championshipOrder.indexOf(actorId) + 1;
                  return (
                    <div
                      className={`award-podium-entry award-rank-${rank} ${actorId === 0 ? "player-award" : ""}`}
                      aria-label={`${rank}位 ${championshipRacerNames[actorId]}${actorId === 0 ? "、あなた" : ""}`}
                      key={actorId}
                    >
                      {actorId === 0 && <span className="award-player-badge">▼ YOU</span>}
                      <span className="award-racer-marker">{championshipRacerNames[actorId]?.slice(0, 1)}</span>
                      <b>{championshipRacerNames[actorId]}</b>
                      <div><i>{rank}</i><small>{rank === 1 ? "GOLD" : rank === 2 ? "SILVER" : "BRONZE"}</small></div>
                    </div>
                  );
                })}
              </div>
              <div className={`player-medal-card medal-${currentCupMedal}`}>
                <i>★</i>
                <span><small>YOU EARNED</small><b>{currentCupMedal === "gold" ? "金賞" : currentCupMedal === "silver" ? "銀賞" : "銅賞"}</b><em>総合 {playerCupRank}位</em></span>
              </div>
              <button className="race-button award-continue-button" disabled={!awardCeremonyCanContinue} onClick={continueFromAwardCeremony}>
                {awardCeremonyCanContinue ? <>GRAND PRIX RESULTS <span>→</span></> : <>PRESENTING...</>}
              </button>
              <small className="pad-help">ENTER / A · VIEW FINAL STANDINGS</small>
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

      </section>
    </main>
  );
}
