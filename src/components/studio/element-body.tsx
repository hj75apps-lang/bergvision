import {
  isVideoEmbedHost,
  needsVimeoOEmbed,
  resolveVimeoEmbed,
  toVideoEmbedUrl,
} from "@/lib/studio/video-embed";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { useSignedUrl } from "@/lib/studio/use-signed-url";
import { supabase } from "@/integrations/supabase/client";
import { ELEMENT_LABELS, type TemplateElement } from "@/lib/studio/types";
import { getAppearanceStyle } from "@/lib/studio/appearance";
import { WeatherWidget } from "./widgets/weather-widget";

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
      const italic = c.italic === true;
      const underline = c.underline === true;
      const strike = c.strikethrough === true;
      const uppercase = c.uppercase === true;
      const letterSpacing =
        typeof c.letterSpacing === "number" ? c.letterSpacing : undefined;
      const lineHeight =
        typeof c.lineHeight === "number" ? c.lineHeight : undefined;
      const textShadow = c.textShadow === true;
      const anim = (c.animation as string) ?? "none";
      const animSpeed = Math.max(
        0.5,
        Math.min(20, (c.animationSpeed as number) ?? 3),
      );
      const textDecoration = [
        underline ? "underline" : null,
        strike ? "line-through" : null,
      ]
        .filter(Boolean)
        .join(" ") || undefined;
      const animation =
        anim === "fade"
          ? `bv-text-fade ${animSpeed}s ease-in-out infinite`
          : anim === "slide-up"
            ? `bv-text-slide-up ${animSpeed}s ease-out infinite`
            : anim === "slide-down"
              ? `bv-text-slide-down ${animSpeed}s ease-out infinite`
              : anim === "slide-left"
                ? `bv-text-slide-left ${animSpeed}s ease-out infinite`
                : anim === "slide-right"
                  ? `bv-text-slide-right ${animSpeed}s ease-out infinite`
                  : anim === "zoom"
                    ? `bv-text-zoom ${animSpeed}s ease-in-out infinite`
                    : anim === "pulse"
                      ? `bv-text-pulse ${animSpeed}s ease-in-out infinite`
                      : anim === "blink"
                        ? `bv-text-blink ${animSpeed}s steps(2, start) infinite`
                        : anim === "bounce"
                          ? `bv-text-bounce ${animSpeed}s ease-in-out infinite`
                          : anim === "typewriter"
                            ? `bv-text-typewriter ${animSpeed}s steps(30, end) infinite`
                            : undefined;
      return (
        <>
          <style>{`
            @keyframes bv-text-fade{0%,100%{opacity:1}50%{opacity:.25}}
            @keyframes bv-text-slide-up{0%{opacity:0;transform:translateY(20%)}20%,80%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-20%)}}
            @keyframes bv-text-slide-down{0%{opacity:0;transform:translateY(-20%)}20%,80%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(20%)}}
            @keyframes bv-text-slide-left{0%{opacity:0;transform:translateX(20%)}20%,80%{opacity:1;transform:translateX(0)}100%{opacity:0;transform:translateX(-20%)}}
            @keyframes bv-text-slide-right{0%{opacity:0;transform:translateX(-20%)}20%,80%{opacity:1;transform:translateX(0)}100%{opacity:0;transform:translateX(20%)}}
            @keyframes bv-text-zoom{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
            @keyframes bv-text-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.7;transform:scale(1.04)}}
            @keyframes bv-text-blink{0%,49%{opacity:1}50%,100%{opacity:0}}
            @keyframes bv-text-bounce{0%,100%{transform:translateY(0)}25%{transform:translateY(-8%)}50%{transform:translateY(0)}75%{transform:translateY(-4%)}}
            @keyframes bv-text-typewriter{0%{clip-path:inset(0 100% 0 0)}60%,90%{clip-path:inset(0 0 0 0)}100%{clip-path:inset(0 100% 0 0)}}
          `}</style>
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
            fontStyle: italic ? "italic" : undefined,
            textTransform: uppercase ? "uppercase" : undefined,
            letterSpacing:
              letterSpacing !== undefined ? `${letterSpacing / 100}em` : undefined,
            lineHeight,
            textShadow: textShadow
              ? "0 2px 8px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.4)"
              : undefined,
            backgroundColor: bg
              ? bg +
                Math.round(bgOpacity * 255).toString(16).padStart(2, "0")
              : undefined,
          }}
        >
          <span
            className="truncate"
            style={{
              textDecoration,
              animation,
              display: "inline-block",
              willChange: animation ? "transform, opacity" : undefined,
            }}
          >
            {text}
          </span>
        </div>
        </>
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
    case "logo": {
      if (el.element_type === "image" && c.imageSubtype === "sequence") {
        return <ImageSequenceBody c={c} appearance={getAppearanceStyle(c)} />;
      }
      return (
        <MediaImage
          path={(c.mediaStoragePath as string) ?? null}
          fit={(c.fit as string) ?? "cover"}
          label={ELEMENT_LABELS[el.element_type]}
          appearance={getAppearanceStyle(c)}
        />
      );
    }
    case "video":
      return (
        <MediaVideo
          path={(c.mediaStoragePath as string) ?? null}
          fit={(c.fit as string) ?? "cover"}
          loop={(c.loop as boolean) ?? true}
          muted={(c.muted as boolean) ?? true}
          appearance={getAppearanceStyle(c)}
        />
      );
    case "widget": {
      const widgetType = getWidgetType(c);
      const cfg = getWidgetConfig(c);
      const appearance = getAppearanceStyle(c);
      let inner: React.ReactNode;
      if (widgetType === "clock") inner = <ClockWidget config={cfg} />;
      else if (widgetType === "weather") inner = <WeatherWidget config={cfg} />;
      else if (widgetType === "rss" || widgetType === "news")
        inner = <RssWidget config={cfg} />;
      else if (widgetType === "ticker") inner = <TickerWidget config={cfg} />;
      else if (widgetType === "lowerthirds")
        inner = <LowerThirdsWidget config={cfg} />;
      else if (widgetType === "iframe") inner = <IframeWidget config={cfg} />;
      else inner = <PlaceholderBadge label="Widget" />;
      const hasAppearance =
        (appearance.borderRadius as string | undefined) !== undefined ||
        (appearance.maskImage as string | undefined) !== undefined ||
        (appearance.border as string | undefined) !== undefined;
      if (!hasAppearance) return <>{inner}</>;
      return (
        <div
          className="h-full w-full"
          style={{ ...appearance, overflow: "hidden" }}
        >
          {inner}
        </div>
      );
    }
    case "playlist": {
      if (c.source === "inline") return <InlineMediaGroup c={c} />;
      return <PlaceholderBadge label="Playlist" />;
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

// ---------- Inline media group (carrossel de mídias) ----------

export type GroupItem = {
  id: string;
  type: "image" | "video";
  storagePath: string;
  mediaFileId?: string | null;
  name?: string | null;
  duration?: number | null;
  fit?: string | null;
};

function InlineMediaGroup({ c }: { c: Record<string, unknown> }) {
  const itemsSrc = c.items;
  const items = useMemo(
    () =>
      (Array.isArray(itemsSrc) ? (itemsSrc as unknown[]) : [])
        .map((it) => it as Partial<GroupItem>)
        .filter(
          (it): it is GroupItem =>
            !!it &&
            typeof it.storagePath === "string" &&
            (it.type === "image" || it.type === "video"),
        ),
    [itemsSrc],
  );
  const loop = (c.loop as boolean | undefined) ?? true;
  const transition = ((c.transition as string) ?? "fade") as "none" | "fade";
  const defaultFit = ((c.fit as string) ?? "cover") as string;
  const defaultDuration = Math.max(
    1,
    Math.min(600, (c.defaultDuration as number) ?? 8),
  );

  const [idx, setIdx] = useState(0);
  const safeIdx = items.length === 0 ? 0 : idx % items.length;
  const cur = items[safeIdx];

  useEffect(() => {
    // Reset index when items list shrinks
    if (idx >= items.length && items.length > 0) setIdx(0);
  }, [items.length, idx]);

  const advance = () => {
    setIdx((i) => {
      const next = i + 1;
      if (next >= items.length) return loop ? 0 : i;
      return next;
    });
  };

  useEffect(() => {
    if (!cur || items.length === 0) return;
    if (cur.type === "video") return; // vídeo avança em onEnded
    const dur =
      typeof cur.duration === "number" && cur.duration > 0
        ? cur.duration
        : defaultDuration;
    const t = setTimeout(advance, Math.max(1, dur) * 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeIdx, items.length, defaultDuration, loop]);

  if (items.length === 0)
    return <PlaceholderBadge label="Grupo de mídias (vazio)" />;
  if (!cur) return null;

  const fit = (cur.fit as string) ?? defaultFit;

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-black/20"
      style={{ containerType: "size" }}
    >
      <style>{`@keyframes bv-group-fade{from{opacity:0}to{opacity:1}}`}</style>
      {cur.type === "video" ? (
        <MediaVideo
          key={cur.id ?? safeIdx}
          path={cur.storagePath}
          fit={fit}
          loop={items.length === 1 && loop}
          muted
          onEnded={items.length === 1 && loop ? undefined : advance}
        />
      ) : (
        <div
          key={cur.id ?? safeIdx}
          className="h-full w-full"
          style={{
            animation:
              transition === "fade" ? "bv-group-fade 0.5s ease-out" : undefined,
          }}
        >
          <MediaImage path={cur.storagePath} fit={fit} label="Imagem" />
        </div>
      )}
    </div>
  );
}

function IframeWidget({ config }: { config: Record<string, unknown> }) {
  const rawUrl = typeof config.url === "string" ? config.url : "";
  // Converte links de página (vimeo.com/..., youtube.com/watch...) que recusam
  // incorporação em URLs de player — corrige também elementos já salvos.
  const pendingVimeo = needsVimeoOEmbed(rawUrl);
  const [vimeoResolved, setVimeoResolved] = useState<{ from: string; to: string | null } | null>(null);
  useEffect(() => {
    if (!pendingVimeo) return;
    let cancelled = false;
    void resolveVimeoEmbed(rawUrl).then((to) => {
      if (!cancelled) setVimeoResolved({ from: rawUrl, to });
    });
    return () => {
      cancelled = true;
    };
  }, [rawUrl, pendingVimeo]);
  const vimeoState = pendingVimeo
    ? vimeoResolved?.from === rawUrl
      ? vimeoResolved.to
        ? "ok"
        : "failed"
      : "loading"
    : null;
  const url = hideVideoControls(
    pendingVimeo
      ? vimeoState === "ok"
        ? (vimeoResolved?.to as string)
        : ""
      : (toVideoEmbedUrl(rawUrl) ?? rawUrl),
  );
  const zoom =
    typeof config.zoomPercent === "number"
      ? Math.max(25, Math.min(400, config.zoomPercent))
      : 100;
  const refresh =
    typeof config.refreshSeconds === "number"
      ? Math.max(0, Math.min(3600, Math.round(config.refreshSeconds)))
      : 0;
  const allowScripts = config.allowScripts !== false;
  const isVideo = isVideoEmbedHost(url);
  const allowSameOrigin = config.allowSameOrigin === true || isVideo;
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (refresh <= 0) return;
    const id = window.setInterval(() => setNonce((n) => n + 1), refresh * 1000);
    return () => window.clearInterval(id);
  }, [refresh]);
  const isValid = /^https:\/\//i.test(url);
  const isYouTube = /^https:\/\/(www\.)?youtube(-nocookie)?\.com\/embed/i.test(url);
  if (vimeoState === "loading" || vimeoState === "failed") {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-white/30 bg-black/60 p-3 text-center text-[11px] text-white/80">
        {vimeoState === "loading"
          ? "Carregando vídeo do Vimeo…"
          : "O Vimeo não liberou este vídeo. Ele precisa ser público e permitir incorporação em outros sites."}
      </div>
    );
  }
  if (!isValid) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-white/30 bg-black/40 p-3 text-center text-[11px] text-white/70">
        Configure uma URL https:// para o iframe.
      </div>
    );
  }
  const sandboxTokens = [
    allowScripts ? "allow-scripts" : "",
    allowSameOrigin ? "allow-same-origin" : "",
    "allow-popups",
    "allow-forms",
  ]
    .filter(Boolean)
    .join(" ");
  const scale = zoom / 100;
  const inverse = `${(100 / scale).toFixed(4)}%`;
  const src = refresh > 0 ? `${url}${url.includes("#") ? "&" : "#"}_r=${nonce}` : url;
  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <iframe
        key={nonce}
        src={src}
        title="Iframe widget"
        loading={isVideo ? "eager" : "lazy"}
        referrerPolicy={isVideo ? "strict-origin-when-cross-origin" : "no-referrer"}
        // Players oficiais (Vimeo/YouTube) detectam sandbox e recusam tocar —
        // por isso não aplicamos sandbox a eles; demais iframes seguem isolados.
        sandbox={isVideo ? undefined : sandboxTokens}
        allow="autoplay *; fullscreen *; geolocation; encrypted-media *; picture-in-picture *"
        allowFullScreen
        style={
          isYouTube
            ? {
                // Iframe 3x mais alto e centralizado: o vídeo fica do mesmo
                // tamanho no meio, e título, logo e "Mais vídeos" (presos às
                // bordas do player) ficam fora da área visível.
                border: 0,
                position: "absolute",
                left: 0,
                top: "-100%",
                width: "100%",
                height: "300%",
                display: "block",
                pointerEvents: "none",
              }
            : {
                border: 0,
                width: inverse,
                height: inverse,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                display: "block",
              }
        }
      />
      {/* Camada transparente: impede que o iframe "engula" cliques, permitindo
          selecionar, mover, redimensionar, excluir e substituir o widget no editor. */}
      <div className="absolute inset-0" aria-hidden />
    </div>
  );
}

