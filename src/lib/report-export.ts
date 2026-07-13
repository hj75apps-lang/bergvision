type PlayerRow = {
  id: string;
  name: string;
  status: string | null;
  orientation: string | null;
  resolution: string | null;
  last_heartbeat: string | null;
  current_template_id: string | null;
};

type MediaRow = {
  id: string;
  name: string;
  type: string | null;
  file_size: number | null;
  size: number | null;
  duration: number | null;
  created_at: string | null;
};

type TemplateRow = {
  id: string;
  name: string;
  type: string | null;
  is_system: boolean | null;
  orientation: string | null;
  created_at: string | null;
};

type PlaylistRow = {
  id: string;
  name: string;
  is_active: boolean | null;
  schedule_date_start: string | null;
  schedule_date_end: string | null;
  schedule_start: string | null;
  schedule_end: string | null;
  schedule_days: number[] | null;
  created_at: string | null;
  items_count?: { count: number }[] | null;
  players_count?: { count: number }[] | null;
};

export type ReportSnapshot = {
  generatedAt: Date;
  organization: string;
  players: PlayerRow[];
  media: MediaRow[];
  templates: TemplateRow[];
  playlists: PlaylistRow[];
  kpis: {
    playersTotal: number;
    playersOnline: number;
    playersOffline: number;
    playlistsTotal: number;
    playlistsActive: number;
    playlistsScheduled: number;
    templatesTotal: number;
    templatesStudio: number;
    mediaTotal: number;
    mediaBytes: number;
    mediaBytesFormatted: string;
  };
  templateNameById: Record<string, string>;
};

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stamp(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Array<Record<string, unknown>>, headers: string[]): string {
  const lines = [headers.join(";")];
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape(r[h])).join(";"));
  }
  // BOM for Excel PT-BR
  return "\uFEFF" + lines.join("\r\n");
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR");
}

function fmtOrientation(o: string | null | undefined): string {
  if (!o) return "";
  const v = o.toLowerCase();
  if (v === "landscape" || v === "horizontal") return "Paisagem";
  if (v === "portrait" || v === "vertical") return "Retrato";
  if (v === "both") return "Ambas";
  return o;
}

