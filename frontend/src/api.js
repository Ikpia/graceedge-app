import { createClient } from "@supabase/supabase-js";

/* These two are safe to keep here. The publishable key is designed to ship
   inside the website, and the database policies are what protect your data.
   Setting VITE_SUPABASE_URL / VITE_SUPABASE_KEY at build time overrides them. */
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://pyiitojnnbvhzfksbtfi.supabase.co";
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_KEY || "sb_publishable_Bdc8Mv5lzh_6rDccKVZ93g_pXtV2Wyv";
const API_ORIGIN = String(import.meta.env.VITE_API_ORIGIN || "").replace(/\/+$/, "");

const apiUrl = (path) => `${API_ORIGIN}${path}`;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const when = (m, y) => `${MONTHS[(m || 1) - 1].toUpperCase()} ${y}`;

/* The years offered in the admin dropdowns. Built from today so it never goes
   stale. Pass a year to make sure an older message can still be edited. */
export function yearChoices(include) {
  const now = new Date().getFullYear();
  const list = [];
  for (let y = now; y >= now - 7; y--) list.push(y);
  if (include && !list.includes(include)) {
    list.push(include);
    list.sort((a, b) => b - a);
  }
  return list;
}

export const fmt = (sec) => {
  if (!sec && sec !== 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

export const totalMins = (c) =>
  Math.round((c.messages || []).reduce((a, m) => a + (m.duration || 0), 0) / 60);

export const LIBRARY_PAGE_SIZE = 24;

/* audio streams through our own Function, which reads the private bucket */
export const audioUrl = (key) => apiUrl(`/api/audio/${key}`);

export function telegramPostUrl(message, channelUrl) {
  const direct =
    message?.telegram_url ||
    message?.source_url ||
    message?.download_url ||
    message?.telegram_post_url;
  if (direct) return direct;

  const id = message?.telegram_message_id || message?.telegram_id;
  if (!id || !channelUrl) return null;
  return `${String(channelUrl).replace(/\/+$/, "")}/${id}`;
}

const cleanOptionalUrl = (value) => {
  const v = String(value || "").trim();
  return v || null;
};

const messagePayload = (collectionId, part, m) => {
  const row = {
    collection_id: collectionId,
    part,
    title: m.title,
    summary: m.summary,
    audio_key: m.audio_key,
    duration: m.duration,
  };
  const telegramUrl = cleanOptionalUrl(m.telegram_url);
  if (telegramUrl) row.telegram_url = telegramUrl;
  return row;
};

/* deterministic colour pair when no cover has been uploaded */
const TONES = [
  ["#7E0F12", "#C4161C"],
  ["#1C1414", "#8E1113"],
  ["#C4161C", "#E8603C"],
  ["#450A0C", "#A3141A"],
  ["#8E1113", "#D6342B"],
  ["#6E0D10", "#E8603C"],
];
export const toneFor = (id) => {
  let n = 0;
  for (let i = 0; i < id.length; i++) n = (n + id.charCodeAt(i)) % 997;
  return TONES[n % TONES.length];
};

/* ------------------------------- reading ------------------------------- */

export async function loadLibrary() {
  try {
    const telegramLibrary = await loadTelegramLibrary();
    if (telegramLibrary) return telegramLibrary;
  } catch {}

  return loadLegacyLibrary();
}
async function loadTelegramLibrary() {
  const page = await loadTelegramPage({ limit: 100 });
  return page?.items || null;
}

export async function loadLibraryPage({
  q = "",
  topic = "",
  cursor = null,
  limit = LIBRARY_PAGE_SIZE,
} = {}) {
  const page = await loadTelegramPage({ q, topic, cursor, limit });
  if (page) return { ...page, source: "telegram" };

  const items = await loadLegacyLibrary();
  return {
    items,
    nextCursor: null,
    total: items.length,
    source: "legacy",
  };
}

export async function loadLibraryItem(id) {
  const messageId = String(id || "").replace(/^telegram-/, "");
  if (!messageId) return null;

  const res = await fetch(apiUrl(`/api/tracks/${encodeURIComponent(messageId)}`), {
    headers: { accept: "application/json" },
    cache: "no-cache",
  });
  if (!res.ok || !res.headers.get("content-type")?.includes("application/json")) return null;

  const body = await res.json();
  if (!body.track) return null;
  return mapTelegramTracks([body.track])[0] || null;
}

async function loadTelegramPage({
  q = "",
  topic = "",
  cursor = null,
  limit = LIBRARY_PAGE_SIZE,
} = {}) {
  const cleanQuery = String(q || "").trim();
  const cleanTopic = String(topic || "").trim();
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (cleanQuery) params.set("q", cleanQuery);
  if (cleanTopic) params.set("topic", cleanTopic);
  if (cursor) params.set("cursor", cursor);

  const res = await fetch(apiUrl(`/api/tracks?${params}`), {
    headers: { accept: "application/json" },
    cache: "no-cache",
  });
  if (!res.ok || !res.headers.get("content-type")?.includes("application/json")) return null;

  const body = await res.json();
  if (!Array.isArray(body.tracks)) return null;

  return {
    items: mapTelegramTracks(body.tracks),
    nextCursor: body.nextCursor || null,
    total: Number(body.total) || body.tracks.length,
    topics: Array.isArray(body.topics) ? body.topics : [],
  };
}

function mapTelegramTracks(tracks) {
  return tracks.map((track) => {
    const posted = track.postedAt ? new Date(track.postedAt) : new Date();
    const messageId = String(track.messageId || track.id);
    return {
      id: `telegram-${messageId}`,
      kind: "single",
      title: track.title || `Audio ${messageId}`,
      description: track.caption || "",
      month: posted.getMonth() + 1,
      year: posted.getFullYear(),
      cover_url: null,
      topics: Array.isArray(track.topics) ? track.topics : [],
      messages: [
        {
          id: `telegram-${messageId}`,
          part: null,
          title: track.title || `Audio ${messageId}`,
          summary: track.caption || "",
          audio_key: messageId,
          duration: track.duration,
          telegram_url: track.telegramUrl,
          telegram_message_id: track.messageId,
        },
      ],
    };
  });
}

export async function loadLegacyLibrary() {
  const { data, error } = await supabase
    .from("collections")
    .select("*, messages(*), collection_topics(topic)")
    .order("year", { ascending: false })
    .order("month", { ascending: false });

  if (error) throw error;

  return (data || []).map((c) => ({
    ...c,
    topics: (c.collection_topics || []).map((t) => t.topic),
    messages: (c.messages || []).sort((a, b) => (a.part || 0) - (b.part || 0)),
  }));
}

export async function loadTopics() {
  const { data, error } = await supabase.from("topics").select("name").order("name");
  if (error) throw error;
  return (data || []).map((t) => t.name);
}

/* ------------------------------- writing ------------------------------- */

export async function uploadAudio(file, onProgress) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) throw new Error("You are signed out. Sign in again to upload.");

  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase();
  const key = `${Date.now()}-${safe}`;

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiUrl(`/api/upload?key=${encodeURIComponent(key)}`));
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", file.type || "audio/mpeg");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status}). ${xhr.responseText || ""}`));
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.send(file);
  });

  return key;
}

