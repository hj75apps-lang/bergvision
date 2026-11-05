import { Film } from "lucide-react";
import { useSignedUrl } from "@/lib/studio/use-signed-url";
import type { EditorAsset } from "@/lib/video-editor/media";

export function MediaPreview({ asset }: { asset: EditorAsset | null }) {
  const url = useSignedUrl(asset?.storage_path);
  return (
    <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl border border-border/60 bg-muted/30">
      {!asset ? (
        <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
          <Film className="h-8 w-8" />Selecione um arquivo da biblioteca
        </div>
      ) : !url ? null : asset.kind === "video" ? (
        <video key={url} src={url} controls playsInline className="h-full w-full object-contain" />
      ) : asset.kind === "audio" ? (
        <audio key={url} src={url} controls className="w-4/5" />
      ) : (
        <img src={url} alt={asset.name} className="h-full w-full object-contain" />
      )}
    </div>
  );
}
