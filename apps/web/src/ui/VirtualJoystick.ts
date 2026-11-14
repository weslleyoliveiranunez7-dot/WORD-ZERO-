// Joystick virtual flutuante (DOM + Pointer Events).
// Aparece onde o dedo toca, na metade esquerda de baixo da tela.
// vector.x / vector.y vao de -1 a 1.

const BASE_SIZE = 112;
const THUMB_SIZE = 52;
const MAX_DISTANCE = 52;
const DEAD_ZONE = 0.15;

export class VirtualJoystick {
  readonly vector = { x: 0, y: 0 };

  private zone: HTMLDivElement;
  private base: HTMLDivElement;
  private thumb: HTMLDivElement;
  private activeId: number | null = null;
  private origin = { x: 0, y: 0 };

  constructor() {
    this.zone = document.createElement("div");
    Object.assign(this.zone.style, {
      position: "fixed",
      left: "0",
      bottom: "0",
      width: "55%",
      height: "65%",
      zIndex: "10",
      touchAction: "none",
      userSelect: "none",
      webkitUserSelect: "none",
    });

    this.base = document.createElement("div");
    Object.assign(this.base.style, {
      position: "fixed",
      width: `${BASE_SIZE}px`,
      height: `${BASE_SIZE}px`,
      borderRadius: "50%",
      border: "2px solid rgba(255,255,255,0.45)",
      background: "rgba(255,255,255,0.10)",
      display: "none",
      pointerEvents: "none",
    });

    this.thumb = document.createElement("div");
    Object.assign(this.thumb.style, {
      position: "absolute",
      width: `${THUMB_SIZE}px`,
      height: `${THUMB_SIZE}px`,
      borderRadius: "50%",
      background: "rgba(255,255,255,0.55)",
      left: `${(BASE_SIZE - THUMB_SIZE) / 2 - 2}px`,
      top: `${(BASE_SIZE - THUMB_SIZE) / 2 - 2}px`,
    });
    this.base.appendChild(this.thumb);

    document.body.appendChild(this.zone);
    document.body.appendChild(this.base);

    this.zone.addEventListener("pointerdown", this.onDown);
    this.zone.addEventListener("pointermove", this.onMove);
    this.zone.addEventListener("pointerup", this.onUp);
    this.zone.addEventListener("pointercancel", this.onUp);
    this.zone.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private onDown = (e: PointerEvent): void => {
    if (this.activeId !== null) return;
    this.activeId = e.pointerId;
    this.zone.setPointerCapture(e.pointerId);
    this.origin = { x: e.clientX, y: e.clientY };
    this.base.style.left = `${e.clientX - BASE_SIZE / 2}px`;
    this.base.style.top = `${e.clientY - BASE_SIZE / 2}px`;
    this.base.style.display = "block";
    this.update(e);
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId === this.activeId) this.update(e);
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.activeId) return;
    this.activeId = null;
    this.vector.x = 0;
    this.vector.y = 0;
    this.base.style.display = "none";
  };

  private update(e: PointerEvent): void {
    const dx = e.clientX - this.origin.x;
    const dy = e.clientY - this.origin.y;
    const dist = Math.hypot(dx, dy);
    const k = dist > MAX_DISTANCE ? MAX_DISTANCE / dist : 1;
    const ox = dx * k;
    const oy = dy * k;
    this.thumb.style.transform = `translate(${ox}px, ${oy}px)`;

    const vx = ox / MAX_DISTANCE;
    const vy = oy / MAX_DISTANCE;
    if (Math.hypot(vx, vy) < DEAD_ZONE) {
      this.vector.x = 0;
      this.vector.y = 0;
    } else {
      this.vector.x = vx;
      this.vector.y = vy;
    }
  }

  destroy(): void {
    this.zone.remove();
    this.base.remove();
    this.vector.x = 0;
    this.vector.y = 0;
  }
}

export function isTouchDevice(): boolean {
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    navigator.maxTouchPoints > 0 ||
    location.search.includes("joystick=1")
  );
}
