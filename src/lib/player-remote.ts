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

/** Pede à tela (online) que mostre um novo PIN, sem apagar o player. */
export async function requestNewPairingCode(playerId: string, organizationId: string): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from("device_commands" as never).insert({
    organization_id: organizationId,
    player_id: playerId,
    action: "REPAIR",
    args: {},
    expected_revision: null,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    status: "pending",
    created_by: u.user ? u.user.id : null,
  } as never);
  if (error) throw error;
}

/** Confere o PIN mostrado na tela e refaz o pareamento do MESMO player. */
export async function confirmRepair(playerId: string, name: string, code: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("confirm-pairing", {
    body: { code: code.trim().toUpperCase(), name, player_id: playerId },
  });
  if (error) {
    let detail = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const j = (await ctx.json()) as { error?: string };
        if (j.error) detail = j.error;
      }
    } catch {
      /* ignora */
    }
    const map: Record<string, string> = {
      invalid_code: "Código inválido.",
      code_expired: "Código expirado. Gere outro.",
      code_already_used: "Esse código já foi usado.",
      code_other_device: "Esse código é de outra tela, não deste player.",
    };
    throw new Error(map[detail] ?? detail);
  }
  if (!data || (data as { ok?: boolean }).ok !== true) throw new Error("Resposta inesperada do servidor.");
}
