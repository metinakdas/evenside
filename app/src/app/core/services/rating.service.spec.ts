import { PlayerSkills, SKILL_KEYS } from '../constants/player-skills';
import { PlayerInput, PlayerRatings } from '../models/player.model';
import { RatingService } from './rating.service';

function makeInput(overrides: Partial<PlayerInput>): PlayerInput {
  return {
    name: 'Test Oyuncu',
    shirtNumber: '9',
    countryCode: 'TR',
    flagImage: null,
    photoImage: null,
    heightCm: 175,
    weightKg: 70,
    smoker: false,
    goalkeeping: 0,
    defending: 0,
    midfield: 0,
    attacking: 0,
    pace: 0,
    stamina: 0,
    goalsPerMatch: 0,
    ...overrides,
  };
}

/** Tüm görünür/gizli puanların 1-99 aralığında ve alanların doğru enum değerlerinde olduğunu doğrular. */
function expectValidRatings(ratings: PlayerRatings): void {
  const stats: (keyof PlayerRatings)[] = ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical', 'goalkeeping', 'overall'];
  for (const key of stats) {
    const value = ratings[key] as number;
    expect(Number.isFinite(value)).toBeTrue();
    expect(value).toBeGreaterThanOrEqual(1);
    expect(value).toBeLessThanOrEqual(99);
  }
  expect(['KAL', 'DEF', 'OS', 'FOR']).toContain(ratings.position);
  expect(['bronze', 'silver', 'gold', 'special']).toContain(ratings.tier);
}

