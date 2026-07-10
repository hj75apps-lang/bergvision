import { Loader2 } from "lucide-react";
import { useSignedUrl } from "@/lib/studio/use-signed-url";
import { ELEMENT_LABELS, type TemplateElement } from "@/lib/studio/types";
import { useEffect, useState } from "react";

export function ElementBody({ el }: { el: TemplateElement }) {
  const c = (el.content ?? {}) as Record<string, unknown>;
  switch (el.element_type) {
    case "text": {
      const text = typeof c.content === "string" ? c.content : "Texto";
      const align = (c.textAlign as string) ?? "left";
      const color = (c.color as string) ?? "#FFFFFF";
      const weight = (c.fontWeight as string) ?? "500";
      const family = (c.fontFamily as string) ?? "Inter";
      const sizePct =
        typeof c.fontSizePercent === "number" ? c.fontSizePercent : 6;
      const bg =
        typeof c.backgroundColor === "string" ? c.backgroundColor : undefined;
      const bgOpacity =
        typeof c.backgroundOpacity === "number" ? c.backgroundOpacity : 1;
      return (
        <div
          className="flex h-full w-full items-center overflow-hidden p-1"
          style={{
            justifyContent:
              align === "center"
                ? "center"
                : align === "right"
                  ? "flex-end"
                  : "flex-start",
            color,
            fontFamily: family,
            fontWeight: weight as React.CSSProperties["fontWeight"],
            fontSize: `${sizePct}cqh`,
            containerType: "size",
            backgroundColor: bg
              ? bg +
                Math.round(bgOpacity * 255).toString(16).padStart(2, "0")
              : undefined,
          }}
        >
          <span className="truncate">{text}</span>
        </div>
      );
    }
    case "shape": {
      const shape = (c.shapeType as string) ?? "rectangle";
      return (
        <div
          className="h-full w-full"
          style={{
            backgroundColor: (c.fill as string) ?? "#3B82F6",
            borderRadius:
              shape === "circle"
                ? "50%"
                : `${(c.borderRadius as number) ?? 0}px`,
            border:
              (c.borderWidth as number) && c.borderColor
                ? `${c.borderWidth}px solid ${c.borderColor}`
                : undefined,
          }}
        />
      );
    }
    case "image":
    case "logo":
      return (
        <MediaImage
          path={(c.mediaStoragePath as string) ?? null}
          fit={(c.fit as string) ?? "cover"}
          label={ELEMENT_LABELS[el.element_type]}
        />
      );
    case "video":
      return (
        <MediaVideo
          path={(c.mediaStoragePath as string) ?? null}
          fit={(c.fit as string) ?? "cover"}
          loop={(c.loop as boolean) ?? true}
          muted={(c.muted as boolean) ?? true}
        />
      );
    case "widget": {
      const widgetType = (c.widgetType as string) ?? "clock";
      const cfg = (c.widgetConfig as Record<string, unknown>) ?? {};
      if (widgetType === "clock") return <ClockWidget config={cfg} />;
      if (widgetType === "weather") return <WeatherWidget config={cfg} />;
      if (widgetType === "rss" || widgetType === "news")
        return <RssWidget config={cfg} />;
      return <PlaceholderBadge label="Widget" />;
    }
    default: {
      return (
        <div className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-white/40 bg-white/5 text-[10px] font-medium uppercase tracking-wider text-white/80 backdrop-blur">
          {ELEMENT_LABELS[el.element_type]}
        </div>
      );
    }
  }
}

// ---------- Widgets ----------

function ClockWidget({ config }: { config: Record<string, unknown> }) {
  const format = (config.format as string) ?? "24h";
  const timezone = (config.timezone as string) ?? "America/Sao_Paulo";
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  let text = "--:--";
  try {
    text = new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: format === "12h",
      timeZone: timezone,
    }).format(now);
  } catch {
    text = now.toLocaleTimeString("pt-BR");
  }
  return (
    <div
      className="flex h-full w-full items-center justify-center overflow-hidden text-white"
      style={{
        fontFamily: "Inter, system-ui, sans-serif",
        fontVariantNumeric: "tabular-nums",
        fontWeight: 600,
        fontSize: "28cqh",
        containerType: "size",
        letterSpacing: "0.02em",
      }}
    >
      {text}
    </div>
  );
}

