import React, { useState, useEffect } from "react";

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export default function InstallPrompt() {
  const [prompt, setPrompt] = useState(null);
  const [showIOS, setShowIOS] = useState(false);
  const [hidden, setHidden] = useState(isStandalone());

  useEffect(() => {
    if (isStandalone()) return;

    const onPrompt = (e) => {
      e.preventDefault();
      setPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setHidden(true));

    /* iPhone never fires that event, so offer the manual route instead */
    if (isIOS()) {
      const t = setTimeout(() => setShowIOS(true), 2500);
      return () => {
        clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onPrompt);
      };
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (hidden) return null;
  if (!prompt && !showIOS) return null;

  const install = async () => {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setHidden(true);
    setPrompt(null);
  };

  return (
    <div className="install">
      <img src="/icon-192.png" alt="" className="installicon" />
      <div className="installtxt">
        <div className="installtitle">Keep Grace Edge on your phone</div>
        <div className="installsub">
          {prompt
            ? "Add it to your home screen and open it like any other app."
            : "Tap Share at the bottom of Safari, then Add to Home Screen."}
        </div>
      </div>
      {prompt ? (
        <button className="installbtn" onClick={install}>
          Add
        </button>
      ) : (
        <button className="installbtn" onClick={() => setHidden(true)}>
          Got it
        </button>
      )}
      <button className="installx" onClick={() => setHidden(true)} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
