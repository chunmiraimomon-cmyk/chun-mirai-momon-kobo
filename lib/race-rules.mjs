export const canActivateItem = (item, crashing) => (
  item !== "EMPTY"
  && (!crashing || item === "FIRE" || item === "HOMING" || item === "SHIELD")
);

export const takeoffGravity = ({
  now,
  boostGravityUntil,
  drifting,
  driftBoost,
  jumpGravity,
  strongGravity,
}) => (
  now < boostGravityUntil || (!drifting && driftBoost > 0.001)
    ? jumpGravity
    : strongGravity
);

export const advanceHomingProgress = ({
  projectileProgress,
  projectileSpeed,
  courseLength,
  dt,
}) => projectileProgress + (projectileSpeed / courseLength) * dt;

export const extractRecordedLineShortcuts = ({
  samples,
  minimumProgressJump = 0.12,
  maximumProgressJump = 0.35,
}) => {
  if (!Array.isArray(samples) || samples.length < 2) return [];
  const shortcuts = [];
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const next = samples[index];
    const startProgress = Number(previous?.[0]);
    const targetProgress = Number(next?.[0]);
    const startLane = Number(previous?.[1]);
    const targetLane = Number(next?.[1]);
    const progressJump = targetProgress - startProgress;
    if (
      !Number.isFinite(startProgress)
      || !Number.isFinite(targetProgress)
      || !Number.isFinite(startLane)
      || !Number.isFinite(targetLane)
      || progressJump < minimumProgressJump
      || progressJump > maximumProgressJump
    ) continue;
    shortcuts.push({
      key: `recorded-line:${index}`,
      startProgress,
      targetProgress,
      startLane,
      targetLane,
    });
  }
  return shortcuts;
};

export const GOJO_RECORDED_SHORTCUT_TRIGGER_METERS = 24;
export const GOJO_RECORDED_SHORTCUT_RESERVE_METERS = 80;

export const gojoRecordedShortcutApproachPhase = ({
  distanceToRecordedTakeoff,
  triggerMeters = GOJO_RECORDED_SHORTCUT_TRIGGER_METERS,
  reserveMeters = GOJO_RECORDED_SHORTCUT_RESERVE_METERS,
}) => {
  if (!Number.isFinite(distanceToRecordedTakeoff) || distanceToRecordedTakeoff < -2.5) return "none";
  if (distanceToRecordedTakeoff <= triggerMeters) return "launch";
  if (distanceToRecordedTakeoff <= reserveMeters) return "reserve";
  return "none";
};

export const recordedShortcutFlightPosition = ({
  startX,
  startZ,
  endX,
  endZ,
  progress,
}) => {
  const amount = Math.max(0, Math.min(1, progress));
  return {
    x: startX + (endX - startX) * amount,
    z: startZ + (endZ - startZ) * amount,
  };
};

export const chooseRecordedShortcutStarAvoidance = ({
  startX,
  startY,
  startZ,
  endX,
  endZ,
  currentProgress,
  duration,
  launchVelocity,
  gravity,
  stars,
  avoidanceOffset = 5.2,
}) => {
  const deltaX = endX - startX;
  const deltaZ = endZ - startZ;
  const distanceSquared = deltaX ** 2 + deltaZ ** 2;
  if (distanceSquared < 1 || !Array.isArray(stars) || !stars.length) return 0;
  const distance = Math.sqrt(distanceSquared);
  const sideX = deltaZ / distance;
  const sideZ = -deltaX / distance;
  const threats = [];
  for (const star of stars) {
    const pathProgress = Math.max(0, Math.min(1, (
      (star.x - startX) * deltaX + (star.z - startZ) * deltaZ
    ) / distanceSquared));
    const secondsUntilCrossing = (pathProgress - currentProgress) * duration;
    if (secondsUntilCrossing < -0.08 || secondsUntilCrossing > 2.8) continue;
    const pathX = startX + deltaX * pathProgress;
    const pathZ = startZ + deltaZ * pathProgress;
    const horizontalDistance = Math.hypot(star.x - pathX, star.z - pathZ);
    if (horizontalDistance > 7.2) continue;
    const pathTime = pathProgress * duration;
    const kartY = startY + launchVelocity * pathTime - 0.5 * gravity * pathTime * pathTime;
    const starY = star.y - star.fallSpeed * Math.max(0, secondsUntilCrossing);
    if (Math.abs(starY - (kartY + 0.9)) > 4.6) continue;
    threats.push({ x: star.x, z: star.z, pathProgress, pathX, pathZ });
  }
  if (!threats.length) return 0;
  const scoreOffset = (offset) => threats.reduce((minimum, threat) => {
    const blend = Math.max(0.35, Math.sin(Math.PI * threat.pathProgress));
    const candidateX = threat.pathX + sideX * offset * blend;
    const candidateZ = threat.pathZ + sideZ * offset * blend;
    return Math.min(minimum, Math.hypot(threat.x - candidateX, threat.z - candidateZ));
  }, Number.POSITIVE_INFINITY);
  const negativeScore = scoreOffset(-avoidanceOffset);
  const positiveScore = scoreOffset(avoidanceOffset);
  if (Math.abs(negativeScore - positiveScore) > 0.01) {
    return negativeScore > positiveScore ? -avoidanceOffset : avoidanceOffset;
  }
  const first = threats[0];
  const starSide = (first.x - first.pathX) * sideX + (first.z - first.pathZ) * sideZ;
  return starSide >= 0 ? -avoidanceOffset : avoidanceOffset;
};

