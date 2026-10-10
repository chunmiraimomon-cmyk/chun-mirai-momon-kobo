import type * as Three from "three";
import { createCityBackdrop } from "./backdrop-architecture";
import { createNatureBackdrop, createCityPlantingBackdrop } from "./backdrop-nature";
import { createSkySeaBackdrop } from "./backdrop-sky-sea";

/** Break up the large ground plane at landscape scale. This is albedo only;
 * the surface remains at its original height and is never used for landing. */
export function applyBackdropGroundDetail(material: Three.MeshStandardMaterial, woodland: boolean) {
  material.onBeforeCompile = shader => {
    shader.vertexShader = "varying vec2 backdropGroundXZ;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>",
      "#include <begin_vertex>\nbackdropGroundXZ=(modelMatrix*vec4(position,1.0)).xz;");
    shader.fragmentShader = `varying vec2 backdropGroundXZ;
      float bgHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float bgNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(bgHash(i),bgHash(i+vec2(1.,0.)),f.x),mix(bgHash(i+vec2(0.,1.)),bgHash(i+vec2(1.)),f.x),f.y);}
      ${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      float bgLarge=bgNoise(backdropGroundXZ*.016);
      float bgPatch=bgNoise(backdropGroundXZ*.079+vec2(13.4,7.1));
      float bgSmall=bgNoise(backdropGroundXZ*.42);
      float bgSoil=smoothstep(.44,.76,bgPatch*.55+bgLarge*.45);
      vec3 bgTint=mix(vec3(.74,.86,.63),vec3(1.05,.82,.61),bgSoil*${woodland ? "0.78" : "0.38"});
      diffuseColor.rgb *= bgTint*(.72+bgLarge*.24+bgSmall*.16);
    `);
  };
  material.customProgramCacheKey = () => `landscape-ground-v2-${woodland ? "forest" : "park"}`;
}

type BackdropCourse = {
  length: number;
  pointAt: (u: number, lane?: number) => { x: number; y: number; z: number; heading: number };
  isClearFromRoad: (x: number, z: number, clearance: number, ignoreU?: number, ignoreRange?: number) => boolean;
};

export type CourseBackdropStats = {
  group: Three.Group;
  drawCalls: number;
  instances: number;
  vertices: number;
  triangles: number;
  maxClearanceRadius: number;
};

/** Visual scenery only. Builders sample the road but never change the course,
 * physics, hazards, gameplay random stream or race state. */
export function createCourseBackdrop(
  THREE: typeof Three, scene: Three.Scene, course: BackdropCourse, theme: string, groundY: number,
): CourseBackdropStats {
  const resolved = ["city", "jungle", "river", "pirate", "starlight", "cloud"].includes(theme) ? theme : "city";
  const group = resolved === "city" ? createCityBackdrop(THREE, course, groundY)
    : resolved === "jungle" || resolved === "river" ? createNatureBackdrop(THREE, course, resolved, groundY)
      : createSkySeaBackdrop(THREE, course, resolved as "pirate" | "starlight" | "cloud", groundY);
  group.name = `course-backdrop-${resolved}`;
  group.userData.visualOnly = true;
  if (resolved === "city") {
    const buildings = group.userData.backdropAnchors as { x: number; z: number; footprint: number }[];
    const planting = createCityPlantingBackdrop(THREE, {
      length: course.length,
      pointAt: (u, lane) => course.pointAt(u, lane),
      isClearFromRoad: (x, z, margin) => course.isClearFromRoad(x, z, margin)
        && buildings.every(b => Math.hypot(b.x - x, b.z - z) > b.footprint + Math.max(0, margin - 18) + 2),
    }, groundY);
    group.add(planting);
    group.userData.backdropAnchors.push(...planting.userData.backdropAnchors);
    group.userData.backdropReady = planting.userData.backdropReady;
  }
  let drawCalls = 0, instances = 0, vertices = 0, triangles = 0;
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Points)) return;
    const count = object instanceof THREE.InstancedMesh ? object.count : 1;
    const positionCount = object.geometry.getAttribute("position").count;
    drawCalls += Array.isArray(object.material) ? object.geometry.groups.length : 1;
    instances += count;
    vertices += positionCount * count;
    if (object instanceof THREE.Mesh) triangles += (object.geometry.index?.count ?? positionCount) / 3 * count;
  });
  const anchors = group.userData.backdropAnchors as { footprint: number }[] ?? [];
  const maxClearanceRadius = anchors.reduce((max, item) => Math.max(max, item.footprint + 18), 0);
  const stats = { group, drawCalls, instances, vertices, triangles, maxClearanceRadius };
  group.userData.courseBackdropStats = { drawCalls, instances, vertices, triangles, maxClearanceRadius };
  scene.add(group);
  return stats;
}
