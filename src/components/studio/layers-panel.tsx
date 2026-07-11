import { Fragment, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Copy,
  Eye,
  EyeOff,
  FolderClosed,
  FolderMinus,
  FolderOpen,
  GripVertical,
  Image as ImageIcon,
  Layers,
  ListMusic,
  Lock,
  MoveDown,
  MoveUp,
  Pencil,
  Shapes,
  Sparkles,
  Square,
  Trash2,
  Type as TypeIcon,
  Unlock,
  Video as VideoIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { ElementType, TemplateElement } from "@/lib/studio/types";
import {
  ELEMENT_LABELS,
  getGroupPath,
  type GroupSeg,
} from "@/lib/studio/types";

const ICONS: Record<ElementType, typeof TypeIcon> = {
  text: TypeIcon,
  image: ImageIcon,
  video: VideoIcon,
  logo: Sparkles,
  playlist: ListMusic,
  widget: Shapes,
  shape: Square,
};

const WIDGET_LABELS: Record<string, string> = {
  clock: "Relógio",
  weather: "Clima",
  rss: "RSS",
  news: "Notícias",
};

function elementDisplayName(el: TemplateElement): string {
  const c = (el.content ?? {}) as Record<string, unknown>;
  const cname = typeof c.name === "string" ? c.name.trim() : "";
  if (cname) return cname;
  if (el.element_type === "widget") {
    const wt = ((c.widgetType ?? c.widget_type) as string | undefined) ?? "clock";
    if (WIDGET_LABELS[wt]) return WIDGET_LABELS[wt];
  }
  if (el.element_type === "playlist" && c.source === "inline") {
    const n = Array.isArray(c.items) ? (c.items as unknown[]).length : 0;
    return `Grupo (${n})`;
  }
  return ELEMENT_LABELS[el.element_type];
}

function iconFor(el: TemplateElement) {
  const c = (el.content ?? {}) as Record<string, unknown>;
  if (el.element_type === "playlist" && c.source === "inline") return Layers;
  return ICONS[el.element_type];
}

// ---------- Tree ----------

type LeafNode = { kind: "leaf"; el: TemplateElement };
type GroupNode = {
  kind: "group";
  id: string;
  name: string;
  path: GroupSeg[];
  children: TreeNode[];
};
type TreeNode = LeafNode | GroupNode;

function buildTree(sortedTopToBottom: TemplateElement[]): TreeNode[] {
  const roots: TreeNode[] = [];
  const groupIndex = new Map<string, GroupNode>();
  for (const el of sortedTopToBottom) {
    const path = getGroupPath(el);
    let container = roots;
    let key = "";
    const acc: GroupSeg[] = [];
    for (const seg of path) {
      key = key ? `${key}/${seg.id}` : seg.id;
      acc.push(seg);
      let node = groupIndex.get(key);
      if (!node) {
        node = {
          kind: "group",
          id: seg.id,
          name: seg.name,
          path: [...acc],
          children: [],
        };
        groupIndex.set(key, node);
        container.push(node);
      }
      container = node.children;
    }
    container.push({ kind: "leaf", el });
  }
  return roots;
}

function collectLeafIds(nodes: TreeNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    if (n.kind === "leaf") out.push(n.el.id);
    else out.push(...collectLeafIds(n.children));
  }
  return out;
}

