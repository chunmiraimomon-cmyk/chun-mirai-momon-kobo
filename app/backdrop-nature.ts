import type * as Three from "three";
import { markGeneratedSurface } from "./generated-material-textures";
import { createBackdropLandformGeometry, createBackdropLandformMaterial } from "./backdrop-landforms";

type NatureCourse = {
  length: number;
  pointAt: (u: number, lane?: number) => { x: number; y: number; z: number; heading: number };
  isClearFromRoad: (x: number, z: number, margin: number, ignoreU?: number, ignoreRange?: number) => boolean;
};
type Anchor = { x: number; z: number; footprint: number; baseY: number; kind: string };
type Batch = { geometry: Three.BufferGeometry; material: Three.MeshStandardMaterial; matrices: Three.Matrix4[]; colors: number[] };
type Terrain = { x: number; z: number; sx: number; sz: number; sy: number; yaw: number; geometry: Three.BufferGeometry };
type Point = { x: number; y: number; z: number };

const TAU = Math.PI * 2;
// Includes the 10 m road half-width plus an 8 m visual shoulder. The complete
// decorative footprint is checked, so foliage never covers the driving strip.
const SCENERY_CLEARANCE = 18;
const FOLIAGE_ATLAS_URL = "/textures/backdrop-v2/foliage.png";

function createFoliageMaterial(THREE: typeof Three, group: Three.Group) {
  const fallback = new THREE.DataTexture(new Uint8Array([124, 164, 91, 255]), 1, 1);
  fallback.colorSpace = THREE.SRGBColorSpace;
  fallback.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, map: fallback,
    alphaTest: 0.4, roughness: 0.89, metalness: 0, side: THREE.DoubleSide, transparent: false, depthWrite: true,
    emissive: 0x3b6327, emissiveIntensity: 0.18 });
  material.name = "nature-alpha-tested-imagegen-foliage";
  material.userData.natureFoliageAtlas = FOLIAGE_ATLAS_URL;
  let disposed = false, loadingStarted = false;
  let atlas: Three.Texture | undefined;
  let finishReady: () => void = () => {};
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  const disposedTextures = new WeakSet<Three.Texture>();
  const disposeTexture = (texture: Three.Texture | undefined) => {
    if (!texture || disposedTextures.has(texture)) return;
    disposedTextures.add(texture);
    texture.dispose();
  };
  const settle = () => {
    if (readyTimer !== undefined) clearTimeout(readyTimer);
    readyTimer = undefined;
    finishReady();
  };
  group.userData.backdropReady = Promise.resolve();
  material.addEventListener("dispose", () => {
    disposed = true;
    settle();
    disposeTexture(fallback);
    disposeTexture(atlas);
  });
  const startLoading = () => {
    if (disposed || loadingStarted || typeof document === "undefined") return;
    loadingStarted = true;
    group.userData.backdropReady = new Promise<void>(resolve => { finishReady = resolve; });
    // Missing artwork must not hold the loading screen indefinitely.
    readyTimer = setTimeout(settle, 8000);
    atlas = new THREE.TextureLoader().load(FOLIAGE_ATLAS_URL, texture => {
      if (disposed) { disposeTexture(texture); settle(); return; }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.anisotropy = 2;
      material.map = texture;
      disposeTexture(fallback);
      settle();
    }, undefined, () => {
      disposeTexture(atlas);
      atlas = undefined;
      settle();
    });
  };
  return { material, startLoading };
}

