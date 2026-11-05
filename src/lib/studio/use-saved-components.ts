import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { copyName, type ComponentCategory, type SavedComponent, type SavedPart } from "./component-library";

const KEY = ["studio_components"] as const;
// Tabela nova (docs/sql/20261105_studio_components.sql) ainda fora dos tipos gerados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from("studio_components");

export function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return e?.code === "42P01" || e?.code === "PGRST205" || /studio_components/.test(e?.message ?? "");
}

export function useSavedComponents() {
  return useQuery({
    queryKey: KEY,
    retry: false,
    queryFn: async (): Promise<SavedComponent[]> => {
      const { data, error } = await table()
        .select("id,name,category,collection,parts,updated_at")
        .order("name");
      if (error) throw error;
      return (data ?? []) as SavedComponent[];
    },
  });
}

export function useSavedComponentMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: KEY });
  const run = async (p: PromiseLike<{ error: unknown }>) => {
    const { error } = await p;
    if (error) throw error;
  };
  return {
    create: useMutation({
      mutationFn: (v: { name: string; category: ComponentCategory; collection: string | null; parts: SavedPart[] }) =>
        run(table().insert(v)),
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: ({ id, ...v }: { id: string; name?: string; category?: ComponentCategory; collection?: string | null; parts?: SavedPart[] }) =>
        run(table().update(v).eq("id", id)),
      onSuccess: done,
    }),
    duplicate: useMutation({
      mutationFn: (c: SavedComponent) =>
        run(table().insert({ name: copyName(c.name), category: c.category, collection: c.collection, parts: c.parts })),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (id: string) => run(table().delete().eq("id", id)),
      onSuccess: done,
    }),
  };
}
