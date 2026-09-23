export function createAudioCache(maxMb) {
  const maxBytes = Math.max(16, maxMb || 256) * 1024 * 1024;
  const entries = new Map();
  let used = 0;

  function touch(id, entry) {
    entries.delete(id);
    entries.set(id, { ...entry, usedAt: Date.now() });
  }

  function trim() {
    while (used > maxBytes && entries.size) {
      const [id, entry] = entries.entries().next().value;
      entries.delete(id);
      used -= entry.buffer.length;
    }
  }

  return {
    get(id) {
      const entry = entries.get(String(id));
      if (!entry) return null;
      touch(String(id), entry);
      return entry;
    },

    set(id, entry) {
      const key = String(id);
      const old = entries.get(key);
      if (old) used -= old.buffer.length;
      used += entry.buffer.length;
      touch(key, entry);
      trim();
      return entries.get(key);
    },

    clear() {
      entries.clear();
      used = 0;
    },
  };
}
