import assert from "node:assert/strict";
import test from "node:test";

import {
  KEYBOARD_GLITCH_PAIR_MS,
  KeyboardTransitionFilter,
} from "../lib/keyboard-transition-filter.mjs";

class FakeScheduler {
  now = 0;
  nextId = 1;
  tasks = new Map();

  setTimer = (callback, delay) => {
    const id = this.nextId++;
    this.tasks.set(id, { callback, due: this.now + delay });
    return id;
  };

  clearTimer = (id) => {
    this.tasks.delete(id);
  };

  advanceTo(time) {
    while (true) {
      const next = [...this.tasks.entries()]
        .filter(([, task]) => task.due <= time)
        .sort((left, right) => left[1].due - right[1].due)[0];
      if (!next) break;
      const [id, task] = next;
      this.tasks.delete(id);
      this.now = task.due;
      task.callback();
    }
    this.now = time;
  }
}

function createHarness() {
  const scheduler = new FakeScheduler();
  const active = new Map();
  const accepted = [];
  const rejected = [];
  let order = 0;

  const filter = new KeyboardTransitionFilter({
    thresholdMs: KEYBOARD_GLITCH_PAIR_MS,
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer,
  });

  const apply = (event) => {
    accepted.push(event);
    if (event.type === "keydown" && !event.repeat) {
      active.set(event.code, ++order);
    } else if (event.type === "keyup") {
      active.delete(event.code);
    }
  };

  const send = ({ type, code, key = code, timeStamp, processedAt = timeStamp, repeat = false }) => {
    scheduler.advanceTo(processedAt);
    const event = { type, code, key, timeStamp, repeat };

    if (type === "keyup") {
      filter.noteKeyUp({
        keyId: code,
        payload: event,
        timeStamp,
        wasActive: active.has(code),
      });
    }

    // The production integration filters only steering keys. Drift and other
    // controls bypass this filter and keep their existing behavior.
    if (code !== "KeyA" && code !== "KeyD") {
      if (type === "keydown") filter.noteOtherEvent();
      apply(event);
      return;
    }

    if (type === "keydown") {
      const result = filter.handleKeyDown(event, apply);
      if (!result.accepted) rejected.push({ event, result });
      if (result.restoreState !== undefined) active.set(code, result.restoreState);
      return;
    }

    filter.handleKeyUp({
      ...event,
      wasActive: active.has(code),
      restoreState: active.get(code),
    }, apply);
  };

  const steer = () => {
    const a = active.get("KeyA") ?? -1;
    const d = active.get("KeyD") ?? -1;
    if (a < 0 && d < 0) return "NEUTRAL";
    return a > d ? "LEFT" : "RIGHT";
  };

  return { accepted, active, filter, rejected, scheduler, send, steer };
}

test("uses the smallest practical threshold above the recorded 2.6ms maximum", () => {
  assert.equal(KEYBOARD_GLITCH_PAIR_MS, 5);
});

test("rejects every sub-3ms KeyD false re-press gap captured in the RAW logs", () => {
  const recordedGaps = [
    0.7, 0.8, 0.7, 0.8, 0.8, 0.7, 0.7, 0.8, 0.6, 0.9, 0.8,
    1.0, 1.0, 1.2, 0.9, 0.9, 1.1, 1.1, 1.0, 0.9, 1.2, 2.3,
    2.6, 1.0, 1.8, 1.0, 0.8, 0.9, 0.8, 0.8, 0.8, 0.7, 0.8,
    1.2, 2.2,
  ];

  for (const gap of recordedGaps) {
    const h = createHarness();
    h.send({ type: "keyup", code: "KeyD", timeStamp: 100 });
    h.send({ type: "keydown", code: "KeyD", timeStamp: 100 + gap });
    h.scheduler.advanceTo(10_000);
    assert.equal(h.active.has("KeyD"), false, `gap=${gap}ms`);
    assert.equal(h.rejected[0].result.reason, "glitch-pair-keep-off", `gap=${gap}ms`);
  }
});

test("accepts normal A/D presses and releases", () => {
  const h = createHarness();
  h.send({ type: "keydown", code: "KeyA", timeStamp: 0 });
  assert.equal(h.steer(), "LEFT");
  h.send({ type: "keyup", code: "KeyA", timeStamp: 100 });
  h.scheduler.advanceTo(106);
  assert.equal(h.steer(), "NEUTRAL");

  h.send({ type: "keydown", code: "KeyD", timeStamp: 200 });
  assert.equal(h.steer(), "RIGHT");
  h.send({ type: "keyup", code: "KeyD", timeStamp: 300 });
  h.scheduler.advanceTo(306);
  assert.equal(h.steer(), "NEUTRAL");
});

