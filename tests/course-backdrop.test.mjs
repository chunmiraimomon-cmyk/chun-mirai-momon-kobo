import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';

// Keep Three.js in its own module context: its UUID creation uses Math.random.
// The backdrop itself receives a throwing Math.random to catch accidental changes
// to the race's shared random sequence without mistaking UUIDs for game logic.
const compilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS };
const isolatedMath = Object.create(Math);
isolatedMath.random = () => { throw new Error('Backdrop must not consume gameplay Math.random'); };
const compiledModules = new Map();
function loadModule(name) {
  assert.ok(['generated-material-textures', 'backdrop-landforms', 'backdrop-clouds', 'pirate-horizon', 'backdrop-architecture', 'backdrop-nature', 'backdrop-sky-sea', 'course-backdrop'].includes(name));
  if (compiledModules.has(name)) return compiledModules.get(name);
  const exports = {};
  compiledModules.set(name, exports);
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../app/${name}.ts`, import.meta.url), 'utf8'), { compilerOptions }).outputText, {
    exports, Math: isolatedMath, setTimeout, clearTimeout, console, require: dependency => loadModule(dependency.replace('./', '')),
  });
  return exports;
}
const backdropExports = loadModule('course-backdrop');
const { createCourseBackdrop } = backdropExports;
assert.equal(typeof createCourseBackdrop, 'function');

const themes = ['city', 'jungle', 'river', 'pirate', 'starlight', 'cloud'];
const groundY = -34;

function fixture(theme, { allowScenery = true, originX = 0, originZ = 0 } = {}) {
  const queries = { poses: [], clearance: [] };
  const radius = 96;
  const target = Object.freeze({
    length: Math.PI * 2 * radius,
    pointAt(u, lane = 0) {
      assert.ok(Number.isFinite(u) && Number.isFinite(lane));
      queries.poses.push([u, lane]);
      const angle = u * Math.PI * 2;
      return Object.freeze({
        x: originX + Math.cos(angle) * (radius + lane),
        y: 12 + Math.sin(angle * 2) * 6,
        z: originZ + Math.sin(angle) * (radius + lane),
        heading: Math.atan2(-Math.sin(angle), Math.cos(angle)),
        pitch: 0,
        nx: Math.cos(angle), nz: Math.sin(angle),
      });
    },
    isClearFromRoad(x, z, margin, ignoreU, ignoreRange) {
      assert.ok([x, z, margin].every(Number.isFinite));
      assert.ok(margin > 0);
      // Circular fixture has no stacked/nearby road other than this local
      // section. Edge clouds may intentionally overlap only that section.
      const valid = allowScenery && (Number.isFinite(ignoreU) || Math.abs(Math.hypot(x - originX, z - originZ) - radius) >= margin);
      queries.clearance.push({ x, z, margin, valid, ignoreU, ignoreRange });
      return valid;
    },
  });
  const course = new Proxy(target, {
    get(object, name) {
      assert.ok(Object.hasOwn(object, name), `Backdrop must only query the course's render-placement API: ${String(name)}`);
      return object[name];
    },
    set() { throw new Error('Backdrop must never change course data'); },
    defineProperty() { throw new Error('Backdrop must never add course data'); },
    deleteProperty() { throw new Error('Backdrop must never delete course data'); },
  });
  const scene = new THREE.Scene();
  const result = createCourseBackdrop(THREE, scene, course, theme, groundY);
  const meshes = [];
  result.group.traverse(object => { if (object.isMesh || object.isPoints) meshes.push(object); });
  return { scene, result, meshes, queries, radius, originX, originZ };
}

