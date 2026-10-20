# Como gerar um instalador ou pacote de distribuição

Este projeto é uma aplicação web moderna construída com **TanStack Start**, **Vite** e **React**. Como a aplicação roda na arquitetura web/SSR (Server-Side Rendering) ou SPA, a forma de "gerar um instalador" depende do seu objetivo de entrega:

---

## 1. Build de Produção (Web / Servidor)

Para gerar os arquivos otimizados para produção execute:

```bash
npm run build
# ou com bun
bun run build
```

Isso criará a pasta de build pronta para ser hospedada em um servidor Node.js, plataforma em nuvem (Vercel, Railway, Render) ou container Docker.

---

## 2. Como transformar em um Instalador Desktop (.exe, .dmg, .AppImage)?

Se você deseja um **aplicativo de desktop nativo** (instalável no Windows, macOS ou Linux) que encapsule este projeto:

### Opção A: Usando Electron
1. Instale o Electron e o electron-builder como dependências de desenvolvimento:
   ```bash
   npm install electron electron-builder --save-dev
   ```
2. Crie um arquivo `main.js` na raiz para iniciar a janela do Electron apontando para a sua aplicação compilada ou servidor local.
3. Configure o script de build no `package.json` para rodar o `vite build` seguido pelo `electron-builder`.

### Opção B: Usando Tauri (Recomendado para apps leves)
1. Inicialize o Tauri no projeto:
   ```bash
   npx tauri init
   ```
2. Configure o comando de frontend build (`npm run build`) e o diretório de saída.
3. Execute o empacotador:
   ```bash
   npm run tauri build
   ```
   Isso gerará os instaladores nativos para o seu sistema operacional na pasta `src-tauri/target/release/bundle/`.

---

## 3. Como containerizar com Docker (Instalador para Servidores)

Se você precisa de um pacote imutável para instalar em qualquer servidor:
1. Crie um `Dockerfile` na raiz:
   ```dockerfile
   FROM node:20-alpine AS builder
   WORKDIR /app
   COPY package.json bun.lock* ./
   RUN npm install
   COPY . .
   RUN npm run build

   FROM node:20-alpine AS runner
   WORKDIR /app
   COPY --from=builder /app ./
   EXPOSE 3000
   CMD ["npm", "run", "preview"]
   ```
2. Construa a imagem:
   ```bash
   docker build -t meu-app .
   ```