export function LayersPanel({
  elements,
  selectedIds,
  disabled,
  onSelect,
  onSelectMany,
  onRename,
  onToggleVisible,
  onToggleLocked,
  onReorder,
  onGroup,
  onUngroup,
  onRenameGroup,
  onToggleGroupVisible,
  onToggleGroupLocked,
  onMoveToGroup,
  onDuplicate,
  onDelete,
  onDeleteGroup,
}: {
  elements: TemplateElement[];
  selectedIds: string[];
  disabled: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onSelectMany: (ids: string[], additive: boolean) => void;
  onRename: (id: string, name: string) => void;
  onToggleVisible: (id: string) => void;
  onToggleLocked: (id: string) => void;
  onReorder: (newOrder: string[]) => void;
  onGroup: (ids: string[]) => void;
  onUngroup: (groupId: string) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onToggleGroupVisible: (groupId: string) => void;
  onToggleGroupLocked: (groupId: string) => void;
  onMoveToGroup: (elementIds: string[], targetPath: GroupSeg[]) => void;
  onDuplicate: (ids: string[]) => void;
  onDelete: (ids: string[]) => void;
  onDeleteGroup: (groupId: string) => void;
}) {
  const ordered = useMemo(
    () => [...elements].sort((a, b) => b.z_index - a.z_index),
    [elements],
  );
  const tree = useMemo(() => buildTree(ordered), [ordered]);

  const [dragIds, setDragIds] = useState<string[] | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [dropMode, setDropMode] = useState<"reorder" | "group" | "root">(
    "reorder",
  );
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);

  const resetDrag = () => {
    setDragIds(null);
    setOverKey(null);
    setDropMode("reorder");
  };

  const handleReorderDrop = (targetLeafId: string) => {
    if (!dragIds || dragIds.length !== 1 || dragIds[0] === targetLeafId) {
      return resetDrag();
    }
    const ids = ordered.map((e) => e.id);
    const src = dragIds[0];
    const from = ids.indexOf(src);
    const to = ids.indexOf(targetLeafId);
    if (from < 0 || to < 0) return resetDrag();
    ids.splice(from, 1);
    ids.splice(to, 0, src);
    onReorder(ids);
    resetDrag();
  };

  const toggleCollapsed = (id: string) =>
    setCollapsed((v) => ({ ...v, [id]: !v[id] }));

  const groupBtnEnabled = !disabled && selectedIds.length >= 2;
  const anyGrouped = elements.some((e) => getGroupPath(e).length > 0);
  const rootDropActive = !!dragIds && dropMode === "root";

  const renderNode = (
    node: TreeNode,
    depth: number,
    parentKey: string,
  ): React.ReactNode => {
    if (node.kind === "group") {
      const key = parentKey ? `${parentKey}/${node.id}` : node.id;
      const isCollapsed = collapsed[node.id] ?? false;
      const leafIds = collectLeafIds(node.children);
      const allSelected =
        leafIds.length > 0 && leafIds.every((id) => selectedIds.includes(id));
      const anyLocked = leafIds.some((id) => {
        const el = elements.find((e) => e.id === id);
        return el ? (el.locked ?? false) : false;
      });
      const anyHidden = leafIds.some((id) => {
        const el = elements.find((e) => e.id === id);
        return el ? !(el.visible ?? true) : false;
      });
      const isDropTarget = overKey === key && dropMode === "group";
      return (
        <Fragment key={key}>
          <li
            onDragOver={(e) => {
              if (!dragIds) return;
              e.preventDefault();
              setOverKey(key);
              setDropMode("group");
            }}
            onDragLeave={() => setOverKey((v) => (v === key ? null : v))}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (dragIds && dragIds.length > 0) onMoveToGroup(dragIds, node.path);
              resetDrag();
            }}
            className={cn(
              "group flex items-center gap-1 rounded-lg py-1.5 pr-1.5 text-sm transition",
              allSelected
                ? "bg-primary/15 text-primary-foreground ring-1 ring-primary/40"
                : "hover:bg-muted/60",
              isDropTarget && "outline outline-2 outline-primary/70 bg-primary/10",
            )}
            style={{ paddingLeft: 6 + depth * 12 }}
          >
            <button
              type="button"
              onClick={() => toggleCollapsed(node.id)}
              className="opacity-70 hover:opacity-100"
              title={isCollapsed ? "Expandir" : "Recolher"}
            >
              {isCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
            {isCollapsed ? (
              <FolderClosed className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            ) : (
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            )}
            <button
              type="button"
              onClick={(e) =>
                onSelectMany(leafIds, e.shiftKey || e.metaKey || e.ctrlKey)
              }
              onDoubleClick={() => setEditingGroup(node.id)}
              className="flex min-w-0 flex-1 items-center gap-1 text-left"
            >
              {editingGroup === node.id ? (
                <Input
                  autoFocus
                  defaultValue={node.name}
                  onBlur={(e) => {
                    const v = e.currentTarget.value.trim();
                    if (v && v !== node.name) onRenameGroup(node.id, v);
                    setEditingGroup(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const v = e.currentTarget.value.trim();
                      if (v && v !== node.name) onRenameGroup(node.id, v);
                      setEditingGroup(null);
                    } else if (e.key === "Escape") {
                      setEditingGroup(null);
                    }
                  }}
                  className="h-6 px-1.5 py-0 text-xs"
                />
              ) : (
                <span className="truncate text-xs font-medium">
                  {node.name}
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    ({leafIds.length})
                  </span>
                </span>
              )}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onToggleGroupVisible(node.id)}
              className="opacity-60 transition hover:opacity-100 disabled:cursor-not-allowed"
              title="Mostrar/ocultar grupo"
            >
              {anyHidden ? (
                <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onToggleGroupLocked(node.id)}
              className="opacity-60 transition hover:opacity-100 disabled:cursor-not-allowed"
              title="Bloquear/desbloquear grupo"
            >
              {anyLocked ? (
                <Lock className="h-3.5 w-3.5 text-amber-400" />
              ) : (
                <Unlock className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onUngroup(node.id)}
              className="opacity-60 transition hover:opacity-100 disabled:cursor-not-allowed"
              title="Desagrupar"
            >
              <FolderMinus className="h-3.5 w-3.5" />
            </button>
          </li>
          {!isCollapsed &&
            node.children.map((c) => renderNode(c, depth + 1, key))}
        </Fragment>
      );
    }

    const el = node.el;
    const Icon = iconFor(el);
    const selected = selectedIds.includes(el.id);
    const key = `leaf:${el.id}`;
    const visible = el.visible ?? true;
    const locked = el.locked ?? false;
    const isDragOver =
      overKey === key &&
      !!dragIds &&
      !dragIds.includes(el.id) &&
      dropMode === "reorder";
    return (
      <li
        key={key}
        draggable={!disabled}
        onDragStart={() => {
          const ids = selected && selectedIds.length > 1 ? selectedIds : [el.id];
          setDragIds(ids);
        }}
        onDragOver={(e) => {
          if (!dragIds) return;
          e.preventDefault();
          setOverKey(key);
          setDropMode("reorder");
        }}
        onDragLeave={() => setOverKey((v) => (v === key ? null : v))}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleReorderDrop(el.id);
        }}
        onDragEnd={resetDrag}
        className={cn(
          "group flex items-center gap-1.5 rounded-lg py-1.5 pr-1.5 text-sm transition",
          selected
            ? "bg-primary/15 text-primary-foreground ring-1 ring-primary/40"
            : "hover:bg-muted/60",
          isDragOver && "outline outline-2 outline-primary/50",
          dragIds?.includes(el.id) && "opacity-50",
        )}
        style={{ paddingLeft: 6 + depth * 12 }}
      >
        <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/60" />
        <button
          type="button"
          onClick={(e) => onSelect(el.id, e.shiftKey || e.metaKey || e.ctrlKey)}
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
            <span className="truncate text-xs">{elementDisplayName(el)}</span>
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
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Camadas
        </h3>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-2 text-[10px]"
          disabled={!groupBtnEnabled}
          onClick={() => onGroup(selectedIds)}
          title="Agrupar seleção (≥ 2 camadas)"
        >
          <FolderClosed className="h-3 w-3" />
          Agrupar
        </Button>
      </div>
      <ScrollArea className="flex-1">
        {ordered.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">
            Adicione elementos ao canvas para vê-los aqui.
          </p>
        ) : (
          <>
            {anyGrouped && (
              <div
                onDragOver={(e) => {
                  if (!dragIds) return;
                  e.preventDefault();
                  setOverKey("__root__");
                  setDropMode("root");
                }}
                onDragLeave={() =>
                  setOverKey((v) => (v === "__root__" ? null : v))
                }
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIds && dragIds.length > 0) onMoveToGroup(dragIds, []);
                  resetDrag();
                }}
                className={cn(
                  "mx-1.5 mt-1.5 rounded-md border border-dashed border-border/60 px-2 py-1 text-center text-[10px] text-muted-foreground transition",
                  rootDropActive && "border-primary/70 bg-primary/10 text-primary",
                )}
              >
                Arraste aqui para tirar do grupo
              </div>
            )}
            <ul className="flex flex-col gap-0.5 p-1.5">
              {tree.map((n) => renderNode(n, 0, ""))}
            </ul>
          </>
        )}
      </ScrollArea>
    </div>
  );
}