function snapshot(f) {
  f.result.group.updateMatrixWorld(true);
  return f.meshes.map(mesh => ({
    name: mesh.name,
    count: mesh.isInstancedMesh ? mesh.count : 1,
    matrices: Array.from(mesh.isInstancedMesh ? mesh.instanceMatrix.array : mesh.matrixWorld.elements),
    colors: mesh.instanceColor ? Array.from(mesh.instanceColor.array) : null,
    materialColors: (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(material => material.color?.getHex()),
  }));
}

function actualBudget(meshes) {
  let draws = 0, instances = 0, triangles = 0;
  for (const mesh of meshes) {
    draws += Array.isArray(mesh.material) ? mesh.geometry.groups.length : 1;
    const count = mesh.isInstancedMesh ? mesh.count : 1;
    instances += count;
    if (mesh.isMesh) triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3 * count;
  }
  return { draws, instances, triangles };
}

test('dispatcher backdrops add finite static visual-only scenery and report every draw including sky points', () => {
  for (const theme of themes) {
    const f = fixture(theme);
    assert.equal(f.result.group.parent, f.scene);
    assert.equal(f.result.group.userData.visualOnly, true);
    assert.ok(f.result.group.visible && f.meshes.length > 0, theme);
    for (const object of f.meshes) {
      assert.ok(object.visible && (!object.isInstancedMesh || object.count > 0));
      assert.ok(Array.from(object.isInstancedMesh ? object.instanceMatrix.array : object.matrix.elements).every(Number.isFinite));
      for (const attribute of Object.values(object.geometry.attributes)) assert.ok(Array.from(attribute.array).every(Number.isFinite));
      if (object.instanceColor) assert.ok(Array.from(object.instanceColor.array).every(Number.isFinite));
      assert.equal(object.castShadow, false); assert.equal(object.receiveShadow, false);
    }
    f.result.group.traverse(object => assert.ok(!object.isLight));
    const budget = actualBudget(f.meshes);
    assert.ok(budget.draws <= 25, `${theme}: ${budget.draws} draws`);
    assert.ok(budget.triangles <= 180_000, `${theme}: ${budget.triangles} triangles`);
    assert.equal(f.result.drawCalls, budget.draws);
    assert.equal(f.result.instances, budget.instances);
    assert.equal(f.result.triangles, budget.triangles);
    const vertices = f.meshes.reduce((total, object) => total + object.geometry.getAttribute('position').count * (object.isInstancedMesh ? object.count : 1), 0);
    assert.equal(f.result.vertices, vertices);
    for (const key of ['drawCalls', 'instances', 'vertices', 'triangles', 'maxClearanceRadius']) {
      assert.equal(f.result.group.userData.courseBackdropStats[key], f.result[key]);
    }
  }
});

test('rebuilding each theme is deterministic and does not consume gameplay randomness', () => {
  for (const theme of themes) assert.deepEqual(snapshot(fixture(theme)), snapshot(fixture(theme)), theme);
});

test('placement is course-relative and only accepted safe footprint anchors are recorded', () => {
  for (const theme of themes) {
    const f = fixture(theme, { originX: 780, originZ: -640 });
    assert.ok(f.queries.poses.length > 0, `${theme} must sample the actual course`);
    assert.ok(f.queries.poses.length <= 768, `${theme} keeps startup course sampling bounded`);
    const anchors = f.result.group.userData.backdropAnchors;
    assert.ok(Array.isArray(anchors));
    if (theme === 'starlight') {
      assert.equal(anchors.length, 0, 'no opaque lower decorations remain in starlight');
      assert.equal(f.result.maxClearanceRadius, 0);
      continue;
    }
    assert.ok(anchors.length > 0, `${theme} records scenery roots`);
    for (const anchor of anchors) {
      assert.ok([anchor.x, anchor.z, anchor.footprint, anchor.baseY].every(Number.isFinite));
      assert.ok(anchor.footprint > 0);
      assert.ok(Math.abs(Math.hypot(anchor.x - f.originX, anchor.z - f.originZ) - f.radius) >= anchor.footprint + 18 - 1e-6,
        `${theme}/${anchor.kind} infringes the road clearance`);
      assert.ok(f.queries.clearance.some(query => query.valid && Math.abs(query.x - anchor.x) < 1e-6 && Math.abs(query.z - anchor.z) < 1e-6 && query.margin >= anchor.footprint + 18 - 1e-6),
        `${theme}/${anchor.kind} needs a successful road-clearance query`);
      if (!['cloud', 'starlight'].includes(theme)) assert.ok(anchor.baseY >= groundY - 1e-6, `${theme}/${anchor.kind} must not originate below its supporting ground`);
    }
    if (!['cloud', 'starlight'].includes(theme)) assert.ok(anchors.some(anchor => Math.abs(anchor.baseY - groundY) < 1e-6), `${theme} has ground-attached scenery`);
    assert.ok(f.result.maxClearanceRadius >= Math.max(...anchors.map(anchor => anchor.footprint)));
  }
});

test('forest trees placed on sculpted landforms do not hover above the rendered surface', () => {
  for (const theme of ['jungle', 'river']) {
    const f = fixture(theme);
    f.result.group.updateMatrixWorld(true);
    const landforms = f.meshes.filter(mesh => mesh.geometry.userData.backdropLandformVariant !== undefined);
    const supported = f.result.group.userData.backdropAnchors.filter(anchor =>
      anchor.baseY > groundY + 0.01);
    assert.ok(supported.length > 0, `${theme} has landform-attached decoration`);
    for (const anchor of supported) {
      const ray = new THREE.Raycaster(new THREE.Vector3(anchor.x, 2000, anchor.z), new THREE.Vector3(0, -1, 0));
      const hits = ray.intersectObjects(landforms, false);
      assert.ok(hits.length > 0, `${theme}/${anchor.kind} has actual visible support`);
      assert.ok(anchor.baseY <= hits[0].point.y + 0.25, `${theme}/${anchor.kind} is planted, not hovering`);
    }
  }
});

test('failed road-clearance checks never produce accepted decoration anchors', () => {
  for (const theme of themes) {
    const f = fixture(theme, { allowScenery: false });
    assert.equal(f.result.group.userData.backdropAnchors.length, 0, theme);
    assert.equal(f.queries.clearance.length > 0, theme !== 'starlight', `${theme} checks only scenery that it creates`);
  }
});

test('scene-owned scenery shares a bounded geometry/material set and releases resources through normal cleanup', () => {
  for (const theme of themes) {
    const f = fixture(theme), geometries = new Set(), materials = new Set(), textures = new Set();
    for (const object of f.meshes) {
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material); if (material.map) textures.add(material.map);
      }
    }
    assert.ok(geometries.size <= 25 && materials.size <= 25, theme);
    if (['city', 'jungle', 'river', 'cloud'].includes(theme)) assert.ok(f.result.instances > geometries.size);
    let disposed = 0;
    for (const resource of [...geometries, ...materials]) resource.addEventListener('dispose', () => disposed++);
    for (const resource of [...geometries, ...materials]) resource.dispose();
    assert.equal(disposed, geometries.size + materials.size);
    assert.ok(textures.size <= 1, 'Foliage species share a single fallback/atlas');
    assert.equal(typeof f.result.update, 'undefined'); assert.equal(typeof f.result.dispose, 'undefined');
  }
});

