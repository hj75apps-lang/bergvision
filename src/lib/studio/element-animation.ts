/**
 * Animação por componente do Studio (salva em content.elementAnimation).
 * Funções puras: leitura segura da configuração e geração de @keyframes.
 */

export type Keyframe = {
  id: string;
  /** Tempo absoluto em segundos. */
  t: number;
  /** Deslocamento em % do próprio elemento. */
  x: number;
  y: number;
  scale: number;
  rotate: number;
  opacity: number;
};

export type Easing = "ease" | "linear" | "ease-in" | "ease-out" | "ease-in-out" | "smooth" | "bounce";

export type ElementAnimation = {
  entrance: string;
  entranceDuration: number;
  delay: number;
  exit: string;
  exitAt: number | null;
  exitDuration: number;
  easing: Easing;
  /** 0.2–3: multiplica a distância/escala dos efeitos. */
  intensity: number;
  loop: string;
  loopDuration: number;
  keyframes: Keyframe[];
  keyframesLoop: boolean;
};

export const ENTRANCES = ["none", "fade", "up", "down", "left", "right", "zoom", "scale", "flip", "spin", "reveal", "wipe", "typewriter"] as const;
export const EXITS = ["none", "fade", "up", "down", "left", "right", "zoom", "scale"] as const;
export const LOOPS = ["none", "pulse", "float", "shake", "swing", "spin", "blink", "zoom"] as const;
export const EASINGS: Easing[] = ["ease", "linear", "ease-in", "ease-out", "ease-in-out", "smooth", "bounce"];

const EASING_CSS: Record<Easing, string> = {
  ease: "ease",
  linear: "linear",
  "ease-in": "ease-in",
  "ease-out": "ease-out",
  "ease-in-out": "ease-in-out",
  smooth: "cubic-bezier(0.22,1,0.36,1)",
  bounce: "cubic-bezier(0.34,1.56,0.64,1)",
};

export function easingCss(e: Easing): string {
  return EASING_CSS[e] ?? EASING_CSS.smooth;
}

const clamp = (v: unknown, d: number, min: number, max: number): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : d;
  return Math.max(min, Math.min(max, n));
};
const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : d;

export function parseKeyframes(raw: unknown): Keyframe[] {
  if (!Array.isArray(raw)) return [];
  const out: Keyframe[] = [];
  for (const k of raw) {
    if (!k || typeof k !== "object") continue;
    const o = k as Record<string, unknown>;
    out.push({
      id: typeof o.id === "string" ? o.id : `kf-${out.length}`,
      t: clamp(o.t, 0, 0, 120),
      x: clamp(o.x, 0, -500, 500),
      y: clamp(o.y, 0, -500, 500),
      scale: clamp(o.scale, 1, 0, 10),
      rotate: clamp(o.rotate, 0, -3600, 3600),
      opacity: clamp(o.opacity, 1, 0, 1),
    });
  }
  return out.sort((a, b) => a.t - b.t).slice(0, 50);
}

export function parseElementAnimation(raw: unknown): ElementAnimation {
  const a = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const exitAtRaw = a.exitAt;
  return {
    entrance: pick(a.entrance, ENTRANCES, "none"),
    entranceDuration: clamp(a.entranceDuration, 0.8, 0.2, 10),
    delay: clamp(a.delay, 0, 0, 30),
    exit: pick(a.exit, EXITS, "none"),
    exitAt: typeof exitAtRaw === "number" && Number.isFinite(exitAtRaw) ? clamp(exitAtRaw, 0, 0, 120) : null,
    exitDuration: clamp(a.exitDuration, 0.6, 0.2, 10),
    easing: pick(a.easing, EASINGS, "smooth"),
    intensity: clamp(a.intensity, 1, 0.2, 3),
    loop: pick(a.loop, LOOPS, "none"),
    loopDuration: clamp(a.loopDuration, 2, 0.3, 30),
    keyframes: parseKeyframes(a.keyframes),
    keyframesLoop: a.keyframesLoop === true,
  };
}

