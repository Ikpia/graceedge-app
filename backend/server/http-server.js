import { once } from "node:events";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { pipeline } from "node:stream";
import { pipeline as pump } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(serverDir, "../../frontend/dist");

export function createHttpServer(config, cache, telegram, r2Store) {
  if (!r2Store?.enabled) {
    throw new Error("R2 audio cache is required for the streaming server.");
  }

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
      const isApi = url.pathname.startsWith("/api/");

      if (isApi && request.method === "OPTIONS") {
        return sendCorsPreflight(response);
      }

      if (url.pathname === "/health") {
        return sendJson(response, { ok: true, tracks: cache.size() });
      }

      if (url.pathname === "/api/tracks") {
        const page = cache.page({
          q: url.searchParams.get("q") || "",
          topic: url.searchParams.get("topic") || "",
          cursor: url.searchParams.get("cursor") || 0,
          limit: url.searchParams.get("limit") || 24,
        });
        return sendJson(response, { tracks: page.items, topics: cache.topics(), ...page }, 200, {
          "cache-control": "public, max-age=60",
        });
      }

      if (url.pathname === "/api/topics") {
        return sendJson(response, { topics: cache.topics() }, 200, {
          "cache-control": "public, max-age=60",
        });
      }

      if (url.pathname.startsWith("/api/tracks/")) {
        const id = decodeURIComponent(url.pathname.slice("/api/tracks/".length));
        if (!/^\d+$/.test(id)) return sendText(response, "Not found", 404);
        const track = cache.get(id);
        if (!track) return sendText(response, "Not found", 404);
        return sendJson(response, { track }, 200, {
          "cache-control": "public, max-age=60",
        });
      }

      if (url.pathname.startsWith("/api/audio/")) {
        const id = decodeURIComponent(url.pathname.slice("/api/audio/".length));
        return sendAudio(request, response, id, cache, telegram, r2Store);
      }

      return serveStatic(request, response, url.pathname);
    } catch (error) {
      console.error("[http]", error);
      return sendJson(response, { error: "Internal server error" }, 500);
    }
  });
}

async function sendAudio(request, response, id, cache, telegram, r2Store) {
  if (!/^\d+$/.test(id)) return sendText(response, "Not found", 404);
  if (request.method !== "GET" && request.method !== "HEAD") {
    return sendText(response, "Use GET", 405);
  }

  const track = cache.get(id);
  if (!track) return sendText(response, "Not found", 404);

  const knownTotal = Number(track.fileSize) || 0;
  if (!knownTotal) {
    return sendText(response, "Audio metadata is missing its file size.", 503);
  }

  const range = parseRange(request.headers.range, knownTotal);
  if (range.invalid) return sendRangeNotSatisfiable(response, knownTotal);

  const servedFromR2 = await trySendAudioFromR2(request, response, id, track, range, r2Store);
  if (servedFromR2) return undefined;
  if (request.method === "GET") warmR2Audio(track, telegram, r2Store);

  const size = range.end - range.start + 1;
  response.writeHead(
    range.partial ? 206 : 200,
    audioHeaders({
      size,
      total: knownTotal,
      start: range.start,
      end: range.end,
      mimeType: track.mimeType,
      fileName: track.fileName || `${id}.mp3`,
      partial: range.partial,
    })
  );

  if (request.method === "HEAD") {
    return response.end();
  }

  try {
    await telegram.streamAudioRange(id, range.start, range.end, knownTotal, async (chunk) => {
      const ok = await writeResponseChunk(response, chunk);
      if (!ok) throw new Error("Audio client disconnected.");
    });
    if (!response.destroyed) response.end();
  } catch (error) {
    if (!response.destroyed) response.destroy(error);
  }
}

async function trySendAudioFromR2(request, response, id, track, range, r2Store) {
  let object;
  try {
    object = await r2Store.findObject(track);
  } catch (error) {
    console.error(`[r2] head failed for ${id}`, error);
    return false;
  }

  if (!object) return false;

  const total = object.size || Number(track.fileSize) || 0;
  if (!total || range.start >= total) return false;
  const objectRange = clampRangeToTotal(range, total);
  const size = objectRange.end - objectRange.start + 1;
  response.writeHead(
    objectRange.partial ? 206 : 200,
    audioHeaders({
      size,
      total,
      start: objectRange.start,
      end: objectRange.end,
      mimeType: object.mimeType || track.mimeType,
      fileName: object.fileName || track.fileName || `${id}.mp3`,
      etag: object.etag,
      cacheSource: "r2",
      partial: objectRange.partial,
    })
  );

  if (request.method === "HEAD") {
    response.end();
    return true;
  }

  try {
    const audio = await r2Store.getRange(object.key, objectRange.start, objectRange.end);
    if (!audio?.body) throw new Error("R2 returned an empty audio body.");
    await pump(audio.body, response);
  } catch (error) {
    if (!response.destroyed) response.destroy(error);
  }
  return true;
}

