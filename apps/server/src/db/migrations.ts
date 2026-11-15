import { createHash } from "node:crypto";

// Etapa 12: migracoes do PostgreSQL. Cada migracao roda UMA vez, dentro de uma transacao, e fica registrada em
// schema_migrations com o checksum do texto. Mudar o texto de uma migracao ja aplicada e erro (crie uma nova).
// Um lock do banco impede dois servidores de migrar ao mesmo tempo.

export interface DbClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(): void;
}
export interface Db {
  connect(): Promise<DbClient>;
}

export class MigrationError extends Error {}

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "players",
    sql: `
create table if not exists players (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table players enable row level security;
`,
  },
  {
    version: 2,
    name: "snapshots_e_auditoria",
    sql: `
create table if not exists snapshots (
  id bigserial primary key,
  record_id text not null,
  reason text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists snapshots_record_idx on snapshots (record_id, id desc);
alter table snapshots enable row level security;

create table if not exists audit_logs (
  id bigserial primary key,
  at timestamptz not null default now(),
  kind text not null,
  player_id text,
  detail jsonb
);
create index if not exists audit_logs_kind_idx on audit_logs (kind, id desc);
create index if not exists audit_logs_player_idx on audit_logs (player_id, id desc);
alter table audit_logs enable row level security;
`,
  },
  {
    version: 3,
    name: "players_data_objeto",
    sql: `
alter table players add constraint players_data_objeto check (jsonb_typeof(data) = 'object');
`,
  },
];

const LOCK_KEY = 7_120_012; // numero qualquer, so precisa ser o mesmo em todos os servidores

export const checksum = (sql: string): string => createHash("sha256").update(sql).digest("hex");

// Devolve as versoes aplicadas AGORA (as que ja existiam nao entram).
export async function runMigrations(db: Db, migrations: Migration[] = MIGRATIONS): Promise<number[]> {
  const versions = migrations.map((m) => m.version);
  if (new Set(versions).size !== versions.length || versions.some((v, i) => i > 0 && v <= versions[i - 1])) {
    throw new MigrationError("versoes de migracao fora de ordem ou repetidas");
  }
  const c = await db.connect();
  const applied: number[] = [];
  try {
    await c.query("select pg_advisory_lock($1)", [LOCK_KEY]);
    try {
      await c.query(
        "create table if not exists schema_migrations (version integer primary key, name text not null, checksum text not null, applied_at timestamptz not null default now())",
      );
      const done = await c.query("select version, checksum from schema_migrations order by version");
      const known = new Map<number, string>(done.rows.map((r) => [Number(r.version), String(r.checksum)]));
      for (const m of migrations) {
        const sum = checksum(m.sql);
        const old = known.get(m.version);
        if (old !== undefined) {
          if (old !== sum) throw new MigrationError(`migracao ${m.version} (${m.name}) foi alterada depois de aplicada; crie uma nova em vez de editar`);
          continue;
        }
        await c.query("begin");
        try {
          await c.query(m.sql);
          await c.query("insert into schema_migrations (version, name, checksum) values ($1, $2, $3)", [m.version, m.name, sum]);
          await c.query("commit");
        } catch (e) {
          await c.query("rollback").catch(() => undefined);
          throw new MigrationError(`migracao ${m.version} (${m.name}) falhou: ${e instanceof Error ? e.message : String(e)}`);
        }
        applied.push(m.version);
      }
    } finally {
      await c.query("select pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => undefined);
    }
  } finally {
    c.release();
  }
  return applied;
}
