import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { uploadToStorage } from "@/lib/storage-upload";
import { slugify } from "@/lib/template-utils";
import { extOf, kindOf, MAX_FILE_BYTES, type EditorAsset, type EditorFolder } from "./media";
import { probeFile } from "./probe";

const BUCKET = "media";
const ASSETS = ["video_editor_assets"] as const;
const FOLDERS = ["video_editor_folders"] as const;
// Tabelas novas (docs/sql/20261105_video_editor_assets.sql) ainda fora dos tipos gerados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (t: string) => (supabase as any).from(t);

export function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return e?.code === "42P01" || e?.code === "PGRST205" || /video_editor_/.test(e?.message ?? "");
}

async function run<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

export function useEditorAssets() {
  return useQuery({
    queryKey: ASSETS,
    retry: false,
    queryFn: async () => (await run<EditorAsset[]>(db("video_editor_assets").select("*").order("created_at", { ascending: false }))) ?? [],
  });
}

export function useEditorFolders() {
  return useQuery({
    queryKey: FOLDERS,
    retry: false,
    queryFn: async () => (await run<EditorFolder[]>(db("video_editor_folders").select("id,name").order("name"))) ?? [],
  });
}

export function useEditorMediaMutations(orgId: string | undefined) {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ASSETS });
    qc.invalidateQueries({ queryKey: FOLDERS });
  };
  return {
    upload: useMutation({
      mutationFn: async ({ file, folderId, onProgress }: { file: File; folderId: string | null; onProgress?: (p: number) => void }) => {
        if (!orgId) throw new Error("Organização não encontrada.");
        const kind = kindOf(file.name);
        if (!kind) throw new Error(`Formato não suportado: ${file.name}`);
        if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} passa de 2 GB.`);
        const meta = await probeFile(file, kind);
        const uid = crypto.randomUUID();
        const base = slugify(file.name.replace(/\.[^.]+$/, "")) || "arquivo";
        const path = `${orgId}/${uid}-${base}.${extOf(file.name)}`;
        await uploadToStorage(BUCKET, path, file, { contentType: file.type || undefined, onProgress });
        let thumbPath: string | null = null;
        if (meta.thumb) {
          thumbPath = `${orgId}/${uid}-thumb.jpg`;
          try { await uploadToStorage(BUCKET, thumbPath, meta.thumb, { contentType: "image/jpeg" }); } catch { thumbPath = null; }
        }
        try {
          await run(db("video_editor_assets").insert({
            folder_id: folderId, name: file.name, kind, mime_type: file.type || null, size_bytes: file.size,
            duration_ms: meta.duration_ms, width: meta.width, height: meta.height, storage_path: path, thumbnail_path: thumbPath,
          }));
        } catch (e) {
          await supabase.storage.from(BUCKET).remove([path, ...(thumbPath ? [thumbPath] : [])]);
          throw e;
        }
      },
      onSettled: refresh,
    }),
    rename: useMutation({
      mutationFn: ({ id, name }: { id: string; name: string }) => run(db("video_editor_assets").update({ name }).eq("id", id)),
      onSuccess: refresh,
    }),
    move: useMutation({
      mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) => run(db("video_editor_assets").update({ folder_id: folderId }).eq("id", id)),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: async (a: EditorAsset) => {
        await run(db("video_editor_assets").delete().eq("id", a.id));
        await supabase.storage.from(BUCKET).remove([a.storage_path, ...(a.thumbnail_path ? [a.thumbnail_path] : [])]);
      },
      onSuccess: refresh,
    }),
    createFolder: useMutation({
      mutationFn: (name: string) => run(db("video_editor_folders").insert({ name })),
      onSuccess: refresh,
    }),
    renameFolder: useMutation({
      mutationFn: ({ id, name }: { id: string; name: string }) => run(db("video_editor_folders").update({ name }).eq("id", id)),
      onSuccess: refresh,
    }),
    removeFolder: useMutation({
      mutationFn: (id: string) => run(db("video_editor_folders").delete().eq("id", id)),
      onSuccess: refresh,
    }),
  };
}
