import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isOfficialGojoLine,
  isOfficialStaffGhost,
  loadOfficialRaceData,
  mergeNewestRaceRecords,
  overlayOfficialRaceRecords,
  OFFICIAL_GOJO_LINE_URLS,
  OFFICIAL_STAFF_GHOST_URLS,
} from "../lib/official-race-data.mjs";

const loadPublicJson = async (url) => {
  const pathname = new URL(url, "https://prism-circuit.test").pathname;
  return JSON.parse(await readFile(new URL(`../public${pathname}`, import.meta.url), "utf8"));
};

test("all six official staff ghosts are valid and mapped to their own courses", async () => {
  assert.deepEqual(Object.keys(OFFICIAL_STAFF_GHOST_URLS).sort(), ["city", "cloud", "jungle", "pirate", "river", "starlight"]);
  for (const [courseId, url] of Object.entries(OFFICIAL_STAFF_GHOST_URLS)) {
    const record = await loadPublicJson(url);
    assert.equal(isOfficialStaffGhost(record, courseId), true, `${courseId} staff ghost`);
  }
});

test("all six official Gojo lines are valid and mapped to their own courses", async () => {
  assert.deepEqual(Object.keys(OFFICIAL_GOJO_LINE_URLS).sort(), ["city", "cloud", "jungle", "pirate", "river", "starlight"]);
  for (const [courseId, url] of Object.entries(OFFICIAL_GOJO_LINE_URLS)) {
    const record = await loadPublicJson(url);
    assert.equal(isOfficialGojoLine(record, courseId), true, `${courseId} Gojo line`);
  }
});

test("new cup one and cup two Gojo lines use the downloaded recordings", async () => {
  const expected = {
    city: { createdAt: 1787981669170, samples: 649 },
    jungle: { createdAt: 1787981769898, samples: 513 },
    river: { createdAt: 1787981838194, samples: 500 },
    pirate: { createdAt: 1787981915281, samples: 655 },
  };
  for (const [courseId, metadata] of Object.entries(expected)) {
    const record = await loadPublicJson(OFFICIAL_GOJO_LINE_URLS[courseId]);
    assert.equal(record.createdAt, metadata.createdAt, `${courseId} createdAt`);
    assert.equal(record.samples.length, metadata.samples, `${courseId} samples`);
  }
});

test("updated starlight records use versioned URLs and the exact released data", async () => {
  assert.match(OFFICIAL_STAFF_GHOST_URLS.starlight, /\?v=1787477340736$/);
  assert.match(OFFICIAL_GOJO_LINE_URLS.starlight, /\?v=1787477215687$/);
  const staff = await loadPublicJson(OFFICIAL_STAFF_GHOST_URLS.starlight);
  const gojo = await loadPublicJson(OFFICIAL_GOJO_LINE_URLS.starlight);
  assert.equal(Math.round(staff.timeMs), 88100);
  assert.equal(staff.samples.length, 757);
  assert.equal(gojo.createdAt, 1787477215687);
  assert.equal(gojo.samples.length, 844);
});

test("the runtime loader returns all bundled records through the public URLs", async () => {
  const requests = [];
  const fetcher = async (url) => ({
    ok: true,
    json: () => loadPublicJson(url),
  });
  const trackingFetcher = async (url, options) => {
    requests.push({ url, options });
    return fetcher(url, options);
  };
  const loaded = await loadOfficialRaceData(trackingFetcher);
  assert.equal(Object.keys(loaded.staff).length, 6);
  assert.deepEqual(Object.keys(loaded.gojoLines).sort(), ["city", "cloud", "jungle", "pirate", "river", "starlight"]);
  assert.equal(requests.every(({ options }) => options.cache === "no-cache"), true);
});

test("released Gojo lines override stale or newer admin recordings on the device", () => {
  const local = { starlight: { createdAt: 999, value: "local-admin" }, custom: { createdAt: 5, value: "keep" } };
  const official = { starlight: { createdAt: 100, value: "released" } };
  assert.deepEqual(overlayOfficialRaceRecords(local, official), {
    starlight: official.starlight,
    custom: local.custom,
  });
});

test("new official data replaces stale local data without deleting other courses", () => {
  const stored = {
    city: { createdAt: 10, value: "old" },
    jungle: { createdAt: 30, value: "local-newer" },
  };
  const official = {
    city: { createdAt: 20, value: "official" },
    jungle: { createdAt: 25, value: "official-older" },
    cloud: { createdAt: 40, value: "official-new" },
  };
  assert.deepEqual(mergeNewestRaceRecords(stored, official), {
    city: official.city,
    jungle: stored.jungle,
    cloud: official.cloud,
  });
});
