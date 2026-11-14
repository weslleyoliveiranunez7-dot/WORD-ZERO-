# Decisões técnicas

## Tomadas na Etapa 1
- **Monorepo pnpm** com pacote `shared` consumido direto do código-fonte TypeScript (sem build do shared).
- **Servidor roda com `tsx`** (sem passo de build) por enquanto. Um build de produção (tsc/esbuild + Docker) fica para a Etapa 12/17.
- **Express + Colyseus 0.15** para ter `/health` junto do WebSocket.
- **Vite `base: "./"`** para funcionar no GitHub Pages e no Capacitor.
- **Typecheck (`tsc --noEmit`) no lugar de ESLint** nesta etapa. ESLint fica pendente.
- Versões: faixas (`^`) nos package.json; o `pnpm-lock.yaml` gerado no primeiro `pnpm install` fixa as versões e DEVE ser commitado.

## Em aberto (decidir antes da etapa indicada)
- Hospedagem do backend 24/7 e custo (antes da Etapa 4).
- Provedor de login / contas (antes da Etapa 4).
- Persistência mínima antes da coleta (Etapa 7), em vez de só na Etapa 12.
- Comportamento ao desconectar e regra de perda de itens na morte (antes da Etapa 6).
- Tamanho de chunk e do mundo (após medir, Etapa 3).
- Fonte de assets com licença.
