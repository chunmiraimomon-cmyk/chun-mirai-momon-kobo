import type * as Three from "three";

// Screenshot landmark: cabin-exit bend, before the 0.82 item row. Matched from
// that row's projection and the adjacent treasure chest; independent of CPUs.
export const PIRATE_BREACH_TRIGGER_PROGRESS = 0.783;
export const PIRATE_BREACH_SETTLED_MS = 800;

const DEBRIS_START_MS = 100;
const DEBRIS_END_MS = 2000;
const CHUNK_COUNT = 22;
const SPLINTER_COUNT = 34;
const FRAGMENT_COUNT = CHUNK_COUNT + SPLINTER_COUNT;
const RIM_COUNT = 16;
const TAU = Math.PI * 2;

/** Render-only vertical offset; never use this value to position attack hitboxes. */
export function getPirateBreachPose(ageMs: number): { riseOffset: number; revealed: boolean; debrisAgeMs: number } {
  const age = Number.isFinite(ageMs) ? ageMs : -1;
  if (age < 0) return { riseOffset: -34, revealed: false, debrisAgeMs: age - DEBRIS_START_MS };
  let riseOffset = 0;
  if (age < 500) {
    const t = age / 500;
    riseOffset = -34 + 35 * t * t * (3 - 2 * t);
  } else if (age < PIRATE_BREACH_SETTLED_MS) {
    const t = (age - 500) / (PIRATE_BREACH_SETTLED_MS - 500);
    riseOffset = 1 - t * t * (3 - 2 * t);
  }
  // Exactly zero after settling, so the original ongoing attack pose is intact.
  return { riseOffset, revealed: true, debrisAgeMs: age - DEBRIS_START_MS };
}

type Fragment = {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  sx: number; sy: number; sz: number;
  rx: number; ry: number; rz: number;
  spinX: number; spinY: number; spinZ: number;
  delay: number; lifetime: number; gravity: number;
};