test('unsupported creator themes fall back to the same safe city rendering', () => {
  assert.deepEqual(snapshot(fixture('unsupported')), snapshot(fixture('city')));
});

test('city contains twenty-four to thirty sparse grounded buildings, six families and four-facing real glazing', () => {
  const f = fixture('city'), buildings = f.result.group.userData.cityBuildings;
  assert.ok(buildings.length >= 24 && buildings.length <= 30);
  assert.equal(f.result.group.userData.buildingCount, buildings.length);
  assert.ok(new Set(buildings.map(item => item.family)).size >= 6);
  assert.ok(Math.max(...buildings.map(item => item.height)) / Math.min(...buildings.map(item => item.height)) > 3);
  for (let a = 0; a < buildings.length; a++) for (let b = a + 1; b < buildings.length; b++) {
    const left = buildings[a].anchor, right = buildings[b].anchor;
    assert.ok(Math.hypot(left.x - right.x, left.z - right.z) >= left.footprint + right.footprint + 12);
  }
  const glazing = buildings.map(() => ({ origin: undefined, faces: new Set() }));
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
  let paneCount = 0;
  for (const mesh of f.meshes.filter(object => object.isInstancedMesh && object.material.isMeshPhysicalMaterial)) {
    for (let index = 0; index < mesh.count; index++) {
      mesh.getMatrixAt(index, matrix); matrix.decompose(position, rotation, scale);
      if (scale.z > 0.2 || scale.y > 5) continue; // Whole curtain-wall blocks are not substituted for modeled panes.
      const building = buildings.findIndex(item => Math.hypot(item.anchor.x - position.x, item.anchor.z - position.z) < item.anchor.footprint);
      assert.ok(building >= 0);
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation), angle = Math.atan2(forward.x, forward.z);
      const coverage = glazing[building]; coverage.origin ??= angle;
      coverage.faces.add(((Math.round((angle - coverage.origin) / (Math.PI / 2)) % 4) + 4) % 4);
      paneCount++;
    }
  }
  assert.ok(paneCount >= buildings.length * 16);
  for (const coverage of glazing) assert.equal(coverage.faces.size, 4);
});

