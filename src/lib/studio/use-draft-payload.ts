import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MEDIA_BUCKET } from "./use-signed-url";
import type { CanvasTemplate, TemplateElement } from "./types";

type MediaRow = {
  id: string;
  name: string | null;
  type: string | null;
  storage_path: string | null;
  thumbnail_path: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
};

type EnrichedMedia = MediaRow & {
  url: string | null;
  thumbnail_url: string | null;
};

const SIGNED_URL_TTL = 60 * 15;

function collectMediaIds(
  template: CanvasTemplate,
  elements: TemplateElement[],
): string[] {
  const ids = new Set<string>();
  if (template.background_media_id) ids.add(template.background_media_id);
  for (const el of elements) {
    if (
      el.element_type === "image" ||
      el.element_type === "logo" ||
      el.element_type === "video"
    ) {
      const mid = (el.content as { mediaFileId?: string } | null)?.mediaFileId;
      if (mid) ids.add(mid);
    }
  }
  return Array.from(ids);
}

async function signPath(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  return data?.signedUrl ?? null;
}

/**
 * Monta o payload de rascunho no MESMO formato que a Edge Function
 * get-preview-data devolveria para scope='template'. Resolve URLs assinadas
 * para todos os mediaFileIds referenciados pelos elementos e pelo background.
 *
 * Não inclui playlists — o rascunho não persiste playlist_items no editor;
 * o motor de playlist do Player usa os dados persistidos na live.
 */
export function useStudioDraftPayload(
  template: CanvasTemplate | undefined,
  elements: TemplateElement[],
  enabled: boolean,
) {
  const mediaIds = useMemo(
    () => (template ? collectMediaIds(template, elements) : []),
    [template, elements],
  );
  const idsKey = mediaIds.join(",");

  const mediaQ = useQuery({
    enabled: enabled && !!template && mediaIds.length > 0,
    queryKey: ["studio_draft_media", idsKey],
    queryFn: async (): Promise<Map<string, EnrichedMedia>> => {
      const { data, error } = await supabase
        .from("media_files")
        .select(
          "id, name, type, storage_path, thumbnail_path, width, height, duration",
        )
        .in("id", mediaIds);
      if (error) throw error;
      const rows = (data ?? []) as MediaRow[];
      const signed = await Promise.all(
        rows.map(async (m) => {
          const [url, thumbnail_url] = await Promise.all([
            signPath(m.storage_path),
            signPath(m.thumbnail_path),
          ]);
          return [m.id, { ...m, url, thumbnail_url }] as const;
        }),
      );
      return new Map(signed);
    },
    staleTime: SIGNED_URL_TTL * 1000 * 0.8,
  });

  return useMemo(() => {
    if (!enabled || !template) return undefined;
    const media = mediaQ.data ?? new Map<string, EnrichedMedia>();

    const background_media = template.background_media_id
      ? media.get(template.background_media_id) ?? null
      : null;

    const enrichedElements = elements.map((el) => {
      if (
        el.element_type === "image" ||
        el.element_type === "logo" ||
        el.element_type === "video"
      ) {
        const mid = (el.content as { mediaFileId?: string } | null)?.mediaFileId;
        return { ...el, media_file: mid ? media.get(mid) ?? null : null };
      }
      if (el.element_type === "playlist") {
        // Rascunho: playlist não é resolvida no editor; Player usa fallback.
        return { ...el, playlist: null };
      }
      return el;
    });

    return {
      mode: "live" as const,
      scope: "template" as const,
      session: { expires_at: null as string | null },
      draft: true,
      template: { ...template, type: "canvas" },
      background_media,
      zones: [] as unknown[],
      elements: enrichedElements,
    };
  }, [enabled, template, elements, mediaQ.data]);
}