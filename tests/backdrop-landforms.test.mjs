import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';

const compilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS };
function loadModule(name, dependencies = {}) {
  const exports = {};
  const isolatedMath = Object.create(Math);
  isolatedMath.random = () => { throw new Error('Landforms may not consume gameplay randomness'); };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../app/${name}.ts`, import.meta.url), 'utf8'), { compilerOptions }).outputText, {
    exports, Math: isolatedMath, setTimeout, clearTimeout, console,
    require: dependency => {
      assert.ok(Object.hasOwn(dependencies, dependency), `Unexpected landform dependency: ${dependency}`);
      return dependencies[dependency];
    },
  });
  return exports;
}
const generated = loadModule('generated-material-textures');
const { createBackdropLandformGeometry, createBackdropLandformMaterial } = loadModule('backdrop-landforms', {
  './generated-material-textures': generated,
});

function rayHeight(geometry, x, z) {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0));
  const intersections = ray.intersectObject(mesh);
  mesh.material.dispose();
  assert.equal(intersections.length, 1, `One rendered terrain surface at ${x}, ${z}`);
  return intersections[0].point.y;
}

test('all four landform variants are finite, smoothly shaded unit terrain with bounded subdivision', () => {
  for (let variant = 0; variant < 4; variant++) {
    const geometry = createBackdropLandformGeometry(THREE, variant);
    const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
    assert.equal(position.count, 769);
    assert.equal(geometry.index.count / 3, 1504);
    assert.equal(geometry.getAttribute('color').count, position.count);
    assert.equal(geometry.getAttribute('uv').count, position.count);
    let maxY = 0;
    for (let index = 0; index < position.count; index++) {
      const x = position.getX(index), y = position.getY(index), z = position.getZ(index);
      assert.ok([x, y, z, normal.getX(index), normal.getY(index), normal.getZ(index)].every(Number.isFinite));
      assert.ok(Math.hypot(x, z) <= 1 + 1e-6, 'Fits within safe placement footprint');
      assert.ok(y >= 0 && y <= 1, 'Support height is normalized');
      assert.ok(normal.getY(index) > 0, 'Terrain triangles all face upward');
      assert.ok(Math.abs(Math.hypot(normal.getX(index), normal.getY(index), normal.getZ(index)) - 1) < 1e-6);
      maxY = Math.max(maxY, y);
    }
    assert.equal(maxY, 1);
    for (let index = position.count - 32; index < position.count; index++) assert.equal(position.getY(index), 0);
    assert.ok(new Set(Array.from(geometry.getAttribute('color').array).map(x => x.toFixed(3))).size > 50,
      'Strata and erosion are visible without downloaded atlas');
    geometry.dispose();
  }
});

test('ridge, mesa, offset summit and saddle are substantially different and deterministic', () => {
  const probes = [[-0.4, -0.18], [-0.31, 0.19], [0.17, -0.24], [0.33, 0.16], [-0.11, 0.33]];
  const heights = [];
  for (let variant = 0; variant < 4; variant++) {
    const geometry = createBackdropLandformGeometry(THREE, variant);
    const same = createBackdropLandformGeometry(THREE, variant + 4);
    assert.deepEqual(geometry.getAttribute('position').array, same.getAttribute('position').array);
    heights.push(probes.map(([x, z]) => rayHeight(geometry, x, z)));
    geometry.dispose(); same.dispose();
  }
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
    const difference = heights[a].reduce((total, y, index) => total + Math.abs(y - heights[b][index]), 0) / probes.length;
    assert.ok(difference > 0.12, `Shapes ${a}/${b} need genuinely different silhouette profiles: ${difference}`);
  }
});

test('materials have physical-scale instance coordinates and preserve ImageGen compile chaining', async () => {
  const loads = [];
  class Loader {
    load(url, onLoad) {
      const texture = new THREE.Texture();
      loads.push({ url, texture, finish: () => onLoad(texture) });
      return texture;
    }
  }
  const registry = generated.createGeneratedTextureSet({ ...THREE, TextureLoader: Loader }, { capabilities: { getMaxAnisotropy: () => 4 } });
  const scene = new THREE.Scene();
  const materials = [createBackdropLandformMaterial(THREE, true), createBackdropLandformMaterial(THREE, false)];
  const geometry = createBackdropLandformGeometry(THREE, 1);
  const compile = material => {
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    material.onBeforeCompile(shader, null);
    return shader;
  };
  // Procedural fallback compiles without any generated-texture declarations.
  assert.match(compile(materials[0]).fragmentShader, /backdropDetail/);
  for (const material of materials) {
    assert.equal(material.color.getHex(), 0xffffff);
    assert.equal(material.vertexColors, true);
    assert.equal(material.roughness, 0.97);
    scene.add(new THREE.InstancedMesh(geometry, material, 2));
  }
  registry.attach(scene);
  assert.equal(loads.length, 1, 'Both landform materials share the existing terrain atlas');
  assert.equal(materials[0].customProgramCacheKey(), materials[1].customProgramCacheKey());
  for (let index = 0; index < materials.length; index++) {
    const shader = compile(materials[index]);
    assert.equal(shader.uniforms.backdropVegetation.value, index === 0 ? 1 : 0);
    assert.match(shader.vertexShader, /modelMatrix \* instanceMatrix/);
    assert.match(shader.vertexShader, /vBackdropTexturePosition = position \* backdropScale/);
    assert.match(shader.vertexShader, /normal \/ backdropScale/);
    assert.match(shader.fragmentShader, /#define vGeneratedPosition vBackdropTexturePosition/);
    assert.match(shader.fragmentShader, /#define vGeneratedNormal vBackdropTextureNormal/);
    assert.ok(shader.fragmentShader.indexOf('varying vec3 vGeneratedPosition') < shader.fragmentShader.indexOf('#define vGeneratedPosition'),
      'Atlas varying declaration precedes the deliberate scale-correct input alias');
    assert.ok(shader.fragmentShader.indexOf('diffuseColor.rgb *= mix(vec3(1.0), generatedDetail') < shader.fragmentShader.indexOf('diffuseColor.rgb *= mix(backdropRockColor'),
      'Generated detail and geological detail both compose into the material');
    assert.doesNotMatch(shader.vertexShader, /transformed\.[xyz]\s*[+\-*/]?=/, 'Material cannot displace terrain or change support');
  }
  loads.forEach(load => load.finish()); await registry.ready();
  registry.dispose(); geometry.dispose(); materials.forEach(material => material.dispose());
});
