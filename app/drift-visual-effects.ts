import type * as Three from "three";
import { createTurboEnergyBurst } from "./turbo-energy-burst";

type ThreeModule = typeof import("three");
export type TireSurfaceContact = {
  x: number; y: number; z: number;
  nx: number; ny: number; nz: number;
  visible: boolean; surfaceKey: string;
};

// Rendering only: fixed mesh pools and a private RNG; no racer/input state writes.
export function createDriftVisualEffects(THREE: ThreeModule, scene: Three.Scene, mobile = false) {
  const turboEnergy = createTurboEnergyBurst(THREE, scene, mobile);
  let rng = 0x739ab2;
  const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  const sparkCapacity = mobile ? 320 : 640;
  const sparkPositions = new Float32Array(sparkCapacity * 6 * 3);
  const sparkDirections = new Float32Array(sparkCapacity * 6 * 3);
  const sparkColors = new Float32Array(sparkCapacity * 6 * 3);
  const sparkCorners = new Float32Array(sparkCapacity * 6 * 2);
  const sparkSizes = new Float32Array(sparkCapacity * 6 * 2);
  const sparkAlphas = new Float32Array(sparkCapacity * 6);
  const sparkStyles = new Float32Array(sparkCapacity * 6 * 3);
  const centers = new Float32Array(sparkCapacity * 3), velocities = new Float32Array(sparkCapacity * 3);
  const directions = new Float32Array(sparkCapacity * 3);
  const styles = new Uint8Array(sparkCapacity), seeds = new Float32Array(sparkCapacity);
  const lengths = new Float32Array(sparkCapacity), widths = new Float32Array(sparkCapacity);
  const life = new Float32Array(sparkCapacity), maxLife = new Float32Array(sparkCapacity);
  const sparkIndices: number[] = [];
  // Full carriers for branched bolts, asymmetric contact flashes, splinters and
  // curved blades. The fragment shader defines their silhouettes, not a line.
  const outline = [[-0.5, -0.5], [0, -0.5], [0.5, -0.5], [0.5, 0.5], [0, 0.5], [-0.5, 0.5]];
  for (let i = 0; i < sparkCapacity; i += 1) {
    for (let v = 0; v < 6; v += 1) {
      sparkPositions[(i * 6 + v) * 3 + 1] = -1000;
      sparkCorners.set(outline[v], (i * 6 + v) * 2);
    }
    const b = i * 6;
    sparkIndices.push(b, b + 1, b + 2, b, b + 2, b + 3, b, b + 3, b + 4, b, b + 4, b + 5);
  }
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setIndex(sparkIndices);
  sparkGeometry.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3).setUsage(THREE.DynamicDrawUsage));
  sparkGeometry.setAttribute("shardDirection", new THREE.BufferAttribute(sparkDirections, 3).setUsage(THREE.DynamicDrawUsage));
  sparkGeometry.setAttribute("shardColor", new THREE.BufferAttribute(sparkColors, 3).setUsage(THREE.DynamicDrawUsage));
  sparkGeometry.setAttribute("shardCorner", new THREE.BufferAttribute(sparkCorners, 2));
  sparkGeometry.setAttribute("shardSize", new THREE.BufferAttribute(sparkSizes, 2).setUsage(THREE.DynamicDrawUsage));
  sparkGeometry.setAttribute("shardAlpha", new THREE.BufferAttribute(sparkAlphas, 1).setUsage(THREE.DynamicDrawUsage));
  sparkGeometry.setAttribute("shardStyle", new THREE.BufferAttribute(sparkStyles, 3).setUsage(THREE.DynamicDrawUsage));
  const sparkMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute vec3 shardDirection,shardColor,shardStyle;
      attribute vec2 shardCorner,shardSize;
      attribute float shardAlpha;
      varying vec2 vCorner; varying vec3 vColor,vStyle; varying float vAlpha;
      void main() {
        vec4 p=modelViewMatrix*vec4(position,1.0);
        vec2 direction=(mat3(modelViewMatrix)*shardDirection).xy;
        direction=length(direction)>.001?normalize(direction):vec2(0.0,1.0);
        vec2 side=vec2(-direction.y,direction.x);
        p.xy+=direction*shardCorner.x*shardSize.x+side*shardCorner.y*shardSize.y;
        vCorner=shardCorner;vColor=shardColor;vAlpha=shardAlpha;vStyle=shardStyle;
        gl_Position=projectionMatrix*p;
      }
    `,
    fragmentShader: `
      varying vec2 vCorner; varying vec3 vColor,vStyle; varying float vAlpha;
      float segmentDistance(vec2 p,vec2 a,vec2 b){
        vec2 ab=b-a;float t=clamp(dot(p-a,ab)/max(.00001,dot(ab,ab)),0.0,1.0);
        return length(p-a-ab*t);
      }
      void main() {
        if(vAlpha<.01)discard;
        vec2 p=vCorner;float seed=vStyle.y,age=vStyle.z;
        float d=1.0,core=0.0,glow=.026;
        if(vStyle.x<.5){
          // One connected angular lightning ribbon, with a thinner fork.
          float bend=(seed-.5)*.12;
          vec2 a=vec2(-.46,-.025),b=vec2(-.18,.11+bend);
          vec2 c=vec2(.015,-.12+bend),e=vec2(.47,.015);
          vec2 f=vec2(.18,.09-bend);
          float mainD=min(min(segmentDistance(p,a,b),segmentDistance(p,b,c)),
                          min(segmentDistance(p,c,f),segmentDistance(p,f,e)));
          float width=mix(.14,.035,clamp(p.x+.5,0.0,1.0));
          float forkD=min(segmentDistance(p,c,vec2(.11,-.29)),
                          segmentDistance(p,vec2(.11,-.29),vec2(.35,-.23)));
          d=min(mainD-width,forkD-.05);
          core=max(1.0-smoothstep(width*.10,width*.35,mainD),
                   1.0-smoothstep(.006,.021,forkD));
        }else if(vStyle.x<1.5){
          // A solid, asymmetric impact flower; the tire contact is visibly alive.
          float r=length(p),a=atan(p.y,p.x)+seed*6.283;
          float rays=pow(max(0.0,cos(a*5.0+sin(a*2.0)*.42)),8.0);
          float radius=.10+.30*rays*(.84+.16*sin(a*3.0+seed*11.0));
          d=r-radius;core=1.0-smoothstep(.017,.055,r);glow=.045;
        }else if(vStyle.x<2.5){
          // Unequal chipped embers, rather than copies of a long thin diamond.
          float angle=(seed-.5)*.9+age*(seed-.5)*1.8;
          mat2 spin=mat2(cos(angle),-sin(angle),sin(angle),cos(angle));p=spin*p;
          float edgeWidth=.075+.27*(.42-p.x);
          d=max(abs(p.y+.20*p.x)-edgeWidth,max(-p.x-.34,p.x-.40));
          core=1.0-smoothstep(.006,.09,abs(p.y+.20*p.x));
        }else if(vStyle.x<3.5){
          // A single broken shock crescent expanding once at turbo release.
          float r=length(p),a=atan(p.y,p.x)+seed*6.283+age*.8;
          float radius=.31+.025*sin(a*3.0);
          float ring=abs(r-radius)-.025;
          d=max(ring,(.12-sin(a*3.0))*.12);
          core=1.0-smoothstep(.002,.014,abs(r-radius));glow=.028;
        }else{
          // A filled curved slash with a thick head and a fine vanishing tip.
          float t=clamp(p.x+.5,0.0,1.0);
          float curve=.23*sin(t*3.14159)+(seed-.5)*.09;
          float width=.29*(1.0-t)+.015;
          float ribbon=abs(p.y-curve);
          d=max(ribbon-width,max(-p.x-.46,p.x-.46));
          core=1.0-smoothstep(width*.15,width*.45,ribbon);
        }
        float aa=max(fwidth(d)*.65,.002);
        float shape=1.0-smoothstep(-aa,aa,d);
        float halo=(1.0-smoothstep(0.0,glow,max(0.0,d)))*.18;
        float alpha=max(shape,halo)*vAlpha;
        if(alpha<.015)discard;
        bool blue=vColor.b>.5;
        vec3 rim=blue?mix(vColor,vec3(.06,.34,1.0),age*.32)
                     :mix(vColor,vec3(1.0,.19,.015),age*.72);
        vec3 color=mix(rim,blue?vec3(.88,.98,1.0):vec3(1.0,.96,.72),core*.9);
        gl_FragColor=vec4(color,alpha);
        #include <colorspace_fragment>
      }
    `,
  });
  const sparkMesh = new THREE.Mesh(sparkGeometry, sparkMaterial);
  sparkMesh.name = "anime-drift-and-turbo-shards";
  sparkMesh.frustumCulled = false;
  scene.add(sparkMesh);
  let sparkCursor = 0;
  const emitShard = (x: number, y: number, z: number, vx: number, vy: number, vz: number, length: number, width: number, duration: number, blue: boolean,
    style = 0, dx = vx, dy = vy, dz = vz) => {
    const i = sparkCursor, b = i * 3;
    sparkCursor = (sparkCursor + 1) % sparkCapacity;
    centers[b] = x; centers[b + 1] = y; centers[b + 2] = z;
    velocities[b] = vx; velocities[b + 1] = vy; velocities[b + 2] = vz;
    directions[b] = dx; directions[b + 1] = dy; directions[b + 2] = dz;
    styles[i] = style; seeds[i] = random();
    lengths[i] = length; widths[i] = width; life[i] = maxLife[i] = duration;
    for (let v = 0; v < 6; v += 1) {
      const offset = (i * 6 + v) * 3;
      sparkColors[offset] = blue ? 0.18 : 1;
      sparkColors[offset + 1] = blue ? 0.69 : 0.66;
      sparkColors[offset + 2] = blue ? 1 : 0.06;
    }
  };

  const markCapacity = mobile ? 512 : 1024;
  const markPositions = new Float32Array(markCapacity * 4 * 3);
  const markUvs = new Float32Array(markCapacity * 4 * 2);
  const markAlphas = new Float32Array(markCapacity * 4);
  const markLife = new Float32Array(markCapacity);
  const markKeys = Array(markCapacity).fill("") as string[];
  const markFromKeys = Array(markCapacity).fill("") as string[];
  const markIndices: number[] = [];
  for (let i = 0; i < markCapacity; i += 1) {
    const b = i * 4;
    markIndices.push(b, b + 1, b + 2, b, b + 2, b + 3);
    markUvs.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
    for (let v = 0; v < 4; v += 1) markPositions[(b + v) * 3 + 1] = -1000;
  }
  const markGeometry = new THREE.BufferGeometry();
  markGeometry.setIndex(markIndices);
  markGeometry.setAttribute("position", new THREE.BufferAttribute(markPositions, 3).setUsage(THREE.DynamicDrawUsage));
  markGeometry.setAttribute("uv", new THREE.BufferAttribute(markUvs, 2));
  markGeometry.setAttribute("markAlpha", new THREE.BufferAttribute(markAlphas, 1).setUsage(THREE.DynamicDrawUsage));
  const markMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    vertexShader: `attribute float markAlpha;varying float vAlpha;varying vec2 vUv;
      void main(){vAlpha=markAlpha;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying float vAlpha;varying vec2 vUv;
      void main(){float edge=smoothstep(0.0,.12,vUv.x)*(1.0-smoothstep(.88,1.0,vUv.x));
      float grooves=.76+.24*smoothstep(.22,.40,abs(sin(vUv.x*31.4)));
      if(vAlpha*edge<.01)discard;gl_FragColor=vec4(.026,.032,.035,vAlpha*edge*grooves);}`,
  });
  const markMesh = new THREE.Mesh(markGeometry, markMaterial);
  markMesh.name = "temporary-tire-skid-marks";
  markMesh.frustumCulled = false;
  scene.add(markMesh);
  let markCursor = 0;
  const lastContacts: (TireSurfaceContact | undefined)[] = Array(16);
  const driftBudgets = new Float32Array(8);
  const driftTicks = new Uint16Array(8);
  const addMark = (from: TireSurfaceContact, to: TireSurfaceContact) => {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance < 0.08 || distance > 5 || from.surfaceKey !== to.surfaceKey) return;
    const i = markCursor; markCursor = (markCursor + 1) % markCapacity;
    // Each end uses its own surface normal, so the strip follows a sloping road.
    for (let end = 0; end < 2; end += 1) {
      const p = end === 0 ? from : to;
      let sx = p.ny * dz - p.nz * dy, sy = p.nz * dx - p.nx * dz, sz = p.nx * dy - p.ny * dx;
      const scale = 0.19 / Math.max(.001, Math.hypot(sx, sy, sz));
      sx *= scale; sy *= scale; sz *= scale;
      for (let side = 0; side < 2; side += 1) {
        const v = end === 0 ? side : 3 - side, sign = side === 0 ? -1 : 1;
        const b = (i * 4 + v) * 3;
        markPositions[b] = p.x + sx * sign;
        markPositions[b + 1] = p.y + sy * sign;
        markPositions[b + 2] = p.z + sz * sign;
      }
    }
    markFromKeys[i] = from.surfaceKey; markKeys[i] = to.surfaceKey; markLife[i] = 3;
    markGeometry.attributes.position.needsUpdate = true;
  };

  return {
    burst(root: Three.Object3D, speed: number) { turboEnergy.burst(root, speed); },
    drift(actor: number, contacts: readonly TireSurfaceContact[], heading: number, speed: number, active: boolean, dt: number) {
      if (!active || Math.abs(speed) < 3) {
        driftBudgets[actor] = 0; lastContacts[actor * 2] = lastContacts[actor * 2 + 1] = undefined; return;
      }
      driftBudgets[actor] += dt;
      if (driftBudgets[actor] < .05) return;
      driftBudgets[actor] %= .05;
      driftTicks[actor] += 1;
      const fx = Math.sin(heading), fz = Math.cos(heading), rx = Math.cos(heading), rz = -Math.sin(heading);
      contacts.forEach((p, wheel) => {
        const slot = actor * 2 + wheel;
        if (!p.visible) { lastContacts[slot] = undefined; return; }
        const from = lastContacts[slot];
        if (from) addMark(from, p);
        lastContacts[slot] = { ...p };
        const side = wheel === 0 ? -1 : 1;
        if (driftTicks[actor] % 2 === 0) {
          emitShard(p.x + p.nx * .06, p.y + p.ny * .06, p.z + p.nz * .06,
            fx * Math.max(0, speed), 0, fz * Math.max(0, speed), 1.0, 1.0, .125, false, 1, rx, .3, rz);
        }
        for (let shard = 0; shard < (mobile ? 2 : 4); shard += 1) {
          const backward = 4 + random() * 8, sideways = side * (2 + random() * 7);
          const forward = Math.max(0, speed) * .9 - backward;
          const style = shard === 0 ? 0 : shard === 3 ? 4 : 2;
          emitShard(p.x, p.y + .08, p.z,
            fx * forward + rx * sideways, .45 + random() * 2.0, fz * forward + rz * sideways,
            style === 2 ? .22 + random() * .35 : .65 + random() * .45,
            style === 2 ? .12 + random() * .13 : .28 + random() * .17,
            .14 + random() * .13, false, style,
            -fx * backward + rx * sideways, .5, -fz * backward + rz * sideways);
        }
      });
    },
    update(dt: number, surfaceVisible: (key: string) => boolean = () => true) {
      turboEnergy.update(dt);
      for (let i = 0; i < sparkCapacity; i += 1) {
        if (life[i] <= 0) continue;
        life[i] = Math.max(0, life[i] - dt);
        const b = i * 3, ratio = life[i] / maxLife[i];
        centers[b] += velocities[b] * dt; centers[b + 1] += velocities[b + 1] * dt; centers[b + 2] += velocities[b + 2] * dt;
        if (styles[i] !== 1 && styles[i] !== 3) velocities[b + 1] -= 8 * dt;
        const length = Math.max(.001, Math.hypot(directions[b], directions[b + 1], directions[b + 2]));
        const age = 1 - ratio;
        const alpha = styles[i] === 1 ? Math.min(1, ratio * 2.6) : styles[i] === 3 ? ratio * .82 : Math.min(1, ratio * 3.5);
        const scale = styles[i] === 3 ? .65 + age * .7 : styles[i] === 1 ? .7 + ratio * .3 : .75 + ratio * .25;
        for (let v = 0; v < 6; v += 1) {
          const vertex = i * 6 + v, p = vertex * 3;
          sparkPositions[p] = centers[b]; sparkPositions[p + 1] = centers[b + 1]; sparkPositions[p + 2] = centers[b + 2];
          sparkDirections[p] = directions[b] / length;
          sparkDirections[p + 1] = directions[b + 1] / length;
          sparkDirections[p + 2] = directions[b + 2] / length;
          sparkSizes[vertex * 2] = lengths[i] * scale;
          sparkSizes[vertex * 2 + 1] = widths[i] * scale;
          sparkStyles[p] = styles[i]; sparkStyles[p + 1] = seeds[i]; sparkStyles[p + 2] = age;
          sparkAlphas[vertex] = alpha;
        }
      }
      for (const name of ["position", "shardDirection", "shardColor", "shardSize", "shardAlpha", "shardStyle"]) sparkGeometry.attributes[name].needsUpdate = true;
      for (let i = 0; i < markCapacity; i += 1) {
        if (markLife[i] <= 0) continue;
        markLife[i] = !surfaceVisible(markKeys[i]) || !surfaceVisible(markFromKeys[i]) ? 0 : Math.max(0, markLife[i] - dt);
        const alpha = .68 * Math.min(1, markLife[i] / 2.2);
        for (let v = 0; v < 4; v += 1) markAlphas[i * 4 + v] = alpha;
      }
      markGeometry.attributes.markAlpha.needsUpdate = true;
    },
    stats() { return { shards: life.filter(value => value > 0).length, marks: markLife.filter(value => value > 0).length }; },
  };
}
