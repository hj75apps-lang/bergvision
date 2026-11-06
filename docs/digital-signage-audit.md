# Auditoria de fidelidade entre painel e player

Data: 5 de novembro de 2026. Escopo: inspeção dos dois repositórios locais, comparação com fontes oficiais e validação controlada das transições Vimeo. Não é uma auditoria do banco ou das funções implantadas: não houve acesso autenticado à produção.

## Resultado esperado

Mídia indoor e TV corporativa usam um CMS para publicar conteúdo e programação; o player executa essa publicação no dispositivo. A comunicação precisa distinguir cinco fatos: publicação desejada, recebimento, preparação, ativação e exibição real. Uma resposta HTTP ou um heartbeat não comprovam que o conteúdo apareceu.

A arquitetura recomendada para BERG VISION é manter gestão/sincronização independentes da reprodução: o player continua executando a última publicação válida enquanto recebe e prepara a próxima. A ativação ocorre na fronteira entre itens, sem reiniciar a sequência a cada consulta. Não existe garantia de funcionamento offline para um iframe Vimeo/YouTube.

## Referências consultadas

- [Xibo CMS — apresentação oficial](https://github.com/xibosignage/xibo-cms): CMS e players específicos para Windows, Android, webOS e Tizen. A diversidade de aparelhos exige perfis de capacidade, não uma única suposição de GPU/decodificadores.
- [Xibo XMDS v7 — contrato oficial](https://github.com/xibosignage/xibo-cms/blob/c381486b1adee10b2c434b46c1f33e82bc2ab7ed/lib/Xmds/service_v7.wsdl): separa `Schedule`, `RequiredFiles`, `MediaInventory`, `NotifyStatus`, `SubmitLog` e `SubmitStats`. Isto sustenta a separação entre programação, disponibilidade de mídia, saúde e estatísticas de exibição.
- [Xibo — implementação de sincronização/inventário/estatísticas](https://github.com/xibosignage/xibo-cms/blob/c381486b1adee10b2c434b46c1f33e82bc2ab7ed/lib/Xmds/Soap.php): inventário completo é reportado separadamente da programação; arquivos têm tamanho/checksum. BERG deve manter SHA-256 em seu próprio contrato; não copiar o algoritmo legado do Xibo.
- [Anthias — projeto oficial](https://github.com/Screenly/Anthias): referência de sinalização com dashboard, biblioteca de conteúdo e agendador executados no equipamento. O README consultado é uma referência de produto, não prova de entrega exatamente uma vez ou de transições sem intervalo.
- [Vimeo Player SDK — eventos oficiais](https://github.com/vimeo/player.js#events): `play` indica início da solicitação; `playing` indica reprodução iniciada; `timeupdate` acompanha o tempo e normalmente ocorre a cada 250 ms, variando por navegador. `load` do iframe não comprova vídeo visível. Com loop ativo, `ended` não dispara.
- Contrato existente do painel: `docs/player-protocol-v1.md`, `src/lib/protocol/v1.ts` e testes correspondentes em `bergvision`.

As práticas propostas abaixo são uma adaptação para BERG VISION. Não se presume que todos os produtos citados implementem exatamente o mesmo protocolo.

## Lacunas verificadas no BERG VISION

| Prioridade | Evidência no código | Consequência | Correção recomendada |
| --- | --- | --- | --- |
| Alta | O painel tem contrato canônico/schema v1; `berg-vision-show/docs/player-protocol-v1.md` ainda é rascunho e diverge; não há `src/lib/protocol/v1.ts` no player | Os dois lados podem interpretar a mesma publicação de formas diferentes | Fonte única versionada para schemas e fixtures; testes de compatibilidade em ambos os repositórios e no backend |
| Alta | `CommandEngine.poll` grava `rememberDoneId` antes da execução; `ack` apenas registra erro; duplicatas em `done` são ignoradas | Queda entre persistência e execução pode perder o comando; perda do ACK pode deixar o painel sem confirmação definitiva | Diário persistente por comando com resultado; fila persistente de ACKs; duplicata reenvia o resultado sem repetir o efeito |
| Alta | `TelemetryEngine` começa com `runtimeStatus: booting`; não foi encontrado consumidor que conecte os eventos do renderer a `setRuntimeStatus`; a lista do painel usa heartbeat para conectividade | Aparelho conectado pode estar parado ou com mídia indisponível sem diagnóstico fiel | Conectar visibilidade/reprodução/erro reais ao heartbeat; reportar item, revisão ativa, estado, último progresso e motivo de cobertura/fallback |
| Alta | O handler `reload` em `src/routes/index.tsx` retorna `schedule_reloaded` imediatamente após `setReloadKey` | ACK `executed` pode anteceder a consulta, validação e ativação da programação | Responder `received` quando persistido e `executed` somente após verificar o resultado; registrar revisão aplicada |
| Média | `DeviceCommand`/`parseCommands` não incluem `expectedRevision`; `isExpired` apenas faz o comando ser ignorado | Um comando atrasado pode operar em outra programação; um vencido pode ficar sem desfecho no painel | Validar revisão esperada; persistir/repetir ACK `expired`; preservar comandos não suportados conforme política de compatibilidade |
| Média | `isPlayerOnline` do painel admite 600 s; contrato canônico menciona 120 s | A tela pode aparecer conectada por vários minutos depois de parar de reportar | Unificar SLA/configuração, distinguir recente/atrasado/offline e mostrar horário da última comunicação; não confundir com saúde da reprodução |
| Média | `usePlayerSchedule` trabalha com assinatura e consultas; não existem `desiredRevision`/`activeRevision` no tipo de playlist do player | O painel não tem evidência de qual publicação foi de fato ativada | Manifesto monotônico, hash estável, preparação e ativação atômicas; atualizações de URLs não criam revisão de conteúdo |
| Média | Não foi encontrado um fluxo de prova de exibição persistente ligado à revelação dos itens; o schema do painel prevê eventos, mas não demonstra integração | Relatório pode mostrar programação prevista, sem comprovar o que foi exibido | Eventos com IDs deduplicáveis e fila offline limitada; início quando o item fica visível, conclusão/interrupção e tempo real exibido |

Observações de escopo: o player já tem ACKs via `player-sync`, apesar de seu documento antigo dizer que estão ausentes. Já há persistência da última playlist, consulta sem sobreposição e cache para arquivos diretos. A auditoria não conclui que estas capacidades estejam ausentes; conclui que o contrato e as confirmações ainda não estão integrados de ponta a ponta. As Edge Functions em `docs/edge-functions` são referências, não prova do estado implantado.

## Fluxo de publicação recomendado

1. O painel valida a playlist, ordem explícita, duração em ms, agendamento/fuso IANA e permissões do conteúdo. Publicar cria uma revisão imutável; editar rascunho não altera a revisão ativa.
2. O backend entrega um manifesto identificado por organização, dispositivo, playlist, revisão e hash, autenticado pelo token do aparelho. URLs assinadas são localizadores temporários; identidade do conteúdo é estável.
3. O player confirma `received`, valida contrato e identidade e reporta `validated`. Rejeita revisões incompatíveis/obsoletas sem apagar a publicação em uso.
4. Prepara arquivos autorizados, verifica tamanho/hash e reserva fallback. Links de terceiros ficam como `stream_only`; não são reportados como baixados nem prontos para reprodução offline.
5. Na fronteira do item atual, ativa a publicação completa e reporta `activeRevision`. Falha de download mantém a programação anterior; comandos explícitos de bloqueio/revogação continuam tendo precedência.
6. O renderer confirma início visível e progresso real. Reporta item indisponível e cobertura/fallback separadamente de reprodução. Falha nunca se converte silenciosamente em prova de exibição.
7. O player reconcilia snapshots após reconexão e periodicamente. Realtime pode reduzir latência, mas não substitui a recuperação de estado perdido. Publicação e heartbeat não reiniciam a mídia corrente.

Estado mínimo no painel: revisão desejada, revisão ativa, sincronização/preparação, conectado/atrasado/offline, reproduzindo/carregando/cobertura/pausado/erro, item atual, última confirmação e erros. Mostrar “publicado” ou “comando enviado” imediatamente é válido; mostrar “exibido” ou “executado” exige confirmação medida.

## Sequência sem tela vazia e limites do Vimeo

A correção deste trabalho em `berg-vision-show` mantém um iframe por vez; prepara somente a capa do próximo item; mantém capa no item anterior durante a liberação do decodificador; usa o evento oficial `playing` (ou avanço real do relógio como alternativa) e aguarda pintura antes de revelar. O prazo de prontidão do canvas não pode expor um iframe parado. Transições que incluem vídeo/link não recebem opacidade parcial, perspectiva, filtros ou transformações sobre ancestrais do decodificador. Links Vimeo não listados preservam `h`, e a qualidade deixa de ser forçada a 1080p.

Isto é uma cobertura por imagem durante a preparação, não continuidade de movimento entre dois iframes. A política de mesma origem impede copiar o último quadro do Vimeo para canvas. Se a capa não estiver acessível, há cobertura local identificada com a marca, sem quadro de cor sólida vazio. O carregamento de capas requer acesso a `vimeo.com` e ao CDN `*.vimeocdn.com`; o vídeo depende também dos destinos usados pelo provedor. A correção não concede permissões de rede por código.

Para continuidade de vídeo controlada, inclusive offline e em hardware limitado, o caminho preferencial é arquivo autorizado servido como mídia direta, compatível com o aparelho e preparado localmente. Vimeo só deve fornecer arquivo direto quando plano, autorização e direitos permitirem, resolvido pelo backend; não extrair ou baixar arbitrariamente de um embed. Um player precisa declarar suporte a codec, resolução e número de decodificadores antes de escolher a estratégia.

A ordem dos itens continua a da playlist. Em telas com um único Vimeo e sobreposições estáticas, o término real do vídeo agora determina a troca (`loop=0`), substituindo o temporizador da tela por solicitação do usuário; layouts com múltiplos vídeos independentes preservam a duração configurada. A contagem dos itens temporizados começa após prontidão. A política existente de erro continua tratando links recusados ou que não iniciam, mantendo cobertura enquanto tenta o próximo conteúdo. Nenhuma correção de interface pode garantir a reprodução de um link removido, bloqueado ou sem rede.

## Critérios de aceitação para a integração completa

- Publicar revisão N+1 durante reprodução de N: terminar a fronteira definida, preparar/ativar e confirmar N+1 sem reinício indevido.
- Reenviar/reordenar mensagens e reconectar: revisão não regride, sequência não reinicia e comando com efeito não se repete.
- Perder ACK, encerrar app após recebimento ou durante execução: recuperar estado e reenviar resultado; não afirmar garantia genérica de “exatamente uma vez” para efeitos externos.
- Reiniciar sem rede: somente mídia autorizada e válida continua; item com validade expirada não roda; token revogado não reutiliza programação indevida.
- Testar PAUSE/RESUME/SKIP/RELOAD conforme capacidades negociadas; `executed` só após efeito verificado, `expired` sem efeito, revisão divergente gera erro explícito.
- Comparar horário/fuso configurado, mudança de janela, virada de dia e relógio incorreto do dispositivo.
- Testar Vimeo lento/recusado, falha da capa, arquivos locais, combinação de vídeos/imagens e múltiplos ciclos; observar decodificadores e cores em Android TV, webOS, Tizen e navegador.
- Desligar a comunicação mantendo reprodução local: painel informa perda de gestão sem inventar falha de reprodução; interromper mídia com rede ativa: painel informa falha de reprodução apesar do heartbeat recente.
- Relatório de exibição deduplica eventos após envio offline e distingue cobertura, reprodução completa, interrupção e item não exibido.

## Validação realizada e sequência de implantação

Nesta tarefa: testes unitários do player, TypeScript, build padrão e Chromium com respostas Vimeo controladas. O cenário verifica primeiro → segundo → primeiro, ausência de revelação por `play`/tempo zero, apenas um iframe, cobertura do item anterior e não exposição pelo prazo de 12 s. Fontes reais, APIs autenticadas, decodificadores físicos de TV e o estado do Supabase implantado não foram validados.

Próxima implementação priorizada: (1) contrato único e fixtures entre painel/player/backend; (2) diário de comandos e ACK recuperável; (3) telemetria medida conectada ao renderer; (4) revisões e ativação atômica; (5) prova de exibição e testes nos aparelhos-alvo. Migrações, credenciais e implantação externa devem ser tratadas como entregas próprias; este relatório não as executa.
