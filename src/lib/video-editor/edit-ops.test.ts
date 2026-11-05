import { describe, expect, it } from "vitest";
import { expandGroups, rippleDelete, rollEdit, slideEdit, slipEdit, splitAtPlayhead, splitClip } from "./edit-ops";
import { pasteClips, type Clip } from "./timeline";

const mk = (id: string, start: number, duration: number, extra: Partial<Clip> = {}): Clip => ({
  id, trackId: "t1", assetId: "x", start, duration, inPoint: 0, sourceDuration: 20000, ...extra,
});

describe("corte (split)", () => {
  it("divide em dois segmentos contínuos com ponto de entrada correto", () => {
    const r = splitClip(mk("a", 1000, 4000, { inPoint: 500 }), 3000);
    expect(r).not.toBeNull();
    const [l, rt] = r!;
    expect(l).toMatchObject({ start: 1000, duration: 2000, inPoint: 500 });
    expect(rt).toMatchObject({ start: 3000, duration: 2000, inPoint: 2500 });
    expect(rt.id).not.toBe("a");
  });
  it("não corta fora do clipe nem deixa pedaço menor que 100 ms", () => {
    expect(splitClip(mk("a", 1000, 4000), 1050)).toBeNull();
    expect(splitClip(mk("a", 1000, 4000), 6000)).toBeNull();
  });
  it("corte no cursor ignora trilhas bloqueadas e respeita a seleção", () => {
    const clips = [mk("a", 0, 4000), mk("b", 0, 4000, { trackId: "t2" }), mk("c", 0, 4000, { trackId: "t3" })];
    const all = splitAtPlayhead(clips, 2000, [], new Set(["t3"]));
    expect(all.created).toHaveLength(2);
    const sel = splitAtPlayhead(clips, 2000, ["b"], new Set());
    expect(sel.created).toHaveLength(1);
    expect(sel.clips).toHaveLength(4);
  });
});

describe("excluir e fechar (ripple delete)", () => {
  const clips = [mk("a", 0, 2000), mk("b", 2000, 3000), mk("c", 5000, 1000), mk("o", 6000, 1000, { trackId: "t2" })];
  it("fecha o espaço só na mesma trilha", () => {
    const r = rippleDelete(clips, ["b"], new Set());
    expect(r.find((c) => c.id === "c")!.start).toBe(2000);
    expect(r.find((c) => c.id === "o")!.start).toBe(6000);
  });
  it("em todas as trilhas, mantém o sincronismo", () => {
    const r = rippleDelete(clips, ["b"], new Set(), true);
    expect(r.find((c) => c.id === "o")!.start).toBe(3000);
  });
  it("trilha bloqueada não é alterada", () => {
    const r = rippleDelete(clips, ["b"], new Set(["t2"]), true);
    expect(r.find((c) => c.id === "o")!.start).toBe(6000);
  });
});

describe("roll, slip e slide", () => {
  it("roll move a junção e preserva a duração total", () => {
    const [l, r] = rollEdit(mk("a", 0, 3000), mk("b", 3000, 3000, { inPoint: 1000 }), 500);
    expect(l.duration).toBe(3500);
    expect(r).toMatchObject({ start: 3500, duration: 2500, inPoint: 1500 });
    expect(l.duration + r.duration).toBe(6000);
  });
  it("roll não passa do início do arquivo do clipe da direita", () => {
    const [l, r] = rollEdit(mk("a", 0, 3000), mk("b", 3000, 3000, { inPoint: 200 }), -1000);
    expect(r.inPoint).toBe(0);
    expect(l.duration).toBe(2800);
  });
  it("slip troca o trecho sem mudar posição nem duração", () => {
    const c = slipEdit(mk("a", 1000, 4000, { inPoint: 2000 }), 1500);
    expect(c).toMatchObject({ start: 1000, duration: 4000, inPoint: 3500 });
    expect(slipEdit(mk("a", 0, 4000), 99999).inPoint).toBe(16000);
    expect(slipEdit(mk("a", 0, 4000), -500).inPoint).toBe(0);
  });
  it("slide ajusta os vizinhos e preserva a duração total", () => {
    const clips = [mk("p", 0, 3000), mk("c", 3000, 2000, { inPoint: 0 }), mk("n", 5000, 3000, { inPoint: 1000 })];
    const r = slideEdit(clips, clips[1], 500);
    expect(r.clip.start).toBe(3500);
    expect(r.prev!.duration).toBe(3500);
    expect(r.next).toMatchObject({ start: 5500, duration: 2500, inPoint: 1500 });
    expect(r.prev!.duration + r.clip.duration + r.next!.duration).toBe(8000);
  });
});

describe("grupos", () => {
  it("selecionar um clipe do grupo seleciona o grupo todo", () => {
    const clips = [mk("a", 0, 1000, { groupId: "g" }), mk("b", 0, 1000, { groupId: "g" }), mk("c", 0, 1000)];
    expect(expandGroups(clips, ["a"]).sort()).toEqual(["a", "b"]);
  });
  it("colar cria um grupo novo", () => {
    const p = pasteClips([mk("a", 0, 1000, { groupId: "g" }), mk("b", 0, 1000, { groupId: "g" })], 5000);
    expect(p[0].groupId).toBe(p[1].groupId);
    expect(p[0].groupId).not.toBe("g");
  });
});