// ---------- Widgets ----------

function ClockWidget({ config }: { config: Record<string, unknown> }) {
  const kind = ((config.clockKind as string) ?? "digital") as "digital" | "analog";
  const digitalStyle = ((config.digitalStyle as string) ?? "modern") as
    | "modern"
    | "led"
    | "flip"
    | "outline"
    | "mono"
    | "minimal"
    | "neon";
  const analogStyle = ((config.analogStyle as string) ?? "classic") as
    | "classic"
    | "modern"
    | "roman"
    | "minimal"
    | "swiss"
    | "railway"
    | "dark"
    | "neon";
  const format = (config.format as string) ?? "24h";
  const timezone = (config.timezone as string) ?? "America/Sao_Paulo";
  const sizeCqh = Math.max(3, Math.min(90, (config.sizePercent as number) ?? 28));
  const showSeconds = (config.showSeconds as boolean | undefined) ?? true;
  const showDate = (config.showDate as boolean | undefined) ?? false;
  const showWeekday = (config.showWeekday as boolean | undefined) ?? false;
  const dateFormat = ((config.dateFormat as string) ?? "dd/MM/yyyy") as
    | "dd/MM/yyyy"
    | "dd/MM"
    | "long"
    | "yyyy-MM-dd";
  const layout = ((config.layout as string) ?? "stack") as "stack" | "inline";
  const color = (config.color as string) ?? "#FFFFFF";
  const accent = (config.accentColor as string) ?? color;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = kind === "analog" ? 1000 : showSeconds ? 1000 : 15000;
    const id = setInterval(() => setNow(new Date()), tick);
    return () => clearInterval(id);
  }, [showSeconds, kind]);
  let text = "--:--";
  try {
    text = new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      ...(showSeconds ? { second: "2-digit" as const } : {}),
      hour12: format === "12h",
      timeZone: timezone,
    }).format(now);
  } catch {
    text = now.toLocaleTimeString("pt-BR");
  }

  let dateText = "";
  if (showDate || showWeekday) {
    try {
      const opts: Intl.DateTimeFormatOptions = { timeZone: timezone };
      if (showWeekday) opts.weekday = "long";
      if (showDate) {
        if (dateFormat === "long") {
          opts.day = "numeric";
          opts.month = "long";
          opts.year = "numeric";
        } else if (dateFormat === "dd/MM") {
          opts.day = "2-digit";
          opts.month = "2-digit";
        } else if (dateFormat === "yyyy-MM-dd") {
          opts.day = "2-digit";
          opts.month = "2-digit";
          opts.year = "numeric";
        } else {
          opts.day = "2-digit";
          opts.month = "2-digit";
          opts.year = "numeric";
        }
      }
      dateText = new Intl.DateTimeFormat("pt-BR", opts).format(now);
      if (dateFormat === "yyyy-MM-dd" && showDate) {
        const y = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
        dateText = showWeekday ? `${dateText.split(",")[0]}, ${y}` : y;
      }
    } catch {
      dateText = "";
    }
  }

  if (kind === "analog") {
    return (
      <div
        className="flex h-full w-full items-center justify-center overflow-hidden"
        style={{
          containerType: "size",
          color,
          ...widgetBgStyle(config, 0),
        }}
      >
        <div
          className={`flex h-full w-full items-center justify-center ${
            layout === "inline" && dateText ? "flex-row gap-[3cqmin]" : "flex-col gap-[2cqmin]"
          }`}
        >
          <AnalogClock
            date={now}
            timezone={timezone}
            style={analogStyle}
            color={color}
            accent={accent}
            showSeconds={showSeconds}
          />
          {dateText && (
            <span
              style={{
                fontFamily: "Inter, system-ui, sans-serif",
                fontSize: `${Math.max(3, sizeCqh * 0.22)}cqh`,
                opacity: 0.85,
                fontWeight: 500,
                lineHeight: 1.1,
                textTransform: "capitalize",
                color,
              }}
              className="truncate"
            >
              {dateText}
            </span>
          )}
        </div>
      </div>
    );
  }

  const digitalTypography = getDigitalTypography(digitalStyle, color, accent);
  const wrapperFlex = layout === "inline" ? "flex-row items-baseline gap-2" : "flex-col items-center";
  return (
    <div
      className={`flex h-full w-full justify-center overflow-hidden text-white ${wrapperFlex}`}
      style={{
        fontFamily: digitalTypography.fontFamily,
        fontVariantNumeric: "tabular-nums",
        fontWeight: digitalTypography.fontWeight,
        containerType: "size",
        letterSpacing: digitalTypography.letterSpacing,
        color,
        alignItems: layout === "stack" ? "center" : "baseline",
        justifyContent: "center",
        ...widgetBgStyle(config, 0),
      }}
    >
      {digitalStyle === "flip" ? (
        <FlipDigits text={text} sizeCqh={sizeCqh} color={color} accent={accent} />
      ) : (
        <span
          style={{
            fontSize: `${sizeCqh}cqh`,
            lineHeight: 1,
            ...digitalTypography.textStyle,
          }}
        >
          {text}
        </span>
      )}
      {dateText && (
        <span
          style={{
            fontSize: `${Math.max(3, sizeCqh * 0.32)}cqh`,
            opacity: 0.85,
            fontWeight: 500,
            lineHeight: 1.1,
            marginTop: layout === "stack" ? "0.4em" : 0,
            textTransform: "capitalize",
          }}
          className="truncate"
        >
          {dateText}
        </span>
      )}
    </div>
  );
}

function getDigitalTypography(
  style: string,
  color: string,
  accent: string,
): {
  fontFamily: string;
  fontWeight: number | string;
  letterSpacing: string;
  textStyle: React.CSSProperties;
} {
  switch (style) {
    case "led":
      return {
        fontFamily: '"Share Tech Mono", "Courier New", monospace',
        fontWeight: 700,
        letterSpacing: "0.08em",
        textStyle: {
          color: accent,
          textShadow: `0 0 0.3em ${accent}, 0 0 0.6em ${accent}80`,
        },
      };
    case "outline":
      return {
        fontFamily: "Inter, system-ui, sans-serif",
        fontWeight: 800,
        letterSpacing: "0.02em",
        textStyle: {
          color: "transparent",
          WebkitTextStroke: `0.06em ${color}`,
        },
      };
    case "mono":
      return {
        fontFamily: '"JetBrains Mono", "SF Mono", ui-monospace, monospace',
        fontWeight: 600,
        letterSpacing: "0.04em",
        textStyle: {},
      };
    case "minimal":
      return {
        fontFamily: "Inter, system-ui, sans-serif",
        fontWeight: 300,
        letterSpacing: "0.02em",
        textStyle: {},
      };
    case "neon":
      return {
        fontFamily: "Inter, system-ui, sans-serif",
        fontWeight: 700,
        letterSpacing: "0.04em",
        textStyle: {
          color: accent,
          textShadow: `0 0 0.15em ${accent}, 0 0 0.45em ${accent}, 0 0 0.9em ${accent}80`,
        },
      };
    case "modern":
    default:
      return {
        fontFamily: "Inter, system-ui, sans-serif",
        fontWeight: 600,
        letterSpacing: "0.02em",
        textStyle: {},
      };
  }
}

