import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';

const compilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS };
const transpile = source => ts.transpileModule(source, { compilerOptions }).outputText;
const isolatedMath = Object.create(Math);
isolatedMath.random = () => { throw new Error('Cloud visuals must not consume gameplay randomness'); };
const visualSource = readFileSync(new URL('../app/cloud-road-visual.ts', import.meta.url), 'utf8');
const visual = {};
vm.runInNewContext(transpile(visualSource), { exports: visual, Math: isolatedMath });
const { createCloudRoadPatchGeometry, createCloudRoadMaterial } = visual;
const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('page.tsx', page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = name => ast.statements.find(node => ts.isVariableStatement(node)
  && node.declarationList.declarations.some(item => item.name.getText(ast) === name));
const functions = names => ast.statements.filter(node => names.includes(node.name?.text)).map(node => node.getText(ast)).join('\n');
const actualContext = vm.createContext({ THREE });
vm.runInContext(transpile(`${declaration('COURSES').getText(ast)}
${functions(['wrap01', 'progressDelta', 'createRaceCourse'])}
globalThis.course = createRaceCourse(THREE, COURSES.find(course => course.id === 'cloud'));`), actualContext);
const actualCourse = actualContext.course;

function frozenCourse(course) {
  return Object.freeze({ length: course.length, pointAt: (u, lane) => Object.freeze(course.pointAt(u, lane)) });
}
function patchOptions(course, index, side) {
  const startU = index / 72, endU = (index + 1) / 72 + 0.00045;
  return Object.freeze({ startU, endU, side, halfWidth: 10,
    origin: Object.freeze(course.pointAt((startU + endU) * .5, side * 5)) });
}
function meshFor(course, index, side, material = createCloudRoadMaterial(THREE)) {
  const options = patchOptions(course, index, side);
  const mesh = new THREE.Mesh(createCloudRoadPatchGeometry(THREE, frozenCourse(course), options), material);
  mesh.position.copy(options.origin);
  mesh.updateMatrixWorld(true);
  return mesh;
}
const straightCourse = Object.freeze({ length: 1440,
  pointAt: (u, lane = 0) => Object.freeze({ x: lane, y: u * 1440 * .06, z: u * 1440 }) });

test('13 merged billows have a fixed geometry budget, finite normals and course-relative height bounds', () => {
  for (const index of [0, 17, 35, 71]) for (const side of [-1, 1]) {
    const mesh = meshFor(straightCourse, index, side), geometry = mesh.geometry;
    const positions = geometry.attributes.position, normals = geometry.attributes.normal, colors = geometry.attributes.color;
    assert.equal(geometry.userData.visualOnly, true);
    assert.equal(geometry.userData.cloudBillows, 13);
    assert.equal(positions.count, 3211);
    assert.equal(geometry.index.count / 3, 5148);
    assert.ok(geometry.userData.cloudCrownMax >= .85 && geometry.userData.cloudCrownMax <= 1.5);
    assert.equal(geometry.groups.length, 0, 'One material and one draw per half-tile, not one draw per puff');
    assert.equal(normals.count, positions.count);
    assert.equal(colors.count, positions.count);
    for (const attribute of [positions, normals, colors]) assert.ok(Array.from(attribute.array).every(Number.isFinite));
    const { startU, endU } = patchOptions(straightCourse, index, side);
    for (let vertex = 0; vertex < positions.count; vertex++) {
      const x = positions.getX(vertex) + mesh.position.x;
      const y = positions.getY(vertex) + mesh.position.y;
      const z = positions.getZ(vertex) + mesh.position.z;
      const height = y - z * .06;
      assert.ok(height >= -3.051 && height <= 1.501, 'Cloud thickness stays near the unchanged driving surface');
      assert.ok(x * side >= -.181 && x * side <= 11.501, 'Only tiny centre seam overlap, never a cloud bridge into the other lane');
      assert.ok(z >= startU * straightCourse.length - .151 && z <= endU * straightCourse.length + .151,
        'Cloud geometry cannot bridge a missing neighboring tile');
      assert.ok(Math.abs(Math.hypot(normals.getX(vertex), normals.getY(vertex), normals.getZ(vertex)) - 1) < 1e-6);
    }
    assert.ok(Number.isFinite(geometry.boundingSphere.radius));
    geometry.dispose(); mesh.material.dispose();
  }
});

test('cloud crowns densely cover both sides and seams on the actual curved, elevated course', () => {
  const material = createCloudRoadMaterial(THREE);
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  let samples = 0, coverage = 0;
  const heights = [];
  for (const index of [0, 7, 18, 29, 40, 51, 62, 71]) {
    const meshes = [-1, 1].map(side => meshFor(actualCourse, index, side, material));
    const { startU, endU } = patchOptions(actualCourse, index, 1);
    for (const fraction of [.08, .28, .5, .72, .92]) for (const lane of [-9, -7, -5, -3, -1, 0, 1, 3, 5, 7, 9]) {
      const point = actualCourse.pointAt(startU + (endU - startU) * fraction, lane);
      ray.set(new THREE.Vector3(point.x, point.y + 10, point.z), down);
      const hits = ray.intersectObjects(meshes, false);
      samples++;
      if (!hits.length) continue;
      coverage++;
      const height = hits[0].point.y - point.y;
      heights.push(height);
      assert.ok(height >= -1.6 && height <= 1.55, 'Visible surface follows course elevation; it is not a floating cloud roof');
    }
    meshes.forEach(mesh => mesh.geometry.dispose());
  }
  assert.equal(coverage, samples, 'Every sampled driving lane must be cloud-covered, including the centre seam');
  assert.ok(Math.max(...heights) - Math.min(...heights) > .5, 'Cloud road is visibly billowed, not a flat white strip');
  material.dispose();
});

test('rounded centre crowns leave no holes between rows or at consecutive tile seams', () => {
  const material = createCloudRoadMaterial(THREE);
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  // Include the formerly uncovered tiles as well as evenly distributed bends,
  // elevations and the wraparound join between the last and first tiles.
  const indices = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 51, 56, 60, 66, 71];
  const tiles = new Map();
  const tileMeshes = index => {
    const wrapped = (index + 72) % 72;
    if (!tiles.has(wrapped)) tiles.set(wrapped, [-1, 1].map(side => meshFor(actualCourse, wrapped, side, material)));
    return tiles.get(wrapped);
  };
  let samples = 0;
  try {
    for (const index of indices) {
      const current = tileMeshes(index);
      const { startU, endU } = patchOptions(actualCourse, index, 1);
      for (let step = 0; step <= 24; step++) {
        const fraction = step / 24;
        // Adjacent tiles may cover a boundary, but must not conceal a hole in
        // the current tile's interior. Both half-tiles are independently owned.
        const meshes = step === 0 ? [...tileMeshes(index - 1), ...current]
          : step === 24 ? [...current, ...tileMeshes(index + 1)] : current;
        for (const lane of [-1, -.5, 0, .5, 1]) {
          const point = actualCourse.pointAt(startU + (endU - startU) * fraction, lane);
          ray.set(new THREE.Vector3(point.x, point.y + 10, point.z), down);
          const hits = ray.intersectObjects(meshes, false);
          const location = `tile ${index}, fraction ${fraction}, lane ${lane}`;
          assert.ok(hits.length > 0, `Centre strip must remain cloud-covered at ${location}`);
          const height = hits[0].point.y - point.y;
          assert.ok(height >= -1.6 && height <= 1.55,
            `Centre strip must follow the driving surface at ${location}: height ${height}`);
          samples++;
        }
      }
    }
    assert.equal(samples, 2250, 'Exercise dense centre strips and both endpoints of all 18 selected tiles');
  } finally {
    for (const meshes of tiles.values()) meshes.forEach(mesh => mesh.geometry.dispose());
    material.dispose();
  }
});

