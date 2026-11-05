import { describe, expect, it } from "vitest";
import { applyAspect, DEFAULT_SETTINGS, duplicateSequence, makeSequence, nearestAspect, uniqueName } from "./sequences";

describe("sequências", () => {
  it("aplica proporção 9:16 mantendo o lado maior", () => {
    const s = applyAspect(DEFAULT_SETTINGS, "9:16");
    expect([s.width, s.height]).toEqual([1080, 1920]);
  });
  it("aplica 1:1 e 4:3", () => {
    expect(applyAspect(DEFAULT_SETTINGS, "1:1")).toMatchObject({ width: 1920, height: 1920 });
    expect(applyAspect(DEFAULT_SETTINGS, "4:3")).toMatchObject({ width: 1920, height: 1440 });
  });
  it("detecta proporção de resolução personalizada", () => {
    expect(nearestAspect(1280, 720)).toBe("16:9");
    expect(nearestAspect(1024, 768)).toBe("4:3");
  });
  it("duplicar gera ids novos e preserva a montagem", () => {
    const a = makeSequence("A");
    a.clips = [{ id: "c1", trackId: a.tracks[0].id, assetId: "x", start: 0, duration: 1000, inPoint: 0, sourceDuration: 1000, groupId: "g" },
      { id: "c2", trackId: a.tracks[0].id, assetId: "y", start: 3000, duration: 1000, inPoint: 0, sourceDuration: null, groupId: "g" }];
    const b = duplicateSequence(a, "B");
    expect(b.id).not.toBe(a.id);
    expect(b.clips[0].id).not.toBe("c1");
    expect(b.clips[0].trackId).toBe(b.tracks[0].id);
    expect(b.clips[0].groupId).toBe(b.clips[1].groupId);
    expect(b.clips[0].groupId).not.toBe("g");
    expect(b.clips[1].start).toBe(3000);
  });
  it("gera nomes únicos", () => {
    expect(uniqueName("X", ["X", "X (2)"])).toBe("X (3)");
  });
});
