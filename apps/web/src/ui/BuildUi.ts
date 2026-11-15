import { BUILD_REACH, ITEMS, PIECES, PIECE_KINDS, type ChestUpdateMsg, type PieceKind, type Slot } from "@worldzero/shared";

// Etapa 11: botoes e paineis de construcao (DOM). So MOSTRA o que o servidor mandou e devolve INTENCOES
// (qual peca, abrir/fechar, mover uma pilha). Nada aqui decide custo, dono, alcance ou conteudo de bau.

const NAME: Record<PieceKind, string> = { foundation: "Fundacao", wall: "Parede", door: "Porta", window: "Janela", chest: "Bau", roof: "Telhado" };
const css = (el: HTMLElement, s: Partial<CSSStyleDeclaration>): void => void Object.assign(el.style, s);

export class BuildUi {
  onPlace: (piece: PieceKind) => void = () => {};
  onToggle: () => void = () => {};
  onRepair: () => void = () => {};
  onTrust: () => void = () => {};
  onMove: (op: "deposit" | "withdraw", slot: number) => void = () => {};
  private root = document.createElement("div");
  private btn = document.createElement("button");
  private panel = document.createElement("div");
  private useBtn = document.createElement("button");
  private chestBox = document.createElement("div");
  private inv: Slot[] = [];
  private chest: ChestUpdateMsg | null = null;
  private open = false;
  private toast = document.createElement("div");
  private toastTimer = 0;