// Indexed integer hashing is isolated from all race randomness, including when
// the effect is restarted or inspected at an arbitrary timestamp.
function fragmentVariation(index: number, salt: number) {
  let value = Math.imul(index + 1, 0x45d9f3b) ^ Math.imul(salt + 11, 0x27d4eb2d);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function makeBrokenPlankGeometry(THREE: typeof Three) {
  // Thick extruded timber, with several uneven teeth at each broken end. The
  // same small geometry serves chunky deck boards, thin splinters and the rim.
  const outline = new THREE.Shape();
  outline.moveTo(-0.5, -0.46);
  outline.lineTo(-0.18, -0.55);
  outline.lineTo(0.04, -0.39);
  outline.lineTo(0.25, -0.58);
  outline.lineTo(0.5, -0.45);
  outline.lineTo(0.5, 0.45);
  outline.lineTo(0.23, 0.56);
  outline.lineTo(0.06, 0.39);
  outline.lineTo(-0.2, 0.53);
  outline.lineTo(-0.5, 0.44);
  outline.closePath();
  const geometry = new THREE.ExtrudeGeometry(outline, { depth: 1, steps: 1, bevelEnabled: false, curveSegments: 1 });
  geometry.translate(0, 0, -0.5);
  geometry.rotateX(Math.PI / 2);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Local-space scenery only. The caller owns the anchor transform and clock;
 * this helper neither reads nor changes the course, racers, attacks or hull.
 * Two instanced draws, no new lights/textures, no allocations in update().
 */
export function createPirateBreachVisual(THREE: typeof Three, woodMaterial: Three.Material): {
  group: Three.Group;
  update: (ageMs: number) => void;
} {
  const group = new THREE.Group();
  group.name = "pirate-breach-visual";
  group.visible = false;
  group.userData.visualOnly = true;
  group.userData.pirateBreachStats = {
    drawCalls: 2, fragments: FRAGMENT_COUNT, chunkyPlanks: CHUNK_COUNT,
    splinters: SPLINTER_COUNT, rimInstances: RIM_COUNT,
  };

  const geometry = makeBrokenPlankGeometry(THREE);
  // Fade only our private clone; the live ship and persistent rim keep their
  // original opaque wood material and any existing generated wood texture.
  const flyingMaterial = woodMaterial.clone();
  const fullOpacity = flyingMaterial.opacity;
  flyingMaterial.transparent = true;
  flyingMaterial.depthWrite = false;
  flyingMaterial.userData.visualOnly = true;
  const flyingWood = new THREE.InstancedMesh(geometry, flyingMaterial, FRAGMENT_COUNT);
  flyingWood.name = "pirate-breach-flying-wood";
  flyingWood.visible = false;
  flyingWood.castShadow = false;
  flyingWood.receiveShadow = false;
  flyingWood.userData.visualOnly = true;
  flyingWood.userData.chunkCount = CHUNK_COUNT;
  flyingWood.userData.splinterCount = SPLINTER_COUNT;
  flyingWood.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // A fixed conservative bound covers every ballistic trajectory without
  // recomputing bounds (or allocating a sphere) in the animation loop.
  flyingWood.boundingSphere = new THREE.Sphere(new THREE.Vector3(2, 5, 0), 45);
  group.add(flyingWood);

  const rim = new THREE.InstancedMesh(geometry, woodMaterial, RIM_COUNT);
  rim.name = "pirate-breach-jagged-rim";
  rim.visible = false;
  rim.castShadow = false;
  rim.receiveShadow = false;
  rim.userData.visualOnly = true;
  group.add(rim);

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const fragments: Fragment[] = [];
  for (let i = 0; i < FRAGMENT_COUNT; i++) {
    const chunky = i < CHUNK_COUNT;
    const angle = i * 2.399963229728653;
    const radialSpeed = 4.5 + fragmentVariation(i, 0) * (chunky ? 7 : 11);
    fragments.push({
      x: 2.0 + Math.cos(angle) * (0.5 + fragmentVariation(i, 1) * 1.8),
      y: 0.18 + fragmentVariation(i, 2) * 0.7,
      z: Math.sin(angle) * (1.6 + fragmentVariation(i, 3) * 3.0),
      vx: 1.6 + Math.cos(angle) * radialSpeed,
      vy: (chunky ? 19 : 23) + fragmentVariation(i, 4) * 12,
      vz: Math.sin(angle) * radialSpeed,
      sx: chunky ? 0.7 + fragmentVariation(i, 5) * 0.95 : 0.12 + fragmentVariation(i, 5) * 0.2,
      sy: chunky ? 0.28 + fragmentVariation(i, 6) * 0.27 : 0.07 + fragmentVariation(i, 6) * 0.09,
      sz: chunky ? 2.1 + fragmentVariation(i, 7) * 2.6 : 0.9 + fragmentVariation(i, 7) * 1.9,
      rx: fragmentVariation(i, 8) * 0.8 - 0.4,
      ry: fragmentVariation(i, 9) * TAU,
      rz: fragmentVariation(i, 10) * 0.9 - 0.45,
      spinX: (fragmentVariation(i, 11) * 2 - 1) * (chunky ? 5 : 10),
      spinY: (fragmentVariation(i, 12) * 2 - 1) * 4,
      spinZ: (fragmentVariation(i, 13) * 2 - 1) * (chunky ? 6 : 12),
      delay: i === 0 ? 0 : fragmentVariation(i, 14) * 0.11,
      lifetime: 1.25 + fragmentVariation(i, 15) * 0.48,
      gravity: 32 + fragmentVariation(i, 16) * 7,
    });
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    flyingWood.setMatrixAt(i, dummy.matrix);
    tint.setRGB(0.87 + fragmentVariation(i, 17) * 0.13, 0.81 + fragmentVariation(i, 18) * 0.17, 0.72 + fragmentVariation(i, 19) * 0.22);
    flyingWood.setColorAt(i, tint);
  }
  flyingWood.instanceMatrix.needsUpdate = true;
  if (flyingWood.instanceColor) flyingWood.instanceColor.needsUpdate = true;

  for (let i = 0; i < RIM_COUNT; i++) {
    if (i < RIM_COUNT - 2) {
      const angle = -Math.PI / 2 + i / (RIM_COUNT - 3) * Math.PI;
      // A half-rim on the ocean side, not a solid cover over the road. Every
      // transformed vertex stays at positive local x, clear of the lane.
      dummy.position.set(1.7 + Math.cos(angle) * 2.4, 0.25 + (i % 3) * 0.14, Math.sin(angle) * 5.1);
      dummy.rotation.set((i % 2 ? 1 : -1) * 0.2, Math.atan2(-2.4 * Math.sin(angle), 5.1 * Math.cos(angle)), (i % 3 - 1) * 0.13);
      dummy.scale.set(0.48 + (i % 3) * 0.12, 0.25 + (i % 2) * 0.1, 1.4 + (i % 4) * 0.19);
    } else {
      const side = i === RIM_COUNT - 2 ? -1 : 1;
      dummy.position.set(1.25, 1.0, side * 5.1);
      dummy.rotation.set(Math.PI / 2, 0, side * 0.19);
      dummy.scale.set(0.36, 0.38, 2.4);
    }
    dummy.updateMatrix();
    rim.setMatrixAt(i, dummy.matrix);
  }
  rim.instanceMatrix.needsUpdate = true;
  rim.computeBoundingSphere();

  const update = (ageMs: number) => {
    const age = Number.isFinite(ageMs) ? ageMs : -1;
    group.visible = age >= 0;
    rim.visible = age >= DEBRIS_START_MS;
    flyingWood.visible = age >= DEBRIS_START_MS && age < DEBRIS_END_MS;
    flyingMaterial.opacity = fullOpacity * Math.max(0, Math.min(1, (DEBRIS_END_MS - age) / 650));
    if (!flyingWood.visible) return;

    const burstAge = (age - DEBRIS_START_MS) / 1000;
    for (let i = 0; i < FRAGMENT_COUNT; i++) {
      const fragment = fragments[i];
      const t = burstAge - fragment.delay;
      if (t < 0 || t >= fragment.lifetime) {
        dummy.scale.setScalar(0);
      } else {
        const tail = Math.max(0, (t / fragment.lifetime - 0.68) / 0.32);
        const shrink = 1 - tail * tail * (3 - 2 * tail);
        dummy.position.set(fragment.x + fragment.vx * t,
          fragment.y + fragment.vy * t - 0.5 * fragment.gravity * t * t,
          fragment.z + fragment.vz * t);
        dummy.rotation.set(fragment.rx + fragment.spinX * t, fragment.ry + fragment.spinY * t, fragment.rz + fragment.spinZ * t);
        dummy.scale.set(fragment.sx * shrink, fragment.sy * shrink, fragment.sz * shrink);
      }
      dummy.updateMatrix();
      flyingWood.setMatrixAt(i, dummy.matrix);
    }
    flyingWood.instanceMatrix.needsUpdate = true;
  };

  return { group, update };
}
