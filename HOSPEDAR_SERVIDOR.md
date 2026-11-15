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
