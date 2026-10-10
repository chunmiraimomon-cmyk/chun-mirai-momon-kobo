import type * as Three from "three";
import { markGeneratedSurface } from "./generated-material-textures";

type HorizonCourse = {
  pointAt: (u: number, lane?: number) => { x: number; y: number; z: number; heading: number };
  isClearFromRoad: (x: number, z: number, clearance: number) => boolean;
};
type ShipPlacement = { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry?: number; rz?: number };

const TAU = Math.PI * 2;
const SHIP_FOOTPRINT = 70;
const ROAD_CLEARANCE = 24;

// Consume temporary geometries into one static mesh without importing a second
// geometry package or keeping an extra material/geometry per rigging strand.
function mergeStaticGeometry(THREE: typeof Three, parts: Three.BufferGeometry[]) {
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (const part of parts) {
    const offset = positions.length / 3;
    const p = part.getAttribute("position"), n = part.getAttribute("normal"), uv = part.getAttribute("uv");
    for (let i = 0; i < p.count; i += 1) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n?.getX(i) ?? 0, n?.getY(i) ?? 1, n?.getZ(i) ?? 0);
      uvs.push(uv?.getX(i) ?? 0, uv?.getY(i) ?? 0);
    }
    if (part.index) for (const index of part.index.array) indices.push(index + offset);
    else for (let i = 0; i < p.count; i += 1) indices.push(i + offset);
    part.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

const hullStations = [
  [-49, 11.4, 1.1], [-41, 14.0, 0.2], [-25, 16.1, 0], [0, 16.5, 0],
  [25, 14.8, 0], [42, 8.5, 1.2], [53, 0.65, 2.6],
] as const;

function smoothHullStations(THREE: typeof Three) {
  const curve = new THREE.CatmullRomCurve3(hullStations.map(([z, width, lift]) => new THREE.Vector3(width, lift, z)), false, "centripetal");
  return Array.from({ length: 49 }, (_, index) => {
    const p = curve.getPoint(index / 48);
    return [p.z, Math.max(0.65, p.x), p.y] as const;
  });
}

