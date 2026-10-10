import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';

const energySource = await readFile(new URL('../app/turbo-energy-burst.ts', import.meta.url), 'utf8');
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const energyModule = 'data:text/javascript;base64,' + Buffer.from(compile(energySource)).toString('base64');
const { createTurboEnergyBurst, TURBO_ENERGY_VARIANTS, TURBO_RELEASE_DELAY_SECONDS, getTurboIgnitionEnvelope } = await import(energyModule);
const source = (await readFile(new URL('../app/drift-visual-effects.ts', import.meta.url), 'utf8')).replace('"./turbo-energy-burst"', JSON.stringify(energyModule));
const compiled = compile(source);
const { createDriftVisualEffects } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const contact = (x, z, extra = {}) => ({ x, y: .018, z, nx: 0, ny: 1, nz: 0, visible: true, surfaceKey: '', ...extra });
const setup = (mobile = false) => {
  const scene = new THREE.Scene();
  const fx = createDriftVisualEffects(THREE, scene, mobile);
  return { scene, fx, root: new THREE.Group(), marks: scene.getObjectByName('temporary-tire-skid-marks'), sparks: scene.getObjectByName('anime-drift-and-turbo-shards'), energy: scene.getObjectByName('kart-turbo-energy-burst') };
};

test('ignition envelope synchronizes compression and release without extending the half-second effect', () => {
  assert.equal(TURBO_RELEASE_DELAY_SECONDS, .055);
  for (const elapsed of [-1, .5, 1, NaN, Infinity]) assert.deepEqual(getTurboIgnitionEnvelope(elapsed), {compression:0,blast:0});
  assert.deepEqual(getTurboIgnitionEnvelope(0), {compression:0,blast:0});
  assert.ok(getTurboIgnitionEnvelope(.0275).compression > .99);
  assert.equal(getTurboIgnitionEnvelope(.054).blast, 0);
  assert.equal(getTurboIgnitionEnvelope(.055).compression, 0);
  assert.equal(getTurboIgnitionEnvelope(.055).blast, 1);
  assert.ok(getTurboIgnitionEnvelope(.11).blast > .8);
  assert.ok(getTurboIgnitionEnvelope(.2).blast < .4);
  assert.equal(getTurboIgnitionEnvelope(.3).blast, 0);
});

