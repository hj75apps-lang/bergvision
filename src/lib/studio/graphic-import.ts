/**
 * Importação de PNG e PSD para o Studio.
 * Esta camada só lê e converte arquivos (sem rede). O envio para a Biblioteca
 * e a criação dos elementos ficam em `graphic-import-upload.ts`.
 */

export const PNG_MAX_BYTES = 25 * 1024 * 1024;
export const PSD_MAX_BYTES = 150 * 1024 * 1024;

export type ImportKind = "png" | "psd";

export type GroupSeg = { id: string; name: string };

export type ImportedImage = {
  kind: "image";
  name: string;
  blob: Blob;
  pxWidth: number;
  pxHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  visible: boolean;
  groupPath: GroupSeg[];
};

export type ImportedText = {
  kind: "text";
  name: string;
  text: string;
  fontFamily: string;
  fontSizePercent: number;
  fontWeight: string;
  color: string;
  textAlign: "left" | "center" | "right";
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  visible: boolean;
  groupPath: GroupSeg[];
};

export type ImportedLayer = ImportedImage | ImportedText;

export type ImportReport = {
  sourceWidth: number;
  sourceHeight: number;
  layers: ImportedLayer[];
  /** Avisos legíveis: camadas ignoradas ou rasterizadas. */
  warnings: string[];
};

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PSD_SIG = [0x38, 0x42, 0x50, 0x53]; // "8BPS"

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);

/** Detecta o formato pelo conteúdo do arquivo (não pela extensão). */
export function detectKind(head: Uint8Array): ImportKind | null {
  if (startsWith(head, PNG_SIG)) return "png";
  if (startsWith(head, PSD_SIG)) return "psd";
  return null;
}

/** Valida tamanho e formato. Retorna mensagem de erro ou null. */
export function validateImportFile(name: string, size: number, head: Uint8Array): string | null {
  const kind = detectKind(head);
  if (!kind) return `"${name}" não é um PNG nem um PSD válido.`;
  if (size === 0) return `"${name}" está vazio.`;
  const max = kind === "png" ? PNG_MAX_BYTES : PSD_MAX_BYTES;
  if (size > max) return `"${name}" passa do limite de ${Math.round(max / 1024 / 1024)} MB.`;
  return null;
}

const pct = (v: number, total: number) => Math.round((v / total) * 10000) / 100;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Encaixa uma imagem no canvas mantendo a proporção (máx. 60% do lado maior). */
export function fitInCanvas(
  imgW: number,
  imgH: number,
  canvasW: number,
  canvasH: number,
  maxFrac = 0.6,
): { x: number; y: number; width: number; height: number } {
  const scale = Math.min((canvasW * maxFrac) / imgW, (canvasH * maxFrac) / imgH, 1);
  const w = imgW * scale;
  const h = imgH * scale;
  return {
    x: pct((canvasW - w) / 2, canvasW),
    y: pct((canvasH - h) / 2, canvasH),
    width: pct(w, canvasW),
    height: pct(h, canvasH),
  };
}

/** Converte a caixa de uma camada (px do PSD) em % do documento, limitada a 0–100. */
export function boxToPercent(
  left: number,
  top: number,
  right: number,
  bottom: number,
  docW: number,
  docH: number,
): { x: number; y: number; width: number; height: number } {
  const l = clamp(left, 0, docW);
  const t = clamp(top, 0, docH);
  const r = clamp(right, 0, docW);
  const b = clamp(bottom, 0, docH);
  return {
    x: pct(l, docW),
    y: pct(t, docH),
    width: pct(Math.max(0, r - l), docW),
    height: pct(Math.max(0, b - t), docH),
  };
}

async function readPngSize(file: Blob): Promise<{ w: number; h: number }> {
  const b = new Uint8Array(await file.slice(0, 24).arrayBuffer());
  const dv = new DataView(b.buffer);
  return { w: dv.getUint32(16), h: dv.getUint32(20) };
}

export async function importPng(file: File, canvasW: number, canvasH: number): Promise<ImportReport> {
  const { w, h } = await readPngSize(file);
  if (!w || !h) throw new Error("Não foi possível ler as dimensões do PNG.");
  const box = fitInCanvas(w, h, canvasW, canvasH);
  return {
    sourceWidth: w,
    sourceHeight: h,
    warnings: [],
    layers: [
      {
        kind: "image",
        name: file.name.replace(/\.png$/i, ""),
        blob: file.slice(0, file.size, "image/png"),
        pxWidth: w,
        pxHeight: h,
        ...box,
        opacity: 1,
        visible: true,
        groupPath: [],
      },
    ],
  };
}

type PsdColor = { r?: number; g?: number; b?: number; fr?: number; fg?: number; fb?: number };

