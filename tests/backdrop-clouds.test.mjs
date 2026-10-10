import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';

const cloudExports = {};
const deterministicMath = Object.create(Math);
deterministicMath.random = () => { throw new Error('Cloud sculpting must not use gameplay randomness'); };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../app/backdrop-clouds.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { exports: cloudExports, Math: deterministicMath });
const { createBackdropCloudGeometry, createBackdropCloudMaterial } = cloudExports;

test('both cloud detail levels have smooth finite attributes and normalized course-safe extents', () => {
  for (let variant = 0; variant < 4; variant++) {
    for (const detail of ['near', 'small']) {
      const geometry = createBackdropCloudGeometry(THREE, variant, detail);
      const position = geometry.getAttribute('position');
      const normal = geometry.getAttribute('normal');
      const color = geometry.getAttribute('color');
      assert.equal(position.count, detail === 'near' ? 1106 : 178);
      assert.equal(geometry.index.count / 3, detail === 'near' ? 2208 : 352);
      for (const attribute of [position, normal, color]) assert.ok(Array.from(attribute.array).every(Number.isFinite));
      for (let vertex = 0; vertex < position.count; vertex++) {
        assert.ok(Math.hypot(position.getX(vertex), position.getZ(vertex)) <= 1.000001);
        assert.ok(position.getY(vertex) >= -1.000001 && position.getY(vertex) <= 1.000001);
        assert.ok(Math.abs(Math.hypot(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex)) - 1) < 0.000001);
        assert.ok(color.getX(vertex) > 0.1 && color.getY(vertex) > 0.1 && color.getZ(vertex) > 0.1);
        assert.ok(Math.max(color.getX(vertex), color.getY(vertex), color.getZ(vertex)) < 0.60, 'muted, not white albedo');
      }
      assert.ok(geometry.boundingBox.min.y <= -0.98 && geometry.boundingBox.max.y >= 0.94);
      geometry.dispose();
    }
  }
});

test('cloud is one watertight outward-facing mesh, not a pile of disconnected sphere shells', () => {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const edge1 = new THREE.Vector3(), edge2 = new THREE.Vector3(), faceNormal = new THREE.Vector3(), smoothNormal = new THREE.Vector3();
  for (let variant = 0; variant < 4; variant++) {
    for (const detail of ['near', 'small']) {
      const geometry = createBackdropCloudGeometry(THREE, variant, detail);
      const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
      const edges = new Map(), neighbors = new Map();
      for (let triangle = 0; triangle < geometry.index.count; triangle += 3) {
        const ids = [0, 1, 2].map(offset => geometry.index.getX(triangle + offset));
        a.fromBufferAttribute(position, ids[0]); b.fromBufferAttribute(position, ids[1]); c.fromBufferAttribute(position, ids[2]);
        faceNormal.crossVectors(edge1.subVectors(b, a), edge2.subVectors(c, a));
        assert.ok(faceNormal.lengthSq() > 1e-10, 'no collapsed triangles at poles');
        smoothNormal.set(0, 0, 0);
        for (const vertex of ids) smoothNormal.add(new THREE.Vector3().fromBufferAttribute(normal, vertex));
        assert.ok(faceNormal.dot(smoothNormal) > 0, `${variant}/${detail} has outward winding`);
        for (let edge = 0; edge < 3; edge++) {
          const from = ids[edge], to = ids[(edge + 1) % 3];
          const key = from < to ? `${from}:${to}` : `${to}:${from}`;
          edges.set(key, (edges.get(key) ?? 0) + 1);
          if (!neighbors.has(from)) neighbors.set(from, new Set());
          if (!neighbors.has(to)) neighbors.set(to, new Set());
          neighbors.get(from).add(to); neighbors.get(to).add(from);
        }
      }
      assert.ok([...edges.values()].every(count => count === 2), 'each edge has exactly two adjacent faces');
      const visited = new Set([0]), pending = [0];
      while (pending.length) {
        for (const neighbor of neighbors.get(pending.pop())) {
          if (!visited.has(neighbor)) { visited.add(neighbor); pending.push(neighbor); }
        }
      }
      assert.equal(visited.size, position.count, 'one connected surface');
      geometry.dispose();
    }
  }
});

test('four forms are distinct and repeat deterministically, including negative/non-finite variant inputs', () => {
  const forms = [];
  for (let variant = 0; variant < 4; variant++) {
    const first = createBackdropCloudGeometry(THREE, variant);
    const second = createBackdropCloudGeometry(THREE, variant);
    assert.deepEqual(first.attributes.position.array, second.attributes.position.array);
    assert.deepEqual(first.attributes.normal.array, second.attributes.normal.array);
    forms.push(Array.from(first.attributes.position.array));
    first.dispose(); second.dispose();
  }
  assert.equal(new Set(forms.map(form => JSON.stringify(form))).size, 4);
  assert.deepEqual(Array.from(createBackdropCloudGeometry(THREE, -1).attributes.position.array), forms[3]);
  assert.deepEqual(Array.from(createBackdropCloudGeometry(THREE, NaN).attributes.position.array), forms[0]);
});

test('soft cloud material preserves ordinary instancing and weather colors without new texture or animation work', () => {
  const geometry = createBackdropCloudGeometry(THREE, 0);
  const material = createBackdropCloudMaterial(THREE);
  assert.ok(material.isMeshStandardMaterial);
  assert.equal(material.vertexColors, true);
  assert.equal(material.transparent, false);
  assert.equal(material.roughness, 1);
  assert.equal(material.metalness, 0);
  assert.equal(material.map, null);
  assert.equal(material.userData.generatedSurface, undefined);
  const shader = { fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader, null);
  assert.match(shader.fragmentShader, /outgoingLight \+= diffuseColor\.rgb \* cumulusRim \* 0\.075/);
  assert.equal(material.customProgramCacheKey(), 'sculpted-cumulus-soft-rim-v1');
  const mesh = new THREE.InstancedMesh(geometry, material, 2);
  mesh.setColorAt(0, new THREE.Color(0x9badbd));
  mesh.setColorAt(1, new THREE.Color(0xcbd0c8));
  material.color.setHex(0x617d9e);
  material.emissive.setHex(0x182d4b);
  material.emissiveIntensity = 0.3;
  assert.equal(material.color.getHex(), 0x617d9e);
  assert.equal(material.emissive.getHex(), 0x182d4b);
  assert.equal(mesh.instanceColor.count, 2);
  const colors = geometry.attributes.color;
  let bottom, top;
  for (let vertex = 0; vertex < geometry.attributes.position.count; vertex++) {
    const y = geometry.attributes.position.getY(vertex);
    if (y <= -0.99) bottom = vertex;
    if (y >= 0.99) top = vertex;
  }
  assert.ok(colors.getZ(bottom) > colors.getX(bottom), 'soft blue underside');
  assert.ok(colors.getX(top) > colors.getZ(top), 'subtly warm crown');
  geometry.dispose(); material.dispose();
});
