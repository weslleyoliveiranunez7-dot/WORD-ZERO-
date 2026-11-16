import { BUILD_REACH, CHEST_SLOTS, PIECES, PIECE_KINDS, type ChestUpdateMsg, type PieceKind, type Slot } from "@worldzero/shared";
import { uiRoot } from "./landscape";
import type { Services } from "./Services";
import { C, actionButton, chip, el, icon, itemName, setEnabled } from "./theme";

// Painel de CONSTRUCAO (dentro da Central de Servicos), aviso curto, botao PORTA/BAU e janela do bau (DOM).
// So MOSTRA o que o servidor mandou e devolve INTENCOES (qual peca, abrir/fechar, mover uma pilha).
// Nada aqui decide custo, dono, alcance ou conteudo de bau.

const NAME: Record<PieceKind, string> = { foundation: "Fundacao", wall: "Parede", door: "Porta", window: "Janela", chest: "Bau", roof: "Telhado" };
const ICON: Record<PieceKind, string> = { foundation: "⬛", wall: "🧱", door: "🚪", window: "🪟", chest: "📦", roof: "🏠" };
const CATS: { id: string; label: string; kinds: PieceKind[] }[] = [
  { id: "base", label: "Base", kinds: ["foundation", "roof"] },
  { id: "walls", label: "Paredes", kinds: ["wall", "door", "window"] },
  { id: "store", label: "Armazenar", kinds: ["chest"] },
];
// Texto de ajuda: so regras que ja existem no servidor (ver building.ts).
const DESC: Record<PieceKind, string> = {
  foundation: "Base da construcao. Parede, porta, janela e bau so podem ser colocados sobre uma fundacao sua.",
  wall: "Bloqueia a passagem. Precisa de fundacao sua.",
  door: "Voce e quem tem acesso pode abrir e fechar. Precisa de fundacao sua.",
  window: "Bloqueia a passagem, mas nao a visao. Precisa de fundacao sua.",
  chest: `Guarda itens (${CHEST_SLOTS} espacos). Precisa de fundacao sua.`,
  roof: "Cobre a construcao. Precisa de apoio: parede, porta, janela ou outro telhado seu por perto.",
};

export class BuildUi {
  onPlace: (piece: PieceKind) => void = () => {};
  onToggle: () => void = () => {};
  onRepair: () => void = () => {};
  onTrust: () => void = () => {};
  onMove: (op: "deposit" | "withdraw", slot: number) => void = () => {};
  private root = el("div", { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "16", font: "12px monospace", color: C.text });
  private body: HTMLElement;
  private catRow!: HTMLDivElement;
  private list!: HTMLDivElement;
  private detail!: HTMLDivElement;
  private useBtn: HTMLButtonElement;
  private chestBox: HTMLDivElement;
  private toast: HTMLDivElement;
  private toastTimer = 0;
  private inv: Slot[] = [];
  private chest: ChestUpdateMsg | null = null;
  private cat = "base";
  private sel: PieceKind = "foundation";
  private dirty = true;

  constructor(private sv: Services) {
    uiRoot().appendChild(this.root);
    this.body = sv.body("build");
    this.buildPanel();
    sv.onOpen((id) => {
      if (id === "build" && this.dirty) this.renderPanel();
    });

    this.useBtn = el("button", { position: "fixed", right: "16px", bottom: "212px", width: "84px", height: "56px", borderRadius: "10px", border: `2px solid ${C.lineHi}`, background: "#2d4a2a", color: "#fff", font: "bold 12px monospace", display: "none", pointerEvents: "auto", touchAction: "manipulation" }, this.root, "PORTA / BAU");
    this.useBtn.onclick = (): void => this.onToggle();
    this.chestBox = el("div", { position: "absolute", inset: "60px 12px auto 12px", maxWidth: "340px", margin: "0 auto", display: "none", padding: "8px", background: C.bg, border: `1px solid ${C.lineHi}`, borderRadius: "4px", pointerEvents: "auto", maxHeight: "70%", overflowY: "auto" }, this.root);
    this.toast = el("div", { position: "absolute", top: "8px", left: "50%", transform: "translateX(-50%)", maxWidth: "60%", padding: "6px 10px", background: "rgba(10,12,10,0.9)", border: `1px solid ${C.warn}`, borderRadius: "4px", display: "none", textAlign: "center" }, this.root);
    this.useBtn.dataset.ui = "usebtn";
    this.chestBox.dataset.ui = "chest";
    this.toast.dataset.ui = "toast";
    this.renderChest();
  }

  // A grade fantasma (tile a frente) so aparece com o painel de construcao aberto.
  get panelOpen(): boolean {
    return this.sv.isOpen("build");
  }

  setInventory(slots: Slot[]): void {
    this.inv = slots;
    this.dirty = true;
    if (this.sv.isOpen("build")) this.renderPanel();
    this.renderChest();
  }

  // Perto de uma porta/bau MEU (o servidor ainda confere tudo).
  setNear(kind: "door" | "chest" | null): void {
    this.useBtn.style.display = kind ? "block" : "none";
    this.useBtn.textContent = kind === "door" ? "PORTA" : "BAU";
  }

