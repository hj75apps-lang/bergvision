import { useQuery } from "@tanstack/react-query";
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
  forecast: { date: string; max: number; min: number; code: number }[];
};

type Preset = "minimal" | "complete" | "forecast" | "vertical";
type Theme = "gradient" | "dark" | "light" | "glass";

const WEEKDAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

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

export function WeatherWidget({ config }: { config: Record<string, unknown> }) {
  const rawCity = ((config.city as string) ?? "").trim();
  const city = rawCity
    .replace(/[.\s]+$/g, "")
    .replace(/\s*,\s*(BR|BRA|BRAZIL|BRASIL|US|USA|EUA|UK|PT|AR|CL)\.?$/i, "")
    .replace(/[.\s]+$/g, "")
    .trim();
  const units =
    (config.units as string) === "imperial" ? "imperial" : "metric";
  const preset = ((config.preset as Preset) ?? "complete") as Preset;
  const theme = ((config.theme as Theme) ?? "gradient") as Theme;
  const accentColor = config.accentColor as string | undefined;
  const animated = (config.showAnimatedIcons as boolean | undefined) ?? true;

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

  const withBg = (node: React.ReactNode) => {
    if (!bgUrl) return node;
    return (
      <div
        className="relative h-full w-full"
        style={{ borderRadius: "3cqmin", overflow: "hidden" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `url(${bgUrl})`,
            backgroundSize: bgFit === "fill" ? "100% 100%" : bgFit,
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            opacity: bgOpacity,
            filter: bgBlur > 0 ? `blur(${bgBlur}px)` : undefined,
            transform: bgBlur > 0 ? "scale(1.05)" : undefined,
          }}
        />
        <div className="relative h-full w-full">{node}</div>
      </div>
    );
  };

  const q = useQuery({
    queryKey: ["widget-weather", city, units],
    enabled: city.length > 0,
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("widget-weather", {
        body: { city, units },
      });
      if (error) throw error;
      return data as WeatherData;
    },
  });

  const shellBase: React.CSSProperties = {
    containerType: "size",
    fontFamily: "Inter, system-ui",
    borderRadius: "3cqmin",
    overflow: "hidden",
  };

  if (!city) {
    return (
      withBg(<div
        className="flex h-full w-full items-center justify-center text-white/70"
        style={{ ...shellBase, background: "#1E293B" }}
      >
        <span style={{ fontSize: "8cqh" }}>Configure a cidade</span>
      </div>)
    );
  }
  if (q.isLoading) {
    return (
      withBg(<div
        className="flex h-full w-full items-center justify-center text-white/70"
        style={{ ...shellBase, background: "#0F172A" }}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>)
    );
  }
  if (q.isError || !q.data) {
    return (
      withBg(<div
        className="flex h-full w-full items-center justify-center text-white/80"
        style={{ ...shellBase, background: "#7F1D1D" }}
      >
        <span style={{ fontSize: "7cqh" }}>Clima indisponível</span>
      </div>)
    );
  }

  const raw = q.data as Partial<WeatherData> & Record<string, unknown>;
  const d: WeatherData = {
    temp: typeof raw.temp === "number" ? raw.temp : 0,
    feelsLike: typeof raw.feelsLike === "number" ? raw.feelsLike : (typeof raw.temp === "number" ? raw.temp : 0),
    unit: typeof raw.unit === "string" ? raw.unit : "°C",
    code: typeof raw.code === "number" ? raw.code : 0,
    isDay: raw.isDay !== false,
    humidity: typeof raw.humidity === "number" ? raw.humidity : 0,
    wind: typeof raw.wind === "number" ? raw.wind : 0,
    windUnit: typeof raw.windUnit === "string" ? raw.windUnit : "km/h",
    description: typeof raw.description === "string" ? raw.description : "—",
    city: typeof raw.city === "string" ? raw.city : city,
    country: typeof raw.country === "string" ? raw.country : "",
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

  if (preset === "minimal") {
    return withBg(<PresetMinimal d={d} shell={shell} accent={t.accent} animated={animated} />);
  }
  if (preset === "forecast") {
    return withBg(<PresetForecast d={d} shell={shell} accent={t.accent} animated={animated} />);
  }
  if (preset === "vertical") {
    return withBg(<PresetVertical d={d} shell={shell} accent={t.accent} animated={animated} />);
  }
  return withBg(<PresetComplete d={d} shell={shell} accent={t.accent} animated={animated} />);
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
}: {
  d: WeatherData;
  shell: React.CSSProperties;
  accent: string;
  animated: boolean;
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
        <span style={{ fontSize: "40cqmin", fontWeight: 700, letterSpacing: "-0.03em" }}>
          {d.temp}
          <span style={{ fontSize: "18cqmin", fontWeight: 500, opacity: 0.8 }}>
            {d.unit}
          </span>
        </span>
        <span style={{ fontSize: "8cqmin", opacity: 0.9, marginTop: "2cqmin" }}>
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
}: {
  d: WeatherData;
  shell: React.CSSProperties;
  accent: string;
  animated: boolean;
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
            }}
            className="truncate"
          >
            {d.city}
            {d.country ? `, ${d.country}` : ""}
          </span>
          <span
            style={{ fontSize: "6cqh", opacity: 0.7, marginTop: "0.5cqh" }}
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
            style={{ fontSize: "48cqh", fontWeight: 700, letterSpacing: "-0.04em" }}
          >
            {d.temp}
            <span style={{ fontSize: "18cqh", fontWeight: 500, opacity: 0.75 }}>
              {d.unit}
            </span>
          </span>
        </div>
        <div
          className="flex flex-col items-end gap-[0.8cqh] text-right"
          style={{ fontSize: "5.5cqh", opacity: 0.9 }}
        >
          <span>
            Sensação <b>{d.feelsLike}{d.unit}</b>
          </span>
          <span>
            Umidade <b>{d.humidity}%</b>
          </span>
          <span>
            Vento <b>{d.wind} {d.windUnit}</b>
          </span>
        </div>
      </div>
    </div>
  );
}

