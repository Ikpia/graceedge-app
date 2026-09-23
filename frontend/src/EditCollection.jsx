import React, { useState, useRef } from "react";
import {
  MONTHS,
  yearChoices,
  updateCollection,
  setCollectionTopics,
  updateMessage,
  renumber,
  deleteMessage,
  uploadAudio,
  uploadCover,
} from "./api";
import { Back, Field, Progress } from "./ui";
import { compressAudio, worthCompressing } from "./compress";

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

export default function EditCollection({ collection, topics, setTopics, onClose, onSaved, say }) {
  const [form, setForm] = useState({
    title: collection.title,
    description: collection.description || "",
    month: collection.month,
    year: collection.year,
    cover_url: collection.cover_url || null,
    topics: [...(collection.topics || [])],
  });
  const [msgs, setMsgs] = useState(
    [...collection.messages].map((m) => ({
      ...m,
      telegram_url: m.telegram_url || "",
      dirty: false,
    }))
  );
  const [newTopic, setNewTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("Saving");
  const [err, setErr] = useState("");
  const [replacing, setReplacing] = useState(null);

  const coverInput = useRef(null);
  const audioInput = useRef(null);

  const isSeries = collection.kind === "series";
  const hasTelegramColumn = collection.messages.some((m) =>
    Object.prototype.hasOwnProperty.call(m, "telegram_url")
  );

  const toggleTopic = (t) =>
    setForm((f) => ({
      ...f,
      topics: f.topics.includes(t) ? f.topics.filter((x) => x !== t) : [...f.topics, t],
    }));

  const addTopic = () => {
    const t = newTopic.trim().toLowerCase();
    if (!t) return;
    if (!topics.includes(t)) setTopics((old) => [...old, t].sort());
    if (!form.topics.includes(t)) setForm((f) => ({ ...f, topics: [...f.topics, t] }));
    setNewTopic("");
  };

  const editMsg = (id, patch) =>
    setMsgs((L) => L.map((m) => (m.id === id ? { ...m, ...patch, dirty: true } : m)));

  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= msgs.length) return;
    const copy = [...msgs];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setMsgs(copy.map((m, k) => ({ ...m, part: k + 1 })));
  };

  const removeMsg = async (m) => {
    if (!window.confirm(`Delete "${m.title}"? This cannot be undone.`)) return;
    try {
      await deleteMessage(m.id);
      setMsgs((L) => L.filter((x) => x.id !== m.id).map((x, k) => ({ ...x, part: k + 1 })));
      say("Message deleted");
    } catch (e) {
      setErr(e.message);
    }
  };

  const pickCover = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      setBusy(true);
      setLabel("Uploading picture");
      setProgress(40);
      const url = await uploadCover(f);
      setProgress(100);
      setForm((x) => ({ ...x, cover_url: url }));
      say("Picture updated. Remember to save.");
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
      setProgress(0);
      setLabel("Saving");
    }
  };

  const replaceAudio = async (e) => {
    const f = e.target.files?.[0];
    const id = replacing;
    if (!f || !id) return;
    setErr("");
    try {
      setBusy(true);
      let file = f;
      const dur = await readDuration(f);
      if (worthCompressing(f, dur)) {
        setLabel("Compressing");
        try {
          file = await compressAudio(f, setProgress, setLabel);
        } catch (_ce) {
          setLabel("Uploading audio");
        }
      }
      setLabel("Uploading audio");
      setProgress(0);
      const key = await uploadAudio(file, setProgress);
      await updateMessage(id, { audio_key: key, duration: dur });
      setMsgs((L) => L.map((m) => (m.id === id ? { ...m, audio_key: key, duration: dur } : m)));
      say("Audio replaced");
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
      setProgress(0);
      setLabel("Saving");
      setReplacing(null);
      if (audioInput.current) audioInput.current.value = "";
    }
  };

  const save = async () => {
    if (!form.title.trim()) return setErr("A title is needed.");
    if (!form.topics.length) return setErr("Pick at least one topic.");
    setErr("");
    setBusy(true);
    setLabel("Saving");
    setProgress(50);
    try {
      await updateCollection(collection.id, form);
      await setCollectionTopics(collection.id, form.topics);
      for (const m of msgs) {
        if (m.dirty) {
          const patch = {
            title: m.title,
            summary: m.summary,
          };
          if (hasTelegramColumn || m.telegram_url.trim()) patch.telegram_url = m.telegram_url;
          await updateMessage(m.id, patch);
        }
      }
      if (isSeries) await renumber(msgs);
      setProgress(100);
      say("Changes saved");
      onSaved();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  return (
    <div className="pad">
      <Back onClick={onClose} label="Dashboard" />
      <div className="eyebrow" style={{ padding: "14px 0 0" }}>
        Editing
      </div>
      <h1 className="h1">{collection.title}</h1>

      {err && (
        <div className="err" style={{ marginBottom: 14 }}>
          {err}
        </div>
      )}

      <Field label={isSeries ? "Series title" : "Message title"}>
        <input
          className="input"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </Field>

      {isSeries && (
        <Field label="What is this series about">
          <textarea
            className="input area"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
      )}

      <Field label="When was it preached">
        <div className="two">
          <select
            className="input"
            value={form.month}
            onChange={(e) => setForm({ ...form, month: Number(e.target.value) })}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={form.year}
            onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
          >
            {yearChoices(collection.year).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </Field>

      <Field label="Topics">
        <div className="chips wrap">
          {topics.map((t) => (
            <button
              key={t}
              className="chip"
              data-on={form.topics.includes(t)}
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

      <Field label="Cover picture">
        <div className="coverrow">
          <div
            className="coverbox"
            style={form.cover_url ? { backgroundImage: `url(${form.cover_url})` } : {}}
          >
            {!form.cover_url && "No picture"}
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
              Change picture
            </button>
            {form.cover_url && (
              <button
                className="ghost danger"
                style={{ marginTop: 8 }}
                onClick={() => setForm({ ...form, cover_url: null })}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </Field>

      <div className="eyebrow" style={{ padding: "6px 0 10px" }}>
        {isSeries ? `${msgs.length} parts` : "The message"}
      </div>

      <input
        ref={audioInput}
        type="file"
        accept="audio/*"
        onChange={replaceAudio}
        style={{ display: "none" }}
      />

      {msgs.map((m, i) => (
        <div key={m.id} className="editmsg">
          <div className="editmsgtop">
            {isSeries && (
              <div
                className="num"
                style={{ background: "var(--ink)", color: "#fff", borderColor: "transparent" }}
              >
                {String(i + 1).padStart(2, "0")}
              </div>
            )}
            <div className="meta" style={{ flex: 1 }}>
              {fmtMin(m.duration)}
            </div>
            {isSeries && msgs.length > 1 && (
              <>
                <button
                  className="x"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  className="x"
                  onClick={() => move(i, 1)}
                  disabled={i === msgs.length - 1}
                  aria-label="Move down"
                >
                  ↓
                </button>
              </>
            )}
          </div>

          <input
            className="input"
            style={{ marginBottom: 8 }}
            value={m.title}
            onChange={(e) => editMsg(m.id, { title: e.target.value })}
            placeholder="Title"
          />
          <textarea
            className="input area"
            style={{ marginBottom: 8 }}
            value={m.summary}
            onChange={(e) => editMsg(m.id, { summary: e.target.value })}
            placeholder="Summary"
          />
          <input
            className="input"
            value={m.telegram_url}
            onChange={(e) => editMsg(m.id, { telegram_url: e.target.value })}
            placeholder="Telegram post link, optional"
          />

          <div className="rowacts" style={{ marginTop: 9 }}>
            <button
              className="ghost"
              onClick={() => {
                setReplacing(m.id);
                audioInput.current?.click();
              }}
            >
              Replace audio
            </button>
            <button className="ghost danger" onClick={() => removeMsg(m)}>
              Delete
            </button>
          </div>
        </div>
      ))}

      {busy ? (
        <Progress value={progress} label={label} />
      ) : (
        <button className="btn full" onClick={save} style={{ marginTop: 10 }}>
          Save changes
        </button>
      )}
      <p className="hint">
        Deleting a message happens straight away. Everything else saves when you tap the button.
      </p>
    </div>
  );
}