function colorToHex(c: PsdColor | undefined): string {
  if (!c) return "#FFFFFF";
  const r = c.r ?? (c.fr !== undefined ? c.fr * 255 : 255);
  const g = c.g ?? (c.fg !== undefined ? c.fg * 255 : 255);
  const b = c.b ?? (c.fb !== undefined ? c.fb * 255 : 255);
  const h = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar PNG da camada."))), "image/png"),
  );
}

/** Lê um PSD real (camadas, textos, grupos, ordem) com ag-psd. */
export async function importPsd(file: File): Promise<ImportReport> {
  const { readPsd } = await import("ag-psd");
  const buf = await file.arrayBuffer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let psd: any;
  try {
    psd = readPsd(buf, { skipThumbnail: true, skipCompositeImageData: false });
  } catch (e) {
    throw new Error(
      `Não foi possível ler o PSD: ${e instanceof Error ? e.message : "arquivo corrompido ou formato não suportado"}.`,
    );
  }
  const docW: number = psd.width;
  const docH: number = psd.height;
  const layers: ImportedLayer[] = [];
  const warnings: string[] = [];
  const rasterized: string[] = [];
  const skipped: string[] = [];
  let seq = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = async (nodes: any[] | undefined, path: GroupSeg[]) => {
    if (!nodes) return;
    for (const n of nodes) {
      const name: string = (n.name as string) || `Camada ${++seq}`;
      const visible = n.hidden !== true;
      const opacity = typeof n.opacity === "number" ? clamp(n.opacity, 0, 1) : 1;
      if (Array.isArray(n.children)) {
        await walk(n.children, [...path, { id: crypto.randomUUID(), name }]);
        continue;
      }
      if (n.adjustment) {
        skipped.push(`${name} (camada de ajuste)`);
        continue;
      }
      const left = n.left ?? 0, top = n.top ?? 0, right = n.right ?? 0, bottom = n.bottom ?? 0;
      const box = boxToPercent(left, top, right, bottom, docW, docH);
      if (n.text && typeof n.text.text === "string" && n.text.text.trim()) {
        const st = n.text.style ?? {};
        const tf: number[] | undefined = n.text.transform;
        const scaleY = tf && tf.length >= 4 ? Math.abs(tf[3]) || 1 : 1;
        const sizePx = (typeof st.fontSize === "number" ? st.fontSize : 24) * scaleY;
        const fontName: string = st.font?.name ?? "Inter";
        const just = n.text.paragraphStyle?.justification;
        layers.push({
          kind: "text",
          name,
          text: String(n.text.text).replace(/\r/g, "\n"),
          fontFamily: fontName.split("-")[0] || "Inter",
          fontSizePercent: Math.round(clamp((sizePx / docH) * 100, 0.5, 60) * 100) / 100,
          fontWeight: st.fauxBold || /bold|black|heavy/i.test(fontName) ? "700" : "400",
          color: colorToHex(st.fillColor),
          textAlign: just === "center" ? "center" : just === "right" ? "right" : "left",
          ...box,
          opacity,
          visible,
          groupPath: path,
        });
        if (n.effects) rasterized.push(`${name} (efeitos de texto não foram convertidos)`);
        continue;
      }
      const canvas: HTMLCanvasElement | undefined = n.canvas;
      if (!canvas || canvas.width === 0 || canvas.height === 0 || box.width === 0 || box.height === 0) {
        skipped.push(`${name} (camada vazia ou fora da área)`);
        continue;
      }
      if (n.placedLayer) rasterized.push(`${name} (objeto inteligente rasterizado)`);
      else if (n.effects) rasterized.push(`${name} (efeitos de camada não incluídos)`);
      else if (n.vectorMask || n.vectorOrigination) rasterized.push(`${name} (forma vetorial rasterizada)`);
      if (n.blendMode && n.blendMode !== "normal" && n.blendMode !== "pass through") {
        rasterized.push(`${name} (modo de mesclagem "${n.blendMode}" não suportado, ficará normal)`);
      }
      layers.push({
        kind: "image",
        name,
        blob: await canvasToBlob(canvas),
        pxWidth: canvas.width,
        pxHeight: canvas.height,
        ...box,
        opacity,
        visible,
        groupPath: path,
      });
    }
  };

  await walk(psd.children, []);

  // PSD sem camadas (só imagem composta): importa como uma imagem.
  if (layers.length === 0 && psd.canvas) {
    layers.push({
      kind: "image",
      name: file.name.replace(/\.psd$/i, ""),
      blob: await canvasToBlob(psd.canvas as HTMLCanvasElement),
      pxWidth: docW,
      pxHeight: docH,
      x: 0, y: 0, width: 100, height: 100,
      opacity: 1, visible: true, groupPath: [],
    });
    warnings.push("O PSD não tem camadas separadas; foi importado como uma única imagem.");
  }
  if (rasterized.length) warnings.push(`Rasterizado ou simplificado: ${rasterized.join("; ")}.`);
  if (skipped.length) warnings.push(`Não importado: ${skipped.join("; ")}.`);
  return { sourceWidth: docW, sourceHeight: docH, layers, warnings };
}
