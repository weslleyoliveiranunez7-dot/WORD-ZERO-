// Modo deitado (paisagem): trava a orientacao quando o aparelho deixa, mostra um aviso para girar o celular
// quando esta em pe e reorganiza os botoes para a tela baixa e larga. So interface: nada aqui afeta regra de jogo.

const CSS = `
@media (orientation: landscape) and (max-height: 700px) {
  [data-ui="grid"] { right: auto !important; left: 50% !important; transform: translateX(-50%) !important; grid-template-columns: repeat(6, 46px) !important; bottom: 8px !important; }
  [data-ui="attack"] { right: 16px !important; bottom: 16px !important; }
  [data-ui="collect"] { right: 16px !important; bottom: 100px !important; }
  [data-ui="torch"] { right: 108px !important; bottom: 84px !important; }
  [data-ui="usebtn"] { right: 108px !important; bottom: 16px !important; }
  [data-ui="craftbtn"] { top: 150px !important; left: 8px !important; }
  [data-ui="buildbtn"] { top: 150px !important; left: 108px !important; }
  [data-ui="craftpanel"] { top: 34px !important; left: 170px !important; max-height: calc(100% - 150px) !important; }
  [data-ui="buildpanel"] { top: 34px !important; left: 410px !important; }
  [data-ui="chest"] { top: 16px !important; max-height: calc(100% - 130px) !important; overflow-y: auto !important; }
  [data-ui="toast"] { top: 8px !important; }
  [data-ui="joy"] { width: 45% !important; height: 80% !important; }
}
#wz-rotate { position: fixed; inset: 0; z-index: 99999; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 18px; background: #0b0f0c; color: #d8e6d0; font: bold 18px sans-serif; text-align: center; padding: 24px; }
#wz-rotate .phone { width: 44px; height: 76px; border: 4px solid #d8e6d0; border-radius: 8px; animation: wz-turn 2s ease-in-out infinite; }
@keyframes wz-turn { 0%, 30% { transform: rotate(0deg); } 70%, 100% { transform: rotate(-90deg); } }
@media (orientation: portrait) and (pointer: coarse) { #wz-rotate { display: flex; } }
`;

export function setupLandscape(): void {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  const rotate = document.createElement("div");
  rotate.id = "wz-rotate";
  rotate.innerHTML = '<div class="phone"></div><div>Gire o celular para jogar deitado</div>';
  document.body.appendChild(rotate);

  // Travar a orientacao exige tela cheia e um toque do jogador; nem todo navegador deixa (iPhone nao deixa: ai vale o aviso acima).
  if (!window.matchMedia("(pointer: coarse)").matches) return;
  const lockOnce = (): void => {
    window.removeEventListener("pointerdown", lockOnce);
    const root = document.documentElement;
    const go = (): void => {
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      void o?.lock?.("landscape")?.catch(() => {});
    };
    if (root.requestFullscreen) void root.requestFullscreen({ navigationUI: "hide" }).then(go, go);
    else go();
  };
  window.addEventListener("pointerdown", lockOnce);
}
