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

  try {
    let place: any = { latitude: latIn, longitude: lonIn, name: city, country_code: "" };
    if (!hasCoords) {
      const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
      geoUrl.searchParams.set("name", city);
      geoUrl.searchParams.set("count", "1");
      geoUrl.searchParams.set("language", "pt");
      geoUrl.searchParams.set("format", "json");
      const geoRes = await fetch(geoUrl);
      if (!geoRes.ok) return json({ error: "geocoding_failed" }, 502);
      const geo = await geoRes.json();
      place = geo?.results?.[0];
      if (!place) return json({ error: "city_not_found" }, 404);
    }

    const unit = units === "imperial" ? "fahrenheit" : "celsius";
    const wUrl = new URL("https://api.open-meteo.com/v1/forecast");
    wUrl.searchParams.set("latitude", String(place.latitude));
    wUrl.searchParams.set("longitude", String(place.longitude));
    wUrl.searchParams.set(
      "current",
      "temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m,apparent_temperature,is_day",
    );
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
    wUrl.searchParams.set(
      "forecast_days",
      "6",
    );
    wUrl.searchParams.set("temperature_unit", unit);
    wUrl.searchParams.set(
      "wind_speed_unit",
      units === "imperial" ? "mph" : "kmh",
    );
    wUrl.searchParams.set("timezone", "auto");
    const wRes = await fetch(wUrl);
    if (!wRes.ok) return json({ error: "weather_failed" }, 502);
    const w = await wRes.json();
    const cur = w?.current;
    if (!cur) return json({ error: "no_current" }, 502);

    const code = Number(cur.weather_code ?? 0);
    const daily = w?.daily ?? {};
    const days: Array<{ date: string; max: number; min: number; code: number }> =
      [];
    const dates: string[] = daily.time ?? [];
    for (let i = 0; i < dates.length; i++) {
      days.push({
        date: dates[i],
        max: Math.round(Number(daily.temperature_2m_max?.[i] ?? 0)),
        min: Math.round(Number(daily.temperature_2m_min?.[i] ?? 0)),
        code: Number(daily.weather_code?.[i] ?? 0),
      });
    }
    const hourly = w?.hourly ?? {};
    const hourlyList: Array<{ time: string; temp: number; feelsLike: number; humidity: number; wind: number; code: number; pop: number }> = [];
    const hTimes: string[] = hourly.time ?? [];
    for (let i = 0; i < hTimes.length; i++) {
      hourlyList.push({
        time: hTimes[i],
        temp: Math.round(Number(hourly.temperature_2m?.[i] ?? 0)),
        feelsLike: Math.round(Number(hourly.apparent_temperature?.[i] ?? 0)),
        humidity: Math.round(Number(hourly.relative_humidity_2m?.[i] ?? 0)),
        wind: Math.round(Number(hourly.wind_speed_10m?.[i] ?? 0)),
        code: Number(hourly.weather_code?.[i] ?? 0),
        pop: Number(hourly.precipitation_probability?.[i] ?? 0),
      });
    }

    return json(
      {
        temp: Math.round(Number(cur.temperature_2m)),
        temperature: Number(cur.temperature_2m),
        units,
        windSpeed: Number(cur.wind_speed_10m ?? 0),
        observedAt: cur.time ?? new Date().toISOString(),
        source: "open-meteo",
        feelsLike: Math.round(Number(cur.apparent_temperature ?? cur.temperature_2m)),
        unit: units === "imperial" ? "°F" : "°C",
        code,
        isDay: Number(cur.is_day ?? 1) === 1,
        humidity: Math.round(Number(cur.relative_humidity_2m ?? 0)),
        wind: Math.round(Number(cur.wind_speed_10m ?? 0)),
        windUnit: units === "imperial" ? "mph" : "km/h",
        description: WMO[code] ?? "—",
        city: place.name,
        country: place.country_code ?? place.country ?? "",
        forecast: days,
        hourly: hourlyList,
      },
      200,
    );
  } catch (e) {
    return json({ error: "fetch_failed", detail: (e as Error).message }, 502);
  }
});