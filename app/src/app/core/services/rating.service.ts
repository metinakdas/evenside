import { Injectable } from '@angular/core';
import { PlayerInput, PlayerPosition, PlayerRatings, PlayerTier } from '../models/player.model';
import { PlayerSkills, effectiveSkills } from '../constants/player-skills';

/**
 * KART PUANLAMA — 2. sürüm (9 Ekim 2026). Ayrıntılı gerekçe: proje notları.
 *
 * Her yüz puanı alt özelliklerin (0-10) AĞIRLIKLI ortalamasıdır; ağırlıklar EA FC'nin yüz
 * puanı hesabından halı sahaya uyarlandı. Alt özellik 0 → 9, 10 → 99 puana çevrilir
 * (`SKILL_SCALE`), sonra vücut, yaş, sigara ve ayak düzeltmeleri eklenir, 1-99'a kırpılır.
 * Mevki: dört mevki bileşkesinden en yükseği; reyting o bileşkedir.
 *
 * Eski (alt özelliği olmayan) kartlar `effectiveSkills` ile eski altı alandan tahmin edilip
 * aynı formülden geçer — veri kaybı yok, tek hesap yolu var.
 */
export const RATING_WEIGHTS = {
  /** Alt özellik → puan: base + değer × per (0 → 9, 10 → 99). */
  skillScale: { base: 9, per: 9 },
  face: {
    // EA: %45 ivme + %55 sprint. Küçük sahada ivme daha belirleyici (kısa mesafe, sık patlama).
    pace: { ivme: 0.55, sprint: 0.45 },
    // EA: bitiricilik .45, şut gücü .20, uzaktan .20 (+ voleybol/penaltı/frikik .15 → dağıtıldı).
    shooting: { bitiricilik: 0.5, sutGucu: 0.25, uzaktanSut: 0.25 },
    // EA: kısa .35, vizyon .20, orta .20, uzun .15, falso/frikik .10 → halı sahada kısa pas ağır.
    passing: { kisaPas: 0.45, vizyon: 0.25, uzunPas: 0.2, topKontrol: 0.1 },
    // EA: dripling .50, top kontrolü .35, çeviklik .10, denge .05.
    dribbling: { dripling: 0.5, topKontrol: 0.35, ceviklik: 0.15 },
    // EA: ayakta müdahale .30 + kayarak .10, savunma bilinci .30, araya girme .20, kafa .10.
    defending: { topKapma: 0.35, markaj: 0.3, arayaGirme: 0.2, kafa: 0.05, mucadele: 0.1 },
    // EA: kuvvet .50, dayanıklılık .25, agresiflik .20, sıçrama .05. Halı sahada dayanıklılık ağır.
    physical: { kuvvet: 0.35, dayaniklilik: 0.4, mucadele: 0.2, kafa: 0.05 },
    goalkeeping: { refleks: 0.6, kaleHakimiyeti: 0.4 },
  },
  shapePenalty: {
    obeseBmi: 28,
    overweightBmi: 25,
    underweightBmi: 18,
    obesePenalty: -7,
    overweightPenalty: -3,
    underweightPenalty: -2,
  },
  /** Sigara: en çok dayanıklılığa (FİZ), biraz da HIZ'a. */
  smoke: { pace: -3, physical: -6 },
  /** Yaş: 32'den sonra HIZ yılda 1.2, 35'ten sonra FİZ yılda 0.6 düşer (tavan −12 / −8). */
  age: { paceFrom: 32, pacePerYear: 1.2, paceMax: 12, physicalFrom: 35, physicalPerYear: 0.6, physicalMax: 8 },
  /** İki ayağını kullanan oyuncu ŞUT ve PAS'ta +3. */
  bothFeetBonus: 3,
  /** Maç başı gol (gerçek sonuç) ŞUT'a eklenir, tavan +10. */
  goalsPerMatch: { per: 4.2, max: 10 },
  /** Boy: referansın üstü kalecilik ve fizikte az bir artı. */
  referenceHeightCm: 170,
  heightFactor: { goalkeeping: 0.35, physical: 0.12 },
  /** Mevki bileşkeleri — en yükseği mevki ve genel reyting olur. */
  position: {
    // Halı sahada kaleci ayakla da oynuyor: PAS payı var.
    KAL: { goalkeeping: 0.75, physical: 0.08, passing: 0.1, defending: 0.07 },
    DEF: { defending: 0.45, physical: 0.2, pace: 0.15, passing: 0.2 },
    OS: { passing: 0.35, dribbling: 0.25, physical: 0.15, defending: 0.15, shooting: 0.1 },
    FOR: { shooting: 0.45, pace: 0.2, dribbling: 0.25, physical: 0.1 },
  },
  tierThresholds: { special: 85, gold: 75, silver: 65 },
  ratingMin: 1,
  ratingMax: 99,
} as const;

const POSITION_ORDER: readonly PlayerPosition[] = ['KAL', 'DEF', 'OS', 'FOR'];

