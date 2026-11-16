import { uiRoot } from "./landscape";
import { C } from "./theme";

// Texto de depuracao no canto da tela (DOM, fora do canvas, nao sofre zoom da camera). Pequeno e discreto.
export class Hud {
  private el: HTMLDivElement;

  constructor() {
    this.el = document.createElement("div");
    Object.assign(this.el.style, {
      position: "fixed",
      top: "6px",
      left: "8px",
      maxWidth: "calc(100% - 150px)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      color: C.dim,
      font: "10px monospace",
      background: "rgba(0,0,0,0.4)",
      padding: "2px 6px",
      borderRadius: "3px",
      pointerEvents: "none",
      zIndex: "20",
    });
    uiRoot().appendChild(this.el);
  }

  setText(text: string): void {
    this.el.textContent = text;
  }

  destroy(): void {
    this.el.remove();
  }
}

// Relogio digital antigo (canto superior direito, acima do minimapa). Mostra a hora do MUNDO do jogo.
export class Clock {
  private el: HTMLDivElement;
  private last = "";

  constructor() {
    this.el = document.createElement("div");
    this.el.dataset.ui = "clock";
    this.el.title = "Horario do mundo do jogo";
    Object.assign(this.el.style, {
      position: "fixed",
      top: "8px",
      right: "8px",
      boxSizing: "border-box",
      minWidth: "84px",
      textAlign: "center",
      color: "#8fd18a",
      font: "bold 16px monospace",
      letterSpacing: "2px",
      background: "#0a0d0a",
      border: `1px solid ${C.line}`,
      borderRadius: "3px",
      padding: "3px 8px 2px",
      pointerEvents: "none",
      zIndex: "20",
      whiteSpace: "nowrap",
    });
    uiRoot().appendChild(this.el);
  }

  // `width`: mesma largura do minimapa, para os dois ficarem alinhados.
  setWidth(px: number): void {
    this.el.style.width = `${px}px`;
  }

  set(clock: string, period: string, day: boolean): void {
    const k = `${clock}|${period}|${day}`;
    if (k === this.last) return;
    this.last = k;
    this.el.innerHTML = "";
    this.el.append(document.createTextNode(clock));
    const sub = document.createElement("div");
    Object.assign(sub.style, { font: "10px monospace", letterSpacing: "0", color: C.dim });
    sub.textContent = `${day ? "\u2600" : "\u263E"} ${period}`;
    this.el.appendChild(sub);
  }

  destroy(): void {
    this.el.remove();
  }
}
