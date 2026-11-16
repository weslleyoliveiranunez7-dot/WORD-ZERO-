import type { MedicalEffects, WeaponStats } from "./items";

// Etapa 6b: ferimentos e partes do corpo (cortes, perfuracoes, mordidas, fraturas, queimaduras, contusoes,
// sangramento, infeccao, dor e recuperacao). Logica pura, sem relogio e sem rede: o servidor chama `tick` com o
// tempo de jogo que passou e `hurt`/`treat` quando algo acontece. O cliente so MOSTRA o resultado (InjuryView).
// Valores provisorios: balancear depois de jogar. Tempos em segundos de jogo.

export const BODY_PARTS = ["head", "torso", "arms", "legs"] as const;
export type BodyPart = (typeof BODY_PARTS)[number];
export const INJURY_KINDS = ["cut", "puncture", "bite", "fracture", "burn", "bruise"] as const;
export type InjuryKind = (typeof INJURY_KINDS)[number];
export type DamageType = "blunt" | "pierce" | "slash" | "bite" | "burn";

export const PART_NAME: Record<BodyPart, string> = { head: "Cabeca", torso: "Tronco", arms: "Bracos", legs: "Pernas" };
export const KIND_NAME: Record<InjuryKind, string> = { cut: "Corte", puncture: "Perfuracao", bite: "Mordida", fracture: "Fratura", burn: "Queimadura", bruise: "Contusao" };
export const SEV_NAME = ["leve", "moderado", "grave"] as const;

export function isBodyPart(v: unknown): v is BodyPart {
  return typeof v === "string" && (BODY_PARTS as readonly string[]).includes(v);
}

type OpenKind = "cut" | "puncture" | "bite";
const isOpen = (k: InjuryKind): k is OpenKind => k === "cut" || k === "puncture" || k === "bite";
const canInfect = (k: InjuryKind): boolean => isOpen(k) || k === "burn";

export const INJURY = {
  maxInjuries: 10,
  // sangramento em vida/s por gravidade (1, 2, 3); multiplicado pela parte atingida
  bleed: { cut: [0.12, 0.3, 0.6], puncture: [0.15, 0.4, 0.8], bite: [0.2, 0.45, 0.9] } as Record<OpenKind, [number, number, number]>,
  partBleedMul: { head: 1.2, torso: 1.3, arms: 1, legs: 1 } as Record<BodyPart, number>,
  clotSec: 90, // corte leve sem curativo estanca sozinho depois disso
  // segundos SEM cobrir para a infeccao chegar a 100 (cobrir reduz a taxa para `coveredInfectionMul`)
  infectionSec: { cut: 1500, puncture: 1000, bite: 600, burn: 1200 } as Record<string, number>,
  coveredInfectionMul: 0.15,
  infectedDrainBase: 0.1, // vida/s por ferida infectada (+ 0.05 por nivel de gravidade)
  infectedDrainPerSev: 0.05,
  healSec: { bruise: 240, cut: 300, puncture: 480, bite: 600, burn: 420, fracture: 1200 } as Record<InjuryKind, number>,
  sevHealMul: [1, 1.5, 2],
  uncoveredHealMul: 0.3, // ferida aberta/queimadura sem curativo cicatriza devagar
  fractureFreeHealMul: 0.2, // fratura sem tala quase nao cura
  restHealMul: 1.5,
  hungryHealMul: 0.5, // fome ou sede baixas
  impact: { fracture: 40, burn: 25, bite: 25, puncture: 22, cut: 15, bruise: 10 } as Record<InjuryKind, number>, // quanto a ferida reduz a condicao da parte
  pain: { fracture: 22, burn: 14, bite: 9, puncture: 8, cut: 6, bruise: 4 } as Record<InjuryKind, number>, // por nivel de gravidade
  coveredPainMul: 0.6,
  painkillerMul: 0.3, // dor restante com analgesico ativo
  painSpeedLoss: 0.3, // dor 100 => -30% de velocidade
  legsMinSpeed: 0.45, // pernas com condicao 0
  minSpeedMul: 0.3,
  armsMinDamage: 0.5, // bracos com condicao 0: metade do dano
  armsMaxExtraCooldown: 0.6, // ... e +60% de recarga
  weights: { head: 0.1, torso: 0.4, arms: 0.25 }, // acumulado: ate 0.10 cabeca, 0.50 tronco, 0.75 bracos, resto pernas
} as const;

