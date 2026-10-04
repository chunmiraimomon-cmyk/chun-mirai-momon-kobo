import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as THREE from 'three';

const source = readFileSync(new URL('../app/river-appearance.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { finishRiverSurface, makeRiverBedMaterial } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const shaderFor = (material) => {
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  material.onBeforeCompile(shader, null);
  return shader;
};

test('river shading preserves mesh positions and uses bounded non-emissive physical highlights', () => {
  const material = new THREE.MeshPhysicalMaterial({ opacity: 0.72, transparent: true, transmission: 0.3 });
  const clock = { value: 0 };
  finishRiverSurface(THREE, material, clock, { length: 112, width: 18 });
  const shader = shaderFor(material);
  assert.equal(material.opacity, 0.72);
  assert.equal(material.emissiveIntensity, 0);
  assert.equal(material.transmission, 0);
  assert.ok(material.envMapIntensity <= 0.6);
  assert.equal(shader.uniforms.riverClock, clock);
  assert.match(shader.vertexShader, /vRiverUV = uv;/);
  assert.doesNotMatch(shader.vertexShader, /transformed\.[xyz]\s*[+\-*/]?=/);
  assert.match(shader.fragmentShader, /dFdx\(riverHeight\)/);
  assert.match(shader.fragmentShader, /nonPerturbedNormal = normal/);
  assert.ok(shader.fragmentShader.indexOf('float riverHeight') < shader.fragmentShader.indexOf('dFdx(riverHeight)'));
  clock.value = 10;
  assert.equal(shader.uniforms.riverClock.value, 10);
});

test('growing downstream water keeps ripple phase continuous with the spillway', () => {
  const main = new THREE.MeshPhysicalMaterial();
  const downstream = new THREE.MeshPhysicalMaterial();
  const clock = { value: 4 };
  finishRiverSurface(THREE, main, clock, { length: 112, width: 18, offset: -107, direction: -1, junction: 'upstream' });
  finishRiverSurface(THREE, downstream, clock, { length: 72, width: 18, offset: -175, direction: -1, junction: 'downstream' });
  const mainShader = shaderFor(main), extensionShader = shaderFor(downstream);
  assert.equal(mainShader.uniforms.riverClock, extensionShader.uniforms.riverClock);
  assert.match(mainShader.fragmentShader, /diffuseColor.a \*= smoothstep\(-107.0, -103.0, riverP.x\)/);
  assert.match(extensionShader.fragmentShader, /diffuseColor.a \*= 1.0 - smoothstep\(-107.0, -103.0, riverP.x\)/);
  assert.notEqual(main.customProgramCacheKey(), downstream.customProgramCacheKey());
  for (const strength of [0.08, 0.2, 0.5, 0.9, 1]) {
    const coordinates = downstream.userData.riverCoordinates;
    coordinates.size.value.x = 72 * strength;
    coordinates.offset.value = -103 - 72 * strength;
    for (const physicalX of [-106.9, -105, -103.1]) {
      const uvExtension = (physicalX - coordinates.offset.value) / coordinates.size.value.x;
      const uvMain = (physicalX + 107) / 112;
      const extensionPhase = uvExtension * extensionShader.uniforms.riverSize.value.x + extensionShader.uniforms.riverOffset.value;
      const mainPhase = uvMain * mainShader.uniforms.riverSize.value.x + mainShader.uniforms.riverOffset.value;
      assert.ok(Math.abs(extensionPhase - mainPhase) < 1e-8);
    }
  }
});

test('program variants and river-bed detail are stable without per-frame material rebuilds', () => {
  const first = new THREE.MeshPhysicalMaterial(), second = new THREE.MeshPhysicalMaterial(), faded = new THREE.MeshPhysicalMaterial();
  finishRiverSurface(THREE, first, { value: 0 }, { length: 112, width: 18 });
  finishRiverSurface(THREE, second, { value: 0 }, { length: 72, width: 18, direction: -1 });
  finishRiverSurface(THREE, faded, { value: 0 }, { length: 112, width: 18, fadeEnds: true });
  assert.equal(first.customProgramCacheKey(), second.customProgramCacheKey());
  assert.notEqual(first.customProgramCacheKey(), faded.customProgramCacheKey());
  const bed = makeRiverBedMaterial(THREE);
  const shader = shaderFor(bed);
  assert.match(shader.fragmentShader, /fwidth\(riverBedCell\)/);
  assert.doesNotMatch(source, /needsUpdate|WebGLRenderTarget|PointLight/);
  const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /scene\.userData\.riverFoamTexture as Three\.Texture \| undefined\)\?\.dispose\(\)/);
  assert.match(page, /extensionCoordinates\.size\.value\.x = 72 \* extensionStrength/);
  assert.match(page, /extensionCoordinates\.offset\.value = -103 - 72 \* extensionStrength/);
});
