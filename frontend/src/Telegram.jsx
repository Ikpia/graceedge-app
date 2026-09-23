import React from "react";
import { Logo, TelegramIcon } from "./ui";
import { CHURCH } from "./photos";

export default function Telegram({ active }) {
  return (
    <section className="tab" style={{ display: active ? "flex" : "none" }}>
      <Logo />
      <div className="scroll">
        <div className="pad tg">
          <div className="eyebrow flush">Telegram</div>
          <h1 className="h1 tgh1">Join us live every service &amp; pray with us every morning</h1>

          <div className="tgshot">
            <img
              src="/photos/telegram.jpg"
              alt="The Grace Edge Ministries channel on Telegram"
              loading="lazy"
              decoding="async"
            />
          </div>

          <p className="tgtext">
            Would you love to join our Telegram Platform where you can listen to our Pastor&apos;s
            message, live and also join us to pray every morning, then click the link below now to
            join our Telegram Platform.
          </p>

          <a className="tgbtn" href={CHURCH.telegram} target="_blank" rel="noreferrer">
            <TelegramIcon size={17} /> Join on Telegram
          </a>
          <div className="tghandle">{CHURCH.telegramHandle}</div>
        </div>
      </div>
    </section>
  );
}
