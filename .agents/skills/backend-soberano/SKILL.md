---
name: backend-soberano
description: Regra inegociável para o projeto BERG VISION — backend é sempre um Supabase externo próprio do usuário, nunca Lovable Cloud. Aplicar sempre que o pedido envolver backend (banco, auth, storage, edge functions, secrets), conexão Supabase, deploy, ou quando surgir sugestão/modal de "Enable Lovable Cloud". Deploy de frontend em Vercel/Netlify/Publish é livre.
---

# Backend Soberano — Supabase Próprio Obrigatório

Regras persistentes para impedir que o Lovable substitua o Supabase externo do usuário pelo Lovable Cloud. Encadeia com `supabase-ownership-guard`, `supabase-master` e `supabase-supervisor`.

## Regra mestra (não negociável)

O backend deste projeto é **exclusivamente** um projeto Supabase externo, criado e mantido pelo usuário em `supabase.com`, conectado ao Lovable via "Connect existing Supabase project". Schema, RLS e Edge Functions são administrados manualmente pelo usuário via SQL Editor / Supabase CLI. Nunca via Lovable Cloud.

## Proibições absolutas

1. **NÃO** ativar, sugerir, configurar ou migrar dados para o Lovable Cloud — em nenhuma circunstância, mesmo se parecer mais rápido ou se a plataforma sugerir automaticamente.
2. **NÃO** criar um projeto Supabase novo pelo Lovable. A conexão deve sempre apontar para um projeto Supabase JÁ EXISTENTE, informado pelo usuário.
3. **NÃO** oferecer "backend integrado", "banco automático", "setup rápido de backend" ou variações como alternativa ao Supabase externo.
4. **NÃO** criar, alterar ou dropar tabelas, policies (RLS) ou Edge Functions diretamente sem confirmação explícita do usuário. O schema já existe.
5. **NÃO** migrar, duplicar ou sincronizar dados para qualquer banco interno do Lovable.
6. **NÃO** usar secrets/env vars gerenciados pelo Lovable Cloud. Somente credenciais do Supabase externo fornecidas pelo usuário (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY`).

## Se surgir sugestão de Lovable Cloud

Quando aparecer botão, modal, tool call ou sugestão como "Enable Lovable Cloud", "Set up backend", "Ativar backend integrado":
- **Não aceitar.**
- Avisar o usuário que a opção apareceu.
- Aguardar confirmação explícita — a resposta correta padrão é sempre "usar o Supabase já conectado".

## Se o backend ainda não estiver conectado

Se o usuário pedir feature dependente de backend (auth, banco, storage, functions) e a integração "Connect Supabase" ainda não estiver configurada:
1. **Parar.** Avisar que a integração precisa ser configurada primeiro em Settings → Integrations → Supabase → **Connect existing project**.
2. **Nunca** oferecer Lovable Cloud como atalho temporário.
3. Só prosseguir com código que dependa de backend após a conexão estar confirmada.

## Deploy de frontend — liberado sem restrição

Hospedagem do frontend (Admin e Player) pode ser feita livremente via:
- Publish nativo do Lovable
- Vercel
- Netlify
- Qualquer outro host estático

Isso é decisão puramente de frontend e não afeta a regra de backend. Fluxo recomendado quando o usuário optar por Vercel/Netlify: GitHub sync → importar repo → configurar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` apontando para o mesmo Supabase externo.

## Tabela de detecção rápida

| Sinal | Ação |
| --- | --- |
| Modal "Enable Lovable Cloud" aparece | Não clicar. Reforçar no chat que o Supabase externo já é usado. |
| IA diz "vou configurar o backend automaticamente" | Perguntar antes: "vai criar novo ou usar o Supabase já conectado?" |
| Tabelas aparecem no app mas não existem no Supabase Dashboard do usuário | Sinal de Lovable Cloud ativo — desfazer/reconectar. |
| Env vars com prefixo `LOVABLE_SUPABASE_*` | Backend interno em uso — trocar pelas credenciais do projeto externo. |
| Opção "publicar com backend incluído" | Recusar. Publicar só o frontend. |

## Checklist de verificação (antes de qualquer feature de backend)

- [ ] Settings → Integrations → Supabase mostra "Connect existing project" (não "Create new").
- [ ] Project Ref exibido no Lovable é idêntico ao do dashboard `supabase.com` do usuário.
- [ ] Nenhuma seção "Lovable Cloud" ativa nas configurações.
- [ ] Env vars são `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (ou `_PUBLISHABLE_KEY`) do projeto externo.

## Auditoria periódica (a cada 2-3 fases)

- [ ] Tabelas criadas via chat existem no Supabase Dashboard externo (não em painel paralelo).
- [ ] Conexão Supabase continua apontando para o mesmo Project Ref inicial.
- [ ] Edge Functions criadas aparecem no Supabase Dashboard → Edge Functions do projeto externo.
- [ ] Nenhuma env var desconhecida foi injetada automaticamente.

## Regra mestra em caso de conflito

Qualquer conflito entre "atalho do Lovable Cloud" e "Supabase externo do usuário" → **Supabase externo sempre vence.** Se não for possível seguir sem violar essa regra, parar e pedir orientação ao usuário.
