import { createFileRoute } from "@tanstack/react-router";

// Geração de imagens com IA (OpenAI / Google Gemini).
// As chaves ficam somente no servidor (OPENAI_API_KEY, GEMINI_API_KEY).
// Exige o token de sessão do usuário logado (Authorization: Bearer ...).

type Body = {
  action?: string;
  provider?: string;
  prompt?: string;
  aspect?: string;
  quality?: string;
  references?: unknown[];
};

const OPENAI_SIZES: Record<string, string> = {
  "1:1": "1024x1024",
  "16:9": "1536x1024",
  "4:3": "1536x1024",
  "9:16": "1024x1536",
  "3:4": "1024x1536",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function parseDataUrl(u: string): { mime: string; b64: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/.exec(u);
  return m ? { mime: m[1], b64: m[2] } : null;
}

async function withRetry(fn: () => Promise<Response>): Promise<Response> {
  let res = await fn();
  for (let i = 0; i < 2 && (res.status === 429 || res.status >= 500); i++) {
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    res = await fn();
  }
  return res;
}

async function upstreamError(res: Response, label: string) {
  let msg = "";
  try {
    const j = (await res.json()) as { error?: { message?: string }; message?: string };
    msg = j.error?.message ?? j.message ?? "";
  } catch {
    /* ignore */
  }
  console.error(`[ai/image] ${label} ${res.status}: ${msg}`);
  const status = res.status === 401 || res.status === 403 ? 403 : res.status === 429 ? 429 : 502;
  return json({ error: "provider_error", message: `${label}: ${msg || `erro ${res.status}`}` }, status);
}

async function verifyUser(auth: string): Promise<{ id: string } | null> {
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: key },
  });
  if (!res.ok) return null;
  const u = (await res.json()) as { id?: string };
  return u.id ? { id: u.id } : null;
}

async function genOpenAI(key: string, prompt: string, aspect: string, quality: string, refs: string[]) {
  const size = OPENAI_SIZES[aspect] ?? "1024x1024";
  const model = "gpt-image-1";
  const res =
    refs.length > 0
      ? await withRetry(() => {
          const fd = new FormData();
          fd.append("model", model);
          fd.append("prompt", prompt);
          fd.append("size", size);
          fd.append("quality", quality);
          refs.slice(0, 4).forEach((r, i) => {
            const p = parseDataUrl(r);
            if (!p) return;
            const bin = Uint8Array.from(atob(p.b64), (c) => c.charCodeAt(0));
            fd.append("image[]", new Blob([bin], { type: p.mime }), `ref${i}.png`);
          });
          return fetch("https://api.openai.com/v1/images/edits", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}` },
            body: fd,
          });
        })
      : await withRetry(() =>
          fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model, prompt, size, quality, n: 1 }),
          }),
        );
  if (!res.ok) return upstreamError(res, "OpenAI");
  const j = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) return json({ error: "empty", message: "A OpenAI não devolveu imagem." }, 502);
  return json({ image: `data:image/png;base64,${b64}`, provider: "openai", model });
}

async function genGemini(key: string, prompt: string, aspect: string, refs: string[]) {
  const model = "gemini-2.5-flash-image";
  const parts: Record<string, unknown>[] = [{ text: prompt }];
  for (const r of refs.slice(0, 4)) {
    const p = parseDataUrl(r);
    if (p) parts.push({ inline_data: { mime_type: p.mime, data: p.b64 } });
  }
  const res = await withRetry(() =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: aspect } },
      }),
    }),
  );
  if (!res.ok) return upstreamError(res, "Google Gemini");
  type Part = { inlineData?: { data?: string; mimeType?: string } };
  const j = (await res.json()) as { candidates?: { content?: { parts?: Part[] } }[] };
  const d = (j.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data)?.inlineData;
  if (!d?.data) {
    return json(
      { error: "empty", message: "O Gemini não devolveu imagem (o pedido pode ter sido recusado)." },
      422,
    );
  }
  return json({ image: `data:${d.mimeType ?? "image/png"};base64,${d.data}`, provider: "gemini", model });
}

export const Route = createFileRoute("/api/ai/image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("Authorization") ?? "";
        if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
        const user = await verifyUser(auth);
        if (!user) return json({ error: "unauthorized", message: "Sessão expirada." }, 401);

        const openaiKey = process.env.OPENAI_API_KEY ?? "";
        const geminiKey = process.env.GEMINI_API_KEY ?? "";
        let body: Body = {};
        try {
          body = (await request.json()) as Body;
        } catch {
          /* vazio */
        }

        if (body.action === "status") {
          return json({
            providers: {
              openai: !!openaiKey,
              gemini: !!geminiKey,
              runway: !!process.env.RUNWAY_API_KEY,
            },
          });
        }

        const prompt = String(body.prompt ?? "").trim().slice(0, 4000);
        if (!prompt) return json({ error: "invalid", message: "Descreva a imagem." }, 400);
        const aspect = String(body.aspect ?? "1:1");
        const quality = ["low", "medium", "high"].includes(String(body.quality))
          ? String(body.quality)
          : "medium";
        const refs = (Array.isArray(body.references) ? body.references : []).filter(
          (r): r is string => typeof r === "string",
        );

        try {
          if (body.provider === "gemini") {
            if (!geminiKey)
              return json({ error: "not_configured", message: "Chave do Google Gemini não configurada." }, 412);
            return await genGemini(geminiKey, prompt, aspect, refs);
          }
          if (!openaiKey)
            return json({ error: "not_configured", message: "Chave da OpenAI não configurada." }, 412);
          return await genOpenAI(openaiKey, prompt, aspect, quality, refs);
        } catch (e) {
          console.error("[ai/image] fetch failed", e);
          return json({ error: "fetch_failed", message: "Falha ao contatar o provedor de IA." }, 502);
        }
      },
    },
  },
});
