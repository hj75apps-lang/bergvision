# Editor de Imagens do Studio

Novo diálogo de edição acessível a partir de elementos `image` e `logo` no Studio. Abre com um botão "Editar imagem" no painel de propriedades e via menu de contexto (botão direito) no canvas e nas camadas.

## Ferramentas incluídas

1. **Recortar** — retângulo livre e presets (1:1, 4:3, 16:9, 9:16). Usa `react-image-crop`.
2. **Remover fundo** — 1 clique, 100% no navegador via `@imgly/background-removal` (WASM local, sem API key, sem custo de créditos). O modelo baixa on-demand (~50 MB) e roda offline nas próximas execuções.
3. **Pincel / Caneta** — anotação livre sobre a imagem. Cores, espessura, borracha, desfazer/refazer. Canvas HTML nativo, sem lib extra.
4. **Ajustes** — brilho, contraste, saturação, blur, escala de cinza. Aplicados de forma destrutiva ao gerar o arquivo final (para que o resultado seja fiel no player, sem depender de CSS).

Todas as ferramentas operam sobre a imagem original baixada via URL assinada e produzem um PNG final.

## Fluxo de salvar

Ao clicar em "Salvar", abre um diálogo com 3 opções (conforme escolhido):
- **Salvar como nova mídia** — faz upload para Biblioteca, atualiza `mediaFileId` do elemento.
- **Substituir original** — sobrescreve o arquivo no Storage e invalida caches. Confirma com aviso destrutivo.
- **Cancelar**.

Metadados (largura/altura) são recalculados; thumbnail regerado quando aplicável.

## Escopo

- Só imagens (`image`) e logos (`logo`). Vídeos e widgets ficam de fora.
- Estado do editor é local ao diálogo (não entra no Zustand do Studio, não polui histórico do canvas).
- Nenhum uso de Edge Function e nenhuma chamada de IA remota — tudo roda no cliente.

## Detalhes técnicos

Novas dependências:
- `react-image-crop` (~30 KB) — crop UI.
- `@imgly/background-removal` (WASM) — remoção de fundo local.

Arquivos novos:
- `src/components/studio/image-editor/image-editor-dialog.tsx` — shell com tabs e barra de ferramentas.
- `src/components/studio/image-editor/tab-crop.tsx`
- `src/components/studio/image-editor/tab-remove-bg.tsx`
- `src/components/studio/image-editor/tab-draw.tsx`
- `src/components/studio/image-editor/tab-adjust.tsx`
- `src/components/studio/image-editor/save-dialog.tsx`
- `src/lib/studio/image-editor/pipeline.ts` — compõe crop → ajustes → fundo → desenho em um único canvas de saída.
- `src/lib/studio/image-editor/save.ts` — upload como nova mídia ou substituição do original (via `storage-upload` existente).

Arquivos alterados:
- `src/components/studio/properties-panel.tsx` — botão "Editar imagem" quando o elemento é `image`/`logo`.
- `src/routes/studio.$templateId.tsx` — item "Editar imagem" no menu de contexto do canvas para os mesmos tipos.

Segurança e regras do projeto:
- Nada de `dangerouslySetInnerHTML`, nada de service key no client.
- Upload passa por `src/lib/storage-upload.ts` (já respeita `organization_id`/RLS).
- Substituir original mantém o mesmo `id`/`storage_path`, apenas troca bytes e atualiza `width/height/file_size/updated_at`.
