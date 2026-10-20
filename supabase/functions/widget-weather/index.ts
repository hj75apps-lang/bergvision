// Edge Function: widget-weather
//
// POST { city: string, units?: "metric" | "imperial" }
// Requer JWT do Supabase Auth (Authorization: Bearer ...).
//
// Usa Open-Meteo (sem chave de API) para geocodificação + previsão atual.
// Retorna: { temp, unit, code, description, city, country }
//
// Deploy:
//   supabase functions deploy widget-weather

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// WMO weather codes → descrição PT-BR curta
const WMO: Record<number, string> = {
  0: "Céu limpo",
  1: "Predominantemente limpo",
  2: "Parcialmente nublado",
  3: "Nublado",
  45: "Neblina",
  48: "Neblina com geada",
  51: "Garoa fraca",
  53: "Garoa",
  55: "Garoa intensa",
  61: "Chuva fraca",
  63: "Chuva",
  65: "Chuva forte",
  66: "Chuva congelante",
  67: "Chuva congelante forte",
  71: "Neve fraca",
  73: "Neve",
  75: "Neve intensa",
  77: "Grãos de neve",
  80: "Pancadas de chuva",
  81: "Pancadas fortes",
  82: "Pancadas violentas",
  85: "Pancadas de neve",
  86: "Pancadas de neve fortes",
  95: "Trovoadas",
  96: "Trovoadas com granizo",
  99: "Trovoadas com granizo forte",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey =
    Deno.env.get("ANON_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return json({ error: "missing_env" }, 500);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  // Aceita JWT de usuário do Admin OU device_token da tela pareada.
  const deviceToken = String(body?.device_token ?? "").trim();
  if (deviceToken) {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) return json({ error: "missing_env" }, 500);
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: dev } = await admin
      .from("devices").select("id").eq("token", deviceToken).maybeSingle();
    if (!dev) return json({ error: "invalid_device_token" }, 401);
  } else {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "missing_authorization" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "invalid_token" }, 401);
  }

  const city = String(body?.city ?? "").trim().slice(0, 120);
  const units = body?.units === "imperial" ? "imperial" : "metric";
  const latIn = body?.latitude == null ? NaN : Number(body.latitude);
  const lonIn = body?.longitude == null ? NaN : Number(body.longitude);
  const hasCoords = Number.isFinite(latIn) && Number.isFinite(lonIn);
  if (!city && !hasCoords) return json({ error: "missing_city" }, 400);

  const num = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : v == null ? NaN : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const round = (v: unknown, fb: number | null = null) => {
    const n = num(v);
    return n == null ? fb : Math.round(n);
  };
  const once = (input: string | URL, ms: number, init: RequestInit = {}) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t));
  };
  // Até 3 tentativas: falhas de rede/timeout ou 5xx/429 transitórios do provedor.
  const timed = async (input: string | URL, ms: number, init: RequestInit = {}) => {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await once(input, ms + attempt * 4000, init);
        if (r.ok || (r.status < 500 && r.status !== 429) || attempt === 2) return r;
      } catch (e) {
        lastErr = e;
      }
      await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
    }
    throw lastErr ?? new Error("fetch_failed");
  };

  // Geocodificação reversa: BigDataCloud → Nominatim → coordenadas formatadas.
  async function reverseGeocode(lat: number, lon: number) {
    try {
      const u = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
      u.searchParams.set("latitude", String(lat));
      u.searchParams.set("longitude", String(lon));
      u.searchParams.set("localityLanguage", "pt");
      const r = await timed(u, 5000);
      if (r.ok) {
        const j = await r.json();
        const name = String(j?.city || j?.locality || "").trim();
        if (name) return { name, country: String(j?.countryCode ?? "") };
      }
    } catch { /* fallback */ }
    try {
      const u = new URL("https://nominatim.openstreetmap.org/reverse");
      u.searchParams.set("lat", String(lat));
      u.searchParams.set("lon", String(lon));
      u.searchParams.set("format", "jsonv2");
      u.searchParams.set("accept-language", "pt-BR");
      u.searchParams.set("zoom", "10");
      const r = await timed(u, 5000, {
        headers: { "User-Agent": "BergVision-Widget/1.0 (+https://bergvision.lovable.app)" },
      });
      if (r.ok) {
        const j = await r.json();
        const a = j?.address ?? {};
        const name = String(a.city || a.town || a.village || a.municipality || a.county || "").trim();
        if (name) return { name, country: String(a.country_code ?? "").toUpperCase() };
      }
    } catch { /* fallback */ }
    return { name: `${lat.toFixed(3)}, ${lon.toFixed(3)}`, country: "" };
  }

  try {
    let place: any = { latitude: latIn, longitude: lonIn, name: city, country_code: "" };
    if (!hasCoords) {
      const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
      geoUrl.searchParams.set("name", city);
      geoUrl.searchParams.set("count", "1");
      geoUrl.searchParams.set("language", "pt");
      geoUrl.searchParams.set("format", "json");
      const geoRes = await timed(geoUrl, 8000);
      if (!geoRes.ok) return json({ error: "geocoding_failed" }, 502);
      const geo = await geoRes.json();
      place = geo?.results?.[0];
      if (!place) return json({ error: "city_not_found" }, 404);
    } else if (!city) {
      const rg = await reverseGeocode(latIn, lonIn);
      place.name = rg.name;
      place.country_code = rg.country;
    }

    const unit = units === "imperial" ? "fahrenheit" : "celsius";
    const wUrl = new URL("https://api.open-meteo.com/v1/forecast");
    wUrl.searchParams.set("latitude", String(place.latitude));
    wUrl.searchParams.set("longitude", String(place.longitude));
    wUrl.searchParams.set(
      "current",
      "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day",
    );
    wUrl.searchParams.set(
      "hourly",
      "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,precipitation_probability",
    );
    wUrl.searchParams.set(
      "daily",
      "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max",
    );
    wUrl.searchParams.set("forecast_days", "6");
    wUrl.searchParams.set("temperature_unit", unit);
    wUrl.searchParams.set("wind_speed_unit", units === "imperial" ? "mph" : "kmh");
    wUrl.searchParams.set("timezone", "auto");
    const wRes = await timed(wUrl, 10000);
    if (!wRes.ok) return json({ error: "weather_failed", status: wRes.status }, 502);
    const w = await wRes.json();
    const cur = w?.current;
    if (!cur || num(cur.temperature_2m) == null) return json({ error: "no_current" }, 502);

    const code = round(cur.weather_code, 0) as number;
    const daily = w?.daily ?? {};
    const dates: string[] = Array.isArray(daily.time) ? daily.time : [];
    const days = dates.map((date, i) => ({
      date,
      max: round(daily.temperature_2m_max?.[i], 0) as number,
      min: round(daily.temperature_2m_min?.[i], 0) as number,
      code: round(daily.weather_code?.[i], 0) as number,
      sunrise: daily.sunrise?.[i] ?? null,
      sunset: daily.sunset?.[i] ?? null,
      precipitationMax: round(daily.precipitation_probability_max?.[i]),
      description: WMO[round(daily.weather_code?.[i], 0) as number] ?? "—",
    }));

    // Previsão horária: próximas 24h a partir da hora atual local.
    const hourly = w?.hourly ?? {};
    const hTimes: string[] = Array.isArray(hourly.time) ? hourly.time : [];
    const curHour = String(cur.time ?? "").slice(0, 13);
    let start = hTimes.findIndex((t) => t.slice(0, 13) >= curHour);
    if (start < 0) start = 0;
    const hours = hTimes.slice(start, start + 24).map((time, k) => {
      const i = start + k;
      return {
        time,
        temp: round(hourly.temperature_2m?.[i]),
        feelsLike: round(hourly.apparent_temperature?.[i]),
        humidity: round(hourly.relative_humidity_2m?.[i]),
        wind: round(hourly.wind_speed_10m?.[i]),
        code: round(hourly.weather_code?.[i], 0) as number,
        precipitation: round(hourly.precipitation_probability?.[i]),
      };
    });

    const temp = num(cur.temperature_2m) as number;
    return json(
      {
        temp: Math.round(temp),
        // Campos do contrato do app da tela (compatibilidade)
        temperature: temp,
        units,
        windSpeed: num(cur.wind_speed_10m) ?? 0,
        observedAt: cur.time ?? new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
        timezone: w?.timezone ?? null,
        latitude: num(place.latitude),
        longitude: num(place.longitude),
        source: "open-meteo",
        feelsLike: round(cur.apparent_temperature, Math.round(temp)),
        unit: units === "imperial" ? "°F" : "°C",
        code,
        isDay: num(cur.is_day) !== 0,
        humidity: round(cur.relative_humidity_2m, 0),
        wind: round(cur.wind_speed_10m, 0),
        windUnit: units === "imperial" ? "mph" : "km/h",
        description: WMO[code] ?? "—",
        city: place.name,
        country: place.country_code ?? place.country ?? "",
        forecast: days,
        hourly: hours,
      },
      200,
    );
  } catch (e) {
    console.log("[widget-weather:error]", (e as Error).name);
    return json({ error: "fetch_failed" }, 502);
  }
});