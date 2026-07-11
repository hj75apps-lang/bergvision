import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
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

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [tick, setTick] = useState(0); // força restart de mídia/timer
  const videoRef = useRef<HTMLVideoElement | null>(null);

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
        <div className="absolute inset-0 grid place-items-center">
          <div
            className="relative overflow-hidden rounded-md bg-black ring-1 ring-white/10"
            style={{
              aspectRatio: "16 / 9",
              maxWidth: "100%",
              maxHeight: "100%",
              width: "100%",
              height: "auto",
            }}
          >
            {current && (
              <ItemStage
                key={`${current.id}-${tick}`}
                item={current}
                playing={playing}
                onVideoEnded={() =>
                  setIndex((i) => (items.length ? (i + 1) % items.length : 0))
                }
                videoRef={videoRef}
              />
            )}
            <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/80 ring-1 ring-white/10">
              {index + 1}/{items.length} · {itemLabel(current!)}
            </div>
          </div>
        </div>
      </div>

      {/* Controles */}
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

      {/* Timeline */}
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
}: {
  item: Item;
  playing: boolean;
  onVideoEnded: () => void;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
}) {
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) v.play().catch(() => {});
    else v.pause();
  }, [playing, videoRef]);

  if (item.item_type === "template") {
    return <TemplateFrame item={item} />;
  }

  const url = item.media_file?.url ?? null;
  if (isImage(item)) {
    return url ? (
      <img src={url} alt="" className="h-full w-full object-contain animate-in fade-in duration-500" />
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
        className="h-full w-full object-contain"
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