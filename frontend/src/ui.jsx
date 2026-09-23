import React from "react";
import { toneFor } from "./api";

export const Logo = () => (
  <div className="logobar">
    <img
      className="logo"
      src="/logo.png"
      alt="Grace Edge Ministries. Dead Raisers. It's from here to the uttermost."
    />
  </div>
);

export function Cover({ item, size = 62 }) {
  if (item.cover_url) {
    return (
      <img
        className="cover"
        src={item.cover_url}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
      />
    );
  }
  const tone = toneFor(item.id || "x");
  const single = item.kind === "single";
  const parts = Math.min((item.messages || []).length || 1, 6);
  const gid = `g-${(item.id || "x").replace(/[^a-zA-Z0-9]/g, "")}-${size}`;
  return (
    <svg className="cover" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={tone[0]} />
          <stop offset="100%" stopColor={tone[1]} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="8" fill={`url(#${gid})`} />
      {single ? (
        <>
          <circle
            cx="32"
            cy="32"
            r="17"
            fill="none"
            stroke="#fff"
            strokeWidth="1.6"
            opacity="0.45"
          />
          <path d="M29 25l12 7-12 7z" fill="#fff" opacity="0.9" />
        </>
      ) : (
        Array.from({ length: parts }).map((_, i) => (
          <circle
            key={i}
            cx="13"
            cy="51"
            r={11 + i * 11}
            fill="none"
            stroke="#fff"
            strokeWidth="1.6"
            opacity={0.5 - i * 0.06}
          />
        ))
      )}
    </svg>
  );
}

export const WhatsApp = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.17c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.53.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.44.13-.15.17-.25.25-.41.09-.17.04-.31-.02-.44-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.16 0-.43.06-.65.31-.22.24-.85.83-.85 2.03s.87 2.35.99 2.51c.12.17 1.72 2.62 4.16 3.68.58.25 1.03.4 1.39.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.68-1.18.2-.58.2-1.07.14-1.18-.06-.1-.22-.16-.47-.29Z" />
  </svg>
);

export const PlayIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M7 4l13 8-13 8z" />
  </svg>
);

export const PauseIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
);

export const Spinner = ({ size = 12 }) => (
  <svg
    className="spin"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
  >
    <path d="M12 3a9 9 0 019 9" strokeLinecap="round" />
  </svg>
);

export const DownloadIcon = ({ size = 12 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
  >
    <path
      d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M4 20h16"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const BackIcon = ({ size = 13 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.6"
  >
    <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Back = ({ onClick, label }) => (
  <button className="back" onClick={onClick}>
    <BackIcon /> {label}
  </button>
);

export const HomeIcon = ({ size = 21 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
  >
    <path
      d="M3.6 10.4 12 3.6l8.4 6.8V20a1 1 0 0 1-1 1h-4.6v-6.1H9.2V21H4.6a1 1 0 0 1-1-1z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const PinIcon = ({ size = 21 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
  >
    <path
      d="M12 21.2s7-5.6 7-11.2a7 7 0 1 0-14 0c0 5.6 7 11.2 7 11.2Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="9.8" r="2.6" />
  </svg>
);

export const TelegramIcon = ({ size = 21 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
  >
    <path
      d="M21.2 4.3 2.9 11.2c-.7.3-.7 1.2 0 1.4l4.6 1.5 1.7 5.1c.2.6 1 .8 1.4.3l2.5-2.6 4.7 3.4c.5.4 1.3.1 1.4-.6l2.7-14.4c.1-.7-.6-1.2-1.2-1Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="m7.5 14.1 10.9-7.4-6.9 8.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const PhoneIcon = ({ size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.1"
  >
    <path
      d="M6.2 3.5h3l1.5 3.8-2 1.4a11.5 11.5 0 0 0 5.6 5.6l1.4-2 3.8 1.5v3a1.6 1.6 0 0 1-1.8 1.6C10.4 17.7 6.3 13.6 4.6 5.3A1.6 1.6 0 0 1 6.2 3.5Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const Field = ({ label, hint, children }) => (
  <div className="field">
    <label className="label">{label}</label>
    {hint && <div className="hinttop">{hint}</div>}
    {children}
  </div>
);

export const Progress = ({ value, label = "Uploading" }) => (
  <div className="prog">
    <div className="progtop">
      <span>{label}</span>
      <span>{Math.min(100, Math.round(value))}%</span>
    </div>
    <div className="progtrack">
      <div className="progline" style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  </div>
);
