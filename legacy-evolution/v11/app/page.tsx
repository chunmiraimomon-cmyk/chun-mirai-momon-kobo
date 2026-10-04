"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type * as Three from "three";

type ThreeModule = typeof Three;
type GamePhase = "ready" | "countdown" | "racing" | "finished";
type ItemType = "EMPTY" | "FIRE" | "HOMING" | "BOOST" | "AURORA" | "SPIKES" | "SHIELD" | "NOVA";
type AttackType = "FIRE" | "HOMING" | "AURORA" | "SPIKES" | "NOVA";

type Racer = {
  name: string;
  badge: string;
  color: number;
  accent: number;
  progress: number;
  pace: number;
  lane: number;
};

const TAU = Math.PI * 2;
const COURSE_WIDTH = 10;
const SIDEWALK_EDGE = COURSE_WIDTH + 2.6;
const BARRIER_LANE = COURSE_WIDTH + 2.45;
const DECK_HALF_WIDTH = COURSE_WIDTH + 2.8;
const BARRIER_LIMIT = COURSE_WIDTH + 0.9;
const KART_RIDE_HEIGHT = 0.02;
const TOTAL_LAPS = 3;
const STANDARD_ITEMS: Exclude<ItemType, "EMPTY" | "NOVA">[] = ["FIRE", "HOMING", "BOOST", "AURORA", "SPIKES", "SHIELD"];
const ITEM_ROW_PROGRESS = [0.12, 0.35, 0.59, 0.82];
const ITEM_ROW_LANES = [-6, -2, 2, 6];

