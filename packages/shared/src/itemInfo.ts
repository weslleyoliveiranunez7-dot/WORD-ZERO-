import type { ItemStack } from "./inventory";
import { ITEMS, type ItemId } from "./items";

// EXTRA 6.3: texto e comparacao de itens para o painel (so leitura; o servidor nao depende disto).

export const ITEM_DESC: Record<ItemId, string> = {
  canned_food: "Lata fechada de comida. Dura muito e mata a fome sem estragar.",
  water_bottle: "Garrafa de agua limpa. Mata a sede.",
  bandage: "Faixa de pano limpo. Estanca sangramento e cobre a ferida.",
  energy_bar: "Barra compacta. Devolve energia e engana a fome por um tempo.",
  wood: "Madeira bruta de arvore. Base de quase tudo que se fabrica ou constroi.",
  stone: "Pedra pesada das ruinas. Usada em ferramentas e armas.",
  scrap: "Sucata e pedacos de metal. Serve para fabricar e consertar.",
  raw_meat: "Carne crua. Mata a fome pouco, mas e melhor que nada.",
  club: "Porrete de madeira. Golpe pesado e lento, de curto alcance.",
  workbench: "Bancada simples. Precisa estar na mochila para fabricar itens avancados.",
  axe: "Machado improvisado. Com ele cada arvore rende o dobro de madeira.",
  pickaxe: "Picareta simples. Com ela pedra e sucata rendem o dobro.",
  spear: "Lanca de madeira com ponta de pedra. Alcance maior que o porrete.",
  torch: "Tocha. Ilumina a noite, mas queima quem for atingido com ela acesa.",
  dressing: "Curativo pequeno. Estanca corte leve e cobre a ferida.",
  splint: "Tala improvisada. Imobiliza uma fratura para ela cicatrizar.",
  painkiller: "Comprimidos que reduzem a dor por alguns minutos.",
  antibiotic: "Antibiotico. Cura infeccoes.",
  antiseptic: "Antisseptico. Evita que uma ferida limpa infecte.",
  first_aid_kit: "Kit completo. Trata todas as feridas de uma vez.",
};

export interface CompareRow {
  label: string;
  mine: string; // item selecionado
  worn: string; // item equipado/em uso
  better: "mine" | "worn" | "same";
}

const row = (label: string, mine: number, worn: number, higherBetter: boolean, fmt: (n: number) => string = String): CompareRow => ({
  label,
  mine: fmt(mine),
  worn: fmt(worn),
  better: mine === worn ? "same" : (mine > worn) === higherBetter ? "mine" : "worn",
});

const durOf = (s: ItemStack): number | null => (ITEMS[s.id].durability ? (s.dur ?? ITEMS[s.id].durability!) : null);

// Compara o item selecionado com o equipado. null = nao ha o que comparar (item de outra familia ou o mesmo slot).
// Arma x arma: dano, alcance, recarga (menor e melhor), dano por segundo e durabilidade. Mesmo item: so a durabilidade.
export function compareStacks(mine: ItemStack, worn: ItemStack): CompareRow[] | null {
  const a = ITEMS[mine.id];
  const b = ITEMS[worn.id];
  const rows: CompareRow[] = [];
  if (a.weapon && b.weapon) {
    rows.push(row("Dano", a.weapon.damage, b.weapon.damage, true));
    rows.push(row("Alcance", a.weapon.reach, b.weapon.reach, true));
    rows.push(row("Recarga", a.weapon.cooldownMs, b.weapon.cooldownMs, false, (n) => `${(n / 1000).toFixed(1)}s`));
    rows.push(row("Dano/seg", a.weapon.damage / (a.weapon.cooldownMs / 1000), b.weapon.damage / (b.weapon.cooldownMs / 1000), true, (n) => n.toFixed(1)));
  } else if (mine.id !== worn.id) return null;
  const da = durOf(mine);
  const db = durOf(worn);
  if (da !== null && db !== null) rows.push(row("Durabilidade", da, db, true));
  return rows.length ? rows : null;
}