function makeStemGeometry(THREE: typeof Three, topRadius = 0.78, radialSegments = 8) {
  const geometry = new THREE.CylinderGeometry(topRadius, 1, 1, radialSegments, 1);
  geometry.translate(0, 0.5, 0);
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    const y = positions.getY(index);
    positions.setX(index, positions.getX(index) + Math.sin(y * Math.PI) * 0.026);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function makeButtressGeometry(THREE: typeof Three) {
  // A tapered board root: broad at the trunk, a thin toe at the terrain.
  const vertices = [-0.2, 0, -0.19, 1, 0, -0.07, 1, 0, 0.07, -0.2, 0, 0.19,
    -0.19, 1, -0.075, 0.18, 0.62, -0.13, 0.18, 0.62, 0.13, -0.19, 1, 0.075];
  const indices = [0, 4, 1, 1, 4, 5, 1, 5, 2, 2, 5, 6, 2, 6, 3, 3, 6, 7,
    3, 7, 0, 0, 7, 4, 4, 7, 5, 5, 7, 6, 0, 1, 3, 1, 2, 3];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0.3, 0.62, 0.3, 0.62, 0, 1], 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Leaves have cutout-shaped geometry as well as alpha-tested artwork. If the
 * atlas is delayed or unavailable, no rectangular card can become visible. */
function makeLeafGeometry(THREE: typeof Three, tile: number, shape: "broad" | "palm" | "fern" | "grass") {
  const segments = shape === "palm" || shape === "fern" ? 8 : shape === "broad" ? 2 : 5;
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const tileX = (tile % 2) * 0.5, tileY = tile < 2 ? 0.5 : 0;
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    let width = Math.pow(Math.sin(Math.PI * t), shape === "grass" ? 0.6 : 0.63) * 0.5;
    if (shape === "broad") width *= 0.85 + Math.sin(t * 23) * 0.13;
    if (shape === "palm" || shape === "fern") width *= index % 2 === 0 ? 0.86 : 1;
    if (shape === "grass") width *= 0.55;
    const curve = shape === "palm" ? -t * t * 0.23 : shape === "fern" ? -t * t * 0.16 : Math.sin(t * Math.PI) * 0.13;
    // A central fold gives each leaf/card a lit face and a shaded face.
    positions.push(-width, t, curve, 0, t, curve + Math.sin(t * Math.PI) * 0.065, width, t, curve);
    for (const x of [-width, 0, width]) uvs.push(tileX + 0.025 + (x + 0.5) * 0.45, tileY + 0.025 + t * 0.45);
    if (index < segments) {
      const a = index * 3;
      indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4,
        a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.name = `nature-${shape}-leaf-silhouette`;
  return geometry;
}

function makeLeafBundleGeometry(THREE: typeof Three) {
  const leaf = makeLeafGeometry(THREE, 0, "broad");
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  const dummy = new THREE.Object3D(), p = new THREE.Vector3(), n = new THREE.Vector3(), normalMatrix = new THREE.Matrix3();
  for (let card = 0; card < 8; card += 1) {
    const yaw = card % 4 / 4 * TAU + (card >= 4 ? 0.74 : 0.13);
    const upper = card >= 4;
    // Two interlocking, outward leaning layers. Their transparent artwork
    // overlaps into a single crown, not eight sparse tufts perched on twigs.
    dummy.position.set(Math.sin(yaw) * (upper ? 0.23 : 0.48), upper ? 0.22 : -0.1,
      Math.cos(yaw) * (upper ? 0.23 : 0.48));
    dummy.rotation.set(upper ? 0.88 : 1.18, yaw, (card % 2 === 0 ? 1 : -1) * 0.12);
    dummy.scale.set(upper ? 1.15 : 1.28, upper ? 1.07 : 1.16, 1);
    dummy.updateMatrix();
    normalMatrix.getNormalMatrix(dummy.matrix);
    const offset = positions.length / 3;
    for (let vertex = 0; vertex < leaf.getAttribute("position").count; vertex += 1) {
      p.fromBufferAttribute(leaf.getAttribute("position"), vertex).applyMatrix4(dummy.matrix);
      n.fromBufferAttribute(leaf.getAttribute("normal"), vertex).applyMatrix3(normalMatrix).normalize();
      positions.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
      uvs.push(leaf.getAttribute("uv").getX(vertex), leaf.getAttribute("uv").getY(vertex));
    }
    for (let index = 0; index < leaf.index!.count; index += 1) indices.push(offset + leaf.index!.getX(index));
  }
  leaf.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.name = "nature-branch-mounted-leaf-bundle";
  return geometry;
}

function makeRockShelfGeometry(THREE: typeof Three) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const widths = [1, 1, 0.88, 0.93, 0.65];
  const heights = [0, 0.22, 0.36, 0.73, 1];
  const count = 10;
  for (let ring = 0; ring < widths.length; ring += 1) {
    for (let vertex = 0; vertex <= count; vertex += 1) {
      const angle = vertex / count * TAU;
      const outline = 0.85 + Math.sin(angle * 3 + 0.7) * 0.06 + Math.sin(angle * 7 - 0.3) * 0.05;
      positions.push(Math.cos(angle) * widths[ring] * outline, heights[ring], Math.sin(angle) * widths[ring] * outline);
      uvs.push(vertex / count, heights[ring]);
      if (ring < widths.length - 1 && vertex < count) {
        const a = ring * (count + 1) + vertex;
        indices.push(a, a + count + 1, a + 1, a + 1, a + count + 1, a + count + 2);
      }
    }
  }
  const peak = positions.length / 3;
  positions.push(-0.09, 1.03, 0.07);
  uvs.push(0.5, 1);
  for (let vertex = 0; vertex < count; vertex += 1) indices.push(44 + vertex, peak, 45 + vertex);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.name = "nature-layered-rock-shelf";
  return geometry;
}

/** Detailed but static, instanced nature. No scene/road/physics fields change. */
export function createNatureBackdrop(THREE: typeof Three, course: NatureCourse, theme: "jungle" | "river", groundY: number): Three.Group {
  const group = new THREE.Group();
  group.name = `nature-backdrop-${theme}`;
  group.userData.visualOnly = true;
  const anchors: Anchor[] = [];
  group.userData.backdropAnchors = anchors;
  group.userData.sceneryClearance = SCENERY_CLEARANCE;
  let seed = theme === "river" ? 0x61a02b31 : 0x7341ed93;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let bits = Math.imul(seed ^ seed >>> 15, 1 | seed);
    bits ^= bits + Math.imul(bits ^ bits >>> 7, 61 | bits);
    return ((bits ^ bits >>> 14) >>> 0) / 4294967296;
  };
  const river = theme === "river";
  const poses = Array.from({ length: 96 }, (_, index) => course.pointAt(index / 96));
  const minX = Math.min(...poses.map(p => p.x)), maxX = Math.max(...poses.map(p => p.x));
  const minZ = Math.min(...poses.map(p => p.z)), maxZ = Math.max(...poses.map(p => p.z));
  const centerX = (minX + maxX) / 2, centerZ = (minZ + maxZ) / 2;
  const extentX = Math.max(42, (maxX - minX) / 2), extentZ = Math.max(42, (maxZ - minZ) / 2);
  const batches = new Map<string, Batch>();
  const terrains: Terrain[] = [];
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  const anchor = (x: number, z: number, footprint: number, baseY: number, kind: string) => {
    if (!course.isClearFromRoad(x, z, footprint + SCENERY_CLEARANCE)) return false;
    anchors.push({ x, z, footprint, baseY, kind });
    return true;
  };
  const surfaceMaterial = (color: number, surface: "bark" | "stone" | "earth" | "leaf") => {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.93, metalness: 0 });
    return markGeneratedSurface(material, surface, surface === "bark" ? "uv" : "local");
  };
  const wood = surfaceMaterial(river ? 0x807364 : 0x786249, "bark");
  const rootsMaterial = surfaceMaterial(river ? 0x726859 : 0x6b553b, "bark");
  const rockMaterial = surfaceMaterial(river ? 0x797b70 : 0x68705d, "stone");
  const vineMaterial = surfaceMaterial(0x61724d, "bark");
  const bambooMaterial = surfaceMaterial(river ? 0x879366 : 0x7e8758, "bark");
  const nodeMaterial = surfaceMaterial(0x686e46, "bark");
  const foliage = createFoliageMaterial(THREE, group);
  const leaves = foliage.material;
  const batch = (name: string, geometry: () => Three.BufferGeometry, material: Three.MeshStandardMaterial) => {
    if (!batches.has(name)) batches.set(name, { geometry: geometry(), material, matrices: [], colors: [] });
    return batches.get(name)!;
  };
  const trunk = batch("nature-connected-trunks", () => makeStemGeometry(THREE, 0.83, 9), wood);
  const branch = batch("nature-forked-branches", () => makeStemGeometry(THREE, 0.67, 7), wood);
  const roots = batch("nature-planted-board-roots", () => makeButtressGeometry(THREE), rootsMaterial);
  const vines = batch("nature-hanging-connected-vines", () => makeStemGeometry(THREE, 0.97, 5), vineMaterial);
  const palmStems = batch("nature-curved-palm-stems", () => makeStemGeometry(THREE, 0.93, 9), wood);
  const bambooStems = batch("nature-bamboo-jointed-stems", () => makeStemGeometry(THREE, 0.96, 7), bambooMaterial);
  const bambooNodes = batch("nature-bamboo-stem-collars", () => new THREE.CylinderGeometry(1, 1, 1, 7), nodeMaterial);
  const bundles = batch("nature-branched-leaf-bundles", () => makeLeafBundleGeometry(THREE), leaves);
  const palmLeaves = batch("nature-curved-palm-fronds", () => makeLeafGeometry(THREE, 1, "palm"), leaves);
  const fernLeaves = batch("nature-fern-fronds", () => makeLeafGeometry(THREE, 2, "fern"), leaves);
  const grassLeaves = batch("nature-reed-and-grass-blades", () => makeLeafGeometry(THREE, 3, "grass"), leaves);
  const rocks = batch("nature-layered-river-rocks", () => makeRockShelfGeometry(THREE), rockMaterial);
  const add = (target: Batch, x: number, y: number, z: number, sx: number, sy: number, sz: number,
    yaw = 0, pitch = 0, roll = 0, color = 0xffffff) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(pitch, yaw, roll);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    target.matrices.push(dummy.matrix.clone());
    target.colors.push(color);
  };
  const segment = (target: Batch, a: Point, b: Point, radius: number, color = 0xffffff) => {
    direction.set(b.x - a.x, b.y - a.y, b.z - a.z);
    const length = direction.length();
    if (length < 1e-4) return;
    dummy.position.set(a.x, a.y, a.z);
    dummy.quaternion.setFromUnitVectors(up, direction.multiplyScalar(1 / length));
    dummy.scale.set(radius, length, radius);
    dummy.updateMatrix();
    target.matrices.push(dummy.matrix.clone());
    target.colors.push(color);
  };
  const leafAt = (target: Batch, origin: Point, forward: Point, width: number, length: number, roll: number, color: number) => {
    direction.set(forward.x, forward.y, forward.z).normalize();
    dummy.position.set(origin.x, origin.y, origin.z);
    dummy.quaternion.setFromUnitVectors(up, direction);
    dummy.rotateY(roll);
    dummy.scale.set(width, length, target === bundles ? width : length);
    dummy.updateMatrix();
    target.matrices.push(dummy.matrix.clone());
    target.colors.push(color);
  };
  const localPosition = (x: number, z: number, dx: number, dz: number, yaw: number) => ({
    x: x + Math.cos(yaw) * dx + Math.sin(yaw) * dz,
    z: z - Math.sin(yaw) * dx + Math.cos(yaw) * dz,
  });
  const terrainTop = (terrain: Terrain, worldX: number, worldZ: number) => {
    const cos = Math.cos(terrain.yaw), sin = Math.sin(terrain.yaw);
    const dx = worldX - terrain.x, dz = worldZ - terrain.z;
    const x = (cos * dx - sin * dz) / terrain.sx;
    const z = (sin * dx + cos * dz) / terrain.sz;
    if (Math.hypot(x, z) > 1) return groundY;
    const p = terrain.geometry.getAttribute("position"), indices = terrain.geometry.index!;
    let top = 0;
    for (let triangle = 0; triangle < indices.count; triangle += 3) {
      const a = indices.getX(triangle), b = indices.getX(triangle + 1), c = indices.getX(triangle + 2);
      const ax = p.getX(a), az = p.getZ(a), bx = p.getX(b), bz = p.getZ(b), cx = p.getX(c), cz = p.getZ(c);
      const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(denominator) < 1e-9) continue;
      const wa = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / denominator;
      const wb = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / denominator;
      const wc = 1 - wa - wb;
      if (wa >= -1e-6 && wb >= -1e-6 && wc >= -1e-6) top = Math.max(top, wa * p.getY(a) + wb * p.getY(b) + wc * p.getY(c));
    }
    return groundY - 0.035 + terrain.sy * top;
  };
  const supportY = (x: number, z: number) => terrains.reduce((y, terrain) => Math.max(y, terrainTop(terrain, x, z)), groundY);

  // Six unequal, authored landforms form two banks of a valley. They replace
  // rings of same-sized conical mountains, rather than adding to those rings.
  const landMaterial = createBackdropLandformMaterial(THREE, true);
  for (let index = 0; index < 6; index += 1) {
    const shape = index % 4;
    const land = batch(`nature-valley-landform-${shape}`, () => createBackdropLandformGeometry(THREE, shape), landMaterial);
    const angle = (index / 6 * TAU) + (river ? 0.21 : -0.14);
    const sx = river ? 43 + index % 3 * 14 : 48 + index % 3 * 17;
    const sz = sx * [0.82, 0.95, 0.73][index % 3];
    let placed = false;
    for (let attempt = 0; attempt < 4 && !placed; attempt += 1) {
      const distance = 88 + attempt * 31;
      const x = centerX + Math.cos(angle) * (extentX + distance);
      const z = centerZ + Math.sin(angle) * (extentZ + distance);
      if (!anchor(x, z, Math.max(sx, sz), groundY, "valley-landform")) continue;
      const sy = river ? [7, 14, 9, 18, 6, 12][index] : [24, 37, 17, 42, 21, 31][index];
      add(land, x, groundY - 0.035, z, sx, sy, sz, -angle, 0, 0,
        river ? [0xc6c5b3, 0xbfc7ae, 0xb3bdac][index % 3] : [0xa7b29a, 0xbdc1a4, 0x9dab98][index % 3]);
      terrains.push({ x, z, sx, sz, sy, yaw: -angle, geometry: land.geometry });
      placed = true;
    }
  }

  const treeRoots = (x: number, z: number, baseY: number, scale: number, yaw: number, count: number) => {
    for (let root = 0; root < count; root += 1) {
      const angle = yaw + root / count * TAU;
      const spread = scale * (2.4 + root % 3 * 0.31);
      const toeX = x + Math.cos(angle) * spread, toeZ = z + Math.sin(angle) * spread;
      const toeY = supportY(toeX, toeZ) - 0.035;
      add(roots, x, toeY, z, spread, Math.max(0.6, baseY - toeY + scale * 1.6), scale * 1.35,
        -angle, 0, 0, [0xd2c2a6, 0xb8ad92][root % 2]);
    }
  };
  const hangingVine = (top: Point, phase: number, length: number) => {
    let last = top;
    const bottomY = Math.max(supportY(top.x, top.z) + 1, top.y - length);
    for (let knot = 1; knot <= 7; knot += 1) {
      const t = knot / 7;
      const next = { x: top.x + Math.sin(t * 6 + phase) * 0.2, y: top.y + (bottomY - top.y) * t,
        z: top.z + Math.sin(t * 4.7 - phase) * 0.19 };
      segment(vines, last, next, 0.085 - t * 0.026, 0xccd1ac);
      last = next;
    }
  };
  const canopyTree = (x: number, z: number, height: number, yaw: number, variant: "banyan" | "umbrella", index: number) => {
    const spread = height * (variant === "banyan" ? 0.29 : 0.35);
    const footprint = spread * 2.2 + height * 0.043 + 0.8;
    const baseY = supportY(x, z);
    if (!anchor(x, z, footprint, baseY, variant)) return false;
    const radius = variant === "banyan" ? 0.73 + height * 0.019 : 0.48 + height * 0.01;
    const rootPoint = { x, y: baseY - 0.04, z };
    const middle = { x: x + Math.cos(yaw) * height * 0.018, y: baseY + height * 0.33, z: z + Math.sin(yaw) * height * 0.018 };
    const fork = { x: x + Math.cos(yaw) * height * 0.043, y: baseY + height * 0.65, z: z + Math.sin(yaw) * height * 0.043 };
    segment(trunk, rootPoint, middle, radius, index % 2 === 0 ? 0xd7c9af : 0xc3b293);
    segment(trunk, middle, fork, radius * 0.83, 0xd0bea0);
    treeRoots(x, z, baseY, radius, yaw, variant === "banyan" ? 6 : 4);
    for (let limb = 0; limb < 5; limb += 1) {
      const angle = yaw + limb / 5 * TAU;
      const joint = { x: fork.x + Math.cos(angle) * spread * 0.45, y: baseY + height * 0.78,
        z: fork.z + Math.sin(angle) * spread * 0.45 };
      const tip = { x: fork.x + Math.cos(angle) * spread, y: baseY + height * (0.84 + limb % 3 * 0.04),
        z: fork.z + Math.sin(angle) * spread };
      segment(branch, fork, joint, radius * 0.54, 0xc3bda1);
      segment(branch, joint, tip, radius * 0.36, 0xc5bba0);
      for (let twig = 0; twig < 2; twig += 1) {
        const twigAngle = angle + (twig === 0 ? -0.36 : 0.4);
        const sprig = { x: tip.x + Math.cos(twigAngle) * spread * 0.24, y: tip.y + height * (twig === 0 ? 0.025 : 0.075),
          z: tip.z + Math.sin(twigAngle) * spread * 0.24 };
        segment(branch, tip, sprig, radius * 0.16, 0xbcb99a);
        add(bundles, sprig.x, sprig.y - height * 0.16, sprig.z, spread * 0.59, height * (variant === "banyan" ? 0.19 : 0.16),
          spread * 0.58, twigAngle, 0.05, (twig === 0 ? -1 : 1) * 0.07,
          [0xf1f2dd, 0xdbe7c8, 0xe7ebd2, 0xd6e2c2][(index + limb + twig) % 4]);
      }
      add(bundles, joint.x, joint.y - height * 0.1, joint.z, spread * 0.52, height * 0.17, spread * 0.51,
        angle + 0.3, 0.05, 0, 0xe2e9ce);
      if (variant === "banyan" && limb % 2 === 0) hangingVine(joint, index + limb, height * (0.3 + limb * 0.025));
    }
    // Top foliage grows from a visible final fork, not a detached floating ball.
    const top = { x: fork.x - Math.cos(yaw) * height * 0.035, y: baseY + height * 0.94, z: fork.z - Math.sin(yaw) * height * 0.035 };
    segment(branch, fork, top, radius * 0.33, 0xc3bda1);
    add(bundles, top.x, top.y - height * 0.15, top.z, spread * 0.67, height * 0.17, spread * 0.66,
      yaw + 0.7, 0.05, 0, 0xe9ecd5);
    return true;
  };
  const palmTree = (x: number, z: number, height: number, yaw: number, index: number) => {
    const baseY = supportY(x, z), frondLength = height * 0.36;
    const bend = height * 0.12;
    if (!anchor(x, z, frondLength * 1.3 + bend + 0.8, baseY, "curved-palm")) return false;
    let last = { x, y: baseY - 0.025, z };
    const radius = 0.42 + height * 0.006;
    for (let section = 1; section <= 7; section += 1) {
      const t = section / 7;
      const next = { x: x + Math.cos(yaw) * bend * t * t, y: baseY + height * t,
        z: z + Math.sin(yaw) * bend * t * t };
      segment(palmStems, last, next, radius * Math.pow(0.93, section - 1), 0xded0b1);
      last = next;
    }
    treeRoots(x, z, baseY, radius * 0.75, yaw, 4);
    for (let frond = 0; frond < 9; frond += 1) {
      const angle = yaw + frond / 9 * TAU;
      const rise = frond % 3 === 0 ? 0.36 : frond % 3 === 1 ? 0.12 : -0.1;
      leafAt(palmLeaves, last, { x: Math.cos(angle), y: rise, z: Math.sin(angle) }, frondLength * 0.63,
        frondLength * (0.82 + frond % 3 * 0.12), angle + 0.4,
        [0xdde4b7, 0xb5ce97, 0xc5dca7][(frond + index) % 3]);
    }
    leafAt(palmLeaves, { x: last.x, y: last.y - 0.1, z: last.z }, { x: 0.11, y: 1, z: -0.12 },
      frondLength * 0.2, frondLength * 0.43, yaw, 0xdfe2ba);
    return true;
  };
  const willowTree = (x: number, z: number, height: number, yaw: number, index: number) => {
    const spread = height * 0.33, baseY = supportY(x, z);
    if (!anchor(x, z, spread + 6, baseY, "river-willow")) return false;
    const radius = 0.45 + height * 0.01;
    const root = { x, y: baseY - 0.03, z };
    const joint = { x: x + Math.cos(yaw) * 0.68, y: baseY + height * 0.46, z: z + Math.sin(yaw) * 0.68 };
    const fork = { x: x + Math.cos(yaw) * 1.35, y: baseY + height * 0.72, z: z + Math.sin(yaw) * 1.35 };
    segment(trunk, root, joint, radius, 0xd7ccba);
    segment(trunk, joint, fork, radius * 0.83, 0xc5bfaa);
    treeRoots(x, z, baseY, radius, yaw, 4);
    for (let limb = 0; limb < 5; limb += 1) {
      const angle = yaw + limb / 5 * TAU;
      const shoulder = { x: fork.x + Math.cos(angle) * spread * 0.5, y: baseY + height * 0.86,
        z: fork.z + Math.sin(angle) * spread * 0.5 };
      const tip = { x: fork.x + Math.cos(angle) * spread, y: baseY + height * (0.78 + limb % 2 * 0.04),
        z: fork.z + Math.sin(angle) * spread };
      segment(branch, fork, shoulder, radius * 0.45, 0xc0bfa5);
      segment(branch, shoulder, tip, radius * 0.3, 0xbac0a2);
      add(bundles, shoulder.x, shoulder.y - height * 0.12, shoulder.z, spread * 0.58, height * 0.17,
        spread * 0.57, angle, 0.06, 0, 0xe2e9ce);
      for (let spray = 0; spray < 2; spray += 1) {
        const angle2 = angle + (spray === 0 ? -0.2 : 0.2);
        const start = { x: tip.x + Math.cos(angle2) * spread * 0.12, y: tip.y + (spray % 2) * 0.18,
          z: tip.z + Math.sin(angle2) * spread * 0.12 };
        segment(branch, tip, start, radius * 0.13, 0xbfc8a7);
        const end = { x: start.x + Math.cos(angle2) * 0.7, y: start.y - height * (0.28 + spray * 0.045),
          z: start.z + Math.sin(angle2) * 0.7 };
        segment(vines, start, end, 0.062, 0xc2cea5);
        leafAt(bundles, start, { x: Math.cos(angle2) * 0.17, y: -1, z: Math.sin(angle2) * 0.17 },
          1.42 + spray * 0.23, height * 0.29, angle2, [0xe9ecd5, 0xd9e5c6, 0xe2e9cf][(index + spray) % 3]);
      }
    }
    return true;
  };
  const bambooClump = (x: number, z: number, height: number, yaw: number, index: number) => {
    const baseY = supportY(x, z);
    if (!anchor(x, z, 3.6, baseY, "bamboo-grove")) return false;
    for (let stem = 0; stem < 4; stem += 1) {
      const angle = yaw + stem / 4 * TAU;
      const p = { x: x + Math.cos(angle) * 0.56, y: supportY(x + Math.cos(angle) * 0.56, z + Math.sin(angle) * 0.56) - 0.02,
        z: z + Math.sin(angle) * 0.56 };
      const h = height * (0.8 + stem * 0.073);
      const top = { x: p.x + Math.cos(angle) * 0.52, y: p.y + h, z: p.z + Math.sin(angle) * 0.52 };
      segment(bambooStems, p, top, 0.15 + stem * 0.016, 0xe0ddaf);
      for (let node = 1; node <= 5; node += 1) {
        const t = node / 6;
        const knot = { x: p.x + (top.x - p.x) * t, y: p.y + h * t, z: p.z + (top.z - p.z) * t };
        add(bambooNodes, knot.x, knot.y, knot.z, 0.19 + stem * 0.016, 0.075, 0.19 + stem * 0.016, yaw, 0, 0, 0xd0d3a6);
        if (node >= 3) {
          const branchAngle = angle + node * 1.71;
          const leafTip = { x: knot.x + Math.cos(branchAngle) * 1.1, y: knot.y + 0.65, z: knot.z + Math.sin(branchAngle) * 1.1 };
          segment(branch, knot, leafTip, 0.045, 0xcdd4ae);
          add(bundles, leafTip.x, leafTip.y, leafTip.z, 0.9, 1.08, 0.9, branchAngle, 0.3, 0,
            [0xd8dfae, 0xbdce9b][(index + node) % 2]);
        }
      }
    }
    return true;
  };

  // Near and middle stands have fewer but articulated silhouettes than the
  // old forest. Planting attempts are bounded and never change race RNG.
  const standCount = 64;
  for (let index = 0; index < standCount; index += 1) {
    const side = index % 2 === 0 ? 1 : -1;
    const distance = 47 + (index % 4) * 13 + random() * 11;
    const pose = course.pointAt((index / standCount + 0.004 * Math.sin(index * 2.4) + 1) % 1, side * distance);
    const yaw = pose.heading + random() * TAU;
    const species = river ? ["willow", "palm", "bamboo", "umbrella", "willow", "banyan"][index % 6]
      : ["banyan", "umbrella", "palm", "bamboo", "banyan", "umbrella"][index % 6];
    const height = river ? 12 + random() * 11 : 18 + random() * 13 + Math.min(10, pose.y * 0.18);
    if (species === "palm") palmTree(pose.x, pose.z, height * 0.82, yaw, index);
    else if (species === "willow") willowTree(pose.x, pose.z, height, yaw, index);
    else if (species === "bamboo") bambooClump(pose.x, pose.z, height * 0.61, yaw, index);
    else canopyTree(pose.x, pose.z, height, yaw, species === "banyan" ? "banyan" : "umbrella", index);
  }
  // A few specimens rise from each hill's exact rendered support surface.
  terrains.forEach((terrain, index) => {
    for (let tree = 0; tree < 2; tree += 1) {
      const p = localPosition(terrain.x, terrain.z, (tree === 0 ? -0.16 : 0.18) * terrain.sx, terrain.sz * 0.1, terrain.yaw);
      if (river && tree === 1) willowTree(p.x, p.z, 12 + index % 3 * 2, terrain.yaw, index + standCount);
      else canopyTree(p.x, p.z, (river ? 16 : 23) + index % 3 * 2, terrain.yaw + tree, tree === 0 ? "banyan" : "umbrella", index + standCount);
    }
  });

  const undergrowthCount = 84;
  for (let index = 0; index < undergrowthCount; index += 1) {
    const side = index % 2 === 0 ? 1 : -1;
    const pose = course.pointAt(index / undergrowthCount + 0.002, side * (river ? 34 + random() * 42 : 38 + random() * 48));
    const baseY = supportY(pose.x, pose.z);
    const size = 0.78 + random() * 0.77;
    if (!anchor(pose.x, pose.z, size * 3.2, baseY, river && index % 3 === 0 ? "river-reed-bed" : "forest-fern-bed")) continue;
    if (river && index % 3 === 0) {
      for (let reed = 0; reed < 6; reed += 1) {
        const angle = pose.heading + reed * 2.399963;
        const x = pose.x + Math.cos(angle) * size * 0.56, z = pose.z + Math.sin(angle) * size * 0.56;
        const y = supportY(x, z) - 0.025, h = size * (1.8 + reed % 3 * 0.43);
        segment(bambooStems, { x, y, z }, { x: x + Math.cos(angle) * 0.22, y: y + h, z: z + Math.sin(angle) * 0.22 }, 0.043, 0xd2cc9f);
        for (let blade = 0; blade < 3; blade += 1) {
          leafAt(grassLeaves, { x, y: y + h * (0.15 + blade * 0.21), z },
            { x: Math.cos(angle + blade) * 0.65, y: 0.5, z: Math.sin(angle + blade) * 0.65 },
            size * 0.63, h * 0.69, angle + blade * 0.91, 0xdbe0aa);
        }
      }
    } else {
      for (let frond = 0; frond < 7; frond += 1) {
        const angle = pose.heading + frond / 7 * TAU;
        leafAt(fernLeaves, { x: pose.x, y: baseY - 0.015, z: pose.z },
          { x: Math.cos(angle) * 0.76, y: 0.62 + frond % 2 * 0.21, z: Math.sin(angle) * 0.76 },
          size * 1.01, size * (1.6 + frond % 3 * 0.24), angle, [0xc4d6a5, 0xd3d9ac][frond % 2]);
      }
      for (let blade = 0; blade < 3; blade += 1) {
        const angle = pose.heading + blade * 2.4;
        leafAt(grassLeaves, { x: pose.x + Math.cos(angle) * 0.47, y: baseY - 0.015, z: pose.z + Math.sin(angle) * 0.47 },
          { x: Math.cos(angle) * 0.42, y: 1, z: Math.sin(angle) * 0.42 }, size * 0.74, size * 1.2, angle, 0xd8dfb9);
      }
    }
  }
  // Strata are modeled as irregular contiguous shelves, not round boulders.
  for (let index = 0; index < (river ? 42 : 25); index += 1) {
    const side = index % 2 === 0 ? 1 : -1;
    const pose = course.pointAt(index / (river ? 42 : 25) + 0.006, side * (39 + random() * 28));
    const sx = (river ? 3 : 2.3) + random() * 3.2, sz = sx * (0.59 + random() * 0.21), baseY = supportY(pose.x, pose.z);
    if (!anchor(pose.x, pose.z, sx + 0.5, baseY, "layered-bank-rock")) continue;
    add(rocks, pose.x, baseY - 0.06, pose.z, sx, (river ? 1.1 : 1.6) + random() * 1.8, sz,
      pose.heading + random(), 0, 0, [0xcbd0c0, 0xb6b8a5, 0xd3cbbb][index % 3]);
    if (index % 4 === 0) add(rocks, pose.x + sx * 0.12, baseY + 0.6, pose.z - sz * 0.13,
      sx * 0.63, 0.9, sz * 0.7, pose.heading - 0.25, 0, 0, 0xbabfaa);
  }

  // At most one atlas request, shared by every leaf species. Material disposal
  // also owns its textures; late loads cannot resurrect a disposed race scene.
  if ([bundles, palmLeaves, fernLeaves, grassLeaves].some(target => target.matrices.length > 0)) foliage.startLoading();

  const usedMaterials = new Set<Three.MeshStandardMaterial>();
  const unusedMaterials = new Set<Three.MeshStandardMaterial>();
  const color = new THREE.Color();
  let triangles = 0, instances = 0, vertices = 0;
  for (const [name, target] of batches) {
    if (target.matrices.length === 0) {
      target.geometry.dispose();
      unusedMaterials.add(target.material);
      continue;
    }
    const mesh = new THREE.InstancedMesh(target.geometry, target.material, target.matrices.length);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.visualOnly = true;
    target.matrices.forEach((matrix, index) => {
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, color.setHex(target.colors[index]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    group.add(mesh);
    usedMaterials.add(target.material);
    instances += mesh.count;
    vertices += mesh.count * target.geometry.getAttribute("position").count;
    triangles += mesh.count * (target.geometry.index?.count ?? target.geometry.getAttribute("position").count) / 3;
  }
  unusedMaterials.forEach(material => { if (!usedMaterials.has(material)) material.dispose(); });
  group.userData.backdropNatureStats = { theme, drawCalls: group.children.length, triangles, instances, vertices,
    landforms: terrains.length, species: [...new Set(anchors.filter(item => !item.kind.includes("rock") && !item.kind.includes("landform")).map(item => item.kind))] };
  return group;
}

/** Small authored urban planting groups. This deliberately does not invoke
 * the forest builder, nor place large hills or another ring of big trees. */
export function createCityPlantingBackdrop(THREE: typeof Three, course: NatureCourse, groundY: number): Three.Group {
  const group = new THREE.Group();
  group.name = "city-planted-pocket-gardens";
  group.userData.visualOnly = true;
  const anchors: Anchor[] = [];
  group.userData.backdropAnchors = anchors;
  group.userData.sceneryClearance = SCENERY_CLEARANCE;
  const foliage = createFoliageMaterial(THREE, group);
  const wood = markGeneratedSurface(new THREE.MeshStandardMaterial({ color: 0x8d7d68, roughness: 0.94 }), "bark", "uv");
  const stone = markGeneratedSurface(new THREE.MeshStandardMaterial({ color: 0x93998f, roughness: 0.93 }), "stone", "local");
  const earth = markGeneratedSurface(new THREE.MeshStandardMaterial({ color: 0x4d4437, roughness: 1 }), "earth", "local");
  const petalMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.84, side: THREE.DoubleSide });
  const flowerGeometry = new THREE.BufferGeometry();
  const petalPositions = [0, 0.08, 0], petalIndices: number[] = [];
  for (let vertex = 0; vertex < 10; vertex += 1) {
    const angle = vertex / 10 * TAU;
    const radius = vertex % 2 === 0 ? 0.5 : 0.17;
    petalPositions.push(Math.cos(angle) * radius, vertex % 2 === 0 ? 0.02 : 0.085, Math.sin(angle) * radius);
    petalIndices.push(0, 1 + (vertex + 1) % 10, 1 + vertex);
  }
  flowerGeometry.setAttribute("position", new THREE.Float32BufferAttribute(petalPositions, 3));
  flowerGeometry.setIndex(petalIndices);
  flowerGeometry.computeVertexNormals();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const batches: [string, Batch][] = [
    ["city-garden-connected-stems", { geometry: makeStemGeometry(THREE, 0.79, 7), material: wood, matrices: [], colors: [] }],
    ["city-garden-folded-leaf-clusters", { geometry: makeLeafBundleGeometry(THREE), material: foliage.material, matrices: [], colors: [] }],
    ["city-garden-stone-edged-beds", { geometry: box, material: stone, matrices: [], colors: [] }],
    ["city-garden-inset-soil", { geometry: box, material: earth, matrices: [], colors: [] }],
    ["city-garden-small-blossoms", { geometry: flowerGeometry, material: petalMaterial, matrices: [], colors: [] }],
  ];
  const [, stems] = batches[0], [, leaves] = batches[1], [, walls] = batches[2], [, soil] = batches[3], [, flowers] = batches[4];
  const dummy = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  const add = (batch: Batch, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0, color = 0xffffff) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    batch.matrices.push(dummy.matrix.clone());
    batch.colors.push(color);
  };
  const segment = (a: Point, b: Point, radius: number) => {
    direction.set(b.x - a.x, b.y - a.y, b.z - a.z);
    const length = direction.length();
    dummy.position.set(a.x, a.y, a.z);
    dummy.quaternion.setFromUnitVectors(up, direction.multiplyScalar(1 / length));
    dummy.scale.set(radius, length, radius);
    dummy.updateMatrix();
    stems.matrices.push(dummy.matrix.clone());
    stems.colors.push(0xe1d6be);
  };
  const rotated = (x: number, z: number, dx: number, dz: number, yaw: number) => ({
    x: x + Math.cos(yaw) * dx + Math.sin(yaw) * dz,
    z: z - Math.sin(yaw) * dx + Math.cos(yaw) * dz,
  });
  for (let garden = 0; garden < 10; garden += 1) {
    const side = garden % 2 === 0 ? 1 : -1;
    const progress = (garden / 10 + 0.026) % 1;
    let pose: ReturnType<NatureCourse["pointAt"]> | undefined;
    for (let attempt = 0; attempt < 4 && !pose; attempt += 1) {
      const candidate = course.pointAt(progress, side * (43 + (garden % 3) * 11 + attempt * 13));
      if (course.isClearFromRoad(candidate.x, candidate.z, 9.2 + SCENERY_CLEARANCE)) pose = candidate;
    }
    if (!pose) continue;
    anchors.push({ x: pose.x, z: pose.z, footprint: 9.2, baseY: groundY, kind: "city-pocket-garden" });
    const yaw = pose.heading;
    const height = 4.8 + (garden % 3) * 0.7;
    const base = { x: pose.x, y: groundY - 0.025, z: pose.z };
    const fork = { x: pose.x + Math.cos(yaw) * 0.24, y: groundY + height * 0.57,
      z: pose.z + Math.sin(yaw) * 0.24 };
    segment(base, fork, 0.21 + garden % 2 * 0.035);
    for (let root = 0; root < 3; root += 1) {
      const angle = yaw + root / 3 * TAU;
      segment({ x: base.x + Math.cos(angle) * 0.85, y: groundY - 0.045, z: base.z + Math.sin(angle) * 0.85 },
        { x: base.x, y: groundY + 0.36, z: base.z }, 0.083);
    }
    for (let limb = 0; limb < 5; limb += 1) {
      const angle = yaw + limb / 5 * TAU;
      const joint = { x: fork.x + Math.cos(angle) * 0.9, y: groundY + height * 0.73,
        z: fork.z + Math.sin(angle) * 0.9 };
      const tip = { x: fork.x + Math.cos(angle) * 1.76, y: groundY + height * (0.83 + limb % 2 * 0.04),
        z: fork.z + Math.sin(angle) * 1.76 };
      segment(fork, joint, 0.105);
      segment(joint, tip, 0.069);
      add(leaves, tip.x, tip.y - height * 0.15, tip.z, 1.86, 1.29, 1.79, angle,
        [0xe2eace, 0xf0f0dc, 0xd7e5c7][(garden + limb) % 3]);
    }
    const top = { x: fork.x, y: groundY + height * 0.91, z: fork.z };
    segment(fork, top, 0.095);
    add(leaves, top.x, top.y - height * 0.14, top.z, 1.92, 1.31, 1.86, yaw + 0.4, 0xe9edd5);
    const bed = rotated(pose.x, pose.z, 4.7, 0, yaw);
    add(soil, bed.x, groundY + 0.11, bed.z, 3.36, 0.21, 4.08, yaw);
    for (const edge of [-1, 1]) {
      const front = rotated(bed.x, bed.z, 0, edge * 2.12, yaw);
      add(walls, front.x, groundY + 0.24, front.z, 3.76, 0.46, 0.24, yaw);
      const flank = rotated(bed.x, bed.z, edge * 1.76, 0, yaw);
      add(walls, flank.x, groundY + 0.24, flank.z, 0.24, 0.46, 4.02, yaw);
    }
    for (let patch = 0; patch < 6; patch += 1) {
      const p = rotated(bed.x, bed.z, (patch % 2 === 0 ? -0.76 : 0.76), (Math.floor(patch / 2) - 1) * 1.19, yaw);
      add(leaves, p.x, groundY + 0.22, p.z, 0.68, 0.84 + (patch % 2) * 0.14, 0.67, yaw + patch * 2.4,
        [0xd7e2ba, 0xc2d5ad][patch % 2]);
      for (let flower = 0; flower < 2; flower += 1) {
        const angle = patch * 2.4 + flower * 3.1;
        add(flowers, p.x + Math.cos(angle) * 0.22, groundY + 0.91 + (patch % 2) * 0.15, p.z + Math.sin(angle) * 0.22,
          0.27, 0.27, 0.27, angle, [0xdeb3ab, 0xb4b4dc, 0xe4d49c][(garden + patch + flower) % 3]);
      }
    }
  }
  if (leaves.matrices.length > 0) foliage.startLoading();
  const color = new THREE.Color();
  const usedGeometries = new Set<Three.BufferGeometry>();
  let triangles = 0, vertices = 0, instances = 0;
  for (const [name, batch] of batches) {
    if (batch.matrices.length === 0) { batch.material.dispose(); continue; }
    const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.matrices.length);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.visualOnly = true;
    batch.matrices.forEach((matrix, index) => {
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, color.setHex(batch.colors[index]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    group.add(mesh);
    usedGeometries.add(batch.geometry);
    instances += mesh.count;
    vertices += mesh.count * batch.geometry.getAttribute("position").count;
    triangles += mesh.count * (batch.geometry.index?.count ?? batch.geometry.getAttribute("position").count) / 3;
  }
  new Set(batches.map(([, batch]) => batch.geometry)).forEach(geometry => { if (!usedGeometries.has(geometry)) geometry.dispose(); });
  group.userData.backdropNatureStats = { theme: "city", drawCalls: group.children.length, triangles, vertices, instances,
    landforms: 0, species: ["branched-city-tree", "planted-shrub-bed", "small-flower-bed"] };
  return group;
}
