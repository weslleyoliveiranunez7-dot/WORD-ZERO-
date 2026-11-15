import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Etapa 7: armazenamento do personagem. A chave secreta do jogador NUNCA e guardada: so o hash dela.
// Dois backends: arquivos JSON (local; no Render gratuito o disco some a cada reinicio) ou Supabase (externo, persiste).

export interface PlayerStore {
  readonly kind: string;
  load(id: string): Promise<unknown | null>;
  save(id: string, data: unknown): Promise<void>;
}

export const keyToId = (key: string): string => createHash("sha256").update(key).digest("hex");

const TIMEOUT_MS = 4000;

export class FileStore implements PlayerStore {
  readonly kind = "arquivos";
  constructor(private dir: string) {}

  private path(id: string): string {
    return join(this.dir, `${id}.json`); // id e hex de sha256: nao ha como escapar da pasta
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
    const tmp = this.path(id) + ".tmp";
    await writeFile(tmp, JSON.stringify(data));
    await rename(tmp, this.path(id)); // troca atomica: nunca fica arquivo pela metade
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

export function createStore(env: NodeJS.ProcessEnv = process.env): PlayerStore {
  if (env.SUPABASE_URL && env.SUPABASE_KEY) return new SupabaseStore(env.SUPABASE_URL, env.SUPABASE_KEY);
  return new FileStore(env.DATA_DIR ?? "data");
}