function FlipDigits({
  text,
  sizeCqh,
  color,
  accent,
}: {
  text: string;
  sizeCqh: number;
  color: string;
  accent: string;
}) {
  const chars = text.split("");
  return (
    <div className="flex items-center" style={{ gap: "0.12em" }}>
      {chars.map((ch, i) => {
        const isSep = ch === ":" || ch === " ";
        if (isSep) {
          return (
            <span
              key={i}
              style={{ fontSize: `${sizeCqh}cqh`, lineHeight: 1, color }}
            >
              {ch}
            </span>
          );
        }
        return (
          <span
            key={i}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: `${sizeCqh * 0.7}cqh`,
              padding: "0.05em 0.15em",
              borderRadius: "0.12em",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.65) 50%, rgba(0,0,0,0.85) 100%)",
              boxShadow: `inset 0 -0.02em 0 ${accent}30, 0 0.05em 0.15em rgba(0,0,0,0.4)`,
              color,
              fontSize: `${sizeCqh}cqh`,
              lineHeight: 1,
            }}
          >
            {ch}
          </span>
        );
      })}
    </div>
  );
}

function AnalogClock({
  date,
  timezone,
  style,
  color,
  accent,
  showSeconds,
}: {
  date: Date;
  timezone: string;
  style: string;
  color: string;
  accent: string;
  showSeconds: boolean;
}) {
  // Extrair h/m/s no fuso escolhido
  let hours = date.getHours();
  let minutes = date.getMinutes();
  let seconds = date.getSeconds();
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: timezone,
    }).formatToParts(date);
    for (const p of parts) {
      if (p.type === "hour") hours = parseInt(p.value, 10);
      if (p.type === "minute") minutes = parseInt(p.value, 10);
      if (p.type === "second") seconds = parseInt(p.value, 10);
    }
  } catch {
    /* fallback já feito */
  }
  const hourAngle = ((hours % 12) + minutes / 60 + seconds / 3600) * 30;
  const minuteAngle = (minutes + seconds / 60) * 6;
  const secondAngle = seconds * 6;

  // Estilos visuais
  const cfg = getAnalogStyle(style, color, accent);
  const size = 100;
  const cx = 50;
  const cy = 50;

  const marks: React.ReactNode[] = [];
  for (let i = 0; i < 60; i++) {
    const isHour = i % 5 === 0;
    if (cfg.marks === "none") continue;
    if (cfg.marks === "hours" && !isHour) continue;
    const angle = (i * 6 * Math.PI) / 180;
    const outer = 46;
    const inner = isHour ? cfg.markInnerHour : cfg.markInnerMinute;
    if (inner < 0) continue;
    const x1 = cx + Math.sin(angle) * inner;
    const y1 = cy - Math.cos(angle) * inner;
    const x2 = cx + Math.sin(angle) * outer;
    const y2 = cy - Math.cos(angle) * outer;
    marks.push(
      <line
        key={`m${i}`}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={isHour ? cfg.markHourColor : cfg.markMinuteColor}
        strokeWidth={isHour ? cfg.markHourWidth : cfg.markMinuteWidth}
        strokeLinecap="round"
      />,
    );
  }

  const numerals: React.ReactNode[] = [];
  if (cfg.numerals !== "none") {
    const labels =
      cfg.numerals === "roman"
        ? ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"]
        : ["12", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];
    for (let i = 0; i < 12; i++) {
      const angle = (i * 30 * Math.PI) / 180;
      const r = 38;
      const x = cx + Math.sin(angle) * r;
      const y = cy - Math.cos(angle) * r;
      numerals.push(
        <text
          key={`n${i}`}
          x={x}
          y={y}
          textAnchor="middle"
          dominantBaseline="central"
          fill={cfg.numeralColor}
          fontSize={cfg.numeralSize}
          fontFamily={cfg.numeralFont}
          fontWeight={cfg.numeralWeight}
        >
          {labels[i]}
        </text>,
      );
    }
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      style={{ width: "min(90cqw, 90cqh)", height: "min(90cqw, 90cqh)" }}
    >
      {/* Face */}
      <circle
        cx={cx}
        cy={cy}
        r={49}
        fill={cfg.faceFill}
        stroke={cfg.faceStroke}
        strokeWidth={cfg.faceStrokeWidth}
        style={cfg.faceFilter ? { filter: cfg.faceFilter } : undefined}
      />
      {marks}
      {numerals}
      {/* Hour hand */}
      <line
        x1={cx}
        y1={cy + 6}
        x2={cx}
        y2={cy - 26}
        stroke={cfg.hourColor}
        strokeWidth={cfg.hourWidth}
        strokeLinecap="round"
        transform={`rotate(${hourAngle} ${cx} ${cy})`}
        style={cfg.handFilter ? { filter: cfg.handFilter } : undefined}
      />
      {/* Minute hand */}
      <line
        x1={cx}
        y1={cy + 8}
        x2={cx}
        y2={cy - 38}
        stroke={cfg.minuteColor}
        strokeWidth={cfg.minuteWidth}
        strokeLinecap="round"
        transform={`rotate(${minuteAngle} ${cx} ${cy})`}
        style={cfg.handFilter ? { filter: cfg.handFilter } : undefined}
      />
      {/* Second hand */}
      {showSeconds && (
        <g transform={`rotate(${secondAngle} ${cx} ${cy})`}>
          <line
            x1={cx}
            y1={cy + 12}
            x2={cx}
            y2={cy - 42}
            stroke={cfg.secondColor}
            strokeWidth={cfg.secondWidth}
            strokeLinecap="round"
            style={cfg.handFilter ? { filter: cfg.handFilter } : undefined}
          />
          {cfg.secondBob > 0 && (
            <circle cx={cx} cy={cy - 34} r={cfg.secondBob} fill={cfg.secondColor} />
          )}
        </g>
      )}
      {/* Center cap */}
      <circle cx={cx} cy={cy} r={cfg.capOuter} fill={cfg.capOuterColor} />
      {cfg.capInner > 0 && (
        <circle cx={cx} cy={cy} r={cfg.capInner} fill={cfg.capInnerColor} />
      )}
    </svg>
  );
}

type AnalogStyleCfg = {
  faceFill: string;
  faceStroke: string;
  faceStrokeWidth: number;
  faceFilter?: string;
  marks: "all" | "hours" | "none";
  markHourColor: string;
  markMinuteColor: string;
  markHourWidth: number;
  markMinuteWidth: number;
  markInnerHour: number;
  markInnerMinute: number;
  numerals: "arabic" | "roman" | "none";
  numeralColor: string;
  numeralSize: number;
  numeralFont: string;
  numeralWeight: number | string;
  hourColor: string;
  hourWidth: number;
  minuteColor: string;
  minuteWidth: number;
  secondColor: string;
  secondWidth: number;
  secondBob: number;
  handFilter?: string;
  capOuter: number;
  capOuterColor: string;
  capInner: number;
  capInnerColor: string;
};

function getAnalogStyle(style: string, color: string, accent: string): AnalogStyleCfg {
  const base: AnalogStyleCfg = {
    faceFill: "rgba(0,0,0,0.4)",
    faceStroke: color,
    faceStrokeWidth: 1.5,
    marks: "all",
    markHourColor: color,
    markMinuteColor: color,
    markHourWidth: 1.6,
    markMinuteWidth: 0.5,
    markInnerHour: 42,
    markInnerMinute: 44,
    numerals: "none",
    numeralColor: color,
    numeralSize: 7,
    numeralFont: "Inter, system-ui, sans-serif",
    numeralWeight: 600,
    hourColor: color,
    hourWidth: 3,
    minuteColor: color,
    minuteWidth: 2,
    secondColor: accent,
    secondWidth: 1,
    secondBob: 2,
    capOuter: 2.2,
    capOuterColor: color,
    capInner: 1,
    capInnerColor: accent,
  };
  switch (style) {
    case "modern":
      return {
        ...base,
        faceFill: "rgba(255,255,255,0.04)",
        faceStrokeWidth: 0.6,
        marks: "hours",
        markHourWidth: 2.4,
        markInnerHour: 40,
        hourWidth: 3.5,
        minuteWidth: 2.2,
      };
    case "roman":
      return {
        ...base,
        numerals: "roman",
        numeralSize: 6,
        numeralWeight: 500,
        marks: "none",
        hourWidth: 2.6,
        minuteWidth: 1.8,
      };
    case "minimal":
      return {
        ...base,
        faceFill: "transparent",
        faceStroke: "transparent",
        faceStrokeWidth: 0,
        marks: "hours",
        markHourWidth: 1.4,
        markInnerHour: 43,
        hourWidth: 2.2,
        minuteWidth: 1.4,
        secondWidth: 0.8,
        secondBob: 0,
        capOuter: 1.4,
      };
    case "swiss":
      return {
        ...base,
        faceFill: "#FFFFFF",
        faceStroke: "#111111",
        faceStrokeWidth: 1,
        markHourColor: "#111111",
        markMinuteColor: "#111111",
        markHourWidth: 2,
        markMinuteWidth: 0.6,
        hourColor: "#111111",
        minuteColor: "#111111",
        secondColor: "#E53935",
        secondWidth: 1.2,
        secondBob: 2.4,
        capOuter: 2.5,
        capOuterColor: "#111111",
        capInner: 1.2,
        capInnerColor: "#E53935",
      };
    case "railway":
      return {
        ...base,
        faceFill: "#FFFFFF",
        faceStroke: "#0F0F0F",
        faceStrokeWidth: 1.5,
        marks: "all",
        markHourColor: "#0F0F0F",
        markMinuteColor: "#0F0F0F",
        markHourWidth: 2.4,
        markMinuteWidth: 0.6,
        hourColor: "#0F0F0F",
        minuteColor: "#0F0F0F",
        hourWidth: 3.5,
        minuteWidth: 2.4,
        secondColor: "#D0021B",
        secondWidth: 1,
        secondBob: 3.5,
        capOuter: 0,
        capInner: 0,
      };
    case "dark":
      return {
        ...base,
        faceFill: "#0B0B0F",
        faceStroke: "#2A2A33",
        faceStrokeWidth: 1.5,
        markHourColor: "#F5F5F7",
        markMinuteColor: "#6E6E76",
        markHourWidth: 2,
        hourColor: "#F5F5F7",
        minuteColor: "#F5F5F7",
        secondColor: accent,
        hourWidth: 3.2,
        minuteWidth: 2,
      };
    case "neon":
      return {
        ...base,
        faceFill: "rgba(10,10,20,0.6)",
        faceStroke: accent,
        faceStrokeWidth: 1,
        faceFilter: `drop-shadow(0 0 1.5px ${accent})`,
        marks: "hours",
        markHourColor: accent,
        markHourWidth: 2,
        hourColor: color,
        minuteColor: color,
        secondColor: accent,
        handFilter: `drop-shadow(0 0 0.8px ${accent})`,
        capOuterColor: accent,
      };
    case "classic":
    default:
      return {
        ...base,
        numerals: "arabic",
        numeralSize: 7,
        marks: "all",
      };
  }
}

