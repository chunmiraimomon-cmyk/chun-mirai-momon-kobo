import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EVOLUTION_LAPS_PER_CHAPTER,
  evolutionFeatureState,
  evolutionStageFor,
} from "../lib/evolution-tour.mjs";

test("four chapters advance through twelve stable milestones", () => {
  assert.equal(EVOLUTION_LAPS_PER_CHAPTER, 3);
  assert.deepEqual(
    [0, 1, 2, 3].flatMap((chapter) => [0, 1, 2].map((lap) => evolutionStageFor(chapter, lap + 0.9))),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  );
});

test("lap progress is clamped inside its chapter", () => {
  assert.equal(evolutionStageFor(0, -4), 0);
  assert.equal(evolutionStageFor(2, 99), 8);
  assert.equal(evolutionStageFor(99, 2.2), 11);
});

test("features unlock without changing the stable collision engine", () => {
  assert.deepEqual(evolutionFeatureState(0), { items: false, drift: false, skills: false });
  assert.deepEqual(evolutionFeatureState(2), { items: true, drift: false, skills: false });
  assert.deepEqual(evolutionFeatureState(4), { items: true, drift: true, skills: false });
  assert.deepEqual(evolutionFeatureState(8), { items: true, drift: true, skills: true });
});

test("the evolution screen resolves its chapter before conditional rendering", () => {
  const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /const evolutionChapter = evolutionMilestone\.chapter;/);
});

test("archived cup selection waits for a neutral gamepad frame before accepting confirm", () => {
  const tourSource = readFileSync(new URL("../app/legacy-evolution-tour.tsx", import.meta.url), "utf8");
  assert.match(tourSource, /const padMenuArmed = useRef\(false\)/);
  assert.match(tourSource, /if \(!padMenuArmed\.current\)[\s\S]*?if \(!anyMenuInputHeld\) padMenuArmed\.current = true;[\s\S]*?return;/);
  assert.ok(
    tourSource.indexOf("if (!padMenuArmed.current)") < tourSource.indexOf('} else if (screen === "select")'),
    "the neutral-input gate must run before the select-screen confirm handler",
  );
});
