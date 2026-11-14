# WORLD ZERO

Jogo multiplayer de sobrevivência 2D top-down (Android + web). Especificação completa em `docs/DOCUMENTO_MESTRE.txt`.

**Status:** Etapa 1 concluída; Etapa 2 (primeiro mapa 2D) escrita. Veja `PROGRESSO.md`.

## Requisitos
- Node.js 20+ (testado só com a v22 de leitura; ver PROGRESSO.md)
- pnpm 9 (`npm i -g pnpm`)

## Comandos
```bash
pnpm install          # gera pnpm-lock.yaml (commite esse arquivo!)
pnpm typecheck        # verificação de tipos em todos os pacotes
pnpm test             # testes (vitest, pacote shared)
pnpm dev:server       # servidor em http://localhost:2567  (GET /health)
pnpm dev:web          # cliente em http://localhost:5173
pnpm build:web        # build estático do cliente
```
Copie `.env.example` para `.env` se quiser mudar portas (o servidor lê variáveis de ambiente do shell).

## Estrutura
```
apps/web        cliente (Vite + TypeScript + Phaser 3)
apps/server     servidor (Node + Colyseus) - sala "world" vazia
packages/shared constantes e nomes de mensagens
docs/           Documento Mestre e decisões técnicas
```

## GitHub Pages
Hospeda só o cliente web estático. O servidor multiplayer NÃO roda no Pages.

## Verificação automática (GitHub Actions)
O workflow `.github/workflows/verificar.yml` roda a cada push (e manualmente em Actions > Verificar > Run workflow): instala, checa tipos, roda testes, faz o build do cliente e liga o servidor para consultar `/health`.
