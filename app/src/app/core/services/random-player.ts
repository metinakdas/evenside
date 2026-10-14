import { PlayerInput } from '../models/player.model';

/**
 * "Rastgele oyuncu ekle" için hızlı sahte veri üretici — kadroyu test/kura
 * denemesi amacıyla çabucak doldurmak içindir, gerçek oyuncu verisi değildir.
 * Saf fonksiyon, DI gerektirmez.
 */
const FIRST_NAMES = [
  'Ahmet', 'Mehmet', 'Mustafa', 'Emre', 'Burak', 'Cem', 'Deniz', 'Kaan',
  'Onur', 'Serkan', 'Barış', 'Tolga', 'Uğur', 'Volkan', 'Yusuf', 'Berk',
  'Caner', 'Eren', 'Fatih', 'Gökhan', 'Hakan', 'İlker', 'Kerem', 'Murat',
];

const LAST_NAMES = [
  'Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Aydın', 'Özdemir',
  'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Koç', 'Kurt', 'Özkan',
  'Şimşek', 'Polat', 'Erdoğan', 'Güneş', 'Bulut', 'Aksoy', 'Türk', 'Yalçın',
];

const POSITION_KEYS = ['goalkeeping', 'defending', 'midfield', 'attacking'] as const;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(list: readonly T[]): T {
  return list[randomInt(0, list.length - 1)];
}

/** Rastgele, gerçekçi-görünümlü bir `PlayerInput` üretir — bir mevkide güçlü, diğerlerinde vasat. */
export function randomPlayerInput(): PlayerInput {
  const primary = pick(POSITION_KEYS);
  const positions = Object.fromEntries(
    POSITION_KEYS.map((key) => [key, key === primary ? randomInt(6, 10) : randomInt(1, 6)]),
  ) as Record<(typeof POSITION_KEYS)[number], number>;

  return {
    name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    shirtNumber: String(randomInt(1, 99)),
    countryCode: 'TR',
    flagImage: null,
    photoImage: null,
    heightCm: randomInt(165, 195),
    weightKg: randomInt(62, 95),
    smoker: Math.random() < 0.3,
    ...positions,
    pace: randomInt(3, 10),
    stamina: randomInt(3, 10),
    goalsPerMatch: Math.round(Math.random() * Math.random() * 25) / 10,
  };
}
