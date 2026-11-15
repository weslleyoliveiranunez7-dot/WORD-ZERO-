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


## Tomadas na Etapa 9 (valores provisórios, balancear depois de jogar)
- **Um único caminho de dano de jogador**: `performAttack` (`packages/shared/src/combat.ts`). A mensagem é só `{actionId}`; alvo, arma, alcance, dano e recarga saem do servidor. Qualquer campo extra (`victim`, `damage`, `weapon`, `reach`, `x`, `y`) é manipulação (peso 5, conta para expulsão).
- **Arma automática**: vale a de maior dano no inventário do servidor; sem arma, punho. Não existe "equipar" vindo do cliente (evita mais uma mensagem para validar). Troca de arma/slot de mão entra com a interface da Etapa 10/15.
- **Valores**: punho 10 de dano / 48 px / 700 ms; porrete 20 / 52 px / 800 ms. Vida 100: ~10 socos ou 5 porretadas. Porrete só vem de zumbi (8%) até o crafting (Etapa 10).
- **Alvo**: o mais próximo (jogador ou criatura) dentro do alcance e com linha de visão; empate vai para a criatura. Não há mira/direção: o jogo não tem direção de rosto ainda, então "direção" do Documento Mestre 6.3 fica pendente.
- **Linha de visão**: parede e árvore bloqueiam; água não. Vale também para golpes contra criaturas.
- **Errar gasta a recarga** (mudança em relação à Etapa 8, em que atacar sem alvo não gastava nada).
- **Desconectado continua alvo**: o personagem fica 15 s no mundo (janela de reconexão) e pode morrer; é o que o Documento Mestre 7.6 recomenda contra fugir da luta pela desconexão. Durante a janela o tempo de sobrevivência continua congelado.
- **Proteção de reaparecimento: 3 s, só contra jogadores** (`SPAWN_GRACE_MS`, 0 desliga). Não é invulnerabilidade permanente (Documento Mestre 5.5): acaba sozinha e acaba na hora se o protegido atacar. Zumbis não respeitam a proteção. DECISÃO PARA O USUÁRIO CONFIRMAR: manter, aumentar ou zerar.
- **Crédito da morte**: quem causou o último dano em até 15 s (`KILL_CREDIT_MS`) aparece no evento `kill`. Não há placar nem estatística salva ainda.
- **Dois golpes no mesmo instante**: vida zerada já conta como morto na hora (não leva dano nem gera crédito/mochila de novo).
- **Sem fogo amigo especial, sem zona segura**: PvP sempre ativo (Documento Mestre 1 e 5.5).
- **Compensação de lag: nenhuma.** O servidor usa as posições que ele conhece; o cliente desenha os outros ~100 ms no passado. Nas bordas do alcance um golpe pode errar "por pouco". Medir antes de compensar.
- **`COMBAT_EVENT` é só feedback**: o cliente nunca confirma dano por ele; vida, morte e loot chegam por `PLAYER_STATE`, snapshot e `ENTITY_UPDATE`.

## Tomadas na Etapa 10 (valores provisórios, balancear depois de jogar)
- **Bancada = item carregado.** Receitas avançadas (machado, picareta, lança) exigem ter a bancada no inventário; ela não é gasta. Motivo: construção só existe na Etapa 11. Lá a bancada vira peça colocada no mundo e a regra passa a ser "estar perto dela". A bancada ocupa 1 slot e pesa 8 kg.
- **Tempo de fabricação = tempo ocupado.** O resultado é entregue na hora (transação única) e o jogador fica sem poder fabricar de novo durante `craftMs`. Escolhido para não haver estado "fabricando" a cancelar, perder na morte ou na queda de conexão. Se virar barra de progresso com cancelamento, a transação passa a acontecer no fim e precisa de testes novos.
- **Ferramentas não são armas.** Machado e picareta só afetam a coleta (2 unidades por golpe); a única arma nova é a lança.
- **Sem tocha por enquanto**: não existe ciclo de dia/noite. Entra com ele.
- Receitas e quantidades: ver `RECIPES` em `packages/shared/src/crafting.ts` (fonte única de verdade, usada pelo servidor e pela interface).

## Etapa 11 - Construção
- **Estruturas em registro único.** Um só registro (`world-structures`) no mesmo `PlayerStore` dos personagens, regravado no máximo a cada 5 s. Simples e suficiente para o MVP; com muitas bases passa para uma linha por chunk/peça (Etapa 12, banco).
- **Sem leitura = sem construção.** Se não for possível ler o registro (erro, dado inválido, seed diferente), a construção fica desligada e nada é gravado por cima. Trocar de seed/wipe = apagar o registro de propósito.
- **Dono = hash da chave do jogador.** Sem chave salva não se constrói. O cliente nunca recebe o dono, só a marca "meu".
- **Invasão por dano, não por acesso.** Porta e baú só o dono usa; os outros destroem (dano da arma x 0,5). Valores provisórios: confirmar depois de jogar.
- **Uma peça em cima da fundação.** Simplifica colisão, dano e salvamento (grade de tiles). Janela e telhado ficam para depois.
- **Telhado é camada, não peça de topo.** Pode coexistir com parede/porta/janela no mesmo tile; exige apoio. Sem regra de interior ainda (só visual: some quando o jogador está debaixo).
- **Acesso por dono, não por peça.** O dono libera o jogador mais próximo para TODAS as suas portas e baús (máx. 8). O servidor escolhe quem, pela posição que conhece, para o cliente nunca mandar identificador de ninguém.
- **Reparo = madeira pela vida que faltava** (1 por 25). Valor provisório.


## Etapa 12 - Banco e persistência (2026-11-15)
- **`pg` direto em vez de ORM**: o esquema é pequeno (3 tabelas) e o SQL fica visível e revisável. Migrações próprias (lista no código) em vez de ferramenta externa: roda sozinha ao ligar no Render, sem passo manual.
- **Mesmo modelo de dados da Etapa 7** (tabela `players` com `id` e `data jsonb`, estruturas como registro `world-structures`): quem já usa o Supabase por REST pode apontar `DATABASE_URL` para o mesmo banco e nada muda de lugar. O armazenamento por REST continua existindo, sem snapshots/auditoria/backup.
- **Snapshots no mesmo banco**: protegem contra bug, corrupção e trapaça (voltar atrás), NÃO contra perder o banco. Para isso: `backup export` guardado fora e/ou o backup do provedor. Decisão em aberto: agendar backup externo (Etapa 17 ou antes de abrir ao público).
- **Gravar por mudança de inventário (~2 s)** em vez de gravar a cada mudança: limita a carga no banco a 1 gravação/2 s/jogador e perde, na pior queda, no máximo ~2 s de progresso e a posição desde o último autosave (30 s).
- **Recuperar só com dado que passa na validação de carregar**: nunca se restaura algo que o jogo recusaria. Sem snapshot válido, o jogador recomeça (o quebrado fica guardado) e as estruturas continuam desligadas, para não sobrescrever as bases de todos.
- **Banco fora do ar**: quem tenta entrar é recusado (4004) em vez de entrar "zerado"; quem já está jogando continua e regrava quando o banco volta. Não há fila de gravações pendentes em disco (decisão em aberto).
- **SSL**: banco remoto usa SSL sem verificar o certificado por padrão (os planos gratuitos usam certificados que o Node não confia sozinho); `DATABASE_SSL=verify` exige certificado válido.
