import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';

const compilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS };
const transpile = text => ts.transpileModule(text, { compilerOptions }).outputText;
const materials = {};
vm.runInNewContext(transpile(readFileSync(new URL('../app/generated-material-textures.ts', import.meta.url), 'utf8')), { exports: materials });
const functions = {};
const backdropMath = Object.create(Math);
backdropMath.random = () => { throw new Error('Pirate scenery must not consume gameplay randomness'); };
vm.runInNewContext(transpile(readFileSync(new URL('../app/pirate-horizon.ts', import.meta.url), 'utf8')), {
  exports: functions,
  Math: backdropMath,
  require: name => {
    assert.equal(name, './generated-material-textures');
    return materials;
  },
});
const { createPirateHorizonShip, createOctopusForeshadowArms, pirateOctopusApproach } = functions;

// Exercise the real playable ship course, not a simplified mock whose clearance
// could accidentally place the vessel inside the giant course hull.
const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('page.tsx', page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const courseDeclaration = ast.statements.find(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(ast) === 'COURSES'));
const courseHelpers = ast.statements.filter(n => ['wrap01', 'progressDelta', 'createRaceCourse'].includes(n.name?.text)).map(n => n.getText(ast));
const courseContext = vm.createContext({ THREE });
vm.runInContext(transpile(`${courseDeclaration.getText(ast)}\n${courseHelpers.join('\n')}\nglobalThis.course = createRaceCourse(THREE, COURSES.find(c => c.id === "pirate"));`), courseContext);

function sceneFixture(allow = true) {
  const queries = [];
  const original = courseContext.course;
  const course = Object.freeze({
    pointAt: (u, lane) => Object.freeze(original.pointAt(u, lane)),
    isClearFromRoad(x, z, radius) {
      const valid = allow && original.isClearFromRoad(x, z, radius);
      queries.push({ x, z, radius, valid });
      return valid;
    },
  });
  const scene = new THREE.Scene();
  const group = createPirateHorizonShip(THREE, scene, course, -0.52);
  const meshes = [];
  group.traverse(object => { if (object.isMesh) meshes.push(object); });
  return { scene, group, meshes, queries };
}

function snapshot(group) {
  const result = [];
  group.traverse(object => {
    if (!object.isMesh) return;
    result.push({ name: object.name, transform: [...object.position.toArray(), ...object.rotation.toArray(), ...object.scale.toArray()],
      instances: object.instanceMatrix ? Array.from(object.instanceMatrix.array) : null,
      geometry: Array.from(object.geometry.attributes.position.array) });
  });
  return result;
}

test('a single recognizable distant vessel stays outside the actual road and playable hull', () => {
  const f = sceneFixture();
  assert.equal(f.group.parent, f.scene);
  assert.equal(f.group.userData.vesselCount, 1);
  const anchor = f.group.userData.backdropAnchor;
  assert.equal(anchor.kind, 'horizon-ship');
  assert.ok(f.queries.some(q => q.valid && q.x === anchor.x && q.z === anchor.z && q.radius >= anchor.footprint + 24));
  assert.ok(Math.abs(anchor.x) >= 196 || anchor.z <= -274 || anchor.z >= 374);
  for (let i = 0; i < 64; i++) {
    const road = courseContext.course.pointAt(i / 64);
    assert.ok(Math.hypot(anchor.x - road.x, anchor.z - road.z) < 565, 'distant vessel remains within far visibility budget');
  }
  for (const name of ['horizon-curved-hull', 'horizon-contoured-deck', 'horizon-six-billowed-sails', 'horizon-masts-and-yards', 'horizon-standing-rigging']) {
    assert.ok(f.group.getObjectByName(name), name);
  }
  const sail = f.group.getObjectByName('horizon-six-billowed-sails');
  assert.equal(sail.count, 6);
  assert.ok(Math.max(...sail.geometry.attributes.position.array.filter((_, i) => i % 3 === 2)) > 0.2, 'sails actually billow rather than remain flat rectangles');
});

