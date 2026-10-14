import { PlayerPosition } from './player.model';
import { TeamSide } from './team.model';

/** Maç formatı — takım başına oyuncu sayısı. Toplam kadro = format × 2. */
/**
 * Saha formatı: taraf başına oyuncu sayısı. Halı saha 6-8 ile başladı; 9-11 ve ardından
 * 4-5 sonradan eklendi (kullanıcı isteği) — her yeni format için `FORMATIONS` ve `FORMATION_PRESETS`
 * girdisi ZORUNLU, yoksa saha yerleşimi boş çıkar.
 */
export type SquadFormat = 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

/** Bir takımın dengeleme maliyetinde kullanılan özet değerleri. */
export interface TeamAggregate {
  overallSum: number;
  /** Mevkisi KAL olan oyuncu sayısı — kaleci kapsaması bunu okur. */
  keeperCount: number;
  /** Mevki başına oyuncu sayısı — hat dengesi terimi bunu okur. */
  lineCounts: Record<PlayerPosition, number>;
  /** Reytinglerin standart sapması — takım homojen mi, uçlardan mı kurulu. */
  standardDeviation: number;
  /** En iyi ile en kötü oyuncunun reyting farkı. */
  ratingRange: number;
  bestGoalkeeping: number;
  defendingAverage: number;
  shootingAverage: number;
  paceAverage: number;
  passingAverage: number;
  dribblingAverage: number;
  physicalAverage: number;
  /** Zayıf halka ağırlıklı takım gücü (oyuncu başı reyting ölçeğinde). */
  weakLinkStrength: number;
}

export interface DrawResult {
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  /** Bulunan bölüşümün ağırlıklı maliyeti — düşük olması daha dengeli demektir. */
  cost: number;
  /** Bir takımda kaleciliğe yetecek oyuncu yoksa o takım işaretlenir. */
  weakKeeper: TeamSide | null;
  /**
   * Takım başına gerçek (mevkisi KAL olan) kaleci sayısı. Havuzda iki kaleci varsa
   * dağıtım her ikisini de 1 yapmak zorundadır; 0 kalması yalnızca havuzda yeterli
   * kaleci olmadığı anlamına gelir ve arayüzde uyarı olarak gösterilir.
   */
  keeperCounts: { A: number; B: number };
  /**
   * Bölüşümün taraftan bağımsız kimliği. "Kurayı yenile" bunu bir sonraki çekilişe
   * `avoidSignature` olarak geri verir, böylece aynı bölüşüm arka arkaya çıkmaz.
   */
  signature: string;
  /**
   * Adil banda giren bölüşümlerin ortalama-reyting FARK ARALIĞI (en dar - en geniş).
   *
   * Kura banttan rastgele seçer; kadro ekranındaki önizleme ise deterministik, yani bandın
   * EN İYİSİNİ gösteriyordu. Kullanıcı "±0,1" görüp kurada "±1,0" alıyordu (tarayıcı
   * testinde bildirildi) ve bunu hata sanıyordu. Arayüz artık aralığı gösterebiliyor.
   */
  fairGapRange: { min: number; max: number };
  /**
   * Toleransa giren farklı bölüşüm sayısı. 1 ise bu kadro için gerçekten tek adil
   * bölüşüm var demektir — arayüz `Kurayı yenile` sonrası bunu söyler, kullanıcı
   * sonucun değişmemesini hata sanmasın (kontrol raporu B1).
   */
  fairAlternatives: number;
  /**
   * Takımların reyting dağılımı (standart sapma). Ortalama eşit olsa bile bu iki sayı çok
   * farklıysa takımlar sahada aynı hissettirmez; arayüz bunu kullanıcıya gösterir (Tur 4 · Y1).
   */
  spread: { A: number; B: number };
  /**
   * Tahmini kazanma ihtimali (0-1), zayıf halka ağırlıklı takım gücünden. Dengeli kadronun
   * tanımı bunun %50'ye yakın olması. İlk tahmin; skorlar biriktikçe kalibre edilmeli.
   */
  winChance: { A: number; B: number };
}

export interface BalanceOptions {
  /** Verilirse rastgeleliği sabitler; aynı seed aynı sonucu üretir. */
  seed?: number;
  /** Rastgele başlangıç (restart) sayısı. Varsayılan: 60. */
  restarts?: number;
  /** Bir takımın en iyi kaleci puanının altına düşmemesi gereken eşik. Varsayılan: 55. */
  weakKeeperThreshold?: number;
  /** Eniyiye bu kadar yakın bölüşümler eşit adil sayılır ve aralarından rastgele seçilir. */
  costTolerance?: number;
  /** Verilirse bu bölüşüm (varsa başka aday) seçilmez — arka arkaya aynı kura çıkmasın diye. */
  avoidSignature?: string;
  /**
   * Rastgele seçim yerine her zaman aynı (en iyi) bölüşümü döndürür. Kadro ekranındaki denge
   * önizlemesi bunu kullanır: orada gösterilen sayı bir vaat, kura değil (Tur 3 · A3).
   */
  deterministic?: boolean;
}
