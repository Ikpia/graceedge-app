import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  supabase,
  loadLegacyLibrary as loadLibrary,
  loadTopics,
  when,
  MONTHS,
  yearChoices,
  uploadAudio,
  uploadCover,
  createCollection,
  addMessage,
  deleteCollection,
} from "./api";
import { Logo, Back, Field, Progress } from "./ui";
import EditCollection from "./EditCollection";
import { compressAudio, estimateMB, worthCompressing } from "./compress";

const YEARS = yearChoices();
const fmtMin = (s) => (s ? `${Math.floor(s / 60)} min` : "—");

const readDuration = (file) =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => {
      const d = Math.round(a.duration);
      URL.revokeObjectURL(url);
      resolve(isFinite(d) ? d : null);
    };
    a.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    a.src = url;
  });

export default function Admin() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [authErr, setAuthErr] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const [screen, setScreen] = useState("dashboard");
  const [library, setLibrary] = useState([]);
  const [topics, setTopics] = useState([]);
  const [toast, setToast] = useState("");
  const [err, setErr] = useState("");

  const blank = {
    kind: "series",
    title: "",
    description: "",
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    topics: [],
    cover_url: null,
    coverPreview: null,
    messages: [],
  };
  const [draft, setDraft] = useState(blank);
  const [newTopic, setNewTopic] = useState("");
  const [addingTo, setAddingTo] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const blankPart = {
    title: "",
    summary: "",
    telegram_url: "",
    file: null,
    duration: null,
    size: null,
  };
  const [part, setPart] = useState(blankPart);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progLabel, setProgLabel] = useState("Uploading");
  const [compress, setCompress] = useState(true);

  const audioInput = useRef(null);
  const coverInput = useRef(null);

  const say = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 2800);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = () => {
    loadLibrary()
      .then(setLibrary)
      .catch((e) => setErr(e.message));
    loadTopics()
      .then(setTopics)
      .catch(() => {});
  };
  useEffect(() => {
    if (session) refresh();
  }, [session]);

  const signIn = async () => {
    setAuthBusy(true);
    setAuthErr("");
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: pw,
    });
    setAuthBusy(false);
    if (error) setAuthErr(error.message);
    else setPw("");
  };

  const reset = async () => {
    if (!email.includes("@"))
      return setAuthErr("Type your email address first, then tap this again.");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/admin`,
    });
    setAuthErr(error ? error.message : "Check your inbox for a reset link.");
  };

  const pickAudio = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const d = await readDuration(f);
    setPart((p) => ({
      ...p,
      file: f,
      duration: d,
      size: f.size / (1024 * 1024),
      title: p.title || f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
    }));
  };

  const pickCover = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setDraft((d) => ({ ...d, coverPreview: URL.createObjectURL(f) }));
    try {
      setBusy(true);
      setProgLabel("Uploading picture");
      setProgress(40);
      const url = await uploadCover(f);
      setProgress(100);
      setDraft((d) => ({ ...d, cover_url: url }));
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
      setProgress(0);
      setProgLabel("Uploading");
    }
  };

  const toggleTopic = (t) =>
    setDraft((d) => ({
      ...d,
      topics: d.topics.includes(t) ? d.topics.filter((x) => x !== t) : [...d.topics, t],
    }));

  const addTopic = () => {
    const t = newTopic.trim().toLowerCase();
    if (!t) return;
    if (!topics.includes(t)) setTopics((old) => [...old, t].sort());
    if (!draft.topics.includes(t)) setDraft((d) => ({ ...d, topics: [...d.topics, t] }));
    setNewTopic("");
  };

  const partReady = part.file && part.title.trim() && part.summary.trim();

  /* compress if asked, then send to R2 */
  const prepareAndUpload = async () => {
    let file = part.file;
    if (compress && worthCompressing(file, part.duration)) {
      setProgLabel("Compressing");
      setProgress(0);
      file = await compressAudio(file, setProgress, (stage) => setProgLabel(stage));
    }
    setProgLabel("Uploading audio");
    setProgress(0);
    const key = await uploadAudio(file, setProgress);
    return { key, finalSize: file.size / (1024 * 1024) };
  };

  const attachPart = async () => {
    if (!partReady) return;
    setErr("");
    setBusy(true);
    setProgLabel("Uploading audio");
    try {
      const { key, finalSize } = await prepareAndUpload();
      setDraft((d) => ({
        ...d,
        messages: [
          ...d.messages,
          {
            localId: Math.random().toString(36).slice(2),
            part: d.kind === "series" ? d.messages.length + 1 : null,
            title: part.title.trim(),
            summary: part.summary.trim(),
            telegram_url: part.telegram_url.trim() || null,
            audio_key: key,
            duration: part.duration,
            size: finalSize,
          },
        ],
      }));
      setPart(blankPart);
      if (audioInput.current) audioInput.current.value = "";
      say("Audio uploaded");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const removeDraftPart = (localId) =>
    setDraft((d) => ({
      ...d,
      messages: d.messages
        .filter((m) => m.localId !== localId)
        .map((m, i) => ({ ...m, part: d.kind === "series" ? i + 1 : null })),
    }));

  const canPublish = draft.title.trim() && draft.topics.length > 0 && draft.messages.length > 0;

  const publish = async () => {
    if (!canPublish) return;
    setErr("");
    setBusy(true);
    setProgLabel("Saving");
    setProgress(60);
    try {
      await createCollection(draft);
      setProgress(100);
      setDraft(blank);
      setPart(blankPart);
      refresh();
      setScreen("dashboard");
      say(draft.kind === "series" ? "Series published" : "Message published");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
      setProgress(0);
      setProgLabel("Uploading");
    }
  };

  const target = library.find((c) => c.id === addingTo);

  const publishExtraPart = async () => {
    if (!partReady || !target) return;
    setErr("");
    setBusy(true);
    setProgLabel("Uploading audio");
    try {
      const { key } = await prepareAndUpload();
      setProgLabel("Saving");
      await addMessage(target.id, target.messages.length + 1, {
        title: part.title.trim(),
        summary: part.summary.trim(),
        telegram_url: part.telegram_url.trim() || null,
        audio_key: key,
        duration: part.duration,
      });
      setPart(blankPart);
      setAddingTo(null);
      refresh();
      setScreen("dashboard");
      say("Part published");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
      setProgress(0);
      setProgLabel("Uploading");
    }
  };

  const remove = async (id, title) => {
    if (!window.confirm(`Remove "${title}" from the app? This cannot be undone.`)) return;
    try {
      await deleteCollection(id);
      refresh();
      say("Removed from the app");
    } catch (e) {
      setErr(e.message);
    }
  };

  const audioPicker = () => {
    const willShrink = part.file && compress && worthCompressing(part.file, part.duration);
    const target = estimateMB(part.duration);
    return (
      <Field label="Audio file">
        <input
          ref={audioInput}
          type="file"
          accept="audio/*"
          onChange={pickAudio}
          style={{ display: "none" }}
        />
        <button className="ghost wide" onClick={() => audioInput.current?.click()}>
          {part.file ? part.file.name : "Choose an audio file"}
        </button>

        {part.file && (
          <div className="filenote">
            {fmtMin(part.duration)} · {part.size?.toFixed(1)} MB
            {willShrink && target ? ` now, about ${target.toFixed(1)} MB after compressing` : ""}
          </div>
        )}

        <label className="toggle">
          <input
            type="checkbox"
            checked={compress}
            onChange={(e) => setCompress(e.target.checked)}
          />
          <span>Shrink the file before uploading</span>
        </label>
        <div className="hint" style={{ marginTop: 4 }}>
          Cuts the size by about two thirds so your listeners spend less data. Takes a few minutes
          on a phone and is much quicker on a laptop.
        </div>
      </Field>
    );
  };

  const stats = useMemo(
    () => ({
      msgs: library.reduce((a, c) => a + c.messages.length, 0),
      series: library.filter((c) => c.kind === "series").length,
      singles: library.filter((c) => c.kind === "single").length,
    }),
    [library]
  );

  /* ------------------------------ sign in ------------------------------ */
  if (checking)
    return (
      <div className="phone center">
        <div className="empty">One moment…</div>
      </div>
    );

  if (!session) {
    return (
      <div className="phone center">
        <div className="lock">
          <Logo />
          <div className="lockbody">
            <div className="eyebrow" style={{ padding: 0, marginBottom: 6 }}>
              Admin
            </div>
            <h1 className="h1">Sign in to upload</h1>
            <p className="p">
              This screen is only for the team. Everyone else opens the app and goes straight to
              listening.
            </p>

            <div className="lockfield">
              <label className="label" htmlFor="admin-email">
                Email address
              </label>
              <input
                id="admin-email"
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && signIn()}
                placeholder="you@graceedge.org"
                autoComplete="username"
              />
            </div>

            <div className="lockfield">
              <label className="label" htmlFor="admin-password">
                Password
              </label>
              <input
                id="admin-password"
                className="input"
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && signIn()}
                placeholder="Your password"
                autoComplete="current-password"
              />
              {authErr && <div className="err">{authErr}</div>}
            </div>

            <button className="btn full" onClick={signIn} disabled={authBusy}>
              {authBusy ? "Signing in…" : "Sign in"}
            </button>
            <button className="link" onClick={reset}>
              Forgot your password?
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------ signed in ------------------------------ */
  return (
    <div className="phone">
      <Logo />
      <div className="bar">
        <div className="barleft">Admin · {session.user.email}</div>
        <div className="barright">
          <a className="out" href="/" style={{ textDecoration: "none" }}>
            App
          </a>
          <button className="out" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </div>

      <div className="scroll" style={{ paddingBottom: 40 }}>
        {err && (
          <div className="pad" style={{ paddingBottom: 0 }}>
            <div className="err">{err}</div>
          </div>
        )}

        {screen === "dashboard" && (
          <>
            <div className="statrow">
              <div className="stat">
                <div className="statn">{stats.msgs}</div>
                <div className="statl">messages</div>
              </div>
              <div className="stat">
                <div className="statn">{stats.series}</div>
                <div className="statl">series</div>
              </div>
              <div className="stat">
                <div className="statn">{stats.singles}</div>
                <div className="statl">singles</div>
              </div>
            </div>

            <div className="pad" style={{ paddingBottom: 0 }}>
              <button
                className="btn full"
                onClick={() => {
                  setDraft(blank);
                  setScreen("choose");
                }}
              >
                + New upload
              </button>
            </div>

            <div className="eyebrow">In the app now</div>

            {library.length === 0 && <div className="empty">Nothing uploaded yet.</div>}

            {library.map((c) => (
              <div key={c.id} className="row">
                <div
                  className="thumb"
                  style={c.cover_url ? { backgroundImage: `url(${c.cover_url})` } : {}}
                >
                  {!c.cover_url && (c.kind === "series" ? "SER" : "ONE")}
                </div>
                <div className="rowbody">
                  <div className="meta">
                    <span className="flag">
                      {c.kind === "series" ? `${c.messages.length} PARTS` : "SINGLE MESSAGE"}
                    </span>{" "}
                    · {when(c.month, c.year)}
                  </div>
                  <div className="rowtitle">{c.title}</div>
                  <div className="tags">
                    {(c.topics || []).map((t) => (
                      <span key={t} className="tag">
                        {t}
                      </span>
                    ))}
                  </div>
                  <div className="rowacts">
                    {c.kind === "series" && (
                      <button
                        className="ghost"
                        onClick={() => {
                          setAddingTo(c.id);
                          setPart(blankPart);
                          setScreen("addpart");
                        }}
                      >
                        + Add part {c.messages.length + 1}
                      </button>
                    )}
                    <button
                      className="ghost"
                      onClick={() => {
                        setEditingId(c.id);
                        setScreen("edit");
                      }}
                    >
                      Edit
                    </button>
                    <button className="ghost danger" onClick={() => remove(c.id, c.title)}>
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {screen === "edit" && library.find((c) => c.id === editingId) && (
          <EditCollection
            collection={library.find((c) => c.id === editingId)}
            topics={topics}
            setTopics={setTopics}
            say={say}
            onSaved={refresh}
            onClose={() => {
              setEditingId(null);
              setScreen("dashboard");
            }}
          />
        )}

        {screen === "choose" && (
          <div className="pad">
            <Back onClick={() => setScreen("dashboard")} label="Dashboard" />
            <h1 className="h1" style={{ marginTop: 14 }}>
              What are you uploading?
            </h1>
            <button
              className="card"
              onClick={() => {
                setDraft({ ...blank, kind: "series" });
                setScreen("form");
              }}
            >
              <div className="cardtitle">A teaching series</div>
              <div className="cardtext">
                Several messages that belong together. Set it up once, then add Part 1, Part 2 and
                so on as Pastor preaches them.
              </div>
            </button>
            <button
              className="card"
              onClick={() => {
                setDraft({ ...blank, kind: "single" });
                setScreen("form");
              }}
            >
              <div className="cardtitle">One message on its own</div>
              <div className="cardtext">
                A standalone message with no parts. Goes straight into the library.
              </div>
            </button>
          </div>
        )}

        {screen === "form" && (
          <div className="pad">
            <Back onClick={() => setScreen("choose")} label="Back" />
            <h1 className="h1" style={{ marginTop: 14 }}>
              {draft.kind === "series" ? "New series" : "New message"}
            </h1>

            <Field label={draft.kind === "series" ? "Series title" : "Message title"}>
              <input
                className="input"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="The Weight of Waiting"
              />
            </Field>

            {draft.kind === "series" && (
              <Field label="What is this series about" hint="Shows under the title in the app.">
                <textarea
                  className="input area"
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="Four messages on what God is doing in the delay."
                />
              </Field>
            )}

            <Field label="When was it preached">
              <div className="two">
                <select
                  className="input"
                  value={draft.month}
                  onChange={(e) => setDraft({ ...draft, month: Number(e.target.value) })}
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  className="input"
                  value={draft.year}
                  onChange={(e) => setDraft({ ...draft, year: Number(e.target.value) })}
                >
                  {YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </Field>

            <Field label="Topics" hint="Tick what fits. This is how people find it by searching.">
              <div className="chips wrap">
                {topics.map((t) => (
                  <button
                    key={t}
                    className="chip"
                    data-on={draft.topics.includes(t)}
                    onClick={() => toggleTopic(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="two" style={{ marginTop: 10 }}>
                <input
                  className="input"
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTopic()}
                  placeholder="Add a new topic"
                />
                <button className="ghost" onClick={addTopic} style={{ justifyContent: "center" }}>
                  Add topic
                </button>
              </div>
            </Field>

            <Field label="Cover picture" hint="Optional. Square works best.">
              <div className="coverrow">
                <div
                  className="coverbox"
                  style={
                    draft.coverPreview ? { backgroundImage: `url(${draft.coverPreview})` } : {}
                  }
                >
                  {!draft.coverPreview && "No picture"}
                </div>
                <div>
                  <input
                    ref={coverInput}
                    type="file"
                    accept="image/*"
                    onChange={pickCover}
                    style={{ display: "none" }}
                  />
                  <button className="ghost" onClick={() => coverInput.current?.click()}>
                    Choose picture
                  </button>
                </div>
              </div>
            </Field>

            <button
              className="btn full"
              disabled={!draft.title.trim() || draft.topics.length === 0}
              onClick={() => setScreen("parts")}
            >
              {draft.kind === "series" ? "Next, add the messages" : "Next, add the audio"}
            </button>
            {(!draft.title.trim() || draft.topics.length === 0) && (
              <p className="hint">Add a title and at least one topic to continue.</p>
            )}
          </div>
        )}

        {screen === "parts" && (
          <div className="pad">
            <Back onClick={() => setScreen("form")} label="Back to details" />
            <h1 className="h1" style={{ marginTop: 14 }}>
              {draft.title || "Untitled"}
            </h1>
            <p className="p">
              {draft.kind === "series"
                ? "Add each message in the order it was preached. You can add more parts any time after publishing."
                : "Add the audio for this message."}
            </p>

            {draft.messages.map((m) => (
              <div key={m.localId} className="draftpart">
                <div
                  className="num"
                  style={{ background: "var(--ink)", color: "#fff", borderColor: "transparent" }}
                >
                  {m.part ? String(m.part).padStart(2, "0") : "—"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="rowtitle">{m.title}</div>
                  <div className="meta">
                    {fmtMin(m.duration)} · {m.size ? `${m.size.toFixed(1)} MB` : ""}
                  </div>
                </div>
                <button
                  className="x"
                  onClick={() => removeDraftPart(m.localId)}
                  aria-label="Remove"
                >
                  ×
                </button>
              </div>
            ))}

            {(draft.kind === "series" || draft.messages.length === 0) && (
              <div className="panel">
                <div className="paneltitle">
                  {draft.kind === "series" ? `Part ${draft.messages.length + 1}` : "The audio"}
                </div>

                {audioPicker()}

                <Field label="Title">
                  <input
                    className="input"
                    value={part.title}
                    onChange={(e) => setPart({ ...part, title: e.target.value })}
                    placeholder="Learning to Sit Still"
                  />
                </Field>

                <Field
                  label="Summary"
                  hint="Two or three lines. Search reads this, so say what it is really about."
                >
                  <textarea
                    className="input area"
                    value={part.summary}
                    onChange={(e) => setPart({ ...part, summary: e.target.value })}
                    placeholder="Practical teaching on prayer and stillness in a season where nothing seems to be moving."
                  />
                </Field>

                <Field
                  label="Telegram post link"
                  hint="Optional. Used when someone taps Download on Telegram."
                >
                  <input
                    className="input"
                    value={part.telegram_url}
                    onChange={(e) => setPart({ ...part, telegram_url: e.target.value })}
                    placeholder="https://t.me/Dead_Raisers/123"
                  />
                </Field>

                {busy ? (
                  <Progress value={progress} label={progLabel} />
                ) : (
                  <button className="ghost wide" disabled={!partReady} onClick={attachPart}>
                    {draft.kind === "series"
                      ? `Upload part ${draft.messages.length + 1}`
                      : "Upload this audio"}
                  </button>
                )}
              </div>
            )}

            {!busy && (
              <>
                <button className="btn full" disabled={!canPublish} onClick={publish}>
                  Publish to the app
                </button>
                {!canPublish && (
                  <p className="hint">Upload at least one message before publishing.</p>
                )}
              </>
            )}
          </div>
        )}

        {screen === "addpart" && target && (
          <div className="pad">
            <Back
              onClick={() => {
                setAddingTo(null);
                setScreen("dashboard");
              }}
              label="Dashboard"
            />
            <div className="eyebrow" style={{ padding: "14px 0 0" }}>
              Adding to
            </div>
            <h1 className="h1">{target.title}</h1>
            <p className="p">
              This becomes Part {target.messages.length + 1} and appears at the bottom of the
              series.
            </p>

            <div className="panel">
              <div className="paneltitle">Part {target.messages.length + 1}</div>

              {audioPicker()}

              <Field label="Title">
                <input
                  className="input"
                  value={part.title}
                  onChange={(e) => setPart({ ...part, title: e.target.value })}
                />
              </Field>

              <Field label="Summary">
                <textarea
                  className="input area"
                  value={part.summary}
                  onChange={(e) => setPart({ ...part, summary: e.target.value })}
                />
              </Field>

              <Field
                label="Telegram post link"
                hint="Optional. Used when someone taps Download on Telegram."
              >
                <input
                  className="input"
                  value={part.telegram_url}
                  onChange={(e) => setPart({ ...part, telegram_url: e.target.value })}
                  placeholder="https://t.me/Dead_Raisers/123"
                />
              </Field>
            </div>

            {busy ? (
              <Progress value={progress} label={progLabel} />
            ) : (
              <button className="btn full" disabled={!partReady} onClick={publishExtraPart}>
                Publish part {target.messages.length + 1}
              </button>
            )}
          </div>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
