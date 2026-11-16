import type { Inventory } from "./inventory";
import type { ItemId } from "./items";

// 9.4 Acougue: conservacao. Carne fresca apodrece com o tempo, SEM guardar relogio por pilha: a cada intervalo, cada
// unidade perecivel na mochila tem uma chance de virar carne contaminada. Sorteio sem estado = nada novo para salvar e
// o jogo continua valido apos reiniciar. Carne conservada (receita `preserve_meat`) nao apodrece.
// Limite conhecido: o que esta no bau nao apodrece (o bau nao e simulado a cada tick).

export const SPOIL_INTERVAL_MS = 60_000; // um teste por minuto conectado
export interface Perishable {
  becomes: ItemId; // em que vira ao apodrecer
  qty: number; // quantas unidades surgem por unidade que apodrece
  chance: number; // chance por unidade em cada teste (0..1)
}
export const PERISHABLE: Partial<Record<ItemId, Perishable>> = {
  deer_carcass: { becomes: "tainted_meat", qty: 3, chance: 0.04 },
  raw_meat: { becomes: "tainted_meat", qty: 1, chance: 0.05 },
  steak: { becomes: "tainted_meat", qty: 1, chance: 0.05 },
};

// Testa o apodrecimento de toda a mochila. Devolve quantas unidades apodreceram. Transacao: se o item podre nao couber
// (slot/peso), ele continua como estava e tenta de novo no proximo teste. Nunca cria nem some itens alem da troca.
export function spoilPerishables(inv: Inventory, rng: () => number = Math.random): number {
  let rotted = 0;
  for (const idStr of Object.keys(PERISHABLE)) {
    const id = idStr as ItemId;
    const rule = PERISHABLE[id]!;
    const n = inv.count(id);
    let bad = 0;
    for (let i = 0; i < n; i++) if (rng() < rule.chance) bad++;
    if (bad === 0) continue;
    const trial = inv.clone();
    if (!trial.removeById(id, bad) || trial.add(rule.becomes, bad * rule.qty) > 0) continue;
    inv.copyFrom(trial);
    rotted += bad;
  }
  return rotted;
}
