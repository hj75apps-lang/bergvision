import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ImageIcon,
  LayoutTemplate,
  ListMusic,
  Pause,
  Play,
  Video as VideoIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ElementBody as StudioElementBody,
  TemplateBackground,
} from "@/components/studio/element-body";
import type { TemplateElement } from "@/lib/studio/types";
import { prefetchSignedUrls } from "@/lib/studio/use-signed-url";

type MediaFile = {
  id: string;
  name: string | null;
  type: string | null;
  url: string | null;
  thumbnail_url: string | null;
  duration: number | null;
};

type Item = {
  id: string;
  item_type: "media" | "template";
  duration: number | null;
  transition: string | null;
  media_file?: MediaFile | null;
  template_payload?: {
    template?: { id: string; name: string; type: string | null } | null;
    background_media?: unknown;
    zones?: unknown;
    elements?: unknown;
  } | null;
};

type DraftPayload = {
  playlist?: {
    name?: string;
    items?: Item[];
  };
};

function itemLabel(it: Item): string {
  if (it.item_type === "template") {
    return it.template_payload?.template?.name ?? "Template";
  }
  return it.media_file?.name ?? "Mídia";
}

function isVideo(it: Item): boolean {
  return (it.media_file?.type ?? "").toLowerCase().startsWith("video");
}
function isImage(it: Item): boolean {
  return (it.media_file?.type ?? "").toLowerCase().startsWith("image");
}

/**
 * Preview local (Admin) da PLAYLIST — mostra a sequência com o timing/transição
 * configurados. NÃO renderiza templates (regra do sistema: fidelidade fica no
 * Player). Para itens do tipo template, exibe um cartão informativo.
 */
