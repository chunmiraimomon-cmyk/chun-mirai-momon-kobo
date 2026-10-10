import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';

const visualSource = readFileSync(new URL('../app/pirate-breach-visual.ts', import.meta.url), 'utf8');
const isolatedMath = Object.create(Math);
isolatedMath.random = () => { throw new Error('Breach presentation must not consume gameplay randomness'); };
const functions = {};
vm.runInNewContext(ts.transpileModule(visualSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { exports: functions, Math: isolatedMath });
const { getPirateBreachPose, createPirateBreachVisual,
  PIRATE_BREACH_TRIGGER_PROGRESS, PIRATE_BREACH_SETTLED_MS } = functions;
const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const horizonSource = readFileSync(new URL('../app/pirate-horizon.ts', import.meta.url), 'utf8');
const horizonAst = ts.createSourceFile('pirate-horizon.ts', horizonSource, ts.ScriptTarget.Latest, true);
const peekDeclaration = horizonAst.statements.find(node => ts.isFunctionDeclaration(node)
  && node.name?.text === 'pirateOctopusPeekY');
assert.ok(peekDeclaration, 'The second-lap crown pose has an isolated presentation helper');
const peekFunctions = {};
vm.runInNewContext(ts.transpileModule(peekDeclaration.getText(horizonAst), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { exports: peekFunctions, Math: isolatedMath });
const { pirateOctopusPeekY } = peekFunctions;

function sourceBetween(start, end) {
  const first = page.indexOf(start), last = page.indexOf(end, first);
  assert.ok(first >= 0 && last > first, `Both source guards exist: ${start} / ${end}`);
  return page.slice(first, last);
}
const normalizedHash = text => createHash('sha256').update(text.replace(/\s+/g, ' ').trim()).digest('hex');
function meshesIn(group) {
  const result = [];
  group.traverse(object => { if (object.isMesh) result.push(object); });
  return result;
}
function snapshot(group) {
  return meshesIn(group).map(mesh => ({
    name: mesh.name, visible: mesh.visible, opacity: mesh.material.opacity,
    instances: Array.from(mesh.instanceMatrix.array),
    positions: Array.from(mesh.geometry.attributes.position.array),
  }));
}
function fixture(three = THREE) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x8e613a, roughness: .92 });
  const fx = createPirateBreachVisual(three, wood);
  return { fx, wood, debris: fx.group.getObjectByName('pirate-breach-flying-wood'),
    rim: fx.group.getObjectByName('pirate-breach-jagged-rim') };
}

test('second-lap crown clears the gunwale while eyes stay below it and arms are hidden', () => {
  assert.match(page, /new THREE\.SphereGeometry\(10\.1, 28, 20\)/);
  assert.match(page, /octopusBody\.scale\.set\(1\.05, 1\.25, 0\.96\)/);
  assert.match(page, /octopusBody\.position\.y = 9\.2/);
  const headTop = 9.2 + 10.1 * 1.25;
  const eyeTop = 11.55 + .92;
  for (const coverHeight of [-.52, 0, 15.65]) for (let time = 0; time <= 30_000; time += 100) {
    const rootY = pirateOctopusPeekY(coverHeight, time);
    const cap = rootY + headTop - coverHeight;
    assert.ok(cap >= 2.069 && cap <= 2.631, 'Only 2–3m of the existing head clears its cover-height margin');
    assert.ok(rootY + eyeTop < coverHeight, 'Existing eyes stay below the covering scenery');
  }
  assert.match(page, /if \(foreshadowArms\) foreshadowArms\.visible = pirateLapIndex === 0/);
  assert.match(page, /pirateOctopus\.position\.y = pirateLapIndex === 1\s*\? pirateOctopusPeekY\(15\.65, now\)/);
  assert.match(page, /72 - 16 \* clamp\(\(approach - 0\.5\) \* 2, 0, 1\)/);
  assert.match(page, /pirateOctopus\.position\.z = [^;]+ \+ \(pirateLapIndex === 1 \? 40 : 0\)/);
});

