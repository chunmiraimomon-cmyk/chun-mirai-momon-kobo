export const CUP_MEDAL_PRIORITY = Object.freeze({ bronze: 1, silver: 2, gold: 3 });

export function cupStandingOrder(scores, lastOrder) {
  const finishOrder = Array.isArray(lastOrder) ? lastOrder : [];
  return scores
    .map((_, actorId) => actorId)
    .sort((a, b) => (
      (Number(scores[b]) || 0) - (Number(scores[a]) || 0)
      || finishOrder.indexOf(a) - finishOrder.indexOf(b)
    ));
}

export function cupMedalForRank(rank) {
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return null;
}

export function strongestCupMedal(current, candidate) {
  if (!candidate || !(candidate in CUP_MEDAL_PRIORITY)) return current ?? null;
  if (!current || !(current in CUP_MEDAL_PRIORITY)) return candidate;
  return CUP_MEDAL_PRIORITY[candidate] > CUP_MEDAL_PRIORITY[current] ? candidate : current;
}

export function normalizeCupMedalCabinet(value, legacyMedal = null) {
  const source = value && typeof value === "object" ? value : {};
  const cabinet = {
    gold: source.gold === true,
    silver: source.silver === true,
    bronze: source.bronze === true,
  };
  if (legacyMedal && legacyMedal in cabinet) cabinet[legacyMedal] = true;
  return cabinet;
}

export function recordCupMedal(cabinet, medal) {
  const next = normalizeCupMedalCabinet(cabinet);
  if (medal && medal in next) next[medal] = true;
  return next;
}
