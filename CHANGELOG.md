# Changelog

## Extra - Inventário 6.3 (2026-11-16)
- **Peso**: cada item tem peso (já existia em `items.ts`); a mochila do jogador agora tem limite (`MAX_CARRY_WEIGHT` = 25 kg, provisório). Coleta, loot, baú e fabricação respeitam o limite (o que não cabe por peso ou por slot volta/fica onde estava). Baú não tem limite de peso. Save acima do peso carrega sem perder itens.
- **Durabilidade**: porrete (40), lança (35), machado (50) e picareta (50), valores provisórios. Arma gasta 1 por golpe que acerta (jogador, criatura ou estrutura); ferramenta gasta 1 por coleta com bônus. Ao zerar o item quebra, some e o dono recebe "X quebrou!". A durabilidade viaja com o item (baú, mochila de morte, save).
- **Equipar / desequipar**: itens `equip` (armas e ferramentas), um por vez. Equipado = arma usada no golpe (ferramenta na mão = punho). Sem nada equipado, vale a arma de maior dano, como antes.
- **Organizar** (`REQUEST_INVENTORY_MOVE`, antes sem handler): mover (vazio / juntar / trocar), dividir pilha, descartar (destrói, não vai ao chão) — tudo no servidor, tudo-ou-nada, com `actionId` e intervalo mínimo.
- **Painel** (cliente): barra de peso e slots, durabilidade e marca E nos slots, descrição e atributos, comparar com o equipado/em uso, botões USAR / EQUIPAR / MOVER / DIVIDIR / DESCARTAR (com confirmação), filtros (Todos, Equipado, Usáveis, categorias) e busca. Recusas úteis do servidor viram aviso na tela.
- **Protocolo 10**: `INVENTORY_UPDATE.weight/maxWeight`, `ItemStack.dur/eq`, `REQUEST_INVENTORY_MOVE` com `op`. Cliente e servidor precisam subir juntos.
- Verificado: 250 testes de `shared` (26 novos em `inventory.test.ts`), typecheck de `shared` e do painel. NÃO verificado: servidor Colyseus real, workflow, painel no celular.

## Extra - Sistema de saúde e ferimentos (2026-11-16)
- **Ferimentos** (`shared/injuries.ts`): corte, perfuração, mordida, fratura, queimadura e contusão em 4 partes do corpo, com sangramento, infecção, dor e recuperação. Zumbis mordem/cortam, lança perfura, porrete/punho machuca; cabeça = mais grave, tronco = sangra mais.
- **Efeitos**: pernas feridas deixam mais lento; braços feridos e dor enfraquecem o golpe; sangramento e infecção bloqueiam a regeneração e tiram vida; feridas cicatrizam sozinhas.
- **Itens**: Curativo, Tala, Analgésico, Antibiótico, Antisséptico, Kit de primeiros socorros; Bandagem estanca e cobre. Receitas: curativo, tala, kit. Loot de zumbi.
- **Tratamento**: usar o item trata a ferida mais urgente ou a parte tocada no corpo (`REQUEST_USE_ITEM.part`).
- **Salvar**: `PlayerSave.inj` (opcional). **Protocolo 9**. **Cliente**: corpo por parte, lista de feridas com dicas, faixa de avisos.
- Verificado: 224 testes de `shared` (35 novos), typecheck de `shared`. NÃO verificado: servidor real, bots/workflow, cliente no celular.

