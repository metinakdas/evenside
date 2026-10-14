import type { PlayerSkills, PreferredFoot } from '../constants/player-skills';

export type PlayerPosition = 'KAL' | 'DEF' | 'OS' | 'FOR';
export type PlayerTier = 'bronze' | 'silver' | 'gold' | 'special';

/**
 * Ham girdi — kullanıcının formda girdiği değerler.
 * Türetilmiş puanlarla asla üzerine yazılmaz: bir oyuncu düzenlemeye açıldığında
 * form her zaman bu nesneden doldurulur, böylece formül değişse bile tüm oyuncular
 * kayıpsız yeniden hesaplanabilir.
 */
export interface PlayerInput {
  name: string;
  shirtNumber: string;
  countryCode: string;
  /** data URL veya null */
  flagImage: string | null;
  /** data URL veya null */
  photoImage: string | null;
  heightCm: number;
  weightKg: number;
  smoker: boolean;
  /** 0-10 */
  goalkeeping: number;
  /** 0-10 */
  defending: number;
  /** 0-10 */
  midfield: number;
  /** 0-10 */
  attacking: number;
  /** 0-10 */
  pace: number;
  /** 0-10 */
  stamina: number;
  goalsPerMatch: number;
  /**
   * "Bu oyuncu hiç kaleye geçemez" (10 Ekim 2026). İşaretliyse kalecilik puanı 1'e iner, mevki
   * asla KAL olmaz, saha yerleşimi ve kale sırası onu kaleye KOYMAZ (başka seçenek yoksa bile
   * önce herkes denenir). Veritabanında `attributes.nk`.
   */
  noKeeper?: boolean;
  /**
   * 20 alt özellik (0-10). Yoksa (eski kart) eski altı alandan tahmin edilir —
   * bkz. `effectiveSkills`. Eski altı alan kayıtta bunlardan yeniden üretilir.
   */
  skills?: PlayerSkills;
  /** Tercih edilen ayak: iki ayaklı oyuncu ŞUT ve PAS'ta küçük bir artı alır. */
  preferredFoot?: PreferredFoot;
  /** Yaş (isteğe bağlı): 32'den sonra HIZ, 35'ten sonra FİZ hafifçe düşer. */
  age?: number | null;
}

/**
 * Türetilmiş değerler — her zaman `RatingService.calculate(input)` ile üretilir,
 * elle set edilmez.
 */
export interface PlayerRatings {
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
  /** Kartta gösterilmez; sadece mevki seçiminde ve takım dengelemede kullanılır. */
  goalkeeping: number;
  position: PlayerPosition;
  overall: number;
  tier: PlayerTier;
}

export interface Player {
  id: string;
  input: PlayerInput;
  ratings: PlayerRatings;
  /**
   * Kartın SAHİBİ olan kullanıcı ("kendi kartım"). Boş/tanımsız = kadro sahibinin havuza elle
   * eklediği sıradan kart. Sahiplik yalnızca kimlik ve yetki bilgisidir; kartın kadrodaki
   * davranışını değiştirmez — sahipli kart da aynı puan hattından geçer.
   */
  ownerId?: string | null;
  /**
   * Bu kart başka bir karta EŞLENDİYSE hedefin id'si. Satır silinmez: eski kadrolar ve
   * kaydedilmiş kuralar hâlâ bu id'ye bakıyor olabilir, okuma sırasında yönlendirme çözülür
   * (bkz. `PlayerRepositoryService.resolveId`).
   */
  mergedInto?: string | null;
  /** Kartı en son değiştiren kullanıcı — sahipli kartta "kim değiştirdi" sorusunun cevabı. */
  lastEditedBy?: string | null;
}
