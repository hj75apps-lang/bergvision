import { memo } from "react";
import { cn } from "@/lib/utils";
import { useSignedUrl } from "@/lib/studio/use-signed-url";
import { useWaveform } from "@/lib/video-editor/use-waveform";
import type { EditorAsset } from "@/lib/video-editor/media";
import type { Clip } from "@/lib/video-editor/timeline";

export type ClipPointerMode = "move" | "trim-start" | "trim-end";

type Props = {
  clip: Clip;
  asset: EditorAsset | undefined;
  zoom: number;
  selected: boolean;
  locked: boolean;
  onPointerDown: (e: React.PointerEvent, clip: Clip, mode: ClipPointerMode) => void;
};

const KIND_STYLE: Record<string, string> = {
  video: "bg-primary/25 border-primary/60",
  audio: "bg-accent/40 border-accent-foreground/30",
  image: "bg-secondary border-secondary-foreground/30",
  graphic: "bg-secondary border-secondary-foreground/30",
  text: "bg-muted border-muted-foreground/40",
  other: "bg-muted border-border",
};

function Waveform({ asset, clip }: { asset: EditorAsset; clip: Clip }) {
  const url = useSignedUrl(asset.storage_path);
  const peaks = useWaveform(asset.storage_path, url);
  if (!peaks || !clip.sourceDuration) return null;
  const a = Math.floor((clip.inPoint / clip.sourceDuration) * peaks.length);
  const b = Math.max(a + 1, Math.ceil(((clip.inPoint + clip.duration) / clip.sourceDuration) * peaks.length));
  const slice = peaks.slice(a, b);
  return (
    <svg className="absolute inset-x-0 bottom-0 h-3/4 w-full text-foreground/50" viewBox={`0 0 ${slice.length} 100`} preserveAspectRatio="none" aria-hidden>
      {slice.map((p, i) => (
        <rect key={i} x={i + 0.1} width={0.8} y={50 - p * 48} height={Math.max(1, p * 96)} fill="currentColor" />
      ))}
    </svg>
  );
}

function Thumbs({ asset }: { asset: EditorAsset }) {
  const url = useSignedUrl(asset.thumbnail_path ?? (asset.kind === "video" ? null : asset.storage_path));
  if (!url) return null;
  return (
    <div
      className="absolute inset-0 opacity-60"
      style={{ backgroundImage: `url("${url}")`, backgroundSize: "auto 100%", backgroundRepeat: "repeat-x" }}
      aria-hidden
    />
  );
}

export const TimelineClip = memo(function TimelineClip({ clip, asset, zoom, selected, locked, onPointerDown }: Props) {
  const left = (clip.start / 1000) * zoom;
  const width = Math.max(4, (clip.duration / 1000) * zoom);
  const kind = asset?.kind ?? "other";
  return (
    <div
      role="button"
      tabIndex={-1}
      aria-label={asset?.name ?? "Clipe"}
      aria-pressed={selected}
      data-clip-id={clip.id}
      onPointerDown={(e) => onPointerDown(e, clip, "move")}
      className={cn(
        "absolute top-1 bottom-1 select-none overflow-hidden rounded-lg border touch-none",
        KIND_STYLE[kind],
        locked ? "cursor-not-allowed opacity-70" : "cursor-grab active:cursor-grabbing",
        selected && "ring-2 ring-ring ring-offset-1 ring-offset-background",
      )}
      style={{ left, width }}
    >
      {asset && (kind === "video" || kind === "image" || kind === "graphic") && <Thumbs asset={asset} />}
      {asset && kind === "audio" && <Waveform asset={asset} clip={clip} />}
      <span className="relative z-10 block truncate px-2 pt-0.5 text-[11px] font-medium text-foreground drop-shadow">
        {asset?.name ?? "Mídia removida"}
      </span>
      {!locked && (
        <>
          <span
            aria-label="Aparar início"
            onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, clip, "trim-start"); }}
            className="absolute inset-y-0 left-0 z-20 w-2 cursor-ew-resize bg-foreground/0 hover:bg-foreground/30"
          />
          <span
            aria-label="Aparar fim"
            onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, clip, "trim-end"); }}
            className="absolute inset-y-0 right-0 z-20 w-2 cursor-ew-resize bg-foreground/0 hover:bg-foreground/30"
          />
        </>
      )}
    </div>
  );
});