// WeatherWidget movido para ./widgets/weather-widget.tsx (presets + ícones animados).

function RssWidget({ config }: { config: Record<string, unknown> }) {
  const url = ((config.feedUrl as string) ?? "").trim();
  const max = (config.maxItems as number) ?? 5;
  const sizeCqh = Math.max(3, Math.min(90, (config.sizePercent as number) ?? 14));
  const showText = (config.showText as boolean | undefined) ?? true;
  const showImage = (config.showImage as boolean | undefined) ?? false;
  const imagePosition = ((config.imagePosition as string) ?? "left") as
    | "left"
    | "right"
    | "top"
    | "background";
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
      return data as {
        items: { title: string; pubDate: string; image?: string | null }[];
      };
    },
  });
  const [idx, setIdx] = useState(0);
  const [imgFailed, setImgFailed] = useState<Record<number, boolean>>({});
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
  const current = items[idx];
  const curImg =
    showImage && current?.image && !imgFailed[idx] ? current.image : null;
  const onImgError = () =>
    setImgFailed((prev) => ({ ...prev, [idx]: true }));

  // Background: imagem cobre tudo, texto por cima com sombra
  if (curImg && imagePosition === "background") {
    return (
      <div
        className="relative flex h-full w-full overflow-hidden text-white"
        style={wrapperStyle}
      >
        <img
          src={curImg}
          alt=""
          onError={onImgError}
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        {showText && (
          <span
            key={motion === "fade" ? idx : "static"}
            style={{
              fontSize: `${sizeCqh}cqh`,
              fontWeight: 600,
              lineHeight: 1.2,
              animation:
                motion === "fade" ? "bv-fade 0.6s ease-out" : undefined,
            }}
            className="relative mt-auto line-clamp-3 p-3"
          >
            {current?.title}
          </span>
        )}
        <style>{`@keyframes bv-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
      </div>
    );
  }

  const isRow =
    curImg && (imagePosition === "left" || imagePosition === "right");
  const isCol = curImg && imagePosition === "top";
  const flexDir = isRow
    ? imagePosition === "right"
      ? "flex-row-reverse"
      : "flex-row"
    : isCol
      ? "flex-col"
      : "flex-col";

  return (
    <div
      className={`flex h-full w-full ${flexDir} items-stretch justify-center gap-2 overflow-hidden p-2 text-white`}
      style={wrapperStyle}
    >
      {curImg && (
        <img
          key={`img-${idx}`}
          src={curImg}
          alt=""
          onError={onImgError}
          referrerPolicy="no-referrer"
          className={
            isRow
              ? "h-full w-2/5 shrink-0 rounded object-cover"
              : "h-1/2 w-full shrink-0 rounded object-cover"
          }
          style={{
            animation:
              motion === "fade" ? "bv-fade 0.6s ease-out" : undefined,
          }}
        />
      )}
      {showText && (
        <span
          key={motion === "fade" ? idx : "static"}
          style={{
            fontSize: `${sizeCqh}cqh`,
            fontWeight: 600,
            lineHeight: 1.2,
            animation: motion === "fade" ? "bv-fade 0.6s ease-out" : undefined,
          }}
          className="line-clamp-3 self-center"
        >
          {current?.title}
        </span>
      )}
      <style>{`@keyframes bv-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

function MediaImage({
  path,
  fit,
  label,
  appearance,
}: {
  path: string | null;
  fit: string;
  label: string;
  appearance?: React.CSSProperties;
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
        ...appearance,
      }}
    />
  );
}

// ---------- Image Sequence (frame-by-frame) ----------

function ImageSequenceBody({
  c,
  appearance,
}: {
  c: Record<string, unknown>;
  appearance?: React.CSSProperties;
}) {
  const framesSrc = c.frames;
  const frames = useMemo(
    () =>
      (Array.isArray(framesSrc) ? (framesSrc as unknown[]) : [])
        .map((f) => f as { storagePath?: string })
        .filter((f): f is { storagePath: string } => typeof f?.storagePath === "string"),
    [framesSrc],
  );
  const fps = Math.max(1, Math.min(60, (c.fps as number) ?? 12));
  const loop = (c.loop as boolean | undefined) ?? true;
  const fit = (c.fit as string) ?? "contain";

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (frames.length <= 1) return;
    const interval = 1000 / fps;
    const id = window.setInterval(() => {
      setIdx((prev) => {
        const next = prev + 1;
        if (next >= frames.length) return loop ? 0 : prev;
        return next;
      });
    }, interval);
    return () => window.clearInterval(id);
  }, [frames.length, fps, loop]);

  useEffect(() => {
    setIdx(0);
  }, [frames.length]);

  if (frames.length === 0) return <PlaceholderBadge label="Sequência" />;

  return (
    <div className="relative h-full w-full" style={appearance}>
      {frames.map((f, i) => (
        <SequenceFrame
          key={i}
          path={f.storagePath}
          fit={fit}
          active={i === idx}
        />
      ))}
    </div>
  );
}

function SequenceFrame({
  path,
  fit,
  active,
}: {
  path: string;
  fit: string;
  active: boolean;
}) {
  const url = useSignedUrl(path);
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      className="absolute inset-0 h-full w-full"
      style={{
        objectFit: (fit as React.CSSProperties["objectFit"]) ?? "contain",
        opacity: active ? 1 : 0,
      }}
    />
  );
}

// ---------- News Ticker Widget ----------

export type TickerPresetId =
  | "classic"
  | "breaking"
  | "neon"
  | "led"
  | "minimal"
  | "gradient"
  | "pills"
  | "stock"
  | "newspaper"
  | "terminal"
  | "glass"
  | "bold-caps"
  | "ribbon"
  | "cinema";

type TickerPreset = {
  id: TickerPresetId;
  label: string;
  bg: string; // css background
  color: string;
  fontFamily: string;
  fontWeight: number | string;
  uppercase?: boolean;
  letterSpacing?: string;
  border?: string;
  textShadow?: string;
  itemStyle?: React.CSSProperties; // per-item wrapping (pills)
  separator?: string;
  badgeBg?: string;
  badgeColor?: string;
  badgeText?: string;
  accent?: string;
};

