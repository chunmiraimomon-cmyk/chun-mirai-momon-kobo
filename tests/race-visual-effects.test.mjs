import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as THREE from 'three';

const source = readFileSync(new URL('../app/race-visual-effects.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { createRaceVisualEffects, wetRoadForSpray, addSkillAccent, waterSprayProfile } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('spray requires road contact and actual wet footprint, including pirate bilge only', () => {
  assert.equal(wetRoadForSpray('river', .3, 0, 10, true, true), true);
  assert.equal(wetRoadForSpray('river', .3, 0, 10, false, true), false);
  assert.equal(wetRoadForSpray('river', .3, 0, 10, true, false), false);
  assert.equal(wetRoadForSpray('river', .3, 11, 10, true, true), false);
  assert.equal(wetRoadForSpray('pirate', 2.7, -5, 10, true, false), true);
  for (const u of [.1, .64, .79, .99]) assert.equal(wetRoadForSpray('pirate', u, 0, 10, true, false), false);
  assert.equal(wetRoadForSpray('city', .7, 0, 10, true, true), false);
});

test('particle pools are bounded, reuse buffers, expire, and do not use gameplay RNG', () => {
  const scene = new THREE.Scene();
  const originalRandom = Math.random;
  const fx = createRaceVisualEffects(THREE, scene, false);
  const water = scene.getObjectByName('wheel-water-droplets');
  const fire = scene.getObjectByName('fire-embers');
  const positions = water.geometry.attributes.position.array;
  const pose = Object.freeze({ x: 0, y: 0, z: 0, heading: 0 });
  const budget = {};
  Math.random = () => { throw new Error('visuals consumed gameplay RNG'); };
  try {
    for (let i = 0; i < 600; i++) {
      fx.update(1/60, i/60);
      for (let actor = 0; actor < 5; actor++) fx.wheelSpray(actor, pose, 40, true, 1/60);
      fx.fireTrail(pose, 0, 3, 1/60, budget);
    }
  } finally { Math.random = originalRandom; }
  assert.equal(water.geometry.attributes.position.array, positions);
  assert.equal(water.geometry.attributes.position.count, 3200);
  assert.equal(fire.geometry.attributes.position.count, 360);
  assert.ok(water.geometry.attributes.fxAlpha.array.some(x => x > 0));
  assert.ok(fire.geometry.attributes.fxAlpha.array.some(x => x > 0));
  assert.ok([...positions].every(Number.isFinite));
  fx.update(2, 12);
  assert.ok(water.geometry.attributes.fxAlpha.array.every(x => x === 0));
  assert.ok(fire.geometry.attributes.fxAlpha.array.every(x => x === 0));
  assert.equal(scene.children.length, 3);
});

test('dry/airborne/stationary actors produce no splash; faster racers produce more', () => {
  const count = (speed, wet) => {
    const scene = new THREE.Scene(), fx = createRaceVisualEffects(THREE, scene, false);
    for (let i = 0; i < 15; i++) { fx.update(1/60, i/60); fx.wheelSpray(0, { x: 0, y: 0, z: 0, heading: 0 }, speed, wet, 1/60); }
    return scene.getObjectByName('wheel-water-droplets').geometry.attributes.fxAlpha.array.filter(x => x > 0).length;
  };
  assert.equal(count(40, false), 0);
  assert.equal(count(0, true), 0);
  assert.ok(count(40, true) > count(8, true));
});

test('mobile budgets are lower and FIRE instances share GPU resources', () => {
  const fx = createRaceVisualEffects(THREE, new THREE.Scene(), true);
  assert.deepEqual(fx.budgets, { water: 1600, embers: 180 });
  const first = fx.makeFire(), second = fx.makeFire();
  assert.equal(first.children.length, 4);
  assert.equal(first.children[0].geometry, second.children[0].geometry);
  assert.equal(first.children[0].material, second.children[0].material);
  assert.equal(first.children[0].material.forceSinglePass, true);
  assert.deepEqual(first.scale.toArray(), [1, 1, 1]);
});

