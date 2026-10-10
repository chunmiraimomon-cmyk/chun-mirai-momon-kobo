import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';

const compilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS };
const transpile = name => ts.transpileModule(readFileSync(new URL(`../app/${name}.ts`, import.meta.url), 'utf8'), { compilerOptions }).outputText;

function builders(browser = false) {
  const materialExports = {};
  vm.runInNewContext(transpile('generated-material-textures'), { exports: materialExports });
  const landformExports = {};
  vm.runInNewContext(transpile('backdrop-landforms'), { exports: landformExports,
    require: name => { assert.equal(name, './generated-material-textures'); return materialExports; } });
  const isolatedMath = Object.create(Math);
  isolatedMath.random = () => { throw new Error('Scenery must not consume gameplay randomness'); };
  const natureExports = {};
  const records = [];
  class FakeTextureLoader {
    load(url, onLoad, _progress, onError) {
      const texture = new THREE.Texture();
      records.push({ url, texture, onLoad, onError });
      return texture;
    }
  }
  const runtime = { exports: natureExports, Math: isolatedMath, setTimeout, clearTimeout,
    require: name => {
      if (name === './generated-material-textures') return materialExports;
      if (name === './backdrop-landforms') return landformExports;
      throw new Error(`Unexpected scenery dependency ${name}`);
    } };
  if (browser) runtime.document = {};
  vm.runInNewContext(transpile('backdrop-nature'), runtime);
  return { ...natureExports, records, three: browser ? { ...THREE, TextureLoader: FakeTextureLoader } : THREE };
}

function course({ allow = true, allClear = false, originX = 0, originZ = 0 } = {}) {
  const clearanceCalls = [];
  const immutable = Object.freeze({
    length: 900,
    pointAt(u, lane = 0) {
      const angle = u * Math.PI * 2;
      return Object.freeze({ x: originX + Math.cos(angle) * (130 + lane),
        y: 20 + Math.sin(angle * 2) * 10, z: originZ + Math.sin(angle) * (130 + lane), heading: angle });
    },
    isClearFromRoad(x, z, margin) {
      const valid = allow && (allClear || Math.abs(Math.hypot(x - originX, z - originZ) - 130) >= margin);
      clearanceCalls.push({ x, z, margin, valid });
      return valid;
    },
  });
  const target = new Proxy(immutable, {
    get(object, key) { assert.ok(Object.hasOwn(object, key)); return object[key]; },
    set() { throw new Error('Scenery must not mutate the road'); },
    defineProperty() { throw new Error('Scenery must not add physics fields'); },
    deleteProperty() { throw new Error('Scenery must not delete road fields'); },
  });
  return { target, clearanceCalls };
}

