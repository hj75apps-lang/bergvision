import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useSignedUrl } from "@/lib/studio/use-signed-url";
import { ELEMENT_LABELS, type TemplateElement } from "@/lib/studio/types";

function getWidgetType(c: Record<string, unknown>) {
  return ((c.widgetType ?? c.widget_type) as string | undefined) ?? "clock";
}

function getWidgetConfig(c: Record<string, unknown>) {
  const cfg = c.widgetConfig ?? c.widget_config;
  return cfg && typeof cfg === "object" && !Array.isArray(cfg)
    ? (cfg as Record<string, unknown>)
    : {};
}

function widgetBgStyle(
  config: Record<string, unknown>,
  defaultOpacity: number,
): React.CSSProperties {
  const color = (config.bgColor as string) ?? "#000000";
  const opacity =
    typeof config.bgOpacity === "number"
      ? Math.max(0, Math.min(1, config.bgOpacity as number))
      : defaultOpacity;
  if (opacity <= 0) return { backgroundColor: "transparent" };
  const hex = Math.round(opacity * 255).toString(16).padStart(2, "0");
  return { backgroundColor: `${color}${hex}` };
}

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
      const fillColor = (c.fill as string) ?? "#3B82F6";
      const fillOpacity =
        typeof c.fillOpacity === "number"
          ? Math.max(0, Math.min(1, c.fillOpacity as number))
          : 1;
      const alphaHex = Math.round(fillOpacity * 255).toString(16).padStart(2, "0");
      const motion = ((c.motion as string) ?? "none") as
        | "none"
        | "pulse"
        | "spin"
        | "float"
        | "fade";
      const speed = Math.max(1, Math.min(60, (c.motionSpeed as number) ?? 6));
      const animation =
        motion === "pulse"
          ? `bv-shape-pulse ${speed}s ease-in-out infinite`
          : motion === "spin"
            ? `bv-shape-spin ${speed}s linear infinite`
            : motion === "float"
              ? `bv-shape-float ${speed}s ease-in-out infinite`
              : motion === "fade"
                ? `bv-shape-fade ${speed}s ease-in-out infinite`
                : undefined;
      return (
        <>
          <style>{`
            @keyframes bv-shape-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
            @keyframes bv-shape-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
            @keyframes bv-shape-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6%)}}
            @keyframes bv-shape-fade{0%,100%{opacity:1}50%{opacity:.35}}
          `}</style>
          <div
            className="h-full w-full"
            style={{
              backgroundColor: `${fillColor}${alphaHex}`,
              borderRadius:
                shape === "circle"
                  ? "50%"
                  : `${(c.borderRadius as number) ?? 0}px`,
              border:
                (c.borderWidth as number) && c.borderColor
                  ? `${c.borderWidth}px solid ${c.borderColor}`
                  : undefined,
              animation,
              transformOrigin: "center",
              willChange: motion === "none" ? undefined : "transform, opacity",
            }}
          />
        </>
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
      const widgetType = getWidgetType(c);
      const cfg = getWidgetConfig(c);
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
  const sizeCqh = Math.max(3, Math.min(90, (config.sizePercent as number) ?? 28));
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
        fontSize: `${sizeCqh}cqh`,
        containerType: "size",
        letterSpacing: "0.02em",
        ...widgetBgStyle(config, 0),
      }}
    >
      {text}
    </div>
  );
}

