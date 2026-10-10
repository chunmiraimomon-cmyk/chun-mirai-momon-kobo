import type * as Three from "three";

type CloudDetail = "near" | "small";
type Swell = readonly [x: number, y: number, z: number, rx: number, ry: number, rz: number];
type Measurements = { radius: number; midY: number; halfHeight: number };

const TAU = Math.PI * 2;
const ORIGIN_Y = -0.16;
const BLEND = 0.15;

// A broad foundation and overlapping, asymmetric swells form ONE continuous
// surface. Every swell contains the tracing origin, so the envelope has no
// detached balls, hidden internal shells or abrupt silhouette jumps.
const CLOUD_FORMS: readonly (readonly Swell[])[] = [
  [
    [0, -0.28, 0, 0.96, 0.38, 0.60],
    [-0.52, -0.01, 0.02, 0.64, 0.44, 0.44],
    [-0.08, 0.23, -0.03, 0.57, 0.67, 0.52],
    [0.56, -0.02, 0.04, 0.63, 0.44, 0.43],
    [-0.06, 0.02, -0.26, 0.55, 0.48, 0.49],
    [0.23, 0.01, 0.24, 0.57, 0.46, 0.49],
  ],
  [
    [0, -0.28, 0, 0.97, 0.39, 0.61],
    [-0.51, -0.04, 0.04, 0.62, 0.45, 0.45],
    [0.18, 0.30, -0.02, 0.60, 0.77, 0.53],
    [0.57, 0.02, 0.05, 0.65, 0.51, 0.45],
    [-0.21, 0.05, -0.25, 0.58, 0.53, 0.48],
    [-0.10, 0.00, 0.25, 0.60, 0.45, 0.50],
  ],
  [
    [0, -0.26, 0, 0.98, 0.38, 0.65],
    [-0.56, 0.00, -0.02, 0.65, 0.43, 0.46],
    [0.01, 0.12, 0.06, 0.68, 0.53, 0.56],
    [0.54, 0.04, 0.02, 0.65, 0.49, 0.47],
    [-0.10, 0.00, -0.30, 0.58, 0.47, 0.53],
    [0.22, -0.02, 0.27, 0.60, 0.43, 0.54],
  ],
  [
    [0, -0.28, 0, 0.96, 0.38, 0.60],
    [-0.57, -0.04, 0.04, 0.65, 0.43, 0.45],
    [-0.28, 0.20, -0.06, 0.67, 0.66, 0.52],
    [0.35, 0.24, 0.03, 0.68, 0.70, 0.54],
    [0.57, -0.05, -0.03, 0.64, 0.40, 0.44],
    [-0.01, -0.01, 0.24, 0.61, 0.46, 0.51],
  ],
];

const measurements = new Map<number, Measurements>();

function cloudField(form: readonly Swell[], x: number, y: number, z: number) {
  let distance = Infinity;
  for (const [cx, cy, cz, rx, ry, rz] of form) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry, dz = (z - cz) / rz;
    const swell = (Math.sqrt(dx * dx + dy * dy + dz * dz) - 1) * Math.min(rx, ry, rz);
    // Polynomial smooth union rounds the shoulders into a shared cloud body.
    const overlap = Math.max(BLEND - Math.abs(distance - swell), 0) / BLEND;
    distance = Math.min(distance, swell) - overlap * overlap * BLEND * 0.25;
  }
  return distance;
}

function traceEnvelope(form: readonly Swell[], dx: number, dy: number, dz: number) {
  let inside = 0, outside = 2.8;
  for (let step = 0; step < 20; step += 1) {
    const radius = (inside + outside) * 0.5;
    if (cloudField(form, dx * radius, ORIGIN_Y + dy * radius, dz * radius) < 0) inside = radius;
    else outside = radius;
  }
  const radius = (inside + outside) * 0.5;
  return [dx * radius, ORIGIN_Y + dy * radius, dz * radius];
}

function sampleEnvelope(form: readonly Swell[], segments: number, levels: number) {
  const positions = traceEnvelope(form, 0, 1, 0);
  for (let level = 1; level < levels; level += 1) {
    const latitude = level / levels * Math.PI;
    const radius = Math.sin(latitude), y = Math.cos(latitude);
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = segment / segments * TAU;
      positions.push(...traceEnvelope(form, Math.cos(angle) * radius, y, Math.sin(angle) * radius));
    }
  }
  positions.push(...traceEnvelope(form, 0, -1, 0));
  return positions;
}

