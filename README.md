# Grace Edge Ministries

Telegram-backed sermon app for Grace Edge Ministries. Pastor Vwakpor Efenatu.

- `/` is the public listening side. No login.
- `/admin` is the legacy manual upload side. Login required.
- `frontend/` contains the React/Vite app.
- `backend/server/index.js` is the Telegram-backed Node service from the project brief.
- `backend/worker/` contains the Cloudflare Worker gateway/legacy R2 upload path.

The implemented Telegram flow indexes audio messages from the configured
Telegram channel, stores only metadata in Supabase, keeps an in-memory list for
page loads, and streams audio through `/api/audio/:messageId` only when someone
presses play. Downloads send people back to Telegram.

---

## Project Structure

```text
frontend/
  index.html
  public/
  src/
  dist/
  vite.config.js

backend/
  server/
  supabase/
  worker/

wrangler.jsonc
README.md
```

NPM commands now live inside the app they belong to. Use `frontend/package.json`
for React/Vite commands and `backend/package.json` for the Node server,
Telegram jobs, and Worker deploy commands. The repository root intentionally has
no `package.json` or `package-lock.json`.

Backend secrets live in `backend/.env`. The backend does not read the root
`.env`.

Frontend environment values, when needed, live in `frontend/.env` and must use
the `VITE_` prefix because they are bundled into browser JavaScript. Do not put
Telegram sessions, Supabase service-role keys, or R2 secret keys in the
frontend.

---

## Telegram Setup

1. Create the metadata table in Supabase. Paste the contents of
   `backend/supabase/telegram-schema.sql` into the Supabase SQL editor and run it.

2. Copy `backend/.env.example` to `backend/.env` and fill in:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`
- `TELEGRAM_CHANNEL`
- `TELEGRAM_PUBLIC_CHANNEL_URL`
- `R2_ACCOUNT_ID`
- `R2_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

3. Generate a persistent Telegram user session:

```bash
cd backend
npm run telegram:login
```

Save the printed value as `TELEGRAM_STRING_SESSION` in `backend/.env`.

4. Build the frontend and start the combined web/indexer service:

```bash
cd frontend
npm run build
cd ../backend
npm start
```

The frontend build output stays inside `frontend/dist`. The backend serves that
folder in production, and the Cloudflare Worker deploy config points there too.

The server starts in this order: connect to Supabase, load tracks into memory,
connect to Telegram, backfill if needed, catch up on anything missed while
offline, start the live listener, then accept web requests.

For a manual full-history backfill, run:

```bash
cd backend
npm run telegram:backfill
```

---

## How It Fits Together

| Piece                      | Job                                                       |
| -------------------------- | --------------------------------------------------------- |
| Node server                | serves the website, indexes Telegram, streams audio       |
| GramJS userbot             | reads the Telegram channel over MTProto                   |
| Supabase `telegram_tracks` | permanent metadata source of truth                        |
| In-memory cache            | serves `/api/tracks` without hitting Telegram or Supabase |
| Telegram                   | stores the original audio files and download posts        |

`/api/tracks` returns paginated in-memory metadata with short HTTP caching.
`/api/audio/:messageId` fetches the requested byte range from Telegram on demand
and writes it to the browser chunk by chunk, so playback starts quickly and
seek/scrub requests do not buffer the whole sermon in Node memory. No page load
contacts Telegram.

The Cloudflare Worker/R2 upload path is still present in `backend/worker/index.js` for
migration safety. A Worker cannot run the persistent Telegram listener, but it
can proxy Telegram API/audio requests to the Node service when
`TELEGRAM_API_ORIGIN` is configured.

---

## Environment

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

TELEGRAM_API_ID=123456
TELEGRAM_API_HASH=your-api-hash
TELEGRAM_STRING_SESSION=generated-by-npm-run-telegram-login
TELEGRAM_CHANNEL=Dead_Raisers
TELEGRAM_PUBLIC_CHANNEL_URL=https://t.me/Dead_Raisers

PUBLIC_URL=https://your-deployed-site.example
PORT=3000
TELEGRAM_API_ORIGIN=https://your-node-service.example
TELEGRAM_BACKFILL_ON_START=auto
TELEGRAM_BACKFILL_BATCH_SIZE=100
TELEGRAM_BACKFILL_BATCH_PAUSE_MS=850
AUDIO_MEMORY_CACHE_MB=256

R2_ACCOUNT_ID=your-cloudflare-account-id
R2_BUCKET=graceedge-audio
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
# Optional. Leave blank to cache new Telegram files at the bucket root.
R2_AUDIO_PREFIX=
```

`TELEGRAM_BACKFILL_ON_START=auto` runs a full backfill only when the database is
empty. Use `true` to force a full history walk at every startup, or `false` to
skip startup backfills and only run catch-up from the latest indexed message.

R2 caching is required for the streaming server. If any required `R2_*` value is
missing, startup fails before the web server accepts requests. `/api/audio/:messageId`
checks R2 first. On a miss, the first listener is served from Telegram and the
server warms R2 in the background for later listeners. By default, cached
Telegram audio is stored at the bucket root:

```text
<messageId>.mp3
```

Create the R2 bucket in Cloudflare, then create an R2 API token with object
read/write access for that bucket. Use the token's access key id and secret
access key in `backend/.env`.

Older manually uploaded R2 files can stay in the bucket. If an old key such as
`1786933671057-defenders-of-faith-1a.mp3` matches a Telegram track title or
filename, the server serves that existing object directly from R2. It does not
copy matched legacy files, so the same audio is not duplicated in the bucket.

---

## Downloads

The public download action never serves the audio file from this app. It opens:

```text
https://t.me/<channel_username>/<messageId>
```

That works directly for public channels. For private channels, listeners must
already be members for Telegram to resolve the post link.

---

## Cloudflare Frontend With Node Streaming

If Cloudflare serves the built frontend, keep the Telegram indexer/streaming
server deployed as a Node service, then set this Worker variable:

```bash
TELEGRAM_API_ORIGIN=https://your-node-service.example
```

With that value set, the Worker forwards:

- `/api/tracks`
- `/api/topics`
- `/api/tracks/:messageId`
- `/api/audio/:messageId`

Range headers are preserved, so browser seeking still reaches the Node streaming
endpoint correctly.

Worker commands are run from the backend package while pointing Wrangler at the
root config:

```bash
cd backend
npm run worker:dev
npm run worker:deploy
```

---

## Legacy Manual Upload

The previous Supabase/R2 CMS still exists under `/admin`. It can upload audio to
R2, compress files in the browser, and manage older collection-style records.
The public frontend now tries `/api/tracks` first, then falls back to the legacy
Supabase collections if the Telegram server is not running.
