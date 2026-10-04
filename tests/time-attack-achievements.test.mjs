import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("time attack exposes all six official courses and records at ten hertz", () => {
  assert.match(page, /const TIME_TRIAL_COURSE_IDS: CourseId\[\] = \["city", "jungle", "starlight", "river", "pirate", "cloud"\]/);
  assert.match(page, /const GHOST_SAMPLE_INTERVAL_MS = 100/);
  assert.match(page, /const rivalCharacters = timeTrialMode\s*\? \[\]/);
  assert.match(page, /kind: "personal" \| "staff"/);
});

test("time attack removes every course hazard while keeping the base course", () => {
  assert.match(page, /courseDefinition\.id === "jungle" && !timeTrialMode/);
  assert.match(page, /courseDefinition\.id === "river" && !timeTrialMode/);
  assert.match(page, /courseDefinition\.id === "cloud" && !timeTrialMode/);
  assert.match(page, /courseDefinition\.id === "pirate" && !timeTrialMode/);
  assert.match(page, /courseDefinition\.id === "cloud" && !timeTrialMode && cloudAtmosphere/);
  assert.match(page, /racing && !timeTrialMode && courseDefinition\.id === "cloud"/);
  assert.match(page, /starlightShootingStarsEnabled = !timeTrialMode/);
});

test("personal top five and staff ghosts persist independently", () => {
  assert.match(page, /prism-circuit-time-trial-ghosts-v1/);
  assert.match(page, /normalizePersonalGhostStore/);
  assert.match(page, /insertPersonalGhostRecord/);
  assert.match(page, /personal: \{ \.\.\.ghostStoreRef\.current\.personal/);
  assert.match(page, /staff: \{ \.\.\.ghostStoreRef\.current\.staff/);
  assert.match(page, /PERSONAL TOP 5/);
  assert.match(page, /ADMIN · RECORD STAFF GHOST/);
});

test("skill options default to on for cups and creator races", () => {
  assert.match(page, /const \[skillOptionEnabled, setSkillOptionEnabled\] = useState\(true\)/);
  assert.match(page, /const \[creatorRaceSkillsEnabled, setCreatorRaceSkillsEnabled\] = useState\(true\)/);
});

test("admin driving lines are recorded for Gojo only and preserve shortcut priority", () => {
  assert.match(page, /prism-circuit-gojo-lines-v1/);
  assert.match(page, /ADMIN · RECORD GOJO LINE/);
  assert.match(page, /rival\.name === "Gojo" \? sampleGojoLineAt/);
  assert.match(page, /const recordedDrifting = \(gojoLineNow\.flags & 1\) !== 0/);
  assert.match(page, /if \(rival\.shortcutActive\)/);
  assert.match(page, /DOWNLOAD \.GOJO-LINE\.JSON/);
});

test("all requested achievements are registered and saved locally", () => {
  for (const id of [
    "FIRST_WIN", "CUP_MASTER", "PERFECT", "DRIFT_MASTER", "AIRBORNE",
    "COMEBACK", "DEFENDER", "GOJO_DEFEATED", "COURSE_DESIGNER", "EVOLUTION_WITNESS",
  ]) assert.match(page, new RegExp(`id: "${id}"`));
  assert.match(page, /prism-circuit-achievements-v1/);
});

test("anaglyph rendering is fully removed from the current game", () => {
  assert.doesNotMatch(page, /anaglyph|stereo/i);
});
