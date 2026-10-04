import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  cupMedalForRank,
  cupStandingOrder,
  normalizeCupMedalCabinet,
  recordCupMedal,
  strongestCupMedal,
} from "../lib/cup-awards.mjs";

test("cup standings preserve the existing score and final-race tiebreak rules", () => {
  assert.deepEqual(cupStandingOrder([9, 11, 6, 4], [3, 0, 1, 2]), [1, 0, 2, 3]);
  assert.deepEqual(cupStandingOrder([8, 8, 8, 3], [2, 0, 1, 3]), [2, 0, 1, 3]);
});

test("only the top three BASIC CUP ranks receive medals", () => {
  assert.equal(cupMedalForRank(1), "gold");
  assert.equal(cupMedalForRank(2), "silver");
  assert.equal(cupMedalForRank(3), "bronze");
  assert.equal(cupMedalForRank(4), null);
});

test("the saved medal never becomes weaker", () => {
  assert.equal(strongestCupMedal(null, "bronze"), "bronze");
  assert.equal(strongestCupMedal("bronze", "silver"), "silver");
  assert.equal(strongestCupMedal("gold", "silver"), "gold");
  assert.equal(strongestCupMedal("silver", null), "silver");
});

test("gold, silver and bronze are collected independently with legacy migration", () => {
  assert.deepEqual(normalizeCupMedalCabinet(null, "silver"), { gold: false, silver: true, bronze: false });
  const bronze = recordCupMedal(null, "bronze");
  assert.deepEqual(bronze, { gold: false, silver: false, bronze: true });
  assert.deepEqual(recordCupMedal(bronze, "gold"), { gold: true, silver: false, bronze: true });
});

test("both cups wire separate ceremonies, medal cabinets, persistence, and the presentation lock", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /"award-ceremony"/);
  assert.match(source, /BASIC_CUP_MEDAL_STORAGE_KEY/);
  assert.match(source, /ADVENTURE_CUP_MEDAL_STORAGE_KEY/);
  assert.match(source, /ADVENTURE_CUP_MEDALS_STORAGE_KEY/);
  assert.match(source, /setTimeout\([^]*2000\)/);
  assert.match(source, /phase === "award-ceremony"/);
  assert.match(source, /bestBasicCupMedal/);
  assert.match(source, /basicCupMedalCabinet/);
  assert.match(source, /adventureCupMedalCabinet/);
  assert.match(source, /const cupAwardEarned = playerCupRank <= 3/);
  assert.match(source, /setPhase\(playerCupRank <= 3 \? "award-ceremony" : "championship"\)/);
  assert.doesNotMatch(source, /const basicCupAwardEarned = activeCupId === "basic"/);
  assert.match(source, /\{activeCup\.name\} · GRAND PRIX AWARDS/);
  assert.match(source, /achievement-medal-cabinets/);
  assert.match(source, /resetAllGameData/);
  assert.match(source, /GAME DATA RESET/);
  assert.match(source, /award-player-badge">▼ YOU/);
  assert.match(source, /actorId === 0 \? "、あなた"/);
  assert.match(css, /\.award-ceremony-overlay/);
  assert.match(css, /\.award-podium-entry\.player-award::before/);
  assert.match(css, /\.award-player-badge/);
  assert.match(css, /\.award-podium-entry\.player-award>div/);
  assert.match(css, /\.cup-medal-record/);
  assert.match(css, /\.achievement-medal-cabinet/);
  assert.match(css, /\.achievement-medal-cabinets/);
  assert.match(css, /\.achievement-medal-cabinet\.cup-adventure/);
  assert.match(css, /\.data-reset-settings/);
});