export interface Injury {
  id: number;
  kind: InjuryKind;
  part: BodyPart;
  sev: 1 | 2 | 3;
  bleed: number; // vida/s agora (0 = estancado)
  infection: number; // 0..100
  infected: boolean;
  care: 0 | 1 | 2; // 0 sem tratamento, 1 coberto (curativo/bandagem), 2 imobilizado (tala, so fratura)
  healLeft: number;
  healTotal: number;
  age: number;
}

// O que o cliente ve de cada ferida (servidor -> dono).
export interface InjuryView {
  id: number;
  kind: InjuryKind;
  part: BodyPart;
  sev: number;
  bleed: number;
  infection: number; // 0..100
  infected: boolean;
  care: number;
  heal: number; // 0..100 (% ja cicatrizado)
}

export interface InjurySave {
  list: Omit<Injury, "id">[];
  painLeft: number;
}

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const r1 = (v: number): number => Math.round(v * 10) / 10;

export function severityFor(amount: number): 1 | 2 | 3 {
  return amount < 10 ? 1 : amount < 22 ? 2 : 3;
}

export function pickPart(rng: () => number): BodyPart {
  const r = rng();
  const w = INJURY.weights;
  return r < w.head ? "head" : r < w.head + w.torso ? "torso" : r < w.head + w.torso + w.arms ? "arms" : "legs";
}

export interface InjuryRoll {
  kind: InjuryKind;
  part: BodyPart;
  sev: 1 | 2 | 3;
}

// Sorteia o ferimento de UM golpe (ou null = so levou o dano, sem ferida). Ordem dos sorteios: parte, chance, tipo.
// Cabeca sobe 1 nivel de gravidade. Nao muda o dano de vida do golpe: a ferida causa dano AO LONGO do tempo.
export function rollInjury(type: DamageType, amount: number, rng: () => number = Math.random, forcePart?: BodyPart): InjuryRoll | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const part = forcePart ?? pickPart(rng);
  let sev = severityFor(amount);
  if (part === "head" && sev < 3) sev = (sev + 1) as 1 | 2 | 3;
  const chance = type === "burn" ? 1 : sev === 1 ? 0.5 : sev === 2 ? 0.8 : 1;
  if (rng() >= chance) return null;
  const k = rng();
  let kind: InjuryKind;
  if (type === "bite") kind = k < 0.7 ? "bite" : "cut";
  else if (type === "slash") kind = "cut";
  else if (type === "pierce") kind = k < 0.9 ? "puncture" : "bruise";
  else if (type === "burn") kind = "burn";
  else {
    const fractureChance = (part === "arms" || part === "legs") && sev >= 2 ? (sev === 3 ? 0.5 : 0.3) : part === "torso" && sev === 3 ? 0.25 : 0;
    kind = k < fractureChance ? "fracture" : "bruise";
  }
  return { kind, part, sev };
}

// Prioridade de tratamento: sangrando primeiro, depois infectada, depois a mais grave.
const byPriority = (a: Injury, b: Injury): number => b.bleed - a.bleed || Number(b.infected) - Number(a.infected) || b.sev - a.sev || a.id - b.id;

export class InjurySim {
  list: Injury[] = [];
  painLeft = 0; // segundos de analgesico que faltam
  private nextId = 1;
  version = 0; // sobe a cada mudanca de estrutura (nova ferida, tratamento, cura)

  // ---- leitura ----
  get bleeding(): number {
    return this.list.reduce((n, i) => n + i.bleed, 0);
  }
  get infected(): boolean {
    return this.list.some((i) => i.infected);
  }
  // fome/sede nao entram: o servidor so bloqueia a regeneracao natural de vida por sangramento ou infeccao
  get regenBlocked(): boolean {
    return this.bleeding > 0 || this.infected;
  }
  get rawPain(): number {
    let p = 0;
    for (const i of this.list) p += INJURY.pain[i.kind] * i.sev * (i.care >= 1 ? INJURY.coveredPainMul : 1);
    return Math.min(100, p);
  }
  get pain(): number {
    return Math.round(this.rawPain * (this.painLeft > 0 ? INJURY.painkillerMul : 1));
  }

  // Condicao da parte: 100 = intacta. Cada ferida tira um pouco e devolve conforme cicatriza; tala/curativo aliviam.
  condition(part: BodyPart): number {
    let c = 100;
    for (const i of this.list) {
      if (i.part !== part) continue;
      const f = clamp(i.healLeft / i.healTotal, 0, 1);
      c -= INJURY.impact[i.kind] * (i.sev / 2) * (i.care === 2 ? 0.5 : i.care === 1 ? 0.8 : 1) * (0.3 + 0.7 * f);
    }
    return Math.round(clamp(c, 0, 100));
  }

