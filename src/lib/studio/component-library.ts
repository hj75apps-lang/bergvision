import type { ElementType, TemplateElement } from "./types";

export const COMPONENT_CATEGORIES = [
  { value: "titulos", label: "Títulos" },
  { value: "lower_thirds", label: "Lower thirds" },
  { value: "templates", label: "Templates" },
  { value: "formas", label: "Formas" },
  { value: "imagens", label: "Imagens" },
  { value: "tickers", label: "Tickers" },
  { value: "dinamicos", label: "Componentes dinâmicos" },
] as const;

export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number]["value"];

export type SavedPart = {
  type: ElementType;
  defaultContent: Record<string, unknown>;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
};

export type SavedComponent = {
  id: string;
  name: string;
  category: ComponentCategory;
  collection: string | null;
  parts: SavedPart[];
  updated_at: string;
};

export const MAX_PARTS = 200;

/** Elementos internos (ex.: dados ocultos) não entram na biblioteca. */
const isInternal = (el: TemplateElement) =>
  Boolean((el.content as Record<string, unknown> | null)?.studioData);

/** Converte elementos selecionados em partes reutilizáveis, mantendo % e ordem das camadas. */
export function buildPartsFromElements(elements: TemplateElement[]): SavedPart[] {
  return [...elements]
    .filter((e) => !isInternal(e))
    .sort((a, b) => (a.z_index ?? 0) - (b.z_index ?? 0))
    .slice(0, MAX_PARTS)
    .map((e) => {
      const { groupPath: _g, ...content } = (e.content ?? {}) as Record<string, unknown>;
      return {
        type: e.element_type,
        defaultContent: content,
        x: e.x,
        y: e.y,
        width: e.width,
        height: e.height,
        rotation: e.rotation ?? 0,
        opacity: e.opacity ?? 1,
      };
    });
}

export function suggestCategory(parts: SavedPart[]): ComponentCategory {
  if (parts.some((p) => p.defaultContent.dataBound === true)) return "dinamicos";
  if (parts.length === 1) {
    const p = parts[0];
    if (p.type === "widget" && p.defaultContent.widgetType === "ticker") return "tickers";
    if (p.type === "text") return "titulos";
    if (p.type === "shape") return "formas";
    if (p.type === "image" || p.type === "logo") return "imagens";
  }
  if (parts.length <= 6 && parts.every((p) => p.y >= 55)) return "lower_thirds";
  return "templates";
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function filterComponents(
  list: SavedComponent[],
  term: string,
  category: ComponentCategory | "all",
  collection: string | "all",
): SavedComponent[] {
  const t = norm(term.trim());
  return list.filter(
    (c) =>
      (category === "all" || c.category === category) &&
      (collection === "all" || (c.collection ?? "") === collection) &&
      (!t || norm(c.name).includes(t) || norm(c.collection ?? "").includes(t)),
  );
}

export function copyName(name: string): string {
  return `${name} (cópia)`.slice(0, 120);
}