## Etapa 16 - Menu inicial, APK e GitHub Pages (2026-11-15)
- **Tela inicial** (`ui/MainMenu.ts`, `TitleScreen`): só a logo e "TOQUE PARA COMEÇAR" (toque, Enter ou Espaço); mostra "Servidor: online / sem resposta". Substitui a tela antiga da `BootScene`.
- **Menu de servidores** no estilo da referência (grafite escuro, vermelho da logo, aba JOGAR, lateral com categorias, lista em linhas com jogadores / temporada / status): `MenuScreen`. Mesma lógica da Etapa 13 (lista de `/servers`, atualiza a cada 5 s, lotado desabilitado, último servidor marcado, aviso de lotado/fim de temporada). Lateral: SERVIDORES, ÚLTIMO (CONTINUAR) e OFFLINE (mapa de teste, que antes era um botão da tela inicial). Se a lista falhar, aparece ENTRAR NO SERVIDOR PADRÃO. `ServerListScene` e `BootScene` viraram cascas finas.
- **Imagens**: `apps/web/public/logo.png` (transparente), `logo-icon.png`, `icons/*` (PWA, maskable, apple-touch, favicon) e `manifest.webmanifest` com ícones.
- **Capacitor / APK** (`mobile/`): `capacitor.config.json` (appId `com.worldzero.game`, esquema https) e `package.json` próprio, **fora do workspace pnpm** (não mexe no lockfile; o Render usa `--frozen-lockfile`). Imagens de ícone/abertura em `mobile/assets/`.
- **Workflows novos** (só manuais): `pages.yml` (publica o cliente no Pages) e `apk.yml` (cria o projeto Android, gira na horizontal, gera ícone/abertura, compila APK **debug** e guarda como arquivo do workflow; não cria release).
- Doc: `docs/DEPLOY_APK_PAGES.md` (Pages hospeda o cliente, não o servidor; passo a passo; limites).
- Verificado aqui: typecheck dos arquivos novos; as duas telas renderizadas no Chromium com lista simulada (tocar, entrar, continuar, offline, voltar, falha da lista); YAML/JSON dos workflows e configs válidos.
- NÃO verificado: build com Vite/Phaser no jogo todo, `pnpm install`, os dois workflows no GitHub (Pages, Capacitor, Gradle, `capacitor-assets`), instalação do APK e conexão no celular. O primeiro Run workflow é o teste.
- Arquivos: novos `apps/web/src/ui/MainMenu.ts`, `apps/web/public/{logo,logo-icon}.png`, `apps/web/public/icons/*`, `mobile/*`, `.github/workflows/{pages,apk}.yml`, `docs/DEPLOY_APK_PAGES.md`; alterados `apps/web/src/game/{BootScene,ServerListScene}.ts`, `apps/web/index.html`, `apps/web/public/manifest.webmanifest`, `README.md`, `CHANGELOG.md`, `PROGRESSO.md`.

## Polimento - HUD e Central de Serviços (2026-11-15)
- Só interface (nada de regra de jogo, servidor ou protocolo mudou). Visual de sobrevivência: fundo escuro, cinza/preto, verde discreto, bordas finas, DOM + CSS simples (sem biblioteca nova).
- Canto superior direito: relógio digital (hora do mundo) + minimapa compacto alinhado (o minimapa só redesenha se o ponto andou ou um chunk carregou).
- Lateral esquerda: **Central de Serviços** (`ui/Services.ts`), 5 ícones: Personagem (P), Inventário (I), Fabricação (C), Construção (B), Coleta (G). Um painel por vez; nome e explicação ao passar o mouse ou manter pressionado no celular; Esc fecha. Travada na tela de morte.
- Personagem: corpo (silhueta colorida pela vida) + Vida/Fome/Sede/Energia juntos, cada um com ícone, barra, valor, estado e explicação. As barras saíram do HUD principal.
- Inventário: busca, categorias, grade de 12 slots, detalhes do item (peso, efeito, arma) e USAR. Fabricação: 3 áreas (receitas / materiais com ✔✘ verde/vermelho / resultado + FABRICAR com motivo quando bloqueado). Construção: categorias, materiais, descrição, resultado, CONSTRUIR + REPARAR / ACESSO. Coleta (`ui/CollectUi.ts`): recurso por perto, ferramenta e rendimento.
- Barra de atalhos inferior: 6 primeiros slots (teclas 1-6), a arma em uso fica destacada. Controles de movimento e botões ATACAR / COLETAR / TOCHA / PORTA mantidos como estavam.
- Não existe dano por parte do corpo no jogo: a silhueta só reflete a vida geral.
- Não rodado: o jogo completo no navegador (Phaser/Colyseus não instalados aqui). Verificado: typecheck das telas novas e render real das telas no Chromium com dados simulados (cliques geram as mesmas ações de antes).
- Arquivos: novos `apps/web/src/ui/{theme,Services,CollectUi}.ts`; alterados `apps/web/src/ui/{Hud,Minimap,SurvivalUi,BuildUi,landscape}.ts`, `apps/web/src/game/GameScene.ts`.

