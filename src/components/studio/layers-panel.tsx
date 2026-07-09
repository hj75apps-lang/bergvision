import { useMemo, useState } from "react";
import {
  Eye,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
  ListMusic,
  Lock,
  Shapes,
  Sparkles,
  Square,
  Type as TypeIcon,
  Unlock,
  Video as VideoIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import type { ElementType, TemplateElement } from "@/lib/studio/types";
import { ELEMENT_LABELS } from "@/lib/studio/types";

const ICONS: Record<ElementType, typeof TypeIcon> = {
  text: TypeIcon,
  image: ImageIcon,
  video: VideoIcon,
  logo: Sparkles,
  playlist: ListMusic,
  widget: Shapes,
  shape: Square,
};

function elementDisplayName(el: TemplateElement): string {
  const c = (el.content ?? {}) as Record<string, unknown>;
  const cname = typeof c.name === "string" ? c.name.trim() : "";
  return cname || ELEMENT_LABELS[el.element_type];
}

export function LayersPanel({
  elements,
  selectedIds,
  disabled,
  onSelect,
  onRename,
  onToggleVisible,
  onToggleLocked,
  onReorder,
}: {
  elements: TemplateElement[];
  selectedIds: string[];
  disabled: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onRename: (id: string, name: string) => void;
  onToggleVisible: (id: string) => void;
  onToggleLocked: (id: string) => void;
  /** newOrder is the top-to-bottom list of element ids (highest z first). */
  onReorder: (newOrder: string[]) => void;
}) {
  // Sort top-to-bottom (highest z_index first).
  const ordered = useMemo(
    () => [...elements].sort((a, b) => b.z_index - a.z_index),
    [elements],
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = ordered.map((e) => e.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    onReorder(ids);
    setDragId(null);
    setOverId(null);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/60 px-3 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Camadas
        </h3>
      </div>
      <ScrollArea className="flex-1">
        {ordered.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">
            Adicione elementos ao canvas para vê-los aqui.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5 p-1.5">
            {ordered.map((el) => {
              const Icon = ICONS[el.element_type];
              const selected = selectedIds.includes(el.id);
              const isDragOver = overId === el.id && dragId && dragId !== el.id;
              const visible = el.visible ?? true;
              const locked = el.locked ?? false;
              return (
                <li
                  key={el.id}
                  draggable={!disabled}
                  onDragStart={() => setDragId(el.id)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverId(el.id);
                  }}
                  onDragLeave={() => setOverId((v) => (v === el.id ? null : v))}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(el.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverId(null);
                  }}
                  className={cn(
                    "group flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-sm transition",
                    selected
                      ? "bg-primary/15 text-primary-foreground ring-1 ring-primary/40"
                      : "hover:bg-muted/60",
                    isDragOver && "outline outline-2 outline-primary/50",
                    dragId === el.id && "opacity-50",
                  )}
                >
                  <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/60" />
                  <button
                    type="button"
                    onClick={(e) => onSelect(el.id, e.shiftKey)}
                    onDoubleClick={() => setEditing(el.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {editing === el.id ? (
                      <Input
                        autoFocus
                        defaultValue={elementDisplayName(el)}
                        onBlur={(e) => {
                          onRename(el.id, e.currentTarget.value);
                          setEditing(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            onRename(el.id, e.currentTarget.value);
                            setEditing(null);
                          } else if (e.key === "Escape") {
                            setEditing(null);
                          }
                        }}
                        className="h-6 px-1.5 py-0 text-xs"
                      />
                    ) : (
                      <span className="truncate text-xs">
                        {elementDisplayName(el)}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleVisible(el.id)}
                    disabled={disabled}
                    className="opacity-60 transition hover:opacity-100 disabled:cursor-not-allowed"
                    title={visible ? "Ocultar" : "Mostrar"}
                  >
                    {visible ? (
                      <Eye className="h-3.5 w-3.5" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleLocked(el.id)}
                    disabled={disabled}
                    className="opacity-60 transition hover:opacity-100 disabled:cursor-not-allowed"
                    title={locked ? "Desbloquear" : "Bloquear"}
                  >
                    {locked ? (
                      <Lock className="h-3.5 w-3.5 text-amber-400" />
                    ) : (
                      <Unlock className="h-3.5 w-3.5" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}