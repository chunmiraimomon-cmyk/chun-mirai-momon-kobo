import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { freeDriveSpeedCap } from '../lib/race-rules.mjs';

const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
const ast = ts.createSourceFile('page.tsx', page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(['TUNING_CATEGORIES', 'MACHINE_PRESETS', 'normalizeMachineTuning', 'machineTuningPreset', 'machineTuningParameters', 'machineDriveAcceleration', 'machineHandlingScale', 'machineTuningStats']);
const definitions = ast.statements.filter(node => names.has(node.name?.text)
  || (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => names.has(d.name.getText(ast))))).map(node => node.getText(ast)).join('\n');
const context = vm.createContext({});
vm.runInContext(ts.transpileModule(definitions + '\nglobalThis.tuning = { TUNING_CATEGORIES, MACHINE_PRESETS, normalizeMachineTuning, machineTuningPreset, machineTuningParameters, machineDriveAcceleration, machineHandlingScale, machineTuningStats };', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
const t = context.tuning;
const parameters = preset => t.machineTuningParameters(typeof preset === 'string' ? t.MACHINE_PRESETS[preset] : preset);
const plain = value => JSON.parse(JSON.stringify(value));
const close = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
// Execute the actual player physics blocks, not a second tuning physics implementation.
function between(start, end) {
  const first = page.indexOf(start), last = page.indexOf(end, first);
  assert.ok(first >= 0 && last > first, `missing production block: ${start}`);
  return page.slice(first, last);
}
const driveCode = between('          let normalDriveTurboCorrection = 0;', '          if (!playerState.airborne && brake > 0)');
const motionCode = between('          const steerGrip = clamp(Math.abs(playerState.speed)', '          if (courseDefinition.id === "cloud" && cloudIceStrength > 0.01');
const turboCode = between('          if (driftDashing && !playerState.airborne) {', '          const steerGrip =');
const chargeCode = between('            const driftElapsed = Math.max(0, (now - playerState.driftStartedAt)', '          } else if (playerState.drifting)');
const runDrive = new Function('env', `with (env) { ${driveCode} env.normalDriveTurboCorrection = normalDriveTurboCorrection; }`);
const runMotion = new Function('env', `with (env) { ${motionCode} }`);
const runTurbo = new Function('env', `with (env) { ${turboCode} }`);
const runCharge = new Function('env', `with (env) { ${chargeCode} }`);
const currentCode = between('          if (riverDamFlowActive && activeDamFlow) {', '          const onRoad =');
const iceCode = between('          if (courseDefinition.id === "cloud" && cloudIceStrength > 0.01 && !playerState.airborne && onRoad)', '          if (courseDefinition.id === "cloud" && cloudWindStrength > 0.025)');
const runCurrent = new Function('env', `with (env) { ${currentCode} }`);
const runIce = new Function('env', `with (env) { ${iceCode} }`);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function fixture(preset, overrides = {}) {
  return {
    machine: parameters(preset), machineDriveAcceleration: t.machineDriveAcceleration,
    machineHandlingScale: t.machineHandlingScale, THREE, freeDriveSpeedCap, clamp,
    dt: 1 / 120, deltaMs: 1000 / 120, now: 0, gas: 1, steering: 0, normalDriveTurboCorrection: 0,
    drifting: false, driftDashing: false, onRoad: true, boosting: false,
    giantLowDashBoosting: false, auroraActive: false, playerSkillTurboMultiplier: 0,
    ITEM_TURBO_ACCELERATION: 39, ITEM_TURBO_SPEED_CAP: 49,
    cloudIceStrength: 0, cloudWindStrength: 0, riverFlowActive: false,
    riverSurgeStrength: 0, shieldSpeedCap: 0,
    courseDefinition: { id: 'city' }, nearestBefore: { u: 0, pose: { heading: 0, nx: 1, nz: 0 } },
    course: { pointAt: () => ({ heading: .06 }) },
    playerState: { speed: 0, x: 0, z: 0, heading: 0, airborne: false, driftSide: 1,
      driftStartedAt: 0, driftCharge: 0, driftLinkChain: 0, driftSlipVelocity: 0,
      driftBoost: 0, driftBoostUsesTuning: true, voltOverheatedUntil: -1 },
    ...overrides,
  };
}
function drive(preset, seconds = 12, overrides = {}) {
  const env = fixture(preset, overrides);
  for (let i = 0; i < seconds / env.dt; i++) {
    env.now = i * env.deltaMs;
    runDrive(env); runTurbo(env); runMotion(env);
  }
  return env.playerState;
}
function timeToCharge(preset, target = .5, speed = 30) {
  const env = fixture(preset);
  env.playerState.speed = speed;
  while (env.playerState.driftCharge < target && env.now < 20000) {
    runCharge(env); env.now += env.deltaMs;
  }
  return env.now / 1000;
}
function releaseTurbo(preset, charge = .6) {
  const env = fixture(preset);
  env.playerState = { ...env.playerState, ...drive(preset), driftBoost: charge };
  const baseline = env.playerState.speed;
  let peak = baseline, duration = 0;
  while (env.playerState.driftBoost > .001 && duration < 10) {
    env.driftDashing = true;
    runDrive(env); runTurbo(env); runMotion(env);
    peak = Math.max(peak, env.playerState.speed);
    duration += env.dt;
  }
  return { baseline, peak, gain: peak - baseline, duration };
}

function turningRadius(preset, speed, drifting = false) {
  const env = fixture(preset, {drifting, steering:1});
  const points = [];
  for (let i = 0; i < 120; i++) {
    // Equal, steady entry speed separates handling from the engine's speed advantage.
    env.playerState.speed = speed;
    runMotion(env);
    if (i >= 117) points.push({x:env.playerState.x,z:env.playerState.z});
  }
  const [a,b,c] = points;
  const distance = (p,q) => Math.hypot(p.x-q.x,p.z-q.z);
  const twiceArea = Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x));
  return distance(a,b)*distance(b,c)*distance(c,a)/(2*twiceArea);
}

