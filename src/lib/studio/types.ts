export type ElementType =
  | "text"
  | "image"
  | "video"
  | "logo"
  | "playlist"
  | "widget"
  | "shape";

export type TemplateElement = {
  id: string;
  template_id: string;
  name?: string | null;
  element_type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z_index: number;
  opacity: number | null;
  locked: boolean | null;
  visible: boolean | null;
  content: Record<string, unknown> | null;
};

export type CanvasTemplate = {
  id: string;
  name: string;
  canvas_width: number;
  canvas_height: number;
  background_color: string | null;
  organization_id: string | null;
  scaling_mode?: string | null;
  background_media_id?: string | null;
};

export const clampPct = (v: number, max = 100) =>
  Math.max(0, Math.min(max, v));

export const ELEMENT_LABELS: Record<ElementType, string> = {
  text: "Texto",
  image: "Imagem",
  video: "Vídeo",
  logo: "Logo",
  playlist: "Playlist",
  widget: "Widget",
  shape: "Forma",
};

// ---------- Layer groups (pastas organizacionais) ----------

export type GroupSeg = { id: string; name: string };

export function getGroupPath(el: TemplateElement): GroupSeg[] {
  const c = (el.content ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(c.groupPath) ? (c.groupPath as unknown[]) : [];
  const out: GroupSeg[] = [];
  for (const item of raw) {
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      if (typeof obj.id === "string" && typeof obj.name === "string") {
        out.push({ id: obj.id, name: obj.name });
      }
    }
  }
  return out;
}

export function commonGroupPrefix(paths: GroupSeg[][]): GroupSeg[] {
  if (paths.length === 0) return [];
  const min = paths.reduce((m, p) => Math.min(m, p.length), Infinity);
  const out: GroupSeg[] = [];
  for (let i = 0; i < min; i++) {
    const id = paths[0][i].id;
    if (paths.every((p) => p[i].id === id)) out.push(paths[0][i]);
    else break;
  }
  return out;
}

export function makeGroupId(): string {
  return (
    (crypto as { randomUUID?: () => string }).randomUUID?.() ??
    `g_${Math.random().toString(36).slice(2, 10)}`
  );
}