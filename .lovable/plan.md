
# Deploy Caminho B (Dashboard) — Guia do zero

Você vai criar 2 Edge Functions no seu Supabase próprio (`yplclxvrstdkyauxazgb`), colar o código, configurar 1 secret, e testar. Tempo: ~15 min. Nenhum arquivo do projeto será alterado.

---

## Passo 1 — Abrir Edge Functions no Dashboard

Abra este link (já aponta pro seu projeto):

https://supabase.com/dashboard/project/yplclxvrstdkyauxazgb/functions

Clique em **"Deploy a new function"** → escolha **"Via Editor"** (ou "Create a new function").

---

## Passo 2 — Criar `create-preview-token`

1. **Nome da função:** exatamente `create-preview-token` (com hífens, minúsculo).
2. **Verify JWT:** DESATIVE o toggle (a função valida o JWT manualmente).
3. **Código:** apague o exemplo e cole o conteúdo COMPLETO do arquivo:
   `supabase/functions/create-preview-token/index.ts`
   (você já tem esse arquivo no repositório — abra e copie tudo).
4. Clique em **Deploy function**.

Confirmação esperada: aparece na lista com status **ACTIVE**.

---

## Passo 3 — Criar `get-preview-data`

Repita o passo 2, mas com:
- **Nome:** `get-preview-data`
- **Verify JWT:** DESATIVADO (o token do preview é público — a credencial é o próprio UUID opaco).
- **Código:** conteúdo de `supabase/functions/get-preview-data/index.ts`.

Clique em **Deploy function**.

---

## Passo 4 — Configurar o secret `SUPABASE_ANON_KEY`

O Supabase injeta automaticamente `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, mas NÃO injeta `SUPABASE_ANON_KEY`. Precisa cadastrar manualmente.

1. Copie a **anon public key**:
   https://supabase.com/dashboard/project/yplclxvrstdkyauxazgb/settings/api
   → seção **Project API keys** → botão copiar ao lado de **`anon` `public`**.

   (É o mesmo valor que está no seu `.env` como `VITE_SUPABASE_PUBLISHABLE_KEY` — pode copiar de lá também.)

2. Abra os secrets das Edge Functions:
   https://supabase.com/dashboard/project/yplclxvrstdkyauxazgb/functions/secrets

3. Clique em **Add new secret**:
   - **Name:** `SUPABASE_ANON_KEY`
   - **Value:** cole a anon key
   - **Save**

Não precisa redeploy — o secret fica disponível na próxima requisição.

---

## Passo 5 — Testar no Admin

1. Volte no preview do Admin (bergvision).
2. Faça logout e login de novo (para garantir token fresco).
3. Abra qualquer template e clique em **Preview**.
4. Abra o **DevTools → aba Network** e observe a chamada `create-preview-token`.

### Interpretação do resultado

| Status | Significado | Ação |
|---|---|---|
| **200** com `{ token, expires_at }` | Tudo funcionou | Fim ✓ |
| **Failed to fetch / status 0** | Nome da função errado ou não deployada | Confira o nome exato no Passo 2/3 |
| **500 `missing SUPABASE_ANON_KEY`** ou similar | Secret não configurado | Refaça o Passo 4 |
| **401 `invalid_token`** | Sessão do usuário expirada | Logout/login |
| **403 `forbidden_role`** | Seu usuário é viewer | Precisa ser owner/admin/editor |

---

## Passo 6 — Reportar

Quando terminar, me diga o status HTTP e o body da resposta de `create-preview-token`. Se der 200 mas o iframe continuar preto, o próximo passo é validar `get-preview-data` (mesma tabela de diagnóstico se aplica).

---

## Notas de segurança

- Nenhum arquivo do projeto Lovable é alterado — deploy 100% no seu Supabase próprio.
- `SUPABASE_ANON_KEY` é chave pública (mesmo valor que já roda no browser), pode ficar em secret sem risco.
- `SUPABASE_SERVICE_ROLE_KEY` é injetada pelo runtime — NÃO cadastre manualmente.
