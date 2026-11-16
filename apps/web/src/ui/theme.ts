import { ITEMS, type ItemCategory, type ItemDef, type ItemId } from "@worldzero/shared";

// Visual unico da interface (estilo sobrevivencia: fundo escuro, cinza/preto, verde discreto, bordas finas).
// So cores e atalhos de DOM: nada aqui decide regra de jogo.

export const C = {
  bg: "rgba(14,17,14,0.94)",
  bg2: "#171c17",
  bg3: "#212821",
  line: "#3a463a",
  lineHi: "#6f9a64",
  text: "#d6dccf",
  dim: "#8d988a",
  ok: "#6fbf68",
  okBg: "rgba(60,110,55,0.35)",
  bad: "#d0645a",
  warn: "#d1a24a",
};

export const FONT = "12px monospace";

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, style: Partial<CSSStyleDeclaration> = {}, parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e.style, style);
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

// Botao pequeno e legivel. `enabled=false` deixa cinza (quem chama mostra o MOTIVO ao lado).
export function setEnabled(b: HTMLButtonElement, enabled: boolean): void {
  b.disabled = !enabled;
  Object.assign(b.style, { opacity: enabled ? "1" : "0.45", borderColor: enabled ? C.lineHi : C.line, background: enabled ? "#2d4a2a" : C.bg3 });
}

export function actionButton(label: string, onClick: () => void, parent?: HTMLElement): HTMLButtonElement {
  const b = el("button", { font: "bold 12px monospace", padding: "9px 12px", borderRadius: "4px", border: `1px solid ${C.lineHi}`, background: "#2d4a2a", color: C.text, touchAction: "manipulation", width: "100%" }, parent, label);
  b.onclick = onClick;
  return b;
}

// Pequena etiqueta de selecao (categorias).
export function chip(label: string, active: boolean, onClick: () => void, parent: HTMLElement): HTMLButtonElement {
  const b = el("button", { font: "11px monospace", padding: "4px 7px", borderRadius: "3px", border: `1px solid ${active ? C.lineHi : C.line}`, background: active ? "#2d4a2a" : C.bg2, color: active ? C.text : C.dim, touchAction: "manipulation" }, parent, label);
  b.onclick = onClick;
  return b;
}

// Campo de busca. Para o teclado nao "vazar": WASD/T/numeros do jogo nao podem disparar enquanto se digita.
export function searchBox(onInput: (q: string) => void, parent: HTMLElement): HTMLInputElement {
  const i = el("input", { font: FONT, padding: "6px 8px", border: `1px solid ${C.line}`, borderRadius: "4px", background: C.bg2, color: C.text, outline: "none", width: "100%", boxSizing: "border-box" }, parent);
  i.type = "search";
  i.placeholder = "Pesquisar...";
  i.setAttribute("aria-label", "Pesquisar");
  i.addEventListener("input", () => onInput(i.value));
  for (const ev of ["keydown", "keyup"]) i.addEventListener(ev, (e) => e.stopPropagation());
  return i;
}

// Compara texto sem acento e sem maiuscula (pesquisa).
export const norm = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const ITEM_ICON: Record<string, string> = { canned_food: "🥫", water_bottle: "💧", bandage: "🩹", energy_bar: "🍫", wood: "🪵", stone: "🪨", scrap: "🔩", raw_meat: "🥩", club: "🏏", workbench: "🛠️", axe: "🪓", pickaxe: "⛏️", spear: "🔱", torch: "🔥" };
export const icon = (id: string): string => ITEM_ICON[id] ?? "?";
export const itemName = (id: string): string => ITEMS[id as ItemId]?.name ?? id;

export const CATEGORY_LABEL: Record<ItemCategory, string> = { food: "Comida", drink: "Bebida", medical: "Medicina", resource: "Recurso", weapon: "Arma", tool: "Ferramenta" };

const EFFECT_LABEL: Record<string, string> = { health: "vida", hunger: "fome", thirst: "sede", energy: "energia" };

// Descricao curta montada SO com os dados reais do item.
export function describeItem(def: ItemDef): string {
  const parts = Object.entries(def.effects).map(([k, v]) => `${(v as number) >= 0 ? "+" : ""}${v} ${EFFECT_LABEL[k] ?? k}`);
  const m = def.medical;
  if (m) {
    const t: string[] = [];
    if (m.bleed === "all") t.push("estanca qualquer sangramento");
    if (m.bleed === "light") t.push("estanca corte leve e reduz sangramentos maiores");
    if (m.dress) t.push("cobre a ferida (menos infeccao, cura mais rapida)");
    if (m.splint) t.push("imobiliza fratura");
    if (m.painkillerSec) t.push(`reduz a dor por ${Math.round(m.painkillerSec / 60)} min`);
    if (m.antibiotic) t.push("cura infeccoes");
    if (m.disinfect) t.push("evita infeccao em ferida limpa");
    return `${parts.length ? `Ao consumir 1: ${parts.join(", ")}. ` : ""}Trata: ${t.join("; ")}.${m.all ? " Age em TODAS as feridas." : " Age em UMA ferida (a mais urgente ou a parte escolhida)."}`;
  }
  if (parts.length) return `Ao consumir 1: ${parts.join(", ")}.`;
  if (def.weapon) return `Arma: dano ${def.weapon.damage}, alcance ${def.weapon.reach}, recarga ${(def.weapon.cooldownMs / 1000).toFixed(1)}s. Usada sozinha ao atacar (vale a de maior dano na mochila).`;
  if (def.category === "resource") return "Material. Serve para fabricar e construir.";
  return "Ferramenta. Basta ter na mochila para funcionar.";
}
