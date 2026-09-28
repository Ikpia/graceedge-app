import { createClient } from "@supabase/supabase-js";

const TABLE = "telegram_tracks";
const PAGE_SIZE = 1000;

export function createTrackStore(config) {
  const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: false },
  });

  const toTrack = (row) => ({
    id: String(row.message_id),
    messageId: Number(row.message_id),
    title: row.title,
    duration: row.duration,
    caption: row.caption || "",
    postedAt: row.posted_at,
    telegramUrl: row.telegram_url,
    mimeType: row.mime_type || "audio/mpeg",
    fileName: row.file_name || "",
    fileSize: row.file_size || null,
    updatedAt: row.updated_at,
  });

  const toRow = (track) => ({
    message_id: track.messageId,
    title: track.title,
    duration: track.duration,
    caption: track.caption || null,
    posted_at: track.postedAt,
    telegram_url: track.telegramUrl,
    mime_type: track.mimeType || "audio/mpeg",
    file_name: track.fileName || null,
    file_size: track.fileSize || null,
    updated_at: new Date().toISOString(),
  });

  return {
    async listTracks() {
      const rows = [];

      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from(TABLE)
          .select("*")
          .order("posted_at", { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;

        rows.push(...(data || []));
        if (!data || data.length < PAGE_SIZE) break;
      }

      return rows.map(toTrack);
    },

    async latestMessageId() {
      const { data, error } = await supabase
        .from(TABLE)
        .select("message_id")
        .order("message_id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.message_id || 0;
    },

    async upsertTrack(track) {
      const { data, error } = await supabase
        .from(TABLE)
        .upsert(toRow(track), { onConflict: "message_id" })
        .select()
        .single();
      if (error) throw error;
      return toTrack(data);
    },
  };
}
