import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import bigInt from "big-integer";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createTelegramService(config, store, cache, audioCache) {
  const session = new StringSession(config.telegram.session);
  const client = new TelegramClient(session, config.telegram.apiId, config.telegram.apiHash, {
    connectionRetries: 5,
  });

  let channelEntity = null;

  async function connect() {
    await client.connect();
    if (!(await client.isUserAuthorized())) {
      throw new Error(
        "Telegram session is not authorized. Run npm run telegram:login from the backend folder and save TELEGRAM_STRING_SESSION."
      );
    }
    channelEntity = await client.getEntity(config.telegram.channel);
    return channelEntity;
  }

  async function indexMessage(message) {
    const track = messageToTrack(message, config.telegram.publicChannelUrl);
    if (!track) return null;
    const saved = await store.upsertTrack(track);
    cache.upsert(saved);
    return saved;
  }

  async function backfill({ minId = 0, all = false } = {}) {
    let seen = 0;
    let saved = 0;

    for await (const message of client.iterMessages(channelEntity || config.telegram.channel, {
      limit: undefined,
      minId,
      reverse: true,
      waitTime: 1,
    })) {
      seen += 1;
      const track = await indexMessage(message);
      if (track) saved += 1;
      if (all && seen % config.telegram.backfillBatchSize === 0) {
        await sleep(config.telegram.backfillBatchPauseMs);
      }
    }

    return { seen, saved };
  }

  async function catchUp() {
    const minId = Math.max(cache.latestMessageId(), await store.latestMessageId());
    return backfill({ minId });
  }

  function listen() {
    client.addEventHandler(
      async (event) => {
        try {
          await indexMessage(event.message);
        } catch (error) {
          console.error("[telegram] could not index live message", error);
        }
      },
      new NewMessage({ chats: [config.telegram.channel] })
    );
  }

  async function getAudioBuffer(messageId) {
    const cached = audioCache.get(messageId);
    if (cached) return cached;

    const message = await getMessage(Number(messageId));
    const track = messageToTrack(message, config.telegram.publicChannelUrl);
    if (!track) throw new Error("Telegram message is not an audio file.");

    const buffer = await client.downloadMedia(message, {});
    if (!Buffer.isBuffer(buffer) || !buffer.length) {
      throw new Error("Telegram returned an empty audio file.");
    }

    return audioCache.set(messageId, {
      buffer,
      mimeType: track.mimeType,
      fileName: track.fileName,
      total: buffer.length,
    });
  }

  async function getAudioRange(messageId, start, end, knownTotal) {
    const cached = audioCache.get(messageId);
    if (cached) {
      return {
        buffer: cached.buffer.subarray(start, end + 1),
        mimeType: cached.mimeType,
        fileName: cached.fileName,
        total: cached.total || cached.buffer.length,
      };
    }

    const message = await getMessage(Number(messageId));
    const track = messageToTrack(message, config.telegram.publicChannelUrl);
    if (!track) throw new Error("Telegram message is not an audio file.");

    const total = knownTotal || track.fileSize;
    const requestSize = 512 * 1024;
    const wanted = end - start + 1;
    const limit = Math.ceil(wanted / requestSize) || 1;
    const chunks = [];
    let downloaded = 0;

    for await (const chunk of client.iterDownload({
      file: message.media || message.document,
      offset: bigInt(start),
      limit,
      requestSize,
      chunkSize: requestSize,
      fileSize: total ? bigInt(total) : undefined,
      msgData: [channelEntity || config.telegram.channel, Number(messageId)],
    })) {
      chunks.push(chunk);
      downloaded += chunk.length;
      if (downloaded >= wanted) break;
    }

    const buffer = Buffer.concat(chunks).subarray(0, wanted);
    if (!buffer.length) throw new Error("Telegram returned an empty audio range.");

    return {
      buffer,
      mimeType: track.mimeType,
      fileName: track.fileName,
      total: total || start + buffer.length,
    };
  }

  async function streamAudioRange(messageId, start, end, knownTotal, onChunk) {
    const cached = audioCache.get(messageId);
    if (cached) {
      const chunk = cached.buffer.subarray(start, end + 1);
      if (!chunk.length) throw new Error("Cached audio range is empty.");
      await onChunk(chunk);
      return;
    }

    const message = await getMessage(Number(messageId));
    const track = messageToTrack(message, config.telegram.publicChannelUrl);
    if (!track) throw new Error("Telegram message is not an audio file.");

    const total = knownTotal || track.fileSize;
    const requestSize = 512 * 1024;
    const wanted = end - start + 1;
    const limit = Math.ceil(wanted / requestSize) || 1;
    let remaining = wanted;
    let sent = 0;

    for await (const chunk of client.iterDownload({
      file: message.media || message.document,
      offset: bigInt(start),
      limit,
      requestSize,
      chunkSize: requestSize,
      fileSize: total ? bigInt(total) : undefined,
      msgData: [channelEntity || config.telegram.channel, Number(messageId)],
    })) {
      const next = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
      if (!next.length) continue;
      await onChunk(next);
      sent += next.length;
      remaining -= next.length;
      if (remaining <= 0) break;
    }

    if (!sent) throw new Error("Telegram returned an empty audio stream.");
  }

  async function getMessage(id) {
    const result = await client.getMessages(channelEntity || config.telegram.channel, { ids: id });
    if (Array.isArray(result)) return result[0];
    if (result && typeof result.length === "number") return result[0];
    return result;
  }

  return {
    connect,
    backfill,
    catchUp,
    listen,
    getAudioBuffer,
    getAudioRange,
    streamAudioRange,
    messageToTrack: (message) => messageToTrack(message, config.telegram.publicChannelUrl),
  };
}

export function messageToTrack(message, publicChannelUrl = "") {
  if (!message || !message.id) return null;

  const document = message.document || message.media?.document;
  if (!document) return null;

  const attrs = document.attributes || [];
  const audio = attrs.find((attr) => attr.className === "DocumentAttributeAudio");
  const fileNameAttr = attrs.find((attr) => attr.className === "DocumentAttributeFilename");
  const mimeType = document.mimeType || "";

  if (!audio && !mimeType.toLowerCase().startsWith("audio/")) return null;

  const caption = message.message || "";
  const fallbackTitle = firstLine(caption) || fileNameAttr?.fileName || `Audio ${message.id}`;
  const title = audio?.title || fileNameAttr?.fileName || fallbackTitle;
  const postedAt = new Date(toNumber(message.date) * 1000).toISOString();
  const url = publicChannelUrl ? `${publicChannelUrl.replace(/\/+$/, "")}/${message.id}` : null;

  return {
    id: String(message.id),
    messageId: Number(message.id),
    title: String(title).trim(),
    duration: toNumber(audio?.duration) || null,
    caption,
    postedAt,
    telegramUrl: url,
    mimeType: mimeType || "audio/mpeg",
    fileName: fileNameAttr?.fileName || safeFileName(title),
    fileSize: toNumber(document.size) || null,
  };
}

function firstLine(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

function safeFileName(title) {
  return `${String(title || "audio")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-|-$/g, "")}.mp3`;
}

function toNumber(value) {
  if (value === undefined || value === null) return 0;
  if (typeof value === "number") return value;
  if (typeof value.toNumber === "function") return value.toNumber();
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export { Api };