test("allows unlimited holds and does not use repeat as a release signal", () => {
  const h = createHarness();
  h.send({ type: "keydown", code: "KeyD", timeStamp: 0 });
  h.send({ type: "keydown", code: "KeyD", timeStamp: 500, repeat: true });
  h.send({ type: "keydown", code: "KeyD", timeStamp: 530, repeat: true });
  h.scheduler.advanceTo(120_000);
  assert.equal(h.active.has("KeyD"), true);
  assert.equal(h.steer(), "RIGHT");
});

test("does not change drift-key behavior while steering is held", () => {
  const h = createHarness();
  h.send({ type: "keydown", code: "KeyD", timeStamp: 0 });
  h.send({ type: "keydown", code: "ShiftLeft", timeStamp: 20 });
  assert.equal(h.active.has("KeyD"), true);
  assert.equal(h.active.has("ShiftLeft"), true);
  h.send({ type: "keyup", code: "ShiftLeft", timeStamp: 400 });
  assert.equal(h.active.has("ShiftLeft"), false);
  assert.equal(h.active.has("KeyD"), true);
});

test("preserves counter-steer priority and returns to the still-held opposite key", () => {
  const h = createHarness();
  h.send({ type: "keydown", code: "KeyA", timeStamp: 0 });
  h.send({ type: "keydown", code: "KeyD", timeStamp: 100 });
  assert.equal(h.steer(), "RIGHT");
  h.send({ type: "keyup", code: "KeyD", timeStamp: 300 });
  h.scheduler.advanceTo(306);
  assert.equal(h.steer(), "LEFT");
});

test("accepts a genuinely fast human re-press outside the 5ms window", () => {
  const h = createHarness();
  h.send({ type: "keydown", code: "KeyD", timeStamp: 0 });
  h.send({ type: "keyup", code: "KeyD", timeStamp: 100 });
  h.send({ type: "keydown", code: "KeyD", timeStamp: 120 });
  assert.equal(h.active.has("KeyD"), true);
  assert.deepEqual(h.accepted.map(({ type }) => type), ["keydown", "keyup", "keydown"]);
  assert.equal(h.rejected.length, 0);
});

test("keeps ON for a recorded-style keyup then 2.6ms non-repeat keydown pair", () => {
  const h = createHarness();
  h.send({ type: "keydown", code: "KeyD", timeStamp: 0 });
  h.send({ type: "keyup", code: "KeyD", timeStamp: 100 });
  h.send({ type: "keydown", code: "KeyD", timeStamp: 102.6 });
  h.scheduler.advanceTo(10_000);
  assert.equal(h.active.has("KeyD"), true);
  assert.equal(h.rejected[0].result.reason, "glitch-pair-keep-on");
  assert.deepEqual(h.accepted.map(({ type }) => type), ["keydown"]);
});

test("keeps OFF for an extra keyup then 2ms false re-press with no later keyup", () => {
  const h = createHarness();
  h.send({ type: "keyup", code: "KeyD", timeStamp: 100 });
  h.send({ type: "keydown", code: "KeyD", timeStamp: 102 });
  h.scheduler.advanceTo(120_000);
  assert.equal(h.active.has("KeyD"), false);
  assert.equal(h.rejected[0].result.reason, "glitch-pair-keep-off");
  assert.deepEqual(h.accepted, []);
});

test("uses RAW timestamps after the 5ms keyup timer already fired and restores the original ON order", () => {
  const h = createHarness();
  h.send({ type: "keydown", code: "KeyD", timeStamp: 0 });
  const originalOrder = h.active.get("KeyD");
  h.send({ type: "keyup", code: "KeyD", timeStamp: 100 });
  h.scheduler.advanceTo(106);
  assert.equal(h.active.has("KeyD"), false, "the delayed keyup was committed before the late event was processed");

  h.send({ type: "keydown", code: "KeyD", timeStamp: 102, processedAt: 110 });

  assert.equal(h.active.get("KeyD"), originalOrder);
  assert.equal(h.steer(), "RIGHT");
  assert.equal(h.rejected.at(-1).result.reason, "late-glitch-pair-restore-on");
});