export function PlaylistLocalPreview({
  draft,
  className,
}: {
  draft: DraftPayload | undefined;
  className?: string;
}) {
  const items = useMemo<Item[]>(
    () => (draft?.playlist?.items ?? []) as Item[],
    [draft],
  );

  // Pré-carrega URLs assinadas + decode das imagens de TODOS os templates da
  // playlist assim que a lista muda. Assim, quando um item do tipo template
  // entra em cena, as imagens já estão prontas — evitando o flash de spinner
  // ao trocar de item.
  const qc = useQueryClient();
  useEffect(() => {
    const paths: string[] = [];
    for (const it of items) {
      if (it.item_type !== "template") continue;
      const tp = (it.template_payload ?? {}) as {
        background_media?: { storage_path?: string | null } | null;
        elements?: unknown[];
      };
      const bg = tp.background_media?.storage_path;
      if (typeof bg === "string" && bg) paths.push(bg);
      const els = Array.isArray(tp.elements) ? tp.elements : [];
      for (const raw of els) {
        const el = raw as { content?: Record<string, unknown> | null } | null;
        const c = (el?.content ?? {}) as Record<string, unknown>;
        const mp = c.mediaStoragePath;
        if (typeof mp === "string" && mp) paths.push(mp);
        const wbg = (c.widgetConfig as Record<string, unknown> | undefined)
          ?.backgroundImagePath;
        if (typeof wbg === "string" && wbg) paths.push(wbg);
        const frames = Array.isArray(c.frames) ? (c.frames as unknown[]) : [];
        for (const f of frames) {
          const sp = (f as { storagePath?: unknown })?.storagePath;
          if (typeof sp === "string" && sp) paths.push(sp);
        }
        const groupItems = Array.isArray(c.items) ? (c.items as unknown[]) : [];
        for (const gi of groupItems) {
          const sp = (gi as { storagePath?: unknown })?.storagePath;
          if (typeof sp === "string" && sp) paths.push(sp);
        }
      }
    }
    if (paths.length > 0) {
      // Falhas silenciosas — o <img> real refaz o pedido usando a mesma chave.
      void prefetchSignedUrls(qc, paths, { warmup: true });
    }
  }, [items, qc]);

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [tick, setTick] = useState(0); // força restart de mídia/timer
  const [showControls, setShowControls] = useState(true);
  const [showTimeline, setShowTimeline] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Guarda o item anterior por ~600ms para que a transição do novo item
  // aconteça POR CIMA do antigo (evita "tela preta" entre trocas).
  const [prev, setPrev] = useState<{ item: Item; tick: number } | null>(null);
  const prevRef = useRef<{ item: Item; tick: number } | null>(null);
  const lastItemIdRef = useRef<string | null>(null);

  useEffect(() => {
    const cur = items[index];
    if (!cur) return;
    // Só marca "saindo" quando o ITEM muda de fato — não a cada bump de tick,
    // senão o overlay de prev era sobrescrito com o item novo e a transição
    // parecia um corte seco.
    if (lastItemIdRef.current && lastItemIdRef.current !== cur.id) {
      setPrev(prevRef.current);
      const t = window.setTimeout(() => setPrev(null), 650);
      lastItemIdRef.current = cur.id;
      prevRef.current = { item: cur, tick };
      return () => window.clearTimeout(t);
    }
    lastItemIdRef.current = cur.id;
    prevRef.current = { item: cur, tick };
  }, [index, tick, items]);

  // Se a lista mudar drasticamente, volta para o começo.
  useEffect(() => {
    setIndex((i) => (i >= items.length ? 0 : i));
  }, [items.length]);

  const current = items[index];

  // Duração efetiva (segundos)
  const durationSec = useMemo(() => {
    if (!current) return 0;
    if (current.item_type === "template") return current.duration ?? 10;
    if (isImage(current)) return current.duration ?? 10;
    if (isVideo(current)) {
      // Se DB tiver duração da mídia, respeita; senão deixa o <video> comandar.
      return current.media_file?.duration ?? 0;
    }
    return current.duration ?? 5;
  }, [current]);

  // Auto-advance por timer (para tudo que não seja vídeo controlado por si mesmo)
  useEffect(() => {
    if (!playing || !current) return;
    if (isVideo(current) && !current.media_file?.duration) return;
    if (durationSec <= 0) return;
    const handle = window.setTimeout(() => {
      setIndex((i) => (items.length ? (i + 1) % items.length : 0));
    }, durationSec * 1000);
    return () => window.clearTimeout(handle);
  }, [playing, current, durationSec, items.length, tick]);

  // Reset ao mudar item
  useEffect(() => {
    setTick((t) => t + 1);
  }, [index]);

  const goto = (i: number) => setIndex(((i % items.length) + items.length) % items.length);

  if (items.length === 0) {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 bg-neutral-950/60 p-6 text-center text-white/70",
          className,
        )}
      >
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/5 text-white/60">
          <ListMusic className="h-5 w-5" />
        </div>
        <div className="text-sm font-medium">Playlist vazia</div>
        <div className="max-w-xs text-xs text-white/50">
          Adicione mídias ou templates para simular a reprodução aqui.
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-xl border border-border/60 bg-neutral-950/60",
        className,
      )}
    >
      {/* Palco 16:9 */}
      <div className="relative flex-1 overflow-hidden bg-black">
        {/* Toggles de minimização */}
        <div className="pointer-events-auto absolute right-2 top-2 z-10 flex gap-1">
          <Button
            variant="secondary"
            size="icon"
            className="h-7 w-7 rounded-md bg-black/60 text-white/80 hover:bg-black/80"
            onClick={() => setShowControls((v) => !v)}
            title={showControls ? "Ocultar controles" : "Mostrar controles"}
          >
            {showControls ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="h-7 w-7 rounded-md bg-black/60 text-white/80 hover:bg-black/80"
            onClick={() => setShowTimeline((v) => !v)}
            title={showTimeline ? "Ocultar pistas" : "Mostrar pistas"}
          >
            {showTimeline ? <ChevronsDownUp className="h-3.5 w-3.5" /> : <ChevronsUpDown className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <div
          className="absolute inset-0 grid place-items-center"
          style={{ containerType: "size" }}
        >
          <div
            className="relative overflow-hidden rounded-md bg-black ring-1 ring-white/10"
            style={{
              aspectRatio: "16 / 9",
              width: "min(100cqw, calc(100cqh * 16 / 9))",
              height: "min(100cqh, calc(100cqw * 9 / 16))",
            }}
          >
            {current && (
              <>
                <TransitionStyles />
                {prev && (
                  <div
                    key={`prev-${prev.item.id}-${prev.tick}`}
                    className="absolute inset-0"
                  >
                    <ItemStage
                      item={prev.item}
                      playing={false}
                      onVideoEnded={() => {}}
                      videoRef={{ current: null } as React.MutableRefObject<HTMLVideoElement | null>}
                      animate={false}
                    />
                  </div>
                )}
                <div
                  key={`cur-${current.id}-${tick}`}
                  className="absolute inset-0"
                >
                  <ItemStage
                    item={current}
                    playing={playing}
                    onVideoEnded={() =>
                      setIndex((i) => (items.length ? (i + 1) % items.length : 0))
                    }
                    videoRef={videoRef}
                    animate
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Controles */}
      {showControls && (
      <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-black/40 px-3 py-2">
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8 rounded-lg bg-white/10 text-white hover:bg-white/20"
            onClick={() => goto(index - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8 rounded-lg bg-white/10 text-white hover:bg-white/20"
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8 rounded-lg bg-white/10 text-white hover:bg-white/20"
            onClick={() => goto(index + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="truncate text-[11px] text-white/60">
          {current?.transition ? `Transição: ${current.transition}` : ""}
          {durationSec > 0 && (
            <>
              {current?.transition ? " · " : ""}
              {durationSec}s
            </>
          )}
        </div>
      </div>
      )}

      {/* Timeline */}
      {showTimeline && (
      <div className="flex gap-1.5 overflow-x-auto border-t border-white/10 bg-black/40 px-3 py-2">
        {items.map((it, i) => {
          const active = i === index;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => goto(i)}
              className={cn(
                "group relative flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border text-white/80 transition-colors",
                active
                  ? "border-primary ring-2 ring-primary/40"
                  : "border-white/10 hover:border-white/30",
              )}
              title={itemLabel(it)}
            >
              <ThumbForItem item={it} />
              <span className="pointer-events-none absolute bottom-0 left-0 right-0 truncate bg-black/60 px-1 py-0.5 text-[9px]">
                {i + 1}
              </span>
            </button>
          );
        })}
      </div>
      )}
    </div>
  );
}

function ThumbForItem({ item }: { item: Item }) {
  // unchanged below
  if (item.item_type === "template") {
    return (
      <div className="grid h-full w-full place-items-center bg-gradient-to-br from-fuchsia-500/20 to-indigo-500/20">
        <LayoutTemplate className="h-4 w-4 text-white/70" />
      </div>
    );
  }
  const thumb = item.media_file?.thumbnail_url ?? item.media_file?.url ?? null;
  if (isImage(item) && thumb) {
    return <img src={thumb} alt="" className="h-full w-full object-cover" />;
  }
  if (isVideo(item)) {
    return (
      <div className="relative h-full w-full">
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-white/5">
            <VideoIcon className="h-4 w-4 text-white/60" />
          </div>
        )}
        <div className="absolute inset-0 grid place-items-center bg-black/30">
          <VideoIcon className="h-3.5 w-3.5 text-white/90" />
        </div>
      </div>
    );
  }
  return (
    <div className="grid h-full w-full place-items-center bg-white/5">
      <ImageIcon className="h-4 w-4 text-white/60" />
    </div>
  );
}

function ItemStage({
  item,
  playing,
  onVideoEnded,
  videoRef,
  animate = true,
}: {
  item: Item;
  playing: boolean;
  onVideoEnded: () => void;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  animate?: boolean;
}) {
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) v.play().catch(() => {});
    else v.pause();
  }, [playing, videoRef]);

  const transition = (item.transition ?? "fade").toLowerCase();
  const animClass = animate ? transitionClass(transition) : "";

  if (item.item_type === "template") {
    return (
      <div className={cn("h-full w-full", animClass)}>
        <TemplateFrame item={item} />
      </div>
    );
  }

  const url = item.media_file?.url ?? null;
  if (isImage(item)) {
    return url ? (
      <img
        src={url}
        alt=""
        className={cn("h-full w-full object-contain", animClass)}
      />
    ) : (
      <div className="grid h-full w-full place-items-center text-white/60">
        Mídia indisponível
      </div>
    );
  }
  if (isVideo(item)) {
    return url ? (
      <video
        ref={videoRef}
        src={url}
        autoPlay={playing}
        muted
        playsInline
        onEnded={onVideoEnded}
        className={cn("h-full w-full object-contain", animClass)}
      />
    ) : (
      <div className="grid h-full w-full place-items-center text-white/60">
        Vídeo indisponível
      </div>
    );
  }
  return (
    <div className="grid h-full w-full place-items-center text-white/60">
      Tipo não suportado
    </div>
  );
}

