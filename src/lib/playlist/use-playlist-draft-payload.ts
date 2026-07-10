import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MEDIA_BUCKET } from "@/lib/studio/use-signed-url";

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

export type PlaylistDraftMeta = {
  id: string;
  organization_id: string;
  name: string;
  is_active: boolean;
  schedule_start: string | null;
  schedule_end: string | null;
  schedule_days: number[] | null;
};

export type PlaylistDraftItem = {
  id: string;
  playlist_id: string;
  media_file_id: string;
  position: number;
  duration: number | null;
  transition: string | null;
};

async function signPath(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  return data?.signedUrl ?? null;
}

/**
 * Constrói o mesmo payload que a Edge Function get-preview-data devolveria
 * para scope='playlist', a partir do estado local (com edições não salvas).
 */
export function usePlaylistDraftPayload(
  meta: PlaylistDraftMeta | undefined,
  items: PlaylistDraftItem[],
  enabled: boolean,
) {
  const mediaIds = useMemo(
    () => Array.from(new Set(items.map((i) => i.media_file_id).filter(Boolean))),
    [items],
  );
  const idsKey = mediaIds.join(",");

  const mediaQ = useQuery({
    enabled: enabled && !!meta && mediaIds.length > 0,
    queryKey: ["playlist_draft_media", idsKey],
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
    if (!enabled || !meta) return undefined;
    const media = mediaQ.data ?? new Map<string, EnrichedMedia>();

    const sorted = items
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((it) => ({
        ...it,
        media_file: media.get(it.media_file_id) ?? null,
      }));

    return {
      mode: "live" as const,
      scope: "playlist" as const,
      session: { expires_at: null as string | null },
      draft: true,
      playlist: {
        ...meta,
        items: sorted,
      },
    };
  }, [enabled, meta, items, mediaQ.data]);
}