  setChest(m: ChestUpdateMsg | null): void {
    this.chest = m;
    this.renderChest();
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

  private buildPanel(): void {
    el("div", { fontWeight: "bold", marginBottom: "4px" }, this.body, "CATEGORIAS");
    this.catRow = el("div", { display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "8px" }, this.body);
    const cols = el("div", { display: "flex", flexWrap: "wrap", gap: "10px" }, this.body);
    this.list = el("div", { flex: "1 1 130px", display: "flex", flexDirection: "column", gap: "3px", alignSelf: "flex-start" }, cols);
    this.detail = el("div", { flex: "1.6 1 210px", minWidth: "0" }, cols);
  }

  private renderPanel(): void {
    this.dirty = false;
    this.catRow.textContent = "";
    for (const c of CATS) chip(c.label, this.cat === c.id, () => this.pickCat(c.id), this.catRow);
    this.list.textContent = "";
    const kinds = CATS.find((c) => c.id === this.cat)!.kinds;
    if (!kinds.includes(this.sel)) this.sel = kinds[0];
    for (const k of kinds) {
      const ok = PIECES[k].cost.every((c) => this.count(c.id) >= c.qty);
      const row = el("div", { display: "flex", alignItems: "center", gap: "6px", padding: "6px", borderRadius: "3px", border: `1px solid ${k === this.sel ? C.lineHi : C.line}`, background: k === this.sel ? C.bg3 : C.bg2, userSelect: "none" }, this.list);
      el("span", { fontSize: "16px" }, row, ICON[k]);
      el("span", { flex: "1", fontSize: "11px" }, row, NAME[k]);
      el("span", { color: ok ? C.ok : C.dim, fontSize: "10px" }, row, ok ? "pronta" : "falta");
      row.onclick = (): void => {
        this.sel = k;
        this.renderPanel();
      };
    }

    const def = PIECES[this.sel];
    const d = this.detail;
    d.textContent = "";
    el("div", { fontWeight: "bold", fontSize: "13px" }, d, `${ICON[this.sel]} ${NAME[this.sel]}`);
    el("div", { fontSize: "11px", margin: "3px 0 8px" }, d, DESC[this.sel]);
    el("div", { fontWeight: "bold", marginBottom: "4px" }, d, "MATERIAIS NECESSARIOS");
    const mats = el("div", { display: "flex", flexDirection: "column", gap: "3px", marginBottom: "8px" }, d);
    const lacks: string[] = [];
    for (const c of def.cost) {
      const have = this.count(c.id);
      const ok = have >= c.qty;
      if (!ok) lacks.push(`${c.qty - have}x ${itemName(c.id)}`);
      const row = el("div", { display: "flex", gap: "6px", padding: "5px 6px", borderRadius: "3px", background: ok ? C.okBg : "rgba(150,60,50,0.25)", border: `1px solid ${ok ? "#3d6a39" : "#7a3b34"}` }, mats);
      el("span", { color: ok ? C.ok : C.bad, fontWeight: "bold" }, row, ok ? "✔" : "✘");
      el("span", { flex: "1", fontSize: "11px" }, row, `${icon(c.id)} ${itemName(c.id)}`);
      el("span", { color: ok ? C.ok : C.bad, fontSize: "11px" }, row, `${have}/${c.qty}`);
    }
    el("div", { fontWeight: "bold", marginBottom: "4px" }, d, "RESULTADO ESPERADO");
    el("div", { fontSize: "11px", marginBottom: "8px", color: C.dim }, d, `${NAME[this.sel]} no tile a frente do personagem (ultima direcao em que voce andou). Resistencia: ${def.hp}.`);
    const b = actionButton("CONSTRUIR", () => this.onPlace(this.sel), d);
    setEnabled(b, lacks.length === 0);
    el("div", { fontSize: "10px", marginTop: "4px", color: lacks.length ? C.bad : C.dim }, d, lacks.length ? `Nao da para construir. Falta: ${lacks.join(", ")}.` : "Um quadrado branco no chao mostra onde vai ficar.");

    el("div", { fontWeight: "bold", margin: "12px 0 4px", borderTop: `1px solid ${C.line}`, paddingTop: "8px" }, d, "GERENCIAR BASE");
    const tool = (label: string, desc: string, fn: () => void): void => {
      const bb = actionButton(label, fn, d);
      Object.assign(bb.style, { background: C.bg3, borderColor: C.line, marginTop: "4px" });
      el("div", { fontSize: "10px", color: C.dim, marginTop: "2px" }, d, desc);
    };
    tool("REPARAR", "Conserta a estrutura no tile a frente. Gasta madeira.", this.onRepair);
    tool("DAR / TIRAR ACESSO", "Libera (ou bloqueia) suas portas e baus para o jogador mais proximo.", this.onTrust);
  }

  private pickCat(id: string): void {
    this.cat = id;
    this.renderPanel();
  }

  private renderChest(): void {
    this.chestBox.style.display = this.chest ? "block" : "none";
    this.chestBox.textContent = "";
    if (!this.chest) return;
    const section = (title: string, slots: Slot[], op: "deposit" | "withdraw"): void => {
      el("div", { fontWeight: "bold", margin: "6px 0 3px" }, this.chestBox, title);
      const grid = el("div", { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "4px" }, this.chestBox);
      slots.forEach((s, i) => {
        const cell = el("button", { padding: "6px 2px", font: "10px monospace", borderRadius: "3px", border: `1px solid ${C.line}`, background: s ? C.bg3 : C.bg2, color: C.text, touchAction: "manipulation" }, grid, s ? `${icon(s.id)} ${itemName(s.id).slice(0, 7)} x${s.qty}` : "-");
        cell.onclick = (): void => this.onMove(op, i);
      });
    };
    const close = el("button", { float: "right", padding: "4px 8px", font: "bold 11px monospace", border: `1px solid ${C.line}`, borderRadius: "3px", background: C.bg3, color: C.text }, this.chestBox, "FECHAR");
    close.onclick = (): void => this.setChest(null);
    section("BAU (toque para retirar)", this.chest.slots, "withdraw");
    section("MOCHILA (toque para guardar)", this.inv, "deposit");
    void BUILD_REACH;
  }

  destroy(): void {
    this.root.remove();
  }
}
