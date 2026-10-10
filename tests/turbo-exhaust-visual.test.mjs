import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';

const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText).toString('base64');
const energyUrl = moduleUrl(await readFile(new URL('../app/turbo-energy-burst.ts', import.meta.url), 'utf8'));
const source = (await readFile(new URL('../app/turbo-exhaust-visual.ts', import.meta.url), 'utf8'))
  .replace('"./turbo-energy-burst"', JSON.stringify(energyUrl));
const { createTurboExhaustVisual, turboExhaustProfile } = await import(moduleUrl(source));
const frame = ignitionAge => ({ active: true, timeSeconds: 20, strength: 1, drift: true, boosting: false, ignitionAge });

test('exhaust compresses then fires a short wide puff before returning to its normal jet', () => {
  const base = turboExhaustProfile(frame(Infinity), 0);
  const charge = turboExhaustProfile(frame(.035), 0);
  const blast = turboExhaustProfile(frame(.085), 0);
  assert.ok(charge.width < base.width && charge.length < base.length);
  assert.ok(blast.width > base.width * 1.4);
  assert.ok(blast.length < base.length * .75);
  for (const age of [.5, .6, 10, -1]) assert.deepEqual(turboExhaustProfile(frame(age), 0), base);
});

test('both nozzles retain their outlet positions and reuse geometry/materials for every frame', () => {
  const parent = new THREE.Group(), fx = createTurboExhaustVisual(THREE, parent);
  const nozzles = fx.group.children;
  assert.equal(nozzles.length, 2);
  const outlets = nozzles.map(nozzle => nozzle.position.clone());
  const meshes = nozzles.flatMap(nozzle => nozzle.children);
  const geometry = meshes.map(mesh => mesh.geometry), materials = meshes.map(mesh => mesh.material);
  assert.equal(meshes.length, 4);
  for (let i = 0; i < 60; i++) fx.update(frame(i / 60));
  nozzles.forEach((nozzle, i) => assert.ok(nozzle.position.equals(outlets[i])));
  meshes.forEach((mesh, i) => {
    assert.strictEqual(mesh.geometry, geometry[i]);
    assert.strictEqual(mesh.material, materials[i]);
    assert.equal(mesh.material.depthWrite, false);
    assert.ok(mesh.material.opacity <= 1);
  });
  assert.equal(parent.children.length, 1);
  assert.equal(fx.group.getObjectsByProperty('isLight', true).length, 0);
});

test('inactive exhaust hides and visual animation does not consume gameplay RNG or move the kart', () => {
  const parent = new THREE.Group(); parent.position.set(12, 6, 7); parent.rotation.y = .7;
  const fx = createTurboExhaustVisual(THREE, parent);
  const position = parent.position.clone(), rotation = parent.rotation.clone(), original = Math.random;
  try {
    Math.random = () => { throw Error('Visual effect consumed gameplay randomness'); };
    fx.update(frame(.085)); assert.equal(fx.group.visible, true);
    fx.update({ ...frame(.2), active: false }); assert.equal(fx.group.visible, false);
  } finally { Math.random = original; }
  assert.ok(parent.position.equals(position)); assert.ok(parent.rotation.equals(rotation));
});

test('race wiring stamps visual ignition separately and leaves existing physical turbo calculation intact', async () => {
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /const turboExhaust = createTurboExhaustVisual\(THREE, playerVisualRoot\)/);
  assert.match(page, /driftTurboVisualStartedAt = now/);
  assert.match(page, /ignitionAge: \(now - driftTurboVisualStartedAt\) \* \.001/);
  assert.match(page, /playerState\.speed \+= \(9 \+ playerState\.driftBoost \* 3\.5\) \* dt/);
  assert.match(page, /driftVisualEffects\.burst\(playerVisualRoot, Math\.max\(0, playerState\.speed\)\)/);
  assert.ok(page.indexOf('driftVisualEffects.update(dt, skidSurfaceVisible)')
    < page.indexOf('driftVisualEffects.burst(playerVisualRoot'),
    'fresh energy starts at age zero, synchronized with exhaust ignition');
  assert.doesNotMatch(page, /playerState\.speed.*(?:compression|blast)/);
});
