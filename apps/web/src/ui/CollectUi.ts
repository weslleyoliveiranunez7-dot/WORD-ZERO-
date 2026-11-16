import { DROP_TTL_MS, HARVEST_TOOL, NODE_RESPAWN_MS, TOOL_YIELD, type ItemId, type Slot } from "@worldzero/shared";
import type { Services } from "./Services";
import { C, actionButton, el, icon, itemName, setEnabled } from "./theme";

// Painel de COLETA (dentro da Central de Servicos). O sistema de coleta e o que ja existia (botao COLETAR -> servidor).
// Aqui so se ORGANIZA a informacao: o que ha por perto, que ferramenta ajuda e o que o jogador pode fazer.

export interface NearbyNode {
  item: ItemId;
  max: number; // unidades de um recurso novo (NodeDef.max)
  depleted: boolean; // o servidor avisou que esta esgotado
}

const SOURCE: Partial<Record<ItemId, string>> = { wood: "Arvores", stone: "Rochas das ruinas", scrap: "Sucata das ruinas" };

export class CollectUi {
  onCollect: () => void = () => {};
  private inv: Slot[] = [];
  private near: NearbyNode | null = null;
  private key = "";
  private dirty = true;
  private body: HTMLElement;

  constructor(private sv: Services) {
    this.body = sv.body("collect");
    sv.onOpen((id) => {
      if (id === "collect" && this.dirty) this.render();
    });
  }

  setInventory(slots: Slot[]): void {
    this.inv = slots;
    this.update();
  }

  setNearby(n: NearbyNode | null): void {
    this.near = n;
    this.update();
  }

  private has(id: ItemId): boolean {
    return this.inv.some((s) => s?.id === id);
  }

  private update(): void {
    const k = `${this.near?.item}|${this.near?.depleted}|${this.inv.map((s) => s?.id ?? "").filter((i) => i === "axe" || i === "pickaxe").join(",")}`;
    if (k === this.key) return; // so redesenha se algo que aparece aqui mudou
    this.key = k;
    this.dirty = true;
    if (this.sv.isOpen("collect")) this.render();
  }

  private render(): void {
    this.dirty = false;
    const b = this.body;
    b.textContent = "";
    el("div", { fontWeight: "bold", marginBottom: "4px" }, b, "RECURSO POR PERTO");
    const box = el("div", { padding: "8px", background: C.bg2, border: `1px solid ${C.line}`, borderRadius: "3px", marginBottom: "6px" }, b);
    const n = this.near;
    if (!n) {
      el("div", { color: C.dim, fontSize: "11px" }, box, "Nenhum recurso ao alcance. Chegue bem perto de uma arvore ou de uma rocha das ruinas.");
    } else {
      const tool = HARVEST_TOOL[n.item];
      const withTool = !!tool && this.has(tool);
      const yieldQty = withTool ? TOOL_YIELD : 1;
      el("div", { fontWeight: "bold", fontSize: "13px" }, box, `${icon(n.item)} ${itemName(n.item)}`);
      el("div", { fontSize: "11px", margin: "3px 0", color: C.dim }, box, `Fonte: ${SOURCE[n.item] ?? "recurso"} | recurso novo tem ate ${n.max} unidades`);
      el("div", { fontSize: "11px" }, box, `Rende ${yieldQty} por coleta${tool ? (withTool ? ` (voce tem ${itemName(tool)})` : ` (com ${itemName(tool)} rende ${TOOL_YIELD})`) : ""}.`);
      el("div", { fontSize: "11px", marginTop: "3px", color: n.depleted ? C.bad : C.ok }, box, n.depleted ? `Esgotado. Volta ao normal em ~${Math.round(NODE_RESPAWN_MS / 1000)}s sem ser tocado.` : "Disponivel para coletar.");
    }
    const btn = actionButton("COLETAR", this.onCollect, b);
    const can = !!n && !n.depleted;
    setEnabled(btn, can || !n); // sem recurso, o botao tambem recolhe mochilas que estejam no chao (o servidor decide)
    el("div", { fontSize: "10px", color: C.dim, margin: "4px 0 10px" }, b, `Tambem recolhe mochilas deixadas ao morrer (ficam ${Math.round(DROP_TTL_MS / 60000)} min no chao).`);

    el("div", { fontWeight: "bold", marginBottom: "4px" }, b, "RECURSOS E FERRAMENTAS");
    for (const item of Object.keys(HARVEST_TOOL) as ItemId[]) {
      const tool = HARVEST_TOOL[item]!;
      const ok = this.has(tool);
      const row = el("div", { display: "flex", gap: "6px", padding: "5px 6px", marginBottom: "3px", background: C.bg2, border: `1px solid ${C.line}`, borderRadius: "3px" }, b);
      el("span", { flex: "1", fontSize: "11px" }, row, `${icon(item)} ${itemName(item)} <- ${SOURCE[item] ?? "mundo"}`);
      el("span", { fontSize: "11px", color: ok ? C.ok : C.dim }, row, `${ok ? "✔" : "✘"} ${itemName(tool)} (x${TOOL_YIELD})`);
    }
    el("div", { fontSize: "10px", color: C.dim, marginTop: "6px" }, b, "Sem a ferramenta voce coleta 1 por vez. As ferramentas sao fabricadas no painel de Fabricacao.");
  }
}
