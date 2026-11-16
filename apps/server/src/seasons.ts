import { SEASON_CLOSING_GRACE_MS, newSeason, parseSeasonRecord, seasonDurationFromEnv, type SeasonRecord, type SeasonResult } from "@worldzero/shared";
import type { PlayerStore } from "./store";
import { seasonScope } from "./worlds";

// Etapa 14: relogio da temporada NO BACKEND. Roda no processo do servidor, nao depende de nenhum jogador conectado.
// Cada mundo tem UM registro `meta_season_<mundo>` (o estado atual) e, ao arquivar, `meta_season_<mundo>_result_<n>`.
// Cada passo grava o registro ANTES de agir: se o servidor cair no meio, ao religar ele continua de onde parou (tudo e idempotente).

export interface SeasonHost {
  closeWorld(worldId: string): void; // desconecta todos e fecha a sala (idempotente)
  roomAlive(worldId: string): boolean; // ainda ha sala viva deste mundo?
}

export interface SeasonOptions {
  durationMs: number;
  graceMs: number;
  now: () => number;
  log: (msg: string) => void;
}

export const seasonRecordId = (worldId: string): string => `meta_season_${worldId}`;
export const seasonResultId = (worldId: string, n: number): string => `meta_season_${worldId}_result_${n}`;

export function seasonOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): SeasonOptions {
  const graceRaw = env.SEASON_GRACE_SECONDS;
  const grace = graceRaw === undefined || graceRaw === "" ? SEASON_CLOSING_GRACE_MS : Number(graceRaw) * 1000;
  if (!Number.isFinite(grace) || grace < 0 || grace > 600_000) throw new Error(`SEASON_GRACE_SECONDS invalido: ${graceRaw}`);
  return { durationMs: seasonDurationFromEnv(env.SEASON_LENGTH_SECONDS), graceMs: grace, now: Date.now, log: (m) => console.log(`[temporada] ${m}`) };
}

