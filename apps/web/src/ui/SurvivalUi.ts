import { ITEMS, ITEM_DESC, KIND_NAME, MAX_CARRY_WEIGHT, compareStacks, PART_NAME, SEV_NAME, Inventory, RECIPES, RECIPE_IDS, missingFor, type BodyPart, type InjuryView, type InventoryIntent, type InventoryUpdateMsg, type ItemCategory, type ItemStack, type PlayerStateMsg, type RecipeId, type Slot } from "@worldzero/shared";
import { uiRoot } from "./landscape";
import type { Services } from "./Services";
import { C, CATEGORY_LABEL, actionButton, chip, describeItem, el, icon, itemName, norm, searchBox, setEnabled } from "./theme";

// Paineis de PERSONAGEM, INVENTARIO e FABRICACAO + barra de atalhos + tela de morte (DOM, fora do canvas).
// Esta classe SO MOSTRA o que o servidor mandou e devolve "intencoes" (usar slot, fabricar, reaparecer).
// Nada aqui calcula vida, fome, itens ou receitas: o servidor sempre refaz as contas.

const ATTRS: { key: "health" | "hunger" | "thirst" | "energy"; label: string; icon: string; color: string; desc: string }[] = [
  { key: "health", label: "Vida", icon: "❤", color: "#c9514a", desc: "Sua saude. Se chegar a 0 voce morre. Bandagens recuperam vida." },
  { key: "hunger", label: "Fome", icon: "🍖", color: "#c28a3a", desc: "Necessidade de comida. Em 0 voce esta morrendo de fome. Coma para recuperar." },
  { key: "thirst", label: "Sede", icon: "💧", color: "#4a8fc9", desc: "Necessidade de hidratacao. Em 0 voce esta morrendo de sede. Beba agua." },
  { key: "energy", label: "Energia", icon: "⚡", color: "#c9be4a", desc: "Disposicao fisica. Abaixo de 20 voce fica exausto e mais lento." },
];

type InvFilter = ItemCategory | "all" | "equipped" | "usable"; // EXTRA 6.3: filtros do inventario
const HOTBAR = 6; // os 6 primeiros slots da mochila (teclas 1 a 6); o inventario mostra todos
const level = (v: number): string => (v <= 0 ? "CRITICO" : v < 20 ? "Baixo" : v < 60 ? "Atencao" : "Bom");

export class SurvivalUi {
  onUse: (slot: number, part?: BodyPart) => void = () => {}; // `part` = parte do corpo escolhida para tratar (so intencao)
  onInvOp: (op: InventoryIntent) => void = () => {}; // EXTRA 6.3: mover/dividir/descartar/equipar (so intencao; o servidor decide)
  onRespawn: () => void = () => {};
  onCraft: (recipe: RecipeId) => void = () => {}; // so uma INTENCAO; o servidor confere ingredientes, bancada, espaco e tempo
  private root: HTMLDivElement;
  // personagem
  private fills = new Map<string, HTMLDivElement>();
  private values = new Map<string, HTMLSpanElement>();
  private states = new Map<string, HTMLSpanElement>();
  private partEls: { el: SVGElement; part: BodyPart }[] = [];
  private selPart: BodyPart | null = null; // parte escolhida para tratar (null = o servidor escolhe a ferida mais urgente)
  private injList!: HTMLDivElement;
  private injKey = "";
  private painLine!: HTMLDivElement;
  private targetLine!: HTMLDivElement;
  private statusBar!: HTMLDivElement;
  private lastInjuries: InjuryView[] = [];
  private bodyLabel!: HTMLDivElement;
  private weaponLine!: HTMLDivElement;
  private warn!: HTMLDivElement;
  private weapon: string | null = null;
  // inventario
  private grid!: HTMLDivElement;
  private detail!: HTMLDivElement;
  private catRow!: HTMLDivElement;
  private selSlot = -1;
  private invCat: InvFilter = "all";
  private invQuery = "";
  private weightText!: HTMLDivElement;
  private weightFill!: HTMLDivElement;
  private weightInfo = { w: 0, max: MAX_CARRY_WEIGHT };
  private moveFrom = -1; // EXTRA 6.3: slot de origem de um "mover" em andamento (-1 = nenhum)
  private opQty = 1; // quantidade para dividir/descartar
  private confirmDiscard = false;
  private confirmTimer = 0;
  // fabricacao
  private recList!: HTMLDivElement;
  private recCatRow!: HTMLDivElement;
  private recDetail!: HTMLDivElement;
  private selRecipe: RecipeId = RECIPE_IDS[0];
  private recCat: ItemCategory | "all" = "all";
  private recQuery = "";
  // barra de atalhos
  private hotbar: HTMLDivElement;
  private hotKey = "";
  // morte
  private death: HTMLDivElement;
  private deathInfo: HTMLDivElement;
  private deathBtn: HTMLButtonElement;
  private slots: Slot[] = [];
  private invKey = "";
  private dirty = new Set<string>();
  private respawnAt = 0; // performance.now() em que o botao libera
  private timer = 0;

