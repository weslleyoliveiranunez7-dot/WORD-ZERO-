import type { ChunkedWorld } from "./chunks";
import { HARVEST_COOLDOWN_MS, type LootWorld } from "./loot";
import { craftItem } from "./crafting";
import { Inventory, type ItemStack, type Slot } from "./inventory";
import { ITEMS } from "./items";
import { START_VITALS, SurvivalSim } from "./survival";

// Etapa 6: tudo que o servidor sabe sobre a "vida" de UM jogador (medidores, inventario, morte).
// Logica pura (o relogio entra por parametro) para testar sem rede. O cliente nunca altera nada daqui.

export const USE_COOLDOWN_MS = 500; // tempo minimo entre dois consumos
export const ATTACK_COOLDOWN_MS = 700; // tempo minimo entre dois golpes
export const RESPAWN_DELAY_MS = 5000; // tempo minimo morto antes de poder reaparecer
// Etapa 9: protecao CURTA contra outros jogadores logo apos reaparecer (evita matar quem acabou de nascer, em loop).
// Nao e invulnerabilidade permanente: acaba sozinha e acaba na hora se o protegido atacar. 0 desliga.
export const SPAWN_GRACE_MS = 3000;
export const KILL_CREDIT_MS = 15_000; // quem causou o ultimo dano recebe o credito da morte se ela vier em ate este tempo

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
  private lastInteractMs = -Infinity;
  private lastAttackMs = -Infinity;
  private craftBusyUntilMs = 0; // Etapa 10: ate quando a fabricacao em andamento ocupa o jogador
  invVersion = 0; // sobe a cada mudanca de inventario (o servidor so reenvia quando muda)
  graceUntilMs = 0; // Etapa 9: ate quando o jogador esta protegido de OUTROS JOGADORES (so apos reaparecer)
  lastHit: { by: string; atMs: number } | null = null; // Etapa 9: ultimo jogador que causou dano (credito da morte)

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

  // Morte: o inventario esvazia. `lost` e so uma COPIA informativa (tela de morte); quem cria a mochila
  // no chao (LootWorld.addDrop) e o servidor, uma unica vez, a partir de `lost`. Nada e duplicado.
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

  // Etapa 8/9: autoriza UM golpe (vivo, id novo, fora de recarga). Quem acha o alvo e causa o dano e o servidor.
  // A recarga vem da arma (decidida pelo servidor, nunca pelo cliente). Atacar encerra a protecao de reaparecimento.
  startAttack(actionId: number, nowMs: number, cooldownMs: number = ATTACK_COOLDOWN_MS): ActionResult {
    if (this.dead || this.survival.dead) return fail("morto", 1);
    if (!this.freshAction(actionId)) return fail("acao_repetida", 0);
    if (nowMs - this.lastAttackMs < cooldownMs) return fail("em_recarga", 1);
    this.lastAttackMs = nowMs;
    this.graceUntilMs = 0;
    return { ok: true };
  }

  inGrace(nowMs: number): boolean {
    return nowMs < this.graceUntilMs;
  }

  // Etapa 9: dano de OUTRO JOGADOR. false = ignorado (ja morto, ja com vida zerada neste tick, protegido ou valor invalido).
  // "Vida zerada neste tick" conta como morto: dois golpes no mesmo instante nao dao dano nem credito duplicado.
  takeHit(amount: number, byId: string, nowMs: number): boolean {
    if (this.dead || this.survival.dead || this.inGrace(nowMs)) return false;
    if (!Number.isFinite(amount) || amount <= 0) return false;
    this.survival.damage(amount);
    this.lastHit = { by: byId, atMs: nowMs };
    return true;
  }

  // Etapa 10: fabricar. `recipe` vem da rede (ja validado por inspectCraft, mas craftItem revalida). Ingredientes e resultado
  // mudam numa transacao unica; repetir o actionId nunca fabrica 2x; o tempo da receita deixa o jogador ocupado.
  craft(recipe: unknown, actionId: number, nowMs: number): ActionResult {
    if (this.dead) return fail("morto", 1);
    if (!this.freshAction(actionId)) return fail("acao_repetida", 0);
    if (nowMs < this.craftBusyUntilMs) return fail("em_recarga", 1);
    const r = craftItem(this.inventory, recipe);
    if (!r.ok) return fail(r.reason, 0); // faltou ingrediente / bancada / espaco: so avisa, nada mudou
    this.craftBusyUntilMs = nowMs + r.recipe.craftMs;
    this.invVersion++;
    return { ok: true };
  }

  // Etapa 7: coletar recurso ou pegar mochila perto de (px,py), a posicao que o SERVIDOR conhece.
  interact(actionId: number, nowMs: number, world: ChunkedWorld, loot: LootWorld, px: number, py: number): ActionResult {
    if (this.dead) return fail("morto", 1);
    if (!this.freshAction(actionId)) return fail("acao_repetida", 0);
    if (nowMs - this.lastInteractMs < HARVEST_COOLDOWN_MS) return fail("em_recarga", 1);
    const r = loot.interact(world, this.inventory, px, py, nowMs);
    if (!r.ok) return fail(r.reason, 0); // nada por perto / esgotado / cheio: so avisa, nao pune
    this.lastInteractMs = nowMs;
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
    this.craftBusyUntilMs = 0;
    this.lost = [];
    this.lastHit = null;
    this.graceUntilMs = nowMs + SPAWN_GRACE_MS;
    this.invVersion++;
    return { ok: true };
  }
}
