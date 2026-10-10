import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';

const loaded = new Map();
const isolatedMath = Object.create(Math);
isolatedMath.random = () => { throw new Error('Sky scenery cannot consume gameplay randomness'); };
function loadModule(name) {
  if (loaded.has(name)) return loaded.get(name);
  assert.ok(['backdrop-sky-sea', 'backdrop-clouds', 'pirate-horizon', 'generated-material-textures'].includes(name));
  const exports = {};
  loaded.set(name, exports);
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../app/${name}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, Math: isolatedMath, require: dependency => loadModule(dependency.replace('./', '')) });
  return exports;
}
const { createSkySeaBackdrop, createHeroMoonGeometry, createHeroMoonMaterial } = loadModule('backdrop-sky-sea');

function fixture(theme, allow = true) {
  const course = Object.freeze({
    length: Math.PI * 200,
    pointAt(u, lane = 0) {
      const angle = u * Math.PI * 2;
      return Object.freeze({ x: Math.cos(angle) * (100 + lane), y: 12 + Math.sin(angle * 2) * 6,
        z: Math.sin(angle) * (100 + lane), heading: -angle });
    },
    isClearFromRoad(x, z, margin, ignoreU) {
      return allow && (Number.isFinite(ignoreU) || Math.abs(Math.hypot(x, z) - 100) >= margin);
    },
  });
  const group = createSkySeaBackdrop(THREE, course, theme, -34);
  group.updateMatrixWorld(true);
  const objects = [];
  group.traverse(object => { if (object.isMesh || object.isPoints) objects.push(object); });
  return { course, group, objects };
}

test('all sky/sea compositions are finite, static, deterministic and within 25 draws / 180k triangles', () => {
  for (const theme of ['cloud', 'starlight', 'pirate']) {
    const f = fixture(theme), second = fixture(theme);
    let draws = 0, triangles = 0;
    for (let index = 0; index < f.objects.length; index++) {
      const object = f.objects[index];
      assert.equal(object.userData.visualOnly, true);
      assert.equal(object.castShadow, false);
      assert.equal(object.receiveShadow, false);
      for (const attribute of Object.values(object.geometry.attributes)) {
        assert.ok(Array.from(attribute.array).every(Number.isFinite));
      }
      assert.deepEqual(object.geometry.attributes.position.array, second.objects[index].geometry.attributes.position.array);
      assert.deepEqual(object.matrixWorld.elements, second.objects[index].matrixWorld.elements);
      if (object.isInstancedMesh) assert.deepEqual(object.instanceMatrix.array, second.objects[index].instanceMatrix.array);
      draws++;
      if (object.isMesh) triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3 * (object.isInstancedMesh ? object.count : 1);
    }
    f.group.traverse(object => assert.ok(!object.isLight));
    assert.ok(draws > 0 && draws <= 25, `${theme}: ${draws} draws`);
    assert.ok(triangles <= 180_000, `${theme}: ${triangles} triangles`);
    assert.equal(f.group.userData.skySeaBackdropStats.drawCalls, draws);
    assert.equal(f.group.userData.skySeaBackdropStats.triangles, triangles);
    assert.ok(Array.isArray(f.group.userData.backdropAnchors));
    assert.equal(f.group.userData.update, undefined);
  }
});

test('starlight is entirely above the course: no opaque lower clouds, mountains, duplicate moon or sky lights', () => {
  const f = fixture('starlight');
  assert.equal(f.objects.length, 2);
  assert.equal(f.group.userData.emptyLowerSpace, true);
  assert.equal(f.group.userData.backdropAnchors.length, 0);
  for (const object of f.objects) {
    assert.equal(object.material.transparent, true);
    assert.equal(object.material.depthWrite, false);
    assert.equal(object.material.blending, THREE.AdditiveBlending);
    assert.doesNotMatch(object.name, /cloud|ridge|mountain|moon/);
    const p = object.geometry.attributes.position;
    for (let index = 0; index < p.count; index++) assert.ok(p.getY(index) > 18 + 50);
  }
  assert.equal(f.group.userData.nightStrength.value, 0, 'invisible during daytime');
  f.group.userData.setNightStrength(0.67);
  for (const object of f.objects) assert.equal(object.material.uniforms.nightStrength.value, 0.67);
  f.group.userData.setNightStrength(5);
  assert.equal(f.group.userData.nightStrength.value, 1);
  f.group.userData.setNightStrength(NaN);
  assert.equal(f.group.userData.nightStrength.value, 0);
});