  // Multiplicador de velocidade por ferimentos (pernas + dor). O servidor multiplica pelo da fome/energia.
  get speedMul(): number {
    const legs = INJURY.legsMinSpeed + (1 - INJURY.legsMinSpeed) * (this.condition("legs") / 100);
    const pain = 1 - (this.pain / 100) * INJURY.painSpeedLoss;
    return Math.max(INJURY.minSpeedMul, legs * pain);
  }

  // Bracos feridos e dor enfraquecem o golpe: menos dano e mais recarga. Sem ferida devolve a MESMA arma.
  adjustWeapon<T extends WeaponStats>(w: T): T {
    const arms = this.condition("arms") / 100;
    const pain = this.pain / 100;
    if (arms >= 1 && pain <= 0) return w;
    const dmgMul = INJURY.armsMinDamage + (1 - INJURY.armsMinDamage) * arms;
    const cdMul = 1 + (1 - arms) * INJURY.armsMaxExtraCooldown + pain * 0.3;
    return { ...w, damage: Math.max(1, r1(w.damage * dmgMul)), cooldownMs: Math.round(w.cooldownMs * cdMul) };
  }

  views(): InjuryView[] {
    return [...this.list].sort(byPriority).map((i) => ({
      id: i.id,
      kind: i.kind,
      part: i.part,
      sev: i.sev,
      bleed: Math.round(i.bleed * 100) / 100,
      infection: Math.round(i.infection),
      infected: i.infected,
      care: i.care,
      heal: Math.round((1 - clamp(i.healLeft / i.healTotal, 0, 1)) * 100),
    }));
  }
  bodyView(): number[] {
    return BODY_PARTS.map((p) => this.condition(p));
  }

  // ---- escrita ----
  // Cria (ou agrava) uma ferida. Mesma parte e mesmo tipo sem tratamento: sobe a gravidade em vez de empilhar.
  add(kind: InjuryKind, part: BodyPart, sev: 1 | 2 | 3): Injury {
    const bleed = isOpen(kind) ? INJURY.bleed[kind][sev - 1] * INJURY.partBleedMul[part] : 0;
    const healTotal = INJURY.healSec[kind] * INJURY.sevHealMul[sev - 1];
    const same = this.list.find((i) => i.kind === kind && i.part === part && i.care === 0);
    const target = same ?? (this.list.length >= INJURY.maxInjuries ? [...this.list].sort((a, b) => b.sev - a.sev)[0] : undefined);
    this.version++;
    if (target) {
      target.sev = Math.min(3, Math.max(target.sev, sev) + (sev >= target.sev ? 1 : 0)) as 1 | 2 | 3;
      target.bleed = Math.max(target.bleed, isOpen(target.kind) ? INJURY.bleed[target.kind as OpenKind][target.sev - 1] * INJURY.partBleedMul[target.part] : 0);
      target.healTotal = INJURY.healSec[target.kind] * INJURY.sevHealMul[target.sev - 1];
      target.healLeft = Math.max(target.healLeft, target.healTotal);
      return target;
    }
    const inj: Injury = { id: this.nextId++, kind, part, sev, bleed, infection: 0, infected: false, care: 0, healLeft: healTotal, healTotal, age: 0 };
    this.list.push(inj);
    return inj;
  }

  hurt(type: DamageType, amount: number, rng: () => number = Math.random, forcePart?: BodyPart): Injury | null {
    const r = rollInjury(type, amount, rng, forcePart);
    return r ? this.add(r.kind, r.part, r.sev) : null;
  }

  // Usa um item medico. `part` opcional: so trata feridas dessa parte. Devolve false se NAO mudaria nada (item nao e gasto).
  treat(med: MedicalEffects, part?: BodyPart): boolean {
    let changed = false;
    if (med.painkillerSec && this.rawPain > 0 && this.painLeft < med.painkillerSec * 0.5) {
      this.painLeft = med.painkillerSec;
      changed = true;
    }
    const targets = this.list.filter((i) => !part || i.part === part).sort(byPriority);
    if (med.antibiotic || med.disinfect) {
      for (const i of targets) {
        if (med.antibiotic && i.infected) {
          i.infected = false;
          i.infection = 0;
          changed = true;
        } else if (med.disinfect && canInfect(i.kind) && !i.infected && i.infection > 0) {
          i.infection = 0;
          changed = true;
        }
      }
    }
    if (med.bleed || med.dress || med.splint) {
      const limit = med.all ? Infinity : 1;
      let n = 0;
      for (const i of targets) {
        if (n >= limit) break;
        if (this.treatWound(i, med)) n++;
      }
      changed = changed || n > 0;
    }
    if (changed) this.version++;
    return changed;
  }