const RIVALS: Racer[] = [
  { name: "PIXEL", badge: "PX", color: 0xe95277, accent: 0xffd8e2, progress: -0.012, pace: 0.0404, lane: -1.9 },
  { name: "VOLT", badge: "VT", color: 0x7657d5, accent: 0xe7ddff, progress: -0.026, pace: 0.0398, lane: 1.4 },
  { name: "COMET", badge: "CM", color: 0xf3a62f, accent: 0xffefd1, progress: -0.041, pace: 0.0393, lane: -0.3 },
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function formatTime(ms: number) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const centis = Math.floor((ms % 1000) / 10);
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${centis.toString().padStart(2, "0")}`;
}

type CoursePose = { x: number; y: number; z: number; heading: number; pitch: number; nx: number; nz: number };
type RaceCourse = {
  length: number;
  pointAt: (u: number, lane?: number) => CoursePose;
  nearest: (x: number, z: number, hintU?: number) => { u: number; distance: number; pose: CoursePose };
  isClearFromRoad: (x: number, z: number, clearance: number, ignoreU?: number, ignoreRange?: number) => boolean;
};

function wrap01(value: number) {
  return ((value % 1) + 1) % 1;
}

function progressDelta(next: number, previous: number) {
  let delta = next - previous;
  if (delta > 0.5) delta -= 1;
  if (delta < -0.5) delta += 1;
  return delta;
}

function createRaceCourse(THREE: ThreeModule): RaceCourse {
  const rawPoints: Array<[number, number, number]> = [
    [0, 2, 165], [-40, 2, 162], [-80, 3, 150], [-120, 6, 132],
    [-150, 9, 108], [-170, 13, 75], [-175, 18, 35], [-170, 24, -10],
    [-160, 29, -55], [-135, 32, -95], [-100, 32, -125], [-60, 30, -135],
    [-20, 27, -125], [20, 24, -140], [60, 21, -128], [100, 18, -135],
    [140, 15, -112], [165, 12, -80], [180, 9, -42], [190, 6, 0],
    [190, 5, 60], [188.1, 4.8, 69.6], [182.7, 4.5, 77.7], [174.6, 4.2, 83.1],
    [165, 4, 85], [115, 4.5, 85], [105.4, 5, 86.9], [97.3, 5.5, 92.3],
    [91.9, 6, 100.4], [90, 6.5, 110], [90, 7, 140], [88.1, 7, 149.6],
    [82.7, 6.5, 157.7], [74.6, 5.5, 163.1], [65, 4.5, 165], [20, 3, 165],
  ];
  const points = rawPoints.map(([x, y, z]) => new THREE.Vector3(x * 0.72, y, z * 0.72));
  const curve = new THREE.CatmullRomCurve3(points, true, "centripetal");
  const sampleCount = 1600;

  const pointAt = (u: number, lane = 0): CoursePose => {
    const wrapped = wrap01(u);
    const point = curve.getPointAt(wrapped);
    const tangent = curve.getTangentAt(wrapped).normalize();
    const horizontal = new THREE.Vector3(tangent.x, 0, tangent.z).normalize();
    const nx = horizontal.z;
    const nz = -horizontal.x;
    return {
      x: point.x + nx * lane,
      y: point.y,
      z: point.z + nz * lane,
      heading: Math.atan2(horizontal.x, horizontal.z),
      pitch: -Math.atan2(tangent.y, Math.hypot(tangent.x, tangent.z)),
      nx,
      nz,
    };
  };

  const samples = Array.from({ length: sampleCount }, (_, index) => ({ u: index / sampleCount, pose: pointAt(index / sampleCount) }));
  const isClearFromRoad = (x: number, z: number, clearance: number, ignoreU?: number, ignoreRange = 0) => {
    const clearanceSq = clearance ** 2;
    return samples.every((sample) => {
      if (ignoreU !== undefined && Math.abs(progressDelta(sample.u, ignoreU)) < ignoreRange) return true;
      return (sample.pose.x - x) ** 2 + (sample.pose.z - z) ** 2 >= clearanceSq;
    });
  };
  const nearest = (x: number, z: number, hintU?: number) => {
    let bestIndex = 0;
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    const consider = (index: number) => {
      const wrappedIndex = ((index % sampleCount) + sampleCount) % sampleCount;
      const pose = samples[wrappedIndex].pose;
      const distanceSq = (pose.x - x) ** 2 + (pose.z - z) ** 2;
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        bestIndex = wrappedIndex;
      }
    };
    if (hintU === undefined) {
      for (let index = 0; index < sampleCount; index += 1) consider(index);
    } else {
      const center = Math.round(wrap01(hintU) * sampleCount);
      for (let offset = -42; offset <= 42; offset += 1) consider(center + offset);
      if (bestDistanceSq > 28 ** 2) for (let index = 0; index < sampleCount; index += 1) consider(index);
    }
    const u = bestIndex / sampleCount;
    return { u, distance: Math.sqrt(bestDistanceSq), pose: samples[bestIndex].pose };
  };

  return { length: curve.getLength(), pointAt, nearest, isClearFromRoad };
}

function makeCourseStripGeometry(THREE: ThreeModule, course: RaceCourse, leftLane: number, rightLane: number, yOffset = 0) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const segments = 1440;
  for (let i = 0; i <= segments; i += 1) {
    const u = i / segments;
    const left = course.pointAt(u, leftLane);
    const right = course.pointAt(u, rightLane);
    positions.push(left.x, left.y + yOffset, left.z, right.x, right.y + yOffset, right.z);
    uvs.push(u, 1, u, 0);
    if (i < segments) {
      const vertex = i * 2;
      indices.push(vertex, vertex + 1, vertex + 2, vertex + 2, vertex + 1, vertex + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeCourseEdgeGeometry(THREE: ThreeModule, course: RaceCourse, lane: number, topOffset: number, bottomOffset: number) {
  const positions: number[] = [];
  const indices: number[] = [];
  const segments = 1440;
  for (let i = 0; i <= segments; i += 1) {
    const point = course.pointAt(i / segments, lane);
    positions.push(point.x, point.y + topOffset, point.z, point.x, point.y + bottomOffset, point.z);
    if (i < segments) {
      const vertex = i * 2;
      indices.push(vertex, vertex + 2, vertex + 1, vertex + 2, vertex + 3, vertex + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createKart(THREE: ThreeModule, color: number, accent: number, player = false, driverTexture?: Three.Texture) {
  const kart = new THREE.Group();
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x121519, roughness: 0.84, metalness: 0.08 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x313a43, roughness: 0.3, metalness: 0.9 });
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.2,
    metalness: 0.58,
    clearcoat: 1,
    clearcoatRoughness: 0.13,
  });
  const accentMat = new THREE.MeshPhysicalMaterial({ color: accent, roughness: 0.22, metalness: 0.42, clearcoat: 0.9 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2c3, emissive: 0xffe1a1, emissiveIntensity: 0.9, roughness: 0.18 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xb21324, emissive: 0xff203c, emissiveIntensity: 0.65 });

  const addPart = (geometry: Three.BufferGeometry, material: Three.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    kart.add(mesh);
    return mesh;
  };

  addPart(new THREE.BoxGeometry(2.3, 0.42, 3.45, 3, 2, 4), bodyMat, 0, 0.68, 0);
  const nose = addPart(new THREE.SphereGeometry(1, 32, 18), bodyMat, 0, 0.67, 1.74);
  nose.scale.set(1.03, 0.34, 1.22);
  addPart(new THREE.BoxGeometry(2.8, 0.18, 0.32, 4, 2, 2), accentMat, 0, 0.43, 2.73);

  [-1, 1].forEach((side) => {
    const sidePod = addPart(new THREE.SphereGeometry(0.62, 24, 14), bodyMat, side * 1.02, 0.67, 0.18);
    sidePod.scale.set(0.82, 0.46, 1.65);
    const fenderFront = addPart(new THREE.TorusGeometry(0.62, 0.11, 12, 28, Math.PI), bodyMat, side * 1.27, 0.71, 1.43);
    fenderFront.rotation.y = Math.PI / 2;
    fenderFront.rotation.z = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    const fenderRear = addPart(new THREE.TorusGeometry(0.62, 0.11, 12, 28, Math.PI), bodyMat, side * 1.27, 0.71, -1.28);
    fenderRear.rotation.y = Math.PI / 2;
    fenderRear.rotation.z = side > 0 ? Math.PI / 2 : -Math.PI / 2;
  });

  const seat = addPart(new THREE.BoxGeometry(1.08, 1.05, 0.72, 3, 4, 3), tireMat, 0, 1.18, -0.42);
  seat.rotation.x = -0.12;
  if (driverTexture) {
    driverTexture.colorSpace = THREE.SRGBColorSpace;
    driverTexture.wrapS = THREE.ClampToEdgeWrapping;
    driverTexture.wrapT = THREE.ClampToEdgeWrapping;
    driverTexture.repeat.set(1 / 3, 1);
    driverTexture.offset.set(0, 0);
    const driverMaterial = new THREE.MeshBasicMaterial({
      map: driverTexture,
      transparent: true,
      alphaTest: 0.06,
      depthWrite: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const driver = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.58), driverMaterial);
    driver.position.set(0, 1.58, -0.68);
    driver.rotation.y = Math.PI;
    driver.renderOrder = 2;
    kart.add(driver);
    kart.userData.driverTexture = driverTexture;
    kart.userData.driverFrame = 0;
  }

  const wheel = addPart(new THREE.TorusGeometry(0.24, 0.055, 12, 28), metal, 0, 1.06, 0.5);
  wheel.rotation.x = Math.PI / 2;
  addPart(new THREE.CylinderGeometry(0.045, 0.045, 0.55, 16), metal, 0, 0.95, 0.5).rotation.z = Math.PI / 2;

  addPart(new THREE.BoxGeometry(2.75, 0.14, 0.5, 5, 2, 2), bodyMat, 0, 1.17, -2.03);
  [-0.82, 0.82].forEach((x) => addPart(new THREE.BoxGeometry(0.13, 0.64, 0.17), metal, x, 0.88, -1.86));

  const wheelGeometry = new THREE.CylinderGeometry(0.55, 0.55, 0.46, 32, 3);
  [[-1.3, 1.43], [1.3, 1.43], [-1.3, -1.31], [1.3, -1.31]].forEach(([x, z]) => {
    const tire = addPart(wheelGeometry, tireMat, x, 0.58, z);
    tire.rotation.z = Math.PI / 2;
    const rim = addPart(new THREE.CylinderGeometry(0.24, 0.24, 0.48, 28, 2), metal, x, 0.58, z);
    rim.rotation.z = Math.PI / 2;
    const hub = addPart(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 20), accentMat, x, 0.58, z);
    hub.rotation.z = Math.PI / 2;
  });

  [-0.52, 0.52].forEach((x) => {
    addPart(new THREE.SphereGeometry(0.14, 20, 12), lampMat, x, 0.72, 2.57).scale.set(1.2, 0.78, 0.48);
    addPart(new THREE.BoxGeometry(0.3, 0.13, 0.08), tailMat, x, 0.81, -1.78);
    const exhaust = addPart(new THREE.CylinderGeometry(0.1, 0.13, 0.64, 20), metal, x * 1.45, 0.43, -2.0);
    exhaust.rotation.x = Math.PI / 2;
  });

  kart.scale.setScalar(player ? 1.04 : 0.92);
  return kart;
}

function setKartDriverFrame(kart: Three.Group, frame: 0 | 1 | 2) {
  if (kart.userData.driverFrame === frame) return;
  const texture = kart.userData.driverTexture as Three.Texture | undefined;
  if (!texture) return;
  texture.offset.x = frame / 3;
  texture.needsUpdate = true;
  kart.userData.driverFrame = frame;
}

function addBarrier(THREE: ThreeModule, scene: Three.Scene, course: RaceCourse, lane: number, height: number) {
  const railMat = new THREE.MeshStandardMaterial({ color: 0xb7c0c5, roughness: 0.3, metalness: 0.82 });
  const segments = 600;
  const rail = new THREE.InstancedMesh(new THREE.BoxGeometry(1.3, 0.16, 0.12), railMat, segments);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.86, 0.1), railMat, segments / 2);
  const dummy = new THREE.Object3D();
  const railAxis = new THREE.Vector3(1, 0, 0);
  const railDirection = new THREE.Vector3();
  for (let i = 0; i < segments; i += 1) {
    const point = course.pointAt(i / segments, lane);
    const next = course.pointAt((i + 1) / segments, lane);
    railDirection.set(next.x - point.x, next.y - point.y, next.z - point.z);
    dummy.position.set(point.x, point.y + height, point.z);
    dummy.quaternion.setFromUnitVectors(railAxis, railDirection.clone().normalize());
    dummy.scale.set(railDirection.length() / 1.3 + 0.05, 1, 1);
    dummy.updateMatrix();
    rail.setMatrixAt(i, dummy.matrix);
    if (i % 2 === 0) {
      dummy.position.set(point.x, point.y + height - 0.3, point.z);
      dummy.quaternion.identity();
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      posts.setMatrixAt(i / 2, dummy.matrix);
    }
  }
  rail.instanceMatrix.needsUpdate = true;
  posts.instanceMatrix.needsUpdate = true;
  rail.castShadow = true;
  posts.castShadow = true;
  scene.add(rail, posts);
}

function addWorld(THREE: ThreeModule, scene: Three.Scene, course: RaceCourse) {
  scene.background = new THREE.Color(0x9bd5f2);
  scene.fog = new THREE.Fog(0xb9def0, 180, 470);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(520, 520, 32, 32),
    new THREE.MeshStandardMaterial({ color: 0x78976a, roughness: 0.98 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.52;
  ground.receiveShadow = true;
  scene.add(ground);

  const concrete = new THREE.MeshStandardMaterial({ color: 0xc9c8bd, roughness: 0.88, metalness: 0.02 });
  const leftWalk = new THREE.Mesh(makeCourseStripGeometry(THREE, course, SIDEWALK_EDGE, COURSE_WIDTH, 0.02), concrete);
  const rightWalk = new THREE.Mesh(makeCourseStripGeometry(THREE, course, -COURSE_WIDTH, -SIDEWALK_EDGE, 0.02), concrete);
  leftWalk.receiveShadow = true;
  rightWalk.receiveShadow = true;
  scene.add(leftWalk, rightWalk);

  const road = new THREE.Mesh(
    makeCourseStripGeometry(THREE, course, COURSE_WIDTH, -COURSE_WIDTH, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x41464b, roughness: 0.88, metalness: 0.03 }),
  );
  road.receiveShadow = true;
  scene.add(road);

  const deckMaterial = new THREE.MeshStandardMaterial({ color: 0x74787a, roughness: 0.82, metalness: 0.12, side: THREE.DoubleSide });
  const underside = new THREE.Mesh(
    makeCourseStripGeometry(THREE, course, DECK_HALF_WIDTH, -DECK_HALF_WIDTH, -0.52),
    deckMaterial,
  );
  underside.receiveShadow = true;
  const leftDeckEdge = new THREE.Mesh(makeCourseEdgeGeometry(THREE, course, DECK_HALF_WIDTH, 0.02, -0.52), deckMaterial);
  const rightDeckEdge = new THREE.Mesh(makeCourseEdgeGeometry(THREE, course, -DECK_HALF_WIDTH, 0.02, -0.52), deckMaterial);
  leftDeckEdge.receiveShadow = true;
  rightDeckEdge.receiveShadow = true;
  scene.add(underside, leftDeckEdge, rightDeckEdge);

  addBarrier(THREE, scene, course, BARRIER_LANE, 0.8);
  addBarrier(THREE, scene, course, -BARRIER_LANE, 0.8);

  const laneMat = new THREE.MeshStandardMaterial({ color: 0xf8f3df, roughness: 0.82 });
  const dashCount = 210;
  const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 0.035, 0.14), laneMat, dashCount);
  const dashDummy = new THREE.Object3D();
  const courseAxis = new THREE.Vector3(1, 0, 0);
  const courseDirection = new THREE.Vector3();
  for (let i = 0; i < dashCount; i += 1) {
    const point = course.pointAt((i + 0.5) / dashCount);
    const next = course.pointAt((i + 0.8) / dashCount);
    courseDirection.set(next.x - point.x, next.y - point.y, next.z - point.z).normalize();
    dashDummy.position.set(point.x, point.y + 0.105, point.z);
    dashDummy.quaternion.setFromUnitVectors(courseAxis, courseDirection);
    dashDummy.scale.set(i % 2 === 0 ? 1 : 0.06, 1, 1);
    dashDummy.updateMatrix();
    dashes.setMatrixAt(i, dashDummy.matrix);
  }
  dashes.instanceMatrix.needsUpdate = true;
  scene.add(dashes);

  const curbMats = [
    new THREE.MeshStandardMaterial({ color: 0xf7f1e7, roughness: 0.72 }),
    new THREE.MeshStandardMaterial({ color: 0xc83f3f, roughness: 0.7 }),
  ];
  const curbSegments = 420;
  const curbMeshes = curbMats.map((material) => new THREE.InstancedMesh(new THREE.BoxGeometry(1.55, 0.12, 0.44), material, curbSegments));
  const curbCounters = [0, 0];
  const curbDummy = new THREE.Object3D();
  [-COURSE_WIDTH - 0.18, COURSE_WIDTH + 0.18].forEach((lane) => {
    for (let i = 0; i < curbSegments; i += 1) {
      const point = course.pointAt(i / curbSegments, lane);
      const next = course.pointAt((i + 1) / curbSegments, lane);
      const materialIndex = i % 2;
      courseDirection.set(next.x - point.x, next.y - point.y, next.z - point.z);
      curbDummy.position.set(point.x, point.y + 0.13, point.z);
      curbDummy.quaternion.setFromUnitVectors(courseAxis, courseDirection.clone().normalize());
      curbDummy.scale.set(courseDirection.length() / 1.55 + 0.06, 1, 1);
      curbDummy.updateMatrix();
      curbMeshes[materialIndex].setMatrixAt(curbCounters[materialIndex], curbDummy.matrix);
      curbCounters[materialIndex] += 1;
    }
  });
  curbMeshes.forEach((mesh) => {
    mesh.count = curbCounters[curbMeshes.indexOf(mesh)];
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    scene.add(mesh);
  });

  for (let i = -10; i <= 10; i += 1) {
    const start = course.pointAt(0, i);
    const tile = new THREE.Mesh(
      new THREE.BoxGeometry(1.06, 0.045, 1.06),
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0xf5f5ef : 0x20252a, roughness: 0.68 }),
    );
    tile.position.set(start.x, start.y + 0.11, start.z);
    tile.rotation.y = start.heading;
    scene.add(tile);
  }

  const buildingColors = [0xd8d3c8, 0xc5d2d5, 0xd9c9bd, 0xb9c7d2, 0xdedbd2];
  const glassMats = [0x6f9eaf, 0x568198, 0x8ab1bd].map((color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.14, metalness: 0.48, clearcoat: 0.6 }));
  const makeBuilding = (x: number, z: number, w: number, d: number, h: number, index: number, rotation: number) => {
    const footprintRadius = Math.hypot(w, d) * 0.52;
    if (!course.isClearFromRoad(x, z, COURSE_WIDTH + footprintRadius + 2.2)) return;
    const group = new THREE.Group();
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d, 3, Math.max(3, Math.floor(h / 2)), 3),
      new THREE.MeshStandardMaterial({ color: buildingColors[index % buildingColors.length], roughness: 0.68, metalness: 0.04 }),
    );
    shell.position.y = h / 2;
    shell.castShadow = true;
    shell.receiveShadow = true;
    group.add(shell);

    const rows = Math.min(7, Math.max(3, Math.floor(h / 3)));
    for (let row = 0; row < rows; row += 1) {
      const y = 1.7 + row * ((h - 2.4) / rows);
      for (let column = -1; column <= 1; column += 1) {
        const pane = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.2, 0.72, 0.07),
          glassMats[(index + row + column + 3) % glassMats.length],
        );
        pane.position.set(column * w * 0.27, y, -d / 2 - 0.04);
        group.add(pane);
      }
    }

    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.36, 0.55, d * 0.4), new THREE.MeshStandardMaterial({ color: 0x7d8586, roughness: 0.62, metalness: 0.32 }));
    roof.position.y = h + 0.27;
    roof.castShadow = true;
    group.add(roof);
    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    scene.add(group);
  };

  for (let i = 0; i < 62; i += 1) {
    const side = i % 2 === 0 ? 1 : -1;
    const u = wrap01(i / 62 + 0.009 * Math.sin(i * 2.1));
    const point = course.pointAt(u, side * (28 + (i % 3) * 7));
    makeBuilding(
      point.x,
      point.z,
      4.5 + (i % 3) * 1.25,
      4.2 + ((i + 1) % 3) * 1.1,
      10 + (i * 7 % 22),
      i,
      point.heading + (side > 0 ? Math.PI : 0),
    );
  }

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x76523a, roughness: 0.95 });
  const leafMats = [0x3f8249, 0x4f9656, 0x327241].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
  const makeTree = (x: number, y: number, z: number, size: number, index: number) => {
    if (!course.isClearFromRoad(x, z, COURSE_WIDTH + size * 1.2 + 1.2)) return;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * size, 0.23 * size, 2.15 * size, 14), trunkMat);
    trunk.position.set(x, y + 1.05 * size, z);
    trunk.castShadow = true;
    scene.add(trunk);
    [[0, 2.35, 0], [-0.42, 2.08, 0.08], [0.38, 2.12, -0.05]].forEach(([ox, oy, oz], crown) => {
      const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry((0.82 - crown * 0.05) * size, 2), leafMats[(index + crown) % leafMats.length]);
      leaves.position.set(x + ox * size, y + oy * size, z + oz * size);
      leaves.castShadow = true;
      scene.add(leaves);
    });
  };
  for (let i = 0; i < 76; i += 1) {
    const side = i % 2 === 0 ? 1 : -1;
    const point = course.pointAt(i / 76 + 0.004, side * 18.2);
    makeTree(point.x, point.y, point.z, 0.76 + (i % 4) * 0.07, i);
  }

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3d4549, metalness: 0.72, roughness: 0.35 });
  for (let i = 0; i < 52; i += 1) {
    const side = i % 2 === 0 ? 1 : -1;
    const point = course.pointAt(i / 52, side * 15.3);
    const x = point.x;
    const z = point.z;
    if (!course.isClearFromRoad(x, z, COURSE_WIDTH + 2.1)) continue;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.11, 4.1, 16), poleMat);
    pole.position.set(x, point.y + 2.05, z);
    pole.castShadow = true;
    scene.add(pole);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.8, 12), poleMat);
    arm.position.set(x, point.y + 3.98, z);
    arm.rotation.z = Math.PI / 2;
    arm.rotation.y = point.heading;
    scene.add(arm);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 12), new THREE.MeshStandardMaterial({ color: 0xfff6d7, emissive: 0xffdf96, emissiveIntensity: 0.28 }));
    lamp.position.set(x + point.nx * 0.35, point.y + 3.9, z + point.nz * 0.35);
    scene.add(lamp);
  }

  const supportMat = new THREE.MeshStandardMaterial({ color: 0x8c9293, roughness: 0.7, metalness: 0.24 });
  for (let i = 0; i < 80; i += 1) {
    const u = i / 80;
    const point = course.pointAt(u);
    if (point.y < 2.2) continue;
    [-COURSE_WIDTH - 1.35, COURSE_WIDTH + 1.35].forEach((lane) => {
      const supportPoint = course.pointAt(u, lane);
      if (!course.isClearFromRoad(supportPoint.x, supportPoint.z, COURSE_WIDTH + 1.2, u, 0.055)) return;
      const support = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.62, point.y + 0.5, 18), supportMat);
      support.position.set(supportPoint.x, point.y / 2 - 0.25, supportPoint.z);
      support.castShadow = true;
      support.receiveShadow = true;
      scene.add(support);
    });
  }

  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.88 });
  [[-145, 56, -125], [30, 65, -155], [152, 52, 18], [-128, 61, 118], [86, 72, 132]].forEach(([x, y, z], cloudIndex) => {
    const cloud = new THREE.Group();
    for (let i = 0; i < 5; i += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(4 + (i % 3), 24, 16), cloudMat);
      puff.position.set((i - 2) * 4.5, Math.sin(i * 1.7) * 1.6, (i % 2) * 2.2);
      puff.scale.y = 0.72;
      cloud.add(puff);
    }
    cloud.position.set(x + cloudIndex * 2, y, z);
    scene.add(cloud);
  });

  scene.add(new THREE.HemisphereLight(0xd9f2ff, 0x657b55, 2.15));
  const sun = new THREE.DirectionalLight(0xfff2d2, 3.25);
  sun.position.set(-86, 135, 58);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -145;
  sun.shadow.camera.right = 145;
  sun.shadow.camera.top = 125;
  sun.shadow.camera.bottom = -125;
  sun.shadow.camera.far = 340;
  sun.shadow.bias = -0.00018;
  scene.add(sun);
}

function RaceWorld({
  phase,
  runId,
  onTelemetry,
  onFinish,
  onItemChange,
  onShieldChange,
}: {
  phase: GamePhase;
  runId: number;
  onTelemetry: (speed: number, progress: number, position: number) => void;
  onFinish: (time: number, position: number) => void;
  onItemChange: (item: ItemType) => void;
  onShieldChange: (active: boolean) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef(phase);
  const keys = useRef<Record<string, boolean>>({});
  const touch = useRef({ left: false, right: false, gas: false, brake: false, item: false });
  const [webglError, setWebglError] = useState(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", "e", " "].includes(event.key.toLowerCase())) event.preventDefault();
      keys.current[event.key.toLowerCase()] = true;
    };
    const up = (event: KeyboardEvent) => { keys.current[event.key.toLowerCase()] = false; };
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let disposeThree: (() => void) | undefined;

    void import("three").then((THREE) => {
      if (disposed) return;
      let renderer: Three.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      } catch {
        setWebglError(true);
        return;
      }

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.06;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.setAttribute("aria-label", "昼の市街地を走る自機後方視点の3Dカートレース");
      renderer.domElement.setAttribute("role", "img");
      host.prepend(renderer.domElement);

      const scene = new THREE.Scene();
      const course = createRaceCourse(THREE);
      addWorld(THREE, scene, course);
      const camera = new THREE.PerspectiveCamera(57, 16 / 9, 0.1, 620);

      const textureLoader = new THREE.TextureLoader();
      const driverTextures = [
        "/drivers/otter-strip.png",
        "/drivers/fox-strip.png",
        "/drivers/cat-strip.png",
        "/drivers/corgi-strip.png",
      ].map((path) => textureLoader.load(path));

      const player = createKart(THREE, 0x20aeb3, 0xf0ffff, true, driverTextures[0]);
      const start = course.pointAt(0);
      player.position.set(start.x, start.y + KART_RIDE_HEIGHT, start.z);
      player.rotation.y = start.heading;
      scene.add(player);

      const rivalStates = RIVALS.map((rival) => ({
        ...rival,
        item: "EMPTY" as ItemType,
        shield: false,
        crashStart: 0,
        crashUntil: 0,
        boostUntil: 0,
        auroraUntil: 0,
        useAt: 0,
      }));
      const rivalMeshes = rivalStates.map((rival, index) => {
        const mesh = createKart(THREE, rival.color, rival.accent, false, driverTextures[index + 1]);
        scene.add(mesh);
        return mesh;
      });

      const pickupMaterial = new THREE.MeshPhysicalMaterial({ color: 0x45d6f1, emissive: 0x128eb8, emissiveIntensity: 0.72, roughness: 0.12, metalness: 0.25, transmission: 0.23, transparent: true, opacity: 0.9 });
      const pickupInnerMaterial = new THREE.MeshStandardMaterial({ color: 0xffd45c, emissive: 0xf1a91d, emissiveIntensity: 0.9, roughness: 0.24, metalness: 0.42 });
      const pickupPoints = ITEM_ROW_PROGRESS.flatMap((u, rowIndex) => ITEM_ROW_LANES.map((lane, laneIndex) => {
        const p = course.pointAt(u, lane);
        const group = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.25, 1.25, 4, 4, 4), pickupMaterial);
        box.rotation.set(0.18, Math.PI / 4, 0.15);
        box.castShadow = true;
        group.add(box);
        const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 1), pickupInnerMaterial);
        core.castShadow = true;
        group.add(core);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.83, 0.055, 12, 36), pickupInnerMaterial);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
        group.position.set(p.x, p.y + 1.35, p.z);
        scene.add(group);
        return { group, x: p.x, y: p.y, z: p.z, baseY: p.y + 1.35, active: true, respawnAt: 0, rowIndex, laneIndex };
      }));

      const racerMeshes = [player, ...rivalMeshes];
      const shieldBubbles = racerMeshes.map((mesh) => {
        const material = new THREE.MeshPhysicalMaterial({ color: 0x65dcff, emissive: 0x299fcb, emissiveIntensity: 0.5, transparent: true, opacity: 0.24, roughness: 0.05, metalness: 0.04, side: THREE.DoubleSide });
        const bubble = new THREE.Mesh(new THREE.SphereGeometry(2.45, 40, 28), material);
        bubble.position.y = 1.15;
        bubble.visible = false;
        mesh.add(bubble);
        return bubble;
      });
      const auroraAuras = racerMeshes.map((mesh) => {
        const material = new THREE.MeshStandardMaterial({ color: 0xffef72, emissive: 0xffc928, emissiveIntensity: 1.8, transparent: true, opacity: 0.34, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
        const aura = new THREE.Mesh(new THREE.SphereGeometry(2.55, 36, 24), material);
        aura.position.y = 1.1;
        aura.visible = false;
        mesh.add(aura);
        const glow = new THREE.PointLight(0xffd63a, 0, 9, 2);
        glow.position.y = 1.2;
        mesh.add(glow);
        return { aura, glow };
      });

      const novaWaveMaterial = new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0, wireframe: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const novaWave = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), novaWaveMaterial);
      const novaRingMaterials = [0xfff3a6, 0xffa52f, 0xff4e3a].map((color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      const novaRings = novaRingMaterials.map((material, index) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35 + index * 0.42, 0.11 - index * 0.02, 16, 72), material);
        ring.rotation.x = Math.PI / 2 + index * 0.18;
        return ring;
      });
      const novaParticlePositions: number[] = [];
      for (let i = 0; i < 110; i += 1) {
        const angle = i * 2.39996;
        const radius = 0.7 + (i % 11) * 0.055;
        novaParticlePositions.push(Math.cos(angle) * radius, ((i % 9) - 4) * 0.12, Math.sin(angle) * radius);
      }
      const novaParticleGeometry = new THREE.BufferGeometry();
      novaParticleGeometry.setAttribute("position", new THREE.Float32BufferAttribute(novaParticlePositions, 3));
      const novaParticleMaterial = new THREE.PointsMaterial({ color: 0xffed8b, size: 0.22, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const novaParticles = new THREE.Points(novaParticleGeometry, novaParticleMaterial);
      const novaEffect = new THREE.Group();
      novaEffect.add(novaWave, novaParticles, ...novaRings);
      novaEffect.visible = false;
      scene.add(novaEffect);

      const novaHitBursts = racerMeshes.map((mesh, actorId) => {
        const material = new THREE.MeshBasicMaterial({ color: actorId === 0 ? 0xfff4aa : 0xff643d, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const burst = new THREE.Mesh(new THREE.IcosahedronGeometry(1.35, 2), material);
        burst.position.y = 1.1;
        burst.visible = false;
        mesh.add(burst);
        const glow = new THREE.PointLight(0xff5a35, 0, 12, 2);
        glow.position.y = 1.1;
        mesh.add(glow);
        return { burst, material, glow };
      });

      const projectileMaterial = new THREE.MeshStandardMaterial({ color: 0xff6b16, emissive: 0xff3100, emissiveIntensity: 2.2, roughness: 0.3 });
      const projectileCoreMaterial = new THREE.MeshStandardMaterial({ color: 0xfff3ae, emissive: 0xffc23c, emissiveIntensity: 2.5, roughness: 0.2 });
      const homingMaterial = new THREE.MeshPhysicalMaterial({ color: 0xe9564f, emissive: 0xa71918, emissiveIntensity: 0.8, roughness: 0.22, metalness: 0.58, clearcoat: 0.8 });
      const spikeMaterial = new THREE.MeshStandardMaterial({ color: 0x5d6267, roughness: 0.28, metalness: 0.88 });
      const trapBaseMaterial = new THREE.MeshStandardMaterial({ color: 0x262d31, roughness: 0.54, metalness: 0.5 });

      type ProjectileState = {
        kind: "FIRE" | "HOMING";
        owner: number;
        target: number | null;
        group: Three.Group;
        progress: number;
        lane: number;
        age: number;
        active: boolean;
      };
      type TrapState = { owner: number; group: Three.Group; x: number; y: number; z: number; armedAt: number; active: boolean };
      const projectiles: ProjectileState[] = [];
      const traps: TrapState[] = [];
      const auroraContactTimes = new Map<string, number>();

      const exhaustCount = 72;
      const exhaustPositions = new Float32Array(exhaustCount * 3);
      const exhaustLife = new Float32Array(exhaustCount);
      const exhaustGeometry = new THREE.BufferGeometry();
      exhaustGeometry.setAttribute("position", new THREE.BufferAttribute(exhaustPositions, 3));
      const exhaust = new THREE.Points(exhaustGeometry, new THREE.PointsMaterial({ color: 0xbfeeff, size: 0.24, transparent: true, opacity: 0.56, depthWrite: false }));
      scene.add(exhaust);
      let exhaustCursor = 0;

      const playerState = {
        x: start.x,
        y: start.y,
        z: start.z,
        heading: start.heading,
        pitch: start.pitch,
        speed: 0,
        progress: 0,
        lastU: 0,
        shield: false,
        crashStart: 0,
        crashUntil: 0,
        wasCrashing: false,
        boostUntil: 0,
        auroraUntil: 0,
      };
      let heldItem: ItemType = "EMPTY";
      let itemPressed = false;
      let novaFlashUntil = 0;
      let novaStarted = -10000;
      const novaHitUntil = [0, 0, 0, 0];
      let raceStart = 0;
      let previous = performance.now();
      let frame = 0;
      let hudTick = 0;
      let finished = false;

      const actorProgress = (actorId: number) => actorId === 0 ? playerState.progress : rivalStates[actorId - 1].progress;
      const actorLane = (actorId: number) => {
        if (actorId !== 0) return rivalStates[actorId - 1].lane;
        const nearest = course.nearest(playerState.x, playerState.z, playerState.lastU);
        return clamp(
          (playerState.x - nearest.pose.x) * nearest.pose.nx + (playerState.z - nearest.pose.z) * nearest.pose.nz,
          -BARRIER_LIMIT,
          BARRIER_LIMIT,
        );
      };
      const actorPose = (actorId: number) => {
        if (actorId === 0) return { x: playerState.x, y: playerState.y, z: playerState.z, heading: playerState.heading, pitch: playerState.pitch, nx: Math.cos(playerState.heading), nz: -Math.sin(playerState.heading) };
        const rival = rivalStates[actorId - 1];
        return course.pointAt(rival.progress, rival.lane);
      };
      const actorRank = (actorId: number) => 1 + [0, 1, 2, 3].filter((otherId) => otherId !== actorId && actorProgress(otherId) > actorProgress(actorId)).length;
      const actorCrashing = (actorId: number, now: number) => actorId === 0 ? now < playerState.crashUntil : now < rivalStates[actorId - 1].crashUntil;
      const actorHasShield = (actorId: number) => actorId === 0 ? playerState.shield : rivalStates[actorId - 1].shield;
      const actorAuroraUntil = (actorId: number) => actorId === 0 ? playerState.auroraUntil : rivalStates[actorId - 1].auroraUntil;
      const setActorShield = (actorId: number, active: boolean) => {
        if (actorId === 0) {
          playerState.shield = active;
          onShieldChange(active);
        } else {
          rivalStates[actorId - 1].shield = active;
        }
      };
      const setActorItem = (actorId: number, item: ItemType, now: number) => {
        if (actorId === 0) {
          heldItem = item;
          onItemChange(item);
        } else {
          const rival = rivalStates[actorId - 1];
          rival.item = item;
          rival.useAt = item === "EMPTY" ? 0 : now + 750 + Math.random() * 1850;
        }
      };
      const actorItem = (actorId: number) => actorId === 0 ? heldItem : rivalStates[actorId - 1].item;
      const rollItem = (rank: number): ItemType => {
        if (rank === 4 && Math.random() < 0.05) return "NOVA";
        const weighted = rank >= 3
          ? ["HOMING", "BOOST", "BOOST", "AURORA", "SPIKES", "SHIELD", "FIRE"] as ItemType[]
          : [...STANDARD_ITEMS, "FIRE", "SPIKES"] as ItemType[];
        return weighted[Math.floor(Math.random() * weighted.length)];
      };
      const crashActor = (actorId: number, now: number) => {
        if (actorCrashing(actorId, now)) return false;
        if (actorId === 0) {
          playerState.crashStart = now;
          playerState.crashUntil = now + 1450;
          playerState.speed = 0;
        } else {
          const rival = rivalStates[actorId - 1];
          rival.crashStart = now;
          rival.crashUntil = now + 1450;
        }
        return true;
      };
      const attackActor = (targetId: number, attack: AttackType, now: number) => {
        if (actorCrashing(targetId, now)) return "ignored" as const;
        const shieldable = attack === "FIRE" || attack === "HOMING" || attack === "AURORA" || attack === "SPIKES";
        if (shieldable && now < actorAuroraUntil(targetId)) return "blocked" as const;
        if (shieldable && actorHasShield(targetId)) {
          setActorShield(targetId, false);
          return "blocked" as const;
        }
        crashActor(targetId, now);
        return "crashed" as const;
      };
      const targetOnePlaceAhead = (actorId: number) => {
        const order = [0, 1, 2, 3].sort((a, b) => actorProgress(b) - actorProgress(a));
        const index = order.indexOf(actorId);
        return index > 0 ? order[index - 1] : null;
      };
      const makeFireMesh = () => {
        const group = new THREE.Group();
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.45, 22, 14), projectileMaterial);
        flame.scale.set(0.78, 0.78, 1.65);
        flame.castShadow = true;
        group.add(flame);
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 12), projectileCoreMaterial);
        core.position.z = 0.28;
        group.add(core);
        const light = new THREE.PointLight(0xff591d, 16, 7, 2);
        group.add(light);
        return group;
      };
      const makeHomingMesh = () => {
        const group = new THREE.Group();
        const shell = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.72, 8, 18), homingMaterial);
        shell.rotation.x = Math.PI / 2;
        shell.castShadow = true;
        group.add(shell);
        [-1, 1].forEach((side) => {
          const fin = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.07, 0.45), homingMaterial);
          fin.position.set(side * 0.28, 0, -0.18);
          group.add(fin);
        });
        const light = new THREE.PointLight(0xff7c29, 9, 6, 2);
        light.position.z = -0.55;
        group.add(light);
        return group;
      };
      const spawnProjectile = (actorId: number, kind: "FIRE" | "HOMING") => {
        const pose = actorPose(actorId);
        const target = kind === "HOMING" ? targetOnePlaceAhead(actorId) : null;
        const resolvedKind = kind === "HOMING" && target === null ? "FIRE" : kind;
        const group = resolvedKind === "FIRE" ? makeFireMesh() : makeHomingMesh();
        group.position.set(pose.x + Math.sin(pose.heading) * 2.6, pose.y + 0.85, pose.z + Math.cos(pose.heading) * 2.6);
        group.rotation.y = pose.heading;
        scene.add(group);
        projectiles.push({
          kind: resolvedKind,
          owner: actorId,
          target,
          group,
          progress: actorProgress(actorId) + 2.7 / course.length,
          lane: actorLane(actorId),
          age: 0,
          active: true,
        });
      };
      const spawnTrap = (actorId: number, now: number) => {
        const pose = actorPose(actorId);
        const group = new THREE.Group();
        const base = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.12, 0.15, 32), trapBaseMaterial);
        base.position.y = 0.1;
        base.castShadow = true;
        group.add(base);
        [[0, 0], [-0.48, -0.32], [0.48, -0.32], [-0.42, 0.38], [0.42, 0.38]].forEach(([x, z]) => {
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.86, 18), spikeMaterial);
          spike.position.set(x, 0.52, z);
          spike.castShadow = true;
          group.add(spike);
        });
        const x = pose.x - Math.sin(pose.heading) * 2.45;
        const z = pose.z - Math.cos(pose.heading) * 2.45;
        group.position.set(x, pose.y + 0.03, z);
        scene.add(group);
        traps.push({ owner: actorId, group, x, y: pose.y, z, armedAt: now + 650, active: true });
      };
      const useActorItem = (actorId: number, now: number) => {
        const item = actorItem(actorId);
        if (item === "EMPTY" || actorCrashing(actorId, now)) return;
        if (item === "FIRE") spawnProjectile(actorId, "FIRE");
        if (item === "HOMING") spawnProjectile(actorId, "HOMING");
        if (item === "SPIKES") spawnTrap(actorId, now);
        if (item === "SHIELD") setActorShield(actorId, true);
        if (item === "BOOST") {
          if (actorId === 0) {
            playerState.boostUntil = now + 2000;
            playerState.speed = Math.max(playerState.speed, 41);
          } else {
            rivalStates[actorId - 1].boostUntil = now + 2000;
          }
        }
        if (item === "AURORA") {
          if (actorId === 0) {
            playerState.auroraUntil = now + 5000;
          } else {
            rivalStates[actorId - 1].auroraUntil = now + 5000;
          }
        }
        if (item === "NOVA") {
          const origin = actorPose(actorId);
          novaEffect.position.set(origin.x, origin.y + 0.8, origin.z);
          novaStarted = now;
          for (let targetId = 0; targetId < 4; targetId += 1) {
            if (targetId !== actorId) {
              attackActor(targetId, "NOVA", now);
              novaHitUntil[targetId] = now + 950;
            }
          }
          novaFlashUntil = now + 1050;
        }
        setActorItem(actorId, "EMPTY", now);
      };

      const resize = () => {
        const width = Math.max(1, host.clientWidth);
        const height = Math.max(1, host.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();

      const animate = (now: number) => {
        const deltaMs = Math.min(32, now - previous);
        const dt = deltaMs / 1000;
        previous = now;
        const racing = phaseRef.current === "racing" && !finished;
        const playerCrashing = now < playerState.crashUntil;

        if (!playerCrashing && playerState.wasCrashing) {
          const nearest = course.nearest(playerState.x, playerState.z, playerState.lastU);
          const recovery = course.pointAt(nearest.u);
          playerState.x = recovery.x;
          playerState.y = recovery.y;
          playerState.z = recovery.z;
          playerState.heading = recovery.heading;
          playerState.pitch = recovery.pitch;
          playerState.lastU = nearest.u;
          playerState.speed = 9;
        }
        playerState.wasCrashing = playerCrashing;

        if (racing && !playerCrashing) {
          if (!raceStart) raceStart = now;
          const gas = keys.current.arrowup || keys.current.w || touch.current.gas;
          const brake = keys.current.arrowdown || keys.current.s || touch.current.brake;
          const left = keys.current.arrowleft || keys.current.a || touch.current.left;
          const right = keys.current.arrowright || keys.current.d || touch.current.right;
          const useItem = keys.current[" "] || keys.current.e || touch.current.item;
          if (useItem && !itemPressed && heldItem !== "EMPTY") {
            useActorItem(0, now);
          }
          itemPressed = Boolean(useItem);

          const boosting = now < playerState.boostUntil;
          const auroraActive = now < playerState.auroraUntil;
          if (gas) playerState.speed += (boosting ? 39 : 23) * dt;
          if (brake) playerState.speed -= 30 * dt;
          const nearestBefore = course.nearest(playerState.x, playerState.z, playerState.lastU);
          const onRoad = nearestBefore.distance <= BARRIER_LIMIT + 0.1;
          const steering = (left ? 1 : 0) + (right ? -1 : 0);
          const steerGrip = clamp(Math.abs(playerState.speed) / 8, 0.18, 1);
          playerState.heading += steering * 1.72 * dt * steerGrip * (playerState.speed >= 0 ? 1 : -1);
          playerState.speed *= Math.pow(onRoad ? 0.988 : 0.925, deltaMs / 16.67);
          playerState.speed = clamp(playerState.speed, -8, boosting ? 49 : auroraActive ? 36.5 : onRoad ? 34 : 13);
          playerState.x += Math.sin(playerState.heading) * playerState.speed * dt;
          playerState.z += Math.cos(playerState.heading) * playerState.speed * dt;

          let nearestAfter = course.nearest(playerState.x, playerState.z, nearestBefore.u);
          const lateralOffset = (playerState.x - nearestAfter.pose.x) * nearestAfter.pose.nx + (playerState.z - nearestAfter.pose.z) * nearestAfter.pose.nz;
          if (Math.abs(lateralOffset) > BARRIER_LIMIT) {
            const wallSide = Math.sign(lateralOffset);
            const boundaryLane = wallSide * (BARRIER_LIMIT - 0.06);
            playerState.x = nearestAfter.pose.x + nearestAfter.pose.nx * boundaryLane;
            playerState.z = nearestAfter.pose.z + nearestAfter.pose.nz * boundaryLane;
            const outwardX = nearestAfter.pose.nx * wallSide;
            const outwardZ = nearestAfter.pose.nz * wallSide;
            const velocityX = Math.sin(playerState.heading) * playerState.speed;
            const velocityZ = Math.cos(playerState.heading) * playerState.speed;
            const outwardSpeed = velocityX * outwardX + velocityZ * outwardZ;
            if (outwardSpeed > 0) {
              const reflectedX = velocityX - 2 * outwardSpeed * outwardX;
              const reflectedZ = velocityZ - 2 * outwardSpeed * outwardZ;
              playerState.heading = Math.atan2(reflectedX, reflectedZ);
              playerState.speed = Math.hypot(reflectedX, reflectedZ);
            }
            nearestAfter = course.nearest(playerState.x, playerState.z, nearestAfter.u);
          }
          const nextProgressDelta = progressDelta(nearestAfter.u, playerState.lastU);
          if (nearestAfter.distance <= BARRIER_LIMIT + 0.1 && Math.abs(nextProgressDelta) < 0.08) playerState.progress += nextProgressDelta;
          playerState.progress = Math.max(-0.04, playerState.progress);
          playerState.lastU = nearestAfter.u;
          playerState.y = THREE.MathUtils.lerp(playerState.y, nearestAfter.pose.y, 0.2);
          playerState.pitch = THREE.MathUtils.lerp(playerState.pitch, nearestAfter.pose.pitch, 0.15);

          if ((gas || boosting || auroraActive) && Math.abs(playerState.speed) > 4) {
            exhaustLife[exhaustCursor] = 1;
            const base = exhaustCursor * 3;
            exhaustPositions[base] = playerState.x - Math.sin(playerState.heading) * 2.1 + (Math.random() - 0.5) * 0.35;
            exhaustPositions[base + 1] = playerState.y + 0.58 + Math.random() * 0.2;
            exhaustPositions[base + 2] = playerState.z - Math.cos(playerState.heading) * 2.1 + (Math.random() - 0.5) * 0.35;
            exhaustCursor = (exhaustCursor + 1) % exhaustCount;
          }

          const position = 1 + rivalStates.filter((rival) => rival.progress > playerState.progress).length;
          if (now - hudTick > 80) {
            hudTick = now;
            onTelemetry(Math.max(0, playerState.speed * 7.1), playerState.progress, position);
          }
          if (playerState.progress >= TOTAL_LAPS - 0.005) {
            finished = true;
            playerState.speed *= 0.45;
            onFinish(now - raceStart, position);
          }
        } else {
          if (!racing) itemPressed = false;
          playerState.speed *= 0.94;
          if (phaseRef.current !== "racing") raceStart = 0;
        }

        if (racing) {
          rivalStates.forEach((rival, index) => {
            if (now >= rival.crashUntil) {
              const paceBoost = now < rival.boostUntil ? 1.42 : now < rival.auroraUntil ? 1.07 : 1;
              rival.progress += rival.pace * paceBoost * dt * (1 + Math.sin(now * 0.0012 + index) * 0.055);
              if (rival.item !== "EMPTY" && now >= rival.useAt) useActorItem(index + 1, now);
            }
          });

          pickupPoints.forEach((pickup) => {
            if (!pickup.active && now >= pickup.respawnAt) {
              pickup.active = true;
              pickup.group.visible = true;
            }
            if (!pickup.active) return;
            for (let actorId = 0; actorId < 4; actorId += 1) {
              if (actorItem(actorId) !== "EMPTY" || actorCrashing(actorId, now)) continue;
              const pose = actorPose(actorId);
              if (Math.hypot(pickup.x - pose.x, pickup.y - pose.y, pickup.z - pose.z) < 1.82) {
                pickup.active = false;
                pickup.group.visible = false;
                pickup.respawnAt = now + 6000;
                setActorItem(actorId, rollItem(actorRank(actorId)), now);
                break;
              }
            }
          });

          projectiles.forEach((projectile) => {
            if (!projectile.active) return;
            projectile.age += dt;
            const projectileSpeed = projectile.kind === "FIRE" ? 43 : 49;
            projectile.progress += (projectileSpeed / course.length) * dt;
            if (projectile.kind === "HOMING" && projectile.target !== null) {
              projectile.lane = THREE.MathUtils.lerp(projectile.lane, actorLane(projectile.target), 1 - Math.pow(0.035, dt));
            }
            const point = course.pointAt(projectile.progress, projectile.lane);
            projectile.group.position.set(point.x, point.y + 0.86 + (projectile.kind === "HOMING" ? Math.sin(now * 0.012) * 0.08 : 0), point.z);
            projectile.group.rotation.y = point.heading;
            projectile.group.rotation.x = point.pitch;
            if (projectile.kind === "FIRE") projectile.group.rotation.z += dt * 4;
            const targets = projectile.kind === "HOMING" && projectile.target !== null ? [projectile.target] : [0, 1, 2, 3];
            for (const targetId of targets) {
              if (targetId === projectile.owner || actorCrashing(targetId, now)) continue;
              const pose = actorPose(targetId);
              if (Math.hypot(projectile.group.position.x - pose.x, projectile.group.position.y - (pose.y + 0.85), projectile.group.position.z - pose.z) < 1.75) {
                attackActor(targetId, projectile.kind, now);
                projectile.active = false;
                projectile.group.visible = false;
                break;
              }
            }
            if (projectile.age > (projectile.kind === "FIRE" ? 3.4 : 9)) {
              projectile.active = false;
              projectile.group.visible = false;
            }
          });

          traps.forEach((trap) => {
            if (!trap.active || now < trap.armedAt) return;
            for (let actorId = 0; actorId < 4; actorId += 1) {
              if (actorCrashing(actorId, now)) continue;
              const pose = actorPose(actorId);
              if (Math.hypot(trap.x - pose.x, trap.y - pose.y, trap.z - pose.z) < 1.68) {
                attackActor(actorId, "SPIKES", now);
                trap.active = false;
                trap.group.visible = false;
                break;
              }
            }
          });

          for (let attackerId = 0; attackerId < 4; attackerId += 1) {
            const auroraUntil = attackerId === 0 ? playerState.auroraUntil : rivalStates[attackerId - 1].auroraUntil;
            if (now >= auroraUntil || actorCrashing(attackerId, now)) continue;
            const attackerPose = actorPose(attackerId);
            for (let targetId = 0; targetId < 4; targetId += 1) {
              if (targetId === attackerId || actorCrashing(targetId, now)) continue;
              const key = `${attackerId}-${targetId}`;
              if (now - (auroraContactTimes.get(key) ?? 0) < 1050) continue;
              const targetPose = actorPose(targetId);
              if (Math.hypot(attackerPose.x - targetPose.x, attackerPose.y - targetPose.y, attackerPose.z - targetPose.z) < 2.7) {
                attackActor(targetId, "AURORA", now);
                auroraContactTimes.set(key, now);
              }
            }
          }

          rivalStates.forEach((rival) => {
            const point = course.pointAt(rival.progress, rival.lane);
            const distance = Math.hypot(point.x - playerState.x, point.y - playerState.y, point.z - playerState.z);
            if (distance < 2.7 && now >= rival.auroraUntil && now >= playerState.auroraUntil && !playerCrashing) {
              playerState.speed *= 0.78;
            }
          });
        }

        player.position.set(playerState.x, playerState.y + KART_RIDE_HEIGHT, playerState.z);
        const driverLeft = Boolean(keys.current.arrowleft || keys.current.a || touch.current.left);
        const driverRight = Boolean(keys.current.arrowright || keys.current.d || touch.current.right);
        setKartDriverFrame(player, driverLeft && !driverRight ? 1 : driverRight && !driverLeft ? 2 : 0);
        if (playerCrashing) {
          const crashPhase = clamp((now - playerState.crashStart) / (playerState.crashUntil - playerState.crashStart), 0, 1);
          player.rotation.y = playerState.heading + crashPhase * TAU * 2.5;
          player.rotation.x = playerState.pitch + Math.sin(crashPhase * Math.PI * 5) * 0.18;
          player.rotation.z = Math.sin(crashPhase * Math.PI * 4) * 0.32;
        } else {
          player.rotation.y = playerState.heading;
          player.rotation.x = THREE.MathUtils.lerp(player.rotation.x, playerState.pitch, 0.2);
          player.rotation.z = THREE.MathUtils.lerp(player.rotation.z, -((keys.current.arrowleft || keys.current.a) ? -1 : (keys.current.arrowright || keys.current.d) ? 1 : 0) * 0.055, 0.12);
        }

      rivalStates.forEach((rival, index) => {
        const point = course.pointAt(rival.progress, rival.lane);
        rivalMeshes[index].position.set(point.x, point.y + KART_RIDE_HEIGHT, point.z);
        const lookAhead = course.pointAt(rival.progress + 0.006, rival.lane);
        let rivalTurn = lookAhead.heading - point.heading;
        if (rivalTurn > Math.PI) rivalTurn -= TAU;
        if (rivalTurn < -Math.PI) rivalTurn += TAU;
        setKartDriverFrame(rivalMeshes[index], rivalTurn > 0.035 ? 1 : rivalTurn < -0.035 ? 2 : 0);
        if (now < rival.crashUntil) {
          const crashPhase = clamp((now - rival.crashStart) / (rival.crashUntil - rival.crashStart), 0, 1);
          rivalMeshes[index].rotation.y = point.heading + crashPhase * TAU * 2.5;
          rivalMeshes[index].rotation.x = point.pitch + Math.sin(crashPhase * Math.PI * 5) * 0.18;
          rivalMeshes[index].rotation.z = Math.sin(crashPhase * Math.PI * 4) * 0.32;
        } else {
          rivalMeshes[index].rotation.y = point.heading;
          rivalMeshes[index].rotation.x = THREE.MathUtils.lerp(rivalMeshes[index].rotation.x, point.pitch, 0.2);
          rivalMeshes[index].rotation.z = THREE.MathUtils.lerp(rivalMeshes[index].rotation.z, 0, 0.2);
        }
      });
      pickupPoints.forEach((pickup) => {
        pickup.group.rotation.y += dt * 1.35;
        pickup.group.position.y = pickup.baseY + Math.sin(now * 0.003 + pickup.rowIndex * 0.7 + pickup.laneIndex * 0.18) * 0.14;
      });

        shieldBubbles.forEach((bubble, actorId) => {
          bubble.visible = actorHasShield(actorId) || now < actorAuroraUntil(actorId);
          bubble.rotation.y += dt * 0.7;
        });
        auroraAuras.forEach(({ aura, glow }, actorId) => {
          const auroraUntil = actorId === 0 ? playerState.auroraUntil : rivalStates[actorId - 1].auroraUntil;
          const active = now < auroraUntil;
          aura.visible = active;
          aura.rotation.y += dt * 1.8;
          aura.scale.setScalar(1 + Math.sin(now * 0.012 + actorId) * 0.05);
          glow.intensity = active ? 17 + Math.sin(now * 0.02) * 4 : 0;
        });

        const novaAge = now - novaStarted;
        const novaActive = novaAge >= 0 && novaAge < 1150;
        novaEffect.visible = novaActive;
        if (novaActive) {
          const novaProgress = clamp(novaAge / 1150, 0, 1);
          const waveScale = 1 + novaProgress * 34;
          novaWave.scale.setScalar(waveScale);
          novaWave.rotation.y += dt * 2.8;
          novaWaveMaterial.opacity = (1 - novaProgress) * 0.7;
          novaParticles.scale.setScalar(1 + novaProgress * 28);
          novaParticles.rotation.y += dt * 4.2;
          novaParticleMaterial.opacity = (1 - novaProgress) * 0.95;
          novaRings.forEach((ring, index) => {
            ring.scale.setScalar(1 + novaProgress * (18 + index * 3));
            ring.rotation.z += dt * (2.4 + index * 0.8);
            novaRingMaterials[index].opacity = (1 - novaProgress) * (0.9 - index * 0.14);
          });
        }
        novaHitBursts.forEach(({ burst, material, glow }, actorId) => {
          const remaining = novaHitUntil[actorId] - now;
          const active = remaining > 0;
          burst.visible = active;
          if (active) {
            const impactProgress = 1 - remaining / 950;
            burst.scale.setScalar(0.7 + impactProgress * 3.8);
            burst.rotation.y += dt * 7;
            burst.rotation.x += dt * 4;
            material.opacity = (1 - impactProgress) * 0.92;
            glow.intensity = (1 - impactProgress) * 36;
          } else {
            glow.intensity = 0;
          }
        });

        host.classList.toggle("focus-boost", now < playerState.boostUntil);
        host.classList.toggle("nova-flash", now < novaFlashUntil);

        for (let i = 0; i < exhaustCount; i += 1) {
          if (exhaustLife[i] <= 0) continue;
          exhaustLife[i] -= dt * 1.7;
          exhaustPositions[i * 3 + 1] += dt * 0.6;
        }
        exhaustGeometry.attributes.position.needsUpdate = true;

        const forward = new THREE.Vector3(Math.sin(playerState.heading), 0, Math.cos(playerState.heading));
        const desiredCamera = new THREE.Vector3(playerState.x, playerState.y, playerState.z)
          .addScaledVector(forward, -6.4)
          .add(new THREE.Vector3(0, 3.75, 0));
        if (camera.position.lengthSq() === 0) camera.position.copy(desiredCamera);
        camera.position.lerp(desiredCamera, 1 - Math.pow(0.015, dt));
        if (now < novaFlashUntil) {
          const shake = ((novaFlashUntil - now) / 1050) * 0.34;
          camera.position.x += Math.sin(now * 0.12) * shake;
          camera.position.y += Math.cos(now * 0.17) * shake * 0.55;
        }
        camera.lookAt(new THREE.Vector3(playerState.x, playerState.y + 0.95, playerState.z).addScaledVector(forward, 6));

        renderer.render(scene, camera);
        frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);

      disposeThree = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        host.classList.remove("focus-boost", "nova-flash");
        scene.traverse((object) => {
          if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.InstancedMesh) {
            object.geometry?.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => material?.dispose());
          }
        });
        driverTextures.forEach((texture) => texture.dispose());
        renderer.dispose();
        renderer.domElement.remove();
      };
    });

    return () => {
      disposed = true;
      disposeThree?.();
    };
  }, [runId, onFinish, onItemChange, onShieldChange, onTelemetry]);

  const bindTouch = (key: keyof typeof touch.current) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      touch.current[key] = true;
    },
    onPointerUp: () => { touch.current[key] = false; },
    onPointerCancel: () => { touch.current[key] = false; },
    onPointerLeave: () => { touch.current[key] = false; },
  });

  return (
    <div className="webgl-host" ref={hostRef}>
      {webglError && <div className="webgl-error">この端末ではWebGLを開始できませんでした。ブラウザの3D描画設定をご確認ください。</div>}
      <div className="nova-impact" aria-hidden="true" />
      <div className="touch-controls" aria-label="タッチ操作">
        <div className="touch-cluster">
          <button {...bindTouch("left")} aria-label="左へ曲がる">←</button>
          <button {...bindTouch("right")} aria-label="右へ曲がる">→</button>
        </div>
        <button className="item-button" {...bindTouch("item")} aria-label="アイテムを使う">ITEM</button>
        <div className="touch-cluster">
          <button className="brake" {...bindTouch("brake")} aria-label="ブレーキ">BRAKE</button>
          <button className="gas" {...bindTouch("gas")} aria-label="アクセル">GO</button>
        </div>
      </div>
    </div>
  );
}

const ITEM_LABELS: Record<ItemType, { icon: string; name: string }> = {
  EMPTY: { icon: "—", name: "NO ITEM" },
  FIRE: { icon: "◆", name: "FIRE" },
  HOMING: { icon: "◎", name: "HOMING" },
  BOOST: { icon: "⚡", name: "BOOST" },
  AURORA: { icon: "✦", name: "AURORA" },
  SPIKES: { icon: "▲", name: "SPIKES" },
  SHIELD: { icon: "◉", name: "SHIELD" },
  NOVA: { icon: "✹", name: "NOVA" },
};

export default function Home() {
  const [phase, setPhase] = useState<GamePhase>("ready");
  const [countdown, setCountdown] = useState("3");
  const [runId, setRunId] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [position, setPosition] = useState(4);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [finishTime, setFinishTime] = useState(0);
  const [finishPosition, setFinishPosition] = useState(1);
  const [item, setItem] = useState<ItemType>("EMPTY");
  const [shieldActive, setShieldActive] = useState(false);
  const timerStart = useRef(0);

  useEffect(() => {
    if (phase !== "racing") return;
    timerStart.current = performance.now();
    const timer = window.setInterval(() => setElapsed(performance.now() - timerStart.current), 31);
    return () => window.clearInterval(timer);
  }, [phase]);

  const startRace = useCallback(() => {
    setRunId((value) => value + 1);
    setSpeed(0);
    setPosition(4);
    setProgress(0);
    setElapsed(0);
    setItem("EMPTY");
    setShieldActive(false);
    setCountdown("3");
    setPhase("countdown");
    ["2", "1", "GO!"].forEach((value, index) => window.setTimeout(() => setCountdown(value), (index + 1) * 700));
    window.setTimeout(() => setPhase("racing"), 2800);
  }, []);

  const handleTelemetry = useCallback((nextSpeed: number, nextProgress: number, nextPosition: number) => {
    setSpeed(Math.round(nextSpeed));
    setProgress(clamp(nextProgress, 0, TOTAL_LAPS));
    setPosition(nextPosition);
  }, []);

  const handleFinish = useCallback((time: number, nextPosition: number) => {
    setFinishTime(time);
    setFinishPosition(nextPosition);
    setElapsed(time);
    setSpeed(0);
    setPhase("finished");
  }, []);

  const handleItemChange = useCallback((nextItem: ItemType) => setItem(nextItem), []);
  const handleShieldChange = useCallback((active: boolean) => setShieldActive(active), []);
  const leaderboard = RIVALS.map((rival) => ({ name: rival.name, badge: rival.badge, color: rival.name.toLowerCase() }));
  leaderboard.splice(position - 1, 0, { name: "YOU", badge: "ME", color: "cyan" });
  const currentLap = Math.min(TOTAL_LAPS, Math.floor(Math.max(0, progress)) + 1);
  const racePercent = clamp(progress / TOTAL_LAPS, 0, 1) * 100;
  const itemLabel = ITEM_LABELS[item];

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#race" aria-label="City Circuit ホーム">
          <span className="brand-mark">CC</span>
          <span><b>CITY</b> CIRCUIT <small>3D</small></span>
        </a>
        <div className="status-pill"><i /> DAYLIGHT RACE SYSTEM</div>
        <div className="sound-pill">CAM <span>FIXED CHASE / 03</span></div>
      </header>

      <section className="race-intro">
        <div>
          <div className="eyebrow"><span>01</span> CENTRAL CITY GRAND PRIX</div>
          <h1>OWN THE <em>AVENUE.</em></h1>
        </div>
        <p>S字、連続クランク、スロープを駆け抜ける約820mの立体市街地コース。<br />7種のアイテムを使いこなし、3ラップを制覇せよ。</p>
      </section>

      <section className="game-layout" id="race" aria-label="昼の市街地3Dカートレースゲーム">
        <div className="game-stage">
          <div className="game-hud">
            <div className="position"><b>{position}</b><span>/4<br />POSITION</span></div>
            <div className="lap"><span>LAP</span><b>{currentLap}/{TOTAL_LAPS}</b></div>
            <div className={`item-slot ${item !== "EMPTY" ? "loaded" : ""}`}>
              <span>ITEM {shieldActive && <em>SHIELD ON</em>}</span><b><i>{itemLabel.icon}</i>{itemLabel.name}</b>
            </div>
            <div className="camera-mode"><span>CAMERA</span><b>FIXED CHASE</b></div>
            <div className="timer"><span>RACE TIME</span><b>{formatTime(elapsed)}</b></div>
            <div className="speed"><b>{speed}</b><span>KM/H</span></div>
          </div>

          <RaceWorld phase={phase} runId={runId} onTelemetry={handleTelemetry} onFinish={handleFinish} onItemChange={handleItemChange} onShieldChange={handleShieldChange} />

          {phase === "ready" && (
            <div className="game-overlay">
              <div className="overlay-kicker">820M S-CURVE + CRANK // DAYLIGHT GRID</div>
              <h2>TAKE THE<br /><span>CITY LINE.</span></h2>
              <p><kbd>WASD</kbd> / <kbd>矢印キー</kbd> で運転　<kbd>SPACE</kbd> / <kbd>E</kbd> でアイテム</p>
              <button className="race-button" onClick={startRace}>START CITY RACE <span>→</span></button>
            </div>
          )}

          {phase === "countdown" && <div key={countdown} className={`countdown ${countdown === "GO!" ? "go" : ""}`}>{countdown}</div>}

          {phase === "finished" && (
            <div className="game-overlay finish-overlay">
              <div className="overlay-kicker">RACE COMPLETE</div>
              <h2>{finishPosition === 1 ? "YOU OWNED" : "CHASE THE"}<br /><span>{finishPosition === 1 ? "THE CITY." : "PODIUM."}</span></h2>
              <div className="finish-result"><b>{finishPosition}<sup>{finishPosition === 1 ? "ST" : finishPosition === 2 ? "ND" : finishPosition === 3 ? "RD" : "TH"}</sup></b><span>{formatTime(finishTime)}</span></div>
              <button className="race-button" onClick={startRace}>RACE AGAIN <span>↻</span></button>
            </div>
          )}
        </div>

        <aside className="race-panel">
          <div className="panel-heading"><span>LIVE GRID</span><b>{Math.round(racePercent)}%</b></div>
          <div className="progress-track"><i style={{ width: `${racePercent}%` }} /></div>
          <div className="leaderboard">
            {leaderboard.map((racer, index) => (
              <div className={`racer-row ${racer.name === "YOU" ? "active" : ""}`} key={racer.name}>
                <b className="rank">0{index + 1}</b>
                <span className={`avatar ${racer.color}`}>{racer.badge}</span>
                <span className="racer-name">{racer.name}<small>{racer.name === "YOU" ? "PLAYER ONE" : "CITY CREW"}</small></span>
                <span className="racer-dot" />
              </div>
            ))}
          </div>
          <div className="control-card">
            <span>DRIVE CONTROLS</span>
            <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div>
            <p>アクセル・ブレーキ・ステアリング</p>
          </div>
          <div className={`item-card ${item !== "EMPTY" ? "loaded" : ""}`}>
            <i>{itemLabel.icon}</i><span><b>{itemLabel.name}</b>{item === "EMPTY" ? "横一列のアイテムボックスを狙おう" : "SPACE / E で使用"}</span>
          </div>
          {shieldActive && <div className="shield-chip">◉ SHIELD ACTIVE · 1 HIT</div>}
          <div className="item-guide"><b>7 ITEMS</b><span>◆ FIRE　◎ HOMING　⚡ BOOST　✦ AURORA</span><span>▲ SPIKES　◉ SHIELD　✹ NOVA (LAST 5%)</span></div>
          <div className="render-badge"><b>820M ELEVATED CITY COURSE</b><span>S-CURVES · TRIPLE CRANK · BOUNCE BARRIERS</span></div>
        </aside>
      </section>

      <footer><span>CITY CIRCUIT © 2026</span><span>FULL 3D BROWSER ARCADE</span><span>RACE THE DAYLIGHT.</span></footer>
    </main>
  );
}
