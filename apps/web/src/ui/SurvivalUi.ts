import { ITEMS, Inventory, RECIPES, RECIPE_IDS, missingFor, type InventoryUpdateMsg, type PlayerStateMsg, type RecipeId, type Slot } from "@worldzero/shared";

// Etapa 6: barras de vida/fome/sede/energia, inventario e tela de morte (DOM, fora do canvas).
// Esta classe SO MOSTRA o que o servidor mandou e devolve "intencoes" (usar slot, reaparecer).
// Nada aqui calcula vida, fome ou itens.

const BARS: { key: "health" | "hunger" | "thirst" | "energy"; label: string; color: string }[] = [
  { key: "health", label: "Vida", color: "#d64545" },
  { key: "hunger", label: "Fome", color: "#d89a3a" },
  { key: "thirst", label: "Sede", color: "#3a8fd8" },
  { key: "energy", label: "Energia", color: "#d8cf3a" },
];

const ICON: Record<string, string> = { canned_food: "🥫", water_bottle: "💧", bandage: "🩹", energy_bar: "🍫", wood: "🪵", stone: "🪨", scrap: "🔩", raw_meat: "🥩", club: "🏏", workbench: "🛠️", axe: "🪓", pickaxe: "⛏️", spear: "🔱" };

const div = (style: Partial<CSSStyleDeclaration>, parent?: HTMLElement): HTMLDivElement => {
  const el = document.createElement("div");
  Object.assign(el.style, style);
  parent?.appendChild(el);
  return el;
};

export class SurvivalUi {
  onUse: (slot: number) => void = () => {};
  onRespawn: () => void = () => {};
  onCraft: (recipe: RecipeId) => void = () => {}; // Etapa 10: so uma INTENCAO; o servidor confere ingredientes, bancada, espaco e tempo
  private root: HTMLDivElement;
  private fills = new Map<string, HTMLDivElement>();
  private values = new Map<string, HTMLSpanElement>();
  private warn: HTMLDivElement;
  private weaponLine: HTMLDivElement;
  private grid: HTMLDivElement;
  private craftBtn: HTMLButtonElement;
  private craftPanel: HTMLDivElement;
  private craftOpen = false;
  private death: HTMLDivElement;
  private deathInfo: HTMLDivElement;
  private deathBtn: HTMLButtonElement;
  private slots: Slot[] = [];
  private invKey = "";
  private respawnAt = 0; // performance.now() em que o botao libera
  private timer = 0;