export async function uploadCover(file) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) throw new Error("You are signed out.");

  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase();
  const key = `covers/${Date.now()}-${safe}`;

  const res = await fetch(apiUrl(`/api/upload?key=${encodeURIComponent(key)}`), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": file.type || "image/jpeg" },
    body: file,
  });
  if (!res.ok) throw new Error("Could not upload the cover picture.");
  return audioUrl(key);
}

export async function ensureTopics(names) {
  if (!names.length) return;
  const { error } = await supabase.from("topics").upsert(
    names.map((name) => ({ name })),
    { onConflict: "name" }
  );
  if (error) throw error;
}

export async function createCollection(draft) {
  await ensureTopics(draft.topics);

  const { data: col, error } = await supabase
    .from("collections")
    .insert({
      kind: draft.kind,
      title: draft.title.trim(),
      description: draft.description?.trim() || null,
      month: draft.month,
      year: draft.year,
      cover_url: draft.cover_url || null,
    })
    .select()
    .single();
  if (error) throw error;

  if (draft.topics.length) {
    const { error: e2 } = await supabase
      .from("collection_topics")
      .insert(draft.topics.map((topic) => ({ collection_id: col.id, topic })));
    if (e2) throw e2;
  }

  if (draft.messages.length) {
    const { error: e3 } = await supabase
      .from("messages")
      .insert(
        draft.messages.map((m) =>
          messagePayload(col.id, draft.kind === "series" ? m.part : null, m)
        )
      );
    if (e3) throw e3;
  }

  return col;
}

export async function addMessage(collectionId, part, m) {
  const { error } = await supabase.from("messages").insert(messagePayload(collectionId, part, m));
  if (error) throw error;
}

export async function deleteCollection(id) {
  const { error } = await supabase.from("collections").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteMessage(id) {
  const { error } = await supabase.from("messages").delete().eq("id", id);
  if (error) throw error;
}

/* ------------------------------- editing ------------------------------- */

export async function updateCollection(id, fields) {
  const { error } = await supabase
    .from("collections")
    .update({
      title: fields.title.trim(),
      description: fields.description?.trim() || null,
      month: fields.month,
      year: fields.year,
      cover_url: fields.cover_url || null,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function setCollectionTopics(collectionId, topics) {
  await ensureTopics(topics);
  const { error: e1 } = await supabase
    .from("collection_topics")
    .delete()
    .eq("collection_id", collectionId);
  if (e1) throw e1;
  if (!topics.length) return;
  const { error: e2 } = await supabase
    .from("collection_topics")
    .insert(topics.map((topic) => ({ collection_id: collectionId, topic })));
  if (e2) throw e2;
}

export async function updateMessage(id, fields) {
  const patch = {};
  if (fields.title !== undefined) patch.title = fields.title.trim();
  if (fields.summary !== undefined) patch.summary = fields.summary.trim();
  if (fields.part !== undefined) patch.part = fields.part;
  if (fields.audio_key !== undefined) patch.audio_key = fields.audio_key;
  if (fields.duration !== undefined) patch.duration = fields.duration;
  if (fields.telegram_url !== undefined) patch.telegram_url = cleanOptionalUrl(fields.telegram_url);
  const { error } = await supabase.from("messages").update(patch).eq("id", id);
  if (error) throw error;
}

/** Writes part numbers 1..n in the order given. */
export async function renumber(messages) {
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].part !== i + 1) {
      await updateMessage(messages[i].id, { part: i + 1 });
    }
  }
}