test('turbo release has six thick polygon families, brush tails and sparse warm accents in one pooled draw', () => {
  const { scene, fx, root, energy } = setup();
  assert.equal(scene.children.length, 3);
  assert.ok(scene.children.every(child => child.isMesh));
  assert.equal(energy.geometry.index.count, 512 * 6);
  assert.equal(energy.material.depthWrite, false);
  assert.equal(energy.material.blending, THREE.NormalBlending);
  fx.burst(root, 32);
  fx.update(.055);
  assert.equal(fx.stats().shards, 0);
  assert.equal(energy.geometry.attributes.energyAlpha.array.filter(x => x > .99).length, 48);
  assert.match(energy.material.fragmentShader, /vec2 q\[10\]/);
  assert.doesNotMatch(energy.material.fragmentShader, /atan\(|segmentDistance|ring|rays=/);
  const lengths = [], widths = [], positions = energy.geometry.attributes.position.array;
  const start = 5; // The completed charge precedes the main release in the pool.
  for (let i = 0; i < 10; i++) {
    const index = i + start;
    lengths.push(energy.geometry.attributes.energySize.array[index * 8]);
    widths.push(energy.geometry.attributes.energySize.array[index * 8 + 1]);
    assert.ok(positions[index * 12 + 2] < -1.7);
    if (i < 4) assert.ok(positions[index * 12] < -1);
    else if (i < 6) assert.ok(Math.abs(positions[index * 12]) < .2);
    else assert.ok(positions[index * 12] > 1);
  }
  assert.ok(new Set(lengths).size === 10 && new Set(widths).size === 10);
  assert.ok(Math.max(...widths) / Math.min(...widths) > 2.5);
  assert.ok(Math.max(...lengths) / Math.min(...lengths) > 2);
  const kinds = energy.geometry.attributes.energyKind.array;
  assert.deepEqual([...new Set(Array.from({length:10}, (_,i) => kinds[(i+start)*4]))].sort(), [0,1,2,3,4,5]);
  assert.deepEqual([kinds[60], kinds[64]], [6,7]);
  for (const i of [15,16]) {
    assert.ok(energy.geometry.attributes.energySize.array[i*8] < .42);
    assert.ok(energy.geometry.attributes.energySize.array[i*8+1] < .23);
  }
  assert.match(energy.material.fragmentShader, /if\(vKind>5\.5\)/); // Warm accent, not another blue wave.
  assert.match(energy.material.fragmentShader, /tailProgress/);
  assert.ok(energy.geometry.attributes.energyTrail.array.slice(start*4,(start+10)*4).every(value=>value>0));
});

test('release follows a visible inward compression and throws chips rapidly across a short distance', () => {
  const newScene = new THREE.Scene(), newFx = createTurboEnergyBurst(THREE,newScene),root = new THREE.Group();
  newFx.burst(root,0);
  const newMesh=newScene.getObjectByName('kart-turbo-energy-burst'),attrs=newMesh.geometry.attributes;
  assert.equal(newFx.stats().emitted,5);
  assert.ok(attrs.energyAlpha.array.every(x=>x===0));
  const chargeX=attrs.position.array[0],chargeSize=attrs.energySize.array[0];
  newFx.update(.0275);
  assert.ok(attrs.energyAlpha.array[0]>.99);
  assert.ok(attrs.position.array[0]>chargeX); // Left-side chip moves inward.
  assert.ok(attrs.energySize.array[0]<chargeSize);
  newFx.update(.0275);
  assert.equal(newFx.stats().emitted,17);
  assert.equal(attrs.energyAlpha.array[0],0);
  const initial=attrs.position.array.slice();
  newFx.update(.015);
  const distance = piece => {
    const p = piece * 12, values = newMesh.geometry.attributes.position.array;
    return Math.hypot(values[p]-initial[p],values[p+1]-initial[p+1],values[p+2]-initial[p+2]);
  };
  for (let piece = 5; piece < 15; piece++) assert.ok(distance(piece)/.015>=23.99 && distance(piece)/.015<=36.01);
  newFx.update(.06);
  for (let piece = 5; piece < 15; piece++) {
    assert.ok(distance(piece)>=1.79 && distance(piece)<=2.71);
  }
  const settled=attrs.position.array.slice(5*12,15*12);
  newFx.update(.075);
  assert.ok(attrs.position.array.slice(5*12,15*12).every((value,index)=>Math.abs(value-settled[index])<1e-6));
});

test('outward reach cap is frame-rate independent and afterimage fades without further radial travel', () => {
  const scenes = [new THREE.Scene(), new THREE.Scene()];
  const effects = scenes.map(scene => createTurboEnergyBurst(THREE, scene));
  const root = new THREE.Group(); effects.forEach(fx => fx.burst(root, 0));
  for (let i = 0; i < 15; i++) effects[0].update(.01);
  effects[1].update(.15);
  const meshes = scenes.map(scene => scene.getObjectByName('kart-turbo-energy-burst'));
  for (let p = 60; p < 180; p++) assert.ok(Math.abs(meshes[0].geometry.attributes.position.array[p] - meshes[1].geometry.attributes.position.array[p]) < 3e-6);
  const before = meshes[1].geometry.attributes.position.array.slice(60, 180);
  const alpha = meshes[1].geometry.attributes.energyAlpha.array[20];
  effects[1].update(.05);
  assert.deepEqual(meshes[1].geometry.attributes.position.array.slice(60, 180), before);
  assert.ok(meshes[1].geometry.attributes.energyAlpha.array[20] < alpha);
  assert.ok(alpha > .3 && alpha < .7);
});

test('emitted energy moves outward independently of kart motion while new waves follow the source', () => {
  const { fx, root, energy } = setup();
  fx.burst(root, 32);
  fx.update(.055);
  const initialX = energy.geometry.attributes.position.array[60];
  const initialSize = energy.geometry.attributes.energySize.array[40];
  root.position.z += 32 * .075; fx.update(.075);
  assert.ok(energy.geometry.attributes.energySize.array[40] > initialSize);
  assert.ok(energy.geometry.attributes.position.array[60] < initialX);
  assert.ok(energy.geometry.attributes.energyState.array[62] > 0);
  const before = energy.geometry.attributes.position.array.slice(60, 63);
  root.position.set(100, 12, 55); fx.update(0);
  const after = energy.geometry.attributes.position.array;
  assert.deepEqual(after.slice(60, 63), before); // Never reattach a flying fragment.
  fx.update(.07);
  assert.ok(energy.geometry.attributes.position.array[29 * 12] > 95); // Next 30ms wave uses the moved source.
  assert.ok(energy.geometry.attributes.energyAlpha.array[20] < 1);
  fx.update(.2);
  assert.equal(energy.geometry.attributes.energyAlpha.array[20], 0); // Original wave expires 300ms after release.
  assert.ok(energy.geometry.attributes.energyAlpha.array.some(x => x > 0));
});

test('a stronger leading release is followed every 30ms by smaller waves, ending within 500ms', () => {
  const scene = new THREE.Scene(), root = new THREE.Group();
  const energyFx = createTurboEnergyBurst(THREE, scene);
  energyFx.burst(root, 32);
  assert.equal(energyFx.stats().emitted, 5);
  energyFx.update(.054); assert.equal(energyFx.stats().emitted, 5);
  energyFx.update(.001); assert.equal(energyFx.stats().emitted, 17);
  const sizes=scene.getObjectByName('kart-turbo-energy-burst').geometry.attributes.energySize.array;
  const firstMean=Array.from({length:10},(_,i)=>sizes[(i+5)*8]).reduce((a,b)=>a+b)/10;
  energyFx.update(.029); assert.equal(energyFx.stats().emitted,17);
  energyFx.update(.001); assert.equal(energyFx.stats().emitted,23);
  const nextMean=Array.from({length:5},(_,i)=>sizes[(i+17)*8]).reduce((a,b)=>a+b)/5;
  assert.ok(firstMean>nextMean*2.2);
  const alpha = scene.getObjectByName('kart-turbo-energy-burst').geometry.attributes.energyAlpha.array;
  energyFx.update(.269); assert.ok(alpha[20] > 0);
  energyFx.update(.002); assert.equal(alpha[20], 0); // Initial wave expires at .355s.
  assert.equal(energyFx.stats().emitted, 53); // Charge, main release and six waves, last at 235ms.
  assert.ok(energyFx.stats().fragments > 0);
  const endedCount = energyFx.stats().emitted;
  energyFx.update(.123); // At 479ms the final wave has not yet expired.
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
    fx.update(.055);
    const chargeCount=mobile?3:5,waveCount=mobile?7:10,sparkCount=mobile?1:2;
    const initialKinds=Array.from({length:waveCount},(_,i)=>geometry.attributes.energyKind.array[(i+chargeCount)*4]);
    assert.deepEqual([...new Set(initialKinds)].sort(),[0,1,2,3,4,5]);
    assert.equal(fx.stats().emitted,chargeCount+waveCount+sparkCount);
    assert.ok(sparkCount/waveCount<=.2);
    const lengths=Array.from({length:waveCount},(_,i)=>geometry.attributes.energySize.array[(i+chargeCount)*8]);
    assert.ok(Math.max(...lengths)/Math.min(...lengths)>2);
    fx.update(.181);
    for(let i=chargeCount+waveCount;i<chargeCount+waveCount+sparkCount;i++)assert.equal(geometry.attributes.energyAlpha.array[i*4],0);
    assert.ok(geometry.attributes.energyAlpha.array[chargeCount*4]>0); // Main wave still lasts 300ms.
    const emitted=fx.stats().emitted;
    assert.ok(emitted <= (mobile?32:53)); // Accents cannot overwhelm the main waves.
    assert.equal(scene.children.length,1);
  }
});

