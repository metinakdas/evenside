import { PlayerInput } from '../models/player.model';
import { PlayerSkills, PreferredFoot, SKILL_KEYS, SkillKey, legacyFromSkills } from './player-skills';

/**
 * "KENDİNİ TANIT" ANKETİ — 2. sürüm (10 Ekim 2026). Bkz. proje notları.
 *
 * Anket elle girilen formla AYNI veriyi üretir: 20 alt özellik + kullandığı ayak + yaş. Karta
 * dönüşmesi yine `RatingService.calculate` ile olur — anketten gelen kartla formdan gelen kart
 * aynı formülden geçer, iki ayrı puan hattı yoktur.
 *
 * Sorular "kendini 1-10 puanla" diye sormaz: insanlar kendini sistematik olarak ortalamanın
 * üstünde görür. Her soru sahadaki SOMUT bir anı sorar ("top boşa düştü, ikiniz koştunuz —
 * genelde ne olur?") ve seçenekler formdaki davranış çapalarıyla aynı bantlara oturur:
 * en iyi seçenek 9 (çok iyi), sonra 6-7 (iyi/orta), 4 (orta-altı), 1-2 (zayıf).
 *
 * KRİTİK: anket 20 alt özelliğin HEPSİNİ beslemek zorunda. Beslenmeyen beceri 0 olur; örneğin
 * kale sorusu düşerse anketten gelen hiç kimse kaleci olamaz ve kura iki takıma kaleci
 * bulamaz. Kapsama testi (`self-card-quiz.spec.ts`) bunu ölçüyor.
 */

export interface QuizOption {
  /** Seçenek metninin SÖZLÜK ANAHTARI (`anket.*`); ekranda `t()` ile çözülür. */
  label: string;
  /** Bu seçeneğin hangi beceriye kaç puan yazdığı (0-10). */
  effects: Partial<Record<SkillKey, number>>;
  /** Kullandığı ayak sorusunun cevabı. */
  foot?: PreferredFoot;
  /** Yaş sorusunun cevabı (aralığın temsilî değeri). */
  age?: number;
  /** "Kaleye geçmem" → kart "hiç kaleye geçemez" işaretli olur (formdaki anahtarla aynı). */
  noKeeper?: boolean;
  /** Sigara sorusunun cevabı. */
  smoker?: boolean;
  /** Maç başı gol sorusunun cevabı (aralığın temsilî değeri). */
  goals?: number;
}

export interface QuizQuestion {
  id: string;
  /** Soru metninin SÖZLÜK ANAHTARI (`anket.*`). */
  text: string;
  options: QuizOption[];
}

const o = (label: string, effects: Partial<Record<SkillKey, number>>, extra: Partial<QuizOption> = {}): QuizOption => ({
  label,
  effects,
  ...extra,
});

/**
 * Sorular ürün kararıdır: sırası ve metni değişebilir ama her seçeneğin hangi beceriyi
 * beslediği `effects` içinde açıkça yazılı olmalı.
 */
