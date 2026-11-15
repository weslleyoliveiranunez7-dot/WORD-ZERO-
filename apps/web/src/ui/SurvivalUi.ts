import { ITEMS, type InventoryUpdateMsg, type PlayerStateMsg, type Slot } from "@worldzero/shared";

// Etapa 6: barras de vida/fome/sede/energia, inventario e tela de morte (DOM, fora do canvas).
// Esta classe SO MOSTRA o que o servidor mandou e devolve "intencoes" (usar slot, reaparecer).
// Nada aqui calcula vida, fome ou itens.

const BARS: { key: "health" | "hunger" | "thirst" | "energy"; label: string; color: string }[] = [
  { key: "health", label: "Vida", color: "#d64545" },
  { key: "hunger", label: "Fome", color: "#d89a3a" },
  { key: "thirst", label: "Sede", color: "#3a8fd8" },
  { key: "energy", label: "Energia", color: "#d8cf3a" },
];

const ICON: Record<string, string> = { canned_food: "🥫", water_bottle: "💧", bandage: "🩹", energy_bar: "🍫", wood: "🪵", stone: "🪨", scrap: "🔩" };

const div = (style: Partial<CSSStyleDeclaration>, parent?: HTMLElement): HTMLDivElement => {
  const el = document.createElement("div");
  Object.assign(el.style, style);
  parent?.appendChild(el);
  return el;
};

export class SurvivalUi {
  onUse: (slot: number) => void = () => {};
  onRespawn: () => void = () => {};
  private root: HTMLDivElement;
  private fills = new Map<string, HTMLDivElement>();
  private values = new Map<string, HTMLSpanElement>();
  private warn: HTMLDivElement;
  private grid: HTMLDivElement;
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
    this.warn = div({ marginTop: "2px", color: "#ffb4b4", textShadow: "0 0 3px #000", fontSize: "11px" }, bars);

    // inventario: grade 4x3 no canto inferior direito (joystick fica no esquerdo)
    this.grid = div(
      { position: "absolute", right: "8px", bottom: "8px", display: "grid", gridTemplateColumns: "repeat(4, 46px)", gap: "4px", pointerEvents: "auto", touchAction: "manipulation" },
      this.root,
    );

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

    if (s.dead) {
      const lost = s.lost.length ? s.lost.map((l) => `${l.qty}x ${ITEMS[l.id]?.name ?? l.id}`).join(", ") : "nada";
      this.deathInfo.textContent = `Itens perdidos: ${lost}.`;
      this.respawnAt = performance.now() + s.respawnInMs;
      this.death.style.display = "flex";
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
