import { supabase } from "@/integrations/supabase/client";
import { uploadToStorage } from "@/lib/storage-upload";
import { slugifyFilename } from "@/lib/media-utils";
import {
  insertMediaFileWithSchemaFallback,
  type PickerMediaFile,
} from "@/components/studio/media-picker-dialog";

const BUCKET = "media";

export type SaveMode = "replace" | "new";

export type SaveOriginal = {
  id: string;
  name: string;
  storage_path: string;
  thumbnail_path: string | null;
};

export type SaveResult = {
  mediaFile: PickerMediaFile;
  cacheBust: number;
};

/**
 * Persiste um blob PNG editado no Storage. Em modo "replace" sobrescreve o
 * arquivo original (upsert) e atualiza metadados; em modo "new" cria um novo
 * `media_files` na Biblioteca (respeitando RLS pela `organization_id`).
 */
export async function saveEditedImage(params: {
  blob: Blob;
  width: number;
  height: number;
  orgId: string;
  uploaderId: string | null;
  mode: SaveMode;
  original: SaveOriginal;
  onProgress?: (pct: number) => void;
}): Promise<SaveResult> {
  const {
    blob,
    width,
    height,
    orgId,
    uploaderId,
    mode,
    original,
    onProgress,
  } = params;

  if (mode === "replace") {
    await uploadToStorage(BUCKET, original.storage_path, blob, {
      contentType: "image/png",
      upsert: true,
      onProgress: (p) => onProgress?.(Math.round(p * 0.9)),
    });
    onProgress?.(95);
    // Atualiza metadados. Ignora erros de colunas ausentes.
    const updates: Array<Record<string, unknown>> = [
      {
        width,
        height,
        mime_type: "image/png",
        file_size: blob.size,
        size: blob.size,
        updated_at: new Date().toISOString(),
      },
      { width, height, mime_type: "image/png", file_size: blob.size },
      { width, height, file_size: blob.size },
      { width, height },
    ];
    let updated: PickerMediaFile | null = null;
    for (const u of updates) {
      const { data, error } = await supabase
        .from("media_files")
        .update(u)
        .eq("id", original.id)
        .select("id, name, type, storage_path, thumbnail_path, width, height")
        .single();
      if (!error && data) {
        updated = data as PickerMediaFile;
        break;
      }
    }
    onProgress?.(100);
    return {
      mediaFile:
        updated ??
        ({
          id: original.id,
          name: original.name,
          type: "image",
          storage_path: original.storage_path,
          thumbnail_path: original.thumbnail_path,
          width,
          height,
        } as PickerMediaFile),
      cacheBust: Date.now(),
    };
  }

  const uid =
    (crypto as { randomUUID?: () => string }).randomUUID?.() ??
    Math.random().toString(36).slice(2);
  const baseName = original.name.replace(/\.[^.]+$/, "");
  const safe = slugifyFilename(`${baseName}-edit.png`);
  const storagePath = `${orgId}/${uid}-${safe}`;

  await uploadToStorage(BUCKET, storagePath, blob, {
    contentType: "image/png",
    onProgress: (p) => onProgress?.(Math.round(p * 0.85)),
  });
  onProgress?.(92);

  const payload: Record<string, unknown> = {
    organization_id: orgId,
    name: safe,
    type: "image",
    mime_type: "image/png",
    size: blob.size,
    file_size: blob.size,
    width,
    height,
    duration: null,
    storage_path: storagePath,
    thumbnail_path: null,
    uploaded_by: uploaderId,
  };

  let mediaFile: PickerMediaFile;
  try {
    mediaFile = await insertMediaFileWithSchemaFallback(payload);
  } catch (err) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw err;
  }
  onProgress?.(100);
  return { mediaFile, cacheBust: Date.now() };
}