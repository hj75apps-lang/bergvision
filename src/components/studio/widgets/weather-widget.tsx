import { useEffect, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useSignedUrl } from "@/lib/studio/use-signed-url";
import { WeatherIcon, wmoToGradient } from "./weather-icons";

type WeatherData = {
  temp: number;
  feelsLike: number;
  unit: string;
  code: number;
  isDay: boolean;
  humidity: number;
  wind: number;
  windUnit: string;
  description: string;
  city: string;
  country: string;
  state: string;
  forecast: { date: string; max: number; min: number; code: number }[];
};

type Preset = "minimal" | "complete" | "forecast" | "vertical";
type Theme = "gradient" | "dark" | "light" | "glass";

const WEEKDAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/* ---------- Cache persistente (sobrevive a recarregar a página) ---------- */
const CACHE_PREFIX = "bv:weather:v2:";
const STALE_AFTER_MS = 30 * 60 * 1000; // 2x o intervalo de atualização (15 min)
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Aceita os dois formatos já vistos na resposta: "temp" ou "temperature".
function pickTemp(o: Record<string, unknown>): number {
  const v = typeof o.temp === "number" ? o.temp : o.temperature;
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0;
}
function isValidWeather(v: unknown): v is WeatherData {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const t = typeof o.temp === "number" ? o.temp : o.temperature;
  // Exige temperatura real e previsão — formatos incompletos não viram cache.
  return typeof t === "number" && Number.isFinite(t) && Array.isArray(o.forecast);
}
function readWeatherCache(
  city: string,
  units: string,
): { data: WeatherData; savedAt: number } | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(CACHE_PREFIX + units + ":" + city.toLowerCase());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: unknown; savedAt: number };
    if (!isValidWeather(parsed.data) || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > CACHE_MAX_AGE_MS) return null;
    return { data: parsed.data, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}
function writeWeatherCache(city: string, units: string, data: WeatherData) {
  try {
    window.localStorage.setItem(
      CACHE_PREFIX + units + ":" + city.toLowerCase(),
      JSON.stringify({ data, savedAt: Date.now() }),
    );
  } catch {
    /* armazenamento cheio ou indisponível — segue sem cache */
  }
}

function themeStyle(
  theme: Theme,
  code: number,
  isDay: boolean,
  accent?: string,
): { background: string; color: string; accent: string } {
  const g = wmoToGradient(code, isDay);
  switch (theme) {
    case "dark":
      return {
        background: "#0F172A",
        color: "#F8FAFC",
        accent: accent ?? g.accent,
      };
    case "light":
      return {
        background: "#F8FAFC",
        color: "#0F172A",
        accent: accent ?? g.from,
      };
    case "glass":
      return {
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))",
        color: "#F8FAFC",
        accent: accent ?? g.accent,
      };
    case "gradient":
    default:
      return {
        background: `linear-gradient(135deg, ${g.from}, ${g.to})`,
        color: "#FFFFFF",
        accent: accent ?? g.accent,
      };
  }
}

export type WeatherTextKey =
  | "city" | "description" | "temp" | "unit" | "labels" | "feelsLike" | "humidity" | "wind"
  | "minMax" | "forecastTitle" | "dayName" | "dayDate" | "dayCondition" | "dayMax" | "dayMin" | "dayRain";
type TC = Partial<Record<WeatherTextKey, string>>;
function readTextColors(config: Record<string, unknown>): TC {
  const raw = config.textColors;
  if (!raw || typeof raw !== "object") return {};
  const out: TC = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v)) out[k as WeatherTextKey] = v;
  }
  return out;
}