export const TICKER_PRESETS: Record<TickerPresetId, TickerPreset> = {
  classic: {
    id: "classic",
    label: "Clássico",
    bg: "#0F172A",
    color: "#FFFFFF",
    fontFamily: "Inter, system-ui, sans-serif",
    fontWeight: 600,
    separator: "  •  ",
    accent: "#3B82F6",
  },
  breaking: {
    id: "breaking",
    label: "Breaking News",
    bg: "#DC2626",
    color: "#FFFFFF",
    fontFamily: "Inter, system-ui, sans-serif",
    fontWeight: 700,
    uppercase: true,
    letterSpacing: "0.03em",
    separator: "  ◆  ",
    badgeBg: "#000000",
    badgeColor: "#FFFFFF",
    badgeText: "BREAKING",
    accent: "#FBBF24",
  },
  neon: {
    id: "neon",
    label: "Neon",
    bg: "#050510",
    color: "#22D3EE",
    fontFamily: "Inter, system-ui, sans-serif",
    fontWeight: 700,
    textShadow:
      "0 0 4px #22D3EE, 0 0 12px #22D3EE, 0 0 24px rgba(34,211,238,0.7)",
    separator: "  ✦  ",
    accent: "#22D3EE",
  },
  led: {
    id: "led",
    label: "Painel LED",
    bg: "#0A0A0A",
    color: "#F59E0B",
    fontFamily: "'JetBrains Mono', 'Courier New', monospace",
    fontWeight: 700,
    uppercase: true,
    letterSpacing: "0.15em",
    textShadow: "0 0 6px rgba(245,158,11,0.85)",
    separator: "  ▪  ",
    accent: "#F59E0B",
  },
  minimal: {
    id: "minimal",
    label: "Minimalista",
    bg: "transparent",
    color: "#F8FAFC",
    fontFamily: "Inter, system-ui, sans-serif",
    fontWeight: 500,
    letterSpacing: "0.02em",
    separator: "     /     ",
    accent: "#F8FAFC",
  },
  gradient: {
    id: "gradient",
    label: "Gradiente animado",
    bg: "linear-gradient(90deg,#6366F1,#8B5CF6,#EC4899,#6366F1)",
    color: "#FFFFFF",
    fontFamily: "Inter, system-ui, sans-serif",
    fontWeight: 700,
    separator: "  ⬥  ",
    accent: "#FFFFFF",
  },
  pills: {
    id: "pills",
    label: "Pílulas",
    bg: "#111827",
    color: "#F9FAFB",
    fontFamily: "Inter, system-ui, sans-serif",
    fontWeight: 600,
    separator: "   ",
    accent: "#3B82F6",
    itemStyle: {
      padding: "0.35em 0.9em",
      borderRadius: "9999px",
      background: "rgba(59,130,246,0.18)",
      border: "1px solid rgba(59,130,246,0.45)",
      marginRight: "0.6em",
    },
  },
  stock: {
    id: "stock",
    label: "Bolsa de valores",
    bg: "#000000",
    color: "#10B981",
    fontFamily: "'JetBrains Mono', 'Courier New', monospace",
    fontWeight: 600,
    letterSpacing: "0.05em",
    separator: "  │  ",
    accent: "#10B981",
  },
  newspaper: {
    id: "newspaper",
    label: "Jornal",
    bg: "#F5EFE0",
    color: "#1C1917",
    fontFamily: "Georgia, 'Playfair Display', serif",
    fontWeight: 600,
    separator: "   —   ",
    border: "2px solid #1C1917",
    accent: "#1C1917",
  },
  terminal: {
    id: "terminal",
    label: "Terminal",
    bg: "#020617",
    color: "#4ADE80",
    fontFamily: "'JetBrains Mono', 'Courier New', monospace",
    fontWeight: 500,
    separator: "   ",
    accent: "#4ADE80",
    // "> " prefixado por item via itemStyle::before não é trivial; usamos separator custom
  },
  glass: {
    id: "glass",
    label: "Glass",
    bg: "rgba(255,255,255,0.08)",
    color: "#F8FAFC",
    fontFamily: "Inter, system-ui, sans-serif",
    fontWeight: 600,
    separator: "  •  ",
    accent: "#F8FAFC",
  },
  "bold-caps": {
    id: "bold-caps",
    label: "Bold Caps",
    bg: "#FBBF24",
    color: "#0A0A0A",
    fontFamily: "'Space Grotesk', Inter, sans-serif",
    fontWeight: 800,
    uppercase: true,
    letterSpacing: "0.06em",
    separator: "  ★  ",
    accent: "#0A0A0A",
  },
  ribbon: {
    id: "ribbon",
    label: "Fita corporativa",
    bg: "#1E3A8A",
    color: "#FFFFFF",
    fontFamily: "Inter, system-ui, sans-serif",
    fontWeight: 600,
    letterSpacing: "0.04em",
    separator: "  ›  ",
    border: "1px solid rgba(255,255,255,0.15)",
    accent: "#FBBF24",
  },
  cinema: {
    id: "cinema",
    label: "Marquee cinema",
    bg: "#7F1D1D",
    color: "#FEF3C7",
    fontFamily: "Georgia, serif",
    fontWeight: 700,
    uppercase: true,
    letterSpacing: "0.08em",
    textShadow: "0 0 8px rgba(254,243,199,0.5)",
    separator: "  ✺  ",
    border: "3px double #FEF3C7",
    accent: "#FEF3C7",
  },
};

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  const full =
    m.length === 3
      ? m
          .split("")
          .map((x) => x + x)
          .join("")
      : m;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return hex;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

function TickerWidget({ config }: { config: Record<string, unknown> }) {
  const presetId = ((config.preset as string) ?? "classic") as TickerPresetId;
  const preset = TICKER_PRESETS[presetId] ?? TICKER_PRESETS.classic;

  const url = ((config.feedUrl as string) ?? "").trim();
  const customText = ((config.customText as string) ?? "").trim();
  const max = Math.max(1, Math.min(20, (config.maxItems as number) ?? 8));
  const direction = ((config.direction as string) ?? "left") as "left" | "right";
  const speed = Math.max(5, Math.min(300, (config.speed as number) ?? 40));
  const sizeCqh = Math.max(3, Math.min(90, (config.sizePercent as number) ?? 40));
  const uppercase =
    typeof config.uppercase === "boolean"
      ? (config.uppercase as boolean)
      : preset.uppercase ?? false;

  // Overrides opcionais
  const textColor = (config.textColor as string) || preset.color;
  const bgOverride = (config.bgColor as string) || null;
  const bgOpacity =
    typeof config.bgOpacity === "number"
      ? Math.max(0, Math.min(1, config.bgOpacity as number))
      : 1;
  const accentColor = (config.accentColor as string) || preset.accent || textColor;
  const separator =
    typeof config.separator === "string" && (config.separator as string).length > 0
      ? (config.separator as string)
      : preset.separator ?? "  •  ";

  const showBadge =
    typeof config.showBadge === "boolean"
      ? (config.showBadge as boolean)
      : presetId === "breaking";
  const badgeText =
    ((config.badgeText as string) || preset.badgeText || "BREAKING").slice(0, 24);

  const q = useQuery({
    queryKey: ["widget-ticker", url, max],
    enabled: url.length > 0,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("widget-rss", {
        body: { url, max },
      });
      if (error) throw error;
      return data as { items: { title: string }[] };
    },
  });

  const titles: string[] = url
    ? (q.data?.items ?? []).map((i) => i.title).filter(Boolean)
    : customText
      ? customText.split(/\s*\|\s*/).filter(Boolean)
      : [];

  // Fundo: gradiente animado só se preset gradient E sem override
  const isGradient = presetId === "gradient" && !bgOverride;
  const backgroundStyle: React.CSSProperties = bgOverride
    ? { background: hexToRgba(bgOverride, bgOpacity) }
    : preset.bg === "transparent"
      ? { background: "transparent" }
      : { background: preset.bg };

  const containerStyle: React.CSSProperties = {
    ...backgroundStyle,
    color: textColor,
    fontFamily: preset.fontFamily,
    fontWeight: preset.fontWeight,
    letterSpacing: preset.letterSpacing,
    textTransform: uppercase ? "uppercase" : undefined,
    textShadow: preset.textShadow,
    border: preset.border,
    containerType: "size",
    backgroundSize: isGradient ? "300% 100%" : undefined,
    animation: isGradient
      ? `bv-ticker-gradient ${Math.max(6, speed / 3)}s ease infinite`
      : undefined,
  };

  const wrapper = (children: React.ReactNode) => (
    <div
      className="relative flex h-full w-full items-center overflow-hidden"
      style={containerStyle}
    >
      <style>{`
        @keyframes bv-ticker-x-left{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        @keyframes bv-ticker-x-right{from{transform:translateX(-50%)}to{transform:translateX(0)}}
        @keyframes bv-ticker-gradient{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
      `}</style>
      {showBadge && (
        <div
          className="z-10 flex h-full shrink-0 items-center px-3"
          style={{
            background: preset.badgeBg || accentColor,
            color: preset.badgeColor || "#FFFFFF",
            fontSize: `${Math.max(sizeCqh * 0.7, 8)}cqh`,
            fontWeight: 800,
            letterSpacing: "0.08em",
            fontFamily: preset.fontFamily,
            textTransform: "uppercase",
          }}
        >
          {badgeText}
        </div>
      )}
      {children}
    </div>
  );

  if (!url && !customText) {
    return wrapper(
      <span
        className="px-3 opacity-70"
        style={{ fontSize: `${Math.min(sizeCqh, 14)}cqh` }}
      >
        Configure a URL do feed ou texto personalizado
      </span>,
    );
  }

  if (url && q.isLoading) {
    return wrapper(
      <Loader2 className="mx-3 h-4 w-4 animate-spin opacity-70" />,
    );
  }

  if (url && (q.isError || titles.length === 0)) {
    return wrapper(
      <span
        className="px-3 opacity-70"
        style={{ fontSize: `${Math.min(sizeCqh, 14)}cqh` }}
      >
        Feed indisponível
      </span>,
    );
  }

  const animName =
    direction === "left" ? "bv-ticker-x-left" : "bv-ticker-x-right";

  const renderItems = (items: string[]) =>
    items.map((t, i) => {
      if (preset.itemStyle) {
        return (
          <span key={i} style={preset.itemStyle}>
            {t}
          </span>
        );
      }
      return (
        <span key={i}>
          {presetId === "terminal" ? `> ${t}` : t}
          <span
            style={{
              color: accentColor,
              opacity: 0.9,
              margin: "0 0.15em",
              display: "inline",
            }}
          >
            {separator}
          </span>
        </span>
      );
    });

  return wrapper(
    <div
      className="flex shrink-0 whitespace-nowrap"
      style={{
        animation: `${animName} ${speed}s linear infinite`,
        fontSize: `${sizeCqh}cqh`,
        paddingLeft: showBadge ? "1.5rem" : "2rem",
        alignItems: "center",
      }}
    >
      <div className="flex items-center">{renderItems(titles)}</div>
      <div className="flex items-center">{renderItems(titles)}</div>
    </div>,
  );
}


// ---------- News Lower Thirds Widget ----------

// Keyframes compartilhados por LowerThirdsWidget e BroadcastLayout.
// Mantidos em um único lugar para que animações de entrada e de rotação RSS
// usem exatamente o mesmo timing/curva.
const LT_KEYFRAMES_CSS = `
@keyframes bv-lt-slide-l{from{transform:translateX(-100%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes bv-lt-slide-r{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes bv-lt-fade{from{opacity:0}to{opacity:1}}
@keyframes bv-lt-reveal{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes bv-lt-zoom{from{transform:scale(0.85);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes bv-lt-flip{from{transform:perspective(600px) rotateX(90deg);opacity:0;transform-origin:bottom}to{transform:perspective(600px) rotateX(0);opacity:1;transform-origin:bottom}}
`;

export type LowerThirdsPresetId =
  | "broadcast"
  | "breaking"
  | "sports"
  | "corporate"
  | "modern"
  | "minimal"
  | "neon"
  | "cinema"
  | "documentary"
  | "gradient"
  | "glass"
  | "editorial"
  | "esports"
  | "talkshow"
  | "global24"
  | "orangeNotch"
  | "stackedBars"
  | "dualBadge";