export const vectorTurboRemainsActive = ({ active, steer, crashing = false }) => (
  Boolean(active) && !crashing && Math.abs(steer) <= 0.08
);

export const CPU_VECTOR_DIRECTION_EPSILON = 0.0025;

export const cpuVectorTurboRemainsActive = ({
  active,
  startHeading,
  currentHeading,
  crashing = false,
  epsilon = CPU_VECTOR_DIRECTION_EPSILON,
}) => {
  let difference = currentHeading - startHeading;
  while (difference > Math.PI) difference -= Math.PI * 2;
  while (difference < -Math.PI) difference += Math.PI * 2;
  return Boolean(active) && !crashing && Math.abs(difference) <= epsilon;
};

export const VOLT_SUCCESS_MIN = 0.7;
export const VOLT_SUCCESS_MAX = 0.8;
export const VOLT_CRITICAL_MIN = 0.73;
export const VOLT_CRITICAL_MAX = 0.77;
export const SKILL_TURBO_DURATION_MS = 3000;

export const resolveOverchargeDrift = ({
  charge,
  released,
  successMin = VOLT_SUCCESS_MIN,
  successMax = VOLT_SUCCESS_MAX,
  overheatAt = 1,
}) => {
  const normalizedCharge = Math.max(0, Math.min(overheatAt, charge));
  if (!released && normalizedCharge < overheatAt) return { outcome: "charging", boost: 0 };
  if (normalizedCharge >= overheatAt || normalizedCharge > successMax) return { outcome: "overheat", boost: 0 };
  if (normalizedCharge >= VOLT_CRITICAL_MIN && normalizedCharge <= VOLT_CRITICAL_MAX) {
    return { outcome: "critical-success", boost: 1, multiplier: 1.5, durationMs: SKILL_TURBO_DURATION_MS };
  }
  if (normalizedCharge >= successMin) {
    return { outcome: "success", boost: 1, multiplier: 1, durationMs: SKILL_TURBO_DURATION_MS };
  }
  return { outcome: "undercharge", boost: 0.16 + normalizedCharge * 0.28 };
};

const unitRoll = (roll) => Math.max(0, Math.min(0.999999, Number.isFinite(roll) ? roll : 0));

export const cpuOverchargeTarget = ({ gojo = false, roll = 0, sideRoll = 0 }) => {
  const critical = unitRoll(roll) < (gojo ? 0.4 : 0.2);
  if (critical) return { tier: "critical", charge: 0.75 };
  return { tier: "orange", charge: unitRoll(sideRoll) < 0.5 ? 0.715 : 0.785 };
};

export const cpuCometGateTarget = ({ gojo = false, roll = 0 }) => {
  const normalizedRoll = unitRoll(roll);
  if (gojo) return normalizedRoll < 0.1 ? 1 : normalizedRoll < 0.6 ? 2 : 3;
  return normalizedRoll < 0.3 ? 1 : normalizedRoll < 0.9 ? 2 : 3;
};

export const cometGateResult = ({
  actorProgress,
  actorLane,
  gateProgress,
  gateLane,
  courseLength,
  hitHalfWidth = 2.35,
  hitDepthMeters = 3.4,
  missDepthMeters = 9,
}) => {
  const distanceMeters = (actorProgress - gateProgress) * courseLength;
  if (Math.abs(distanceMeters) <= hitDepthMeters && Math.abs(actorLane - gateLane) <= hitHalfWidth) return "passed";
  if (distanceMeters > missDepthMeters) return "missed";
  return "pending";
};

