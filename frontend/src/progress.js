/**
 * Remembers what a listener has heard and where they stopped.
 *
 * All of this lives in the browser on their own phone. Nothing is sent to
 * the database and nobody at the church can see it. If they clear their
 * browser data it goes, which is fine.
 *
 * Two things are kept:
 *   positions   how many seconds into each message they got
 *   played      the ids of messages they finished
 */

const POS_KEY = "graceedge:positions";
const PLAYED_KEY = "graceedge:played";

/* Under this many seconds we treat it as "they only just started" and send
   them back to the beginning rather than offering a resume. */
const MIN_RESUME = 25;

/* Within this much of the end, count it as done and start over next time. */
const END_SLACK = 30;

/* Counted as heard once they have listened this far through. */
const HEARD_AT = 0.9;

/* Only keep the most recent messages, so this cannot grow forever. */
const KEEP = 120;

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

export function loadPositions() {
  const v = read(POS_KEY, {});
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

export function loadPlayed() {
  const v = read(PLAYED_KEY, []);
  return new Set(Array.isArray(v) ? v : []);
}

export function savePositions(map) {
  const ids = Object.keys(map);
  if (ids.length > KEEP) {
    const trimmed = {};
    for (const id of ids.slice(-KEEP)) trimmed[id] = map[id];
    write(POS_KEY, trimmed);
    return;
  }
  write(POS_KEY, map);
}

export function savePlayed(set) {
  write(PLAYED_KEY, Array.from(set).slice(-KEEP));
}

/** Where to drop the needle for this message. Zero means start at the top. */
export function resumeAt(positions, id, duration) {
  const at = positions[id];
  if (!at || at < MIN_RESUME) return 0;
  if (duration && at > duration - END_SLACK) return 0;
  return at;
}

/** How far through, 0 to 1. Used for the little line under a part. */
export function fractionDone(positions, id, duration) {
  const at = positions[id];
  if (!at || !duration) return 0;
  return Math.max(0, Math.min(1, at / duration));
}

export const isHeardEnough = (pos, dur) => Boolean(dur) && pos / dur >= HEARD_AT;