type LowerThirdsPreset = {
  id: LowerThirdsPresetId;
  label: string;
  bg: string;
  titleColor: string;
  subtitleColor: string;
  accent: string;
  fontFamily: string;
  titleWeight: number | string;
  subtitleWeight: number | string;
  titleUppercase?: boolean;
  subtitleUppercase?: boolean;
  letterSpacing?: string;
  border?: string;
  borderRadius?: string;
  textShadow?: string;
  kickerBg?: string;
  kickerColor?: string;
  kickerText?: string;
  accentBarWidth?: string; // vertical bar left/right
  showAccentBar?: boolean;
  /** Layout de renderização. 'classic' = barra horizontal padrão. */
  layout?: "classic" | "angled" | "notched" | "stacked" | "dual";
  /** Skew aplicado aos blocos angulares (ex.: "-12deg"). */
  skew?: string;
  /** Badge quadrado direito (usado por layout 'dual'). */
  rightBadgeBg?: string;
  rightBadgeColor?: string;
  rightBadgeText?: string;
  /** Fundo da faixa de subtítulo (layouts stacked/dual). */
  subtitleBg?: string;
  /** Itálico opcional para títulos estilo broadcast clássico. */
  titleItalic?: boolean;
};

export const LOWER_THIRDS_PRESETS: Record<LowerThirdsPresetId, LowerThirdsPreset> = {
  broadcast: {
    id: "broadcast",
    label: "Broadcast",
    bg: "linear-gradient(90deg, rgba(15,23,42,0.96) 0%, rgba(15,23,42,0.75) 100%)",
    titleColor: "#FFFFFF",
    subtitleColor: "#93C5FD",
    accent: "#3B82F6",
    fontFamily: "Inter, system-ui, sans-serif",
    titleWeight: 700,
    subtitleWeight: 500,
    subtitleUppercase: true,
    letterSpacing: "0.02em",
    kickerBg: "#3B82F6",
    kickerColor: "#FFFFFF",
    kickerText: "AO VIVO",
    showAccentBar: true,
    accentBarWidth: "6px",
  },
  breaking: {
    id: "breaking",
    label: "Breaking News",
    bg: "#DC2626",
    titleColor: "#FFFFFF",
    subtitleColor: "#FEE2E2",
    accent: "#FBBF24",
    fontFamily: "Inter, system-ui, sans-serif",
    titleWeight: 800,
    subtitleWeight: 600,
    titleUppercase: true,
    subtitleUppercase: true,
    letterSpacing: "0.03em",
    kickerBg: "#000000",
    kickerColor: "#FBBF24",
    kickerText: "URGENTE",
  },
  sports: {
    id: "sports",
    label: "Esportes",
    bg: "linear-gradient(90deg,#065F46 0%,#022C22 100%)",
    titleColor: "#FFFFFF",
    subtitleColor: "#6EE7B7",
    accent: "#FBBF24",
    fontFamily: "'Space Grotesk', Inter, sans-serif",
    titleWeight: 800,
    subtitleWeight: 600,
    titleUppercase: true,
    letterSpacing: "0.04em",
    kickerBg: "#FBBF24",
    kickerColor: "#022C22",
    kickerText: "AO VIVO",
    showAccentBar: true,
    accentBarWidth: "8px",
  },
  corporate: {
    id: "corporate",
    label: "Corporativo",
    bg: "#FFFFFF",
    titleColor: "#0F172A",
    subtitleColor: "#475569",
    accent: "#1E3A8A",
    fontFamily: "Inter, system-ui, sans-serif",
    titleWeight: 700,
    subtitleWeight: 500,
    letterSpacing: "0.01em",
    border: "1px solid rgba(15,23,42,0.08)",
    showAccentBar: true,
    accentBarWidth: "4px",
  },
  modern: {
    id: "modern",
    label: "Moderno",
    bg: "rgba(15,23,42,0.85)",
    titleColor: "#F8FAFC",
    subtitleColor: "#94A3B8",
    accent: "#EC4899",
    fontFamily: "'Space Grotesk', Inter, sans-serif",
    titleWeight: 700,
    subtitleWeight: 500,
    subtitleUppercase: true,
    letterSpacing: "0.06em",
    borderRadius: "8px",
  },
  minimal: {
    id: "minimal",
    label: "Minimalista",
    bg: "transparent",
    titleColor: "#FFFFFF",
    subtitleColor: "rgba(255,255,255,0.75)",
    accent: "#FFFFFF",
    fontFamily: "Inter, system-ui, sans-serif",
    titleWeight: 600,
    subtitleWeight: 400,
    letterSpacing: "0.01em",
    textShadow: "0 2px 8px rgba(0,0,0,0.6)",
    showAccentBar: true,
    accentBarWidth: "3px",
  },
  neon: {
    id: "neon",
    label: "Neon",
    bg: "#05050F",
    titleColor: "#22D3EE",
    subtitleColor: "#F0ABFC",
    accent: "#22D3EE",
    fontFamily: "'Space Grotesk', Inter, sans-serif",
    titleWeight: 700,
    subtitleWeight: 500,
    titleUppercase: true,
    letterSpacing: "0.08em",
    textShadow:
      "0 0 4px currentColor, 0 0 12px currentColor, 0 0 24px currentColor",
    border: "1px solid rgba(34,211,238,0.4)",
    borderRadius: "6px",
  },
  cinema: {
    id: "cinema",
    label: "Cinema",
    bg: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.85) 60%)",
    titleColor: "#FEF3C7",
    subtitleColor: "#FBBF24",
    accent: "#FEF3C7",
    fontFamily: "Georgia, 'Playfair Display', serif",
    titleWeight: 700,
    subtitleWeight: 400,
    letterSpacing: "0.06em",
    textShadow: "0 2px 6px rgba(0,0,0,0.9)",
  },
  documentary: {
    id: "documentary",
    label: "Documentário",
    bg: "rgba(0,0,0,0.6)",
    titleColor: "#FFFFFF",
    subtitleColor: "#D1D5DB",
    accent: "#F5EFE0",
    fontFamily: "Georgia, serif",
    titleWeight: 600,
    subtitleWeight: 400,
    letterSpacing: "0.01em",
    showAccentBar: true,
    accentBarWidth: "2px",
  },
  gradient: {
    id: "gradient",
    label: "Gradiente vibrante",
    bg: "linear-gradient(90deg,#6366F1,#8B5CF6,#EC4899)",
    titleColor: "#FFFFFF",
    subtitleColor: "rgba(255,255,255,0.85)",
    accent: "#FFFFFF",
    fontFamily: "'Space Grotesk', Inter, sans-serif",
    titleWeight: 700,
    subtitleWeight: 500,
    subtitleUppercase: true,
    letterSpacing: "0.05em",
    borderRadius: "10px",
  },
  glass: {
    id: "glass",
    label: "Glass",
    bg: "rgba(255,255,255,0.1)",
    titleColor: "#F8FAFC",
    subtitleColor: "rgba(248,250,252,0.8)",
    accent: "#F8FAFC",
    fontFamily: "Inter, system-ui, sans-serif",
    titleWeight: 600,
    subtitleWeight: 400,
    letterSpacing: "0.02em",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: "12px",
  },
  editorial: {
    id: "editorial",
    label: "Editorial",
    bg: "#F5EFE0",
    titleColor: "#1C1917",
    subtitleColor: "#78716C",
    accent: "#B91C1C",
    fontFamily: "'Playfair Display', Georgia, serif",
    titleWeight: 700,
    subtitleWeight: 500,
    subtitleUppercase: true,
    letterSpacing: "0.06em",
    border: "2px solid #1C1917",
    kickerBg: "#B91C1C",
    kickerColor: "#FFFFFF",
    kickerText: "EXCLUSIVO",
  },
  esports: {
    id: "esports",
    label: "eSports",
    bg: "linear-gradient(135deg,#7C3AED 0%,#0EA5E9 100%)",
    titleColor: "#FFFFFF",
    subtitleColor: "#E0F2FE",
    accent: "#FBBF24",
    fontFamily: "'Space Grotesk', Inter, sans-serif",
    titleWeight: 800,
    subtitleWeight: 600,
    titleUppercase: true,
    subtitleUppercase: true,
    letterSpacing: "0.06em",
    borderRadius: "4px",
    kickerBg: "#0F172A",
    kickerColor: "#FBBF24",
    kickerText: "LIVE",
  },
  talkshow: {
    id: "talkshow",
    label: "Talk show",
    bg: "linear-gradient(90deg,#7F1D1D 0%,#B91C1C 100%)",
    titleColor: "#FFFFFF",
    subtitleColor: "#FCA5A5",
    accent: "#FBBF24",
    fontFamily: "Georgia, serif",
    titleWeight: 700,
    subtitleWeight: 500,
    letterSpacing: "0.02em",
    showAccentBar: true,
    accentBarWidth: "5px",
  },
  global24: {
    id: "global24",
    label: "Global 24",
    bg: "#FFFFFF",
    titleColor: "#0F172A",
    subtitleColor: "#FFFFFF",
    accent: "#DC2626",
    fontFamily: "'Playfair Display', Georgia, serif",
    titleWeight: 700,
    subtitleWeight: 500,
    titleItalic: true,
    letterSpacing: "0.01em",
    kickerBg: "#DC2626",
    kickerColor: "#FFFFFF",
    kickerText: "Global 24",
    subtitleBg: "#DC2626",
    layout: "angled",
    skew: "-14deg",
  },
  orangeNotch: {
    id: "orangeNotch",
    label: "24 News (laranja)",
    bg: "#0F172A",
    titleColor: "#FFFFFF",
    subtitleColor: "#F8FAFC",
    accent: "#F59E0B",
    fontFamily: "'Space Grotesk', Inter, sans-serif",
    titleWeight: 800,
    subtitleWeight: 500,
    titleItalic: true,
    letterSpacing: "0.02em",
    kickerBg: "#F59E0B",
    kickerColor: "#0F172A",
    kickerText: "24 News",
    subtitleBg: "rgba(15,23,42,0.55)",
    layout: "notched",
    skew: "-16deg",
  },
  stackedBars: {
    id: "stackedBars",
    label: "Barras empilhadas",
    bg: "#0EA5E9",
    titleColor: "#FFFFFF",
    subtitleColor: "#0F172A",
    accent: "#0284C7",
    fontFamily: "'Space Grotesk', Inter, sans-serif",
    titleWeight: 800,
    subtitleWeight: 500,
    titleItalic: true,
    letterSpacing: "0.02em",
    kickerBg: "#0F172A",
    kickerColor: "#FFFFFF",
    kickerText: "24",
    subtitleBg: "#FFFFFF",
    layout: "stacked",
    skew: "-12deg",
  },
  dualBadge: {
    id: "dualBadge",
    label: "Duplo badge",
    bg: "#FFFFFF",
    titleColor: "#0F172A",
    subtitleColor: "#F8FAFC",
    accent: "#7C3AED",
    fontFamily: "'Space Grotesk', Inter, sans-serif",
    titleWeight: 800,
    subtitleWeight: 500,
    titleItalic: true,
    letterSpacing: "0.02em",
    kickerBg: "#7C3AED",
    kickerColor: "#FFFFFF",
    kickerText: "24 News",
    rightBadgeBg: "#7C3AED",
    rightBadgeColor: "#FFFFFF",
    rightBadgeText: "24\nNews",
    subtitleBg: "rgba(15,23,42,0.75)",
    layout: "dual",
  },
};

