/**
 * Contrato canônico Admin ↔ Player — protocolo v1.
 * Espelha docs/player-protocol-v1.md. Este arquivo deve ser copiado sem
 * alterações para o projeto do Player (sem dependências além de zod).
 * Compatível com Android 7 (sem optional chaining no código gerado pelo app).
 */
import { z } from "zod";

export const PROTOCOL_VERSION = "1.0" as const;

const isoUtc = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/, "deve ser ISO 8601 em UTC (sufixo Z)");
const uuid = z.string().uuid();
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:mm");
const ianaTz = z.string().min(3).regex(/^[A-Za-z_]+(\/[A-Za-z0-9_+\-]+)+$|^UTC$/, "timezone IANA");

/* ---------------- Mídia ---------------- */

export const ProviderSchema = z.enum(["youtube", "vimeo_embed", "direct"]);
export type Provider = z.infer<typeof ProviderSchema>;

export const CachePolicySchema = z.enum(["forbidden", "authorized"]);
export type CachePolicy = z.infer<typeof CachePolicySchema>;

export const ScheduleSchema = z
  .object({
    dateStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    dateEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    timeStart: hhmm.nullable(),
    timeEnd: hhmm.nullable(),
    /** 0 = domingo … 6 = sábado. Vazio/null = todos os dias. */
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).nullable(),
    /** Após esta data/hora UTC o item não pode ser exibido, mesmo offline. */
    validUntil: isoUtc.nullable(),
  })
  .refine((s) => !s.dateStart || !s.dateEnd || s.dateStart <= s.dateEnd, "dateStart > dateEnd");

export const VariantSchema = z.object({
  variantId: z.string().min(1),
  /** URL https; se temporária, expiresAt é obrigatório. */
  url: z.string().url().startsWith("https://"),
  expiresAt: isoUtc.nullable(),
  mimeType: z.string().min(3),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  bitrateKbps: z.number().int().positive().nullable(),
  fps: z.number().positive().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  /** Perfil de compatibilidade, ex.: "mp4-h264-aac-1080p". */
  profile: z.string().nullable(),
});

export const ItemSchema = z
  .object({
    itemId: z.string().min(1),
    assetId: z.string().min(1),
    assetVersion: z.number().int().nonnegative(),
    kind: z.enum(["video", "image", "template", "live"]),
    provider: ProviderSchema,
    /** Referência estável (ID do YouTube, ID do Vimeo, assetId). Nunca uma URL temporária. */
    sourceRef: z.string().min(1),
    /** Duração em milissegundos; null apenas para kind="live". */
    durationMs: z.number().int().positive().nullable(),
    schedule: ScheduleSchema.nullable(),
    variants: z.array(VariantSchema),
    cachePolicy: CachePolicySchema,
  })
  .superRefine((it, ctx) => {
    if (it.provider === "youtube" && it.cachePolicy !== "forbidden")
      ctx.addIssue({ code: "custom", message: "YouTube exige cachePolicy=forbidden" });
    if (it.provider === "youtube" && it.variants.length > 0)
      ctx.addIssue({ code: "custom", message: "YouTube não pode ter variantes de arquivo" });
    if (it.kind !== "live" && it.durationMs === null)
      ctx.addIssue({ code: "custom", message: "durationMs obrigatório fora de live" });
    if (it.kind === "live" && it.cachePolicy !== "forbidden")
      ctx.addIssue({ code: "custom", message: "live exige cachePolicy=forbidden" });
    if (it.provider === "direct" && it.variants.length === 0 && it.kind !== "template")
      ctx.addIssue({ code: "custom", message: "direct exige ao menos uma variante" });
  });
export type Item = z.infer<typeof ItemSchema>;

