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

type TemplateReference = Partial<Pick<Template, "name" | "slug">>;
type Rect = { pos_x: number; pos_y: number; width_pct: number; height_pct: number };

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasCompleteRect(z: Zone): boolean {
  return z.pos_x != null && z.pos_y != null && z.width_pct != null && z.height_pct != null;
}

function parseGridArea(area: string | null): { rowStart: number; colStart: number; rowEnd: number; colEnd: number } | null {
  if (!area) return null;
  const parts = area
    .split("/")
    .map((p) => Number.parseInt(p.trim(), 10))
    .filter((n) => Number.isFinite(n));
  if (parts.length !== 4) return null;
  const [rowStart, colStart, rowEnd, colEnd] = parts;
  if (rowEnd <= rowStart || colEnd <= colStart) return null;
  return { rowStart, colStart, rowEnd, colEnd };
}

function rectFromGridArea(zones: Zone[], zone: Zone): Rect | null {
  const parsed = zones.map((z) => parseGridArea(z.grid_area));
  if (parsed.some((p) => p == null)) return null;
  const current = parseGridArea(zone.grid_area);
  if (!current) return null;
  const rows = Math.max(...parsed.map((p) => (p?.rowEnd ?? 2) - 1));
  const cols = Math.max(...parsed.map((p) => (p?.colEnd ?? 2) - 1));
  return {
    pos_x: ((current.colStart - 1) / cols) * 100,
    pos_y: ((current.rowStart - 1) / rows) * 100,
    width_pct: ((current.colEnd - current.colStart) / cols) * 100,
    height_pct: ((current.rowEnd - current.rowStart) / rows) * 100,
  };
}

function rectForSystemTemplate(template: TemplateReference, zone: Zone, total: number): Rect {
  const key = normalizeText(`${template.name ?? ""} ${template.slug ?? ""}`);
  const zoneName = normalizeText(zone.zone_name);
  const index = zone.zone_index ?? 0;

  if (key.includes("quadrante") || key.includes("multi zona") || key.includes("multi 4k")) {
    const namedIndex = zoneName.includes("superior esquer")
      ? 0
      : zoneName.includes("superior direit")
        ? 1
        : zoneName.includes("inferior esquer")
          ? 2
          : zoneName.includes("inferior direit")
            ? 3
            : index;
    return {
      pos_x: namedIndex % 2 === 0 ? 0 : 50,
      pos_y: namedIndex < 2 ? 0 : 50,
      width_pct: 50,
      height_pct: 50,
    };
  }

  if (key.includes("layout em l") || key.includes("l shape")) {
    const role = zoneName.includes("lateral") || zoneName.includes("direit")
      ? "right"
      : zoneName.includes("rodape") || zoneName.includes("inferior")
        ? "bottom"
        : index === 1
          ? "right"
          : index === 2
            ? "bottom"
            : "main";
    if (role === "right") return { pos_x: 75, pos_y: 0, width_pct: 25, height_pct: 100 };
    if (role === "bottom") return { pos_x: 0, pos_y: 75, width_pct: 75, height_pct: 25 };
    return { pos_x: 0, pos_y: 0, width_pct: 75, height_pct: 75 };
  }

  if (key.includes("ticker") || key.includes("rodape")) {
    const isTicker = zoneName.includes("ticker") || zoneName.includes("rodape") || zoneName.includes("inferior") || index === total - 1;
    return isTicker
      ? { pos_x: 0, pos_y: 85, width_pct: 100, height_pct: 15 }
      : { pos_x: 0, pos_y: 0, width_pct: 100, height_pct: 85 };
  }

  if (key.includes("split") || key.includes("divid") || (key.includes("horizontal") && total === 2)) {
    const isRight = zoneName.includes("direit") || index === 1;
    return { pos_x: isRight ? 50 : 0, pos_y: 0, width_pct: 50, height_pct: 100 };
  }

  return { pos_x: 0, pos_y: 0, width_pct: 100, height_pct: 100 };
}

// Convert a legacy zone without percent coordinates to a reference layout.
// This keeps old system templates visually useful even when the SQL backfill
// cannot identify localized names such as "Layout em L" or "Multi-zona 4K".
export function zonesWithReferenceFallback(template: TemplateReference, zones: Zone[]): Zone[] {
  return zones.map((z, index) => {
    if (hasCompleteRect(z)) return z;
    const gridRect = rectFromGridArea(zones, z);
    const inferred = gridRect ?? rectForSystemTemplate(template, z, zones.length);
    return { ...z, ...inferred, z_index: z.z_index ?? index };
  });
}

// Safe one-zone fallback for call sites that do not know the parent template.
export function zoneWithFallback(z: Zone): Zone {
  if (hasCompleteRect(z)) return z;
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