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