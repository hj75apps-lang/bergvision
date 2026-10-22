import { supabase } from "@/integrations/supabase/client";

/**
 * Controle remoto do player sem alterar o schema:
 * - Pausar: desvincula as playlists do player (a tela recebe programação vazia
 *   e mostra o aviso de pausa) e guarda os vínculos neste navegador.
 * - Retomar: recria os vínculos guardados.
 * - Novo código: remove o cadastro do player; a tela perde o acesso e volta
 *   para a tela de pareamento, gerando um novo PIN.
 */
const key = (playerId: string) => `bv:paused-player:${playerId}`;

export function getPausedLinks(playerId: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(playerId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
}

export async function pausePlayer(playerId: string): Promise<number> {
  const { data, error } = await supabase
    .from("playlist_players")
    .select("playlist_id")
    .eq("player_id", playerId);
  if (error) throw error;
  const ids = (data ?? []).map((l: { playlist_id: string }) => l.playlist_id);
  const prev = getPausedLinks(playerId) ?? [];
  window.localStorage.setItem(key(playerId), JSON.stringify(Array.from(new Set(prev.concat(ids)))));
  if (ids.length > 0) {
    const { error: delErr } = await supabase
      .from("playlist_players")
      .delete()
      .eq("player_id", playerId);
    if (delErr) throw delErr;
  }
  return ids.length;
}

export async function resumePlayer(playerId: string, organizationId: string): Promise<number> {
  const ids = getPausedLinks(playerId) ?? [];
  if (ids.length > 0) {
    const { data: existing } = await supabase
      .from("playlist_players")
      .select("playlist_id")
      .eq("player_id", playerId);
    const have = new Set((existing ?? []).map((l: { playlist_id: string }) => l.playlist_id));
    const rows = ids
      .filter((id) => !have.has(id))
      .map((playlist_id) => ({ playlist_id, player_id: playerId, organization_id: organizationId }));
    if (rows.length > 0) {
      const { error } = await supabase.from("playlist_players").insert(rows);
      if (error) throw error;
    }
  }
  window.localStorage.removeItem(key(playerId));
  return ids.length;
}

export async function resetPairing(playerId: string): Promise<void> {
  const { error } = await supabase.from("players").delete().eq("id", playerId);
  if (error) throw error;
  window.localStorage.removeItem(key(playerId));
}
