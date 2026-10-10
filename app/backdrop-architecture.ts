import type * as Three from "three";
import { markGeneratedSurface } from "./generated-material-textures";

type CityCourse = {
  length: number;
  pointAt(u: number, lane?: number): { x: number; y: number; z: number; heading: number };
  isClearFromRoad(x: number, z: number, margin: number, ignoreU?: number, ignoreRange?: number): boolean;
};
type Placement = { x: number; y: number; z: number; width: number; height: number; depth: number; yaw: number; color: number };
type Batch = { geometry: Three.BufferGeometry; material: Three.MeshStandardMaterial; placements: Placement[] };
type Anchor = { x: number; z: number; footprint: number; baseY: number; kind: string };
type GroundingArea = { x: number; z: number; width: number; depth: number; yaw: number; footprint: number; baseY: number };
const TAU = Math.PI * 2;
const FAMILIES = ["stepped-office", "glass-tower", "balcony-apartment", "rounded-hotel", "retail-pavilion", "vaulted-station"];

// Flat walls remain flat while bevels/corners are actual modeled surfaces.
// Independent cap vertices keep roof normals from rounding the entire facade.
function makePrism(THREE: typeof Three, rounded: boolean) {
  const outline: [number, number, number, number][] = [];
  if (rounded) {
    for (let corner = 0; corner < 4; corner += 1) {
      const centerAngle = corner * Math.PI / 2 + Math.PI / 4;
      const cx = Math.cos(centerAngle) > 0 ? 0.34 : -0.34;
      const cz = Math.sin(centerAngle) > 0 ? 0.34 : -0.34;
      for (let step = 0; step <= 5; step += 1) {
        const angle = corner * Math.PI / 2 + step / 5 * Math.PI / 2;
        outline.push([cx + Math.cos(angle) * 0.16, cz + Math.sin(angle) * 0.16, Math.cos(angle), Math.sin(angle)]);
      }
    }
  } else {
    for (const [x, z] of [[0.42, -0.5], [0.5, -0.42], [0.5, 0.42], [0.42, 0.5], [-0.42, 0.5], [-0.5, 0.42], [-0.5, -0.42], [-0.42, -0.5]]) outline.push([x, z, 0, 0]);
  }
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  const n = outline.length;
  for (let side = 0; side < n; side += 1) {
    const a = outline[side], b = outline[(side + 1) % n];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = (b[1] - a[1]) / length, nz = (a[0] - b[0]) / length;
    const first = positions.length / 3;
    for (const [point, y] of [[a, 0], [a, 1], [b, 0], [b, 1]] as const) {
      positions.push(point[0], y, point[1]);
      // The straight transition between two rounded corners needs cardinal
      // normals, not interpolated diagonal normals from its adjoining arcs.
      const curved = rounded && side % 6 !== 5;
      normals.push(curved ? point[2] : nx, 0, curved ? point[3] : nz);
      uvs.push(side / n + (point === b ? 1 / n : 0), y);
    }
    indices.push(first, first + 1, first + 2, first + 2, first + 1, first + 3);
  }
  for (const y of [0, 1]) {
    const center = positions.length / 3;
    positions.push(0, y, 0); normals.push(0, y === 0 ? -1 : 1, 0); uvs.push(0.5, 0.5);
    for (const point of outline) {
      positions.push(point[0], y, point[1]); normals.push(0, y === 0 ? -1 : 1, 0); uvs.push(point[0] + 0.5, point[1] + 0.5);
    }
    for (let side = 0; side < n; side += 1) {
      const a = center + 1 + side, b = center + 1 + (side + 1) % n;
      indices.push(center, y === 0 ? a : b, y === 0 ? b : a);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

function makeWindowFrame(THREE: typeof Three) {
  const source = new THREE.BoxGeometry(1, 1, 1);
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (const [x, y, w, h] of [[0, 0.055, 1, 0.11], [0, 0.945, 1, 0.11], [-0.445, 0.5, 0.11, 0.78], [0.445, 0.5, 0.11, 0.78]]) {
    const start = positions.length / 3;
    const p = source.getAttribute("position"), normal = source.getAttribute("normal"), uv = source.getAttribute("uv");
    for (let index = 0; index < p.count; index += 1) {
      positions.push(p.getX(index) * w + x, p.getY(index) * h + y, p.getZ(index) * 0.12);
      normals.push(normal.getX(index), normal.getY(index), normal.getZ(index));
      uvs.push(uv.getX(index), uv.getY(index));
    }
    for (let index = 0; index < source.index!.count; index += 1) indices.push(start + source.index!.getX(index));
  }
  source.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

function makeVault(THREE: typeof Three) {
  const segments = 24;
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (const z of [-0.5, 0.5]) {
    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = segment / segments * Math.PI;
      positions.push(Math.cos(angle) * 0.5, Math.sin(angle), z);
      uvs.push(segment / segments, z + 0.5);
    }
  }
  for (let segment = 0; segment < segments; segment += 1) {
    indices.push(segment, segment + 1, segment + segments + 1,
      segment + 1, segment + segments + 2, segment + segments + 1);
  }
  for (let end = 0; end < 2; end += 1) {
    const first = end * (segments + 1), center = positions.length / 3;
    positions.push(0, 0, end === 0 ? -0.5 : 0.5); uvs.push(0.5, 0);
    for (let segment = 0; segment < segments; segment += 1) {
      indices.push(center, first + segment + (end === 0 ? 1 : 0), first + segment + (end === 0 ? 0 : 1));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeStreetBench(THREE: typeof Three) {
  const source = new THREE.BoxGeometry(1, 1, 1);
  const parts: { x: number; y: number; z: number; w: number; h: number; d: number; color: number }[] = [];
  // Slatted hardwood seating, open-backed boards, and a restrained metal frame.
  // All parts are consumed into one reusable geometry, not extra scene objects.
  for (let slat = 0; slat < 6; slat++) parts.push({ x: 0, y: 0.49, z: -0.28 + slat * 0.112, w: 2.65, h: 0.08, d: 0.087, color: 0x8b7052 });
  for (let slat = 0; slat < 3; slat++) parts.push({ x: 0, y: 0.70 + slat * 0.17, z: -0.36, w: 2.65, h: 0.12, d: 0.07, color: 0x92795c });
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) parts.push({ x: side * 1.08, y: 0.25, z: end * 0.23, w: 0.10, h: 0.50, d: 0.12, color: 0x4b5b5b });
    parts.push({ x: side * 1.11, y: 0.76, z: -0.37, w: 0.08, h: 0.63, d: 0.08, color: 0x4b5b5b });
    parts.push({ x: side * 1.37, y: 0.71, z: -0.025, w: 0.09, h: 0.09, d: 0.70, color: 0x566564 });
    parts.push({ x: side * 1.37, y: 0.60, z: 0.24, w: 0.075, h: 0.27, d: 0.075, color: 0x566564 });
  }
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = [];
  const tint = new THREE.Color();
  const p = source.getAttribute("position"), n = source.getAttribute("normal"), uv = source.getAttribute("uv");
  for (const part of parts) {
    const start = positions.length / 3;
    tint.setHex(part.color);
    for (let index = 0; index < p.count; index++) {
      positions.push(p.getX(index) * part.w + part.x, p.getY(index) * part.h + part.y, p.getZ(index) * part.d + part.z);
      normals.push(n.getX(index), n.getY(index), n.getZ(index));
      colors.push(tint.r, tint.g, tint.b);
      uvs.push(uv.getX(index), uv.getY(index));
    }
    for (const index of source.index!.array) indices.push(start + index);
  }
  source.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

/** Complete city background, replacing the old repeated building blocks.
 * Everything is static, ground-attached and scene-owned. Individual windows,
 * balcony rails and structural components share a small instanced batch set.
 */
export function createCityBackdrop(THREE: typeof Three, course: CityCourse, groundY: number): Three.Group {
  const group = new THREE.Group();
  group.name = "city-architecture-v2";
  group.userData.visualOnly = true;
  const anchors: Anchor[] = [];
  const buildings: { family: string; height: number; width: number; depth: number; anchor: Anchor }[] = [];
  const groundingAreas: GroundingArea[] = [];
  const walkNodes: { x: number; z: number; site: Anchor }[] = [];
  group.userData.backdropAnchors = anchors;
  group.userData.cityGroundingAreas = groundingAreas;
  group.userData.cityPedestrianLinks = [];
  group.userData.buildingCount = 0;
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const bevel = makePrism(THREE, false), rounded = makePrism(THREE, true);
  const frame = makeWindowFrame(THREE), vault = makeVault(THREE), bench = makeStreetBench(THREE);
  const concrete = markGeneratedSurface(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 }), "concrete", "scaled-local");
  concrete.name = "city-facade-masonry-v2";
  concrete.userData.backdropArchitectureSurface = "facade";
  const brick = markGeneratedSurface(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 }), "brick", "scaled-local");
  const limestone = markGeneratedSurface(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.83 }), "limestone", "scaled-local");
  const cladding = markGeneratedSurface(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.54, metalness: 0.16 }), "cladding", "scaled-local");
  brick.userData.backdropArchitectureSurface = "brick";
  limestone.userData.backdropArchitectureSurface = "limestone";
  cladding.userData.backdropArchitectureSurface = "cladding";
  const paving = markGeneratedSurface(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96 }), "stone", "scaled-local");
  const steel = markGeneratedSurface(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.49, metalness: 0.3 }), "metal", "scaled-local", [0.4, 0.4]);
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.54, metalness: 0.18 });
  const bronze = markGeneratedSurface(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.54, metalness: 0.26 }), "metal", "scaled-local", [0.5, 0.5]);
  const wood = markGeneratedSurface(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.79 }), "wood", "scaled-local", [0.18, 0.18]);
  const benchMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.80, metalness: 0.06, vertexColors: true });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.23, metalness: 0.14, clearcoat: 0.28, clearcoatRoughness: 0.18, reflectivity: 0.3, ior: 1.45, emissive: 0x071319, emissiveIntensity: 0.15 });
  glass.name = "city-reflective-glass-v2";
  glass.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      float cityGlassEdge = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.0);
      diffuseColor.rgb *= mix(0.76, 1.24, cityGlassEdge);
    `);
  };
  glass.customProgramCacheKey = () => "city-reflective-glass-v2";
  const batches = new Map<string, Batch>();
  const register = (name: string, geometry: Three.BufferGeometry, material: Three.MeshStandardMaterial) => {
    batches.set(name, { geometry, material, placements: [] });
  };
  register("beveled-walls", bevel, concrete);
  register("brick-walls", bevel, brick);
  register("limestone-walls", bevel, limestone);
  register("metal-cladding-walls", bevel, cladding);
  register("rounded-walls", rounded, limestone);
  register("masonry-details", box, concrete);
  register("stone-foundations", box, paving);
  register("glass-curtain-walls", box, glass);
  register("individual-window-panes", box, glass);
  register("individual-window-frames", frame, darkMetal);
  register("steel-structure", box, steel);
  register("dark-metal-details", box, darkMetal);
  register("bronze-details", box, bronze);
  register("timber-entrances", box, wood);
  register("barrel-vault-roofs", vault, steel);
  register("rounded-rooflines", rounded, steel);
  register("pedestrian-paving", box, paving);
  register("street-benches", bench, benchMaterial);
  const samples = Array.from({ length: 96 }, (_, index) => course.pointAt(index / 96));
  const bounds = samples.reduce((value, pose) => ({
    minX: Math.min(value.minX, pose.x), maxX: Math.max(value.maxX, pose.x),
    minZ: Math.min(value.minZ, pose.z), maxZ: Math.max(value.maxZ, pose.z),
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
  const centerX = (bounds.minX + bounds.maxX) / 2, centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const extentX = Math.max(58, (bounds.maxX - bounds.minX) / 2), extentZ = Math.max(58, (bounds.maxZ - bounds.minZ) / 2);
  for (let index = 0; index < 28; index += 1) {
    const family = index % FAMILIES.length;
    const dimensions = [[17, 14, 33], [12, 13, 54], [21, 13, 21], [16, 15, 36], [25, 16, 8.5], [29, 16, 11.5]][family];
    const width = dimensions[0] * (0.94 + index % 3 * 0.055);
    const depth = dimensions[1] * (0.94 + (index + 1) % 3 * 0.045);
    const height = dimensions[2] * [0.86, 1.06, 0.96, 1.15][Math.floor(index / 6) % 4];
    // Includes projecting entrance roofs, balcony platforms and foundations.
    const footprint = Math.hypot(width / 2 + 5, depth / 2 + 5);
    const angle = (index + 0.21) / 28 * TAU + Math.sin(index * 1.91) * 0.014;
    let accepted: Anchor | undefined;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const setback = 36 + (index % 3) * 11 + (family === 1 ? 21 : 0) + attempt * 22;
      const x = centerX + Math.cos(angle) * (extentX + setback);
      const z = centerZ + Math.sin(angle) * (extentZ + setback);
      if (anchors.some(other => Math.hypot(x - other.x, z - other.z) < footprint + other.footprint + 14)) continue;
      if (!course.isClearFromRoad(x, z, footprint + 18)) continue;
      accepted = { x, z, footprint, baseY: groundY, kind: `city-building-${FAMILIES[family]}` };
      anchors.push(accepted);
      break;
    }
    if (!accepted) continue;
    const site = accepted;
    const yaw = -angle - Math.PI / 2;
    const palette = [0xc8c6b8, 0xb5c4c8, 0xc3987e, 0xe0d3bd, 0xacb9ae, 0xc8c6b4];
    const wallColor = palette[family];
    let modeledTop = 0;
    const add = (name: string, x: number, y: number, z: number, w: number, h: number, d: number, color: number, localYaw = 0) => {
      modeledTop = Math.max(modeledTop, y + h);
      batches.get(name)!.placements.push({
        x: site.x + Math.cos(yaw) * x + Math.sin(yaw) * z,
        y: groundY + y,
        z: site.z - Math.sin(yaw) * x + Math.cos(yaw) * z,
        width: w, height: h, depth: d, color, yaw: yaw + localYaw,
      });
    };
    // Wider forecourts belong to the buildings, not to the playable road. Each
    // complete rectangle gets its OWN clearance query: the old building radius
    // must never silently authorize paving extending past its stored footprint.
    let pavedArea: GroundingArea | undefined;
    for (const padding of [16, 12, 10]) {
      const plazaWidth = width + padding, plazaDepth = depth + padding;
      const radius = Math.hypot(plazaWidth / 2, plazaDepth / 2);
      if (!course.isClearFromRoad(site.x, site.z, radius + 18)) continue;
      pavedArea = { x: site.x, z: site.z, width: plazaWidth, depth: plazaDepth, yaw, footprint: radius, baseY: groundY };
      groundingAreas.push(pavedArea);
      add("pedestrian-paving", 0, 0.015, 0, plazaWidth, 0.12, plazaDepth,
        [0x9aaba9, 0xa7b1ad, 0xa29e8c, 0xb1b3a5, 0x93a39b, 0xa4aea8][family]);
      // Broad paving is divided into small blocks with understated stone seams,
      // not bright markings that could be mistaken for a second driving route.
      for (const side of [-1, 1]) {
        add("stone-foundations", 0, 0.14, side * (plazaDepth / 2 - 0.14), plazaWidth, 0.035, 0.23, 0x748581);
        add("stone-foundations", side * (plazaWidth / 2 - 0.14), 0.14, 0, 0.23, 0.035, plazaDepth, 0x748581);
      }
      for (const side of [-1, 1]) {
        add("stone-foundations", 0, 0.14, side * (depth / 2 + 2.8), plazaWidth - 0.35, 0.012, 0.065, 0x82928d);
        add("stone-foundations", side * (width / 2 + 2.8), 0.14, 0, 0.065, 0.012, plazaDepth - 0.35, 0x82928d);
      }
      // Nodes are on the front apron, keeping any connections outside walls.
      const front = depth / 2 + Math.min(4.2, padding / 2 - 0.8);
      walkNodes.push({ x: site.x + Math.sin(yaw) * front, z: site.z + Math.cos(yaw) * front, site });
      if (index % 3 === 0) add("street-benches", (index % 2 ? -1 : 1) * width * 0.38, 0.14,
        depth / 2 + 3.95, 1, 1, 1, 0xffffff);
      break;
    }
    const window = (x: number, y: number, z: number, w: number, h: number, direction: number, warm = false, framed = true) => {
      add("individual-window-panes", x, y + h * 0.10, z, w * 0.82, h * 0.80, 0.085, warm ? 0xa7956c : 0x416975, direction);
      if (framed) add("individual-window-frames", x, y, z, w, h, 1, family === 3 ? 0x806f57 : 0x5d686a, direction);
    };
    const facades = (ox: number, base: number, oz: number, w: number, d: number, h: number, rowsLimit = 10, span = 1, roundedFacade = false) => {
      const rows = Math.max(1, Math.min(rowsLimit, Math.floor((h - 1.2) / 3.3)));
      const story = (h - 1.1) / rows;
      for (let side = 0; side < 4; side += 1) {
        const nx = Math.sin(side * Math.PI / 2), nz = Math.cos(side * Math.PI / 2);
        const faceWidth = (side % 2 === 0 ? w : d) * span, faceDepth = side % 2 === 0 ? d : w;
        const columns = Math.max(2, Math.min(5, Math.floor((faceWidth - 1.4) / 3.1)));
        for (let row = 0; row < rows; row += 1) {
          for (let column = 0; column < columns; column += 1) {
            const along = (column - (columns - 1) / 2) * faceWidth / (columns + 0.6);
            const x = ox + nx * (faceDepth / 2 + 0.11) + nz * along;
            const z = oz + nz * (faceDepth / 2 + 0.11) - nx * along;
            window(x, base + 0.66 + row * story, z, Math.min(2.15, faceWidth / (columns + 1) * 0.78),
              Math.min(2.05, story * 0.61), side * Math.PI / 2, (row * 3 + column + index) % 11 === 0);
          }
        }
      }
      if (!roundedFacade) {
        for (let floor = 1; floor <= rows; floor += 1) add("masonry-details", ox, base + floor * h / rows - 0.17, oz, w * 1.015, 0.17, d * 1.015, 0xb9b8ae);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          add("masonry-details", ox + sx * w * 0.455, base, oz + sz * d * 0.455, 0.31, h, 0.31, 0xd4d0c2);
        }
      }
    };
    const roofPlant = (x: number, y: number, z: number, w: number, d: number) => {
      add("dark-metal-details", x, y, z, w, 0.24, d, 0x505a59);
      add("steel-structure", x, y + 0.24, z, w * 0.85, 0.85, d * 0.87, 0x929d99);
      for (let slat = 0; slat < 4; slat += 1) add("dark-metal-details", x, y + 0.34 + slat * 0.15, z + d * 0.443, w * 0.69, 0.06, 0.06, 0x434b4b);
    };
    const entrance = (base: number, front: number, entryWidth: number, canopyColor: number) => {
      add("dark-metal-details", 0, base, front + 0.13, entryWidth + 0.7, 3.45, 0.20, 0x374544);
      add("glass-curtain-walls", 0, base + 0.12, front + 0.25, entryWidth - 0.20, 3.14, 0.08, 0x5c8084);
      for (const side of [-1, 0, 1]) add("bronze-details", side * entryWidth * 0.42, base + 0.10, front + 0.32, 0.09, 3.24, 0.07, 0x827d68);
      add("steel-structure", 0, base + 3.5, front + 1.28, entryWidth + 2.4, 0.27, 3.4, canopyColor);
      add("stone-foundations", 0, 0.46, front + 1.12, entryWidth + 2.5, 0.20, 2.7, 0xbebfb3);
      if (pavedArea) for (let step = 0; step < 3; step++) {
        add("stone-foundations", 0, 0.14 + step * 0.16, front + 3.30 - step * 0.57,
          entryWidth + 2.0, 0.16, 1.45, 0xbfc2b5);
      }
    };
    // Both broad slabs contact the actual ground: never elevated on road height.
    add("stone-foundations", 0, 0, 0, width + 4.4, 0.22, depth + 4.4, 0x939a91);
    add("stone-foundations", 0, 0.22, 0, width + 1.4, 0.46, depth + 1.4, 0xbbbbb0);
    const base = 0.68;
    let roofY = base + height;
    if (family === 0) {
      const lower = height * 0.27, middle = height * 0.45, upper = height - lower - middle;
      add("beveled-walls", 0, base, 0, width, lower, depth, wallColor);
      facades(0, base, 0, width, depth, lower, 3);
      add("beveled-walls", -width * 0.06, base + lower, -depth * 0.03, width * 0.82, middle, depth * 0.83, 0xbec2b9);
      facades(-width * 0.06, base + lower, -depth * 0.03, width * 0.82, depth * 0.83, middle, 5);
      add("beveled-walls", -width * 0.15, base + lower + middle, depth * 0.02, width * 0.57, upper, depth * 0.61, 0xc8c8bd);
      facades(-width * 0.15, base + lower + middle, depth * 0.02, width * 0.57, depth * 0.61, upper, 4);
      for (const [y, w, d] of [[base + lower, width, depth], [base + lower + middle, width * 0.82, depth * 0.83]]) {
        add("steel-structure", -width * 0.06, y, 0, w + 0.45, 0.24, d + 0.45, 0x7e8c85);
      }
      entrance(base, depth / 2, 4.4, 0x7c918e);
      roofPlant(-width * 0.15, roofY + 0.08, 0, width * 0.24, depth * 0.25);
      add("steel-structure", -width * 0.15, roofY, 0, width * 0.61, 0.38, depth * 0.65, 0x829088);
    } else if (family === 1) {
      const podium = 6.8;
      add("beveled-walls", 0, base, 0, width + 1.8, podium, depth + 1.8, 0xb6c2c0);
      facades(0, base, 0, width + 1.8, depth + 1.8, podium, 2);
      const towerHeight = height - podium;
      for (let tier = 0; tier < 3; tier += 1) {
        const w = width * (1 - tier * 0.11), d = depth * (1 - tier * 0.09);
        const y = base + podium + towerHeight * tier / 3, h = towerHeight / 3;
        add("glass-curtain-walls", -tier * 0.35, y, 0, w, h, d, [0x3d697b, 0x547d8b, 0x638b96][tier]);
        for (let side = 0; side < 4; side += 1) {
          const nx = Math.sin(side * Math.PI / 2), nz = Math.cos(side * Math.PI / 2);
          const fw = side % 2 === 0 ? w : d, fd = side % 2 === 0 ? d : w;
          for (let mullion = 0; mullion <= 4; mullion += 1) {
            const along = (mullion / 4 - 0.5) * fw;
            add("steel-structure", -tier * 0.35 + nx * (fd / 2 + 0.07) + nz * along, y,
              nz * (fd / 2 + 0.07) - nx * along, 0.115, h, 0.115, 0x8caaac);
          }
          for (let floor = 1; floor <= 5; floor += 1) add("steel-structure", -tier * 0.35 + nx * (fd / 2 + 0.09),
            y + floor * h / 5 - 0.07, nz * (fd / 2 + 0.09), fw + 0.19, 0.11, 0.11, 0x789295, side * Math.PI / 2);
        }
        add("steel-structure", -tier * 0.35, y + h - 0.14, 0, w + 0.45, 0.26, d + 0.45, 0x92a6a4);
      }
      add("steel-structure", -0.7, roofY, 0, width * 0.85, 0.46, depth * 0.87, 0x95a9a8);
      add("beveled-walls", -0.7, roofY + 0.46, -1, width * 0.34, 2.6, depth * 0.30, 0x7e9493);
      roofPlant(-0.7, roofY + 3.1, -1, width * 0.22, depth * 0.20);
      add("steel-structure", -0.7, roofY + 3.1, -1, 0.10, 4.8, 0.10, 0x869d9b);
      entrance(base, depth / 2 + 0.9, 4.2, 0x829b9b);
      roofY += 8;
    } else if (family === 2) {
      add("brick-walls", 0, base, 0, width, height, depth, wallColor);
      facades(0, base, 0, width, depth, height, 7);
      const floors = Math.max(3, Math.floor(height / 3.5));
      for (let side = 0; side < 4; side += 1) {
        const nx = Math.sin(side * Math.PI / 2), nz = Math.cos(side * Math.PI / 2);
        const fw = side % 2 === 0 ? width : depth, fd = side % 2 === 0 ? depth : width;
        for (let floor = 1; floor < floors; floor += 1) for (const bay of [-1, 1]) {
          const along = bay * fw * 0.24, x = nx * (fd / 2 + 0.63) + nz * along;
          const z = nz * (fd / 2 + 0.63) - nx * along, y = base + floor * height / floors - 0.08;
          const balconyWidth = Math.min(4.2, fw * 0.32), direction = side * Math.PI / 2;
          add("masonry-details", x, y, z, balconyWidth, 0.18, 1.54, 0xc5bfad, direction);
          add("dark-metal-details", x + nx * 0.67, y + 0.96, z + nz * 0.67, balconyWidth, 0.075, 0.075, 0x54635d, direction);
          for (const post of [-1, 0, 1]) add("dark-metal-details", x + nx * 0.67 + nz * post * balconyWidth * 0.47,
            y + 0.18, z + nz * 0.67 - nx * post * balconyWidth * 0.47, 0.065, 0.82, 0.065, 0x62716b);
          add("glass-curtain-walls", x + nx * 0.67, y + 0.29, z + nz * 0.67, balconyWidth * 0.93, 0.60, 0.065, 0x698b83, direction);
        }
      }
      add("masonry-details", 0, roofY, 0, width + 0.7, 0.38, depth + 0.7, 0xcfc8b5);
      add("beveled-walls", -width * 0.21, roofY + 0.38, 0, 3.5, 2.6, 4.0, 0xb2aa99);
      roofPlant(width * 0.18, roofY + 0.38, -depth * 0.17, 2.1, 2.0);
      entrance(base, depth / 2, 3.8, 0x9b8c71);
      roofY += 3;
    } else if (family === 3) {
      add("rounded-walls", 0, base, 0, width, height * 0.87, depth, wallColor);
      facades(0, base, 0, width, depth, height * 0.87, 9, 0.82, true);
      // Window spans avoid rounded corners, while their depth remains flush
      // with the actual straight outer walls rather than buried in the hotel.
      for (let floor = 1; floor <= 8; floor += 1) add("rounded-rooflines", 0, base + floor * height * 0.87 / 8,
        0, width + 0.22, 0.16, depth + 0.22, 0x9e957e);
      add("rounded-walls", 0, base + height * 0.87, -0.5, width * 0.72, height * 0.13, depth * 0.75, 0xc5c3ae);
      facades(0, base + height * 0.87, -0.5, width * 0.72, depth * 0.75, height * 0.13, 2, 0.82, true);
      add("rounded-rooflines", 0, roofY, -0.5, width * 0.77, 0.38, depth * 0.79, 0xa19476);
      entrance(base, depth / 2, 5.2, 0x9f926f);
      add("rounded-rooflines", 0, base + 3.8, depth / 2 + 1.7, 8.2, 0.28, 4.0, 0x9f926f);
      for (const side of [-1, 1]) add("bronze-details", side * 3.5, base, depth / 2 + 3.1, 0.29, 3.8, 0.29, 0xa09475);
      roofPlant(0, roofY + 0.42, -2, 3.2, 2.5);
      roofY += 1.6;
    } else if (family === 4) {
      add("metal-cladding-walls", 0, base, 0, width, height * 0.55, depth, wallColor);
      add("metal-cladding-walls", -width * 0.11, base + height * 0.55, -depth * 0.13, width * 0.79, height * 0.45, depth * 0.73, 0xb0b7a7);
      facades(-width * 0.11, base + height * 0.55, -depth * 0.13, width * 0.79, depth * 0.73, height * 0.45, 1);
      for (let side = 0; side < 4; side += 1) {
        const nx = Math.sin(side * Math.PI / 2), nz = Math.cos(side * Math.PI / 2);
        const fw = side % 2 === 0 ? width : depth, fd = side % 2 === 0 ? depth : width;
        for (let bay = 0; bay < 4; bay += 1) {
          const along = (bay - 1.5) * fw * 0.22;
          window(nx * (fd / 2 + 0.11) + nz * along, base + 0.25, nz * (fd / 2 + 0.11) - nx * along,
            fw * 0.19, height * 0.39, side * Math.PI / 2, false);
        }
        add("timber-entrances", nx * (fd / 2 + 0.79), base + height * 0.45, nz * (fd / 2 + 0.79),
          fw * 0.93, 0.21, 1.64, 0x9a755b, side * Math.PI / 2);
        add("bronze-details", nx * (fd / 2 + 1.58), base + height * 0.45 - 0.28, nz * (fd / 2 + 1.58),
          fw * 0.93, 0.31, 0.10, 0x7a6460, side * Math.PI / 2);
      }
      add("steel-structure", -width * 0.11, roofY, -depth * 0.13, width * 0.85, 0.28, depth * 0.79, 0x909b88);
      add("glass-curtain-walls", -width * 0.19, roofY + 0.28, -depth * 0.14, width * 0.39, 1.1, depth * 0.30, 0x668880);
      add("steel-structure", -width * 0.19, roofY + 1.38, -depth * 0.14, width * 0.42, 0.19, depth * 0.33, 0xa6ad96);
      roofPlant(width * 0.23, roofY + 0.28, -depth * 0.23, 2.1, 2.0);
      entrance(base, depth / 2, 4.5, 0x9c8370);
      roofY += 1.6;
    } else {
      const hall = height * 0.66;
      add("limestone-walls", 0, base, 0, width, hall, depth, 0xc7c8b6);
      facades(0, base, 0, width, depth, hall, 2);
      add("barrel-vault-roofs", 0, base + hall, 0, width * 0.97, height - hall, depth * 1.07, 0x839b92);
      add("steel-structure", 0, base + hall - 0.13, 0, width + 0.65, 0.30, depth + 1.25, 0x909e91);
      add("steel-structure", 0, base + 4.0, depth / 2 + 1.55, width * 1.04, 0.32, 4.1, 0x8f9f94);
      for (let column = 0; column < 6; column += 1) add("masonry-details", (column / 5 - 0.5) * width * 0.93,
        base, depth / 2 + 3.23, 0.48, 4.0, 0.48, 0xd2cebc);
      for (const side of [-1, 1]) {
        add("beveled-walls", side * width * 0.38, base + hall, 0, width * 0.12, height * 0.52, depth * 0.27, 0xc3c5b0);
        add("steel-structure", side * width * 0.38, base + hall + height * 0.52, 0, width * 0.15, 0.29, depth * 0.31, 0x8d9c8d);
        window(side * width * 0.38, base + hall + 0.8, depth * 0.141, width * 0.072, height * 0.23, 0, false);
      }
      entrance(base, depth / 2, 6.0, 0x91a18f);
      roofY = base + hall + height * 0.52 + 0.29;
      roofPlant(width * 0.38, base + hall + (height - hall) * 0.63, -depth * 0.25, 1.8, 1.5);
    }
    buildings.push({ family: FAMILIES[family], height: modeledTop, width, depth, anchor: site });
  }
  // A few narrow pedestrian connections break up bare green gaps between close
  // frontages. They are ground-level tile walks, never lanes, road strips or
  // collision surfaces. Query the full walk every <=4 metres, conservatively.
  for (let index = 0; index < walkNodes.length; index++) {
    const a = walkNodes[index], b = walkNodes[(index + 1) % walkNodes.length];
    const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    if (length < 10 || length > 68) continue;
    const steps = Math.max(2, Math.ceil(length / 4));
    let clear = true;
    for (let step = 0; step <= steps && clear; step++) {
      const u = step / steps, x = a.x + dx * u, z = a.z + dz * u;
      if (!course.isClearFromRoad(x, z, 21.2)) { clear = false; break; }
      if (anchors.some(site => site !== a.site && site !== b.site && Math.hypot(x - site.x, z - site.z) < site.footprint + 1.2)) clear = false;
    }
    if (!clear) continue;
    const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2, yaw = Math.atan2(dx, dz);
    batches.get("pedestrian-paving")!.placements.push({ x, y: groundY + 0.022, z,
      width: 2.2, height: 0.105, depth: length, yaw, color: 0xa0ada5 });
    group.userData.cityPedestrianLinks.push({ fromX: a.x, fromZ: a.z, toX: b.x, toZ: b.z,
      width: 2.2, baseY: groundY, clearance: 21.2 });
  }
  const dummy = new THREE.Object3D(), tint = new THREE.Color();
  let triangles = 0, instances = 0;
  const usedGeometries = new Set<Three.BufferGeometry>(), usedMaterials = new Set<Three.Material>();
  for (const [name, batch] of batches) {
    if (batch.placements.length === 0) continue;
    const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.placements.length);
    mesh.name = `city-${name}`;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.visualOnly = true;
    batch.placements.forEach((placement, index) => {
      dummy.position.set(placement.x, placement.y, placement.z);
      dummy.rotation.set(0, placement.yaw, 0);
      dummy.scale.set(placement.width, placement.height, placement.depth);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, tint.setHex(placement.color));
    });
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) { mesh.instanceColor.setUsage(THREE.StaticDrawUsage); mesh.instanceColor.needsUpdate = true; }
    mesh.computeBoundingSphere();
    group.add(mesh);
    triangles += (batch.geometry.index?.count ?? batch.geometry.getAttribute("position").count) / 3 * mesh.count;
    instances += mesh.count;
    usedGeometries.add(batch.geometry); usedMaterials.add(batch.material);
  }
  // An obstructed custom course can reject every site. Resources that never
  // became scene-owned still get released; shared live resources remain intact.
  for (const geometry of new Set([box, bevel, rounded, frame, vault, bench])) if (!usedGeometries.has(geometry)) geometry.dispose();
  for (const material of new Set([concrete, brick, limestone, cladding, paving, steel, darkMetal, bronze, wood, glass, benchMaterial])) if (!usedMaterials.has(material)) material.dispose();
  group.userData.buildingCount = buildings.length;
  group.userData.cityBuildings = buildings;
  group.userData.architectureStats = { drawCalls: group.children.length, instances, triangles };
  return group;
}
