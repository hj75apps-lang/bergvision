import { MIN_CLIP_MS, uid, type Clip } from "./timeline";

/** Ferramentas de edição da linha do tempo (Fase 3). */
export type EditTool = "select" | "razor" | "roll" | "slip" | "slide";

export const TOOL_LABEL: Record<EditTool, string> = {
  select: "Seleção",
  razor: "Corte",
  roll: "Roll",
  slip: "Slip",
  slide: "Slide",
};

export const TOOL_KEY: Record<EditTool, string> = {
  select: "V",
  razor: "C",
  roll: "N",
  slip: "Y",
  slide: "U",
};

/** Tolerância para considerar dois clipes "colados" (1 frame a 30 fps). */
export const ADJ_TOLERANCE_MS = 34;

const end = (c: Clip) => c.start + c.duration;
const hasSource = (c: Clip) => c.sourceDuration != null;

/**
 * Divide o clipe no tempo `at` (ms da sequência) em dois segmentos independentes.
 * Retorna null se o ponto estiver fora ou deixaria um lado menor que o mínimo.
 */
export function splitClip(c: Clip, at: number): [Clip, Clip] | null {
  const t = Math.round(at);
  if (t - c.start < MIN_CLIP_MS || end(c) - t < MIN_CLIP_MS) return null;
  const left: Clip = { ...c, duration: t - c.start };
  const right: Clip = {
    ...c,
    id: uid(),
    start: t,
    duration: end(c) - t,
    inPoint: hasSource(c) ? c.inPoint + (t - c.start) : 0,
  };
  return [left, right];
}

/**
 * Corta no cursor. Se houver selecionados, corta só eles; senão, todos sob o cursor.
 * Trilhas bloqueadas nunca são cortadas.
 */
export function splitAtPlayhead(
  clips: Clip[],
  at: number,
  selected: string[],
  locked: Set<string>,
): { clips: Clip[]; created: string[] } {
  const under = clips.filter((c) => !locked.has(c.trackId) && at > c.start && at < end(c));
  const targets = new Set(
    (selected.length ? under.filter((c) => selected.includes(c.id)) : under).map((c) => c.id),
  );
  const out: Clip[] = [];
  const created: string[] = [];
  for (const c of clips) {
    if (!targets.has(c.id)) { out.push(c); continue; }
    const r = splitClip(c, at);
    if (!r) { out.push(c); continue; }
    out.push(r[0], r[1]);
    created.push(r[1].id);
  }
  return { clips: out, created };
}

function mergeIntervals(list: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...list].sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else out.push([iv[0], iv[1]]);
  }
  return out;
}

/** Quanto deslocar um clipe que começa em `start`, dados os intervalos removidos. */
function shiftFor(start: number, removed: Array<[number, number]>): number {
  let s = 0;
  for (const [a, b] of removed) if (b <= start + 0.5) s += b - a;
  return s;
}

/**
 * Exclusão com fechamento de espaço (ripple delete).
 * - allTracks=false: fecha o espaço só na trilha de cada clipe excluído.
 * - allTracks=true: fecha o espaço em todas as trilhas desbloqueadas, mantendo o sincronismo.
 */
export function rippleDelete(
  clips: Clip[],
  ids: string[],
  locked: Set<string>,
  allTracks = false,
): Clip[] {
  const del = clips.filter((c) => ids.includes(c.id) && !locked.has(c.trackId));
  if (!del.length) return clips;
  const delIds = new Set(del.map((c) => c.id));
  const all = mergeIntervals(del.map((c) => [c.start, end(c)]));
  const perTrack = new Map<string, Array<[number, number]>>();
  for (const c of del) {
    const l = perTrack.get(c.trackId) ?? [];
    l.push([c.start, end(c)]);
    perTrack.set(c.trackId, l);
  }
  for (const [k, v] of perTrack) perTrack.set(k, mergeIntervals(v));
  return clips
    .filter((c) => !delIds.has(c.id))
    .map((c) => {
      if (locked.has(c.trackId)) return c;
      const removed = allTracks ? all : perTrack.get(c.trackId);
      if (!removed) return c;
      const sh = shiftFor(c.start, removed);
      return sh ? { ...c, start: Math.max(0, c.start - sh) } : c;
    });
}

