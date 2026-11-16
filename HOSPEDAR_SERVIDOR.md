# Hospedar o servidor (pelo celular)

1. Suba `render.yaml` e este arquivo na raiz do repositório.
2. Em render.com, entre com o GitHub. New > Blueprint > escolha o repositório > Apply.
3. Quando ficar "Live", abra `ENDERECO/health`. Deve mostrar `"status":"ok"`.
4. O jogo abre normalmente no link do GitHub Pages (o servidor padrão já é o do Render).

## Salvar personagens (persistência)

Sem isto, o disco do Render gratuito é apagado a cada reinício e os personagens somem.
Usa o Supabase (banco externo). Condições e limites do plano gratuito: confira no site deles.

1. Crie conta em supabase.com e um projeto novo.
2. No projeto: SQL Editor > New query > cole e execute:

```sql
create table players (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);
alter table players enable row level security;
```

3. Pegue duas coisas em Project Settings > API (ou "API Keys"):
   - a **URL do projeto** (https://xxxx.supabase.co);
   - a **chave secreta** (`service_role` / "secret"). NUNCA a chave pública (anon) e NUNCA em arquivo do repositório.
4. No Render: seu serviço > Environment > adicione `SUPABASE_URL` e `SUPABASE_KEY` com esses valores > Save (ele reinicia).
5. Nos logs do Render deve aparecer `personagens salvos em: supabase`.

## Como funciona

- Cada aparelho gera uma **chave secreta** e guarda no navegador. O servidor guarda só o hash dela.
- Salva: inventário, vida/fome/sede/energia e posição. A cada 30 s, ao sair, ao morrer e ao desligar o servidor.
- Quem tem a chave controla o personagem. Limpar os dados do navegador ou trocar de aparelho cria um personagem novo.
- O mesmo personagem não entra duas vezes ao mesmo tempo (a segunda aba é recusada).
- Mochilas de morte e recursos esgotados NÃO são salvos (voltam ao normal se o servidor reiniciar).


## PostgreSQL (Etapa 12, recomendado)

Com `DATABASE_URL` o servidor cria e atualiza as tabelas sozinho (migrações), guarda histórico (snapshots), auditoria e permite backup. Se `DATABASE_URL` existir, ela vale mais que `SUPABASE_URL`/`SUPABASE_KEY`.

1. Use qualquer PostgreSQL: o do próprio Supabase (Project Settings > Database > Connection string, modo **Session pooler** ou **Transaction pooler**, que funciona em IPv4), Neon, Render Postgres etc.
2. No Render: seu serviço > Environment > `DATABASE_URL` = a string de conexão (com a senha) > Save. NUNCA coloque isso em arquivo do repositório.
3. Nos logs do Render deve aparecer `migracoes aplicadas: 1, 2, 3` (na 1ª vez) e `personagens salvos em: postgres`. `ENDERECO/health` mostra `"storage":"postgres"`.
4. Já usava a tabela `players` do Supabase (Etapa 7)? Aponte `DATABASE_URL` para o mesmo projeto: os dados continuam lá e as tabelas novas são criadas ao lado.

## O que é salvo e quando

- Jogador: autosave a cada 30 s, em até ~2 s depois de mudar o inventário (coletar, fabricar, construir, usar item, baú), ao morrer, ao sair e ao desligar o servidor.
- Bases: a cada 5 s se mudaram e ao desligar.
- Snapshots (histórico): na morte, saída, desligamento e a cada 10 min; os 20 mais novos de cada personagem e das bases (`SNAPSHOT_KEEP`).
- Se um registro estiver quebrado, o servidor volta sozinho ao snapshot válido mais novo e anota em `audit_logs`.
- Reiniciar/atualizar o serviço no Render envia SIGTERM: o servidor grava tudo antes de sair. Queda brusca (sem aviso) perde, no máximo, ~2 s de inventário e a posição desde o último autosave.

## Backup

- Manual (precisa de um computador/terminal com `DATABASE_URL`): `pnpm --filter @worldzero/server backup` grava `backups/worldzero-DATA.json` com o estado atual de todos os registros. Restaurar: `pnpm --filter @worldzero/server backup import ARQUIVO.json` (de preferência com o servidor desligado). O arquivo tem hashes de chave e o estado do jogo: guarde-o em lugar privado.
- Backup do banco inteiro (inclui snapshots e auditoria): use o recurso do provedor (Supabase/Neon/Render têm backup ou "point-in-time recovery" em alguns planos; confira no site deles o que o plano gratuito oferece) ou `pg_dump "$DATABASE_URL" > backup.sql`.
- Os snapshots ficam no MESMO banco: protegem de bugs e corrupção, não de perder o banco.


## Servidores / mundos (Etapa 13)

- Cada **mundo** é independente: sala própria, jogadores, criaturas, bases e personagens salvos separados. O mesmo aparelho tem um personagem diferente em cada mundo.
- Cadastro: variável `WORLDS` no Render (Environment), formato `id:Nome:regiao` separados por `;`. Ex.: `mundo-1:Mundo 1:br;mundo-2:Mundo 2:br`. O id usa só `a-z`, `0-9` e hífen (até 24); no máximo 20 mundos. Config inválida impede o servidor de ligar (melhor que ligar com mundos trocados).
- **Não troque nem renomeie o id `mundo-1`**: é ele que mantém os personagens e as bases criados antes da Etapa 13. Ids novos começam do zero.
- Limite: no máximo **50 jogadores por mundo** (`MAX_PLAYERS` de 1 a 50). Mundo cheio recusa a entrada; quem está reconectando (até 15 s) mantém a vaga.
- `ENDERECO/servers` mostra a lista (nome, região, jogadores/limite, status). `ENDERECO/health` mostra `worlds` e `maxPlayers`.
- Todos os mundos rodam no MESMO processo (no plano gratuito do Render, CPU e memória são pequenas): comece com 1 ou 2 mundos. Quantos jogadores o servidor aguenta de verdade só será medido na Etapa 17.
- Todos os mundos usam o mesmo mapa por enquanto (um mapa diferente por mundo entra com as temporadas, Etapa 14).

## Temporada de 7 dias e wipe (Etapa 14)
- Cada mundo vive em temporadas de 7 dias (relógio do SERVIDOR, em UTC). Ao completar 7 dias: `CLOSING` (aviso final de 30 s, sem ações) -> a sala fecha -> `ARCHIVED` (grava o resultado) -> `RESETTING` (apaga personagens, bases, baús e snapshots daquela temporada) -> nova temporada `ACTIVE` com **seed nova** (mapa novo).
- O wipe roda no processo do servidor: **não precisa de jogador conectado**, mas o servidor precisa estar LIGADO (no Render gratuito ele dorme; se estiver dormindo no fim da temporada, o wipe acontece assim que ele acordar).
- O estado fica no registro `meta_season_<mundo>` (mesmo banco dos personagens). Se o servidor cair no meio do wipe, ao religar ele continua de onde parou, sem criar temporada duplicada.
- Dados de conta/histórico (`meta_*`, auditoria e resultados `meta_season_<mundo>_result_<n>`) **não** são apagados.
- Precisa de `DATABASE_URL` (PostgreSQL) ou arquivos para apagar de verdade. Com Supabase por REST o wipe não apaga os registros antigos (eles só ficam inalcançáveis, pois os ids mudam por temporada).
- Só teste: `SEASON_LENGTH_SECONDS` (mín. 5) e `SEASON_GRACE_SECONDS` encurtam a temporada. Não use em produção.
- **Atenção (mudança na Etapa 14):** os ids dos personagens/bases agora incluem mundo e temporada. Personagens e bases salvos nas etapas 7 a 13 deixam de ser lidos: a temporada 1 começa limpa.