## Etapa 14 - Temporada de 7 dias e wipe
- Relógio da temporada no BACKEND (`apps/server/src/seasons.ts`, `SeasonManager`): estados `ACTIVE -> CLOSING -> ARCHIVED -> RESETTING -> ACTIVE`, cada passo gravado antes de agir (`meta_season_<mundo>`), idempotente e retomável após queda. Roda sem jogador conectado.
- Ao fim dos 7 dias: sala selada (nenhuma ação, nada é gravado), aviso final de 30 s, sala fechada, resultado arquivado, wipe (personagens, bases, baús, snapshots da temporada) verificado (2ª limpeza = 0) e nova temporada com seed nova. Falha no wipe = mundo fechado e nova tentativa; nunca cria temporada duplicada. Registro de temporada inválido = mundo fechado, nada inventado por cima.
- Ids de gravação por temporada (`<mundo>_s<n>_...`): nada atravessa o wipe. **Muda o formato**: o que foi salvo nas Etapas 7-13 deixa de ser lido.
- `PlayerStore.purge(prefixo)` (arquivos e PostgreSQL, em transação).
- Mapa por temporada: a sala usa a seed da temporada e o cliente gera o mesmo mapa (seed vem de `/servers` e de `SEASON_UPDATE`; se divergir, a cena reinicia uma vez).
- `SEASON_UPDATE` (já existia na lista, sem mudar a versão do protocolo): relógio do servidor, alertas de 24 h / 1 h / 10 min / 1 min. HUD mostra o tempo restante; a lista de servidores mostra a temporada. Entrada recusada com código 4007 durante o fechamento.
- Testes: `shared/season.test.ts` (6) e `apps/server/src/seasoncheck.ts` (27 checagens, relógio acelerado, arquivos e PostgreSQL). Passo novo no workflow.
- Ainda não rodado: servidor Colyseus real com salas fechando (código novo da `WorldRoom`), `seasoncheck` contra PostgreSQL real e o cliente (ver PROGRESSO.md).

## Etapa 13 - Servidores e lista
- Mundos independentes: cada mundo é uma sala própria (jogadores, criaturas, bases e personagens salvos separados). Cadastro por `WORLDS="id:Nome:regiao;..."` (padrão: `mundo-1`). O `mundo-1` mantém os ids de gravação antigos.
- Limite de 50 jogadores por mundo, imposto no servidor (`MAX_PLAYERS` agora vai de 1 a 50). Mundo lotado recusa a entrada ("servidor lotado") e nunca abre uma segunda sala do mesmo mundo; a vaga de quem está reconectando continua reservada.
- `GET /servers`: nome, região, jogadores/capacidade, status (online / iniciando / lotado) e sala ativa. `/health` ganhou `worlds`.
- Cliente: tela de servidores (atualiza sozinha, rola, marca o último mundo, botão CONTINUAR, lotado desabilitado, volta à lista com aviso se encher na hora). Nome do mundo no HUD.
- `JoinOptions.world` (opcional, sem mudar a versão do protocolo). Servidor antigo sem `/servers`: o cliente oferece entrar no padrão.
- Testes: `shared/servers.test.ts` e `apps/server/src/worldcheck.ts` (servidor real, 2 mundos, limite 3, lotado, independência, reconexão); passo novo no workflow.
- Ainda não rodado: servidor Colyseus real, `worldcheck.ts` e a tela no celular (ver PROGRESSO.md).

