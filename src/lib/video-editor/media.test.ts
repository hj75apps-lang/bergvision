import { describe, expect, it } from "vitest";
import { aspectLabel, filterAssets, formatDuration, kindOf, type EditorAsset } from "./media";

describe("biblioteca do editor de vídeo", () => {
  it("aceita só os formatos pedidos", () => {
    expect(kindOf("a.MOV")).toBe("video");
    expect(kindOf("b.aac")).toBe("audio");
    expect(kindOf("c.jpeg")).toBe("image");
    expect(kindOf("d.gif")).toBe("graphic");
    expect(kindOf("e.avi")).toBeNull();
  });
  it("calcula proporção e duração", () => {
    expect(aspectLabel(1920, 1080)).toBe("16:9");
    expect(formatDuration(3_725_000)).toBe("1:02:05");
  });
  it("filtra por nome, tipo e pasta", () => {
    const base = { mime_type: null, size_bytes: 1, duration_ms: null, width: null, height: null, storage_path: "", thumbnail_path: null, created_at: "" };
    const list: EditorAsset[] = [
      { ...base, id: "1", name: "Abertura", kind: "video", folder_id: "f" },
      { ...base, id: "2", name: "Trilha", kind: "audio", folder_id: null },
    ];
    expect(filterAssets(list, { query: "abert", kind: "all", folder: "all" }).map((a) => a.id)).toEqual(["1"]);
    expect(filterAssets(list, { query: "", kind: "audio", folder: "none" }).map((a) => a.id)).toEqual(["2"]);
  });
});
