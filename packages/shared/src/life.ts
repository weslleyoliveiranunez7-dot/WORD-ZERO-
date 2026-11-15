import { Inventory, type ItemStack, type Slot } from "./inventory";
import { ITEMS } from "./items";
import { START_VITALS, SurvivalSim } from "./survival";

// Etapa 6: tudo que o servidor sabe sobre a "vida" de UM jogador (medidores, inventario, morte).
// Logica pura (o relogio entra por parametro) para testar sem rede. O cliente nunca altera nada daqui.

export const USE_COOLDOWN_MS = 500; // tempo minimo entre dois consumos
export const RESPAWN_DELAY_MS = 5000; // tempo minimo morto antes de poder reaparecer

export type ActionResult = { ok: true } | { ok: false; reason: string; weight: number };
const fail = (reason: string, weight: number): ActionResult => ({ ok: false, reason, weight });

export class PlayerLife {
  survival = new SurvivalSim(START_VITALS);
  inventory = Inventory.starter();
  deadAtMs: number | null = null;
  lost: ItemStack[] = []; // o que o jogador perdeu na ultima morte (para a tela de morte)
  deaths = 0;
  private lastActionId = -1;
  private lastUseMs = -Infinity;
  invVersion = 0; // sobe a cada mudanca de inventario (o servidor so reenvia quando muda)

  get dead(): boolean {
    return this.deadAtMs !== null;
  }

  // Avanca o tempo de jogo. Devolve true no instante em que o jogador MORRE.
  tick(gameDtSeconds: number, moving: boolean, nowMs: number): boolean {
    if (this.dead) return false;
    this.survival.tick(gameDtSeconds, moving);
    if (this.survival.dead) {
      this.die(nowMs);
      return true;
    }
    return false;
  }

  // Morte: perde TODO o inventario (a mochila de loot no chao entra na Etapa 7; ver DECISOES_TECNICAS).
  // Nada e duplicado: o que sai do inventario so existe em `lost`, que e apenas informativo.
  die(nowMs: number): void {
    if (this.dead) return;
    this.deadAtMs = nowMs;
    this.deaths++;
    this.lost = this.inventory.clear();
    this.invVersion++;
  }

  // Milissegundos que faltam para poder reaparecer (0 se vivo ou se ja pode).
  respawnInMs(nowMs: number): number {
    return this.deadAtMs === null ? 0 : Math.max(0, RESPAWN_DELAY_MS - (nowMs - this.deadAtMs));
  }

  // actionId precisa ser estritamente crescente: repetir um id (replay/duplo clique) nunca executa 2 vezes.
  private freshAction(actionId: number): boolean {
    if (!Number.isInteger(actionId) || actionId <= this.lastActionId) return false;
    this.lastActionId = actionId;
    return true;
  }

  useItem(slot: number, actionId: number, nowMs: number): ActionResult {
    if (this.dead) return fail("morto", 1);
    if (!this.freshAction(actionId)) return fail("acao_repetida", 0);
    if (nowMs - this.lastUseMs < USE_COOLDOWN_MS) return fail("em_recarga", 1);
    const s: Slot = Number.isInteger(slot) && slot >= 0 && slot < this.inventory.size ? this.inventory.slots[slot] : null;
    if (!s) return fail("slot_vazio", 2);
    if (!this.survival.apply(ITEMS[s.id].effects)) return fail("sem_efeito", 0); // nao gasta o item
    this.inventory.removeFromSlot(slot, 1);
    this.lastUseMs = nowMs;
    this.invVersion++;
    return { ok: true };
  }

  // Reaparece com medidores iniciais e kit inicial. O servidor move o jogador para o spawn.
  respawn(actionId: number, nowMs: number): ActionResult {
    if (!this.dead) return fail("vivo", 2);
    if (!this.freshAction(actionId)) return fail("acao_repetida", 0);
    if (this.respawnInMs(nowMs) > 0) return fail("cedo_demais", 1);
    this.survival = new SurvivalSim(START_VITALS);
    this.inventory = Inventory.starter();
    this.deadAtMs = null;
    this.lost = [];
    this.invVersion++;
    return { ok: true };
  }
}
