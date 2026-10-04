import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';

const energySource = await readFile(new URL('../app/turbo-energy-burst.ts', import.meta.url), 'utf8');
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const energyModule = 'data:text/javascript;base64,' + Buffer.from(compile(energySource)).toString('base64');
const { createTurboEnergyBurst, TURBO_ENERGY_VARIANTS } = await import(energyModule);
const source = (await readFile(new URL('../app/drift-visual-effects.ts', import.meta.url), 'utf8')).replace('"./turbo-energy-burst"', JSON.stringify(energyModule));
const compiled = compile(source);
const { createDriftVisualEffects } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const contact = (x, z, extra = {}) => ({ x, y: .018, z, nx: 0, ny: 1, nz: 0, visible: true, surfaceKey: '', ...extra });
const setup = (mobile = false) => {
  const scene = new THREE.Scene();
  const fx = createDriftVisualEffects(THREE, scene, mobile);
  return { scene, fx, root: new THREE.Group(), marks: scene.getObjectByName('temporary-tire-skid-marks'), sparks: scene.getObjectByName('anime-drift-and-turbo-shards'), energy: scene.getObjectByName('kart-turbo-energy-burst') };
};

test('turbo release has six polygon wave families and small spark accents in one pooled draw', () => {
  const { scene, fx, root, energy } = setup();
  assert.equal(scene.children.length, 3);
  assert.ok(scene.children.every(child => child.isMesh));
  assert.equal(energy.geometry.index.count, 512 * 6);
  assert.equal(energy.material.depthWrite, false);
  assert.equal(energy.material.blending, THREE.NormalBlending);
  fx.burst(root, 32);
  assert.equal(fx.stats().shards, 0);
  assert.equal(energy.geometry.attributes.energyAlpha.array.filter(x => x > .99).length, 48);
  assert.match(energy.material.fragmentShader, /vec2 q\[10\]/);
  assert.doesNotMatch(energy.material.fragmentShader, /atan\(|segmentDistance|ring|rays=/);
  const lengths = [], widths = [], positions = energy.geometry.attributes.position.array;
  for (let i = 0; i < 10; i++) {
    lengths.push(energy.geometry.attributes.energySize.array[i * 8]);
    widths.push(energy.geometry.attributes.energySize.array[i * 8 + 1]);
    assert.ok(positions[i * 12 + 2] < -1.7);
    if (i < 4) assert.ok(positions[i * 12] < -1);
    else if (i < 6) assert.ok(Math.abs(positions[i * 12]) < .2);
    else assert.ok(positions[i * 12] > 1);
  }
  assert.ok(new Set(lengths).size === 10 && new Set(widths).size === 10);
  assert.ok(Math.max(...widths) / Math.min(...widths) > 2.5);
  assert.ok(Math.max(...lengths) / Math.min(...lengths) > 2);
  const kinds = energy.geometry.attributes.energyKind.array;
  assert.deepEqual([...new Set(Array.from({length:10}, (_,i) => kinds[i*4]))].sort(), [0,1,2,3,4,5]);
  assert.deepEqual([kinds[40], kinds[44]], [6,7]);
  for (const i of [10,11]) {
    assert.ok(energy.geometry.attributes.energySize.array[i*8] < .34);
    assert.ok(energy.geometry.attributes.energySize.array[i*8+1] < .19);
  }
  assert.match(energy.material.fragmentShader, /if\(vKind>5\.5\)/); // Warm accent, not another blue wave.
});

test('wave speed remains twice v142 and maximum outward reach remains half', () => {
  const newScene = new THREE.Scene(), newFx = createTurboEnergyBurst(THREE, newScene);
  const root = new THREE.Group(); newFx.burst(root, 0);
  const newMesh = newScene.getObjectByName('kart-turbo-energy-burst');
  const initial = newMesh.geometry.attributes.position.array.slice();
  // Reproduce the visual RNG draws for the original release's 12..20m/s speeds.
  // This fixture is self-contained: tests do not require an old Git checkout.
  let rng = 0x482fa3;
  const random = () => { rng = (Math.imul(rng,1664525)+1013904223) >>> 0; return rng/4294967296; };
  const oldSpeeds = [];
  for (const side of [-1,0,1]) for (let i = 0; i < (side === 0 ? 2 : 4); i++) {
    random(); if (side === 0) {random();random();} random();oldSpeeds.push(12+random()*8);
    random();random();if(side !== 0)random();random();random();random();
  }
  newFx.update(.015);
  const distance = piece => {
    const p = piece * 12, values = newMesh.geometry.attributes.position.array;
    return Math.hypot(values[p]-initial[p],values[p+1]-initial[p+1],values[p+2]-initial[p+2]);
  };
  for (let piece = 0; piece < 10; piece++) assert.ok(Math.abs(distance(piece)/.015-oldSpeeds[piece]*2) < .0001);
  newFx.update(.285);
  for (let piece = 0; piece < 10; piece++) {
    assert.ok(Math.abs(distance(piece)-oldSpeeds[piece]*.30*.5) < .000003);
  }
  assert.ok(newMesh.geometry.attributes.energyAlpha.array.slice(0, 40).every(x => x < .000001));
});

test('outward reach cap is frame-rate independent and afterimage fades without further radial travel', () => {
  const scenes = [new THREE.Scene(), new THREE.Scene()];
  const effects = scenes.map(scene => createTurboEnergyBurst(THREE, scene));
  const root = new THREE.Group(); effects.forEach(fx => fx.burst(root, 0));
  for (let i = 0; i < 15; i++) effects[0].update(.01);
  effects[1].update(.15);
  const meshes = scenes.map(scene => scene.getObjectByName('kart-turbo-energy-burst'));
  for (let p = 0; p < 120; p++) assert.ok(Math.abs(meshes[0].geometry.attributes.position.array[p] - meshes[1].geometry.attributes.position.array[p]) < 3e-6);
  const before = meshes[1].geometry.attributes.position.array.slice(0, 120);
  const alpha = meshes[1].geometry.attributes.energyAlpha.array[0];
  effects[1].update(.05);
  assert.deepEqual(meshes[1].geometry.attributes.position.array.slice(0, 120), before);
  assert.ok(meshes[1].geometry.attributes.energyAlpha.array[0] < alpha);
  assert.ok(alpha < .15);
});

test('emitted energy moves outward independently of kart motion while new waves follow the source', () => {
  const { fx, root, energy } = setup();
  fx.burst(root, 32);
  const initialX = energy.geometry.attributes.position.array[0];
  const initialSize = energy.geometry.attributes.energySize.array[0];
  root.position.z += 32 * .075; fx.update(.075);
  assert.ok(energy.geometry.attributes.energySize.array[0] > initialSize);
  assert.ok(energy.geometry.attributes.position.array[0] < initialX);
  assert.ok(energy.geometry.attributes.energyState.array[2] > 0);
  const before = energy.geometry.attributes.position.array.slice(0, 3);
  root.position.set(100, 12, 55); fx.update(0);
  const after = energy.geometry.attributes.position.array;
  assert.deepEqual(after.slice(0, 3), before); // Never reattach a flying fragment.
  fx.update(.07);
  assert.ok(energy.geometry.attributes.position.array[24 * 12] > 95); // Next 30ms wave uses the moved source.
  assert.ok(energy.geometry.attributes.energyAlpha.array[0] < 1);
  fx.update(.2);
  assert.equal(energy.geometry.attributes.energyAlpha.array[0], 0); // Original wave expires at 300ms.
  assert.ok(energy.geometry.attributes.energyAlpha.array.some(x => x > 0));
});

test('30ms emission preserves 300ms wave life and all waves/sparks disappear within 500ms', () => {
  const scene = new THREE.Scene(), root = new THREE.Group();
  const energyFx = createTurboEnergyBurst(THREE, scene);
  energyFx.burst(root, 32);
  assert.equal(energyFx.stats().emitted, 12);
  energyFx.update(.029); assert.equal(energyFx.stats().emitted, 12);
  root.position.z = 32 * .031; energyFx.update(.002);
  assert.equal(energyFx.stats().emitted, 18);
  const alpha = scene.getObjectByName('kart-turbo-energy-burst').geometry.attributes.energyAlpha.array;
  energyFx.update(.268); assert.ok(alpha[0] > 0);
  energyFx.update(.002); assert.equal(alpha[0], 0); // Initial wave expires at .300s.
  assert.equal(energyFx.stats().emitted, 48); // Initial release + six waves, last at 180ms.
  assert.ok(energyFx.stats().fragments > 0);
  const endedCount = energyFx.stats().emitted;
  energyFx.update(.178); // At 479ms the final 180ms wave has not yet expired.
  assert.ok(energyFx.stats().fragments > 0);
  energyFx.update(.021); // Exactly 500ms from activation: no tails can remain.
  assert.equal(energyFx.stats().emitted, endedCount);
  assert.equal(energyFx.activeCount(), 0);
  assert.equal(energyFx.stats().fragments, 0);
  assert.ok(scene.getObjectByName('kart-turbo-energy-burst').geometry.attributes.energyAlpha.array.every(x => x === 0));
  energyFx.burst(root, 32); energyFx.update(10); // Slow/background frame must not emit a late clump.
  assert.equal(energyFx.stats().fragments, 0);
});

test('the 500ms limit applies on mobile, slow frames and independently retriggered bursts', () => {
  for (const mobile of [false,true]) for (const frames of [[.5],[.11,.19,.2],Array(50).fill(.01)]) {
    const scene=new THREE.Scene(),root=new THREE.Group(),fx=createTurboEnergyBurst(THREE,scene,mobile);
    fx.burst(root,32);
    for (const dt of frames) fx.update(dt);
    assert.equal(fx.stats().fragments,0);
    assert.ok(scene.getObjectByName('kart-turbo-energy-burst').geometry.attributes.energyAlpha.array.every(x=>x===0));
    const emitted=fx.stats().emitted;fx.update(.5);assert.equal(fx.stats().emitted,emitted);
  }
  const scene=new THREE.Scene(),root=new THREE.Group(),fx=createTurboEnergyBurst(THREE,scene);
  fx.burst(root,32);fx.update(.4);fx.burst(root,32);fx.update(.2);
  assert.ok(fx.stats().fragments>0); // New activation gets its own 500ms window.
  fx.update(.3);assert.equal(fx.stats().fragments,0);assert.equal(fx.activeCount(),0);
});

test('all six outlines are distinct, simple polygons with materially different aspect ratios', () => {
  assert.equal(TURBO_ENERGY_VARIANTS.length, 6);
  const inside = (outline,x,y) => {
    let hit = false;
    for (let i=0,j=outline.length-1;i<outline.length;j=i++) {
      const a=outline[i],b=outline[j];
      if ((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) hit=!hit;
    }
    return hit;
  };
  const masks = TURBO_ENERGY_VARIANTS.map(({outline,scale}) => {
    assert.ok(outline.length >= 4 && outline.length <= 10);
    assert.ok(outline.every(p=>p.every(v=>Number.isFinite(v)&&Math.abs(v)<=.5)));
    const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    for(let i=0;i<outline.length;i++)for(let j=i+2;j<outline.length;j++) {
      if(i===0&&j===outline.length-1)continue;
      const a=outline[i],b=outline[(i+1)%outline.length],c=outline[j],d=outline[(j+1)%outline.length];
      assert.ok(!(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0), 'Outline must not self-intersect');
    }
    assert.ok(scale[0]>0&&scale[1]>0);
    return Array.from({length:1600},(_,i)=>inside(outline,(i%40+.5)/40-.5,(Math.floor(i/40)+.5)/40-.5));
  });
  for(let a=0;a<masks.length;a++)for(let b=a+1;b<masks.length;b++) {
    const intersection=masks[a].filter((v,i)=>v&&masks[b][i]).length;
    const union=masks[a].filter((v,i)=>v||masks[b][i]).length;
    assert.ok(intersection/union<.85, 'Families must differ in outline, not just size or seed');
  }
  assert.equal(new Set(TURBO_ENERGY_VARIANTS.map(v=>v.scale.join(':'))).size,6);
});

test('mobile also guarantees all six sizes/shapes and sparse, short-lived sparks', () => {
  for (const mobile of [false,true]) {
    const scene=new THREE.Scene(),root=new THREE.Group(),fx=createTurboEnergyBurst(THREE,scene,mobile);
    const geometry=scene.getObjectByName('kart-turbo-energy-burst').geometry;
    fx.burst(root,0);
    const waveCount=mobile?7:10,sparkCount=mobile?1:2;
    const initialKinds=Array.from({length:waveCount},(_,i)=>geometry.attributes.energyKind.array[i*4]);
    assert.deepEqual([...new Set(initialKinds)].sort(),[0,1,2,3,4,5]);
    assert.equal(fx.stats().emitted,waveCount+sparkCount);
    assert.ok(sparkCount/waveCount<=.2);
    const lengths=Array.from({length:waveCount},(_,i)=>geometry.attributes.energySize.array[i*8]);
    assert.ok(Math.max(...lengths)/Math.min(...lengths)>2);
    fx.update(.181);
    for(let i=waveCount;i<waveCount+sparkCount;i++)assert.equal(geometry.attributes.energyAlpha.array[i*4],0);
    assert.ok(geometry.attributes.energyAlpha.array[0]>0); // Main wave still lasts 300ms.
    const emitted=fx.stats().emitted;
    assert.ok(emitted <= (mobile?32:48)); // Accents cannot overwhelm the main waves.
    assert.equal(scene.children.length,1);
  }
});

test('energy retrigger uses one emitter, keeps old fragments independent and retains bounded pools', () => {
  const scene = new THREE.Scene(), root = new THREE.Group();
  const energyFx = createTurboEnergyBurst(THREE, scene, true);
  const mesh = scene.getObjectByName('kart-turbo-energy-burst');
  const positions = mesh.geometry.attributes.position.array;
  energyFx.burst(root, 32); energyFx.update(.09); energyFx.burst(root, 60);
  assert.equal(energyFx.activeCount(), 1);
  assert.ok(energyFx.stats().fragments > 7); // Old wave was not reset.
  for (let step = 0; step < 200; step++) {
    root.position.z += 32 * .03; energyFx.burst(root, 32); energyFx.update(.03);
  }
  assert.strictEqual(mesh.geometry.attributes.position.array, positions);
  assert.equal(scene.children.length, 1);
  assert.equal(energyFx.stats().capacity, 320);
  assert.ok(energyFx.stats().fragments <= 320);
});

test('continuous energy waves remain independent of tire-contact spark pool recycling', () => {
  const { fx, root, energy } = setup();
  fx.burst(root, 32);
  const positions = energy.geometry.attributes.position.array;
  for (let step = 0; step < 10; step++) {
    for (let actor = 0; actor < 4; actor++) fx.drift(actor, [contact(-1.3, step), contact(1.3, step)], 0, 32, true, .05);
    fx.update(.03);
  }
  assert.strictEqual(energy.geometry.attributes.position.array, positions);
  assert.ok(energy.geometry.attributes.energyAlpha.array.some(x => x > 0));
});

test('yellow drift uses contact flashes, branched ribbons and chipped embers without turbo crescents', () => {
  const { fx, sparks } = setup();
  fx.drift(0, [contact(-1.3, 0), contact(1.3, 0)], 0, 32, true, .05);
  fx.drift(0, [contact(-1.3, 1), contact(1.3, 1)], 0, 32, true, .05);
  fx.update(.016);
  const styles = new Set();
  for (let i = 0; i < fx.stats().shards; i++) styles.add(sparks.geometry.attributes.shardStyle.array[i * 18]);
  assert.deepEqual([...styles].sort(), [0, 1, 2, 4]);
  assert.ok(sparks.geometry.attributes.shardColor.array[0] > .9);
  assert.ok(sparks.geometry.attributes.shardColor.array[2] < .1);
});

test('both rear contacts produce two dark tread strips, fading to zero within 3 seconds', () => {
  const { fx, marks } = setup();
  fx.drift(0, [contact(-1.3, 0), contact(1.3, 0)], 0, 32, true, .05);
  fx.drift(0, [contact(-1.3, 1), contact(1.3, 1)], 0, 32, true, .05);
  fx.update(.05);
  assert.equal(fx.stats().marks, 2);
  const initial = marks.geometry.attributes.markAlpha.array[0];
  fx.update(1);
  assert.ok(marks.geometry.attributes.markAlpha.array[0] < initial);
  fx.update(2.1);
  assert.equal(fx.stats().marks, 0);
  assert.ok(marks.geometry.attributes.markAlpha.array.every(value => value === 0));
});

test('inactive drift, low speed, wet/absent contacts create no sparks or marks', () => {
  for (const [active, speed, visible] of [[false, 32, true], [true, 2, true], [true, 32, false]]) {
    const { fx } = setup();
    for (let z = 0; z < 5; z++) fx.drift(0, [contact(-1.3, z, { visible }), contact(1.3, z, { visible })], 0, speed, active, .05);
    assert.deepEqual(fx.stats(), { shards: 0, marks: 0 });
  }
});

test('landing after an inactive interval or teleport does not draw a connecting skid line', () => {
  const { fx } = setup();
  fx.drift(0, [contact(-1.3, 0), contact(1.3, 0)], 0, 20, true, .05);
  fx.drift(0, [], 0, 20, false, .05);
  fx.drift(0, [contact(-1.3, 2), contact(1.3, 2)], 0, 20, true, .05);
  assert.equal(fx.stats().marks, 0);
  fx.drift(0, [contact(-1.3, 20), contact(1.3, 20)], 0, 20, true, .05);
  assert.equal(fx.stats().marks, 0);
});

test('segmented road boundaries break continuity and disappearing road clears existing skids', () => {
  const { fx } = setup();
  const pair = (z, key) => [-1.3, 1.3].map(x => contact(x, z, { surfaceKey: key }));
  fx.drift(0, pair(0, 'cloud:1:-1'), 0, 20, true, .05);
  fx.drift(0, pair(1, 'cloud:1:-1'), 0, 20, true, .05);
  assert.equal(fx.stats().marks, 2);
  fx.drift(0, pair(2, 'cloud:2:-1'), 0, 20, true, .05);
  assert.equal(fx.stats().marks, 2);
  fx.update(.05, key => key !== 'cloud:1:-1');
  assert.equal(fx.stats().marks, 0);
});

test('tread ends follow the supplied sloping surface plane', () => {
  const { fx, marks } = setup();
  const pair = z => [-1.3, 1.3].map(x => contact(x, z, { y: z * .2 + .018, ny: 1 / Math.hypot(1, .2), nz: -.2 / Math.hypot(1, .2) }));
  fx.drift(0, pair(0), 0, 20, true, .05);
  fx.drift(0, pair(1), 0, 20, true, .05);
  const positions = marks.geometry.attributes.position.array;
  for (let v = 0; v < 8; v++) assert.ok(Math.abs(positions[v * 3 + 1] - positions[v * 3 + 2] * .2 - .018) < 1e-6);
});

test('mobile pools stay fixed in size under sustained CPU/player drift and repeated bursts', () => {
  const { fx, root, scene, marks, sparks } = setup(true);
  for (let step = 0; step < 200; step++) {
    for (let actor = 0; actor < 4; actor++) fx.drift(actor, [contact(-1.3, step), contact(1.3, step)], 0, 32, true, .05);
    fx.burst(root, 32); fx.update(.05);
  }
  assert.equal(scene.children.length, 3);
  assert.equal(marks.geometry.attributes.position.count, 512 * 4);
  assert.equal(sparks.geometry.attributes.position.count, 320 * 6);
  assert.ok(fx.stats().marks <= 512 && fx.stats().shards <= 320);
});

test('effect emission does not consume gameplay random numbers or mutate the kart transform', () => {
  const { fx, root } = setup();
  root.position.set(4, 2, 6); root.rotation.set(.1, .5, .08);
  const position = root.position.clone(), rotation = root.rotation.clone(), original = Math.random;
  try {
    Math.random = () => { throw Error('Gameplay RNG consumed'); };
    fx.burst(root, 32);
    fx.drift(0, [contact(-1.3, 0), contact(1.3, 0)], 0, 32, true, .05); fx.update(.05);
  } finally { Math.random = original; }
  assert.ok(root.position.equals(position)); assert.ok(root.rotation.equals(rotation));
});
