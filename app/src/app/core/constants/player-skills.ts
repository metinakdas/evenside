import type { PlayerInput } from '../models/player.model';

/**
 * ALT ÖZELLİKLER — kartın altı yüz puanı (HIZ ŞUT PAS DRİ DEF FİZ) artık bunlardan hesaplanır.
 *
 * Kaynak ve gerekçe (bkz. proje notları):
 * - Yapı EA FC'nin yüz puanı hesabından uyarlandı: her yüz puanı alt özelliklerin AĞIRLIKLI
 *   ortalaması (ör. HIZ = %45 ivme + %55 sprint). Halı sahada olmayanlar (frikik, penaltı,
 *   kayarak müdahale, orta) çıkarıldı ya da birleştirildi; halı sahada belirleyici olanlar
 *   (ikili mücadele, kale hakimiyeti = ayakla oyun dahil) eklendi.
 * - Küçük saha araştırmaları: 5v5/7v7'de kalp atışı yükü ve ivmelenme/yavaşlama sayısı yüksek;
 *   bu yüzden HIZ'da ivmenin, FİZ'de dayanıklılığın payı EA'dakinden büyük.
 * - Öz değerlendirme yanlılığı (insanlar kendini ortalamanın üstünde görür): her puan
 *   seviyesinin yanında SOMUT bir davranış örneği gösterilir (davranış çapalı ölçek, BARS) —
 *   "7 mi 8 mi" yerine "uzaktan şutu çerçeveyi bulur mu" sorusu cevaplanır.
 */
export type SkillKey =
  | 'ivme' | 'sprint' | 'dayaniklilik' | 'kuvvet' | 'ceviklik'
  | 'bitiricilik' | 'sutGucu' | 'uzaktanSut' | 'kafa'
  | 'kisaPas' | 'uzunPas' | 'vizyon' | 'topKontrol' | 'dripling'
  | 'topKapma' | 'markaj' | 'arayaGirme' | 'mucadele'
  | 'refleks' | 'kaleHakimiyeti';

export type PlayerSkills = Record<SkillKey, number>;
export type PreferredFoot = 'sag' | 'sol' | 'iki';
export type SkillGroup = 'fizik' | 'hucum' | 'oyun' | 'savunma' | 'kale';

/** Formdaki adımlar ve her adımın alt özellikleri (sözlük anahtarı = `beceri.<anahtar>`). */
export const SKILL_GROUPS: { id: SkillGroup; skills: SkillKey[] }[] = [
  { id: 'fizik', skills: ['ivme', 'sprint', 'dayaniklilik', 'kuvvet', 'ceviklik'] },
  { id: 'hucum', skills: ['bitiricilik', 'sutGucu', 'uzaktanSut', 'kafa'] },
  { id: 'oyun', skills: ['kisaPas', 'uzunPas', 'vizyon', 'topKontrol', 'dripling'] },
  { id: 'savunma', skills: ['topKapma', 'markaj', 'arayaGirme', 'mucadele'] },
  { id: 'kale', skills: ['refleks', 'kaleHakimiyeti'] },
];

export const SKILL_KEYS: SkillKey[] = SKILL_GROUPS.flatMap((g) => g.skills);

/** Puanın davranış bandı: 0-3 zayıf · 4-6 orta · 7-8 iyi · 9-10 çok iyi (çapa metni bu banda göre). */
export function skillBand(value: number): 1 | 2 | 3 | 4 {
  if (value <= 3) return 1;
  if (value <= 6) return 2;
  if (value <= 8) return 3;
  return 4;
}

const r = (n: number) => Math.max(0, Math.min(10, Math.round(n)));
const avg = (...xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Alt özelliği olmayan (eski) kartlar için tahmin: eski altı kaydırıcıdan alt özellikler.
 * Hiçbir kartın verisi kaybolmaz; eski kartlar da yeni formülden geçer.
 */
export function skillsFromLegacy(i: PlayerInput): PlayerSkills {
  return {
    ivme: r(i.pace), sprint: r(i.pace), dayaniklilik: r(i.stamina),
    kuvvet: r(avg(i.stamina, i.defending)), ceviklik: r(avg(i.pace, i.midfield)),
    bitiricilik: r(i.attacking), sutGucu: r(i.attacking), uzaktanSut: r(avg(i.attacking, i.midfield)),
    kafa: r(avg(i.defending, i.attacking)),
    kisaPas: r(i.midfield), uzunPas: r(i.midfield), vizyon: r(i.midfield),
    topKontrol: r(avg(i.midfield, i.attacking)), dripling: r(i.midfield * 0.55 + i.attacking * 0.45),
    topKapma: r(i.defending), markaj: r(i.defending), arayaGirme: r(i.defending), mucadele: r(avg(i.defending, i.stamina)),
    refleks: r(i.goalkeeping), kaleHakimiyeti: r(i.goalkeeping),
  };
}

/** Oyuncunun geçerli alt özellikleri: kayıtlıysa onlar, değilse eski alanlardan tahmin. */
export function effectiveSkills(i: PlayerInput): PlayerSkills {
  return i.skills ? { ...skillsFromLegacy(i), ...i.skills } : skillsFromLegacy(i);
}

/**
 * Alt özelliklerden ESKİ altı alanı geri üretir. Veritabanının eski sütunları, kura
 * dengeleyicinin ve anketin okuduğu alanlar dolu kalsın diye kayıtta yazılır.
 */
export function legacyFromSkills(s: PlayerSkills): Pick<PlayerInput, 'goalkeeping' | 'defending' | 'midfield' | 'attacking' | 'pace' | 'stamina'> {
  return {
    goalkeeping: r(avg(s.refleks, s.kaleHakimiyeti)),
    defending: r(avg(s.topKapma, s.markaj, s.arayaGirme, s.mucadele)),
    midfield: r(avg(s.kisaPas, s.uzunPas, s.vizyon, s.topKontrol)),
    attacking: r(avg(s.bitiricilik, s.sutGucu, s.uzaktanSut)),
    pace: r(avg(s.ivme, s.sprint)),
    stamina: r(s.dayaniklilik),
  };
}
