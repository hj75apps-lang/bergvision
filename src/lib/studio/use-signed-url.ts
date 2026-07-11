import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const MEDIA_BUCKET = "media";

// URLs assinadas ficam ~1h em cache no React Query.
// Renovamos com folga (staleTime = 50min) para evitar 403 no player durante
// transições de itens da playlist e garantir que a imagem apareça JUNTO com
// o template — sem flash de spinner quando o item entra em cena.
const SIGNED_URL_TTL = 3600;
const STALE_MS = 50 * 60 * 1000;

function signedUrlQueryKey(path: string, expiresIn: number) {
  return ["signed-url", MEDIA_BUCKET, path, expiresIn] as const;
}

async function fetchSignedUrl(path: string, expiresIn: number) {
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data?.signedUrl ?? null;
}

export function useSignedUrl(
  path: string | null | undefined,
  expiresIn = SIGNED_URL_TTL,
) {
  const { data } = useQuery({
    queryKey: path ? signedUrlQueryKey(path, expiresIn) : ["signed-url", "none"],
    queryFn: () => fetchSignedUrl(path as string, expiresIn),
    enabled: !!path,
    staleTime: STALE_MS,
    gcTime: STALE_MS,
  });
  return data ?? null;
}

/**
 * Faz o pré-carregamento de URLs assinadas + warm-up de decode da imagem.
 * Chamado no preview da playlist para que, quando o próximo item (template)
 * entrar em cena, todas as imagens já estejam prontas na memória do browser.
 *
 * - Deduplica automaticamente via React Query (mesma chave -> uma requisição).
 * - warmup=true dispara `Image().decode()` para forçar o browser a decodificar
 *   o bitmap antes da troca de item (custo ínfimo, mas elimina o "pop" inicial).
 */
export async function prefetchSignedUrls(
  qc: QueryClient,
  paths: Array<string | null | undefined>,
  opts: { warmup?: boolean; expiresIn?: number } = {},
) {
  const { warmup = true, expiresIn = SIGNED_URL_TTL } = opts;
  const unique = Array.from(
    new Set(
      paths.filter((p): p is string => typeof p === "string" && p.length > 0),
    ),
  );
  await Promise.all(
    unique.map(async (p) => {
      const url = await qc.ensureQueryData({
        queryKey: signedUrlQueryKey(p, expiresIn),
        queryFn: () => fetchSignedUrl(p, expiresIn),
        staleTime: STALE_MS,
        gcTime: STALE_MS,
      });
      if (!warmup || !url || typeof window === "undefined") return;
      // Warm-up: baixa e decodifica sem bloquear a UI. Falhas silenciosas —
      // o <img> real tentará novamente com a mesma URL cacheada pelo browser.
      try {
        const img = new Image();
        img.decoding = "async";
        img.src = url;
        if (typeof img.decode === "function") {
          await img.decode().catch(() => {});
        }
      } catch {
        // ignore
      }
    }),
  );
}