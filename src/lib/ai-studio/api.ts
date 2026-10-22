import { supabase } from "@/integrations/supabase/client";
import { uploadToStorage } from "@/lib/storage-upload";

export type AiProvider = "openai" | "gemini";
export type ProviderStatus = { openai: boolean; gemini: boolean; runway: boolean };

async function authHeader(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Faça login novamente.");
  return `Bearer ${token}`;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/ai/image", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: await authHeader() },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) throw new Error(j.message || j.error || `Erro ${res.status}`);
  return j as T;
}

export function fetchProviderStatus() {
  return call<{ providers: ProviderStatus }>({ action: "status" }).then((r) => r.providers);
}

export function generateImage(input: {
  provider: AiProvider;
  prompt: string;
  aspect: string;
  quality: string;
  references: string[];
}) {
  return call<{ image: string; provider: string; model: string }>({ action: "generate", ...input });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    r.readAsDataURL(file);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = dataUrl;
  });
}

/** Salva a imagem gerada na Biblioteca (bucket "media" + tabela media_files). */
export async function saveImageToLibrary(opts: {
  dataUrl: string;
  name: string;
  orgId: string;
  userId: string | null;
}): Promise<void> {
  const blob = await dataUrlToBlob(opts.dataUrl);
  const ext = blob.type.includes("jpeg") ? "jpg" : blob.type.includes("webp") ? "webp" : "png";
  const slug =
    opts.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "ia";
  const uid = (crypto as { randomUUID?: () => string }).randomUUID?.() ?? Math.random().toString(36).slice(2);
  const path = `${opts.orgId}/${uid}-${slug}.${ext}`;
  const { width, height } = await imageSize(opts.dataUrl);

  await uploadToStorage("media", path, blob, { contentType: blob.type });

  const payload: Record<string, unknown> = {
    organization_id: opts.orgId,
    name: `${opts.name}.${ext}`,
    folder: "Criações IA",
    type: "image",
    mime_type: blob.type,
    size: blob.size,
    file_size: blob.size,
    width: width || null,
    height: height || null,
    storage_path: path,
    uploaded_by: opts.userId,
  };
  const optional = ["mime_type", "size", "width", "height", "uploaded_by"];
  for (let i = 0; i <= optional.length; i++) {
    const { error } = await supabase.from("media_files").insert(payload);
    if (!error) return;
    const m = /'([^']+)' column/.exec(error.message) ?? /column "?([a-z_]+)"? /.exec(error.message);
    const col = m?.[1];
    if (col && optional.includes(col) && col in payload) {
      delete payload[col];
      continue;
    }
    await supabase.storage.from("media").remove([path]);
    throw new Error(error.message);
  }
}

// ---------- Vídeo (Google Veo via API Gemini) ----------
export type VeoModel = "veo-3.1" | "veo-3.1-fast";

async function videoCall(body: Record<string, unknown>): Promise<Response> {
  return fetch("/api/ai/video", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: await authHeader() },
    body: JSON.stringify(body),
  });
}

async function videoJson<T>(body: Record<string, unknown>): Promise<T> {
  const res = await videoCall(body);
  const j = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) throw new Error(j.message || j.error || `Erro ${res.status}`);
  return j as T;
}

/** Gera o vídeo e devolve o arquivo. A geração leva de 1 a 6 minutos. */
export async function generateVideo(
  input: { model: VeoModel; prompt: string; negativePrompt?: string; aspect: string; duration: number; resolution: string; image?: string },
  onTick?: (seconds: number) => void,
): Promise<Blob> {
  const { operation } = await videoJson<{ operation: string }>({ action: "start", ...input });
  const started = Date.now();
  let uri = "";
  let wait = 10000;
  while (!uri) {
    if (Date.now() - started > 10 * 60 * 1000) throw new Error("O Google Veo demorou demais. Tente novamente.");
    await new Promise((r) => setTimeout(r, wait));
    onTick?.(Math.round((Date.now() - started) / 1000));
    try {
      const s = await videoJson<{ done: boolean; uri?: string }>({ action: "status", operation });
      if (s.done && s.uri) uri = s.uri;
      wait = 10000;
    } catch (e) {
      const msg = (e as Error).message;
      if (/429|502|Falha ao contatar/.test(msg) && wait < 60000) {
        wait *= 2;
        continue;
      }
      throw e;
    }
  }
  const res = await videoCall({ action: "download", operation: uri });
  if (!res.ok) throw new Error("Não foi possível baixar o vídeo gerado.");
  return res.blob();
}

/** Salva o vídeo na Biblioteca, pasta "Criações IA". */
export async function saveVideoToLibrary(opts: { blob: Blob; name: string; orgId: string; userId: string | null }): Promise<void> {
  const slug =
    opts.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "video-ia";
  const uid = (crypto as { randomUUID?: () => string }).randomUUID?.() ?? Math.random().toString(36).slice(2);
  const path = `${opts.orgId}/${uid}-${slug}.mp4`;
  await uploadToStorage("media", path, opts.blob, { contentType: "video/mp4" });
  const payload: Record<string, unknown> = {
    organization_id: opts.orgId,
    name: `${opts.name}.mp4`,
    folder: "Criações IA",
    type: "video",
    mime_type: "video/mp4",
    size: opts.blob.size,
    file_size: opts.blob.size,
    storage_path: path,
    uploaded_by: opts.userId,
  };
  const optional = ["mime_type", "size", "uploaded_by"];
  for (let i = 0; i <= optional.length; i++) {
    const { error } = await supabase.from("media_files").insert(payload);
    if (!error) return;
    const m = /'([^']+)' column/.exec(error.message) ?? /column "?([a-z_]+)"? /.exec(error.message);
    const col = m?.[1];
    if (col && optional.includes(col) && col in payload) {
      delete payload[col];
      continue;
    }
    await supabase.storage.from("media").remove([path]);
    throw new Error(error.message);
  }
}