  constructor(private sv: Services) {
    this.root = el("div", { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "15", font: "12px monospace", color: C.text });
    uiRoot().appendChild(this.root);

    this.hotbar = el("div", { position: "absolute", left: "50%", bottom: "8px", transform: "translateX(-50%)", display: "flex", gap: "3px", pointerEvents: "auto", touchAction: "manipulation" }, this.root);
    this.hotbar.dataset.ui = "hotbar";

    this.buildCharacter(sv.body("character"));
    this.buildInventory(sv.body("inventory"));
    this.buildCraft(sv.body("craft"));
    sv.onOpen((id) => {
      if (id && this.dirty.delete(id)) this.refresh(id);
    });

    // tela de morte
    this.death = el("div", { position: "absolute", inset: "0", display: "none", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", background: "rgba(25,0,0,0.82)", pointerEvents: "auto", textAlign: "center", padding: "16px" }, this.root);
    el("div", { fontSize: "32px", fontWeight: "bold", color: "#ff6b6b" }, this.death, "VOCE MORREU");
    this.deathInfo = el("div", { fontSize: "14px", maxWidth: "320px" }, this.death);
    this.deathBtn = el("button", { font: "bold 16px monospace", padding: "12px 24px", borderRadius: "6px", border: "2px solid #ff6b6b", background: "#300", color: "#fff" }, this.death);
    this.deathBtn.onclick = (): void => this.onRespawn();

    this.onKey = this.onKey.bind(this);
    window.addEventListener("keydown", this.onKey);
    this.timer = window.setInterval(() => this.refreshDeathButton(), 200);
    this.setInventory({ slots: new Array<Slot>(12).fill(null) });
  }

  private onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= this.slots.length && !e.repeat) this.onUse(n - 1, this.selPart ?? undefined);
  }

  // ---------- PERSONAGEM ----------
  private buildCharacter(body: HTMLElement): void {
    const row = el("div", { display: "flex", flexWrap: "wrap", gap: "12px" }, body);
    const left = el("div", { flex: "0 0 96px", textAlign: "center" }, row);
    el("div", { color: C.dim, fontSize: "10px", marginBottom: "4px" }, left, "CORPO");
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 60 120");
    svg.setAttribute("width", "72");
    svg.setAttribute("height", "144");
    const part = (tag: string, bp: BodyPart, a: Record<string, string>): void => {
      const p = document.createElementNS(NS, tag);
      for (const k in a) p.setAttribute(k, a[k]);
      p.setAttribute("stroke-width", "2");
      (p as SVGElement).style.cursor = "pointer";
      p.addEventListener("click", () => this.selectPart(bp));
      svg.appendChild(p);
      this.partEls.push({ el: p, part: bp });
    };
    part("circle", "head", { cx: "30", cy: "14", r: "10" });
    part("rect", "torso", { x: "16", y: "27", width: "28", height: "44", rx: "6" });
    part("rect", "arms", { x: "4", y: "29", width: "10", height: "40", rx: "5" });
    part("rect", "arms", { x: "46", y: "29", width: "10", height: "40", rx: "5" });
    part("rect", "legs", { x: "17", y: "73", width: "11", height: "44", rx: "5" });
    part("rect", "legs", { x: "32", y: "73", width: "11", height: "44", rx: "5" });
    left.appendChild(svg);
    this.bodyLabel = el("div", { fontSize: "11px", fontWeight: "bold", marginTop: "2px" }, left);
    el("div", { color: C.dim, fontSize: "9px", marginTop: "3px" }, left, "Cada parte tem sua cor. Toque numa parte para tratar so ela.");

    const right = el("div", { flex: "1 1 190px", display: "flex", flexDirection: "column", gap: "8px", minWidth: "0" }, row);
    for (const a of ATTRS) {
      const card = el("div", { background: C.bg2, border: `1px solid ${C.line}`, borderRadius: "3px", padding: "6px" }, right);
      const head = el("div", { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "6px" }, card);
      el("span", { fontWeight: "bold" }, head, `${a.icon} ${a.label}`);
      const val = el("span", {}, head);
      const bar = el("div", { height: "9px", background: "#0b0e0b", border: `1px solid ${C.line}`, margin: "4px 0", position: "relative" }, card);
      this.fills.set(a.key, el("div", { position: "absolute", left: "0", top: "0", bottom: "0", width: "100%", background: a.color }, bar));
      this.values.set(a.key, val);
      const st = el("span", { fontSize: "10px", fontWeight: "bold", color: C.dim }, card);
      this.states.set(a.key, st);
      el("div", { fontSize: "10px", color: C.dim, marginTop: "2px" }, card, a.desc);
    }
    this.weaponLine = el("div", { color: C.warn }, right);
    this.warn = el("div", { color: C.bad, fontSize: "11px" }, right);
    // Ferimentos: o servidor manda a lista pronta; aqui so mostra e devolve a parte escolhida
    this.painLine = el("div", { fontSize: "11px", color: C.warn }, right);
    this.targetLine = el("div", { fontSize: "10px", color: C.dim }, right);
    this.injList = el("div", { display: "flex", flexDirection: "column", gap: "4px" }, right);
    this.renderTarget();
  }