test('starlight allows upper transparent haze and stars but no low-altitude opaque clouds, terrain or supports', () => {
  const f = fixture('starlight'); f.result.group.updateMatrixWorld(true);
  assert.equal(f.result.group.userData.backdropAnchors.length, 0);
  for (const object of f.meshes) {
    assert.ok(!object.isInstancedMesh);
    assert.ok(object.isPoints || object.material.transparent, 'Night meshes must be translucent upper haze');
    assert.equal(object.material.depthWrite, false);
    const p = object.geometry.getAttribute('position'), vertex = new THREE.Vector3();
    for (let index = 0; index < p.count; index++) {
      vertex.fromBufferAttribute(p, index).applyMatrix4(object.matrixWorld);
      assert.ok(vertex.y > 18 + 35, 'All added night geometry is well above the highest road point');
    }
  }
  const source = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /ground\.visible = !starlightScenery && !cloudScenery/);
});

test('nature uses a few varied sculpted valley shapes and several species of alpha-tested cutout foliage', () => {
  for (const theme of ['jungle', 'river']) {
    const f = fixture(theme), stats = f.result.group.userData.backdropNatureStats;
    assert.ok(stats.landforms > 0 && stats.landforms <= 6);
    const landforms = f.meshes.filter(object => object.geometry.userData.backdropLandformVariant !== undefined);
    assert.equal(new Set(landforms.map(object => object.geometry.userData.backdropLandformVariant)).size, 4);
    assert.ok(stats.species.length >= 3);
    assert.ok(f.meshes.some(object => object.material.alphaTest >= 0.4 && object.material.map?.isTexture));
  }
});

test('sky and sea add no mountains and preserve a sparse cloud composition or one vessel', () => {
  for (const theme of ['starlight', 'cloud', 'pirate']) {
    const f = fixture(theme);
    assert.ok(f.meshes.every(object => object.geometry.userData.backdropLandformVariant === undefined));
    assert.ok(f.result.group.userData.backdropAnchors.every(anchor => !anchor.kind.includes('landform')));
    if (theme === 'cloud') assert.ok(f.result.instances <= 12);
    if (theme === 'pirate') assert.equal(f.result.group.userData.vesselCount, 1);
  }
});

