import type * as Three from "three";
import { createBackdropCloudGeometry, createBackdropCloudMaterial } from "./backdrop-clouds";
import { createPirateHorizonShip } from "./pirate-horizon";

type SkySeaCourse = {
  length: number;
  pointAt: (u: number, lane?: number) => { x: number; y: number; z: number; heading: number };
  isClearFromRoad: (x: number, z: number, margin: number, ignoreU?: number, ignoreRange?: number) => boolean;
};
type Anchor = { x: number; z: number; footprint: number; baseY: number; kind: string };
type CloudPlacement = { x: number; y: number; z: number; sx: number; sy: number; sz: number; yaw: number };

const MOON_CRATERS = Array.from({ length: 19 }, (_, index) => {
  const y = 1 - (index + 0.5) / 19 * 2;
  const angle = index * 2.399963229728653;
  const radial = Math.sqrt(1 - y * y);
  return { x: Math.cos(angle) * radial, y, z: Math.sin(angle) * radial, radius: 0.08 + (index % 5) * 0.023 };
});

/** Replacement for the existing, cycle-controlled 25-unit hero moon, not a
 * second moon. Large relief is geometry; small crater bowls/rims are shading.
 */
export function createHeroMoonGeometry(THREE: typeof Three): Three.BufferGeometry {
  const geometry = new THREE.SphereGeometry(25, 64, 40);
  const p = geometry.getAttribute("position");
  for (let index = 0; index < p.count; index++) {
    const length = Math.hypot(p.getX(index), p.getY(index), p.getZ(index));
    const x = p.getX(index) / length, y = p.getY(index) / length, z = p.getZ(index) / length;
    let relief = 0;
    for (const crater of MOON_CRATERS) {
      const d = Math.hypot(x - crater.x, y - crater.y, z - crater.z) / crater.radius;
      relief += -Math.exp(-d * d * 3.8) * 0.28 + Math.exp(-(((d - 0.92) * 6.5) ** 2)) * 0.15;
    }
    const radius = 25 + relief;
    p.setXYZ(index, x * radius, y * radius, z * radius);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.name = "hero-moon-cratered-relief";
  return geometry;
}

/** Standard opacity/emissive controls stay compatible with the existing night
 * cycle. Do not add the old stone-atlas tag: this already has lunar albedo.
 */
export function createHeroMoonMaterial(THREE: typeof Three): Three.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: 0xd2dff3, emissive: 0x7187b1, emissiveIntensity: 0,
    roughness: 0.98, metalness: 0, transparent: true, opacity: 0,
  });
  const craterTerms = MOON_CRATERS.map(c => `relief += lunarCrater(p, vec3(${c.x.toFixed(5)}, ${c.y.toFixed(5)}, ${c.z.toFixed(5)}), ${c.radius.toFixed(5)});`).join("\n");
  material.onBeforeCompile = shader => {
    shader.vertexShader = "varying vec3 vLunarLocal;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvLunarLocal = position;");
    shader.fragmentShader = `varying vec3 vLunarLocal;
      float lunarCrater(vec3 p, vec3 center, float radius){
        float d=length(p-center)/radius;
        return -exp(-d*d*3.8)*.22+exp(-pow((d-.92)*6.5,2.0))*.16;
      }
      ${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      vec3 p = normalize(vLunarLocal);
      float relief = 0.0;
      ${craterTerms}
      float maria = smoothstep(.15,.82,sin(p.x*7.0+p.y*3.0)*.48+sin(p.z*8.0-p.y*4.0)*.32+.40);
      diffuseColor.rgb *= (1.0+relief)*(1.0-maria*.23);
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
      // Screen-space lunar phase keeps a readable, softly curved terminator
      // instead of the old uniformly glowing white stone sphere.
      float moonPhase=smoothstep(-.32,.26,dot(normal,normalize(vec3(-.64,.28,.72))));
      outgoingLight *= mix(.085,1.0,moonPhase);
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey = () => "hero-moon-craters-terminator-v1";
  material.name = "blue-white-lavender-cratered-moon";
  return material;
}

function markScenery<T extends Three.Object3D>(object: T) {
  object.userData.visualOnly = true;
  if ((object as unknown as Three.Mesh).isMesh) {
    object.castShadow = false;
    object.receiveShadow = false;
  }
  return object;
}

/** Scene-owned, render-only sky/sea composition. No course writes, gameplay RNG,
 * collision surfaces, lights, RAF or independent resource lifetime.
 * STARLIGHT preserves empty space below the road and the existing hero moon.
 */
export function createSkySeaBackdrop(
  THREE: typeof Three, course: SkySeaCourse, theme: "starlight" | "cloud" | "pirate", groundY: number,
): Three.Group {
  const group = markScenery(new THREE.Group());
  group.name = `crafted-${theme}-backdrop`;
  const anchors: Anchor[] = [];
  group.userData.backdropAnchors = anchors;
  const samples = Array.from({ length: 64 }, (_, index) => course.pointAt(index / 64));
  const bounds = samples.reduce((b, p) => ({
    minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x),
    minY: Math.min(b.minY, p.y), maxY: Math.max(b.maxY, p.y),
    minZ: Math.min(b.minZ, p.z), maxZ: Math.max(b.maxZ, p.z),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity });
  const centerX = (bounds.minX + bounds.maxX) * 0.5, centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
  const extentX = Math.max(45, (bounds.maxX - bounds.minX) * 0.5);
  const extentZ = Math.max(45, (bounds.maxZ - bounds.minZ) * 0.5);

  if (theme === "pirate") {
    // The existing ship factory temporarily parents to its supplied Scene.
    // Reparent immediately so normal scene disposal owns every ship resource.
    const ship = createPirateHorizonShip(THREE, new THREE.Scene(), course, groundY);
    group.add(ship);
    if (ship.userData.backdropAnchor) anchors.push(ship.userData.backdropAnchor as Anchor);
    group.userData.vesselCount = ship.userData.vesselCount;
  } else if (theme === "cloud") {
    const placements: CloudPlacement[][] = [[], [], [], []];
    const angles = [0.24, 1.03, 1.86, 2.64, 3.44, 4.15, 4.91, 5.67];
    const widths = [39, 57, 26, 46, 32, 61, 24, 43];
    const seaY = Math.min(bounds.minY - 21, bounds.maxY - 39);
    angles.forEach((angle, index) => {
      const size = widths[index];
      let spot: { x: number; z: number } | undefined;
      for (let attempt = 0; attempt < 4; attempt++) {
        const distance = size + 37 + (index % 3) * 14 + attempt * 22;
        const x = centerX + Math.cos(angle) * (extentX + distance);
        const z = centerZ + Math.sin(angle) * (extentZ + distance);
        if (course.isClearFromRoad(x, z, size + 24)) { spot = { x, z }; break; }
      }
      if (!spot) return;
      const sy = 9 + (index % 3) * 4;
      const y = seaY - (index % 3) * 5;
      anchors.push({ ...spot, footprint: size, baseY: y - sy, kind: "cloud-bank" });
      placements[index % 4].push({ ...spot, y, sx: size, sy, sz: size * (0.57 + (index % 3) * 0.075), yaw: angle + 0.35 });
    });

    // Just two deliberate overlaps, starting outside lanes +/-8. Check the
    // central strip against the actual rotated ellipse, plus neighboring roads.
    const overlaps: Array<{ x: number; y: number; z: number; progress: number; lane: number; radius: number; innerLane: number }> = [];
    group.userData.cloudOverlapAnchors = overlaps;
    for (const [index, u] of [0.16, 0.64].entries()) {
      const side = index ? -1 : 1;
      const radius = index ? 7.2 : 6.5;
      for (const innerLane of [8.15, 8.8, 9.4]) {
        const lane = side * (innerLane + radius);
        const p = course.pointAt(u, lane);
        if (!course.isClearFromRoad(p.x, p.z, 16, u, 0.06)) continue;
        const cos = Math.cos(p.heading), sin = Math.sin(p.heading);
        let clear = true;
        for (let step = -5; step <= 5 && clear; step++) {
          for (const centralLane of [-8, 0, 8]) {
            const road = course.pointAt(u + step * 3 / Math.max(1, course.length), centralLane);
            const dx = road.x - p.x, dz = road.z - p.z;
            const localX = dx * cos - dz * sin, localZ = dx * sin + dz * cos;
            if ((localX / radius) ** 2 + (localZ / 12) ** 2 < 1.005) { clear = false; break; }
          }
        }
        if (!clear) continue;
        const y = p.y - 3.0;
        placements[index].push({ x: p.x, y, z: p.z, sx: radius, sy: 3.5, sz: 12, yaw: p.heading });
        overlaps.push({ x: p.x, y, z: p.z, progress: u, lane, radius, innerLane });
        break;
      }
    }
    const material = createBackdropCloudMaterial(THREE);
    const dummy = new THREE.Object3D();
    placements.forEach((items, variant) => {
      if (!items.length) return;
      const geometry = createBackdropCloudGeometry(THREE, variant);
      const mesh = markScenery(new THREE.InstancedMesh(geometry, material, items.length));
      mesh.name = `luminous-cumulus-envelope-${variant}`;
      items.forEach((p, index) => {
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, p.yaw, 0);
        dummy.scale.set(p.sx, p.sy, p.sz);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      group.add(mesh);
    });
    if (!group.children.length) material.dispose();
  } else {
    // An upper-sky galactic veil, not opaque puffs underneath the course. The
    // original cycle-controlled moon remains the sole large celestial object.
    const night = { value: 0 };
    const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
    const segments = 96, rows = 6;
    for (let row = 0; row <= rows; row++) {
      const v = row / rows;
      for (let segment = 0; segment <= segments; segment++) {
        const u = segment / segments, angle = -0.74 * Math.PI + u * Math.PI * 1.48;
        const radius = 355 + Math.sin(u * Math.PI) * 14;
        const height = bounds.maxY + 93 + Math.sin(u * Math.PI) * 110 + (v - 0.5) * (26 + 9 * Math.sin(u * Math.PI));
        positions.push(centerX + Math.sin(angle) * radius, height, centerZ - Math.cos(angle) * radius);
        uvs.push(u, v);
        if (row < rows && segment < segments) {
          const a = row * (segments + 1) + segment;
          indices.push(a, a + 1, a + segments + 1, a + 1, a + segments + 2, a + segments + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.ShaderMaterial({
      uniforms: { nightStrength: night },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, fog: false,
      vertexShader: "varying vec2 veilUv; void main(){veilUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      fragmentShader: `uniform float nightStrength;varying vec2 veilUv;
        void main(){
          float crossFade=exp(-pow((veilUv.y-.5)*5.2,2.0));
          float ends=smoothstep(0.0,.12,veilUv.x)*(1.0-smoothstep(.87,1.0,veilUv.x));
          float folds=.72+.16*sin(veilUv.x*27.0+veilUv.y*4.0)+.08*sin(veilUv.x*61.0-veilUv.y*9.0);
          vec3 silver=mix(vec3(.27,.32,.47),vec3(.42,.38,.54),veilUv.x);
          gl_FragColor=vec4(silver,crossFade*ends*folds*nightStrength*.15);
          #include <colorspace_fragment>
        }`,
    });
    const veil = markScenery(new THREE.Mesh(geometry, material));
    veil.name = "upper-silver-lavender-galactic-veil";
    veil.renderOrder = -10;
    group.add(veil);

    const brightPositions: number[] = [], brightColors: number[] = [];
    const starColor = new THREE.Color();
    for (let index = 0; index < 28; index++) {
      const u = (index + 0.37) / 28;
      const angle = -0.70 * Math.PI + u * Math.PI * 1.40;
      const radius = 342;
      brightPositions.push(centerX + Math.sin(angle) * radius,
        bounds.maxY + 112 + Math.sin(u * Math.PI) * 110 + Math.sin(index * 2.79) * 30,
        centerZ - Math.cos(angle) * radius);
      starColor.setHex(index % 5 ? 0xcbdfff : 0xe5d4ff);
      brightColors.push(starColor.r, starColor.g, starColor.b);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(brightPositions, 3));
    starGeometry.setAttribute("color", new THREE.Float32BufferAttribute(brightColors, 3));
    const starsMaterial = new THREE.ShaderMaterial({
      uniforms: { nightStrength: night }, vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
      vertexShader: `varying vec3 starColor;void main(){starColor=color;vec4 p=modelViewMatrix*vec4(position,1.0);
        gl_Position=projectionMatrix*p;gl_PointSize=clamp(1100.0/max(80.0,-p.z),2.0,5.5);}`,
      fragmentShader: `uniform float nightStrength;varying vec3 starColor;void main(){
        float r=length(gl_PointCoord-vec2(.5));float core=1.0-smoothstep(.02,.19,r);
        float halo=exp(-r*r*24.0)*.25;gl_FragColor=vec4(starColor,(core+halo)*nightStrength*.62);
        #include <colorspace_fragment>
      }`,
    });
    const stars = markScenery(new THREE.Points(starGeometry, starsMaterial));
    stars.name = "sparse-blue-white-galactic-guide-stars";
    group.add(stars);
    // Optional presentation-only night gate. Root passes the existing sky-cycle
    // scalar; this changes one shared number and creates no frame allocations.
    group.userData.setNightStrength = (strength: number) => {
      night.value = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 0;
    };
    group.userData.nightStrength = night;
    group.userData.emptyLowerSpace = true;
  }

  let drawCalls = 0, instances = 0, vertices = 0, triangles = 0;
  group.traverse(object => {
    const mesh = object as Three.Mesh;
    const points = object as Three.Points;
    if (!mesh.isMesh && !points.isPoints) return;
    const count = (mesh as Three.InstancedMesh).isInstancedMesh ? (mesh as Three.InstancedMesh).count : 1;
    drawCalls++;
    instances += count;
    vertices += mesh.geometry.getAttribute("position").count * count;
    if (mesh.isMesh) triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3 * count;
  });
  group.userData.skySeaBackdropStats = { drawCalls, instances, vertices, triangles };
  return group;
}
