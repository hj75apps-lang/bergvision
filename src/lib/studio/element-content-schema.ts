import { z } from 'zod';

/**
 * Schema de conteúdo para elementos de templates do Studio (type='canvas').
 *
 * Regras não negociáveis:
 * - Posição/tamanho ficam na tabela `template_elements` em PERCENTUAL (0-100),
 *   NUNCA em pixels — este schema cobre apenas o `content` (JSONB) do elemento.
 * - `fontSizePercent` é relativo à altura do canvas para manter responsividade
 *   entre resoluções (ex.: 5 = 5% da altura).
 * - Widgets de `weather`, `rss` e `news` DEVEM ser resolvidos por Edge Function
 *   proxy — nunca guardar API key em `widgetConfig` no client.
 * - Texto e RSS são renderizados como texto puro, nunca via
 *   `dangerouslySetInnerHTML`.
 */

const hexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, {
    message: 'Cor deve estar em formato hexadecimal (#RGB, #RRGGBB ou #RRGGBBAA)',
  });

export const TextElementSchema = z.object({
  element_type: z.literal('text'),
  content: z.string().max(1000),
  fontFamily: z.string().default('Inter'),
  fontSizePercent: z.number().min(1).max(50),
  fontWeight: z.enum(['400', '500', '600', '700']).default('400'),
  color: hexColor,
  textAlign: z.enum(['left', 'center', 'right']).default('left'),
  backgroundColor: hexColor.optional(),
  backgroundOpacity: z.number().min(0).max(1).optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  strikethrough: z.boolean().optional(),
  uppercase: z.boolean().optional(),
  letterSpacing: z.number().min(-10).max(30).optional(),
  lineHeight: z.number().min(0.8).max(3).optional(),
  textShadow: z.boolean().optional(),
  animation: z
    .enum([
      'none',
      'fade',
      'slide-up',
      'slide-down',
      'slide-left',
      'slide-right',
      'zoom',
      'pulse',
      'blink',
      'bounce',
      'typewriter',
    ])
    .optional(),
  animationSpeed: z.number().min(0.5).max(20).optional(),
});

export const ImageElementSchema = z.object({
  element_type: z.literal('image'),
  mediaFileId: z.string().uuid(),
  fit: z.enum(['contain', 'cover', 'fill']).default('cover'),
});

export const VideoElementSchema = z.object({
  element_type: z.literal('video'),
  mediaFileId: z.string().uuid(),
  fit: z.enum(['contain', 'cover', 'fill']).default('cover'),
  loop: z.boolean().default(true),
  muted: z.boolean().default(true),
});

export const LogoElementSchema = z.object({
  element_type: z.literal('logo'),
  mediaFileId: z.string().uuid(),
  fit: z.enum(['contain', 'cover']).default('contain'),
});

export const PlaylistElementSchema = z.object({
  element_type: z.literal('playlist'),
  playlistId: z.string().uuid(),
});

/* --- Widgets: config validada por widgetType --- */

export const ClockWidgetConfigSchema = z.object({
  format: z.enum(['24h', '12h']).default('24h'),
  showSeconds: z.boolean().default(false),
  showDate: z.boolean().default(false),
  timezone: z.string().default('America/Sao_Paulo'),
});

export const WeatherWidgetConfigSchema = z.object({
  city: z.string().min(1).max(120),
  units: z.enum(['metric', 'imperial']).default('metric'),
  showForecast: z.boolean().default(false),
  preset: z
    .enum(['minimal', 'complete', 'forecast', 'vertical'])
    .default('complete'),
  theme: z
    .enum(['gradient', 'dark', 'light', 'glass'])
    .default('gradient'),
  accentColor: hexColor.optional(),
  showAnimatedIcons: z.boolean().default(true),
  // Fundo personalizado (opcional): imagem do bucket "media" + opacidade.
  backgroundImagePath: z.string().max(500).optional(),
  backgroundImageOpacity: z.number().min(0).max(1).optional(),
  backgroundImageFit: z.enum(['cover', 'contain', 'fill']).optional(),
  backgroundImageBlur: z.number().min(0).max(40).optional(),
  // Nunca aceitar apiKey aqui — resolvido em Edge Function.
});