export function WeatherWidget({ config }: { config: Record<string, unknown> }) {
  const normalize = (raw: string) =>
    raw
      .trim()
      .replace(/[.\s]+$/g, "")
      .replace(/\s*,\s*(BR|BRA|BRAZIL|BRASIL|US|USA|EUA|UK|PT|AR|CL)\.?$/i, "")
      .replace(/[.\s]+$/g, "")
      .trim();
  const rawList = Array.isArray(config.cities)
    ? (config.cities as unknown[]).filter(
        (v): v is string => typeof v === "string" && v.trim().length > 0,
      )
    : [];
  const legacy =
    typeof config.city === "string" && config.city.trim().length > 0
      ? [config.city]
      : [];
  const cities = Array.from(
    new Set(
      (rawList.length > 0 ? rawList : legacy).map(normalize).filter((c) => c.length > 0),
    ),
  );
  const rotationSeconds = Math.max(
    3,
    Math.min(300, (config.rotationSeconds as number | undefined) ?? 15),
  );
  const units =
    (config.units as string) === "imperial" ? "imperial" : "metric";
  const preset = ((config.preset as Preset) ?? "complete") as Preset;
  const theme = ((config.theme as Theme) ?? "gradient") as Theme;
  const accentColor = config.accentColor as string | undefined;
  const animated = (config.showAnimatedIcons as boolean | undefined) ?? true;
  const tc = readTextColors(config);

  const bgPath = (config.backgroundImagePath as string | undefined) || null;
  const bgUrl = useSignedUrl(bgPath, 3600);
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
  const bgAnim = ((config.backgroundImageAnimation as string) ?? "none") as
    | "none"
    | "ken-burns"
    | "zoom-in"
    | "zoom-out"
    | "pan-left"
    | "pan-right"
    | "pan-up"
    | "pan-down";
  const bgAnimDuration = Math.max(
    5,
    Math.min(120, (config.backgroundImageAnimationDuration as number | undefined) ?? 30),
  );

  const withBg = (node: React.ReactNode) => {
    if (!bgUrl) return node;
    // Escala inicial extra evita bordas expostas durante pan.
    // Animações suaves (alternate) mantêm o loop imperceptível e
    // gastam apenas transform+opacity — GPU-accelerated, sem repaint.
    const animMap: Record<string, string | undefined> = {
      none: undefined,
      "ken-burns": `bv-wbg-kenburns ${bgAnimDuration}s ease-in-out infinite alternate`,
      "zoom-in": `bv-wbg-zoom-in ${bgAnimDuration}s ease-in-out infinite alternate`,
      "zoom-out": `bv-wbg-zoom-out ${bgAnimDuration}s ease-in-out infinite alternate`,
      "pan-left": `bv-wbg-pan-left ${bgAnimDuration}s ease-in-out infinite alternate`,
      "pan-right": `bv-wbg-pan-right ${bgAnimDuration}s ease-in-out infinite alternate`,
      "pan-up": `bv-wbg-pan-up ${bgAnimDuration}s ease-in-out infinite alternate`,
      "pan-down": `bv-wbg-pan-down ${bgAnimDuration}s ease-in-out infinite alternate`,
    };
    const animation = animMap[bgAnim];
    // Base scale para cobrir a translação sem revelar bordas.
    const baseScale = bgBlur > 0 ? 1.08 : 1;
    return (
      <div
        className="relative h-full w-full"
        style={{ borderRadius: "3cqmin", overflow: "hidden" }}
      >
        {animation && (
          <style>{`
            @keyframes bv-wbg-kenburns{0%{transform:scale(1.05) translate(0,0)}100%{transform:scale(1.18) translate(-3%,-2%)}}
            @keyframes bv-wbg-zoom-in{0%{transform:scale(1)}100%{transform:scale(1.2)}}
            @keyframes bv-wbg-zoom-out{0%{transform:scale(1.2)}100%{transform:scale(1)}}
            @keyframes bv-wbg-pan-left{0%{transform:scale(1.15) translateX(4%)}100%{transform:scale(1.15) translateX(-4%)}}
            @keyframes bv-wbg-pan-right{0%{transform:scale(1.15) translateX(-4%)}100%{transform:scale(1.15) translateX(4%)}}
            @keyframes bv-wbg-pan-up{0%{transform:scale(1.15) translateY(4%)}100%{transform:scale(1.15) translateY(-4%)}}
            @keyframes bv-wbg-pan-down{0%{transform:scale(1.15) translateY(-4%)}100%{transform:scale(1.15) translateY(4%)}}
            @media (prefers-reduced-motion: reduce){
              [data-bv-wbg-anim]{animation:none !important;transform:none !important}
            }
          `}</style>
        )}
        <div
          data-bv-wbg-anim={animation ? bgAnim : undefined}
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `url(${bgUrl})`,
            backgroundSize: bgFit === "fill" ? "100% 100%" : bgFit,
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            opacity: bgOpacity,
            filter: bgBlur > 0 ? `blur(${bgBlur}px)` : undefined,
            transform: animation ? undefined : (baseScale !== 1 ? `scale(${baseScale})` : undefined),
            animation,
            willChange: animation ? "transform" : undefined,
            backfaceVisibility: animation ? "hidden" : undefined,
          }}
        />
        <div className="relative h-full w-full">{node}</div>
      </div>
    );
  };

  const results = useQueries({
    queries: cities.map((c) => {
      const cached = readWeatherCache(c, units);
      return {
        queryKey: ["widget-weather", c, units] as const,
        staleTime: 10 * 60 * 1000,
        refetchInterval: 15 * 60 * 1000,
        retry: 2,
        // Último boletim salvo aparece na hora; atualização roda em segundo plano.
        initialData: cached ? cached.data : undefined,
        initialDataUpdatedAt: cached ? cached.savedAt : undefined,
        queryFn: async () => {
          const { data, error } = await supabase.functions.invoke("widget-weather", {
            body: { city: c, units },
          });
          if (error) throw error;
          if (!isValidWeather(data)) throw new Error("invalid_weather_payload");
          writeWeatherCache(c, units, data as WeatherData);
          return data as WeatherData;
        },
      };
    }),
  });

  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (cities.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % cities.length);
    }, rotationSeconds * 1000);
    return () => window.clearInterval(id);
  }, [cities.length, rotationSeconds]);
  useEffect(() => {
    if (index >= cities.length) setIndex(0);
  }, [cities.length, index]);

  const current = cities.length > 0 ? results[Math.min(index, results.length - 1)] : undefined;

  const shellBase: React.CSSProperties = {
    containerType: "size",
    fontFamily: "Inter, system-ui",
    borderRadius: "3cqmin",
    overflow: "hidden",
  };

  if (cities.length === 0) {
    return (
      withBg(<div
        className="flex h-full w-full items-center justify-center text-white/70"
        style={{ ...shellBase, background: "#1E293B" }}
      >
        <span style={{ fontSize: "8cqh" }}>Configure a cidade</span>
      </div>)
    );
  }
  if (!current || current.isLoading) {
    return (
      withBg(<div
        className="flex h-full w-full items-center justify-center text-white/70"
        style={{ ...shellBase, background: "#0F172A" }}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>)
    );
  }
  // Erro só aparece quando não há nenhum boletim salvo; senão mantém o último.
  if (!current.data) {
    return (
      withBg(<div
        className="flex h-full w-full items-center justify-center text-white/80"
        style={{ ...shellBase, background: "#7F1D1D" }}
      >
        <span style={{ fontSize: "7cqh" }}>Clima indisponível</span>
      </div>)
    );
  }

  const raw = current.data as Partial<WeatherData> & Record<string, unknown>;
  const d: WeatherData = {
    temp: pickTemp(raw),
    feelsLike: typeof raw.feelsLike === "number" ? Math.round(raw.feelsLike) : pickTemp(raw),
    unit: typeof raw.unit === "string" ? raw.unit : "°C",
    code: typeof raw.code === "number" ? raw.code : 0,
    isDay: raw.isDay !== false,
    humidity: typeof raw.humidity === "number" ? raw.humidity : 0,
    wind: typeof raw.wind === "number" ? raw.wind : 0,
    windUnit: typeof raw.windUnit === "string" ? raw.windUnit : "km/h",
    description: typeof raw.description === "string" ? raw.description : "—",
    city: typeof raw.city === "string" ? raw.city : cities[Math.min(index, cities.length - 1)] ?? "",
    country: typeof raw.country === "string" ? raw.country : "",
    state: typeof raw.state === "string" ? raw.state : "",
    forecast: Array.isArray(raw.forecast) ? (raw.forecast as WeatherData["forecast"]) : [],
  };
  const t = themeStyle(theme, d.code, d.isDay, accentColor);
  // Quando há imagem de fundo personalizada, o fundo do tema fica transparente
  // para não sobrepor a imagem — mantemos apenas a cor de texto do tema.
  const shell: React.CSSProperties = {
    ...shellBase,
    background: bgUrl ? "transparent" : t.background,
    color: t.color,
  };

  const isStale =
    current.dataUpdatedAt > 0 && Date.now() - current.dataUpdatedAt > STALE_AFTER_MS;
  const body =
    preset === "minimal" ? (
      <PresetMinimal d={d} shell={shell} accent={t.accent} animated={animated} tc={tc} />
    ) : preset === "forecast" ? (
      <PresetForecast d={d} shell={shell} accent={t.accent} animated={animated} tc={tc} />
    ) : preset === "vertical" ? (
      <PresetVertical d={d} shell={shell} accent={t.accent} animated={animated} tc={tc} />
    ) : (
      <PresetComplete d={d} shell={shell} accent={t.accent} animated={animated} tc={tc} />
    );
  if (!isStale) return withBg(body);
  return withBg(
    <div className="relative h-full w-full">
      {body}
      <span
        role="img"
        aria-label="Dados do clima desatualizados"
        title="Dados desatualizados — tentando atualizar"
        style={{
          position: "absolute",
          top: "3cqmin",
          right: "3cqmin",
          width: "2.5cqmin",
          height: "2.5cqmin",
          minWidth: 6,
          minHeight: 6,
          borderRadius: "50%",
          background: "#F59E0B",
          opacity: 0.85,
        }}
      />
    </div>,
  );
}