## Etapa 12 - Banco e persistência
- PostgreSQL (`DATABASE_URL`) com migrações versionadas e checksum (`players`, `snapshots`, `audit_logs`, `schema_migrations`); aplicadas sozinhas ao ligar o servidor, com lock contra dois servidores migrando juntos.
- Salvamento: autosave de 30 s + gravação em até ~2 s após mudança de inventário + morte, saída e desligamento; uma gravação por vez por personagem.
- Desligamento limpo (SIGTERM/SIGINT): fecha as salas, grava tudo e fecha o banco.
- Snapshots (morte, saída, desligamento, a cada 10 min; 20 por registro) e recuperação automática de personagem ou estruturas inválidos a partir do snapshot válido mais novo.
- Auditoria de eventos críticos (`entrou`, `saiu`, `morte`, recuperações). Backup/restauração manual (`pnpm --filter @worldzero/server backup`).
- Testes: `persistcheck.ts` (armazenamento, snapshots, recuperação, backup, migrações) e `restart.ts` (servidor real: queda brusca, desligamento normal, registro quebrado); workflow com serviço `postgres:16`.
- Ainda não rodado: PostgreSQL real, servidor Colyseus real e `restart.ts` (ver PROGRESSO.md).

## Dia e noite, tocha e visual (2026-11-15)
- Protocolo v8: `REQUEST_TORCH` + `PlayerSnap.torch`: a tocha acesa aparece para todos os jogadores (decidida pelo servidor).
- `shared/daynight.ts`: horario do jogo como funcao do relogio (1 dia = 24 min reais); escuridao maxima as 03:00; transicao suave (smoothstep). 5 testes novos.
- Item `torch` (Tocha) e receita `torch` (2 madeira, sem bancada).
- Cliente: camada de escuridao com luz da tocha (RenderTexture), tocha na mao, botao/tecla T, relogio na tela.
- Sprites novos (personagem, criaturas, arvore/toco, pedra/cascalho, pecas de construcao), modo deitado.

## Etapa 11 (complemento) - Janela, telhado, reparo e acesso compartilhado
- Janela: bloqueia a passagem, não a linha de visão (`ChunkedWorld.extraOpaque`). Telhado: camada de cima, só com fundação sua e apoio (parede/porta/janela sua no tile ou ao lado, ou outro telhado seu ao lado); não bloqueia nada e cai antes da fundação. O cliente deixa quase transparente o telhado em que o jogador está.
- Reparo (só o dono, `REQUEST_BUILD {op:"repair"}`): vida cheia de todas as peças do tile; custa 1 madeira por 25 de vida que faltava (transação).
- Acesso compartilhado (`{op:"trust"}`): o dono dá ou tira o acesso às suas portas e baús do jogador conectado MAIS PRÓXIMO (até 96 px; o servidor escolhe, o cliente nunca manda id). Máximo de 8 pessoas por dono. Quem tem acesso só abre porta e usa baú: não constrói, não repara. Salvo junto com as bases.
- Testes: 6 novos em `building.test.ts` (23 de construção, 165 no total); casos novos em `attacker.ts`.