export const pointToSegmentDistance3d = ({ point, start, end }) => {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const segmentZ = end.z - start.z;
  const lengthSquared = segmentX ** 2 + segmentY ** 2 + segmentZ ** 2;
  const amount = lengthSquared > 0
    ? Math.max(0, Math.min(1, (
      (point.x - start.x) * segmentX
      + (point.y - start.y) * segmentY
      + (point.z - start.z) * segmentZ
    ) / lengthSquared))
    : 0;
  return Math.hypot(
    point.x - (start.x + segmentX * amount),
    point.y - (start.y + segmentY * amount),
    point.z - (start.z + segmentZ * amount),
  );
};

export const rankingProgressFromGroundContact = ({
  previousRankingProgress,
  courseProgress,
  airborne,
}) => airborne ? previousRankingProgress : courseProgress;

export const isFinalFinishArmed = ({
  courseProgress,
  totalLaps,
  armingProgress,
}) => courseProgress >= totalLaps - armingProgress;

export const finalLapCheckpointFromGroundContact = ({
  previousReached,
  courseProgress,
  totalLaps,
  airborne,
  offRoad = false,
  checkpointProgress = 0.5,
}) => Boolean(previousReached) || (
  !airborne
  && !offRoad
  && Number.isFinite(courseProgress)
  && courseProgress >= totalLaps - 1 + checkpointProgress
);

export const resolveTrackedCourseProgress = ({
  currentProgress,
  lastU,
  candidateU,
  candidateDistance,
  maxDistance,
  maxDelta = 0.08,
  minimumProgress = 0,
}) => {
  const wrappedCandidateU = ((candidateU % 1) + 1) % 1;
  let delta = wrappedCandidateU - lastU;
  if (delta > 0.5) delta -= 1;
  if (delta < -0.5) delta += 1;
  const accepted = Number.isFinite(candidateDistance)
    && candidateDistance <= maxDistance
    && Math.abs(delta) < maxDelta;
  if (!accepted) {
    return { accepted: false, delta: 0, progress: currentProgress, lastU };
  }
  return {
    accepted: true,
    delta,
    progress: Math.max(minimumProgress, currentProgress + delta),
    lastU: wrappedCandidateU,
  };
};

export const isWithinFinishRoadHeight = ({
  position,
  roadSamples,
  overheadRoadSamples = [],
  radius,
  roadHeightTolerance = 0.12,
  overheadContactTolerance = 0.12,
  overheadProgressSeparation = 0.02,
}) => {
  let nearestRoadSample = null;
  let nearestRoadDistanceSquared = Number.POSITIVE_INFINITY;
  for (const sample of roadSamples) {
    const distanceSquared = (position.x - sample.x) ** 2 + (position.z - sample.z) ** 2;
    if (distanceSquared < nearestRoadDistanceSquared) {
      nearestRoadDistanceSquared = distanceSquared;
      nearestRoadSample = sample;
    }
  }
  if (!nearestRoadSample || nearestRoadDistanceSquared > radius ** 2) return false;
  if (position.y < nearestRoadSample.y - roadHeightTolerance) return false;

  let overheadRoadY = Number.POSITIVE_INFINITY;
  for (const sample of overheadRoadSamples) {
    const distanceSquared = (position.x - sample.x) ** 2 + (position.z - sample.z) ** 2;
    if (distanceSquared > radius ** 2) continue;
    if (sample.y <= nearestRoadSample.y + roadHeightTolerance) continue;
    if (Number.isFinite(sample.u) && Number.isFinite(nearestRoadSample.u)) {
      let progressDistance = Math.abs(sample.u - nearestRoadSample.u);
      progressDistance = Math.min(progressDistance, 1 - progressDistance);
      if (progressDistance <= overheadProgressSeparation) continue;
    }
    overheadRoadY = Math.min(overheadRoadY, sample.y);
  }
  return position.y < overheadRoadY - overheadContactTolerance;
};

