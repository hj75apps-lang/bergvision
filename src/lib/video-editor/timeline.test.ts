import { describe, expect, it } from "vitest";
import { canPlace, duplicateClips, fitZoom, formatTimecode, pasteClips, trimEnd, trimStart, tracksCompatible, type Clip } from "./timeline";

const video: Clip = { id: "a", trackId: "t", assetId: "x", start: 1000, duration: 4000, inPoint: 0, sourceDuration: 10000 };
const still: Clip = { ...video, id: "b", sourceDuration: null };

describe("timeline", () => {
  it("áudio só entra em trilha de áudio", () => {
    expect(canPlace("audio", "audio")).toBe(true);
    expect(canPlace("audio", "video")).toBe(false);
    expect(canPlace("video", "audio")).toBe(false);
    expect(tracksCompatible("video", "audio")).toBe(false);
    expect(tracksCompatible("video", "overlay")).toBe(true);
  });
  it("aparar o início não passa do começo do arquivo", () => {
    const r = trimStart(video, 0);
    expect(r).toMatchObject({ start: 1000, inPoint: 0, duration: 4000 });
    const r2 = trimStart({ ...video, inPoint: 2000 }, 0);
    expect(r2).toMatchObject({ start: 0, inPoint: 1000, duration: 5000 });
  });
  it("aparar o início mantém o fim e ajusta o ponto de entrada", () => {
    expect(trimStart(video, 2500)).toMatchObject({ start: 2500, inPoint: 1500, duration: 2500 });
  });
  it("aparar o fim não passa do fim do arquivo", () => {
    expect(trimEnd(video, 99999).duration).toBe(10000);
    expect(trimEnd({ ...video, inPoint: 3000 }, 99999).duration).toBe(7000);
  });
  it("imagem pode esticar livremente", () => {
    expect(trimEnd(still, 61000).duration).toBe(60000);
  });
  it("clipe nunca fica menor que 100 ms", () => {
    expect(trimEnd(video, 0).duration).toBe(100);
    expect(trimStart(video, 99999).duration).toBe(100);
  });
  it("colar preserva distâncias e duplicar coloca após o fim", () => {
    const b = { ...video, id: "c", start: 3000 };
    const p = pasteClips([video, b], 10000);
    expect(p.map((c) => c.start)).toEqual([10000, 12000]);
    expect(duplicateClips([video])[0].start).toBe(5000);
  });
  it("ajustar zoom cabe a sequência", () => {
    expect(fitZoom([{ ...video, start: 0, duration: 10000 }], 1000)).toBe(95);
  });
  it("timecode em frames de 30 fps", () => {
    expect(formatTimecode(61500)).toBe("01:01:15");
  });
});