function fmtDate(iso: string) {
  const parts = iso.split("-").map(Number);
  if (parts.length < 3) return iso;
  const [y, m, day] = parts;
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, day));
  return WEEKDAYS_PT[dt.getUTCDay()] ?? "";
}

/* ---------- Presets ---------- */

function PresetMinimal({
  d,
  shell,
  accent,
  animated,
  tc,
}: {
  d: WeatherData;
  shell: React.CSSProperties;
  accent: string;
  animated: boolean;
  tc: TC;
}) {
  return (
    <div
      className="flex h-full w-full items-center justify-center gap-[4cqmin] px-[6cqmin]"
      style={shell}
    >
      <div style={{ width: "38cqmin", height: "38cqmin" }}>
        <WeatherIcon code={d.code} isDay={d.isDay} accent={accent} animated={animated} />
      </div>
      <div className="flex flex-col leading-none">
        <span style={{ fontSize: "40cqmin", fontWeight: 700, letterSpacing: "-0.03em", color: tc.temp }}>
          {d.temp}
          <span style={{ fontSize: "18cqmin", fontWeight: 500, opacity: 0.8, color: tc.unit }}>
            {d.unit}
          </span>
        </span>
        <span style={{ fontSize: "8cqmin", opacity: 0.9, marginTop: "2cqmin", color: tc.description }}>
          {d.description}
        </span>
      </div>
    </div>
  );
}