describe('RatingService', () => {
  let service: RatingService;

  beforeEach(() => {
    service = new RatingService();
  });

  it('computes the documented formula for a known input', () => {
    // boy 180 / kilo 75 -> BMI ~23.15 (biçim cezası yok), sigara yok.
    const input = makeInput({
      heightCm: 180,
      weightKg: 75,
      smoker: false,
      goalkeeping: 2,
      defending: 5,
      midfield: 5,
      attacking: 4,
      pace: 6,
      stamina: 6,
      goalsPerMatch: 0.5,
    });

    const ratings = service.calculate(input);

    // Puanlama 2. sürüm (alt özellikler; eski kart eski altı alandan tahmin edilir) — proje notları.
    expect(ratings).toEqual({
      pace: 63,
      shooting: 49,
      passing: 54,
      dribbling: 55,
      defending: 55,
      physical: 64,
      goalkeeping: 31,
      position: 'DEF',
      overall: 58,
      tier: 'bronze',
    });
  });

  it('stays within 1-99 at the short/underweight boundary (boy 140) and floors the clamp', () => {
    const input = makeInput({ heightCm: 140, weightKg: 40, smoker: false });
    const ratings = service.calculate(input);

    expectValidRatings(ratings);
    // (140-170)*0.35 + 8 = -2.5 -> alt sınıra (1) kelepçelenmeli.
    expect(ratings.goalkeeping).toBe(1);
  });

  it('stays within 1-99 at the tall boundary (boy 220) and resolves position ties as KAL > DEF > OS > FOR', () => {
    const input = makeInput({
      heightCm: 220,
      weightKg: 110,
      smoker: true,
      goalkeeping: 10,
      defending: 10,
      midfield: 10,
      attacking: 10,
      pace: 10,
      stamina: 10,
      goalsPerMatch: 3,
    });

    const ratings = service.calculate(input);

    expectValidRatings(ratings);
    expect(ratings.overall).toBe(99);
    // KAL ve OS kompozit puanı bu girdide eşit (99) çıkıyor; sıralamada KAL önce gelmeli.
    expect(ratings.position).toBe('KAL');
    expect(ratings.tier).toBe('special');
  });

  it('produces low, valid ratings when every skill slider is 0', () => {
    const ratings = service.calculate(makeInput({}));
    expectValidRatings(ratings);
    expect(ratings.tier).toBe('bronze');
  });

  it('clamps every stat to 99 when every skill slider is maxed', () => {
    const input = makeInput({
      goalkeeping: 10,
      defending: 10,
      midfield: 10,
      attacking: 10,
      pace: 10,
      stamina: 10,
      goalsPerMatch: 1,
    });

    const ratings = service.calculate(input);

    expectValidRatings(ratings);
    expect(ratings.pace).toBe(99);
    expect(ratings.shooting).toBe(99);
    expect(ratings.passing).toBe(99);
    expect(ratings.dribbling).toBe(99);
    expect(ratings.defending).toBe(99);
    expect(ratings.physical).toBe(99);
    expect(ratings.goalkeeping).toBe(99);
  });

  describe('alt özellikler (2. sürüm)', () => {
    const tam = (deger: number) => Object.fromEntries(
      ['ivme','sprint','dayaniklilik','kuvvet','ceviklik','bitiricilik','sutGucu','uzaktanSut','kafa','kisaPas','uzunPas','vizyon','topKontrol','dripling','topKapma','markaj','arayaGirme','mucadele','refleks','kaleHakimiyeti'].map((k) => [k, deger]),
    ) as never;

    it('her şey 10 olan oyuncu 99 sınırını aşmaz, her şey 0 olan 1 altına inmez', () => {
      expectValidRatings(service.calculate(makeInput({ heightCm: 180, weightKg: 75, skills: tam(10) })));
      expectValidRatings(service.calculate(makeInput({ heightCm: 180, weightKg: 75, skills: tam(0) })));
    });

    it("şut alt özellikleri ŞUT'u, pas alt özellikleri PAS'ı belirler", () => {
      const s = tam(5) as Record<string, number>;
      const golcu = service.calculate(makeInput({ heightCm: 178, weightKg: 74, skills: { ...s, bitiricilik: 10, sutGucu: 10, uzaktanSut: 10 } as never }));
      const pasor = service.calculate(makeInput({ heightCm: 178, weightKg: 74, skills: { ...s, kisaPas: 10, uzunPas: 10, vizyon: 10 } as never }));
      expect(golcu.shooting).toBeGreaterThan(pasor.shooting + 20);
      expect(pasor.passing).toBeGreaterThan(golcu.passing + 20);
    });

    it("iki ayaklı oyuncu ŞUT ve PAS'ta artı alır; yaş 32 sonrası HIZ düşer", () => {
      const base = makeInput({ heightCm: 178, weightKg: 74, skills: tam(6) });
      const iki = service.calculate({ ...base, preferredFoot: 'iki' });
      const tek = service.calculate({ ...base, preferredFoot: 'sag' });
      expect(iki.shooting).toBe(tek.shooting + 3);
      expect(iki.passing).toBe(tek.passing + 3);
      expect(service.calculate({ ...base, age: 40 }).pace).toBeLessThan(service.calculate({ ...base, age: 28 }).pace);
    });

    it('refleks ve kale hakimiyeti yüksek oyuncu KAL çıkar', () => {
      const s = tam(4) as Record<string, number>;
      const r = service.calculate(makeInput({ heightCm: 186, weightKg: 82, skills: { ...s, refleks: 9, kaleHakimiyeti: 8 } as never }));
      expect(r.position).toBe('KAL');
    });
  });

  it('kaleye hiç geçemeyen oyuncu: kalecilik 1, mevki asla KAL (kalecilik becerisi yüksek olsa bile)', () => {
    const svc = new RatingService();
    const skills = Object.fromEntries(SKILL_KEYS.map((k) => [k, 3])) as PlayerSkills;
    skills.refleks = 10;
    skills.kaleHakimiyeti = 10;
    const base = { name: 'K', shirtNumber: '', countryCode: 'TR', flagImage: null, photoImage: null, heightCm: 190, weightKg: 85, smoker: false, goalkeeping: 0, defending: 0, midfield: 0, attacking: 0, pace: 0, stamina: 0, goalsPerMatch: 0, skills };
    expect(svc.calculate(base).position).toBe('KAL');
    const r = svc.calculate({ ...base, noKeeper: true });
    expect(r.position).not.toBe('KAL');
    expect(r.goalkeeping).toBe(1);
  });
});