## Etapa 11 - Construção de base
- Peças: fundação, parede, porta e baú (`shared/building.ts`, custos provisórios em `PIECES`). Um tile tem 1 fundação + 1 peça em cima; parede/porta/baú exigem fundação do próprio jogador.
- Colisão: parede, baú e porta fechada bloqueiam (`ChunkedWorld.extraSolid`: vale para jogadores, criaturas e linha de visão); fundação e porta aberta não. Nada prende jogador: não se constrói nem se fecha porta em cima de alguém.
- Dano estrutural: golpe que não acha jogador nem criatura acerta a estrutura mais próxima no alcance da arma (dano da arma x 0,5). Peça de cima cai primeiro, depois a fundação; baú destruído larga o conteúdo como mochila no chão.
- Só o dono abre/fecha porta e usa o baú; quem não é dono precisa destruir (invasão).
- Persistência: estruturas (e conteúdo dos baús) salvas em um registro único (`world-structures`) no mesmo armazenamento dos personagens, no máximo a cada 5 s e ao encerrar a sala. Se a leitura falhar ou o dado for inválido/de outra seed, a construção fica DESLIGADA (não grava por cima) e tenta de novo a cada 10 s.
- Protocolo 7: `REQUEST_BUILD` (place / toggle / deposit / withdraw), `STRUCTURE_UPDATE`, `CHEST_UPDATE`. Cliente: botão CONSTRUIR, botão PORTA/BAÚ perto de peça sua, painel do baú.
- Testes: 17 novos em `building.test.ts` (159 no total em `shared`); casos novos em `attacker.ts`. Sem passo novo no workflow.
- Ainda não rodado: servidor real (salvar/reiniciar/recarregar), atacante com os casos novos e cliente no celular.

## Etapa 10 - Crafting
- 6 receitas (porrete, bandagem, bancada simples, machado improvisado, picareta simples, lança) em `shared/crafting.ts`. Fabricar é uma transação atômica no servidor: ou consome tudo e entrega o resultado, ou não muda nada. Repetir a mensagem não fabrica de novo (`actionId`), e o tempo da receita deixa o jogador ocupado.
- Itens novos: bancada, machado, picareta, lança (arma de 28 de dano, alcance 72). Machado/picareta no inventário fazem a coleta render 2 unidades (nunca mais do que resta no recurso).
- Protocolo 6: `REQUEST_CRAFT {recipe, actionId}` validado de forma estrita (campo extra ou receita inventada = manipulação).
- Cliente: botão FABRICAR com a lista de receitas (verde = dá para fazer).
- Testes: 25 novos em `crafting.test.ts` (142 no total em `shared`); casos novos em `attacker.ts`. Sem passo novo no workflow.
- Ainda não rodado: servidor real, atacante com os casos novos e cliente no celular (ver PROGRESSO.md).

## Etapa 9 - Combate e PvP
- Golpe de jogador contra jogador e contra criatura decidido 100% no servidor (`performAttack` em `shared/combat.ts`): atacante vivo, `actionId` novo, recarga DA ARMA, alvo mais próximo com alcance e linha de visão, vítima viva e sem proteção, dano.
- Arma simples: porrete (`club`, 20 de dano, alcance 52, recarga 800 ms), largado por zumbis (8%). O servidor usa a arma de maior dano do inventário; sem arma, punho (10 / 48 / 700 ms). O cliente não escolhe arma, alvo nem dano.
- Errar também gasta a recarga. Parede e árvore bloqueiam golpe (água não).
- Jogador desconectado (janela de reconexão de 15 s) continua no mundo e pode ser ferido e morrer (sair no meio da luta não salva).
- Proteção curta de 3 s contra outros jogadores só logo após reaparecer; acaba na hora se o protegido atacar.
- Morte por jogador: mochila no local (já existia), crédito da morte (`killCredit`, janela de 15 s) e evento `kill`.
- Protocolo 5: `COMBAT_EVENT` (só feedback visual: acerto, erro, morte) e `PLAYER_STATE.weapon`.
- Cliente: números de dano flutuantes, anel de golpe, flash vermelho ao ser atingido, vibração ao acertar, linha "Arma: ..." no HUD, botão ATACAR escurece durante a recarga (só visual).
- Testes: 27 novos em `combat.test.ts` (117 no total em `shared`); novos ataques forjados em `attacker.ts`; novo `duel.ts` (2 clientes reais, servidor novo) e passo "Teste de combate PvP" no workflow.
- Ainda não rodado: servidor real, `duel.ts` e cliente no celular (ver PROGRESSO.md).

