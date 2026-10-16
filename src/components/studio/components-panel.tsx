import { useMemo, useState } from "react";
import {
  Circle,
  Clock,
  CloudSun,
  Columns,
  Film,
  FileImage,
  GalleryHorizontal,
  Heading,
  Image as ImageIcon,
  Images,
  LayoutGrid,
  ListMusic,
  MoveHorizontal,
  Pilcrow,
  QrCode,
  RectangleHorizontal,
  Rows,
  Rss,
  Search,
  Square,
  Sparkles,
  TimerReset,
  Type as TypeIcon,
  Video as VideoIcon,
  Youtube,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ElementType } from "@/lib/studio/types";

export type LibraryItem = {
  type: ElementType;
  label: string;
  icon: typeof TypeIcon;
  defaultContent: Record<string, unknown>;
  defaultSize: { width: number; height: number };
  disabled?: boolean;
  disabledHint?: string;
};

type Category = { title: string; items: LibraryItem[] };

const NEUTRAL_BORDER = "#94A3B8";
const PRIMARY_FILL = "#3B82F6";

export const COMPONENT_LIBRARY: Category[] = [
  {
    title: "Layout",
    items: [
      {
        type: "shape",
        label: "Container",
        icon: Square,
        defaultContent: {
          element_type: "shape",
          shapeType: "rectangle",
          fill: "transparent",
          borderRadius: 0,
          borderColor: NEUTRAL_BORDER,
          borderWidth: 1,
          name: "Container",
        },
        defaultSize: { width: 40, height: 40 },
      },
      {
        type: "shape",
        label: "Linha",
        icon: Rows,
        defaultContent: {
          element_type: "shape",
          shapeType: "rectangle",
          fill: "transparent",
          borderRadius: 0,
          borderColor: NEUTRAL_BORDER,
          borderWidth: 1,
          name: "Linha",
        },
        defaultSize: { width: 60, height: 15 },
      },
      {
        type: "shape",
        label: "Coluna",
        icon: Columns,
        defaultContent: {
          element_type: "shape",
          shapeType: "rectangle",
          fill: "transparent",
          borderRadius: 0,
          borderColor: NEUTRAL_BORDER,
          borderWidth: 1,
          name: "Coluna",
        },
        defaultSize: { width: 15, height: 60 },
      },
      {
        type: "shape",
        label: "Grid",
        icon: LayoutGrid,
        defaultContent: {
          element_type: "shape",
          shapeType: "rectangle",
          fill: "transparent",
          borderRadius: 0,
          borderColor: NEUTRAL_BORDER,
          borderWidth: 1,
          name: "Grid",
        },
        defaultSize: { width: 40, height: 40 },
      },
      {
        type: "shape",
        label: "Espaço",
        icon: MoveHorizontal,
        defaultContent: {},
        defaultSize: { width: 0, height: 0 },
        disabled: true,
        disabledHint: "Use as guias de alinhamento para espaçar elementos",
      },
    ],
  },
  {
    title: "Conteúdo",
    items: [
      {
        type: "text",
        label: "Título",
        icon: Heading,
        defaultContent: {
          element_type: "text",
          content: "Título",
          fontFamily: "Inter",
          fontSizePercent: 10,
          fontWeight: "700",
          color: "#FFFFFF",
          textAlign: "left",
        },
        defaultSize: { width: 50, height: 15 },
      },
      {
        type: "text",
        label: "Parágrafo",
        icon: Pilcrow,
        defaultContent: {
          element_type: "text",
          content: "Digite seu texto aqui...",
          fontFamily: "Inter",
          fontSizePercent: 4,
          fontWeight: "400",
          color: "#FFFFFF",
          textAlign: "left",
        },
        defaultSize: { width: 40, height: 20 },
      },
      {
        type: "text",
        label: "Texto",
        icon: TypeIcon,
        defaultContent: {
          element_type: "text",
          content: "Texto",
          fontFamily: "Inter",
          fontSizePercent: 3,
          fontWeight: "400",
          color: "#FFFFFF",
          textAlign: "left",
        },
        defaultSize: { width: 25, height: 8 },
      },
      {
        type: "text",
        label: "QR Code",
        icon: QrCode,
        defaultContent: {
          element_type: "text",
          content: "QR Code — em desenvolvimento",
          fontFamily: "Inter",
          fontSizePercent: 3,
          fontWeight: "500",
          color: "#FFFFFF",
          textAlign: "center",
          name: "QR Code (placeholder)",
        },
        defaultSize: { width: 20, height: 20 },
      },
    ],
  },
  {
    title: "Mídia",
    items: [
      {
        type: "image",
        label: "Imagem",
        icon: ImageIcon,
        defaultContent: { element_type: "image", fit: "cover" },
        defaultSize: { width: 30, height: 30 },
      },
      {
        type: "image",
        label: "GIF",
        icon: Film,
        defaultContent: {
          element_type: "image",
          imageSubtype: "gif",
          fit: "contain",
          name: "GIF animado",
        },
        defaultSize: { width: 25, height: 25 },
      },
      {
        type: "image",
        label: "APNG",
        icon: FileImage,
        defaultContent: {
          element_type: "image",
          imageSubtype: "apng",
          fit: "contain",
          name: "APNG animado",
        },
        defaultSize: { width: 25, height: 25 },
      },
      {
        type: "image",
        label: "Sequência",
        icon: Images,
        defaultContent: {
          element_type: "image",
          imageSubtype: "sequence",
          fit: "contain",
          fps: 12,
          loop: true,
          frames: [],
          name: "Sequência de imagens",
        },
        defaultSize: { width: 30, height: 30 },
      },
      {
        type: "logo",
        label: "Logo",
        icon: Sparkles,
        defaultContent: { element_type: "logo", fit: "contain" },
        defaultSize: { width: 20, height: 10 },
      },
      {
        type: "video",
        label: "Vídeo",
        icon: VideoIcon,
        defaultContent: {
          element_type: "video",
          fit: "cover",
          loop: true,
          muted: true,
        },
        defaultSize: { width: 40, height: 30 },
      },
      {
        type: "playlist",
        label: "Playlist",
        icon: ListMusic,
        defaultContent: { element_type: "playlist" },
        defaultSize: { width: 40, height: 40 },
      },
      {
        type: "playlist",
        label: "Galeria",
        icon: GalleryHorizontal,
        defaultContent: {
          element_type: "playlist",
          source: "inline",
          items: [],
          loop: true,
          transition: "fade",
          defaultDuration: 8,
          fit: "cover",
          name: "Galeria",
        },
        defaultSize: { width: 40, height: 40 },
      },
    ],
  },
  {
    title: "Widgets",
    items: [
      {
        type: "widget",
        label: "Relógio",
        icon: Clock,
        defaultContent: {
          element_type: "widget",
          widgetType: "clock",
          widgetConfig: {
            format: "24h",
            showSeconds: false,
            showDate: false,
            timezone: "America/Sao_Paulo",
          },
        },
        defaultSize: { width: 25, height: 15 },
      },
      {
        type: "widget",
        label: "Clima",
        icon: CloudSun,
        defaultContent: {
          element_type: "widget",
          widgetType: "weather",
          widgetConfig: {
            city: "São Paulo",
            rotationSeconds: 15,
            units: "metric",
            showForecast: false,
            preset: "complete",
            theme: "gradient",
            showAnimatedIcons: true,
          },
        },
        defaultSize: { width: 30, height: 25 },
      },
      {
        type: "widget",
        label: "RSS/Notícias",
        icon: Rss,
        defaultContent: {
          element_type: "widget",
          widgetType: "rss",
          widgetConfig: {
            feedUrl: "",
            maxItems: 5,
            rotationSeconds: 10,
          },
        },
        defaultSize: { width: 40, height: 15 },
      },
      {
        type: "widget",
        label: "Vídeo por link",
        icon: Youtube,
        defaultContent: {
          element_type: "widget",
          widgetType: "iframe",
          name: "Vídeo por link",
          widgetConfig: {
            url: "",
            zoomPercent: 100,
            refreshSeconds: 0,
            allowScripts: true,
            allowSameOrigin: true,
            videoLink: true,
          },
        },
        defaultSize: { width: 48, height: 27 },
      },
      {
        type: "text",
        label: "Contador",
        icon: TimerReset,
        defaultContent: {
          element_type: "text",
          content: "Contador — em desenvolvimento",
          fontFamily: "Inter",
          fontSizePercent: 4,
          fontWeight: "600",
          color: "#FFFFFF",
          textAlign: "center",
          name: "Contador regressivo (placeholder)",
        },
        defaultSize: { width: 30, height: 12 },
      },
    ],
  },
  {
    title: "Formas",
    items: [
      {
        type: "shape",
        label: "Retângulo",
        icon: RectangleHorizontal,
        defaultContent: {
          element_type: "shape",
          shapeType: "rectangle",
          fill: PRIMARY_FILL,
          borderRadius: 8,
          borderWidth: 0,
        },
        defaultSize: { width: 25, height: 15 },
      },
      {
        type: "shape",
        label: "Círculo",
        icon: Circle,
        defaultContent: {
          element_type: "shape",
          shapeType: "circle",
          fill: PRIMARY_FILL,
          borderRadius: 0,
          borderWidth: 0,
        },
        defaultSize: { width: 20, height: 20 },
      },
    ],
  },
];

