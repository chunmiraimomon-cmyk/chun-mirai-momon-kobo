import type * as Three from "three";
import { getTurboIgnitionEnvelope } from "./turbo-energy-burst";

type ExhaustFrame = {
  active: boolean;
  timeSeconds: number;
  strength: number;
  drift: boolean;
  boosting: boolean;
  ignitionAge: number;
};

// Visual-only envelope shared by the real race and the local frame-step preview.
// The nozzle stays on its outlet: ignition changes its width/length, not its position.
export function turboExhaustProfile(frame: ExhaustFrame, index: number) {
  const { compression, blast } = getTurboIgnitionEnvelope(frame.ignitionAge);
  const time = frame.timeSeconds;
  const pulse = frame.strength * (0.98 + Math.sin(time * 37 + index * 1.8) * .1
    + Math.sin(time * 71 + index * 2.3) * .04);
  const width = (frame.drift ? 1.32 : 1) * (1 - compression * .34 + blast * .74);
  const length = pulse * (frame.drift ? 1.45 : 1) * (1 - compression * .48 - blast * .52);
  return { width, length, compression, blast };
}

export function createTurboExhaustVisual(THREE: typeof import("three"), parent: Three.Object3D) {
  const group = new THREE.Group();
  group.name = "kart-turbo-exhaust";
  const outer = new THREE.MeshBasicMaterial({ color: 0x249dff, transparent: true,
    opacity: .72, blending: THREE.AdditiveBlending, depthWrite: false });
  const inner = new THREE.MeshBasicMaterial({ color: 0xc9f7ff, transparent: true,
    opacity: .94, blending: THREE.AdditiveBlending, depthWrite: false });
  const clock = { value: 0 };
  for (const material of [outer, inner]) {
    material.onBeforeCompile = shader => {
      shader.uniforms.turboFlameTime = clock;
      shader.vertexShader = "uniform float turboFlameTime; varying vec2 vTurboUv; varying vec3 vTurboNormal; varying vec3 vTurboView;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
        vTurboUv = uv; vTurboNormal = normalize(normalMatrix * normal);
        float jetFlutter = pow(vTurboUv.y, 1.5) * 0.075;
        transformed.x += sin(vTurboUv.y * 18.0 - turboFlameTime * 29.0) * jetFlutter;
        transformed.z += cos(vTurboUv.y * 15.0 - turboFlameTime * 23.0) * jetFlutter;
      `).replace("#include <project_vertex>", `#include <project_vertex>
        vTurboView = -mvPosition.xyz;
      `);
      shader.fragmentShader = "uniform float turboFlameTime; varying vec2 vTurboUv; varying vec3 vTurboNormal; varying vec3 vTurboView;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
        float jetTipFade = 1.0 - smoothstep(0.58, 1.0, vTurboUv.y);
        float jetSoftRim = 0.5 + 0.5 * pow(abs(dot(normalize(vTurboNormal), normalize(vTurboView))), 0.7);
        float jetFlicker = 0.88 + 0.12 * sin(vTurboUv.y * 27.0 - turboFlameTime * 33.0 + vTurboUv.x * 13.0);
        diffuseColor.a *= jetTipFade * jetSoftRim * jetFlicker;
      `);
    };
    material.customProgramCacheKey = () => "drift-exhaust-flame-v3";
  }
  const nozzles = [-.68, .68].map(x => {
    const nozzle = new THREE.Group();
    nozzle.position.set(x, .62, -2.225);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(.33, 2.3, 10, 6, true), outer);
    flame.position.z = -1.15; flame.rotation.x = -Math.PI / 2;
    const core = new THREE.Mesh(new THREE.ConeGeometry(.16, 1.45, 8, 4, true), inner);
    core.position.z = -.725; core.rotation.x = -Math.PI / 2;
    nozzle.add(flame, core); group.add(nozzle);
    return nozzle;
  });
  group.visible = false; parent.add(group);
  return {
    group,
    update(frame: ExhaustFrame) {
      group.visible = frame.active;
      if (!frame.active) return;
      clock.value = frame.timeSeconds;
      nozzles.forEach((nozzle, index) => {
        const profile = turboExhaustProfile(frame, index);
        nozzle.scale.set(profile.width, profile.width, profile.length);
      });
      const { compression, blast } = getTurboIgnitionEnvelope(frame.ignitionAge);
      const ignitionOpacity = 1 - compression * .38;
      outer.opacity = Math.min(1, (frame.drift ? .98 : frame.boosting ? .9 : .8)
        * Math.max(.28, frame.strength) * ignitionOpacity);
      inner.opacity = Math.min(1, (frame.drift || frame.boosting ? .98 : .9)
        * Math.max(.34, frame.strength) * ignitionOpacity);
      // Saturated cyan on release instead of a white screen-filling flare.
      inner.color.setRGB(.58 - blast * .16, .92, 1);
    },
  };
}
