export const LEGACY_GAMEPAD_BRIDGE_VERSIONS = Object.freeze(["v1", "v3", "v7", "v11", "v15", "v23", "v24", "v26", "v30", "v76", "v81", "v94"]);
export const LEGACY_NATIVE_GAMEPAD_VERSIONS = Object.freeze(["v15", "v23", "v24", "v26", "v30", "v76", "v81", "v94"]);
export const LEGACY_CURRENT_TOUCH_VERSIONS = Object.freeze(["v3", "v7", "v11", "v15", "v23", "v24", "v26", "v30", "v76", "v81", "v94"]);

export const LEGACY_INPUT_ACTIONS = Object.freeze(["gas", "brake", "left", "right", "drift", "item", "skill", "pause"]);
export const LEGACY_DEFAULT_KEY_BINDINGS = Object.freeze({
  gas: Object.freeze(["arrowup", "w"]),
  brake: Object.freeze(["arrowdown", "s"]),
  left: Object.freeze(["arrowleft", "a"]),
  right: Object.freeze(["arrowright", "d"]),
  drift: Object.freeze(["shift", ""]),
  item: Object.freeze(["space", "e"]),
  skill: Object.freeze(["q", ""]),
  pause: Object.freeze(["escape", ""]),
});
export const LEGACY_DEFAULT_GAMEPAD_BINDINGS = Object.freeze({
  gas: Object.freeze([{ kind: "button", index: 7 }, { kind: "button", index: 0 }]),
  brake: Object.freeze([{ kind: "button", index: 6 }, { kind: "button", index: 1 }]),
  left: Object.freeze([{ kind: "axis", index: 0, direction: -1 }, { kind: "button", index: 14 }]),
  right: Object.freeze([{ kind: "axis", index: 0, direction: 1 }, { kind: "button", index: 15 }]),
  drift: Object.freeze([{ kind: "button", index: 4 }, { kind: "button", index: 5 }]),
  item: Object.freeze([{ kind: "button", index: 2 }, null]),
  skill: Object.freeze([{ kind: "button", index: 3 }, null]),
  pause: Object.freeze([{ kind: "button", index: 9 }, null]),
});

const KEY_CODE_ALIASES = Object.freeze({
  ArrowUp: "arrowup",
  ArrowDown: "arrowdown",
  ArrowLeft: "arrowleft",
  ArrowRight: "arrowright",
  Space: "space",
  ShiftLeft: "shift",
  ShiftRight: "shift",
  ControlLeft: "control",
  ControlRight: "control",
  AltLeft: "alt",
  AltRight: "alt",
  Enter: "enter",
  Escape: "escape",
  Tab: "tab",
});

export function normalizeLegacyKeyboardAlias(value) {
  if (!value) return "";
  if (value === " ") return "space";
  if (value.startsWith("Key") && value.length === 4) return value.slice(3).toLowerCase();
  if (value.startsWith("Digit") && value.length === 6) return value.slice(5).toLowerCase();
  return KEY_CODE_ALIASES[value] ?? value.toLowerCase();
}

export function legacyKeyboardActionFromEvent(event, bindings = LEGACY_DEFAULT_KEY_BINDINGS) {
  const aliases = new Set([
    normalizeLegacyKeyboardAlias(event?.code ?? ""),
    normalizeLegacyKeyboardAlias(event?.key ?? ""),
  ].filter(Boolean));
  return LEGACY_INPUT_ACTIONS.find((action) => (
    (bindings?.[action] ?? []).some((binding) => binding && aliases.has(normalizeLegacyKeyboardAlias(binding)))
  )) ?? null;
}

export function legacyCanonicalKeyboardControl(action) {
  return {
    gas: { key: "ArrowUp", code: "ArrowUp" },
    brake: { key: "ArrowDown", code: "ArrowDown" },
    left: { key: "ArrowLeft", code: "ArrowLeft" },
    right: { key: "ArrowRight", code: "ArrowRight" },
    drift: { key: "Shift", code: "ShiftLeft" },
    item: { key: " ", code: "Space" },
    skill: { key: "q", code: "KeyQ" },
    pause: { key: "Escape", code: "Escape" },
  }[action] ?? null;
}