  setState(s: PlayerStateMsg): void {
    for (const a of ATTRS) {
      const v = Math.max(0, Math.min(100, s[a.key]));
      this.fills.get(a.key)!.style.width = `${v}%`;
      this.values.get(a.key)!.textContent = `${Math.round(v)} / 100`;
      const st = this.states.get(a.key)!;
      st.textContent = level(v);
      st.style.color = v < 20 ? C.bad : v < 60 ? C.warn : C.ok;
    }
    const hp = s.health;
    const col = hp < 30 ? "#b5483f" : hp < 60 ? "#b8913f" : "#5e8f58";
    const body = s.body ?? [100, 100, 100, 100]; // [cabeca, tronco, bracos, pernas]
    const partIdx: Record<BodyPart, number> = { head: 0, torso: 1, arms: 2, legs: 3 };
    for (const p of this.partEls) {
      const c = body[partIdx[p.part]] ?? 100;
      p.el.setAttribute("fill", c < 40 ? "#b5483f" : c < 75 ? "#b8913f" : "#5e8f58");
      p.el.setAttribute("stroke", this.selPart === p.part ? "#ffffff" : "none");
    }
    this.setInjuries(s);
    this.bodyLabel.textContent = hp < 30 ? "Critico" : hp < 60 ? "Ferido" : "Saudavel";
    this.bodyLabel.style.color = col;
    const msgs: string[] = [];
    if (s.hunger <= 0) msgs.push("Morrendo de fome!");
    else if (s.hunger < 20) msgs.push("Com muita fome");
    if (s.thirst <= 0) msgs.push("Morrendo de sede!");
    else if (s.thirst < 20) msgs.push("Com muita sede");
    if (s.energy < 20) msgs.push("Exausto (mais lento)");
    this.warn.textContent = msgs.join(" | ");
    // so mostra a arma que o SERVIDOR usa (a de maior dano no inventario); o cliente nao escolhe.
    this.weaponLine.textContent = `Arma: ${s.weapon ? itemName(s.weapon) : "Punho"}`;
    if (s.weapon !== this.weapon) {
      this.weapon = s.weapon ?? null;
      this.renderHotbar();
    }

    if (s.dead) {
      const lost = s.lost.length ? s.lost.map((l) => `${l.qty}x ${itemName(l.id)}`).join(", ") : "nada";
      this.deathInfo.textContent = `Itens perdidos: ${lost}.`;
      this.respawnAt = performance.now() + s.respawnInMs;
      this.death.style.display = "flex";
      this.sv.lock(true);
      this.refreshDeathButton();
    } else {
      this.death.style.display = "none";
      this.sv.lock(false);
    }
  }

  // ---------- FERIMENTOS ----------
  private selectPart(p: BodyPart): void {
    this.selPart = this.selPart === p ? null : p;
    this.injKey = "";
    this.renderTarget();
    this.renderInjuries();
    for (const e of this.partEls) e.el.setAttribute("stroke", this.selPart === e.part ? "#ffffff" : "none");
  }

  private renderTarget(): void {
    this.targetLine.textContent = this.selPart ? `Tratando: ${PART_NAME[this.selPart]} (toque de novo para automatico)` : "Tratamento automatico: a ferida mais urgente.";
  }

  private setInjuries(s: PlayerStateMsg): void {
    const list = s.injuries ?? [];
    this.lastInjuries = list;
    if (this.selPart && !list.some((i) => i.part === this.selPart)) {
      this.selPart = null; // a parte sarou: volta ao automatico
      this.renderTarget();
    }
    this.painLine.textContent = s.pain > 0 || s.painkiller ? `Dor: ${s.pain}%${s.painkiller ? " (analgesico ativo)" : ""}${s.bleeding > 0 ? `  |  Sangrando: -${s.bleeding} vida/s` : ""}` : s.bleeding > 0 ? `Sangrando: -${s.bleeding} vida/s` : "";
    this.renderInjuries();
    this.renderStatus(s);
  }

  private hint(i: InjuryView): string {
    if (i.infected) return "Use Antibiotico.";
    if (i.bleed > 0) return i.sev === 1 ? "Use Curativo ou Bandagem." : "Use Bandagem.";
    if (i.kind === "fracture") return i.care < 2 ? "Use Tala." : "Descanse para curar mais rapido.";
    if (i.kind === "bruise") return "Cura sozinha com o tempo.";
    return i.care === 0 ? "Cubra com Curativo ou Bandagem." : "Descanse e mantenha fome/sede em dia.";
  }

