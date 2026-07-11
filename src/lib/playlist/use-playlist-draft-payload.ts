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
  item_type: "media" | "template";
  media_file_id: string | null;
  template_id: string | null;
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
    () =>
      Array.from(
        new Set(
          items
            .filter((i) => i.item_type === "media" && i.media_file_id)
            .map((i) => i.media_file_id as string),
        ),
      ),
    [items],
  );
  const templateIds = useMemo(
    () =>
      Array.from(
        new Set(
          items
            .filter((i) => i.item_type === "template" && i.template_id)
            .map((i) => i.template_id as string),
        ),
      ),
    [items],
  );
  const idsKey = mediaIds.join(",");
  const tplKey = templateIds.join(",");

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

  // Templates de itens do tipo 'template' — resolve recursivamente elementos
  // + mídias referenciadas (mesmo formato do get-preview-data para template).
  const templatesQ = useQuery({
    enabled: enabled && !!meta && templateIds.length > 0,
    queryKey: ["playlist_draft_templates", tplKey],
    queryFn: async () => {
      const [tplRes, elRes] = await Promise.all([
        supabase.from("templates").select("*").in("id", templateIds),
        supabase
          .from("template_elements")
          .select("*")
          .in("template_id", templateIds)
          .order("z_index"),
      ]);
      if (tplRes.error) throw tplRes.error;
      if (elRes.error) throw elRes.error;
      const tpls = (tplRes.data ?? []) as Array<Record<string, unknown>>;
      const elements = (elRes.data ?? []) as Array<Record<string, unknown>>;

      // Coletar mídias referenciadas em elementos + backgrounds
      const mids = new Set<string>();
      for (const t of tpls) {
        const bg = t.background_media_id as string | null | undefined;
        if (bg) mids.add(bg);
      }
      for (const el of elements) {
        const c = (el.content as { mediaFileId?: string } | null) ?? null;
        if (c?.mediaFileId) mids.add(c.mediaFileId);
      }

      let mediaMap = new Map<string, EnrichedMedia>();
      if (mids.size > 0) {
        const { data, error } = await supabase
          .from("media_files")
          .select(
            "id, name, type, storage_path, thumbnail_path, width, height, duration",
          )
          .in("id", Array.from(mids));
        if (error) throw error;
        const signed = await Promise.all(
          ((data ?? []) as MediaRow[]).map(async (m) => {
            const [url, thumbnail_url] = await Promise.all([
              signPath(m.storage_path),
              signPath(m.thumbnail_path),
            ]);
            return [m.id, { ...m, url, thumbnail_url }] as const;
          }),
        );
        mediaMap = new Map(signed);
      }

      const byTemplate = new Map<
        string,
        Record<string, unknown>
      >();
      for (const t of tpls) {
        const tid = t.id as string;
        const bg = t.background_media_id as string | null | undefined;
        const els = elements
          .filter((e) => e.template_id === tid)
          .map((e) => {
            const c = (e.content as { mediaFileId?: string } | null) ?? null;
            if (c?.mediaFileId) {
              return { ...e, media_file: mediaMap.get(c.mediaFileId) ?? null };
            }
            return e;
          });
        byTemplate.set(tid, {
          template: t,
          background_media: bg ? mediaMap.get(bg) ?? null : null,
          zones: [],
          elements: els,
        });
      }
      return byTemplate;
    },
    staleTime: SIGNED_URL_TTL * 1000 * 0.8,
  });

  return useMemo(() => {
    if (!enabled || !meta) return undefined;
    const media = mediaQ.data ?? new Map<string, EnrichedMedia>();
    const templates =
      templatesQ.data ?? new Map<string, Record<string, unknown>>();

    const sorted = items
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((it) => {
        if (it.item_type === "template" && it.template_id) {
          return {
            ...it,
            media_file: null,
            template_payload: templates.get(it.template_id) ?? null,
          };
        }
        return {
          ...it,
          media_file: it.media_file_id
            ? media.get(it.media_file_id) ?? null
            : null,
          template_payload: null,
        };
      });

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
  }, [enabled, meta, items, mediaQ.data, templatesQ.data]);
}