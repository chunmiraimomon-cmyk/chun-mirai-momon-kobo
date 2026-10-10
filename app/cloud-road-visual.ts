import type * as Three from "three";

type CloudRoadCourse = {
  length: number;
  pointAt(u: number, lane?: number): { x: number; y: number; z: number };
};
type CloudRoadPatchOptions = {
  startU: number; endU: number; side: number; halfWidth: number;
  origin: { x: number; y: number; z: number };
};
const wave = (n: number) => .5 + .5 * Math.sin(n * 2.3999632297);

/** V30/V94 reference: raised, overlapping round puffs, not a textured road.
 * All visible surfaces here are cloud volumes. The existing course remains the
 * sole driving/collision surface. Each breakable half-tile owns ONE merged mesh
 * so its clouds disappear with that tile and don't add one draw call per puff.
 */
export function createCloudRoadPatchGeometry(
  THREE: typeof Three, course: CloudRoadCourse, options: CloudRoadPatchOptions,
): Three.BufferGeometry {
  const { startU, endU, halfWidth, origin } = options;
  const side = options.side < 0 ? -1 : 1;
  const length = (endU - startU) * course.length;
  const seed = Math.round(startU * 7200) + side * 31;
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
  const sphere = new THREE.SphereGeometry(1, 18, 12);
  const verts = sphere.getAttribute("position");
  const faces = sphere.getIndex()!;
  let billows = 0, crownMax = 0;

  const addPuff = (along: number, lane: number, rx: number, ry: number, rz: number, crown: number) => {
    const offset = positions.length / 3;
    const u = startU + along / course.length;
    const ahead = course.pointAt(u + .03 / course.length, side * lane);
    const behind = course.pointAt(u - .03 / course.length, side * lane);
    const forward = new THREE.Vector3(ahead.x - behind.x, ahead.y - behind.y, ahead.z - behind.z).multiplyScalar(1 / .06);
    const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(new THREE.Matrix4().makeBasis(right, new THREE.Vector3(0, 1, 0), forward));
    const normal = new THREE.Vector3();
    crownMax = Math.max(crownMax, crown);
    for (let i = 0; i < verts.count; i++) {
      const x = verts.getX(i), y = verts.getY(i), z = verts.getZ(i);
      // A surviving puff cannot span the other destroyed half. No render
      // geometry or surface query is used by vehicle physics.
      // Round each hemisphere to fit its owner instead of slicing the surface
      // into a flat wall. Its interior half retains its full fluffy volume.
      const laneRadius = Math.min(rx, x < 0 ? lane + .18 : halfWidth + 1.5 - lane);
      const alongRadius = Math.min(rz, z < 0 ? along + .15 : length + .15 - along);
      const localLane = lane + x * laneRadius;
      const localAlong = along + z * alongRadius;
      const point = course.pointAt(startU + localAlong / course.length, side * localLane);
      positions.push(point.x - origin.x, point.y - origin.y + crown - ry + y * ry, point.z - origin.z);
      normal.set(x * side / laneRadius, y / ry, z / alongRadius).applyMatrix3(normalMatrix).normalize();
      normals.push(normal.x, normal.y, normal.z);
      // Soft blue recesses, not a noisy rock/snow texture or bright white plate.
      const light = .46 + .20 * Math.pow(Math.max(0, (y + 1) * .5), .65);
      colors.push(light * .92, light * .98, light * 1.04);
    }
    for (let i = 0; i < faces.count; i += 3) {
      const a = offset + faces.getX(i), b = offset + faces.getX(i + 1), c = offset + faces.getX(i + 2);
      if (side > 0) indices.push(a, b, c); else indices.push(a, c, b);
    }
    billows++;
  };

  // Nine large, staggered crowns cover the whole width, including the centre.
  // Their raised tops (about the old version's 1.5 m) deliberately swallow part
  // of the tyres: the kart is driving ON CLOUDS, not on a visible road slab.
  for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
    const n = seed + row * 7 + column * 13;
    // Keep the centre crowns close enough to overlap at the rounded seam;
    // the last centre puff also covers the end of each breakable tile.
    const lane = column === 0 ? .2 + .2 * wave(n)
      : halfWidth * (.08 + column * .40) + (wave(n) - .5) * .45;
    const along = length * (column === 0 && row === 2 ? .87 : (row + .35 + column * .13) / 3);
    addPuff(along, lane, halfWidth * (.30 + wave(n + 3) * .045),
      1.5 + wave(n + 5) * .45, length * (.25 + wave(n + 9) * .035),
      .85 + wave(n + 11) * .65);
  }
  // Small shoulders interrupt the big forms. Merged, not per-frame particles.
  for (let i = 0; i < 4; i++) {
    const n = seed + i * 17;
    addPuff(length * (.18 + i * .21), halfWidth * (.24 + (i % 2) * .42),
      1.25 + wave(n) * .60, 1.05 + wave(n + 5) * .20,
      length * .18, 1.10 + wave(n + 7) * .40);
  }
  sphere.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.name = "billowing-cloud-road";
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData.visualOnly = true;
  geometry.userData.cloudBillows = billows;
  geometry.userData.cloudCrownMax = crownMax;
  return geometry;
}

export function createCloudRoadMaterial(THREE: typeof Three): Three.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: 0xf8fcff, vertexColors: true, roughness: 1,
    emissive: 0x9cddff, emissiveIntensity: .1,
    transparent: true, opacity: .98, side: THREE.FrontSide,
  });
  material.name = "soft-cloud-billows";
  material.userData.visualOnly = true;
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
      float cloudRim = pow(1.0-abs(dot(normal,normalize(vViewPosition))), 2.5);
      outgoingLight = mix(outgoingLight, diffuseColor.rgb, .20);
      outgoingLight += diffuseColor.rgb * cloudRim * .065;
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey = () => "soft-cloud-billows-v2";
  return material;
}
