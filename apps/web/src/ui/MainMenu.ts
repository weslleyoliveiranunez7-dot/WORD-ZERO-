import { formatRemaining, type WorldInfo, type WorldStatus } from "@worldzero/shared";
import { fetchServerList, getLastWorld, getServerUrl } from "../net/serverUrl";
import { uiRoot } from "./landscape";

// Menus do jogo (DOM, sem biblioteca): TELA INICIAL (logo + toque para comecar) e MENU DE SERVIDORES.
// Estilo: grafite escuro, destaque vermelho da logo, abas em cima, lateral com categorias, lista em linhas.
// So organiza a tela: a lista vem de fetchServerList (Etapa 13) e entrar num mundo e o mesmo `scene.start` de antes.

const M = {
  page: "#161615",
  bar: "#0f0f0e",
  side: "#1f1f1d",
  panel: "#2a2a28",
  row: "#31312e",
  line: "#3a3a37",
  text: "#d2d2cd",
  dim: "#7d7d77",
  red: "#cd412b",
  green: "#8dae3a",
  olive: "#4a5a2a",
  warn: "#c9b458",
  bad: "#d96b6b",
};
const FONT = '"Segoe UI", Roboto, Arial, sans-serif';
const BASE = import.meta.env.BASE_URL ?? "./"; // "./" no Pages e no Capacitor

const STATUS_LABEL: Record<WorldStatus, string> = { online: "ONLINE", iniciando: "INICIANDO", lotado: "LOTADO" };
const STATUS_COLOR: Record<WorldStatus, string> = { online: M.green, iniciando: M.warn, lotado: M.bad };

function css(): void {
  if (document.getElementById("wz-menu-css")) return;
  const s = document.createElement("style");
  s.id = "wz-menu-css";
  s.textContent = `@keyframes wzblink{0%,100%{opacity:1}50%{opacity:.25}}
.wz-row:active{background:#3b3b37!important}.wz-btn:active{filter:brightness(1.25)}`;
  document.head.appendChild(s);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, style: Partial<CSSStyleDeclaration> = {}, parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e.style, style);
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

function logo(file: string, style: Partial<CSSStyleDeclaration>, parent: HTMLElement): HTMLImageElement {
  const i = el("img", style, parent);
  i.src = BASE + file;
  i.alt = "WORLD ZERO";
  i.draggable = false;
  return i;
}

// ---------- TELA INICIAL ----------
export class TitleScreen {
  private root: HTMLDivElement;
  private done = false;
  private status: HTMLDivElement;
  private ctrl = new AbortController();

