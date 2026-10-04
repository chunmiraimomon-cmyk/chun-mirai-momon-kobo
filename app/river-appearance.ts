import type * as Three from "three";

type RiverSurfaceOptions = {
  length: number;
  width: number;
  direction?: number;
  offset?: number;
  rapids?: number;
  fadeEnds?: boolean;
  junction?: "upstream" | "downstream";
};

// All movement below is shading only: river footprints, heights, crossings and
// the forces applied to racers stay owned by the existing simulation.
export function finishRiverSurface(
  THREE: typeof Three,
  material: Three.MeshPhysicalMaterial,
  clock: { value: number },
  options: RiverSurfaceOptions,
) {
  material.color.setHex(0x327d76);
  material.emissive.setHex(0x000000);
  material.emissiveIntensity = 0;
  material.roughness = 0.33;
  material.metalness = 0.02;
  material.transmission = 0;
  material.clearcoat = 0.4;
  material.clearcoatRoughness = 0.28;
  material.envMapIntensity = 0.6;
  const coordinates = {
    size: { value: new THREE.Vector2(options.length, options.width) },
    offset: { value: options.offset ?? 0 },
  };
  material.userData.riverCoordinates = coordinates;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.riverClock = clock;
    shader.uniforms.riverSize = coordinates.size;
    shader.uniforms.riverDirection = { value: options.direction ?? 1 };
    shader.uniforms.riverOffset = coordinates.offset;
    shader.uniforms.riverRapids = { value: options.rapids ?? 0.2 };
    shader.uniforms.riverDeep = { value: new THREE.Color(0x164b50) };
    shader.uniforms.riverShallow = { value: new THREE.Color(0x548573) };
    shader.uniforms.riverFoam = { value: new THREE.Color(0xb7c7b7) };
    shader.vertexShader = "varying vec2 vRiverUV;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvRiverUV = uv;");
    shader.fragmentShader = `varying vec2 vRiverUV;
      uniform float riverClock, riverDirection, riverOffset, riverRapids;
      uniform vec2 riverSize;
      uniform vec3 riverDeep, riverShallow, riverFoam;
      float riverHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float riverNoise(vec2 p) {
        vec2 cell = floor(p), f = fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(mix(riverHash(cell),riverHash(cell+vec2(1.0,0.0)),f.x),
          mix(riverHash(cell+vec2(0.0,1.0)),riverHash(cell+vec2(1.0,1.0)),f.x),f.y);
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      vec2 riverP = vec2(vRiverUV.x * riverSize.x + riverOffset, vRiverUV.y * riverSize.y);
      float riverS = riverP.x - riverClock * riverDirection * 3.1;
      float riverTurbulence = riverNoise(vec2(riverS * 0.3, riverP.y * 0.6));
      float riverWaveA = sin(riverS * 2.6 + sin(riverP.y * 1.7) * 0.9 + riverTurbulence * 5.0);
      float riverWaveB = sin(riverS * 1.15 - riverP.y * 3.7 + riverClock * 0.45);
      float riverWaveC = sin(riverS * 0.38 + riverP.y * 1.25);
      float riverHeight = riverWaveA * 0.018 + riverWaveB * 0.012 + riverTurbulence * 0.045;
      float riverEdge = min(vRiverUV.y, 1.0 - vRiverUV.y);
      float riverBank = 1.0 - smoothstep(0.025, 0.22, riverEdge);
      float riverEddy = riverNoise(vec2(riverS * 0.14, riverP.y * 0.8));
      float riverDepth = clamp(0.72 - riverBank * 0.58 + (riverTurbulence - 0.5) * 0.32, 0.0, 1.0);
      diffuseColor.rgb = mix(riverShallow, riverDeep, riverDepth);
      diffuseColor.rgb *= 0.97 + 0.025 * riverWaveB;
      float riverStreak = smoothstep(0.64, 0.84, riverNoise(vec2(riverS * 0.28, riverP.y * 2.2)))
        * smoothstep(0.50, 0.82, riverEddy);
      float riverFoamMask = riverStreak * (riverBank * 0.40 + riverRapids * 0.12);
      diffuseColor.rgb = mix(diffuseColor.rgb, riverFoam, riverFoamMask);
      diffuseColor.a *= smoothstep(0.0, 0.028, riverEdge) * mix(0.76, 1.0, riverDepth);
      ${options.fadeEnds ? "diffuseColor.a *= smoothstep(0.0, 0.016, min(vRiverUV.x, 1.0-vRiverUV.x));" : ""}
      ${options.junction === "upstream" ? "diffuseColor.a *= smoothstep(-107.0, -103.0, riverP.x);" : ""}
      ${options.junction === "downstream" ? "diffuseColor.a *= 1.0 - smoothstep(-107.0, -103.0, riverP.x);" : ""}
    `);
    // Surface-gradient bump normal, evaluated in view space. No displaced
    // vertices, new render targets, reflection cameras or per-frame recompiles.
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>", `#include <normal_fragment_begin>
      vec3 riverDx = dFdx(-vViewPosition), riverDy = dFdy(-vViewPosition);
      vec3 riverR1 = cross(riverDy, normal), riverR2 = cross(normal, riverDx);
      float riverDet = dot(riverDx, riverR1);
      vec3 riverGradient = sign(riverDet) * (dFdx(riverHeight) * riverR1 + dFdy(riverHeight) * riverR2);
      normal = normalize(max(abs(riverDet), 0.000001) * normal - riverGradient);
      nonPerturbedNormal = normal;
    `);
  };
  material.customProgramCacheKey = () => `river-surface-v3:${Boolean(options.fadeEnds)}:${options.junction ?? "none"}`;
}

export function makeRiverBedMaterial(THREE: typeof Three) {
  const material = new THREE.MeshStandardMaterial({ color: 0x62634b, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = "varying vec3 vRiverBed;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvRiverBed = position;");
    shader.fragmentShader = "varying vec3 vRiverBed;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      vec2 riverBedCell = vRiverBed.xz * 3.8;
      float stoneHash = fract(sin(dot(floor(riverBedCell), vec2(127.1,311.7))) * 43758.5453);
      vec2 stoneCenter = vec2(0.25 + stoneHash * 0.5, 0.25 + fract(stoneHash * 7.31) * 0.5);
      float pebble = 1.0 - smoothstep(0.08, 0.22, length(fract(riverBedCell)-stoneCenter));
      float bedDetail = 1.0 - smoothstep(0.15, 0.8, length(fwidth(riverBedCell)));
      diffuseColor.rgb *= 0.91 + (stoneHash - 0.5) * bedDetail * 0.1 + pebble * bedDetail * 0.14;
    `);
  };
  material.customProgramCacheKey = () => "river-bed-v1";
  return material;
}

export function makeRiverFoamTexture(THREE: typeof Three) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const paint = canvas.getContext("2d")!;
  const glow = paint.createRadialGradient(32, 32, 4, 32, 32, 29);
  glow.addColorStop(0, "rgba(218,229,213,0.8)");
  glow.addColorStop(0.4, "rgba(218,229,213,0.55)");
  glow.addColorStop(1, "rgba(218,229,213,0)");
  paint.fillStyle = glow;
  paint.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}
