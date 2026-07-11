import type { CSSProperties } from "react";

/**
 * Ícones SVG animados para códigos WMO do Open-Meteo.
 * Todos são desenhados em viewBox 100x100 e usam `currentColor` no traço
 * principal para herdar cor do container quando necessário.
 */

type IconKind =
  | "sun"
  | "moon"
  | "cloud"
  | "partly-day"
  | "partly-night"
  | "rain"
  | "storm"
  | "snow"
  | "fog";

export function wmoToIcon(code: number, isDay = true): IconKind {
  if (code === 0) return isDay ? "sun" : "moon";
  if (code === 1 || code === 2) return isDay ? "partly-day" : "partly-night";
  if (code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if ([51, 53, 55, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "storm";
  return "cloud";
}

/** Retorna o par (from, to) de cores de fundo por condição, para tema "gradient". */
export function wmoToGradient(
  code: number,
  isDay = true,
): { from: string; to: string; accent: string } {
  if (code === 0)
    return isDay
      ? { from: "#F59E0B", to: "#EF4444", accent: "#FDE68A" }
      : { from: "#1E3A8A", to: "#0F172A", accent: "#93C5FD" };
  if (code === 1 || code === 2 || code === 3)
    return isDay
      ? { from: "#3B82F6", to: "#6366F1", accent: "#DBEAFE" }
      : { from: "#1E293B", to: "#0F172A", accent: "#94A3B8" };
  if (code === 45 || code === 48)
    return { from: "#64748B", to: "#334155", accent: "#E2E8F0" };
  if ([51, 53, 55, 61, 63, 65, 66, 67, 80, 81, 82].includes(code))
    return { from: "#0EA5E9", to: "#1E40AF", accent: "#BAE6FD" };
  if ([71, 73, 75, 77, 85, 86].includes(code))
    return { from: "#93C5FD", to: "#60A5FA", accent: "#F0F9FF" };
  if ([95, 96, 99].includes(code))
    return { from: "#4C1D95", to: "#111827", accent: "#FBBF24" };
  return { from: "#475569", to: "#1E293B", accent: "#E2E8F0" };
}

export function WeatherIcon({
  code,
  isDay = true,
  size = "100%",
  animated = true,
  accent,
}: {
  code: number;
  isDay?: boolean;
  size?: number | string;
  animated?: boolean;
  accent?: string;
}) {
  const kind = wmoToIcon(code, isDay);
  const style: CSSProperties = {
    width: size,
    height: size,
    display: "block",
    overflow: "visible",
  };
  return (
    <svg viewBox="0 0 100 100" style={style} aria-hidden>
      <defs>
        <style>{`
          @keyframes bv-spin { to { transform: rotate(360deg); } }
          @keyframes bv-float { 0%,100% { transform: translateX(0); } 50% { transform: translateX(4px); } }
          @keyframes bv-drop { 0% { transform: translateY(-6px); opacity: 0; } 30% { opacity: 1; } 100% { transform: translateY(28px); opacity: 0; } }
          @keyframes bv-snow { 0% { transform: translateY(-4px) rotate(0); opacity: 0; } 30% { opacity: 1; } 100% { transform: translateY(28px) rotate(180deg); opacity: 0; } }
          @keyframes bv-flash { 0%, 60%, 100% { opacity: 0.15; } 65%, 70% { opacity: 1; } }
          @keyframes bv-pulse { 0%,100% { opacity: 0.6; transform: scale(1); } 50% { opacity: 1; transform: scale(1.06); } }
          @keyframes bv-fog { 0%,100% { transform: translateX(-2px); } 50% { transform: translateX(6px); } }
          .bv-sun-core { transform-origin: 50px 50px; ${animated ? "animation: bv-spin 18s linear infinite;" : ""} }
          .bv-moon-glow { transform-origin: 50px 50px; ${animated ? "animation: bv-pulse 4s ease-in-out infinite;" : ""} }
          .bv-cloud { transform-origin: center; ${animated ? "animation: bv-float 5s ease-in-out infinite;" : ""} }
          .bv-drop { ${animated ? "animation: bv-drop 1.4s linear infinite;" : ""} }
          .bv-flake { transform-origin: center; ${animated ? "animation: bv-snow 2.2s linear infinite;" : ""} }
          .bv-bolt { ${animated ? "animation: bv-flash 2.2s ease-in-out infinite;" : ""} }
          .bv-fog-line { ${animated ? "animation: bv-fog 4s ease-in-out infinite;" : ""} }
        `}</style>
      </defs>
      {kind === "sun" && <SunGraphic accent={accent} />}
      {kind === "moon" && <MoonGraphic accent={accent} />}
      {kind === "cloud" && <CloudGraphic />}
      {kind === "partly-day" && <PartlyGraphic isDay />}
      {kind === "partly-night" && <PartlyGraphic isDay={false} />}
      {kind === "rain" && <RainGraphic />}
      {kind === "storm" && <StormGraphic />}
      {kind === "snow" && <SnowGraphic />}
      {kind === "fog" && <FogGraphic />}
    </svg>
  );
}

function SunGraphic({ accent = "#FDE68A" }: { accent?: string }) {
  return (
    <g className="bv-sun-core">
      <circle cx="50" cy="50" r="18" fill="#FDE047" />
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i * Math.PI) / 4;
        const x1 = 50 + Math.cos(angle) * 26;
        const y1 = 50 + Math.sin(angle) * 26;
        const x2 = 50 + Math.cos(angle) * 36;
        const y2 = 50 + Math.sin(angle) * 36;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={accent}
            strokeWidth="4"
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
}

function MoonGraphic({ accent = "#E0E7FF" }: { accent?: string }) {
  return (
    <g>
      <circle className="bv-moon-glow" cx="50" cy="50" r="30" fill={accent} opacity="0.25" />
      <path
        d="M62 30 A22 22 0 1 0 70 68 A18 18 0 0 1 62 30 Z"
        fill="#F8FAFC"
      />
    </g>
  );
}

function CloudBody({ x = 0, y = 0, fill = "#F1F5F9" }: { x?: number; y?: number; fill?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path
        d="M25 60 A15 15 0 0 1 42 45 A20 20 0 0 1 78 50 A12 12 0 0 1 78 74 L28 74 A14 14 0 0 1 25 60 Z"
        fill={fill}
      />
    </g>
  );
}

function CloudGraphic() {
  return (
    <g className="bv-cloud">
      <CloudBody y={-6} fill="#CBD5E1" />
      <CloudBody fill="#F8FAFC" />
    </g>
  );
}

function PartlyGraphic({ isDay }: { isDay: boolean }) {
  return (
    <g>
      <g transform="translate(20 -8) scale(0.55)">
        {isDay ? <SunGraphic /> : <MoonGraphic />}
      </g>
      <g className="bv-cloud">
        <CloudBody y={10} fill="#F1F5F9" />
      </g>
    </g>
  );
}

function RainGraphic() {
  return (
    <g>
      <CloudBody y={-4} fill="#CBD5E1" />
      {[32, 46, 60, 74].map((x, i) => (
        <line
          key={x}
          className="bv-drop"
          x1={x}
          y1={70}
          x2={x - 3}
          y2={82}
          stroke="#60A5FA"
          strokeWidth="3"
          strokeLinecap="round"
          style={{ animationDelay: `${i * 0.25}s` }}
        />
      ))}
    </g>
  );
}

function StormGraphic() {
  return (
    <g>
      <CloudBody y={-6} fill="#475569" />
      <polygon
        className="bv-bolt"
        points="50,68 42,84 52,84 46,96 62,78 52,78 58,68"
        fill="#FBBF24"
      />
    </g>
  );
}

function SnowGraphic() {
  return (
    <g>
      <CloudBody y={-4} fill="#E2E8F0" />
      {[35, 50, 65].map((x, i) => (
        <text
          key={x}
          className="bv-flake"
          x={x}
          y={82}
          textAnchor="middle"
          fontSize="14"
          fill="#F8FAFC"
          style={{ animationDelay: `${i * 0.4}s` }}
        >
          ❄
        </text>
      ))}
    </g>
  );
}

function FogGraphic() {
  return (
    <g>
      <CloudBody y={-10} fill="#94A3B8" />
      {[62, 72, 82].map((y, i) => (
        <line
          key={y}
          className="bv-fog-line"
          x1="18"
          y1={y}
          x2="82"
          y2={y}
          stroke="#E2E8F0"
          strokeWidth="4"
          strokeLinecap="round"
          style={{ animationDelay: `${i * 0.3}s` }}
        />
      ))}
    </g>
  );
}