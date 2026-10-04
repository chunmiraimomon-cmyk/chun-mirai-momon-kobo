export const PERSONAL_GHOST_LIMIT = 5;

const isPersonalGhostRecord = (record, courseId) => Boolean(
  record
  && record.version === 1
  && record.courseId === courseId
  && record.kind === "personal"
  && Number.isFinite(record.timeMs)
  && record.timeMs > 0
  && Number.isFinite(record.createdAt)
  && Array.isArray(record.samples),
);

const sortPersonalGhosts = (records) => [...records].sort((a, b) => (
  a.timeMs - b.timeMs || a.createdAt - b.createdAt
));

export function normalizePersonalGhostStore(value, limit = PERSONAL_GHOST_LIMIT) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const normalized = {};
  for (const [courseId, stored] of Object.entries(value)) {
    const candidates = Array.isArray(stored) ? stored : [stored];
    const records = sortPersonalGhosts(candidates.filter((record) => isPersonalGhostRecord(record, courseId))).slice(0, limit);
    if (records.length) normalized[courseId] = records;
  }
  return normalized;
}

export function insertPersonalGhostRecord(records, record, limit = PERSONAL_GHOST_LIMIT) {
  const ranked = sortPersonalGhosts([...(Array.isArray(records) ? records : []), record]).slice(0, limit);
  const index = ranked.indexOf(record);
  return {
    records: ranked,
    rank: index >= 0 ? index + 1 : null,
  };
}
