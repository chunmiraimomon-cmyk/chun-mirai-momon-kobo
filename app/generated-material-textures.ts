import type * as Three from "three";

// ImageGen albedo artwork, packed as five shared 1024px atlases. These are
// color/roughness details only: no geometry, displacement or collision changes.
export const GENERATED_ATLAS_URLS = {
  kart: "/textures/generated-v1/kart.webp",
  terrain: "/textures/generated-v1/terrain.webp",
  organic: "/textures/generated-v1/organic.webp",
  nautical: "/textures/generated-v1/nautical.webp",
  specialty: "/textures/generated-v1/specialty.webp",
} as const;
type AtlasName = keyof typeof GENERATED_ATLAS_URLS;
type Mapping = "local" | "world" | "uv";
type Recipe = { atlas: AtlasName; tile: number; mean: number[]; strength: number; repeat: number[] };
export const GENERATED_SURFACES = {
  paint: { atlas: "kart", tile: 0, mean: [0.305, 0.3075, 0.3106], strength: 0.62, repeat: [0.75, 0.75] },
  rubber: { atlas: "kart", tile: 1, mean: [0.0366, 0.0372, 0.0384], strength: 0.9, repeat: [3, 1] },
  metal: { atlas: "kart", tile: 2, mean: [0.3379, 0.3361, 0.3461], strength: 0.45, repeat: [2, 2] },
  fabric: { atlas: "kart", tile: 3, mean: [0.0343, 0.0359, 0.038], strength: 0.6, repeat: [2, 2] },
  asphalt: { atlas: "terrain", tile: 0, mean: [0.156, 0.1553, 0.1587], strength: 0.5, repeat: [0.42, 0.42] },
  earth: { atlas: "terrain", tile: 1, mean: [0.2492, 0.1398, 0.0764], strength: 0.63, repeat: [0.26, 0.26] },
  grass: { atlas: "terrain", tile: 2, mean: [0.0811, 0.1851, 0.0221], strength: 0.68, repeat: [0.24, 0.24] },
  stone: { atlas: "terrain", tile: 3, mean: [0.1983, 0.1987, 0.2056], strength: 0.5, repeat: [0.32, 0.32] },
  bark: { atlas: "organic", tile: 0, mean: [0.2009, 0.0851, 0.0386], strength: 0.85, repeat: [2, 1] },
  leaf: { atlas: "organic", tile: 1, mean: [0.0597, 0.1287, 0.0216], strength: 0.65, repeat: [1, 1] },
  fur: { atlas: "organic", tile: 2, mean: [0.3824, 0.2838, 0.2233], strength: 0.6, repeat: [2, 2] },
  skin: { atlas: "organic", tile: 3, mean: [0.58, 0.109, 0.0951], strength: 0.72, repeat: [2, 2] },
  wood: { atlas: "nautical", tile: 0, mean: [0.2212, 0.1084, 0.054], strength: 0.82, repeat: [0.18, 0.18] },
  canvas: { atlas: "nautical", tile: 1, mean: [0.619, 0.5067, 0.3691], strength: 0.56, repeat: [0.16, 0.16] },
  rope: { atlas: "nautical", tile: 2, mean: [0.3429, 0.1833, 0.0764], strength: 0.72, repeat: [3, 1] },
  iron: { atlas: "nautical", tile: 3, mean: [0.0906, 0.0691, 0.0611], strength: 0.7, repeat: [1, 1] },
  cloud: { atlas: "specialty", tile: 0, mean: [0.5578, 0.5945, 0.6717], strength: 0.56, repeat: [0.09, 0.09] },
  ice: { atlas: "specialty", tile: 1, mean: [0.393, 0.4692, 0.5846], strength: 0.4, repeat: [0.18, 0.18] },
  endgrain: { atlas: "specialty", tile: 2, mean: [0.6107, 0.3642, 0.1805], strength: 0.83, repeat: [1, 1] },
  water: { atlas: "specialty", tile: 3, mean: [0.1233, 0.236, 0.3775], strength: 0.45, repeat: [0.09, 0.09] },
} satisfies Record<string, Recipe>;
export type GeneratedSurface = keyof typeof GENERATED_SURFACES;
type SurfaceTag = { kind: GeneratedSurface; mapping: Mapping; repeat?: [number, number] };

export function markGeneratedSurface<T extends Three.Material>(
  material: T, kind: GeneratedSurface, mapping: Mapping = "local", repeat?: [number, number],
): T {
  material.userData.generatedSurface = { kind, mapping, repeat } satisfies SurfaceTag;
  return material;
}