export const ManifestSchema = z
  .object({
    playlistId: uuid,
    revision: z.number().int().positive(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    timezone: ianaTz,
    generatedAt: isoUtc,
    items: z.array(ItemSchema).max(500),
    fallbackItemId: z.string().nullable(),
  })
  .superRefine((m, ctx) => {
    const ids = new Set<string>();
    for (const it of m.items) {
      if (ids.has(it.itemId)) ctx.addIssue({ code: "custom", message: `itemId duplicado: ${it.itemId}` });
      ids.add(it.itemId);
    }
    if (m.fallbackItemId !== null && !ids.has(m.fallbackItemId))
      ctx.addIssue({ code: "custom", message: "fallbackItemId não existe em items" });
  });
export type Manifest = z.infer<typeof ManifestSchema>;

/* ---------------- Comandos e ACK ---------------- */

export const CommandActionSchema = z.enum([
  "PAUSE",
  "RESUME",
  "SKIP",
  "RELOAD_MANIFEST",
  "IDENTIFY",
  "RESTART_APP",
  "CLEAR_CACHE",
]);

export const CommandSchema = z.object({
  commandId: uuid,
  action: CommandActionSchema,
  expiresAt: isoUtc,
  /** SKIP/PAUSE só valem para esta revisão; null = qualquer. */
  expectedRevision: z.number().int().positive().nullable(),
  args: z.record(z.unknown()),
});
export type Command = z.infer<typeof CommandSchema>;

export const AckStatusSchema = z.enum(["received", "executed", "failed", "expired"]);
export const AckSchema = z.object({
  commandId: uuid,
  status: AckStatusSchema,
  at: isoUtc,
  detail: z.string().max(500).nullable(),
});

/* ---------------- Estado do dispositivo ---------------- */

export const ManifestStateSchema = z.enum(["received", "validated", "prepared", "activated", "failed"]);
export const ItemStateSchema = z.enum(["ready_local", "stream_only", "blocked", "failed"]);

const measured = <T extends z.ZodTypeAny>(t: T) =>
  z.object({ value: t.nullable(), reason: z.string().nullable() }).refine(
    (v) => v.value !== null || (v.reason !== null && v.reason.length > 0),
    "valor null exige motivo",
  );

export const DeviceStatusSchema = z.object({
  desiredRevision: z.number().int().positive().nullable(),
  activeRevision: z.number().int().positive().nullable(),
  manifestState: ManifestStateSchema,
  items: z.array(z.object({ itemId: z.string(), state: ItemStateSchema, error: z.string().nullable() })),
  currentItemId: z.string().nullable(),
  playback: z.enum(["playing", "buffering", "paused", "idle", "error"]),
  playerVersion: z.string(),
  androidVersion: measured(z.string()),
  webviewVersion: measured(z.string()),
  freeStorageBytes: measured(z.number().int().nonnegative()),
  lastError: z.string().nullable(),
});

export const PlaybackEventSchema = z.object({
  eventId: uuid,
  itemId: z.string(),
  provider: ProviderSchema,
  kind: z.enum(["start", "buffering_start", "buffering_end", "recovery", "fallback", "error"]),
  at: isoUtc,
  timeToStartMs: z.number().int().nonnegative().nullable(),
  bufferingMs: z.number().int().nonnegative().nullable(),
});

/* ---------------- Envelope ---------------- */

export const MessageTypeSchema = z.enum([
  "manifest",
  "command",
  "ack",
  "device_status",
  "playback_events",
  "heartbeat",
]);

export const EnvelopeSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  messageId: uuid,
  tenantId: uuid,
  deviceId: uuid,
  type: MessageTypeSchema,
  sentAt: isoUtc,
  payload: z.unknown(),
});
export type Envelope = z.infer<typeof EnvelopeSchema>;

const payloadByType = {
  manifest: ManifestSchema,
  command: CommandSchema,
  ack: AckSchema,
  device_status: DeviceStatusSchema,
  playback_events: z.array(PlaybackEventSchema).max(200),
  heartbeat: z.object({ uptimeSec: z.number().int().nonnegative() }),
} as const;