/** Valida uma animação antes de salvar. Retorna mensagem de erro ou null. */
export function validateAnimation(a: ElementAnimation): string | null {
  if (a.exit !== "none" && a.exitAt !== null && a.exitAt < a.delay + (a.entrance !== "none" ? a.entranceDuration : 0)) {
    return "A saída precisa começar depois que a entrada terminar.";
  }
  const ts = a.keyframes.map((k) => k.t);
  if (new Set(ts).size !== ts.length) return "Dois keyframes não podem ter o mesmo tempo.";
  return null;
}

const kfTransform = (k: Keyframe) =>
  `translate(${k.x}%,${k.y}%) scale(${k.scale}) rotate(${k.rotate}deg)`;

/**
 * Gera @keyframes para os keyframes do elemento. A animação dura do tempo 0
 * até o último keyframe; antes do primeiro keyframe o estado do primeiro é mantido.
 */
export function buildKeyframesCss(name: string, kfs: Keyframe[]): { css: string; duration: number } | null {
  if (kfs.length < 2) return null;
  const end = kfs[kfs.length - 1].t;
  if (end <= 0) return null;
  const steps = kfs.map((k) => {
    const pct = Math.round((k.t / end) * 10000) / 100;
    return `${pct}%{transform:${kfTransform(k)};opacity:${k.opacity}}`;
  });
  if (kfs[0].t > 0) steps.unshift(`0%{transform:${kfTransform(kfs[0])};opacity:${kfs[0].opacity}}`);
  return { css: `@keyframes ${name}{${steps.join("")}}`, duration: end };
}

/** Fim visual do elemento na linha do tempo (s). */
export function elementEnd(a: ElementAnimation, timelineDuration: number): number {
  if (a.exit !== "none" && a.exitAt !== null) return Math.min(timelineDuration, a.exitAt + a.exitDuration);
  return timelineDuration;
}

/** Estado "fora de cena" de um efeito de entrada/saída, já com a intensidade aplicada. */
export function offState(kind: string, intensity: number): string {
  const d = Math.round(30 * intensity * 100) / 100;
  const s = Math.max(0, Math.round((1 - 0.4 * intensity) * 100) / 100);
  switch (kind) {
    case "fade": return "opacity:0";
    case "up": return `opacity:0;transform:translateY(${d}%)`;
    case "down": return `opacity:0;transform:translateY(-${d}%)`;
    case "left": return `opacity:0;transform:translateX(${d}%)`;
    case "right": return `opacity:0;transform:translateX(-${d}%)`;
    case "zoom": return `opacity:0;transform:scale(${s})`;
    case "scale": return `transform:scale(0)`;
    case "flip": return "opacity:0;transform:perspective(600px) rotateY(90deg)";
    case "spin": return `opacity:0;transform:rotate(-${Math.round(180 * intensity)}deg) scale(.5)`;
    case "reveal": return "clip-path:inset(0 100% 0 0);-webkit-clip-path:inset(0 100% 0 0)";
    case "wipe": return "clip-path:inset(100% 0 0 0);-webkit-clip-path:inset(100% 0 0 0)";
    case "typewriter": return "clip-path:inset(0 100% 0 0);-webkit-clip-path:inset(0 100% 0 0)";
    default: return "opacity:1";
  }
}

const ON_STATE = "opacity:1;transform:none;clip-path:inset(0 0 0 0);-webkit-clip-path:inset(0 0 0 0)";

/** @keyframes de entrada (fora → dentro) ou saída (dentro → fora). */
export function presetKeyframesCss(name: string, kind: string, mode: "in" | "out", intensity: number): string {
  const off = offState(kind, intensity);
  return mode === "in"
    ? `@keyframes ${name}{from{${off}}to{${ON_STATE}}}`
    : `@keyframes ${name}{from{${ON_STATE}}to{${off}}}`;
}
