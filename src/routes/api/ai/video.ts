import { createFileRoute } from "@tanstack/react-router";

// Geração de vídeos exclusivamente com Google Veo (API Gemini).
// A chave GEMINI_API_KEY fica somente no servidor.
// Fluxo: start -> (status em loop) -> download (proxy, porque o link do Google exige a chave).

const MODELS: Record<string, string> = {
  "veo-3.1": "veo-3.1-generate-preview",
  "veo-3.1-fast": "veo-3.1-fast-generate-preview",
};
const BASE = "https://generativelanguage.googleapis.com/v1beta";

type Body = {
  action?: string;
  model?: string;
  prompt?: string;
  negativePrompt?: string;
  aspect?: string;
  duration?: number;
  resolution?: string;
  image?: string;
  operation?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function verifyUser(auth: string): Promise<boolean> {
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  const res = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: auth, apikey: key } });
  if (!res.ok) return false;
  const u = (await res.json()) as { id?: string };
  return !!u.id;
}

async function upstreamError(res: Response) {
  let msg = "";
  try {
    const j = (await res.json()) as { error?: { message?: string } };
    msg = j.error?.message ?? "";
  } catch {
    /* ignore */
  }
  console.error(`[ai/video] Veo ${res.status}: ${msg}`);
  const status = res.status === 401 || res.status === 403 ? 403 : res.status === 429 ? 429 : res.status === 400 ? 400 : 502;
  return json({ error: "provider_error", message: `Google Veo: ${msg || `erro ${res.status}`}` }, status);
}

const OP_RE = /^models\/veo-[a-z0-9.\-]+\/operations\/[A-Za-z0-9_\-]+$/;
const FILE_RE = /^https:\/\/generativelanguage\.googleapis\.com\//;

export const Route = createFileRoute("/api/ai/video")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("Authorization") ?? "";
        if (!auth.startsWith("Bearer ") || !(await verifyUser(auth)))
          return json({ error: "unauthorized", message: "Sessão expirada." }, 401);
        const key = process.env.GEMINI_API_KEY ?? "";
        if (!key) return json({ error: "not_configured", message: "Chave do Google Gemini não configurada." }, 412);

        let body: Body = {};
        try {
          body = (await request.json()) as Body;
        } catch {
          /* vazio */
        }

        try {
          if (body.action === "start") {
            const prompt = String(body.prompt ?? "").trim().slice(0, 4000);
            if (!prompt) return json({ error: "invalid", message: "Descreva o vídeo." }, 400);
            const model = MODELS[String(body.model)] ?? MODELS["veo-3.1"];
            const aspect = body.aspect === "9:16" ? "9:16" : "16:9";
            const duration = [4, 6, 8].includes(Number(body.duration)) ? Number(body.duration) : 8;
            const resolution = body.resolution === "1080p" && duration === 8 ? "1080p" : "720p";
            const instance: Record<string, unknown> = { prompt };
            const m = typeof body.image === "string" ? /^data:([^;]+);base64,(.+)$/.exec(body.image) : null;
            if (m) instance.image = { bytesBase64Encoded: m[2], mimeType: m[1] };
            const parameters: Record<string, unknown> = { aspectRatio: aspect, durationSeconds: duration, resolution };
            const neg = String(body.negativePrompt ?? "").trim();
            if (neg) parameters.negativePrompt = neg.slice(0, 1000);
            const res = await fetch(`${BASE}/models/${model}:predictLongRunning`, {
              method: "POST",
              headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
              body: JSON.stringify({ instances: [instance], parameters }),
            });
            if (!res.ok) return upstreamError(res);
            const j = (await res.json()) as { name?: string };
            if (!j.name) return json({ error: "empty", message: "O Google Veo não iniciou a geração." }, 502);
            return json({ operation: j.name, model });
          }

          if (body.action === "status") {
            const op = String(body.operation ?? "");
            if (!OP_RE.test(op)) return json({ error: "invalid", message: "Operação inválida." }, 400);
            const res = await fetch(`${BASE}/${op}`, { headers: { "x-goog-api-key": key } });
            if (!res.ok) return upstreamError(res);
            type Op = {
              done?: boolean;
              error?: { message?: string };
              response?: {
                generateVideoResponse?: {
                  generatedSamples?: { video?: { uri?: string } }[];
                  raiMediaFilteredReasons?: string[];
                };
              };
            };
            const j = (await res.json()) as Op;
            if (!j.done) return json({ done: false });
            if (j.error) return json({ error: "provider_error", message: `Google Veo: ${j.error.message ?? "falha"}` }, 422);
            const g = j.response?.generateVideoResponse;
            const uri = g?.generatedSamples?.[0]?.video?.uri;
            if (!uri) {
              const why = g?.raiMediaFilteredReasons?.join(" ") ?? "";
              return json({ error: "refused", message: `O Google Veo recusou o pedido. ${why}`.trim() }, 422);
            }
            return json({ done: true, uri });
          }

          if (body.action === "download") {
            const uri = String(body.operation ?? "");
            if (!FILE_RE.test(uri)) return json({ error: "invalid", message: "Link inválido." }, 400);
            const res = await fetch(uri, { headers: { "x-goog-api-key": key }, redirect: "follow" });
            if (!res.ok || !res.body) return upstreamError(res);
            return new Response(res.body, {
              headers: { "Content-Type": res.headers.get("Content-Type") ?? "video/mp4", "Cache-Control": "no-store" },
            });
          }

          return json({ error: "invalid", message: "Ação desconhecida." }, 400);
        } catch (e) {
          console.error("[ai/video] fetch failed", e);
          return json({ error: "fetch_failed", message: "Falha ao contatar o Google Veo." }, 502);
        }
      },
    },
  },
});
