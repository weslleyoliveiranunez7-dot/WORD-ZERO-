# PROGRESSO - WORLD ZERO (arquivo de continuidade)

> Se quem estava implementando (Claude) ficar sem tokens, outra IA pode continuar lendo ESTE arquivo + `docs/DOCUMENTO_MESTRE.txt`.
> Atualize este arquivo ao final de CADA etapa.

Última atualização: 2026-11-14
Etapa atual: **Etapa 1 (Fundação) - código escrito, NÃO testado**

## Regras que valem sempre (resumo do Documento Mestre)
- Executar UMA etapa por vez; só avançar após teste e aprovação do usuário.
- Servidor é autoritativo; cliente só envia intenções.
- Não afirmar que algo funciona sem rodar e registrar o teste real.
- Sem segredos no código/APK/commits. Sem apagar arquitetura funcional sem aprovação.
- GitHub Pages hospeda só o cliente web, nunca o servidor multiplayer.
- Entregar projeto em pastas `parte-1`, `parte-2`... com menos de 100 arquivos cada (limite do upload do GitHub).
- Ao fim de cada etapa: resumo, arquivos novos/alterados, comandos, resultado real dos testes, problemas, próximo passo, este arquivo atualizado.

## Etapas
| Etapa | Descrição | Status |
|---|---|---|
| 0 | Auditoria do repositório | Concluída (não havia repositório; nada a auditar) |
| 1 | Fundação (monorepo, Vite, Phaser, Colyseus, CI) | Escrita, aguardando teste do usuário |
| 2 | Primeiro mapa 2D (personagem, câmera, colisão, teclado, joystick) | Pendente |
| 3 | Mapa em chunks | Pendente |
| 4 | Servidor multiplayer (2 jogadores) | Pendente |
| 5 | Autoridade e segurança | Pendente |
| 6 | Personagem e sobrevivência | Pendente |
| 7 | Coleta e loot | Pendente |
| 8 | Zumbis e animais | Pendente |
| 9 | Combate e PvP | Pendente |
| 10 | Crafting | Pendente |
| 11 | Construção de base | Pendente |
| 12 | Banco e persistência | Pendente |
| 13 | Servidores e lista | Pendente |
| 14 | Temporada de 7 dias e wipe | Pendente |
| 15 | Interface e polimento mobile | Pendente |
| 16 | APK e GitHub Pages | Pendente |
| 17 | Teste de carga e lançamento | Pendente |

## O que já foi feito (Etapa 1)
Arquivos criados (todos em `parte-1/`, que é a raiz do repositório):
- Raiz: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.env.example`, `README.md`, `CHANGELOG.md`, `PROGRESSO.md`
- `docs/`: `DOCUMENTO_MESTRE.txt`, `DECISOES_TECNICAS.md`
- `.github/workflows/ci.yml`
- `packages/shared/`: constantes, nomes das mensagens, 1 teste vitest
- `apps/server/`: Colyseus + Express, sala `world` (50 máx.), `GET /health`, config por variáveis de ambiente
- `apps/web/`: Vite + Phaser 3, `BootScene` que mostra o título e consulta `/health`

## O que NÃO foi verificado (importante)
O ambiente onde o código foi escrito não tinha acesso à internet, então:
- `pnpm install` NÃO foi executado (sem `pnpm-lock.yaml`).
- `pnpm typecheck`, `pnpm test`, `pnpm dev:server`, `pnpm dev:web` e `pnpm build:web` NÃO foram executados.
- A compatibilidade exata entre Colyseus 0.15, `@colyseus/ws-transport` e Express é suposição baseada na documentação; confirme ao rodar.
- ESLint ainda não foi configurado.

## Critério de aceite da Etapa 1
Cliente abre uma tela simples e o servidor inicia sem erro. Só marcar como concluída depois de:
1. `pnpm install` sem erros e `pnpm-lock.yaml` commitado.
2. `pnpm typecheck` e `pnpm test` passando.
3. `pnpm dev:server` mostra "WORLD ZERO ouvindo na porta 2567" e `http://localhost:2567/health` responde `{"status":"ok",...}`.
4. `pnpm dev:web` abre a tela e mostra "Servidor: online".
Se algo falhar, copie a mensagem de erro e corrija antes da Etapa 2.

## Próximo passo
1. Usuário roda os 4 itens acima e informa o resultado (ou os erros).
2. Corrigir o que falhar e então marcar a Etapa 1 como concluída aqui.
3. Iniciar a Etapa 2 (primeiro mapa 2D). Prompt pronto: Parte 16 do Documento Mestre, "PROMPT ETAPA 2".

## Decisões em aberto
Ver `docs/DECISOES_TECNICAS.md`.

## Prompt para continuar em outra IA
"Leia `PROGRESSO.md` e `docs/DOCUMENTO_MESTRE.txt` inteiros. Inspecione o repositório antes de alterar qualquer coisa. Continue a partir da etapa indicada em PROGRESSO.md, execute somente essa etapa, teste de verdade, e atualize PROGRESSO.md e CHANGELOG.md ao final."