function transitionClass(t: string): string {
  switch (t) {
    case "cut":
      return "";
    case "slide":
    case "slide-left":
      return "bv-anim-slide-left";
    case "slide-right":
      return "bv-anim-slide-right";
    case "slide-up":
      return "bv-anim-slide-up";
    case "slide-down":
      return "bv-anim-slide-down";
    case "zoom-in":
      return "bv-anim-zoom-in";
    case "zoom-out":
      return "bv-anim-zoom-out";
    case "fade":
    default:
      return "bv-anim-fade";
  }
}

function TransitionStyles() {
  return (
    <style>{`
      @keyframes bv-fade-in { from { opacity: 0 } to { opacity: 1 } }
      @keyframes bv-slide-left { from { transform: translateX(100%); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
      @keyframes bv-slide-right { from { transform: translateX(-100%); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
      @keyframes bv-slide-up { from { transform: translateY(100%); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      @keyframes bv-slide-down { from { transform: translateY(-100%); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      @keyframes bv-zoom-in { from { transform: scale(0.85); opacity: 0 } to { transform: scale(1); opacity: 1 } }
      @keyframes bv-zoom-out { from { transform: scale(1.15); opacity: 0 } to { transform: scale(1); opacity: 1 } }
      .bv-anim-fade { animation: bv-fade-in 500ms ease-out both; will-change: opacity }
      .bv-anim-slide-left { animation: bv-slide-left 550ms cubic-bezier(.22,.61,.36,1) both; will-change: transform, opacity }
      .bv-anim-slide-right { animation: bv-slide-right 550ms cubic-bezier(.22,.61,.36,1) both; will-change: transform, opacity }
      .bv-anim-slide-up { animation: bv-slide-up 550ms cubic-bezier(.22,.61,.36,1) both; will-change: transform, opacity }
      .bv-anim-slide-down { animation: bv-slide-down 550ms cubic-bezier(.22,.61,.36,1) both; will-change: transform, opacity }
      .bv-anim-zoom-in { animation: bv-zoom-in 550ms ease-out both; will-change: transform, opacity }
      .bv-anim-zoom-out { animation: bv-zoom-out 550ms ease-out both; will-change: transform, opacity }
      @media (prefers-reduced-motion: reduce) {
        .bv-anim-fade, .bv-anim-slide-left, .bv-anim-slide-right, .bv-anim-slide-up, .bv-anim-slide-down, .bv-anim-zoom-in, .bv-anim-zoom-out { animation: none !important }
      }
    `}</style>
  );
}