function warmR2Audio(track, telegram, r2Store) {
  r2Store
    .warmFromTelegram(track, telegram)
    .then((saved) => {
      if (saved) console.log(`[r2] cached Telegram audio ${track.messageId}`);
    })
    .catch((error) => {
      console.error(`[r2] could not cache Telegram audio ${track.messageId}`, error);
    });
}

function audioHeaders({
  size,
  total,
  start,
  end,
  mimeType,
  fileName,
  etag,
  cacheSource = "telegram",
  partial = false,
}) {
  const headers = {
    ...corsHeaders(),
    "content-type": mimeType || "audio/mpeg",
    "content-length": size,
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=3600",
    "content-disposition": `inline; filename="${quoteFileName(fileName)}"`,
    "x-audio-cache": cacheSource,
  };
  if (etag) headers.etag = etag;
  if (partial) headers["content-range"] = `bytes ${start}-${end}/${total}`;
  return headers;
}

function sendRangeNotSatisfiable(response, total) {
  response.writeHead(416, {
    ...corsHeaders(),
    "content-range": `bytes */${total}`,
    "accept-ranges": "bytes",
  });
  response.end();
}

function parseRange(header, size) {
  if (!header) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return { invalid: true };

  let start;
  let end;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (!Number.isFinite(suffix) || suffix <= 0) return { invalid: true };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return { invalid: true };
  }
  return { start, end: Math.min(end, size - 1), partial: true };
}

function clampRangeToTotal(range, total) {
  return {
    start: range.start,
    end: Math.min(range.end, total - 1),
    partial: range.partial,
  };
}

async function writeResponseChunk(response, chunk) {
  if (response.destroyed || response.writableEnded) return false;
  if (response.write(chunk)) return true;
  await Promise.race([once(response, "drain"), once(response, "close")]);
  return !response.destroyed && !response.writableEnded;
}

function serveStatic(request, response, pathname) {
  if (request.method !== "GET" && request.method !== "HEAD")
    return sendText(response, "Use GET", 405);

  const clean = pathname === "/" ? "/index.html" : pathname;
  const filePath = safeDistPath(clean);
  const target =
    filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()
      ? filePath
      : path.join(distDir, "index.html");

  if (!fs.existsSync(target)) {
    return sendText(
      response,
      "Run npm run build from the frontend folder before starting the Telegram server.",
      503
    );
  }

  const stat = fs.statSync(target);
  response.writeHead(200, {
    "content-type": mimeType(target),
    "content-length": stat.size,
    "cache-control": target.endsWith("index.html")
      ? "no-cache"
      : "public, max-age=31536000, immutable",
  });
  if (request.method === "HEAD") return response.end();
  return pipeline(fs.createReadStream(target), response, (error) => {
    if (error) console.error("[static]", error);
  });
}

function safeDistPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const full = path.normalize(path.join(distDir, decoded));
  return full.startsWith(distDir) ? full : null;
}

function sendJson(response, body, status = 200, extraHeaders = {}) {
  response.writeHead(status, {
    ...corsHeaders(),
    "content-type": "application/json",
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
}

function sendText(response, text, status = 200) {
  response.writeHead(status, {
    ...corsHeaders(),
    "content-type": "text/plain; charset=utf-8",
  });
  response.end(text);
}

function sendCorsPreflight(response) {
  response.writeHead(204, corsHeaders());
  response.end();
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, HEAD, OPTIONS",
    "access-control-allow-headers": "accept, authorization, content-type, range",
    "access-control-expose-headers":
      "accept-ranges, content-length, content-range, content-type, x-audio-cache",
  };
}

function quoteFileName(name) {
  return String(name).replace(/["\\\r\n]/g, "_");
}

function mimeType(file) {
  const ext = path.extname(file).toLowerCase();
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".webmanifest": "application/manifest+json",
    }[ext] || "application/octet-stream"
  );
}
