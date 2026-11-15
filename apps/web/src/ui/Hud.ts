import { uiRoot } from "./landscape";

// Texto de depuracao no canto da tela (DOM, fora do canvas, nao sofre zoom da camera).
export class Hud {
  private el: HTMLDivElement;

  constructor() {
    this.el = document.createElement("div");
    Object.assign(this.el.style, {
      position: "fixed",
      top: "8px",
      left: "8px",
      color: "#d8e6d0",
      font: "12px monospace",
      background: "rgba(0,0,0,0.45)",
      padding: "4px 8px",
      borderRadius: "4px",
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