export const RssWidgetConfigSchema = z.object({
  feedUrl: z.string().url(),
  maxItems: z.number().int().min(1).max(20).default(5),
  rotationSeconds: z.number().int().min(3).max(120).default(10),
});

export const NewsWidgetConfigSchema = z.object({
  source: z.string().min(1).max(60),
  category: z.string().max(60).optional(),
  maxItems: z.number().int().min(1).max(20).default(5),
  rotationSeconds: z.number().int().min(3).max(120).default(10),
});

export const IframeWidgetConfigSchema = z.object({
  // Apenas https para evitar mixed-content no player e reduzir superfície de risco.
  url: z
    .string()
    .url()
    .refine((u) => u.startsWith('https://'), {
      message: 'A URL do iframe precisa começar com https://',
    }),
  // Zoom visual (percentual) — útil para encaixar widgets externos no elemento.
  zoomPercent: z.number().min(25).max(400).default(100),
  // Recarregar automaticamente a cada N segundos (0 = nunca).
  refreshSeconds: z.number().int().min(0).max(3600).default(0),
  // Permitir scripts no iframe (necessário para widgets de clima/mapas).
  allowScripts: z.boolean().default(true),
  // Permitir chamadas same-origin (raramente necessário; desligado por padrão).
  allowSameOrigin: z.boolean().default(false),
});

export const WidgetElementSchema = z.object({
  element_type: z.literal('widget'),
  widgetType: z.enum(['clock', 'weather', 'rss', 'news', 'iframe']),
  widgetConfig: z.record(z.any()),
});

const widgetConfigByType = {
  clock: ClockWidgetConfigSchema,
  weather: WeatherWidgetConfigSchema,
  rss: RssWidgetConfigSchema,
  news: NewsWidgetConfigSchema,
  iframe: IframeWidgetConfigSchema,
} as const;

export const ShapeElementSchema = z.object({
  element_type: z.literal('shape'),
  shapeType: z.enum(['rectangle', 'circle']),
  fill: hexColor,
  borderRadius: z.number().min(0).max(100).default(0),
  borderColor: hexColor.optional(),
  borderWidth: z.number().min(0).max(50).default(0),
});

export const ElementContentSchema = z
  .discriminatedUnion('element_type', [
    TextElementSchema,
    ImageElementSchema,
    VideoElementSchema,
    LogoElementSchema,
    PlaylistElementSchema,
    WidgetElementSchema,
    ShapeElementSchema,
  ])
  .superRefine((val, ctx) => {
    if (val.element_type !== 'widget') return;
    const result = widgetConfigByType[val.widgetType].safeParse(val.widgetConfig);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({ ...issue, path: ['widgetConfig', ...issue.path] });
      }
    }
  });

export type ElementContent = z.infer<typeof ElementContentSchema>;
export type ElementType = ElementContent['element_type'];
export type WidgetType = z.infer<typeof WidgetElementSchema>['widgetType'];

/** Conteúdo default por tipo, usado ao criar um elemento novo no Studio. */
export function defaultContentFor(type: ElementType): ElementContent {
  switch (type) {
    case 'text':
      return {
        element_type: 'text',
        content: 'Texto',
        fontFamily: 'Inter',
        fontSizePercent: 5,
        fontWeight: '400',
        color: '#FFFFFF',
        textAlign: 'left',
      };
    case 'shape':
      return {
        element_type: 'shape',
        shapeType: 'rectangle',
        fill: '#3B82F6',
        borderRadius: 8,
        borderWidth: 0,
      };
    case 'widget':
      return {
        element_type: 'widget',
        widgetType: 'clock',
        widgetConfig: ClockWidgetConfigSchema.parse({}),
      };
    default:
      throw new Error(
        `defaultContentFor(${type}) exige seleção de mídia/playlist antes de criar o elemento.`,
      );
  }
}