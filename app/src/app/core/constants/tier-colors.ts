import { PlayerTier } from '../models/player.model';

/**
 * Tier'a göre kart renkleri. Değerler "Futbolcu Karti" referans tasarımından birebir alındı;
 * `PlayerCardComponent` (CSS) ve `PitchExportService` (canvas) aynı kaynaktan beslenir ki iki
 * görünüm sapmasın.
 *
 * Referans kartın kontrast kuralı: yüzey açık (altın/gümüş/bronz) → koyu mürekkep; yüzey koyu
 * (`special`) → parlak sarı mürekkep. Metnin arkasında plaka/chip YOK.
 */
export interface TierGradientStop {
  color: string;
  /** 0-100 arası gradyan durağı yüzdesi. */
  at: number;
}

/** Gradyan açısı da tier'ın bir parçası — referansta özel kart 160deg, metalikler 155deg. */
export const TIER_GRADIENT_ANGLE: Record<PlayerTier, number> = {
  special: 160,
  gold: 155,
  silver: 155,
  bronze: 155,
};

export const TIER_GRADIENT_STOPS: Record<PlayerTier, TierGradientStop[]> = {
  special: [
    { color: '#4a0d63', at: 0 },
    { color: '#7b18a8', at: 32 },
    { color: '#2a0640', at: 60 },
    { color: '#a028cc', at: 84 },
    { color: '#4a0d63', at: 100 },
  ],
  gold: [
    { color: '#fff5c9', at: 0 },
    { color: '#f4d777', at: 26 },
    { color: '#c9a02c', at: 58 },
    { color: '#fbeab0', at: 76 },
    { color: '#cfa733', at: 100 },
  ],
  silver: [
    { color: '#fdfdfe', at: 0 },
    { color: '#dfe3e8', at: 26 },
    { color: '#9ba1aa', at: 58 },
    { color: '#eef1f4', at: 76 },
    { color: '#b4bac2', at: 100 },
  ],
  bronze: [
    { color: '#f0cfa8', at: 0 },
    { color: '#c9946a', at: 28 },
    { color: '#8f6440', at: 58 },
    { color: '#dcb188', at: 76 },
    { color: '#a3714b', at: 100 },
  ],
};

/** Kartın üzerindeki tüm mürekkep (reyting, mevki, isim, istatistikler, çizgiler). */
export const TIER_TEXT_COLOR: Record<PlayerTier, string> = {
  special: '#ffd84d',
  gold: '#3a2e08',
  silver: '#23262b',
  bronze: '#3b2413',
};

/**
 * Kartın 3px'lik dış çerçevesi. Referansta metalik kartlarda yüzeyin koyu tonu, özel kartta
 * ise altın sarısı — yani mürekkeple aynı renk.
 */
export const TIER_BORDER_COLOR: Record<PlayerTier, string> = {
  special: '#ffd84d',
  gold: '#8a6a10',
  silver: '#6c727b',
  bronze: '#6d4526',
};

/** 115deg'lik parlama şeridinin rengi — koyu yüzeyde pembe, metalikte beyaz/krem. */
export const TIER_SHINE_COLOR: Record<PlayerTier, string> = {
  special: 'rgba(255,150,255,.32)',
  gold: 'rgba(255,255,255,.65)',
  silver: 'rgba(255,255,255,.7)',
  bronze: 'rgba(255,240,220,.5)',
};

/**
 * Tier'ın tek renkli karşılığı — gradyanın sığmadığı küçük yüzeyler için (havuz listesindeki
 * 28px avatar gibi). Gradyanın ilk durağını kullanır, böylece kartla aynı aileden kalır.
 */
export const TIER_SOLID_COLOR: Record<PlayerTier, string> = {
  bronze: TIER_GRADIENT_STOPS.bronze[0].color,
  silver: TIER_GRADIENT_STOPS.silver[0].color,
  gold: TIER_GRADIENT_STOPS.gold[0].color,
  special: TIER_GRADIENT_STOPS.special[0].color,
};

export function tierCssGradient(tier: PlayerTier): string {
  const stops = TIER_GRADIENT_STOPS[tier].map((s, i) => (i === 0 ? s.color : `${s.color} ${s.at}%`));
  return `linear-gradient(${TIER_GRADIENT_ANGLE[tier]}deg,${stops.join(',')})`;
}

/** Referanstaki `linear-gradient(115deg, transparent, <shine>, transparent)` parlama katmanı. */
export function tierShineGradient(tier: PlayerTier): string {
  return `linear-gradient(115deg,transparent 34%,${TIER_SHINE_COLOR[tier]} 45%,transparent 58%)`;
}
