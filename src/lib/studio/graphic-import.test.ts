import { describe, expect, it } from "vitest";
import { boxToPercent, detectKind, fitInCanvas, validateImportFile, PNG_MAX_BYTES } from "./graphic-import";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const psd = new Uint8Array([0x38, 0x42, 0x50, 0x53, 0, 1, 0, 0]);
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);

describe("importação PNG/PSD", () => {
  it("detecta o formato pelo conteúdo, não pela extensão", () => {
    expect(detectKind(png)).toBe("png");
    expect(detectKind(psd)).toBe("psd");
    expect(validateImportFile("foto.psd", 100, jpg)).not.toBeNull();
  });
  it("recusa PNG acima de 25 MB", () => {
    expect(validateImportFile("a.png", PNG_MAX_BYTES + 1, png)).not.toBeNull();
    expect(validateImportFile("a.png", PNG_MAX_BYTES, png)).toBeNull();
  });
  it("converte a posição da camada para porcentagem do documento", () => {
    expect(boxToPercent(192, 108, 960, 540, 1920, 1080)).toEqual({ x: 10, y: 10, width: 40, height: 40 });
  });
  it("corta camadas que saem do documento", () => {
    expect(boxToPercent(-100, 0, 960, 1200, 1920, 1080)).toEqual({ x: 0, y: 0, width: 50, height: 100 });
  });
  it("centraliza o PNG mantendo a proporção", () => {
    expect(fitInCanvas(500, 500, 1920, 1080)).toEqual({ x: 36.98, y: 26.85, width: 26.04, height: 46.3 });
  });
});
