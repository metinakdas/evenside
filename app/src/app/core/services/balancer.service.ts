import { Injectable } from '@angular/core';
import { BalanceOptions, DrawResult, TeamAggregate } from '../models/draw.model';
import { Player } from '../models/player.model';

/**
 * Maliyet formülündeki terim ağırlıkları. 2. sürüm (10 Ekim 2026) — gerekçe ve kaynaklar
 * proje notları "Kura dengesi" bölümünde.
 *
 * Toplam (`overallSum`) ve zayıf halka (`weakLinkStrength`) TAKIM TOPLAMI ölçeğinde; yüz
 * puanı ortalamaları ve kaleci OYUNCU BAŞI ölçekte (ortalama farkı).
 */
export const BALANCE_WEIGHTS = {
  overallSum: 1.0,
  /**
   * "Futbol en zayıf halka sporudur" (Sally & Anderson, The Numbers Game): hatalar pahalı,
   * takımın gücünü en kötü oyuncusu en iyi oyuncusundan fazla belirler. Takım gücü bu yüzden
   * düz ortalama değil, zayıftan güçlüye AZALAN ağırlıklı ortalama (bkz. `weakLinkStrength`).
   * Aynı toplamlı iki bölüşümden zayıf oyuncuları dengeli dağıtanı seçtirir.
   *
   * Ağırlık toplamdan düşük (0,75): 1,0 iken toplamı eşit (309-309) bölüşüm yerine toplamda 4 puan
   * farklı bölüşüm seçildi (test). Ekranda görünen ve kullanıcının denetlediği şey ortalama
   * farkı; zayıf halka onu bozmadan, eşite yakın bölüşümler arasında karar vermeli.
   */
  weakLinkStrength: 0.75,
  bestGoalkeeping: 0.7,
  /**
   * Yüz puanı ortalamaları ikiye katlandı (10 Ekim 2026): 120 rastgele kadroluk simülasyonda
   * 7v7 en büyük yüz puanı farkı 5,85 → 5,18, kazanma ihtimali sapması %1,97 → %1,85; bedeli
   * ortalama reyting farkında 0,21 → 0,24. Ayrıntı proje notları.
   */
  defendingAverage: 1.0,
  shootingAverage: 1.0,
  paceAverage: 0.6,
  /** Kart 2. sürümde PAS, DRİ, FİZ de ayrı ölçülüyor: orta saha hâkimiyeti ve maç sonu yorgunluğu. */
  passingAverage: 0.8,
  dribblingAverage: 0.6,
  physicalAverage: 0.8,
  /**
   * Sıra sıra eşleşme: iki takım güçten zayıfa dizilip k. oyuncular karşılaştırılır
   * (|A₁−B₁| + |A₂−B₂| + …, oyuncu başına). "Yılan seçimi" sezgisinin ölçüsü: her yıldızın
   * karşısında bir yıldız, her zayıfın karşısında bir zayıf. Sapma ve açıklığı tamamlar.
   */
  rankProfile: 0.6,
  /**
   * Hat sayısı farkı (DEF/OS/FOR ayrı ayrı, |A - B|). Ortalamalar birebir eşitken hatların
   * berbat dengesiz olabildiği gözlendi — bir takımda 4 DEF + 1 FOR, diğerinde hiç orta saha
   * yok (kontrol raporu). Ağırlık kasten ölçülü: hat dağılımı reyting adaletini ezmemeli,
   * eşit derecede adil bölüşümler arasından daha dengeli DURANI seçtirmeli.
   */
  lineCountDiff: 0.8,
  /**
   * Kadronun en iyi iki oyuncusu aynı takımdaysa eklenen ceza. Toplam reyting eşit çıksa
   * bile "iki 85 aynı tarafta" sahada adaletsiz hissettiriyor.
   */
  topTalentTogether: 2.0,
  /**
   * İki takımın standart sapması arasındaki fark. Ortalamalar eşitlenebiliyor ama dağılımlar
   * çok farklı olabiliyordu: gözlenen bir kurada A (78·75·69·69·67·64·60, sapma 5.7) homojen,
   * B (85·84·71·69·67·66·41, sapma 13.5) iki yıldız + bir zayıf halka çıktı (Tur 4 · Y1).
   * Sahada bu, zayıf halkanın hedef alınması ve maçın iki yıldızca çevrilmesi demek.
   *
   * Denge tanımı artık "ortalamalar eşit" değil, "ortalamalar eşit VE dağılımlar benzer".
   */
  stdDevDiff: 1.5,
  /** En iyi–en kötü açıklığının iki takım arasındaki farkı — sapmayı tamamlayan kaba ölçü. */
  rangeDiff: 0.5,
} as const;