function heldDriftChargeTime(preset, entrySpeed, linkChain = 0) {
  const env = fixture(preset, {drifting:true, steering:1});
  env.playerState.speed = entrySpeed;
  env.playerState.driftLinkChain = linkChain;
  while (env.playerState.driftCharge < .5 && env.now < 20000) {
    runDrive(env); runCharge(env); runMotion(env);
    env.now += env.deltaMs;
  }
  return env.now/1000;
}

test('six original part categories and five presets have complete, valid loadouts', () => {
  assert.equal(t.TUNING_CATEGORIES.length, 6);
  for (const [name, setup] of Object.entries(t.MACHINE_PRESETS)) {
    assert.deepEqual(plain(t.normalizeMachineTuning(setup)), plain(setup));
    assert.equal(t.machineTuningPreset(setup), name);
    assert.equal(t.machineTuningStats(setup).length, 6);
  }
  assert.match(page, /\["DEFAULT", "SPEED", "DRIFT", "STABLE", "CUSTOM"\]/);
});
test('DEFAULT leaves all existing physics factors exactly neutral', () => {
  for (const [key, value] of Object.entries(parameters('DEFAULT'))) assert.equal(value, key === 'wallGuide' ? 0 : 1, key);
  for (const speed of [-100, -8, 0, 10, 23, 34, 100]) {
    assert.equal(t.machineDriveAcceleration(speed, parameters('DEFAULT')), 23);
    assert.equal(t.machineHandlingScale(speed, parameters('DEFAULT')), 1);
  }
  const env = fixture('DEFAULT');
  env.playerState.speed = 30; runDrive(env); runMotion(env);
  close(env.playerState.speed, Math.min(34, (30 + 23 / 120) * Math.pow(.988, (1000 / 120) / 16.67)));
});
test('SPEED, DRIFT and STABLE produce different acceleration curves and actual trajectories', () => {
  const results = Object.fromEntries(['DEFAULT', 'SPEED', 'DRIFT', 'STABLE'].map(name => [name, drive(name)]));
  assert.ok(results.SPEED.speed > results.DEFAULT.speed * 1.2);
  assert.ok(results.SPEED.speed < results.DEFAULT.speed * 1.25);
  assert.ok(results.SPEED.z > results.DEFAULT.z * 1.1);
  assert.ok(results.SPEED.z < results.DEFAULT.z * 1.22);
  assert.ok(results.STABLE.speed < results.DEFAULT.speed - 4);
  assert.ok(results.SPEED.z > results.STABLE.z + 45);
  assert.ok(t.machineDriveAcceleration(0, parameters('SPEED')) < t.machineDriveAcceleration(0, parameters('DRIFT')));
  assert.ok(t.machineDriveAcceleration(34, parameters('SPEED')) > t.machineDriveAcceleration(34, parameters('DRIFT')));
  console.log('12s actual-physics fixture:', Object.fromEntries(Object.entries(results).map(([name, state]) => [name, { speed: +state.speed.toFixed(2), meters: +state.z.toFixed(2) }])));
});
test('DRIFT changes entry threshold, angle, outward slip and time to turbo charge', () => {
  assert.ok(11 * parameters('DRIFT').driftEntry < 11 * parameters('SPEED').driftEntry);
  const states = {};
  for (const name of ['DEFAULT', 'DRIFT', 'STABLE']) {
    const env = fixture(name, { drifting: true, steering: 1 });
    env.playerState.speed = 30;
    for (let i = 0; i < 48; i++) runMotion(env);
    states[name] = env.playerState;
  }
  assert.ok(states.DRIFT.heading > states.DEFAULT.heading * 1.4);
  assert.ok(Math.abs(states.DRIFT.driftSlipVelocity) > Math.abs(states.DEFAULT.driftSlipVelocity) * 1.05);
  assert.ok(Math.abs(states.DRIFT.driftSlipVelocity) < Math.abs(states.DEFAULT.driftSlipVelocity) * 1.18);
  assert.ok(Math.abs(states.STABLE.driftSlipVelocity) < Math.abs(states.DEFAULT.driftSlipVelocity) * .8);
  assert.ok(timeToCharge('DRIFT') < timeToCharge('DEFAULT') * .72);
  console.log('50% drift charge (seconds):', { DEFAULT: timeToCharge('DEFAULT'), DRIFT: timeToCharge('DRIFT'), STABLE: timeToCharge('STABLE') });
});
test('counter-steer still preserves the chosen drift side in every preset', () => {
  for (const name of Object.keys(t.MACHINE_PRESETS)) {
    const env = fixture(name, { drifting: true, steering: -1 });
    env.playerState.speed = 30; runMotion(env);
    assert.ok(env.playerState.heading > 0);
    assert.ok(env.playerState.driftSlipVelocity < 0);
  }
});
test('SPEED parts preserve straight-line speed but penalize both normal and drift cornering', () => {
  for (const drift of [false, true]) {
    const env = fixture('SPEED', { drifting: drift, steering: 1 });
    env.playerState.speed = 34;
    runMotion(env);
    const normal = fixture('DEFAULT', { drifting: drift, steering: 1 });
    normal.playerState.speed = 34;
    runMotion(normal);
    assert.ok(env.playerState.heading < normal.playerState.heading * (drift ? .6 : .8));
    // At cruise speed the wider turn requires earlier entry, even with GRIP tires.
    const scale = t.machineHandlingScale(drive('SPEED').speed, parameters('SPEED'), drift);
    assert.ok(drive('SPEED').speed / scale > drive('DEFAULT').speed * 1.4);
  }
  for (const part of [{drive:'velocity'}, {gear:'high'}]) {
    const p = t.machineTuningParameters({...t.MACHINE_PRESETS.DEFAULT, ...part});
    assert.ok(t.machineHandlingScale(34, p) < .9);
    assert.ok(t.machineHandlingScale(34, p, true) < .8);
    assert.ok(p.driftSlip > 1);
    assert.ok(t.machineHandlingScale(10, p) > t.machineHandlingScale(34, p));
  }
});
test('DEFAULT keeps better cruising and same-charge duration; DRIFT trades speed for sharper handling', () => {
  const driftCruise = drive('DRIFT').speed;
  close(driftCruise, 25.9252959105, .01); // Previous cruising speed is intentionally unchanged.
  const chargeTime = timeToCharge('DRIFT', .5, driftCruise);
  console.log('DRIFT 50% charge at its slower cruising speed:', chargeTime);
  assert.ok(chargeTime < timeToCharge('DEFAULT'));
  assert.ok(t.machineHandlingScale(30, parameters('DRIFT')) > t.machineHandlingScale(30, parameters('DEFAULT')) * 1.2);
  const normal = releaseTurbo('DEFAULT'), tuned = releaseTurbo('DRIFT');
  console.log('Actual release comparison (.6 charge):', {DEFAULT:normal,DRIFT:tuned,chargeTime});
  assert.ok(tuned.peak <= 39.25);
  assert.ok(normal.peak <= 39.25);
  close(tuned.duration/normal.duration, .9, .01);
  assert.ok(driftCruise < drive('DEFAULT').speed - 5);
  // Default retains the old reward, not a new buff.
  close(normal.peak, 39.25);
  close(normal.duration, 4 / 3, .01);
});
test('QUICK trades duration for charge speed; RESERVE and LONG trade charging for duration', () => {
  const states = {};
  for (const id of ['standard', 'power', 'long', 'quick']) {
    const env = fixture('DEFAULT', { driftDashing: true });
    env.machine = t.machineTuningParameters({ ...t.MACHINE_PRESETS.DEFAULT, boost: id });
    env.playerState.driftBoost = .8;
    runDrive(env);
    runTurbo(env);
    states[id] = { speed: env.playerState.speed, remaining: env.playerState.driftBoost,
      chargeTime: timeToCharge({...t.MACHINE_PRESETS.DEFAULT, boost:id}) };
  }
  for (const state of Object.values(states)) close(state.speed, states.standard.speed);
  assert.ok(states.long.remaining > states.standard.remaining);
  assert.ok(states.long.remaining > states.power.remaining);
  assert.ok(states.power.remaining > states.standard.remaining);
  assert.ok(states.quick.remaining < states.standard.remaining);
  assert.ok(states.quick.chargeTime < states.standard.chargeTime);
  assert.ok(states.power.chargeTime > states.standard.chargeTime);
  assert.ok(states.long.chargeTime > states.power.chargeTime);
  assert.equal(t.TUNING_CATEGORIES.find(c=>c.id==='boost').parts.find(p=>p.id==='power').name, 'RESERVE');
  assert.doesNotMatch(page, /boostPower|boostCeiling/);
});
test('DEFAULT has better launch and recovery than SPEED, while SPEED only gains on long straights', () => {
  assert.ok(drive('DEFAULT', .5).speed > drive('SPEED', .5).speed);
  assert.ok(drive('DEFAULT', 1).z > drive('SPEED', 1).z);
  assert.ok(t.machineDriveAcceleration(8, parameters('DEFAULT')) > t.machineDriveAcceleration(8, parameters('SPEED')) * 1.3);
  assert.ok(timeToCharge('DEFAULT') < timeToCharge('SPEED'));
  assert.ok(drive('SPEED').speed > drive('DEFAULT').speed);
});