function measureEnvelope(positions: number[]): Measurements {
  let radius = 0, minY = Infinity, maxY = -Infinity;
  for (let index = 0; index < positions.length; index += 3) {
    radius = Math.max(radius, Math.hypot(positions[index], positions[index + 2]));
    minY = Math.min(minY, positions[index + 1]);
    maxY = Math.max(maxY, positions[index + 1]);
  }
  return { radius, midY: (minY + maxY) * 0.5, halfHeight: (maxY - minY) * 0.5 };
}

function smoothstep(start: number, end: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

/** Four deterministic cumulus envelopes. Footprint radius <= 1; height [-1, 1].
 * Near: 1,106 vertices / 2,208 triangles. Small: 178 vertices / 352 triangles.
 * Both LODs share the near-resolution normalization; small is its nested sample.
 * Initialization only: no random draws, updates, texture loads or extra meshes.
 */
export function createBackdropCloudGeometry(
  THREE: typeof Three, variant: number, detail: CloudDetail = "near",
): Three.BufferGeometry {
  const formIndex = Number.isFinite(variant) ? ((Math.trunc(variant) % CLOUD_FORMS.length) + CLOUD_FORMS.length) % CLOUD_FORMS.length : 0;
  const form = CLOUD_FORMS[formIndex];
  const segments = detail === "small" ? 16 : 48;
  const levels = detail === "small" ? 12 : 24;
  const positions = sampleEnvelope(form, segments, levels);
  let size = measurements.get(formIndex);
  if (!size) {
    size = measureEnvelope(detail === "small" ? sampleEnvelope(form, 48, 24) : positions);
    measurements.set(formIndex, size);
  }

  const normals: number[] = [], colors: number[] = [], indices: number[] = [];
  const underside = new THREE.Color(0x718ca7);
  const body = new THREE.Color(0xa2b4be);
  const crown = new THREE.Color(0xbec2b9);
  const tint = new THREE.Color();
  const epsilon = 0.003;
  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index], y = positions[index + 1], z = positions[index + 2];
    // Gradient normals remove latitude/polygon bands without depending on the
    // triangulation. Account for the horizontal/vertical normalization here.
    const nx = (cloudField(form, x + epsilon, y, z) - cloudField(form, x - epsilon, y, z)) * size.radius;
    const ny = (cloudField(form, x, y + epsilon, z) - cloudField(form, x, y - epsilon, z)) * size.halfHeight;
    const nz = (cloudField(form, x, y, z + epsilon) - cloudField(form, x, y, z - epsilon)) * size.radius;
    const length = Math.hypot(nx, ny, nz) || 1;
    normals.push(nx / length, ny / length, nz / length);
    const normalizedY = (y - size.midY) / size.halfHeight;
    const lightness = smoothstep(-0.65, 0.62, normalizedY) * 0.72 + smoothstep(-0.4, 0.82, ny / length) * 0.28;
    tint.copy(underside).lerp(body, smoothstep(0, 0.68, lightness));
    tint.lerp(crown, smoothstep(0.50, 1, lightness) * 0.85);
    colors.push(tint.r, tint.g, tint.b);
    positions[index] = x / size.radius;
    positions[index + 1] = normalizedY;
    positions[index + 2] = z / size.radius;
  }

  for (let segment = 0; segment < segments; segment += 1) {
    indices.push(0, 1 + (segment + 1) % segments, 1 + segment);
  }
  for (let level = 0; level < levels - 2; level += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const a = 1 + level * segments + segment;
      const next = 1 + level * segments + (segment + 1) % segments;
      const b = a + segments, nextB = next + segments;
      indices.push(a, next, b, next, nextB, b);
    }
  }
  const south = positions.length / 3 - 1;
  const finalRing = 1 + (levels - 2) * segments;
  for (let segment = 0; segment < segments; segment += 1) {
    indices.push(south, finalRing + segment, finalRing + (segment + 1) % segments);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.name = `sculpted-cumulus-${formIndex}-${detail}`;
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.cloudVariant = formIndex;
  geometry.userData.cloudDetail = detail;
  return geometry;
}

/** Ordinary vertex/instance colors: dynamic weather may still change color and
 * emissive. No glare-producing atlas detail, transparency sorting or new lights.
 */
export function createBackdropCloudMaterial(THREE: typeof Three): Three.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    vertexColors: true,
    emissive: 0x1b2e43,
    emissiveIntensity: 0.08,
  });
  material.name = "soft-sculpted-cumulus";
  material.userData.visualOnly = true;
  // A restrained view rim makes the fused shoulders readable without adding
  // lights, whitening the whole cloud, or the texture atlas's busy grain.
  // diffuseColor already contains vertex, material and instance weather tints.
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
      float cumulusRim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);
      outgoingLight += diffuseColor.rgb * cumulusRim * 0.075;
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey = () => "sculpted-cumulus-soft-rim-v1";
  return material;
}
