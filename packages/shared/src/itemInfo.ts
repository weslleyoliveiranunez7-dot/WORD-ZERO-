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
  knife: "Faca afiada. Necessaria para esfolar e cortar. Gasta um pouco a cada uso.",
  butcher_table: "Bancada de acougue. Precisa estar na mochila para processar carcacas e cortar carne com higiene.",
  clean_rag: "Pano limpo para higienizar a faca e a bancada. Gasto a cada processamento na bancada.",
  deer_carcass: "Cervo abatido, pesado. Apodrece com o tempo: processe logo (faca + bancada).",
  hide: "Pele crua. Precisa ser curtida com gordura na bancada para virar couro.",
  leather: "Couro curtido. Resistente, serve de empunhadura e reforco.",
  fat: "Gordura animal. Curte couro e conserva carne.",
  bone: "Osso limpo. Usado em armas.",
  sinew: "Tendao seco. Serve de amarra para armas.",
  steak: "Corte nobre. Alimenta mais que carne crua, mas ainda apodrece.",
  tainted_meat: "Carne estragada ou mal processada. Mata a fome pouco e machuca. Evite.",
  preserved_meat: "Carne conservada na gordura. Alimenta bem, e leve e nao apodrece.",
  bone_spear: "Lanca reforcada com osso, tendao e couro. Mais dano que a lanca comum.",
  clay: "Argila umida da margem dos lagos. Base de toda ceramica.",
  raw_pot: "Pote moldado e ainda mole. Precisa secar antes de ir ao forno.",
  raw_brick: "Tijolo moldado e mole. Precisa secar.",
  dry_pot: "Pote seco, pronto para queimar no forno.",
  dry_brick: "Tijolo seco, pronto para queimar.",
  brick: "Tijolo queimado. Duro e resistente: serve para o forno de tijolos.",
  clay_jar: "Jarro de barro queimado. Recipiente reutilizavel: gasta um pouco a cada uso.",
  fine_jar: "Jarro bem queimado no forno de tijolos. Muito mais resistente e rende mais.",
  shards: "Pedacos de ceramica rachada. Misturados a argila, economizam material nos tijolos.",
  kiln: "Forno de barro. Precisa estar na mochila para queimar. Uma peca em cada cinco racha.",
  fiber: "Fibra vegetal. Serve de amarra e de curativo improvisado.",
  plant: "Planta comestivel. Mata a fome um pouco.",
  fruit: "Fruta do mato. Mata um pouco a fome e a sede.",
  mushroom: "Cogumelo do bosque. Mata um pouco a fome.",
  herb: "Erva medicinal. Cura um pouco e, com gordura, vira antisseptico.",
  components: "Pecas de aparelhos das ruinas. Precisa de picareta para soltar. Usadas em ferramentas.",
  sickle: "Foice improvisada. Com ela fibra, plantas e ervas rendem o dobro.",
  brick_kiln: "Forno de tijolos. Queima melhor: so uma peca em vinte racha, e faz jarro refinado.",
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
