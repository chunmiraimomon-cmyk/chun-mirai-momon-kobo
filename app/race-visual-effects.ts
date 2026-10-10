import type * as Three from "three";

type ThreeModule = typeof Three;
type Pose = { x: number; y: number; z: number; heading: number };
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// Four explicit wheel anchors; never select an axle with a frame-local counter.
const WATER_WHEELS = [[-1.3, 1.43], [1.3, 1.43], [-1.3, -1.31], [1.3, -1.31]] as const;
export function waterSprayProfile(speed: number, mobile: boolean) {
  const power = clamp01((Math.abs(speed) - 2) / 43);
  return {
    power,
    packetsPerSecond: (mobile ? 12 : 18) + power * (mobile ? 38 : 64),
    lift: 2.8 + power * 7.6,
    outward: 1.8 + power * 6.2,
    backward: 2.5 + power * 12,
    lifetime: .48 + power * .65,
    dropSize: .14 + power * .20,
    clumpSize: .36 + power * .78,
  };
}

// Visual-only footprint. No raycasts, racer state writes, or gameplay RNG.
export function wetRoadForSpray(course: string, progress: number, lane: number, halfWidth: number, grounded: boolean, riverWet: boolean) {
  if (!grounded || Math.abs(lane) > halfWidth + 0.2) return false;
  const u = ((progress % 1) + 1) % 1;
  return course === "river" ? riverWet : course === "pirate" && u >= 0.665 && u <= 0.775;
}

const hashGLSL = `
float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);}
float cloudNoise(vec2 p){return noise2(p)*.57+noise2(p*2.03)*.28+noise2(p*4.07)*.15;}
`;

