import { env, envFlag, envNumber, requiredEnv } from "./env.js";

export function loadConfig() {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const supabaseKey = env("SUPABASE_SERVICE_ROLE_KEY") || requiredEnv("SUPABASE_KEY");
  const telegramChannel = requiredEnv("TELEGRAM_CHANNEL");
  const publicUrl = env("PUBLIC_URL", "").replace(/\/+$/, "");

  return {
    port: envNumber("PORT", 3000),
    publicUrl,
    supabaseUrl,
    supabaseKey,
    r2: r2Config(),
    telegram: {
      apiId: envNumber("TELEGRAM_API_ID"),
      apiHash: requiredEnv("TELEGRAM_API_HASH"),
      session: requiredEnv("TELEGRAM_STRING_SESSION"),
      channel: telegramChannel,
      publicChannelUrl: channelUrl(telegramChannel, env("TELEGRAM_PUBLIC_CHANNEL_URL")),
      backfillOnStart: env("TELEGRAM_BACKFILL_ON_START", "auto"),
      backfillBatchPauseMs: envNumber("TELEGRAM_BACKFILL_BATCH_PAUSE_MS", 850),
      backfillBatchSize: envNumber("TELEGRAM_BACKFILL_BATCH_SIZE", 100),
    },
    audio: {
      memoryCacheMb: envNumber("AUDIO_MEMORY_CACHE_MB", 256),
    },
    enableUploadApi: envFlag("ENABLE_R2_UPLOAD_API", false),
  };
}

function r2Config() {
  const accountId = requiredEnv("R2_ACCOUNT_ID");
  const bucket = requiredAnyEnv("R2_BUCKET", "R2_BUCKET_NAME");
  const accessKeyId = requiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv("R2_SECRET_ACCESS_KEY");
  const endpoint = env("R2_ENDPOINT", `https://${accountId}.r2.cloudflarestorage.com`);

  return {
    enabled: true,
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    prefix: env("R2_AUDIO_PREFIX", ""),
  };
}

function requiredAnyEnv(...names) {
  for (const name of names) {
    const value = env(name);
    if (value) return value;
  }
  throw new Error(`Missing required environment variable: ${names.join(" or ")}`);
}

function channelUrl(channel, explicit) {
  if (explicit) return explicit.replace(/\/+$/, "");
  if (/^https?:\/\//i.test(channel)) return channel.replace(/\/+$/, "");
  if (channel.startsWith("@")) return `https://t.me/${channel.slice(1)}`;
  if (/^[a-zA-Z0-9_]+$/.test(channel)) return `https://t.me/${channel}`;
  return "";
}
