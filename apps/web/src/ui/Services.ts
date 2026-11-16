import { uiRoot } from "./landscape";
import { C, el } from "./theme";

// CENTRAL DE SERVICOS: barra vertical de icones na lateral esquerda + UM painel que mostra o servico escolhido.
// So organiza a tela. Cada servico (SurvivalUi, BuildUi, CollectUi) desenha dentro do corpo que recebe daqui.

export type ServiceId = "character" | "inventory" | "craft" | "build" | "collect";

interface ServiceDef {
  id: ServiceId;
  label: string;
  icon: string;
  key: string; // atalho de teclado
  desc: string; // aparece no balao (passar o mouse / manter pressionado no celular)
}

export const SERVICES: ServiceDef[] = [
  { id: "character", label: "Personagem", icon: "🧍", key: "P", desc: "Vida, fome, sede e energia do seu personagem." },
  { id: "inventory", label: "Inventario", icon: "🎒", key: "I", desc: "Itens que voce carrega. Selecione um item para ver detalhes e usar." },
  { id: "craft", label: "Fabricacao", icon: "🔨", key: "C", desc: "Fabrique itens a partir de materiais." },
  { id: "build", label: "Construcao", icon: "🧱", key: "B", desc: "Construa fundacao, paredes, portas, bau e telhado." },
  { id: "collect", label: "Coleta", icon: "🪓", key: "G", desc: "Recursos por perto e como coletar." },
];

const LONG_PRESS_MS = 350;

export class Services {
  private listeners: ((id: ServiceId | null) => void)[] = [];
  private root = el("div", { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "17", font: "12px monospace", color: C.text });
  private bodies = new Map<ServiceId, HTMLDivElement>();
  private btns = new Map<ServiceId, HTMLButtonElement>();
  private current: ServiceId | null = null;
  private locked = false;
  private panel: HTMLDivElement;
  private title: HTMLDivElement;
  private sub: HTMLDivElement;

  constructor() {
    uiRoot().appendChild(this.root);

    const bar = el("div", { position: "absolute", left: "8px", top: "34px", display: "flex", flexDirection: "column", gap: "4px", pointerEvents: "auto" }, this.root);
    bar.dataset.ui = "svcbar";
    for (const s of SERVICES) this.addButton(s, bar);

    this.panel = el("div", { position: "absolute", left: "52px", top: "34px", width: "min(410px, calc(100% - 64px))", maxHeight: "calc(100% - 100px)", display: "none", flexDirection: "column", background: C.bg, border: `1px solid ${C.line}`, borderRadius: "4px", pointerEvents: "auto", boxSizing: "border-box" }, this.root);
    this.panel.dataset.ui = "panel";
    const head = el("div", { display: "flex", alignItems: "center", gap: "8px", padding: "7px 8px", borderBottom: `1px solid ${C.line}`, background: C.bg2 }, this.panel);
    const titles = el("div", { flex: "1", minWidth: "0" }, head);
    this.title = el("div", { fontWeight: "bold", fontSize: "13px" }, titles);
    this.sub = el("div", { color: C.dim, fontSize: "10px", marginTop: "1px" }, titles);
    const close = el("button", { font: "bold 11px monospace", padding: "5px 8px", border: `1px solid ${C.line}`, borderRadius: "3px", background: C.bg3, color: C.text, touchAction: "manipulation" }, head, "FECHAR");
    close.title = "Fechar este painel (tecla Esc)";
    close.onclick = (): void => this.open(null);
    const content = el("div", { overflowY: "auto", padding: "8px", touchAction: "pan-y" }, this.panel);
    for (const s of SERVICES) {
      const b = el("div", { display: "none" }, content);
      this.bodies.set(s.id, b);
    }

    this.onKey = this.onKey.bind(this);
    window.addEventListener("keydown", this.onKey);
  }

  private addButton(s: ServiceDef, bar: HTMLElement): void {
    const wrap = el("div", { position: "relative" }, bar);
    const b = el("button", { width: "34px", height: "34px", fontSize: "17px", lineHeight: "1", border: `1px solid ${C.line}`, borderRadius: "4px", background: C.bg, color: C.text, touchAction: "manipulation", padding: "0", position: "relative" }, wrap, s.icon);
    b.setAttribute("aria-label", s.label);
    el("span", { position: "absolute", right: "2px", bottom: "0", fontSize: "8px", color: C.dim }, b, s.key);
    // balao com nome + explicacao
    const tip = el("div", { position: "absolute", left: "40px", top: "0", width: "max-content", maxWidth: "190px", padding: "5px 7px", background: "#0b0e0b", border: `1px solid ${C.lineHi}`, borderRadius: "3px", display: "none", zIndex: "5", pointerEvents: "none", fontSize: "11px" }, wrap);
    el("div", { fontWeight: "bold" }, tip, `${s.label} [${s.key}]`);
    el("div", { color: C.dim, marginTop: "2px" }, tip, s.desc);
    let timer = 0;
    let long = false;
    b.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "mouse") tip.style.display = "block";
    });
    b.addEventListener("pointerleave", () => (tip.style.display = "none"));
    b.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      long = false;
      timer = window.setTimeout(() => {
        long = true; // manter pressionado no celular: mostra o nome em vez de abrir
        tip.style.display = "block";
        window.setTimeout(() => (tip.style.display = "none"), 2200);
      }, LONG_PRESS_MS);
    });
    const cancel = (): void => window.clearTimeout(timer);
    b.addEventListener("pointerup", cancel);
    b.addEventListener("pointercancel", cancel);
    b.addEventListener("click", () => {
      if (long) {
        long = false;
        return;
      }
      this.toggle(s.id);
    });
    this.btns.set(s.id, b);
  }

  private onKey(e: KeyboardEvent): void {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if (e.key === "Escape") return this.open(null);
    const k = e.key.toUpperCase();
    const s = SERVICES.find((x) => x.key === k);
    if (s) this.toggle(s.id);
  }

  // Cada servico avisa aqui para redesenhar so quando o painel dele abre.
  onOpen(fn: (id: ServiceId | null) => void): void {
    this.listeners.push(fn);
  }

  body(id: ServiceId): HTMLDivElement {
    return this.bodies.get(id)!;
  }

  isOpen(id: ServiceId): boolean {
    return this.current === id;
  }

  toggle(id: ServiceId): void {
    this.open(this.current === id ? null : id);
  }

  // Travada (ex.: tela de morte): fecha tudo e esconde a barra.
  lock(v: boolean): void {
    this.locked = v;
    this.root.style.display = v ? "none" : "block";
    if (v) this.open(null);
  }

  open(id: ServiceId | null): void {
    if (id === this.current || (this.locked && id)) return;
    this.current = id;
    for (const s of SERVICES) {
      this.bodies.get(s.id)!.style.display = s.id === id ? "block" : "none";
      const b = this.btns.get(s.id)!;
      b.style.borderColor = s.id === id ? C.lineHi : C.line;
      b.style.background = s.id === id ? "#2d4a2a" : C.bg;
    }
    const def = SERVICES.find((s) => s.id === id);
    this.panel.style.display = def ? "flex" : "none";
    if (def) {
      this.title.textContent = `${def.icon} ${def.label}`;
      this.sub.textContent = def.desc;
    }
    for (const fn of this.listeners) fn(id);
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onKey);
    this.root.remove();
  }
}
