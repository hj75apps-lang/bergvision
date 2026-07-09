// Types and helpers shared by the templates gallery, canvas renderer and
// the visual layout editor. Kept framework-agnostic so both the readonly
// preview and the interactive editor operate on the same shapes.

export type AspectRatio = "16:9" | "9:16" | "4:3" | "21:9" | "custom";
export type ContentType = "empty" | "media" | "playlist" | "widget";
export type WidgetType = "clock" | "weather" | "rss" | "text" | "logo";

export type Template = {
  id: string;
  name: string;
  slug: string;
  is_system: boolean;
  organization_id: string | null;
  orientation: string | null;
  zone_count: number | null;
  aspect_ratio: AspectRatio;
  canvas_width: number;
  canvas_height: number;
  allow_overlap: boolean;
  thumbnail_url: string | null;
};

export type Zone = {
  id: string;
  template_id: string;
  zone_index: number;
  zone_name: string;
  grid_area: string | null;
  pos_x: number | null;
  pos_y: number | null;
  width_pct: number | null;
  height_pct: number | null;
  z_index: number;
  content_type: ContentType;
  media_file_id: string | null;
  playlist_id: string | null;
  widget_type: WidgetType | null;
  widget_config: Record<string, any> | null;
};

// Palette used by both preview and editor so a zone keeps the same color
// while the user drags it.
export const ZONE_PALETTE = [
  "hsl(217 91% 60% / 0.45)",
  "hsl(160 84% 45% / 0.45)",
  "hsl(38 92% 55% / 0.45)",
  "hsl(340 82% 60% / 0.45)",
  "hsl(265 89% 66% / 0.45)",
  "hsl(190 84% 55% / 0.45)",
];

export function zoneColor(index: number): string {
  return ZONE_PALETTE[index % ZONE_PALETTE.length];
}

export function aspectRatioCss(t: Pick<Template, "aspect_ratio" | "canvas_width" | "canvas_height">): string {
  if (t.aspect_ratio === "custom") return `${t.canvas_width} / ${t.canvas_height}`;
  const [a, b] = t.aspect_ratio.split(":");
  return `${a} / ${b}`;
}

export function aspectRatioLabel(t: Pick<Template, "aspect_ratio" | "canvas_width" | "canvas_height">): string {
  if (t.aspect_ratio === "custom") return `${t.canvas_width}×${t.canvas_height}`;
  return t.aspect_ratio;
}

// Convert a legacy grid_area string like "1 / 1 / 2 / 2" to fallback percentages
// assuming a 1x1 grid — used only when a system template was created before
// the backfill migration and still lacks pos_x. Returns a 100%-full zone as a
// safe default.
export function zoneWithFallback(z: Zone): Zone {
  if (z.pos_x != null && z.pos_y != null && z.width_pct != null && z.height_pct != null) {
    return z;
  }
  return { ...z, pos_x: 0, pos_y: 0, width_pct: 100, height_pct: 100 };
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "template";
}

// Snap a numeric value in [0, 100] to the nearest snap step.
export function snapPct(value: number, snap: number): number {
  const clamped = Math.max(0, Math.min(100, value));
  if (snap <= 0) return Math.round(clamped * 100) / 100;
  return Math.round(clamped / snap) * snap;
}

// Clamp a zone rectangle so it stays inside the canvas after any drag/resize.
export function clampZoneRect(
  rect: { pos_x: number; pos_y: number; width_pct: number; height_pct: number },
  minSize = 5,
): { pos_x: number; pos_y: number; width_pct: number; height_pct: number } {
  const width_pct = Math.max(minSize, Math.min(100, rect.width_pct));
  const height_pct = Math.max(minSize, Math.min(100, rect.height_pct));
  const pos_x = Math.max(0, Math.min(100 - width_pct, rect.pos_x));
  const pos_y = Math.max(0, Math.min(100 - height_pct, rect.pos_y));
  return { pos_x, pos_y, width_pct, height_pct };
}

export function zonesOverlap(a: Zone, b: Zone): boolean {
  const ax = a.pos_x ?? 0;
  const ay = a.pos_y ?? 0;
  const aw = a.width_pct ?? 0;
  const ah = a.height_pct ?? 0;
  const bx = b.pos_x ?? 0;
  const by = b.pos_y ?? 0;
  const bw = b.width_pct ?? 0;
  const bh = b.height_pct ?? 0;
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}