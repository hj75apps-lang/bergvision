import { describe, expect, it } from "vitest";
import { buildPartsFromElements, filterComponents, suggestCategory, type SavedComponent } from "./component-library";
import type { TemplateElement } from "./types";

const el = (o: Partial<TemplateElement>): TemplateElement => ({
  id: "a", template_id: "t", element_type: "text", x: 10, y: 20, width: 30, height: 5,
  rotation: 15, z_index: 1, opacity: 0.5, locked: false, visible: true, content: {}, ...o,
});

describe("biblioteca de componentes", () => {
  it("mantém posição em %, rotação e ordem das camadas e remove o grupo antigo", () => {
    const parts = buildPartsFromElements([
      el({ id: "b", z_index: 5, content: { name: "cima", groupPath: [{ id: "g", name: "G" }] } }),
      el({ id: "a", z_index: 2, content: { name: "baixo" } }),
    ]);
    expect(parts.map((p) => p.defaultContent.name)).toEqual(["baixo", "cima"]);
    expect(parts[1].defaultContent.groupPath).toBeUndefined();
    expect(parts[0]).toMatchObject({ x: 10, y: 20, width: 30, height: 5, rotation: 15, opacity: 0.5 });
  });

  it("não salva o elemento oculto de dados", () => {
    expect(buildPartsFromElements([el({ content: { studioData: {} } })])).toHaveLength(0);
  });

  it("sugere ticker para widget ticker sozinho", () => {
    expect(suggestCategory([{ type: "widget", defaultContent: { widgetType: "ticker" }, x: 0, y: 0, width: 1, height: 1 }])).toBe("tickers");
  });

  it("pesquisa por nome sem acento e filtra por categoria", () => {
    const list = [
      { id: "1", name: "Manchete Jornal", category: "titulos", collection: null, parts: [], updated_at: "" },
      { id: "2", name: "Tarja", category: "lower_thirds", collection: "Esporte", parts: [], updated_at: "" },
    ] as SavedComponent[];
    expect(filterComponents(list, "manchéte", "all", "all").map((c) => c.id)).toEqual(["1"]);
    expect(filterComponents(list, "", "lower_thirds", "all").map((c) => c.id)).toEqual(["2"]);
    expect(filterComponents(list, "", "all", "Esporte").map((c) => c.id)).toEqual(["2"]);
  });
});
