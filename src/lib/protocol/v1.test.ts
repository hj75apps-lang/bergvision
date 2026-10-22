// Testes de contrato v1 — reutilizáveis no projeto do Player (copiar junto com v1.ts).
import { describe, expect, it } from "vitest";
import {
  backoffMs,
  classifyLink,
  evaluateCommand,
  heartbeatDelayMs,
  isDeviceReachable,
  isItemValidAt,
  ItemSchema,
  ManifestSchema,
  needsRenewal,
  parseEnvelope,
  shouldAcceptRevision,
  type Command,
} from "./v1";

const T = "11111111-1111-4111-8111-111111111111";
const D = "22222222-2222-4222-8222-222222222222";
const P = "33333333-3333-4333-8333-333333333333";
const C = "44444444-4444-4444-8444-444444444444";
const M = "55555555-5555-4555-8555-555555555555";
const HASH = "a".repeat(64);
const NOW = Date.parse("2026-10-22T20:00:00Z");

const yt = {
  itemId: "i1", assetId: "a1", assetVersion: 1, kind: "video", provider: "youtube",
  sourceRef: "dQw4w9WgXcQ", durationMs: 30000, schedule: null, variants: [], cachePolicy: "forbidden",
};
const manifest = {
  playlistId: P, revision: 3, contentHash: HASH, timezone: "America/Sao_Paulo",
  generatedAt: "2026-10-22T20:00:00Z", items: [yt], fallbackItemId: "i1",
};
const cmd = (over: Partial<Command> = {}): Command => ({
  commandId: C, action: "SKIP", expiresAt: "2026-10-22T20:05:00Z", expectedRevision: 3, args: {}, ...over,
});

describe("manifesto", () => {
  it("aceita manifesto válido", () => expect(ManifestSchema.safeParse(manifest).success).toBe(true));
  it("rejeita horário sem UTC", () =>
    expect(ManifestSchema.safeParse({ ...manifest, generatedAt: "2026-10-22T17:00:00-03:00" }).success).toBe(false));
  it("rejeita fallback inexistente", () =>
    expect(ManifestSchema.safeParse({ ...manifest, fallbackItemId: "x" }).success).toBe(false));
  it("rejeita itemId duplicado", () =>
    expect(ManifestSchema.safeParse({ ...manifest, items: [yt, yt] }).success).toBe(false));
});

describe("política de mídia", () => {
  it("YouTube com cache autorizado é inválido", () =>
    expect(ItemSchema.safeParse({ ...yt, cachePolicy: "authorized" }).success).toBe(false));
  it("YouTube é classificado como forbidden", () =>
    expect(classifyLink("https://youtu.be/dQw4w9WgXcQ")).toEqual({ provider: "youtube", cachePolicy: "forbidden", sourceRef: "dQw4w9WgXcQ" }));
  it("Vimeo embed é forbidden por padrão", () =>
    expect(classifyLink("https://vimeo.com/123456789")?.cachePolicy).toBe("forbidden"));
  it("link http é recusado", () => expect(classifyLink("http://x.com/a.mp4")).toBeNull());
  it("campanha vencida não é exibida offline", () =>
    expect(isItemValidAt(ItemSchema.parse({ ...yt, schedule: { dateStart: null, dateEnd: null, timeStart: null, timeEnd: null, weekdays: null, validUntil: "2026-10-22T19:00:00Z" } }), NOW)).toBe(false));
  it("URL que vence em 2 min precisa renovar", () => expect(needsRenewal("2026-10-22T20:02:00Z", NOW)).toBe(true));
});

describe("comandos", () => {
  it("SKIP repetido não é reaplicado", () =>
    expect(evaluateCommand(cmd(), { nowMs: NOW, processedIds: new Set([C]), activeRevision: 3 })).toBe("duplicate"));
  it("comando vencido é rejeitado", () =>
    expect(evaluateCommand(cmd({ expiresAt: "2026-10-22T19:59:59Z" }), { nowMs: NOW, processedIds: new Set(), activeRevision: 3 })).toBe("expired"));
  it("comando para revisão antiga é rejeitado", () =>
    expect(evaluateCommand(cmd(), { nowMs: NOW, processedIds: new Set(), activeRevision: 4 })).toBe("revision_mismatch"));
  it("comando novo executa", () =>
    expect(evaluateCommand(cmd(), { nowMs: NOW, processedIds: new Set(), activeRevision: 3 })).toBe("execute"));
});

describe("revisões e conexão", () => {
  it("revisão antiga é ignorada", () => expect(shouldAcceptRevision(5, 4)).toBe(false));
  it("revisão repetida é ignorada", () => expect(shouldAcceptRevision(5, 5)).toBe(false));
  it("heartbeat fica entre 24 e 36 s", () => {
    expect(heartbeatDelayMs(30000, () => 0)).toBe(24000);
    expect(heartbeatDelayMs(30000, () => 1)).toBe(36000);
  });
  it("backoff respeita o teto", () => expect(backoffMs(20, 1000, 60000, () => 1)).toBe(60000));
  it("indisponível após 120 s", () => {
    expect(isDeviceReachable("2026-10-22T19:58:30Z", NOW)).toBe(true);
    expect(isDeviceReachable("2026-10-22T19:57:59Z", NOW)).toBe(false);
  });
});

describe("envelope", () => {
  const env = { protocolVersion: "1.0", messageId: M, tenantId: T, deviceId: D, type: "manifest", sentAt: "2026-10-22T20:00:00Z", payload: manifest };
  it("aceita envelope válido", () => expect(parseEnvelope(env, { tenantId: T, deviceId: D }).ok).toBe(true));
  it("rejeita deviceId de outra tela", () =>
    expect(parseEnvelope(env, { tenantId: T, deviceId: P })).toEqual({ ok: false, error: "identity_mismatch" }));
  it("rejeita versão incompatível", () =>
    expect(parseEnvelope({ ...env, protocolVersion: "2.0" }, { tenantId: T, deviceId: D })).toEqual({ ok: false, error: "incompatible_version" }));
});
