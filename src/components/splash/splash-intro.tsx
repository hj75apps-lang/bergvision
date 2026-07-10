import { useEffect, useState } from "react";
import introAsset from "@/assets/berg-intro.gif.asset.json";

const DURATION_MS = 6000;
const FADE_MS = 400;

export function SplashIntro({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const outTimer = window.setTimeout(() => setLeaving(true), DURATION_MS);
    const doneTimer = window.setTimeout(onDone, DURATION_MS + FADE_MS);
    return () => {
      window.clearTimeout(outTimer);
      window.clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black transition-opacity duration-[400ms] ease-out"
      style={{ opacity: leaving ? 0 : 1 }}
      aria-hidden={leaving}
    >
      <img
        src={introAsset.url}
        alt=""
        className="max-h-full max-w-full object-contain"
        draggable={false}
      />
    </div>
  );
}