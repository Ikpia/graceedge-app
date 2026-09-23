import React, { useState, useEffect, useRef, useCallback } from "react";
import { PHOTOS } from "./photos";

const HOLD = 5200; /* how long each photo stays before the next one comes in */

function useCalmMotion() {
  const [calm, setCalm] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => setCalm(q.matches);
    set();
    q.addEventListener("change", set);
    return () => q.removeEventListener("change", set);
  }, []);
  return calm;
}

export default function Carousel({ active }) {
  const [i, setI] = useState(0);
  const [tick, setTick] = useState(0); /* flips the animation so it replays every time */
  const [held, setHeld] = useState(false);
  const calm = useCalmMotion();
  const rail = useRef(null);
  const touch = useRef(null);

  const go = useCallback((next) => {
    setI(((next % PHOTOS.length) + PHOTOS.length) % PHOTOS.length);
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!active || held || calm) return;
    const t = setTimeout(() => go(i + 1), HOLD);
    return () => clearTimeout(t);
  }, [i, active, held, calm, go]);

  /* keep the little rail of thumbnails following along */
  useEffect(() => {
    const el = rail.current?.children[i];
    if (el)
      el.scrollIntoView({ behavior: calm ? "auto" : "smooth", inline: "center", block: "nearest" });
  }, [i, calm]);

  const onStart = (e) => {
    touch.current = e.touches[0].clientX;
    setHeld(true);
  };
  const onEnd = (e) => {
    setHeld(false);
    if (touch.current == null) return;
    const dx = e.changedTouches[0].clientX - touch.current;
    if (Math.abs(dx) > 44) go(i + (dx < 0 ? 1 : -1));
    touch.current = null;
  };

  return (
    <div className="carousel">
      <div
        className="cstage"
        onTouchStart={onStart}
        onTouchEnd={onEnd}
        onMouseEnter={() => setHeld(true)}
        onMouseLeave={() => setHeld(false)}
      >
        {PHOTOS.map((p, n) => (
          <img
            key={p.src}
            className="cimg"
            src={p.src}
            alt={p.caption}
            data-on={n === i}
            loading={n < 2 ? "eager" : "lazy"}
            decoding="async"
            style={{
              objectPosition: p.pos || "center",
              animationName: n === i && !calm ? (tick % 2 ? "kbA" : "kbB") : "none",
            }}
          />
        ))}

        <div className="cscrim" />

        <div className="ccap" key={`cap-${i}`}>
          <span className="ccapn">{PHOTOS[i].n}</span>
          <span className="ccaptxt">{PHOTOS[i].caption}</span>
        </div>

        <div className="cbars" role="tablist" aria-label="Church photos">
          {PHOTOS.map((p, n) => (
            <button
              key={p.n}
              className="cbar"
              data-on={n === i}
              onClick={() => go(n)}
              aria-label={`Photo ${n + 1}: ${p.caption}`}
              aria-selected={n === i}
              role="tab"
            >
              <span className="cbartrack">
                {n === i && (
                  <span
                    key={`fill-${tick}`}
                    className="cbarfill"
                    style={{
                      animationDuration: `${HOLD}ms`,
                      animationPlayState: held || calm ? "paused" : "running",
                    }}
                  />
                )}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="crail" ref={rail}>
        {PHOTOS.map((p, n) => (
          <button
            key={p.n}
            className="cthumb"
            data-on={n === i}
            onClick={() => go(n)}
            aria-label={p.caption}
          >
            <img
              src={p.thumb}
              alt=""
              loading="lazy"
              decoding="async"
              style={{ objectPosition: p.pos || "center" }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
