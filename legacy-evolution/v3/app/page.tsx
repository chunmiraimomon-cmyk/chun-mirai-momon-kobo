"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type * as Three from "three";

type ThreeModule = typeof Three;

const TAU = Math.PI * 2;
const TRACK_RX = 38;
const TRACK_RZ = 23.5;
const START_T = Math.PI / 2;

type GamePhase = "ready" | "countdown" | "racing" | "finished";

type Racer = {
  name: string;
  badge: string;
  color: number;
  accent: number;
  progress: number;
  pace: number;
  lane: number;
};

const RIVALS: Racer[] = [
  { name: "PIXEL", badge: "PX", color: 0xff4fa3, accent: 0xffd8ec, progress: -0.035, pace: 0.059, lane: -1.9 },
  { name: "VOLT", badge: "VT", color: 0x8b62ff, accent: 0xe4dbff, progress: -0.073, pace: 0.056, lane: 1.4 },
  { name: "COMET", badge: "CM", color: 0xffb545, accent: 0xffefd1, progress: -0.11, pace: 0.053, lane: -0.3 },
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function formatTime(ms: number) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const centis = Math.floor((ms % 1000) / 10);
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${centis.toString().padStart(2, "0")}`;
}

function angleDelta(a: number, b: number) {
  let delta = a - b;
  while (delta > Math.PI) delta -= TAU;
  while (delta < -Math.PI) delta += TAU;
  return delta;
}

function trackPoint(t: number, lane = 0) {
  const rx = TRACK_RX + lane;
  const rz = TRACK_RZ + lane * 0.7;
  const x = Math.cos(t) * rx;
  const z = Math.sin(t) * rz;
  const dx = -Math.sin(t) * rx;
  const dz = Math.cos(t) * rz;
  const heading = Math.atan2(dx, dz);
  return { x, z, heading };
}

function makeTrackGeometry(THREE: ThreeModule, outerRX: number, outerRZ: number, innerRX: number, innerRZ: number) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const segments = 192;
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * TAU;
    const b = ((i + 1) / segments) * TAU;
    const oa = [Math.cos(a) * outerRX, 0, Math.sin(a) * outerRZ];
    const ob = [Math.cos(b) * outerRX, 0, Math.sin(b) * outerRZ];
    const ia = [Math.cos(a) * innerRX, 0, Math.sin(a) * innerRZ];
    const ib = [Math.cos(b) * innerRX, 0, Math.sin(b) * innerRZ];
    positions.push(...oa, ...ia, ...ob, ...ob, ...ia, ...ib);
    uvs.push(i / segments, 1, i / segments, 0, (i + 1) / segments, 1, (i + 1) / segments, 1, i / segments, 0, (i + 1) / segments, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function neonMaterial(THREE: ThreeModule, color: number, intensity = 1.7) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.32,
    metalness: 0.45,
  });
}

function createKart(THREE: ThreeModule, color: number, accent: number, player = false) {
  const kart = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.55, metalness: 0.65 });
  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: player ? 0.25 : 0.12,
    roughness: 0.24,
    metalness: 0.72,
  });
  const accentMat = neonMaterial(THREE, accent, player ? 1.25 : 0.7);
  const glass = new THREE.MeshStandardMaterial({ color: 0x132f4e, emissive: 0x0d7894, emissiveIntensity: 0.35, roughness: 0.08, metalness: 0.8 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.42, 3.55), bodyMat);
  chassis.position.y = 0.65;
  chassis.castShadow = true;
  kart.add(chassis);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.28, 1.45), bodyMat);
  nose.position.set(0, 0.58, 2.15);
  nose.scale.set(0.72, 1, 1);
  nose.rotation.x = -0.1;
  nose.castShadow = true;
  kart.add(nose);

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.2, 0.3), accentMat);
  bumper.position.set(0, 0.44, 2.78);
  kart.add(bumper);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.08, 0.75), dark);
  seat.position.set(0, 1.17, -0.45);
  seat.rotation.x = -0.12;
  kart.add(seat);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.52, 20, 14), accentMat);
  helmet.position.set(0, 1.82, -0.34);
  helmet.castShadow = true;
  kart.add(helmet);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.24, 0.12), glass);
  visor.position.set(0, 1.84, 0.12);
  kart.add(visor);

  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.14, 0.48), bodyMat);
  spoiler.position.set(0, 1.16, -2.03);
  kart.add(spoiler);
  const spoilerStem = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 0.18), dark);
  spoilerStem.position.set(0, 0.88, -1.86);
  kart.add(spoilerStem);

  const wheelGeometry = new THREE.CylinderGeometry(0.54, 0.54, 0.42, 18);
  const rimMaterial = neonMaterial(THREE, player ? 0x43edee : accent, 0.7);
  [[-1.3, 1.45], [1.3, 1.45], [-1.3, -1.35], [1.3, -1.35]].forEach(([x, z]) => {
    const tire = new THREE.Mesh(wheelGeometry, dark);
    tire.rotation.z = Math.PI / 2;
    tire.position.set(x, 0.58, z);
    tire.castShadow = true;
    kart.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.44, 14), rimMaterial);
    rim.rotation.z = Math.PI / 2;
    rim.position.set(x, 0.58, z);
    kart.add(rim);
  });

  const rearGlow = new THREE.PointLight(player ? 0x43edee : color, player ? 14 : 4, player ? 10 : 5, 2);
  rearGlow.position.set(0, 0.8, -2.2);
  kart.add(rearGlow);
  kart.scale.setScalar(player ? 0.92 : 0.86);
  return kart;
}

function addRail(THREE: ThreeModule, scene: Three.Scene, rx: number, rz: number, color: number, height: number) {
  const geometry = new THREE.BoxGeometry(1.6, 0.22, 0.14);
  const material = neonMaterial(THREE, color, 2.2);
  const rail = new THREE.InstancedMesh(geometry, material, 144);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 144; i += 1) {
    const t = (i / 144) * TAU;
    const next = ((i + 1) / 144) * TAU;
    const x = Math.cos(t) * rx;
    const z = Math.sin(t) * rz;
    const dx = Math.cos(next) * rx - x;
    const dz = Math.sin(next) * rz - z;
    dummy.position.set(x, height, z);
    dummy.rotation.set(0, -Math.atan2(dz, dx), 0);
    dummy.scale.set(Math.hypot(dx, dz) / 1.6 + 0.08, 1, 1);
    dummy.updateMatrix();
    rail.setMatrixAt(i, dummy.matrix);
  }
  rail.instanceMatrix.needsUpdate = true;
  scene.add(rail);
}

function addWorld(THREE: ThreeModule, scene: Three.Scene) {
  scene.background = new THREE.Color(0x050817);
  scene.fog = new THREE.FogExp2(0x070a19, 0.0065);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshStandardMaterial({ color: 0x070b18, roughness: 0.92, metalness: 0.06 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.15;
  ground.receiveShadow = true;
  scene.add(ground);

  const road = new THREE.Mesh(
    makeTrackGeometry(THREE, 49, 34, 27, 13),
    new THREE.MeshStandardMaterial({ color: 0x191f2f, roughness: 0.52, metalness: 0.42 }),
  );
  road.position.y = 0.02;
  road.receiveShadow = true;
  scene.add(road);

  const island = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 0.18, 96),
    new THREE.MeshStandardMaterial({ color: 0x0b1630, roughness: 0.78, metalness: 0.18 }),
  );
  island.scale.set(26.8, 1, 12.8);
  island.position.y = -0.03;
  island.receiveShadow = true;
  scene.add(island);

  addRail(THREE, scene, 49.2, 34.2, 0x43edee, 0.82);
  addRail(THREE, scene, 26.8, 12.8, 0xff4fa3, 0.65);

  const dashGeo = new THREE.BoxGeometry(1.45, 0.045, 0.12);
  const dashMat = neonMaterial(THREE, 0xb8d5e8, 0.45);
  for (let i = 0; i < 72; i += 1) {
    if (i % 2) continue;
    const t = (i / 72) * TAU;
    const p = trackPoint(t);
    const dash = new THREE.Mesh(dashGeo, dashMat);
    dash.position.set(p.x, 0.09, p.z);
    const next = trackPoint(t + 0.01);
    dash.rotation.y = -Math.atan2(next.z - p.z, next.x - p.x);
    scene.add(dash);
  }

  const boostMat = neonMaterial(THREE, 0x43edee, 3.2);
  [0.12, 2.9, 5.08].forEach((t) => {
    const center = trackPoint(t);
    for (let offset = -3; offset <= 3; offset += 1.5) {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.5), boostMat);
      const nx = Math.cos(t);
      const nz = Math.sin(t);
      pad.position.set(center.x + nx * offset, 0.12, center.z + nz * offset * 0.7);
      pad.rotation.y = -Math.atan2(Math.cos(t) * TRACK_RZ, -Math.sin(t) * TRACK_RX);
      scene.add(pad);
    }
    const light = new THREE.PointLight(0x43edee, 28, 13, 2);
    light.position.set(center.x, 2.1, center.z);
    scene.add(light);
  });

  const start = trackPoint(START_T);
  for (let i = -8; i <= 8; i += 1) {
    const tile = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 0.07, 1.05),
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0xf5fbff : 0x111625, roughness: 0.4, metalness: 0.35 }),
    );
    tile.position.set(start.x, 0.11, start.z + i * 1.05);
    scene.add(tile);
  }

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x17233c, metalness: 0.72, roughness: 0.3 });
  for (let i = 0; i < 36; i += 1) {
    const t = (i / 36) * TAU;
    const outer = i % 2 === 0;
    const rx = outer ? 54 : 23;
    const rz = outer ? 39 : 10.2;
    const x = Math.cos(t) * rx;
    const z = Math.sin(t) * rz;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.6, 8), poleMat);
    pole.position.set(x, 1.3, z);
    scene.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), neonMaterial(THREE, i % 2 ? 0xff4fa3 : 0x43edee, 3));
    bulb.position.set(x, 2.67, z);
    scene.add(bulb);
  }

  const buildingMats = [
    new THREE.MeshStandardMaterial({ color: 0x101b36, emissive: 0x071331, emissiveIntensity: 0.7, roughness: 0.62 }),
    new THREE.MeshStandardMaterial({ color: 0x162348, emissive: 0x15082e, emissiveIntensity: 0.65, roughness: 0.55 }),
  ];
  const windowMats = [neonMaterial(THREE, 0x43edee, 1.8), neonMaterial(THREE, 0xff4fa3, 1.8), neonMaterial(THREE, 0x8b62ff, 1.6)];

  const makeBuilding = (x: number, z: number, w: number, d: number, h: number, index: number) => {
    const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), buildingMats[index % 2]);
    building.position.set(x, h / 2, z);
    building.castShadow = true;
    building.receiveShadow = true;
    scene.add(building);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(w * 0.56, Math.max(0.18, h * 0.025), 0.08), windowMats[index % 3]);
    const towardCenterX = Math.abs(x) > Math.abs(z);
    if (towardCenterX) {
      sign.rotation.y = Math.PI / 2;
      sign.position.set(x + (x > 0 ? -w / 2 - 0.05 : w / 2 + 0.05), h * 0.62, z);
    } else {
      sign.position.set(x, h * 0.62, z + (z > 0 ? -d / 2 - 0.05 : d / 2 + 0.05));
    }
    scene.add(sign);
  };

  const innerBuildings: Array<[number, number, number, number, number]> = [
    [-13, -2, 4.5, 4.2, 11], [-7, 2, 3.7, 4, 16], [-1, -1, 4.6, 4.2, 12],
    [5, 2, 4, 3.7, 18], [11, -2, 3.8, 4.2, 13], [0, 5.5, 3, 2.5, 9],
  ];
  innerBuildings.forEach((building, index) => makeBuilding(...building, index));

  for (let i = 0; i < 42; i += 1) {
    const t = (i / 42) * TAU + 0.08 * Math.sin(i * 2.1);
    const radiusX = 69 + (i % 4) * 4;
    const radiusZ = 51 + (i % 5) * 3;
    const w = 3.5 + (i % 3) * 1.2;
    const d = 3.4 + ((i + 1) % 3);
    const h = 8 + (i * 7 % 18);
    makeBuilding(Math.cos(t) * radiusX, Math.sin(t) * radiusZ, w, d, h, i + 8);
  }

  const stars: number[] = [];
  for (let i = 0; i < 500; i += 1) {
    const theta = i * 2.399;
    const radius = 95 + (i % 31) * 2;
    stars.push(Math.cos(theta) * radius, 28 + (i % 29) * 2.4, Math.sin(theta) * radius);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(stars, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x9fdcff, size: 0.18, transparent: true, opacity: 0.72 })));

  scene.add(new THREE.HemisphereLight(0x79dfff, 0x170b28, 1.35));
  const moon = new THREE.DirectionalLight(0x9fb9ff, 1.8);
  moon.position.set(-25, 48, 12);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = -65;
  moon.shadow.camera.right = 65;
  moon.shadow.camera.top = 55;
  moon.shadow.camera.bottom = -55;
  scene.add(moon);
}

function RaceWorld({
  phase,
  runId,
  onTelemetry,
  onFinish,
}: {
  phase: GamePhase;
  runId: number;
  onTelemetry: (speed: number, progress: number, position: number) => void;
  onFinish: (time: number, position: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef(phase);
  const keys = useRef<Record<string, boolean>>({});
  const touch = useRef({ left: false, right: false, gas: false, brake: false });
  const [webglError, setWebglError] = useState(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(event.key.toLowerCase())) event.preventDefault();
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

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-label", "自機後方視点の3Dネオンカートレース");
    renderer.domElement.setAttribute("role", "img");
    host.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    addWorld(THREE, scene);
    const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 280);

    const player = createKart(THREE, 0x25d9db, 0xd7ffff, true);
    const start = trackPoint(START_T);
    player.position.set(start.x, 0.05, start.z);
    player.rotation.y = start.heading;
    scene.add(player);

    const rivalStates = RIVALS.map((rival) => ({ ...rival }));
    const rivalMeshes = rivalStates.map((rival) => {
      const mesh = createKart(THREE, rival.color, rival.accent);
      scene.add(mesh);
      return mesh;
    });

    const exhaustCount = 72;
    const exhaustPositions = new Float32Array(exhaustCount * 3);
    const exhaustLife = new Float32Array(exhaustCount);
    const exhaustGeometry = new THREE.BufferGeometry();
    exhaustGeometry.setAttribute("position", new THREE.BufferAttribute(exhaustPositions, 3));
    const exhaust = new THREE.Points(exhaustGeometry, new THREE.PointsMaterial({ color: 0x43edee, size: 0.32, transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(exhaust);
    let exhaustCursor = 0;

    const playerState = {
      x: start.x,
      z: start.z,
      heading: start.heading,
      speed: 0,
      progress: 0,
      lastTheta: START_T,
    };
    let raceStart = 0;
    let previous = performance.now();
    let frame = 0;
    let hudTick = 0;
    let finished = false;

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

      if (racing) {
        if (!raceStart) raceStart = now;
        const gas = keys.current.arrowup || keys.current.w || touch.current.gas;
        const brake = keys.current.arrowdown || keys.current.s || touch.current.brake;
        const left = keys.current.arrowleft || keys.current.a || touch.current.left;
        const right = keys.current.arrowright || keys.current.d || touch.current.right;
        if (gas) playerState.speed += 23 * dt;
        if (brake) playerState.speed -= 30 * dt;

        const outer = (playerState.x / 49) ** 2 + (playerState.z / 34) ** 2;
        const inner = (playerState.x / 27) ** 2 + (playerState.z / 13) ** 2;
        const onRoad = outer <= 1 && inner >= 1;
        const steering = (left ? -1 : 0) + (right ? 1 : 0);
        const steerGrip = clamp(Math.abs(playerState.speed) / 8, 0.18, 1);
        playerState.heading += steering * 1.72 * dt * steerGrip * (playerState.speed >= 0 ? 1 : -1);

        playerState.speed *= Math.pow(onRoad ? 0.988 : 0.925, deltaMs / 16.67);
        playerState.speed = clamp(playerState.speed, -8, onRoad ? 34 : 13);

        const theta = Math.atan2(playerState.z / TRACK_RZ, playerState.x / TRACK_RX);
        const boosted = [0.12, 2.9, 5.08].some((boost) => Math.abs(angleDelta(theta, boost)) < 0.07) && onRoad && playerState.speed > 8;
        if (boosted) playerState.speed = clamp(playerState.speed + 42 * dt, -8, 43);

        playerState.x += Math.sin(playerState.heading) * playerState.speed * dt;
        playerState.z += Math.cos(playerState.heading) * playerState.speed * dt;

        const newTheta = Math.atan2(playerState.z / TRACK_RZ, playerState.x / TRACK_RX);
        const progressDelta = angleDelta(newTheta, playerState.lastTheta);
        if (onRoad && Math.abs(progressDelta) < 0.14) playerState.progress += progressDelta / TAU;
        playerState.progress = Math.max(-0.04, playerState.progress);
        playerState.lastTheta = newTheta;

        rivalStates.forEach((rival, index) => {
          rival.progress += rival.pace * dt * (1 + Math.sin(now * 0.0012 + index) * 0.055);
          const point = trackPoint(START_T + rival.progress * TAU, rival.lane);
          const distance = Math.hypot(point.x - playerState.x, point.z - playerState.z);
          if (distance < 2.7) {
            playerState.speed *= 0.72;
            playerState.x -= Math.sin(playerState.heading) * 0.7;
            playerState.z -= Math.cos(playerState.heading) * 0.7;
          }
        });

        if ((gas || boosted) && Math.abs(playerState.speed) > 4) {
          exhaustLife[exhaustCursor] = 1;
          const base = exhaustCursor * 3;
          exhaustPositions[base] = playerState.x - Math.sin(playerState.heading) * 2.1 + (Math.random() - 0.5) * 0.35;
          exhaustPositions[base + 1] = 0.58 + Math.random() * 0.2;
          exhaustPositions[base + 2] = playerState.z - Math.cos(playerState.heading) * 2.1 + (Math.random() - 0.5) * 0.35;
          exhaustCursor = (exhaustCursor + 1) % exhaustCount;
        }

        const position = 1 + rivalStates.filter((rival) => rival.progress > playerState.progress).length;
        if (now - hudTick > 80) {
          hudTick = now;
          onTelemetry(Math.max(0, playerState.speed * 7.1), playerState.progress, position);
        }
        if (playerState.progress >= 0.995) {
          finished = true;
          playerState.speed *= 0.45;
          onFinish(now - raceStart, position);
        }
      } else {
        playerState.speed *= 0.94;
        if (phaseRef.current !== "racing") raceStart = 0;
      }

      player.position.set(playerState.x, 0.05 + Math.sin(now * 0.01) * Math.min(Math.abs(playerState.speed) / 900, 0.025), playerState.z);
      player.rotation.y = playerState.heading;
      player.rotation.z = THREE.MathUtils.lerp(player.rotation.z, -((keys.current.arrowleft || keys.current.a) ? -1 : (keys.current.arrowright || keys.current.d) ? 1 : 0) * 0.055, 0.12);

      rivalStates.forEach((rival, index) => {
        const point = trackPoint(START_T + rival.progress * TAU, rival.lane);
        rivalMeshes[index].position.set(point.x, 0.05, point.z);
        rivalMeshes[index].rotation.y = point.heading;
      });

      for (let i = 0; i < exhaustCount; i += 1) {
        if (exhaustLife[i] <= 0) continue;
        exhaustLife[i] -= dt * 1.7;
        exhaustPositions[i * 3 + 1] += dt * 0.6;
      }
      exhaustGeometry.attributes.position.needsUpdate = true;

      const forward = new THREE.Vector3(Math.sin(playerState.heading), 0, Math.cos(playerState.heading));
      const desiredCamera = new THREE.Vector3(playerState.x, 0, playerState.z)
        .addScaledVector(forward, -9.5)
        .add(new THREE.Vector3(0, 5.2 + clamp(Math.abs(playerState.speed) / 28, 0, 1.3), 0));
      if (camera.position.lengthSq() === 0) camera.position.copy(desiredCamera);
      camera.position.lerp(desiredCamera, 1 - Math.pow(0.015, dt));
      const lookAt = new THREE.Vector3(playerState.x, 1.05, playerState.z).addScaledVector(forward, 8 + Math.abs(playerState.speed) * 0.09);
      camera.lookAt(lookAt);
      camera.fov = THREE.MathUtils.lerp(camera.fov, 62 + clamp(Math.abs(playerState.speed) * 0.34, 0, 11), 0.05);
      camera.updateProjectionMatrix();

      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);

    disposeThree = () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.InstancedMesh) {
          object.geometry?.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material?.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
    });

    return () => {
      disposed = true;
      disposeThree?.();
    };
  }, [runId, onFinish, onTelemetry]);

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
      <div className="touch-controls" aria-label="タッチ操作">
        <div className="touch-cluster">
          <button {...bindTouch("left")} aria-label="左へ曲がる">←</button>
          <button {...bindTouch("right")} aria-label="右へ曲がる">→</button>
        </div>
        <div className="touch-cluster">
          <button className="brake" {...bindTouch("brake")} aria-label="ブレーキ">BRAKE</button>
          <button className="gas" {...bindTouch("gas")} aria-label="アクセル">GO</button>
        </div>
      </div>
    </div>
  );
}

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
    setCountdown("3");
    setPhase("countdown");
    ["2", "1", "GO!"].forEach((value, index) => {
      window.setTimeout(() => setCountdown(value), (index + 1) * 700);
    });
    window.setTimeout(() => setPhase("racing"), 2800);
  }, []);

  const handleTelemetry = useCallback((nextSpeed: number, nextProgress: number, nextPosition: number) => {
    setSpeed(Math.round(nextSpeed));
    setProgress(clamp(nextProgress, 0, 1));
    setPosition(nextPosition);
  }, []);

  const handleFinish = useCallback((time: number, nextPosition: number) => {
    setFinishTime(time);
    setFinishPosition(nextPosition);
    setElapsed(time);
    setSpeed(0);
    setPhase("finished");
  }, []);

  const leaderboard = RIVALS.map((rival) => ({ name: rival.name, badge: rival.badge, color: rival.name.toLowerCase() }));
  leaderboard.splice(position - 1, 0, { name: "YOU", badge: "ME", color: "cyan" });

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#race" aria-label="Neon Circuit ホーム">
          <span className="brand-mark">NC</span>
          <span><b>NEON</b> CIRCUIT <small>3D</small></span>
        </a>
        <div className="status-pill"><i /> WEBGL RACE SYSTEM</div>
        <div className="sound-pill">CAM <span>CHASE / 03</span></div>
      </header>

      <section className="race-intro">
        <div>
          <div className="eyebrow"><span>01</span> NIGHT SHIFT CUP</div>
          <h1>CHASE THE <em>AFTERGLOW.</em></h1>
        </div>
        <p>自機後方から飛び込む、フル3Dのネオンレース。<br />立体都市を抜け、1ラップを制圧せよ。</p>
      </section>

      <section className="game-layout" id="race" aria-label="3Dカートレースゲーム">
        <div className="game-stage">
          <div className="game-hud">
            <div className="position"><b>{position}</b><span>/4<br />POSITION</span></div>
            <div className="lap"><span>LAP</span><b>1/1</b></div>
            <div className="camera-mode"><span>CAMERA</span><b>CHASE</b></div>
            <div className="timer"><span>RACE TIME</span><b>{formatTime(elapsed)}</b></div>
            <div className="speed"><b>{speed}</b><span>KM/H</span></div>
          </div>

          <RaceWorld phase={phase} runId={runId} onTelemetry={handleTelemetry} onFinish={handleFinish} />

          {phase === "ready" && (
            <div className="game-overlay">
              <div className="overlay-kicker">NOVA LOOP // FULL 3D GRID</div>
              <h2>ENTER THE<br /><span>NEON DEPTH.</span></h2>
              <p><kbd>WASD</kbd> または <kbd>矢印キー</kbd> でドライブ</p>
              <button className="race-button" onClick={startRace}>START 3D RACE <span>→</span></button>
            </div>
          )}

          {phase === "countdown" && <div key={countdown} className={`countdown ${countdown === "GO!" ? "go" : ""}`}>{countdown}</div>}

          {phase === "finished" && (
            <div className="game-overlay finish-overlay">
              <div className="overlay-kicker">RACE COMPLETE</div>
              <h2>{finishPosition === 1 ? "YOU OWNED" : "CHASE THE"}<br /><span>{finishPosition === 1 ? "THE NIGHT." : "PODIUM."}</span></h2>
              <div className="finish-result"><b>{finishPosition}<sup>{finishPosition === 1 ? "ST" : finishPosition === 2 ? "ND" : finishPosition === 3 ? "RD" : "TH"}</sup></b><span>{formatTime(finishTime)}</span></div>
              <button className="race-button" onClick={startRace}>RACE AGAIN <span>↻</span></button>
            </div>
          )}
        </div>

        <aside className="race-panel">
          <div className="panel-heading"><span>LIVE GRID</span><b>{Math.round(progress * 100)}%</b></div>
          <div className="progress-track"><i style={{ width: `${progress * 100}%` }} /></div>
          <div className="leaderboard">
            {leaderboard.map((racer, index) => (
              <div className={`racer-row ${racer.name === "YOU" ? "active" : ""}`} key={racer.name}>
                <b className="rank">0{index + 1}</b>
                <span className={`avatar ${racer.color}`}>{racer.badge}</span>
                <span className="racer-name">{racer.name}<small>{racer.name === "YOU" ? "PLAYER ONE" : "NOVA CREW"}</small></span>
                <span className="racer-dot" />
              </div>
            ))}
          </div>
          <div className="control-card">
            <span>DRIVE CONTROLS</span>
            <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div>
            <p>アクセル・ブレーキ・ステアリング</p>
          </div>
          <div className="boost-tip"><i>⚡</i><span><b>CYAN BOOST</b>発光パッドで加速、路肩では減速</span></div>
          <div className="render-badge"><b>REAL-TIME 3D</b><span>WEBGL · DYNAMIC LIGHTS · CHASE CAM</span></div>
        </aside>
      </section>

      <footer><span>NEON CIRCUIT © 2088</span><span>FULL 3D BROWSER ARCADE</span><span>RACE CLEAN. RACE BRIGHT.</span></footer>
    </main>
  );
}
