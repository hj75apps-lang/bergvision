import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, AlignCenter, AlignLeft, AlignRight, ImagePlus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { TemplateElement } from "@/lib/studio/types";
import { ELEMENT_LABELS } from "@/lib/studio/types";
import {
  MediaPickerDialog,
  isLowRes,
  type PickerMediaFile,
} from "./media-picker-dialog";

const FONT_OPTIONS = [
  "Inter",
  "Roboto",
  "Poppins",
  "Montserrat",
  "Playfair Display",
  "Space Grotesk",
  "Arial",
  "Georgia",
];

const FONT_WEIGHTS = [
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "600", label: "Semibold" },
  { value: "700", label: "Bold" },
];

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Fortaleza",
  "America/Belem",
  "UTC",
];

type NumericKey = "x" | "y" | "width" | "height" | "rotation" | "opacity";

export function PropertiesPanel({
  element,
  disabled,
  onGeomChange,
  onFlagChange,
  onContentChange,
}: {
  element: TemplateElement | null;
  disabled: boolean;
  onGeomChange: (patch: Partial<Pick<TemplateElement, NumericKey>>) => void;
  onFlagChange: (patch: Partial<Pick<TemplateElement, "locked" | "visible">>) => void;
  onContentChange: (content: Record<string, unknown>) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/60 px-3 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Propriedades
        </h3>
      </div>
      <ScrollArea className="flex-1">
        {!element ? (
          <p className="p-4 text-xs text-muted-foreground">
            Selecione um elemento para editar suas propriedades.
          </p>
        ) : (
          <div className="flex flex-col gap-4 p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {ELEMENT_LABELS[element.element_type]}
            </div>

            <TransformBlock
              element={element}
              disabled={disabled}
              onChange={onGeomChange}
            />

            <Separator />

            <FlagsBlock
              element={element}
              disabled={disabled}
              onChange={onFlagChange}
            />

            <Separator />

            <ContentBlock
              element={element}
              disabled={disabled}
              onChange={onContentChange}
            />
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled: boolean;
  onCommit: (v: number) => void;
}) {
  const [local, setLocal] = useState<string>(String(value));
  useEffect(() => setLocal(String(value)), [value]);
  const commit = () => {
    const n = parseFloat(local);
    if (!isFinite(n)) {
      setLocal(String(value));
      return;
    }
    const clamped = Math.max(min, Math.min(max, n));
    if (clamped !== value) onCommit(clamped);
    setLocal(String(clamped));
  };
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <Input
        type="number"
        value={local}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="h-8 px-2 text-xs"
      />
    </label>
  );
}

function TransformBlock({
  element,
  disabled,
  onChange,
}: {
  element: TemplateElement;
  disabled: boolean;
  onChange: (patch: Partial<Pick<TemplateElement, NumericKey>>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <NumberField
        label="X %"
        value={Math.round(element.x * 100) / 100}
        min={0}
        max={100}
        step={0.5}
        disabled={disabled}
        onCommit={(v) => onChange({ x: v })}
      />
      <NumberField
        label="Y %"
        value={Math.round(element.y * 100) / 100}
        min={0}
        max={100}
        step={0.5}
        disabled={disabled}
        onCommit={(v) => onChange({ y: v })}
      />
      <NumberField
        label="Largura %"
        value={Math.round(element.width * 100) / 100}
        min={1}
        max={100}
        step={0.5}
        disabled={disabled}
        onCommit={(v) => onChange({ width: v })}
      />
      <NumberField
        label="Altura %"
        value={Math.round(element.height * 100) / 100}
        min={1}
        max={100}
        step={0.5}
        disabled={disabled}
        onCommit={(v) => onChange({ height: v })}
      />
      <NumberField
        label="Rotação °"
        value={Math.round(element.rotation ?? 0)}
        min={-360}
        max={360}
        step={1}
        disabled={disabled}
        onCommit={(v) => onChange({ rotation: v })}
      />
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Opacidade
        </span>
        <Slider
          value={[Math.round((element.opacity ?? 1) * 100)]}
          min={0}
          max={100}
          step={1}
          disabled={disabled}
          onValueChange={([v]) => onChange({ opacity: v / 100 })}
          className="mt-2"
        />
      </div>
    </div>
  );
}

function FlagsBlock({
  element,
  disabled,
  onChange,
}: {
  element: TemplateElement;
  disabled: boolean;
  onChange: (patch: Partial<Pick<TemplateElement, "locked" | "visible">>) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Visível</Label>
        <Switch
          checked={element.visible ?? true}
          onCheckedChange={(v) => onChange({ visible: v })}
          disabled={disabled}
        />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Bloqueado</Label>
        <Switch
          checked={element.locked ?? false}
          onCheckedChange={(v) => onChange({ locked: v })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function ContentBlock({
  element,
  disabled,
  onChange,
}: {
  element: TemplateElement;
  disabled: boolean;
  onChange: (content: Record<string, unknown>) => void;
}) {
  const c = (element.content ?? {}) as Record<string, unknown>;
  const patch = (p: Record<string, unknown>) => onChange({ ...c, ...p });

  switch (element.element_type) {
    case "text":
      return <TextContent c={c} patch={patch} disabled={disabled} />;
    case "image":
    case "logo":
      return (
        <MediaContent
          c={c}
          patch={patch}
          disabled={disabled}
          kind="image"
          allowFill={element.element_type === "image"}
        />
      );
    case "video":
      return <VideoContent c={c} patch={patch} disabled={disabled} />;
    case "playlist":
      return <PlaylistContent c={c} patch={patch} disabled={disabled} />;
    case "widget":
      return <WidgetContent c={c} patch={patch} disabled={disabled} />;
    case "shape":
      return <ShapeContent c={c} patch={patch} disabled={disabled} />;
    default:
      return null;
  }
}

function ColorField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <Input
          type="color"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-12 cursor-pointer p-1"
        />
        <Input
          type="text"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 flex-1 font-mono text-xs uppercase"
        />
      </div>
    </label>
  );
}

function TextContent({
  c,
  patch,
  disabled,
}: {
  c: Record<string, unknown>;
  patch: (p: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const align = (c.textAlign as string) ?? "left";
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Conteúdo
        </span>
        <Textarea
          value={(c.content as string) ?? ""}
          onChange={(e) => patch({ content: e.target.value })}
          disabled={disabled}
          maxLength={1000}
          rows={3}
          className="text-sm"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Fonte
          </span>
          <Select
            value={(c.fontFamily as string) ?? "Inter"}
            onValueChange={(v) => patch({ fontFamily: v })}
            disabled={disabled}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_OPTIONS.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Peso
          </span>
          <Select
            value={(c.fontWeight as string) ?? "400"}
            onValueChange={(v) => patch({ fontWeight: v })}
            disabled={disabled}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_WEIGHTS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Tamanho ({(c.fontSizePercent as number) ?? 5}%)
        </span>
        <Slider
          value={[(c.fontSizePercent as number) ?? 5]}
          min={1}
          max={50}
          step={0.5}
          disabled={disabled}
          onValueChange={([v]) => patch({ fontSizePercent: v })}
        />
      </div>

      <ColorField
        label="Cor do texto"
        value={(c.color as string) ?? "#FFFFFF"}
        disabled={disabled}
        onChange={(v) => patch({ color: v })}
      />

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Alinhamento
        </span>
        <div className="grid grid-cols-3 gap-1 rounded-lg border border-border/60 p-0.5">
          {(["left", "center", "right"] as const).map((v) => {
            const Icon =
              v === "left" ? AlignLeft : v === "center" ? AlignCenter : AlignRight;
            return (
              <button
                key={v}
                type="button"
                disabled={disabled}
                onClick={() => patch({ textAlign: v })}
                className={cn(
                  "flex items-center justify-center rounded-md py-1.5 transition",
                  align === v
                    ? "bg-primary/20 text-primary"
                    : "hover:bg-muted/60 text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        <Label className="text-xs">Cor de fundo</Label>
        <Switch
          checked={typeof c.backgroundColor === "string"}
          disabled={disabled}
          onCheckedChange={(v) =>
            patch({
              backgroundColor: v ? ((c.backgroundColor as string) ?? "#000000") : undefined,
              backgroundOpacity: v ? ((c.backgroundOpacity as number) ?? 1) : undefined,
            })
          }
        />
      </div>
      {typeof c.backgroundColor === "string" && (
        <>
          <ColorField
            label="Fundo"
            value={c.backgroundColor as string}
            disabled={disabled}
            onChange={(v) => patch({ backgroundColor: v })}
          />
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Opacidade do fundo ({Math.round(((c.backgroundOpacity as number) ?? 1) * 100)}%)
            </span>
            <Slider
              value={[Math.round(((c.backgroundOpacity as number) ?? 1) * 100)]}
              min={0}
              max={100}
              step={1}
              disabled={disabled}
              onValueChange={([v]) => patch({ backgroundOpacity: v / 100 })}
            />
          </div>
        </>
      )}
    </div>
  );
}

function MediaContent({
  c,
  patch,
  disabled,
  kind,
  allowFill,
}: {
  c: Record<string, unknown>;
  patch: (p: Record<string, unknown>) => void;
  disabled: boolean;
  kind: "image" | "video";
  allowFill: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const mediaName = (c.mediaFileName as string) ?? null;
  const fitOptions = allowFill
    ? ["contain", "cover", "fill"]
    : ["contain", "cover"];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Mídia
        </span>
        <Button
          type="button"
          variant="outline"
          className="justify-start"
          disabled={disabled}
          onClick={() => setPickerOpen(true)}
        >
          <ImagePlus className="mr-2 h-4 w-4" />
          <span className="truncate">
            {mediaName ?? "Selecionar mídia..."}
          </span>
        </Button>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Ajuste
        </span>
        <Select
          value={(c.fit as string) ?? "cover"}
          onValueChange={(v) => patch({ fit: v })}
          disabled={disabled}
        >
          <SelectTrigger className="h-8 text-xs capitalize">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {fitOptions.map((f) => (
              <SelectItem key={f} value={f} className="capitalize">
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <MediaPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        filter={kind}
        onPick={(f: PickerMediaFile) =>
          patch({
            mediaFileId: f.id,
            mediaFileName: f.name,
            mediaStoragePath: f.storage_path,
            mediaThumbnailPath: f.thumbnail_path,
          })
        }
      />
    </div>
  );
}

function VideoContent({
  c,
  patch,
  disabled,
}: {
  c: Record<string, unknown>;
  patch: (p: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <MediaContent
        c={c}
        patch={patch}
        disabled={disabled}
        kind="video"
        allowFill
      />
      <div className="flex items-center justify-between">
        <Label className="text-xs">Loop</Label>
        <Switch
          checked={(c.loop as boolean) ?? true}
          disabled={disabled}
          onCheckedChange={(v) => patch({ loop: v })}
        />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Mudo</Label>
        <Switch
          checked={(c.muted as boolean) ?? true}
          disabled={disabled}
          onCheckedChange={(v) => patch({ muted: v })}
        />
      </div>
    </div>
  );
}

function PlaylistContent({
  c,
  patch,
  disabled,
}: {
  c: Record<string, unknown>;
  patch: (p: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const { membership } = useAuth();
  const orgId = membership?.organization_id ?? null;
  const playlistsQ = useQuery({
    queryKey: ["studio_playlist_options", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("playlists")
        .select("id, name")
        .eq("organization_id", orgId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const options = playlistsQ.data ?? [];
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Playlist
      </span>
      <Select
        value={(c.playlistId as string) ?? ""}
        onValueChange={(v) => patch({ playlistId: v })}
        disabled={disabled || options.length === 0}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue
            placeholder={
              options.length === 0 ? "Nenhuma playlist" : "Selecionar..."
            }
          />
        </SelectTrigger>
        <SelectContent>
          {options.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function WidgetContent({
  c,
  patch,
  disabled,
}: {
  c: Record<string, unknown>;
  patch: (p: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const widgetType = (c.widgetType as string) ?? "clock";
  const config = (c.widgetConfig as Record<string, unknown>) ?? {};
  const setCfg = (p: Record<string, unknown>) =>
    patch({ widgetConfig: { ...config, ...p } });
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Tipo
        </span>
        <Select
          value={widgetType}
          onValueChange={(v) =>
            patch({ widgetType: v, widgetConfig: defaultWidgetConfig(v) })
          }
          disabled={disabled}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="clock">Relógio</SelectItem>
            <SelectItem value="weather">Clima</SelectItem>
            <SelectItem value="rss">RSS</SelectItem>
            <SelectItem value="news">Notícias</SelectItem>
          </SelectContent>
        </Select>
      </label>

      {widgetType === "clock" && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Formato
            </span>
            <Select
              value={(config.format as string) ?? "24h"}
              onValueChange={(v) => setCfg({ format: v })}
              disabled={disabled}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">24h</SelectItem>
                <SelectItem value="12h">12h (AM/PM)</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Fuso horário
            </span>
            <Select
              value={(config.timezone as string) ?? "America/Sao_Paulo"}
              onValueChange={(v) => setCfg({ timezone: v })}
              disabled={disabled}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </>
      )}

      {widgetType === "weather" && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Cidade
            </span>
            <Input
              value={(config.city as string) ?? ""}
              disabled={disabled}
              maxLength={120}
              onChange={(e) => setCfg({ city: e.target.value })}
              placeholder="São Paulo, BR"
              className="h-8 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Unidade
            </span>
            <Select
              value={(config.units as string) ?? "metric"}
              onValueChange={(v) => setCfg({ units: v })}
              disabled={disabled}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="metric">Celsius (°C)</SelectItem>
                <SelectItem value="imperial">Fahrenheit (°F)</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <p className="text-[10px] text-muted-foreground">
            A chave da API é gerenciada no servidor — não configurável aqui.
          </p>
        </>
      )}

      {(widgetType === "rss" || widgetType === "news") && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              URL do feed
            </span>
            <Input
              type="url"
              value={(config.feedUrl as string) ?? ""}
              disabled={disabled}
              onChange={(e) => setCfg({ feedUrl: e.target.value })}
              placeholder="https://..."
              className="h-8 text-xs"
            />
          </label>
          <NumberField
            label="Itens"
            value={(config.maxItems as number) ?? 5}
            min={1}
            max={20}
            step={1}
            disabled={disabled}
            onCommit={(v) => setCfg({ maxItems: v })}
          />
        </>
      )}
    </div>
  );
}

function defaultWidgetConfig(type: string): Record<string, unknown> {
  switch (type) {
    case "clock":
      return { format: "24h", timezone: "America/Sao_Paulo" };
    case "weather":
      return { city: "", units: "metric" };
    case "rss":
    case "news":
      return { feedUrl: "", maxItems: 5 };
    default:
      return {};
  }
}

function ShapeContent({
  c,
  patch,
  disabled,
}: {
  c: Record<string, unknown>;
  patch: (p: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Tipo
        </span>
        <Select
          value={(c.shapeType as string) ?? "rectangle"}
          onValueChange={(v) => patch({ shapeType: v })}
          disabled={disabled}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rectangle">Retângulo</SelectItem>
            <SelectItem value="circle">Círculo</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <ColorField
        label="Preenchimento"
        value={(c.fill as string) ?? "#3B82F6"}
        disabled={disabled}
        onChange={(v) => patch({ fill: v })}
      />
      <NumberField
        label="Cantos arredondados"
        value={(c.borderRadius as number) ?? 0}
        min={0}
        max={100}
        step={1}
        disabled={disabled}
        onCommit={(v) => patch({ borderRadius: v })}
      />
      <NumberField
        label="Espessura da borda"
        value={(c.borderWidth as number) ?? 0}
        min={0}
        max={50}
        step={1}
        disabled={disabled}
        onCommit={(v) => patch({ borderWidth: v })}
      />
      <ColorField
        label="Cor da borda"
        value={(c.borderColor as string) ?? "#FFFFFF"}
        disabled={disabled}
        onChange={(v) => patch({ borderColor: v })}
      />
    </div>
  );
}