/**
 * Kaleci dağılımı artık MALİYETE karışmıyor. Eskiden 1000'lik sert bir ceza vardı; kalecisiz
 * oynamak desteklenen bir senaryo hâline gelince (vekil kaleci + rotasyon) bu ceza tasarımla
 * çelişir oldu (kontrol raporu B4). Ama cezayı küçültmek de yetmedi: geniş adalet bandında
 * "iki kaleci aynı takımda" bölüşümü tekrar seçilebilir hâle geldi.
 *
 * Çözüm ceza değil, SIRALAMA: adaylar önce "kaç takımın kalecisi var" ölçüsüne göre elenir
 * (bkz. `keeperCoverage`), sonra kalanlar arasında reyting adaleti ve çeşitlilik işler.
 * Böylece kaleciler ayrılabiliyorsa ayrılır, ayrılamıyorsa bu bir hata değil normal bir
 * durumdur ve reyting dengesini bozmaz. Kaleci KALİTESİ farkı ise `bestGoalkeeping`
 * teriminde zaten ölçülüyor.
 */

/**
 * Kaleci KALİTESİ farkının ağırlığı. Gerçek kaleci olmasa bile kaleye birileri geçecek;
 * önemli olan iki takımın kaleye koyabileceği en iyi oyuncunun denk olması.
 */


export const DEFAULT_RESTARTS = 60;

/**
 * Bu oyuncu sayısına kadar bölüşümlerin TAMAMI denenir (8v8 = 6.435 bölüşüm, ~75 ms). Yerel arama
 * küresel eniyiyi kaçırabiliyordu; tam tarama "en dengeli bölüşüm"ü kesinleştirir. Daha büyük
 * kadrolarda eski yol: rastgele başlangıç + tepe tırmanma. 9v9 tam taraması 288 ms ölçüldü —
 * kadro ekranının canlı önizlemesi her değişiklikte çalıştığı için fazla.
 */
export const EXHAUSTIVE_MAX_PLAYERS = 16;

/**
 * Tahmini kazanma ihtimali: P(A) = 1 / (1 + e^(−Δ / s)), Δ = zayıf halka ağırlıklı takım gücü
 * farkı (oyuncu başı reyting puanı). s = 4: 4 puanlık fark ≈ %73. İLK TAHMİNDİR — Takım
 * Geçmişi'ndeki skorlar biriktikçe (`MatchHistoryService.analysis`) kalibre edilmeli.
 * Dengeli kadro tanımı: bu ihtimalin %50'ye yakın olması.
 */
export const WIN_PROBABILITY_SCALE = 4;

/**
 * Zayıf halka ağırlıklı takım gücü: oyuncular zayıftan güçlüye dizilir, en zayıfın ağırlığı
 * 1,5, en güçlünün 0,5, aradakiler doğrusal (ortalama ağırlık 1). Tek oyuncuda düz değer.
 */
export function weakLinkStrength(overalls: readonly number[]): number {
  if (!overalls.length) return 0;
  if (overalls.length === 1) return overalls[0];
  const sorted = [...overalls].sort((x, y) => x - y);
  const last = sorted.length - 1;
  let sum = 0;
  let weights = 0;
  sorted.forEach((value, k) => {
    const w = 1.5 - k / last;
    sum += value * w;
    weights += w;
  });
  return sum / weights;
}

