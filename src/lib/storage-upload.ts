import * as tus from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";

function getTusErrorMessage(error: unknown): string {
  const detailed = error as {
    message?: string;
    causingError?: { message?: string };
    originalResponse?: {
      getStatus?: () => number;
      getBody?: () => string;
    };
  };

  const status = detailed.originalResponse?.getStatus?.();
  const body = detailed.originalResponse?.getBody?.();
  let serverMessage = body;

  if (body) {
    try {
      const parsed = JSON.parse(body) as { message?: string; error?: string };
      serverMessage = parsed.message ?? parsed.error ?? body;
    } catch {
      serverMessage = body;
    }
  }

  const message =
    serverMessage || detailed.causingError?.message || detailed.message || "Falha no upload.";

  return status ? `Falha no upload (${status}): ${message}` : message;
}

/**
 * Upload retomável (TUS) para o Supabase Storage.
 * Método oficial recomendado para arquivos grandes (>6MB) — suporta até 5GB,
 * retenta automaticamente em falhas de rede e emite progresso real.
 */
export async function uploadToStorage(
  bucket: string,
  path: string,
  file: File | Blob,
  opts: {
    contentType?: string;
    upsert?: boolean;
    onProgress?: (percent: number) => void;
  } = {},
): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Faça login novamente.");

  const projectUrl = (supabase as any).supabaseUrl as string | undefined;
  if (!projectUrl) throw new Error("URL do Supabase indisponível.");
  const endpoint = `${projectUrl}/storage/v1/upload/resumable`;

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      headers: {
        authorization: `Bearer ${token}`,
        "x-upsert": opts.upsert ? "true" : "false",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: opts.contentType || (file as File).type || "application/octet-stream",
        cacheControl: "3600",
      },
      chunkSize: 6 * 1024 * 1024, // 6MB — exigido pelo endpoint do Supabase
      onError: (err) => reject(new Error(getTusErrorMessage(err))),
      onProgress: (bytesSent, bytesTotal) => {
        if (opts.onProgress && bytesTotal > 0) {
          opts.onProgress(Math.round((bytesSent / bytesTotal) * 100));
        }
      },
      onSuccess: () => resolve(),
    });

    upload.findPreviousUploads().then((previous) => {
      if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    }).catch(() => upload.start());
  });
}