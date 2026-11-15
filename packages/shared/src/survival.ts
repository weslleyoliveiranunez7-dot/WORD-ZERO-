import type { VitalEffects } from "./items";

// Etapa 6: vida, fome, sede e energia (Documento Mestre 4.1 a 4.3). Logica pura, sem relogio e sem rede:
// o servidor chama `tick` com o tempo que passou; o cliente so mostra o resultado.
// Todos os medidores: 0 a 100 (100 = cheio). Valores abaixo sao o ponto de partida; ajustar apos teste.

export const MAX_VITAL = 100;

export const SURVIVAL = {
  hungerDecayPerSec: 100 / 1800, // de 100 a 0 em ~30 min de jogo
  thirstDecayPerSec: 100 / 1200, // ~20 min
  energyDrainMovingPerSec: 100 / 600, // ~10 min andando sem parar
  energyRegenIdlePerSec: 100 / 180, // ~3 min parado para encher
  lowThreshold: 20, // abaixo disso: aviso e penalidades graduais
  regenMinHungerThirst: 50, // so recupera vida com fome e sede acima disso
  regenHealthPerSec: 0.5,
  starveGraceSec: 30, // tolerancia: so causa dano apos tanto tempo com um medidor zerado
  starveDamagePerSec: 1, // por medidor zerado, depois da tolerancia
  minSpeedMul: 0.6, // velocidade com energia zero (cai aos poucos abaixo de lowThreshold)
} as const;

export interface Vitals {
  health: number;
  hunger: number;
  thirst: number;
  energy: number;
}

export const START_VITALS: Vitals = { health: 100, hunger: 80, thirst: 80, energy: 100 };

const clamp = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(MAX_VITAL, v)) : 0);

export class SurvivalSim {
  health: number;
  hunger: number;
  thirst: number;
  energy: number;
  private starveTimer = 0; // segundos seguidos com fome ou sede zerada

  constructor(init: Vitals = START_VITALS) {
    this.health = clamp(init.health);
    this.hunger = clamp(init.hunger);
    this.thirst = clamp(init.thirst);
    this.energy = clamp(init.energy);
  }

  get dead(): boolean {
    return this.health <= 0;
  }

  // Multiplicador de velocidade (0.6 a 1) por falta de energia: penalidade gradual, nunca imobiliza.
  get speedMul(): number {
    const low = SURVIVAL.lowThreshold;
    if (this.energy >= low) return 1;
    return SURVIVAL.minSpeedMul + (1 - SURVIVAL.minSpeedMul) * (this.energy / low);
  }

  // Avanca `dtSeconds` de tempo de jogo. `moving` = o jogador realmente se deslocou.
  tick(dtSeconds: number, moving: boolean): void {
    if (this.dead || !Number.isFinite(dtSeconds) || dtSeconds <= 0) return;
    const dt = Math.min(dtSeconds, 60);
    const S = SURVIVAL;

    this.hunger = clamp(this.hunger - S.hungerDecayPerSec * dt);
    this.thirst = clamp(this.thirst - S.thirstDecayPerSec * dt);

    if (moving) {
      this.energy = clamp(this.energy - S.energyDrainMovingPerSec * dt);
    } else {
      // com fome/sede critica a energia volta mais devagar ("reduzir recuperacao")
      const critical = this.hunger < S.lowThreshold || this.thirst < S.lowThreshold;
      this.energy = clamp(this.energy + S.energyRegenIdlePerSec * (critical ? 0.5 : 1) * dt);
    }

    const empty = (this.hunger <= 0 ? 1 : 0) + (this.thirst <= 0 ? 1 : 0);
    if (empty > 0) {
      this.starveTimer += dt;
      if (this.starveTimer > S.starveGraceSec) this.health = clamp(this.health - S.starveDamagePerSec * empty * dt);
    } else {
      this.starveTimer = 0;
      if (this.hunger >= S.regenMinHungerThirst && this.thirst >= S.regenMinHungerThirst) {
        this.health = clamp(this.health + S.regenHealthPerSec * dt);
      }
    }
  }

  // Aplica o efeito de um item. Devolve false se NAO mudaria nada (nao gasta o item).
  apply(effects: VitalEffects): boolean {
    const before = [this.health, this.hunger, this.thirst, this.energy];
    this.health = clamp(this.health + (effects.health ?? 0));
    this.hunger = clamp(this.hunger + (effects.hunger ?? 0));
    this.thirst = clamp(this.thirst + (effects.thirst ?? 0));
    this.energy = clamp(this.energy + (effects.energy ?? 0));
    const after = [this.health, this.hunger, this.thirst, this.energy];
    if (effects.hunger || effects.thirst) {
      if (this.hunger > 0 && this.thirst > 0) this.starveTimer = 0;
    }
    return before.some((v, i) => v !== after[i]);
  }

  // Dano vindo de fora (zumbis, PvP, ambiente: Etapas 8 e 9).
  damage(amount: number): void {
    if (Number.isFinite(amount) && amount > 0) this.health = clamp(this.health - amount);
  }
}
