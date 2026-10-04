import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';

const source = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = ast.statements.filter(n => ['monkeyTrapPose', 'makeTrapMonkeyVisual'].includes(n.name?.text)).map(n => n.getText(ast)).join('\n');
let trapDefinition;
function findTrap(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'makeTrapMesh') trapDefinition = node.initializer.getText(ast);
  ts.forEachChild(node, findTrap);
}
findTrap(ast);
const context = vm.createContext({ THREE, TAU: Math.PI * 2, clamp: (v, a, b) => Math.max(a, Math.min(b, v)), markGeneratedSurface: m => m,
  trapBaseMaterial: new THREE.MeshStandardMaterial(), trapWarningMaterial: new THREE.MeshStandardMaterial(), spikeMaterial: new THREE.MeshStandardMaterial() });
vm.runInContext(ts.transpileModule(functions + '\nglobalThis.pose = monkeyTrapPose; globalThis.make = makeTrapMonkeyVisual; globalThis.trap = ' + trapDefinition, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
const rig = () => context.make(THREE, context.trap);
const placement = (x = 0, y = 0, z = 1.4) => ({ x, y, z });
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const world = o => o.getWorldPosition(new THREE.Vector3());

test('articulated spine and limbs, five two-joint digits per extremity and eight tail joints', () => {
  const r = rig();
  assert.equal(r.thorax.parent.parent, r.pelvis);
  assert.equal(r.root.getObjectByName('monkey-head').parent.name, 'monkey-neck');
  assert.equal(r.root.getObjectByName('monkey-tail-7').parent.name, 'monkey-tail-6');
  for (const limb of [...r.arms, ...r.legs]) {
    assert.equal(limb.elbow.parent, limb.upper); assert.equal(limb.lower.parent, limb.elbow);
    assert.equal(limb.end.parent, limb.lower); assert.equal(limb.palm.parent, limb.end);
    assert.equal(limb.fingers.length, 5);
    for (const finger of limb.fingers) assert.equal(finger.tip.parent, finger.base);
  }
});

test('fixed bone lengths and connected finite joints through walking, turns, carrying and placing', () => {
  const r = rig();
  for (let i = 0; i < 600; i++) {
    const now = i * 10;
    r.root.position.set(Math.sin(i * .003) * 2, .03, -i * .014);
    r.update(now, now < 3000 ? 3000 : 12000, now < 3000 ? 0 : 3000, placement(r.root.position.x, 0, r.root.position.z + 1.4));
    r.root.updateMatrixWorld(true);
    for (const limb of [...r.arms, ...r.legs]) {
      close(world(limb.base).distanceTo(world(limb.elbow)), limb.upperLength);
      close(world(limb.elbow).distanceTo(world(limb.end)), limb.lowerLength);
      assert.ok(world(limb.end).distanceTo(limb.target.clone().applyMatrix4(r.root.matrixWorld)) < 1e-6);
      assert.ok(limb.end.matrixWorld.elements.every(Number.isFinite));
    }
  }
});

test('stance feet stay planted while the body travels, always at least one hindfoot grounded', () => {
  const r = rig(); const anchors = new Map(); let observations = 0;
  for (let i = 0; i < 400; i++) {
    r.root.position.set(0, .03, -i * .007);
    r.update(i * 5, 30000, 0, placement(0, 0, r.root.position.z + 1.4));
    r.root.updateMatrixWorld(true);
    assert.ok(r.legs.some(limb => limb.contact));
    for (const limb of r.legs) {
      const point = world(limb.end), previous = anchors.get(limb);
      if (limb.contact && previous?.contact && previous.cycle === limb.cycle) {
        assert.ok(point.distanceTo(previous.point) < 1e-6, `sliding foot: ${point.distanceTo(previous.point)}`); observations++;
      }
      if (limb.contact) close(point.y, .14);
      anchors.set(limb, { point, contact: limb.contact, cycle: limb.cycle });
    }
  }
  assert.ok(observations > 400);
});

test('cute empty hands swing; carrying hands never double as ground supports', () => {
  const r = rig(); let minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < 350; i++) {
    const now = 2000 + i * 5;
    r.root.position.z = -i * .005;
    r.update(now, 12000, 1000, placement(0, 0, r.root.position.z + 1.4));
    assert.equal(r.carriedTrap.visible, false);
    assert.ok(r.arms.every(limb => !limb.contact));
    minZ = Math.min(minZ, r.arms[0].target.z);
    maxZ = Math.max(maxZ, r.arms[0].target.z);
  }
  assert.ok(maxZ - minZ > .45);
  r.update(11800, 12000, 1000, placement(0, 0, r.root.position.z + 1.4));
  assert.equal(r.carriedTrap.visible, true); assert.ok(r.arms.every(limb => !limb.contact));
});

test('idle clock does not bounce or advance steps', () => {
  const r = rig(); r.update(0, 30000, 0, placement()); r.root.updateMatrixWorld(true);
  const feet = r.legs.map(limb => world(limb.end));
  for (let i = 0; i < 40; i++) r.update(i * 20, 30000, 0, placement());
  r.root.updateMatrixWorld(true);
  r.legs.forEach((limb, i) => assert.ok(world(limb.end).distanceTo(feet[i]) < 1e-6));
  close(r.pelvis.position.y, 0.97);
});

test('original cute head/body proportions and colours are retained, with rounded paws', () => {
  const r = rig();
  const head = r.root.getObjectByName('monkey-cranium'), body = r.root.getObjectByName('monkey-body');
  close(head.scale.x, .62); close(body.scale.x, .72 * .88); close(body.scale.y, .72 * 1.18);
  assert.equal(head.material.color.getHex(), 0x81502f);
  assert.equal(r.root.getObjectByName('monkey-muzzle').material.color.getHex(), 0xe4b477);
  assert.equal(r.root.getObjectByName('monkey-face-mask'), undefined);
  for (const limb of [...r.arms, ...r.legs]) assert.ok(limb.palm.children.some(o => o.isMesh && o.geometry.type === 'SphereGeometry'));
});

test('carrying transitions do not reseed planted feet or snap hands to the rim', () => {
  const r = rig(); r.root.scale.setScalar(1.12);
  let next = 3000, last = 0, stored = null, previous = null;
  for (let now = 0; now < 15000; now += 10) {
    const z = -now / 1000 * 3.4; r.root.position.set(0, .03, z);
    if (now >= next) { last = now; stored = placement(0, 0, z + 1.4); next += 9000; }
    r.update(now, next, last, last > 0 && now - last < 850 ? stored : placement(0, 0, z + 1.4));
    r.root.updateMatrixWorld(true);
    const feet = r.legs.map(limb => ({ point: world(limb.end), contact: limb.contact, cycle: limb.cycle }));
    const hands = r.arms.map(limb => world(limb.end));
    if (previous) {
      feet.forEach((foot, i) => { if (foot.contact && previous.feet[i].contact && foot.cycle === previous.feet[i].cycle) {
        assert.ok(foot.point.distanceTo(previous.feet[i].point) < 1e-6, `foot slipped at ${now}`);
      }});
      hands.forEach((hand, i) => assert.ok(hand.distanceTo(previous.hands[i]) < .25, `hand snapped at ${now}`));
    }
    previous = { feet, hands };
  }
});

test('hands grasp the rim; full-size prop reaches spawn position and releases without duplication', () => {
  const r = rig(); r.root.scale.setScalar(1.12); r.root.position.set(12, 7.03, 9);
  const target = placement(12, 7, 10.4);
  r.update(1000 - .0001, 1000, 0, target); r.root.updateMatrixWorld(true);
  assert.ok(world(r.carriedTrap).distanceTo(new THREE.Vector3(target.x, target.y + .03, target.z)) < 1e-6);
  close(r.carriedTrap.getWorldScale(new THREE.Vector3()).x, 1);
  for (const arm of r.arms) {
    const grip = new THREE.Vector3(arm.side * .87, .16, 0).applyMatrix4(r.carriedTrap.matrixWorld);
    assert.ok(world(arm.end).distanceTo(grip) < .02, `grip gap ${world(arm.end).distanceTo(grip)}`);
    assert.ok(arm.fingers.some(f => Math.abs(f.tip.rotation.x) > .8));
  }
  r.update(1000, 9000, 1000, target); assert.equal(r.carriedTrap.visible, false);
  close(context.pose(1000, 9000, 1000).reach, 1);
  r.update(2000, 9000, 1000, target); assert.equal(r.carriedTrap.visible, false);
});

test('custom parent transforms preserve hazard root and world-space placement', () => {
  const parent = new THREE.Group(), r = rig(); parent.add(r.root); parent.position.set(30, 5, 40);
  r.update(1000 - .0001, 1000, 0, placement(30, 5, 40)); parent.updateMatrixWorld(true);
  assert.ok(parent.position.equals(new THREE.Vector3(30, 5, 40)));
  assert.ok(r.root.position.equals(new THREE.Vector3()));
  assert.ok(world(r.carriedTrap).distanceTo(new THREE.Vector3(30, 5.03, 40)) < 1e-6);
});

test('updates reuse geometry/materials and consume no gameplay randomness', () => {
  const r = rig(), geometries = new Set(), materials = new Set();
  r.root.traverse(o => { if (o.isMesh) { geometries.add(o.geometry); materials.add(o.material); } });
  const random = Math.random;
  try {
    Math.random = () => { throw new Error('Visual animation must not change gameplay randomness'); };
    for (let i = 0; i < 1000; i++) { r.root.position.z -= .02; r.update(i * 8, 12000, 0, placement()); }
  } finally { Math.random = random; }
  r.root.traverse(o => { if (o.isMesh) { assert.ok(geometries.has(o.geometry)); assert.ok(materials.has(o.material)); } });
});

test('jungle/custom share rig; spawn timing, position and contact checks unchanged', () => {
  assert.ok(source.indexOf('const makeTrapMesh =') < source.indexOf('const monkeys: MonkeyState[]'));
  assert.match(source, /monkey\.progress = wrap01\(monkey\.progress \+ monkey\.direction \* roamSpeed \* dt\)/);
  assert.match(source, /createTrapAt\(-1, monkey\.progress - monkey\.direction \* 1\.4 \/ course\.length, monkey\.lane, now\)/);
  assert.match(source, /monkey\.nextTrapAt = now \+ 7200 \+ Math\.random\(\) \* 4200/);
  assert.match(source, /createTrapAt\(-1, monkeyProgress, monkeyLane, now\)/);
  assert.match(source, /state\.nextAt = now \+ config\.interval \* 1000/);
  assert.match(source, /monkeyPose\.y \+ 1\.05 - \(pose\.y \+ 0\.8\)/);
  assert.match(source, /Math\.abs\(pose\.y - actor\.y\) < 2\.8/);
  assert.equal((source.match(/makeTrapMonkeyVisual\(THREE, makeTrapMesh\)/g) || []).length, 2);
  assert.doesNotMatch(functions, /createTrapAt|attackActor|Math\.random|traps\.push/);
});