test("late restoration preserves counter-steer priority instead of treating the false keydown as newest", () => {
  const h = createHarness();
  h.send({ type: "keydown", code: "KeyD", timeStamp: 0 });
  h.send({ type: "keydown", code: "KeyA", timeStamp: 40 });
  assert.equal(h.steer(), "LEFT");

  h.send({ type: "keyup", code: "KeyD", timeStamp: 100 });
  h.scheduler.advanceTo(106);
  h.send({ type: "keydown", code: "KeyD", timeStamp: 102, processedAt: 110 });

  assert.equal(h.steer(), "LEFT");
  assert.ok(h.active.get("KeyD") < h.active.get("KeyA"));
});

test("uses RAW timestamps after the 5ms keyup timer already fired and keeps an originally OFF key OFF", () => {
  const h = createHarness();
  h.send({ type: "keyup", code: "KeyD", timeStamp: 100 });
  h.scheduler.advanceTo(106);

  h.send({ type: "keydown", code: "KeyD", timeStamp: 102, processedAt: 110 });

  assert.equal(h.active.has("KeyD"), false);
  assert.equal(h.steer(), "NEUTRAL");
  assert.equal(h.rejected.at(-1).result.reason, "late-glitch-pair-keep-off");
});

test("does not treat a repeat keydown as a false re-press pair", () => {
  const h = createHarness();
  h.send({ type: "keydown", code: "KeyD", timeStamp: 0 });
  h.send({ type: "keyup", code: "KeyD", timeStamp: 100 });
  h.send({ type: "keydown", code: "KeyD", timeStamp: 102, repeat: true });
  assert.equal(h.active.has("KeyD"), false);
  assert.deepEqual(h.accepted.map(({ type, repeat }) => [type, repeat]), [
    ["keydown", false],
    ["keyup", false],
    ["keydown", true],
  ]);
});

test("accepts a non-repeat keydown just beyond the threshold", () => {
  const h = createHarness();
  h.send({ type: "keydown", code: "KeyD", timeStamp: 0 });
  h.send({ type: "keyup", code: "KeyD", timeStamp: 100 });
  h.send({ type: "keydown", code: "KeyD", timeStamp: 105.1 });
  assert.equal(h.active.has("KeyD"), true);
  assert.equal(h.rejected.length, 0);
});

test("rejects the recorded Backquote/Zenkaku orphan keyup then 2.5ms KeyD fault", () => {
  const h = createHarness();
  h.send({ type: "keyup", code: "Backquote", key: "Zenkaku", timeStamp: 100 });
  h.send({ type: "keydown", code: "KeyD", key: "d", timeStamp: 102.5 });
  h.scheduler.advanceTo(120_000);

  assert.equal(h.active.has("KeyD"), false);
  assert.equal(h.steer(), "NEUTRAL");
  assert.equal(h.rejected.length, 1);
  assert.equal(h.rejected[0].result.reason, "orphan-keyup-cross-key");
  assert.equal(h.rejected[0].result.gapMs, 2.5);
});

test("accepts KeyD after a normally registered Backquote release", () => {
  const h = createHarness();
  h.send({ type: "keydown", code: "Backquote", key: "Zenkaku", timeStamp: 50 });
  h.send({ type: "keyup", code: "Backquote", key: "Zenkaku", timeStamp: 100 });
  h.send({ type: "keydown", code: "KeyD", key: "d", timeStamp: 102.5 });

  assert.equal(h.active.has("KeyD"), true);
  assert.equal(h.rejected.length, 0);
});

test("accepts KeyD when an orphan keyup is outside the 5ms window", () => {
  const h = createHarness();
  h.send({ type: "keyup", code: "Backquote", key: "Zenkaku", timeStamp: 100 });
  h.send({ type: "keydown", code: "KeyD", key: "d", timeStamp: 105.1 });

  assert.equal(h.active.has("KeyD"), true);
  assert.equal(h.rejected.length, 0);
});

test("accepts KeyD when another RAW keyboard event follows the orphan keyup first", () => {
  const h = createHarness();
  h.send({ type: "keyup", code: "Backquote", key: "Zenkaku", timeStamp: 100 });
  h.send({ type: "keydown", code: "KeyW", key: "w", timeStamp: 101 });
  h.send({ type: "keydown", code: "KeyD", key: "d", timeStamp: 102.5 });

  assert.equal(h.active.has("KeyD"), true);
  assert.equal(h.rejected.length, 0);
});
