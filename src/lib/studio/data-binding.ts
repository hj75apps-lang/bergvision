/**
 * Objetos controlados por dados no Studio.
 *
 * Os campos e registros de um template ficam numa camada oculta
 * ("Fonte de dados") em template_elements, com content.dataSource.
 * Textos com content.dataBound=true trocam {{campo}} pelo valor do
 * registro ativo (ou pelo valor padrão do campo).
 */
import type { TemplateElement } from "./types";

export type DataField = { key: string; label: string; defaultValue: string };
export type DataRecord = { id: string; label: string; values: Record<string, string> };
export type DataSource = { fields: DataField[]; records: DataRecord[]; activeRecordId: string | null };

export const FIELD_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
export const MAX_FIELDS = 40;
export const MAX_RECORDS = 200;
export const DATA_SOURCE_NAME = "Fonte de dados";

export const SUGGESTED_FIELDS: DataField[] = [
  { key: "nome", label: "Nome", defaultValue: "Nome do apresentador" },
  { key: "cargo", label: "Cargo", defaultValue: "Cargo" },
  { key: "empresa", label: "Empresa", defaultValue: "Empresa" },
  { key: "titulo", label: "Título", defaultValue: "Título" },
  { key: "noticia", label: "Notícia", defaultValue: "Texto da notícia" },
  { key: "horario", label: "Horário", defaultValue: "00:00" },
  { key: "mensagem", label: "Mensagem", defaultValue: "Mensagem" },
];

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export const emptySource = (): DataSource => ({ fields: [], records: [], activeRecordId: null });

/** Normaliza um nome digitado para chave de campo: "Nome do Cargo" → "nome_do_cargo". */
export function toFieldKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[0-9_]+/, "")
    .slice(0, 40);
}

export function parseDataSource(raw: unknown): DataSource {
  if (!raw || typeof raw !== "object") return emptySource();
  const o = raw as Record<string, unknown>;
  const fields: DataField[] = [];
  const seen = new Set<string>();
  if (Array.isArray(o.fields)) {
    for (const f of o.fields) {
      if (!f || typeof f !== "object") continue;
      const r = f as Record<string, unknown>;
      const key = typeof r.key === "string" ? r.key : "";
      if (!FIELD_KEY_RE.test(key) || seen.has(key)) continue;
      seen.add(key);
      fields.push({
        key,
        label: typeof r.label === "string" && r.label.trim() ? r.label : key,
        defaultValue: typeof r.defaultValue === "string" ? r.defaultValue : "",
      });
    }
  }
  const records: DataRecord[] = [];
  if (Array.isArray(o.records)) {
    for (const rec of o.records) {
      if (!rec || typeof rec !== "object") continue;
      const r = rec as Record<string, unknown>;
      if (typeof r.id !== "string") continue;
      const values: Record<string, string> = {};
      if (r.values && typeof r.values === "object") {
        for (const [k, v] of Object.entries(r.values as Record<string, unknown>)) {
          if (typeof v === "string") values[k] = v;
        }
      }
      records.push({ id: r.id, label: typeof r.label === "string" ? r.label : "Registro", values });
    }
  }
  const active = typeof o.activeRecordId === "string" && records.some((r) => r.id === o.activeRecordId)
    ? (o.activeRecordId as string)
    : null;
  return { fields: fields.slice(0, MAX_FIELDS), records: records.slice(0, MAX_RECORDS), activeRecordId: active };
}

export function findDataSourceElement(elements: TemplateElement[]): TemplateElement | null {
  return elements.find((e) => (e.content as Record<string, unknown> | null)?.isDataSource === true) ?? null;
}

/** Valores atuais: registro ativo por cima dos valores padrão. */
export function currentValues(src: DataSource): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of src.fields) out[f.key] = f.defaultValue;
  const rec = src.records.find((r) => r.id === src.activeRecordId);
  if (rec) {
    for (const f of src.fields) {
      const v = rec.values[f.key];
      if (typeof v === "string" && v !== "") out[f.key] = v;
    }
  }
  return out;
}

export function extractPlaceholders(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(PLACEHOLDER_RE)) out.add(m[1]);
  return [...out];
}

/** Campos usados no texto que não existem na fonte de dados. */
export function missingFields(text: string, fields: DataField[]): string[] {
  const keys = new Set(fields.map((f) => f.key));
  return extractPlaceholders(text).filter((k) => !keys.has(k));
}

/** Troca {{campo}} pelo valor; campos inexistentes ficam visíveis como {{campo}}. Texto puro. */
export function resolveText(text: string, values: Record<string, string>): string {
  return text.replace(PLACEHOLDER_RE, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : whole,
  );
}

/** Valida um novo campo. Retorna mensagem de erro ou null. */
export function validateNewField(key: string, fields: DataField[]): string | null {
  if (!key) return "Dê um nome ao campo.";
  if (!FIELD_KEY_RE.test(key)) return "Use letras, números e _ (começando por letra).";
  if (fields.some((f) => f.key === key)) return `O campo {{${key}}} já existe.`;
  if (fields.length >= MAX_FIELDS) return `Limite de ${MAX_FIELDS} campos.`;
  return null;
}