  private treatWound(i: Injury, med: MedicalEffects): boolean {
    let changed = false;
    if (med.bleed && isOpen(i.kind) && i.bleed > 0) {
      if (med.bleed === "all") {
        i.bleed = 0;
        changed = true;
      } else if (i.care === 0) {
        i.bleed = i.sev === 1 ? 0 : i.bleed * (i.sev === 2 ? 0.5 : 0.7);
        changed = true;
      }
    }
    if (med.dress && i.care === 0 && canInfect(i.kind)) {
      i.care = 1;
      changed = true;
    }
    if (med.splint && i.kind === "fracture" && i.care < 2) {
      i.care = 2;
      changed = true;
    }
    return changed;
  }

  // Avanca `dtSeconds`. Devolve o DANO DE VIDA do periodo (sangramento + infeccao): quem chama aplica em SurvivalSim.damage.
  tick(dtSeconds: number, moving: boolean, fed: boolean): number {
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0 || (this.list.length === 0 && this.painLeft <= 0)) return 0;
    const dt = Math.min(dtSeconds, 60);
    this.painLeft = Math.max(0, this.painLeft - dt);
    let dmg = 0;
    let structural = false;
    for (const i of this.list) {
      i.age += dt;
      if (i.bleed > 0) {
        dmg += i.bleed * dt;
        if (i.care === 0 && i.sev === 1 && i.age >= INJURY.clotSec) {
          i.bleed = 0;
          structural = true;
        }
      }
      if (canInfect(i.kind) && !i.infected) {
        i.infection += (100 / INJURY.infectionSec[i.kind]) * (i.care >= 1 ? INJURY.coveredInfectionMul : 1) * dt;
        if (i.infection >= 100) {
          i.infection = 100;
          i.infected = true;
          structural = true;
        }
      }
      if (i.infected) dmg += (INJURY.infectedDrainBase + INJURY.infectedDrainPerSev * i.sev) * dt;
      else {
        const base = i.kind === "fracture" ? (i.care === 2 ? 1 : INJURY.fractureFreeHealMul) : i.kind === "bruise" ? 1 : i.care >= 1 ? 1 : INJURY.uncoveredHealMul;
        i.healLeft -= dt * base * (moving ? 1 : INJURY.restHealMul) * (fed ? 1 : INJURY.hungryHealMul);
      }
    }
    const before = this.list.length;
    this.list = this.list.filter((i) => i.healLeft > 0);
    if (structural || this.list.length !== before) this.version++;
    return dmg;
  }

  // ---- salvar / restaurar (o dado salvo tambem nao e confiavel) ----
  snapshot(): InjurySave {
    return { list: this.list.map(({ id: _id, ...rest }) => ({ ...rest })), painLeft: Math.round(this.painLeft) };
  }

  static restore(raw: unknown): InjurySim {
    const sim = new InjurySim();
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return sim;
    const r = raw as Record<string, unknown>;
    const n = (v: unknown, a: number, b: number): number | null => (typeof v === "number" && Number.isFinite(v) && v >= a && v <= b ? v : null);
    if (Array.isArray(r.list) && r.list.length <= INJURY.maxInjuries) {
      for (const e of r.list) {
        if (typeof e !== "object" || e === null) return new InjurySim();
        const o = e as Record<string, unknown>;
        const sev = n(o.sev, 1, 3);
        const care = n(o.care, 0, 2);
        const bleed = n(o.bleed, 0, 5);
        const infection = n(o.infection, 0, 100);
        const healLeft = n(o.healLeft, 0.01, 100_000);
        const healTotal = n(o.healTotal, 1, 100_000);
        const age = n(o.age, 0, 10_000_000);
        if (!INJURY_KINDS.includes(o.kind as InjuryKind) || !isBodyPart(o.part) || typeof o.infected !== "boolean") return new InjurySim();
        if ([sev, care, bleed, infection, healLeft, healTotal, age].some((v) => v === null) || !Number.isInteger(sev) || !Number.isInteger(care)) return new InjurySim();
        sim.list.push({ id: sim.nextId++, kind: o.kind as InjuryKind, part: o.part, sev: sev as 1 | 2 | 3, bleed: bleed!, infection: infection!, infected: o.infected, care: care as 0 | 1 | 2, healLeft: healLeft!, healTotal: healTotal!, age: age! });
      }
    }
    sim.painLeft = n(r.painLeft, 0, 100_000) ?? 0;
    sim.version++;
    return sim;
  }
}
