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

## Tomadas na Etapa 6
- **Sobrevivência 100% no servidor** (`PlayerLife` no `shared`, relógio injetado): o cliente só envia `{slot, actionId}` / `{actionId}` e recebe `PLAYER_STATE` e `INVENTORY_UPDATE` prontos.
- **Medidores 0-100 (100 = cheio)**: vida, fome, sede, energia. Tempos iniciais: fome ~30 min, sede ~20 min até zerar. Valores só para teste; balancear depois de jogar.
- **Fome/sede zerada**: 30 s de tolerância e depois 1 de dano por segundo por medidor zerado ("só após aviso e tolerância", Documento Mestre 4.2). Energia baixa só deixa mais lento (mínimo 60%), nunca imobiliza.
- **Idempotência**: `actionId` estritamente crescente por jogador; id repetido ou menor não executa de novo.
- **Cooldown de consumo 500 ms**; item sem efeito (ex.: bandagem com vida cheia) não é gasto.
- **Desconexão não pune**: durante a janela de reconexão (15 s) o tempo de sobrevivência é congelado. Passou de 15 s, o jogador é removido (sem persistência ainda).
- **Morte (regra provisória)**: o jogador PERDE todo o inventário e reaparece após 5 s no spawn com medidores iniciais e kit inicial. A mochila de loot no chão (Documento Mestre 6.5) depende de itens no mundo e entra na Etapa 7. **Aprovado pelo usuário (2026-11-14):** os itens que o jogador carrega na morte viram LOOT no local (mochila que outros jogadores podem pegar); mais adiante haverá baús também saqueáveis por outros jogadores. Kit inicial ao reaparecer: APROVADO como está. Implementação do loot = Etapa 7 (hoje os itens apenas somem).
- **Protocolo 2**: servidor recusa clientes com protocolo 1 (cliente em cache antigo precisa recarregar).
- **`SURVIVAL_SCALE`** (variável de ambiente, só para testes automáticos): multiplica o tempo de sobrevivência; padrão 1.

## Em aberto (decidir antes da etapa indicada)
- Hospedagem do backend 24/7 e custo (antes da Etapa 4).
- Provedor de login / contas (antes da Etapa 4).
- Persistência mínima antes da coleta (Etapa 7), em vez de só na Etapa 12.
- Mochila de loot na morte e baús saqueáveis: regra aprovada, implementar na Etapa 7 (e baús depois); falta definir por quanto tempo a mochila fica no chão.
- Tamanho de chunk e do mundo (após medir, Etapa 3).
- Fonte de assets com licença.

- Etapa 7 (provisório): mochila de morte dura 5 min (DROP_TTL_MS); recurso volta em 60 s; persistência de inventário depende de definir identidade do jogador (conta/token).
