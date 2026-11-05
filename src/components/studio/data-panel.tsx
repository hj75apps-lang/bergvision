import { useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { TemplateElement } from "@/lib/studio/types";
import {
  MAX_RECORDS,
  SUGGESTED_FIELDS,
  currentValues,
  extractPlaceholders,
  toFieldKey,
  validateNewField,
  type DataRecord,
  type DataSource,
} from "@/lib/studio/data-binding";

type Props = {
  source: DataSource;
  elements: TemplateElement[];
  disabled: boolean;
  onChange: (next: DataSource) => void;
};

export function DataPanel({ source, elements, disabled, onChange }: Props) {
  const [newName, setNewName] = useState("");
  const values = currentValues(source);
  const bound = elements.filter((e) => (e.content as Record<string, unknown> | null)?.dataBound === true);
  const usage = (key: string) =>
    bound.filter((e) => extractPlaceholders(String((e.content as Record<string, unknown>).content ?? "")).includes(key)).length;

  const save = (next: DataSource, action: string) => {
    console.log(`[DadosDinamicos:${action}]`, { fields: next.fields.length, records: next.records.length });
    onChange(next);
  };

  const addField = (label: string, defaultValue = "") => {
    const key = toFieldKey(label);
    const err = validateNewField(key, source.fields);
    if (err) {
      toast.error(err);
      return;
    }
    save({ ...source, fields: [...source.fields, { key, label: label.trim() || key, defaultValue }] }, "addField");
    setNewName("");
  };

  const updField = (key: string, defaultValue: string) =>
    save({ ...source, fields: source.fields.map((f) => (f.key === key ? { ...f, defaultValue } : f)) }, "updField");

  const delField = (key: string) => {
    const n = usage(key);
    if (n > 0 && !window.confirm(`{{${key}}} é usado em ${n} texto(s). Excluir mesmo assim? Os textos vão mostrar {{${key}}}.`)) return;
    save({ ...source, fields: source.fields.filter((f) => f.key !== key) }, "delField");
  };

  const addRecord = () => {
    if (source.records.length >= MAX_RECORDS) {
      toast.error(`Limite de ${MAX_RECORDS} registros.`);
      return;
    }
    const rec: DataRecord = {
      id: crypto.randomUUID(),
      label: `Registro ${source.records.length + 1}`,
      values: Object.fromEntries(source.fields.map((f) => [f.key, ""])),
    };
    save({ ...source, records: [...source.records, rec], activeRecordId: rec.id }, "addRecord");
  };

  const updRecord = (id: string, patch: Partial<DataRecord>) =>
    save({ ...source, records: source.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) }, "updRecord");

  const delRecord = (id: string) =>
    save({
      ...source,
      records: source.records.filter((r) => r.id !== id),
      activeRecordId: source.activeRecordId === id ? null : source.activeRecordId,
    }, "delRecord");

  const suggestions = SUGGESTED_FIELDS.filter((s) => !source.fields.some((f) => f.key === s.key));

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-2 text-xs">
        <section className="space-y-2">
          <h3 className="px-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">Campos</h3>
          {source.fields.length === 0 && (
            <p className="px-1 text-muted-foreground">
              Nenhum campo ainda. Crie campos como {"{{nome}}"} e {"{{cargo}}"} e use-os nos textos.
            </p>
          )}
          {source.fields.map((f) => (
            <div key={f.key} className="space-y-1 rounded-lg border border-border/60 p-1.5">
              <div className="flex items-center justify-between gap-1">
                <code className="truncate font-mono text-primary">{`{{${f.key}}}`}</code>
                <span className="ml-auto text-[10px] text-muted-foreground">{usage(f.key)} texto(s)</span>
                <Button size="icon" variant="ghost" className="h-6 w-6" disabled={disabled}
                  aria-label={`Excluir campo ${f.key}`} onClick={() => delField(f.key)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <Input key={f.defaultValue} defaultValue={f.defaultValue} disabled={disabled} placeholder="Valor padrão"
                aria-label={`Valor padrão de ${f.key}`} className="h-7 text-xs"
                onBlur={(e) => e.target.value !== f.defaultValue && updField(f.key, e.target.value)} />
            </div>
          ))}
          <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); addField(newName); }}>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} disabled={disabled}
              placeholder="Novo campo (ex.: empresa)" className="h-7 text-xs" aria-label="Nome do novo campo" />
            <Button type="submit" size="icon" variant="outline" className="h-7 w-7 shrink-0" disabled={disabled} aria-label="Adicionar campo">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </form>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {suggestions.map((s) => (
                <button key={s.key} type="button" disabled={disabled} onClick={() => addField(s.label, s.defaultValue)}
                  className="rounded-full border border-border/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-all duration-200 hover:border-primary/50 hover:text-foreground focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-40">
                  + {`{{${s.key}}}`}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">Registros</h3>
            <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={disabled || source.fields.length === 0} onClick={addRecord}>
              <Plus className="mr-1 h-3 w-3" /> Novo
            </Button>
          </div>
          <button type="button" onClick={() => save({ ...source, activeRecordId: null }, "selectDefault")} disabled={disabled}
            className={cn("flex w-full items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left transition-all duration-200",
              source.activeRecordId === null ? "border-primary/60 bg-primary/10" : "border-border/60 hover:bg-accent/40")}>
            {source.activeRecordId === null && <Check className="h-3 w-3 text-primary" />}
            Valores padrão (exemplo)
          </button>
          {source.records.map((r) => {
            const active = r.id === source.activeRecordId;
            return (
              <div key={r.id} className={cn("space-y-1 rounded-lg border p-1.5", active ? "border-primary/60 bg-primary/5" : "border-border/60")}>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant={active ? "default" : "outline"} className="h-6 w-6 shrink-0" disabled={disabled}
                    aria-label={active ? "Registro em uso" : `Usar ${r.label}`} onClick={() => save({ ...source, activeRecordId: r.id }, "selectRecord")}>
                    <Check className="h-3 w-3" />
                  </Button>
                  <Input key={r.label} defaultValue={r.label} disabled={disabled} className="h-6 text-xs" aria-label="Nome do registro"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (!v) { e.target.value = r.label; toast.error("O registro precisa de um nome."); return; }
                      if (v !== r.label) updRecord(r.id, { label: v });
                    }} />
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" disabled={disabled}
                    aria-label={`Excluir ${r.label}`} onClick={() => delRecord(r.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                {active && source.fields.map((f) => (
                  <label key={f.key} className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                    {f.label}
                    <Input key={r.values[f.key] ?? ""} defaultValue={r.values[f.key] ?? ""} placeholder={f.defaultValue}
                      disabled={disabled} className="h-7 text-xs"
                      onBlur={(e) => e.target.value !== (r.values[f.key] ?? "") &&
                        updRecord(r.id, { values: { ...r.values, [f.key]: e.target.value } })} />
                  </label>
                ))}
              </div>
            );
          })}
        </section>

        {source.fields.length > 0 && (
          <section className="space-y-1 rounded-lg bg-muted/30 p-2">
            <h3 className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">Dados em uso</h3>
            {source.fields.map((f) => (
              <div key={f.key} className="flex justify-between gap-2">
                <code className="font-mono text-muted-foreground">{f.key}</code>
                <span className="truncate">{values[f.key] || "—"}</span>
              </div>
            ))}
          </section>
        )}
      </div>
    </ScrollArea>
  );
}
