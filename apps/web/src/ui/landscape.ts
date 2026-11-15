// Area de jogo e interface para celular. So interface: nada aqui afeta regra de jogo.
// - Deitado: a area de jogo ocupa a tela toda (medida em pixels reais, nao em %, para nao depender da barra do navegador).
// - Em pe (toque): a area de jogo fica com proporcao deitada (4:3), centralizada, e o resto da tela fica escuro.
// - Tela muito baixa/estreita: a interface (#ui) e reduzida por escala em vez de estourar a tela. O canvas nao e escalado.

const MIN_W = 600; // tamanho logico minimo da interface
const MIN_H = 320;
const PORTRAIT_RATIO = 3 / 4; // altura / largura da area de jogo quando o celular esta em pe

const CSS = `
#ui.wz-compact [data-ui="grid"] { right: 204px !important; left: auto !important; bottom: 8px !important; grid-template-columns: repeat(6, 38px) !important; gap: 3px !important; }
#ui.wz-compact [data-ui="grid"] > div { width: 38px !important; height: 38px !important; font-size: 18px !important; }
#ui.wz-compact [data-ui="attack"] { right: 16px !important; bottom: 16px !important; }
#ui.wz-compact [data-ui="collect"] { right: 16px !important; bottom: 100px !important; }
#ui.wz-compact [data-ui="torch"] { right: 108px !important; bottom: 84px !important; }
#ui.wz-compact [data-ui="usebtn"] { right: 108px !important; bottom: 16px !important; }
#ui.wz-compact [data-ui="craftbtn"] { top: 150px !important; left: 8px !important; }
#ui.wz-compact [data-ui="buildbtn"] { top: 150px !important; left: 108px !important; }
#ui.wz-compact [data-ui="craftpanel"] { top: 34px !important; left: 170px !important; max-height: calc(100% - 150px) !important; }
#ui.wz-compact [data-ui="buildpanel"] { top: 34px !important; left: 410px !important; width: 180px !important; max-height: calc(100% - 120px) !important; overflow-y: auto !important; }
#ui.wz-compact [data-ui="chest"] { top: 16px !important; max-height: calc(100% - 130px) !important; overflow-y: auto !important; }
#ui.wz-compact [data-ui="toast"] { top: 34px !important; }
#ui.wz-compact [data-ui="joy"] { width: 45% !important; height: 80% !important; }
#ui > button, #ui > [data-ui="joy"] { pointer-events: auto; }
`;

// Onde os componentes de interface se penduram (cai no body se a pagina nao tiver #ui).
export function uiRoot(): HTMLElement {
  return document.getElementById("ui") ?? document.body;
}

// Escala atual da interface (1 = tamanho real). Usada para converter coordenadas de toque.
export function uiScale(): number {
  const ui = document.getElementById("ui");
  if (!ui || ui.offsetWidth === 0) return 1;
  return ui.getBoundingClientRect().width / ui.offsetWidth || 1;
}

export function setupLandscape(onResize: (width: number, height: number) => void = () => {}): void {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  const layout = (): void => {
    const stage = document.getElementById("stage");
    const ui = document.getElementById("ui");
    if (!stage || !ui) return;
    const vv = window.visualViewport;
    const vw = Math.max(1, Math.round(vv ? Math.min(window.innerWidth, vv.width) : window.innerWidth));
    const vh = Math.max(1, Math.round(vv ? Math.min(window.innerHeight, vv.height) : window.innerHeight));
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const letterbox = coarse && vh > vw; // celular em pe: area deitada no meio da tela
    const sw = vw;
    const sh = letterbox ? Math.min(vh, Math.round(vw * PORTRAIT_RATIO)) : vh;
    const s = Math.min(1, sw / MIN_W, sh / MIN_H);
    const lw = sw / s;
    const lh = sh / s;
    Object.assign(stage.style, {
      left: "0px",
      top: `${Math.round((vh - sh) / 2)}px`,
      width: `${sw}px`,
      height: `${sh}px`,
    });
    Object.assign(ui.style, { width: `${lw}px`, height: `${lh}px`, transform: `scale(${s})` });
    ui.classList.toggle("wz-compact", lw > lh && lh <= 700);
    onResize(sw, sh);
  };

  layout();
  const again = (): void => {
    layout();
    // a barra do navegador e a rotacao terminam de assentar depois do evento
    window.setTimeout(layout, 120);
    window.setTimeout(layout, 500);
  };
  window.addEventListener("resize", layout);
  window.addEventListener("orientationchange", again);
  window.visualViewport?.addEventListener("resize", layout);
  document.addEventListener("fullscreenchange", again);
  window.setTimeout(layout, 120);

  // Tela cheia no primeiro toque quando esta deitado (esconde a barra do navegador, que come muito espaco). Nao trava a rotacao:
  // quem quiser jogar em pe pode.
  if (!window.matchMedia("(pointer: coarse)").matches) return;
  const once = (): void => {
    window.removeEventListener("pointerdown", once);
    if (window.innerWidth > window.innerHeight && document.documentElement.requestFullscreen) {
      void document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    }
  };
  window.addEventListener("pointerdown", once);
}
