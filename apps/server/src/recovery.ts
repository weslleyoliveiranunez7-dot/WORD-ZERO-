import type { PlayerStore } from "./db/types";

// Etapa 12: recuperacao. Quando o registro ATUAL esta ilegivel/invalido, procura o snapshot mais novo que passa na
// MESMA validacao usada para carregar (parseSave / StructureWorld.fromSave). Nunca devolve dado que a validacao recusa.
export interface Recovered<T> {
  value: T;
  raw: unknown; // o dado do snapshot, para gravar de volta como registro atual
  snapshotId: string;
  at: string;
  reason: string;
  skipped: number; // quantos snapshots mais novos estavam invalidos
}

export async function recoverFromSnapshots<T>(store: PlayerStore, id: string, validate: (raw: unknown) => T | null, limit = 50): Promise<Recovered<T> | null> {
  if (!store.snapshots) return null;
  const rows = await store.snapshots(id, limit);
  let skipped = 0;
  for (const s of rows) {
    const value = validate(s.data);
    if (value !== null) return { value, raw: s.data, snapshotId: s.id, at: s.at, reason: s.reason, skipped };
    skipped++;
  }
  return null;
}
