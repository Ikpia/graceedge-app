import { buildCategoryCounts, categoriesForTrack, normalizeCategory } from "./categories.js";

export function createTrackCache() {
  let tracks = [];
  let indexedTracks = [];
  let categoryCounts = [];
  const byId = new Map();

  function replace(next) {
    tracks = next.map(withCategories).sort(sortNewest);
    indexedTracks = tracks.map((track) => ({
      track,
      searchText: normalizeSearch(
        [
          track.messageId,
          track.title,
          track.caption,
          track.fileName,
          track.postedAt,
          (track.topics || []).join(" "),
        ].join(" ")
      ),
      topicKeys: new Set((track.topics || []).map(normalizeCategory)),
    }));
    categoryCounts = buildCategoryCounts(tracks);
    byId.clear();
    for (const track of tracks) byId.set(String(track.messageId), track);
  }

  function upsert(track) {
    byId.set(String(track.messageId), track);
    replace(Array.from(byId.values()));
  }

  return {
    load: replace,
    upsert,
    list: () => tracks,
    page: ({ q = "", topic = "", cursor = 0, limit = 24 } = {}) => {
      const start = clampCursor(cursor);
      const size = clampLimit(limit);
      const terms = normalizeSearch(q).split(" ").filter(Boolean);
      const topicKey = normalizeCategory(topic);
      const pool = indexedTracks.filter(
        ({ searchText, topicKeys }) =>
          (!topicKey || topicKeys.has(topicKey)) &&
          (!terms.length || terms.every((term) => searchText.includes(term)))
      );
      const items = pool.slice(start, start + size).map(({ track }) => track);
      const nextCursor = start + items.length < pool.length ? String(start + items.length) : null;

      return {
        items,
        nextCursor,
        total: pool.length,
      };
    },
    get: (id) => byId.get(String(id)) || null,
    topics: () => categoryCounts,
    size: () => tracks.length,
    latestMessageId: () => tracks.reduce((max, t) => Math.max(max, Number(t.messageId) || 0), 0),
  };
}

function withCategories(track) {
  const topics =
    Array.isArray(track.topics) && track.topics.length ? track.topics : categoriesForTrack(track);
  return { ...track, topics };
}

function sortNewest(a, b) {
  const ad = Date.parse(a.postedAt || "") || 0;
  const bd = Date.parse(b.postedAt || "") || 0;
  if (ad !== bd) return bd - ad;
  return Number(b.messageId) - Number(a.messageId);
}

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function clampCursor(value) {
  const cursor = Number(value);
  if (!Number.isFinite(cursor) || cursor < 0) return 0;
  return Math.floor(cursor);
}

function clampLimit(value) {
  const limit = Number(value);
  if (!Number.isFinite(limit)) return 24;
  return Math.max(1, Math.min(100, Math.floor(limit)));
}