test('sky tracks existing weather without changing fog, background, exposure or camera', () => {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#204060'); scene.fog = new THREE.Fog('#304050', 10, 200);
  const background = scene.background, fog = scene.fog;
  const fx = createRaceVisualEffects(THREE, scene, false), camera = new THREE.PerspectiveCamera();
  camera.position.set(20, 30, 40);
  fx.updateSky(camera, 900, 4, -1);
  const sky = scene.getObjectByName('layered-atmosphere');
  assert.deepEqual(sky.position.toArray(), [20, 30, 40]);
  assert.equal(sky.material.uniforms.uNight.value, 1);
  assert.equal(sky.material.uniforms.uStorm.value, 0);
  assert.equal(scene.background, background); assert.equal(scene.fog, fog);
  assert.equal(background.getHexString(), '204060'); assert.equal(fog.far, 200);
});

test('one shared atmosphere owns themed layered clouds; presentation creates no competing sky', () => {
  const presentation = readFileSync(new URL('../app/race-presentation.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(presentation, /const sky\s*=|scene\.add\(sky\)|sky\.material/);
  const scene = new THREE.Scene();
  createRaceVisualEffects(THREE, scene, true, 'cloud');
  const skies = scene.children.filter(object => object.name === 'layered-atmosphere');
  assert.equal(skies.length, 1);
  const sky = skies[0];
  assert.equal(sky.material.side, THREE.BackSide);
  assert.equal(sky.material.depthWrite, false);
  assert.match(sky.material.vertexShader, /gl_Position=clip\.xyww/);
  assert.match(sky.material.fragmentShader, /vec4 distant=cloudLayer/);
  assert.match(sky.material.fragmentShader, /vec4 nearby=cloudLayer/);
  assert.match(sky.material.fragmentShader, /float volume=smoothstep/);
  assert.match(sky.material.fragmentShader, /starSpecks\(celestial\)/);
  assert.doesNotMatch(sky.material.fragmentShader, /for\s*\(|while\s*\(/); // No per-pixel ray march.
  assert.equal(scene.children.some(object => object.isLight), false);
});

test('all six course atmospheres are distinct and fall back safely', () => {
  const palette = new Set(), clouds = new Set();
  for (const theme of ['city', 'jungle', 'river', 'pirate', 'starlight', 'cloud']) {
    const scene = new THREE.Scene();
    createRaceVisualEffects(THREE, scene, false, theme);
    const uniforms = scene.getObjectByName('layered-atmosphere').material.uniforms;
    palette.add(uniforms.uZenith.value.getHexString() + ':' + uniforms.uHorizon.value.getHexString());
    clouds.add(uniforms.uCloudShape.value.toArray().join(','));
  }
  const scene = new THREE.Scene();
  createRaceVisualEffects(THREE, scene, true, 'unknown');
  assert.equal(scene.getObjectByName('layered-atmosphere').material.uniforms.uZenith.value.getHexString(), '3d83b6');
  assert.equal(palette.size, 6); assert.equal(clouds.size, 6);
});

test('atmosphere updates reuse GPU resources and recover exactly after storm/night', () => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#6999be'); scene.fog = new THREE.Fog('#88acb5', 10, 400);
  const fx = createRaceVisualEffects(THREE, scene, true, 'jungle');
  const sky = scene.getObjectByName('layered-atmosphere'), camera = new THREE.PerspectiveCamera();
  const geometry = sky.geometry, material = sky.material, uniforms = material.uniforms;
  const skyColor = uniforms.uSky.value, fogColor = uniforms.uFog.value;
  fx.updateSky(camera, 720, 0, 0);
  const clear = [skyColor.toArray(), fogColor.toArray()];
  const originalRandom = Math.random;
  Math.random = () => { throw new Error('sky consumed gameplay RNG'); };
  try {
    for (let i = 0; i < 200; i++) {
      fx.update(1/60, i/60);
      fx.updateSky(camera, 720, 1, 1);
    }
  } finally { Math.random = originalRandom; }
  fx.updateSky(camera, 720, 0, 0);
  assert.equal(sky.geometry, geometry); assert.equal(sky.material, material); assert.equal(sky.material.uniforms, uniforms);
  assert.equal(uniforms.uSky.value, skyColor); assert.equal(uniforms.uFog.value, fogColor);
  assert.deepEqual([skyColor.toArray(), fogColor.toArray()], clear);
  assert.equal(uniforms.uNight.value, 0); assert.equal(uniforms.uStorm.value, 0);
  assert.equal(scene.children.length, 3);
});

test('all four skills have distinct owned geometry and retain provided material', () => {
  const counts = {};
  for (const skill of ['GIANT', 'PIXEL', 'VOLT', 'COMET']) {
    const group = new THREE.Group(), material = new THREE.MeshBasicMaterial();
    addSkillAccent(THREE, group, skill, material);
    const accent = group.getObjectByName('skill-accent');
    counts[skill] = accent.children.length;
    accent.traverse(child => { if (child.isMesh) assert.equal(child.material, material); });
  }
  assert.deepEqual(counts, { GIANT: 3, PIXEL: 6, VOLT: 3, COMET: 3 });
});

test('ordinary continuous emission reaches all four wheel contacts, not only entry bursts', () => {
  const scene=new THREE.Scene(), fx=createRaceVisualEffects(THREE,scene,false);
  const pose={x:0,y:0,z:0,heading:0};
  fx.wheelSpray(0,pose,35,true,0); // Complete entry burst, retain wet state.
  fx.update(2,2);
  fx.wheelSpray(0,pose,35,true,1/60); // Only one ordinary emission packet.
  const a=scene.getObjectByName('wheel-water-droplets').geometry.attributes;
  const anchors=new Set();
  for(let i=0;i<a.fxAlpha.count;i++) if(a.fxAlpha.array[i]>0) anchors.add([a.position.getX(i).toFixed(2),a.position.getZ(i).toFixed(2)].join(','));
  assert.deepEqual([...anchors].sort(),['-1.30,-1.31','-1.30,1.43','1.30,-1.31','1.30,1.43'].sort());
});

test('speed raises amount, height, range and clump size with a bounded maximum', () => {
  const slow=waterSprayProfile(8,false), fast=waterSprayProfile(45,false);
  for(const key of ['packetsPerSecond','lift','outward','backward','lifetime','dropSize','clumpSize']) assert.ok(fast[key]>slow[key],key);
  assert.deepEqual(waterSprayProfile(500,false),fast);
  assert.deepEqual(waterSprayProfile(-45,false),fast);
  assert.ok(fast.packetsPerSecond*4>42*2*3); // At least triple the former max primary drop rate.
  function sample(speed){
    const scene=new THREE.Scene(),fx=createRaceVisualEffects(THREE,scene,false);
    for(let i=0;i<30;i++){fx.update(1/60,i/60);fx.wheelSpray(0,{x:0,y:0,z:speed*i/60,heading:0},speed,true,1/60);}
    const a=scene.getObjectByName('wheel-water-droplets').geometry.attributes;
    const active=Array.from(a.fxAlpha.array.keys()).filter(i=>a.fxAlpha.array[i]>0);
    return {count:active.length,height:Math.max(...active.map(i=>a.position.getY(i))),rear:Math.min(...active.map(i=>a.position.getZ(i)))-speed*29/60,clumps:active.filter(i=>a.fxKind.array[i]===1).length,size:Math.max(...a.fxSize.array)};
  }
  const low=sample(8), high=sample(45);
  assert.ok(high.count>low.count*2);assert.ok(high.height>low.height*2);assert.ok(high.rear<low.rear-2);assert.ok(high.size>low.size*2);assert.ok(high.clumps>10);
});

test('spray remains frame-rate stable, stops on dry land, and leaves no lingering opaque cloud', () => {
  function count(hz){const scene=new THREE.Scene(),fx=createRaceVisualEffects(THREE,scene,false);for(let i=0;i<hz;i++)fx.wheelSpray(0,{x:0,y:0,z:0,heading:0},35,true,1/hz);return scene.getObjectByName('wheel-water-droplets').geometry.attributes.fxAlpha.array.filter(a=>a>0).length;}
  assert.ok(Math.abs(count(30)-count(120))<=8);
  const scene=new THREE.Scene(),fx=createRaceVisualEffects(THREE,scene,false);
  fx.wheelSpray(0,{x:0,y:0,z:0,heading:0},45,true,1/60);
  fx.update(2,2);fx.wheelSpray(0,{x:0,y:0,z:0,heading:0},45,false,1/60);
  const water=scene.getObjectByName('wheel-water-droplets');
  assert.ok(water.geometry.attributes.fxAlpha.array.every(a=>a===0));
  assert.equal(water.material.depthWrite,false);assert.equal(water.material.blending,THREE.NormalBlending);
  assert.match(water.material.vertexShader,/smoothstep\(1\.4,5\.5,-p\.z\)/); // Fade spray approaching chase camera.
});
