"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { RacePauseButton } from "./race-pause-button";
import {
  LegacyEvolutionPlayer,
  preloadLegacyBuild,
  type LegacyCupId,
  type LegacyGamepadBindings,
  type LegacyKeyBindings,
  type LegacyVersionKey,
} from "./legacy-evolution-player";

type ArchiveBuild = {
  version: string;
  key: LegacyVersionKey;
  course: string;
  courseIndex: number;
  title: string;
  changes: string[];
  cupId: LegacyCupId;
  laps?: number;
  gojoDuel?: boolean;
};

type ArchiveTour = {
  id: "origin" | "adventure" | "skills";
  name: string;
  subtitle: string;
  accent: string;
  builds: ArchiveBuild[];
};

type DiscoveryId = "v1-origin" | "v3-reverse" | "v7-overlap" | "v11-lookback" | "v11-flat" | "v15-drift" | "v76-slope" | "v23-river" | "v23-pirate" | "v23-cloud" | "v81-octopus" | "v94-skill" | "v94-gojo";
type Discovery = { id: DiscoveryId; version: string; course: string; title: string; hint: string; detail: string };

const DISCOVERY_STORAGE_KEY = "momon-evolution-bug-archive-v1";
const DISCOVERIES: Discovery[] = [
  { id: "v1-origin", version: "V1", course: "NEON CIRCUIT", title: "すべては平面から始まった", hint: "V1をスタートする", detail: "立体コースになる前の、2D見下ろし型だった最初の試作版です。" },
  { id: "v3-reverse", version: "V3", course: "NEON CIRCUIT 3D", title: "右へ行きたい？ 左を押せ", hint: "V3でハンドルを切る", detail: "左右入力と旋回方向の符号が逆に接続され、意図した方向と反対へ曲がっていました。" },
  { id: "v7-overlap", version: "V7", course: "ELEVATED CITY", title: "道路のミルフィーユ", hint: "道路が重なる地点へ到達する", detail: "立体化した道路同士の距離を検査していなかったため、別区間が同じ空間へ重なりました。" },
  { id: "v11-lookback", version: "V11", course: "TECHNICAL CITY", title: "前を見て運転してください", hint: "V11でハンドルを切る", detail: "ハンドル入力に合わせる画像フレームの向きが逆で、曲がるたびにキャラクターが後ろを振り返りました。" },
  { id: "v11-flat", version: "V11", course: "TECHNICAL CITY", title: "ペラペラにもほどがある", hint: "V11でクラッシュする", detail: "キャラクターが立体モデルではなく一枚の画像だったため、回転すると板の薄さがそのまま見えました。" },
  { id: "v15-drift", version: "V15", course: "PRISM CITY", title: "曲がるより、まず滑れ", hint: "V15でドリフトする", detail: "ここで初めてドリフトとドリフトゲージがゲームへ入りました。" },
  { id: "v76-slope", version: "V76", course: "CENTRAL CITY", title: "道路と車体、まさかの合体", hint: "傾斜区間を走行する", detail: "車体の向きと路面傾斜の回転軸が分離し、坂で後輪が浮いたり路面へめり込んだりしました。" },
  { id: "v23-river", version: "V23", course: "RAPIDWOOD RUN", title: "川、立つ。", hint: "路面に刺さった川へ到達する", detail: "水面の回転軸が道路の進行方向と合わず、水の板が路面へ垂直に刺さっていました。" },
  { id: "v23-pirate", version: "V23", course: "BLACKWAKE GALLEON", title: "船内なのに本日快晴", hint: "船内区間へ到達する", detail: "船内用の天井と遮光がまだなく、船倉へ入っても青空がそのまま見えていました。" },
  { id: "v23-cloud", version: "V23", course: "CLOUDLOFT CIRCUIT", title: "雲（建築資材）", hint: "板状の雲がある地点へ到達する", detail: "雲を薄い箱形の路面として配置したため、柔らかい雲ではなく白い板に見えていました。" },
  { id: "v81-octopus", version: "V81", course: "BLACKWAKE GALLEON", title: "君、本当にタコで合ってる？", hint: "3周目の巨大タコへ到達する", detail: "本体と複数の触手が離れた位置で別々に動き、ひとつの生物としてつながって見えませんでした。" },
  { id: "v94-skill", version: "V94", course: "CENTRAL CITY", title: "昔の能力、だいぶ物騒", hint: "旧スキルを使用する", detail: "現在の運転技術型スキルになる前は、追尾攻撃・衝撃波・隕石などの攻撃型能力でした。" },
  { id: "v94-gojo", version: "V94", course: "CELESTIAL PRISM", title: "バグを制す者、Gojoを制す", hint: "当時のGojoを倒す", detail: "すべてのアーカイブを走り、旧仕様のGojoとの最終決戦に勝利した証です。" },
];

