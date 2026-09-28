import { createAudioCache } from "./audio-cache.js";
import { loadConfig } from "./config.js";
import { createHttpServer } from "./http-server.js";
import { createR2Store } from "./r2-store.js";
import { createTelegramService } from "./telegram-service.js";
import { createTrackCache } from "./track-cache.js";
import { createTrackStore } from "./track-store.js";

async function main() {
  const config = loadConfig();
  const store = createTrackStore(config);
  const cache = createTrackCache();
  const audioCache = createAudioCache(config.audio.memoryCacheMb);
  const r2Store = createR2Store(config.r2);
  const telegram = createTelegramService(config, store, cache, audioCache);

  console.log("[startup] loading tracks from Supabase");
  cache.load(await store.listTracks());
  console.log(`[startup] loaded ${cache.size()} track(s) into memory`);

  console.log("[startup] connecting to Telegram");
  await telegram.connect();

  if (shouldBackfill(config.telegram.backfillOnStart, cache.size())) {
    console.log("[startup] running initial channel backfill");
    const result = await telegram.backfill({ all: true });
    console.log(`[startup] backfill scanned ${result.seen}, saved ${result.saved}`);
  }

  console.log("[startup] catching up since latest indexed message");
  const catchup = await telegram.catchUp();
  console.log(`[startup] catch-up scanned ${catchup.seen}, saved ${catchup.saved}`);

  telegram.listen();
  console.log("[startup] live Telegram listener is running");
  startCatchUpLoop(telegram, config.telegram.catchUpIntervalMs);
  console.log("[startup] R2 audio cache is enabled");

  const server = createHttpServer(config, cache, telegram, r2Store);
  server.listen(config.port, () => {
    console.log(`[startup] web server listening on http://localhost:${config.port}`);
  });
}

function shouldBackfill(value, cacheSize) {
  if (value === "auto") return cacheSize === 0;
  return /^(1|true|yes|on)$/i.test(value);
}

function startCatchUpLoop(telegram, intervalMs) {
  if (!intervalMs || intervalMs < 30000) {
    console.log("[startup] periodic Telegram catch-up is disabled");
    return;
  }

  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await telegram.ensureConnected();
      const result = await telegram.catchUp();
      if (result.seen || result.saved) {
        console.log(`[telegram] periodic catch-up scanned ${result.seen}, saved ${result.saved}`);
      }
    } catch (error) {
      console.error("[telegram] periodic catch-up failed", error);
      try {
        console.warn("[telegram] reconnecting after catch-up failure");
        await telegram.reconnect();
        console.log("[telegram] reconnected and reattached live listener");
      } catch (reconnectError) {
        console.error("[telegram] reconnect failed", reconnectError);
      }
    } finally {
      running = false;
    }
  }, intervalMs).unref();

  console.log(`[startup] periodic Telegram catch-up every ${Math.round(intervalMs / 1000)}s`);
}

main().catch((error) => {
  console.error("[startup] failed", error);
  process.exit(1);
});