export const finishLineCrossingFraction = ({
  previousPosition,
  currentPosition,
  finishPoint,
  finishForward,
  finishNormal,
  finishHalfWidth,
  checkpointReached,
  roadSamples,
  overheadRoadSamples,
  roadRadius,
  overheadProgressSeparation,
  roadHeightTolerance = 0.12,
}) => {
  if (!checkpointReached) return null;
  const previousX = previousPosition.x - finishPoint.x;
  const previousZ = previousPosition.z - finishPoint.z;
  const currentX = currentPosition.x - finishPoint.x;
  const currentZ = currentPosition.z - finishPoint.z;
  const previousSide = previousX * finishForward.x + previousZ * finishForward.z;
  const currentSide = currentX * finishForward.x + currentZ * finishForward.z;
  const sideTravel = currentSide - previousSide;
  if (previousSide >= 0 || currentSide < 0 || sideTravel <= 0.000001) return null;
  const fraction = Math.max(0, Math.min(1, -previousSide / sideTravel));
  const crossingX = previousX + (currentX - previousX) * fraction;
  const crossingZ = previousZ + (currentZ - previousZ) * fraction;
  const crossingLane = crossingX * finishNormal.x + crossingZ * finishNormal.z;
  if (Math.abs(crossingLane) > finishHalfWidth) return null;
  const crossingY = previousPosition.y + (currentPosition.y - previousPosition.y) * fraction;
  if (roadSamples && Number.isFinite(roadRadius)) {
    return isWithinFinishRoadHeight({
      position: {
        x: finishPoint.x + crossingX,
        y: crossingY,
        z: finishPoint.z + crossingZ,
      },
      roadSamples,
      overheadRoadSamples,
      radius: roadRadius,
      roadHeightTolerance,
      overheadProgressSeparation,
    }) ? fraction : null;
  }
  return crossingY >= finishPoint.y - roadHeightTolerance ? fraction : null;
};

export const airborneFinishZoneFraction = ({
  airborne,
  checkpointReached,
  previousInside,
  currentInside,
  entryFraction,
}) => {
  if (!airborne || !checkpointReached || previousInside || !currentInside) return null;
  return Math.max(0, Math.min(1, entryFraction));
};

export const isInsideAirborneFinishZone = ({
  position,
  finishPoint,
  finishForward,
  roadSamples,
  overheadRoadSamples,
  radius,
  roadHeightTolerance = 0.12,
  overheadProgressSeparation,
}) => {
  const finishOffsetX = position.x - finishPoint.x;
  const finishOffsetZ = position.z - finishPoint.z;
  if (finishOffsetX * finishForward.x + finishOffsetZ * finishForward.z < 0) return false;
  return isWithinFinishRoadHeight({
    position,
    roadSamples,
    overheadRoadSamples,
    radius,
    roadHeightTolerance,
    overheadProgressSeparation,
  });
};

const SKILL_ATTACKS = new Set();
const SPIKE_GUARD_ATTACKS = new Set([
  "FIRE", "HOMING", "AURORA", "SPIKES", "NOVA",
]);
const SHIELDABLE_ATTACKS = new Set([
  "FIRE", "HOMING", "AURORA", "SPIKES",
  "MONKEY", "CANNON", "SHOOTING_STAR",
]);

export const crashDurationForAttack = (attack, normalDurationMs) => (
  SKILL_ATTACKS.has(attack) ? normalDurationMs * 0.6 : normalDurationMs
);

export const isShieldableAttack = (attack) => SHIELDABLE_ATTACKS.has(attack);

export const isSpikeGuardAttack = (attack) => SPIKE_GUARD_ATTACKS.has(attack);

export const cameraViewForViewport = ({ width, height }) => {
  const aspect = Math.max(1, width) / Math.max(1, height);
  const portrait = aspect < 0.82;
  return {
    aspect,
    portrait,
    fov: portrait ? 82 : 57,
    chaseDistance: portrait ? 8.25 : 6.4,
    cameraHeight: portrait ? 4.25 : 3.75,
    lookAhead: portrait ? 7.5 : 6,
  };
};

export const giantLeapVerticalVelocity = ({ surfaceVerticalVelocity, gravity, height }) => (
  surfaceVerticalVelocity + Math.sqrt(2 * gravity * height)
);

export const GIANT_LEAP_MAX_ANGLE = 75;
export const GIANT_LEAP_CHARGE_DURATION_MS = 1800;
export const GIANT_LOW_DASH_DURATION_MS = 2000;
export const GIANT_LEAP_SPEED_MULTIPLIER = 1.3;

export const accelerateGiantLeapVelocity = ({ forwardVelocity, verticalVelocity }) => ({
  forwardVelocity: forwardVelocity * GIANT_LEAP_SPEED_MULTIPLIER,
  verticalVelocity: verticalVelocity * GIANT_LEAP_SPEED_MULTIPLIER,
});

export const giantLeapChargeAngle = ({ elapsedMs }) => (
  Math.min(
    GIANT_LEAP_MAX_ANGLE,
    Math.max(0, (Math.max(0, elapsedMs) / GIANT_LEAP_CHARGE_DURATION_MS) * GIANT_LEAP_MAX_ANGLE),
  )
);

