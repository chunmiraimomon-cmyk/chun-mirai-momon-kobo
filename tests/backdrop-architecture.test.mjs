import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';

const exports = {}, isolatedMath = Object.create(Math);
isolatedMath.random = () => { throw new Error('Architecture must not consume gameplay randomness'); };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../app/backdrop-architecture.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, {
  exports, Math: isolatedMath,
  require: name => {
    assert.equal(name, './generated-material-textures');
    return { markGeneratedSurface(material, kind, mapping, repeat) {
      material.userData.generatedSurface = { kind, mapping, repeat }; return material;
    } };
  },
});

function fixture(allowed = true) {
  const queries = [], radius = 96;
  const course = Object.freeze({
    length: radius * Math.PI * 2,
    pointAt(u) { return { x: 340 + Math.cos(u * Math.PI * 2) * radius, y: 17, z: -240 + Math.sin(u * Math.PI * 2) * radius, heading: u * Math.PI * 2 }; },
    isClearFromRoad(x, z, margin) {
      const valid = allowed && Math.abs(Math.hypot(x - 340, z + 240) - radius) >= margin;
      queries.push({ x, z, margin, valid }); return valid;
    },
  });
  return { group: exports.createCityBackdrop(THREE, course, -34), queries };
}

test('complete city has six architectural families, safe grounded sites and bounded static shared meshes', () => {
  const { group, queries } = fixture();
  const anchors = group.userData.backdropAnchors;
  assert.ok(group.userData.buildingCount >= 24 && group.userData.buildingCount <= 30);
  assert.equal(group.userData.buildingCount, anchors.length);
  assert.equal(new Set(group.userData.cityBuildings.map(building => building.family)).size, 6);
  for (const anchor of anchors) {
    assert.equal(anchor.baseY, -34);
    assert.ok(queries.some(q => q.valid && q.x === anchor.x && q.z === anchor.z && q.margin >= anchor.footprint + 18));
  }
  const areas = group.userData.cityGroundingAreas, links = group.userData.cityPedestrianLinks;
  assert.ok(areas.length > 0 && areas.length <= anchors.length);
  for (const area of areas) {
    assert.ok([area.x, area.z, area.width, area.depth, area.yaw, area.footprint].every(Number.isFinite));
    assert.equal(area.baseY, -34);
    assert.ok(area.footprint >= Math.hypot(area.width / 2, area.depth / 2) - 1e-6);
    assert.ok(queries.some(q => q.valid && Math.abs(q.x - area.x) < 1e-6 && Math.abs(q.z - area.z) < 1e-6
      && q.margin >= area.footprint + 18), 'Expanded plaza has its own verified road-clear footprint');
  }
  for (const link of links) {
    assert.equal(link.baseY, -34);
    assert.ok(link.width <= 2.2 && link.clearance >= 21.2);
    const length = Math.hypot(link.toX - link.fromX, link.toZ - link.fromZ), steps = Math.max(2, Math.ceil(length / 4));
    for (let sample = 0; sample <= steps; sample++) {
      const x = link.fromX + (link.toX - link.fromX) * sample / steps;
      const z = link.fromZ + (link.toZ - link.fromZ) * sample / steps;
      assert.ok(queries.some(q => q.valid && Math.abs(q.x - x) < 1e-6 && Math.abs(q.z - z) < 1e-6 && q.margin >= link.clearance),
        'Every pedestrian-link segment remains clear of the driving course');
    }
  }
  for (let a = 0; a < anchors.length; a++) for (let b = a + 1; b < anchors.length; b++) {
    assert.ok(Math.hypot(anchors[a].x - anchors[b].x, anchors[a].z - anchors[b].z) >= anchors[a].footprint + anchors[b].footprint + 14);
  }
  let triangles = 0;
  for (const mesh of group.children) {
    assert.ok(mesh.isInstancedMesh && !mesh.castShadow && !mesh.receiveShadow);
    assert.ok(Array.from(mesh.instanceMatrix.array).every(Number.isFinite));
    assert.ok(Array.from(mesh.geometry.getAttribute('position').array).every(Number.isFinite));
    assert.ok(Array.from(mesh.geometry.getAttribute('normal').array).every(Number.isFinite));
    triangles += mesh.geometry.index.count / 3 * mesh.count;
  }
  assert.ok(group.children.length <= 25);
  assert.ok(triangles <= 180_000, `${triangles} architecture triangles`);
  assert.equal(group.userData.architectureStats.triangles, triangles);
  group.traverse(object => assert.ok(!object.isLight));
  console.info(`City architecture: ${anchors.length} buildings, ${group.children.length} draws, ${triangles} triangles`);
});

test('city initialization is deterministic; rejected sites produce an empty scene group', () => {
  const first = fixture().group, second = fixture().group;
  assert.deepEqual(first.userData.backdropAnchors, second.userData.backdropAnchors);
  assert.deepEqual(first.userData.cityGroundingAreas, second.userData.cityGroundingAreas);
  assert.deepEqual(first.userData.cityPedestrianLinks, second.userData.cityPedestrianLinks);
  first.children.forEach((mesh, index) => assert.deepEqual(mesh.instanceMatrix.array, second.children[index].instanceMatrix.array));
  const blocked = fixture(false).group;
  assert.equal(blocked.children.length, 0);
  assert.equal(blocked.userData.buildingCount, 0);
  assert.equal(blocked.userData.backdropAnchors.length, 0);
  assert.equal(blocked.userData.cityGroundingAreas.length, 0);
  assert.equal(blocked.userData.cityPedestrianLinks.length, 0);
});