test('the vessel is static, deterministic, atlas-tagged and under 25 draws / 60k triangles', () => {
  const f = sceneFixture();
  assert.deepEqual(snapshot(f.group), snapshot(sceneFixture().group));
  let draws = 0, triangles = 0;
  const uniqueGeometries = new Set();
  for (const mesh of f.meshes) {
    draws++;
    const count = mesh.isInstancedMesh ? mesh.count : 1;
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3 * count;
    uniqueGeometries.add(mesh.geometry);
    assert.ok(Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite));
    assert.ok(Array.from(mesh.geometry.attributes.normal.array).every(Number.isFinite));
    assert.equal(mesh.castShadow, false);
    assert.equal(mesh.receiveShadow, false);
    assert.equal(mesh.userData.visualOnly, true);
  }
  f.group.traverse(object => assert.ok(!object.isLight));
  assert.ok(draws <= 25);
  assert.ok(triangles < 60_000);
  assert.equal(f.group.userData.pirateHorizonStats.drawCalls, draws);
  assert.equal(f.group.userData.pirateHorizonStats.triangles, triangles);
  assert.ok(uniqueGeometries.size < f.meshes.length, 'cabins, posts and details share their geometry');
  const generatedKinds = new Set(f.meshes.map(mesh => mesh.material.userData.generatedSurface?.kind));
  for (const kind of ['wood', 'canvas', 'rope', 'iron', 'metal']) assert.ok(generatedKinds.has(kind), kind);
});

test('blocked placement produces no hidden ship and allocates no unused mesh resources', () => {
  const f = sceneFixture(false);
  assert.equal(f.meshes.length, 0);
  assert.equal(f.group.userData.vesselCount, 0);
  assert.equal(f.group.userData.pirateHorizonStats.drawCalls, 0);
  assert.equal(f.group.userData.backdropAnchor, undefined);
});

test('eight decorative curled arms share the existing octopus materials and remain static', () => {
  const skin = new THREE.MeshStandardMaterial(), suckers = new THREE.MeshStandardMaterial();
  const group = createOctopusForeshadowArms(THREE, skin, suckers);
  assert.equal(group.userData.armCount, 8);
  assert.equal(group.userData.visualOnly, true);
  assert.equal(group.children.length, 2);
  assert.equal(group.children[0].material, skin);
  assert.equal(group.children[1].material, suckers);
  assert.equal(group.children[1].count, 56);
  const before = snapshot(group);
  for (let step = 0; step <= 100; step++) pirateOctopusApproach(0, step / 100);
  assert.deepEqual(snapshot(group), before, 'approach adjusts only the parent in existing scene code');
  group.traverse(object => {
    assert.ok(!object.isLight);
    if (!object.isMesh) return;
    assert.equal(object.castShadow, false);
    assert.equal(object.receiveShadow, false);
    assert.ok(Array.from(object.geometry.attributes.position.array).every(Number.isFinite));
  });
  assert.equal(createOctopusForeshadowArms(THREE, skin).children.length, 1);
});

test('octopus approach is bounded, monotonic and continuous across all three lap boundaries', () => {
  assert.equal(pirateOctopusApproach(0, 0), 0);
  assert.equal(pirateOctopusApproach(0, 1), pirateOctopusApproach(1, 0));
  assert.equal(pirateOctopusApproach(1, 1), pirateOctopusApproach(2, 0));
  assert.equal(pirateOctopusApproach(2, 0), 1);
  let previous = 0;
  for (let sample = 0; sample <= 3000; sample++) {
    const phase = sample / 1000;
    const result = pirateOctopusApproach(Math.floor(phase), phase % 1);
    assert.ok(result >= previous && result >= 0 && result <= 1);
    previous = result;
  }
  for (const lap of [-10, 0, 1, 2, 10, NaN]) for (const fraction of [-4, 0, 0.5, 1, 4, NaN]) {
    const result = pirateOctopusApproach(lap, fraction);
    assert.ok(Number.isFinite(result) && result >= 0 && result <= 1);
  }
});