function meshes(group) {
  const found = [];
  group.traverse(object => { if (object.isMesh) found.push(object); });
  return found;
}
function resources(group) {
  const geometry = new Set(), material = new Set();
  for (const mesh of meshes(group)) {
    geometry.add(mesh.geometry);
    for (const item of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.add(item);
  }
  return { geometry, material };
}
function cleanup(group) {
  const owned = resources(group);
  owned.geometry.forEach(item => item.dispose());
  owned.material.forEach(item => item.dispose());
}
function snapshot(group) {
  return meshes(group).map(mesh => ({ name: mesh.name, count: mesh.count,
    matrices: Array.from(mesh.instanceMatrix.array), colors: Array.from(mesh.instanceColor?.array ?? []) }));
}
const groundY = -0.52;

test('articulated forests have distinct species, no sphere crowns, and bounded static draw/triangle costs', async () => {
  const api = builders();
  for (const theme of ['jungle', 'river']) {
    const fixture = course({ allClear: true });
    const group = api.createNatureBackdrop(api.three, fixture.target, theme, groundY);
    const stats = group.userData.backdropNatureStats;
    assert.ok(stats.drawCalls <= 25 && stats.triangles <= 180000, `${theme}: ${JSON.stringify(stats)}`);
    assert.equal(stats.landforms, 6);
    assert.ok(stats.species.length >= 4);
    assert.ok(stats.species.includes('curved-palm') && stats.species.includes('bamboo-grove'));
    assert.ok(stats.species.includes(theme === 'river' ? 'river-willow' : 'banyan'));
    assert.equal(group.parent, null, 'The caller owns scene placement');
    assert.equal(group.userData.visualOnly, true);
    group.traverse(object => assert.ok(!object.isLight));
    let actualTriangles = 0;
    for (const mesh of meshes(group)) {
      assert.ok(mesh.isInstancedMesh);
      assert.ok(mesh.castShadow === false && mesh.receiveShadow === false);
      assert.notEqual(mesh.geometry.type, 'SphereGeometry');
      assert.ok(Array.from(mesh.instanceMatrix.array).every(Number.isFinite));
      assert.ok(Array.from(mesh.geometry.getAttribute('position').array).every(Number.isFinite));
      actualTriangles += mesh.count * (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3;
    }
    assert.equal(actualTriangles, stats.triangles);
    const leaf = meshes(group).find(mesh => mesh.name.includes('leaf-bundles'));
    assert.ok(leaf.geometry.getAttribute('position').count >= 64, 'The crown contains overlapping folded leaf cards');
    assert.equal(leaf.material.transparent, false);
    assert.ok(leaf.material.alphaTest > 0.3);
    assert.ok(leaf.material.emissiveIntensity > 0 && leaf.material.emissiveIntensity < 0.3);
    await group.userData.backdropReady;
    cleanup(group);
  }
});

test('trees and bank vegetation only use accepted footprints and real ground/terrain support', () => {
  const api = builders();
  for (const theme of ['jungle', 'river']) {
    const fixture = course({ originX: 780, originZ: -640 });
    const group = api.createNatureBackdrop(api.three, fixture.target, theme, groundY);
    assert.ok(group.userData.backdropAnchors.length > 0);
    for (const item of group.userData.backdropAnchors) {
      assert.ok(item.baseY >= groundY - 1e-7);
      assert.ok(item.footprint > 0);
      assert.ok(fixture.clearanceCalls.some(query => query.valid && query.x === item.x && query.z === item.z
        && Math.abs(query.margin - (item.footprint + 18)) < 1e-8));
    }
    assert.ok(group.userData.backdropAnchors.some(item => item.baseY > groundY + 1));
    const falseFixture = course({ allow: false });
    const empty = api.createNatureBackdrop(api.three, falseFixture.target, theme, groundY);
    assert.equal(empty.children.length, 0);
    assert.equal(empty.userData.backdropAnchors.length, 0);
    cleanup(group);
  }
});

test('nature placement is deterministic without calling gameplay Math.random', () => {
  const api = builders();
  for (const theme of ['jungle', 'river']) {
    const a = api.createNatureBackdrop(api.three, course({ allClear: true }).target, theme, groundY);
    const b = api.createNatureBackdrop(api.three, course({ allClear: true }).target, theme, groundY);
    assert.deepEqual(snapshot(a), snapshot(b));
    cleanup(a); cleanup(b);
  }
});

test('urban pocket gardens stay within 5 draws / 15k triangles and reuse the dense crown', async () => {
  const api = builders();
  const fixture = course({ allClear: true });
  const group = api.createCityPlantingBackdrop(api.three, fixture.target, groundY);
  const stats = group.userData.backdropNatureStats;
  assert.ok(stats.drawCalls <= 5 && stats.triangles <= 15000, JSON.stringify(stats));
  assert.equal(group.userData.backdropAnchors.length, 10);
  assert.equal(stats.landforms, 0);
  assert.ok(meshes(group).some(mesh => mesh.name.includes('small-blossoms')));
  assert.ok(meshes(group).every(mesh => mesh.isInstancedMesh && !mesh.castShadow && !mesh.receiveShadow));
  for (const item of group.userData.backdropAnchors) {
    assert.equal(item.baseY, groundY);
    assert.ok(fixture.clearanceCalls.some(query => query.valid && query.x === item.x && query.z === item.z
      && Math.abs(query.margin - (item.footprint + 18)) < 1e-8));
  }
  await group.userData.backdropReady;
  cleanup(group);
});

test('foliage ready promises resolve on success/error and textures are disposed exactly once', async () => {
  for (const scenario of ['load', 'error', 'dispose-before-load']) {
    const api = builders(true);
    const group = api.createCityPlantingBackdrop(api.three, course({ allClear: true }).target, groundY);
    assert.equal(api.records.length, 1, 'All foliage shares one atlas request');
    const record = api.records[0];
    const leaf = meshes(group).find(mesh => mesh.name.includes('leaf-clusters')).material;
    const fallback = leaf.map;
    let fallbackDisposals = 0, atlasDisposals = 0;
    fallback.addEventListener('dispose', () => fallbackDisposals++);
    record.texture.addEventListener('dispose', () => atlasDisposals++);
    if (scenario === 'load') {
      record.onLoad(record.texture);
      await group.userData.backdropReady;
      assert.equal(leaf.map, record.texture);
      assert.equal(fallbackDisposals, 1);
      cleanup(group);
    } else if (scenario === 'error') {
      record.onError(new Error('Intentional missing atlas'));
      await group.userData.backdropReady;
      assert.equal(leaf.map, fallback);
      cleanup(group);
    } else {
      cleanup(group);
      await group.userData.backdropReady;
      record.onLoad(record.texture);
      assert.equal(leaf.map, fallback, 'A late load never revives a discarded material');
    }
    assert.equal(fallbackDisposals, 1, scenario);
    assert.equal(atlasDisposals, 1, scenario);
  }
});
