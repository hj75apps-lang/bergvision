/**
 * Regra única de "online" para players.
 * O sinal de vida (last_heartbeat) é a fonte da verdade: a tela envia a cada
 * 30–60s, então damos 3 minutos de folga para atrasos de rede e diferença de
 * relógio. O campo status só derruba quando a própria tela marcou "offline".
 */
export const HEARTBEAT_OFFLINE_MS = 180_000;

export function isPlayerOnline(
  p: { last_heartbeat: string | null; status?: string | null },
  nowMs: number,
): boolean {
  if (!p.last_heartbeat) return false;
  const last = new Date(p.last_heartbeat).getTime();
  if (Number.isNaN(last)) return false;
  // Relógio do servidor adiantado em relação ao navegador: conta como recente.
  if (nowMs - last > HEARTBEAT_OFFLINE_MS) return false;
  const s = (p.status || "").toLowerCase();
  return s !== "offline" && s !== "disabled" && s !== "blocked";
}