const ARCHIVE_TOURS: ArchiveTour[] = [
  {
    id: "origin",
    name: "ORIGIN CUP",
    subtitle: "最初の2D試作から、坂道接地が崩れたV76までを6ステージで追体験",
    accent: "#f3a83b",
    builds: [
      { version: "V1", key: "v1", cupId: "basic", course: "NEON CIRCUIT", courseIndex: 0, title: "THE FIRST PROTOTYPE", changes: ["2D見下ろし型カートレースの初版", "1周・4台による最小構成", "当時のコース、自機、操作感をそのまま収録"] },
      { version: "V3", key: "v3", cupId: "basic", course: "NEON CIRCUIT 3D", courseIndex: 0, title: "3D RUNTIME ONLINE", changes: ["自機後方カメラのフル3D版", "Three.jsをブラウザ側で読み込む構成へ修正", "最初期のオーバルコースと3Dカート"] },
      { version: "V7", key: "v7", cupId: "basic", course: "ELEVATED CITY", courseIndex: 0, title: "ELEVATION CHAOS", changes: ["コースを約3倍へ延長", "S字・クランク・アップダウンを導入", "AURORAとNOVAを含むアイテム戦"] },
      { version: "V11", key: "v11", cupId: "basic", course: "TECHNICAL CITY", courseIndex: 0, title: "ANIMAL DRIVERS", changes: ["4台すべてに動物ドライバーを追加", "CPU速度を引き上げて難易度を強化", "当時の接地補正と立体コースを維持"] },
      { version: "V15", key: "v15", cupId: "basic", course: "PRISM CITY", courseIndex: 0, title: "CONTROLLER ERA", changes: ["ドライバーのヘルメットを廃止", "PS4コントローラー操作に対応", "動物の顔とドリフトを備えた初期完成形"] },
      { version: "V76", key: "v76", cupId: "basic", course: "CENTRAL CITY", courseIndex: 0, title: "SLOPE CONTACT TROUBLE", changes: ["固定60Hz化後の坂道接地を調整", "車体の向きと路面傾斜を別々に処理", "後輪が浮く・路面へめり込む現象が発生"] },
    ],
  },
  {
    id: "adventure",
    name: "ADVENTURE CUP",
    subtitle: "川・海賊船・雲が『色付きの板』から世界へ変わる過程を7ステージで比較",
    accent: "#5fe2de",
    builds: [
      { version: "V23", key: "v23", cupId: "adventure", course: "RAPIDWOOD RUN", courseIndex: 0, title: "RIVER DEBUT", changes: ["アドベンチャーカップ初登場", "川コースの最初の実装", "水色の板に見えた当時の水面と流木"] },
      { version: "V24", key: "v24", cupId: "adventure", course: "RAPIDWOOD RUN", courseIndex: 0, title: "WATER REBUILT", changes: ["川を部分的な走行ラインへ再配置", "透明感と流れを持つ水面へ更新", "流木を壁と同じ反発障害物へ変更"] },
      { version: "V23", key: "v23", cupId: "adventure", course: "BLACKWAKE GALLEON", courseIndex: 2, title: "PIRATE COURSE DEBUT", changes: ["海賊船コースの最初の実装", "甲板と船内を模した初期ルート", "大砲ギミック登場前の構成"] },
      { version: "V30", key: "v30", cupId: "adventure", course: "BLACKWAKE GALLEON", courseIndex: 2, title: "SHIP EXPANSION", changes: ["海賊船を約二回り大型化", "甲板と船内にS字・急カーブを追加", "船内へ続くテクニカルルートを拡張"] },
      { version: "V81", key: "v81", cupId: "adventure", course: "BLACKWAKE GALLEON", courseIndex: 1, laps: 3, title: "OCTOPUS DEBUT", changes: ["3周目限定の巨大タコを初実装", "本体と3本の触手を別々に配置", "何が襲っているのか分かりづらい初期形状"] },
      { version: "V23", key: "v23", cupId: "adventure", course: "CLOUDLOFT CIRCUIT", courseIndex: 1, title: "CLOUD COURSE DEBUT", changes: ["雲コースの最初の実装", "白い板状だった初期の雲路面", "消える路面と豆の木ギミック"] },
      { version: "V26", key: "v26", cupId: "adventure", course: "CLOUDLOFT CIRCUIT", courseIndex: 1, title: "CLOUD CUES", changes: ["消える場所を路面上で視覚化", "甲板側の海と青空も同時に改善", "初期版から読みやすくなった雲上コース"] },
    ],
  },
  {
    id: "skills",
    name: "OLD SKILL CUP",
    subtitle: "攻撃型スキル時代を走り、最後は当時のGojoと5周勝負",
    accent: "#d57cff",
    builds: [
      { version: "V94", key: "v94", cupId: "basic", course: "CENTRAL CITY", courseIndex: 0, laps: 3, title: "OLD SKILL ARSENAL", changes: ["GIANT LEAPとCHAIN SEEKERは30秒", "SHOCK RINGとMETEOR SHOWERを収録", "3周・4キャラクターから選択可能"] },
      { version: "V94", key: "v94", cupId: "basic", course: "CELESTIAL PRISM", courseIndex: 2, laps: 5, gojoDuel: true, title: "FINAL ARCHIVE DUEL", changes: ["選択したキャラクターを引き継ぐ", "旧OMNI INSTINCTのGojoと1対1", "当時と同じ5周制の最終決戦"] },
    ],
  },
];

