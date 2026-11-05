import { useEffect, useState } from "react";

const cache = new Map<string, Promise<number[] | null>>();
const MAX_BYTES = 60 * 1024 * 1024;
const BARS = 400;

async function computePeaks(url: string): Promise<number[] | null> {
  const Ctx: typeof AudioContext | undefined =
    typeof window === "undefined" ? undefined : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  const res = await fetch(url);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) return null;
  const buf = await res.arrayBuffer();
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(buf);
    const data = audio.getChannelData(0);
    const block = Math.max(1, Math.floor(data.length / BARS));
    const peaks: number[] = [];
    let max = 0;
    for (let i = 0; i < BARS; i++) {
      let p = 0;
      for (let j = i * block; j < Math.min(data.length, (i + 1) * block); j += 8) p = Math.max(p, Math.abs(data[j]));
      peaks.push(p);
      max = Math.max(max, p);
    }
    return max ? peaks.map((p) => p / max) : peaks;
  } finally {
    void ctx.close();
  }
}

/** Picos normalizados (0–1) do áudio, cacheados por caminho do arquivo. */
export function useWaveform(key: string | null | undefined, url: string | null | undefined): number[] | null {
  const [peaks, setPeaks] = useState<number[] | null>(null);
  useEffect(() => {
    if (!key || !url) return;
    let alive = true;
    if (!cache.has(key)) cache.set(key, computePeaks(url).catch(() => null));
    void cache.get(key)!.then((p) => { if (alive) setPeaks(p); });
    return () => { alive = false; };
  }, [key, url]);
  return peaks;
}
