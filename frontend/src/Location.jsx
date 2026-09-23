import React from "react";
import { Logo, PinIcon, PhoneIcon } from "./ui";
import Carousel from "./Carousel";
import { CHURCH } from "./photos";

export default function Location({ active }) {
  return (
    <section className="tab" style={{ display: active ? "flex" : "none" }}>
      <Logo />
      <div className="scroll">
        <Carousel active={active} />

        <div className="pad visit">
          <div className="eyebrow flush">Visit us</div>
          <h1 className="h1">Come and worship with us</h1>
          <p className="p">
            Everybody is welcome. Come as you are, come with your family, come with a friend.
          </p>

          <div className="eyebrow flush">Service times</div>
          <div className="days">
            {CHURCH.services.map((s) => (
              <div className="day" key={s.day}>
                <span className="daydot" />
                <span className="dayname">{s.day}</span>
                <span className="daytime">{s.time}</span>
              </div>
            ))}
          </div>

          <div className="eyebrow flush">Where we are</div>
          <div className="addr">
            <span className="addricon">
              <PinIcon size={16} />
            </span>
            <div>
              {CHURCH.address.map((line, n) => (
                <div className="addrline" key={n} data-lead={n === 0}>
                  {line}
                </div>
              ))}
            </div>
          </div>

          <a className="btn full center-row" href={CHURCH.maps} target="_blank" rel="noreferrer">
            <PinIcon size={15} /> Open in Maps
          </a>

          <a className="ghost wide callbtn" href={`tel:${CHURCH.phoneDial}`}>
            <PhoneIcon size={14} /> Call {CHURCH.phone}
          </a>
          <div className="hint center">Any question at all, give us a ring.</div>
        </div>
      </div>
    </section>
  );
}