export const SELF_CARD_QUIZ: readonly QuizQuestion[] = [
  /*
   * HIZ — iki ayrı ve SAYILABİLİR soru (12 Ekim 2026). Eskiden tek soru ("topa genelde kim
   * varır?") hem ivmeye hem sprinte aynı değeri yazıyordu, dört kaba seçenek kartta 90/72/54/27
   * sıçraması yapıyordu ve "kendini nasıl görüyorsun" sorusu abartmaya açıktı. Artık:
   *  - SPRINT: 14 kişilik grupta seni kaç kişi geçer (sıra → yüzdelik; sayılabilir, abartması zor);
   *  - İVME: 5 metrelik 10 düellonun kaçını alırsın (sıklık).
   * Beşer seçenek ve iki ayrı beceri: kartta ara değerler çıkar. Formdaki çapalar
   * (`beceri.ivme.*` / `beceri.sprint.*`) aynı dili konuşur. Yaş ve vücut düzeltmesi
   * `RatingService`'te ayrıca uygulanır.
   */
  {
    id: 'sprint',
    text: 'anket.sprint',
    options: [
      o('anket.sprint.0', { sprint: 9 }),
      o('anket.sprint.1', { sprint: 8 }),
      o('anket.sprint.2', { sprint: 7 }),
      o('anket.sprint.3', { sprint: 5 }),
      o('anket.sprint.4', { sprint: 2 }),
    ],
  },
  {
    id: 'ilkAdim',
    text: 'anket.ilkAdim',
    options: [
      o('anket.ilkAdim.0', { ivme: 9 }),
      o('anket.ilkAdim.1', { ivme: 7 }),
      o('anket.ilkAdim.2', { ivme: 5 }),
      o('anket.ilkAdim.3', { ivme: 3 }),
      o('anket.ilkAdim.4', { ivme: 1 }),
    ],
  },
  {
    id: 'son10',
    text: 'anket.son10',
    options: [
      o('anket.son10.0', { dayaniklilik: 9 }),
      o('anket.son10.1', { dayaniklilik: 6 }),
      o('anket.son10.2', { dayaniklilik: 4 }),
      o('anket.son10.3', { dayaniklilik: 2 }),
    ],
  },
  {
    id: 'ikili',
    text: 'anket.ikili',
    options: [
      o('anket.ikili.0', { kuvvet: 9, mucadele: 9 }),
      o('anket.ikili.1', { kuvvet: 6, mucadele: 7 }),
      o('anket.ikili.2', { kuvvet: 4, mucadele: 4 }),
      o('anket.ikili.3', { kuvvet: 2, mucadele: 2 }),
    ],
  },
  {
    id: 'darAlan',
    text: 'anket.darAlan',
    options: [
      o('anket.darAlan.0', { dripling: 9, ceviklik: 9, topKontrol: 8 }),
      o('anket.darAlan.1', { dripling: 6, ceviklik: 7, topKontrol: 7 }),
      o('anket.darAlan.2', { dripling: 4, ceviklik: 5, topKontrol: 6 }),
      o('anket.darAlan.3', { dripling: 2, ceviklik: 3, topKontrol: 2 }),
    ],
  },
  {
    id: 'karsiKarsiya',
    text: 'anket.karsiKarsiya',
    options: [
      o('anket.karsiKarsiya.0', { bitiricilik: 9 }),
      o('anket.karsiKarsiya.1', { bitiricilik: 6 }),
      o('anket.karsiKarsiya.2', { bitiricilik: 4 }),
      o('anket.karsiKarsiya.3', { bitiricilik: 2 }),
    ],
  },
  {
    id: 'uzaktan',
    text: 'anket.uzaktan',
    options: [
      o('anket.uzaktan.0', { uzaktanSut: 9, sutGucu: 9 }),
      o('anket.uzaktan.1', { uzaktanSut: 6, sutGucu: 7 }),
      o('anket.uzaktan.2', { uzaktanSut: 3, sutGucu: 5 }),
      o('anket.uzaktan.3', { uzaktanSut: 1, sutGucu: 3 }),
    ],
  },
  {
    id: 'havaTopu',
    text: 'anket.havaTopu',
    options: [
      o('anket.havaTopu.0', { kafa: 9 }),
      o('anket.havaTopu.1', { kafa: 6 }),
      o('anket.havaTopu.2', { kafa: 4 }),
      o('anket.havaTopu.3', { kafa: 1 }),
    ],
  },
  {
    id: 'baski',
    text: 'anket.baski',
    options: [
      o('anket.baski.0', { kisaPas: 9, topKontrol: 9 }),
      o('anket.baski.1', { kisaPas: 7, topKontrol: 6 }),
      o('anket.baski.2', { kisaPas: 4, topKontrol: 4 }),
      o('anket.baski.3', { kisaPas: 2, topKontrol: 2 }),
    ],
  },
  {
    id: 'gorus',
    text: 'anket.gorus',
    options: [
      o('anket.gorus.0', { vizyon: 9, uzunPas: 8 }),
      o('anket.gorus.1', { vizyon: 6, uzunPas: 6 }),
      o('anket.gorus.2', { vizyon: 4, uzunPas: 4 }),
      o('anket.gorus.3', { vizyon: 2, uzunPas: 2 }),
    ],
  },
  {
    id: 'savunma',
    text: 'anket.savunma',
    options: [
      o('anket.savunma.0', { topKapma: 9, markaj: 8 }),
      o('anket.savunma.1', { topKapma: 6, markaj: 8 }),
      o('anket.savunma.2', { topKapma: 4, markaj: 4 }),
      o('anket.savunma.3', { topKapma: 2, markaj: 2 }),
    ],
  },
  {
    id: 'okuma',
    text: 'anket.okuma',
    options: [
      o('anket.okuma.0', { arayaGirme: 9, markaj: 8 }),
      o('anket.okuma.1', { arayaGirme: 6, markaj: 6 }),
      o('anket.okuma.2', { arayaGirme: 4, markaj: 5 }),
      o('anket.okuma.3', { arayaGirme: 2, markaj: 2 }),
    ],
  },
  {
    id: 'kale',
    text: 'anket.kale',
    options: [
      o('anket.kale.0', { refleks: 9, kaleHakimiyeti: 8 }),
      o('anket.kale.1', { refleks: 6, kaleHakimiyeti: 4 }),
      o('anket.kale.2', { refleks: 4, kaleHakimiyeti: 3 }),
      o('anket.kale.3', { refleks: 0, kaleHakimiyeti: 0 }, { noKeeper: true }),
    ],
  },
  {
    id: 'gol',
    text: 'anket.gol',
    options: [
      o('anket.gol.0', {}, { goals: 0 }),
      o('anket.gol.1', {}, { goals: 0.3 }),
      o('anket.gol.2', {}, { goals: 1 }),
      o('anket.gol.3', {}, { goals: 2 }),
    ],
  },
  {
    id: 'sigara',
    text: 'anket.sigara',
    options: [o('anket.sigara.0', {}, { smoker: false }), o('anket.sigara.1', {}, { smoker: true })],
  },
  {
    id: 'ayak',
    text: 'anket.ayak',
    options: [
      o('anket.ayak.0', {}, { foot: 'sag' }),
      o('anket.ayak.1', {}, { foot: 'sol' }),
      o('anket.ayak.2', {}, { foot: 'iki' }),
    ],
  },
  {
    id: 'yas',
    text: 'anket.yas',
    options: [
      o('anket.yas.0', {}, { age: 22 }),
      o('anket.yas.1', {}, { age: 28 }),
      o('anket.yas.2', {}, { age: 35 }),
      o('anket.yas.3', {}, { age: 42 }),
    ],
  },
];

