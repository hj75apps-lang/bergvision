import { useEffect, useState, useCallback } from "react";
import { Loader2, WifiOff } from "lucide-react";

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
  observedAt?: string;
  isStale?: boolean;
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

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const bdcRes = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=pt`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (bdcRes.ok) {
      const bdcData = await bdcRes.json();
      const locality = bdcData.city || bdcData.locality || bdcData.principalSubdivision;
      if (locality) return String(locality);
    }
  } catch (_e) {
    // Fallback to Nominatim
  }

  try {
    const nomRes = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=pt`,
      {
        headers: { "User-Agent": "BergVisionWeatherWidget/1.0" },
        signal: AbortSignal.timeout(4000),
      }
    );
    if (nomRes.ok) {
      const nomData = await nomRes.json();
      const addr = nomData.address;
      const place =
        addr?.city ||
        addr?.town ||
        addr?.village ||
        addr?.municipality ||
        addr?.state;
      if (place) return String(place);
    }
  } catch (_e) {
    // Fallback to coordinates
  }

  return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
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

  const [index, setIndex] = useState(0);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [weatherMap, setWeatherMap] = useState<Record<string, WeatherData>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [errorMap, setErrorMap] = useState<Record<string, boolean>>({});

  // Get GPS if no cities configured or GPS requested
  useEffect(() => {
    if (cities.length === 0 && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          setCoords({ lat, lon });
          const cityName = await reverseGeocode(lat, lon);
          if (cityName) {
            // Add resolved GPS city dynamically
            if (!cities.includes(cityName)) {
              cities.push(cityName);
            }
          }
        },
        (err) => {
          console.warn("[WeatherWidget] Geolocation error:", err.message);
        },
        { timeout: 10000, maximumAge: 300000 }
      );
    }
  }, [cities]);

  const currentCity = cities[Math.min(index, cities.length - 1)] || "";

  // Load persistent cache on mount
  useEffect(() => {
    try {
      const cachedStr = localStorage.getItem("bv_weather_cache_v1");
      if (cachedStr) {
        const parsed = JSON.parse(cachedStr);
        if (parsed && typeof parsed === "object") {
          setWeatherMap(parsed);
        }
      }
    } catch (e) {
      console.error("[WeatherWidget:cacheRead]", e);
    }
  }, []);

  const fetchWeatherForCity = useCallback(
    async (cityName: string, targetCoords?: { lat: number; lon: number }) => {
      if (!cityName && !targetCoords) return;
      const cacheKey = targetCoords ? `${targetCoords.lat},${targetCoords.lon}` : cityName;
      
      setLoadingMap((prev) => ({ ...prev, [cacheKey]: true }));
      setErrorMap((prev) => ({ ...prev, [cacheKey]: false }));

      try {
        const bodyPayload: Record<string, unknown> = { units };
        if (targetCoords) {
          bodyPayload.latitude = targetCoords.lat;
          bodyPayload.longitude = targetCoords.lon;
        } else {
          bodyPayload.city = cityName;
        }

        const { data, error } = await supabase.functions.invoke("widget-weather", {
          body: bodyPayload,
        });

        if (error) throw error;
        if (!data || typeof data !== "object") throw new Error("invalid_response");

        const freshData: WeatherData = {
          temp: Number((data as any).temp ?? 0),
          feelsLike: Number((data as any).feelsLike ?? (data as any).temp ?? 0),
          unit: String((data as any).unit ?? "°C"),
          code: Number((data as any).code ?? 0),
          isDay: (data as any).isDay !== false,
          humidity: Number((data as any).humidity ?? 0),
          wind: Number((data as any).wind ?? 0),
          windUnit: String((data as any).windUnit ?? "km/h"),
          description: String((data as any).description ?? "—"),
          city: String((data as any).city ?? cityName),
          country: String((data as any).country ?? ""),
          forecast: Array.isArray((data as any).forecast) ? (data as any).forecast : [],
          observedAt: new Date().toISOString(),
          isStale: false,
        };

        setWeatherMap((prev) => {
          const next = { ...prev, [cacheKey]: freshData };
          try {
            localStorage.setItem("bv_weather_cache_v1", JSON.stringify(next));
          } catch (err) {
            console.error("[WeatherWidget:cacheWrite]", err);
          }
          return next;
        });
      } catch (err) {
        console.error("[WeatherWidget:fetch]", err);
        setErrorMap((prev) => ({ ...prev, [cacheKey]: true }));
        // Mark existing cache as stale if available
        setWeatherMap((prev) => {
          if (prev[cacheKey]) {
            return { ...prev, [cacheKey]: { ...prev[cacheKey], isStale: true } };
          }
          return prev;
        });
      } finally {
        setLoadingMap((prev) => ({ ...prev, [cacheKey]: false }));
      }
    },
    [units]
  );

  // Fetch on mount or city change / coords change
  useEffect(() => {
    if (coords) {
      fetchWeatherForCity("", coords);
    } else if (currentCity) {
      fetchWeatherForCity(currentCity);
    }
  }, [currentCity, coords, fetchWeatherForCity]);

  // Rotation interval
  useEffectRef: {
    if (cities.length <= 1) break useEffectRef;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % cities.length);
    }, rotationSeconds * 1000);
    return () => window.clearInterval(id);
  }

  useEffect(() => {
    if (index >= cities.length) setIndex(0);
  }, [cities.length, index]);

  const activeCacheKey = coords ? `${coords.lat},${coords.lon}` : currentCity;
  const currentData = weatherMap[activeCacheKey];
  const isLoading = loadingMap[activeCacheKey] && !currentData;
  const isError = errorMap[activeCacheKey] && !currentData;

  const shellBase: React.CSSProperties = {
    containerType: "size",
    fontFamily: "Inter, system-ui",
    borderRadius: "3cqmin",
    overflow: "hidden",
  };

  const withBg = (node: React.ReactNode, customBg?: string) => {
    if (!bgUrl) {
      return (
        <div className="relative h-full w-full" style={{ ...shellBase, background: customBg }}>
          {node}
        </div>
      );
    }
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
        <div className="relative h-full w-full" style={{ background: customBg }}>{node}</div>
      </div>
    );
  };

  if (cities.length === 0 && !coords) {
    return (
      withBg(
        <div
          className="flex h-full w-full items-center justify-center text-white/70"
          style={{ fontSize: "8cqh" }}
        >
          Configure a cidade
        </div>,
        "#1E293B"
      )
    );
  }

  if (isLoading) {
    return (
      withBg(
        <div className="flex h-full w-full items-center justify-center text-white/70">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>,
        "#0F172A"
      )
    );
  }

  if (isError || !currentData) {
    return (
      withBg(
        <div className="flex h-full w-full items-center justify-center text-white/80">
          <span style={{ fontSize: "7cqh" }}>Clima indisponível</span>
        </div>,
        "#7F1D1D"
      )
    );
  }

  const t = themeStyle(theme, currentData.code, currentData.isDay, accentColor);
  const shell: React.CSSProperties = {
    ...shellBase,
    background: bgUrl ? "transparent" : t.background,
    color: t.color,
  };

  const staleBadge = currentData.isStale ? (
    <div
      className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-xs text-white/90 backdrop-blur-sm"
      style={{ fontSize: "3.5cqh" }}
      title="Dados desatualizados (offline)"
    >
      <WifiOff className="h-3 w-3" />
      <span>Offline</span>
    </div>
  ) : null;

  let contentNode = null;
  if (preset === "minimal") {
    contentNode = <PresetMinimal d={currentData} shell={shell} accent={t.accent} animated={animated} />;
  } else if (preset === "forecast") {
    contentNode = <PresetForecast d={currentData} shell={shell} accent={t.accent} animated={animated} />;
  } else if (preset === "vertical") {
    contentNode = <PresetVertical d={currentData} shell={shell} accent={t.accent} animated={animated} />;
  } else {
    contentNode = <PresetComplete d={currentData} shell={shell} accent={t.accent} animated={animated} />;
  }

  return withBg(
    <div className="relative h-full w-full">
      {staleBadge}
      {contentNode}
    </div>
  );
}

