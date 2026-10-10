import type * as Three from "three";
import { markGeneratedSurface } from "./generated-material-textures";

const TAU = Math.PI * 2;
const RINGS = 24;
const SEGMENTS = 32;

function smoothstep(low: number, high: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

function mound(x: number, z: number, cx: number, cz: number, rx: number, rz: number, yaw: number, power = 2) {
  const dx = x - cx, dz = z - cz;
  const u = (dx * Math.cos(yaw) + dz * Math.sin(yaw)) / rx;
  const v = (-dx * Math.sin(yaw) + dz * Math.cos(yaw)) / rz;
  return Math.exp(-Math.pow(Math.hypot(u, v), power));
}

function landformHeight(x: number, z: number, variant: number) {
  if (variant === 0) {
    // A long, winding ridge with a low shoulder and an off-center high crest.
    return 0.9 * mound(x, z, -0.22, 0.06, 0.55, 0.25, -0.26)
      + 0.57 * mound(x, z, 0.36, -0.13, 0.35, 0.27, 0.32)
      + 0.18 * mound(x, z, -0.61, -0.17, 0.24, 0.28, 0);
  }
  if (variant === 1) {
    // A rounded mesa: broad crown, uneven escarpment, and a lower apron.
    const dx = x - 0.09, dz = z + 0.04;
    const u = (dx * 0.97 + dz * 0.24) / 0.58;
    const v = (-dx * 0.24 + dz * 0.97) / 0.48;
    const terrace = Math.pow(Math.pow(Math.abs(u), 4) + Math.pow(Math.abs(v), 4), 0.25);
    return (1 - smoothstep(0.66, 1.36, terrace)) * (0.79 + x * 0.10 - z * 0.07)
      + 0.16 * mound(x, z, -0.34, 0.14, 0.63, 0.59, 0);
  }
  if (variant === 2) {
    // A high, rounded summit with a much lower buttress on one side.
    return mound(x, z, -0.19, 0.13, 0.37, 0.42, -0.37, 1.65)
      + 0.31 * mound(x, z, 0.37, -0.20, 0.41, 0.29, 0.42)
      + 0.13 * mound(x, z, -0.28, -0.41, 0.30, 0.24, 0);
  }
  // Two clearly separated, unequal humps joined by a lower saddle.
  return mound(x, z, -0.35, -0.12, 0.29, 0.35, -0.33)
    + 0.78 * mound(x, z, 0.34, 0.21, 0.32, 0.31, 0.52)
    + 0.13 * mound(x, z, 0, 0, 0.64, 0.24, 0.38);
}

/** A single-valued terrain surface: every decorative planting ray can hit it.
 * All variants fit inside an XZ unit disc and span exactly Y=0..1. The caller
 * shares these four geometries across instanced batches, never one per hill.
 */
export function createBackdropLandformGeometry(THREE: typeof Three, variant: number): Three.BufferGeometry {
  const shape = ((Math.trunc(Number.isFinite(variant) ? variant : 0) % 4) + 4) % 4;
  const positions: number[] = [0, landformHeight(0, 0, shape), 0];
  const uvs: number[] = [0.5, 0.5];
  const indices: number[] = [];
  const phase = shape * 1.71;
  const axes = [[1, 0.69], [0.93, 0.86], [0.83, 0.96], [0.98, 0.76]][shape];
  for (let ring = 1; ring <= RINGS; ring += 1) {
    const r = ring / RINGS;
    for (let segment = 0; segment < SEGMENTS; segment += 1) {
      const angle = segment / SEGMENTS * TAU;
      // The maximum outline is < 1, including every intermediate ring.
      const outline = 0.91 + Math.sin(angle * 3 + phase) * 0.048
        + Math.cos(angle * 5 - phase * 0.7) * 0.024;
      const x = Math.cos(angle) * r * outline * axes[0];
      const z = Math.sin(angle) * r * outline * axes[1];
      const apron = 1 - smoothstep(0.75, 1, r);
      // Broad erosion channels, not noise-spiked silhouettes. The center fade
      // keeps polar samples continuous and the outer ring rests on the ground.
      const erosion = 1 + Math.sin(angle * 8 + r * 3.2 + phase) * 0.038 * smoothstep(0.08, 0.4, r)
        + Math.sin(x * 17 + z * 11 + phase) * Math.sin(z * 13 - x * 7) * 0.018;
      positions.push(x, Math.max(0, landformHeight(x, z, shape) * apron * erosion), z);
      uvs.push(x * 0.5 + 0.5, z * 0.5 + 0.5);
    }
  }
  // No duplicated UV seam: neighboring sectors share smooth vertex normals.
  for (let segment = 0; segment < SEGMENTS; segment += 1) {
    const next = (segment + 1) % SEGMENTS;
    indices.push(0, 1 + next, 1 + segment);
    for (let ring = 1; ring < RINGS; ring += 1) {
      const inner = 1 + (ring - 1) * SEGMENTS;
      const outer = inner + SEGMENTS;
      indices.push(inner + segment, inner + next, outer + segment,
        inner + next, outer + next, outer + segment);
    }
  }
  let maxHeight = 0;
  for (let index = 1; index < positions.length; index += 3) maxHeight = Math.max(maxHeight, positions[index]);
  for (let index = 1; index < positions.length; index += 3) positions[index] /= maxHeight;
  const geometry = new THREE.BufferGeometry();
  geometry.name = `backdrop-landform-${["ridge", "mesa", "summit", "saddle"][shape]}`;
  geometry.userData.backdropLandformVariant = shape;
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const colors: number[] = [];
  const normals = geometry.getAttribute("normal");
  for (let index = 0; index < positions.length / 3; index += 1) {
    const x = positions[index * 3], y = positions[index * 3 + 1], z = positions[index * 3 + 2];
    const strata = Math.sin(y * 39 + x * 2.7 + Math.sin(z * 5) * 0.8);
    const channel = Math.pow(Math.max(0, Math.sin(Math.atan2(z, x) * 8 + phase + y * 1.4)), 6);
    const cliff = 1 - smoothstep(0.35, 0.8, normals.getY(index));
    const shade = 0.88 + strata * 0.043 - channel * cliff * 0.055;
    // Neutral mineral tint keeps both instanced biome colors and slope-based
    // vegetation readable; vertex variation survives failed atlas downloads.
    colors.push(shade * (1 + strata * 0.018), shade, shade * (0.975 - strata * 0.014));
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Shares the existing ImageGen terrain atlas, with physical-scale coordinates
 * even on an InstancedMesh. No new textures, lights, shader-time updates, or
 * displacement are introduced; geological detail changes albedo only.
 */
export function createBackdropLandformMaterial(THREE: typeof Three, vegetated: boolean): Three.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.97, metalness: 0 });
  material.name = vegetated ? "backdrop-vegetated-landform" : "backdrop-rock-landform";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.backdropVegetation = { value: vegetated ? 1 : 0 };
    shader.uniforms.backdropRockColor = { value: new THREE.Color(0x95998d) };
    shader.uniforms.backdropGrassColor = { value: new THREE.Color(0x73865c) };
    shader.vertexShader = `varying vec3 vBackdropTexturePosition;
      varying vec3 vBackdropTextureNormal;
      varying float vBackdropHeight;
      ${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      mat4 backdropTransform = modelMatrix;
      #ifdef USE_INSTANCING
        backdropTransform = modelMatrix * instanceMatrix;
      #endif
      vec3 backdropScale = max(vec3(length(backdropTransform[0].xyz),
        length(backdropTransform[1].xyz), length(backdropTransform[2].xyz)), vec3(0.0001));
      vBackdropTexturePosition = position * backdropScale;
      vBackdropTextureNormal = normalize(normal / backdropScale);
      vBackdropHeight = position.y;
    `);
    // The atlas registry calls this hook first, then prepends its own varying
    // declarations. These aliases therefore redirect *uses*, not declarations,
    // to scale-aware local coordinates. They remain harmless without an atlas.
    // Rotation/translation deliberately do not slide the texture over instances.
    shader.fragmentShader = `uniform float backdropVegetation;
      uniform vec3 backdropRockColor;
      uniform vec3 backdropGrassColor;
      varying vec3 vBackdropTexturePosition;
      varying vec3 vBackdropTextureNormal;
      varying float vBackdropHeight;
      #define vGeneratedPosition vBackdropTexturePosition
      #define vGeneratedNormal vBackdropTextureNormal
      ${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      vec3 backdropP = vBackdropTexturePosition;
      float backdropSlope = abs(normalize(vBackdropTextureNormal).y);
      float backdropGrass = backdropVegetation * smoothstep(0.39, 0.76, backdropSlope)
        * (1.0 - 0.57 * smoothstep(0.61, 0.95, vBackdropHeight));
      float backdropStrata = sin(backdropP.y * 0.61
        + sin(backdropP.x * 0.071 + backdropP.z * 0.093) * 0.75);
      float backdropCrack = 1.0 - smoothstep(0.06, 0.24, abs(sin(backdropP.x * 0.31
        + backdropP.z * 0.23 + sin(backdropP.y * 0.21 + backdropP.x * 0.13) * 0.79)));
      float backdropGrain = sin(backdropP.x * 1.47 + backdropP.z * 1.83)
        * sin(backdropP.y * 1.61 - backdropP.z * 1.23);
      float backdropDetail = (0.94 + backdropStrata * 0.063 + backdropGrain * 0.025)
        * (1.0 - backdropCrack * 0.19 * (1.0 - backdropGrass) * (1.0 - backdropSlope * 0.5));
      diffuseColor.rgb *= mix(backdropRockColor, backdropGrassColor, backdropGrass) * backdropDetail;
    `);
  };
  // Both vegetation choices share a shader; only uniforms and atlas tiles differ.
  material.customProgramCacheKey = () => "backdrop-landform-v1";
  return markGeneratedSurface(material, vegetated ? "grass" : "stone", "local");
}