test('energy retrigger uses one emitter, keeps old fragments independent and retains bounded pools', () => {
  const scene = new THREE.Scene(), root = new THREE.Group();
  const energyFx = createTurboEnergyBurst(THREE, scene, true);
  const mesh = scene.getObjectByName('kart-turbo-energy-burst');
  const positions = mesh.geometry.attributes.position.array;
  const buffers = Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([key,value])=>[key,value.array]));
  energyFx.burst(root, 32); energyFx.update(.09); energyFx.burst(root, 60);
  assert.equal(energyFx.activeCount(), 1);
  assert.ok(energyFx.stats().fragments > 7); // Old wave was not reset.
  for (let step = 0; step < 200; step++) {
    root.position.z += 32 * .03; energyFx.burst(root, 32); energyFx.update(.03);
  }
  assert.strictEqual(mesh.geometry.attributes.position.array, positions);
  for (const [key,array] of Object.entries(buffers)) assert.strictEqual(mesh.geometry.attributes[key].array,array);
  assert.equal(scene.children.length, 1);
  assert.equal(energyFx.stats().capacity, 320);
  assert.ok(energyFx.stats().fragments <= 320);
});

test('separate karts keep independent ignition windows and expire without affecting a later burst', () => {
  const scene=new THREE.Scene(),fx=createTurboEnergyBurst(THREE,scene),a=new THREE.Group(),b=new THREE.Group();
  b.position.set(20,0,30);
  fx.burst(a,20);fx.update(.2);
  fx.burst(b,40);
  assert.equal(fx.activeCount(),2);
  fx.update(.3);
  assert.equal(fx.activeCount(),1);
  assert.ok(fx.stats().fragments>0);
  const geometry=scene.getObjectByName('kart-turbo-energy-burst').geometry;
  for(let i=0;i<geometry.attributes.energyAlpha.array.length;i+=4) {
    if(geometry.attributes.energyAlpha.array[i]>0) assert.ok(geometry.attributes.position.array[i*3]>14);
  }
  fx.update(.2);
  assert.equal(fx.activeCount(),0);
  assert.equal(fx.stats().fragments,0);
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
    fx.drift(0, [contact(-1.3, 0), contact(1.3, 0)], 0, 32, true, .05); fx.update(.05); fx.update(.2);
  } finally { Math.random = original; }
  assert.ok(root.position.equals(position)); assert.ok(root.rotation.equals(rotation));
});