test('actual x/z turn radius distinguishes SPEED, DEFAULT and DRIFT instead of comparing only profile bars', () => {
  const radii = Object.fromEntries(['SPEED','DEFAULT','DRIFT'].map(preset=>[preset, {
    normal:turningRadius(preset,30), drift:turningRadius(preset,30,true),
    cruise:turningRadius(preset,drive(preset).speed),
  }]));
  assert.ok(radii.SPEED.normal > radii.DEFAULT.normal * 1.25);
  assert.ok(radii.DRIFT.normal < radii.DEFAULT.normal * .85);
  assert.ok(radii.SPEED.drift > radii.DEFAULT.drift * 1.7);
  assert.ok(radii.DRIFT.drift < radii.DEFAULT.drift * .75);
  assert.ok(radii.SPEED.cruise > radii.DEFAULT.cruise * 1.8);
  assert.ok(radii.DRIFT.cruise < radii.DEFAULT.cruise * .7);
  console.log('Production x/z turning radius (meters):', radii);
});

test('DRIFT reaches the next turbo earlier both from cruise and from a linked turbo exit', () => {
  const stock = heldDriftChargeTime('DEFAULT',drive('DEFAULT').speed);
  const drift = heldDriftChargeTime('DRIFT',drive('DRIFT').speed);
  const stockLinked = heldDriftChargeTime('DEFAULT',32,1);
  const driftLinked = heldDriftChargeTime('DRIFT',32,1);
  assert.ok(drift < stock * .9);
  assert.ok(drift > stock * .7); // Quicker, not an instant/grossly multiplied reward.
  assert.ok(driftLinked < stockLinked * .9);
  console.log('50% charge in actual held drift (seconds):', {DEFAULT:stock,DRIFT:drift,DEFAULT_LINK:stockLinked,DRIFT_LINK:driftLinked});
});