/** Anketteki seçimler: soru id'si → seçilen seçeneğin indeksi. */
export type QuizAnswers = Readonly<Record<string, number>>;

function chosen(answers: QuizAnswers): QuizOption[] {
  const out: QuizOption[] = [];
  for (const question of SELF_CARD_QUIZ) {
    const index = answers[question.id];
    const option = index === undefined ? undefined : question.options[index];
    if (option) out.push(option);
  }
  return out;
}

/**
 * Cevapları 20 alt özelliğe çevirir. Bir beceriyi birden fazla soru besliyorsa ORTALAMA alınır
 * — toplasaydık çok soruyla beslenen beceriler (top kontrolü, markaj) tavana yapışırdı.
 * Cevaplanmamış beceri 0 kalır (eksik ankette çökmemek için; kayıt tam anket ister).
 */
export function quizToSkills(answers: QuizAnswers): PlayerSkills {
  const totals = new Map<SkillKey, { sum: number; count: number }>();
  for (const option of chosen(answers)) {
    for (const [skill, value] of Object.entries(option.effects) as [SkillKey, number][]) {
      const bucket = totals.get(skill) ?? { sum: 0, count: 0 };
      bucket.sum += value;
      bucket.count += 1;
      totals.set(skill, bucket);
    }
  }
  const skills = {} as PlayerSkills;
  for (const key of SKILL_KEYS) {
    const bucket = totals.get(key);
    skills[key] = bucket ? Math.round(bucket.sum / bucket.count) : 0;
  }
  return skills;
}

/**
 * Anket cevaplarını, kartı üretecek ham girdiye çevirir. `identity` mevcut kartın girdisi
 * olabilir: anketi yeniden çözmek fotoğrafı, forma numarasını, boyu ve kiloyu SİLMEMELİ
 * (eskiden siliyordu — yalnızca ad aktarılıyordu).
 */
export function quizToInput(answers: QuizAnswers, identity: Pick<PlayerInput, 'name'> & Partial<PlayerInput>): PlayerInput {
  const skills = quizToSkills(answers);
  const options = chosen(answers);
  const foot = options.find((x) => x.foot)?.foot ?? identity.preferredFoot ?? 'sag';
  const age = options.find((x) => x.age !== undefined)?.age ?? identity.age ?? null;
  // Formla EŞDEĞER alanlar: kaleye geçmeme, sigara, maç başı gol.
  const noKeeper = options.some((x) => x.noKeeper);
  const smoker = options.find((x) => x.smoker !== undefined)?.smoker ?? identity.smoker ?? false;
  const goals = options.find((x) => x.goals !== undefined)?.goals ?? identity.goalsPerMatch ?? 0;
  if (noKeeper) {
    skills.refleks = 0;
    skills.kaleHakimiyeti = 0;
  }
  return {
    name: identity.name,
    shirtNumber: identity.shirtNumber ?? '',
    countryCode: identity.countryCode ?? 'TR',
    flagImage: identity.flagImage ?? null,
    photoImage: identity.photoImage ?? null,
    heightCm: identity.heightCm ?? 175,
    weightKg: identity.weightKg ?? 70,
    smoker,
    goalsPerMatch: goals,
    ...legacyFromSkills(skills),
    skills,
    preferredFoot: foot,
    age,
    noKeeper,
  };
}

/** Anketin tamamlanıp tamamlanmadığı — her sorunun bir cevabı var mı? */
export function isQuizComplete(answers: QuizAnswers): boolean {
  return SELF_CARD_QUIZ.every((q) => {
    const index = answers[q.id];
    return index !== undefined && index >= 0 && index < q.options.length;
  });
}
