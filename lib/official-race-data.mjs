export const OFFICIAL_STAFF_GHOST_URLS = Object.freeze({
  city: "/data/staff-ghosts/city.json",
  jungle: "/data/staff-ghosts/jungle.json",
  starlight: "/data/staff-ghosts/starlight.json?v=1787477340736",
  river: "/data/staff-ghosts/river.json",
  pirate: "/data/staff-ghosts/pirate.json",
  cloud: "/data/staff-ghosts/cloud.json",
});

export const OFFICIAL_GOJO_LINE_URLS = Object.freeze({
  city: "/data/gojo-lines/city.json?v=1787981669170",
  jungle: "/data/gojo-lines/jungle.json?v=1787981769898",
  starlight: "/data/gojo-lines/starlight.json?v=1787477215687",
  river: "/data/gojo-lines/river.json?v=1787981838194",
  pirate: "/data/gojo-lines/pirate.json?v=1787981915281",
  cloud: "/data/gojo-lines/cloud.json",
});

const finiteTuple = (sample, length) => (
  Array.isArray(sample)
  && sample.length >= length
  && sample.slice(0, length).every(Number.isFinite)
);

export function isOfficialStaffGhost(record, expectedCourseId) {
  return Boolean(
    record
    && record.version === 1
    && record.courseId === expectedCourseId
    && record.kind === "staff"
    && typeof record.character === "string"
    && Number.isFinite(record.timeMs)
    && record.timeMs > 0
    && Number.isFinite(record.createdAt)
    && Array.isArray(record.samples)
    && record.samples.length > 1
    && record.samples.every((sample) => finiteTuple(sample, 7)),
  );
}

export function isOfficialGojoLine(record, expectedCourseId) {
  return Boolean(
    record
    && record.version === 1
    && record.courseId === expectedCourseId
    && Number.isFinite(record.createdAt)
    && Array.isArray(record.samples)
    && record.samples.length > 1
    && record.samples.every((sample) => finiteTuple(sample, 3)),
  );
}

async function loadRecordMap(urls, validator, fetcher) {
  const entries = await Promise.all(Object.entries(urls).map(async ([courseId, url]) => {
    try {
      const response = await fetcher(url, { cache: "no-cache" });
      if (!response.ok) return null;
      const record = await response.json();
      return validator(record, courseId) ? [courseId, record] : null;
    } catch {
      return null;
    }
  }));
  return Object.fromEntries(entries.filter(Boolean));
}

export async function loadOfficialRaceData(fetcher = globalThis.fetch) {
  const [staff, gojoLines] = await Promise.all([
    loadRecordMap(OFFICIAL_STAFF_GHOST_URLS, isOfficialStaffGhost, fetcher),
    loadRecordMap(OFFICIAL_GOJO_LINE_URLS, isOfficialGojoLine, fetcher),
  ]);
  return { staff, gojoLines };
}

export function mergeNewestRaceRecords(stored = {}, official = {}) {
  const merged = { ...stored };
  for (const [courseId, record] of Object.entries(official)) {
    const current = merged[courseId];
    if (!current || Number(current.createdAt) <= Number(record.createdAt)) merged[courseId] = record;
  }
  return merged;
}

export function overlayOfficialRaceRecords(stored = {}, official = {}) {
  return { ...stored, ...official };
}