type TourScreen = "select" | "archive" | "transition" | "race" | "complete";
type TourSelectFocus = "tours" | "character" | "start" | "archive" | "back";
const MINIMUM_LOADING_MS = 1500;
const FINAL_RESULT_MS = 1800;
const OLD_SKILL_CHARACTERS = [
  { name: "GIANT", badge: "GT", skill: "GIANT LEAP" },
  { name: "PIXEL", badge: "PX", skill: "CHAIN SEEKER" },
  { name: "VOLT", badge: "VT", skill: "SHOCK RING" },
  { name: "COMET", badge: "CM", skill: "METEOR SHOWER" },
] as const;

export function LegacyEvolutionTour({ onExit, onComplete, keyBindings, gamepadBindings }: { onExit: () => void; onComplete?: () => void; keyBindings: LegacyKeyBindings; gamepadBindings: LegacyGamepadBindings }) {
  const [selectedTourIndex, setSelectedTourIndex] = useState(0);
  const [activeTourIndex, setActiveTourIndex] = useState(0);
  const [buildIndex, setBuildIndex] = useState(0);
  const [screen, setScreen] = useState<TourScreen>("select");
  const [transitionFrom, setTransitionFrom] = useState<ArchiveBuild | null>(null);
  const [transitionTo, setTransitionTo] = useState<ArchiveBuild | null>(null);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseFocus, setPauseFocus] = useState<0 | 1>(1);
  const [selectFocus, setSelectFocus] = useState<TourSelectFocus>("tours");
  const [lastResult, setLastResult] = useState<{ time: number; position: number } | null>(null);
  const [oldSkillCharacterIndex, setOldSkillCharacterIndex] = useState(0);
  const [unlockedDiscoveries, setUnlockedDiscoveries] = useState<Set<DiscoveryId>>(new Set());
  const [discoveryPopup, setDiscoveryPopup] = useState<Discovery | null>(null);
  const transitionTimer = useRef<number | null>(null);
  const discoveryTimer = useRef<number | null>(null);
  const padHeld = useRef({ left: false, right: false, up: false, down: false, confirm: false, back: false, pause: false });
  const padMenuArmed = useRef(false);

  const selectedTour = ARCHIVE_TOURS[selectedTourIndex];
  const activeTour = ARCHIVE_TOURS[activeTourIndex];
  const activeBuild = activeTour.builds[buildIndex];

  const moveSelectFocus = useCallback((direction: -1 | 1) => {
    const focusOrder: TourSelectFocus[] = selectedTour.id === "skills"
      ? ["tours", "character", "start", "archive", "back"]
      : ["tours", "start", "archive", "back"];
    setSelectFocus((current) => {
      const currentIndex = Math.max(0, focusOrder.indexOf(current));
      return focusOrder[Math.max(0, Math.min(focusOrder.length - 1, currentIndex + direction))];
    });
  }, [selectedTour.id]);

  useEffect(() => {
    if (selectedTour.id !== "skills" && selectFocus === "character") setSelectFocus("start");
  }, [selectFocus, selectedTour.id]);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(DISCOVERY_STORAGE_KEY) ?? "[]") as string[];
      setUnlockedDiscoveries(new Set(stored.filter((id): id is DiscoveryId => DISCOVERIES.some((entry) => entry.id === id))));
    } catch {
      setUnlockedDiscoveries(new Set());
    }
  }, []);

  const unlockDiscovery = useCallback((id: DiscoveryId) => {
    setUnlockedDiscoveries((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      try { window.localStorage.setItem(DISCOVERY_STORAGE_KEY, JSON.stringify([...next])); } catch { /* local-only archive */ }
      const discovery = DISCOVERIES.find((entry) => entry.id === id) ?? null;
      setDiscoveryPopup(discovery);
      if (discoveryTimer.current !== null) window.clearTimeout(discoveryTimer.current);
      discoveryTimer.current = window.setTimeout(() => setDiscoveryPopup(null), 3000);
      return next;
    });
  }, []);

  const clearTransitionTimer = useCallback(() => {
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
    transitionTimer.current = null;
  }, []);

  useEffect(() => () => {
    clearTransitionTimer();
    if (discoveryTimer.current !== null) window.clearTimeout(discoveryTimer.current);
  }, [clearTransitionTimer]);

  const loadThenRace = useCallback((build: ArchiveBuild, nextIndex: number) => {
    const minimum = new Promise<void>((resolve) => {
      transitionTimer.current = window.setTimeout(resolve, MINIMUM_LOADING_MS);
    });
    void Promise.all([preloadLegacyBuild(build.key), minimum]).then(() => {
      setBuildIndex(nextIndex);
      setTransitionFrom(null);
      setTransitionTo(null);
      setScreen("race");
    });
  }, []);

  const beginTour = useCallback(() => {
    clearTransitionTimer();
    const tour = ARCHIVE_TOURS[selectedTourIndex];
    const first = tour.builds[0];
    setActiveTourIndex(selectedTourIndex);
    setBuildIndex(0);
    setLastResult(null);
    setTransitionFrom(null);
    setTransitionTo(first);
    setScreen("transition");
    loadThenRace(first, 0);
  }, [clearTransitionTimer, loadThenRace, selectedTourIndex]);

  const activateSelectFocus = useCallback(() => {
    if (selectFocus === "archive") {
      setScreen("archive");
      return;
    }
    if (selectFocus === "back") {
      onExit();
      return;
    }
    beginTour();
  }, [beginTour, onExit, selectFocus]);

  const finishBuild = useCallback((detail: { time?: number; position?: number }) => {
    if (screen !== "race") return;
    const finishedBuild = activeTour.builds[buildIndex];
    const nextBuild = activeTour.builds[buildIndex + 1];
    setLastResult({ time: detail.time ?? 0, position: detail.position ?? 1 });
    setTransitionFrom(finishedBuild);
    setTransitionTo(nextBuild ?? null);
    setScreen("transition");
    clearTransitionTimer();

    if (finishedBuild.key === "v94" && finishedBuild.gojoDuel && (detail.position ?? 1) === 1) unlockDiscovery("v94-gojo");

    if (nextBuild) {
      loadThenRace(nextBuild, buildIndex + 1);
    } else {
      transitionTimer.current = window.setTimeout(() => {
        setScreen("complete");
        onComplete?.();
      }, FINAL_RESULT_MS);
    }
  }, [activeTour.builds, buildIndex, clearTransitionTimer, loadThenRace, onComplete, screen, unlockDiscovery]);

  const requestPause = useCallback(() => {
    setPauseFocus(1);
    setPauseOpen(true);
  }, []);
  const closePause = useCallback(() => setPauseOpen(false), []);
  const confirmPause = useCallback(() => {
    if (pauseFocus === 0) onExit();
    else closePause();
  }, [closePause, onExit, pauseFocus]);
  const handlePausedKey = useCallback((event: KeyboardEvent) => {
    if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") setPauseFocus(0);
    else if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") setPauseFocus(1);
    else if (event.key === "Enter" || event.key === " ") confirmPause();
    else if (event.key === "Escape") closePause();
  }, [closePause, confirmPause]);

  const replay = useCallback(() => {
    setSelectedTourIndex(activeTourIndex);
    setScreen("select");
    setBuildIndex(0);
    setLastResult(null);
  }, [activeTourIndex]);

  useEffect(() => {
    if (screen !== "race" || !activeBuild) return;
    if (activeBuild.key === "v1") unlockDiscovery("v1-origin");

    const telemetry = (event: Event) => {
      const detail = (event as CustomEvent<{ version?: string; progress?: number; driftGauge?: number; driftDashing?: boolean }>).detail ?? {};
      if (detail.version !== activeBuild.version) return;
      const progress = Number(detail.progress ?? 0);
      const lapProgress = ((progress % 1) + 1) % 1;
      if (activeBuild.key === "v7" && lapProgress >= 0.79) unlockDiscovery("v7-overlap");
      if (activeBuild.key === "v15" && (Number(detail.driftGauge ?? 0) > 0 || detail.driftDashing)) unlockDiscovery("v15-drift");
      if (activeBuild.key === "v76" && lapProgress >= 0.12 && lapProgress <= 0.58) unlockDiscovery("v76-slope");
      if (activeBuild.key === "v23" && activeBuild.course === "RAPIDWOOD RUN" && lapProgress >= 0.1) unlockDiscovery("v23-river");
      if (activeBuild.key === "v23" && activeBuild.course === "BLACKWAKE GALLEON" && lapProgress >= 0.2) unlockDiscovery("v23-pirate");
      if (activeBuild.key === "v23" && activeBuild.course === "CLOUDLOFT CIRCUIT" && lapProgress >= 0.08) unlockDiscovery("v23-cloud");
      if (activeBuild.key === "v81" && progress >= 2.82) unlockDiscovery("v81-octopus");
    };
    const action = (event: Event) => {
      const detail = (event as CustomEvent<{ version?: string; action?: string }>).detail ?? {};
      if (detail.version !== activeBuild.version) return;
      if (activeBuild.key === "v3" && detail.action === "steer") unlockDiscovery("v3-reverse");
      if (activeBuild.key === "v11" && detail.action === "steer") unlockDiscovery("v11-lookback");
      if (activeBuild.key === "v11" && detail.action === "crash") unlockDiscovery("v11-flat");
      if (activeBuild.key === "v94" && !activeBuild.gojoDuel && detail.action === "skill") unlockDiscovery("v94-skill");
    };
    window.addEventListener("evolution:legacy-telemetry", telemetry);
    window.addEventListener("evolution:legacy-action", action);
    return () => {
      window.removeEventListener("evolution:legacy-telemetry", telemetry);
      window.removeEventListener("evolution:legacy-action", action);
    };
  }, [activeBuild, screen, unlockDiscovery]);

  useEffect(() => {
    if (screen === "race") return;
    const keyboard = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      if (screen === "select") {
        if (["arrowleft", "a"].includes(key) && selectFocus === "tours") setSelectedTourIndex((value) => (value + ARCHIVE_TOURS.length - 1) % ARCHIVE_TOURS.length);
        else if (["arrowright", "d"].includes(key) && selectFocus === "tours") setSelectedTourIndex((value) => (value + 1) % ARCHIVE_TOURS.length);
        else if (["arrowleft", "a"].includes(key) && selectFocus === "character") setOldSkillCharacterIndex((value) => (value + OLD_SKILL_CHARACTERS.length - 1) % OLD_SKILL_CHARACTERS.length);
        else if (["arrowright", "d"].includes(key) && selectFocus === "character") setOldSkillCharacterIndex((value) => (value + 1) % OLD_SKILL_CHARACTERS.length);
        else if (["arrowup", "w"].includes(key)) moveSelectFocus(-1);
        else if (["arrowdown", "s"].includes(key)) moveSelectFocus(1);
        else if (key === "b") setScreen("archive");
        else if (key === "enter" || key === " ") activateSelectFocus();
        else if (key === "escape") onExit();
      } else if (screen === "archive") {
        if (key === "escape" || key === "b" || key === "backspace") setScreen("select");
      } else if (screen === "complete") {
        if (key === "enter" || key === " ") replay();
        else if (key === "escape") onExit();
      } else if (screen === "transition" && key === "escape") onExit();
    };
    window.addEventListener("keydown", keyboard, { passive: false });
    return () => window.removeEventListener("keydown", keyboard);
  }, [activateSelectFocus, moveSelectFocus, onExit, replay, screen, selectFocus]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      let pad: Gamepad | null = null;
      try { pad = Array.from(navigator.getGamepads?.() ?? []).find((entry): entry is Gamepad => Boolean(entry?.connected)) ?? null; } catch { pad = null; }
      const pressed = (index: number) => Boolean(pad?.buttons[index]?.pressed || (pad?.buttons[index]?.value ?? 0) > 0.55);
      const axis = pad?.axes[0] ?? 0;
      const verticalAxis = pad?.axes[1] ?? 0;
      const current = { left: pressed(14) || axis < -0.62, right: pressed(15) || axis > 0.62, up: pressed(12) || verticalAxis < -0.62, down: pressed(13) || verticalAxis > 0.62, confirm: pressed(0), back: pressed(1), pause: pressed(9) };
      const previous = padHeld.current;
      const anyMenuInputHeld = Object.values(current).some(Boolean);
      if (!padMenuArmed.current) {
        // The same confirm press used on the title screen can still be held when
        // this component mounts.  Establish a neutral frame before accepting a
        // new menu edge so EVOLUTION TOUR cannot immediately start cup 1.
        padHeld.current = current;
        if (!anyMenuInputHeld) padMenuArmed.current = true;
        frame = requestAnimationFrame(tick);
        return;
      }
      if (pauseOpen) {
        if (current.left && !previous.left) setPauseFocus(0);
        if (current.right && !previous.right) setPauseFocus(1);
        if (current.confirm && !previous.confirm) confirmPause();
        if ((current.back && !previous.back) || (current.pause && !previous.pause)) closePause();
      } else if (screen === "select") {
        if (selectFocus === "tours" && current.left && !previous.left) setSelectedTourIndex((value) => (value + ARCHIVE_TOURS.length - 1) % ARCHIVE_TOURS.length);
        if (selectFocus === "tours" && current.right && !previous.right) setSelectedTourIndex((value) => (value + 1) % ARCHIVE_TOURS.length);
        if (selectFocus === "character" && current.left && !previous.left) setOldSkillCharacterIndex((value) => (value + OLD_SKILL_CHARACTERS.length - 1) % OLD_SKILL_CHARACTERS.length);
        if (selectFocus === "character" && current.right && !previous.right) setOldSkillCharacterIndex((value) => (value + 1) % OLD_SKILL_CHARACTERS.length);
        if (current.up && !previous.up) moveSelectFocus(-1);
        if (current.down && !previous.down) moveSelectFocus(1);
        if (current.confirm && !previous.confirm) activateSelectFocus();
        if (current.back && !previous.back) onExit();
      } else if (screen === "archive") {
        if (current.back && !previous.back) setScreen("select");
      } else if (screen === "race") {
        if (current.pause && !previous.pause) requestPause();
      } else if (screen === "complete") {
        if (current.confirm && !previous.confirm) replay();
        if (current.back && !previous.back) onExit();
      } else if (screen === "transition" && current.back && !previous.back) onExit();
      padHeld.current = current;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [activateSelectFocus, closePause, confirmPause, moveSelectFocus, onExit, pauseOpen, replay, requestPause, screen, selectFocus]);

  const transitionTarget = transitionTo ?? transitionFrom;
  const transitionKind = transitionTo ? "LOADING ARCHIVED BUILD" : transitionFrom ? "ARCHIVE RUN COMPLETE" : "LOADING ARCHIVED BUILD";

  return (
    <main className="legacy-tour-shell" style={{ "--tour-accent": activeTour.accent } as CSSProperties}>
      {screen === "select" && (
        <section className="legacy-tour-select">
          <div className="legacy-tour-kicker">ACTUAL ARCHIVED BUILDS · NOT A RECREATION</div>
          <h1>EVOLUTION <em>TOUR</em></h1>
          <p>保存された当時のゲーム本体を、ステージごとに丸ごと交換します。コース、自機、物理、アイテム、未完成な見た目も当時のままです。</p>
          <div className="legacy-tour-cups">
            {ARCHIVE_TOURS.map((tour, index) => (
              <button className={`${selectedTourIndex === index ? "selected" : ""} ${selectFocus === "tours" && selectedTourIndex === index ? "menu-focus" : ""}`} style={{ "--card-accent": tour.accent } as CSSProperties} key={tour.id} onMouseEnter={() => { setSelectedTourIndex(index); setSelectFocus("tours"); }} onClick={() => { setSelectedTourIndex(index); setSelectFocus("tours"); }}>
                <span>0{index + 1}</span><strong>{tour.name}</strong><p>{tour.subtitle}</p>
                <div>{tour.builds.map((build) => <i key={`${build.version}-${build.course}`}>{build.version}</i>)}</div>
                <small>{tour.builds.length} ARCHIVED STAGES</small>
              </button>
            ))}
          </div>
          <div className="legacy-tour-sequence">
            {selectedTour.builds.map((build, index) => <span key={`${build.version}-${build.course}`}><b>{build.version}</b><i>{build.course}</i>{index < selectedTour.builds.length - 1 && <em>→</em>}</span>)}
          </div>
          {selectedTour.id === "skills" && (
            <div className="legacy-skill-character-picker">
              <span>OLD SKILL RACER</span>
              <div>{OLD_SKILL_CHARACTERS.map((character, index) => (
                <button className={`${oldSkillCharacterIndex === index ? "selected" : ""} ${selectFocus === "character" && oldSkillCharacterIndex === index ? "menu-focus" : ""}`} key={character.name} onMouseEnter={() => setSelectFocus("character")} onClick={() => { setOldSkillCharacterIndex(index); setSelectFocus("character"); }}>
                  <b>{character.badge}</b><strong>{character.name}</strong><small>{character.skill}</small>
                </button>
              ))}</div>
            </div>
          )}
          <button className={`legacy-tour-start ${selectFocus === "start" ? "menu-focus" : ""}`} onMouseEnter={() => setSelectFocus("start")} onClick={beginTour}>START {selectedTour.name}<span>→</span></button>
          <button className={`legacy-bug-archive-button ${selectFocus === "archive" ? "menu-focus" : ""}`} onMouseEnter={() => setSelectFocus("archive")} onClick={() => setScreen("archive")}><b>BUG ARCHIVE</b><span>{unlockedDiscoveries.size} / {DISCOVERIES.length}</span></button>
          <button className={`legacy-tour-back ${selectFocus === "back" ? "menu-focus" : ""}`} onMouseEnter={() => setSelectFocus("back")} onClick={onExit}>← BACK TO TITLE</button>
          <small>↑ ↓：項目移動　← →：カップ／キャラ選択　ENTER / × / A：決定　ESC / ○ / B：戻る</small>
        </section>
      )}

      {screen === "archive" && (
        <section className="legacy-bug-archive">
          <div className="legacy-tour-kicker">EVOLUTION TOUR ONLY</div>
          <h1>BUG <em>ARCHIVE</em></h1>
          <p>旧版を実際に走って、開発途中の不具合や変化を見つけよう。</p>
          <div className="legacy-bug-progress"><i style={{ width: `${unlockedDiscoveries.size / DISCOVERIES.length * 100}%` }} /><b>{unlockedDiscoveries.size} / {DISCOVERIES.length} DISCOVERED</b></div>
          <div className="legacy-bug-grid">
            {DISCOVERIES.map((discovery, index) => {
              const unlocked = unlockedDiscoveries.has(discovery.id);
              return <article className={unlocked ? "unlocked" : "locked"} key={discovery.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><small>{unlocked ? `${discovery.version} · ${discovery.course}` : "UNDISCOVERED"}</small><h2>{unlocked ? discovery.title : "？？？？？？"}</h2><p>{unlocked ? discovery.detail : discovery.hint}</p></div>
              </article>;
            })}
          </div>
          <button className="legacy-tour-back" onClick={() => setScreen("select")}>BACK TO TOUR</button>
        </section>
      )}

      {screen === "race" && activeBuild && (
        <section className="legacy-tour-race">
          {!pauseOpen && <RacePauseButton onPause={requestPause} />}
          <LegacyEvolutionPlayer version={activeBuild.key} versionLabel={activeBuild.version} courseIndex={activeBuild.courseIndex} cupId={activeBuild.cupId} gojoDuel={activeBuild.gojoDuel} characterIndex={oldSkillCharacterIndex} laps={activeBuild.laps ?? 1} keyBindings={keyBindings} gamepadBindings={gamepadBindings} paused={pauseOpen} onFinish={finishBuild} onEscape={requestPause} onPausedKey={handlePausedKey} />
          {discoveryPopup && <div className="legacy-discovery-popup"><span>BUG DISCOVERED</span><b>{discoveryPopup.title}</b><small>{discoveryPopup.version} · {discoveryPopup.course}</small></div>}
        </section>
      )}

      {screen === "transition" && transitionTarget && (
        <section className="legacy-version-transition" key={`${transitionFrom?.version ?? "boot"}-${transitionTarget.version}-${transitionTarget.course}`}>
          <div className="transition-grid" />
          <div className="transition-content">
            <div className="legacy-tour-kicker">{transitionKind}</div>
            <div className="transition-version-row">
              <strong>{transitionTarget.version}</strong>
            </div>
            <h2>{transitionTarget.title}</h2>
            <p>{transitionTarget.course}</p>
            <div className="transition-changes">
              {transitionTarget.changes.map((change, index) => <div key={change} style={{ "--change-index": index } as CSSProperties}><b>0{index + 1}</b><span>{change}</span></div>)}
            </div>
            {lastResult && transitionFrom && <div className="transition-result">LAST STAGE · {lastResult.position} PLACE · {(lastResult.time / 1000).toFixed(2)}s</div>}
          </div>
          <div className="transition-loader"><i /><span>{transitionTo ? `旧${transitionTarget.version}のコース・物理・アイテムを読み込み中` : "TOUR RESULTを整理中"}</span></div>
          <button className="transition-exit" onClick={onExit}>← BACK · EXIT TOUR</button>
        </section>
      )}

      {screen === "complete" && (
        <section className="legacy-tour-complete">
          <div className="legacy-tour-kicker">DEVELOPMENT ARCHIVE COMPLETE</div>
          <h1>{activeTour.name}<br /><em>EVOLVED.</em></h1>
          <p>{activeTour.builds.length}本の旧版を、当時のゲーム内容で完走しました。</p>
          <div>{activeTour.builds.map((build) => <span key={`${build.version}-${build.course}`}><b>{build.version}</b><i>{build.course}</i></span>)}</div>
          <button className="legacy-tour-start" onClick={replay}>SELECT TOUR <span>↻</span></button>
          <button className="legacy-tour-back" onClick={onExit}>BACK TO TITLE</button>
        </section>
      )}

      {pauseOpen && (
        <section className="legacy-tour-pause" role="dialog" aria-modal="true" aria-label="タイトルへ戻る確認">
          <div><span>ARCHIVED BUILD PAUSED</span><h2>タイトルへ<br /><em>戻りますか？</em></h2><p>現在の旧版レースを終了してタイトル画面へ戻ります。</p>
            <nav><button className={pauseFocus === 0 ? "selected" : ""} onMouseEnter={() => setPauseFocus(0)} onClick={onExit}>YES<small>メニューへ戻る</small></button><button className={pauseFocus === 1 ? "selected" : ""} onMouseEnter={() => setPauseFocus(1)} onClick={closePause}>NO<small>レースを続ける</small></button></nav>
            <small>← →：選択　ENTER / × / A：決定　ESC / ○ / B：キャンセル</small>
          </div>
        </section>
      )}
    </main>
  );
}