function PresetComplete({
  d,
  shell,
  accent,
  animated,
  tc,
}: {
  d: WeatherData;
  shell: React.CSSProperties;
  accent: string;
  animated: boolean;
  tc: TC;
}) {
  return (
    <div className="flex h-full w-full flex-col p-[5cqmin]" style={shell}>
      <div className="flex items-start justify-between">
        <div className="flex min-w-0 flex-col">
          <span
            style={{
              fontSize: "9cqh",
              fontWeight: 600,
              letterSpacing: "0.02em",
              textTransform: "uppercase",
              opacity: 0.85,
              color: tc.city,
            }}
            className="truncate"
          >
            {d.city}
            {d.state ? ` - ${d.state}` : d.country ? `, ${d.country}` : ""}
          </span>
          <span
            style={{ fontSize: "6cqh", opacity: 0.7, marginTop: "0.5cqh", color: tc.description }}
            className="truncate"
          >
            {d.description}
          </span>
        </div>
        <div style={{ width: "28cqh", height: "28cqh", flexShrink: 0 }}>
          <WeatherIcon code={d.code} isDay={d.isDay} accent={accent} animated={animated} />
        </div>
      </div>
      <div className="mt-auto flex items-end justify-between gap-[3cqmin]">
        <div className="leading-none">
          <span
            style={{ fontSize: "48cqh", fontWeight: 700, letterSpacing: "-0.04em", color: tc.temp }}
          >
            {d.temp}
            <span style={{ fontSize: "18cqh", fontWeight: 500, opacity: 0.75, color: tc.unit }}>
              {d.unit}
            </span>
          </span>
        </div>
        <div
          className="flex flex-col items-end gap-[0.8cqh] text-right"
          style={{ fontSize: "5.5cqh", opacity: 0.9, color: tc.labels }}
        >
          <span>
            Sensação <b style={{ color: tc.feelsLike }}>{d.feelsLike}{d.unit}</b>
          </span>
          <span>
            Umidade <b style={{ color: tc.humidity }}>{d.humidity}%</b>
          </span>
          <span>
            Vento <b style={{ color: tc.wind }}>{d.wind} {d.windUnit}</b>
          </span>
        </div>
      </div>
    </div>
  );
}

