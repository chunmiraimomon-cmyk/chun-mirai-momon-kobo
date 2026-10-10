import type * as Three from "three";

export const TURBO_RELEASE_DELAY_SECONDS = .055;

// The exhaust and polygon burst share this clock, never a vehicle parameter.
// Compression is deliberately very brief; the ignition then snaps on and settles.
export function getTurboIgnitionEnvelope(elapsedSeconds: number) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds >= .5) return { compression: 0, blast: 0 };
  const charge = elapsedSeconds / TURBO_RELEASE_DELAY_SECONDS;
  const compression = charge < 1 ? Math.sin(Math.PI * charge) : 0;
  const release = elapsedSeconds - TURBO_RELEASE_DELAY_SECONDS;
  const blast = release < 0 || release >= .245 ? 0
    : release <= .055 ? 1 - .18 * release / .055
      : .82 * Math.pow(1 - (release - .055) / .19, 1.6);
  return { compression, blast };
}

// Separate silhouettes and aspect ratios, not six seeds of the same outline.
// These are also the single source for the shader and the shape regression tests.
export const TURBO_ENERGY_VARIANTS = [
  { name: "zigzag-bolt", scale: [1.10, .68], outline: [[-.48,-.06],[-.19,.13],[-.32,.35],[.04,.15],[-.02,.39],[.48,.02],[.13,-.13],[.24,-.35],[-.16,-.20],[-.06,-.08]] },
  { name: "short-spear", scale: [.58, .50], outline: [[-.47,-.28],[.49,.02],[-.30,.37],[-.12,.01]] },
  { name: "split-fork", scale: [1.38, 1.12], outline: [[-.48,-.08],[-.13,.04],[.35,.44],[.14,.08],[.49,.03],[.12,-.07],[.34,-.41],[-.12,-.14]] },
  { name: "swept-claw", scale: [.86, 1.38], outline: [[-.46,-.35],[-.30,.08],[-.02,.37],[.30,.43],[.48,.15],[.19,.24],[-.02,.11],[.06,-.10],[-.24,-.03]] },
  { name: "hook-chevron", scale: [.76, .90], outline: [[-.46,-.43],[.47,.01],[-.46,.44],[-.19,.06],[-.33,.01],[-.19,-.07]] },
  { name: "fractured-slab", scale: [1.16, 1.50], outline: [[-.48,-.25],[-.33,.29],[-.04,.19],[.11,.43],[.28,.18],[.48,.07],[.23,-.35],[.03,-.20],[-.12,-.42],[-.27,-.19]] },
] as const;

// Two much smaller, warm-colored chips punctuate the blue energy waves.
const sparkOutlines = [
  [[-.49,0],[-.08,.21],[.49,0],[-.08,-.21]],
  [[-.47,-.07],[-.11,.08],[.12,.42],[.18,.09],[.49,.02],[.14,-.10],[.29,-.31],[-.10,-.15]],
];
const shapeBranches = [...TURBO_ENERGY_VARIANTS.map(variant => variant.outline), ...sparkOutlines]
  .map((outline, kind) => `${kind === 0 ? "if" : "else if"}(kind<${(kind + .5).toFixed(1)}){${
    Array.from({ length: 10 }, (_, i) => {
      const point = outline[Math.min(i, outline.length - 1)];
      return `q[${i}]=vec2(${point[0].toFixed(3)},${point[1].toFixed(3)});`;
    }).join("")
  }}`).join("\n");