/** Takım gücü farkından A'nın tahmini kazanma ihtimali (0-1). */
export function winProbability(strengthA: number, strengthB: number): number {
  return 1 / (1 + Math.exp(-(strengthA - strengthB) / WIN_PROBABILITY_SCALE));
}

/** Deterministik mod için sabit tohum — değeri önemli değil, sabit olması önemli. */
const DETERMINISTIC_SEED = 42;

/**
 * "Yeterince dengeli" sayılan maliyet payı — TAKIM BAŞINA OYUNCU başına. Maliyetin baskın
 * terimi `overallSum`, yani takımların TOPLAM reyting farkı; sabit bir pay (eski 1.5)
 * 6v6'da 0.25 ortalama puan demekti ve bantta çoğunlukla tek aday kalıyordu — "Kurayı
 * yenile" hep aynı bölüşümü veriyordu (kontrol raporu B1).
 *
 * Takım boyutuyla çarpılınca bant "ortalama reyting farkı <= 0.5 puan" anlamına gelir. 1.0'dan
 * indirildi (Tur 3 · A2): geniş bant ikincil kuralları (yıldız yığılması, hat dengesi) yutuyordu.
 * Bant artık YALNIZCA adalet terimlerine uygulanıyor; ikincil kurallar bandın içinde ceza olarak
 * değil, ayrı bir eleme adımı olarak işliyor (bkz. `balance`).
 */
export const DEFAULT_TOLERANCE_PER_PLAYER = 0.5;

/**
 * EKRANDA GÖRÜNEN ORTALAMA FARKA SERT SINIR (yayın öncesi kura denetimi, 10 Ekim 2026).
 * Bir aday, ulaşılabilecek en küçük ortalama reyting farkından en fazla bu kadar kötü olabilir.
 *
 * Neden: adalet maliyetinde reyting farkı TOPLAM ölçeğinde, yüz puanı / kaleci / zayıf halka
 * terimleri ise ORTALAMA ölçeğinde. Ağırlıklar 7v7'ye göre ayarlı; 4v4-5v5'te yan terimler
 * reytingi ezebiliyordu. Ölçüldü: 4v4'te 1,50 farkla bölmek mümkünken kura 6,50 farklı bölüşüm
 * seçti (tahmini kazanma %11); 120 kadronun 67'sinde kazanma ihtimali %40-60 dışındaydı.
 */
export const MAX_EXTRA_AVERAGE_GAP = 1.0;

/**
 * İKİNCİL KURALLARIN BANDI. Son adımda yalnızca ikincil maliyeti EN düşük aday kalıyordu; o
 * maliyet sürekli bir sayı olduğu için eşitlik neredeyse hiç çıkmıyor ve "adil bant" tek
 * bölüşüme iniyordu (ölçüldü: 7v7'de 120 kuranın 115'i önizlemeyle birebir aynı) — "Kurayı
 * yenile" yine aynı takımları veriyordu (B1 geri gelmişti). Bant, "iki yıldız aynı takımda"
 * cezasından (2,0) küçük tutuldu: kaçınılabiliyorsa o kural yine çiğnenmez.
 */
export const SECONDARY_TOLERANCE = 1.0;

/**
 * TAHMİNİ KAZANMA İHTİMALİNE SERT SINIR. Ekranda "Tahmini kazanma %53 / %47" gösteriliyor;
 * ortalama farkı küçük bir bölüşüm bile zayıf halkalar dengesizse %70/%30 çıkabiliyordu.
 * Ölçüldü (4v4, 120 kadro): %40-60 aralığında bir bölüşüm mümkünken kura 47 kadroda dışarıda
 * kalan bölüşümü seçti. Aday, ulaşılabilecek en dengeli kazanma ihtimalinden (|p − 0,5|)
 * en fazla bu kadar sapabilir.
 */
export const MAX_EXTRA_WIN_DEVIATION = 0.05;

/**
 * Bir takımın en iyi kalecilik puanının bunun altına düşmesi "zayıf kaleci" sayılır.
 * Sabit bir ürün kararı değil, ayarlanabilir bir sezgisel eşiktir — 1-99 skalasında
 * "kaleye geçebilecek biri var" ile "hiç yok" arasını ayırmak için seçildi.
 */