const WEEKDAYS_FULL_PT = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];
const MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function wmoLabel(code: number): string {
  if (code === 0) return "Céu limpo";
  if (code <= 2) return "Poucas nuvens";
  if (code === 3) return "Nublado";
  if (code === 45 || code === 48) return "Neblina";
  if (code >= 51 && code <= 57) return "Garoa";
  if (code >= 61 && code <= 67) return "Chuva";
  if (code >= 71 && code <= 77) return "Neve";
  if (code >= 80 && code <= 82) return "Pancadas";
  if (code >= 95) return "Tempestade";
  return "—";
}

function parseIsoDate(iso: string): Date | null {
  const p = iso.split("-").map(Number);
  if (p.length < 3 || p.some((n) => !Number.isFinite(n))) return null;
  return new Date(Date.UTC(p[0], p[1] - 1, p[2]));
}

type ForecastDay = WeatherData["forecast"][number] & { precipitationMax?: number };

function PresetForecast({
  d,
  shell,
  accent,
  animated,
  tc,
}: {
  d: WeatherData;
  shell: React.CSSProperties;
  accent: string;
  animated: boolean;
  tc: TC;
}) {
  const all = (d.forecast ?? []) as ForecastDay[];
  const today = all[0];
  // Próximos 5 dias (exclui hoje quando a previsão inclui o dia atual).
  const days = (all.length > 5 ? all.slice(1) : all).slice(0, 5);
  const muted: React.CSSProperties = { opacity: 0.72 };
  const card: React.CSSProperties = {
    background: "rgba(0,0,0,0.28)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "2.2cqmin",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
  };
  return (
    <div className="flex h-full w-full flex-col p-[3.5cqmin]" style={shell}>
      {/* Hoje */}
      <div
        className="flex items-center justify-between gap-[3cqw]"
        style={{ paddingBottom: "2.5cqh", borderBottom: "1px solid rgba(255,255,255,0.14)" }}
      >
        <div className="flex min-w-0 items-center gap-[2cqw]">
          <div style={{ width: "13cqh", height: "13cqh", flexShrink: 0 }}>
            <WeatherIcon code={d.code} isDay={d.isDay} accent={accent} animated={animated} />
          </div>
          <span className="leading-none" style={{ fontSize: "13cqh", fontWeight: 700, letterSpacing: "-0.03em", color: tc.temp }}>
            {d.temp}
            <span style={{ fontSize: "6cqh", fontWeight: 500, verticalAlign: "top", color: tc.unit }}>{d.unit}</span>
          </span>
          <div className="flex min-w-0 flex-col" style={{ gap: "0.6cqh" }}>
            <span className="truncate" style={{ fontSize: "4.2cqh", fontWeight: 600, color: tc.description }}>
              {d.description}
              {d.city ? <span style={{ ...muted, fontWeight: 400, color: tc.city }}> · {d.city}</span> : null}
            </span>
            <span style={{ fontSize: "3.4cqh", ...muted, color: tc.feelsLike }}>Sensação de {d.feelsLike}°</span>
            {today ? (
              <span style={{ fontSize: "3.4cqh", ...muted, color: tc.minMax }}>
                Máx. {today.max}° · Mín. {today.min}°
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 gap-[3cqw]">
          <div className="flex flex-col" style={{ gap: "1cqh" }}>
            <span className="flex items-center gap-[0.6cqw]" style={{ fontSize: "3.4cqh", ...muted, color: tc.labels }}>
              <span style={{ width: "4cqh", height: "4cqh", display: "inline-block" }}>
                <WeatherIcon code={61} accent={accent} animated={animated} />
              </span>
              Umidade
            </span>
            <span style={{ fontSize: "5.5cqh", fontWeight: 700, color: tc.humidity }}>{d.humidity}%</span>
          </div>
          <div className="flex flex-col" style={{ gap: "1cqh" }}>
            <span className="flex items-center gap-[0.6cqw]" style={{ fontSize: "3.4cqh", ...muted, color: tc.labels }}>
              <span
                aria-hidden
                style={{
                  display: "inline-block",
                  animation: animated ? "bv-wind-sway 2.4s ease-in-out infinite" : undefined,
                }}
              >
                ≋
              </span>
              Vento atual
            </span>
            <span style={{ fontSize: "5.5cqh", fontWeight: 700, color: tc.wind }}>
              {d.wind} <span style={{ fontSize: "3.4cqh", fontWeight: 500 }}>{d.windUnit}</span>
            </span>
          </div>
        </div>
      </div>
      <style>{`@keyframes bv-wind-sway{0%,100%{transform:translateX(0)}50%{transform:translateX(18%)}}`}</style>

      {/* Próximos 5 dias */}
      <span style={{ fontSize: "4.4cqh", fontWeight: 700, margin: "2.4cqh 0 1.8cqh", color: tc.forecastTitle }}>
        Próximos {days.length} dias
      </span>
      <div
        className="grid min-h-0 flex-1 gap-[1.2cqw]"
        style={{ gridTemplateColumns: `repeat(${days.length || 1}, minmax(0, 1fr))` }}
      >
        {days.map((day) => {
          const dt = parseIsoDate(day.date);
          return (
            <div
              key={day.date}
              className="flex min-w-0 flex-col items-center justify-between text-center"
              style={{ ...card, padding: "2.4cqh 1cqw" }}
            >
              <div className="flex flex-col" style={{ gap: "0.6cqh" }}>
                <span className="truncate" style={{ fontSize: "3.8cqh", fontWeight: 700, color: tc.dayName }}>
                  {dt ? WEEKDAYS_FULL_PT[dt.getUTCDay()] : day.date}
                </span>
                <span style={{ fontSize: "3cqh", ...muted, color: tc.dayDate }}>
                  {dt ? `${dt.getUTCDate()} de ${MONTHS_PT[dt.getUTCMonth()]}` : ""}
                </span>
              </div>
              <div className="flex flex-col items-center" style={{ gap: "1cqh" }}>
                <div style={{ width: "13cqh", height: "13cqh" }}>
                  <WeatherIcon code={day.code} accent={accent} animated={animated} />
                </div>
                <span style={{ fontSize: "3.4cqh", color: tc.dayCondition }}>{wmoLabel(day.code)}</span>
              </div>
              <div className="flex items-end justify-center gap-[1.2cqw]">
                <div className="flex flex-col items-center">
                  <span style={{ fontSize: "6cqh", fontWeight: 700, lineHeight: 1, color: tc.dayMax }}>
                    {day.max}
                    <span style={{ fontSize: "2.8cqh" }}>{d.unit}</span>
                  </span>
                  <span style={{ fontSize: "2.8cqh", ...muted, color: tc.labels }}>Máxima</span>
                </div>
                <div className="flex flex-col items-center">
                  <span style={{ fontSize: "5cqh", fontWeight: 400, lineHeight: 1, color: tc.dayMin }}>
                    {day.min}
                    <span style={{ fontSize: "2.8cqh" }}>{d.unit}</span>
                  </span>
                  <span style={{ fontSize: "2.8cqh", ...muted, color: tc.labels }}>Mínima</span>
                </div>
              </div>
              <div
                className="flex w-full flex-col items-center"
                style={{ borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: "1.6cqh" }}
              >
                <span style={{ fontSize: "4.4cqh", fontWeight: 700, color: tc.dayRain }}>
                  ☂ {typeof day.precipitationMax === "number" ? day.precipitationMax : 0}
                  <span style={{ fontSize: "2.8cqh" }}> %</span>
                </span>
                <span style={{ fontSize: "2.8cqh", ...muted, color: tc.labels }}>Chance de chuva</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PresetVertical({
  d,
  shell,
  accent,
  animated,
  tc,
}: {
  d: WeatherData;
  shell: React.CSSProperties;
  accent: string;
  animated: boolean;
  tc: TC;
}) {
  const days = (d.forecast ?? []).slice(0, 4);
  return (
    <div
      className="flex h-full w-full flex-col items-center gap-[2cqh] p-[5cqmin] text-center"
      style={shell}
    >
      <span
        style={{ fontSize: "5cqh", fontWeight: 600, letterSpacing: "0.1em", color: tc.city }}
        className="uppercase opacity-80"
      >
        {d.city}
      </span>
      <div style={{ width: "40cqmin", height: "40cqmin" }}>
        <WeatherIcon code={d.code} isDay={d.isDay} accent={accent} animated={animated} />
      </div>
      <span
        className="leading-none"
        style={{ fontSize: "22cqh", fontWeight: 700, letterSpacing: "-0.03em", color: tc.temp }}
      >
        {d.temp}
        <span style={{ fontSize: "9cqh", fontWeight: 500, opacity: 0.75, color: tc.unit }}>
          {d.unit}
        </span>
      </span>
      <span style={{ fontSize: "4.5cqh", opacity: 0.9, color: tc.description }}>{d.description}</span>
      <div
        className="mt-auto flex w-full flex-col gap-[1.2cqh] pt-[2cqh]"
        style={{ borderTop: "1px solid rgba(255,255,255,0.18)" }}
      >
        {days.map((day, i) => (
          <div
            key={day.date}
            className="flex items-center justify-between gap-[2cqmin] px-[1cqh]"
            style={{ fontSize: "4.5cqh" }}
          >
            <span style={{ opacity: 0.85, minWidth: "10cqh", textAlign: "left", color: tc.dayName }}>
              {i === 0 ? "Hoje" : fmtDate(day.date)}
            </span>
            <div style={{ width: "8cqh", height: "8cqh" }}>
              <WeatherIcon code={day.code} accent={accent} animated={animated} />
            </div>
            <span style={{ fontWeight: 600, minWidth: "12cqh", textAlign: "right", color: tc.dayMax }}>
              {day.max}° <span style={{ opacity: 0.6, color: tc.dayMin }}>{day.min}°</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}