  constructor(private onStart: () => void) {
    css();
    this.root = el("div", { position: "fixed", inset: "0", background: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "auto", zIndex: "30", font: `14px ${FONT}`, touchAction: "manipulation", userSelect: "none" });
    uiRoot().appendChild(this.root);
    logo("logo.png", { maxWidth: "72%", maxHeight: "52%", objectFit: "contain" }, this.root);
    el("div", { marginTop: "5%", color: M.text, fontWeight: "700", fontSize: "17px", letterSpacing: "4px", animation: "wzblink 1.6s ease-in-out infinite" }, this.root, "TOQUE PARA COMEÇAR");
    this.status = el("div", { position: "absolute", bottom: "10px", left: "0", right: "0", textAlign: "center", color: M.dim, fontSize: "11px" }, this.root, "Servidor: verificando...");
    this.start = this.start.bind(this);
    this.root.addEventListener("pointerdown", this.start);
    window.addEventListener("keydown", this.onKey);
    void this.check();
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === "Enter" || e.key === " ") this.start();
  };

  private start(): void {
    if (this.done) return;
    this.done = true;
    this.onStart();
  }

  // So informa (o jogo funciona sem isso): mostra se o servidor responde.
  private async check(): Promise<void> {
    const timer = setTimeout(() => this.ctrl.abort(), 3500);
    try {
      const res = await fetch(`${getServerUrl().replace(/^ws/, "http")}/health`, { signal: this.ctrl.signal, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.setStatus("Servidor: online", M.green);
    } catch {
      this.setStatus("Servidor: sem resposta (pode estar acordando; o mapa offline funciona sem ele)", M.bad);
    } finally {
      clearTimeout(timer);
    }
  }

  private setStatus(t: string, color: string): void {
    if (!this.root.isConnected) return;
    this.status.textContent = t;
    this.status.style.color = color;
  }

  destroy(): void {
    this.ctrl.abort();
    window.removeEventListener("keydown", this.onKey);
    this.root.remove();
  }
}

// ---------- MENU DE SERVIDORES ----------
export interface MenuHandlers {
  join: (w: WorldInfo) => void;
  playDefault: () => void;
  playOffline: () => void;
  back: () => void;
}

type View = "servers" | "history" | "offline";
type State = "carregando" | "ok" | "falhou";
const VIEWS: { id: View; icon: string; label: string }[] = [
  { id: "servers", icon: "🌐", label: "SERVIDORES" },
  { id: "history", icon: "🕘", label: "ÚLTIMO" },
  { id: "offline", icon: "🎮", label: "OFFLINE" },
];
const COLS = "minmax(0,1fr) 72px 92px 76px";
const REFRESH_MS = 5000;

export class MenuScreen {
  private root: HTMLDivElement;
  private content: HTMLDivElement;
  private sideBtns = new Map<View, HTMLButtonElement>();
  private view: View = "servers";
  private servers: WorldInfo[] = [];
  private state: State = "carregando";
  private last: string | null = getLastWorld();
  private key = "";
  private loading = false;
  private timer = 0;

  constructor(private h: MenuHandlers, private notice = "") {
    css();
    this.root = el("div", { position: "fixed", inset: "0", background: M.page, display: "flex", flexDirection: "column", pointerEvents: "auto", zIndex: "30", font: `13px ${FONT}`, color: M.text, userSelect: "none" });
    uiRoot().appendChild(this.root);

    // barra de cima: logo, aba ativa, voltar
    const top = el("div", { height: "50px", flex: "0 0 50px", background: M.bar, display: "flex", alignItems: "stretch", gap: "18px", padding: "0 12px", borderBottom: `1px solid ${M.line}` }, this.root);
    const lg = el("div", { display: "flex", alignItems: "center" }, top);
    logo("logo.png", { height: "30px" }, lg);
    const tab = el("div", { display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "0 14px", borderTop: `3px solid ${M.red}`, color: "#fff", fontWeight: "700", letterSpacing: "1px", fontSize: "12px" }, top);
    el("div", { fontSize: "16px", lineHeight: "1" }, tab, "▶");
    el("div", { marginTop: "2px" }, tab, "JOGAR");
    el("div", { flex: "1" }, top);
    const x = el("button", { alignSelf: "center", background: "none", border: "none", color: M.text, font: `bold 22px ${FONT}`, padding: "4px 10px", touchAction: "manipulation" }, top, "✕");
    x.title = "Voltar para a tela inicial (Esc)";
    x.setAttribute("aria-label", "Voltar");
    x.onclick = (): void => this.h.back();

    const body = el("div", { flex: "1", minHeight: "0", display: "flex", margin: "0 auto", width: "100%", maxWidth: "980px" }, this.root);
    const side = el("div", { flex: "0 0 74px", background: M.side, display: "flex", flexDirection: "column", paddingTop: "8px" }, body);
    for (const v of VIEWS) {
      const b = el("button", { background: "none", border: "none", borderLeft: "4px solid transparent", color: M.dim, padding: "10px 2px", display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", font: `700 9px ${FONT}`, letterSpacing: "0.5px", touchAction: "manipulation" }, side);
      el("span", { fontSize: "20px", filter: "grayscale(1)" }, b, v.icon);
      el("span", {}, b, v.label);
      b.onclick = (): void => this.setView(v.id);
      this.sideBtns.set(v.id, b);
    }
    this.content = el("div", { flex: "1", minWidth: "0", background: M.panel, display: "flex", flexDirection: "column" }, body);

    this.onKey = this.onKey.bind(this);
    window.addEventListener("keydown", this.onKey);
    this.timer = window.setInterval(() => void this.refresh(true), REFRESH_MS);
    this.setView("servers");
    void this.refresh();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") this.h.back();
  }

  private setView(v: View): void {
    this.view = v;
    this.key = "";
    for (const [id, b] of this.sideBtns) {
      b.style.color = id === v ? "#fff" : M.dim;
      b.style.borderLeftColor = id === v ? M.red : "transparent";
      b.style.background = id === v ? "rgba(255,255,255,0.05)" : "none";
    }
    this.render();
  }

  private async refresh(quiet = false): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    if (!quiet && this.state !== "ok") {
      this.state = "carregando";
      this.render();
    }
    const r = await fetchServerList();
    this.loading = false;
    if (!this.root.isConnected) return; // saiu do menu enquanto carregava
    if (r) {
      this.servers = r.servers;
      this.state = "ok";
    } else if (this.state !== "ok") {
      this.state = "falhou"; // se ja havia lista, mantem a ultima (uma falha rapida nao apaga a tela)
    }
    this.render();
  }

  // So redesenha se algo visivel mudou (nao reinicia a rolagem nem pisca a cada 5 s).
  private render(): void {
    const k = `${this.view}|${this.state}|${this.last}|${this.notice}|${JSON.stringify(this.servers.map((s) => [s.id, s.players, s.status, s.season?.status, s.season ? Math.round((s.season.endsAt - s.season.now) / 60000) : 0]))}`;
    if (k === this.key) return;
    this.key = k;
    const c = this.content;
    c.textContent = "";
    if (this.view === "servers") this.renderServers(c);
    else if (this.view === "history") this.renderHistory(c);
    else this.renderOffline(c);
  }

  private heading(c: HTMLElement, text: string): void {
    el("div", { padding: "12px 16px 4px", fontSize: "20px", fontWeight: "800", letterSpacing: "1px", color: "#4b4b47" }, c, text);
  }

  private button(label: string, onClick: () => void, parent: HTMLElement, primary = true): HTMLButtonElement {
    const b = el("button", { font: `800 13px ${FONT}`, letterSpacing: "1.5px", padding: "11px 18px", border: "none", borderRadius: "2px", background: primary ? M.olive : "#3b3b38", color: primary ? "#c7e07a" : M.text, touchAction: "manipulation" }, parent, label);
    b.className = "wz-btn";
    b.onclick = onClick;
    return b;
  }

  private renderServers(c: HTMLElement): void {
    this.heading(c, "ESCOLHER SERVIDOR");
    const bar = el("div", { display: "flex", alignItems: "center", gap: "12px", padding: "6px 16px 8px", fontWeight: "700", fontSize: "11px", letterSpacing: "1px", color: M.dim }, c);
    const label = this.state === "carregando" ? "CARREGANDO..." : this.state === "falhou" ? "LISTA INDISPONÍVEL" : `${this.servers.length} SERVIDOR${this.servers.length === 1 ? "" : "ES"} ENCONTRADO${this.servers.length === 1 ? "" : "S"}`;
    el("div", { flex: "1" }, bar, label);
    const rf = el("button", { background: "none", border: "none", color: M.text, font: `700 11px ${FONT}`, letterSpacing: "1px", touchAction: "manipulation" }, bar, "↻ ATUALIZAR");
    rf.onclick = (): void => void this.refresh();
    if (this.notice) el("div", { margin: "0 16px 6px", padding: "7px 10px", background: "rgba(217,107,107,0.15)", borderLeft: `3px solid ${M.bad}`, color: M.bad, fontSize: "12px" }, c, this.notice);

    if (this.state === "falhou") {
      const box = el("div", { padding: "10px 16px" }, c);
      el("div", { color: M.warn, marginBottom: "12px", lineHeight: "1.4" }, box, "Não foi possível carregar a lista (servidor fora do ar, acordando ou antigo). Tente atualizar em alguns segundos, ou entre direto no servidor padrão.");
      this.button("ENTRAR NO SERVIDOR PADRÃO", () => this.h.playDefault(), box);
      return;
    }
    const head = el("div", { display: "grid", gridTemplateColumns: COLS, gap: "6px", padding: "0 16px 4px", fontSize: "10px", fontWeight: "700", letterSpacing: "1px", color: M.dim, textAlign: "right" }, c);
    el("div", { textAlign: "left" }, head, "SERVIDOR");
    el("div", {}, head, "JOGADORES");
    el("div", {}, head, "TEMPORADA");
    el("div", {}, head, "STATUS");
    const list = el("div", { flex: "1", minHeight: "0", overflowY: "auto", touchAction: "pan-y", padding: "0 10px 10px 16px", display: "flex", flexDirection: "column", gap: "4px" }, c);
    if (this.state === "ok" && this.servers.length === 0) el("div", { color: M.dim, padding: "10px 0" }, list, "Nenhum servidor cadastrado.");
    for (const w of this.servers) this.row(list, w);
    if (this.state === "ok" && this.servers.length) el("div", { color: M.dim, fontSize: "11px", padding: "6px 0" }, list, "Toque num servidor para entrar.");
  }

  private row(list: HTMLElement, w: WorldInfo): void {
    const full = w.status === "lotado";
    const mine = w.id === this.last;
    const r = el("div", { display: "grid", gridTemplateColumns: COLS, gap: "6px", alignItems: "center", padding: "9px 10px", background: M.row, borderLeft: `3px solid ${mine ? M.green : "transparent"}`, opacity: full ? "0.55" : "1" }, list);
    r.className = "wz-row";
    const n = el("div", { minWidth: "0" }, r);
    el("div", { fontWeight: "700", fontSize: "15px", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, n, `${mine ? "★ " : ""}${w.name}`);
    el("div", { fontSize: "11px", color: M.dim, marginTop: "2px" }, n, `${w.region.toUpperCase()}${mine ? " · último servidor" : ""}`);
    const right = (t: string, color = M.text): void => void el("div", { textAlign: "right", fontWeight: "600", color, fontSize: "12px" }, r, t);
    right(`${w.players} / ${w.capacity}`, full ? M.bad : M.text);
    right(w.season ? (w.season.status === "ACTIVE" ? `T${w.season.n} · ${formatRemaining(w.season.endsAt - w.season.now)}` : "reiniciando…") : "—", M.dim);
    right(STATUS_LABEL[w.status], STATUS_COLOR[w.status]);
    if (!full) r.onclick = (): void => this.h.join(w);
  }

  private renderHistory(c: HTMLElement): void {
    this.heading(c, "ÚLTIMO SERVIDOR");
    const box = el("div", { padding: "10px 16px" }, c);
    const w = this.servers.find((s) => s.id === this.last);
    if (!this.last) return void el("div", { color: M.dim }, box, "Você ainda não entrou em nenhum servidor neste aparelho.");
    if (this.state !== "ok") return void el("div", { color: M.dim }, box, this.state === "carregando" ? "Carregando..." : "Lista indisponível no momento. Volte em SERVIDORES e atualize.");
    if (!w) return void el("div", { color: M.dim }, box, "O último servidor não está mais na lista.");
    const card = el("div", { padding: "12px", background: M.row, borderLeft: `3px solid ${M.green}`, marginBottom: "12px" }, box);
    el("div", { fontWeight: "800", fontSize: "17px", color: "#fff" }, card, w.name);
    el("div", { color: M.dim, fontSize: "12px", marginTop: "3px" }, card, `${w.region.toUpperCase()} · ${w.players}/${w.capacity} jogadores · ${STATUS_LABEL[w.status]}`);
    if (w.status === "lotado") el("div", { color: M.bad }, box, "Este servidor está lotado agora. Escolha outro em SERVIDORES.");
    else this.button("CONTINUAR", () => this.h.join(w), box);
  }

  private renderOffline(c: HTMLElement): void {
    this.heading(c, "MAPA OFFLINE");
    const box = el("div", { padding: "10px 16px" }, c);
    el("div", { color: M.text, lineHeight: "1.5", marginBottom: "12px", maxWidth: "420px" }, box, "Mapa de teste local, sem servidor: serve para testar movimento e controles. Não tem multiplayer, inventário online, fabricação nem construção.");
    this.button("JOGAR OFFLINE", () => this.h.playOffline(), box, false);
  }

  destroy(): void {
    window.clearInterval(this.timer);
    window.removeEventListener("keydown", this.onKey);
    this.root.remove();
  }
}