## Etapa 8 - Zumbis e animais
- Zumbis (perseguem/atacam) e cervos (fogem), simulação por proximidade, ataque corpo a corpo básico, loot, protocolo 4.

## Etapa 7 - Coleta e loot
- Madeira, pedra e sucata coletáveis; mochila de morte; `REQUEST_INTERACT`; `ENTITY_UPDATE`; protocolo 3; botão COLETAR.
- Persistência de personagem: chave no aparelho, salvamento em Supabase ou arquivos, bloqueio de sessão duplicada.

## [Não lançado]
### Etapa 6 - Personagem e sobrevivência (2026-11-14)
- Shared: itens (4), inventário de 12 slots, `SurvivalSim` (vida, fome, sede, energia, tolerância, penalidade de velocidade), `PlayerLife` (usar item com cooldown e `actionId` idempotente, morte que zera o inventário, reaparecimento); validação estrita `inspectUseItem`/`inspectRespawn`; protocolo 2 (`PLAYER_STATE`, `INVENTORY_UPDATE`, `REQUEST_USE_ITEM`, `REQUEST_RESPAWN`, `PlayerSnap.dead`); 31 testes novos (69 no total).
- Servidor: estado de sobrevivência e inventário por jogador, morto não anda, tempo congelado durante a reconexão, `SURVIVAL_SCALE` para testes.
- Cliente: barras, inventário tocável (teclas 1-9), tela de morte com botão REAPARECER (só no modo online).
- Testes de rede: `survivor.ts` (novo) e ataques novos em `attacker.ts`; passo novo no workflow.
- Ainda não rodado: servidor, atacante, survivor e cliente (ver PROGRESSO.md).

### Etapa 5 - Autoridade e segurança (2026-11-15)
- Shared: `PlayerGuard` (limite de frequência e expulsão), `inspectInput` (validação estrita), `PlayerSim` (simulação autoritativa com checagem de velocidade e colisão); 11 testes.
- Servidor: todas as mensagens passam por limite -> validação -> simulação; recusa tipos desconhecidos e ações não implementadas; `ACTION_REJECTED`; log `[seguranca]`; expulsão; `maxPayload` 2 KB.
- Cliente: envio limitado a ~30 msg/s; não reconecta após expulsão.
- Atacante de teste (`attacker.ts`) e passo de segurança no workflow.
- Ainda não rodado: servidor/atacante/cliente (ver PROGRESSO.md).

### Etapa 4 - Servidor multiplayer (2026-11-15)
- Servidor simula o movimento (mesma função do cliente) a 20 Hz e envia `WORLD_SNAPSHOT`; recebe só `PLAYER_INPUT` validado; limite `MAX_PLAYERS`; reconexão por 15 s; recusa protocolo incompatível.
- Cliente: botão JOGAR ONLINE, jogadores remotos interpolados, reconexão automática, `?server=` para apontar o servidor.
- Bot de teste (`apps/server/src/bot.ts`) e passo do workflow com 2 clientes em processos separados.
- Ainda não rodado: servidor, bots e cliente (ver PROGRESSO.md).

### Etapa 3 - Mapa em chunks (2026-11-14)
- Shared: `ChunkedWorld` (chunks de 16x16, mundo de teste 8x8, geração determinística por seed, 4 regiões), carregamento raio 1 e descarregamento raio 2; colisão funciona com mapa fixo e com chunks.
- Cliente: `GameScene` desenha um Graphics por chunk e o destrói ao descarregar; HUD com chunk atual; novo minimapa (`Minimap.ts`).
- 8 testes novos (22 no total em `shared`, rodados em Node). Cliente aguardando workflow e teste no celular.

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
