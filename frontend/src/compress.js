/**
 * Compresses audio in the browser before upload.
 *
 * Sermons are re-encoded to mono MP3 at 48 kbps. A 45 minute message goes
 * from roughly 45 MB down to about 16 MB, and that saving lands on the
 * listener's data bill.
 *
 * The engine is ffmpeg compiled to WebAssembly, roughly 32 MB. It downloads
 * once and the browser caches it after that.
 */

/* Your own R2 bucket first. Nothing outside Cloudflare, and it is served
   from an edge close to Nigeria. The public CDNs are only a fallback. */
const CDNS = [
  "/api/audio/engine",
  "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd",
  "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd",
];

let enginePromise = null;

/** Downloads a file and reports progress, because the wasm is big. */
async function fetchWithProgress(url, onBytes) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));

  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body || !total) return new Blob([await res.arrayBuffer()]);

  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onBytes && onBytes(received, total);
  }
  return new Blob(chunks);
}

async function loadEngine(onStage, onProgress) {
  if (enginePromise) return enginePromise;

  enginePromise = (async () => {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");

    let lastError;
    for (const base of CDNS) {
      try {
        onStage && onStage("Getting the compressor ready. This happens once.");

        const coreBlob = await fetchWithProgress(base + "/ffmpeg-core.js");
        const wasmBlob = await fetchWithProgress(
          base + "/ffmpeg-core.wasm",
          (got, total) => onProgress && onProgress(Math.round((got / total) * 100))
        );

        const ff = new FFmpeg();
        await ff.load({
          coreURL: URL.createObjectURL(new Blob([coreBlob], { type: "text/javascript" })),
          wasmURL: URL.createObjectURL(new Blob([wasmBlob], { type: "application/wasm" })),
        });
        return ff;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error("could not load");
  })();

  try {
    return await enginePromise;
  } catch (e) {
    enginePromise = null;
    throw e;
  }
}

export const estimateMB = (seconds) => (seconds ? (seconds * 6) / 1024 : null);

export const worthCompressing = (file, seconds) => {
  const mb = file.size / (1024 * 1024);
  const target = estimateMB(seconds);
  if (!target) return mb > 8;
  return mb > target * 1.25;
};

/** Files this large tend to run a phone out of memory. */
export const TOO_BIG_MB = 220;

export async function compressAudio(file, onProgress, onStage) {
  const mb = file.size / (1024 * 1024);
  if (mb > TOO_BIG_MB) {
    throw new Error(
      "This file is " +
        mb.toFixed(0) +
        " MB, which is too large to compress on a phone. " +
        "Try a computer, or turn compression off and upload it as it is."
    );
  }

  let ff;
  try {
    ff = await loadEngine(onStage, onProgress);
  } catch (_e) {
    throw new Error(
      "Could not download the compressor. It needs a steady connection for about 32 MB. " +
        "Try again on wifi, or turn compression off to upload the file as it is."
    );
  }

  onStage && onStage("Compressing");
  onProgress && onProgress(0);

  const ext = (file.name.match(/\.[^.]+$/) || [".mp3"])[0].toLowerCase();
  const inName = "in" + ext;
  const outName = "out.mp3";

  const handler = (e) => {
    const pct = Math.max(0, Math.min(100, Math.round((e.progress || 0) * 100)));
    onProgress && onProgress(pct);
  };
  ff.on("progress", handler);

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await ff.writeFile(inName, bytes);

    await ff.exec([
      "-i",
      inName,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "32000",
      "-b:a",
      "48k",
      "-codec:a",
      "libmp3lame",
      "-y",
      outName,
    ]);

    const data = await ff.readFile(outName);
    const blob = new Blob([data], { type: "audio/mpeg" });

    try {
      await ff.deleteFile(inName);
    } catch (_e) {}
    try {
      await ff.deleteFile(outName);
    } catch (_e) {}

    if (!blob.size) throw new Error("produced an empty file");
    if (blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".mp3";
    return new File([blob], name, { type: "audio/mpeg" });
  } catch (e) {
    enginePromise = null;
    throw new Error(
      "Compression stopped on this file (" +
        ((e && e.message) || "unknown reason") +
        "). " +
        "Turn compression off to upload it as it is."
    );
  } finally {
    try {
      ff.off && ff.off("progress", handler);
    } catch (_e) {}
  }
}
