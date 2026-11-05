import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Clapperboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { MediaLibrary } from "@/components/video-editor/media-library";
import { MediaPreview } from "@/components/video-editor/media-preview";
import { VideoTimeline } from "@/components/video-editor/timeline";
import type { EditorAsset } from "@/lib/video-editor/media";

export const Route = createFileRoute("/studio/video")({
  head: () => ({
    meta: [
      { title: "Editor de vídeo · Studio · Berg Vision" },
      { name: "description", content: "Organize mídias e monte sequências de vídeo no Studio do Berg Vision." },
      { property: "og:title", content: "Editor de vídeo · Berg Vision" },
      { property: "og:description", content: "Biblioteca de mídia e edição de vídeo no Studio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VideoEditorPage,
});

function VideoEditorPage() {
  const { membership } = useAuth();
  const canEdit = !!membership && membership.role !== "viewer";
  const [selected, setSelected] = useState<EditorAsset | null>(null);
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            <Clapperboard className="h-3.5 w-3.5" />Studio
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Editor de vídeo</h1>
        </div>
        <Button asChild variant="outline" className="rounded-xl">
          <Link to="/studio"><ArrowLeft className="mr-2 h-4 w-4" />Templates</Link>
        </Button>
      </header>
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[320px_1fr]">
        <aside className="rounded-2xl border border-border/60 bg-card/40 p-3 backdrop-blur lg:h-[calc(100vh-11rem)]">
          <MediaLibrary orgId={membership?.organization_id} canEdit={canEdit} onPreview={setSelected} />
        </aside>
        <section className="flex flex-col gap-3">
          <MediaPreview asset={selected} />
          {selected && <p className="truncate text-sm text-muted-foreground">{selected.name}</p>}
          <VideoTimeline />
        </section>
      </div>
    </div>
  );
}