test('third-lap breach rises for 500 ms and settles exactly at 800 ms', () => {
  assert.equal(PIRATE_BREACH_SETTLED_MS, 800);
  for (const age of [-500, -1]) {
    assert.equal(getPirateBreachPose(age).revealed, false);
    assert.equal(getPirateBreachPose(age).riseOffset, -34);
  }
  assert.equal(getPirateBreachPose(0).riseOffset, -34);
  assert.equal(getPirateBreachPose(0).revealed, true);
  let previous = -34;
  for (let age = 0; age <= 500; age += 10) {
    const pose = getPirateBreachPose(age);
    assert.ok(pose.riseOffset >= previous && pose.riseOffset <= 1.01);
    assert.equal(pose.revealed, true);
    assert.ok(Number.isFinite(pose.debrisAgeMs));
    previous = pose.riseOffset;
  }
  assert.equal(getPirateBreachPose(500).riseOffset, 1, 'The rise reaches its overshoot at 0.5 seconds');
  previous = 1;
  for (let age = 500; age <= 800; age += 10) {
    const offset = getPirateBreachPose(age).riseOffset;
    assert.ok(offset >= 0 && offset <= previous, 'The body settles without a second rise');
    previous = offset;
  }
  assert.ok(getPirateBreachPose(799).riseOffset > 0);
  for (const age of [800, 1000, 2000, 60_000]) {
    assert.equal(getPirateBreachPose(age).riseOffset, 0);
    assert.equal(getPirateBreachPose(age).revealed, true);
  }
  assert.equal(getPirateBreachPose(PIRATE_BREACH_SETTLED_MS + 520 + 330 * .9).riseOffset, 0,
    'Body has settled before the original attack sequence can reach its contact window');
});

test('deterministic chunky wood burst uses at most four draws and no gameplay random stream', () => {
  const first = fixture(), second = fixture();
  assert.ok(first.debris?.isInstancedMesh);
  assert.ok(first.rim?.isInstancedMesh);
  assert.ok(first.debris.count >= 16 && first.debris.count <= 96);
  const meshes = meshesIn(first.fx.group);
  const drawCalls = meshes.reduce((sum, mesh) => sum + (Array.isArray(mesh.material)
    ? Math.max(1, mesh.geometry.groups.length) : 1), 0);
  assert.ok(drawCalls <= 4);
  first.fx.group.traverse(object => assert.ok(!object.isLight));
  for (const mesh of meshes) {
    assert.ok(Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite));
    mesh.geometry.computeBoundingBox();
    const size = mesh.geometry.boundingBox.getSize(new THREE.Vector3());
    assert.ok(size.x > 0 && size.y > 0 && size.z > 0, 'Splinters are volumetric wood, not flat particles');
  }
  for (const age of [-1, 0, 100, 300, 800, 1700, 2100, 30_000]) {
    first.fx.update(age);
    second.fx.update(age);
    assert.deepEqual(snapshot(first.fx.group), snapshot(second.fx.group));
    assert.ok(meshes.every(mesh => Array.from(mesh.instanceMatrix.array).every(Number.isFinite)));
  }
  assert.doesNotMatch(visualSource, /Math\.random|attackActor|actorProgress|actorLane|playerState|setTimeout|setInterval/);
});

test('wood particles expire around two seconds while the broken rim remains', () => {
  const { fx, debris, rim, wood } = fixture();
  fx.update(-1);
  assert.equal(fx.group.visible, false);
  fx.update(0);
  assert.equal(debris.visible, false);
  fx.update(300);
  assert.equal(fx.group.visible, true);
  assert.equal(debris.visible, true);
  assert.equal(rim.visible, true);
  const firstFlight = Array.from(debris.instanceMatrix.array);
  const staticRim = Array.from(rim.instanceMatrix.array);
  fx.update(600);
  assert.notDeepEqual(Array.from(debris.instanceMatrix.array), firstFlight);
  fx.update(2100);
  assert.equal(debris.visible, false);
  assert.equal(rim.visible, true);
  fx.update(30_000);
  assert.equal(debris.visible, false);
  assert.equal(rim.visible, true);
  assert.deepEqual(Array.from(rim.instanceMatrix.array), staticRim);
  assert.equal(wood.opacity, 1, 'Particle fading cannot fade shared ship wood');
  fx.update(-1);
  assert.equal(fx.group.visible, false, 'Reset can hide the whole presentation');
});