function LowerThirdsWidget({ config }: { config: Record<string, unknown> }) {
  const presetId = ((config.preset as string) ?? "broadcast") as LowerThirdsPresetId;
  const preset = LOWER_THIRDS_PRESETS[presetId] ?? LOWER_THIRDS_PRESETS.broadcast;

  const staticTitle = ((config.title as string) ?? "Título da matéria").slice(0, 200);
  const staticSubtitle = ((config.subtitle as string) ?? "Legenda ou fonte").slice(0, 200);

  // ---- RSS opcional ----
  const feedUrl = ((config.feedUrl as string) ?? "").trim();
  const rotationSec = Math.max(
    3,
    Math.min(120, (config.rotationSeconds as number) ?? 8),
  );
  const maxItems = Math.max(1, Math.min(20, (config.maxItems as number) ?? 6));

  // Como cada campo textual é usado quando o feed RSS está ativo:
  //  - feed          → conteúdo vem 100% do item RSS (comportamento clássico)
  //  - custom        → mantém o texto estático mesmo com feed ativo
  //  - prefix        → (apenas título) concatena "prefixo + título do item"
  //  - none          → oculta o campo enquanto o feed está ativo
  const titleSource = ((config.titleSource as string) ?? "feed") as
    | "feed"
    | "custom"
    | "prefix";
  const subtitleSource = ((config.subtitleSource as string) ?? "auto") as
    | "auto"
    | "custom"
    | "none";
  const titlePrefix = ((config.titlePrefix as string) ?? "").slice(0, 40);

  const rssQ = useQuery({
    queryKey: ["widget-lowerthirds-rss", feedUrl, maxItems],
    enabled: feedUrl.length > 0,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("widget-rss", {
        body: { url: feedUrl, max: maxItems },
      });
      if (error) throw error;
      return data as { items: { title: string; pubDate?: string }[] };
    },
  });

  const rssItems = feedUrl ? (rssQ.data?.items ?? []).filter((i) => i.title) : [];
  const [rssIdx, setRssIdx] = useState(0);
  useEffect(() => {
    if (rssItems.length <= 1) return;
    const id = window.setInterval(
      () => setRssIdx((i) => (i + 1) % rssItems.length),
      rotationSec * 1000,
    );
    return () => window.clearInterval(id);
  }, [rssItems.length, rotationSec]);

  let title = staticTitle;
  let subtitle = staticSubtitle;
  let subtitleHidden = false;
  if (feedUrl && rssItems.length > 0) {
    const item = rssItems[rssIdx % rssItems.length];
    const feedTitle = item.title.slice(0, 200);
    if (titleSource === "custom") {
      title = staticTitle;
    } else if (titleSource === "prefix") {
      title = `${titlePrefix ? `${titlePrefix} ` : ""}${feedTitle}`.slice(0, 240);
    } else {
      title = feedTitle;
    }
    if (subtitleSource === "custom") {
      subtitle = staticSubtitle;
    } else if (subtitleSource === "none") {
      subtitle = "";
      subtitleHidden = true;
    } else {
      subtitle = item.pubDate ? item.pubDate.slice(0, 200) : "";
    }
  } else if (feedUrl && rssQ.isLoading) {
    title = "Carregando feed...";
    subtitle = "";
  } else if (feedUrl && (rssQ.isError || rssItems.length === 0)) {
    title = "Feed indisponível";
    subtitle = "";
  }

  const align = ((config.align as string) ?? "left") as "left" | "right";
  const anim = ((config.animation as string) ?? "slide") as
    | "none"
    | "slide"
    | "fade"
    | "reveal";
  const rssAnim = ((config.rssAnimation as string) ?? "fade") as
    | "same"
    | "none"
    | "slide"
    | "fade"
    | "reveal"
    | "zoom"
    | "flip";
  const rssAnimDurationMs = Math.max(
    150,
    Math.min(3000, (config.rssAnimationDuration as number) ?? 600),
  );
  const showKicker =
    typeof config.showKicker === "boolean"
      ? (config.showKicker as boolean)
      : !!preset.kickerText;
  const kickerText =
    ((config.kickerText as string) || preset.kickerText || "AO VIVO").slice(0, 24);
  const showSubtitleRaw =
    typeof config.showSubtitle === "boolean"
      ? (config.showSubtitle as boolean)
      : true;
  const showSubtitle = showSubtitleRaw && !subtitleHidden;
  const titleUppercase =
    typeof config.titleUppercase === "boolean"
      ? (config.titleUppercase as boolean)
      : preset.titleUppercase ?? false;
  const subtitleUppercase =
    typeof config.subtitleUppercase === "boolean"
      ? (config.subtitleUppercase as boolean)
      : preset.subtitleUppercase ?? false;

  const titleSize = Math.max(6, Math.min(60, (config.titleSize as number) ?? 26));
  const subtitleSize = Math.max(4, Math.min(40, (config.subtitleSize as number) ?? 14));

  const titleColor = (config.titleColor as string) || preset.titleColor;
  const titleItalic =
    typeof config.titleItalic === "boolean"
      ? (config.titleItalic as boolean)
      : preset.titleItalic ?? false;
  const subtitleColor = (config.subtitleColor as string) || preset.subtitleColor;
  const bgOverride = (config.bgColor as string) || null;
  const bgOpacity =
    typeof config.bgOpacity === "number"
      ? Math.max(0, Math.min(1, config.bgOpacity as number))
      : 1;
  const accentColor = (config.accentColor as string) || preset.accent;
  const showAccentBar =
    typeof config.showAccentBar === "boolean"
      ? (config.showAccentBar as boolean)
      : preset.showAccentBar ?? false;

  const backgroundStyle: React.CSSProperties = bgOverride
    ? { background: hexToRgba(bgOverride, bgOpacity) }
    : preset.bg === "transparent"
      ? { background: "transparent" }
      : { background: preset.bg };

  const resolveAnimName = (
    kind: "none" | "slide" | "fade" | "reveal" | "zoom" | "flip",
  ): string | undefined => {
    if (kind === "slide")
      return align === "right" ? "bv-lt-slide-r" : "bv-lt-slide-l";
    if (kind === "fade") return "bv-lt-fade";
    if (kind === "reveal") return "bv-lt-reveal";
    if (kind === "zoom") return "bv-lt-zoom";
    if (kind === "flip") return "bv-lt-flip";
    return undefined;
  };
  const animName = resolveAnimName(anim);
  const rotationAnimName =
    rssAnim === "same" ? animName : resolveAnimName(rssAnim);

  // Chave que força re-mount do conteúdo a cada troca de item do RSS,
  // fazendo a animação de rotação disparar de novo. Sem RSS ativo,
  // a chave é estável e só a animação de entrada roda.
  const rotationKey =
    feedUrl && rssItems.length > 1 ? `rss-${rssIdx}` : "static";
  const rotationStyle: React.CSSProperties = rotationAnimName
    ? {
        animation: `${rotationAnimName} ${rssAnimDurationMs}ms cubic-bezier(0.22,1,0.36,1)`,
      }
    : {};

  const layout = preset.layout ?? "classic";

  // Layouts especializados (broadcast estilizado)
  if (layout !== "classic") {
    return (
      <div
        key={rotationKey}
        className="relative h-full w-full overflow-hidden"
        style={rotationStyle}
      >
        <style>{LT_KEYFRAMES_CSS}</style>
        <BroadcastLayout
          preset={preset}
          layout={layout}
          title={title}
          subtitle={subtitle}
          showSubtitle={showSubtitle}
          showKicker={showKicker}
          kickerText={kickerText}
          titleColor={titleColor}
          subtitleColor={subtitleColor}
          accentColor={accentColor}
          titleUppercase={titleUppercase}
          subtitleUppercase={subtitleUppercase}
          titleItalic={titleItalic}
          titleSize={titleSize}
          subtitleSize={subtitleSize}
          align={align}
          animName={animName}
        />
      </div>
    );
  }

  return (
    <div
      key={rotationKey}
      className="relative flex h-full w-full overflow-hidden"
      style={{
        containerType: "size",
        ...backgroundStyle,
        border: preset.border,
        borderRadius: preset.borderRadius,
        fontFamily: preset.fontFamily,
        justifyContent: align === "right" ? "flex-end" : "flex-start",
        alignItems: "center",
        animation: rotationAnimName
          ? `${rotationAnimName} ${rssAnimDurationMs}ms cubic-bezier(0.22,1,0.36,1)`
          : animName
            ? `${animName} 0.7s cubic-bezier(0.22,1,0.36,1)`
            : undefined,
      }}
    >
      <style>{LT_KEYFRAMES_CSS}</style>

      {showAccentBar && align === "left" && (
        <div
          className="h-[75%] shrink-0 self-center"
          style={{
            background: accentColor,
            width: preset.accentBarWidth ?? "4px",
            marginLeft: "2%",
            borderRadius: "2px",
          }}
        />
      )}

      <div
        className="flex min-w-0 flex-1 flex-col justify-center gap-[0.3em] px-[3%] py-[2%]"
        style={{
          alignItems: align === "right" ? "flex-end" : "flex-start",
          textAlign: align === "right" ? "right" : "left",
          textShadow: preset.textShadow,
        }}
      >
        {showKicker && (
          <span
            className="inline-block shrink-0"
            style={{
              background: preset.kickerBg || accentColor,
              color: preset.kickerColor || "#FFFFFF",
              fontSize: `${Math.max(subtitleSize * 0.9, 6)}cqh`,
              fontWeight: 800,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "0.25em 0.7em",
              borderRadius: "3px",
              lineHeight: 1,
            }}
          >
            {kickerText}
          </span>
        )}
        <span
          className="block max-w-full truncate"
          style={{
            color: titleColor,
            fontSize: `${titleSize}cqh`,
            fontWeight: preset.titleWeight as number,
            letterSpacing: preset.letterSpacing,
            textTransform: titleUppercase ? "uppercase" : undefined,
            fontStyle: titleItalic ? "italic" : undefined,
            lineHeight: 1.05,
          }}
        >
          {title}
        </span>
        {showSubtitle && subtitle && (
          <span
            className="block max-w-full truncate"
            style={{
              color: subtitleColor,
              fontSize: `${subtitleSize}cqh`,
              fontWeight: preset.subtitleWeight as number,
              letterSpacing: preset.letterSpacing,
              textTransform: subtitleUppercase ? "uppercase" : undefined,
              lineHeight: 1.15,
            }}
          >
            {subtitle}
          </span>
        )}
      </div>

      {showAccentBar && align === "right" && (
        <div
          className="h-[75%] shrink-0 self-center"
          style={{
            background: accentColor,
            width: preset.accentBarWidth ?? "4px",
            marginRight: "2%",
            borderRadius: "2px",
          }}
        />
      )}
    </div>
  );
}

