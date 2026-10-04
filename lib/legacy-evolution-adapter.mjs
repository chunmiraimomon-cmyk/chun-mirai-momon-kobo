const LEGACY_SOURCE_PATTERN = /legacy-evolution[\\/](v\d+)[\\/]app[\\/]page\.tsx(?:\?|$)/;

const pauseGuard = (loopName) => `const ${loopName} = (now: number) => {\n        if ((window as Window & { __EVOLUTION_PAUSED__?: boolean }).__EVOLUTION_PAUSED__) {\n          previous = now;\n          frame = requestAnimationFrame(${loopName});\n          return;\n        }`;

const unlitEffectAnchor = `const createEvolutionUnlitEffectAnchor = (THREE: ThreeModule, color = 0xffffff, intensity = 0, distance = 0, decay = 2) => {
  const anchor = new THREE.Object3D() as unknown as Three.PointLight;
  anchor.color = new THREE.Color(color);
  anchor.intensity = intensity;
  anchor.distance = distance;
  anchor.decay = decay;
  return anchor;
};

`;

function backportV39Performance(adapted, versionNumber, versionKey) {
  if (versionNumber >= 39) return adapted;

  const dynamicLightPatterns = versionNumber === 3
    ? [/const rearGlow = new THREE\.PointLight\(/g]
    : [
        /const glow = new THREE\.PointLight\(/g,
        /const light = new THREE\.PointLight\(/g,
        /const starLight = new THREE\.PointLight\(/g,
      ];
  const dynamicLightCount = dynamicLightPatterns.reduce((count, pattern) => count + (adapted.match(pattern) ?? []).length, 0);
  if (dynamicLightCount > 0) {
    const clampMarker = "const clamp = (value: number, min: number, max: number)";
    if (!adapted.includes(clampMarker)) throw new Error(`Legacy ${versionKey}: performance helper marker missing`);
    adapted = adapted.replace(clampMarker, `${unlitEffectAnchor}${clampMarker}`);
    dynamicLightPatterns.forEach((pattern) => {
      adapted = adapted.replace(pattern, (whole) => whole.replace("new THREE.PointLight(", "createEvolutionUnlitEffectAnchor(THREE, "));
    });
  }

  // V24-V30 predate V39's cached river samples. Keep their water appearance,
  // but update particles at ~30Hz from a precomputed centerline instead of
  // evaluating the spline and allocating a pose for every particle every frame.
  if ([24, 26, 30].includes(versionNumber)) {
    const waterFlowDeclaration = /(\s+const waterFlow = scene\.userData\.waterFlow[^\r\n]+;\r?\n)/;
    if (!waterFlowDeclaration.test(adapted)) throw new Error(`Legacy ${versionKey}: water-flow marker missing`);
    adapted = adapted.replace(waterFlowDeclaration, (whole) => `${whole}      const evolutionWaterSampleCount = 720;
      const evolutionWaterSamples = waterFlow
        ? Array.from({ length: evolutionWaterSampleCount }, (_, index) => course.pointAt(index / evolutionWaterSampleCount))
        : [];
      const evolutionWaterPose: CoursePose = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, nx: 0, nz: 0 };
      const sampledEvolutionWaterPointAt = (u: number, lane: number) => {
        const scaled = wrap01(u) * evolutionWaterSampleCount;
        const lowerIndex = Math.floor(scaled) % evolutionWaterSampleCount;
        const upperIndex = (lowerIndex + 1) % evolutionWaterSampleCount;
        const amount = scaled - Math.floor(scaled);
        const lower = evolutionWaterSamples[lowerIndex];
        const upper = evolutionWaterSamples[upperIndex];
        let nx = lower.nx + (upper.nx - lower.nx) * amount;
        let nz = lower.nz + (upper.nz - lower.nz) * amount;
        const normalLength = Math.hypot(nx, nz) || 1;
        nx /= normalLength;
        nz /= normalLength;
        evolutionWaterPose.x = lower.x + (upper.x - lower.x) * amount + nx * lane;
        evolutionWaterPose.y = lower.y + (upper.y - lower.y) * amount;
        evolutionWaterPose.z = lower.z + (upper.z - lower.z) * amount + nz * lane;
        evolutionWaterPose.nx = nx;
        evolutionWaterPose.nz = nz;
        return evolutionWaterPose;
      };
      let lastEvolutionWaterFlowUpdateAt = 0;
`);
    adapted = adapted.replace("            if (waterFlow) {", "            if (waterFlow && (!lastEvolutionWaterFlowUpdateAt || now - lastEvolutionWaterFlowUpdateAt >= 33)) {\n              const evolutionWaterDt = lastEvolutionWaterFlowUpdateAt ? Math.min(0.08, (now - lastEvolutionWaterFlowUpdateAt) / 1000) : dt;\n              lastEvolutionWaterFlowUpdateAt = now;");
    adapted = adapted.replace("particle.progress += (particle.speed / course.length) * dt;", "particle.progress += (particle.speed / course.length) * evolutionWaterDt;");
    adapted = adapted.replace("const point = course.pointAt(particle.progress, lane);", "const point = sampledEvolutionWaterPointAt(particle.progress, lane);");
  }

  return adapted;
}

export function adaptLegacyEvolutionSource(source, id) {
  const match = id.replaceAll("\\", "/").match(LEGACY_SOURCE_PATTERN);
  if (!match) return null;

  const versionKey = match[1];
  const versionNumber = Number(versionKey.slice(1));
  const raceStarter = versionNumber >= 23 ? "beginRace" : "startRace";
  let adapted = source;

  // Read the requested count when the race runs, not while its module is
  // preloaded. Reading it at import time made preloaded V81/V94 races lock to
  // one lap before LegacyEvolutionPlayer had installed the stage settings.
  if (adapted.includes("const TOTAL_LAPS = 3;")) {
    adapted = adapted.replace(
      "const TOTAL_LAPS = 3;",
      "const ARCHIVED_TOTAL_LAPS = 3;\nconst getEvolutionTotalLaps = () => typeof window !== \"undefined\" ? Number((window as Window & { __EVOLUTION_LAPS__?: number }).__EVOLUTION_LAPS__ ?? ARCHIVED_TOTAL_LAPS) : ARCHIVED_TOTAL_LAPS;",
    );
    adapted = adapted.replace(/\bTOTAL_LAPS\b/g, "getEvolutionTotalLaps()");
  }

  adapted = backportV39Performance(adapted, versionNumber, versionKey);

  if (adapted.includes("function readGamepadInput(): GamepadInput {")) {
    adapted = adapted.replace(
      "function readGamepadInput(): GamepadInput {",
      "function readGamepadInput(): GamepadInput {\n  const evolutionInput = (window as Window & { __EVOLUTION_GAMEPAD_INPUT__?: GamepadInput }).__EVOLUTION_GAMEPAD_INPUT__;\n  if (evolutionInput) return evolutionInput;",
    );
  }

  if (versionNumber >= 23) {
    adapted = adapted.replace(
      'const [activeCupId, setActiveCupId] = useState<CupId>("basic");',
      'const [activeCupId, setActiveCupId] = useState<CupId>(() => typeof window !== "undefined" ? ((window as Window & { __EVOLUTION_CUP_ID__?: CupId }).__EVOLUTION_CUP_ID__ ?? "adventure") : "adventure");',
    );
    adapted = adapted.replace(
      "const [courseIndex, setCourseIndex] = useState(0);",
      "const [courseIndex, setCourseIndex] = useState(() => (window as Window & { __EVOLUTION_COURSE_INDEX__?: number }).__EVOLUTION_COURSE_INDEX__ ?? 0);",
    );
  }

  if (versionNumber === 94) {
    adapted = adapted.replace(
      "const [selectedCharacterIndex, setSelectedCharacterIndex] = useState(0);",
      "const [selectedCharacterIndex, setSelectedCharacterIndex] = useState(() => typeof window !== \"undefined\" ? ((window as Window & { __EVOLUTION_CHARACTER_INDEX__?: number }).__EVOLUTION_CHARACTER_INDEX__ ?? 0) : 0);",
    );
  }

  const telemetryMarker = "  const handleTelemetry = useCallback(";
  if (!adapted.includes(telemetryMarker)) throw new Error(`Legacy ${versionKey}: telemetry marker missing`);
  const telemetrySignature = /  const handleTelemetry = useCallback\(\(([^\r\n]+)\) => \{\r?\n/;
  if (!telemetrySignature.test(adapted)) throw new Error(`Legacy ${versionKey}: telemetry signature missing`);
  adapted = adapted.replace(
    telemetrySignature,
    (whole) => `${whole}    window.dispatchEvent(new CustomEvent("evolution:legacy-telemetry", { detail: {\n      version: (window as Window & { __EVOLUTION_VERSION__?: string }).__EVOLUTION_VERSION__,\n      speed: nextSpeed,\n      progress: nextProgress,\n      position: nextPosition,\n      driftGauge: ${versionNumber >= 15 ? "nextDriftGauge" : "0"},\n      driftDashing: ${versionNumber >= 15 ? "nextDriftDashing" : "false"},\n    } }));\n`,
  );

  const actionEvent = (action) => `window.dispatchEvent(new CustomEvent("evolution:legacy-action", { detail: { version: (window as Window & { __EVOLUTION_VERSION__?: string }).__EVOLUTION_VERSION__, action: "${action}" } }));`;
  if (versionNumber === 3) {
    adapted = adapted.replace(
      "const steering = (left ? -1 : 0) + (right ? 1 : 0);",
      `const steering = (left ? -1 : 0) + (right ? 1 : 0);\n        if (steering !== 0) ${actionEvent("steer")}`,
    );
  }
  if (versionNumber === 11) {
    adapted = adapted.replace(
      "const steering = (left ? 1 : 0) + (right ? -1 : 0);",
      `const steering = (left ? 1 : 0) + (right ? -1 : 0);\n        if (steering !== 0) ${actionEvent("steer")}`,
    );
    adapted = adapted.replace(
      "playerState.crashUntil = now + 1450;",
      `playerState.crashUntil = now + 1450;\n          ${actionEvent("crash")}`,
    );
  }
  if (versionNumber === 94) {
    adapted = adapted.replace(
      "if (skillsEnabled && useSkill && !skillPressed) activateActorSkill(0, now);",
      `if (skillsEnabled && useSkill && !skillPressed) {\n            activateActorSkill(0, now);\n            ${actionEvent("skill")}\n          }`,
    );
  }

  const autoStartBody = versionNumber === 94
    ? `if ((window as Window & { __EVOLUTION_GOJO_DUEL__?: boolean }).__EVOLUTION_GOJO_DUEL__) startGojoChallenge();\n      else beginRace();`
    : `${raceStarter}();`;
  const autoStartDependencies = versionNumber === 94 ? "beginRace, startGojoChallenge" : raceStarter;
  adapted = adapted.replace(
    telemetryMarker,
    `  useEffect(() => {\n    if (!(window as Window & { __EVOLUTION_AUTOSTART__?: boolean }).__EVOLUTION_AUTOSTART__) return;\n    const timer = window.setTimeout(() => {\n      ${autoStartBody}\n    }, 120);\n    return () => window.clearTimeout(timer);\n  }, [${autoStartDependencies}]);\n\n${telemetryMarker}`,
  );

  const finishMarker = /  const handleFinish = useCallback\(\(([^\r\n]+)\) => \{\r?\n/;
  if (!finishMarker.test(adapted)) throw new Error(`Legacy ${versionKey}: finish marker missing`);
  adapted = adapted.replace(
    finishMarker,
    (whole) => `${whole}    window.dispatchEvent(new CustomEvent("evolution:legacy-finish", { detail: {\n      version: (window as Window & { __EVOLUTION_VERSION__?: string }).__EVOLUTION_VERSION__,\n      time,\n      position: nextPosition,\n    } }));\n`,
  );

  const loopName = adapted.includes("const animate = (now: number) => {") ? "animate" : adapted.includes("const render = (now: number) => {") ? "render" : "";
  if (!loopName) throw new Error(`Legacy ${versionKey}: animation loop marker missing`);
  adapted = adapted.replace(`const ${loopName} = (now: number) => {`, pauseGuard(loopName));

  return { code: adapted, map: null };
}

export function legacyEvolutionAdapterPlugin() {
  return {
    name: "legacy-evolution-adapter",
    enforce: "pre",
    transform(source, id) {
      return adaptLegacyEvolutionSource(source, id);
    },
  };
}
