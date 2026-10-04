"use client";

import type { ComponentType, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import legacyRaceHudCss from "./legacy-race-hud.css?raw";
import {
  KEYBOARD_GLITCH_PAIR_MS,
  KeyboardTransitionFilter,
} from "../lib/keyboard-transition-filter.mjs";
import {
  LEGACY_CURRENT_TOUCH_VERSIONS,
  LEGACY_DEFAULT_KEY_BINDINGS,
  LEGACY_GAMEPAD_BRIDGE_VERSIONS,
  LEGACY_NATIVE_GAMEPAD_VERSIONS,
  isLegacyReservedKeyboardEvent,
  legacyCanonicalKeyboardControl,
  legacyGamepadInputForVersion,
  legacyGamepadInputState,
  legacyGamepadKeyboardState,
  legacyKeyboardActionFromEvent,
  legacyTouchCapabilities,
} from "../lib/legacy-evolution-gamepad.mjs";

export type LegacyVersionKey = "v1" | "v3" | "v7" | "v11" | "v15" | "v23" | "v24" | "v26" | "v30" | "v76" | "v81" | "v94";
export type LegacyCupId = "basic" | "adventure";
export type LegacyKeyAction = "gas" | "brake" | "left" | "right" | "drift" | "item" | "skill" | "pause";
export type LegacyKeyBindings = Record<LegacyKeyAction, [string, string]>;
export type LegacyGamepadBinding = { kind: "button"; index: number } | { kind: "axis"; index: number; direction: -1 | 1 };
export type LegacyGamepadBindings = Record<LegacyKeyAction, [LegacyGamepadBinding | null, LegacyGamepadBinding | null]>;

type LegacyModule = { default: ComponentType };
type LoadedLegacyBuild = { component: ComponentType; css: string };
type LegacyWindow = Window & {
  __EVOLUTION_AUTOSTART__?: boolean;
  __EVOLUTION_COURSE_INDEX__?: number;
  __EVOLUTION_PAUSED__?: boolean;
  __EVOLUTION_VERSION__?: string;
  __EVOLUTION_CUP_ID__?: LegacyCupId;
  __EVOLUTION_GOJO_DUEL__?: boolean;
  __EVOLUTION_CHARACTER_INDEX__?: number;
  __EVOLUTION_LAPS__?: number;
  __EVOLUTION_GAMEPAD_INPUT__?: { connected: boolean; steer: number; gas: number; brake: number; drift: boolean; item: boolean; skill: boolean; pause: boolean };
};

const LOADERS: Record<LegacyVersionKey, () => Promise<LoadedLegacyBuild>> = {
  v1: async () => {
    const [module, css] = await Promise.all([import("../legacy-evolution/v1/app/page"), import("../legacy-evolution/v1/app/globals.css?raw")]);
    return { component: (module as LegacyModule).default, css: css.default };
  },
  v3: async () => {
    const [module, css] = await Promise.all([import("../legacy-evolution/v3/app/page"), import("../legacy-evolution/v3/app/globals.css?raw")]);
    return { component: (module as LegacyModule).default, css: css.default };
  },
  v7: async () => {
    const [module, css] = await Promise.all([import("../legacy-evolution/v7/app/page"), import("../legacy-evolution/v7/app/globals.css?raw")]);
    return { component: (module as LegacyModule).default, css: css.default };
  },
  v11: async () => {
    const [module, css] = await Promise.all([import("../legacy-evolution/v11/app/page"), import("../legacy-evolution/v11/app/globals.css?raw")]);
    return { component: (module as LegacyModule).default, css: css.default };
  },
  v15: async () => {
    const [module, css] = await Promise.all([import("../legacy-evolution/v15/app/page"), import("../legacy-evolution/v15/app/globals.css?raw")]);
    return { component: (module as LegacyModule).default, css: css.default };
  },
  v23: async () => {
    const [module, css] = await Promise.all([import("../legacy-evolution/v23/app/page"), import("../legacy-evolution/v23/app/globals.css?raw")]);
    return { component: (module as LegacyModule).default, css: css.default };
  },
  v24: async () => {
    const [module, css] = await Promise.all([import("../legacy-evolution/v24/app/page"), import("../legacy-evolution/v24/app/globals.css?raw")]);
    return { component: (module as LegacyModule).default, css: css.default };
  },
  v26: async () => {
    const [module, css] = await Promise.all([import("../legacy-evolution/v26/app/page"), import("../legacy-evolution/v26/app/globals.css?raw")]);
    return { component: (module as LegacyModule).default, css: css.default };
  },
  v30: async () => {
    const [module, css] = await Promise.all([import("../legacy-evolution/v30/app/page"), import("../legacy-evolution/v30/app/globals.css?raw")]);
    return { component: (module as LegacyModule).default, css: css.default };
  },
  v76: async () => {
    const [module, css] = await Promise.all([import("../legacy-evolution/v76/app/page"), import("../legacy-evolution/v76/app/globals.css?raw")]);
    return { component: (module as LegacyModule).default, css: css.default };
  },
  v81: async () => {
    const [module, css] = await Promise.all([import("../legacy-evolution/v81/app/page"), import("../legacy-evolution/v81/app/globals.css?raw")]);
    return { component: (module as LegacyModule).default, css: css.default };
  },
  v94: async () => {
    const [module, css] = await Promise.all([import("../legacy-evolution/v94/app/page"), import("../legacy-evolution/v94/app/globals.css?raw")]);
    return { component: (module as LegacyModule).default, css: css.default };
  },
};

const loadCache = new Map<LegacyVersionKey, Promise<LoadedLegacyBuild>>();
export const preloadLegacyBuild = (version: LegacyVersionKey) => {
  const cached = loadCache.get(version);
  if (cached) return cached;
  const loading = LOADERS[version]();
  loadCache.set(version, loading);
  return loading;
};

const shadowCss = (source: string) => `${source
  .replace(/@import\s+["']tailwindcss["'];?/g, "")
  .replaceAll(":root", ":host")
  .replace(/\bhtml\b/g, ":host")
  .replace(/\bbody\b/g, ".legacy-root")}
:host { display:block; width:100%; height:100%; min-height:0; color-scheme:normal; }
.legacy-root { width:100%; height:100%; min-height:0; overflow:hidden; }
.legacy-root > main { width:100% !important; max-width:none !important; height:100% !important; min-height:0 !important; margin:0 !important; padding:0 !important; overflow:hidden !important; }
.legacy-root .topbar,
.legacy-root .hero,
.legacy-root .race-intro,
.legacy-root .race-panel,
.legacy-root footer { display:none !important; }
.legacy-root .game-layout { display:block !important; width:100% !important; height:100% !important; min-height:0 !important; margin:0 !important; padding:0 !important; border:0 !important; box-shadow:none !important; }
.legacy-root .game-stage { width:100% !important; height:100% !important; min-height:0 !important; max-height:none !important; margin:0 !important; border:0 !important; }
.legacy-root .webgl-host { width:100% !important; height:100% !important; min-height:0 !important; }
.legacy-root.version-v1 .game-layout { display:grid !important; place-items:center !important; }
.legacy-root.version-v1 .game-stage { width:min(100%, calc(100dvh * 1.6)) !important; height:auto !important; max-height:100% !important; aspect-ratio:16 / 10 !important; }
.legacy-root.version-v1 .canvas-shell { position:absolute !important; inset:0 !important; display:grid !important; place-items:center !important; width:100% !important; height:100% !important; overflow:hidden !important; }
.legacy-root.version-v1 .canvas-shell > canvas { width:100% !important; height:100% !important; max-width:100% !important; max-height:100% !important; aspect-ratio:16 / 10 !important; }
.legacy-root.current-touch .touch-controls,
.legacy-root.current-touch .mobile-gesture-layer { display:none !important; pointer-events:none !important; }
${legacyRaceHudCss}
`;

type LegacyTouchControl = "gas" | "left" | "right" | "drift" | "item" | "skill";
type LegacyTouchPointer = {
  side: "left" | "right";
  originSide: "left" | "right";
  startX: number;
  startY: number;
  startedAt: number;
  drift: boolean;
  didSwipe: boolean;
  skillHold: boolean;
};

const LEGACY_TOUCH_KEYS: Record<LegacyTouchControl, { key: string; code: string }> = {
  gas: { key: "ArrowUp", code: "ArrowUp" },
  left: { key: "ArrowLeft", code: "ArrowLeft" },
  right: { key: "ArrowRight", code: "ArrowRight" },
  drift: { key: "Shift", code: "ShiftLeft" },
  item: { key: " ", code: "Space" },
  skill: { key: "q", code: "KeyQ" },
};

const physicalCode = (event: KeyboardEvent) => event.code && event.code !== "-"
  ? event.code
  : `key:${event.key.toLowerCase()}`;

const cloneKeyboardEvent = (event: KeyboardEvent, type = event.type, control?: { key: string; code: string }) => new KeyboardEvent(type, {
  key: control?.key ?? event.key,
  code: control?.code ?? event.code,
  location: event.location,
  repeat: event.repeat,
  ctrlKey: event.ctrlKey,
  shiftKey: event.shiftKey,
  altKey: event.altKey,
  metaKey: event.metaKey,
  bubbles: true,
  cancelable: true,
  composed: true,
});

function installLegacyKeyboardGate(
  onEscape: () => void,
  onPausedKey: (event: KeyboardEvent) => void,
  keyBindings: LegacyKeyBindings,
) {
  const filter = new KeyboardTransitionFilter({ thresholdMs: KEYBOARD_GLITCH_PAIR_MS });
  const deliveredActive = new Map<string, { event: KeyboardEvent; action: LegacyKeyAction }>();
  const actionActiveIds = new Map<LegacyKeyAction, Set<string>>();
  const allActive = new Set<string>();
  const forwarded = new WeakSet<Event>();

  const forwardAction = (event: KeyboardEvent, action: LegacyKeyAction, type: "keydown" | "keyup") => {
    const control = legacyCanonicalKeyboardControl(action) as { key: string; code: string };
    const cloned = cloneKeyboardEvent(event, type, control);
    forwarded.add(cloned);
    window.dispatchEvent(cloned);
    return cloned;
  };
  const block = (event: KeyboardEvent) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const actionForEvent = (event: KeyboardEvent) => legacyKeyboardActionFromEvent(
    event,
    event.isTrusted ? keyBindings : LEGACY_DEFAULT_KEY_BINDINGS,
  ) as LegacyKeyAction | null;
  const activate = (id: string, action: LegacyKeyAction, event: KeyboardEvent) => {
    if (deliveredActive.has(id)) return;
    const activeIds = actionActiveIds.get(action) ?? new Set<string>();
    const wasInactive = activeIds.size === 0;
    activeIds.add(id);
    actionActiveIds.set(action, activeIds);
    deliveredActive.set(id, { event, action });
    allActive.add(id);
    if (wasInactive) forwardAction(event, action, "keydown");
  };
  const deactivate = (id: string, event: KeyboardEvent) => {
    const delivered = deliveredActive.get(id);
    if (!delivered) return;
    deliveredActive.delete(id);
    allActive.delete(id);
    const activeIds = actionActiveIds.get(delivered.action);
    activeIds?.delete(id);
    if (activeIds?.size) return;
    actionActiveIds.delete(delivered.action);
    forwardAction(event, delivered.action, "keyup");
  };

  const keydown = (event: KeyboardEvent) => {
    if (forwarded.has(event)) return;
    const action = actionForEvent(event);
    if (action === "pause" && !event.repeat) {
      block(event);
      if ((window as LegacyWindow).__EVOLUTION_PAUSED__) onPausedKey(event);
      else onEscape();
      return;
    }
    if ((window as LegacyWindow).__EVOLUTION_PAUSED__) {
      block(event);
      if (!event.repeat) {
        const control = action ? legacyCanonicalKeyboardControl(action) as { key: string; code: string } : undefined;
        onPausedKey(cloneKeyboardEvent(event, "keydown", control));
      }
      return;
    }

    const id = physicalCode(event);
    if (!action) {
      filter.noteOtherEvent();
      if (!event.repeat) allActive.add(id);
      if (isLegacyReservedKeyboardEvent(event)) block(event);
      return;
    }

    block(event);
    const steering = action === "left" || action === "right";
    if (!steering) {
      filter.noteOtherEvent();
      if (!event.repeat) activate(id, action, event);
      return;
    }
    const result = filter.handleKeyDown({ keyId: id, payload: event, repeat: event.repeat, timeStamp: event.timeStamp }, (accepted: KeyboardEvent) => {
      activate(id, action, accepted);
    });
    if (result.restoreState) {
      activate(id, action, event);
    }
  };

  const keyup = (event: KeyboardEvent) => {
    if (forwarded.has(event)) return;
    const id = physicalCode(event);
    const delivered = deliveredActive.get(id);
    const action = delivered?.action ?? actionForEvent(event);
    const steering = action === "left" || action === "right";
    const wasActive = deliveredActive.has(id) || allActive.has(id);
    const filterEvent = { keyId: id, payload: event, repeat: event.repeat, timeStamp: event.timeStamp, wasActive, restoreState: wasActive ? { id } : undefined };
    filter.noteKeyUp(filterEvent);
    allActive.delete(id);

    if (!action) {
      if (isLegacyReservedKeyboardEvent(event)) block(event);
      return;
    }
    block(event);
    if (!steering) {
      deactivate(id, event);
      return;
    }
    filter.handleKeyUp(filterEvent, (accepted: KeyboardEvent) => {
      deactivate(id, accepted);
    });
  };

  const releaseAll = () => {
    filter.reset();
    Array.from(deliveredActive.entries()).forEach(([id, delivered]) => {
      deactivate(id, delivered.event);
    });
    deliveredActive.clear();
    actionActiveIds.clear();
    allActive.clear();
  };
  const clear = () => releaseAll();
  const visibility = () => { if (document.hidden) clear(); };

  window.addEventListener("keydown", keydown, { capture: true, passive: false });
  window.addEventListener("keyup", keyup, { capture: true, passive: false });
  window.addEventListener("blur", clear);
  window.addEventListener("pagehide", clear);
  document.addEventListener("visibilitychange", visibility);

  return {
    releaseAll,
    dispose() {
      releaseAll();
      window.removeEventListener("keydown", keydown, { capture: true });
      window.removeEventListener("keyup", keyup, { capture: true });
      window.removeEventListener("blur", clear);
      window.removeEventListener("pagehide", clear);
      document.removeEventListener("visibilitychange", visibility);
    },
  };
}

function installLegacyGamepadBridge(
  version: LegacyVersionKey,
  onConnectionChange: (connected: boolean) => void,
  gamepadBindings: LegacyGamepadBindings,
) {
  if (!LEGACY_GAMEPAD_BRIDGE_VERSIONS.includes(version)) {
    onConnectionChange(false);
    return { dispose() {} };
  }

  let frame = 0;
  let connected = false;
  const active = new Map<string, { key: string; code: string }>();
  const dispatch = (type: "keydown" | "keyup", control: { key: string; code: string }) => {
    window.dispatchEvent(new KeyboardEvent(type, {
      key: control.key,
      code: control.code,
      bubbles: true,
      cancelable: true,
    }));
  };
  const releaseAll = () => {
    active.forEach((control) => dispatch("keyup", control));
    active.clear();
    delete (window as LegacyWindow).__EVOLUTION_GAMEPAD_INPUT__;
  };
  const setConnected = (next: boolean) => {
    if (next === connected) return;
    connected = next;
    onConnectionChange(next);
  };
  const tick = () => {
    let pad: Gamepad | null = null;
    try {
      pad = Array.from(navigator.getGamepads?.() ?? []).find((candidate): candidate is Gamepad => Boolean(candidate?.connected)) ?? null;
    } catch {
      pad = null;
    }
    const rawInput = legacyGamepadInputState(pad, gamepadBindings) as NonNullable<LegacyWindow["__EVOLUTION_GAMEPAD_INPUT__"]>;
    const input = legacyGamepadInputForVersion(rawInput, version) as NonNullable<LegacyWindow["__EVOLUTION_GAMEPAD_INPUT__"]>;
    const nativeInput = LEGACY_NATIVE_GAMEPAD_VERSIONS.includes(version);
    if (nativeInput) (window as LegacyWindow).__EVOLUTION_GAMEPAD_INPUT__ = input;
    const state = nativeInput
      ? { connected: input.connected, keys: input.pause ? [legacyCanonicalKeyboardControl("pause") as { key: string; code: string }] : [] }
      : legacyGamepadKeyboardState(pad, version, gamepadBindings) as { connected: boolean; keys: Array<{ key: string; code: string }> };
    setConnected(state.connected);
    if ((window as LegacyWindow).__EVOLUTION_PAUSED__) {
      releaseAll();
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const wanted = new Map(state.keys.map((control) => [control.code, control]));
    active.forEach((control, code) => {
      if (wanted.has(code)) return;
      dispatch("keyup", control);
      active.delete(code);
    });
    wanted.forEach((control, code) => {
      if (active.has(code)) return;
      active.set(code, control);
      dispatch("keydown", control);
    });
    frame = window.requestAnimationFrame(tick);
  };
  const clear = () => {
    releaseAll();
    setConnected(false);
  };
  const visibility = () => { if (document.hidden) clear(); };
  window.addEventListener("blur", clear);
  window.addEventListener("pagehide", clear);
  document.addEventListener("visibilitychange", visibility);
  frame = window.requestAnimationFrame(tick);

  return {
    dispose() {
      window.cancelAnimationFrame(frame);
      releaseAll();
      window.removeEventListener("blur", clear);
      window.removeEventListener("pagehide", clear);
      document.removeEventListener("visibilitychange", visibility);
      onConnectionChange(false);
    },
  };
}

export function LegacyEvolutionPlayer({
  version,
  versionLabel,
  courseIndex,
  cupId,
  gojoDuel = false,
  characterIndex = 0,
  laps = 1,
  keyBindings,
  gamepadBindings,
  paused,
  onFinish,
  onEscape,
  onPausedKey,
}: {
  version: LegacyVersionKey;
  versionLabel: string;
  courseIndex: number;
  cupId: LegacyCupId;
  gojoDuel?: boolean;
  characterIndex?: number;
  laps?: number;
  keyBindings: LegacyKeyBindings;
  gamepadBindings: LegacyGamepadBindings;
  paused: boolean;
  onFinish: (detail: { version?: string; time?: number; position?: number }) => void;
  onEscape: () => void;
  onPausedKey: (event: KeyboardEvent) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gateRef = useRef<ReturnType<typeof installLegacyKeyboardGate> | null>(null);
  const gamepadBridgeRef = useRef<ReturnType<typeof installLegacyGamepadBridge> | null>(null);
  const finishRef = useRef(onFinish);
  const escapeRef = useRef(onEscape);
  const pausedKeyRef = useRef(onPausedKey);
  const touchPointersRef = useRef(new Map<number, LegacyTouchPointer>());
  const touchKeysRef = useRef(new Set<LegacyTouchControl>());
  const touchPulseTimersRef = useRef(new Map<LegacyTouchControl, number>());
  const lastTouchTapAtRef = useRef({ left: 0, right: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [currentTouchEnabled, setCurrentTouchEnabled] = useState(false);
  const touchCapabilities = legacyTouchCapabilities(version);

  const setTouchControl = useCallback((control: LegacyTouchControl, active: boolean) => {
    const pressed = touchKeysRef.current;
    if (active === pressed.has(control)) return;
    if (active) pressed.add(control);
    else pressed.delete(control);
    const binding = LEGACY_TOUCH_KEYS[control];
    window.dispatchEvent(new KeyboardEvent(active ? "keydown" : "keyup", {
      key: binding.key,
      code: binding.code,
      bubbles: true,
      cancelable: true,
    }));
  }, []);

  const releaseTouchControls = useCallback(() => {
    Array.from(touchKeysRef.current).forEach((control) => setTouchControl(control, false));
    touchPulseTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    touchPulseTimersRef.current.clear();
    touchPointersRef.current.clear();
  }, [setTouchControl]);

  const syncTouchSteering = useCallback(() => {
    const pointers = Array.from(touchPointersRef.current.values());
    setTouchControl("left", pointers.some((pointer) => !pointer.skillHold && pointer.side === "left"));
    setTouchControl("right", pointers.some((pointer) => !pointer.skillHold && pointer.side === "right"));
    setTouchControl("drift", touchCapabilities.drift && pointers.some((pointer) => !pointer.skillHold && pointer.drift));
  }, [setTouchControl, touchCapabilities.drift]);

  const pulseTouchControl = useCallback((control: "item" | "skill") => {
    setTouchControl(control, true);
    const previousTimer = touchPulseTimersRef.current.get(control);
    if (previousTimer !== undefined) window.clearTimeout(previousTimer);
    const timer = window.setTimeout(() => {
      setTouchControl(control, false);
      touchPulseTimersRef.current.delete(control);
    }, 150);
    touchPulseTimersRef.current.set(control, timer);
  }, [setTouchControl]);

  useEffect(() => { finishRef.current = onFinish; }, [onFinish]);
  useEffect(() => { escapeRef.current = onEscape; }, [onEscape]);
  useEffect(() => { pausedKeyRef.current = onPausedKey; }, [onPausedKey]);

  useEffect(() => {
    if (!touchCapabilities.enabled) {
      setCurrentTouchEnabled(false);
      return;
    }
    const media = window.matchMedia("(hover: none) and (pointer: coarse)");
    const sync = () => setCurrentTouchEnabled(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, [touchCapabilities.enabled]);

  useEffect(() => {
    const shouldAutoDrive = currentTouchEnabled && !loading && !paused && touchCapabilities.autoDrive;
    setTouchControl("gas", shouldAutoDrive);
    return () => setTouchControl("gas", false);
  }, [currentTouchEnabled, loading, paused, setTouchControl, touchCapabilities.autoDrive]);

  useEffect(() => () => releaseTouchControls(), [releaseTouchControls]);

  useEffect(() => {
    const legacyWindow = window as LegacyWindow;
    legacyWindow.__EVOLUTION_PAUSED__ = paused;
    if (paused) {
      releaseTouchControls();
      gateRef.current?.releaseAll();
    }
  }, [paused, releaseTouchControls]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    setLoading(true);
    setLoadError("");
    let disposed = false;
    let root: Root | null = null;
    let revealTimer: number | null = null;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    shadow.replaceChildren();
    const mount = document.createElement("div");
    mount.className = `legacy-root version-${version} ${LEGACY_CURRENT_TOUCH_VERSIONS.includes(version) ? "current-touch" : "original-touch"}`;
    shadow.append(mount);

    const legacyWindow = window as LegacyWindow;
    legacyWindow.__EVOLUTION_AUTOSTART__ = true;
    legacyWindow.__EVOLUTION_COURSE_INDEX__ = courseIndex;
    legacyWindow.__EVOLUTION_CUP_ID__ = cupId;
    legacyWindow.__EVOLUTION_GOJO_DUEL__ = gojoDuel;
    legacyWindow.__EVOLUTION_CHARACTER_INDEX__ = characterIndex;
    legacyWindow.__EVOLUTION_LAPS__ = laps;
    legacyWindow.__EVOLUTION_PAUSED__ = paused;
    legacyWindow.__EVOLUTION_VERSION__ = versionLabel;
    gateRef.current = installLegacyKeyboardGate(
      () => escapeRef.current(),
      (event) => pausedKeyRef.current(event),
      keyBindings,
    );
    gamepadBridgeRef.current = installLegacyGamepadBridge(version, () => {}, gamepadBindings);

    const finished = (event: Event) => {
      const detail = (event as CustomEvent).detail ?? {};
      if (detail.version !== versionLabel) return;
      finishRef.current(detail);
    };
    window.addEventListener("evolution:legacy-finish", finished);

    void preloadLegacyBuild(version).then(({ component: Component, css }) => {
      if (disposed) return;
      const style = document.createElement("style");
      style.textContent = shadowCss(css);
      shadow.prepend(style);
      root = createRoot(mount);
      root.render(<Component />);
      // The archived page contains its own old title screen. Keep the archive
      // loader above it until the build-time autostart has moved the kart to
      // that version's starting grid.
      revealTimer = window.setTimeout(() => {
        if (!disposed) setLoading(false);
      }, 320);
    }).catch((error: unknown) => {
      if (disposed) return;
      setLoadError(error instanceof Error ? error.message : "Archived build failed to load");
      setLoading(false);
    });

    return () => {
      disposed = true;
      if (revealTimer !== null) window.clearTimeout(revealTimer);
      window.removeEventListener("evolution:legacy-finish", finished);
      gateRef.current?.dispose();
      gateRef.current = null;
      gamepadBridgeRef.current?.dispose();
      gamepadBridgeRef.current = null;
      releaseTouchControls();
      root?.unmount();
      shadow.replaceChildren();
      delete legacyWindow.__EVOLUTION_AUTOSTART__;
      delete legacyWindow.__EVOLUTION_COURSE_INDEX__;
      delete legacyWindow.__EVOLUTION_PAUSED__;
      delete legacyWindow.__EVOLUTION_VERSION__;
      delete legacyWindow.__EVOLUTION_CUP_ID__;
      delete legacyWindow.__EVOLUTION_GOJO_DUEL__;
      delete legacyWindow.__EVOLUTION_CHARACTER_INDEX__;
      delete legacyWindow.__EVOLUTION_LAPS__;
    };
  }, [characterIndex, courseIndex, cupId, gamepadBindings, gojoDuel, keyBindings, laps, releaseTouchControls, version, versionLabel]);

  const beginTouchGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!currentTouchEnabled || paused || event.pointerType === "mouse") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = event.currentTarget.getBoundingClientRect();
    const side = event.clientX < bounds.left + bounds.width / 2 ? "left" : "right";
    const now = performance.now();
    const drift = touchCapabilities.drift && now - lastTouchTapAtRef.current[side] <= 360;
    if (drift) lastTouchTapAtRef.current[side] = 0;
    touchPointersRef.current.set(event.pointerId, {
      side,
      originSide: side,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: now,
      drift,
      didSwipe: false,
      skillHold: false,
    });
    syncTouchSteering();
  };

  const moveTouchGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = touchPointersRef.current.get(event.pointerId);
    if (!pointer || paused) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    pointer.side = event.clientX < bounds.left + bounds.width / 2 ? "left" : "right";
    const verticalTravel = event.clientY - pointer.startY;
    const horizontalTravel = event.clientX - pointer.startX;
    if (!pointer.didSwipe && Math.abs(verticalTravel) >= 42 && Math.abs(verticalTravel) > Math.abs(horizontalTravel) * 1.08) {
      pointer.didSwipe = true;
      if (verticalTravel > 0 && touchCapabilities.item) pulseTouchControl("item");
      if (verticalTravel < 0 && touchCapabilities.skill) {
        if (characterIndex === 0) {
          pointer.skillHold = true;
          setTouchControl("skill", true);
        } else {
          pulseTouchControl("skill");
        }
      }
    }
    syncTouchSteering();
  };

  const finishTouchGesture = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const pointer = touchPointersRef.current.get(event.pointerId);
    if (!pointer) return;
    event.preventDefault();
    const travel = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY);
    const heldFor = performance.now() - pointer.startedAt;
    if (!cancelled && !pointer.didSwipe && !pointer.drift && travel < 24 && heldFor < 280) {
      lastTouchTapAtRef.current[pointer.side] = performance.now();
    }
    touchPointersRef.current.delete(event.pointerId);
    if (pointer.skillHold) {
      const stillHoldingSkill = Array.from(touchPointersRef.current.values()).some((activePointer) => activePointer.skillHold);
      setTouchControl("skill", stillHoldingSkill);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    syncTouchSteering();
  };

  return (
    <div className="legacy-player-frame">
      {loading && <div className="legacy-player-loading"><i /><b>LOADING ARCHIVED BUILD</b><span>{versionLabel}</span></div>}
      {loadError && <div className="legacy-player-loading legacy-player-error"><b>ARCHIVE LOAD ERROR</b><span>{versionLabel}</span><small>{loadError}</small></div>}
      <div className="legacy-shadow-host" ref={hostRef} />
      {currentTouchEnabled && touchCapabilities.enabled && !loading && !loadError && !paused && (
        <div
          className="legacy-current-touch-layer"
          aria-label="スマホ操作領域。左右タップでハンドル、ダブルタップ後の長押しでドリフト、上フリックでスキル、下フリックでアイテム"
          onPointerDown={beginTouchGesture}
          onPointerMove={moveTouchGesture}
          onPointerUp={(event) => finishTouchGesture(event)}
          onPointerCancel={(event) => finishTouchGesture(event, true)}
          onContextMenu={(event) => event.preventDefault()}
        >
          <span className="left">STEER LEFT</span>
          <span className="right">STEER RIGHT</span>
          <small>↑ SKILL　↓ ITEM　DOUBLE TAP + HOLD：DRIFT　AUTO ACCEL</small>
        </div>
      )}
    </div>
  );
}