test('animation reuses all preallocated mesh resources and does not move its scene anchor', () => {
  let allocations = 0;
  const guardedThree = Object.fromEntries(Object.entries(THREE).map(([name, value]) => [name,
    typeof value === 'function' && /^[A-Z]/.test(name) ? new Proxy(value, {
      construct(target, args) { allocations++; return Reflect.construct(target, args); },
    }) : value,
  ]));
  const { fx } = fixture(guardedThree);
  const meshes = meshesIn(fx.group);
  const resources = meshes.map(mesh => ({ mesh, geometry: mesh.geometry, material: mesh.material,
    positions: mesh.geometry.attributes.position.array, matrix: mesh.instanceMatrix.array }));
  const initialAllocations = allocations;
  fx.group.position.set(20, 7, -11);
  fx.group.rotation.y = .65;
  for (let age = -1; age < 4000; age += 16) fx.update(age);
  assert.equal(allocations, initialAllocations, 'No THREE constructors run during frame updates');
  assert.deepEqual(fx.group.position.toArray(), [20, 7, -11]);
  assert.equal(fx.group.rotation.y, .65);
  assert.deepEqual(meshesIn(fx.group), meshes);
  resources.forEach(({ mesh, geometry, material, positions, matrix }) => {
    assert.equal(mesh.geometry, geometry);
    assert.equal(mesh.material, material);
    assert.equal(mesh.geometry.attributes.position.array, positions);
    assert.equal(mesh.instanceMatrix.array, matrix);
  });
});

test('breach clock starts once when the third-lap player reaches the exit, never for a CPU', () => {
  assert.match(page, /let pirateBreachStartedAt = -1/);
  assert.ok(PIRATE_BREACH_TRIGGER_PROGRESS > .5 && PIRATE_BREACH_TRIGGER_PROGRESS < .9,
    'The visually checked exit precedes the octopus encounter');
  const trigger = sourceBetween('if (octopusActive && pirateBreachStartedAt < 0', 'const breachAge =');
  const exit = PIRATE_BREACH_TRIGGER_PROGRESS;
  for (const [active, progress, attackStartedAt, expected] of [
    [false, exit, 0, -1], [false, exit + .02, 500, -1],
    [true, exit - .0001, 0, -1], [true, exit - .0001, 500, -1],
    [true, .1, 500, -1], [true, exit + .00001, 0, 1000],
    [true, exit + .04, 0, 1000], [true, .98, 500, 1000],
  ]) {
    const context = { octopusActive: active, now: 1000, PIRATE_BREACH_TRIGGER_PROGRESS,
      wrap01: value => ((value % 1) + 1) % 1,
      playerState: Object.freeze({ progress: (active ? 2 : 1) + progress }),
      pirateBreachStartedAt: -1, pirateTentacles: Object.freeze([Object.freeze({ attackStartedAt })]) };
    vm.runInNewContext(trigger, context);
    assert.equal(context.pirateBreachStartedAt, expected, `active=${active}, progress=${progress}, attack=${attackStartedAt}`);
    assert.equal(context.pirateTentacles[0].attackStartedAt, attackStartedAt);
    if (expected >= 0) {
      context.now = 5000;
      vm.runInNewContext(trigger, context);
      assert.equal(context.pirateBreachStartedAt, expected, 'Later frames and attacks cannot restart the entrance');
    }
  }
  assert.doesNotMatch(trigger, /pirateTentacles|actorProgress|attackStartedAt/,
    'A CPU cannot start the entrance off camera');
  assert.match(page, /const breachAge = octopusActive && pirateBreachStartedAt >= 0 \? now - pirateBreachStartedAt : -1/);
  assert.match(page, /pirateBreachVisual\?\.update\(breachAge\)/);
  assert.match(page, /tentacle\.group\.visible = octopusActive;\s+if \(!octopusActive\) return/);
  for (const child of ['segments', 'suckers', 'tip']) {
    assert.ok(page.includes(`tentacle.${child}.visible = breachPose.revealed;`), 'Only render children are hidden');
  }
});