function TemplateFrame({ item }: { item: Item }) {
  const tp = (item.template_payload ?? {}) as {
    template?: {
      id?: string;
      name?: string;
      background_color?: string | null;
      background_media_id?: string | null;
      canvas_width?: number | null;
      canvas_height?: number | null;
    } | null;
    elements?: unknown[];
  };
  const tpl = tp.template ?? null;
  const rawEls = Array.isArray(tp.elements) ? tp.elements : [];
  const elements = rawEls as TemplateElement[];

  const bg = tpl?.background_color ?? "#000000";
  const w = tpl?.canvas_width ?? 1920;
  const h = tpl?.canvas_height ?? 1080;
  const aspect = `${w} / ${h}`;

  return (
    <div className="grid h-full w-full place-items-center bg-neutral-950">
      <div
        className="canvas-stage relative overflow-hidden rounded-md shadow-xl ring-1 ring-white/10"
        style={{
          aspectRatio: aspect,
          backgroundColor: bg,
          maxWidth: "100%",
          maxHeight: "100%",
          width: w >= h ? "100%" : "auto",
          height: w >= h ? "auto" : "100%",
        }}
      >
        <TemplateBackground
          color={bg}
          mediaId={tpl?.background_media_id ?? null}
        />
        {elements
          .slice()
          .sort((a, b) => (a.z_index ?? 0) - (b.z_index ?? 0))
          .map((el) => {
            const visible = el.visible ?? true;
            if (!visible) return null;
            return (
              <div
                key={el.id}
                style={{
                  position: "absolute",
                  left: `${el.x}%`,
                  top: `${el.y}%`,
                  width: `${el.width}%`,
                  height: `${el.height}%`,
                  transform: `rotate(${el.rotation ?? 0}deg)`,
                  transformOrigin: "center center",
                  opacity: el.opacity ?? 1,
                  zIndex: el.z_index ?? 0,
                  pointerEvents: "none",
                }}
              >
                <StudioElementBody el={el} />
              </div>
            );
          })}
      </div>
    </div>
  );
}