export function createGeneratedTextureSet(THREE: typeof Three, renderer: Three.WebGLRenderer) {
  let disposed = false;
  const atlases = new Map<AtlasName, { texture: Three.Texture; ready: { value: number } }>();
  const applied = new WeakSet<Three.Material>();
  const waiting: Promise<void>[] = [];
  const finishLoading: (() => void)[] = [];
  const loader = new THREE.TextureLoader();
  const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

  // Load only atlases actually used by this scene, once per atlas. Missing
  // artwork degrades to the original colors, never stalls the race indefinitely.
  const getAtlas = (name: AtlasName) => {
    const existing = atlases.get(name);
    if (existing) return existing;
    const ready = { value: 0 };
    let complete!: () => void;
    waiting.push(new Promise<void>((resolve) => { complete = resolve; }));
    const timer = setTimeout(() => complete(), 8000);
    const finish = () => { clearTimeout(timer); complete(); };
    finishLoading.push(finish);
    const texture = loader.load(GENERATED_ATLAS_URLS[name], (loaded) => {
      if (disposed) loaded.dispose();
      else ready.value = 1;
      finish();
    }, undefined, () => {
      console.warn(`[MOMON textures] Could not load ${name}; using base materials.`);
      finish();
    });
    texture.name = `imagegen-${name}-v1`;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = anisotropy;
    const atlas = { texture, ready };
    atlases.set(name, atlas);
    return atlas;
  };

  const apply = (material: Three.Material) => {
    const tag = material.userData.generatedSurface as SurfaceTag | undefined;
    if (!tag || applied.has(material)) return;
    applied.add(material);
    const recipe = GENERATED_SURFACES[tag.kind];
    const atlas = getAtlas(recipe.atlas);
    const previousCompile = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, context) => {
      previousCompile.call(material, shader, context);
      shader.uniforms.generatedAtlas = { value: atlas.texture };
      shader.uniforms.generatedReady = atlas.ready;
      shader.uniforms.generatedTile = { value: new THREE.Vector2((recipe.tile % 2) * 0.5, recipe.tile < 2 ? 0.5 : 0) };
      shader.uniforms.generatedMean = { value: new THREE.Vector3().fromArray(recipe.mean) };
      shader.uniforms.generatedRepeat = { value: new THREE.Vector2().fromArray(tag.repeat ?? recipe.repeat) };
      shader.uniforms.generatedStrength = { value: recipe.strength };
      shader.vertexShader = "varying vec3 vGeneratedPosition; varying vec3 vGeneratedNormal; varying vec2 vGeneratedUV;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
        vGeneratedPosition = ${tag.mapping === "world" ? "(modelMatrix * vec4(position, 1.0)).xyz" : "position"};
        vGeneratedNormal = normal; vGeneratedUV = uv;
      `);
      shader.fragmentShader = `uniform sampler2D generatedAtlas;
        uniform float generatedReady; uniform float generatedStrength;
        uniform vec2 generatedTile; uniform vec2 generatedRepeat; uniform vec3 generatedMean;
        varying vec3 vGeneratedPosition; varying vec3 vGeneratedNormal; varying vec2 vGeneratedUV;
        ${shader.fragmentShader}`;
      const coordinates = tag.mapping === "uv" ? "vGeneratedUV" : tag.mapping === "world" ? "vGeneratedPosition.xz" :
        "(gn.y >= gn.x && gn.y >= gn.z ? vGeneratedPosition.xz : (gn.x > gn.z ? vGeneratedPosition.zy : vGeneratedPosition.xy))";
      shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
        vec3 gn = abs(vGeneratedNormal);
        vec2 generatedCoords = ${coordinates} * generatedRepeat;
        // Mirror each tile and inset by four texels: no neighboring atlas cell
        // at the seam. Fade unresolved detail before coarse mips can bleed.
        vec2 generatedMirror = 1.0 - abs(mod(generatedCoords, 2.0) - 1.0);
        vec3 generatedSample = texture2D(generatedAtlas, generatedTile + 0.004 + generatedMirror * 0.492).rgb;
        vec3 generatedDetail = clamp(generatedSample / generatedMean, vec3(0.32), vec3(1.9));
        float generatedGrey = dot(generatedDetail, vec3(0.2126, 0.7152, 0.0722));
        generatedDetail = mix(vec3(generatedGrey), generatedDetail, 0.28);
        float generatedFade = 1.0 - smoothstep(0.015, 0.10, max(length(dFdx(generatedCoords)), length(dFdy(generatedCoords))));
        diffuseColor.rgb *= mix(vec3(1.0), generatedDetail, generatedStrength * generatedReady * generatedFade);
      `);
    };
    // Tile choice, tint and repeat are uniforms, not new shader variants.
    material.customProgramCacheKey = () => `${previousKey}:imagegen-v1:${tag.mapping}`;
    material.needsUpdate = true;
  };

  return {
    attach(root: Three.Object3D) {
      if (disposed) return;
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(apply);
      });
    },
    // Call after attach() so it includes every requested atlas.
    ready() { return Promise.all(waiting); },
    dispose() {
      disposed = true;
      finishLoading.forEach((finish) => finish());
      atlases.forEach(({ texture }) => texture.dispose());
      atlases.clear();
    },
  };
}