export class SeasonManager {
  private recs = new Map<string, SeasonRecord>();
  private broken = new Set<string>(); // registro invalido: o mundo NAO abre (nunca inventamos uma temporada por cima de dado quebrado)
  private busy = new Set<string>();
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private store: PlayerStore,
    private worldIds: string[],
    private host: SeasonHost,
    private opt: SeasonOptions,
  ) {}

  // Le (ou cria a temporada 1) de cada mundo. Chamado ANTES de aceitar jogadores.
  async init(): Promise<void> {
    for (const w of this.worldIds) {
      const raw = await this.store.load(seasonRecordId(w)); // erro de leitura sobe: o servidor nao liga sem saber a temporada
      if (raw === null) {
        const rec = newSeason(w, 1, this.opt.now(), this.opt.durationMs);
        await this.save(rec);
        await this.store.audit?.({ kind: "temporada_iniciada", detail: { mundo: w, n: 1, seed: rec.seed } });
        this.recs.set(w, rec);
        this.opt.log(`${w}: temporada 1 iniciada (seed ${rec.seed})`);
        continue;
      }
      const rec = parseSeasonRecord(raw, w);
      if (!rec) {
        this.broken.add(w);
        this.opt.log(`${w}: registro de temporada INVALIDO; o mundo fica fechado (nada foi apagado nem criado)`);
        await this.store.audit?.({ kind: "temporada_invalida", detail: { mundo: w } });
        continue;
      }
      this.recs.set(w, rec);
      this.opt.log(`${w}: temporada ${rec.n} (${rec.status})`);
    }
  }

  start(tickMs = 1000): void {
    this.stop();
    this.timer = setInterval(() => void this.tick(), tickMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  current(worldId: string): SeasonRecord | undefined {
    return this.recs.get(worldId);
  }

  // O mundo aceita jogadores/acoes? Nao se esta fechando, arquivando, em reset ou com registro invalido.
  active(worldId: string): boolean {
    return this.recs.get(worldId)?.status === "ACTIVE" && !this.broken.has(worldId);
  }

  async tick(): Promise<void> {
    for (const w of this.recs.keys()) {
      if (this.busy.has(w)) continue; // um passo por mundo de cada vez
      this.busy.add(w);
      try {
        for (let guard = 0; guard < 8 && (await this.step(w)); guard++);
      } catch (e) {
        this.opt.log(`${w}: erro (tenta de novo no proximo ciclo): ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        this.busy.delete(w);
      }
    }
  }

  private async save(rec: SeasonRecord): Promise<void> {
    await this.store.save(seasonRecordId(rec.worldId), rec);
  }

  // Um passo da maquina de estados. true = avancou (tenta o proximo na mesma rodada).
  private async step(w: string): Promise<boolean> {
    const rec = this.recs.get(w);
    if (!rec) return false;
    const now = this.opt.now();
    switch (rec.status) {
      case "ACTIVE": {
        if (now < rec.endsAt) return false;
        const next: SeasonRecord = { ...rec, status: "CLOSING", closingAt: now };
        await this.save(next); // grava ANTES: as salas passam a recusar acoes e entradas
        this.recs.set(w, next);
        await this.store.audit?.({ kind: "temporada_encerrando", detail: { mundo: w, n: rec.n } });
        this.opt.log(`${w}: temporada ${rec.n} acabou: encerrando (aviso de ${Math.round(this.opt.graceMs / 1000)} s)`);
        return true;
      }
      case "CLOSING": {
        if (now - (rec.closingAt ?? now) < this.opt.graceMs) return false; // jogadores veem a contagem final
        this.host.closeWorld(w);
        if (this.host.roomAlive(w)) return false; // espera a sala fechar (o fechamento grava os jogadores: tem de terminar ANTES do wipe)
        const result: SeasonResult = { v: 1, worldId: w, n: rec.n, seed: rec.seed, startedAt: rec.startedAt, endsAt: rec.endsAt, closedAt: rec.closingAt ?? now, archivedAt: now };
        await this.store.save(seasonResultId(w, rec.n), result); // arquivo do resultado (so historia, nada de gameplay)
        const next: SeasonRecord = { ...rec, status: "ARCHIVED" };
        await this.save(next);
        this.recs.set(w, next);
        await this.store.audit?.({ kind: "temporada_arquivada", detail: { mundo: w, n: rec.n } });
        this.opt.log(`${w}: temporada ${rec.n} arquivada`);
        return true;
      }
      case "ARCHIVED": {
        const next: SeasonRecord = { ...rec, status: "RESETTING" };
        await this.save(next);
        this.recs.set(w, next);
        return true;
      }
      case "RESETTING": {
        if (this.host.roomAlive(w)) {
          this.host.closeWorld(w); // nao apaga com sala viva (ela gravaria por cima)
          return false;
        }
        let removed = 0;
        if (this.store.purge) {
          removed = await this.store.purge(seasonScope(w, rec.n)); // personagens, bases, baus e snapshots desta temporada
          const again = await this.store.purge(seasonScope(w, rec.n));
          if (again !== 0) throw new Error(`wipe incompleto: restaram ${again} registros`); // verificacao: nada pode sobrar
        } else {
          this.opt.log(`${w}: armazenamento sem purge: os registros da temporada ${rec.n} ficam inalcancaveis (ids novos), mas NAO foram apagados`);
        }
        const fresh = newSeason(w, rec.n + 1, now, this.opt.durationMs); // so agora a temporada nova existe: o registro unico garante que nao duplica
        await this.save(fresh);
        this.recs.set(w, fresh);
        await this.store.audit?.({ kind: "wipe_concluido", detail: { mundo: w, de: rec.n, para: fresh.n, apagados: removed, seed: fresh.seed } });
        this.opt.log(`${w}: wipe feito (${removed} registros); temporada ${fresh.n} iniciada (seed ${fresh.seed})`);
        return true;
      }
    }
  }
}
