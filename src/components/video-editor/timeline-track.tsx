import { ChevronDown, ChevronUp, Eye, EyeOff, Lock, Trash2, Unlock, Volume2, VolumeX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Track } from "@/lib/video-editor/timeline";

type Props = {
  track: Track;
  first: boolean;
  last: boolean;
  onChange: (patch: Partial<Omit<Track, "id" | "kind">>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
};

function IconBtn({ label, onClick, children, active }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn("rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground", active && "text-primary")}
    >
      {children}
    </button>
  );
}

export function TimelineTrackHeader({ track, first, last, onChange, onMove, onRemove }: Props) {
  return (
    <div className="flex h-full flex-col justify-center gap-0.5 px-2">
      <Input
        value={track.name}
        onChange={(e) => onChange({ name: e.target.value.slice(0, 40) })}
        aria-label="Nome da trilha"
        className="h-6 rounded-md border-transparent bg-transparent px-1 text-xs font-medium focus-visible:border-border"
      />
      <div className="flex items-center">
        {track.kind === "audio" ? (
          <IconBtn label={track.muted ? "Ativar som" : "Silenciar"} onClick={() => onChange({ muted: !track.muted })} active={track.muted}>
            {track.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </IconBtn>
        ) : (
          <IconBtn label={track.visible ? "Ocultar" : "Mostrar"} onClick={() => onChange({ visible: !track.visible })} active={!track.visible}>
            {track.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </IconBtn>
        )}
        <IconBtn label={track.locked ? "Desbloquear" : "Bloquear"} onClick={() => onChange({ locked: !track.locked })} active={track.locked}>
          {track.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
        </IconBtn>
        {!first && <IconBtn label="Subir trilha" onClick={() => onMove(-1)}><ChevronUp className="h-3.5 w-3.5" /></IconBtn>}
        {!last && <IconBtn label="Descer trilha" onClick={() => onMove(1)}><ChevronDown className="h-3.5 w-3.5" /></IconBtn>}
        <IconBtn label="Excluir trilha" onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
      </div>
    </div>
  );
}