function fmtDate(iso: string) {
  const parts = iso.split("-").map(Number);
  if (parts.length < 3) return iso;
  const [y, m, day] = parts;
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, day));
  return WEEKDAYS_PT[dt.getUTCDay()] ?? "";
}

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
  const days = (d.forecast ?? []).slice(0, 6);
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
          <span
            className="truncate"
            style={{ fontSize: "5.5cqh", opacity: 0.9, marginTop: "1cqh" }}
          >
            {d.description}
          </span>
        </div>
        <div style={{ width: "34cqh", height: "34cqh", flexShrink: 0 }}>
          <WeatherIcon code={d.code} isDay={d.isDay} accent={accent} animated={animated} />
        </div>
      </div>
      <div
        className="mt-auto grid gap-[1.5cqmin] pt-[2cqmin]"
        style={{
          gridTemplateColumns: `repeat(${days.length || 1}, minmax(0, 1fr))`,
          borderTop: "1px solid rgba(255,255,255,0.18)",
        }}
      >
        {days.map((day, i) => (
          <div
            key={day.date}
            className="flex flex-col items-center gap-[0.4cqh]"
            style={{ fontSize: "4.2cqh", opacity: 0.95 }}
          >
            <span style={{ opacity: 0.8 }}>
              {i === 0 ? "Hoje" : fmtDate(day.date)}
            </span>
            <div style={{ width: "12cqh", height: "12cqh" }}>
              <WeatherIcon code={day.code} accent={accent} animated={animated} />
            </div>
            <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
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
  const days = (d.forecast ?? []).slice(0, 6);
  return (
    <div
      className="flex h-full w-full flex-col items-center gap-[1.5cqh] p-[4cqmin] text-center overflow-y-auto"
      style={shell}
    >
      <span
        style={{ fontSize: "4.5cqh", fontWeight: 600, letterSpacing: "0.1em" }}
        className="uppercase opacity-80"
      >
        {d.city}
      </span>
      <div style={{ width: "32cqmin", height: "32cqmin" }}>
        <WeatherIcon code={d.code} isDay={d.isDay} accent={accent} animated={animated} />
      </div>
      <span
        className="leading-none"
        style={{ fontSize: "18cqh", fontWeight: 700, letterSpacing: "-0.03em" }}
      >
        {d.temp}
        <span style={{ fontSize: "8cqh", fontWeight: 500, opacity: 0.75 }}>
          {d.unit}
        </span>
      </span>
      <span style={{ fontSize: "4cqh", opacity: 0.9 }}>{d.description}</span>
      <div
        className="mt-auto flex w-full flex-col gap-[0.8cqh] pt-[1.5cqh]"
        style={{ borderTop: "1px solid rgba(255,255,255,0.18)" }}
      >
        {days.map((day, i) => (
          <div
            key={day.date}
            className="flex items-center justify-between gap-[2cqmin] px-[1cqh]"
            style={{ fontSize: "4cqh" }}
          >
            <span style={{ opacity: 0.85, minWidth: "10cqh", textAlign: "left" }}>
              {i === 0 ? "Hoje" : fmtDate(day.date)}
            </span>
            <div style={{ width: "7cqh", height: "7cqh" }}>
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
