create table if not exists public.telegram_tracks (
  message_id bigint primary key,
  title text not null,
  duration integer,
  caption text,
  posted_at timestamptz not null,
  telegram_url text,
  mime_type text not null default 'audio/mpeg',
  file_name text,
  file_size bigint,
  updated_at timestamptz not null default now()
);

create index if not exists telegram_tracks_posted_at_idx
  on public.telegram_tracks (posted_at desc);

alter table public.telegram_tracks enable row level security;

drop policy if exists "telegram tracks are publicly readable" on public.telegram_tracks;
create policy "telegram tracks are publicly readable"
  on public.telegram_tracks for select
  using (true);