export function createRaceVisualEffects(THREE: ThreeModule, scene: Three.Scene, mobile: boolean, theme = "city") {
  const time = { value: 0 };
  const viewportHeight = { value: 720 };
  // The atmosphere is one fixed draw call. Theme changes its palette, cloud
  // depth and coverage, not the lighting or any simulation/weather state.
  const skyThemes = {
    city: { zenith: 0x3d83b6, horizon: 0x9dbbc4, scale: 3.3, coverage: .56, lower: .72, upper: .22 },
    jungle: { zenith: 0x346f8c, horizon: 0x8baeb0, scale: 4.1, coverage: .54, lower: .70, upper: .17 },
    river: { zenith: 0x4384a5, horizon: 0x9abac4, scale: 3.1, coverage: .57, lower: .60, upper: .20 },
    pirate: { zenith: 0x3f7198, horizon: 0xa4b8bf, scale: 2.5, coverage: .48, lower: .88, upper: .38 },
    starlight: { zenith: 0x3f7da8, horizon: 0x9ebaca, scale: 3.0, coverage: .62, lower: .38, upper: .17 },
    cloud: { zenith: 0x316ea8, horizon: 0x92b5c9, scale: 2.1, coverage: .51, lower: .88, upper: .48 },
  };
  const atmosphere = skyThemes[theme as keyof typeof skyThemes] ?? skyThemes.city;
  const skyDay = new THREE.Color(atmosphere.zenith), skyHaze = new THREE.Color(atmosphere.horizon);
  let rng = 0x214cf; // Separate from CPU/item/weather randomness.
  const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };

  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: time,
      uSky: { value: scene.background instanceof THREE.Color ? scene.background.clone() : skyDay.clone() },
      uFog: { value: scene.fog instanceof THREE.Fog ? scene.fog.color.clone() : skyHaze.clone() },
      uZenith: { value: skyDay }, uHorizon: { value: skyHaze },
      uCloudShape: { value: new THREE.Vector4(atmosphere.scale, atmosphere.coverage, atmosphere.lower, atmosphere.upper) },
      uNight: { value: 0 }, uStorm: { value: 0 },
    },
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
    vertexShader: `varying vec3 vDirection;void main(){vDirection=position;vec4 clip=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position=clip.xyww;}`,
    fragmentShader: `${hashGLSL}
      uniform float uTime,uNight,uStorm;uniform vec3 uSky,uFog,uZenith,uHorizon;
      uniform vec4 uCloudShape;varying vec3 vDirection;
      // Smooth lobes with lit rims and blue undersides give the clouds volume.
      // Two 3-octave fields replace a ray march or a stack of alpha cards.
      vec4 cloudLayer(vec2 p,float threshold,float height){
        float field=cloudNoise(p);
        float density=smoothstep(threshold,threshold+.17,field);
        float volume=smoothstep(threshold+.015,threshold+.19,field);
        float relief=clamp((dFdx(field)*.65-dFdy(field))/max(fwidth(field),.0004),-1.0,1.0);
        float edge=(1.0-volume)*density;
        vec3 underside=mix(uSky*.43,vec3(.105,.17,.23),.58);
        vec3 lit=mix(uHorizon*1.08,vec3(.54,.58,.60),.38);
        vec3 cloud=mix(underside,lit,clamp(.14+volume*.62+relief*.18+edge*.18+height*.08,0.0,1.0));
        cloud*=1.0-uStorm*.59;
        cloud=mix(cloud,uSky*.48+vec3(.0015,.002,.0035),uNight*.96);
        return vec4(cloud,density);
      }
      float starSpecks(vec2 uv){
        vec2 cells=uv*vec2(260.0,130.0),id=floor(cells);
        float seed=hash21(id+vec2(27.7,11.4));
        vec2 center=vec2(hash21(id+8.4),hash21(id+29.1))*.7+.15;
        vec2 delta=fract(cells)-center;
        float radius=mix(.023,.080,pow(seed,12.0));
        float aa=max(length(fwidth(cells))*.42,.012);
        float point=1.0-smoothstep(radius-aa,radius+aa,length(delta));
        float glimmer=.82+.18*sin(uTime*.65+seed*83.0);
        return point*step(.976,seed)*glimmer;
      }
      void main(){
        vec3 d=normalize(vDirection);float h=max(0.0,d.y);
        float warmth=clamp((uSky.r-uSky.b)*3.0,0.0,1.0)*(1.0-uNight);
        vec3 zenith=mix(uSky*vec3(.50,.72,.94),uZenith,.64);
        vec3 horizon=mix(uFog*.76,uHorizon,.60);
        zenith=mix(zenith,uSky*vec3(.72,.68,.80),warmth*.8);
        horizon=mix(horizon,uFog*.82,warmth*.85);
        zenith=mix(zenith,uSky*vec3(.55,.66,.91),uStorm*.65);
        horizon=mix(horizon,uFog*.72,uStorm*.78);
        zenith=mix(zenith,uSky*.60+vec3(.001,.0015,.004),uNight);
        horizon=mix(horizon,uFog*.65+vec3(.001,.001,.002),uNight);
        vec3 col=mix(horizon,zenith,smoothstep(-.04,.76,d.y));
        vec2 p=d.xz/max(.20,d.y+.22)*uCloudShape.x;
        vec4 distant=cloudLayer(p*.47+vec2(12.4,-7.8)+vec2(-uTime*.002,0.0),uCloudShape.y-.07,.7);
        vec4 nearby=cloudLayer(p+vec2(uTime*.004,0.0),uCloudShape.y-uStorm*.095,.1);
        float farAlpha=distant.a*uCloudShape.w*smoothstep(-.01,.085,d.y)*(1.0-smoothstep(.62,.92,h));
        float nearAlpha=nearby.a*uCloudShape.z*smoothstep(.015,.11,h)*(1.0-smoothstep(.74,.98,h));
        // The distant sheet stays near the horizon; the larger foreground
        // lobes overlap it with a shaded edge instead of a flat noise wash.
        col=mix(col,distant.rgb,farAlpha*(1.0-uNight*.72));
        col=mix(col,nearby.rgb,nearAlpha*(1.0-uNight*.63));
        if(uNight>.001){
          vec2 celestial=vec2(atan(d.z,d.x)*.159154943+.5,asin(clamp(d.y,-1.0,1.0))*.318309886+.5);
          float visibility=uNight*(1.0-uStorm)*smoothstep(.035,.18,h)*(1.0-nearAlpha*.92)*(1.0-farAlpha*.7);
          float milky=exp(-pow((d.x*.64+d.y*.37-d.z*.40-.22)*5.4,2.0));
          float dust=noise2(celestial*vec2(55.0,32.0)+7.0);
          col+=vec3(.012,.013,.026)*milky*(.28+dust*.72)*visibility;
          col+=vec3(.35,.41,.49)*starSpecks(celestial)*visibility;
        }
        gl_FragColor=vec4(col,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(560, 32, 16), skyMaterial);
  sky.name = "layered-atmosphere";
  sky.frustumCulled = false;
  sky.renderOrder = -100;
  scene.add(sky);

  // Fixed pools: one draw per particle type, no per-frame geometry/materials.
  function pool(capacity: number, fire: boolean) {
    const positions = new Float32Array(capacity * 3), velocities = new Float32Array(capacity * 3);
    const life = new Float32Array(capacity), maxLife = new Float32Array(capacity);
    const size = new Float32Array(capacity), alpha = new Float32Array(capacity), seedSize = new Float32Array(capacity);
    const kinds = new Float32Array(capacity), angles = new Float32Array(capacity), waterFloor = new Float32Array(capacity);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("fxSize", new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("fxAlpha", new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("fxKind", new THREE.BufferAttribute(kinds, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("fxAngle", new THREE.BufferAttribute(angles, 1).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.ShaderMaterial({
      uniforms: { uHeight: viewportHeight }, transparent: true, depthWrite: false,
      blending: fire ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute float fxSize,fxAlpha,fxKind,fxAngle;uniform float uHeight;varying float vAlpha,vKind,vAngle;
        void main(){vAlpha=fxAlpha;vKind=fxKind;vAngle=fxAngle;vec4 p=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*p;
        ${fire ? "" : "vAlpha*=smoothstep(1.4,5.5,-p.z);"}
        gl_PointSize=clamp(fxSize*uHeight*projectionMatrix[1][1]*.5/max(1.0,-p.z),1.0,${fire ? "42.0" : "76.0"});}`,
      fragmentShader: fire ? `varying float vAlpha;void main(){vec2 p=gl_PointCoord-.5;float r=length(p);
        float a=(1.0-smoothstep(.02,.5,r))*vAlpha;if(a<.008)discard;
        vec3 col=mix(vec3(.75,.07,.008),vec3(1.0,.62,.08),vAlpha);
        gl_FragColor=vec4(col,a*.62);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }` : `varying float vAlpha,vKind,vAngle;void main(){
        vec2 p=gl_PointCoord-.5;float c=cos(vAngle),s=sin(vAngle);p=mat2(c,-s,s,c)*p;
        float r=length(p*mix(vec2(1.5,.87),vec2(.93,1.16),vKind));
        float edge=.38+vKind*.025*sin(atan(p.y,p.x)*3.0+vAngle);
        float a=(1.0-smoothstep(edge-.10,edge+.06,r))*vAlpha;if(a<.01)discard;
        float rim=smoothstep(.13,.39,r),glint=exp(-dot(p-vec2(-.13,.12),p-vec2(-.13,.12))*75.0);
        float foam=vKind*.12*(.5+.5*sin(p.x*37.0+sin(p.y*25.0)));
        vec3 col=mix(vec3(.20,.53,.65),vec3(.70,.90,.96),clamp(rim*.42+glint*.46+foam,0.0,1.0));
        gl_FragColor=vec4(col,a*mix(.70,.48,vKind));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.name = fire ? "fire-embers" : "wheel-water-droplets";
    scene.add(points);
    let cursor = 0;
    return {
      capacity,
      emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, radius: number, duration: number, kind = 0, angle = 0) {
        const i = cursor, b = i * 3; cursor = (cursor + 1) % capacity;
        positions[b] = x; positions[b+1] = y; positions[b+2] = z;
        velocities[b] = vx; velocities[b+1] = vy; velocities[b+2] = vz;
        life[i] = maxLife[i] = duration; size[i] = seedSize[i] = radius; alpha[i] = 1;
        kinds[i] = kind; angles[i] = angle; waterFloor[i] = y - .16;
      },
      update(dt: number) {
        for (let i=0;i<capacity;i++) {
          if (life[i]<=0) continue;
          life[i]-=dt;
          if (life[i]<=0) { alpha[i]=0; continue; }
          const b=i*3, t=life[i]/maxLife[i];
          positions[b]+=velocities[b]*dt; positions[b+1]+=velocities[b+1]*dt; positions[b+2]+=velocities[b+2]*dt;
          velocities[b+1]+=(fire ? 1.9 : -15.0)*dt;
          if (!fire && positions[b+1] < waterFloor[i]) {life[i]=0;alpha[i]=0;continue;}
          alpha[i]=Math.min(1,t*2); size[i]=seedSize[i]*(fire ? .45+t*.7 : .75+t*.25);
        }
        geometry.attributes.position.needsUpdate=true; geometry.attributes.fxSize.needsUpdate=true; geometry.attributes.fxAlpha.needsUpdate=true;
        if (!fire) {geometry.attributes.fxKind.needsUpdate=true;geometry.attributes.fxAngle.needsUpdate=true;}
      },
    };
  }
  const spray=pool(mobile ? 1600 : 3200,false), embers=pool(mobile ? 180 : 360,true);
  const waterBudget = new Float32Array(8), wasWet = new Uint8Array(8);
  const waterSequence = new Uint32Array(8);
  const flameMaterial = new THREE.ShaderMaterial({
    uniforms:{uTime:time},transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,blending:THREE.NormalBlending,
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`${hashGLSL}uniform float uTime;varying vec2 vUv;
      void main(){float t=1.0-vUv.y;float n=noise2(vec2(vUv.x*7.0,t*9.0+uTime*8.0));
      float curl=sin(t*11.0-uTime*13.0)*t*.09+(n-.5)*t*.20;
      float width=(.40*(1.0-t)+.022)*sqrt(smoothstep(0.0,.12,t))*(.8+n*.4);
      float cross=abs(vUv.x-.5+curl);float a=(1.0-smoothstep(width*.46,width,cross))*(1.0-smoothstep(.78,1.0,t));
      if(a<.015)discard;float heat=clamp((1.0-cross/max(width,.001))*(1.0-t)*1.5,0.0,1.0);
      vec3 col=mix(vec3(.88,.045,.003),vec3(1.0,.42,.015),smoothstep(.1,.65,heat));
      col=mix(col,vec3(1.0,.86,.33),smoothstep(.70,.98,heat));
      gl_FragColor=vec4(col,a*.86);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  const flameGeometry=new THREE.PlaneGeometry(1.5,3.7);
  flameGeometry.rotateX(Math.PI/2); flameGeometry.translate(0,0,-1.20);
  const fireCoreGeometry=new THREE.SphereGeometry(.23,12,8);
  const fireCoreMaterial=new THREE.MeshBasicMaterial({color:0xffd56a,transparent:true,opacity:.84,depthWrite:false});
  let madeFire = false;

  const shieldMaterial = new THREE.ShaderMaterial({
    uniforms:{uTime:time},transparent:true,depthWrite:false,side:THREE.FrontSide,
    vertexShader:`varying vec3 vN,vV;varying vec2 vUv;void main(){vec4 p=modelViewMatrix*vec4(position,1.0);vN=normalize(normalMatrix*normal);vV=-p.xyz;vUv=uv;gl_Position=projectionMatrix*p;}`,
    fragmentShader:`uniform float uTime;varying vec3 vN,vV;varying vec2 vUv;
      void main(){float rim=pow(1.0-abs(dot(normalize(vN),normalize(vV))),2.6);
      vec2 p=vUv*vec2(24,16);p.x+=mod(floor(p.y),2.0)*.5;vec2 cell=abs(fract(p)-.5);
      float grid=smoothstep(.445,.49,max(cell.x,cell.y));float scan=pow(max(0.0,sin(vUv.y*25.0-uTime*2.0)),20.0);
      float alpha=.025+rim*.60+grid*.075+scan*.035;
      gl_FragColor=vec4(mix(vec3(.02,.23,.39),vec3(.15,.79,.94),rim+grid*.2),alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });

  return {
    time, shieldMaterial, budgets:{water:spray.capacity,embers:embers.capacity},
    decoratePickup(material: Three.MeshPhysicalMaterial) {
      material.onBeforeCompile=(shader)=>{
        shader.uniforms.uPickupTime=time;
        shader.vertexShader="varying vec2 vPickupUv;\n"+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\nvPickupUv=uv;");
        shader.fragmentShader="varying vec2 vPickupUv;uniform float uPickupTime;\n"+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace("#include <emissivemap_fragment>",`#include <emissivemap_fragment>
          vec2 border=min(vPickupUv,1.0-vPickupUv);float edge=1.0-smoothstep(.022,.05,min(border.x,border.y));
          float diamond=1.0-smoothstep(.022,.045,abs(abs(vPickupUv.x-.5)+abs(vPickupUv.y-.5)-.23));
          float sweep=pow(max(0.0,sin(vPickupUv.y*10.0-uPickupTime*2.0)),12.0);
          totalEmissiveRadiance+=vec3(.05,.42,.52)*(edge*.65+diamond*.52+sweep*.12);`);
      };
      material.customProgramCacheKey=()=>"pickup-energy-outline-v1";
    },
    makeFire() {
      madeFire = true;
      const group=new THREE.Group();
      for(let i=0;i<3;i++) {const tongue=new THREE.Mesh(flameGeometry,flameMaterial);tongue.rotation.z=i*Math.PI/3;group.add(tongue);}
      const core=new THREE.Mesh(fireCoreGeometry,fireCoreMaterial);core.scale.set(.85,.85,1.6);core.position.z=.23;group.add(core);
      return group;
    },
    update(dt: number, seconds: number) { time.value=seconds; spray.update(dt); embers.update(dt); },
    updateSky(camera: Three.Camera, height: number, night: number, storm: number) {
      sky.position.copy(camera.position); viewportHeight.value=height;
      if(scene.background instanceof THREE.Color) skyMaterial.uniforms.uSky.value.copy(scene.background);
      if(scene.fog instanceof THREE.Fog) skyMaterial.uniforms.uFog.value.copy(scene.fog.color);
      // Canopy world fog is green; retain it for the objects, while the sky
      // uses atmospheric blue/teal. Never accumulate a tint across frames.
      if (theme === "river" || theme === "jungle") {
        skyMaterial.uniforms.uSky.value.lerp(skyDay, .76);
        skyMaterial.uniforms.uFog.value.lerp(skyHaze, .72);
      }
      skyMaterial.uniforms.uNight.value=clamp01(night);skyMaterial.uniforms.uStorm.value=clamp01(storm);
    },
    wheelSpray(actor: number, pose: Pose, speed: number, wet: boolean, dt: number) {
      if(!wet || Math.abs(speed)<2) {wasWet[actor]=0;waterBudget[actor]=0;return;}
      const profile = waterSprayProfile(speed, mobile);
      waterBudget[actor]+=dt*profile.packetsPerSecond;
      if(!wasWet[actor]) waterBudget[actor]+=2+Math.floor(profile.power*5);
      wasWet[actor]=1;
      const count=Math.min(10,Math.floor(waterBudget[actor]));waterBudget[actor]-=count;
      const fx=Math.sin(pose.heading),fz=Math.cos(pose.heading),rx=fz,rz=-fx;
      const travelSign = speed < 0 ? -1 : 1;
      for(let i=0;i<count;i++) {
        const sequence=waterSequence[actor]++;
        for(const [wheelX,wheelZ] of WATER_WHEELS) {
          const side=Math.sign(wheelX), trailing=wheelZ*travelSign<0;
          const x=pose.x+fx*wheelZ+rx*wheelX, z=pose.z+fz*wheelZ+rz*wheelX;
          const out=side*profile.outward*(.65+random()*.9);
          const retreat=travelSign*profile.backward*(trailing ? 1.05+random()*.65 : .50+random()*.6);
          const lift=profile.lift*(trailing ? .52+random()*.46 : .78+random()*.40);
          const angle=side*(.3+random()*.65);
          // Front spray retains more forward momentum so it rises beside the kart;
          // rear spray sheds that momentum and leaves a long fan-shaped wake.
          const forward=speed*(trailing ? .46 : .88)-retreat;
          const clumpForward=speed*(trailing ? .58 : .94)-retreat*.75;
          const mistForward=speed*.35-retreat*.65;
          spray.emit(x,pose.y+.10,z,rx*out+fx*forward,lift,rz*out+fz*forward,
            profile.dropSize*(.70+random()*.85),profile.lifetime*(.72+random()*.34),0,angle);
          // Chunky translucent lobes connect the fine spray into four visible plumes.
          if(sequence%2===0) {
            spray.emit(x,pose.y+.12,z,rx*out*.86+fx*clumpForward,lift*.82,rz*out*.86+fz*clumpForward,
              profile.clumpSize*(.72+random()*.65),profile.lifetime*.88,1,angle);
          }
          if(profile.power>.35 && sequence%3===0) {
            spray.emit(x,pose.y+.08,z,rx*out*1.4+fx*mistForward,lift*.55,rz*out*1.4+fz*mistForward,
              profile.dropSize*.65,profile.lifetime*.8,0,angle);
          }
        }
      }
    },
    fireTrail(pose: {x:number;y:number;z:number}, heading: number, scale: number, dt: number, state: {fxBudget?:number}) {
      state.fxBudget=(state.fxBudget??0)+dt*(mobile?26:42);
      const count=Math.min(5,Math.floor(state.fxBudget));state.fxBudget-=count;
      const fx=Math.sin(heading),fz=Math.cos(heading);
      for(let i=0;i<count;i++) {
        const trail=(.6+random()*1.9)*scale;
        embers.emit(pose.x-fx*trail+(random()-.5)*.5*scale,pose.y+(random()-.5)*.45*scale,pose.z-fz*trail+(random()-.5)*.5*scale,
          -fx*(3+random()*4),(random()-.2)*2.5,-fz*(3+random()*4),(.075+random()*.16)*scale,.2+random()*.36);
      }
    },
    // These shared resources may never enter the scene if no FIRE is fired.
    disposeUnused() {
      // Used resources are already disposed by the scene + projectile-pool traversal.
      if (!madeFire) {flameGeometry.dispose();flameMaterial.dispose();fireCoreGeometry.dispose();fireCoreMaterial.dispose();}
    },
  };
}

export function addSkillAccent(THREE: ThreeModule, group: Three.Group, skill: string, material: Three.MeshBasicMaterial) {
  const accent=new THREE.Group();accent.name="skill-accent";
  if(skill==="VOLT") {
    for(let i=0;i<3;i++) {
      const arc=new THREE.Mesh(new THREE.TorusGeometry(1.8+i*.18,.035,4,32,Math.PI*1.35),material);
      arc.rotation.set(i*.85,Math.PI/3+i*.9,i*2.1);arc.position.y=.7;accent.add(arc);
    }
  } else if(skill==="PIXEL") {
    for(const side of [-1,1]) for(let i=0;i<3;i++) {
      const streak=new THREE.Mesh(new THREE.ConeGeometry(.10,2.8-i*.45,6),material);
      streak.rotation.x=-Math.PI/2;streak.position.set(side*(1.4+i*.23),.3+i*.17,-1.1-i*.35);accent.add(streak);
    }
  } else if(skill==="COMET") {
    for(let i=0;i<3;i++) {
      const orbit=new THREE.Mesh(new THREE.TorusGeometry(1.7+i*.24,.035,4,36,Math.PI*1.6),material);
      orbit.rotation.set(.45+i*.4,.3,i*1.2);orbit.position.y=.65;accent.add(orbit);
    }
  } else {
    for(let i=0;i<3;i++) {
      const ring=new THREE.Mesh(new THREE.TorusGeometry(1.65-i*.32,.055,5,36),material);
      ring.rotation.x=Math.PI/2;ring.position.y=-.2-i*.42;accent.add(ring);
    }
  }
  group.add(accent);
}
