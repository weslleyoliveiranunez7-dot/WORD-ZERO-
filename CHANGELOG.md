# Changelog

## [Não lançado]
### Etapa 1 - Fundação (2026-11-14)
- Monorepo pnpm: `apps/web`, `apps/server`, `packages/shared`.
- Cliente: Vite + TypeScript + Phaser 3 com tela de teste que consulta `/health`.
- Servidor: Node + Colyseus (sala `world`, limite 50) e endpoint `/health`.
- Shared: constantes e nomes de mensagens do protocolo.
- CI (GitHub Actions): typecheck, testes e build web.
- NÃO verificado: instalação e execução (ver PROGRESSO.md).