function PresetForecast({
  d,
  shell,
  accent,
  animated,
}: {
  d: WeatherData;
  shell: React.CSSProperties;
  accent: string;
  animated: boolean;
}) {
  const days = (d.forecast ?? []).slice(0, 4);
  return (
    <div className="flex h-full w-full flex-col p-[4cqmin]" style={shell}>
      <div className="flex items-center justify-between gap-[3cqmin]">
        <div className="flex min-w-0 flex-col">
          <span
            style={{ fontSize: "6.5cqh", fontWeight: 600, opacity: 0.85 }}
            className="truncate"
          >
            {d.city}
          </span>
          <span
            className="leading-none"
            style={{
              fontSize: "34cqh",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              marginTop: "1cqh",
            }}
          >
            {d.temp}
            <span style={{ fontSize: "14cqh", fontWeight: 500, opacity: 0.75 }}>
              {d.unit}
            </span>
          </span>
        </div>
        <div style={{ width: "34cqh", height: "34cqh", flexShrink: 0 }}>
          <WeatherIcon code={d.code} isDay={d.isDay} accent={accent} animated={animated} />
        </div>
      </div>
      <div
        className="mt-auto grid gap-[2cqmin] pt-[3cqmin]"
        style={{
          gridTemplateColumns: `repeat(${days.length || 1}, minmax(0, 1fr))`,
          borderTop: "1px solid rgba(255,255,255,0.18)",
        }}
      >
        {days.map((day, i) => (
          <div
            key={day.date}
            className="flex flex-col items-center gap-[0.6cqh]"
            style={{ fontSize: "5cqh", opacity: 0.95 }}
          >
            <span style={{ opacity: 0.8 }}>
              {i === 0 ? "Hoje" : fmtDate(day.date)}
            </span>
            <div style={{ width: "14cqh", height: "14cqh" }}>
              <WeatherIcon code={day.code} accent={accent} animated={animated} />
            </div>
            <span style={{ fontWeight: 600 }}>
              {day.max}° <span style={{ opacity: 0.6 }}>{day.min}°</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PresetVertical({
  d,
  shell,
  accent,
  animated,
}: {
  d: WeatherData;
  shell: React.CSSProperties;
  accent: string;
  animated: boolean;
}) {
  const days = (d.forecast ?? []).slice(0, 4);
  return (
    <div
      className="flex h-full w-full flex-col items-center gap-[2cqh] p-[5cqmin] text-center"
      style={shell}
    >
      <span
        style={{ fontSize: "5cqh", fontWeight: 600, letterSpacing: "0.1em" }}
        className="uppercase opacity-80"
      >
        {d.city}
      </span>
      <div style={{ width: "40cqmin", height: "40cqmin" }}>
        <WeatherIcon code={d.code} isDay={d.isDay} accent={accent} animated={animated} />
      </div>
      <span
        className="leading-none"
        style={{ fontSize: "22cqh", fontWeight: 700, letterSpacing: "-0.03em" }}
      >
        {d.temp}
        <span style={{ fontSize: "9cqh", fontWeight: 500, opacity: 0.75 }}>
          {d.unit}
        </span>
      </span>
      <span style={{ fontSize: "4.5cqh", opacity: 0.9 }}>{d.description}</span>
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
            <span style={{ opacity: 0.85, minWidth: "10cqh", textAlign: "left" }}>
              {i === 0 ? "Hoje" : fmtDate(day.date)}
            </span>
            <div style={{ width: "8cqh", height: "8cqh" }}>
              <WeatherIcon code={day.code} accent={accent} animated={animated} />
            </div>
            <span style={{ fontWeight: 600, minWidth: "12cqh", textAlign: "right" }}>
              {day.max}° <span style={{ opacity: 0.6 }}>{day.min}°</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}