export const DEFAULT_WEAK_KEEPER_THRESHOLD = 55;

/** Seed'lenebilir, bağımlılıksız PRNG (mulberry32). Sadece tekrarlanabilirlik için. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

@Injectable({ providedIn: 'root' })
export class BalancerService {
  /**
   * Oyuncuları iki eşit boyutlu takıma böler: 60 (varsayılan) rastgele başlangıç,
   * her birinde ikili değiş-tokuşla tepe tırmanma, en düşük maliyetli sonuç seçilir.
   * `players.length` pozitif ve çift olmalı (format kuralı gereği her zaman öyledir).
   */
  balance(players: readonly Player[], options: BalanceOptions = {}): DrawResult {
    const n = players.length;
    if (n === 0 || n % 2 !== 0) {
      throw new Error(`BalancerService.balance: oyuncu sayısı pozitif ve çift olmalı, gelen: ${n}.`);
    }
    const half = n / 2;
    const restarts = options.restarts ?? DEFAULT_RESTARTS;
    const threshold = options.weakKeeperThreshold ?? DEFAULT_WEAK_KEEPER_THRESHOLD;
    // Deterministik modda ADAY HAVUZU da sabitlenmeli: aday üretimi rastgele restart'lara
    // dayandığı için, yalnızca seçimi sabitlemek yetmiyordu — her çağrıda farklı bir aday
    // kümesi bulunuyor ve "en iyi" değişiyordu (Tur 3 · A3).
    const random =
      options.seed != null
        ? mulberry32(options.seed)
        : options.deterministic
          ? mulberry32(DETERMINISTIC_SEED)
          : Math.random;

    const tolerance = options.costTolerance ?? half * DEFAULT_TOLERANCE_PER_PLAYER;
    // Aynı bölüşüm birden çok restart'tan çıkabilir; imzaya göre teklenir.
    const candidates = new Map<string, { a: number[]; b: number[]; cost: number }>();
    const exhaustive = n <= EXHAUSTIVE_MAX_PLAYERS;
    if (exhaustive) {
      // Tam tarama: 0. oyuncu hep A'da (A/B yer değiştirmiş bölüşüm aynı kuradır).
      for (const a of this.allSplits(n)) {
        const inA = new Set(a);
        const b: number[] = [];
        for (let i = 0; i < n; i++) if (!inA.has(i)) b.push(i);
        candidates.set(this.signatureOf(players, a, b), { a, b, cost: this.cost(players, a, b) });
      }
    }
    for (let attempt = 0; !exhaustive && attempt < restarts; attempt++) {
      const shuffled = this.shuffle(
        players.map((_, index) => index),
        random,
      );
      // Yalnızca tepe tırmanmanın BİTTİĞİ nokta değil, yol boyunca uğradığı her bölüşüm
      // de aday: aynı hesap maliyetiyle çok daha zengin bir havuz çıkıyor (rapor B1/öneri 2).
      const result = this.localSearch(players, shuffled.slice(0, half), shuffled.slice(half), (visited) => {
        const visitedKey = this.signatureOf(players, visited.a, visited.b);
        if (!candidates.has(visitedKey)) candidates.set(visitedKey, visited);
      });
      const key = this.signatureOf(players, result.a, result.b);
      if (!candidates.has(key)) candidates.set(key, result);
    }
    if (!candidates.size) {
      throw new Error('BalancerService.balance: kura hesaplanamadı.');
    }

    // Seçim üç adımlı ve her adım bir öncekinin çıktısını daraltıyor:
    //   1. Kaleci kapsaması en yüksek olanlar (kaleciler ayrılabiliyorsa ayrılır).
    //   2. Bunlar içinde ADALET bandı: en iyi adalet maliyetine `tolerance` kadar yakın olanlar.
    //   3. Bant içinde ikincil kurallar (yıldız yığılması, hat dengesi) en iyi olanlar.
    // Böylece çeşitlilik bandın İÇİNDE kalıyor ama ikincil kuralları yutamıyor (Tur 3 · A2).
    const scored = [...candidates.entries()].map(([key, r]) => ({
      key,
      result: r,
      coverage: this.keeperCoverage(players, r.a, r.b),
      fairness: this.fairnessCost(players, r.a, r.b),
      secondary: this.secondaryCost(players, r.a, r.b),
    }));
    const bestCoverage = Math.max(...scored.map((c) => c.coverage));
    const averageGap = (c: { result: { a: number[]; b: number[] } }): number => {
      const sum = (idx: number[]): number => idx.reduce((t, i) => t + players[i].ratings.overall, 0);
      return Math.abs(sum(c.result.a) - sum(c.result.b)) / half;
    };
    const coveredAll = scored.filter((c) => c.coverage === bestCoverage);
    const winDeviation = (c: { result: { a: number[]; b: number[] } }): number => {
      const strength = (idx: number[]): number => weakLinkStrength(idx.map((i) => players[i].ratings.overall));
      return Math.abs(winProbability(strength(c.result.a), strength(c.result.b)) - 0.5);
    };
    /*
     * İki görünür ölçü (ortalama fark + tahmini kazanma) BİRLİKTE değerlendirilir: önce birini
     * sınırlamak ötekinin en dengeli bölüşümlerini eliyordu (ölçüldü: 4v4'te %60/40 dışı kura,
     * dengeli bölüşüm mümkünken). Her aday iki ölçüde "en iyiden fazlası / izin" toplamıyla
     * puanlanır; en iyi puana bir izin payı kadar yakın olanlar kalır. İkisi de sınır içinde
     * olan bir aday varsa en iyi puan <= 2, yani kalanlar ikisini birden aşamaz.
     */
    const bestGap = Math.min(...coveredAll.map(averageGap));
    const bestDeviation = Math.min(...coveredAll.map(winDeviation));
    const visible = (c: { result: { a: number[]; b: number[] } }): number =>
      (averageGap(c) - bestGap) / MAX_EXTRA_AVERAGE_GAP + (winDeviation(c) - bestDeviation) / MAX_EXTRA_WIN_DEVIATION;
    const bestVisible = Math.min(...coveredAll.map(visible));
    const covered = coveredAll.filter((c) => visible(c) <= bestVisible + 1 + 1e-9);
    const bestFairness = Math.min(...covered.map((c) => c.fairness));
    const fairBand = covered.filter((c) => c.fairness <= bestFairness + tolerance);
    /*
     * "En iyi iki oyuncu aynı takımda" ikincil bandın içinde YUTULABİLİYORDU (diğer ikincil
     * terimler küçükse 2,0'lık ceza bandın içine giriyordu — ölçüldü: 3 kaleci + 8v8). Kural
     * kaçınılabildiği sürece kesin uygulanır.
     */
    const separated = fairBand.filter(
      (c) => !this.topTwoTogether(players, c.result.a) && !this.topTwoTogether(players, c.result.b),
    );
    const withinBand = separated.length ? separated : fairBand;
    const bestSecondary = Math.min(...withinBand.map((c) => c.secondary));
    const fairCandidates: [string, { a: number[]; b: number[]; cost: number }][] = withinBand
      .filter((c) => c.secondary <= bestSecondary + SECONDARY_TOLERANCE + 1e-9)
      .map((c) => [c.key, c.result]);
    // Kadro ekranındaki önizleme kurayı ÇEKMEZ, sadece "en iyi bölüşüm ne kadar dengeli"
    // sorusunu cevaplar; oradaki değerin her bakışta değişmemesi için deterministik mod var
    // (Tur 3 · A3: şerit ±0,0 → ±1,0 → ±2,0 arasında zıplıyordu).
    const best = options.deterministic
      ? [...fairCandidates].sort((x, y) => x[1].cost - y[1].cost || x[0].localeCompare(y[0]))[0][1]
      : this.pickAmongFairest(fairCandidates, options.avoidSignature, random);

    /*
     * Bandın FARK ARALIĞI: kura banttan rastgele seçtiği için kullanıcının göreceği fark
     * bir aralıktır, tek sayı değil. Önizleme bunu söylemezse "±0,1 dedi, ±1,0 verdi"
     * şikâyeti çıkıyor (tarayıcı testi).
     */
    const gapOf = (split: { a: number[]; b: number[] }): number => {
      const ort = (idx: number[]): number =>
        idx.reduce((t, i) => t + players[i].ratings.overall, 0) / (idx.length || 1);
      return Math.abs(ort(split.a) - ort(split.b));
    };
    const gaps = fairCandidates.map(([, r]) => gapOf(r));
    const fairGapRange = { min: Math.min(...gaps), max: Math.max(...gaps) };

    const aggregateA = this.aggregate(players, best.a);
    const aggregateB = this.aggregate(players, best.b);

    return {
      teamAPlayerIds: best.a.map((index) => players[index].id),
      teamBPlayerIds: best.b.map((index) => players[index].id),
      cost: best.cost,
      weakKeeper: this.weakKeeperSide(aggregateA, aggregateB, threshold),
      keeperCounts: { A: aggregateA.keeperCount, B: aggregateB.keeperCount },
      signature: this.signatureOf(players, best.a, best.b),
      fairAlternatives: fairCandidates.length,
      fairGapRange,
      spread: { A: aggregateA.standardDeviation, B: aggregateB.standardDeviation },
      winChance: (() => {
        const a = winProbability(aggregateA.weakLinkStrength, aggregateB.weakLinkStrength);
        return { A: a, B: 1 - a };
      })(),
    };
  }

  /** Kaç takımda gerçek kaleci (mevkisi KAL) var — 0, 1 ya da 2. Büyük olan tercih edilir. */
  private keeperCoverage(players: readonly Player[], a: number[], b: number[]): number {
    const has = (side: number[]): number => (side.some((i) => players[i].ratings.position === 'KAL') ? 1 : 0);
    return has(a) + has(b);
  }

  /**
   * Bölüşümün taraftan bağımsız kimliği: A/B yer değiştirmiş iki sonuç AYNI kuradır,
   * bu yüzden imza "en küçük id'yi içeren takımın sıralı id listesi" olarak üretilir.
   */
  private signatureOf(players: readonly Player[], a: number[], b: number[]): string {
    const idsA = a.map((i) => players[i].id).sort();
    const idsB = b.map((i) => players[i].id).sort();
    const [first, second] = idsA[0] < idsB[0] ? [idsA, idsB] : [idsB, idsA];
    return `${first.join(',')}|${second.join(',')}`;
  }

  /**
   * Adil adaylar arasından rastgele birini seçer. `avoidSignature` verilirse (bkz.
   * "Kurayı yenile") o bölüşüm elenmeye çalışılır — ama başka aday yoksa geri dönülür:
   * adalet, çeşitlilikten önce gelir. Kaç adil aday olduğu `fairAlternatives` ile
   * dışarı verilir ki arayüz "başka adil bölüşüm yok" diyebilsin.
   */
  private pickAmongFairest(
    fairCandidates: [string, { a: number[]; b: number[]; cost: number }][],
    avoidSignature: string | undefined,
    random: () => number,
  ): { a: number[]; b: number[]; cost: number } {
    const withoutAvoided = avoidSignature ? fairCandidates.filter(([key]) => key !== avoidSignature) : fairCandidates;
    const pool = withoutAvoided.length ? withoutAvoided : fairCandidates;
    return pool[Math.floor(random() * pool.length)][1];
  }

  private localSearch(
    players: readonly Player[],
    initialA: number[],
    initialB: number[],
    onVisit?: (state: { a: number[]; b: number[]; cost: number }) => void,
  ): { a: number[]; b: number[]; cost: number } {
    let a = [...initialA];
    let b = [...initialB];
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 0; i < a.length; i++) {
        for (let j = 0; j < b.length; j++) {
          const candidateA = [...a];
          const candidateB = [...b];
          [candidateA[i], candidateB[j]] = [candidateB[j], candidateA[i]];
          const candidateCost = this.cost(players, candidateA, candidateB);
          if (candidateCost < this.cost(players, a, b) - 1e-9) {
            a = candidateA;
            b = candidateB;
            improved = true;
            onVisit?.({ a: [...a], b: [...b], cost: candidateCost });
          }
        }
      }
    }
    return { a, b, cost: this.cost(players, a, b) };
  }

  /**
   * Toplam maliyet = adalet + ikincil kurallar. Tepe tırmanma bunu küçültür; SEÇİM ise iki
   * bileşeni ayrı ayrı kullanır (bkz. `balance`): adalet toleransla bantlanır, ikincil
   * kurallar bant içinde en iyi olanı seçer.
   */
  private cost(players: readonly Player[], a: number[], b: number[]): number {
    return this.fairnessCost(players, a, b) + this.secondaryCost(players, a, b);
  }

  /** Yıldız yığılması, hat dağılımı ve reyting DAĞILIMI — "eşit derecede adil" adaylar arasında ayırır. */
  private secondaryCost(players: readonly Player[], a: number[], b: number[]): number {
    const aggA = this.aggregate(players, a);
    const aggB = this.aggregate(players, b);
    return (
      this.lineImbalance(aggA, aggB) * BALANCE_WEIGHTS.lineCountDiff +
      (this.topTwoTogether(players, a) || this.topTwoTogether(players, b)
        ? BALANCE_WEIGHTS.topTalentTogether
        : 0) +
      Math.abs(aggA.standardDeviation - aggB.standardDeviation) * BALANCE_WEIGHTS.stdDevDiff +
      Math.abs(aggA.ratingRange - aggB.ratingRange) * BALANCE_WEIGHTS.rangeDiff +
      this.rankProfileDiff(players, a, b) * BALANCE_WEIGHTS.rankProfile
    );
  }

  /**
   * Saf denge: reyting toplamı, zayıf halka ağırlıklı güç, kaleci kalitesi ve altı yüz puanının
   * ortalamaları. Zayıf halka farkı oyuncu başına ölçülür, takım boyutuyla çarpılıp toplamla
   * aynı ölçeğe getirilir.
   */
  private fairnessCost(players: readonly Player[], a: number[], b: number[]): number {
    const aggA = this.aggregate(players, a);
    const aggB = this.aggregate(players, b);
    const size = Math.max(a.length, b.length);
    return (
      Math.abs(aggA.overallSum - aggB.overallSum) * BALANCE_WEIGHTS.overallSum +
      Math.abs(aggA.weakLinkStrength - aggB.weakLinkStrength) * size * BALANCE_WEIGHTS.weakLinkStrength +
      Math.abs(aggA.passingAverage - aggB.passingAverage) * BALANCE_WEIGHTS.passingAverage +
      Math.abs(aggA.dribblingAverage - aggB.dribblingAverage) * BALANCE_WEIGHTS.dribblingAverage +
      Math.abs(aggA.physicalAverage - aggB.physicalAverage) * BALANCE_WEIGHTS.physicalAverage +
      Math.abs(aggA.bestGoalkeeping - aggB.bestGoalkeeping) * BALANCE_WEIGHTS.bestGoalkeeping +
      Math.abs(aggA.defendingAverage - aggB.defendingAverage) * BALANCE_WEIGHTS.defendingAverage +
      Math.abs(aggA.shootingAverage - aggB.shootingAverage) * BALANCE_WEIGHTS.shootingAverage +
      Math.abs(aggA.paceAverage - aggB.paceAverage) * BALANCE_WEIGHTS.paceAverage
    );
  }

  /** Sıra sıra eşleşme farkı, oyuncu başına: güçten zayıfa dizili k. oyuncuların farkı. */
  private rankProfileDiff(players: readonly Player[], a: number[], b: number[]): number {
    const sorted = (side: number[]): number[] => side.map((i) => players[i].ratings.overall).sort((x, y) => y - x);
    const sa = sorted(a);
    const sb = sorted(b);
    const len = Math.min(sa.length, sb.length);
    let sum = 0;
    for (let k = 0; k < len; k++) sum += Math.abs(sa[k] - sb[k]);
    return len ? sum / len : 0;
  }

  /** n oyuncunun 0. oyuncuyu içeren bütün n/2'lik alt kümeleri (A/B simetrisi tekrar etmesin). */
  private allSplits(n: number): number[][] {
    const half = n / 2;
    const out: number[][] = [];
    const current: number[] = [0];
    const walk = (start: number): void => {
      if (current.length === half) {
        out.push([...current]);
        return;
      }
      for (let i = start; i <= n - (half - current.length); i++) {
        current.push(i);
        walk(i + 1);
        current.pop();
      }
    };
    walk(1);
    return out;
  }

  /** Popülasyon standart sapması — takımın homojen mi, uçlardan mı kurulu olduğunu söyler. */
  private standardDeviation(values: readonly number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  }

  /** DEF/OS/FOR hatlarındaki oyuncu sayısı farklarının toplamı. */
  private lineImbalance(a: TeamAggregate, b: TeamAggregate): number {
    // KAL dahil: kaleci kapsaması ayrı bir adım olsa da, iki kaleci varken ikisinin de aynı
    // takıma düşmesi bir hat dengesizliğidir ve burada da sayılmalı (Tur 3 · A4).
    return (['KAL', 'DEF', 'OS', 'FOR'] as const).reduce(
      (sum, position) => sum + Math.abs(a.lineCounts[position] - b.lineCounts[position]),
      0,
    );
  }

  /** Kadronun en yüksek reytingli iki oyuncusu da bu takımda mı. */
  private topTwoTogether(players: readonly Player[], side: number[]): boolean {
    if (players.length < 4) return false;
    const ranked = players
      .map((p, index) => ({ index, overall: p.ratings.overall }))
      .sort((x, y) => y.overall - x.overall)
      .slice(0, 2)
      .map((r) => r.index);
    return ranked.every((index) => side.includes(index));
  }

  private aggregate(players: readonly Player[], indices: number[]): TeamAggregate {
    const group = indices.map((index) => players[index]);
    const average = (pick: (r: Player['ratings']) => number): number =>
      group.length ? group.reduce((sum, p) => sum + pick(p.ratings), 0) / group.length : 0;
    return {
      overallSum: group.reduce((sum, p) => sum + p.ratings.overall, 0),
      standardDeviation: this.standardDeviation(group.map((p) => p.ratings.overall)),
      ratingRange: group.length ? Math.max(...group.map((p) => p.ratings.overall)) - Math.min(...group.map((p) => p.ratings.overall)) : 0,
      keeperCount: group.filter((p) => p.ratings.position === 'KAL').length,
      lineCounts: {
        KAL: group.filter((p) => p.ratings.position === 'KAL').length,
        DEF: group.filter((p) => p.ratings.position === 'DEF').length,
        OS: group.filter((p) => p.ratings.position === 'OS').length,
        FOR: group.filter((p) => p.ratings.position === 'FOR').length,
      },
      bestGoalkeeping: group.reduce((max, p) => Math.max(max, p.ratings.goalkeeping), 0),
      defendingAverage: average((r) => r.defending),
      shootingAverage: average((r) => r.shooting),
      paceAverage: average((r) => r.pace),
      passingAverage: average((r) => r.passing),
      dribblingAverage: average((r) => r.dribbling),
      physicalAverage: average((r) => r.physical),
      weakLinkStrength: weakLinkStrength(group.map((p) => p.ratings.overall)),
    };
  }

  /** Eşikte iki takım da düşükse daha zayıf olanı işaretler. */
  private weakKeeperSide(a: TeamAggregate, b: TeamAggregate, threshold: number): DrawResult['weakKeeper'] {
    const aWeak = a.bestGoalkeeping < threshold;
    const bWeak = b.bestGoalkeeping < threshold;
    if (!aWeak && !bWeak) return null;
    if (aWeak && !bWeak) return 'A';
    if (bWeak && !aWeak) return 'B';
    return a.bestGoalkeeping <= b.bestGoalkeeping ? 'A' : 'B';
  }

  private shuffle(indices: number[], random: () => number): number[] {
    const result = [...indices];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}
