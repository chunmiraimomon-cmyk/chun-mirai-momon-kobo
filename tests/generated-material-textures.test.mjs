import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import ts from 'typescript';
import * as THREE from 'three';

const source = readFileSync(new URL('../app/generated-material-textures.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { createGeneratedTextureSet, markGeneratedSurface, GENERATED_SURFACES, GENERATED_ATLAS_URLS } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');

function fixture() {
  const loads = [], textures = [];
  class Loader {
    load(url, onLoad, _progress, onError) {
      const texture = new THREE.Texture();
      textures.push(texture); loads.push({url, onLoad:()=>onLoad(texture), onError});
      return texture;
    }
  }
  const registry = createGeneratedTextureSet({...THREE,TextureLoader:Loader}, {capabilities:{getMaxAnisotropy:()=>16}});
  const scene = new THREE.Scene();
  return {scene, registry, loads, textures};
}
function shader(material) {
  const result = {uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};
  material.onBeforeCompile(result, null); return result;
}

test('generated atlases exist, stay bounded and all recipes select a valid quadrant', () => {
  let bytes=0;
  for (const url of Object.values(GENERATED_ATLAS_URLS)) {
    const path = new URL('../public' + url, import.meta.url);
    const data = readFileSync(path);
    assert.equal(data.subarray(0,4).toString(), 'RIFF');
    assert.equal(data.subarray(8,12).toString(), 'WEBP');
    bytes+=statSync(path).size;
  }
  assert.ok(bytes<2_000_000, `texture delivery ${bytes}`);
  for (const recipe of Object.values(GENERATED_SURFACES)) {
    assert.ok(GENERATED_ATLAS_URLS[recipe.atlas]);
    assert.ok(Number.isInteger(recipe.tile)&&recipe.tile>=0&&recipe.tile<4);
    assert.ok(recipe.mean.every(v=>v>0&&v<=1));
    assert.ok(recipe.strength<=.9);
  }
});

test('many meshes and many materials share one GPU texture per generated atlas', async () => {
  const f=fixture();
  for (const kind of Object.keys(GENERATED_SURFACES)) {
    for(let i=0;i<3;i++)f.scene.add(new THREE.Mesh(new THREE.BoxGeometry(), markGeneratedSurface(new THREE.MeshStandardMaterial(),kind)));
  }
  f.registry.attach(f.scene);
  assert.equal(f.loads.length,Object.keys(GENERATED_ATLAS_URLS).length);
  assert.ok(f.textures.every(t=>t.anisotropy===4&&t.colorSpace===THREE.SRGBColorSpace));
  f.loads.forEach(x=>x.onLoad()); await f.registry.ready();
  f.registry.dispose();
});

test('applying textures preserves positions, indices, normals, object transforms and material colors', () => {
  const f=fixture(), geometry=new THREE.BoxGeometry();
  geometry.deleteAttribute('uv'); // custom hood / hull / deck edges have no UVs
  const positions=geometry.attributes.position.array.slice(), indices=geometry.index.array.slice(), normals=geometry.attributes.normal.array.slice();
  const material=markGeneratedSurface(new THREE.MeshPhysicalMaterial({color:0x17aaba,opacity:.43,transparent:true,emissive:0x082234}), 'paint');
  const mesh=new THREE.Mesh(geometry,material);mesh.position.set(1,2,3);mesh.rotation.y=.4;f.scene.add(mesh);
  const color=material.color.clone(), emissive=material.emissive.clone();
  f.registry.attach(f.scene);
  assert.deepEqual(positions,geometry.attributes.position.array);assert.deepEqual(indices,geometry.index.array);assert.deepEqual(normals,geometry.attributes.normal.array);
  assert.deepEqual(mesh.position.toArray(),[1,2,3]);assert.equal(mesh.rotation.y,.4);
  assert.ok(material.color.equals(color)&&material.emissive.equals(emissive));assert.equal(material.opacity,.43);
  assert.doesNotMatch(shader(material).vertexShader,/transformed\.[xyz]\s*[+\-*/]?=/);
  assert.doesNotMatch(shader(material).fragmentShader,/diffuseColor\.a\s*=/);
  f.registry.dispose();
});

test('animated UV skins stay local; road coordinates share world XZ across segments', () => {
  const f=fixture();
  const skin=markGeneratedSurface(new THREE.MeshStandardMaterial(),'skin','uv');
  const road=markGeneratedSurface(new THREE.MeshStandardMaterial(),'asphalt','world');
  f.scene.add(new THREE.Mesh(new THREE.SphereGeometry(),skin),new THREE.Mesh(new THREE.PlaneGeometry(),road));f.registry.attach(f.scene);
  assert.match(shader(skin).fragmentShader,/generatedCoords = vGeneratedUV/);
  assert.match(shader(road).vertexShader,/vGeneratedPosition = \(modelMatrix \* vec4\(position, 1\.0\)\)\.xyz/);
  assert.match(shader(road).fragmentShader,/generatedCoords = vGeneratedPosition\.xz/);
  f.registry.dispose();
});

test('weather, facade and river compile hooks are chained; attachment is idempotent', () => {
  const f=fixture();let oldCalls=0;
  const material=markGeneratedSurface(new THREE.MeshStandardMaterial(),'stone');
  material.onBeforeCompile=s=>{oldCalls++;s.uniforms.weatherTime={value:20};};material.customProgramCacheKey=()=> 'weather';
  f.scene.add(new THREE.Mesh(new THREE.BoxGeometry(),material));f.registry.attach(f.scene);
  const version=material.version,key=material.customProgramCacheKey();f.registry.attach(f.scene);
  assert.equal(material.version,version);assert.equal(f.loads.length,1);assert.equal(key,'weather:imagegen-v1:local');
  const compiled=shader(material);assert.equal(oldCalls,1);assert.equal(compiled.uniforms.weatherTime.value,20);
  assert.equal((compiled.fragmentShader.match(/sampler2D generatedAtlas/g)||[]).length,1);f.registry.dispose();
});

test('tile choices use uniforms, preserve tint, and distant detail is filtered', () => {
  const f=fixture(); const a=markGeneratedSurface(new THREE.MeshStandardMaterial(),'paint'), b=markGeneratedSurface(new THREE.MeshStandardMaterial(),'wood');
  f.scene.add(new THREE.Mesh(new THREE.BoxGeometry(),a),new THREE.Mesh(new THREE.BoxGeometry(),b));f.registry.attach(f.scene);
  assert.equal(a.customProgramCacheKey(),b.customProgramCacheKey());
  assert.deepEqual(shader(a).uniforms.generatedTile.value.toArray(),[0,.5]);
  assert.match(shader(a).fragmentShader,/generatedSample \/ generatedMean/);
  assert.match(shader(a).fragmentShader,/generatedMirror \* 0\.492/);
  assert.match(shader(a).fragmentShader,/dFdx\(generatedCoords\)/); f.registry.dispose();
});

test('texture failure leaves base colors enabled and readiness resolves; late loads after disposal are released', async () => {
  const f=fixture(), material=markGeneratedSurface(new THREE.MeshStandardMaterial(),'rubber','uv');
  f.scene.add(new THREE.Mesh(new THREE.CylinderGeometry(),material));f.registry.attach(f.scene);
  const compiled=shader(material);assert.equal(compiled.uniforms.generatedReady.value,0);
  const warn=console.warn;try{console.warn=()=>{};f.loads[0].onError();}finally{console.warn=warn;}
  await f.registry.ready();assert.equal(compiled.uniforms.generatedReady.value,0);
  let releases=0;f.textures[0].addEventListener('dispose',()=>releases++);f.registry.dispose();f.loads[0].onLoad();
  assert.equal(releases,2);assert.equal(compiled.uniforms.generatedReady.value,0);
});

test('all requested hazard materials, cars, roads and scenery are explicitly tagged', () => {
  for (const marker of [
    'markGeneratedSurface(tireMat, "rubber"', 'markGeneratedSurface(road.material,',
    'markGeneratedSurface(starlightRoadMaterial,', 'markGeneratedSurface(trunkMat,',
    'color: 0x81502f, roughness: 0.86 }), "fur", "uv"', 'markGeneratedSurface(bark,', 'markGeneratedSurface(rollingBarrelWood,',
    'markGeneratedSurface(octopusSkin,', 'markGeneratedSurface(stalkMat,', 'markGeneratedSurface(leafMat,',
    '[hullWood, outerWood, innerWood, darkCeiling]', 'markGeneratedSurface(sailCanvas,',
    'markGeneratedSurface(shellMaterial,', 'markGeneratedSurface(roadMaterial,',
  ]) assert.ok(page.includes(marker),marker);
  assert.match(page,/CylinderGeometry\(0\.55, 0\.68, 5\.4, 18\), \[bark, cut, cut\]/);
  assert.ok(page.indexOf('generatedTextures.attach(scene)',page.indexOf('const animate = (frameNow: number)')) > page.indexOf('reportRaceFault(frameStage, error, frameNow)'));
  assert.match(page,/if \(!readyReported && generatedTexturesReady\)/);
  assert.equal((page.match(/generatedTextures\??\.dispose\(\)/g)||[]).length,2);
});