@Injectable({ providedIn: 'root' })
export class RatingService {
  /** Ham girdiden 6 görünür istatistik + gizli kalecilik + mevki + reyting + tier hesaplar. */
  calculate(input: PlayerInput): PlayerRatings {
    const w = RATING_WEIGHTS;
    const s = effectiveSkills(input);
    const face = (weights: Partial<Record<keyof PlayerSkills, number>>): number => {
      let sum = 0;
      for (const [key, weight] of Object.entries(weights) as [keyof PlayerSkills, number][]) {
        sum += (w.skillScale.base + s[key] * w.skillScale.per) * weight;
      }
      return sum;
    };

    const shape = this.shapePenalty(input.heightCm, input.weightKg);
    const heightDelta = input.heightCm - w.referenceHeightCm;
    const age = input.age ?? null;
    const agePace = age && age > w.age.paceFrom ? -Math.min(w.age.paceMax, (age - w.age.paceFrom) * w.age.pacePerYear) : 0;
    const agePhys = age && age > w.age.physicalFrom ? -Math.min(w.age.physicalMax, (age - w.age.physicalFrom) * w.age.physicalPerYear) : 0;
    const feet = input.preferredFoot === 'iki' ? w.bothFeetBonus : 0;
    const goals = Math.min(w.goalsPerMatch.max, Math.max(0, input.goalsPerMatch || 0) * w.goalsPerMatch.per);

    const pace = this.clamp(face(w.face.pace) + shape + (input.smoker ? w.smoke.pace : 0) + agePace);
    const shooting = this.clamp(face(w.face.shooting) + goals + feet);
    const passing = this.clamp(face(w.face.passing) + feet);
    const dribbling = this.clamp(face(w.face.dribbling));
    const defending = this.clamp(face(w.face.defending));
    const physical = this.clamp(
      face(w.face.physical) + shape + (input.smoker ? w.smoke.physical : 0) + agePhys + heightDelta * w.heightFactor.physical,
    );
    // Kaleye hiç geçemeyen oyuncu: kalecilik puanı tabana iner (kura ve saha onu kaleci saymaz).
    const goalkeeping = input.noKeeper
      ? w.ratingMin
      : this.clamp(face(w.face.goalkeeping) + heightDelta * w.heightFactor.goalkeeping);

    const stats = { pace, shooting, passing, dribbling, defending, physical, goalkeeping };
    const composite = (weights: Partial<Record<keyof typeof stats, number>>): number =>
      (Object.entries(weights) as [keyof typeof stats, number][]).reduce((sum, [k, v]) => sum + stats[k] * v, 0);

    const positionScores: Record<PlayerPosition, number> = {
      KAL: composite(w.position.KAL),
      DEF: composite(w.position.DEF),
      OS: composite(w.position.OS),
      FOR: composite(w.position.FOR),
    };

    const position = this.bestPosition(positionScores, input.noKeeper === true);
    const overall = this.clamp(positionScores[position]);

    return { ...stats, position, overall, tier: this.tierOf(overall) };
  }

  /** Her mevkinin bileşke puanı (formda "neden bu mevki" açıklaması için). */
  positionScores(input: PlayerInput): Record<PlayerPosition, number> {
    const r = this.calculate(input);
    const stats = r as unknown as Record<string, number>;
    const out = {} as Record<PlayerPosition, number>;
    for (const p of POSITION_ORDER) {
      out[p] = this.clamp(
        (Object.entries(RATING_WEIGHTS.position[p]) as [string, number][]).reduce((sum, [k, v]) => sum + stats[k] * v, 0),
      );
    }
    return out;
  }

  private shapePenalty(heightCm: number, weightKg: number): number {
    const bmi = weightKg / Math.pow(heightCm / 100, 2);
    const p = RATING_WEIGHTS.shapePenalty;
    if (bmi > p.obeseBmi) return p.obesePenalty;
    if (bmi > p.overweightBmi) return p.overweightPenalty;
    if (bmi < p.underweightBmi) return p.underweightPenalty;
    return 0;
  }

  /** Eşitlikte KAL > DEF > OS > FOR sırasına göre ilk maksimum kazanır (prototipteki davranış). */
  private bestPosition(scores: Record<PlayerPosition, number>, noKeeper = false): PlayerPosition {
    const order = noKeeper ? POSITION_ORDER.filter((p) => p !== 'KAL') : POSITION_ORDER;
    let best = order[0];
    for (const position of order) {
      if (scores[position] > scores[best]) best = position;
    }
    return best;
  }

  private tierOf(overall: number): PlayerTier {
    const t = RATING_WEIGHTS.tierThresholds;
    if (overall >= t.special) return 'special';
    if (overall >= t.gold) return 'gold';
    if (overall >= t.silver) return 'silver';
    return 'bronze';
  }

  private clamp(value: number): number {
    return Math.max(RATING_WEIGHTS.ratingMin, Math.min(RATING_WEIGHTS.ratingMax, Math.round(value)));
  }
}