test('every loadout shares actual turbo acceleration and ceiling, including the first release frame', () => {
  const stock = fixture('DEFAULT');
  stock.playerState.speed = 30;
  runDrive(stock);
  // The release happens AFTER the normal drive step in production.
  stock.driftDashing = true; stock.playerState.driftBoost = .6;
  runTurbo(stock); runMotion(stock);
  let count = 0;
  function enumerate(index, setup) {
    if (index === t.TUNING_CATEGORIES.length) {
      const env = fixture(setup);
      env.playerState.speed = 30; runDrive(env);
      env.driftDashing = true; env.playerState.driftBoost = .6;
      runTurbo(env); runMotion(env);
      close(env.playerState.speed, stock.playerState.speed);
      assert.ok(34 * env.machine.topSpeed < 39.25, 'ordinary top speed must not exceed the shared turbo cap');
      // The declared ordinary cap bounds every achievable cruise speed and is the
      // worst case for accidental turbo deceleration (without 1,728 long simulations).
      const cruising = 34 * env.machine.topSpeed;
      env.playerState.speed = cruising;
      runDrive(env); runTurbo(env); runMotion(env);
      assert.ok(env.playerState.speed >= cruising, 'starting turbo must not slow a fast ordinary loadout');
      env.playerState.speed = 100; runMotion(env); close(env.playerState.speed, 39.25);
      count++; return;
    }
    const category = t.TUNING_CATEGORIES[index];
    for (const part of category.parts) enumerate(index + 1, {...setup, [category.id]:part.id});
  }
  enumerate(0, {});
  assert.equal(count, 1728);
});

