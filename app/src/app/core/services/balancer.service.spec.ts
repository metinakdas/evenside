import { Player, PlayerInput, PlayerRatings } from '../models/player.model';
import { BalancerService, DEFAULT_WEAK_KEEPER_THRESHOLD, weakLinkStrength, winProbability } from './balancer.service';

const BLANK_INPUT: PlayerInput = {
  name: '',
  shirtNumber: '',
  countryCode: '',
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
};

function makePlayer(id: string, overall: number, ratingOverrides: Partial<PlayerRatings> = {}): Player {
  return {
    id,
    input: { ...BLANK_INPUT, name: id },
    ratings: {
      pace: overall,
      shooting: overall,
      passing: overall,
      dribbling: overall,
      defending: overall,
      physical: overall,
      goalkeeping: overall,
      position: 'OS',
      overall,
      tier: 'silver',
      ...ratingOverrides,
    },
  };
}

describe('BalancerService', () => {
  let service: BalancerService;

  beforeEach(() => {
    service = new BalancerService();
  });

  it('throws for an odd or zero player count', () => {
    expect(() => service.balance([makePlayer('1', 50)])).toThrowError();
    expect(() => service.balance([])).toThrowError();
  });

  it('splits 12 players into two full, non-overlapping teams of 6', () => {
    const overalls = [50, 52, 55, 58, 60, 63, 65, 68, 70, 73, 90, 99];
    const players = overalls.map((overall, i) => makePlayer(`p${i}`, overall));

    const result = service.balance(players, { seed: 1 });

    expect(result.teamAPlayerIds.length).toBe(6);
    expect(result.teamBPlayerIds.length).toBe(6);
    const combined = new Set([...result.teamAPlayerIds, ...result.teamBPlayerIds]);
    expect(combined.size).toBe(12);
    expect(combined).toEqual(new Set(players.map((p) => p.id)));
  });

  it('keeps the overall-rating difference between teams small (reasonable balance)', () => {
    // En iyi 6/6 bölüşümün toplam farkı 1 (bkz. {99,73,68,60,52,50} vs {55,58,63,65,70,90}).
    const overalls = [50, 52, 55, 58, 60, 63, 65, 68, 70, 73, 90, 99];
    const players = overalls.map((overall, i) => makePlayer(`p${i}`, overall));

    const result = service.balance(players, { seed: 7 });

    const byId = new Map(players.map((p) => [p.id, p.ratings.overall]));
    const sumA = result.teamAPlayerIds.reduce((sum, id) => sum + (byId.get(id) ?? 0), 0);
    const sumB = result.teamBPlayerIds.reduce((sum, id) => sum + (byId.get(id) ?? 0), 0);
    expect(Math.abs(sumA - sumB)).toBeLessThanOrEqual(3);
  });

  it('is reproducible: the same seed produces the same draw', () => {
    const overalls = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 62, 77];
    const players = overalls.map((overall, i) => makePlayer(`p${i}`, overall));

    const first = service.balance(players, { seed: 123 });
    const second = service.balance(players, { seed: 123 });

    expect(second).toEqual(first);
  });

  it('flags weakKeeper when every player has low goalkeeping', () => {
    const players = Array.from({ length: 12 }, (_, i) =>
      makePlayer(`p${i}`, 60 + i, { goalkeeping: 10 }),
    );

    const result = service.balance(players, { seed: 3 });

    expect(result.weakKeeper).not.toBeNull();
    const flaggedIds = result.weakKeeper === 'A' ? result.teamAPlayerIds : result.teamBPlayerIds;
    const byId = new Map(players.map((p) => [p.id, p.ratings.goalkeeping]));
    const bestOnFlaggedTeam = Math.max(...flaggedIds.map((id) => byId.get(id) ?? 0));
    expect(bestOnFlaggedTeam).toBeLessThan(DEFAULT_WEAK_KEEPER_THRESHOLD);
  });

  it('does not flag weakKeeper when both teams necessarily contain a strong goalkeeper option', () => {
    // 10 oyuncu yüksek kalecilik, 2 oyuncu düşük: 6'lık takımlara bölününce
    // her takımda en az 4 yüksek kalecilikli oyuncu olmak zorunda (güvercin yuvası).
    const players = [
      ...Array.from({ length: 10 }, (_, i) => makePlayer(`strong${i}`, 60 + i, { goalkeeping: 80 })),
      ...Array.from({ length: 2 }, (_, i) => makePlayer(`weak${i}`, 60 + i, { goalkeeping: 10 })),
    ];

    const result = service.balance(players, { seed: 9 });

    expect(result.weakKeeper).toBeNull();
  });

  it('puts one goalkeeper on each side when the pool has exactly two', () => {
    // Kaleciler kasten reyting uçlarında: ceza terimi olmasaydı dengeleyici ikisini de
    // aynı takıma koyup reyting toplamını eşitlemeyi tercih edebilirdi.
    const players = [
      makePlayer('kal-lo', 40, { position: 'KAL', goalkeeping: 85 }),
      makePlayer('kal-hi', 95, { position: 'KAL', goalkeeping: 88 }),
      ...Array.from({ length: 10 }, (_, i) => makePlayer(`saha${i}`, 60 + i)),
    ];

    const result = service.balance(players, { seed: 3 });

    expect(result.keeperCounts.A).toBe(1);
    expect(result.keeperCounts.B).toBe(1);
    const sideOfLo = result.teamAPlayerIds.includes('kal-lo') ? 'A' : 'B';
    const sideOfHi = result.teamAPlayerIds.includes('kal-hi') ? 'A' : 'B';
    expect(sideOfLo).not.toBe(sideOfHi);
  });

  it('reports the empty side in keeperCounts when the pool has only one goalkeeper', () => {
    const players = [
      makePlayer('kal', 70, { position: 'KAL', goalkeeping: 85 }),
      ...Array.from({ length: 11 }, (_, i) => makePlayer(`saha${i}`, 60 + i)),
    ];

    const result = service.balance(players, { seed: 5 });

    // Kısıt sağlanamaz; önemli olan sessizce geçilmemesi — bir taraf 0 olarak raporlanır.
    expect(result.keeperCounts.A + result.keeperCounts.B).toBe(1);
    expect(Math.min(result.keeperCounts.A, result.keeperCounts.B)).toBe(0);
  });
  it('does not return the same split every time (a draw must feel like a draw)', () => {
    // Eşit reytingli oyuncular: pek çok bölüşüm tam olarak eşit derecede adil, yani
    // tolerans havuzu geniş — buna rağmen tek bir eniyiye kilitlenirse çeşitlilik yok demektir.
    const players = Array.from({ length: 12 }, (_, i) => makePlayer(`p${i}`, 70));

    const signatures = new Set(Array.from({ length: 12 }, () => service.balance(players).signature));

    expect(signatures.size).toBeGreaterThan(1);
  });

  it('avoids repeating the previous split when asked and a fair alternative exists', () => {
    const players = Array.from({ length: 12 }, (_, i) => makePlayer(`p${i}`, 70));
    const first = service.balance(players);

    const second = service.balance(players, { avoidSignature: first.signature });

    expect(second.signature).not.toBe(first.signature);
  });

  it('still returns a valid split when every candidate is the avoided one', () => {
    // 2 oyuncu = tek bir olası bölüşüm; kaçınma isteği sonucu boşa düşürmemeli.
    const players = [makePlayer('a', 70), makePlayer('b', 70)];
    const only = service.balance(players);

    const again = service.balance(players, { avoidSignature: only.signature });

    expect(again.teamAPlayerIds.length).toBe(1);
    expect(again.teamBPlayerIds.length).toBe(1);
  });
  it('splits the two best players across the teams instead of stacking them', () => {
    // Toplam reyting eşitlenebilse bile "iki 85 aynı tarafta" sahada adaletsiz hissettiriyor.
    const players = [
      makePlayer('star-1', 85),
      makePlayer('star-2', 85),
      ...Array.from({ length: 10 }, (_, i) => makePlayer(`saha${i}`, 60 + i)),
    ];

    const result = service.balance(players, { seed: 11 });

    const starsOnA = ['star-1', 'star-2'].filter((id) => result.teamAPlayerIds.includes(id)).length;
    expect(starsOnA).toBe(1);
  });

  it('spreads the lines instead of leaving one team without a midfield', () => {
    const players = [
      ...Array.from({ length: 4 }, (_, i) => makePlayer(`def${i}`, 68 + i, { position: 'DEF' })),
      ...Array.from({ length: 4 }, (_, i) => makePlayer(`os${i}`, 66 + i, { position: 'OS' })),
      ...Array.from({ length: 4 }, (_, i) => makePlayer(`for${i}`, 64 + i, { position: 'FOR' })),
    ];

    const result = service.balance(players, { seed: 4 });

    const countOn = (ids: string[], prefix: string): number => ids.filter((id) => id.startsWith(prefix)).length;
    for (const prefix of ['def', 'os', 'for']) {
      const diff = Math.abs(countOn(result.teamAPlayerIds, prefix) - countOn(result.teamBPlayerIds, prefix));
      expect(diff).withContext(prefix).toBeLessThanOrEqual(1);
    }
  });
  // Tur 3 · A2: geniş adalet bandı yıldız yığılmasını ve hat dengesini yutuyordu.
  it('keeps the stars apart even when many splits are equally fair', () => {
    const players = [
      makePlayer('star-1', 85),
      makePlayer('star-2', 84),
      ...Array.from({ length: 10 }, (_, i) => makePlayer(`saha${i}`, 65 + (i % 3))),
    ];

    // Tek seferlik şans değil, kural olduğunu görmek için birden çok çekiliş.
    for (let attempt = 0; attempt < 8; attempt++) {
      const result = service.balance(players);
      const starsOnA = ['star-1', 'star-2'].filter((id) => result.teamAPlayerIds.includes(id)).length;
      expect(starsOnA).withContext(`deneme ${attempt}`).toBe(1);
    }
  });

  // Tur 3 · A3: kadro ekranındaki önizleme her bakışta farklı bir sayı gösteriyordu.
  it('returns the same split every time in deterministic mode', () => {
    const players = Array.from({ length: 12 }, (_, i) => makePlayer(`p${i}`, 70));

    const signatures = new Set(
      Array.from({ length: 6 }, () => service.balance(players, { deterministic: true }).signature),
    );

    expect(signatures.size).toBe(1);
  });
  // Tur 4 · Y1: ortalama eşitken bir takım homojen, diğeri iki yıldız + bir zayıf halka çıkıyordu.
  it('does not pair equal averages with wildly different spreads', () => {
    const players = [
      makePlayer('star-1', 85),
      makePlayer('star-2', 84),
      makePlayer('weak', 41),
      makePlayer('a', 78),
      makePlayer('b', 75),
      makePlayer('c', 71),
      makePlayer('d', 69),
      makePlayer('e', 69),
      makePlayer('f', 67),
      makePlayer('g', 67),
      makePlayer('h', 66),
      makePlayer('i', 64),
      makePlayer('j', 60),
      makePlayer('k', 60),
    ];

    const result = service.balance(players);

    // Tek bir 41'lik uç değer varken sapma farkı sıfırlanamaz: 41 hangi takıma giderse o
    // takımın dağılımı genişler. Ölçüt, raporlanan durumdan (13.5 vs 5.7 → fark 7.8) belirgin
    // şekilde daha iyi olması; sıfır değil.
    expect(Math.abs(result.spread.A - result.spread.B)).toBeLessThan(6);
  });

  /*
   * KÜRESEL EN İYİ ile karşılaştırma.
   *
   * Bir tarayıcı testinde "kura 307/311 verdi ama 309/309 mümkündü" gözlemi geldi. Bu tek
   * başına hata demek DEĞİL: adalet maliyeti yalnızca reyting TOPLAMI değil; kaleci, defans,
   * şut ve hız ortalamalarının farkını da içeriyor ve toplamı eşitleyen bölüşüm bu
   * eksenlerde daha kötü olabiliyor. Yine de "tepe tırmanma yerel bir tepede sıkışıyor mu"
   * sorusu gerçek. Küçük kadrolarda TÜM bölüşümler tek tek hesaplanabilir; kuranın seçtiği
   * bölüşümün küresel en iyiden ne kadar saptığını ölçüyoruz.
   */
  function allSplits(count: number): number[][] {
    // Sabit 0. indeksi A'da tutmak ayna (A/B yer değiştirmiş) bölüşümleri teker.
    const half = count / 2;
    const out: number[][] = [];
    const walk = (start: number, current: number[]): void => {
      if (current.length === half) {
        out.push([...current]);
        return;
      }
      for (let i = start; i < count; i++) walk(i + 1, [...current, i]);
    };
    walk(1, [0]);
    return out;
  }

  it('seçilen bölüşüm, KÜRESEL en iyi adalet maliyetinin tolerans bandı içinde kalır', () => {
    // Kasten çarpık bir kadro: eşitlenmesi kolay olmayan, tepe tırmanmayı zorlayan dağılım.
    const overalls = [91, 82, 79, 78, 76, 72, 72, 68];
    const players = overalls.map((o, i) =>
      makePlayer(`p${i}`, o, { position: i === 0 || i === 2 ? 'KAL' : 'OS', goalkeeping: i === 0 || i === 2 ? 10 : 3 }),
    );

    // Küresel en iyi adalet maliyeti: 35 bölüşümün hepsi hesaplanır.
    const fairnessOf = (service as unknown as {
      fairnessCost(p: readonly Player[], a: number[], b: number[]): number;
    }).fairnessCost.bind(service);
    let globalBest = Infinity;
    for (const a of allSplits(players.length)) {
      const b = players.map((_, i) => i).filter((i) => !a.includes(i));
      globalBest = Math.min(globalBest, fairnessOf(players, a, b));
    }

    // Tolerans: yarı kadro başına 0.5 puan (DEFAULT_TOLERANCE_PER_PLAYER).
    const tolerance = (players.length / 2) * 0.5;

    // Rastgelelik var: bir kez değil, çok kez çekilir ve HEPSİ bandın içinde olmalı.
    for (let tur = 0; tur < 40; tur++) {
      const result = service.balance(players);
      const aIdx = result.teamAPlayerIds.map((id) => players.findIndex((p) => p.id === id));
      const bIdx = result.teamBPlayerIds.map((id) => players.findIndex((p) => p.id === id));
      const fairness = fairnessOf(players, aIdx, bIdx);
      expect(fairness)
        .withContext(`tur ${tur}: adalet ${fairness.toFixed(2)}, küresel en iyi ${globalBest.toFixed(2)}`)
        .toBeLessThanOrEqual(globalBest + tolerance + 1e-9);
    }
  });

  it('reyting dışında her şey eşitken kura toplamları EŞİTLER', () => {
    // Tüm oyuncular aynı mevkide ve stat profili reytingle birebir: burada adaletin tek
    // ekseni toplam. Eşit toplamlı bölüşüm mümkünse kura onu bulmalı.
    const overalls = [91, 82, 79, 78, 76, 72, 72, 68]; // 309 / 309 mümkün
    const players = overalls.map((o, i) => makePlayer(`p${i}`, o));

    const sums = new Set<number>();
    for (let tur = 0; tur < 30; tur++) {
      const result = service.balance(players);
      const topla = (ids: readonly string[]) =>
        ids.reduce((t, id) => t + players.find((p) => p.id === id)!.ratings.overall, 0);
      const fark = Math.abs(topla(result.teamAPlayerIds) - topla(result.teamBPlayerIds));
      sums.add(fark);
      expect(fark).withContext(`tur ${tur}: toplam farkı ${fark}`).toBe(0);
    }
    expect([...sums]).toEqual([0]);
  });

  /*
   * VAAT = GERÇEK. Kadro ekranı adil bandın fark ARALIĞINI gösteriyor; kura ise o banttan
   * rastgele seçiyor. Çekilen her kuranın farkı bu aralığın İÇİNDE olmalı — yoksa arayüz
   * tutamayacağı bir söz vermiş olur (tarayıcı testinde "±0,1 dedi, ±1,0 verdi" diye geldi).
   */
  it('çekilen her kuranın farkı, bildirilen adil bant aralığının içinde kalır', () => {
    const overalls = [91, 82, 79, 78, 76, 72, 72, 68, 66, 61];
    const players = overalls.map((o, i) =>
      makePlayer(`p${i}`, o, { position: i % 4 === 0 ? 'KAL' : 'DEF', goalkeeping: i % 4 === 0 ? 9 : 3 }),
    );
    const byId = new Map(players.map((p) => [p.id, p.ratings.overall]));
    const ort = (ids: readonly string[]): number =>
      ids.reduce((t, id) => t + (byId.get(id) ?? 0), 0) / (ids.length || 1);

    const bildirilen = service.balance(players, { deterministic: true }).fairGapRange;
    expect(bildirilen.min).toBeLessThanOrEqual(bildirilen.max);

    for (let tur = 0; tur < 40; tur++) {
      const r = service.balance(players);
      const fark = Math.abs(ort(r.teamAPlayerIds) - ort(r.teamBPlayerIds));
      expect(fark)
        .withContext(`tur ${tur}: fark ${fark.toFixed(2)}, bant ${bildirilen.min.toFixed(2)}-${bildirilen.max.toFixed(2)}`)
        .toBeLessThanOrEqual(bildirilen.max + 1e-9);
      expect(fark).toBeGreaterThanOrEqual(bildirilen.min - 1e-9);
    }
  });
  describe('2. sürüm: zayıf halka, tam tarama, kazanma ihtimali', () => {
    it('zayıf halka gücü en zayıf oyuncuya daha çok ağırlık verir', () => {
      // Aynı ortalama (75): uçlardan kurulu takım, homojen takımdan GÜÇSÜZ sayılır.
      expect(weakLinkStrength([75, 75, 75, 75])).toBeCloseTo(75, 5);
      expect(weakLinkStrength([60, 70, 80, 90])).toBeLessThan(75);
      expect(weakLinkStrength([80])).toBe(80);
    });

    it('kazanma ihtimali eşit güçte %50, güç farkıyla artar ve simetriktir', () => {
      expect(winProbability(70, 70)).toBeCloseTo(0.5, 5);
      expect(winProbability(74, 70)).toBeGreaterThan(0.7);
      expect(winProbability(70, 74) + winProbability(74, 70)).toBeCloseTo(1, 5);
    });

    it('toplamı eşit bölüşümler arasında en zayıf iki oyuncuyu ayrı takımlara koyar', () => {
      const overalls = [90, 80, 72, 70, 68, 60];
      const players = overalls.map((o, i) => makePlayer(`w${i}`, o));
      const enZayif = (ids: readonly string[]) =>
        Math.min(...ids.map((id) => players.find((p) => p.id === id)!.ratings.overall));
      for (let tur = 0; tur < 20; tur++) {
        const r = service.balance(players);
        expect([enZayif(r.teamAPlayerIds), enZayif(r.teamBPlayerIds)].sort())
          .withContext(`tur ${tur}`)
          .toEqual([60, 68]);
      }
    });

    it('8v8 kadroyu tam tarar, makul sürede ve dengeli döndürür', () => {
      const overalls = [91, 88, 84, 81, 79, 77, 76, 74, 73, 71, 70, 69, 67, 66, 64, 58];
      const players = overalls.map((o, i) =>
        makePlayer(`g${i}`, o, {
          position: i % 6 === 0 ? 'KAL' : i % 3 === 0 ? 'DEF' : 'OS',
          pace: o - (i % 5) * 3,
          passing: o + (i % 4) * 2,
        }),
      );
      const t0 = performance.now();
      const r = service.balance(players, { deterministic: true });
      const sure = performance.now() - t0;
      expect(sure).withContext(`8v8 tam tarama ${sure.toFixed(0)} ms`).toBeLessThan(1500);
      expect(r.teamAPlayerIds.length).toBe(8);
      expect(r.teamBPlayerIds.length).toBe(8);
      expect(r.fairGapRange.max).toBeLessThanOrEqual(1);
      expect(r.winChance.A).toBeGreaterThan(0.4);
      expect(r.winChance.A).toBeLessThan(0.6);
    });
  });

  /*
   * YAYIN ÖNCESİ KURA DENETİMİ (10 Ekim 2026). Küçük kadrolarda yan terimler (yüz puanları,
   * kaleci, zayıf halka) ortalama ölçeğinde, reyting toplam ölçeğinde olduğu için kura 4v4'te
   * 1,5 farkla bölmek mümkünken 6,5 farklı bölüşüm seçebiliyordu (tahmini kazanma %11).
   * Kural: görünen iki ölçüde (ortalama fark + tahmini kazanma) İKİSİNDE DE belirgin daha
   * iyi bir bölüşüm varken kura onu seçmemeli.
   */
  it('küçük kadroda yan terimler reyting dengesini ezemez (Pareto-baskın kura yok)', () => {
    let seed = 99;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const face = (): number => Math.round(30 + rnd() * 60);
    for (const half of [4, 5]) {
      for (let t = 0; t < 30; t++) {
        const players = Array.from({ length: half * 2 }, (_, i) =>
          makePlayer('p' + i, Math.round(35 + rnd() * 55), {
            pace: face(), shooting: face(), passing: face(), dribbling: face(), defending: face(), physical: face(), goalkeeping: face(),
          }),
        );
        const r = service.balance(players);
        const ov = (ids: string[]): number[] => ids.map((id) => players.find((p) => p.id === id)!.ratings.overall);
        const gapOf = (a: number[], b: number[]): number => Math.abs(a.reduce((x, y) => x + y, 0) - b.reduce((x, y) => x + y, 0)) / half;
        const devOf = (a: number[], b: number[]): number => Math.abs(winProbability(weakLinkStrength(a), weakLinkStrength(b)) - 0.5);
        const g = gapOf(ov(r.teamAPlayerIds), ov(r.teamBPlayerIds));
        const d = devOf(ov(r.teamAPlayerIds), ov(r.teamBPlayerIds));
        const all = players.map((p) => p.ratings.overall);
        // 0. oyuncu hep A'da: bütün bölüşümler.
        const walk = (start: number, picked: number[]): void => {
          if (picked.length === half) {
            const a = picked.map((i) => all[i]);
            const b = all.filter((_, i) => !picked.includes(i));
            const dominated = gapOf(a, b) <= g - 0.5 && devOf(a, b) <= d - 0.03;
            expect(dominated)
              .withContext(`${half}v${half} kadro ${t}: fark ${g.toFixed(2)}, daha iyisi ${gapOf(a, b).toFixed(2)}`)
              .toBeFalse();
            return;
          }
          for (let i = start; i < all.length; i++) walk(i + 1, [...picked, i]);
        };
        walk(1, [0]);
      }
    }
  });

  it('en iyi iki oyuncu, adaleti bozmadan ayrılabiliyorsa ASLA aynı takıma düşmez', () => {
    const players = [90, 89, 62, 61, 60, 60, 59, 58, 58, 57, 56, 55, 55, 54].map((o, i) => makePlayer('p' + i, o));
    for (let k = 0; k < 25; k++) {
      const r = service.balance(players);
      expect(r.teamAPlayerIds.includes('p0')).not.toBe(r.teamAPlayerIds.includes('p1'));
    }
  });
});