export function exportJson(snap: ReportSnapshot) {
  const payload = {
    geradoEm: snap.generatedAt.toISOString(),
    organizacao: snap.organization,
    indicadores: snap.kpis,
    players: snap.players,
    playlists: snap.playlists,
    templates: snap.templates,
    midias: snap.media,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  download(blob, `relatorio-berg-vision-${stamp(snap.generatedAt)}.json`);
}

export function exportCsv(snap: ReportSnapshot) {
  const playersCsv = toCsv(
    snap.players.map((p) => ({
      Nome: p.name,
      Status: p.status ?? "",
      Orientação: fmtOrientation(p.orientation),
      Resolução: p.resolution ?? "",
      "Template ativo": p.current_template_id
        ? snap.templateNameById[p.current_template_id] ?? ""
        : "",
      "Último heartbeat": fmtDate(p.last_heartbeat),
    })),
    ["Nome", "Status", "Orientação", "Resolução", "Template ativo", "Último heartbeat"],
  );
  const playlistsCsv = toCsv(
    snap.playlists.map((pl) => ({
      Nome: pl.name,
      Ativa: pl.is_active ? "Sim" : "Não",
      Itens: pl.items_count?.[0]?.count ?? 0,
      Players: pl.players_count?.[0]?.count ?? 0,
      "Data início": pl.schedule_date_start ?? "",
      "Data fim": pl.schedule_date_end ?? "",
      "Janela início": pl.schedule_start ?? "",
      "Janela fim": pl.schedule_end ?? "",
      "Criada em": fmtDate(pl.created_at),
    })),
    [
      "Nome",
      "Ativa",
      "Itens",
      "Players",
      "Data início",
      "Data fim",
      "Janela início",
      "Janela fim",
      "Criada em",
    ],
  );
  const templatesCsv = toCsv(
    snap.templates.map((t) => ({
      Nome: t.name,
      Origem: t.is_system ? "Sistema" : "Studio",
      Tipo: (t.type ?? "grid") === "canvas" ? "Canvas" : "Grid",
      Orientação: fmtOrientation(t.orientation),
      "Criado em": fmtDate(t.created_at),
    })),
    ["Nome", "Origem", "Tipo", "Orientação", "Criado em"],
  );
  const mediaCsv = toCsv(
    snap.media.map((m) => ({
      Nome: m.name,
      Tipo: m.type ?? "",
      "Tamanho (bytes)": m.file_size ?? m.size ?? 0,
      "Duração (s)": m.duration ?? "",
      "Enviado em": fmtDate(m.created_at),
    })),
    ["Nome", "Tipo", "Tamanho (bytes)", "Duração (s)", "Enviado em"],
  );

  const s = stamp(snap.generatedAt);
  download(new Blob([playersCsv], { type: "text/csv;charset=utf-8" }), `relatorio-players-${s}.csv`);
  download(
    new Blob([playlistsCsv], { type: "text/csv;charset=utf-8" }),
    `relatorio-playlists-${s}.csv`,
  );
  download(
    new Blob([templatesCsv], { type: "text/csv;charset=utf-8" }),
    `relatorio-templates-${s}.csv`,
  );
  download(new Blob([mediaCsv], { type: "text/csv;charset=utf-8" }), `relatorio-midias-${s}.csv`);
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml(snap: ReportSnapshot): string {
  const k = snap.kpis;
  const dateStr = snap.generatedAt.toLocaleString("pt-BR");

  const playersRows = snap.players
    .map((p) => {
      const online =
        p.last_heartbeat &&
        Date.now() - new Date(p.last_heartbeat).getTime() < 60_000 &&
        (p.status ?? "").toLowerCase() === "online";
      return `<tr>
        <td>${esc(p.name)}</td>
        <td><span class="pill ${online ? "ok" : "bad"}">${online ? "Online" : "Offline"}</span></td>
        <td>${esc(fmtOrientation(p.orientation))}</td>
        <td>${esc(p.resolution ?? "—")}</td>
        <td>${esc(p.current_template_id ? snap.templateNameById[p.current_template_id] ?? "—" : "—")}</td>
        <td>${esc(fmtDate(p.last_heartbeat) || "nunca")}</td>
      </tr>`;
    })
    .join("");

  const playlistsRows = snap.playlists
    .map((pl) => {
      const items = pl.items_count?.[0]?.count ?? 0;
      const pls = pl.players_count?.[0]?.count ?? 0;
      return `<tr>
        <td>${esc(pl.name)}</td>
        <td>${pl.is_active ? "Ativa" : "Inativa"}</td>
        <td style="text-align:right">${items}</td>
        <td style="text-align:right">${pls}</td>
        <td>${esc(pl.schedule_date_start ?? "—")} → ${esc(pl.schedule_date_end ?? "—")}</td>
        <td>${esc((pl.schedule_start ?? "—") + " – " + (pl.schedule_end ?? "—"))}</td>
        <td>${esc(fmtDate(pl.created_at))}</td>
      </tr>`;
    })
    .join("");

  const templatesRows = snap.templates
    .map(
      (t) => `<tr>
        <td>${esc(t.name)}</td>
        <td>${t.is_system ? "Sistema" : "Studio"}</td>
        <td>${(t.type ?? "grid") === "canvas" ? "Canvas" : "Grid"}</td>
        <td>${esc(fmtOrientation(t.orientation))}</td>
        <td>${esc(fmtDate(t.created_at))}</td>
      </tr>`,
    )
    .join("");

  const mediaRows = snap.media
    .map(
      (m) => `<tr>
        <td>${esc(m.name)}</td>
        <td>${esc(m.type ?? "—")}</td>
        <td style="text-align:right">${(m.file_size ?? m.size ?? 0).toLocaleString("pt-BR")}</td>
        <td>${m.duration ?? "—"}</td>
        <td>${esc(fmtDate(m.created_at))}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Relatório Berg Vision — ${esc(dateStr)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
    color: #0f172a;
    background: #f8fafc;
    padding: 32px;
  }
  header { margin-bottom: 24px; }
  .eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: 0.18em; color: #64748b; }
  h1 { margin: 4px 0; font-size: 28px; letter-spacing: -0.02em; }
  .meta { color: #64748b; font-size: 13px; }
  section { margin-top: 28px; }
  h2 { font-size: 18px; margin: 0 0 12px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .kpi { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px; }
  .kpi .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #64748b; }
  .kpi .value { font-size: 28px; font-weight: 600; margin-top: 4px; }
  .kpi .hint { font-size: 12px; color: #64748b; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 2px rgba(15,23,42,0.04); font-size: 13px; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
  th { background: #f1f5f9; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #475569; }
  tr:last-child td { border-bottom: 0; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .pill.ok { background: #dcfce7; color: #15803d; }
  .pill.bad { background: #fee2e2; color: #b91c1c; }
  footer { margin-top: 40px; font-size: 11px; color: #94a3b8; text-align: center; }
  @media print {
    body { background: #fff; padding: 16px; }
    section { break-inside: avoid; }
    table { box-shadow: none; }
  }
</style>
</head>
<body>
  <header>
    <div class="eyebrow">Berg Vision · Relatório operacional</div>
    <h1>Relatório da rede</h1>
    <div class="meta">Gerado em ${esc(dateStr)} · Organização ${esc(snap.organization)}</div>
  </header>

  <section>
    <h2>Indicadores</h2>
    <div class="kpis">
      <div class="kpi"><div class="label">Players</div><div class="value">${k.playersTotal}</div><div class="hint">${k.playersOnline} online · ${k.playersOffline} offline</div></div>
      <div class="kpi"><div class="label">Playlists</div><div class="value">${k.playlistsTotal}</div><div class="hint">${k.playlistsActive} no ar · ${k.playlistsScheduled} programadas</div></div>
      <div class="kpi"><div class="label">Templates</div><div class="value">${k.templatesTotal}</div><div class="hint">${k.templatesStudio} do Studio</div></div>
      <div class="kpi"><div class="label">Mídias</div><div class="value">${k.mediaTotal}</div><div class="hint">${esc(k.mediaBytesFormatted)}</div></div>
    </div>
  </section>

  <section>
    <h2>Execução por player (${snap.players.length})</h2>
    ${snap.players.length === 0 ? "<p>Nenhum player pareado.</p>" : `<table><thead><tr><th>Player</th><th>Status</th><th>Orientação</th><th>Resolução</th><th>Template ativo</th><th>Último heartbeat</th></tr></thead><tbody>${playersRows}</tbody></table>`}
  </section>

  <section>
    <h2>Campanhas / Playlists (${snap.playlists.length})</h2>
    ${snap.playlists.length === 0 ? "<p>Nenhuma playlist cadastrada.</p>" : `<table><thead><tr><th>Playlist</th><th>Estado</th><th style="text-align:right">Itens</th><th style="text-align:right">Players</th><th>Período</th><th>Janela diária</th><th>Criada em</th></tr></thead><tbody>${playlistsRows}</tbody></table>`}
  </section>

  <section>
    <h2>Templates (${snap.templates.length})</h2>
    ${snap.templates.length === 0 ? "<p>Nenhum template cadastrado.</p>" : `<table><thead><tr><th>Nome</th><th>Origem</th><th>Tipo</th><th>Orientação</th><th>Criado em</th></tr></thead><tbody>${templatesRows}</tbody></table>`}
  </section>

  <section>
    <h2>Biblioteca de mídias (${snap.media.length})</h2>
    ${snap.media.length === 0 ? "<p>Nenhuma mídia enviada.</p>" : `<table><thead><tr><th>Nome</th><th>Tipo</th><th style="text-align:right">Tamanho (bytes)</th><th>Duração (s)</th><th>Enviado em</th></tr></thead><tbody>${mediaRows}</tbody></table>`}
  </section>

  <footer>Berg Vision Admin · Relatório gerado automaticamente</footer>
</body>
</html>`;
}

export function exportHtml(snap: ReportSnapshot) {
  const html = buildHtml(snap);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  download(blob, `relatorio-berg-vision-${stamp(snap.generatedAt)}.html`);
}

export function exportPdf(snap: ReportSnapshot) {
  const html = buildHtml(snap);
  const win = window.open("", "_blank", "noopener,noreferrer,width=1024,height=768");
  if (!win) {
    alert(
      "Não foi possível abrir a janela de impressão. Verifique se o navegador está bloqueando pop-ups.",
    );
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  const trigger = () => {
    try {
      win.focus();
      win.print();
    } catch {
      /* ignore */
    }
  };
  // Give the browser a beat to layout before printing
  if (win.document.readyState === "complete") {
    setTimeout(trigger, 300);
  } else {
    win.addEventListener("load", () => setTimeout(trigger, 200));
  }
}