type BroadcastLayoutProps = {
  preset: LowerThirdsPreset;
  layout: "angled" | "notched" | "stacked" | "dual";
  title: string;
  subtitle: string;
  showSubtitle: boolean;
  showKicker: boolean;
  kickerText: string;
  titleColor: string;
  subtitleColor: string;
  accentColor: string;
  titleUppercase: boolean;
  subtitleUppercase: boolean;
  titleItalic: boolean;
  titleSize: number;
  subtitleSize: number;
  align: "left" | "right";
  animName: string | undefined;
};

function BroadcastLayout(props: BroadcastLayoutProps) {
  const {
    preset,
    layout,
    title,
    subtitle,
    showSubtitle,
    showKicker,
    kickerText,
    titleColor,
    subtitleColor,
    accentColor,
    titleUppercase,
    subtitleUppercase,
    titleItalic,
    titleSize,
    subtitleSize,
    align,
    animName,
  } = props;

  const skew = preset.skew ?? "-12deg";
  const titleBg = preset.bg;
  const kickerBg = preset.kickerBg ?? accentColor;
  const kickerColor = preset.kickerColor ?? "#FFFFFF";
  const subtitleBg = preset.subtitleBg ?? accentColor;
  const rightBadgeBg = preset.rightBadgeBg ?? accentColor;
  const rightBadgeColor = preset.rightBadgeColor ?? "#FFFFFF";
  const rightBadgeText = preset.rightBadgeText ?? "24\nNews";

  const commonTitleStyle: React.CSSProperties = {
    color: titleColor,
    fontSize: `${titleSize}cqh`,
    fontFamily: preset.fontFamily,
    fontWeight: preset.titleWeight as number,
    letterSpacing: preset.letterSpacing,
    textTransform: titleUppercase ? "uppercase" : undefined,
    fontStyle: titleItalic ? "italic" : undefined,
    lineHeight: 1.05,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
  const commonSubtitleStyle: React.CSSProperties = {
    color: subtitleColor,
    fontSize: `${subtitleSize}cqh`,
    fontFamily: preset.fontFamily,
    fontWeight: preset.subtitleWeight as number,
    letterSpacing: preset.letterSpacing,
    textTransform: subtitleUppercase ? "uppercase" : undefined,
    lineHeight: 1.2,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
  const kickerStyle: React.CSSProperties = {
    background: kickerBg,
    color: kickerColor,
    fontSize: `${Math.max(subtitleSize * 1.1, 8)}cqh`,
    fontFamily: preset.fontFamily,
    fontWeight: 800,
    letterSpacing: "0.06em",
    padding: "0.35em 1.1em",
    lineHeight: 1,
  };

  const rowGap = "0.4cqh";
  const isRight = align === "right";

  const containerStyle: React.CSSProperties = {
    containerType: "size",
    animation: animName
      ? `${animName} 0.7s cubic-bezier(0.22,1,0.36,1)`
      : undefined,
    justifyContent: isRight ? "flex-end" : "flex-start",
  };

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden"
      style={containerStyle}
    >
      <style>{LT_KEYFRAMES_CSS}</style>

      {(layout === "angled" || layout === "notched") && (
        <div
          className="flex h-full w-full flex-col justify-end"
          style={{ gap: rowGap, alignItems: isRight ? "flex-end" : "flex-start" }}
        >
          {showKicker && (
            <div
              style={{
                transform: `skewX(${skew})`,
                marginLeft: isRight ? 0 : "2%",
                marginRight: isRight ? "2%" : 0,
              }}
            >
              <span
                className="inline-block"
                style={{
                  ...kickerStyle,
                  display: "inline-block",
                  transform: `skewX(calc(-1 * ${skew}))`,
                }}
              >
                {kickerText}
              </span>
            </div>
          )}
          <div
            style={{
              background: titleBg,
              transform: `skewX(${skew})`,
              padding: "0.6em 1.4em",
              maxWidth: "96%",
              boxShadow:
                layout === "notched"
                  ? "0 4px 12px rgba(0,0,0,0.35)"
                  : undefined,
            }}
          >
            <span
              className="block"
              style={{
                ...commonTitleStyle,
                transform: `skewX(calc(-1 * ${skew}))`,
                display: "inline-block",
              }}
            >
              {title}
            </span>
          </div>
          {showSubtitle && subtitle && (
            <div
              style={{
                background: subtitleBg,
                padding: "0.35em 1.2em",
                maxWidth: "94%",
              }}
            >
              <span className="block" style={commonSubtitleStyle}>
                {subtitle}
              </span>
            </div>
          )}
        </div>
      )}

      {layout === "stacked" && (
        <div
          className="flex h-full w-full flex-col justify-end"
          style={{ gap: rowGap, alignItems: isRight ? "flex-end" : "flex-start" }}
        >
          <div
            className="flex items-center"
            style={{ gap: "0.5em", marginLeft: isRight ? 0 : "2%" }}
          >
            {showKicker && (
              <div style={{ transform: `skewX(${skew})` }}>
                <span
                  style={{
                    ...kickerStyle,
                    display: "inline-block",
                    transform: `skewX(calc(-1 * ${skew}))`,
                  }}
                >
                  {kickerText}
                </span>
              </div>
            )}
          </div>
          <div
            style={{
              background: titleBg,
              transform: `skewX(${skew})`,
              padding: "0.55em 1.4em",
              maxWidth: "96%",
              boxShadow: "0 6px 14px rgba(0,0,0,0.25)",
            }}
          >
            <span
              className="block"
              style={{
                ...commonTitleStyle,
                transform: `skewX(calc(-1 * ${skew}))`,
                display: "inline-block",
              }}
            >
              {title}
            </span>
          </div>
          {showSubtitle && subtitle && (
            <div
              style={{
                background: subtitleBg,
                transform: `skewX(${skew})`,
                padding: "0.3em 1.2em",
                maxWidth: "90%",
              }}
            >
              <span
                className="block"
                style={{
                  ...commonSubtitleStyle,
                  transform: `skewX(calc(-1 * ${skew}))`,
                  display: "inline-block",
                }}
              >
                {subtitle}
              </span>
            </div>
          )}
        </div>
      )}

      {layout === "dual" && (
        <div
          className="flex h-full w-full flex-col justify-end"
          style={{ gap: rowGap }}
        >
          <div className="flex w-full items-stretch" style={{ gap: "0.5cqh" }}>
            {showKicker && (
              <div
                className="flex items-center"
                style={{
                  ...kickerStyle,
                  padding: "0.5em 1em",
                }}
              >
                {kickerText}
              </div>
            )}
            <div
              className="flex flex-1 items-center"
              style={{
                background: titleBg,
                padding: "0.55em 1.4em",
                boxShadow: "0 4px 10px rgba(0,0,0,0.25)",
              }}
            >
              <span className="block" style={commonTitleStyle}>
                {title}
              </span>
            </div>
            <div
              className="flex items-center justify-center text-center"
              style={{
                background: rightBadgeBg,
                color: rightBadgeColor,
                fontFamily: preset.fontFamily,
                fontWeight: 800,
                fontSize: `${Math.max(subtitleSize * 1.2, 9)}cqh`,
                lineHeight: 1.05,
                padding: "0.4em 0.9em",
                whiteSpace: "pre-line",
              }}
            >
              {rightBadgeText}
            </div>
          </div>
          {showSubtitle && subtitle && (
            <div
              style={{
                background: subtitleBg,
                padding: "0.35em 1.2em",
                width: "100%",
              }}
            >
              <span className="block" style={commonSubtitleStyle}>
                {subtitle}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MediaVideo({
  path,
  fit,
  loop,
  muted,
  onEnded,
  appearance,
}: {
  path: string | null;
  fit: string;
  loop: boolean;
  muted: boolean;
  onEnded?: () => void;
  appearance?: React.CSSProperties;
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
        ...appearance,
      }}
      autoPlay
      loop={loop}
      muted={muted}
      playsInline
      onEnded={onEnded}
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
/** Vídeos por link tocam sem som: esconde a interface do player (botão "Ativar som"). */
function hideVideoControls(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "player.vimeo.com" || host === "vimeo.com") {
      u.searchParams.set("controls", "0");
      u.searchParams.set("muted", "1");
      u.searchParams.set("title", "0");
      u.searchParams.set("byline", "0");
      u.searchParams.set("portrait", "0");
      return u.toString();
    }
    if (/youtube(-nocookie)?\.com$/.test(host) && u.pathname.startsWith("/embed")) {
      u.searchParams.set("controls", "0");
      u.searchParams.set("mute", "1");
      u.searchParams.set("modestbranding", "1");
      u.searchParams.set("rel", "0");
      return u.toString();
    }
    return url;
  } catch {
    return url;
  }
}