/** Valida envelope + payload e confere IDs contra a identidade autenticada. */
export function parseEnvelope(
  raw: unknown,
  identity: { tenantId: string; deviceId: string },
): { ok: true; value: Envelope } | { ok: false; error: string } {
  const env = EnvelopeSchema.safeParse(raw);
  if (!env.success) {
    const pv = raw && typeof raw === "object" ? (raw as Record<string, unknown>).protocolVersion : undefined;
    if (pv !== undefined && pv !== PROTOCOL_VERSION) return { ok: false, error: "incompatible_version" };
    return { ok: false, error: "invalid_envelope: " + env.error.issues[0].message };
  }
  if (env.data.tenantId !== identity.tenantId || env.data.deviceId !== identity.deviceId)
    return { ok: false, error: "identity_mismatch" };
  const p = payloadByType[env.data.type].safeParse(env.data.payload);
  if (!p.success) return { ok: false, error: "invalid_payload: " + p.error.issues[0].message };
  return { ok: true, value: env.data };
}

/* ---------------- Regras compartilhadas ---------------- */

/** Classifica um link de vídeo. YouTube nunca é cacheado; Vimeo embed também não. */
export function classifyLink(url: string): { provider: Provider; cachePolicy: CachePolicy; sourceRef: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtu.be" || host.endsWith("youtube.com") || host === "youtube-nocookie.com") {
    const id =
      host === "youtu.be"
        ? u.pathname.slice(1).split("/")[0]
        : u.searchParams.get("v") || (u.pathname.match(/\/(embed|shorts|live)\/([\w-]{6,})/) || [])[2] || "";
    return id ? { provider: "youtube", cachePolicy: "forbidden", sourceRef: id } : null;
  }
  if (host.endsWith("vimeo.com")) {
    const m = u.pathname.match(/(\d{6,})/) || [null, u.searchParams.get("video")];
    const id = m[1];
    return id ? { provider: "vimeo_embed", cachePolicy: "forbidden", sourceRef: id } : null;
  }
  return { provider: "direct", cachePolicy: "authorized", sourceRef: url };
}

/** Decide se uma revisão recebida deve ser aceita (rejeita antigas e repetidas). */
export function shouldAcceptRevision(activeOrDesired: number | null, incoming: number): boolean {
  return activeOrDesired === null || incoming > activeOrDesired;
}

/** Estado do comando: rejeita vencidos, duplicados e de revisão diferente. */
export function evaluateCommand(
  cmd: Command,
  ctx: { nowMs: number; processedIds: ReadonlySet<string>; activeRevision: number | null },
): "execute" | "duplicate" | "expired" | "revision_mismatch" {
  if (ctx.processedIds.has(cmd.commandId)) return "duplicate";
  if (new Date(cmd.expiresAt).getTime() <= ctx.nowMs) return "expired";
  if (cmd.expectedRevision !== null && cmd.expectedRevision !== ctx.activeRevision) return "revision_mismatch";
  return "execute";
}

/** Intervalo de heartbeat com jitter de ±20% (padrão 30 s). */
export function heartbeatDelayMs(baseMs = 30_000, rand: () => number = Math.random): number {
  return Math.round(baseMs * (0.8 + rand() * 0.4));
}

/** Backoff exponencial com jitter total, limitado. */
export function backoffMs(attempt: number, baseMs = 1_000, capMs = 60_000, rand: () => number = Math.random): number {
  const exp = Math.min(capMs, baseMs * Math.pow(2, Math.max(0, attempt)));
  return Math.round(rand() * exp);
}

/** Indisponível após janela tolerante (padrão 120 s). Relógio adiantado conta como recente. */
export function isDeviceReachable(lastSeenIso: string | null, nowMs: number, windowMs = 120_000): boolean {
  if (!lastSeenIso) return false;
  const t = new Date(lastSeenIso).getTime();
  if (Number.isNaN(t)) return false;
  return nowMs - t <= windowMs;
}

/** Item pode ser exibido agora? Respeita validUntil mesmo offline. */
export function isItemValidAt(item: Item, nowMs: number): boolean {
  const s = item.schedule;
  if (!s) return true;
  if (s.validUntil && new Date(s.validUntil).getTime() <= nowMs) return false;
  return true;
}

/** URL temporária precisa ser renovada? (margem de 5 min) */
export function needsRenewal(expiresAt: string | null, nowMs: number, marginMs = 300_000): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() - marginMs <= nowMs;
}
