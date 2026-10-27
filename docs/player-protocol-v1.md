# Protocolo Admin ↔ Player — v1.0

Documento canônico. Deve ser idêntico nos projetos Admin e Player. Implementação de referência: `src/lib/protocol/v1.ts` (schemas zod) e `src/lib/protocol/v1.test.ts` (testes de contrato). Copie os dois arquivos sem alterações.

## 1. Envelope
`{ protocolVersion:"1.0", messageId:uuid, tenantId:uuid, deviceId:uuid, type, sentAt:ISO-UTC, payload }`
- `type`: manifest | command | ack | device_status | playback_events | heartbeat.
- `tenantId`/`deviceId` são conferidos contra a identidade autenticada (device_token). Divergência → `identity_mismatch`.
- `protocolVersion` diferente → `incompatible_version` (não processar).

## 2. Manifesto
`{ playlistId, revision, contentHash(sha256), timezone(IANA), generatedAt(UTC), items[], fallbackItemId|null }`
- `revision` cresce por playlist. Rollback = nova revisão com conteúdo anterior (histórico preservado).
- Revisão ≤ desejada/ativa é ignorada. Relógio do aparelho não decide ordem: só `revision`.
- Eventos em UTC (sufixo Z). Agendamento usa `timezone` + intervalos explícitos.

## 3. Item
`{ itemId, assetId, assetVersion, kind, provider, sourceRef, durationMs, schedule, variants[], cachePolicy }`
- `kind`: video | image | template | live. `durationMs` em ms; null só para live.
- `provider`: youtube | vimeo_embed | direct. `cachePolicy`: forbidden | authorized.
- `sourceRef` é estável (ID YouTube, ID Vimeo, assetId). URLs temporárias vão em `variants[].url` com `expiresAt`; renovar 5 min antes.
- YouTube: sempre `forbidden`, sem variantes, só embed oficial. Proibido extrair/baixar/proxiar MP4.
- Vimeo embed: `forbidden`. Arquivo Vimeo só como `direct`/`authorized` quando plano e direitos permitem, com URL resolvida no backend.
- direct: ao menos uma variante. Perfil recomendado: MP4 H.264 High/AAC, ≤1080p, ≤8 Mbps, 30 fps, faststart (moov no início).
- live: `forbidden`.
- `schedule.validUntil`: após esse instante o item não é exibido, mesmo offline.

## 4. Comandos e ACK
Comando: `{ commandId, action, expiresAt, expectedRevision|null, args }`. Ações: PAUSE, RESUME, SKIP, RELOAD_MANIFEST, IDENTIFY, RESTART_APP, CLEAR_CACHE, CHECK_UPDATE (verifica e instala nova versão do APK; ACK detail com versão atual/nova).
- Dedup por `commandId` persistida entre reinícios. Repetido → reenvia o ACK salvo, não reexecuta (SKIP repetido não pula outro item).
- Vencido → ACK `expired`. `expectedRevision` diferente da ativa → `failed` (revision_mismatch).
- ACK `{ commandId, status, at, detail }`: received (persistido) | executed (concluído e verificado) | failed | expired. ACK não é confirmação de transporte.

## 5. Estados no dispositivo
- Manifesto: received → validated → prepared → activated | failed. Reportar `desiredRevision` e `activeRevision`.
- Item: ready_local (integridade sha256 verificada) | stream_only (depende da rede; não é cache nem reprodução) | blocked | failed.
- Preparado = arquivos obrigatórios verificados + fallback disponível. Ativação atômica na fronteira do item atual. Falha de sync nunca apaga a última programação válida.

## 6. Comunicação
- Realtime para avisos + consulta de reconciliação (snapshot completo) após reconexão e a cada 5 min.
- Timeout 15 s; retentativa com backoff exponencial e jitter total (1 s → 60 s).
- Heartbeat 30 s ±20%; indisponível após 120 s. Heartbeat não republica playlist nem reinicia mídia.
- Conexão com a gestão ≠ saúde da reprodução (campo `playback`).
- Eventos offline em fila limitada (500 eventos / 7 dias), envio em lotes de até 200, dedup por `eventId`.

## 7. Telemetria
`device_status`: revisões, estado do manifesto/itens, item atual, playback, playerVersion, androidVersion, webviewVersion, freeStorageBytes, lastError. Campos medidos usam `{ value, reason }`; `value:null` exige `reason`. Nunca inventar valores.
`playback_events`: start, buffering_start/end, recovery, fallback, error, com `timeToStartMs`/`bufferingMs` reais, separados por provider.

## 8. Mapeamento do protocolo atual (compatibilidade)
| Atual (produção) | v1 |
|---|---|
| `device_token` no corpo | identidade autenticada (tenantId/deviceId resolvidos no backend) |
| `get-player-schedule` → `playlists[]`, `now_playing` | snapshot de reconciliação; cada playlist vira um Manifesto |
| `device-heartbeat` | `heartbeat` + `device_status` |
| `blocked`, `paused_playlist_ids`, lista vazia | estado "pausado"; manter aviso, não apagar cache |
| canal Realtime `player:<id>` (identify) | comando IDENTIFY sem persistência (legado) |
Players antigos continuam usando o formato atual até atualizarem.

## 9. Pendências que dependem de banco
Persistir revisões, comandos, ACKs e telemetria exige tabelas novas (ex.: `playlist_revisions`, `device_commands`, `device_status`, `playback_events`) e Edge Functions. Não criadas: requer autorização explícita.
