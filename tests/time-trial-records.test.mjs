import assert from "node:assert/strict";
import test from "node:test";

import {
  insertPersonalGhostRecord,
  normalizePersonalGhostStore,
  PERSONAL_GHOST_LIMIT,
} from "../lib/time-trial-records.mjs";

const ghost = (timeMs, createdAt = timeMs, courseId = "city") => ({
  version: 1,
  courseId,
  character: "GIANT",
  timeMs,
  createdAt,
  kind: "personal",
  samples: [[0, 0, 0, 0, 0, 0, 0], [100, 1, 0, 0, 0, 0, 0]],
});

test("legacy single personal best migrates into the ranked list", () => {
  const legacy = ghost(65000);
  assert.deepEqual(normalizePersonalGhostStore({ city: legacy }), { city: [legacy] });
});

test("personal records stay sorted and retain only the fastest five", () => {
  let records = [];
  for (const time of [70000, 65000, 68000, 64000, 72000, 66000]) {
    records = insertPersonalGhostRecord(records, ghost(time)).records;
  }
  assert.equal(PERSONAL_GHOST_LIMIT, 5);
  assert.deepEqual(records.map((entry) => entry.timeMs), [64000, 65000, 66000, 68000, 70000]);
});

test("a run reports its top-five rank and a slower sixth record is rejected", () => {
  const records = [61000, 62000, 63000, 64000, 65000].map((time) => ghost(time));
  const ranked = insertPersonalGhostRecord(records, ghost(62500));
  assert.equal(ranked.rank, 3);
  assert.deepEqual(ranked.records.map((entry) => entry.timeMs), [61000, 62000, 62500, 63000, 64000]);
  assert.equal(insertPersonalGhostRecord(records, ghost(90000)).rank, null);
});

test("invalid or mismatched legacy entries are discarded during migration", () => {
  assert.deepEqual(normalizePersonalGhostStore({ city: ghost(65000, 1, "cloud"), cloud: { broken: true } }), {});
});