function makeHorizonHull(THREE: typeof Three) {
  const stations = smoothHullStations(THREE);
  const crossSection = Array.from({ length: 25 }, (_, index) => {
    const angle = -Math.PI / 2 + index / 24 * Math.PI;
    return [Math.sin(angle), 8 - Math.pow(Math.max(0, Math.cos(angle)), 1.2) * 14.2];
  });
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (const [z, width, lift] of stations) {
    for (const [x, y] of crossSection) {
      positions.push(x * width, y + lift, z);
      uvs.push((z + 49) / 102 * 3, (y + 6.2) / 14.2);
    }
  }
  for (let station = 0; station < stations.length - 1; station += 1) {
    for (let section = 0; section < crossSection.length - 1; section += 1) {
      const a = station * crossSection.length + section, b = a + crossSection.length;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  for (let i = 1; i < crossSection.length - 1; i += 1) {
    indices.push(0, i + 1, i);
    const bow = (stations.length - 1) * crossSection.length;
    indices.push(bow, bow + i, bow + i + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeHorizonDeck(THREE: typeof Three) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const stations = smoothHullStations(THREE);
  stations.forEach(([z, width, lift], station) => {
    for (const side of [-1, 1]) {
      positions.push(side * width * 0.96, 8.18 + lift, z);
      uvs.push((side + 1) / 2, (z + 49) / 102 * 4);
    }
    if (station < stations.length - 1) {
      const a = station * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeBillowedSail(THREE: typeof Three) {
  const columns = 14, rows = 10;
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns, x = (u - 0.5) * (0.82 + v * 0.18);
      const y = v - 0.5 + Math.sin(u * Math.PI) * (1 - v) * 0.09;
      // Broad belly, slight stitched-panel folds, and a drooping foot. The
      // subtle deformation catches light without crumpled/noisy cloth.
      const belly = Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.24
        + Math.sin(u * Math.PI * 7) * Math.sin(v * Math.PI) * 0.006;
      positions.push(x, y, belly);
      uvs.push(u, v);
      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column;
        indices.push(a, a + 1, a + columns + 1, a + 1, a + columns + 2, a + columns + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makePirateBanner(THREE: typeof Three) {
  const geometry = new THREE.PlaneGeometry(1, 1, 20, 6);
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index++) {
    const u = positions.getX(index) + 0.5, v = positions.getY(index) + 0.5;
    const freeEdge = Math.pow(u, 5);
    positions.setXYZ(index, u - freeEdge * (0.03 + Math.sin(v * 17) * 0.025),
      (v - 0.5) * (1 - u * 0.22) + Math.sin(u * 8) * u * 0.025,
      Math.sin(u * 4.5) * Math.sin(v * Math.PI) * 0.18);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function makeFoamWake(THREE: typeof Three) {
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = [];
  const rows = 32, columns = 4;
  for (const side of [-1, 1]) {
    const start = positions.length / 3;
    for (let row = 0; row <= rows; row++) {
      const u = row / rows;
      for (let column = 0; column <= columns; column++) {
        const v = column / columns;
        const width = 1.6 + u * 3.8;
        positions.push(side * (11 + u * 16 + Math.sin(u * TAU * 1.8) * 1.3) + (v - 0.5) * width,
          -0.12 + Math.sin(u * TAU * 3) * 0.014, -48 - u * 62);
        const fade = Math.sin(v * Math.PI) * Math.sin(u * Math.PI) * (0.46 - u * 0.21);
        colors.push(0.77, 0.86, 0.85, fade);
        uvs.push(u, v);
        if (row < rows && column < columns) {
          const a = start + row * (columns + 1) + column;
          indices.push(a, a + columns + 1, a + 1, a + 1, a + columns + 1, a + columns + 2);
        }
      }
    }
  }
  // Thin waterline contact, with zero-alpha borders rather than a white card.
  // It makes the submerged keel read as a vessel actually sitting in the sea.
  const waterStations = smoothHullStations(THREE);
  for (const side of [-1, 1]) {
    const start = positions.length / 3;
    waterStations.forEach(([z, beam], station) => {
      const u = station / (waterStations.length - 1);
      for (let cross = 0; cross < 3; cross++) {
        positions.push(side * (beam * 0.785 + 0.16) + (cross - 1) * 0.68, -0.11, z);
        colors.push(0.78, 0.87, 0.87, cross === 1 ? Math.sin(u * Math.PI) * 0.19 : 0);
        uvs.push(u, cross / 2);
        if (station < waterStations.length - 1 && cross < 2) {
          const a = start + station * 3 + cross;
          indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
        }
      }
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** One distant, render-only pirate vessel; no collision surface or gameplay state. */
export function createPirateHorizonShip(THREE: typeof Three, scene: Three.Scene, course: HorizonCourse, groundY: number) {
  const group = new THREE.Group();
  group.name = "pirate-horizon-vessel";
  group.userData.visualOnly = true;
  const center = new THREE.Vector3();
  const sampled = Array.from({ length: 32 }, (_, i) => course.pointAt(i / 32));
  for (const pose of sampled) center.add(new THREE.Vector3(pose.x, pose.y, pose.z));
  center.multiplyScalar(1 / sampled.length);
  let anchor: { x: number; z: number; heading: number } | undefined;
  for (const [u, lane] of [[0.12, 230], [0.18, 245], [0.84, 235], [0.05, 265], [0.52, 255]]) {
    const pose = course.pointAt(u, lane);
    // Keep the distant hull outside the existing giant playable ship as well as
    // outside every road strip. Its rigging footprint is included in clearance.
    if (Math.abs(pose.x) < 196 && pose.z > -274 && pose.z < 374) continue;
    if (!course.isClearFromRoad(pose.x, pose.z, SHIP_FOOTPRINT + ROAD_CLEARANCE)) continue;
    if (sampled.some(sample => Math.hypot(sample.x - pose.x, sample.z - pose.z) > 565)) continue;
    anchor = pose;
    break;
  }
  if (!anchor) {
    group.userData.vesselCount = 0;
    group.userData.pirateHorizonStats = { drawCalls: 0, instances: 0, triangles: 0, vertices: 0 };
    scene.add(group);
    return group;
  }
  group.position.set(anchor.x, groundY + 0.3, anchor.z);
  group.userData.vesselCount = 1;
  // Broadside presentation makes the hull and several sails readable from the
  // racing ship instead of reducing them to an edge-on mast silhouette.
  group.rotation.y = Math.atan2(center.x - anchor.x, center.z - anchor.z) + Math.PI / 2;
  group.userData.backdropAnchor = { x: anchor.x, z: anchor.z, footprint: SHIP_FOOTPRINT, baseY: groundY, kind: "horizon-ship" };

  const wood = markGeneratedSurface(new THREE.MeshStandardMaterial({ color: 0x593426, roughness: 0.84 }), "wood", "uv");
  const deck = markGeneratedSurface(new THREE.MeshStandardMaterial({ color: 0x8f6946, roughness: 0.91 }), "wood", "uv");
  const trim = markGeneratedSurface(new THREE.MeshStandardMaterial({ color: 0xb29766, roughness: 0.55, metalness: 0.16 }), "metal");
  const iron = markGeneratedSurface(new THREE.MeshStandardMaterial({ color: 0x17252e, roughness: 0.58, metalness: 0.22 }), "iron");
  const canvas = markGeneratedSurface(new THREE.MeshStandardMaterial({ color: 0xcbbd9e, roughness: 0.85, side: THREE.DoubleSide }), "canvas", "uv");
  const rope = markGeneratedSurface(new THREE.MeshStandardMaterial({ color: 0x8d7556, roughness: 0.99 }), "rope", "uv");
  const flagMaterial = markGeneratedSurface(new THREE.MeshStandardMaterial({ color: 0x243343, roughness: 0.92, side: THREE.DoubleSide }), "canvas", "uv");
  const badge = new THREE.MeshStandardMaterial({ color: 0xc6c4aa, roughness: 0.91, side: THREE.DoubleSide });
  const addMesh = (name: string, geometry: Three.BufferGeometry, material: Three.Material) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.visualOnly = true;
    group.add(mesh);
    return mesh;
  };
  const addInstances = (name: string, geometry: Three.BufferGeometry, material: Three.Material, placements: ShipPlacement[]) => {
    const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.visualOnly = true;
    const dummy = new THREE.Object3D();
    placements.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.ry ?? 0, p.rz ?? 0);
      dummy.scale.set(p.sx, p.sy, p.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  };
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const cylinderGeometry = new THREE.CylinderGeometry(0.7, 0.9, 1, 10);
  addMesh("horizon-curved-hull", makeHorizonHull(THREE), wood);
  addMesh("horizon-contoured-deck", makeHorizonDeck(THREE), deck);
  addInstances("horizon-stern-cabins", boxGeometry, wood, [
    { x: 0, y: 11.3, z: -36, sx: 21, sy: 5.8, sz: 19 },
    { x: 0, y: 16.0, z: -37, sx: 16, sy: 3.6, sz: 13 },
    { x: 0, y: 9.8, z: 35, sx: 15, sy: 3.0, sz: 13 },
  ]);
  addInstances("horizon-cabin-cornices", boxGeometry, trim, [
    { x: 0, y: 14.5, z: -36, sx: 22, sy: 0.65, sz: 20 },
    { x: 0, y: 18.1, z: -37, sx: 17, sy: 0.7, sz: 14 },
    { x: 0, y: 11.4, z: 35, sx: 16, sy: 0.6, sz: 14 },
  ]);
  const portholes: ShipPlacement[] = [];
  const cannonBarrels: ShipPlacement[] = [];
  const gunportFrames: ShipPlacement[] = [];
  const stations = smoothHullStations(THREE);
  const beamAt = (z: number) => {
    let station = 0;
    while (station < stations.length - 2 && stations[station + 1][0] < z) station++;
    const a = stations[station], b = stations[station + 1];
    const t = Math.max(0, Math.min(1, (z - a[0]) / Math.max(0.001, b[0] - a[0])));
    return a[1] + (b[1] - a[1]) * t;
  };
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i += 1) {
      const z = -30 + i * 9;
      const x = side * (beamAt(z) * 0.943 + 0.18);
      portholes.push({ x, y: 4.2, z, sx: 0.22, sy: 2.3, sz: 2.4 });
      cannonBarrels.push({ x: x + side * 1.1, y: 4.12, z, sx: 0.48, sy: 3.2, sz: 0.48, rz: side * Math.PI / 2 });
      for (const edge of [-1, 1]) {
        gunportFrames.push({ x: x + side * 0.14, y: 4.2 + edge * 1.24, z, sx: 0.28, sy: 0.18, sz: 2.72 });
        gunportFrames.push({ x: x + side * 0.14, y: 4.2, z: z + edge * 1.30, sx: 0.28, sy: 2.58, sz: 0.18 });
      }
    }
    for (let i = 0; i < 3; i += 1) portholes.push({ x: side * 10.58, y: 11.5, z: -42 + i * 6, sx: 0.22, sy: 2.1, sz: 2.0 });
  }
  addInstances("horizon-gunports-and-windows", boxGeometry, iron, portholes);
  addInstances("horizon-brass-gunport-surrounds", boxGeometry, trim, gunportFrames);
  addInstances("horizon-broadside-cannon-barrels", cylinderGeometry, iron, cannonBarrels);
  const spars: ShipPlacement[] = [];
  const sailPlacements: ShipPlacement[] = [];
  const rigging: Three.BufferGeometry[] = [];
  const sailYaw = -0.48;
  for (const [z, height, width] of [[-25, 46, 25], [3, 55, 31], [29, 39, 22]]) {
    spars.push({ x: 0, y: 8.4 + height / 2, z, sx: 1.15, sy: height, sz: 1.15 });
    for (const [y, sailWidth, sailHeight] of [[height + 3, width * 0.78, 12], [height - 13, width, 16]]) {
      spars.push({ x: 0, y: y + sailHeight / 2, z: z - 0.3, sx: 0.62, sy: sailWidth + 2, sz: 0.62, ry: sailYaw, rz: Math.PI / 2 });
      sailPlacements.push({ x: 0, y, z: z + 0.4, sx: sailWidth, sy: sailHeight, sz: 11, ry: sailYaw });
      for (const side of [-1, 1]) {
        const sailEdgeX = side * sailWidth * 0.48 * Math.cos(sailYaw);
        const sailEdgeZ = z - side * sailWidth * 0.48 * Math.sin(sailYaw);
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(sailEdgeX, y + sailHeight / 2, sailEdgeZ - 0.3),
          new THREE.Vector3(sailEdgeX, y - sailHeight * 0.22, sailEdgeZ + 1),
          new THREE.Vector3(side * 12.3, 9.7, z + 6),
        ]);
        rigging.push(new THREE.TubeGeometry(curve, 12, 0.095, 4, false));
      }
    }
    for (const side of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, height + 7.5, z),
        new THREE.Vector3(side * 6, height * 0.51, z - 5),
        new THREE.Vector3(side * 14, 10, z - 11),
      ]);
      rigging.push(new THREE.TubeGeometry(curve, 12, 0.12, 4, false));
    }
  }
  // Bowsprit is separate from vertical spars so its actual direction is clear.
  const bowsprit = addMesh("horizon-bowsprit", cylinderGeometry, wood);
  bowsprit.position.set(0, 13.7, 56.8);
  bowsprit.rotation.x = Math.PI * 0.36;
  bowsprit.scale.set(0.8, 18, 0.8);
  spars.push({ x: 0, y: 65.2, z: 3, sx: 0.42, sy: 5.8, sz: 0.42 });
  addInstances("horizon-masts-and-yards", cylinderGeometry, wood, spars);
  addInstances("horizon-six-billowed-sails", makeBillowedSail(THREE), canvas, sailPlacements);
  const railPaths = [-1, 1].map(side => new THREE.CatmullRomCurve3(hullStations.map(([z, width, lift]) => new THREE.Vector3(side * width, 10.1 + lift, z))));
  addMesh("horizon-sheer-rails", mergeStaticGeometry(THREE, railPaths.map(curve => new THREE.TubeGeometry(curve, 32, 0.25, 6, false))), trim);
  addMesh("horizon-standing-rigging", mergeStaticGeometry(THREE, rigging), rope);
  const wales: Three.BufferGeometry[] = [];
  for (const side of [-1, 1]) for (const [y, beamFraction] of [[2.1, 0.85], [5.7, 0.98], [8.1, 1.002]]) {
    const path = new THREE.CatmullRomCurve3(stations.map(([z, width, lift]) => new THREE.Vector3(side * width * beamFraction, y + lift, z)));
    wales.push(new THREE.TubeGeometry(path, 48, y > 8 ? 0.18 : 0.13, 5, false));
  }
  addMesh("horizon-continuous-hull-wales", mergeStaticGeometry(THREE, wales), trim);
  const foamMaterial = new THREE.MeshBasicMaterial({ color: 0xcadbd8, vertexColors: true, transparent: true,
    opacity: 0.72, depthWrite: false, side: THREE.DoubleSide });
  const wake = addMesh("horizon-soft-waterline-and-wake", makeFoamWake(THREE), foamMaterial);
  wake.renderOrder = 1;
  const posts: ShipPlacement[] = [];
  stations.slice(0, -1).filter((_, index) => index % 3 === 0).forEach(([z, width, lift]) => {
    for (const side of [-1, 1]) posts.push({ x: side * width, y: 9.1 + lift, z, sx: 0.3, sy: 2.1, sz: 0.3 });
  });
  addInstances("horizon-bulwark-stanchions", boxGeometry, trim, posts);
  const flag = addMesh("horizon-tattered-pirate-banner", makePirateBanner(THREE), flagMaterial);
  flag.position.set(0, 66.1, 3);
  flag.scale.set(12.7, 5.4, 8);
  flag.rotation.y = -Math.PI / 2;
  const crest = addMesh("horizon-banner-compass-crest", new THREE.CircleGeometry(1.35, 8), badge);
  crest.position.set(-1.37, 66.1, 8.84);
  crest.rotation.y = -Math.PI / 2;
  crest.rotation.z = Math.PI / 8;
  const crestBars = [{ x: -1.39, y: 66.1, z: 8.84, sx: 0.35, sy: 3.7, sz: 0.12, ry: -Math.PI / 2, rz: 0.72 },
    { x: -1.40, y: 66.1, z: 8.84, sx: 0.35, sy: 3.7, sz: 0.12, ry: -Math.PI / 2, rz: -0.72 }];
  addInstances("horizon-banner-crossed-emblem", boxGeometry, badge, crestBars);
  let drawCalls = 0, instances = 0, triangles = 0, vertices = 0;
  group.traverse(object => {
    if (!(object as Three.Mesh).isMesh) return;
    const mesh = object as Three.Mesh;
    const count = (mesh as Three.InstancedMesh).isInstancedMesh ? (mesh as Three.InstancedMesh).count : 1;
    drawCalls += 1;
    instances += count;
    vertices += mesh.geometry.getAttribute("position").count * count;
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3 * count;
  });
  group.userData.pirateHorizonStats = { drawCalls, instances, triangles, vertices };
  scene.add(group);
  return group;
}

/** Decorative swimming arms for the SAME octopus during its distant approach. */
export function createOctopusForeshadowArms(THREE: typeof Three, skinMaterial: Three.Material, suckerMaterial?: Three.Material) {
  const group = new THREE.Group();
  group.name = "octopus-approach-swimming-arms";
  group.userData.visualOnly = true;
  group.userData.armCount = 8;
  const armGeometries: Three.BufferGeometry[] = [];
  const suckerPlacements: { point: Three.Vector3; size: number }[] = [];
  for (let arm = 0; arm < 8; arm += 1) {
    const angle = arm / 8 * TAU;
    const length = 20 + Math.sin(arm * 1.7) * 3;
    const sideways = (arm % 2 ? 1 : -1) * 0.45;
    const point = (radius: number, y: number, offset = 0) => new THREE.Vector3(Math.cos(angle + offset) * radius, y, Math.sin(angle + offset) * radius);
    const curve = new THREE.CatmullRomCurve3([
      point(6.4, 3.8), point(10.8, 1.3, sideways * 0.22), point(15.8, -1.4, sideways * 0.49),
      point(length, -1.0, sideways * 0.76), point(length + 1.2, 2.1, sideways), point(length - 0.4, 3.8, sideways * 1.22),
    ], false, "centripetal");
    const geometry = new THREE.TubeGeometry(curve, 36, 1, 8, false);
    const vertices = geometry.getAttribute("position");
    for (let ring = 0; ring <= 36; ring += 1) {
      const amount = ring / 36;
      const center = curve.getPointAt(amount);
      const taper = 1.45 * Math.pow(1 - amount, 0.72) + 0.15;
      for (let around = 0; around <= 8; around += 1) {
        const index = ring * 9 + around;
        vertices.setXYZ(index, center.x + (vertices.getX(index) - center.x) * taper,
          center.y + (vertices.getY(index) - center.y) * taper, center.z + (vertices.getZ(index) - center.z) * taper);
      }
    }
    geometry.computeVertexNormals();
    armGeometries.push(geometry);
    if (suckerMaterial) for (let sucker = 0; sucker < 7; sucker += 1) {
      const amount = 0.14 + sucker * 0.105;
      const p = curve.getPointAt(amount);
      p.y -= 1.45 * Math.pow(1 - amount, 0.72) + 0.12;
      suckerPlacements.push({ point: p, size: 0.52 * (1 - amount) + 0.14 });
    }
  }
  const arms = new THREE.Mesh(mergeStaticGeometry(THREE, armGeometries), skinMaterial);
  arms.name = "octopus-eight-curled-swimming-arms";
  arms.castShadow = false;
  arms.receiveShadow = false;
  arms.userData.visualOnly = true;
  group.add(arms);
  if (suckerMaterial) {
    const suckers = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.2, 5, 10), suckerMaterial, suckerPlacements.length);
    const dummy = new THREE.Object3D();
    suckerPlacements.forEach(({ point, size }, i) => {
      dummy.position.copy(point);
      dummy.rotation.x = Math.PI / 2;
      dummy.scale.setScalar(size);
      dummy.updateMatrix();
      suckers.setMatrixAt(i, dummy.matrix);
    });
    suckers.name = "octopus-swimming-arm-suckers";
    suckers.castShadow = false;
    suckers.receiveShadow = false;
    suckers.userData.visualOnly = true;
    suckers.instanceMatrix.needsUpdate = true;
    suckers.computeBoundingSphere();
    group.add(suckers);
  }
  return group;
}

/** Zero-based lap index + fraction; continuous at lap boundaries, no race mutation. */
export function pirateOctopusApproach(lapIndex: number, progress: number) {
  const lap = Number.isFinite(lapIndex) ? Math.max(0, lapIndex) : 0;
  const fraction = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const phase = Math.max(0, Math.min(1, (lap + fraction) / 2));
  return phase * phase * (3 - 2 * phase);
}

/** Lap-two foreshadow: the crown peeks above the ship's concealing gunwale.
 * A sea-level crown is completely occluded by this tall hull. Cover height
 * includes a small viewing margin; the eyes/mouth stay below it. Render only.
 */
export function pirateOctopusPeekY(coverHeight: number, timeMs: number) {
  const headTop = 9.2 + 10.1 * 1.25;
  return coverHeight - headTop + 2.35 + Math.sin(timeMs * .0017) * .28;
}