// Short-lived energy fragments continuously leave the kart during the release.
// Born in world space: they are not attached to the car or wiggled in place.
// Fixed buffers and a private RNG keep this entirely separate from race physics.
export function createTurboEnergyBurst(THREE: typeof import("three"), scene: Three.Scene, mobile = false) {
  // Six smaller waves follow the 55ms release. Every tail ends by 500ms.
  const duration = .5, emissionEnd = .236, interval = .03, slots = 8;
  // A fast, short throw creates a punchy spark-like motion, not a growing sun.
  const outwardFlightTime = .075;
  const count = mobile ? 320 : 512;
  const positions = new Float32Array(count * 4 * 3);
  const directions = new Float32Array(count * 4 * 3);
  const corners = new Float32Array(count * 4 * 2);
  const sizes = new Float32Array(count * 4 * 2);
  const states = new Float32Array(count * 4 * 3);
  const kinds = new Float32Array(count * 4), variantIndices = new Uint8Array(count);
  const trails = new Float32Array(count * 4), roles = new Uint8Array(count);
  const releasePieces = new Uint8Array(count);
  const alphas = new Float32Array(count * 4);
  const seeds = new Float32Array(count), life = new Float32Array(count), maxLife = new Float32Array(count);
  const centers = new Float32Array(count * 3), velocities = new Float32Array(count * 3);
  const outward = new Float32Array(count * 3);
  const outwardSpeeds = new Float32Array(count);
  const baseLengths = new Float32Array(count), baseWidths = new Float32Array(count);
  const ages = new Float64Array(slots).fill(duration);
  const nextWave = new Float64Array(slots), speeds = new Float32Array(slots);
  const waveNumbers = new Uint32Array(slots);
  const previousPositions = new Float64Array(slots * 3);
  const roots: (Three.Object3D | undefined)[] = Array(slots);
  const indices: number[] = [];
  let rng = 0x482fa3, cursor = 0, fragmentCursor = 0, emitted = 0;
  const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  for (let i = 0; i < count; i += 1) {
    const b = i * 4;
    corners.set([-.5, -.5, .5, -.5, .5, .5, -.5, .5], i * 8);
    indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("energyDirection", new THREE.BufferAttribute(directions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("energyCorner", new THREE.BufferAttribute(corners, 2));
  geometry.setAttribute("energySize", new THREE.BufferAttribute(sizes, 2).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("energyState", new THREE.BufferAttribute(states, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("energyKind", new THREE.BufferAttribute(kinds, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("energyTrail", new THREE.BufferAttribute(trails, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("energyAlpha", new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    // Solid colored silhouettes remain legible, rather than overlapping into white glare.
    blending: THREE.NormalBlending,
    vertexShader: `
      attribute vec3 energyDirection,energyState;attribute vec2 energyCorner,energySize;
      attribute float energyAlpha,energyKind,energyTrail;
      varying vec2 vCorner;varying vec3 vState;varying float vAlpha,vKind,vTrail;
      void main(){
        vec4 p=modelViewMatrix*vec4(position,1.0);
        vec2 d=(mat3(modelViewMatrix)*energyDirection).xy;
        d=length(d)>.001?normalize(d):vec2(1.0,0.0);
        vec2 corner=energyCorner;
        corner.x=(corner.x+.5)*(1.0+energyTrail)-.5-energyTrail;
        p.xy+=d*corner.x*energySize.x+vec2(-d.y,d.x)*corner.y*energySize.y;
        vCorner=corner;vState=energyState;vAlpha=energyAlpha;vKind=energyKind;vTrail=energyTrail;
        gl_Position=projectionMatrix*p;
      }`,
    fragmentShader: `
      varying vec2 vCorner;varying vec3 vState;varying float vAlpha,vKind,vTrail;
      float noise(float x){return fract(sin(x*127.1+311.7)*43758.5453);}
      // Six distinct concave/pointed wave outlines; two tiny spark accents.
      // A constant ten-edge loop keeps all silhouettes in the same pooled draw.
      float fragmentDistance(vec2 p,float seed,float cycle,float kind){
        float tick=floor(cycle),blend=smoothstep(.0,.65,fract(cycle));
        float jitter=mix(noise(seed*19.0+tick),noise(seed*19.0+tick+1.0),blend)-.5;
        p.y+=jitter*.045*(p.x+.5);
        vec2 q[10];
        ${shapeBranches}
        float d=1.0,signD=1.0;vec2 a=q[9];
        for(int i=0;i<10;i++){
          vec2 b=q[i],e=b-a,w=p-a;
          vec2 projection=w-e*clamp(dot(w,e)/max(.00001,dot(e,e)),0.0,1.0);
          d=min(d,dot(projection,projection));
          if((a.y>p.y)!=(b.y>p.y)){
            float crossX=(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x;
            if(p.x<crossX)signD=-signD;
          }
          a=b;
        }
        return sqrt(d)*signD;
      }
      void main(){
        if(vAlpha<.008)discard;
        vec2 p=vCorner;p.y*=vState.x>.5?1.0:-1.0;
        float d=fragmentDistance(p,vState.y,vState.z,vKind);
        float aa=max(fwidth(d)*.65,.002);
        float shape=1.0-smoothstep(-aa,aa,d);
        float inner=1.0-smoothstep(-.004,.012,fragmentDistance(p*1.65+vec2(.12,0.0),vState.y,vState.z,vKind));
        float border=1.0-smoothstep(.014,.055,-d);
        vec3 color=mix(vec3(.10,.79,1.0),vec3(.025,.25,.90),border*.85);
        color=mix(color,vec3(.80,.98,1.0),inner*.92);
        if(vKind>5.5){color=mix(vec3(1.0,.54,.055),vec3(1.0,.96,.64),inner);}
        // A short brush stroke tapers behind a thick polygon, not a thin ray.
        // Unequal torn edges keep its silhouette energetic as the chip leaves.
        float tailProgress=clamp((p.x+.5+vTrail)/max(.001,vTrail+.23),0.0,1.0);
        float tailWidth=(.015+.12*tailProgress)*(.86+.14*sin(p.x*31.0+vState.y*17.0));
        float brush=(1.0-smoothstep(tailWidth,tailWidth+.025,abs(p.y)))
          *smoothstep(0.0,.13,tailProgress)*(1.0-smoothstep(-.30,-.20,p.x))
          *step(.01,vTrail);
        color=mix(vec3(.08,.53,.94),color,shape);
        float alpha=max(shape,brush*.38)*vAlpha;if(alpha<.008)discard;
        gl_FragColor=vec4(color,alpha);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "kart-turbo-energy-burst"; mesh.frustumCulled = false;
  mesh.renderOrder = 2; scene.add(mesh);
  const center = new THREE.Vector3(), direction = new THREE.Vector3();
  const velocity = new THREE.Vector3(), worldPosition = new THREE.Vector3(), inherited = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  function writeFragment(i: number) {
    const b = i * 3, age = maxLife[i] > 0 ? 1 - life[i] / maxLife[i] : 1;
    const compression = roles[i] === 2;
    // A large, opaque leading release gives way to quick, smaller waves. A
    // visible taper during decay replaces the previous stationary afterimage.
    const alpha = life[i] <= 0 ? 0 : compression ? Math.sin(Math.PI * age)
      : Math.pow(Math.max(0, 1 - age), releasePieces[i] ? 1.45 : 2.1);
    const expand = compression ? 1 - age * .62 : .88 + Math.min(age, .30) * .72;
    const taper = compression ? 1 : 1 - age * .60;
    const trail = compression || roles[i] === 1 ? 0 : (.18 + Math.min(age * 3, 1) * .30) * (1 - age);
    for (let v = 0; v < 4; v += 1) {
      const vertex = i * 4 + v, p = vertex * 3;
      positions[p] = centers[b]; positions[p + 1] = centers[b + 1]; positions[p + 2] = centers[b + 2];
      directions[p] = outward[b]; directions[p + 1] = outward[b + 1]; directions[p + 2] = outward[b + 2];
      sizes[vertex * 2] = baseLengths[i] * expand;
      sizes[vertex * 2 + 1] = baseWidths[i] * expand * taper;
      states[p] = seeds[i] > .45 ? 1 : 0; states[p + 1] = seeds[i]; states[p + 2] = age * 4.0;
      kinds[vertex] = variantIndices[i];
      trails[vertex] = trail;
      alphas[vertex] = alpha;
    }
  }
  function emitCompression(slot: number) {
    const root = roots[slot]; if (!root) return;
    root.updateWorldMatrix(true, false); root.getWorldQuaternion(rotation);
    const pieces = mobile ? 3 : 5;
    for (let piece = 0; piece < pieces; piece += 1) {
      const i = fragmentCursor, b = i * 3;
      fragmentCursor = (fragmentCursor + 1) % count; emitted += 1;
      const side = piece === pieces - 1 ? 0 : piece % 2 ? 1 : -1;
      center.set(side * (1.60 + random() * .3), .78 + (piece > 1 ? .32 : 0), -2.20).applyMatrix4(root.matrixWorld);
      direction.set(-side * .85, -.28, .12).applyQuaternion(rotation).normalize();
      centers[b] = center.x; centers[b + 1] = center.y; centers[b + 2] = center.z;
      velocity.copy(inherited).multiplyScalar(.92);
      velocities[b] = velocity.x; velocities[b + 1] = velocity.y; velocities[b + 2] = velocity.z;
      outward[b] = direction.x; outward[b + 1] = direction.y; outward[b + 2] = direction.z;
      outwardSpeeds[i] = side === 0 ? 5 : 12;
      seeds[i] = random(); variantIndices[i] = piece % 6; roles[i] = 2; releasePieces[i] = 0;
      baseLengths[i] = .9 + random() * .3; baseWidths[i] = .35 + random() * .18;
      maxLife[i] = life[i] = TURBO_RELEASE_DELAY_SECONDS;
      writeFragment(i);
    }
  }
  function emitWave(slot: number, first: boolean, backdated = 0) {
    const root = roots[slot]; if (!root) return;
    root.updateWorldMatrix(true, false); root.getWorldQuaternion(rotation);
    const pieces = first ? (mobile ? 3 : 4) : (mobile ? 1 : 2);
    const bornAt = ages[slot] - backdated;
    const envelope = first ? 1 : .82 - (bornAt / duration) * .34;
    const wave = waveNumbers[slot]++;
    let pieceNumber = 0;
    for (const side of [-1, 0, 1]) for (let piece = 0; piece < (side === 0 ? (first && !mobile ? 2 : 1) : pieces); piece += 1) {
      const i = fragmentCursor, b = i * 3;
      fragmentCursor = (fragmentCursor + 1) % count; emitted += 1;
      // Offset fans and jagged sizes deliberately prevent mirrored wing halves.
      const angle = -.18 + random() * 1.42 + (side === -1 ? .17 : -.08);
      const dx = side === 0 ? (random() - .5) * 1.10 : side * Math.cos(angle);
      const dy = side === 0 ? .35 + random() * .70 : Math.sin(angle);
      const dz = side === 0 ? -.90 - random() * .35 : -.30 - random() * .60;
      const travel = first ? 24 + random() * 12 : 28 + random() * 12;
      center.set(side === 0 ? (random() - .5) * .35 : side * (1.05 + random() * .20),
        .60 + random() * .30, side === 0 ? -2.24 : -1.70 - random() * .40).applyMatrix4(root.matrixWorld);
      direction.set(dx, dy, dz).applyQuaternion(rotation).normalize();
      // Inherit kart travel unchanged; limit only the outward energy motion.
      velocity.copy(inherited).multiplyScalar(.92);
      // Backdate a wave caught up after a long frame, instead of spawning a clump.
      center.addScaledVector(inherited, -backdated).addScaledVector(velocity, backdated)
        .addScaledVector(direction, travel * Math.min(backdated, outwardFlightTime));
      centers[b] = center.x; centers[b + 1] = center.y; centers[b + 2] = center.z;
      velocities[b] = velocity.x; velocities[b + 1] = velocity.y; velocities[b + 2] = velocity.z;
      outward[b] = direction.x; outward[b + 1] = direction.y; outward[b + 2] = direction.z;
      outwardSpeeds[i] = travel;
      seeds[i] = random();
      roles[i] = 0; releasePieces[i] = first ? 1 : 0;
      // Cycle all six families from the very first burst, also on mobile.
      // Shifting the sequence each wave avoids a fixed repeated fan arrangement.
      const variant = (wave + pieceNumber++) % TURBO_ENERGY_VARIANTS.length;
      variantIndices[i] = variant;
      baseLengths[i] = (first ? 2.55 + random() * 1.10 : 1.02 + random() * .68) * envelope * TURBO_ENERGY_VARIANTS[variant].scale[0];
      baseWidths[i] = (first ? 1.02 + random() * .65 : .47 + random() * .36) * envelope * TURBO_ENERGY_VARIANTS[variant].scale[1];
      // Keep the silhouette sharp and leave the rear of the kart readable.
      // Center chips connect the wings without becoming a solid screen-wide sheet.
      baseLengths[i] *= side === 0 ? .58 : .82;
      baseWidths[i] *= side === 0 ? .43 : .62;
      maxLife[i] = Math.min(.30, duration - ages[slot] + backdated);
      life[i] = Math.max(0, maxLife[i] - backdated);
      writeFragment(i);
    }
    // Only one accent per wave (two at desktop release, alternate waves on
    // mobile). Shorter-lived and far smaller than the main energy silhouettes.
    const sparks = first ? (mobile ? 1 : 2) : (mobile && wave % 2 === 0 ? 0 : 1);
    for (let spark = 0; spark < sparks; spark += 1) {
      const i = fragmentCursor, b = i * 3;
      fragmentCursor = (fragmentCursor + 1) % count; emitted += 1;
      const side = (wave + spark) % 2 ? 1 : -1;
      center.set(side * (1.05 + random() * .18), .65 + random() * .30, -2.1).applyMatrix4(root.matrixWorld);
      direction.set(side * (.65 + random() * .45), .05 + random() * .80, -.40 - random() * .30)
        .applyQuaternion(rotation).normalize();
      const travel = 24 + random() * 16;
      velocity.copy(inherited).multiplyScalar(.92);
      center.addScaledVector(inherited, -backdated).addScaledVector(velocity, backdated)
        .addScaledVector(direction, travel * Math.min(backdated, outwardFlightTime));
      centers[b] = center.x; centers[b + 1] = center.y; centers[b + 2] = center.z;
      velocities[b] = velocity.x; velocities[b + 1] = velocity.y; velocities[b + 2] = velocity.z;
      outward[b] = direction.x; outward[b + 1] = direction.y; outward[b + 2] = direction.z;
      outwardSpeeds[i] = travel; seeds[i] = random(); variantIndices[i] = 6 + (wave + spark) % 2;
      roles[i] = 1; releasePieces[i] = 0;
      baseLengths[i] = (.28 + random() * .18) * envelope;
      baseWidths[i] = (.13 + random() * .12) * envelope;
      maxLife[i] = Math.min(.12 + seeds[i] * .06, duration - ages[slot] + backdated);
      life[i] = Math.max(0, maxLife[i] - backdated);
      writeFragment(i);
    }
  }
  function update(dt: number) {
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    for (let i = 0; i < count; i += 1) {
      if (life[i] <= 0) continue;
      const b = i * 3;
      const elapsed = maxLife[i] - life[i];
      const aliveStep = Math.min(step, life[i]);
      const outwardStep = Math.min(aliveStep, Math.max(0, outwardFlightTime - elapsed));
      life[i] = life[i] - step < 1e-7 ? 0 : life[i] - step;
      centers[b] += velocities[b] * aliveStep + outward[b] * outwardSpeeds[i] * outwardStep;
      centers[b + 1] += velocities[b + 1] * aliveStep + outward[b + 1] * outwardSpeeds[i] * outwardStep;
      centers[b + 2] += velocities[b + 2] * aliveStep + outward[b + 2] * outwardSpeeds[i] * outwardStep;
      writeFragment(i);
    }
    for (let slot = 0; slot < slots; slot += 1) {
      const root = roots[slot]; if (!root) continue;
      ages[slot] = Math.min(duration, ages[slot] + step + (ages[slot] + step > duration - 1e-8 ? 1e-8 : 0));
      root.getWorldPosition(worldPosition); root.getWorldQuaternion(rotation);
      const b = slot * 3;
      if (step > 0) {
        inherited.set(worldPosition.x - previousPositions[b], worldPosition.y - previousPositions[b + 1], worldPosition.z - previousPositions[b + 2]).divideScalar(step);
        // A respawn/teleport must not launch the effect across the course.
        if (inherited.length() > 180) inherited.set(0, 0, speeds[slot]).applyQuaternion(rotation);
      } else inherited.set(0, 0, speeds[slot]).applyQuaternion(rotation);
      previousPositions[b] = worldPosition.x; previousPositions[b + 1] = worldPosition.y; previousPositions[b + 2] = worldPosition.z;
      while (nextWave[slot] <= ages[slot] + 1e-9 && nextWave[slot] < emissionEnd) {
        const backdated = ages[slot] - nextWave[slot];
        if (backdated < .30 && ages[slot] < duration) emitWave(slot, waveNumbers[slot] === 0, Math.max(0, backdated));
        nextWave[slot] += interval;
      }
      if (ages[slot] >= duration) roots[slot] = undefined;
    }
    for (const name of ["position", "energyDirection", "energySize", "energyState", "energyKind", "energyTrail", "energyAlpha"]) geometry.attributes[name].needsUpdate = true;
  }
  return {
    burst(root: Three.Object3D, speed = 0) {
      let slot = roots.indexOf(root);
      if (slot < 0) { slot = cursor; cursor = (cursor + 1) % slots; }
      roots[slot] = root; ages[slot] = 0; nextWave[slot] = TURBO_RELEASE_DELAY_SECONDS; speeds[slot] = speed; waveNumbers[slot] = 0;
      root.getWorldPosition(worldPosition); root.getWorldQuaternion(rotation);
      const b = slot * 3;
      previousPositions[b] = worldPosition.x; previousPositions[b + 1] = worldPosition.y; previousPositions[b + 2] = worldPosition.z;
      inherited.set(0, 0, speed).applyQuaternion(rotation);
      emitCompression(slot);
      for (const name of ["position", "energyDirection", "energySize", "energyState", "energyKind", "energyTrail", "energyAlpha"]) geometry.attributes[name].needsUpdate = true;
    },
    update,
    activeCount() { return roots.filter(Boolean).length; },
    stats() { return { fragments: life.filter(x => x > 0).length, emitted, capacity: count }; },
  };
}