  private renderInjuries(): void {
    const list = this.lastInjuries;
    const key = `${this.selPart}|${list.map((i) => `${i.id}.${i.sev}.${i.care}.${i.infected ? 1 : 0}.${i.infection}.${i.heal}.${i.bleed}`).join(",")}`;
    if (key === this.injKey) return;
    this.injKey = key;
    this.injList.textContent = "";
    if (list.length === 0) return void el("div", { color: C.ok, fontSize: "11px" }, this.injList, "Sem ferimentos.");
    for (const i of list) {
      const row = el("div", { background: this.selPart === i.part ? C.bg3 : C.bg2, border: `1px solid ${this.selPart === i.part ? C.lineHi : C.line}`, borderRadius: "3px", padding: "5px", cursor: "pointer" }, this.injList);
      row.onclick = (): void => this.selectPart(i.part);
      el("div", { fontWeight: "bold", fontSize: "11px", color: i.sev === 3 ? C.bad : i.sev === 2 ? C.warn : C.text }, row, `${KIND_NAME[i.kind]} ${SEV_NAME[i.sev - 1]} - ${PART_NAME[i.part]}`);
      const tags: string[] = [];
      if (i.bleed > 0) tags.push(`SANGRANDO -${i.bleed}/s`);
      if (i.infected) tags.push("INFECTADO (nao cicatriza)");
      else if (i.infection >= 20) tags.push(`risco de infeccao ${i.infection}%`);
      tags.push(i.care === 2 ? "imobilizada" : i.care === 1 ? "coberta" : i.kind === "bruise" ? "sem curativo necessario" : "sem tratamento");
      if (!i.infected) tags.push(`cicatrizando ${i.heal}%`);
      el("div", { fontSize: "10px", color: i.bleed > 0 || i.infected ? C.bad : C.dim }, row, tags.join(" | "));
      el("div", { fontSize: "10px", color: C.dim }, row, this.hint(i));
    }
  }

  // Faixa sempre visivel (fora do painel) com os avisos de ferimento mais importantes.
  private renderStatus(s: PlayerStateMsg): void {
    if (!this.statusBar) {
      this.statusBar = el("div", { position: "absolute", left: "50%", bottom: "64px", transform: "translateX(-50%)", display: "flex", gap: "4px", pointerEvents: "none", font: "bold 11px monospace" }, this.root);
    }
    const list = s.injuries ?? [];
    const tags: [string, string][] = [];
    if (s.bleeding > 0) tags.push(["🩸 Sangrando", C.bad]);
    if (list.some((i) => i.infected)) tags.push(["🦠 Infectado", C.bad]);
    if (list.some((i) => i.kind === "fracture" && i.care < 2)) tags.push(["🦴 Fratura", C.warn]);
    if (list.some((i) => i.kind === "burn")) tags.push(["🔥 Queimadura", C.warn]);
    if (s.pain >= 30) tags.push([`😖 Dor ${s.pain}%`, C.warn]);
    const key = tags.map((t) => t[0]).join("|");
    if (key === this.statusBar.dataset.key) return;
    this.statusBar.dataset.key = key;
    this.statusBar.textContent = "";
    for (const [label, color] of tags) el("span", { background: "rgba(14,17,14,0.85)", border: `1px solid ${color}`, color, borderRadius: "3px", padding: "2px 5px", whiteSpace: "nowrap" }, this.statusBar, label);
  }

  // ---------- INVENTARIO ----------
  // So mostra o que o servidor mandou. Mover/dividir/descartar/equipar viram INTENCOES (onInvOp); nada muda aqui antes da resposta.
  private buildInventory(body: HTMLElement): void {
    const wt = el("div", { marginBottom: "6px" }, body);
    this.weightText = el("div", { fontSize: "11px", marginBottom: "3px" }, wt);
    const bar = el("div", { height: "6px", background: C.bg3, border: `1px solid ${C.line}`, borderRadius: "3px", overflow: "hidden" }, wt);
    this.weightFill = el("div", { height: "100%", width: "0%", background: C.ok }, bar);
    searchBox((q) => {
      this.invQuery = norm(q);
      this.renderInventory();
    }, body);
    this.catRow = el("div", { display: "flex", flexWrap: "wrap", gap: "4px", margin: "6px 0" }, body);
    this.grid = el("div", { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "4px", userSelect: "none" }, body);
    this.detail = el("div", { marginTop: "8px", padding: "8px", background: C.bg2, border: `1px solid ${C.line}`, borderRadius: "3px", minHeight: "70px" }, body);
  }

  private isUsable(s: Slot): boolean {
    const def = s ? ITEMS[s.id] : undefined;
    return !!def && (Object.keys(def.effects).length > 0 || !!def.medical);
  }

