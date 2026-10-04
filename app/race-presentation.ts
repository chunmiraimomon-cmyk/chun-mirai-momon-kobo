import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// Only rendering resources live here. Road queries and vehicle physics remain
// owned by the race simulation, including the geometry used for landing.
export function createRacePresentation(
  renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera,
  sun: THREE.DirectionalLight, mobile: boolean, courseId: string,
) {
  const textures: THREE.Texture[] = [];
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.025);
  room.dispose();
  pmrem.dispose();
  scene.environment = environment.texture;
  // Reflections should reveal the paint, not add a white fill over the
  // existing hemisphere/sun lighting in every course.
  scene.environmentIntensity = 0.18;

  // A small world-space grain avoids UV seams and does not displace geometry.
  const surfaceMaterials = new Set<THREE.MeshStandardMaterial>();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial) || !material.userData.roadSurface || surfaceMaterials.has(material)) continue;
      surfaceMaterials.add(material);
      const previousCompile = material.onBeforeCompile;
      const previousKey = material.customProgramCacheKey();
      material.onBeforeCompile = (shader, render) => {
        previousCompile.call(material, shader, render);
        shader.vertexShader = "varying vec3 vFinishPosition;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvFinishPosition = (modelMatrix * vec4(position, 1.0)).xyz;");
        shader.fragmentShader = "varying vec3 vFinishPosition;\nfloat finishGrain(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n" + shader.fragmentShader;
        const wood = courseId === "pirate";
        shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
          float grain = finishGrain(floor(vFinishPosition.xz * 28.0));
          float grainFade = 1.0 - smoothstep(0.018, 0.085, length(fwidth(vFinishPosition.xz)));
          diffuseColor.rgb *= 1.0 + (grain - 0.5) * 0.16 * grainFade;
          ${wood ? "float plank = smoothstep(0.035, 0.07, abs(fract(vFinishPosition.x * 0.65) - 0.5)); diffuseColor.rgb *= mix(0.78, 1.0, plank);" : ""}
        `);
      };
      material.customProgramCacheKey = () => previousKey + ":surface-finish-v1:" + courseId;
    }
  });

  // Facades use the existing building meshes: windows on the side/rear faces
  // cost no extra meshes and remain visible from different racing viewpoints.
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const material = object.material;
    if (!(material instanceof THREE.MeshStandardMaterial) || !material.userData.buildingFacade) return;
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = "varying vec3 vFacadeLocal; varying vec3 vFacadeNormal;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvFacadeLocal = position; vFacadeNormal = normal;");
      shader.fragmentShader = "varying vec3 vFacadeLocal; varying vec3 vFacadeNormal;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
        vec2 facadeUV=vec2(abs(vFacadeNormal.z)>0.5?vFacadeLocal.x:vFacadeLocal.z,vFacadeLocal.y);
        vec2 cell=abs(fract(facadeUV*vec2(0.65,0.48))-0.5);
        vec2 soften=max(fwidth(facadeUV)*0.7,vec2(0.008));
        vec2 panes=1.0-smoothstep(vec2(0.26,0.24)-soften,vec2(0.26,0.24)+soften,cell);
        float facadeWindow=panes.x*panes.y*(1.0-step(0.5,abs(vFacadeNormal.y)));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.13,0.22,0.29),facadeWindow*0.7);
      `);
      shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,0.26,facadeWindow);");
    };
    material.customProgramCacheKey = () => "city-facade-v1";
  });

  // A soft sky gradient, tinted from the existing day/night/weather system.
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { skyTint: { value: new THREE.Color(0x8bcde8) }, night: { value: 0 } },
    vertexShader: "varying vec3 vDirection; void main(){ vDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: `uniform vec3 skyTint; uniform float night; varying vec3 vDirection;
      void main(){ float h=normalize(vDirection).y; float horizon=exp(-max(h,0.0)*5.0);
        vec3 zenith=skyTint*mix(vec3(0.47,0.7,1.0),vec3(0.48,0.52,0.8),night);
        vec3 haze=mix(skyTint*vec3(0.72,0.84,0.94),skyTint*0.7,night);
        gl_FragColor=vec4(mix(zenith,haze,horizon),1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  sky.frustumCulled = false;
  sky.scale.setScalar(camera.far * 0.92);
  sky.renderOrder = -100;
  scene.add(sky);

  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = glowCanvas.height = 64;
  const paint = glowCanvas.getContext("2d")!;
  const gradient = paint.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.18, "rgba(255,255,255,.95)");
  gradient.addColorStop(0.48, "rgba(255,255,255,.28)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  paint.fillStyle = gradient; paint.fillRect(0, 0, 64, 64);
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  textures.push(glowTexture);

  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  // Mobile retains the physical materials and lighting without a multi-pass
  // full-screen effect. Desktop starts with bloom and can step down once warm.
  if (!mobile) {
    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, samples: Math.min(4, renderer.capabilities.maxSamples),
    });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.07, 0.25, 2.2);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }
  const maxDpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.65);
  let dpr = maxDpr;
  let width = 1, height = 1, elapsed = 0, sampleSeconds = 0, frameSum = 0, frameCount = 0;
  let reduced = false;
  const sunOffset = sun.position.clone();
  sun.userData.presentationLightOffset = sunOffset;
  scene.add(sun.target);
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -68;
  sun.shadow.camera.right = sun.shadow.camera.top = 68;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 410;
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.0001;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.map?.dispose(); sun.shadow.map = null;

  const confettiCount = mobile ? 110 : 230;
  const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.17, 0.34), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), confettiCount);
  confetti.frustumCulled = false; confetti.visible = false;
  const confettiPosition = new Float32Array(confettiCount * 3);
  const confettiVelocity = new Float32Array(confettiCount * 3);
  const dummy = new THREE.Object3D();
  const palette = [0x6dfff2, 0xffcf42, 0xff6387, 0xffffff, 0x9a83ff];
  for (let i = 0; i < confettiCount; i++) confetti.setColorAt(i, new THREE.Color(palette[i % palette.length]));
  scene.add(confetti);
  let celebrated = false, confettiAge = 99;

  const resize = (w: number, h: number) => {
    width = w; height = h;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    if (composer) { composer.setPixelRatio(dpr); composer.setSize(w, h); }
  };
  const render = (dt: number, focus: THREE.Vector3, boosting: boolean, finished: boolean, baseFov: number, warmup = false) => {
    const step = Math.min(0.05, Math.max(0, dt));
    if (!warmup) {
      elapsed += step; sampleSeconds += step; frameSum += dt; frameCount++;
      // Long frames during loading/tab resume do not trigger quality changes.
      if (elapsed > 8 && sampleSeconds > 3) {
        const average = frameSum / Math.max(1, frameCount);
        if (average > 0.025 && dpr > 0.9) {
          dpr = Math.max(0.9, dpr - 0.2);
          resize(width, height);
        }
        if (!reduced && composer && average > 0.032) { composer.passes[1].enabled = false; reduced = true; }
        sampleSeconds = 0; frameSum = 0; frameCount = 0;
      }
    }
    if (scene.background instanceof THREE.Color) {
      sky.material.uniforms.skyTint.value.copy(scene.background);
      const color = scene.background;
      sky.material.uniforms.night.value = 1 - THREE.MathUtils.smoothstep(Math.max(color.r, color.g, color.b), 0.035, 0.4);
    }
    sky.position.copy(camera.position);
    // The cycle updates sunOffset before rendering. Moving light and target
    // together centers the shadow map without rotating the light direction.
    sun.target.position.copy(focus);
    sun.position.copy(focus).add(sunOffset);
    if (!warmup) {
      const targetFov = baseFov + (boosting ? 3.5 : 0);
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-step * 5));
      camera.updateProjectionMatrix();
    }
    if (bloom) bloom.strength = boosting ? 0.1 : 0.07;
    if (finished && !celebrated) {
      celebrated = true; confetti.visible = true; confettiAge = 0;
      for (let i = 0; i < confettiCount; i++) {
        const n = i * 3;
        confettiPosition[n] = focus.x + (i % 2 ? 1 : -1) * 3;
        confettiPosition[n + 1] = focus.y + 1;
        confettiPosition[n + 2] = focus.z + (Math.random() - 0.5) * 7;
        confettiVelocity[n] = (Math.random() - 0.5) * 10;
        confettiVelocity[n + 1] = 5 + Math.random() * 9;
        confettiVelocity[n + 2] = (Math.random() - 0.5) * 10;
      }
    }
    if (confetti.visible) {
      confettiAge += step;
      for (let i = 0; i < confettiCount; i++) {
        const n = i * 3;
        confettiVelocity[n + 1] = Math.max(-2.8, confettiVelocity[n + 1] - step * 5);
        confettiPosition[n] += (confettiVelocity[n] + Math.sin(confettiAge * 3 + i)) * step;
        confettiPosition[n + 1] += confettiVelocity[n + 1] * step;
        confettiPosition[n + 2] += confettiVelocity[n + 2] * step;
        dummy.position.fromArray(confettiPosition, n);
        dummy.rotation.set(confettiAge * (1 + i % 4), i + confettiAge, confettiAge * 2);
        dummy.scale.setScalar(Math.min(1, Math.max(0, 7 - confettiAge)));
        dummy.updateMatrix(); confetti.setMatrixAt(i, dummy.matrix);
      }
      confetti.instanceMatrix.needsUpdate = true;
      if (confettiAge > 7) confetti.visible = false;
    }
    if (composer && !reduced) composer.render();
    else renderer.render(scene, camera);
  };
  return {
    glowTexture, resize, render,
    dispose() {
      scene.environment = null;
      environment.dispose(); textures.forEach((texture) => texture.dispose());
      composer?.passes.forEach((pass) => pass.dispose()); composer?.dispose();
      scene.remove(sky, confetti);
      sky.geometry.dispose(); sky.material.dispose();
      confetti.geometry.dispose(); confetti.material.dispose();
    },
  };
}
