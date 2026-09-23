import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { finished } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export function createR2Store(config) {
  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  const warming = new Set();
  let legacyIndexPromise = null;

  async function head(id) {
    return headKey(keyFor(id, config.prefix));
  }

  async function headKey(key) {
    try {
      const result = await client.send(
        new HeadObjectCommand({
          Bucket: config.bucket,
          Key: key,
        })
      );
      return {
        key,
        size: Number(result.ContentLength) || 0,
        mimeType: result.ContentType || "audio/mpeg",
        fileName: result.Metadata?.filename || fileNameFromKey(key),
        etag: result.ETag,
      };
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw error;
    }
  }

  async function getRange(key, start, end) {
    const result = await client.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Range: `bytes=${start}-${end}`,
      })
    );
    return {
      body: result.Body,
      mimeType: result.ContentType || "audio/mpeg",
      fileName: result.Metadata?.filename || fileNameFromKey(key),
      etag: result.ETag,
    };
  }

  async function findObject(track) {
    const canonicalKey = keyFor(track.messageId, config.prefix);
    const canonical = await headKey(canonicalKey);
    if (canonical) return canonical;

    const legacyKey = await findLegacyKey(track);
    if (!legacyKey || legacyKey === canonicalKey) return null;

    return headKey(legacyKey);
  }

  async function warmFromTelegram(track, telegram) {
    const id = String(track.messageId);
    if (warming.has(id)) return false;
    warming.add(id);

    try {
      if (await head(id)) return true;
      const legacy = await findObject(track);
      if (legacy) return true;
      await uploadFromTelegram(track, telegram, { ...config, client });
      return true;
    } finally {
      warming.delete(id);
    }
  }

  return {
    enabled: true,
    head,
    findObject,
    getRange,
    warmFromTelegram,
    keyFor: (id) => keyFor(id, config.prefix),
  };

  async function findLegacyKey(track) {
    if (!legacyIndexPromise) legacyIndexPromise = buildLegacyIndex();
    const index = await legacyIndexPromise;
    const candidates = legacyCandidates(track);
    return candidates.map((candidate) => index.get(candidate)).find(Boolean) || null;
  }

  async function buildLegacyIndex() {
    const index = new Map();
    let token;

    do {
      const result = await client.send(
        new ListObjectsV2Command({
          Bucket: config.bucket,
          ContinuationToken: token,
        })
      );

      for (const item of result.Contents || []) {
        const key = item.Key;
        if (!key || key.startsWith(`${config.prefix}/`)) continue;
        for (const candidate of keyCandidates(key)) {
          if (!index.has(candidate)) index.set(candidate, key);
        }
      }

      token = result.NextContinuationToken;
    } while (token);

    return index;
  }
}

async function uploadFromTelegram(track, telegram, config) {
  const id = String(track.messageId);
  const size = Number(track.fileSize) || 0;
  if (!size) throw new Error(`Cannot warm R2 cache for ${id}; missing file size.`);

  const tempPath = path.join(os.tmpdir(), `graceedge-${id}-${randomUUID()}.audio`);
  const out = fs.createWriteStream(tempPath);

  try {
    await telegram.streamAudioRange(id, 0, size - 1, size, async (chunk) => {
      if (!out.write(chunk)) await onceDrain(out);
    });
    out.end();
    await finished(out);
    const fileSize = fs.statSync(tempPath).size;
    if (fileSize !== size) {
      throw new Error(`Telegram stream ended at ${fileSize} bytes, expected ${size}.`);
    }

    await config.client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: keyFor(id, config.prefix),
        Body: fs.createReadStream(tempPath),
        ContentLength: fileSize,
        ContentType: track.mimeType || "audio/mpeg",
        Metadata: {
          filename: safeMetadataValue(track.fileName || `${id}.mp3`),
          "telegram-message-id": id,
        },
      })
    );
  } finally {
    out.destroy();
    try {
      fs.unlinkSync(tempPath);
    } catch {}
  }
}

function keyFor(id, prefix = "") {
  const cleanPrefix = prefix ? `${String(prefix).replace(/^\/+|\/+$/g, "")}/` : "";
  return `${cleanPrefix}${String(id)}.mp3`;
}

function fileNameFromKey(key) {
  return (
    String(key || "")
      .split("/")
      .pop() || "audio.mp3"
  );
}

function keyCandidates(key) {
  const fileName = fileNameFromKey(key).replace(/\.[^.]+$/, "");
  const withoutTimestamp = fileName.replace(/^\d+[-_]+/, "");
  return [fileName, withoutTimestamp].map(normalizeKey).filter(Boolean);
}

function legacyCandidates(track) {
  return [
    track.fileName,
    String(track.fileName || "").replace(/\.[^.]+$/, ""),
    track.title,
    safeName(track.title),
    safeName(track.fileName),
  ]
    .map(normalizeKey)
    .filter(Boolean);
}

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function safeName(value) {
  return String(value || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-|-$/g, "");
}

function isMissingObject(error) {
  const status = error?.$metadata?.httpStatusCode;
  return status === 404 || error?.name === "NotFound" || error?.Code === "NoSuchKey";
}

function safeMetadataValue(value) {
  return String(value || "")
    .replace(/[^\x20-\x7E]/g, "_")
    .slice(0, 512);
}

function onceDrain(stream) {
  return new Promise((resolve, reject) => {
    stream.once("drain", resolve);
    stream.once("error", reject);
  });
}
