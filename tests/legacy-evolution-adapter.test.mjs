import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { adaptLegacyEvolutionSource } from "../lib/legacy-evolution-adapter.mjs";

const snapshots = ["v1", "v3", "v7", "v11", "v15", "v23", "v24", "v26", "v30", "v76", "v81", "v94"];

for (const version of snapshots) {
  test(`${version} archived source receives the compatibility adapter without editing its snapshot`, () => {
    const path = `legacy-evolution/${version}/app/page.tsx`;
    const source = fs.readFileSync(path, "utf8");
    const transformed = adaptLegacyEvolutionSource(source, path)?.code;

    assert.ok(transformed);
    assert.equal((transformed.match(/evolution:legacy-finish/g) ?? []).length, 1);
    assert.equal((transformed.match(/__EVOLUTION_AUTOSTART__/g) ?? []).length, 2);
    assert.equal((transformed.match(/__EVOLUTION_PAUSED__/g) ?? []).length, 2);
    assert.equal(transformed.includes("const TOTAL_LAPS = 3;"), false);
    if (source.includes("const TOTAL_LAPS = 3;")) assert.match(transformed, /__EVOLUTION_LAPS__/);
    assert.match(transformed, /evolution:legacy-telemetry/);
    assert.equal(source.includes("evolution:legacy-finish"), false, "archive source itself must remain unpatched");
  });
}

test("adventure snapshots read the requested archived course before autostart", () => {
  for (const version of ["v23", "v24", "v26", "v30"]) {
    const path = `legacy-evolution/${version}/app/page.tsx`;
    const transformed = adaptLegacyEvolutionSource(fs.readFileSync(path, "utf8"), path)?.code ?? "";
    assert.match(transformed, /__EVOLUTION_CUP_ID__/);
    assert.match(transformed, /__EVOLUTION_COURSE_INDEX__/);
  }
});

test("manifest pins every requested version to an archived commit", () => {
  const manifest = JSON.parse(fs.readFileSync("legacy-evolution/manifest.json", "utf8"));
  assert.deepEqual(Object.keys(manifest.snapshots), snapshots);
  assert.deepEqual(manifest.tourOrder.origin, ["v1", "v3", "v7", "v11", "v15", "v76:city"]);
  assert.deepEqual(manifest.tourOrder.adventure, ["v23:river", "v24:river", "v23:pirate", "v30:pirate", "v81:pirate", "v23:cloud", "v26:cloud"]);
  assert.deepEqual(manifest.tourOrder.skills, ["v94:city", "v94:starlight-gojo"]);
  for (const snapshot of Object.values(manifest.snapshots)) assert.match(snapshot.commit, /^[0-9a-f]{7}$/);
});

test("V94 archive can select a racer and boot the historical Gojo duel", () => {
  const path = "legacy-evolution/v94/app/page.tsx";
  const transformed = adaptLegacyEvolutionSource(fs.readFileSync(path, "utf8"), path)?.code ?? "";
  assert.match(transformed, /__EVOLUTION_CHARACTER_INDEX__/);
  assert.match(transformed, /__EVOLUTION_GOJO_DUEL__/);
  assert.match(transformed, /startGojoChallenge\(\)/);
  assert.match(transformed, /action: "skill"/);
});

test("requested lap count is read at race time after archived modules are preloaded", () => {
  for (const version of ["v7", "v15", "v23", "v81", "v94"]) {
    const path = `legacy-evolution/${version}/app/page.tsx`;
    const transformed = adaptLegacyEvolutionSource(fs.readFileSync(path, "utf8"), path)?.code ?? "";
    assert.match(transformed, /const getEvolutionTotalLaps = \(\) =>/);
    assert.match(transformed, /__EVOLUTION_LAPS__/);
    assert.doesNotMatch(transformed, /const TOTAL_LAPS/);
  }
  const tour = fs.readFileSync("app/legacy-evolution-tour.tsx", "utf8");
  assert.match(tour, /version: "V81"[^\n]+course: "BLACKWAKE GALLEON"[^\n]+laps: 3/);
  assert.match(tour, /version: "V94"[^\n]+course: "CENTRAL CITY"[^\n]+laps: 3/);
});

test("pre-V39 archives receive the V39 moving-light and river-coordinate optimizations", () => {
  const transformed = Object.fromEntries(["v3", "v7", "v11", "v15", "v23", "v24", "v26", "v30"].map((version) => {
    const path = `legacy-evolution/${version}/app/page.tsx`;
    return [version, adaptLegacyEvolutionSource(fs.readFileSync(path, "utf8"), path)?.code ?? ""];
  }));
  assert.doesNotMatch(transformed.v3, /const rearGlow = new THREE\.PointLight/);
  for (const version of ["v7", "v11", "v15", "v23", "v24", "v26", "v30"]) {
    assert.doesNotMatch(transformed[version], /const (?:glow|light|starLight) = new THREE\.PointLight/);
  }
  for (const version of ["v24", "v26", "v30"]) {
    assert.match(transformed[version], /evolutionWaterSampleCount = 720/);
    assert.match(transformed[version], /lastEvolutionWaterFlowUpdateAt >= 33/);
    assert.match(transformed[version], /sampledEvolutionWaterPointAt\(particle\.progress, lane\)/);
  }
});

test("native archived gamepad readers accept the configurable bridge state", () => {
  for (const version of ["v15", "v23", "v24", "v26", "v30", "v76", "v81", "v94"]) {
    const path = `legacy-evolution/${version}/app/page.tsx`;
    const transformed = adaptLegacyEvolutionSource(fs.readFileSync(path, "utf8"), path)?.code ?? "";
    assert.match(transformed, /__EVOLUTION_GAMEPAD_INPUT__/);
  }
});

test("bug archive action hooks are limited to the requested historical builds", () => {
  const transformed = Object.fromEntries(["v3", "v11", "v15", "v94"].map((version) => {
    const path = `legacy-evolution/${version}/app/page.tsx`;
    return [version, adaptLegacyEvolutionSource(fs.readFileSync(path, "utf8"), path)?.code ?? ""];
  }));
  assert.match(transformed.v3, /action: "steer"/);
  assert.match(transformed.v11, /action: "steer"/);
  assert.match(transformed.v11, /action: "crash"/);
  assert.doesNotMatch(transformed.v15, /evolution:legacy-action/);
  assert.match(transformed.v94, /action: "skill"/);
});