test('common drift drive correction respects partial/no throttle and frame duration', () => {
  for (const gas of [0, .25, 1]) for (const dt of [1/120, 1/60, 1/30]) {
    const results = Object.keys(t.MACHINE_PRESETS).map(preset=>{
      const env = fixture(preset, {gas, dt, deltaMs:dt*1000, driftDashing:true});
      env.playerState.speed = 30; env.playerState.driftBoost = .6;
      runDrive(env); runTurbo(env); runMotion(env);
      return env.playerState.speed;
    });
    for (const speed of results) close(speed, results[0]);
  }
});

test('item boost, strong skill boost and Volt fallback keep their original reward values', () => {
  for (const preset of Object.keys(t.MACHINE_PRESETS)) {
    const item = fixture(preset, { boosting: true }); runDrive(item);
    close(item.playerState.speed, 39 / 120);
    const skill = fixture(preset, { playerSkillTurboMultiplier: 3 }); runDrive(skill);
    close(skill.playerState.speed, 117 / 120);
    const volt = fixture(preset, { driftDashing: true });
    volt.playerState.driftBoost = .6; volt.playerState.driftBoostUsesTuning = false; runTurbo(volt);
    close(volt.playerState.speed, (9 + .6 * 3.5) / 120);
    close(volt.playerState.driftBoost, .6 - .45 / 120);
  }
  // Both ground and airborne-suspended normal releases must reclaim the reward origin.
  const assignments = [...page.matchAll(/playerState\.driftBoost = playerState\.driftCharge;\s*playerState\.driftBoostUsesTuning = true/g)];
  assert.equal(assignments.length, 2);
});
test('item and strong skill caps take precedence over the common drift cap; weak Volt stays unchanged', () => {
  for (const preset of Object.keys(t.MACHINE_PRESETS)) {
    const item = fixture(preset, {boosting:true});
    item.playerState.speed = 56; runMotion(item);
    close(item.playerState.speed, 49);
    const weakVolt = fixture(preset, {boosting:true,driftDashing:true});
    weakVolt.playerState.driftBoostUsesTuning = false;
    weakVolt.playerState.speed = 56; runMotion(weakVolt);
    close(weakVolt.playerState.speed, 49);
    const both = fixture(preset, {boosting:true,driftDashing:true});
    both.playerState.speed = 56; both.playerState.driftBoost = .8;
    runMotion(both); close(both.playerState.speed, 49);
    const skill = fixture(preset, {driftDashing:true,playerSkillTurboMultiplier:3});
    skill.playerState.speed = 200; skill.playerState.driftBoost = .8;
    runMotion(skill); close(skill.playerState.speed, 147);
    // No compensation may cancel any of these original acceleration rewards.
    for (const overrides of [{boosting:true}, {playerSkillTurboMultiplier:3}, {giantLowDashBoosting:true}]) {
      const alone = fixture(preset, overrides), turbo = fixture(preset, {...overrides, driftDashing:true});
      alone.playerState.speed = turbo.playerState.speed = 30;
      turbo.playerState.driftBoost = .6;
      runDrive(alone); runDrive(turbo);
      close(turbo.normalDriveTurboCorrection, 0);
      runTurbo(turbo);
      close(turbo.playerState.speed - alone.playerState.speed, (9+.6*3.5)/120);
    }
  }
  const stock = fixture('DEFAULT', {boosting:true,driftDashing:true});
  stock.playerState.speed = 56; runMotion(stock); close(stock.playerState.speed,49);
});
test('turbo tuning does not add airborne drive or consume the suspended turbo in the air', () => {
  for (const preset of Object.keys(t.MACHINE_PRESETS)) {
    const env = fixture(preset, {driftDashing:true});
    env.playerState.airborne = true; env.playerState.speed = 30; env.playerState.driftBoost = .6;
    runDrive(env); runTurbo(env);
    close(env.playerState.speed,30); close(env.playerState.driftBoost,.6);
    close(env.normalDriveTurboCorrection,0);
    runMotion(env); close(env.playerState.speed,30*Math.pow(.9992,env.deltaMs/16.67));
  }
});