test('two intentional cloud-edge overlaps leave central lanes open and still query neighboring road clearance', () => {
  const f = fixture('cloud'), overlaps = f.result.group.userData.cloudOverlapAnchors;
  assert.ok(overlaps.length > 0 && overlaps.length <= 2);
  for (const overlap of overlaps) {
    assert.ok(Math.abs(overlap.lane) - overlap.radius >= 8 && Math.abs(overlap.lane) - overlap.radius < 10);
    assert.ok(f.queries.clearance.some(query => query.valid && query.ignoreU === overlap.progress
      && query.ignoreRange <= 0.061 && query.margin >= 16 && Math.abs(query.x - overlap.x) < 1e-6));
  }
  assert.equal(fixture('cloud', { allowScenery: false }).result.group.userData.cloudOverlapAnchors.length, 0);
});

test('official road clouds retain destructible patches while octopus attacks remain third-lap-only', () => {
  const source = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /import \{ createCloudRoadPatchGeometry, createCloudRoadMaterial \} from "\.\/cloud-road-visual"/);
  assert.match(source, /createCloudRoadPatchGeometry\(THREE, course, \{ startU, endU, side, halfWidth: COURSE_WIDTH, origin \}\)/);
  assert.match(source, /patch\.add\(surface\)/);
  assert.match(source, /const octopusActive = pirateLapIndex >= 2/);
  assert.match(source, /tentacle\.group\.visible = octopusActive;\s+if \(!octopusActive\) return/);
  assert.match(source, /const breachAge = octopusActive && pirateBreachStartedAt >= 0 \? now - pirateBreachStartedAt : -1/);
  assert.match(source, /pirateBreachVisual\?\.update\(breachAge\)/);
  assert.equal((source.match(/pirateOctopus = new THREE\.Group\(\)/g) ?? []).length, 1);
  assert.match(source, /pirateOctopus\.add\(foreshadowArms\)/);
  assert.match(source, /if \(foreshadowArms\) foreshadowArms\.visible = pirateLapIndex === 0/);
  assert.match(source, /pirateOctopusApproach\(pirateLapIndex, wrap01\(playerState\.progress\)\)/);
});

test('actual courses receive their intended backgrounds and cloud bends keep their central strip open', () => {
  const source = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const courses = ast.statements.find(n => ts.isVariableStatement(n)
    && n.declarationList.declarations.some(d => d.name.getText(ast) === 'COURSES'));
  const helpers = ast.statements.filter(n => ['wrap01', 'progressDelta', 'createRaceCourse'].includes(n.name?.text)).map(n => n.getText(ast));
  const context = vm.createContext({ THREE });
  vm.runInContext(ts.transpileModule(`${courses.getText(ast)}\n${helpers.join('\n')}\nglobalThis.makeCourse = id => createRaceCourse(THREE, COURSES.find(c => c.id === id));`,
    { compilerOptions }).outputText, context);
  for (const theme of themes) {
    const course = context.makeCourse(theme);
    const result = createCourseBackdrop(THREE, new THREE.Scene(), course, theme, -0.52);
    assert.equal(result.instances > 0, true, `${theme} has only its intended background`);
    assert.ok(result.drawCalls <= 25 && result.triangles <= 180_000, theme);
    if (theme !== 'cloud') continue;
    const overlaps = result.group.userData.cloudOverlapAnchors;
    assert.ok(overlaps.length > 0 && overlaps.length <= 2, 'actual cloud road has a few intentional overlaps');
    for (const overlap of overlaps) {
      const pose = course.pointAt(overlap.progress, overlap.lane);
      const cos = Math.cos(pose.heading), sin = Math.sin(pose.heading);
      for (let sample = -5; sample <= 5; sample++) for (const lane of [-8, 0, 8]) {
        const road = course.pointAt(overlap.progress + sample * 3 / course.length, lane);
        const dx = road.x - overlap.x, dz = road.z - overlap.z;
        assert.ok(((dx * cos - dz * sin) / overlap.radius) ** 2 + ((dx * sin + dz * cos) / 12) ** 2 >= 0.999,
          'actual central road lies outside the conservative cloud envelope');
      }
    }
  }
});
