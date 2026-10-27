import { needsVimeoOEmbed, resolveVimeoEmbed, toVideoEmbedUrl } from "@/lib/studio/video-embed";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Bold,
  Italic,
  ImagePlus,
  Image as ImageIcon,
  Plus,
  RotateCcw,
  Strikethrough,
  Trash2,
  Type,
  Underline,
  Upload,
  Wand2,
  Video as VideoIcon,
} from "lucide-react";

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
  TICKER_PRESETS,
  type TickerPresetId,
  LOWER_THIRDS_PRESETS,
  type LowerThirdsPresetId,
} from "./element-body";
import {
  MediaPickerDialog,
  isLowRes,
  type PickerMediaFile,
} from "./media-picker-dialog";
import { MASK_PRESETS, getAppearanceConfig } from "@/lib/studio/appearance";

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
  canvasWidth,
  canvasHeight,
  fullscreenable,
  isFullscreen,
  onToggleFullscreen,
  imageEditable,
  onEditImage,
}: {
  element: TemplateElement | null;
  disabled: boolean;
  onGeomChange: (patch: Partial<Pick<TemplateElement, NumericKey>>) => void;
  onFlagChange: (patch: Partial<Pick<TemplateElement, "locked" | "visible">>) => void;
  onContentChange: (content: Record<string, unknown>) => void;
  canvasWidth: number;
  canvasHeight: number;
  fullscreenable?: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  imageEditable?: boolean;
  onEditImage?: () => void;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      <div className="border-b border-border/60 px-3 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Propriedades
        </h3>
      </div>
      <ScrollArea className="min-h-0 min-w-0 flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block [&_[data-radix-scroll-area-viewport]>div]:!min-w-0 [&_[data-radix-scroll-area-viewport]>div]:w-full">
        {!element ? (
          <p className="p-4 text-xs text-muted-foreground">
            Selecione um elemento para editar suas propriedades.
          </p>
        ) : (
          <div className="flex min-w-0 max-w-full flex-col gap-4 overflow-x-hidden p-3 [&_*]:min-w-0 [&_input]:max-w-full [&_button]:max-w-full">
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

            {fullscreenable && onToggleFullscreen && (
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <Label className="text-xs">Ocupar tela toda</Label>
                  <span className="text-[10px] text-muted-foreground">
                    Expande o elemento para 100% do canvas.
                  </span>
                </div>
                <Switch
                  checked={!!isFullscreen}
                  onCheckedChange={() => onToggleFullscreen()}
                  disabled={disabled}
                />
              </div>
            )}

            {imageEditable && onEditImage && (
              <Button
                type="button"
                variant="outline"
                className="justify-start"
                disabled={disabled}
                onClick={() => onEditImage()}
              >
                <Wand2 className="mr-2 h-4 w-4 text-primary" />
                Editar imagem…
              </Button>
            )}

            <Separator />

            <ElementAnimationBlock
              element={element}
              disabled={disabled}
              onChange={onContentChange}
            />

            <Separator />

            <ContentBlock
              element={element}
              disabled={disabled}
              onChange={onContentChange}
              canvasWidth={canvasWidth}
              canvasHeight={canvasHeight}
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

const ENTRANCE_OPTIONS: Array<[string, string]> = [
  ["none", "Nenhuma"],
  ["fade", "Aparecer (fade)"],
  ["up", "Subir"],
  ["down", "Descer"],
  ["left", "Entrar pela direita"],
  ["right", "Entrar pela esquerda"],
  ["zoom", "Zoom"],
  ["flip", "Virar"],
  ["spin", "Girar"],
];
const LOOP_OPTIONS: Array<[string, string]> = [
  ["none", "Nenhuma"],
  ["pulse", "Pulsar"],
  ["float", "Flutuar"],
  ["shake", "Tremer"],
  ["swing", "Balançar"],
  ["spin", "Girar sem parar"],
  ["blink", "Piscar"],
  ["zoom", "Zoom contínuo"],
];

function ElementAnimationBlock({
  element,
  disabled,
  onChange,
}: {
  element: TemplateElement;
  disabled: boolean;
  onChange: (content: Record<string, unknown>) => void;
}) {
  const c = (element.content ?? {}) as Record<string, unknown>;
  const a = (c.elementAnimation ?? {}) as Record<string, unknown>;
  const entrance = typeof a.entrance === "string" ? a.entrance : "none";
  const loop = typeof a.loop === "string" ? a.loop : "none";
  const num = (v: unknown, d: number) => (typeof v === "number" ? v : d);
  const set = (p: Record<string, unknown>) =>
    onChange({ ...c, elementAnimation: { ...a, ...p } });
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Animação do componente
      </span>
      <Label className="text-xs">Entrada</Label>
      <Select value={entrance} onValueChange={(v) => set({ entrance: v })} disabled={disabled}>
        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {ENTRANCE_OPTIONS.map(([v, l]) => (
            <SelectItem key={v} value={v}>{l}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {entrance !== "none" && (
        <>
          <span className="text-[10px] text-muted-foreground">
            Duração da entrada ({num(a.entranceDuration, 0.8).toFixed(1)}s)
          </span>
          <Slider value={[Math.round(num(a.entranceDuration, 0.8) * 10)]} min={2} max={100} step={1}
            disabled={disabled} onValueChange={([v]) => set({ entranceDuration: v / 10 })} />
        </>
      )}
      <span className="text-[10px] text-muted-foreground">
        Atraso ({num(a.delay, 0).toFixed(1)}s)
      </span>
      <Slider value={[Math.round(num(a.delay, 0) * 10)]} min={0} max={300} step={1}
        disabled={disabled} onValueChange={([v]) => set({ delay: v / 10 })} />
      <Label className="mt-1 text-xs">Repetição</Label>
      <Select value={loop} onValueChange={(v) => set({ loop: v })} disabled={disabled}>
        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {LOOP_OPTIONS.map(([v, l]) => (
            <SelectItem key={v} value={v}>{l}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {loop !== "none" && (
        <>
          <span className="text-[10px] text-muted-foreground">
            Velocidade ({num(a.loopDuration, 2).toFixed(1)}s por ciclo)
          </span>
          <Slider value={[Math.round(num(a.loopDuration, 2) * 10)]} min={3} max={300} step={1}
            disabled={disabled} onValueChange={([v]) => set({ loopDuration: v / 10 })} />
        </>
      )}
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
  canvasWidth,
  canvasHeight,
}: {
  element: TemplateElement;
  disabled: boolean;
  onChange: (content: Record<string, unknown>) => void;
  canvasWidth: number;
  canvasHeight: number;
}) {
  const c = (element.content ?? {}) as Record<string, unknown>;
  const patch = (p: Record<string, unknown>) => onChange({ ...c, ...p });

  const requiredWidth = Math.round((element.width / 100) * canvasWidth);
  const requiredHeight = Math.round((element.height / 100) * canvasHeight);

  switch (element.element_type) {
    case "text":
      return <TextContent c={c} patch={patch} disabled={disabled} />;
    case "image":
    case "logo": {
      const subtype = (c.imageSubtype as string) ?? "static";
      if (subtype === "sequence" && element.element_type === "image") {
        return (
          <ImageSequenceContent c={c} patch={patch} disabled={disabled} />
        );
      }
      const acceptExtensions =
        subtype === "gif"
          ? ["gif"]
          : subtype === "apng"
            ? ["apng", "png"]
            : undefined;
      return (
        <MediaContent
          c={c}
          patch={patch}
          disabled={disabled}
          kind="image"
          allowFill={element.element_type === "image"}
          requiredWidth={requiredWidth}
          requiredHeight={requiredHeight}
          acceptExtensions={acceptExtensions}
          hint={
            subtype === "gif"
              ? "Envie um GIF animado (com transparência opcional)."
              : subtype === "apng"
                ? "Envie um APNG (PNG animado com transparência)."
                : undefined
          }
        />
      );
    }
    case "video":
      return (
        <VideoContent
          c={c}
          patch={patch}
          disabled={disabled}
          requiredWidth={requiredWidth}
          requiredHeight={requiredHeight}
        />
      );
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

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Formatação
        </span>
        <div className="grid grid-cols-5 gap-1 rounded-lg border border-border/60 p-0.5">
          {([
            {
              key: "bold",
              icon: Bold,
              active: ((c.fontWeight as string) ?? "400") === "700",
              toggle: () =>
                patch({
                  fontWeight:
                    ((c.fontWeight as string) ?? "400") === "700" ? "400" : "700",
                }),
              title: "Negrito",
            },
            {
              key: "italic",
              icon: Italic,
              active: c.italic === true,
              toggle: () => patch({ italic: !(c.italic === true) }),
              title: "Itálico",
            },
            {
              key: "underline",
              icon: Underline,
              active: c.underline === true,
              toggle: () => patch({ underline: !(c.underline === true) }),
              title: "Sublinhado",
            },
            {
              key: "strike",
              icon: Strikethrough,
              active: c.strikethrough === true,
              toggle: () =>
                patch({ strikethrough: !(c.strikethrough === true) }),
              title: "Riscado",
            },
            {
              key: "uppercase",
              icon: Type,
              active: c.uppercase === true,
              toggle: () => patch({ uppercase: !(c.uppercase === true) }),
              title: "MAIÚSCULAS",
            },
          ] as const).map((btn) => {
            const Icon = btn.icon;
            return (
              <button
                key={btn.key}
                type="button"
                disabled={disabled}
                onClick={btn.toggle}
                title={btn.title}
                className={cn(
                  "flex items-center justify-center rounded-md py-1.5 transition",
                  btn.active
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

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Espaçamento ({(c.letterSpacing as number) ?? 0})
          </span>
          <Slider
            value={[(c.letterSpacing as number) ?? 0]}
            min={-5}
            max={30}
            step={1}
            disabled={disabled}
            onValueChange={([v]) => patch({ letterSpacing: v })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Altura linha ({((c.lineHeight as number) ?? 1.2).toFixed(2)})
          </span>
          <Slider
            value={[Math.round(((c.lineHeight as number) ?? 1.2) * 100)]}
            min={80}
            max={300}
            step={5}
            disabled={disabled}
            onValueChange={([v]) => patch({ lineHeight: v / 100 })}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs">Sombra do texto</Label>
        <Switch
          checked={c.textShadow === true}
          disabled={disabled}
          onCheckedChange={(v) => patch({ textShadow: v })}
        />
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Animação do texto (fonte)
        </span>
        <Select
          value={(c.animation as string) ?? "none"}
          onValueChange={(v) => patch({ animation: v })}
          disabled={disabled}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nenhuma</SelectItem>
            <SelectItem value="fade">Fade (esmaecer)</SelectItem>
            <SelectItem value="slide-up">Deslizar para cima</SelectItem>
            <SelectItem value="slide-down">Deslizar para baixo</SelectItem>
            <SelectItem value="slide-left">Deslizar p/ esquerda</SelectItem>
            <SelectItem value="slide-right">Deslizar p/ direita</SelectItem>
            <SelectItem value="zoom">Zoom</SelectItem>
            <SelectItem value="pulse">Pulsar</SelectItem>
            <SelectItem value="blink">Piscar</SelectItem>
            <SelectItem value="bounce">Quicar</SelectItem>
            <SelectItem value="typewriter">Máquina de escrever</SelectItem>
          </SelectContent>
        </Select>
        {((c.animation as string) ?? "none") !== "none" && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Duração ({((c.animationSpeed as number) ?? 3).toFixed(1)}s)
            </span>
            <Slider
              value={[Math.round(((c.animationSpeed as number) ?? 3) * 10)]}
              min={5}
              max={200}
              step={1}
              disabled={disabled}
              onValueChange={([v]) => patch({ animationSpeed: v / 10 })}
            />
          </div>
        )}
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

function TickerConfig({
  config,
  setCfg,
  disabled,
}: {
  config: Record<string, unknown>;
  setCfg: (p: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const presetId = ((config.preset as string) ?? "classic") as TickerPresetId;
  const preset = TICKER_PRESETS[presetId] ?? TICKER_PRESETS.classic;
  const direction = ((config.direction as string) ?? "left") as "left" | "right";
  const speed = Math.max(5, Math.min(300, (config.speed as number) ?? 40));
  const size = Math.max(3, Math.min(90, (config.sizePercent as number) ?? 40));
  const uppercase =
    typeof config.uppercase === "boolean"
      ? (config.uppercase as boolean)
      : preset.uppercase ?? false;
  const showBadge =
    typeof config.showBadge === "boolean"
      ? (config.showBadge as boolean)
      : presetId === "breaking";

  return (
    <div className="flex flex-col gap-3">
      <Separator />

      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Estilo ({Object.keys(TICKER_PRESETS).length} opções)
        </span>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.values(TICKER_PRESETS)).map((p) => {
            const active = p.id === presetId;
            return (
              <button
                key={p.id}
                type="button"
                disabled={disabled}
                onClick={() =>
                  setCfg({
                    preset: p.id,
                    // reset overrides so the preset can shine
                    textColor: undefined,
                    bgColor: undefined,
                    accentColor: undefined,
                    separator: undefined,
                    uppercase: undefined,
                    showBadge: undefined,
                  })
                }
                className={cn(
                  "flex flex-col gap-1 overflow-hidden rounded-md border p-1.5 text-left transition",
                  active
                    ? "border-primary ring-2 ring-primary/40"
                    : "border-border/60 hover:border-border",
                )}
                title={p.label}
              >
                <div
                  className="flex h-8 items-center overflow-hidden rounded"
                  style={{
                    background: p.bg === "transparent" ? "#1F2937" : p.bg,
                    backgroundSize: p.id === "gradient" ? "300% 100%" : undefined,
                    color: p.color,
                    fontFamily: p.fontFamily,
                    fontWeight: p.fontWeight,
                    letterSpacing: p.letterSpacing,
                    textTransform: p.uppercase ? "uppercase" : undefined,
                    textShadow: p.textShadow,
                    border: p.border,
                    fontSize: "9px",
                    padding: "0 6px",
                  }}
                >
                  <span className="truncate">
                    {p.id === "terminal" ? "> " : ""}Últimas notícias{" "}
                    <span style={{ color: p.accent ?? p.color, opacity: 0.85 }}>
                      {p.separator ?? "•"}
                    </span>{" "}
                    Ao vivo
                  </span>
                </div>
                <span className="truncate text-[10px] text-muted-foreground">
                  {p.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Separator />

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          URL do feed RSS (opcional)
        </span>
        <Input
          type="url"
          value={(config.feedUrl as string) ?? ""}
          disabled={disabled}
          onChange={(e) => setCfg({ feedUrl: e.target.value })}
          placeholder="https://g1.globo.com/rss/g1/"
          className="h-8 text-xs"
        />
        <span className="text-[10px] text-muted-foreground">
          Aceita RSS, API JSON ou GitHub: link do repositório (commits), de
          /releases, /tags ou de um arquivo .json/.xml do repositório.
        </span>
      </label>
      <JsonFeedFields config={config} disabled={disabled} setCfg={setCfg} />

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Texto personalizado (usado se não houver feed)
        </span>
        <Textarea
          value={(config.customText as string) ?? ""}
          disabled={disabled}
          onChange={(e) => setCfg({ customText: e.target.value })}
          rows={2}
          placeholder="Promoção 20% off | Novo horário | Grátis para membros"
          className="text-xs"
        />
        <span className="text-[10px] text-muted-foreground">
          Separe as mensagens com <code>|</code> (barra vertical).
        </span>
      </label>

      <NumberField
        label="Itens do feed"
        value={(config.maxItems as number) ?? 8}
        min={1}
        max={20}
        step={1}
        disabled={disabled}
        onCommit={(v) => setCfg({ maxItems: v })}
      />

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Direção
        </span>
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-border/60 p-0.5">
          {(
            [
              { v: "left", label: "→ Esquerda" },
              { v: "right", label: "Direita ←" },
            ] as const
          ).map(({ v, label }) => (
            <button
              key={v}
              type="button"
              disabled={disabled}
              onClick={() => setCfg({ direction: v })}
              className={cn(
                "rounded-md py-1.5 text-xs transition",
                direction === v
                  ? "bg-primary/20 text-primary"
                  : "hover:bg-muted/60 text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Velocidade ({speed}s por ciclo)
        </span>
        <Slider
          value={[speed]}
          min={10}
          max={180}
          step={5}
          disabled={disabled}
          onValueChange={([v]) => setCfg({ speed: v })}
        />
        <span className="text-[10px] text-muted-foreground">
          Menor = mais rápido.
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Tamanho da fonte ({size}%)
        </span>
        <Slider
          value={[size]}
          min={10}
          max={90}
          step={1}
          disabled={disabled}
          onValueChange={([v]) => setCfg({ sizePercent: v })}
        />
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Separador
        </span>
        <Input
          value={(config.separator as string) ?? preset.separator ?? "  •  "}
          disabled={disabled}
          maxLength={12}
          onChange={(e) => setCfg({ separator: e.target.value })}
          className="h-8 text-xs font-mono"
        />
      </label>

      <div className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 px-2 py-1.5">
        <span className="text-[11px] font-medium">Texto em MAIÚSCULAS</span>
        <Switch
          checked={uppercase}
          disabled={disabled}
          onCheckedChange={(v) => setCfg({ uppercase: v })}
        />
      </div>

      <div className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 px-2 py-1.5">
        <span className="text-[11px] font-medium">Mostrar badge lateral</span>
        <Switch
          checked={showBadge}
          disabled={disabled}
          onCheckedChange={(v) => setCfg({ showBadge: v })}
        />
      </div>
      {showBadge && (
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Texto do badge
          </span>
          <Input
            value={(config.badgeText as string) ?? preset.badgeText ?? "BREAKING"}
            disabled={disabled}
            maxLength={24}
            onChange={(e) => setCfg({ badgeText: e.target.value })}
            className="h-8 text-xs"
          />
        </label>
      )}

      <Separator />

      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Personalização de cores (sobrescreve o estilo)
      </span>
      <ColorField
        label="Cor do texto"
        value={(config.textColor as string) ?? preset.color}
        disabled={disabled}
        onChange={(v) => setCfg({ textColor: v })}
      />
      <ColorField
        label="Cor de fundo"
        value={
          (config.bgColor as string) ??
          (preset.bg.startsWith("#") ? preset.bg : "#0F172A")
        }
        disabled={disabled}
        onChange={(v) => setCfg({ bgColor: v })}
      />
      <ColorField
        label="Cor de destaque (separador / badge)"
        value={(config.accentColor as string) ?? preset.accent ?? "#3B82F6"}
        disabled={disabled}
        onChange={(v) => setCfg({ accentColor: v })}
      />
    </div>
  );
}

function LowerThirdsConfig({
  config,
  setCfg,
  disabled,
}: {
  config: Record<string, unknown>;
  setCfg: (p: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const presetId = ((config.preset as string) ?? "broadcast") as LowerThirdsPresetId;
  const preset = LOWER_THIRDS_PRESETS[presetId] ?? LOWER_THIRDS_PRESETS.broadcast;
  const align = ((config.align as string) ?? "left") as "left" | "right";
  const anim = ((config.animation as string) ?? "slide") as
    | "none"
    | "slide"
    | "fade"
    | "reveal";
  const showKicker =
    typeof config.showKicker === "boolean"
      ? (config.showKicker as boolean)
      : !!preset.kickerText;
  const showSubtitle =
    typeof config.showSubtitle === "boolean"
      ? (config.showSubtitle as boolean)
      : true;
  const titleSize = Math.max(6, Math.min(60, (config.titleSize as number) ?? 26));
  const subtitleSize = Math.max(4, Math.min(40, (config.subtitleSize as number) ?? 14));
  const titleUppercase =
    typeof config.titleUppercase === "boolean"
      ? (config.titleUppercase as boolean)
      : preset.titleUppercase ?? false;
  const subtitleUppercase =
    typeof config.subtitleUppercase === "boolean"
      ? (config.subtitleUppercase as boolean)
      : preset.subtitleUppercase ?? false;
  const showAccentBar =
    typeof config.showAccentBar === "boolean"
      ? (config.showAccentBar as boolean)
      : preset.showAccentBar ?? false;

  return (
    <div className="flex flex-col gap-3">
      <Separator />

      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Estilo ({Object.keys(LOWER_THIRDS_PRESETS).length} opções)
        </span>
        <div className="grid grid-cols-2 gap-1.5">
          {Object.values(LOWER_THIRDS_PRESETS).map((p) => {
            const active = p.id === presetId;
            return (
              <button
                key={p.id}
                type="button"
                disabled={disabled}
                onClick={() =>
                  setCfg({
                    preset: p.id,
                    titleColor: undefined,
                    subtitleColor: undefined,
                    bgColor: undefined,
                    accentColor: undefined,
                    kickerText: undefined,
                    showKicker: undefined,
                    titleUppercase: undefined,
                    subtitleUppercase: undefined,
                    showAccentBar: undefined,
                  })
                }
                className={cn(
                  "flex flex-col gap-1 overflow-hidden rounded-md border p-1.5 text-left transition",
                  active
                    ? "border-primary ring-2 ring-primary/40"
                    : "border-border/60 hover:border-border",
                )}
                title={p.label}
              >
                <div
                  className="flex h-10 items-center gap-1 overflow-hidden rounded px-1.5"
                  style={{
                    background: p.bg === "transparent" ? "#1F2937" : p.bg,
                    border: p.border,
                    borderRadius: p.borderRadius,
                    fontFamily: p.fontFamily,
                  }}
                >
                  {p.showAccentBar && (
                    <span
                      style={{
                        background: p.accent,
                        width: p.accentBarWidth ?? "3px",
                        height: "70%",
                        borderRadius: "2px",
                      }}
                    />
                  )}
                  <div className="flex min-w-0 flex-col leading-tight">
                    {p.kickerText && (
                      <span
                        style={{
                          background: p.kickerBg ?? p.accent,
                          color: p.kickerColor ?? "#FFFFFF",
                          fontSize: "6px",
                          padding: "1px 3px",
                          borderRadius: "2px",
                          alignSelf: "flex-start",
                          fontWeight: 800,
                          letterSpacing: "0.08em",
                        }}
                      >
                        {p.kickerText}
                      </span>
                    )}
                    <span
                      className="truncate"
                      style={{
                        color: p.titleColor,
                        fontSize: "9px",
                        fontWeight: p.titleWeight as number,
                        textTransform: p.titleUppercase ? "uppercase" : undefined,
                        letterSpacing: p.letterSpacing,
                        textShadow: p.textShadow,
                      }}
                    >
                      Título do bloco
                    </span>
                    <span
                      className="truncate"
                      style={{
                        color: p.subtitleColor,
                        fontSize: "7px",
                        fontWeight: p.subtitleWeight as number,
                        textTransform: p.subtitleUppercase ? "uppercase" : undefined,
                        letterSpacing: p.letterSpacing,
                      }}
                    >
                      Legenda ou fonte
                    </span>
                  </div>
                </div>
                <span className="truncate text-[10px] text-muted-foreground">
                  {p.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Separator />

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Título
        </span>
        <Input
          value={(config.title as string) ?? ""}
          disabled={disabled}
          maxLength={200}
          onChange={(e) => setCfg({ title: e.target.value })}
          placeholder="Título da matéria"
          className="h-8 text-xs"
        />
      </label>

      <Separator />

      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Feed RSS (opcional — sobrescreve título/legenda)
      </span>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          URL do feed
        </span>
        <Input
          value={(config.feedUrl as string) ?? ""}
          disabled={disabled}
          maxLength={500}
          onChange={(e) => setCfg({ feedUrl: e.target.value })}
          placeholder="https://exemplo.com/rss.xml"
          className="h-8 text-xs"
        />
      </label>
      <JsonFeedFields config={config} disabled={disabled} setCfg={setCfg} />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Itens (máx.)
          </span>
          <Input
            type="number"
            min={1}
            max={20}
            value={(config.maxItems as number) ?? 6}
            disabled={disabled}
            onChange={(e) =>
              setCfg({ maxItems: Math.max(1, Math.min(20, Number(e.target.value) || 6)) })
            }
            className="h-8 text-xs"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Rotação (s)
          </span>
          <Input
            type="number"
            min={3}
            max={120}
            value={(config.rotationSeconds as number) ?? 8}
            disabled={disabled}
            onChange={(e) =>
              setCfg({
                rotationSeconds: Math.max(3, Math.min(120, Number(e.target.value) || 8)),
              })
            }
            className="h-8 text-xs"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Animação (RSS)
          </span>
          <Select
            value={((config.rssAnimation as string) ?? "fade")}
            onValueChange={(v) => setCfg({ rssAnimation: v })}
            disabled={disabled}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fade">Fade</SelectItem>
              <SelectItem value="slide">Deslizar</SelectItem>
              <SelectItem value="reveal">Revelar</SelectItem>
              <SelectItem value="zoom">Zoom</SelectItem>
              <SelectItem value="flip">Flip</SelectItem>
              <SelectItem value="same">Igual à entrada</SelectItem>
              <SelectItem value="none">Nenhuma</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Duração (ms)
          </span>
          <Input
            type="number"
            min={150}
            max={3000}
            step={50}
            value={(config.rssAnimationDuration as number) ?? 600}
            disabled={disabled}
            onChange={(e) =>
              setCfg({
                rssAnimationDuration: Math.max(
                  150,
                  Math.min(3000, Number(e.target.value) || 600),
                ),
              })
            }
            className="h-8 text-xs"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Origem do título (com RSS)
        </span>
        <Select
          value={((config.titleSource as string) ?? "feed")}
          onValueChange={(v) => setCfg({ titleSource: v })}
          disabled={disabled}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="feed">Do feed RSS</SelectItem>
            <SelectItem value="custom">Texto personalizado</SelectItem>
            <SelectItem value="prefix">Prefixo + feed</SelectItem>
          </SelectContent>
        </Select>
      </label>
      {((config.titleSource as string) ?? "feed") === "prefix" && (
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Prefixo do título
          </span>
          <Input
            value={(config.titlePrefix as string) ?? ""}
            disabled={disabled}
            maxLength={40}
            placeholder="Ex.: ÚLTIMAS |"
            onChange={(e) => setCfg({ titlePrefix: e.target.value })}
            className="h-8 text-xs"
          />
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Origem da legenda (com RSS)
        </span>
        <Select
          value={((config.subtitleSource as string) ?? "auto")}
          onValueChange={(v) => setCfg({ subtitleSource: v })}
          disabled={disabled}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Data de publicação</SelectItem>
            <SelectItem value="custom">Texto personalizado</SelectItem>
            <SelectItem value="none">Ocultar durante RSS</SelectItem>
          </SelectContent>
        </Select>
      </label>

      <div className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 px-2 py-1.5">
        <span className="text-[11px] font-medium">Mostrar legenda</span>
        <Switch
          checked={showSubtitle}
          disabled={disabled}
          onCheckedChange={(v) => setCfg({ showSubtitle: v })}
        />
      </div>

      {showSubtitle && (
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Legenda
          </span>
          <Input
            value={(config.subtitle as string) ?? ""}
            disabled={disabled}
            maxLength={200}
            onChange={(e) => setCfg({ subtitle: e.target.value })}
            placeholder="Legenda ou fonte"
            className="h-8 text-xs"
          />
        </label>
      )}

      <div className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 px-2 py-1.5">
        <span className="text-[11px] font-medium">Mostrar badge (kicker)</span>
        <Switch
          checked={showKicker}
          disabled={disabled}
          onCheckedChange={(v) => setCfg({ showKicker: v })}
        />
      </div>
      {showKicker && (
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Texto do badge
          </span>
          <Input
            value={(config.kickerText as string) ?? preset.kickerText ?? "AO VIVO"}
            disabled={disabled}
            maxLength={24}
            onChange={(e) => setCfg({ kickerText: e.target.value })}
            className="h-8 text-xs"
          />
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Alinhamento
        </span>
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-border/60 p-0.5">
          {(
            [
              { v: "left", label: "Esquerda" },
              { v: "right", label: "Direita" },
            ] as const
          ).map(({ v, label }) => (
            <button
              key={v}
              type="button"
              disabled={disabled}
              onClick={() => setCfg({ align: v })}
              className={cn(
                "rounded-md py-1.5 text-xs transition",
                align === v
                  ? "bg-primary/20 text-primary"
                  : "hover:bg-muted/60 text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Animação de entrada
        </span>
        <Select
          value={anim}
          onValueChange={(v) => setCfg({ animation: v })}
          disabled={disabled}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="slide">Deslizar</SelectItem>
            <SelectItem value="fade">Fade</SelectItem>
            <SelectItem value="reveal">Revelar</SelectItem>
            <SelectItem value="none">Nenhuma</SelectItem>
          </SelectContent>
        </Select>
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Tamanho do título ({titleSize}%)
        </span>
        <Slider
          value={[titleSize]}
          min={6}
          max={60}
          step={1}
          disabled={disabled}
          onValueChange={([v]) => setCfg({ titleSize: v })}
        />
      </div>

      {showSubtitle && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Tamanho da legenda ({subtitleSize}%)
          </span>
          <Slider
            value={[subtitleSize]}
            min={4}
            max={40}
            step={1}
            disabled={disabled}
            onValueChange={([v]) => setCfg({ subtitleSize: v })}
          />
        </div>
      )}

      <div className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 px-2 py-1.5">
        <span className="text-[11px] font-medium">Título em MAIÚSCULAS</span>
        <Switch
          checked={titleUppercase}
          disabled={disabled}
          onCheckedChange={(v) => setCfg({ titleUppercase: v })}
        />
      </div>
      {showSubtitle && (
        <div className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 px-2 py-1.5">
          <span className="text-[11px] font-medium">Legenda em MAIÚSCULAS</span>
          <Switch
            checked={subtitleUppercase}
            disabled={disabled}
            onCheckedChange={(v) => setCfg({ subtitleUppercase: v })}
          />
        </div>
      )}
      <div className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 px-2 py-1.5">
        <span className="text-[11px] font-medium">Barra de destaque lateral</span>
        <Switch
          checked={showAccentBar}
          disabled={disabled}
          onCheckedChange={(v) => setCfg({ showAccentBar: v })}
        />
      </div>

      <Separator />

      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Personalização de cores (sobrescreve o estilo)
      </span>
      <ColorField
        label="Cor do título"
        value={(config.titleColor as string) ?? preset.titleColor}
        disabled={disabled}
        onChange={(v) => setCfg({ titleColor: v })}
      />
      {showSubtitle && (
        <ColorField
          label="Cor da legenda"
          value={(config.subtitleColor as string) ?? preset.subtitleColor}
          disabled={disabled}
          onChange={(v) => setCfg({ subtitleColor: v })}
        />
      )}
      <ColorField
        label="Cor de fundo"
        value={
          (config.bgColor as string) ??
          (preset.bg.startsWith("#") ? preset.bg : "#0F172A")
        }
        disabled={disabled}
        onChange={(v) => setCfg({ bgColor: v })}
      />
      <ColorField
        label="Cor de destaque"
        value={(config.accentColor as string) ?? preset.accent}
        disabled={disabled}
        onChange={(v) => setCfg({ accentColor: v })}
      />
    </div>
  );
}

function MediaContent({
  c,
  patch,
  disabled,
  kind,
  allowFill,
  requiredWidth,
  requiredHeight,
  acceptExtensions,
  hint,
}: {
  c: Record<string, unknown>;
  patch: (p: Record<string, unknown>) => void;
  disabled: boolean;
  kind: "image" | "video";
  allowFill: boolean;
  requiredWidth?: number;
  requiredHeight?: number;
  acceptExtensions?: string[];
  hint?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const mediaName = (c.mediaFileName as string) ?? null;
  const mediaFileId = (c.mediaFileId as string) ?? null;
  const fitOptions = allowFill
    ? ["contain", "cover", "fill"]
    : ["contain", "cover"];

  const dimsQ = useQuery({
    queryKey: ["studio_media_dims", mediaFileId],
    enabled: !!mediaFileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_files")
        .select("width, height")
        .eq("id", mediaFileId!)
        .single();
      if (error) throw error;
      return data as { width: number | null; height: number | null };
    },
  });

  const lowRes = useMemo(() => {
    if (!requiredWidth || !requiredHeight || !dimsQ.data) return false;
    return isLowRes(dimsQ.data, requiredWidth, requiredHeight);
  }, [dimsQ.data, requiredWidth, requiredHeight]);

  return (
    <div className="flex flex-col gap-3">
      {hint && (
        <p className="rounded-lg border border-border/60 bg-muted/40 p-2 text-[11px] text-muted-foreground">
          {hint}
        </p>
      )}
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
        {lowRes && requiredWidth && requiredHeight && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
            <span>
              Esta {kind === "image" ? "imagem" : "mídia"} pode ficar borrada
              nesta área — resolução recomendada:{" "}
              <strong>
                {requiredWidth}×{requiredHeight}
              </strong>{" "}
              ou maior.
              {dimsQ.data?.width && dimsQ.data?.height && (
                <>
                  {" "}
                  Atual: {dimsQ.data.width}×{dimsQ.data.height}.
                </>
              )}
            </span>
          </div>
        )}
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
        requiredWidth={requiredWidth}
        requiredHeight={requiredHeight}
        acceptExtensions={acceptExtensions}
        onPick={(f: PickerMediaFile) =>
          patch({
            mediaFileId: f.id,
            mediaFileName: f.name,
            mediaStoragePath: f.storage_path,
            mediaThumbnailPath: f.thumbnail_path,
          })
        }
      />

      <AppearanceFields c={c} patch={patch} disabled={disabled} />
    </div>
  );
}

// ---------- Image Sequence (frame-by-frame) ----------

type SequenceFrame = {
  id: string;
  storagePath: string;
  mediaFileId?: string | null;
  name?: string | null;
};

function ImageSequenceContent({
  c,
  patch,
  disabled,
}: {
  c: Record<string, unknown>;
  patch: (p: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const rawFrames = Array.isArray(c.frames) ? (c.frames as unknown[]) : [];
  const frames: SequenceFrame[] = rawFrames
    .map((f) => f as Partial<SequenceFrame>)
    .filter((f): f is SequenceFrame => !!f && typeof f.storagePath === "string")
    .map((f) => ({
      id: f.id ?? Math.random().toString(36).slice(2),
      storagePath: f.storagePath,
      mediaFileId: f.mediaFileId ?? null,
      name: f.name ?? null,
    }));
  const fps = typeof c.fps === "number" ? (c.fps as number) : 12;
  const loop = (c.loop as boolean | undefined) ?? true;
  const fit = (c.fit as string) ?? "contain";

  const setFrames = (next: SequenceFrame[]) => patch({ frames: next });

  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-lg border border-border/60 bg-muted/40 p-2 text-[11px] text-muted-foreground">
        Adicione múltiplos quadros (PNG/JPG/WEBP) que serão reproduzidos em ordem
        na taxa de FPS definida.
      </p>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Quadros ({frames.length})
        </span>
        <div className="flex flex-col gap-1.5">
          {frames.map((f, i) => (
            <div
              key={f.id}
              className="flex items-center gap-2 rounded-md border border-border/60 bg-card/40 px-2 py-1 text-xs"
            >
              <span className="w-6 shrink-0 text-center font-mono text-[10px] text-muted-foreground">
                {i + 1}
              </span>
              <span className="flex-1 truncate">{f.name ?? "quadro"}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled || i === 0}
                className="h-6 w-6"
                onClick={() => {
                  const next = frames.slice();
                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  setFrames(next);
                }}
                title="Mover para cima"
              >
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled || i === frames.length - 1}
                className="h-6 w-6"
                onClick={() => {
                  const next = frames.slice();
                  [next[i + 1], next[i]] = [next[i], next[i + 1]];
                  setFrames(next);
                }}
                title="Mover para baixo"
              >
                <ArrowDown className="h-3 w-3" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled}
                className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={() => setFrames(frames.filter((_, j) => j !== i))}
                title="Remover"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => setPickerOpen(true)}
          className="mt-1 justify-start"
        >
          <Plus className="mr-2 h-3.5 w-3.5" />
          Adicionar quadro
        </Button>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          FPS ({fps})
        </span>
        <Slider
          value={[fps]}
          min={1}
          max={60}
          step={1}
          disabled={disabled}
          onValueChange={(v) => patch({ fps: v[0] })}
        />
      </label>

      <label className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-card/40 px-2 py-1.5 text-xs">
        <span>Repetir em loop</span>
        <Switch
          checked={loop}
          disabled={disabled}
          onCheckedChange={(v) => patch({ loop: v })}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Ajuste
        </span>
        <Select
          value={fit}
          onValueChange={(v) => patch({ fit: v })}
          disabled={disabled}
        >
          <SelectTrigger className="h-8 text-xs capitalize">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["contain", "cover", "fill"].map((f) => (
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
        filter="image"
        onPick={(f: PickerMediaFile) => {
          setFrames([
            ...frames,
            {
              id: Math.random().toString(36).slice(2),
              storagePath: f.storage_path,
              mediaFileId: f.id,
              name: f.name,
            },
          ]);
        }}
      />

      <AppearanceFields c={c} patch={patch} disabled={disabled} />
    </div>
  );
}

function VideoContent({
  c,
  patch,
  disabled,
  requiredWidth,
  requiredHeight,
}: {
  c: Record<string, unknown>;
  patch: (p: Record<string, unknown>) => void;
  disabled: boolean;
  requiredWidth?: number;
  requiredHeight?: number;
}) {
  return (
    <div className="flex flex-col gap-3">
      <MediaContent
        c={c}
        patch={patch}
        disabled={disabled}
        kind="video"
        allowFill
        requiredWidth={requiredWidth}
        requiredHeight={requiredHeight}
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

function AppearanceFields({
  c,
  patch,
  disabled,
}: {
  c: Record<string, unknown>;
  patch: (p: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const {
    borderRadiusPercent,
    mask,
    maskUrl,
    borderWidthPercent,
    borderColor,
    borderStyle,
  } = getAppearanceConfig(c);
  const isCustom = mask === "custom";
  const trimmedMaskUrl = maskUrl.trim();
  const isDataUrl = /^data:image\//i.test(trimmedMaskUrl);
  const invalidCustom =
    isCustom &&
    trimmedMaskUrl.length > 0 &&
    !/^(https?:|data:image\/)/i.test(trimmedMaskUrl);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleMaskFile = async (file: File) => {
    // Aceita imagens (svg, png, webp, jpg). Limite de 512KB para manter o
    // JSON do template leve — a máscara é armazenada inline como data URL.
    const okTypes = /^image\/(svg\+xml|png|webp|jpeg|gif)$/i;
    if (!okTypes.test(file.type)) {
      toast.error("Use uma imagem SVG, PNG, WebP, JPG ou GIF.");
      return;
    }
    if (file.size > 512 * 1024) {
      toast.error("Máscara muito grande (limite: 512 KB). Use um SVG otimizado.");
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
        reader.readAsDataURL(file);
      });
      patch({ maskUrl: dataUrl });
      toast.success("Máscara personalizada carregada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao carregar máscara.");
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card/40 p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Aparência
        </span>
        {(borderRadiusPercent > 0 ||
          mask !== "none" ||
          borderWidthPercent > 0) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            className="h-6 px-2 text-[10px]"
            onClick={() =>
              patch({
                borderRadiusPercent: 0,
                mask: "none",
                maskUrl: "",
                borderWidthPercent: 0,
              })
            }
          >
            <RotateCcw className="mr-1 h-3 w-3" /> Redefinir
          </Button>
        )}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Arredondar cantos ({borderRadiusPercent}%)
        </span>
        <Slider
          value={[borderRadiusPercent]}
          min={0}
          max={50}
          step={1}
          disabled={disabled}
          onValueChange={(v) => patch({ borderRadiusPercent: v[0] })}
        />
      </label>

      <div className="flex flex-col gap-2 rounded-md border border-border/40 bg-background/30 p-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Borda — espessura ({borderWidthPercent.toFixed(1)}%)
          </span>
          <Slider
            value={[borderWidthPercent]}
            min={0}
            max={10}
            step={0.1}
            disabled={disabled}
            onValueChange={(v) => patch({ borderWidthPercent: v[0] })}
          />
        </label>
        {borderWidthPercent > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <ColorField
              label="Cor"
              value={borderColor}
              disabled={disabled}
              onChange={(v) => patch({ borderColor: v })}
            />
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Estilo
              </span>
              <Select
                value={borderStyle}
                onValueChange={(v) => patch({ borderStyle: v })}
                disabled={disabled}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="solid" className="text-xs">Sólida</SelectItem>
                  <SelectItem value="dashed" className="text-xs">Tracejada</SelectItem>
                  <SelectItem value="dotted" className="text-xs">Pontilhada</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
        )}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Máscara
        </span>
        <Select
          value={mask}
          onValueChange={(v) => patch({ mask: v })}
          disabled={disabled}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MASK_PRESETS.map((p) => (
              <SelectItem key={p.id} value={p.id} className="text-xs">
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      {isCustom && (
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Máscara personalizada (fundo transparente, área branca = visível)
          </span>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/svg+xml,image/png,image/webp,image/jpeg,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleMaskFile(f);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              className="h-8 flex-1 text-xs"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-1.5 h-3 w-3" />
              {isDataUrl ? "Trocar arquivo" : "Enviar arquivo"}
            </Button>
            {trimmedMaskUrl.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                className="h-8 px-2 text-xs"
                onClick={() => patch({ maskUrl: "" })}
              >
                Limpar
              </Button>
            )}
          </div>
          {isDataUrl && (
            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 p-2">
              <div
                className="h-10 w-10 rounded border border-border/60 bg-foreground/80"
                style={{
                  maskImage: `url("${trimmedMaskUrl}")`,
                  WebkitMaskImage: `url("${trimmedMaskUrl}")`,
                  maskSize: "100% 100%",
                  WebkitMaskSize: "100% 100%",
                  maskRepeat: "no-repeat",
                  WebkitMaskRepeat: "no-repeat",
                }}
              />
              <span className="text-[10px] text-muted-foreground">
                Arquivo carregado (incorporado no template).
              </span>
            </div>
          )}
          <span className="text-[10px] text-muted-foreground">
            ou cole uma URL pública (https://…)
          </span>
          <Input
            type="url"
            inputMode="url"
            placeholder="https://exemplo.com/mascara.svg"
            value={isDataUrl ? "" : maskUrl}
            disabled={disabled || isDataUrl}
            onChange={(e) => patch({ maskUrl: e.target.value })}
            className={cn(
              "h-8 text-xs",
              invalidCustom && "border-destructive focus-visible:ring-destructive",
            )}
          />
          {invalidCustom && (
            <span className="text-[10px] text-destructive">
              Use uma URL absoluta iniciando com https:// ou envie um arquivo.
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">
            Dica: SVG com áreas brancas define a região visível. Limite 512 KB.
          </span>
        </div>
      )}
    </div>
  );
}

function WeatherBackgroundControls({
  config,
  setCfg,
  disabled,
}: {
  config: Record<string, unknown>;
  setCfg: (p: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const bgPath = (config.backgroundImagePath as string | undefined) ?? "";
  const bgOpacity =
    typeof config.backgroundImageOpacity === "number"
      ? Math.max(0, Math.min(1, config.backgroundImageOpacity as number))
      : 1;
  const bgFit = ((config.backgroundImageFit as string) ?? "cover") as
    | "cover"
    | "contain"
    | "fill";
  const bgBlur =
    typeof config.backgroundImageBlur === "number"
      ? Math.max(0, Math.min(40, config.backgroundImageBlur as number))
      : 0;
  const bgAnim = ((config.backgroundImageAnimation as string) ?? "none") as string;
  const bgAnimDuration =
    typeof config.backgroundImageAnimationDuration === "number"
      ? Math.max(5, Math.min(120, config.backgroundImageAnimationDuration as number))
      : 30;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border/50 bg-muted/20 p-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Fundo personalizado
        </span>
        {bgPath && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] text-destructive hover:text-destructive"
            disabled={disabled}
            onClick={() =>
              setCfg({ backgroundImagePath: undefined })
            }
          >
            Remover
          </Button>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setPickerOpen(true)}
        className="justify-start"
      >
        <ImageIcon className="mr-2 h-3.5 w-3.5" />
        {bgPath ? "Trocar imagem" : "Escolher imagem"}
      </Button>
      {bgPath && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Opacidade ({Math.round(bgOpacity * 100)}%)
            </span>
            <Slider
              value={[Math.round(bgOpacity * 100)]}
              min={0}
              max={100}
              step={1}
              disabled={disabled}
              onValueChange={([v]) =>
                setCfg({ backgroundImageOpacity: v / 100 })
              }
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Ajuste
            </span>
            <Select
              value={bgFit}
              onValueChange={(v) => setCfg({ backgroundImageFit: v })}
              disabled={disabled}
            >
              <SelectTrigger className="h-8 text-xs capitalize">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cover">Preencher (cover)</SelectItem>
                <SelectItem value="contain">Caber (contain)</SelectItem>
                <SelectItem value="fill">Esticar (fill)</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Desfoque ({bgBlur}px)
            </span>
            <Slider
              value={[bgBlur]}
              min={0}
              max={40}
              step={1}
              disabled={disabled}
              onValueChange={([v]) => setCfg({ backgroundImageBlur: v })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Animação
            </span>
            <Select
              value={bgAnim}
              onValueChange={(v) => setCfg({ backgroundImageAnimation: v })}
              disabled={disabled}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma</SelectItem>
                <SelectItem value="ken-burns">Ken Burns (suave)</SelectItem>
                <SelectItem value="zoom-in">Zoom in</SelectItem>
                <SelectItem value="zoom-out">Zoom out</SelectItem>
                <SelectItem value="pan-left">Deslizar ← esquerda</SelectItem>
                <SelectItem value="pan-right">Deslizar → direita</SelectItem>
                <SelectItem value="pan-up">Deslizar ↑ cima</SelectItem>
                <SelectItem value="pan-down">Deslizar ↓ baixo</SelectItem>
              </SelectContent>
            </Select>
          </label>
          {bgAnim !== "none" && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Duração ({bgAnimDuration}s)
              </span>
              <Slider
                value={[bgAnimDuration]}
                min={5}
                max={120}
                step={1}
                disabled={disabled}
                onValueChange={([v]) =>
                  setCfg({ backgroundImageAnimationDuration: v })
                }
              />
              <span className="text-[10px] text-muted-foreground">
                Movimentos lentos ficam mais elegantes e consomem menos CPU.
              </span>
            </label>
          )}
        </>
      )}
      <MediaPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        filter="image"
        onPick={(f: PickerMediaFile) => {
          setCfg({
            backgroundImagePath: f.storage_path,
            backgroundImageOpacity:
              typeof config.backgroundImageOpacity === "number"
                ? config.backgroundImageOpacity
                : 1,
            backgroundImageFit:
              (config.backgroundImageFit as string) ?? "cover",
          });
          setPickerOpen(false);
        }}
      />
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
  const source = ((c.source as string) ?? "library") as "library" | "inline";
  if (source === "inline") {
    return <InlineGroupContent c={c} patch={patch} disabled={disabled} />;
  }
  return <LibraryPlaylistContent c={c} patch={patch} disabled={disabled} />;
}

function LibraryPlaylistContent({
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
    <div className="flex flex-col gap-3">
      <SourceToggle c={c} patch={patch} disabled={disabled} current="library" />
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
    </div>
  );
}

function SourceToggle({
  c,
  patch,
  disabled,
  current,
}: {
  c: Record<string, unknown>;
  patch: (p: Record<string, unknown>) => void;
  disabled: boolean;
  current: "library" | "inline";
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Origem
      </span>
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-border/60 p-0.5">
        {(
          [
            { v: "library", label: "Playlist" },
            { v: "inline", label: "Grupo" },
          ] as const
        ).map(({ v, label }) => (
          <button
            key={v}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (v === current) return;
              if (v === "inline") {
                patch({
                  source: "inline",
                  items: (c.items as unknown[]) ?? [],
                  loop: (c.loop as boolean) ?? true,
                  transition: (c.transition as string) ?? "fade",
                  defaultDuration: (c.defaultDuration as number) ?? 8,
                  fit: (c.fit as string) ?? "cover",
                });
              } else {
                patch({ source: "library" });
              }
            }}
            className={cn(
              "rounded-md py-1.5 text-xs transition",
              current === v
                ? "bg-primary/20 text-primary"
                : "hover:bg-muted/60 text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

type InlineGroupItem = {
  id: string;
  type: "image" | "video";
  storagePath: string;
  mediaFileId?: string | null;
  name?: string | null;
  duration?: number | null;
};

function InlineGroupContent({
  c,
  patch,
  disabled,
}: {
  c: Record<string, unknown>;
  patch: (p: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const items: InlineGroupItem[] = Array.isArray(c.items)
    ? ((c.items as unknown[]).filter(
        (i) =>
          !!i &&
          typeof (i as InlineGroupItem).storagePath === "string" &&
          ((i as InlineGroupItem).type === "image" ||
            (i as InlineGroupItem).type === "video"),
      ) as InlineGroupItem[])
    : [];
  const loop = (c.loop as boolean | undefined) ?? true;
  const transition = ((c.transition as string) ?? "fade") as "none" | "fade";
  const defaultDuration = Math.max(
    1,
    Math.min(600, (c.defaultDuration as number) ?? 8),
  );
  const fit = (c.fit as string) ?? "cover";

  const [pickerKind, setPickerKind] = useState<"image" | "video" | null>(null);

  const setItems = (next: InlineGroupItem[]) => patch({ items: next });

  const addItem = (kind: "image" | "video") => setPickerKind(kind);

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...items];
    const to = idx + dir;
    if (to < 0 || to >= next.length) return;
    [next[idx], next[to]] = [next[to], next[idx]];
    setItems(next);
  };
  const remove = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const setDuration = (idx: number, v: number) => {
    const next = items.map((it, i) => (i === idx ? { ...it, duration: v } : it));
    setItems(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <SourceToggle c={c} patch={patch} disabled={disabled} current="inline" />

      <div className="flex items-center justify-between">
        <Label className="text-xs">Loop</Label>
        <Switch
          checked={loop}
          disabled={disabled}
          onCheckedChange={(v) => patch({ loop: v })}
        />
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Transição
        </span>
        <Select
          value={transition}
          onValueChange={(v) => patch({ transition: v })}
          disabled={disabled}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fade">Fade (cross-fade)</SelectItem>
            <SelectItem value="none">Sem transição</SelectItem>
          </SelectContent>
        </Select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Ajuste padrão
        </span>
        <Select
          value={fit}
          onValueChange={(v) => patch({ fit: v })}
          disabled={disabled}
        >
          <SelectTrigger className="h-8 text-xs capitalize">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["cover", "contain", "fill"].map((f) => (
              <SelectItem key={f} value={f} className="capitalize">
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Duração padrão da imagem ({defaultDuration}s)
        </span>
        <Slider
          value={[defaultDuration]}
          min={1}
          max={60}
          step={1}
          disabled={disabled}
          onValueChange={([v]) => patch({ defaultDuration: v })}
        />
        <span className="text-[10px] text-muted-foreground">
          Vídeos usam a duração natural. O loop volta para o primeiro item.
        </span>
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Itens ({items.length})
        </span>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-[11px]"
            disabled={disabled}
            onClick={() => addItem("image")}
          >
            <Plus className="h-3 w-3" />
            <ImagePlus className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-[11px]"
            disabled={disabled}
            onClick={() => addItem("video")}
          >
            <Plus className="h-3 w-3" />
            <VideoIcon className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 p-3 text-center text-[11px] text-muted-foreground">
          Nenhuma mídia no grupo. Use os botões acima para adicionar imagens ou
          vídeos.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((it, idx) => (
            <li
              key={it.id}
              className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-muted/20 p-2"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-muted-foreground">
                  {idx + 1}
                </span>
                {it.type === "video" ? (
                  <VideoIcon className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ImagePlus className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate text-xs">
                  {it.name ?? "(sem nome)"}
                </span>
                <button
                  type="button"
                  disabled={disabled || idx === 0}
                  onClick={() => move(idx, -1)}
                  className="rounded p-1 opacity-60 hover:opacity-100 disabled:opacity-20"
                  title="Mover para cima"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  disabled={disabled || idx === items.length - 1}
                  onClick={() => move(idx, 1)}
                  className="rounded p-1 opacity-60 hover:opacity-100 disabled:opacity-20"
                  title="Mover para baixo"
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => remove(idx)}
                  className="rounded p-1 text-destructive/70 opacity-70 hover:opacity-100"
                  title="Remover"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              {it.type === "image" && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground">
                    Duração ({it.duration ?? defaultDuration}s)
                  </span>
                  <Slider
                    value={[it.duration ?? defaultDuration]}
                    min={1}
                    max={60}
                    step={1}
                    disabled={disabled}
                    onValueChange={([v]) => setDuration(idx, v)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {pickerKind && (
        <MediaPickerDialog
          open={!!pickerKind}
          onOpenChange={(v) => {
            if (!v) setPickerKind(null);
          }}
          filter={pickerKind}
          onPick={(f) => {
            const uid =
              (crypto as { randomUUID?: () => string }).randomUUID?.() ??
              Math.random().toString(36).slice(2);
            const item: InlineGroupItem = {
              id: uid,
              type: pickerKind,
              storagePath: f.storage_path,
              mediaFileId: f.id,
              name: f.name,
              duration: pickerKind === "image" ? defaultDuration : null,
            };
            setItems([...items, item]);
            setPickerKind(null);
          }}
        />
      )}
    </div>
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
  const widgetType = ((c.widgetType ?? c.widget_type) as string | undefined) ?? "clock";
  const rawConfig = c.widgetConfig ?? c.widget_config;
  const config = rawConfig && typeof rawConfig === "object" && !Array.isArray(rawConfig)
    ? (rawConfig as Record<string, unknown>)
    : {};
  const setCfg = (p: Record<string, unknown>) =>
    patch({
      widgetConfig: { ...config, ...p },
      widget_config: { ...config, ...p },
    });
  const clampSize = (v: number) => Math.max(3, Math.min(90, Math.round(v)));
  const defaultSize = widgetType === "clock" || widgetType === "weather" ? 28 : 14;
  const currentSize = clampSize((config.sizePercent as number) ?? defaultSize);
  const defaultBgOpacity =
    widgetType === "clock" ? 0 : widgetType === "weather" ? 0.3 : 0.4;
  const bgColor = (config.bgColor as string) ?? "#000000";
  const bgOpacity =
    typeof config.bgOpacity === "number"
      ? Math.max(0, Math.min(1, config.bgOpacity as number))
      : defaultBgOpacity;
  const resetSize = () => {
    setCfg({ sizePercent: defaultSize });
    // Also clear custom label so the layer name reverts to the widget default
    patch({ name: "" });
  };
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Tipo
        </span>
        <Select
          value={widgetType}
          onValueChange={(v) =>
            patch({
              widgetType: v,
              widget_type: v,
              widgetConfig: defaultWidgetConfig(v),
              widget_config: defaultWidgetConfig(v),
            })
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
            <SelectItem value="ticker">News Ticker</SelectItem>
            <SelectItem value="lowerthirds">Lower Thirds</SelectItem>
            <SelectItem value="iframe">Iframe (HTML externo)</SelectItem>
          </SelectContent>
        </Select>
      </label>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Tamanho da fonte ({currentSize}%)
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[10px]"
            disabled={disabled}
            onClick={resetSize}
            title="Restaurar tamanho e rótulo padrão"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </Button>
        </div>
        <Slider
          value={[currentSize]}
          min={3}
          max={90}
          step={1}
          disabled={disabled}
          onValueChange={([v]) => setCfg({ sizePercent: clampSize(v) })}
        />
        <span className="text-[10px] text-muted-foreground">
          Percentual da altura do widget usado como tamanho da fonte.
        </span>
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <ColorField
          label="Cor de fundo"
          value={bgColor}
          disabled={disabled}
          onChange={(v) => setCfg({ bgColor: v })}
        />
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Opacidade do fundo ({Math.round(bgOpacity * 100)}%)
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-[10px]"
              disabled={disabled}
              onClick={() => setCfg({ bgOpacity: 0 })}
              title="Deixar 100% transparente"
            >
              Transparente
            </Button>
          </div>
          <Slider
            value={[Math.round(bgOpacity * 100)]}
            min={0}
            max={100}
            step={1}
            disabled={disabled}
            onValueChange={([v]) => setCfg({ bgOpacity: v / 100 })}
          />
          <span className="text-[10px] text-muted-foreground">
            0% = fundo totalmente transparente. 100% = totalmente opaco.
          </span>
        </div>
      </div>

      {widgetType === "clock" && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Tipo de relógio
            </span>
            <Select
              value={((config.clockKind as string) ?? "digital")}
              onValueChange={(v) => setCfg({ clockKind: v })}
              disabled={disabled}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="digital">Digital</SelectItem>
                <SelectItem value="analog">Analógico</SelectItem>
              </SelectContent>
            </Select>
          </label>
          {((config.clockKind as string) ?? "digital") === "digital" ? (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Estilo digital
              </span>
              <Select
                value={((config.digitalStyle as string) ?? "modern")}
                onValueChange={(v) => setCfg({ digitalStyle: v })}
                disabled={disabled}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="modern">Moderno</SelectItem>
                  <SelectItem value="minimal">Minimalista</SelectItem>
                  <SelectItem value="mono">Monoespaçado</SelectItem>
                  <SelectItem value="led">LED</SelectItem>
                  <SelectItem value="neon">Neon</SelectItem>
                  <SelectItem value="outline">Contorno</SelectItem>
                  <SelectItem value="flip">Flip (placares)</SelectItem>
                </SelectContent>
              </Select>
            </label>
          ) : (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Estilo analógico
              </span>
              <Select
                value={((config.analogStyle as string) ?? "classic")}
                onValueChange={(v) => setCfg({ analogStyle: v })}
                disabled={disabled}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="classic">Clássico (números)</SelectItem>
                  <SelectItem value="modern">Moderno (só marcadores)</SelectItem>
                  <SelectItem value="minimal">Minimalista</SelectItem>
                  <SelectItem value="roman">Romanos</SelectItem>
                  <SelectItem value="swiss">Swiss Railway</SelectItem>
                  <SelectItem value="railway">Estação</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="neon">Neon</SelectItem>
                </SelectContent>
              </Select>
            </label>
          )}
          <div className="flex items-center justify-between">
            <Label className="text-xs">Mostrar segundos</Label>
            <Switch
              checked={(config.showSeconds as boolean | undefined) ?? true}
              disabled={disabled}
              onCheckedChange={(v) => setCfg({ showSeconds: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Mostrar data</Label>
            <Switch
              checked={(config.showDate as boolean | undefined) ?? false}
              disabled={disabled}
              onCheckedChange={(v) => setCfg({ showDate: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Mostrar dia da semana</Label>
            <Switch
              checked={(config.showWeekday as boolean | undefined) ?? false}
              disabled={disabled}
              onCheckedChange={(v) => setCfg({ showWeekday: v })}
            />
          </div>
          {(config.showDate as boolean | undefined) && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Formato da data
              </span>
              <Select
                value={(config.dateFormat as string) ?? "dd/MM/yyyy"}
                onValueChange={(v) => setCfg({ dateFormat: v })}
                disabled={disabled}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dd/MM/yyyy">31/12/2026</SelectItem>
                  <SelectItem value="dd/MM">31/12</SelectItem>
                  <SelectItem value="long">31 de dezembro de 2026</SelectItem>
                  <SelectItem value="yyyy-MM-dd">2026-12-31</SelectItem>
                </SelectContent>
              </Select>
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Layout
            </span>
            <Select
              value={(config.layout as string) ?? "stack"}
              onValueChange={(v) => setCfg({ layout: v })}
              disabled={disabled}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stack">Empilhado (hora + data)</SelectItem>
                <SelectItem value="inline">Em linha (lado a lado)</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <ColorField
            label="Cor do texto"
            value={(config.color as string) ?? "#FFFFFF"}
            disabled={disabled}
            onChange={(v) => setCfg({ color: v })}
          />
          <ColorField
            label="Cor da data / dia da semana"
            value={(config.dateColor as string) ?? ((config.color as string) ?? "#FFFFFF")}
            disabled={disabled}
            onChange={(v) => setCfg({ dateColor: v })}
          />
          <ColorField
            label="Cor de destaque (ponteiro dos segundos / efeitos)"
            value={(config.accentColor as string) ?? ((config.color as string) ?? "#FFFFFF")}
            disabled={disabled}
            onChange={(v) => setCfg({ accentColor: v })}
          />
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Formato
            </span>
            <Select
              value={(config.format as string) ?? "24h"}
              onValueChange={(v) => setCfg({ format: v })}
              disabled={disabled || ((config.clockKind as string) ?? "digital") === "analog"}
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
          <WeatherCitiesEditor
            config={config}
            setCfg={setCfg}
            disabled={disabled}
          />
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Layout
            </span>
            <Select
              value={(config.preset as string) ?? "complete"}
              onValueChange={(v) => setCfg({ preset: v })}
              disabled={disabled}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minimal">Minimal — ícone + temperatura</SelectItem>
                <SelectItem value="complete">Completo — cidade, sensação, umidade e vento</SelectItem>
                <SelectItem value="forecast">Previsão — hoje + próximos dias</SelectItem>
                <SelectItem value="vertical">Vertical — para totens/portrait</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Tema
            </span>
            <Select
              value={(config.theme as string) ?? "gradient"}
              onValueChange={(v) => setCfg({ theme: v })}
              disabled={disabled}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gradient">Cartão colorido (automático)</SelectItem>
                <SelectItem value="dark">Escuro</SelectItem>
                <SelectItem value="light">Claro</SelectItem>
                <SelectItem value="glass">Vidro (transparente)</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Cor de destaque
            </span>
            <Input
              type="color"
              value={(config.accentColor as string) ?? "#FDE68A"}
              disabled={disabled}
              onChange={(e) => setCfg({ accentColor: e.target.value })}
              className="h-8 w-14 cursor-pointer p-1"
            />
          </label>
          <div className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 px-2 py-1.5">
            <span className="text-[11px] font-medium">Ícones animados</span>
            <Switch
              checked={(config.showAnimatedIcons as boolean | undefined) ?? true}
              disabled={disabled}
              onCheckedChange={(v) => setCfg({ showAnimatedIcons: v })}
            />
          </div>
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
            Dados via Open-Meteo (gratuito, sem chave de API). Atualiza a cada 15 min.
          </p>
          <WeatherTextColors config={config} setCfg={setCfg} disabled={disabled} />
          <WeatherBackgroundControls
            config={config}
            setCfg={setCfg}
            disabled={disabled}
          />
        </>
      )}

      {(widgetType === "rss" || widgetType === "news") && (
        <>
          <div className="grid grid-cols-2 gap-1 rounded-md border border-border/50 bg-muted/30 p-1">
            {(["feed", "manual"] as const).map((src) => {
              const active = (config.source === "manual" ? "manual" : "feed") === src;
              return (
                <button
                  key={src}
                  type="button"
                  disabled={disabled}
                  onClick={() => setCfg({ source: src })}
                  className={cn(
                    "rounded px-2 py-1 text-[11px] font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {src === "feed" ? "Feed (link)" : "Minhas notícias"}
                </button>
              );
            })}
          </div>
          {config.source === "manual" ? (
            <ManualNewsEditor config={config} setCfg={setCfg} disabled={disabled} />
          ) : (
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
          <JsonFeedFields config={config} disabled={disabled} setCfg={setCfg} />
            </>
          )}
          <NumberField
            label="Itens"
            value={(config.maxItems as number) ?? 5}
            min={1}
            max={20}
            step={1}
            disabled={disabled}
            onCommit={(v) => setCfg({ maxItems: v })}
          />
          <div className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 px-2 py-1.5">
            <span className="text-[11px] font-medium">Mostrar imagem</span>
            <Switch
              checked={(config.showImage as boolean | undefined) ?? false}
              disabled={disabled}
              onCheckedChange={(v) => {
                // Não permitir desligar as duas ao mesmo tempo
                const showText =
                  (config.showText as boolean | undefined) ?? true;
                if (!v && !showText) {
                  setCfg({ showImage: false, showText: true });
                } else {
                  setCfg({ showImage: v });
                }
              }}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 px-2 py-1.5">
            <span className="text-[11px] font-medium">Mostrar texto</span>
            <Switch
              checked={(config.showText as boolean | undefined) ?? true}
              disabled={disabled}
              onCheckedChange={(v) => {
                const showImage =
                  (config.showImage as boolean | undefined) ?? false;
                if (!v && !showImage) {
                  setCfg({ showText: false, showImage: true });
                } else {
                  setCfg({ showText: v });
                }
              }}
            />
          </div>
          {((config.showImage as boolean | undefined) ?? false) && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Posição da imagem
              </span>
              <Select
                value={(config.imagePosition as string) ?? "left"}
                onValueChange={(v) => setCfg({ imagePosition: v })}
                disabled={disabled}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Esquerda</SelectItem>
                  <SelectItem value="right">Direita</SelectItem>
                  <SelectItem value="top">Topo</SelectItem>
                  <SelectItem value="background">Fundo (cobrir)</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-[10px] text-muted-foreground">
                Imagem vem direto do site da notícia (sem armazenamento).
                Se o site bloquear, mostramos só o texto.
              </span>
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Animação
            </span>
            <Select
              value={(config.motion as string) ?? "fade"}
              onValueChange={(v) => setCfg({ motion: v })}
              disabled={disabled}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fade">Fade (cross-fade)</SelectItem>
                <SelectItem value="marquee-left">
                  Horizontal — direita → esquerda
                </SelectItem>
                <SelectItem value="marquee-right">
                  Horizontal — esquerda → direita
                </SelectItem>
                <SelectItem value="vertical-up">
                  Vertical — baixo → cima
                </SelectItem>
                <SelectItem value="vertical-down">
                  Vertical — cima → baixo
                </SelectItem>
                <SelectItem value="none">Estático (sem animação)</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Velocidade ({(config.speed as number) ?? 40}s por ciclo)
            </span>
            <Slider
              value={[(config.speed as number) ?? 40]}
              min={10}
              max={180}
              step={5}
              disabled={disabled}
              onValueChange={([v]) => setCfg({ speed: v })}
            />
            <span className="text-[10px] text-muted-foreground">
              Menor = mais rápido. Aplica-se a marquee e scroll vertical.
            </span>
          </div>
          <div className="flex flex-col gap-2 rounded-md border border-border/50 bg-muted/30 p-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Texto
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-[11px]">
                Tamanho da fonte ({(config.sizePercent as number) ?? 14}%)
              </span>
              <Slider
                value={[(config.sizePercent as number) ?? 14]}
                min={3}
                max={60}
                step={1}
                disabled={disabled}
                onValueChange={([v]) => setCfg({ sizePercent: v })}
              />
            </div>
            <label className="flex items-center justify-between gap-2">
              <span className="text-[11px]">Cor do texto</span>
              <input
                type="color"
                value={(config.textColor as string) || "#FFFFFF"}
                disabled={disabled}
                onChange={(e) => setCfg({ textColor: e.target.value })}
                className="h-7 w-10 cursor-pointer rounded border border-border bg-transparent"
              />
            </label>
            <NumberField
              label="Máximo de linhas"
              value={(config.maxLines as number) ?? 3}
              min={1}
              max={8}
              step={1}
              disabled={disabled}
              onCommit={(v) => setCfg({ maxLines: v })}
            />
            <label className="flex flex-col gap-1">
              <span className="text-[11px]">Peso</span>
              <Select
                value={String((config.fontWeight as number) ?? 600)}
                onValueChange={(v) => setCfg({ fontWeight: Number(v) })}
                disabled={disabled}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="400">Normal</SelectItem>
                  <SelectItem value="500">Médio</SelectItem>
                  <SelectItem value="600">Semi-negrito</SelectItem>
                  <SelectItem value="700">Negrito</SelectItem>
                  <SelectItem value="800">Extra-negrito</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px]">Alinhamento</span>
              <Select
                value={(config.textAlign as string) ?? "left"}
                onValueChange={(v) => setCfg({ textAlign: v })}
                disabled={disabled}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Esquerda</SelectItem>
                  <SelectItem value="center">Centro</SelectItem>
                  <SelectItem value="right">Direita</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <div className="flex items-center justify-between">
              <span className="text-[11px]">Ajustar automaticamente (sem cortes)</span>
              <Switch
                checked={(config.autoFit as boolean | undefined) ?? true}
                disabled={disabled}
                onCheckedChange={(v) => setCfg({ autoFit: v })}
              />
            </div>
          </div>
        </>
      )}

      {widgetType === "ticker" && (
        <TickerConfig config={config} setCfg={setCfg} disabled={disabled} />
      )}

      {widgetType === "lowerthirds" && (
        <LowerThirdsConfig config={config} setCfg={setCfg} disabled={disabled} />
      )}

      {widgetType === "iframe" && (
        <IframeConfig config={config} setCfg={setCfg} disabled={disabled} />
      )}

      <AppearanceFields c={c} patch={patch} disabled={disabled} />
    </div>
  );
}

const WEATHER_TEXT_FIELDS: { key: string; label: string; presets: string[] }[] = [
  { key: "city", label: "Cidade", presets: ["complete", "forecast", "vertical"] },
  { key: "temp", label: "Temperatura", presets: ["minimal", "complete", "forecast", "vertical"] },
  { key: "unit", label: "Unidade (°C)", presets: ["minimal", "complete", "forecast", "vertical"] },
  { key: "description", label: "Condição / previsão", presets: ["minimal", "complete", "forecast", "vertical"] },
  { key: "labels", label: "Rótulos (Sensação, Umidade…)", presets: ["complete", "forecast"] },
  { key: "feelsLike", label: "Sensação térmica", presets: ["complete", "forecast"] },
  { key: "humidity", label: "Umidade", presets: ["complete", "forecast"] },
  { key: "wind", label: "Vento", presets: ["complete", "forecast"] },
  { key: "minMax", label: "Máx./Mín. de hoje", presets: ["forecast"] },
  { key: "forecastTitle", label: "Título “Próximos dias”", presets: ["forecast"] },
  { key: "dayName", label: "Próximos dias — dia", presets: ["forecast", "vertical"] },
  { key: "dayDate", label: "Próximos dias — data", presets: ["forecast"] },
  { key: "dayCondition", label: "Próximos dias — condição", presets: ["forecast"] },
  { key: "dayMax", label: "Próximos dias — máxima", presets: ["forecast", "vertical"] },
  { key: "dayMin", label: "Próximos dias — mínima", presets: ["forecast", "vertical"] },
  { key: "dayRain", label: "Próximos dias — chuva", presets: ["forecast"] },
];

function WeatherTextColors({
  config,
  setCfg,
  disabled,
}: {
  config: Record<string, unknown>;
  setCfg: (patch: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const preset = (config.preset as string) ?? "complete";
  const raw = config.textColors;
  const colors: Record<string, string> =
    raw && typeof raw === "object" ? { ...(raw as Record<string, string>) } : {};
  const fields = WEATHER_TEXT_FIELDS.filter((f) => f.presets.includes(preset));
  const setOne = (key: string, value: string | null) => {
    const next = { ...colors };
    if (value) next[key] = value;
    else delete next[key];
    setCfg({ textColors: next });
  };
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border/50 bg-muted/30 p-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Cores dos textos
        </span>
        {Object.keys(colors).length > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setCfg({ textColors: {} })}
            className="text-[10px] text-primary hover:underline disabled:opacity-50"
          >
            Restaurar todas
          </button>
        )}
      </div>
      {fields.map((f) => {
        const value = colors[f.key];
        return (
          <div key={f.key} className="flex min-w-0 items-center justify-between gap-2">
            <span className="min-w-0 truncate text-[11px]">{f.label}</span>
            <div className="flex shrink-0 items-center gap-1">
              {value && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setOne(f.key, null)}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                  title="Voltar à cor do tema"
                >
                  Tema
                </button>
              )}
              <input
                type="color"
                aria-label={`Cor de ${f.label}`}
                value={value ?? "#FFFFFF"}
                disabled={disabled}
                onChange={(e) => setOne(f.key, e.target.value)}
                className={`h-7 w-10 cursor-pointer rounded border bg-transparent ${value ? "border-primary" : "border-border opacity-60"}`}
              />
            </div>
          </div>
        );
      })}
      <span className="text-[10px] text-muted-foreground">
        Campos sem cor escolhida seguem a cor do tema.
      </span>
    </div>
  );
}

function defaultWidgetConfig(type: string): Record<string, unknown> {
  switch (type) {
    case "clock":
      return { format: "24h", timezone: "America/Sao_Paulo" };
    case "weather":
      return {
        city: "",
        units: "metric",
        preset: "complete",
        theme: "gradient",
        showAnimatedIcons: true,
      };
    case "rss":
    case "news":
      return { feedUrl: "", maxItems: 5 };
    case "ticker":
      return {
        preset: "classic",
        feedUrl: "",
        customText: "",
        maxItems: 8,
        direction: "left",
        speed: 40,
        sizePercent: 40,
      };
    case "lowerthirds":
      return {
        preset: "broadcast",
        title: "Título da matéria",
        subtitle: "Legenda ou fonte",
        showKicker: true,
        kickerText: "AO VIVO",
        showSubtitle: true,
        align: "left",
        animation: "slide",
        titleSize: 26,
        subtitleSize: 14,
      };
    case "iframe":
      return {
        url: "",
        zoomPercent: 100,
        refreshSeconds: 0,
        allowScripts: true,
        allowSameOrigin: false,
      };
    default:
      return {};
  }
}

function IframeConfig({
  config,
  setCfg,
  disabled,
}: {
  config: Record<string, unknown>;
  setCfg: (p: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const url = (config.url as string) ?? "";
  const zoom =
    typeof config.zoomPercent === "number"
      ? Math.max(25, Math.min(400, config.zoomPercent))
      : 100;
  const refresh =
    typeof config.refreshSeconds === "number"
      ? Math.max(0, Math.min(3600, Math.round(config.refreshSeconds)))
      : 0;
  const allowScripts = config.allowScripts !== false;
  const allowSameOrigin = config.allowSameOrigin === true;
  const isValid = /^https:\/\//i.test(url);
  // Elementos salvos com link de página (ex.: vimeo.com/123) são recusados
  // pelo serviço dentro do player — grava a URL de incorporação no lugar.
  useEffect(() => {
    if (disabled || !url) return;
    const embed = toVideoEmbedUrl(url);
    if (embed && embed !== url) {
      setCfg({ url: embed, allowScripts: true, allowSameOrigin: true });
      return;
    }
    if (!needsVimeoOEmbed(url)) return;
    let cancelled = false;
    void resolveVimeoEmbed(url).then((resolved) => {
      if (cancelled) return;
      if (resolved) {
        setCfg({ url: resolved, allowScripts: true, allowSameOrigin: true });
      } else {
        toast.error(
          "O Vimeo não liberou este vídeo. Verifique se ele é público e se permite incorporação em outros sites.",
        );
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, disabled]);
  const savedUrls = Array.isArray(config.urls)
    ? (config.urls as unknown[]).filter((u): u is string => typeof u === "string" && u.length > 0)
    : [];
  const rotation =
    typeof config.rotationSeconds === "number"
      ? Math.max(5, Math.min(600, Math.round(config.rotationSeconds)))
      : 30;
  const [text, setText] = useState<string>(() =>
    savedUrls.length > 1 ? savedUrls.join(", ") : url,
  );
  const normalizeOne = (s: string): string => {
    const t = s.trim();
    if (/<iframe/i.test(t)) {
      const m = t.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
      if (m?.[1]) return toVideoEmbedUrl(m[1].trim()) ?? m[1].trim();
    }
    return toVideoEmbedUrl(t) ?? t;
  };
  const handleUrlInput = (raw: string) => {
    setText(raw);
    const trimmed = raw.trim();
    // Vários links separados por vírgula (ou quebra de linha) — cada um
    // vira URL de incorporação e o quadro alterna entre eles.
    const parts = /<iframe/i.test(trimmed)
      ? [trimmed]
      : trimmed.split(/[,\n]+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      const list = parts.map(normalizeOne);
      setCfg({ url: list[0], urls: list, allowScripts: true, allowSameOrigin: true });
      return;
    }
    const single = parts[0] ?? "";
    if (/<iframe/i.test(single)) {
      const match = single.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
      if (match?.[1]) {
        const src = match[1].trim();
        const embed = toVideoEmbedUrl(src);
        setCfg(embed ? { url: embed, urls: [], allowScripts: true, allowSameOrigin: true } : { url: src, urls: [] });
        return;
      }
    }
    // Links de vídeo (YouTube, Vimeo, Drive...) viram URL de incorporação.
    const embed = toVideoEmbedUrl(single);
    if (embed) {
      setCfg({ url: embed, urls: [], allowScripts: true, allowSameOrigin: true });
      return;
    }
    setCfg({ url: single, urls: [] });
  };
  const invalidCount = savedUrls.filter((u) => !/^https:\/\//i.test(u)).length;
  return (
    <div className="flex flex-col gap-3">
      <Separator />
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          URL ou código de incorporação
        </span>
        <Textarea
          placeholder={'https://youtu.be/abc, https://vimeo.com/123\nou cole aqui o <iframe src="..."></iframe>'}
          value={text}
          disabled={disabled}
          onChange={(e) => handleUrlInput(e.target.value)}
          className="min-h-16 text-xs"
          rows={3}
        />
        {savedUrls.length > 1 ? (
          <span className={invalidCount > 0 ? "text-[10px] text-destructive" : "text-[10px] text-muted-foreground"}>
            {savedUrls.length} links — o quadro alterna entre eles.
            {invalidCount > 0 ? ` ${invalidCount} link(s) sem https:// serão pulados.` : ""}
          </span>
        ) : (
          !isValid && url.length > 0 && (
            <span className="text-[10px] text-destructive">
              Não foi possível extrair uma URL https:// válida.
            </span>
          )
        )}
        <span className="text-[10px] text-muted-foreground">
          Cole um ou vários links separados por vírgula (YouTube, Vimeo, Google Drive, Dailymotion, Loom, Streamable — tocam sozinhos, sem som), uma URL direta ou o código completo do iframe. Sites que
          bloqueiam via X-Frame-Options não serão exibidos.
        </span>
      </label>

      {savedUrls.length > 1 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Trocar de link a cada ({rotation}s)
          </span>
          <Slider
            value={[rotation]}
            min={5}
            max={600}
            step={5}
            disabled={disabled}
            onValueChange={([v]) => setCfg({ rotationSeconds: v })}
          />
        </div>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Zoom ({zoom}%)
        </span>
        <Slider
          value={[zoom]}
          min={25}
          max={400}
          step={5}
          disabled={disabled}
          onValueChange={([v]) => setCfg({ zoomPercent: v })}
        />
        <span className="text-[10px] text-muted-foreground">
          Ajuste o zoom para encaixar o conteúdo externo no tamanho do elemento.
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Recarregar a cada ({refresh === 0 ? "desligado" : `${refresh}s`})
        </span>
        <Slider
          value={[refresh]}
          min={0}
          max={3600}
          step={30}
          disabled={disabled}
          onValueChange={([v]) => setCfg({ refreshSeconds: v })}
        />
        <span className="text-[10px] text-muted-foreground">
          0 = nunca recarrega. Útil para dashboards e widgets de clima.
        </span>
      </div>

      <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-3 py-2">
        <div className="flex flex-col">
          <span className="text-xs font-medium">Permitir scripts</span>
          <span className="text-[10px] text-muted-foreground">
            Necessário para a maioria dos widgets externos.
          </span>
        </div>
        <Switch
          checked={allowScripts}
          disabled={disabled}
          onCheckedChange={(v) => setCfg({ allowScripts: v })}
        />
      </div>

      <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-3 py-2">
        <div className="flex flex-col">
          <span className="text-xs font-medium">Permitir same-origin</span>
          <span className="text-[10px] text-muted-foreground">
            Deixe desligado a menos que o provedor exija.
          </span>
        </div>
        <Switch
          checked={allowSameOrigin}
          disabled={disabled}
          onCheckedChange={(v) => setCfg({ allowSameOrigin: v })}
        />
      </div>
    </div>
  );
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
  const fillOpacity =
    typeof c.fillOpacity === "number"
      ? Math.max(0, Math.min(1, c.fillOpacity as number))
      : 1;
  const motion = ((c.motion as string) ?? "none") as string;
  const speed = Math.max(1, Math.min(60, (c.motionSpeed as number) ?? 6));
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
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Opacidade do preenchimento ({Math.round(fillOpacity * 100)}%)
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[10px]"
            disabled={disabled}
            onClick={() => patch({ fillOpacity: 0 })}
            title="Deixar 100% transparente"
          >
            Transparente
          </Button>
        </div>
        <Slider
          value={[Math.round(fillOpacity * 100)]}
          min={0}
          max={100}
          step={1}
          disabled={disabled}
          onValueChange={([v]) => patch({ fillOpacity: v / 100 })}
        />
        <span className="text-[10px] text-muted-foreground">
          0% = totalmente transparente. 100% = opaco.
        </span>
      </div>
      {((c.shapeType as string) ?? "rectangle") !== "circle" && (
        <>
          <NumberField
            label="Cantos arredondados (todos)"
            value={(c.borderRadius as number) ?? 0}
            min={0}
            max={500}
            step={1}
            disabled={disabled}
            onCommit={(v) =>
              patch({
                borderRadius: v,
                radiusTopLeft: undefined,
                radiusTopRight: undefined,
                radiusBottomRight: undefined,
                radiusBottomLeft: undefined,
              })
            }
          />
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["radiusTopLeft", "Sup. esquerdo"],
                ["radiusTopRight", "Sup. direito"],
                ["radiusBottomLeft", "Inf. esquerdo"],
                ["radiusBottomRight", "Inf. direito"],
              ] as const
            ).map(([key, label]) => (
              <NumberField
                key={key}
                label={label}
                value={
                  typeof c[key] === "number"
                    ? (c[key] as number)
                    : ((c.borderRadius as number) ?? 0)
                }
                min={0}
                max={500}
                step={1}
                disabled={disabled}
                onCommit={(v) => patch({ [key]: v })}
              />
            ))}
          </div>
        </>
      )}
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

      <Separator />

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Movimento
        </span>
        <Select
          value={motion}
          onValueChange={(v) => patch({ motion: v })}
          disabled={disabled}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem movimento</SelectItem>
            <SelectItem value="pulse">Pulsar</SelectItem>
            <SelectItem value="float">Flutuar</SelectItem>
            <SelectItem value="spin">Girar</SelectItem>
            <SelectItem value="fade">Piscar (fade)</SelectItem>
          </SelectContent>
        </Select>
      </label>
      {motion !== "none" && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Velocidade ({speed}s por ciclo)
          </span>
          <Slider
            value={[speed]}
            min={1}
            max={30}
            step={1}
            disabled={disabled}
            onValueChange={([v]) => patch({ motionSpeed: v })}
          />
          <span className="text-[10px] text-muted-foreground">
            Menor = mais rápido.
          </span>
        </div>
      )}
    </div>
  );
}
function WeatherCitiesEditor({
  config,
  setCfg,
  disabled,
}: {
  config: Record<string, unknown>;
  setCfg: (p: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const rawList = Array.isArray(config.cities)
    ? (config.cities as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  const legacy =
    typeof config.city === "string" && config.city.trim().length > 0 && rawList.length === 0
      ? [config.city as string]
      : [];
  const cities: string[] = rawList.length > 0 ? rawList : legacy;
  const rotationSeconds = Math.max(
    3,
    Math.min(300, (config.rotationSeconds as number | undefined) ?? 15),
  );

  const commit = (next: string[]) => {
    setCfg({ cities: next, city: next[0] ?? "" });
  };
  const update = (i: number, v: string) => {
    const next = cities.slice();
    next[i] = v;
    commit(next);
  };
  const remove = (i: number) => commit(cities.filter((_, j) => j !== i));
  const add = () => commit([...cities, ""]);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= cities.length) return;
    const next = cities.slice();
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border/50 bg-muted/20 p-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Cidades ({cities.length})
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[10px]"
          disabled={disabled}
          onClick={add}
        >
          <Plus className="mr-1 h-3 w-3" /> Adicionar
        </Button>
      </div>
      {cities.length === 0 && (
        <p className="text-[10px] text-muted-foreground">
          Adicione uma ou mais cidades. Quando houver mais de uma, o widget alterna
          entre elas automaticamente.
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        {cities.map((c, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="w-5 shrink-0 text-center font-mono text-[10px] text-muted-foreground">
              {i + 1}
            </span>
            <Input
              value={c}
              disabled={disabled}
              maxLength={120}
              onChange={(e) => update(i, e.target.value)}
              placeholder="Ex.: São Paulo, BR"
              className="h-7 flex-1 text-xs"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={disabled || i === 0}
              onClick={() => move(i, -1)}
              title="Mover para cima"
            >
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={disabled || i === cities.length - 1}
              onClick={() => move(i, 1)}
              title="Mover para baixo"
            >
              <ArrowDown className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive hover:text-destructive"
              disabled={disabled}
              onClick={() => remove(i)}
              title="Remover"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
      {cities.length > 1 && (
        <label className="flex flex-col gap-1 pt-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Trocar de cidade a cada ({rotationSeconds}s)
          </span>
          <Slider
            value={[rotationSeconds]}
            min={3}
            max={120}
            step={1}
            disabled={disabled}
            onValueChange={([v]) => setCfg({ rotationSeconds: v })}
          />
        </label>
      )}
    </div>
  );
}

/* ---------- Feed por API JSON (opcional) ---------- */

function JsonFeedFields({
  config,
  disabled,
  setCfg,
}: {
  config: Record<string, unknown>;
  disabled?: boolean;
  setCfg: (patch: Record<string, unknown>) => void;
}) {
  const field = (key: string, label: string, placeholder: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <Input
        value={(config[key] as string) ?? ""}
        disabled={disabled}
        maxLength={300}
        onChange={(e) => setCfg({ [key]: e.target.value })}
        placeholder={placeholder}
        className="h-8 text-xs"
      />
    </label>
  );
  return (
    <details className="rounded-lg border border-border/60 bg-muted/20 p-2">
      <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground">
        API JSON (opcional)
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        <p className="text-[10px] leading-snug text-muted-foreground">
          O endereço acima também aceita APIs que devolvem JSON (ex.: resultados de
          loterias). Sem preencher nada, os campos são detectados sozinhos. Use os
          campos abaixo para escolher o que mostrar; use {"{campo}"} para montar o texto.
        </p>
        {field("jsonItemsPath", "Caminho da lista", "ex.: data.items (vazio = automático)")}
        {field(
          "jsonTitleTemplate",
          "Texto de cada item",
          "ex.: Concurso {numero}: {listaDezenas}",
        )}
        {field("jsonImageField", "Campo da imagem", "ex.: image.url")}
        {field("jsonDateField", "Campo da data", "ex.: dataApuracao")}
      </div>
    </details>
  );
}


// ---------- Notícias próprias (widget Notícias, fonte manual) ----------

type ManualNewsItem = {
  id: string;
  title: string;
  imagePath?: string | null;
  active?: boolean;
};

function ManualNewsThumb({ path }: { path: string }) {
  const { data } = useQuery({
    queryKey: ["signed-url", "media", path, 3600],
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data: d, error } = await supabase.storage
        .from("media")
        .createSignedUrl(path, 3600);
      if (error) throw error;
      return d?.signedUrl ?? null;
    },
  });
  if (!data) return <div className="h-full w-full animate-pulse bg-muted" />;
  return <img src={data} alt="" className="h-full w-full object-cover" />;
}

function ManualNewsEditor({
  config,
  setCfg,
  disabled,
}: {
  config: Record<string, unknown>;
  setCfg: (p: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const items: ManualNewsItem[] = Array.isArray(config.manualItems)
    ? (config.manualItems as ManualNewsItem[])
    : [];
  const [pickFor, setPickFor] = useState<string | null>(null);
  const save = (next: ManualNewsItem[]) => setCfg({ manualItems: next });
  const update = (id: string, p: Partial<ManualNewsItem>) =>
    save(items.map((it) => (it.id === id ? { ...it, ...p } : it)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };
  const add = () => {
    if (items.length >= 30) {
      toast.error("Limite de 30 notícias por widget.");
      return;
    }
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    save([{ id, title: "", imagePath: null, active: true }, ...items]);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Notícias ({items.length})
        </span>
        <Button size="sm" variant="secondary" className="h-7 gap-1 text-[11px]" disabled={disabled} onClick={add}>
          <Plus className="h-3.5 w-3.5" /> Nova notícia
        </Button>
      </div>
      {items.length === 0 && (
        <p className="rounded-md border border-dashed border-border/60 p-3 text-center text-[11px] text-muted-foreground">
          Escreva suas notícias e avisos. Elas aparecem com os mesmos efeitos do feed:
          rolagem, troca de títulos e fotos.
        </p>
      )}
      {items.map((it, i) => (
        <div
          key={it.id}
          className={cn(
            "flex flex-col gap-1.5 rounded-lg border border-border/50 bg-muted/20 p-2",
            it.active === false && "opacity-60",
          )}
        >
          <Textarea
            value={it.title}
            disabled={disabled}
            maxLength={500}
            rows={2}
            placeholder="Título da notícia"
            onChange={(e) => update(it.id, { title: e.target.value })}
            className="min-h-[52px] text-xs"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={disabled}
              onClick={() => setPickFor(it.id)}
              className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-muted/40"
              title="Escolher foto"
            >
              {it.imagePath ? (
                <ManualNewsThumb path={it.imagePath} />
              ) : (
                <ImagePlus className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            {it.imagePath && (
              <Button size="sm" variant="ghost" className="h-7 px-1.5 text-[10px]" disabled={disabled} onClick={() => update(it.id, { imagePath: null })}>
                Sem foto
              </Button>
            )}
            <div className="ml-auto flex items-center gap-0.5">
              <Switch
                checked={it.active !== false}
                disabled={disabled}
                onCheckedChange={(v) => update(it.id, { active: v })}
                title="Exibir"
              />
              <Button size="icon" variant="ghost" className="h-7 w-7" disabled={disabled || i === 0} onClick={() => move(i, -1)}>
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" disabled={disabled || i === items.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" disabled={disabled} onClick={() => save(items.filter((x) => x.id !== it.id))}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      ))}
      <p className="text-[10px] text-muted-foreground">
        Para ver as fotos, ligue "Mostrar imagem" abaixo. Salve o modelo para as telas
        receberem as notícias novas.
      </p>
      <MediaPickerDialog
        open={pickFor !== null}
        onOpenChange={(v) => !v && setPickFor(null)}
        filter="image"
        onPick={(f: PickerMediaFile) => {
          if (pickFor) update(pickFor, { imagePath: f.storage_path });
          setPickFor(null);
        }}
      />
    </div>
  );
}
