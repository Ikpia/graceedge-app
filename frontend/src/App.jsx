import React, { useState, useCallback } from "react";
import Listen from "./Listen";
import Location from "./Location";
import Telegram from "./Telegram";
import { HomeIcon, PinIcon, TelegramIcon } from "./ui";

const TABS = [
  { id: "home", label: "Messages", Icon: HomeIcon },
  { id: "visit", label: "Grace Edge", Icon: PinIcon },
  { id: "telegram", label: "Join Us", Icon: TelegramIcon },
];

export default function App() {
  const [tab, setTab] = useState("home");
  const [hasPlayer, setHasPlayer] = useState(false);
  const onPlayer = useCallback((on) => setHasPlayer(on), []);

  return (
    <div className="phone" data-player={hasPlayer}>
      <Listen active={tab === "home"} onPlayer={onPlayer} />
      <Location active={tab === "visit"} />
      <Telegram active={tab === "telegram"} />

      <nav className="tabbar">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className="tabbtn"
            data-on={tab === id}
            onClick={() => setTab(id)}
            aria-current={tab === id ? "page" : undefined}
          >
            <Icon size={21} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
