import { createAudioCache } from "./audio-cache.js";
import { loadConfig } from "./config.js";
import { createTelegramService } from "./telegram-service.js";
import { createTrackCache } from "./track-cache.js";
import { createTrackStore } from "./track-store.js";

async function main() {
  const config = loadConfig();
  const store = createTrackStore(config);
  const cache = createTrackCache();
  const audioCache = createAudioCache(config.audio.memoryCacheMb);
  const telegram = createTelegramService(config, store, cache, audioCache);

  cache.load(await store.listTracks());
  await telegram.connect();

  console.log("[backfill] walking the full channel history");
  const result = await telegram.backfill({ all: true });
  console.log(`[backfill] scanned ${result.seen}, saved ${result.saved}`);
}

main().catch((error) => {
  console.error("[backfill] failed", error);
  process.exit(1);
});
