import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LEGACY_CURRENT_TOUCH_VERSIONS,
  LEGACY_GAMEPAD_BRIDGE_VERSIONS,
  legacyGamepadInputForVersion,
  legacyGamepadInputState,
  legacyGamepadKeyboardState,
  legacyKeyboardActionFromEvent,
  legacyTouchCapabilities,
} from "../lib/legacy-evolution-gamepad.mjs";

const pad = ({ axes = [0], pressed = [] } = {}) => ({
  connected: true,
  axes,
  buttons: Array.from({ length: 16 }, (_, index) => ({
    pressed: pressed.includes(index),
    value: pressed.includes(index) ? 1 : 0,
  })),
});

test("every Evolution build uses the common configurable gamepad bridge", () => {
  assert.deepEqual(LEGACY_GAMEPAD_BRIDGE_VERSIONS, ["v1", "v3", "v7", "v11", "v15", "v23", "v24", "v26", "v30", "v76", "v81", "v94"]);
});

test("stick and face buttons become the keyboard controls understood by V1-V11", () => {
  assert.deepEqual(legacyGamepadKeyboardState(pad({ axes: [-0.8], pressed: [0] }), "v3").keys, [
    { key: "ArrowUp", code: "ArrowUp" },
    { key: "ArrowLeft", code: "ArrowLeft" },
  ]);
});

test("item input is backported only to archived builds that originally had items", () => {
  assert.equal(legacyGamepadKeyboardState(pad({ pressed: [2] }), "v1").keys.length, 0);
  assert.deepEqual(legacyGamepadKeyboardState(pad({ pressed: [2] }), "v7").keys, [
    { key: " ", code: "Space" },
  ]);
});

test("disconnection releases every bridged control", () => {
  assert.deepEqual(legacyGamepadKeyboardState({ connected: false }, "v11"), { connected: false, keys: [] });
});

test("keyboard configuration is translated to the controls understood by archived builds", () => {
  const bindings = {
    gas: ["i", ""], brake: ["k", ""], left: ["j", ""], right: ["l", ""],
    drift: ["u", ""], item: ["o", ""], skill: ["p", ""], pause: ["backspace", ""],
  };
  assert.equal(legacyKeyboardActionFromEvent({ code: "KeyJ", key: "j" }, bindings), "left");
  assert.equal(legacyKeyboardActionFromEvent({ code: "KeyA", key: "a" }, bindings), null);
  assert.equal(legacyKeyboardActionFromEvent({ code: "KeyP", key: "p" }, bindings), "skill");
  assert.equal(legacyKeyboardActionFromEvent({ code: "Backspace", key: "Backspace" }, bindings), "pause");
});

test("gamepad configuration controls every archived action", () => {
  const bindings = {
    gas: [{ kind: "button", index: 5 }, null], brake: [{ kind: "button", index: 4 }, null],
    left: [{ kind: "button", index: 14 }, null], right: [{ kind: "button", index: 15 }, null],
    drift: [{ kind: "button", index: 1 }, null], item: [{ kind: "button", index: 0 }, null],
    skill: [{ kind: "button", index: 2 }, null], pause: [{ kind: "button", index: 3 }, null],
  };
  const state = legacyGamepadInputState(pad({ pressed: [0, 1, 2, 3, 5, 15] }), bindings);
  assert.equal(state.gas, 1);
  assert.equal(state.steer, 1);
  assert.equal(state.drift, true);
  assert.equal(state.item, true);
  assert.equal(state.skill, true);
  assert.equal(state.pause, true);
});

test("V15 and every later native archive receive their historical steering sign", () => {
  const currentConvention = { connected: true, steer: -0.75, gas: 1, brake: 0, drift: false, item: false, skill: false, pause: false };
  assert.equal(legacyGamepadInputForVersion(currentConvention, "v11").steer, -0.75);
  for (const version of ["v15", "v23", "v24", "v26", "v30", "v76", "v81", "v94"]) {
    assert.equal(legacyGamepadInputForVersion(currentConvention, version).steer, 0.75, `${version} left must be positive`);
  }
});

test("every native archived build consumes the configured bridge before polling raw hardware", () => {
  for (const version of ["v15", "v23", "v24", "v26", "v30", "v76", "v81", "v94"]) {
    const source = readFileSync(new URL(`../legacy-evolution/${version}/app/page.tsx`, import.meta.url), "utf8");
    const functionStart = source.indexOf("function readGamepadInput(): GamepadInput {");
    const bridgeRead = source.indexOf("__EVOLUTION_GAMEPAD_INPUT__", functionStart);
    const rawPoll = source.indexOf("navigator.getGamepads", functionStart);
    assert.ok(functionStart >= 0 && bridgeRead > functionStart && rawPoll > bridgeRead, `${version} must prefer the configured bridge`);
  }
});

test("V1 keeps its original touch controls and every 3D archive gets the current touch scheme", () => {
  assert.equal(legacyTouchCapabilities("v1").enabled, false);
  assert.deepEqual(LEGACY_CURRENT_TOUCH_VERSIONS, ["v3", "v7", "v11", "v15", "v23", "v24", "v26", "v30", "v76", "v81", "v94"]);
  assert.equal(legacyTouchCapabilities("v3").autoDrive, true);
  assert.equal(legacyTouchCapabilities("v3").item, false);
  assert.equal(legacyTouchCapabilities("v7").item, true);
  assert.equal(legacyTouchCapabilities("v15").drift, true);
  assert.equal(legacyTouchCapabilities("v23").skill, false);
  assert.equal(legacyTouchCapabilities("v76").skill, true);
  assert.deepEqual(legacyTouchCapabilities("v94"), {
    enabled: true,
    autoDrive: true,
    item: true,
    drift: true,
    skill: true,
  });
});

test("every archived race hides page chrome and V1 scales its 2D canvas inside the viewport", () => {
  const playerSource = readFileSync(new URL("../app/legacy-evolution-player.tsx", import.meta.url), "utf8");
  assert.match(playerSource, /\.legacy-root \.topbar,/);
  assert.match(playerSource, /\.legacy-root \.hero,/);
  assert.match(playerSource, /\.legacy-root \.race-intro,/);
  assert.match(playerSource, /\.legacy-root \.race-panel,/);
  assert.match(playerSource, /\.legacy-root\.version-v1 \.game-stage/);
  assert.match(playerSource, /\.legacy-root\.version-v1 \.canvas-shell > canvas/);
  assert.match(playerSource, /width:min\(100%, calc\(100dvh \* 1\.6\)\)/);
  assert.match(playerSource, /height:auto !important/);
  assert.match(playerSource, /aspect-ratio:16 \/ 10/);
});