export function isLegacyReservedKeyboardEvent(event) {
  const aliases = [normalizeLegacyKeyboardAlias(event?.code ?? ""), normalizeLegacyKeyboardAlias(event?.key ?? "")];
  return Object.values(LEGACY_DEFAULT_KEY_BINDINGS).flat().some((binding) => binding && aliases.includes(binding));
}

const TOUCH_FEATURE_ORDER = Object.freeze({
  v3: 3,
  v7: 7,
  v11: 11,
  v15: 15,
  v23: 23,
  v24: 24,
  v26: 26,
  v30: 30,
  v76: 76,
  v81: 81,
  v94: 94,
});

export function legacyTouchCapabilities(version) {
  const order = TOUCH_FEATURE_ORDER[version] ?? 0;
  return {
    enabled: LEGACY_CURRENT_TOUCH_VERSIONS.includes(version),
    autoDrive: order >= 3,
    item: order >= 7,
    drift: order >= 15,
    skill: order >= 76,
  };
}

const bindingValue = (pad, binding) => {
  if (!binding || !pad?.connected) return 0;
  if (binding.kind === "button") return Math.max(
    pad.buttons?.[binding.index]?.pressed ? 1 : 0,
    Number(pad.buttons?.[binding.index]?.value ?? 0),
  );
  if (binding.kind === "axis") {
    const signed = Number(pad.axes?.[binding.index] ?? 0) * binding.direction;
    return signed > 0.28 ? Math.min(1, (signed - 0.18) / 0.82) : 0;
  }
  return 0;
};

const actionValue = (pad, bindings, action) => Math.max(
  ...(bindings?.[action] ?? LEGACY_DEFAULT_GAMEPAD_BINDINGS[action] ?? []).map((binding) => bindingValue(pad, binding)),
  0,
);

export function legacyGamepadInputState(pad, bindings = LEGACY_DEFAULT_GAMEPAD_BINDINGS) {
  if (!pad?.connected) return { connected: false, steer: 0, gas: 0, brake: 0, drift: false, item: false, skill: false, pause: false };
  const left = actionValue(pad, bindings, "left");
  const right = actionValue(pad, bindings, "right");
  return {
    connected: true,
    steer: Math.max(-1, Math.min(1, right - left)),
    gas: actionValue(pad, bindings, "gas"),
    brake: actionValue(pad, bindings, "brake"),
    drift: actionValue(pad, bindings, "drift") > 0.55,
    item: actionValue(pad, bindings, "item") > 0.55,
    skill: actionValue(pad, bindings, "skill") > 0.55,
    pause: actionValue(pad, bindings, "pause") > 0.55,
  };
}

export function legacyGamepadInputForVersion(input, version) {
  if (!LEGACY_NATIVE_GAMEPAD_VERSIONS.includes(version)) return input;
  // V15-V94 store steering with the historical sign convention used by their
  // keyboard path: left is positive and right is negative.
  return { ...input, steer: -input.steer };
}

export function legacyGamepadKeyboardState(pad, version, bindings = LEGACY_DEFAULT_GAMEPAD_BINDINGS) {
  if (!pad?.connected || !LEGACY_GAMEPAD_BRIDGE_VERSIONS.includes(version)) {
    return { connected: false, keys: [] };
  }

  const state = legacyGamepadInputState(pad, bindings);
  const keys = [];
  if (state.gas > 0.55) keys.push(legacyCanonicalKeyboardControl("gas"));
  if (state.brake > 0.55) keys.push(legacyCanonicalKeyboardControl("brake"));
  if (state.steer < -0.05) keys.push(legacyCanonicalKeyboardControl("left"));
  if (state.steer > 0.05) keys.push(legacyCanonicalKeyboardControl("right"));
  if ((version === "v7" || version === "v11") && state.item) keys.push(legacyCanonicalKeyboardControl("item"));
  if (state.pause) keys.push(legacyCanonicalKeyboardControl("pause"));
  return { connected: true, keys };
}
