import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  LIBRARY_PAGE_SIZE,
  loadLibraryItem,
  loadLibraryPage,
  when,
  fmt,
  totalMins,
  audioUrl,
  telegramPostUrl,
} from "./api";
import { Logo, Cover, WhatsApp, PlayIcon, PauseIcon, Spinner, TelegramIcon, Back } from "./ui";
import { CHURCH } from "./photos";
import InstallPrompt from "./InstallPrompt";
import {
  loadPositions,
  loadPlayed,
  savePositions,
  savePlayed,
  resumeAt,
  fractionDone,
  isHeardEnough,
} from "./progress";

const KINDS = [
  { id: "all", label: "Everything" },
  { id: "series", label: "Series" },
  { id: "single", label: "Single messages" },
];

/* Somebody opened a link shared on WhatsApp. Read the message id once, here,
   before React starts, so a reload later does not re-trigger it. */
const SHARED_ID = new URLSearchParams(window.location.search).get("m");

function mergeLibrary(current, incoming) {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}

export default function Listen({ active = true, onPlayer }) {
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageBusy, setPageBusy] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [source, setSource] = useState("unknown");
  const [nextCursor, setNextCursor] = useState(null);
  const [total, setTotal] = useState(0);
  const [availableTopics, setAvailableTopics] = useState([]);

  const [openId, setOpenId] = useState(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [topic, setTopic] = useState(null);
  const [kind, setKind] = useState("all");

  const [nowPlaying, setNowPlaying] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [rate, setRate] = useState(1);
  const [played, setPlayed] = useState(loadPlayed);

  /* where each message was left off. The ref is the live copy that gets
     written to storage; the state copy is only for re-drawing the buttons. */
  const positionsRef = useRef(loadPositions());
  const [positions, setPositions] = useState(positionsRef.current);
  const lastWrite = useRef(0);
  const seekTo = useRef(0);

  const [focusId, setFocusId] = useState(null);
  const [sharedGone, setSharedGone] = useState(false);
  const sharePending = useRef(SHARED_ID);
  const pageRequest = useRef(0);

  const audio = useRef(null);
  const scroll = useRef(null);

  /* push the live positions into state and onto the phone */
  const commitPositions = useCallback(() => {
    savePositions(positionsRef.current);
    setPositions({ ...positionsRef.current });
  }, []);

  const markPlayed = useCallback(
    (id) =>
      setPlayed((s) => {
        if (s.has(id)) return s;
        const next = new Set(s).add(id);
        savePlayed(next);
        return next;
      }),
    []
  );

  const loadPage = useCallback(
    async ({
      cursor = null,
      append = false,
      q = debouncedQuery,
      topic: selectedTopic = topic,
    } = {}) => {
      const requestId = ++pageRequest.current;
      if (append) setPageBusy(true);
      else setLoading(true);
      setLoadErr("");

      try {
        const page = await loadLibraryPage({
          q,
          topic: selectedTopic,
          cursor,
          limit: LIBRARY_PAGE_SIZE,
        });
        if (requestId !== pageRequest.current) return;
        setSource(page.source);
        setNextCursor(page.nextCursor);
        setTotal(page.total);
        setAvailableTopics(page.topics || []);
        setLibrary((old) => (append ? mergeLibrary(old, page.items) : page.items));
      } catch (e) {
        if (requestId !== pageRequest.current) return;
        setLoadErr(e.message || "Could not load the messages.");
      } finally {
        if (requestId === pageRequest.current) {
          setLoading(false);
          setPageBusy(false);
        }
      }
    },
    [debouncedQuery, topic]
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 220);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    loadPage({ q: debouncedQuery, topic });
  }, [debouncedQuery, topic, loadPage]);

  const allTopics = useMemo(
    () =>
      source === "telegram"
        ? availableTopics.map((topicItem) =>
            typeof topicItem === "string" ? topicItem : topicItem.name
          )
        : Array.from(new Set(library.flatMap((c) => c.topics || []))).sort(),
    [availableTopics, library, source]
  );

  const series = useMemo(() => library.find((c) => c.id === openId) || null, [library, openId]);

  const current = useMemo(() => {
    if (!nowPlaying) return null;
    const c = library.find((x) => x.id === nowPlaying.collectionId);
    const m = c?.messages.find((x) => x.id === nowPlaying.messageId);
    return c && m ? { collection: c, message: m } : null;
  }, [nowPlaying, library]);

  const start = useCallback(
    (collectionId, messageId, fromStart = false) => {
      const same = nowPlaying?.messageId === messageId;
      if (same && audio.current) {
        if (audio.current.paused) audio.current.play();
        else audio.current.pause();
        return;
      }

      /* anything already on the go keeps its place */
      if (current && audio.current && audio.current.currentTime > 0) {
        positionsRef.current[current.message.id] = audio.current.currentTime;
        commitPositions();
      }

      const col = library.find((x) => x.id === collectionId);
      const msg = col?.messages.find((x) => x.id === messageId);
      const at = fromStart ? 0 : resumeAt(positionsRef.current, messageId, msg?.duration);

      seekTo.current = at;
      lastWrite.current = at;
      setNowPlaying({ collectionId, messageId });
      setPos(at);
      setDur(0);
      setBuffering(true);
    },
    [commitPositions, current, library, nowPlaying]
  );

  const results = useMemo(() => {
    if (source === "telegram") {
      if (kind === "series") return [];
      return library;
    }

    const q = query.trim().toLowerCase();
    return library
      .filter((c) => {
        if (kind !== "all" && c.kind !== kind) return false;
        if (topic && !(c.topics || []).includes(topic)) return false;
        if (!q) return true;
        return (
          c.title.toLowerCase().includes(q) ||
          (c.description || "").toLowerCase().includes(q) ||
          (c.topics || []).some((t) => t.includes(q)) ||
          (c.messages || []).some(
            (m) => m.title.toLowerCase().includes(q) || (m.summary || "").toLowerCase().includes(q)
          )
        );
      })
      .map((c) => {
        let matchNote = null;
        if (q && !c.title.toLowerCase().includes(q)) {
          const hit = (c.messages || []).find((m) => (m.summary || "").toLowerCase().includes(q));
          if (hit)
            matchNote = hit.part ? `found in Part ${hit.part} summary` : "found in the summary";
          else if ((c.topics || []).some((t) => t.includes(q)))
            matchNote = `tagged ${(c.topics || []).find((t) => t.includes(q))}`;
        }
        return { ...c, matchNote };
      });
  }, [library, query, topic, kind, source]);

  /* ---- audio element ---- */
  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const onTime = () => {
      setPos(el.currentTime);
      if (!current) return;
      const id = current.message.id;
      const t = el.currentTime;
      positionsRef.current[id] = t;
      /* write to the phone every few seconds rather than on every tick */
      if (Math.abs(t - lastWrite.current) > 5) {
        lastWrite.current = t;
        savePositions(positionsRef.current);
      }
      if (isHeardEnough(t, el.duration)) markPlayed(id);
    };

    const onMeta = () => {
      setDur(el.duration || 0);
      /* pick up where they stopped last time */
      if (seekTo.current > 0) {
        try {
          el.currentTime = seekTo.current;
        } catch {}
        seekTo.current = 0;
      }
    };

    const onWait = () => setBuffering(true);
    const onPlaying = () => {
      setBuffering(false);
      setPlaying(true);
    };
    const onPause = () => {
      setPlaying(false);
      commitPositions();
    };
    const onEnd = () => {
      if (!current) return;
      markPlayed(current.message.id);
      delete positionsRef.current[current.message.id];
      commitPositions();
      const list = current.collection.messages;
      const i = list.findIndex((m) => m.id === current.message.id);
      const next = list[i + 1];
      if (next) start(current.collection.id, next.id);
      else setPlaying(false);
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("waiting", onWait);
    el.addEventListener("playing", onPlaying);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnd);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("waiting", onWait);
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnd);
    };
  }, [commitPositions, current, markPlayed, start]);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = rate;
  }, [rate, current]);

  /* keeps the lock screen controls working */
  useEffect(() => {
    if (!current || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: current.message.title,
      artist: "Pastor Vwakpor Efenatu",
      album: current.collection.title,
      artwork: [{ src: "/logo.png", sizes: "760x203", type: "image/png" }],
    });
    navigator.mediaSession.setActionHandler("play", () => audio.current?.play());
    navigator.mediaSession.setActionHandler("pause", () => audio.current?.pause());
    navigator.mediaSession.setActionHandler("seekbackward", () => {
      if (audio.current) audio.current.currentTime = Math.max(0, audio.current.currentTime - 15);
    });
    navigator.mediaSession.setActionHandler("seekforward", () => {
      if (audio.current) audio.current.currentTime = audio.current.currentTime + 30;
    });
    navigator.mediaSession.setActionHandler("seekto", (d) => {
      if (audio.current && d.seekTime != null) audio.current.currentTime = d.seekTime;
    });

    const list = current.collection.messages;
    const i = list.findIndex((m) => m.id === current.message.id);
    navigator.mediaSession.setActionHandler(
      "previoustrack",
      list[i - 1] ? () => start(current.collection.id, list[i - 1].id) : null
    );
    navigator.mediaSession.setActionHandler(
      "nexttrack",
      list[i + 1] ? () => start(current.collection.id, list[i + 1].id) : null
    );
  }, [current, start]);

  /* feeds the lock screen scrubber */
  useEffect(() => {
    if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
    if (!dur || !isFinite(dur)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: dur,
        playbackRate: rate,
        position: Math.min(pos, dur),
      });
      navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    } catch {}
  }, [pos, dur, rate, playing]);

  const stop = () => {
    const el = audio.current;
    if (el) {
      /* keep the spot before throwing the file away */
      if (current && el.currentTime > 0) positionsRef.current[current.message.id] = el.currentTime;
      commitPositions();
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
    setNowPlaying(null);
    setPlaying(false);
    setBuffering(false);
    setPos(0);
    setDur(0);
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.playbackState = "none";
        navigator.mediaSession.metadata = null;
      } catch {}
    }
  };

  useEffect(() => {
    if (!current || !audio.current) return;
    audio.current.src = audioUrl(current.message.audio_key);
    audio.current.playbackRate = rate;
    audio.current.play().catch(() => setBuffering(false));
  }, [current, rate]);

  useEffect(() => {
    onPlayer?.(Boolean(current));
  }, [current, onPlayer]);

  /* Somebody tapped a link shared on WhatsApp. Find the message, open the
     series it belongs to, jump to it and start it playing. */
  useEffect(() => {
    if (!sharePending.current || loading) return;
    const id = sharePending.current;
    sharePending.current = null;
    let cancelled = false;

    /* tidy the address so a refresh does not do this all over again */
    try {
      window.history.replaceState(null, "", window.location.pathname);
    } catch {}

    const openShared = (col) => {
      setQuery("");
      setTopic(null);
      setKind("all");
      if (col.kind === "series") setOpenId(col.id);
      setFocusId(id);
      start(col.id, id);
    };

    const col = library.find((c) => (c.messages || []).some((m) => m.id === id));
    if (!col) {
      if (source !== "telegram") {
        setSharedGone(true);
        return undefined;
      }

      loadLibraryItem(id)
        .then((item) => {
          if (cancelled) return;
          if (!item) {
            setSharedGone(true);
            return;
          }
          setLibrary((old) => mergeLibrary(old, [item]));
          openShared(item);
        })
        .catch(() => {
          if (!cancelled) setSharedGone(true);
        });

      return () => {
        cancelled = true;
      };
    }

    openShared(col);
    return undefined;
  }, [library, loading, source, start]);

  /* slide the message into view and let the highlight fade off after a moment */
  useEffect(() => {
    if (!focusId) return;
    const scrollTimer = setTimeout(() => {
      document
        .querySelector(`[data-msg="${focusId}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 140);
    const fadeTimer = setTimeout(() => setFocusId(null), 5200);
    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(fadeTimer);
    };
  }, [focusId, openId]);

  const share = (c, m) => {
    const line = c.kind === "series" ? `${c.title} · Part ${m.part}` : when(c.month, c.year);
    const text = `${m.title}\n${line}\nPastor Vwakpor Efenatu · Grace Edge Ministries\n\nListen: ${location.origin}/?m=${m.id}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const Actions = ({ item, m }) => {
    const live = nowPlaying?.messageId === m.id;
    const savedAt = live ? 0 : resumeAt(positions, m.id, m.duration);
    const frac = live ? 0 : fractionDone(positions, m.id, m.duration);
    const telegramUrl = telegramPostUrl(m, CHURCH.telegram);

    const label =
      live && playing ? "Pause" : live ? "Resume" : savedAt ? `Resume ${fmt(savedAt)}` : "Play";

    return (
      <>
        {frac > 0.01 && frac < 0.98 && (
          <div className="sofar" aria-hidden="true">
            <div className="sofarfill" style={{ width: `${frac * 100}%` }} />
          </div>
        )}
        <div className="acts">
          <button className="play" onClick={() => start(item.id, m.id)}>
            {live && playing ? <PauseIcon /> : <PlayIcon />}
            {label}
          </button>
          {savedAt > 0 && (
            <button className="ghost" onClick={() => start(item.id, m.id, true)}>
              Start over
            </button>
          )}
          <a
            className="ghost"
            href={telegramUrl || CHURCH.telegram}
            target="_blank"
            rel="noreferrer"
          >
            <TelegramIcon size={13} /> {telegramUrl ? "Download on Telegram" : "Open Telegram"}
          </a>
          <button className="ghost" onClick={() => share(item, m)}>
            <span className="wa">
              <WhatsApp />
            </span>{" "}
            Share
          </button>
          <span className="dur">{fmt(m.duration)}</span>
        </div>
      </>
    );
  };

  const isFiltering = Boolean(query.trim() || topic || kind !== "all");
  const resultTotal = source === "telegram" && kind !== "series" ? total : results.length;
  const canLoadMore = source === "telegram" && Boolean(nextCursor) && kind !== "series";

  return (
    <>
      <audio ref={audio} preload="metadata" />

      <section className="tab" style={{ display: active ? "flex" : "none" }}>
        <InstallPrompt />
        <Logo />

        <div className="top">
          <div className="past">Pastor Vwakpor Efenatu</div>
          <div className="search">
            <svg
              className="sicon"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpenId(null);
              }}
              placeholder="Search a topic. Try faith, or money"
              aria-label="Search messages"
            />
            {query && (
              <button className="clear" onClick={() => setQuery("")} aria-label="Clear search">
                ×
              </button>
            )}
          </div>
        </div>

        <div className="scroll" ref={scroll}>
          {loading && <div className="empty">Loading the messages…</div>}
          {loadErr && <div className="empty">{loadErr}</div>}

          {sharedGone && (
            <div className="gone">
              That message is not in the app any more. Everything else is below.
              <button className="gonex" onClick={() => setSharedGone(false)} aria-label="Dismiss">
                ×
              </button>
            </div>
          )}

          {!loading && !loadErr && !series && (
            <>
              <div className="chips">
                {KINDS.map((k) => (
                  <button
                    key={k.id}
                    className="chip"
                    data-on={kind === k.id}
                    onClick={() => setKind(k.id)}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
              {allTopics.length > 0 && (
                <div className="chips">
                  {allTopics.map((t) => (
                    <button
                      key={t}
                      className="chip"
                      data-on={topic === t}
                      onClick={() => setTopic(topic === t ? null : t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}

              <div className="eyebrow">
                {isFiltering
                  ? `${resultTotal} result${resultTotal === 1 ? "" : "s"}`
                  : library.length
                    ? "Newest first"
                    : ""}
              </div>

              {library.length === 0 && !isFiltering && (
                <div className="empty">
                  No messages yet.
                  <br />
                  They will appear here as soon as they are uploaded.
                </div>
              )}

              {isFiltering && results.length === 0 && (
                <div className="empty">
                  Nothing under that word yet.
                  <br />
                  Try another topic.
                </div>
              )}

              {results.map((c) =>
                c.kind === "series" ? (
                  <button
                    key={c.id}
                    className="item"
                    onClick={() => {
                      setOpenId(c.id);
                      scroll.current.scrollTop = 0;
                    }}
                  >
                    <Cover item={c} size={62} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="meta">
                        <span className="flag">
                          {c.messages.length} PART{c.messages.length === 1 ? "" : "S"}
                        </span>{" "}
                        · {totalMins(c)} MIN · {when(c.month, c.year)}
                      </div>
                      <div className="ittitle">{c.title}</div>
                      {c.description && <div className="desc">{c.description}</div>}
                      {c.matchNote && <span className="note">{c.matchNote}</span>}
                    </div>
                  </button>
                ) : (
                  <div
                    key={c.id}
                    className="item"
                    data-msg={c.messages[0]?.id}
                    data-focus={Boolean(c.messages[0]) && focusId === c.messages[0].id}
                  >
                    <Cover item={c} size={62} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="meta">
                        <span className="flag">SINGLE MESSAGE</span> · {when(c.month, c.year)}
                      </div>
                      <div className="ittitle">{c.title}</div>
                      {c.messages[0] && (
                        <>
                          <div className="desc" style={{ marginBottom: 11 }}>
                            {c.messages[0].summary}
                          </div>
                          <Actions item={c} m={c.messages[0]} />
                        </>
                      )}
                      {c.matchNote && <span className="note">{c.matchNote}</span>}
                    </div>
                  </div>
                )
              )}

              {canLoadMore && (
                <div className="pad" style={{ paddingTop: 16 }}>
                  <button
                    className="ghost wide"
                    disabled={pageBusy}
                    onClick={() => loadPage({ topic, cursor: nextCursor, append: true })}
                  >
                    {pageBusy ? "Loading more..." : `Load more (${library.length} of ${total})`}
                  </button>
                </div>
              )}
            </>
          )}

          {series && (
            <>
              <div className="backwrap">
                <Back onClick={() => setOpenId(null)} label="All series" />
              </div>
              <div className="head">
                <Cover item={series} size={80} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="meta">
                    {when(series.month, series.year)} · {totalMins(series)} MIN
                  </div>
                  <div className="htitle">{series.title}</div>
                  {series.description && (
                    <div className="desc" style={{ marginTop: 0 }}>
                      {series.description}
                    </div>
                  )}
                </div>
              </div>

              <div className="spine">
                {series.messages.map((m) => {
                  const live = nowPlaying?.messageId === m.id;
                  const heard = played.has(m.id) && !live;
                  return (
                    <div
                      key={m.id}
                      className="part"
                      data-msg={m.id}
                      data-focus={focusId === m.id}
                      data-heard={heard}
                      data-live={live}
                    >
                      <div className="rail">
                        <div className="num">{String(m.part ?? 1).padStart(2, "0")}</div>
                        <div className="line" />
                      </div>
                      <div className="pbody">
                        <div className="ptitle">{m.title}</div>
                        <div className="sum">{m.summary}</div>
                        <Actions item={series} m={m} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </section>

      {current && (
        <div className="player">
          <button className="stopbtn" onClick={stop}>
            <span className="stopsq" /> Stop playing
          </button>

          <div className="pltop">
            <button
              className="mainbtn"
              onClick={() => (audio.current.paused ? audio.current.play() : audio.current.pause())}
              aria-label={playing ? "Pause" : "Play"}
            >
              {buffering ? (
                <Spinner size={17} />
              ) : playing ? (
                <PauseIcon size={15} />
              ) : (
                <PlayIcon size={15} />
              )}
            </button>

            <div className="pltxt">
              <div className="pltitle">{current.message.title}</div>
              <div className="plsub">
                {buffering
                  ? "CONNECTING…"
                  : current.collection.kind === "series"
                    ? `${current.collection.title.toUpperCase()} · PART ${current.message.part}`
                    : when(current.collection.month, current.collection.year)}
              </div>
            </div>

            <button
              className="iconbtn"
              onClick={() => share(current.collection, current.message)}
              aria-label="Share on WhatsApp"
            >
              <span className="wa">
                <WhatsApp size={18} />
              </span>
            </button>

            <button
              className="iconbtn"
              onClick={() => {
                audio.current.currentTime = Math.max(0, audio.current.currentTime - 15);
              }}
              aria-label="Back 15 seconds"
            >
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M11 5L6 9l5 4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M6 9h7a5 5 0 010 10H9" strokeLinecap="round" />
              </svg>
            </button>

            <button
              className="rate"
              onClick={() => setRate((r) => (r === 1 ? 1.25 : r === 1.25 ? 1.5 : 1))}
            >
              {rate}×
            </button>
          </div>

          <button
            type="button"
            className="progbar"
            aria-label="Seek audio"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const ratio = (e.clientX - r.left) / r.width;
              const d = dur || current.message.duration || 0;
              if (audio.current && d)
                audio.current.currentTime = Math.max(0, Math.min(1, ratio)) * d;
            }}
          >
            <div className="progfill" style={{ width: `${dur ? (pos / dur) * 100 : 0}%` }} />
          </button>
          <div className="times">
            <span>{fmt(pos)}</span>
            <span>{dur ? `−${fmt(dur - pos)}` : "—"}</span>
          </div>
        </div>
      )}
    </>
  );
}