function WeatherWidget({ config }: { config: Record<string, unknown> }) {
  const rawCity = ((config.city as string) ?? "").trim();
  // Open-Meteo geocoding aceita apenas o nome da cidade (sem sufixo de país
  // ou pontuação final). Normaliza entradas como "São Paulo, BR." → "São Paulo".
  const city = rawCity
    .replace(/[.\s]+$/g, "")
    .replace(/\s*,\s*(BR|BRA|BRAZIL|BRASIL|US|USA|EUA|UK|PT|AR|CL)\.?$/i, "")
    .replace(/[.\s]+$/g, "")
    .trim();
  const units =
    (config.units as string) === "imperial" ? "imperial" : "metric";
  const sizeCqh = Math.max(3, Math.min(90, (config.sizePercent as number) ?? 28));
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
      className="flex h-full w-full flex-col items-center justify-center gap-1 overflow-hidden p-2 text-white"
      style={{
        containerType: "size",
        fontFamily: "Inter, system-ui",
        ...widgetBgStyle(config, 0.3),
      }}
    >
      {!city ? (
        <span className="text-[11cqh] opacity-70">Configure a cidade</span>
      ) : q.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin opacity-70" />
      ) : q.isError || !q.data ? (
        <span className="text-[10cqh] opacity-70">Clima indisponível</span>
      ) : (
        <>
          <span style={{ fontSize: `${sizeCqh}cqh`, fontWeight: 600 }}>
            {q.data.temp}
            {q.data.unit}
          </span>
          <span
            style={{ fontSize: `${sizeCqh * 0.35}cqh`, opacity: 0.9 }}
            className="truncate"
          >
            {q.data.description}
          </span>
          <span
            style={{ fontSize: `${sizeCqh * 0.28}cqh`, opacity: 0.7 }}
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
  const sizeCqh = Math.max(3, Math.min(90, (config.sizePercent as number) ?? 14));
  const motion = ((config.motion as string) ?? "fade") as
    | "none"
    | "fade"
    | "marquee-left"
    | "marquee-right"
    | "vertical-up"
    | "vertical-down";
  const speed = Math.max(5, Math.min(180, (config.speed as number) ?? 40));
  const separator = (config.separator as string) ?? "  •  ";
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
    if (motion !== "fade" && motion !== "none") return;
    const id = setInterval(
      () => setIdx((i) => (i + 1) % items.length),
      6000,
    );
    return () => clearInterval(id);
  }, [items.length, motion]);

  const wrapperStyle: React.CSSProperties = {
    containerType: "size",
    fontFamily: "Inter, system-ui",
    ...widgetBgStyle(config, 0.4),
  };

  if (!url) {
    return (
      <div
        className="flex h-full w-full flex-col justify-center gap-1 overflow-hidden p-2 text-white"
        style={wrapperStyle}
      >
        <span className="text-[10cqh] opacity-70">Configure a URL do feed</span>
      </div>
    );
  }
  if (q.isLoading) {
    return (
      <div
        className="flex h-full w-full items-center justify-center overflow-hidden p-2 text-white"
        style={wrapperStyle}
      >
        <Loader2 className="h-4 w-4 animate-spin opacity-70" />
      </div>
    );
  }
  if (q.isError || items.length === 0) {
    return (
      <div
        className="flex h-full w-full items-center justify-center overflow-hidden p-2 text-white"
        style={wrapperStyle}
      >
        <span className="text-[10cqh] opacity-70">Feed indisponível</span>
      </div>
    );
  }

  // Horizontal marquee (esquerda ↔ direita)
  if (motion === "marquee-left" || motion === "marquee-right") {
    const text = items.map((i) => i.title).join(separator);
    const dir = motion === "marquee-left" ? "normal" : "reverse";
    return (
      <div
        className="flex h-full w-full items-center overflow-hidden text-white"
        style={wrapperStyle}
      >
        <style>{`@keyframes bv-marquee-x{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
        <div
          className="flex shrink-0 whitespace-nowrap"
          style={{
            animation: `bv-marquee-x ${speed}s linear infinite`,
            animationDirection: dir,
            fontSize: `${sizeCqh}cqh`,
            fontWeight: 600,
            paddingLeft: "2rem",
          }}
        >
          <span>{text}{separator}</span>
          <span>{text}{separator}</span>
        </div>
      </div>
    );
  }

  // Vertical ticker (cima ↔ baixo)
  if (motion === "vertical-up" || motion === "vertical-down") {
    const dir = motion === "vertical-up" ? "normal" : "reverse";
    return (
      <div
        className="flex h-full w-full flex-col overflow-hidden p-2 text-white"
        style={wrapperStyle}
      >
        <style>{`@keyframes bv-marquee-y{from{transform:translateY(0)}to{transform:translateY(-50%)}}`}</style>
        <div
          className="flex flex-col gap-2"
          style={{
            animation: `bv-marquee-y ${speed}s linear infinite`,
            animationDirection: dir,
          }}
        >
          {[...items, ...items].map((it, i) => (
            <span
              key={i}
              style={{
                fontSize: `${sizeCqh}cqh`,
                fontWeight: 600,
                lineHeight: 1.3,
              }}
            >
              • {it.title}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // Fade / none (comportamento anterior)
  return (
    <div
      className="flex h-full w-full flex-col justify-center gap-1 overflow-hidden p-2 text-white"
      style={wrapperStyle}
    >
      <span
        style={{ fontSize: `${sizeCqh * 0.55}cqh`, opacity: 0.6 }}
        className="uppercase tracking-wider"
      >
        Notícia {idx + 1}/{items.length}
      </span>
      <span
        key={motion === "fade" ? idx : "static"}
        style={{
          fontSize: `${sizeCqh}cqh`,
          fontWeight: 600,
          lineHeight: 1.2,
          animation: motion === "fade" ? "bv-fade 0.6s ease-out" : undefined,
        }}
        className="line-clamp-3"
      >
        {items[idx]?.title}
      </span>
      <style>{`@keyframes bv-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
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