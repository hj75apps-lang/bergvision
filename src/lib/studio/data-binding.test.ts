import { describe, expect, it } from "vitest";
import { currentValues, missingFields, parseDataSource, resolveText, toFieldKey, validateNewField } from "./data-binding";

const src = parseDataSource({
  fields: [
    { key: "nome", label: "Nome", defaultValue: "Fulano" },
    { key: "cargo", label: "Cargo", defaultValue: "Repórter" },
  ],
  records: [{ id: "r1", label: "Maria", values: { nome: "Maria Silva", cargo: "" } }],
  activeRecordId: "r1",
});

describe("objetos controlados por dados", () => {
  it("troca {{nome}} e {{cargo}} pelos dados do registro ativo", () => {
    expect(resolveText("{{nome}} — {{cargo}}", currentValues(src))).toBe("Maria Silva — Repórter");
  });
  it("usa o valor padrão quando o registro deixa o campo vazio", () => {
    expect(currentValues(src).cargo).toBe("Repórter");
  });
  it("sem registro ativo, mostra os valores padrão", () => {
    expect(currentValues({ ...src, activeRecordId: null }).nome).toBe("Fulano");
  });
  it("campo inexistente continua visível e é apontado", () => {
    expect(resolveText("{{empresa}}", currentValues(src))).toBe("{{empresa}}");
    expect(missingFields("{{nome}} {{empresa}}", src.fields)).toEqual(["empresa"]);
  });
  it("não aceita campo repetido nem sem nome", () => {
    expect(validateNewField("nome", src.fields)).not.toBeNull();
    expect(validateNewField("", src.fields)).not.toBeNull();
    expect(toFieldKey("Nome da Empresa")).toBe("nome_da_empresa");
  });
});