  constructor() {
    css(this.root, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "16", font: "12px monospace", color: "#fff" });
    document.body.appendChild(this.root);
    this.btn.textContent = "CONSTRUIR";
    css(this.btn, { position: "absolute", top: "170px", left: "108px", font: "bold 12px monospace", padding: "8px 12px", borderRadius: "6px", border: "1px solid #fff", background: "rgba(80,60,20,0.85)", color: "#fff", pointerEvents: "auto", touchAction: "manipulation" });
    this.btn.onclick = (): void => {
      this.open = !this.open;
      this.refresh();
    };
    css(this.panel, { position: "absolute", top: "210px", left: "108px", width: "190px", display: "none", flexDirection: "column", gap: "4px", padding: "6px", background: "rgba(0,0,0,0.7)", borderRadius: "6px", pointerEvents: "auto" });
    this.useBtn.textContent = "PORTA / BAU";
    css(this.useBtn, { position: "fixed", right: "16px", bottom: "212px", width: "84px", height: "56px", borderRadius: "10px", border: "2px solid #fff", background: "#7a5a2a", color: "#fff", font: "bold 12px monospace", display: "none", pointerEvents: "auto", touchAction: "manipulation" });
    this.useBtn.onclick = (): void => this.onToggle();
    css(this.chestBox, { position: "absolute", inset: "60px 12px auto 12px", maxWidth: "340px", margin: "0 auto", display: "none", padding: "8px", background: "rgba(20,15,5,0.92)", border: "2px solid #c9a227", borderRadius: "8px", pointerEvents: "auto", maxHeight: "70%", overflowY: "auto" });
    css(this.toast, { position: "absolute", top: "130px", left: "50%", transform: "translateX(-50%)", maxWidth: "80%", padding: "6px 10px", background: "rgba(0,0,0,0.8)", border: "1px solid #c9a227", borderRadius: "6px", display: "none", textAlign: "center" });
    this.root.append(this.btn, this.panel, this.useBtn, this.chestBox, this.toast);
    this.refresh();
  }

  get panelOpen(): boolean {
    return this.open;
  }

  setInventory(slots: Slot[]): void {
    this.inv = slots;
    this.refresh();
  }

  // Perto de uma porta/bau MEU (o servidor ainda confere tudo).
  setNear(kind: "door" | "chest" | null): void {
    this.useBtn.style.display = kind ? "block" : "none";
    this.useBtn.textContent = kind === "door" ? "PORTA" : "BAU";
  }

  setChest(m: ChestUpdateMsg | null): void {
    this.chest = m;
    this.refresh();
  }

  // Aviso curto do servidor (so texto).
  showNotice(text: string): void {
    this.toast.textContent = text;
    this.toast.style.display = "block";
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toast.style.display = "none"), 3500);
  }

  private count(id: string): number {
    return this.inv.reduce((n, s) => n + (s && s.id === id ? s.qty : 0), 0);
  }

  private refresh(): void {
    this.panel.style.display = this.open ? "flex" : "none";
    this.panel.textContent = "";
    if (this.open) {
      for (const k of PIECE_KINDS) {
        const def = PIECES[k];
        const ok = def.cost.every((c) => this.count(c.id) >= c.qty);
        const row = document.createElement("div");
        css(row, { padding: "6px", borderRadius: "5px", border: "1px solid rgba(255,255,255,0.3)", background: ok ? "rgba(40,100,50,0.85)" : "rgba(40,40,40,0.8)", opacity: ok ? "1" : "0.7", userSelect: "none" });
        row.innerHTML = "";
        const t = document.createElement("div");
        t.textContent = NAME[k];
        css(t, { fontWeight: "bold" });
        const c = document.createElement("div");
        c.textContent = def.cost.map((x) => `${x.qty}x ${ITEMS[x.id].name} (${this.count(x.id)})`).join(" + ");
        css(c, { fontSize: "10px", marginTop: "2px" });
        row.append(t, c);
        row.onclick = (): void => this.onPlace(k); // sempre manda: o servidor responde se vale
        this.panel.appendChild(row);
      }
      for (const [label, fn] of [["REPARAR (tile a frente, usa madeira)", this.onRepair], ["DAR/TIRAR ACESSO (jogador mais proximo)", this.onTrust]] as const) {
        const b = document.createElement("div");
        b.textContent = label;
        css(b, { padding: "6px", borderRadius: "5px", border: "1px solid rgba(255,255,255,0.3)", background: "rgba(60,60,110,0.85)", userSelect: "none", fontSize: "11px" });
        b.onclick = (): void => fn();
        this.panel.appendChild(b);
      }
      const hint = document.createElement("div");
      hint.textContent = "Constroi no tile a frente (ultima direcao). Parede, porta, janela e bau precisam de fundacao sua; telhado precisa de apoio.";
      css(hint, { fontSize: "10px", opacity: "0.8" });
      this.panel.appendChild(hint);
    }
    this.chestBox.style.display = this.chest ? "block" : "none";
    this.chestBox.textContent = "";
    if (!this.chest) return;
    const section = (title: string, slots: Slot[], op: "deposit" | "withdraw"): void => {
      const h = document.createElement("div");
      h.textContent = title;
      css(h, { fontWeight: "bold", margin: "6px 0 3px" });
      const grid = document.createElement("div");
      css(grid, { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "4px" });
      slots.forEach((s, i) => {
        const cell = document.createElement("button");
        cell.textContent = s ? `${ITEMS[s.id].name.slice(0, 7)} x${s.qty}` : "-";
        css(cell, { padding: "8px 2px", font: "10px monospace", borderRadius: "4px", border: "1px solid #888", background: s ? "#4a3a1a" : "#222", color: "#fff", touchAction: "manipulation" });
        cell.onclick = (): void => this.onMove(op, i);
        grid.appendChild(cell);
      });
      this.chestBox.append(h, grid);
    };
    const close = document.createElement("button");
    close.textContent = "FECHAR";
    css(close, { float: "right", padding: "4px 8px", font: "bold 11px monospace" });
    close.onclick = (): void => this.setChest(null);
    this.chestBox.appendChild(close);
    section("BAU (toque para retirar)", this.chest.slots, "withdraw");
    section("MOCHILA (toque para guardar)", this.inv, "deposit");
    void BUILD_REACH;
  }

  destroy(): void {
    this.root.remove();
  }
}
