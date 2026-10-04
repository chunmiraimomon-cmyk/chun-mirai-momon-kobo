import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("cup and random quest character confirmation open the briefing before the countdown", () => {
  assert.match(page, /"character-select" \| "race-briefing"/);
  assert.match(page, /if \(characterSelectSource === "cup" \|\| characterSelectSource === "random-quest"\) \{\s*setPhase\("race-briefing"\);/);
  assert.match(page, /const confirmRaceBriefing = useCallback\(\(\) => beginRace\(4\)/);
});

test("briefing explains configured keyboard, controller and touch controls", () => {
  assert.match(page, /KEY_ACTIONS\.map\(\(action\) =>/);
  assert.match(page, /keyBindings\[action\.id\]/);
  assert.match(page, /gamepadBindings\[action\.id\]/);
  assert.match(page, /SMARTPHONE/);
  assert.match(page, /↑フリック：スキル/);
});

test("briefing lists every item and the selected character skill", () => {
  for (const item of ["FIRE", "HOMING", "BOOST", "SPIKES", "SHIELD", "NOVA"]) {
    assert.match(page, new RegExp(`item: "${item}"`));
  }
  assert.match(page, /selectedCharacter\.skillDescription/);
  assert.match(page, /skillCooldownFor\(selectedCharacter\)/);
});

test("keyboard and controller can confirm or return from the briefing", () => {
  const keyboardBranch = page.indexOf('} else if (phase === "race-briefing")');
  const controllerBranch = page.indexOf('} else if (phase === "race-briefing")', keyboardBranch + 1);
  assert.ok(keyboardBranch > 0);
  assert.ok(controllerBranch > keyboardBranch);
  assert.match(page.slice(keyboardBranch, keyboardBranch + 500), /confirmRaceBriefing\(\)/);
  assert.match(page.slice(controllerBranch, controllerBranch + 350), /current\.confirm[\s\S]*confirmRaceBriefing\(\)/);
  assert.match(page, /briefing-ok-button/);
});