function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function ComponentsPanel({
  onAdd,
  disabled,
}: {
  onAdd: (item: LibraryItem) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = normalize(q.trim());
    if (!term) return COMPONENT_LIBRARY;
    return COMPONENT_LIBRARY.map((cat) => ({
      ...cat,
      items: cat.items.filter((i) => normalize(i.label).includes(term)),
    })).filter((cat) => cat.items.length > 0);
  }, [q]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/60 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar componentes..."
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-2">
          {filtered.length === 0 && (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Nenhum componente encontrado
            </div>
          )}
          {filtered.map((cat) => (
            <div key={cat.title}>
              <div className="mb-2 px-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">
                {cat.title}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {cat.items.map((item) => {
                  const btn = (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={disabled || item.disabled}
                      onClick={() => !item.disabled && onAdd(item)}
                      className={cn(
                        "group relative flex aspect-square h-auto w-full flex-col items-center justify-center gap-1.5 rounded-xl border-border/60 bg-card/40 p-2 text-[11px] font-medium text-foreground/90 shadow-sm backdrop-blur-sm transition-all",
                        "hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent/60 hover:text-foreground hover:shadow-md",
                        "focus-visible:ring-1 focus-visible:ring-primary/50",
                        "disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-sm",
                      )}
                    >
                      <item.icon className="h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" strokeWidth={1.75} />
                      <span className="w-full truncate text-center leading-none">{item.label}</span>
                    </Button>
                  );
                  if (item.disabled && item.disabledHint) {
                    return (
                      <Tooltip key={item.label}>
                        <TooltipTrigger asChild>
                          <span className="contents">{btn}</span>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          {item.disabledHint}
                        </TooltipContent>
                      </Tooltip>
                    );
                  }
                  return <div key={item.label}>{btn}</div>;
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}