/**
 * Regra única de "online" para players.
 * O sinal de vida (last_heartbeat) ou device_status é a fonte da verdade: a tela envia a cada
 * 30–60s, então damos 10 minutos de folga para atrasos de rede, suspensão do SO e diferença de
 * relógio. O campo status só derruba quando a própria tela marcou "offline".
 */
export const HEARTBEAT_OFFLINE_MS = 600_000;

export function isPlayerOnline(
  p: { last_heartbeat: string | null; status?: string | null },
  nowMs: number,
): boolean {
  if (!p.last_heartbeat) return false;
  const last = new Date(p.last_heartbeat).getTime();
  if (Number.isNaN(last)) return false;
  if (nowMs - last > HEARTBEAT_OFFLINE_MS) return false;
  const s = (p.status || "").toLowerCase();
  return s !== "offline" && s !== "disabled" && s !== "blocked";
}
