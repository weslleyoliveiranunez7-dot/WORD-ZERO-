// Etapa 12: tipos e regras comuns a todos os armazenamentos (arquivos, Supabase REST, PostgreSQL).

export interface AuditEvent {
  kind: string; // evento critico: entrou, saiu, morte, personagem_recuperado...
  player?: string; // id do personagem (hash da chave), se houver
  detail?: unknown;
}

export interface SnapshotRow {
  id: string; // ordem crescente: maior = mais novo
  reason: string;
  at: string; // ISO
  data: unknown;
}

export interface BackupRecord {
  id: string;
  data: unknown;
  updatedAt: string;
}

export interface BackupFile {
  format: "worldzero-backup";
  v: 1;
  createdAt: string;
  store: string;
  records: BackupRecord[]; // estado ATUAL de cada registro (personagens e o registro das estruturas)
}

export interface PlayerStore {
  readonly kind: string;
  load(id: string): Promise<unknown | null>;
  save(id: string, data: unknown): Promise<void>;
  // Etapa 12. Opcionais: o Supabase por REST nao tem (use DATABASE_URL para ter tudo).
  snapshot?(id: string, reason: string): Promise<void>; // guarda uma copia do registro ATUAL (historico para recuperar)
  snapshots?(id: string, limit: number): Promise<SnapshotRow[]>; // do mais novo para o mais antigo
  audit?(ev: AuditEvent): Promise<void>;
  exportAll?(): Promise<BackupFile>;
  importAll?(file: BackupFile): Promise<number>; // devolve quantos registros foram restaurados
  close?(): Promise<void>;
}

export const BACKUP_FORMAT = "worldzero-backup" as const;

// Quantos snapshots guardar por registro (SNAPSHOT_KEEP, 1-500, padrao 20). Lido na hora para poder mudar em teste.
export function snapshotKeep(env: NodeJS.ProcessEnv = process.env): number {
  const v = Number(env.SNAPSHOT_KEEP ?? 20);
  return Number.isInteger(v) && v >= 1 && v <= 500 ? v : 20;
}

// ids sao sha256 em hex ou o nome fixo das estruturas; nada com barra, ponto ou espaco chega ao disco/SQL como nome.
export const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/;

export function isBackupFile(raw: unknown): raw is BackupFile {
  if (typeof raw !== "object" || raw === null) return false;
  const r = raw as Record<string, unknown>;
  if (r.format !== BACKUP_FORMAT || r.v !== 1 || !Array.isArray(r.records)) return false;
  return r.records.every((x) => {
    if (typeof x !== "object" || x === null) return false;
    const o = x as Record<string, unknown>;
    return typeof o.id === "string" && SAFE_ID.test(o.id) && typeof o.data === "object" && o.data !== null && !Array.isArray(o.data);
  });
}
