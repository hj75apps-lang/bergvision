import { supabase } from "@/integrations/supabase/client";
import { uploadToStorage } from "@/lib/storage-upload";
import { slugifyFilename } from "@/lib/media-utils";
import { insertMediaFileWithSchemaFallback } from "@/components/studio/media-picker-dialog";
import type { ImportedLayer } from "./graphic-import";

const BUCKET = "media";

/**
 * Envia as imagens das camadas para a Biblioteca (media_files) e cria os
 * elementos no template, mantendo a ordem (primeira camada = mais ao fundo).
 * Retorna os ids dos elementos criados.
 */
export async function persistImportedLayers(params: {
  layers: ImportedLayer[];
  templateId: string;
  orgId: string;
  uploaderId: string | null;
  baseZ: number;
  fileLabel: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<string[]> {
  const { layers, templateId, orgId, uploaderId, baseZ, fileLabel, onProgress } = params;
  const rows: Record<string, unknown>[] = [];
  const total = layers.length;
  let done = 0;
  for (const [i, l] of layers.entries()) {
    const common = {
      template_id: templateId,
      x: l.x,
      y: l.y,
      width: l.width,
      height: l.height,
      rotation: 0,
      z_index: baseZ + 1 + i,
      opacity: l.opacity,
      locked: false,
      visible: l.visible,
    };
    const groupPath = l.groupPath.length ? { groupPath: l.groupPath } : {};
    if (l.kind === "text") {
      rows.push({
        ...common,
        element_type: "text",
        content: {
          element_type: "text",
          name: l.name,
          content: l.text,
          fontFamily: l.fontFamily,
          fontSizePercent: l.fontSizePercent,
          fontWeight: l.fontWeight,
          color: l.color,
          textAlign: l.textAlign,
          ...groupPath,
        },
      });
    } else {
      const uid = crypto.randomUUID();
      const fileName = `${fileLabel} - ${l.name}.png`;
      const storagePath = `${orgId}/${uid}-${slugifyFilename(fileName)}`;
      await uploadToStorage(BUCKET, storagePath, l.blob, { contentType: "image/png" });
      let media: { id: string; name: string; storage_path: string; thumbnail_path: string | null };
      try {
        media = await insertMediaFileWithSchemaFallback({
          organization_id: orgId,
          name: fileName,
          type: "image",
          mime_type: "image/png",
          size: l.blob.size,
          file_size: l.blob.size,
          width: l.pxWidth,
          height: l.pxHeight,
          duration: null,
          storage_path: storagePath,
          thumbnail_path: null,
          uploaded_by: uploaderId,
        });
      } catch (e) {
        await supabase.storage.from(BUCKET).remove([storagePath]);
        throw e;
      }
      rows.push({
        ...common,
        element_type: "image",
        content: {
          element_type: "image",
          name: l.name,
          fit: "contain",
          mediaFileId: media.id,
          mediaFileName: media.name,
          mediaStoragePath: media.storage_path,
          mediaThumbnailPath: media.thumbnail_path,
          ...groupPath,
        },
      });
    }
    done += 1;
    onProgress?.(done, total);
  }
  const { data, error } = await supabase.from("template_elements").insert(rows).select("id");
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}
