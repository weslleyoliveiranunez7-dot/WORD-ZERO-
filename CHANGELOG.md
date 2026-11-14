# Changelog

## [Não lançado]
### Etapa 2 - Primeiro mapa 2D (2026-11-14)
- Shared: mapa de teste 40x30, colisão por caixa com deslize, conversão de entrada em velocidade, 12 testes.
- Cliente: `GameScene` (câmera segue, zoom adaptado à tela), teclado WASD/setas, joystick virtual flutuante, HUD de FPS.
- `BootScene` ganhou o botão JOGAR; servidor passa a ser opcional para o teste.
- Workflow aceita `WORLD-ZERO-*.zip` e publica o cliente no GitHub Pages.
- Verificado só a lógica de `shared`; cliente aguardando o workflow e teste no celular.

### Etapa 1 - Fundação (2026-11-14)
- Monorepo pnpm: `apps/web`, `apps/server`, `packages/shared`.
- Cliente: Vite + TypeScript + Phaser 3 com tela de teste que consulta `/health`.
- Servidor: Node + Colyseus (sala `world`, limite 50) e endpoint `/health`.
- Shared: constantes e nomes de mensagens do protocolo.
- GitHub Actions (`verificar.yml`): typecheck, testes, build web e teste do servidor (/health).
- NÃO verificado: instalação e execução (ver PROGRESSO.md).
