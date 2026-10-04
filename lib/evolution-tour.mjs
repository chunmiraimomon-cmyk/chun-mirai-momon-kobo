export const EVOLUTION_LAPS_PER_CHAPTER = 3;

export const EVOLUTION_UNLOCK_STAGE = Object.freeze({
  items: 2,
  drift: 4,
  skills: 8,
});

export function evolutionStageFor(chapterIndex, progress) {
  const safeChapter = Math.max(0, Math.min(3, Math.trunc(Number(chapterIndex) || 0)));
  const localLap = Math.max(0, Math.min(EVOLUTION_LAPS_PER_CHAPTER - 1, Math.floor(Math.max(0, Number(progress) || 0))));
  return safeChapter * EVOLUTION_LAPS_PER_CHAPTER + localLap;
}

export function evolutionFeatureState(stage) {
  const safeStage = Math.max(0, Math.trunc(Number(stage) || 0));
  return {
    items: safeStage >= EVOLUTION_UNLOCK_STAGE.items,
    drift: safeStage >= EVOLUTION_UNLOCK_STAGE.drift,
    skills: safeStage >= EVOLUTION_UNLOCK_STAGE.skills,
  };
}