test('STABLE reduces physical bump launch, landing rebound and wall reaction, with mass cost', () => {
  const stable = parameters('STABLE'), normal = parameters('DEFAULT');
  assert.ok(stable.bumpLaunch < normal.bumpLaunch);
  assert.ok(stable.landingBounce < normal.landingBounce * .5);
  assert.ok(stable.surfaceFollow > normal.surfaceFollow);
  assert.ok(stable.wallBounce < normal.wallBounce * .5);
  assert.ok(stable.mass > 1);
  assert.match(page, /getRoadSeparationProfile\([\s\S]*?tunedSurfaceLaunch,/);
  assert.match(page, /playerState\.verticalVelocity = tunedSurfaceLaunch/);
  assert.match(page, /measuredSurfaceVerticalSpeed \* machine\.landingBounce/);
  assert.match(page, /0\.11 \* machine\.wallBounce/);
  assert.match(page, /Math\.cos\(nearestAfter\.pose\.heading - playerState\.heading\) < 0 \? Math\.PI : 0/);
});
test('JUMP preserves uncapped air control; WET GRIP counters real water and ice, not inaccessible off-road', () => {
  const jump = t.machineTuningParameters({ ...t.MACHINE_PRESETS.DEFAULT, suspension: 'jump' });
  const terrain = t.machineTuningParameters({ ...t.MACHINE_PRESETS.DEFAULT, tire: 'terrain' });
  const air = fixture('DEFAULT', { steering: 1 });
  air.playerState.airborne = true; air.playerState.speed = 90; air.machine = jump;
  runDrive(air); runMotion(air); assert.ok(air.playerState.speed > 89);
  close(air.playerState.heading, 1.72 * .62 * jump.airControl / 120);
  const plainCurrent = fixture('DEFAULT', { riverDamFlowActive:true, activeDamFlow:{flowX:1,flowZ:.5}, riverSurgeStrength:1 });
  const wetCurrent = fixture('DEFAULT', { riverDamFlowActive:true, activeDamFlow:{flowX:1,flowZ:.5}, riverSurgeStrength:1 });
  wetCurrent.machine = terrain;
  runCurrent(plainCurrent); runCurrent(wetCurrent);
  close(wetCurrent.playerState.x, plainCurrent.playerState.x * .4);
  close(wetCurrent.playerState.z, plainCurrent.playerState.z * .4);
  for (const preset of Object.keys(t.MACHINE_PRESETS)) {
    const dry = fixture(preset, {riverDamFlowActive:false,activeDamFlow:{flowX:1,flowZ:.5},riverSurgeStrength:1});
    runCurrent(dry); close(dry.playerState.x, 0); close(dry.playerState.z, 0);
  }
  const ordinaryIce = fixture('DEFAULT', {steering:1, courseDefinition:{id:'cloud'}, cloudIceStrength:1});
  const wetIce = fixture('DEFAULT', {steering:1, courseDefinition:{id:'cloud'}, cloudIceStrength:1});
  ordinaryIce.playerState.speed = wetIce.playerState.speed = 30; wetIce.machine = terrain;
  runIce(ordinaryIce); runIce(wetIce);
  close(wetIce.playerState.x, ordinaryIce.playerState.x * .25);
  runMotion(ordinaryIce); runMotion(wetIce);
  assert.ok(wetIce.playerState.heading > ordinaryIce.playerState.heading);
  assert.equal(t.normalizeMachineTuning({tire:'terrain'}).tire, 'terrain');
  assert.equal(t.TUNING_CATEGORIES.find(c=>c.id==='tire').parts.find(p=>p.id==='terrain').name, 'WET GRIP');
  assert.doesNotMatch(page, /machine\.offRoad(?:Drag|Speed)/);
  assert.doesNotMatch(page, /コース外の悪路減速/);
  assert.match(page, /playerState\.speed \+= \(3\.4 \+ riverSurgeStrength \* 4\.6\) \* dt/);
});
test('save normalization tolerates old, malformed and unknown values without losing valid selections', () => {
  for (const value of [null, undefined, [], 'SPEED', 123]) assert.deepEqual(plain(t.normalizeMachineTuning(value)), plain(t.MACHINE_PRESETS.DEFAULT));
  const saved = t.normalizeMachineTuning(JSON.parse(JSON.stringify({ ...t.MACHINE_PRESETS.DRIFT, gear: 'invalid', extra: 1 })));
  assert.equal(saved.gear, 'mid'); assert.equal(saved.tire, 'drift'); assert.equal(saved.extra, undefined);
  assert.match(page, /setMachineTuning\(normalizeMachineTuning\(parsed\.machineTuning\)\)/);
  assert.match(page, /setActiveMachineTuning\(normalizeMachineTuning\(machineTuning\)\)/);
  assert.match(page, /machineTuning=\{activeMachineTuning\}/);
  assert.match(page, /machineTuningCustom: tuningCustomMode/);
});
test('garage supports keyboard, gamepad, touch, inline BACK and responsive scrolling', () => {
  assert.match(page, /target\?\.closest\("\.tuning-open-button"\)/);
  assert.equal(page.match(/else if \(phase === "tuning"\)/g).length, 2);
  assert.match(page, /current\.up && !previous\.up\) openMachineTuning\(\)/);
  assert.match(page, /BACK · SETUP READY/);
  assert.match(page, /data-tuning-control aria-pressed/);
  assert.match(css, /machine-tuning-overlay[^}]*overflow-y:auto/);
  assert.match(css, /machine-tuning-overlay button:focus/);
  assert.match(css, /game-stage:has\(\.machine-tuning-overlay\) \{ overflow:clip/);
  assert.match(page, /closest\?\.focus\(\{ preventScroll: true \}\)/);
});
test('all 1,728 freely selectable combinations produce finite, bounded parameters and profile scores', () => {
  let count = 0;
  function enumerate(index, setup) {
    if (index === t.TUNING_CATEGORIES.length) {
      count++;
      const p = t.machineTuningParameters(setup);
      for (const [key, value] of Object.entries(p)) assert.ok(Number.isFinite(value) && value >= 0, key);
      for (const speed of [0, 34, 90]) assert.ok(t.machineDriveAcceleration(speed, p) > 0);
      for (const stat of t.machineTuningStats(setup)) assert.ok(stat.value >= 0 && stat.value <= 100);
      return;
    }
    const category = t.TUNING_CATEGORIES[index];
    for (const part of category.parts) enumerate(index + 1, {...setup, [category.id]:part.id});
  }
  enumerate(0, {});
  assert.equal(count, 1728);
});
