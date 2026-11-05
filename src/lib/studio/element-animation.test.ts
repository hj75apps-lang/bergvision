import { describe, expect, it } from "vitest";
import { buildKeyframesCss, parseElementAnimation, validateAnimation } from "./element-animation";

describe("animação do componente", () => {
  it("limita a duração da entrada entre 0,2s e 10s", () => {
    expect(parseElementAnimation({ entranceDuration: 50 }).entranceDuration).toBe(10);
    expect(parseElementAnimation({ entranceDuration: 0 }).entranceDuration).toBe(0.2);
  });
  it("recusa saída que começa antes de a entrada terminar", () => {
    const a = parseElementAnimation({ entrance: "fade", entranceDuration: 2, delay: 1, exit: "fade", exitAt: 2 });
    expect(validateAnimation(a)).not.toBeNull();
  });
  it("recusa dois keyframes no mesmo tempo", () => {
    const a = parseElementAnimation({ keyframes: [{ id: "a", t: 1 }, { id: "b", t: 1 }] });
    expect(validateAnimation(a)).not.toBeNull();
  });
  it("precisa de pelo menos 2 keyframes e dura até o último", () => {
    expect(buildKeyframesCss("k", parseElementAnimation({ keyframes: [{ id: "a", t: 1 }] }).keyframes)).toBeNull();
    const r = buildKeyframesCss("k", parseElementAnimation({ keyframes: [{ id: "a", t: 0 }, { id: "b", t: 4, x: 50 }] }).keyframes);
    expect(r?.duration).toBe(4);
    expect(r?.css).toContain("100%{transform:translate(50%,0%)");
  });
});