  constructor() {
    this.root = div({ position: "fixed", inset: "0", pointerEvents: "none", zIndex: "15", font: "12px monospace", color: "#fff" });
    document.body.appendChild(this.root);

    // barras (abaixo do HUD de depuracao)
    const bars = div({ position: "absolute", top: "40px", left: "8px", width: "150px", display: "flex", flexDirection: "column", gap: "3px" }, this.root);
    for (const b of BARS) {
      const row = div({ position: "relative", height: "14px", background: "rgba(0,0,0,0.55)", borderRadius: "3px", overflow: "hidden" }, bars);
      const fill = div({ position: "absolute", left: "0", top: "0", bottom: "0", width: "100%", background: b.color }, row);
      const text = document.createElement("span");
      Object.assign(text.style, { position: "absolute", left: "4px", top: "0", lineHeight: "14px", fontSize: "11px", textShadow: "0 0 2px #000" });
      row.appendChild(text);
      this.fills.set(b.key, fill);
      this.values.set(b.key, text);
    }
    this.weaponLine = div({ marginTop: "2px", color: "#ffe9a8", textShadow: "0 0 3px #000", fontSize: "11px" }, bars);
    this.warn = div({ marginTop: "2px", color: "#ffb4b4", textShadow: "0 0 3px #000", fontSize: "11px" }, bars);

    // inventario: grade 4x3 no canto inferior direito (joystick fica no esquerdo)
    this.grid = div(
      { position: "absolute", right: "8px", bottom: "8px", display: "grid", gridTemplateColumns: "repeat(4, 46px)", gap: "4px", pointerEvents: "auto", touchAction: "manipulation" },
      this.root,
    );

    this.grid.dataset.ui = "grid";

    // Etapa 10: botao FABRICAR (abaixo das barras, lado esquerdo) e lista de receitas. So mostra; quem fabrica e o servidor.
    this.craftBtn = document.createElement("button");
    this.craftBtn.textContent = "FABRICAR";
    this.craftBtn.dataset.ui = "craftbtn";
    Object.assign(this.craftBtn.style, { position: "absolute", top: "170px", left: "8px", font: "bold 12px monospace", padding: "8px 12px", borderRadius: "6px", border: "2px solid #fff", background: "rgba(60,50,20,0.85)", color: "#fff", pointerEvents: "auto", touchAction: "manipulation" });
    this.craftBtn.onclick = (): void => {
      this.craftOpen = !this.craftOpen;
      this.refreshCraft();
    };
    this.root.appendChild(this.craftBtn);
    this.craftPanel = div(
      { position: "absolute", top: "210px", left: "8px", width: "230px", maxHeight: "calc(100% - 330px)", overflowY: "auto", display: "none", flexDirection: "column", gap: "4px", padding: "6px", background: "rgba(0,0,0,0.75)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: "6px", pointerEvents: "auto", touchAction: "pan-y" },
      this.root,
    );

    this.craftPanel.dataset.ui = "craftpanel";

    // tela de morte
    this.death = div(
      { position: "absolute", inset: "0", display: "none", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", background: "rgba(40,0,0,0.78)", pointerEvents: "auto", textAlign: "center", padding: "16px" },
      this.root,
    );
    div({ fontSize: "32px", fontWeight: "bold", color: "#ff6b6b" }, this.death).textContent = "VOCE MORREU";
    this.deathInfo = div({ fontSize: "14px", maxWidth: "320px" }, this.death);
    this.deathBtn = document.createElement("button");
    Object.assign(this.deathBtn.style, { font: "bold 16px monospace", padding: "12px 24px", borderRadius: "6px", border: "2px solid #ff6b6b", background: "#300", color: "#fff" });
    this.deathBtn.onclick = (): void => this.onRespawn();
    this.death.appendChild(this.deathBtn);

    this.onKey = this.onKey.bind(this);
    window.addEventListener("keydown", this.onKey);
    this.timer = window.setInterval(() => this.refreshDeathButton(), 200);
    this.setInventory({ slots: new Array<Slot>(12).fill(null) });
  }

  private onKey(e: KeyboardEvent): void {
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= this.slots.length && !e.repeat) this.onUse(n - 1);
  }

  setState(s: PlayerStateMsg): void {
    for (const b of BARS) {
      const v = s[b.key];
      this.fills.get(b.key)!.style.width = `${Math.max(0, Math.min(100, v))}%`;
      this.values.get(b.key)!.textContent = `${b.label} ${v}`;
    }
    const msgs: string[] = [];
    if (s.hunger <= 0) msgs.push("Morrendo de fome!");
    else if (s.hunger < 20) msgs.push("Com muita fome");
    if (s.thirst <= 0) msgs.push("Morrendo de sede!");
    else if (s.thirst < 20) msgs.push("Com muita sede");
    if (s.energy < 20) msgs.push("Exausto (mais lento)");
    this.warn.textContent = msgs.join(" | ");
    // Etapa 9: so mostra a arma que o SERVIDOR usa (a de maior dano no inventario); o cliente nao escolhe.
    this.weaponLine.textContent = `Arma: ${s.weapon ? (ITEMS[s.weapon]?.name ?? s.weapon) : "Punho"}`;

    if (s.dead) {
      const lost = s.lost.length ? s.lost.map((l) => `${l.qty}x ${ITEMS[l.id]?.name ?? l.id}`).join(", ") : "nada";
      this.deathInfo.textContent = `Itens perdidos: ${lost}.`;
      this.respawnAt = performance.now() + s.respawnInMs;
      this.death.style.display = "flex";
      this.craftOpen = false;
      this.refreshCraft();
      this.refreshDeathButton();
    } else {
      this.death.style.display = "none";
    }
  }

  setInventory(m: InventoryUpdateMsg): void {
    const key = JSON.stringify(m.slots);
    if (key === this.invKey) return; // o servidor reenvia a cada 2 s: so refaz a grade se mudou
    this.invKey = key;
    this.slots = m.slots;
    this.grid.textContent = "";
    m.slots.forEach((s, i) => {
      const cell = div(
        { position: "relative", width: "46px", height: "46px", background: s ? "rgba(30,40,30,0.85)" : "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.35)", borderRadius: "5px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", userSelect: "none" },
        this.grid,
      );
      const key = div({ position: "absolute", left: "3px", top: "1px", fontSize: "9px", opacity: "0.7" }, cell);
      key.textContent = String(i + 1);
      if (s) {
        cell.appendChild(document.createTextNode(ICON[s.id] ?? "?"));
        const q = div({ position: "absolute", right: "3px", bottom: "1px", fontSize: "11px", fontWeight: "bold" }, cell);
        q.textContent = String(s.qty);
        cell.title = ITEMS[s.id]?.name ?? s.id;
        cell.onclick = (): void => this.onUse(i);
      }
    });
    this.refreshCraft();
  }

  // Lista as receitas. Verde = parece que da (so para ajudar o jogador: o servidor sempre refaz a conta); cinza = falta algo.
  private refreshCraft(): void {
    this.craftPanel.style.display = this.craftOpen ? "flex" : "none";
    if (!this.craftOpen) return;
    const inv = new Inventory();
    this.slots.forEach((s, i) => {
      if (s && i < inv.slots.length) inv.slots[i] = { id: s.id, qty: s.qty };
    });
    this.craftPanel.textContent = "";
    for (const id of RECIPE_IDS) {
      const r = RECIPES[id];
      const miss = missingFor(inv, id);
      const row = div(
        { padding: "6px", borderRadius: "5px", border: "1px solid rgba(255,255,255,0.3)", background: miss ? "rgba(40,40,40,0.8)" : "rgba(40,100,50,0.85)", opacity: miss ? "0.7" : "1", userSelect: "none" },
        this.craftPanel,
      );
      const title = div({ fontWeight: "bold", fontSize: "12px" }, row);
      title.textContent = `${ICON[r.output.id] ?? "?"} ${ITEMS[r.output.id].name}${r.output.qty > 1 ? ` x${r.output.qty}` : ""}`;
      const need = div({ fontSize: "10px", marginTop: "2px" }, row);
      need.textContent = r.inputs.map((i) => `${i.qty}x ${ITEMS[i.id].name} (${inv.count(i.id)})`).join(" + ") + (r.station ? ` | precisa de ${ITEMS[r.station].name}` : "");
      row.onclick = (): void => this.onCraft(id); // sempre manda: o servidor responde se vale
    }
  }

  private refreshDeathButton(): void {
    const left = Math.ceil((this.respawnAt - performance.now()) / 1000);
    this.deathBtn.disabled = left > 0;
    this.deathBtn.style.opacity = left > 0 ? "0.5" : "1";
    this.deathBtn.textContent = left > 0 ? `REAPARECER em ${left}s` : "REAPARECER";
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onKey);
    window.clearInterval(this.timer);
    this.root.remove();
  }
}