  private matches(s: Slot): boolean {
    if (!s) return false;
    const def = ITEMS[s.id];
    const f = this.invCat;
    const okFilter = f === "all" || (f === "equipped" ? s.eq === true : f === "usable" ? this.isUsable(s) : def?.category === f);
    return okFilter && (!this.invQuery || norm(itemName(s.id)).includes(this.invQuery));
  }

  private durPct(s: ItemStack): number | null {
    const max = ITEMS[s.id]?.durability;
    return max ? Math.max(0, Math.min(1, (s.dur ?? max) / max)) : null;
  }

  private durColor(p: number): string {
    return p > 0.5 ? C.ok : p > 0.25 ? C.warn : C.bad;
  }

  private renderWeight(): void {
    const { w, max } = this.weightInfo;
    const used = this.slots.filter((x) => x).length;
    const ratio = max > 0 ? Math.min(1, w / max) : 0;
    this.weightText.textContent = `Peso ${w.toFixed(1)} / ${max} kg   |   Slots ${used}/${this.slots.length}`;
    this.weightText.style.color = ratio >= 0.9 ? C.bad : C.text;
    this.weightFill.style.width = `${Math.round(ratio * 100)}%`;
    this.weightFill.style.background = ratio >= 0.9 ? C.bad : ratio >= 0.7 ? C.warn : C.ok;
  }

  private selectSlot(i: number): void {
    this.selSlot = i;
    this.confirmDiscard = false;
    const s = this.slots[i];
    this.opQty = s ? Math.max(1, Math.floor(s.qty / 2)) : 1;
    this.renderInventory();
  }

  private renderInventory(): void {
    if (!this.sv.isOpen("inventory")) return void this.dirty.add("inventory");
    this.renderWeight();
    this.catRow.textContent = "";
    const cats = new Set<ItemCategory>();
    for (const s of this.slots) if (s && ITEMS[s.id]) cats.add(ITEMS[s.id].category);
    const hasEq = this.slots.some((s) => s?.eq);
    const hasUse = this.slots.some((s) => this.isUsable(s));
    if (this.invCat !== "all" && !(cats as Set<string>).has(this.invCat) && !(this.invCat === "equipped" && hasEq) && !(this.invCat === "usable" && hasUse)) this.invCat = "all";
    const pick = (f: InvFilter): void => {
      this.invCat = f;
      this.renderInventory();
    };
    chip("Todos", this.invCat === "all", () => pick("all"), this.catRow);
    if (hasEq) chip("Equipado", this.invCat === "equipped", () => pick("equipped"), this.catRow);
    if (hasUse) chip("Usaveis", this.invCat === "usable", () => pick("usable"), this.catRow);
    for (const c of cats) chip(CATEGORY_LABEL[c], this.invCat === c, () => pick(c), this.catRow);

    this.grid.textContent = "";
    this.slots.forEach((s, i) => {
      const on = this.matches(s);
      const isFrom = i === this.moveFrom;
      const border = isFrom ? C.warn : i === this.selSlot ? C.lineHi : s?.eq ? C.ok : C.line;
      const cell = el("div", { position: "relative", height: "46px", background: s ? C.bg3 : C.bg2, border: `1px solid ${border}`, borderRadius: "3px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", opacity: s && !on ? "0.25" : "1", boxShadow: isFrom ? `inset 0 0 0 1px ${C.warn}` : "none" }, this.grid);
      el("div", { position: "absolute", left: "3px", top: "1px", fontSize: "9px", color: C.dim }, cell, String(i + 1));
      if (s) {
        cell.appendChild(document.createTextNode(icon(s.id)));
        if (s.qty > 1) el("div", { position: "absolute", right: "3px", bottom: "3px", fontSize: "11px", fontWeight: "bold" }, cell, String(s.qty));
        if (s.eq) el("div", { position: "absolute", right: "3px", top: "1px", fontSize: "9px", fontWeight: "bold", color: C.ok }, cell, "E");
        const dp = this.durPct(s);
        if (dp !== null) {
          const bar = el("div", { position: "absolute", left: "3px", right: "3px", bottom: "1px", height: "3px", background: C.bg, borderRadius: "2px", overflow: "hidden" }, cell);
          el("div", { height: "100%", width: `${Math.round(dp * 100)}%`, background: this.durColor(dp) }, bar);
        }
        cell.title = itemName(s.id);
      }
      cell.onclick = (): void => {
        if (this.moveFrom >= 0) {
          const from = this.moveFrom;
          this.moveFrom = -1;
          if (from !== i) {
            this.onInvOp({ op: "move", from, to: i });
            this.selSlot = i; // a selecao acompanha o item movido (o servidor pode recusar; entao so volta ao normal)
          }
          return this.renderInventory();
        }
        this.selectSlot(i);
      };
    });
    this.renderDetail();
  }

