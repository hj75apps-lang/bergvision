import type React from "react";

/**
 * Aparência compartilhada de elementos de mídia no Studio (image/video/logo/
 * image sequence). Configura arredondamento de cantos e máscaras.
 *
 * Regras:
 * - `borderRadiusPercent`: 0–50 (percentual do menor lado do elemento). Assim
 *   o arredondamento continua responsivo em qualquer resolução.
 * - `mask`: preset nomeado ou 'custom'. Quando 'custom', usa `maskUrl`
 *   (URL absoluta https:// de um SVG/PNG com canal alfa).
 * - Máscaras são aplicadas via CSS mask-image (padrão) + WebkitMaskImage
 *   (Safari). Estilos inline não passam pelo autoprefixer, então incluímos
 *   ambas as chaves manualmente.
 */

export type MaskPresetId =
  | "none"
  | "circle"
  | "squircle"
  | "rounded"
  | "ellipse-h"
  | "ellipse-v"
  | "diamond"
  | "hexagon"
  | "octagon"
  | "triangle"
  | "star"
  | "heart"
  | "blob"
  | "arch"
  | "custom";

export type MaskPreset = { id: MaskPresetId; label: string; svg?: string };

/** SVGs 100×100, brancos sobre fundo transparente (branco = área visível). */
const M = (body: string) =>
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'>${body}</svg>`;

export const MASK_PRESETS: MaskPreset[] = [
  { id: "none", label: "Nenhuma" },
  { id: "circle", label: "Círculo", svg: M(`<circle cx='50' cy='50' r='50' fill='white'/>`) },
  {
    id: "squircle",
    label: "Squircle",
    svg: M(`<path fill='white' d='M50 0C13 0 0 13 0 50s13 50 50 50 50-13 50-50S87 0 50 0z'/>`),
  },
  {
    id: "rounded",
    label: "Cantos suaves",
    svg: M(`<rect x='0' y='0' width='100' height='100' rx='22' ry='22' fill='white'/>`),
  },
  {
    id: "ellipse-h",
    label: "Elipse horizontal",
    svg: M(`<ellipse cx='50' cy='50' rx='50' ry='35' fill='white'/>`),
  },
  {
    id: "ellipse-v",
    label: "Elipse vertical",
    svg: M(`<ellipse cx='50' cy='50' rx='35' ry='50' fill='white'/>`),
  },
  {
    id: "diamond",
    label: "Losango",
    svg: M(`<polygon points='50,0 100,50 50,100 0,50' fill='white'/>`),
  },
  {
    id: "hexagon",
    label: "Hexágono",
    svg: M(`<polygon points='25,3 75,3 100,50 75,97 25,97 0,50' fill='white'/>`),
  },
  {
    id: "octagon",
    label: "Octógono",
    svg: M(
      `<polygon points='30,0 70,0 100,30 100,70 70,100 30,100 0,70 0,30' fill='white'/>`,
    ),
  },
  {
    id: "triangle",
    label: "Triângulo",
    svg: M(`<polygon points='50,0 100,100 0,100' fill='white'/>`),
  },
  {
    id: "star",
    label: "Estrela",
    svg: M(
      `<polygon fill='white' points='50,2 61,38 99,38 68,60 79,96 50,74 21,96 32,60 1,38 39,38'/>`,
    ),
  },
  {
    id: "heart",
    label: "Coração",
    svg: M(
      `<path fill='white' d='M50 90 L10 50 C-5 32 15 5 35 20 L50 32 L65 20 C85 5 105 32 90 50 Z'/>`,
    ),
  },
  {
    id: "blob",
    label: "Blob orgânico",
    svg: M(
      `<path fill='white' d='M60 5 C85 8 98 30 95 55 C92 78 72 96 48 96 C22 96 4 76 5 50 C6 24 30 2 60 5 Z'/>`,
    ),
  },
  {
    id: "arch",
    label: "Arco",
    svg: M(
      `<path fill='white' d='M0 100 V50 C0 22 22 0 50 0 C78 0 100 22 100 50 V100 Z'/>`,
    ),
  },
  { id: "custom", label: "Personalizada (URL)" },
];

export function maskPresetById(id: string | undefined | null): MaskPreset | undefined {
  if (!id) return undefined;
  return MASK_PRESETS.find((p) => p.id === id);
}

function svgToDataUrl(svg: string): string {
  // encodeURIComponent para evitar problemas com # e outros caracteres.
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

/** Extrai config de aparência do content JSON do elemento. */
export function getAppearanceConfig(c: Record<string, unknown>) {
  const radiusRaw = c.borderRadiusPercent;
  const borderRadiusPercent =
    typeof radiusRaw === "number" ? Math.max(0, Math.min(50, radiusRaw)) : 0;
  const maskId = (c.mask as string | undefined) ?? "none";
  const maskUrl = (c.maskUrl as string | undefined) ?? "";
  return { borderRadiusPercent, mask: maskId as MaskPresetId, maskUrl };
}

/**
 * Retorna estilos inline que devem ser aplicados ao wrapper/mídia para
 * refletir arredondamento + máscara. `overflow: hidden` fica por conta do
 * chamador (para vídeos, aplicamos direto no <video>).
 */
export function getAppearanceStyle(
  c: Record<string, unknown>,
): React.CSSProperties {
  const { borderRadiusPercent, mask, maskUrl } = getAppearanceConfig(c);
  const style: React.CSSProperties = {};

  if (borderRadiusPercent > 0) {
    // Usa unidades de container query (cqmin = 1% da menor dimensão do
    // container) para que o raio seja UNIFORME nos 4 cantos, independente
    // do aspect ratio. Requer container-type: size no wrapper.
    style.containerType = "size";
    style.borderRadius = `${borderRadiusPercent}cqmin`;
    style.overflow = "hidden";
  }

  let cssMask: string | undefined;
  if (mask === "custom") {
    const trimmed = maskUrl.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      cssMask = `url("${trimmed.replace(/"/g, '\\"')}")`;
    }
  } else {
    const preset = maskPresetById(mask);
    if (preset?.svg) cssMask = svgToDataUrl(preset.svg);
  }

  if (cssMask) {
    style.maskImage = cssMask;
    style.maskSize = "100% 100%";
    style.maskRepeat = "no-repeat";
    style.maskPosition = "center";
    // Safari
    (style as React.CSSProperties & Record<string, string>).WebkitMaskImage = cssMask;
    (style as React.CSSProperties & Record<string, string>).WebkitMaskSize = "100% 100%";
    (style as React.CSSProperties & Record<string, string>).WebkitMaskRepeat = "no-repeat";
    (style as React.CSSProperties & Record<string, string>).WebkitMaskPosition = "center";
  }

  return style;
}

/** True se o elemento tem alguma configuração visual de aparência aplicada. */
export function hasAppearance(c: Record<string, unknown>): boolean {
  const { borderRadiusPercent, mask, maskUrl } = getAppearanceConfig(c);
  if (borderRadiusPercent > 0) return true;
  if (mask === "custom") return /^https?:\/\//i.test(maskUrl.trim());
  return mask !== "none";
}