function WeatherWidget({ config }: { config: Record<string, unknown> }) {
  const city = ((config.city as string) ?? "").trim();
  const units =
    (config.units as string) === "imperial" ? "imperial" : "metric";
  const q = useQuery({
    queryKey: ["widget-weather", city, units],
    enabled: city.length > 0,
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("widget-weather", {
        body: { city, units },
      });
      if (error) throw error;
      return data as {
        temp: number;
        unit: string;
        description: string;
        city: string;
        country: string;
      };
    },
  });
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-1 overflow-hidden bg-black/30 p-2 text-white"
      style={{ containerType: "size", fontFamily: "Inter, system-ui" }}
    >
      {!city ? (
        <span className="text-[11cqh] opacity-70">Configure a cidade</span>
      ) : q.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin opacity-70" />
      ) : q.isError || !q.data ? (
        <span className="text-[10cqh] opacity-70">Clima indisponível</span>
      ) : (
        <>
          <span style={{ fontSize: "36cqh", fontWeight: 600 }}>
            {q.data.temp}
            {q.data.unit}
          </span>
          <span
            style={{ fontSize: "12cqh", opacity: 0.9 }}
            className="truncate"
          >
            {q.data.description}
          </span>
          <span
            style={{ fontSize: "10cqh", opacity: 0.7 }}
            className="truncate"
          >
            {q.data.city}
            {q.data.country ? `, ${q.data.country}` : ""}
          </span>
        </>
      )}
    </div>
  );
}

function RssWidget({ config }: { config: Record<string, unknown> }) {
  const url = ((config.feedUrl as string) ?? "").trim();
  const max = (config.maxItems as number) ?? 5;
  const q = useQuery({
    queryKey: ["widget-rss", url, max],
    enabled: url.length > 0,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("widget-rss", {
        body: { url, max },
      });
      if (error) throw error;
      return data as { items: { title: string; pubDate: string }[] };
    },
  });
  const [idx, setIdx] = useState(0);
  const items = q.data?.items ?? [];
  useEffect(() => {
    if (items.length <= 1) return;
    const id = setInterval(
      () => setIdx((i) => (i + 1) % items.length),
      6000,
    );
    return () => clearInterval(id);
  }, [items.length]);
  return (
    <div
      className="flex h-full w-full flex-col justify-center gap-1 overflow-hidden bg-black/40 p-2 text-white"
      style={{ containerType: "size", fontFamily: "Inter, system-ui" }}
    >
      {!url ? (
        <span className="text-[10cqh] opacity-70">
          Configure a URL do feed
        </span>
      ) : q.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin opacity-70" />
      ) : q.isError || items.length === 0 ? (
        <span className="text-[10cqh] opacity-70">Feed indisponível</span>
      ) : (
        <>
          <span
            style={{ fontSize: "9cqh", opacity: 0.6 }}
            className="uppercase tracking-wider"
          >
            Notícia {idx + 1}/{items.length}
          </span>
          <span
            style={{ fontSize: "14cqh", fontWeight: 600, lineHeight: 1.2 }}
            className="line-clamp-3"
          >
            {items[idx]?.title}
          </span>
        </>
      )}
    </div>
  );
}

function MediaImage({
  path,
  fit,
  label,
}: {
  path: string | null;
  fit: string;
  label: string;
}) {
  const url = useSignedUrl(path);
  if (!path) return <PlaceholderBadge label={label} />;
  if (!url)
    return (
      <div className="grid h-full w-full place-items-center bg-white/5">
        <Loader2 className="h-4 w-4 animate-spin text-white/60" />
      </div>
    );
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      className="h-full w-full"
      style={{
        objectFit: (fit as React.CSSProperties["objectFit"]) ?? "cover",
      }}
    />
  );
}

function MediaVideo({
  path,
  fit,
  loop,
  muted,
}: {
  path: string | null;
  fit: string;
  loop: boolean;
  muted: boolean;
}) {
  const url = useSignedUrl(path);
  if (!path) return <PlaceholderBadge label="Vídeo" />;
  if (!url)
    return (
      <div className="grid h-full w-full place-items-center bg-white/5">
        <Loader2 className="h-4 w-4 animate-spin text-white/60" />
      </div>
    );
  return (
    <video
      src={url}
      className="h-full w-full"
      style={{
        objectFit: (fit as React.CSSProperties["objectFit"]) ?? "cover",
      }}
      autoPlay
      loop={loop}
      muted={muted}
      playsInline
    />
  );
}

export function PlaceholderBadge({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-white/40 bg-white/5 text-[10px] font-medium uppercase tracking-wider text-white/80 backdrop-blur">
      {label}
    </div>
  );
}

export function TemplateBackground({
  color,
  mediaId,
}: {
  color: string;
  mediaId: string | null;
}) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div
        className="absolute inset-0"
        style={{ backgroundColor: color }}
      />
      {mediaId && <BackgroundMedia mediaId={mediaId} />}
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

function BackgroundMedia({ mediaId }: { mediaId: string }) {
  const q = useQuery({
    queryKey: ["studio_bg_media", mediaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_files")
        .select("id, type, storage_path")
        .eq("id", mediaId)
        .single();
      if (error) throw error;
      return data as { id: string; type: string; storage_path: string };
    },
  });
  const url = useSignedUrl(q.data?.storage_path ?? null);
  if (!q.data || !url) return null;
  if (q.data.type === "video") {
    return (
      <video
        src={url}
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        loop
        muted
        playsInline
        aria-hidden
      />
    );
  }
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      className="absolute inset-0 h-full w-full object-cover"
      aria-hidden
    />
  );
}