import { Pool } from "pg";
import { BACKUP_FORMAT, SAFE_ID, snapshotKeep, type AuditEvent, type BackupFile, type PlayerStore, type SnapshotRow } from "./types";
import { MigrationError, runMigrations, type Db } from "./migrations";

// Etapa 12: PostgreSQL de verdade (Supabase, Neon, Render Postgres, local...). Variavel: DATABASE_URL.
// Cria/atualiza as tabelas sozinho (migracoes) na hora de ligar. A chave secreta do jogador nunca chega aqui: so o hash.

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Banco remoto exige SSL; local nao. DATABASE_SSL=disable desliga, =verify exige certificado valido.
function sslFor(url: string, env: NodeJS.ProcessEnv): false | { rejectUnauthorized: boolean } {
  if (env.DATABASE_SSL === "disable") return false;
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    /* url invalida: o pg reclama depois */
  }
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
  return { rejectUnauthorized: env.DATABASE_SSL === "verify" };
}

function wrap(pool: Pool): Db {
  return {
    connect: async () => {
      const c = await pool.connect();
      return {
        query: async (text: string, values?: unknown[]) => {
          const r = await c.query(text, values);
          return { rows: r.rows as Record<string, unknown>[] };
        },
        release: () => c.release(),
      };
    },
  };
}

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());

export class PostgresStore implements PlayerStore {
  readonly kind = "postgres";
  private constructor(private pool: Pool) {}

  // Liga, migra e devolve o armazenamento. Banco acordando (plano gratuito): tenta 5 vezes. Erro de migracao nao e repetido.
  static async connect(url: string, env: NodeJS.ProcessEnv = process.env): Promise<PostgresStore> {
    const pool = new Pool({
      connectionString: url,
      max: 5,
      connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 8000,
      ssl: sslFor(url, env),
    });
    pool.on("error", (e: Error) => console.error("[postgres] erro em conexao ociosa:", e.message));
    let last: unknown;
    for (let i = 1; i <= 5; i++) {
      try {
        const applied = await runMigrations(wrap(pool));
        if (applied.length > 0) console.log(`[postgres] migracoes aplicadas: ${applied.join(", ")}`);
        return new PostgresStore(pool);
      } catch (e) {
        last = e;
        if (e instanceof MigrationError) break;
        console.error(`[postgres] tentativa ${i}/5 de conectar falhou: ${e instanceof Error ? e.message : String(e)}`);
        if (i < 5) await sleep(2000 * i);
      }
    }
    await pool.end().catch(() => undefined);
    throw last;
  }

  async load(id: string): Promise<unknown | null> {
    const r = await this.pool.query("select data from players where id = $1", [id]);
    return r.rows.length > 0 ? (r.rows[0] as { data: unknown }).data : null;
  }

  async save(id: string, data: unknown): Promise<void> {
    await this.pool.query(
      "insert into players (id, data, updated_at) values ($1, $2::jsonb, now()) on conflict (id) do update set data = excluded.data, updated_at = now()",
      [id, JSON.stringify(data)],
    );
  }

  // Copia o registro ATUAL (o que acabou de ser salvo) e apaga os mais antigos alem do limite.
  async snapshot(id: string, reason: string): Promise<void> {
    await this.pool.query("insert into snapshots (record_id, reason, data) select id, $2, data from players where id = $1", [id, reason.slice(0, 64)]);
    await this.pool.query(
      "delete from snapshots where record_id = $1 and id not in (select id from snapshots where record_id = $1 order by id desc limit $2)",
      [id, snapshotKeep()],
    );
  }

  async snapshots(id: string, limit: number): Promise<SnapshotRow[]> {
    const r = await this.pool.query("select id::text as id, reason, created_at, data from snapshots where record_id = $1 order by id desc limit $2", [id, limit]);
    return r.rows.map((x) => {
      const row = x as { id: string; reason: string; created_at: unknown; data: unknown };
      return { id: row.id, reason: row.reason, at: iso(row.created_at), data: row.data };
    });
  }

  async audit(ev: AuditEvent): Promise<void> {
    await this.pool.query("insert into audit_logs (kind, player_id, detail) values ($1, $2, $3::jsonb)", [ev.kind.slice(0, 64), ev.player ?? null, JSON.stringify(ev.detail ?? null)]);
  }

  async exportAll(): Promise<BackupFile> {
    const r = await this.pool.query("select id, data, updated_at from players order by id");
    return {
      format: BACKUP_FORMAT,
      v: 1,
      createdAt: new Date().toISOString(),
      store: this.kind,
      records: r.rows.map((x) => {
        const row = x as { id: string; data: unknown; updated_at: unknown };
        return { id: row.id, data: row.data, updatedAt: iso(row.updated_at) };
      }),
    };
  }

  // Restaura o estado atual de cada registro (tudo ou nada: uma transacao). Snapshots e auditoria ficam como estao.
  async importAll(file: BackupFile): Promise<number> {
    const c = await this.pool.connect();
    try {
      await c.query("begin");
      for (const rec of file.records) {
        if (!SAFE_ID.test(rec.id)) throw new Error(`id invalido no backup: ${rec.id.slice(0, 20)}`);
        await c.query(
          "insert into players (id, data, updated_at) values ($1, $2::jsonb, now()) on conflict (id) do update set data = excluded.data, updated_at = now()",
          [rec.id, JSON.stringify(rec.data)],
        );
      }
      await c.query("commit");
      return file.records.length;
    } catch (e) {
      await c.query("rollback").catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }
  }

  // Para testes e manutencao.
  async appliedMigrations(): Promise<number[]> {
    const r = await this.pool.query("select version from schema_migrations order by version");
    return r.rows.map((x) => Number((x as { version: unknown }).version));
  }

  async countAudit(kind: string): Promise<number> {
    const r = await this.pool.query("select count(*)::int as n from audit_logs where kind = $1", [kind]);
    return Number((r.rows[0] as { n: unknown }).n);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
