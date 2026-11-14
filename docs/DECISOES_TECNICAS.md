# Decisões técnicas

## Tomadas na Etapa 1
- **Monorepo pnpm** com pacote `shared` consumido direto do código-fonte TypeScript (sem build do shared).
- **Servidor roda com `tsx`** (sem passo de build) por enquanto. Um build de produção (tsc/esbuild + Docker) fica para a Etapa 12/17.
- **Servidor e shared em CommonJS** (sem `"type": "module"`): o Colyseus 0.15 é CommonJS e o Node em modo ESM não enxerga `import { Room } from "colyseus"` (erro visto no GitHub Actions). O cliente web continua ESM.
- **Express + Colyseus 0.15** para ter `/health` junto do WebSocket.
- **Vite `base: "./"`** para funcionar no GitHub Pages e no Capacitor.
- **Typecheck (`tsc --noEmit`) no lugar de ESLint** nesta etapa. ESLint fica pendente.
- Versões: faixas (`^`) nos package.json; o `pnpm-lock.yaml` gerado no primeiro `pnpm install` fixa as versões e DEVE ser commitado.

## Tomadas na Etapa 2
- **Tile de 32 px**; mapa de teste 40x30 gerado por código (sem arquivos de mapa externos). Tamanho de chunk continua em aberto para a Etapa 3.
- **Colisão por caixa (AABB) 20x20, eixo por eixo**, em `packages/shared`, para o servidor reutilizar na Etapa 5. Não usa a física do Phaser.
- **Joystick e HUD em DOM**, fora do canvas, para não sofrerem o zoom da câmera.
- **Zoom** mostra ~10 tiles no lado menor da tela (limitado entre 0,75 e 3). Valor inicial, ajustar após teste no A04.
- **GitHub Pages** (job `publicar`) para o usuário jogar pelo celular sem computador.

## Em aberto (decidir antes da etapa indicada)
- Hospedagem do backend 24/7 e custo (antes da Etapa 4).
- Provedor de login / contas (antes da Etapa 4).
- Persistência mínima antes da coleta (Etapa 7), em vez de só na Etapa 12.
- Comportamento ao desconectar e regra de perda de itens na morte (antes da Etapa 6).
- Tamanho de chunk e do mundo (após medir, Etapa 3).
- Fonte de assets com licença.
