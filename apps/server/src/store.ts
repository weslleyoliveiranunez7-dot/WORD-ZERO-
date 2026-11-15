import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PostgresStore } from "./db/postgres";
import { BACKUP_FORMAT, SAFE_ID, snapshotKeep, type AuditEvent, type BackupFile, type PlayerStore, type SnapshotRow } from "./db/types";

// Armazenamento do personagem e do mundo. A chave secreta do jogador NUNCA e guardada: so o hash dela.
// Tres backends (nesta ordem de preferencia):
//  1. PostgreSQL (DATABASE_URL): migracoes, snapshots, auditoria, backup. E o caminho recomendado (Etapa 12).
//  2. Supabase por REST (SUPABASE_URL + SUPABASE_KEY): so le/grava (Etapa 7). Mantido para quem ja usa.
//  3. Arquivos JSON (DATA_DIR): local e testes; no Render gratuito o disco some a cada reinicio.

export type { AuditEvent, BackupFile, PlayerStore, SnapshotRow } from "./db/types";

export const keyToId = (key: string): string => createHash("sha256").update(key).digest("hex");

const TIMEOUT_MS = 4000;

let fileSeq = 0;

export class FileStore implements PlayerStore {
  readonly kind = "arquivos";
  constructor(private dir: string) {}

  private path(id: string): string {
    if (!SAFE_ID.test(id)) throw new Error("id invalido");
    return join(this.dir, `${id}.json`); // id so tem letras, numeros, _ e -: nao ha como escapar da pasta
  }
  private snapDir(id: string): string {
    if (!SAFE_ID.test(id)) throw new Error("id invalido");
    return join(this.dir, "snapshots", id);
  }

  async load(id: string): Promise<unknown | null> {
    try {
      return JSON.parse(await readFile(this.path(id), "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async save(id: string, data: unknown): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const tmp = `${this.path(id)}.${process.pid}.${++fileSeq}.tmp`;
    await writeFile(tmp, JSON.stringify(data));
    await rename(tmp, this.path(id)); // troca atomica: nunca fica arquivo pela metade
  }

  async snapshot(id: string, reason: string): Promise<void> {
    let text: string;
    try {
      text = await readFile(this.path(id), "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
      throw e;
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { _texto_invalido: text.slice(0, 2000) }; // guarda o que havia, mesmo quebrado
    }
    const dir = this.snapDir(id);
    await mkdir(dir, { recursive: true });
    const name = `${String(Date.now()).padStart(15, "0")}-${String(++fileSeq).padStart(6, "0")}.json`;
    await writeFile(join(dir, name), JSON.stringify({ reason: reason.slice(0, 64), at: new Date().toISOString(), data }));
    const all = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
    for (const old of all.slice(0, Math.max(0, all.length - snapshotKeep()))) await rm(join(dir, old), { force: true });
  }

  async snapshots(id: string, limit: number): Promise<SnapshotRow[]> {
    let names: string[];
    try {
      names = (await readdir(this.snapDir(id))).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, limit);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
    const out: SnapshotRow[] = [];
    for (const n of names) {
      try {
        const j = JSON.parse(await readFile(join(this.snapDir(id), n), "utf8")) as { reason: string; at: string; data: unknown };
        out.push({ id: n.replace(/\.json$/, ""), reason: j.reason, at: j.at, data: j.data });
      } catch {
        /* snapshot ilegivel: pula */
      }
    }
    return out;
  }

  async audit(ev: AuditEvent): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await appendFile(join(this.dir, "audit.log"), `${JSON.stringify({ at: new Date().toISOString(), ...ev })}\n`);
  }

  async exportAll(): Promise<BackupFile> {
    let names: string[] = [];
    try {
      names = await readdir(this.dir);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    const records = [];
    for (const n of names.filter((f) => f.endsWith(".json")).sort()) {
      const id = n.replace(/\.json$/, "");
      if (!SAFE_ID.test(id)) continue;
      try {
        records.push({ id, data: JSON.parse(await readFile(join(this.dir, n), "utf8")) as unknown, updatedAt: new Date().toISOString() });
      } catch {
        /* registro quebrado nao entra no backup */
      }
    }
    return { format: BACKUP_FORMAT, v: 1, createdAt: new Date().toISOString(), store: this.kind, records };
  }

  async importAll(file: BackupFile): Promise<number> {
    for (const r of file.records) if (!SAFE_ID.test(r.id)) throw new Error("id invalido no backup");
    for (const r of file.records) await this.save(r.id, r.data);
    return file.records.length;
  }
}

// Tabela esperada: players(id text primary key, data jsonb, updated_at timestamptz). Ver HOSPEDAR_SERVIDOR.md.
export class SupabaseStore implements PlayerStore {
  readonly kind = "supabase";
  private url: string;
  constructor(url: string, private key: string) {
    this.url = url.replace(/\/+$/, "");
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { apikey: this.key, "Content-Type": "application/json" };
    if (this.key.startsWith("eyJ")) h.Authorization = `Bearer ${this.key}`; // chave antiga (JWT); as novas usam so apikey
    return h;
  }

  async load(id: string): Promise<unknown | null> {
    if (!SAFE_ID.test(id)) throw new Error("id invalido");
    const res = await fetch(`${this.url}/rest/v1/players?id=eq.${id}&select=data`, { headers: this.headers(), signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`supabase load ${res.status}`);
    const rows = (await res.json()) as { data: unknown }[];
    return rows.length > 0 ? rows[0].data : null;
  }

  async save(id: string, data: unknown): Promise<void> {
    const res = await fetch(`${this.url}/rest/v1/players?on_conflict=id`, {
      method: "POST",
      headers: { ...this.headers(), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id, data, updated_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`supabase save ${res.status}`);
  }
}

export async function createStore(env: NodeJS.ProcessEnv = process.env): Promise<PlayerStore> {
  if (env.DATABASE_URL) return PostgresStore.connect(env.DATABASE_URL, env);
  if (env.SUPABASE_URL && env.SUPABASE_KEY) return new SupabaseStore(env.SUPABASE_URL, env.SUPABASE_KEY);
  return new FileStore(env.DATA_DIR ?? "data");
}