  private renderDetail(): void {
    const d = this.detail;
    d.textContent = "";
    const s = this.slots[this.selSlot];
    if (this.moveFrom >= 0) {
      el("div", { color: C.warn, fontWeight: "bold", marginBottom: "6px" }, d, `Mover o slot ${this.moveFrom + 1}: toque no slot de destino.`);
      el("div", { color: C.dim, fontSize: "10px", marginBottom: "6px" }, d, "Slot vazio = muda de lugar. Mesmo item = junta as pilhas. Outro item = troca de lugar.");
      const c = actionButton("CANCELAR", () => ((this.moveFrom = -1), this.renderInventory()), d);
      c.style.background = C.bg3;
      return;
    }
    if (this.selSlot < 0) return void el("div", { color: C.dim }, d, "Selecione um slot para ver o item.");
    if (!s) return void el("div", { color: C.dim }, d, `Slot ${this.selSlot + 1} vazio.`);
    const def = ITEMS[s.id];
    el("div", { fontWeight: "bold", fontSize: "13px" }, d, `${icon(s.id)} ${itemName(s.id)}  x${s.qty}${s.eq ? "  [EQUIPADO]" : ""}`);
    if (def) {
      const total = Math.round(def.weight * s.qty * 100) / 100;
      el("div", { color: C.dim, fontSize: "10px", margin: "2px 0 5px" }, d, `${CATEGORY_LABEL[def.category]} | ${def.weight} kg cada${s.qty > 1 ? ` (${total} kg no total)` : ""} | pilha ate ${def.maxStack}`);
      const dp = this.durPct(s);
      if (dp !== null && def.durability) {
        const row = el("div", { margin: "0 0 6px" }, d);
        el("div", { fontSize: "11px", marginBottom: "2px" }, row, `Durabilidade ${s.dur ?? def.durability}/${def.durability}${dp <= 0.25 ? "  (quase quebrando)" : ""}`);
        const bar = el("div", { height: "5px", background: C.bg3, border: `1px solid ${C.line}`, borderRadius: "3px", overflow: "hidden" }, row);
        el("div", { height: "100%", width: `${Math.round(dp * 100)}%`, background: this.durColor(dp) }, bar);
      }
      const desc = ITEM_DESC[s.id];
      if (desc) el("div", { fontSize: "11px", marginBottom: "4px", fontStyle: "italic" }, d, desc);
      el("div", { fontSize: "11px", marginBottom: "6px" }, d, describeItem(def));
    }
    this.renderCompare(d, s);

    const usable = this.isUsable(s);
    const canStack = !!def && def.maxStack > 1;
    this.opQty = Math.max(1, Math.min(s.qty, this.opQty));
    if (s.qty > 1) {
      const q = el("div", { display: "flex", alignItems: "center", gap: "6px", margin: "4px 0" }, d);
      el("span", { color: C.dim }, q, "Quantidade:");
      const mk = (label: string, delta: number): void => {
        const b = el("button", { font: "bold 14px monospace", width: "34px", height: "30px", border: `1px solid ${C.line}`, borderRadius: "3px", background: C.bg3, color: C.text, touchAction: "manipulation" }, q, label);
        b.onclick = (): void => {
          this.opQty = Math.max(1, Math.min(s.qty, this.opQty + delta));
          this.confirmDiscard = false;
          this.renderDetail();
        };
      };
      mk("-", -1);
      el("b", { minWidth: "24px", textAlign: "center" }, q, String(this.opQty));
      mk("+", 1);
    }
    const g = el("div", { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", marginTop: "4px" }, d);
    const useB = actionButton(usable ? "USAR 1" : "NAO CONSUMIVEL", () => this.onUse(this.selSlot, this.selPart ?? undefined), g);
    setEnabled(useB, usable);
    if (def?.equip) {
      const eqB = actionButton(s.eq ? "DESEQUIPAR" : "EQUIPAR", () => this.onInvOp(s.eq ? { op: "unequip" } : { op: "equip", slot: this.selSlot }), g);
      setEnabled(eqB, true);
    }
    actionButton("MOVER", () => ((this.moveFrom = this.selSlot), this.renderInventory()), g);
    if (canStack) {
      const spB = actionButton(`DIVIDIR (${this.opQty})`, () => this.onInvOp({ op: "split", slot: this.selSlot, qty: this.opQty }), g);
      setEnabled(spB, s.qty >= 2 && this.opQty < s.qty && this.slots.some((x) => x === null));
    }
    const disB = actionButton(this.confirmDiscard ? `CONFIRMAR: DESCARTAR ${this.opQty}` : `DESCARTAR${s.qty > 1 ? ` (${this.opQty})` : ""}`, () => {
      if (!this.confirmDiscard) {
        this.confirmDiscard = true;
        window.clearTimeout(this.confirmTimer);
        this.confirmTimer = window.setTimeout(() => ((this.confirmDiscard = false), this.renderDetail()), 4000);
        return this.renderDetail();
      }
      this.confirmDiscard = false;
      this.onInvOp({ op: "discard", slot: this.selSlot, qty: this.opQty });
    }, g);
    disB.style.background = this.confirmDiscard ? "#5a2a26" : C.bg3;
    disB.style.borderColor = this.confirmDiscard ? C.bad : C.line;
    const hint = usable && this.selSlot < 9 ? `Atalho de uso: tecla ${this.selSlot + 1}. ` : "";
    el("div", { color: C.dim, fontSize: "10px", marginTop: "4px" }, d, `${hint}Descartar destroi o item (nao vai para o chao).`);
  }

  // Comparar com o equipado (ou com a arma que o servidor esta usando). So leitura.
  private renderCompare(d: HTMLElement, s: ItemStack): void {
    let ref: ItemStack | null = null;
    const eq = this.slots.findIndex((x) => x?.eq);
    if (eq >= 0) ref = this.slots[eq];
    else if (this.weapon) ref = this.slots.find((x) => x?.id === this.weapon) ?? null;
    if (!ref || ref === s) return;
    const rows = compareStacks(s, ref);
    if (!rows) return;
    const box = el("div", { margin: "0 0 6px", padding: "5px 6px", background: C.bg3, border: `1px solid ${C.line}`, borderRadius: "3px" }, d);
    el("div", { color: C.dim, fontSize: "10px", marginBottom: "3px" }, box, `Comparar com ${itemName(ref.id)} (${s.id === ref.id ? "mesmo item" : eq >= 0 ? "equipado" : "em uso"})`);
    for (const r of rows) {
      const line = el("div", { display: "flex", justifyContent: "space-between", fontSize: "11px" }, box);
      el("span", {}, line, r.label);
      el("span", { color: r.better === "mine" ? C.ok : r.better === "worn" ? C.bad : C.dim }, line, `${r.mine}  x  ${r.worn}`);
    }
  }

  setInventory(m: InventoryUpdateMsg): void {
    const key = JSON.stringify([m.slots, m.weight, m.maxWeight]);
    if (key === this.invKey) return; // o servidor reenvia a cada 2 s: so refaz se mudou
    this.invKey = key;
    this.slots = m.slots;
    const w = m.weight ?? m.slots.reduce((n, x) => n + (x && ITEMS[x.id] ? ITEMS[x.id].weight * x.qty : 0), 0);
    this.weightInfo = { w, max: m.maxWeight ?? MAX_CARRY_WEIGHT };
    if (this.moveFrom >= 0 && !this.slots[this.moveFrom]) this.moveFrom = -1; // o item de origem sumiu
    this.renderHotbar();
    this.renderInventory();
    this.renderCraft();
  }

  // ---------- BARRA DE ATALHOS ----------
  private renderHotbar(): void {
    const key = this.invKey + "|" + this.weapon;
    if (key === this.hotKey) return;
    this.hotKey = key;
    this.hotbar.textContent = "";
    const eqSlot = this.slots.findIndex((x) => x?.eq);
    const wSlot = eqSlot >= 0 ? eqSlot : this.weapon ? this.slots.findIndex((x) => x?.id === this.weapon) : -1;
    for (let i = 0; i < Math.min(HOTBAR, this.slots.length); i++) {
      const s = this.slots[i];
      const cell = el("div", { position: "relative", width: "36px", height: "36px", background: "rgba(14,17,14,0.85)", border: `1px solid ${i === wSlot ? C.lineHi : C.line}`, borderRadius: "3px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", boxShadow: i === wSlot ? `inset 0 0 0 1px ${C.lineHi}` : "none", userSelect: "none" }, this.hotbar);
      el("div", { position: "absolute", left: "2px", top: "0", fontSize: "8px", color: C.dim }, cell, String(i + 1));
      if (s) {
        cell.appendChild(document.createTextNode(icon(s.id)));
        el("div", { position: "absolute", right: "2px", bottom: "0", fontSize: "9px", fontWeight: "bold" }, cell, String(s.qty));
        cell.title = itemName(s.id) + (i === wSlot ? (s.eq ? " (equipado)" : " (arma em uso)") : "");
        cell.onclick = (): void => this.onUse(i, this.selPart ?? undefined);
      }
    }
  }

  // ---------- FABRICACAO ----------
  private buildCraft(body: HTMLElement): void {
    const cols = el("div", { display: "flex", flexWrap: "wrap", gap: "10px" }, body);
    const a1 = el("div", { flex: "1 1 150px", minWidth: "0" }, cols);
    el("div", { fontWeight: "bold", marginBottom: "4px" }, a1, "1. RECEITAS");
    searchBox((q) => {
      this.recQuery = norm(q);
      this.renderCraft();
    }, a1);
    this.recCatRow = el("div", { display: "flex", flexWrap: "wrap", gap: "4px", margin: "6px 0" }, a1);
    this.recList = el("div", { display: "flex", flexDirection: "column", gap: "3px" }, a1);
    this.recDetail = el("div", { flex: "1.4 1 200px", minWidth: "0" }, cols);
  }

  private renderCraft(): void {
    if (!this.sv.isOpen("craft")) return void this.dirty.add("craft");
    const inv = new Inventory();
    this.slots.forEach((s, i) => {
      if (s && i < inv.slots.length) inv.slots[i] = { id: s.id, qty: s.qty };
    });
    const cats = [...new Set(RECIPE_IDS.map((id) => ITEMS[RECIPES[id].output.id].category))];
    this.recCatRow.textContent = "";
    chip("Todas", this.recCat === "all", () => ((this.recCat = "all"), this.renderCraft()), this.recCatRow);
    for (const c of cats) chip(CATEGORY_LABEL[c], this.recCat === c, () => ((this.recCat = c), this.renderCraft()), this.recCatRow);

    this.recList.textContent = "";
    let shown = 0;
    for (const id of RECIPE_IDS) {
      const r = RECIPES[id];
      const def = ITEMS[r.output.id];
      if ((this.recCat !== "all" && def.category !== this.recCat) || (this.recQuery && !norm(def.name).includes(this.recQuery))) continue;
      shown++;
      const ok = !missingFor(inv, id);
      const row = el("div", { display: "flex", alignItems: "center", gap: "6px", padding: "6px", borderRadius: "3px", border: `1px solid ${id === this.selRecipe ? C.lineHi : C.line}`, background: id === this.selRecipe ? C.bg3 : C.bg2, userSelect: "none" }, this.recList);
      el("span", { fontSize: "16px" }, row, icon(r.output.id));
      el("span", { flex: "1", fontSize: "11px" }, row, def.name);
      el("span", { color: ok ? C.ok : C.dim, fontSize: "10px" }, row, ok ? "pronta" : "falta");
      row.onclick = (): void => {
        this.selRecipe = id;
        this.renderCraft();
      };
    }
    if (!shown) el("div", { color: C.dim, fontSize: "11px" }, this.recList, "Nenhuma receita encontrada.");

    const r = RECIPES[this.selRecipe];
    const out = ITEMS[r.output.id];
    const d = this.recDetail;
    d.textContent = "";
    el("div", { fontWeight: "bold", marginBottom: "4px" }, d, "2. MATERIAIS NECESSARIOS");
    const mats = el("div", { display: "flex", flexDirection: "column", gap: "3px", marginBottom: "10px" }, d);
    const lacks: string[] = [];
    const line = (name: string, have: number, need: number, note = ""): void => {
      const ok = have >= need;
      const row = el("div", { display: "flex", gap: "6px", padding: "5px 6px", borderRadius: "3px", background: ok ? C.okBg : "rgba(150,60,50,0.25)", border: `1px solid ${ok ? "#3d6a39" : "#7a3b34"}` }, mats);
      el("span", { color: ok ? C.ok : C.bad, fontWeight: "bold" }, row, ok ? "✔" : "✘");
      el("span", { flex: "1", fontSize: "11px" }, row, name + note);
      el("span", { color: ok ? C.ok : C.bad, fontSize: "11px" }, row, `${have}/${need}`);
      if (!ok) lacks.push(need - have > 0 && note === "" ? `${need - have}x ${name}` : name);
    };
    for (const i of r.inputs) line(itemName(i.id), inv.count(i.id), i.qty);
    if (r.station) line(itemName(r.station), inv.count(r.station), 1, " (precisa estar na mochila)");
    el("div", { fontWeight: "bold", marginBottom: "4px" }, d, "3. RESULTADO");
    const res = el("div", { padding: "6px", background: C.bg2, border: `1px solid ${C.line}`, borderRadius: "3px", marginBottom: "6px" }, d);
    el("div", { fontWeight: "bold" }, res, `${icon(out.id)} ${out.name}  x${r.output.qty}`);
    el("div", { fontSize: "10px", color: C.dim, margin: "2px 0" }, res, `Tempo de fabricacao: ${(r.craftMs / 1000).toFixed(1)}s`);
    el("div", { fontSize: "11px" }, res, describeItem(out));
    const can = lacks.length === 0;
    const b = actionButton("FABRICAR", () => this.onCraft(this.selRecipe), d);
    setEnabled(b, can);
    if (!can) el("div", { color: C.bad, fontSize: "10px", marginTop: "4px" }, d, `Nao da para fabricar. Falta: ${lacks.join(", ")}.`);
  }

  private refresh(id: string): void {
    if (id === "inventory") this.renderInventory();
    else if (id === "craft") this.renderCraft();
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