test('cloud generation is deterministic, initialization-only and leaves physics inputs unchanged', () => {
  const course = frozenCourse(actualCourse), options = patchOptions(course, 30, -1);
  const before = JSON.stringify(options);
  const first = createCloudRoadPatchGeometry(THREE, course, options);
  const second = createCloudRoadPatchGeometry(THREE, course, options);
  for (const name of ['position', 'normal', 'color']) assert.deepEqual(first.attributes[name].array, second.attributes[name].array);
  assert.deepEqual(first.index.array, second.index.array);
  assert.equal(JSON.stringify(options), before);
  assert.doesNotMatch(visualSource, /Math\.random|requestAnimationFrame|setInterval|TextureLoader|Raycaster|nearestSurface|sampledPointAtInto/);
  first.dispose(); second.dispose();
});

test('actual scene construction keeps 72 x 2 independently breakable meshes and no permanent cloud slab', () => {
  let branch;
  function visit(node) {
    if (ts.isIfStatement(node) && node.expression.getText(ast) === 'cloud'
      && node.thenStatement.getText(ast).includes('const cloudPatches')) branch = node.thenStatement;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(branch, 'Cloud-only scene branch exists');
  const scene = new THREE.Scene();
  const context = vm.createContext({ THREE, scene, course: frozenCourse(straightCourse), Math: isolatedMath, ...visual });
  vm.runInContext(transpile(`const COURSE_WIDTH = 10;
let cloudPuffMaterial; const cloudSurfaceMaterials = [];
${functions(['makeCourseSegmentGeometry'])}
${branch.getText(ast)}
globalThis.materials = cloudSurfaceMaterials;`), context);
  const patches = scene.userData.cloudPatches;
  assert.equal(patches.length, 144);
  assert.equal(context.materials.length, 144);
  assert.equal(new Set(patches.map(patch => `${patch.userData.index}:${patch.userData.side}`)).size, 144);
  let triangles = 0;
  for (const patch of patches) {
    assert.equal(patch.parent, scene);
    const visibleMeshes = [];
    patch.traverseVisible(object => { if (object.isMesh) visibleMeshes.push(object); });
    assert.equal(visibleMeshes.length, 1, 'No flat strip and no separate unowned puffs remain');
    const [surface] = visibleMeshes;
    assert.equal(surface.parent, patch);
    assert.equal(surface.geometry.userData.visualOnly, true);
    assert.equal(surface.material, patch.userData.surfaceMaterial, 'Existing warning/fade logic controls the complete cloud road');
    assert.equal(surface.material.userData.generatedSurface, undefined, 'No stone/snow atlas applied to cloud volumes');
    triangles += surface.geometry.index.count / 3;
    patch.visible = false;
    let visible = 0;
    patch.traverseVisible(() => visible++);
    assert.equal(visible, 0, 'A hidden tile leaves no visible cloud mesh behind');
    patch.visible = true;
    surface.material.opacity = 0;
    assert.equal(surface.material.opacity, 0, 'The complete cloud surface fades with its owner');
    assert.equal(patch.userData.warningSurface.visible, false);
    assert.equal(patch.userData.warningBeam.visible, false);
  }
  assert.equal(triangles, 741312, 'Dense clouds stay within the fixed full-course triangle budget');
  scene.traverse(object => {
    if (!object.isMesh) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
  });
  assert.match(page, /patch\.scale\.setScalar\(Math\.max\(0\.035, scale\)\)/);
  assert.match(page, /material\.opacity = clamp\(opacity, 0, 1\)/);
  assert.match(page, /const tileCount = Math\.max\(1, cloudPatches\.length \/ 2\)/);
  assert.match(page, /if \(vanish > 0\.72\) cloudGapKeys\.add\(key\)/);
  assert.match(page, /if \(returnAmount < 0\.28\) cloudGapKeys\.add\(key\)/);
});

test('cloud material supports existing fade/weather controls without textures, lights or per-frame updates', () => {
  const material = createCloudRoadMaterial(THREE);
  assert.ok(material.isMeshStandardMaterial);
  assert.equal(material.vertexColors, true);
  assert.equal(material.map, null);
  assert.equal(material.roughness, 1);
  assert.equal(material.transparent, true);
  assert.equal(material.opacity, .98);
  assert.equal(material.side, THREE.FrontSide);
  assert.equal(material.userData.visualOnly, true);
  const shader = { fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader, null);
  assert.match(shader.fragmentShader, /cloudRim/);
  assert.match(shader.fragmentShader, /#include <opaque_fragment>/);
  material.color.setHex(0x748c9e);
  material.emissiveIntensity = .6;
  material.opacity = .1;
  assert.equal(material.color.getHex(), 0x748c9e);
  assert.equal(material.emissiveIntensity, .6);
  assert.equal(material.opacity, .1);
  material.dispose();
});