export const giantLeapProfileForAngle = (angleDegrees) => {
  const angle = Math.min(GIANT_LEAP_MAX_ANGLE, Math.max(0, angleDegrees));
  if (angle < 10) {
    return { outcome: "undercharge", angle, height: 0, forwardSpeedMultiplier: 1, minimumForwardSpeed: 0, durationMs: 0 };
  }
  if (angle < 30) {
    const amount = (angle - 10) / 20;
    return {
      outcome: "low-dash",
      angle,
      // Always remains below the 0.55 m guardrail-clearance threshold.
      height: 0.14 + amount * 0.26,
      forwardSpeedMultiplier: 1.18 + amount * 0.14,
      minimumForwardSpeed: 22 + amount * 4,
      durationMs: GIANT_LOW_DASH_DURATION_MS,
    };
  }
  if (angle < 50) {
    const amount = (angle - 30) / 20;
    return {
      outcome: "long-jump",
      angle,
      height: 1.25 + amount * 2.15,
      forwardSpeedMultiplier: 1.12 - amount * 0.12,
      minimumForwardSpeed: 0,
      durationMs: 0,
    };
  }
  if (angle < 70) {
    const amount = (angle - 50) / 20;
    return {
      outcome: "high-jump",
      angle,
      height: 3.4 + amount * 2.9,
      forwardSpeedMultiplier: 0.92 - amount * 0.3,
      minimumForwardSpeed: 0,
      durationMs: 0,
    };
  }
  return { outcome: "overcharge", angle, height: 0, forwardSpeedMultiplier: 1, minimumForwardSpeed: 0, durationMs: 0 };
};

export const isApproachingRoad = ({ airVerticalVelocity, surfaceVerticalVelocity, tolerance = 0.05 }) => (
  airVerticalVelocity - surfaceVerticalVelocity <= tolerance
);

export const freeDriveSpeedCap = ({
  airborne,
  onRoad,
  currentSpeed,
  roadSpeedCap,
  offRoadSpeedCap,
}) => (
  airborne
    ? Math.max(roadSpeedCap, Math.abs(currentSpeed))
    : onRoad
      ? roadSpeedCap
      : offRoadSpeedCap
);

export const updateBelowCourseRecovery = ({
  now,
  altitude,
  lowestRoadHeight,
  belowCourseSince,
  delayMs = 2000,
}) => {
  if (altitude >= lowestRoadHeight) {
    return { belowCourseSince: null, shouldRecover: false };
  }
  const startedAt = belowCourseSince ?? now;
  return {
    belowCourseSince: startedAt,
    shouldRecover: now - startedAt >= delayMs,
  };
};

export const isWithinRoadFootprint = ({
  surfaceDistance,
  lane,
  roadHalfWidth,
  contactMargin = 0.35,
  kartHalfWidth = 0,
  minimumKartOverlapFraction = 0,
}) => (
  // With a kart width, allow landing until the actual lateral overlap falls
  // below the requested fraction. For a 20% overlap this is stricter than a
  // visual touch, but wide enough to catch a wheel/side of the chassis.
  Number.isFinite(surfaceDistance)
  && surfaceDistance <= roadHalfWidth + (
    kartHalfWidth > 0
      ? kartHalfWidth * (1 - 2 * minimumKartOverlapFraction)
      : contactMargin
  )
  && Math.abs(lane) <= roadHalfWidth + (
    kartHalfWidth > 0
      ? kartHalfWidth * (1 - 2 * minimumKartOverlapFraction)
      : contactMargin
  )
);

export const hasFullyClearedGuardrail = ({
  lane,
  guardrailLane,
  kartHalfWidth,
}) => Math.abs(lane) - kartHalfWidth > guardrailLane;

export const overlapsGuardrailByFraction = ({
  lane,
  guardrailLane,
  kartHalfWidth,
  minimumKartOverlapFraction = 0.2,
}) => {
  if (
    !Number.isFinite(lane)
    || !Number.isFinite(guardrailLane)
    || !Number.isFinite(kartHalfWidth)
    || kartHalfWidth <= 0
  ) return false;
  const kartWidth = kartHalfWidth * 2;
  const requiredOverlap = kartWidth * Math.max(0, Math.min(0.5, minimumKartOverlapFraction));
  const overlapAcrossRail = kartHalfWidth - Math.abs(Math.abs(lane) - Math.abs(guardrailLane));
  return overlapAcrossRail + 1e-9 >= requiredOverlap;
};