test('clouds stay sparse, use four fused variants and restrict overlaps to the outer 20% of road', () => {
  const f = fixture('cloud');
  const stats = f.group.userData.skySeaBackdropStats;
  assert.equal(f.objects.length, 4);
  assert.ok(stats.instances >= 8 && stats.instances <= 10);
  assert.ok(stats.triangles <= 22_080);
  for (const object of f.objects) {
    assert.ok(object.isInstancedMesh);
    assert.equal(object.material.vertexColors, true);
    assert.equal(object.material.userData.generatedSurface, undefined);
  }
  assert.equal(f.group.userData.backdropAnchors.length, 8);
  const overlaps = f.group.userData.cloudOverlapAnchors;
  assert.ok(overlaps.length > 0 && overlaps.length <= 2);
  for (const overlap of overlaps) {
    assert.ok(Math.abs(overlap.lane) - overlap.radius >= 8.15 - 1e-6);
    for (let step = -5; step <= 5; step++) for (const lane of [-8, 0, 8]) {
      const p = f.course.pointAt(overlap.progress + step * 3 / f.course.length, lane);
      const heading = f.course.pointAt(overlap.progress).heading;
      const dx = p.x - overlap.x, dz = p.z - overlap.z;
      const x = dx * Math.cos(heading) - dz * Math.sin(heading), z = dx * Math.sin(heading) + dz * Math.cos(heading);
      assert.ok((x / overlap.radius) ** 2 + (z / 12) ** 2 >= 1.005);
    }
  }
  const blocked = fixture('cloud', false);
  assert.equal(blocked.objects.length, 0);
  assert.equal(blocked.group.userData.backdropAnchors.length, 0);
});

test('one pirate ship has a curved hull, visible sail faces, gunports, flag and soft water-contact wake', () => {
  const f = fixture('pirate');
  assert.equal(f.group.userData.vesselCount, 1);
  assert.equal(f.group.userData.backdropAnchors.length, 1);
  const vessel = f.group.getObjectByName('pirate-horizon-vessel');
  assert.equal(vessel.userData.vesselCount, 1);
  assert.ok(vessel.getObjectByName('horizon-curved-hull').geometry.attributes.position.count > 1000);
  const sails = vessel.getObjectByName('horizon-six-billowed-sails');
  assert.equal(sails.count, 6);
  assert.ok(Math.abs(sails.instanceMatrix.array[2]) > 1, 'yard rotation shows sail surfaces from the broadside view');
  for (const name of ['horizon-broadside-cannon-barrels', 'horizon-continuous-hull-wales', 'horizon-tattered-pirate-banner']) assert.ok(vessel.getObjectByName(name));
  const foam = vessel.getObjectByName('horizon-soft-waterline-and-wake');
  assert.equal(foam.material.transparent, true);
  assert.equal(foam.material.depthWrite, false);
  assert.equal(foam.geometry.attributes.color.itemSize, 4);
  const alphas = Array.from(foam.geometry.attributes.color.array).filter((_, index) => index % 4 === 3);
  assert.ok(alphas.some(value => value === 0));
  assert.ok(Math.max(...alphas) < 0.5);
  assert.ok(f.objects.every(object => !/mountain|island|ridge/.test(object.name)));
});

test('hero moon replaces the existing model at radius25, preserving cycle controls with craters and terminator', () => {
  const geometry = createHeroMoonGeometry(THREE), material = createHeroMoonMaterial(THREE);
  const p = geometry.attributes.position;
  assert.ok(p.count < 3000);
  let minRadius = Infinity, maxRadius = 0;
  for (let index = 0; index < p.count; index++) {
    const radius = Math.hypot(p.getX(index), p.getY(index), p.getZ(index));
    minRadius = Math.min(minRadius, radius); maxRadius = Math.max(maxRadius, radius);
    assert.ok(radius > 24.5 && radius < 25.5);
  }
  assert.ok(maxRadius - minRadius > 0.25, 'actual crater bowl and rim relief');
  assert.equal(material.isMeshStandardMaterial, true);
  assert.equal(material.opacity, 0);
  assert.equal(material.emissiveIntensity, 0);
  assert.equal(material.userData.generatedSurface, undefined, 'no busy stone atlas over the lunar shader');
  material.opacity = 1;
  material.emissiveIntensity = 1.32;
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader, null);
  assert.match(shader.vertexShader, /vLunarLocal = position/);
  assert.equal((shader.fragmentShader.match(/relief \+= lunarCrater/g) ?? []).length, 19);
  assert.match(shader.fragmentShader, /outgoingLight \*= mix\(\.085,1\.0,moonPhase\)/);
  assert.equal(material.opacity, 1);
  assert.equal(material.emissiveIntensity, 1.32);
});

test('all sky/sea resources are owned by the returned group and released by ordinary scene cleanup', () => {
  for (const theme of ['cloud', 'starlight', 'pirate']) {
    const f = fixture(theme);
    const scene = new THREE.Scene();
    scene.add(f.group);
    const geometries = new Set(), materials = new Set();
    for (const object of f.objects) {
      geometries.add(object.geometry);
      materials.add(object.material);
    }
    let disposed = 0;
    for (const resource of [...geometries, ...materials]) resource.addEventListener('dispose', () => disposed++);
    for (const resource of [...geometries, ...materials]) resource.dispose();
    assert.equal(disposed, geometries.size + materials.size);
    assert.equal(f.group.parent, scene);
  }
});