function attackFixture(actorProgresses = [.88, .2]) {
  const deterministicMath = Object.create(Math);
  deterministicMath.random = () => .25;
  return {
    octopusActive: true, breachAge: -1, PIRATE_BREACH_SETTLED_MS, now: 10_000,
    pirateTentacles: [{ progress: .9, attackStartedAt: 0, cooldownUntil: 0,
      targetSide: 1, lane: 5, hitLane: 5 }],
    actorCount: actorProgresses.length, actorProgress: id => actorProgresses[id],
    course: { length: 1000 }, Math: deterministicMath,
    wrap01: value => ((value % 1) + 1) % 1,
    progressDelta: (next, previous) => ((next - previous + 1.5) % 1) - .5,
    clamp: (value, low, high) => Math.max(low, Math.min(high, value)),
  };
}
function attackFrame(context, breachAge) {
  context.breachAge = breachAge;
  context.now = 10_000 + Math.max(0, breachAge);
  const source = sourceBetween('const octopusAttacksEnabled =', 'const primaryTentacle = pirateTentacles[0];');
  const code = ts.transpileModule(`(function () { ${source}\nreturn tentacleMotion; })()`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return vm.runInNewContext(code, context).get(context.pirateTentacles[0]);
}

test('attacks are suppressed through 799 ms and become available at 800 ms for player or CPU', () => {
  for (const actors of [[.88, .2], [.2, .88]]) {
    const state = attackFixture(actors), tentacle = state.pirateTentacles[0];
    for (const age of [-1, 0, 499, 500, 799]) {
      const motion = attackFrame(state, age);
      assert.equal(tentacle.attackStartedAt, 0, `No attack during the appearance at ${age} ms`);
      assert.equal(motion.slam, 0);
      assert.equal(motion.anticipation, 0);
    }
    const { fx, debris } = fixture();
    fx.update(800);
    assert.equal(debris.visible, true, 'Wood is still in flight when attacks are enabled');
    const motion = attackFrame(state, 800);
    assert.equal(tentacle.attackStartedAt, 10_800, 'An approaching player or CPU starts the original windup at 800 ms');
    assert.equal(motion.slam, 0, 'Readiness does not skip the attack windup or hit instantly');
  }
  const earlierLap = attackFixture();
  earlierLap.octopusActive = false;
  assert.equal(attackFrame(earlierLap, 2000).slam, 0);
  assert.equal(earlierLap.pirateTentacles[0].attackStartedAt, 0);
});

test('enabled attacks still wait for an actor in range and respect the original cooldown', () => {
  for (const actors of [[.86, .2], [.906, .2], [.2, .3]]) {
    const state = attackFixture(actors);
    attackFrame(state, 800);
    assert.equal(state.pirateTentacles[0].attackStartedAt, 0, 'No attack without an actor in the original -3..38m window');
  }
  const state = attackFixture(), tentacle = state.pirateTentacles[0];
  tentacle.cooldownUntil = 11_800;
  attackFrame(state, 800);
  assert.equal(tentacle.attackStartedAt, 0);
  attackFrame(state, 1799);
  assert.equal(tentacle.attackStartedAt, 0);
  attackFrame(state, 1800);
  assert.equal(tentacle.attackStartedAt, 11_800, 'The visual gate does not erase a later gameplay cooldown');
});

test('after readiness, anticipation, slam, recovery and cooldown use the original attack clock', () => {
  const state = attackFixture(), tentacle = state.pirateTentacles[0];
  attackFrame(state, 800);
  assert.equal(attackFrame(state, 1060).anticipation, 1);
  assert.equal(attackFrame(state, 1320).slam, 0);
  assert.ok(Math.abs(attackFrame(state, 1485).slam - .5) < 1e-12);
  assert.equal(attackFrame(state, 1650).slam, 1);
  assert.equal(attackFrame(state, 2300).slam, 1);
  assert.equal(attackFrame(state, 2650).slam, .5);
  assert.equal(attackFrame(state, 3000).slam, 0);
  assert.equal(tentacle.attackStartedAt, 0);
  assert.equal(tentacle.cooldownUntil, 13_000 + 1200 + .25 * 750);
});

test('after the new readiness gate, exact original attack sequencing, collision and CPU avoidance are retained', () => {
  // The entrance gate intentionally delays readiness. Once enabled, this
  // snapshot preserves every statement of the original attack sequence.
  assert.equal(normalizedHash(sourceBetween('if (!tentacle.attackStartedAt && now >= tentacle.cooldownUntil)',
    'const primaryTentacle = pirateTentacles[0];')),
  'b89947224a25237afbfa6cf60fe80e9a3082c2cc72a86cdafd031a5cb2a6f992');
  assert.equal(normalizedHash(sourceBetween('if (slamAmount < 0.9) return;',
    '          if (courseDefinition.id === "custom" && customHazardStates.length)')),
  '770a5221ff7e3aef6caa82376205a5a9403019ef14b8aaa0995088632cb44a6d');
  assert.equal(normalizedHash(sourceBetween('        pirateTentacles.forEach((tentacle) => {',
    '        shootingStars.forEach((star) => {')),
  '38f448862db1a9ce61141b81a914637986ef61b94a6544cfc5245d18abd37c89');
  assert.match(page, /\{ progress: 0\.9, lane: 5\.0, hitLane: 5\.0, phase: 0\.35, width: 8\.8 \}/);
  assert.match(page, /hitHalfWidth: width \* 0\.5/);
  assert.match(page, /const reach = bodyAnticipation \* 0\.72 \+ bodySlamEase \* 2\.2/);
  assert.match(page, /tentacle\.curve\.v2\.set\(pose\.x, pose\.y \+ 7\.2 \+ \(1 - easedSlam\) \* 8\.2, pose\.z\)/);
  assert.match(page, /tentacle\.curve\.v3\.set\(pose\.x, pose\.y \+ 1\.05 \+ \(1 - easedSlam\) \* 16\.0, pose\.z\)/);
  assert.match(page, /tentacle\.tip\.position\.copy\(tentacle\.curve\.v3\)/);
  assert.match(page, /tentacle\.tip\.scale\.set\(tentacle\.hitHalfWidth, 1\.25 \+ \(1 - easedSlam\) \* 0\.2, 3\.45\)/);
});

test('whole arm rises as scenery while its local collision coordinates stay untouched', () => {
  assert.match(page, /tentacle\.group\.position\.y = breachPose\.riseOffset/);
  assert.match(page, /const bodyY = \(pirateOctopus\?\.position\.y \?\? \(pirateOctopus\?\.userData\.baseY as number\)\) - breachPose\.riseOffset/);
  assert.match(page, /Math\.abs\(actor\.y - tentacle\.tip\.position\.y\) < 2\.8/);
  for (let age = 0; age <= 1000; age += 10) {
    const offset = getPirateBreachPose(age).riseOffset;
    const originalBodyY = 14.3, originalTipY = 18.1;
    const visibleBodyY = originalBodyY + offset;
    const localBaseY = visibleBodyY - offset + 6.5;
    assert.ok(Math.abs(localBaseY + offset - (visibleBodyY + 6.5)) < 1e-8,
      'World-space arm base stays attached to the rising body');
    assert.equal(originalTipY, 18.1, 'The visual group translation cannot change local hit coordinates');
    if (age >= PIRATE_BREACH_SETTLED_MS) assert.equal(originalTipY + offset, originalTipY);
  }
});

test('wood instances are warmed behind the existing loading overlay without starting the encounter', () => {
  const warmup = sourceBetween('if (pirateWarmupProgress !== undefined)', 'if (postFinishTourActive');
  assert.match(warmup, /pirateBreachVisual\?\.update\(300\);\s+presentation\.render/);
  assert.match(warmup, /presentation\.render[^\n]+\n\s+courseRenderWarmupIndex \+= 1;\s+pirateBreachVisual\?\.update\(-1\)/);
  assert.doesNotMatch(warmup, /pirateBreachStartedAt\s*=|attackStartedAt\s*=|attackActor\(/);
});
