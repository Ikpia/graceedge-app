/**
 * Grace Edge Ministries
 *
 * Handles the two API routes, then hands everything else to the website.
 * The R2 bucket is private. Audio only reaches a listener through here.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (shouldProxyTelegramApi(url, env)) {
      return proxyTelegramApi(request, env, url);
    }

    if (url.pathname.startsWith("/api/audio/")) {
      return serveAudio(request, env, decodeURIComponent(url.pathname.slice("/api/audio/".length)));
    }

    if (url.pathname === "/api/upload") {
      if (request.method !== "POST") return json({ error: "Use POST" }, 405);
      return receiveUpload(request, env, url);
    }

    return env.ASSETS.fetch(request);
  },
};

function shouldProxyTelegramApi(url, env) {
  if (!env.TELEGRAM_API_ORIGIN) return false;
  if (url.pathname === "/api/tracks" || url.pathname === "/api/topics") return true;
  if (/^\/api\/tracks\/\d+$/.test(url.pathname)) return true;
  return /^\/api\/audio\/\d+$/.test(url.pathname);
}

function proxyTelegramApi(request, env, url) {
  const origin = new URL(env.TELEGRAM_API_ORIGIN);
  const target = new URL(url.pathname + url.search, origin);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("x-forwarded-host", url.host);
  headers.set("x-forwarded-proto", url.protocol.replace(":", ""));

  return fetch(target, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  });
}

async function serveAudio(request, env, key) {
  if (!key || key.includes("..")) return new Response("Not found", { status: 404 });

  if (request.method === "HEAD") {
    const head = await env.AUDIO.head(key);
    if (!head) return new Response(null, { status: 404 });
    const h = new Headers();
    head.writeHttpMetadata(h);
    h.set("content-length", String(head.size));
    h.set("accept-ranges", "bytes");
    return new Response(null, { status: 200, headers: h });
  }

  if (request.method !== "GET") return new Response("Use GET", { status: 405 });

  const object = await env.AUDIO.get(key, { range: request.headers });
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "public, max-age=31536000, immutable");

  let status = 200;
  if (object.range && typeof object.range.offset === "number") {
    const start = object.range.offset;
    const end = start + object.range.length - 1;
    headers.set("content-range", `bytes ${start}-${end}/${object.size}`);
    status = 206;
  }

  return new Response(object.body, { status, headers });
}

async function receiveUpload(request, env, url) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Not signed in" }, 401);

  const check = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!check.ok) return json({ error: "Not signed in" }, 401);

  const key = url.searchParams.get("key");
  if (!key || key.includes("..")) return json({ error: "Bad file name" }, 400);

  await env.AUDIO.put(key, request.body, {
    httpMetadata: {
      contentType: request.headers.get("content-type") || "application/octet-stream",
    },
  });

  return json({ ok: true, key });
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