/** Encontra vizinhos colados na mesma trilha. */
export function neighbors(clips: Clip[], c: Clip): { prev: Clip | null; next: Clip | null } {
  const same = clips.filter((x) => x.trackId === c.trackId && x.id !== c.id);
  const prev = same.find((x) => Math.abs(end(x) - c.start) <= ADJ_TOLERANCE_MS) ?? null;
  const next = same.find((x) => Math.abs(x.start - end(c)) <= ADJ_TOLERANCE_MS) ?? null;
  return { prev, next };
}

/** Limite livre (sem colar) para a esquerda e direita do clipe na trilha. */
function freeRoom(clips: Clip[], c: Clip): { left: number; right: number } {
  const same = clips.filter((x) => x.trackId === c.trackId && x.id !== c.id);
  const before = same.filter((x) => end(x) <= c.start + 0.5).reduce((m, x) => Math.max(m, end(x)), 0);
  const after = same.filter((x) => x.start >= end(c) - 0.5).reduce((m, x) => Math.min(m, x.start), Infinity);
  return { left: c.start - before, right: after - end(c) };
}

/**
 * Roll: move o ponto de corte entre `left` e `right` (colados) em `delta` ms.
 * O fim de `right` e o início de `left` ficam fixos: duração total preservada.
 */
export function rollEdit(left: Clip, right: Clip, delta: number): [Clip, Clip] {
  let d = Math.round(delta);
  // limites: tamanho mínimo de cada lado
  d = Math.max(d, MIN_CLIP_MS - left.duration);
  d = Math.min(d, right.duration - MIN_CLIP_MS);
  // limites do arquivo original
  if (hasSource(left)) d = Math.min(d, (left.sourceDuration as number) - left.inPoint - left.duration);
  if (hasSource(right)) d = Math.max(d, -right.inPoint);
  const cut = end(left) + d;
  return [
    { ...left, duration: cut - left.start },
    {
      ...right,
      start: cut,
      duration: end(right) - cut,
      inPoint: hasSource(right) ? right.inPoint + d : 0,
    },
  ];
}

/**
 * Slip: muda o trecho exibido do arquivo sem mudar posição nem duração.
 * `delta` positivo mostra conteúdo posterior do arquivo.
 */
export function slipEdit(c: Clip, delta: number): Clip {
  if (!hasSource(c)) return c;
  const max = Math.max(0, (c.sourceDuration as number) - c.duration);
  const inPoint = Math.min(max, Math.max(0, Math.round(c.inPoint + delta)));
  return { ...c, inPoint };
}

/**
 * Slide: move o clipe entre os vizinhos. O vizinho anterior estica/encolhe o fim e o
 * próximo ajusta o início, preservando a duração total. Sem vizinho colado, o clipe
 * só anda até o espaço livre disponível.
 */
export function slideEdit(
  clips: Clip[],
  c: Clip,
  delta: number,
): { clip: Clip; prev: Clip | null; next: Clip | null } {
  const { prev, next } = neighbors(clips, c);
  const room = freeRoom(clips, c);
  let d = Math.round(delta);
  if (prev) {
    d = Math.max(d, MIN_CLIP_MS - prev.duration);
    if (hasSource(prev)) d = Math.min(d, (prev.sourceDuration as number) - prev.inPoint - prev.duration);
  } else {
    d = Math.max(d, -room.left);
  }
  if (next) {
    d = Math.min(d, next.duration - MIN_CLIP_MS);
    if (hasSource(next)) d = Math.max(d, -next.inPoint);
  } else if (Number.isFinite(room.right)) {
    d = Math.min(d, room.right);
  }
  d = Math.max(d, -c.start);
  return {
    clip: { ...c, start: c.start + d },
    prev: prev ? { ...prev, duration: prev.duration + d } : null,
    next: next
      ? { ...next, start: next.start + d, duration: next.duration - d, inPoint: hasSource(next) ? next.inPoint + d : 0 }
      : null,
  };
}

/** Expande uma seleção para incluir todos os clipes dos mesmos grupos. */
export function expandGroups(clips: Clip[], ids: string[]): string[] {
  const groups = new Set(clips.filter((c) => ids.includes(c.id) && c.groupId).map((c) => c.groupId));
  if (!groups.size) return ids;
  const out = new Set(ids);
  for (const c of clips) if (c.groupId && groups.has(c.groupId)) out.add(c.id);
  return [...out];
}

/** Arredonda para o frame mais próximo (30 fps). */
export function snapToFrame(ms: number): number {
  const f = 1000 / 30;
  return Math.round(Math.round(ms / f) * f);
}
