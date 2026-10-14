import { RatingService } from '../services/rating.service';
import { SKILL_KEYS } from './player-skills';
import { SELF_CARD_QUIZ, isQuizComplete, quizToInput, quizToSkills } from './self-card-quiz';

/** Her soruya `index` numaralı seçeneği işaretler (yoksa son seçenek). */
const answerAll = (index: number): Record<string, number> =>
  Object.fromEntries(SELF_CARD_QUIZ.map((q) => [q.id, Math.min(index, q.options.length - 1)]));

describe('kendini tanıt anketi (2. sürüm)', () => {
  it('20 alt özelliğin HEPSİNİ besler', () => {
    // Kapsama boşluğu sessizce 0 üretir: kale sorusu düşerse anketten gelen kimse kaleci olamaz.
    const fed = new Set<string>();
    for (const q of SELF_CARD_QUIZ) for (const opt of q.options) for (const k of Object.keys(opt.effects)) fed.add(k);
    for (const skill of SKILL_KEYS) expect(fed.has(skill)).withContext(`${skill} alanını besleyen soru yok`).toBeTrue();
  });

  it('her seçenek 0-10 aralığında değer verir', () => {
    for (const q of SELF_CARD_QUIZ) {
      for (const opt of q.options) {
        for (const [skill, value] of Object.entries(opt.effects)) {
          expect(value).withContext(`${q.id} · ${skill}`).toBeGreaterThanOrEqual(0);
          expect(value).withContext(`${q.id} · ${skill}`).toBeLessThanOrEqual(10);
        }
      }
    }
  });

  it('seçenekler davranış bantlarına oturur: en iyi cevap 9 bandı, en kötü 0-3 bandı', () => {
    const iyi = quizToSkills(answerAll(0));
    const kotu = quizToSkills(answerAll(9));
    for (const skill of SKILL_KEYS) {
      expect(iyi[skill]).withContext(skill).toBeGreaterThanOrEqual(8);
      expect(kotu[skill]).withContext(skill).toBeLessThanOrEqual(3);
    }
  });

  it('anketten gelen kart ile formdan aynı becerilerle girilen kart AYNI reytingi alır', () => {
    const rating = new RatingService();
    const anket = quizToInput(answerAll(1), { name: 'Ali', heightCm: 182, weightKg: 78 });
    const form = { ...anket, goalkeeping: 0, defending: 0, midfield: 0, attacking: 0, pace: 0, stamina: 0 };
    // Eski alanlar sıfırlansa bile sonuç değişmez: tek kaynak alt özellikler.
    expect(rating.calculate(form)).toEqual(rating.calculate(anket));
  });

  it('kale cevabı karta yansır: kaleci olan KAL çıkar, kaleye geçmeyen çıkmaz', () => {
    const rating = new RatingService();
    const kaleci = quizToInput({ ...answerAll(2), kale: 0 }, { name: 'K' });
    const oyuncu = quizToInput({ ...answerAll(1), kale: 3 }, { name: 'O' });
    expect(rating.calculate(kaleci).position).toBe('KAL');
    expect(rating.calculate(oyuncu).position).not.toBe('KAL');
  });

  it('ayak ve yaş cevapları girdiye yazılır', () => {
    const input = quizToInput({ ...answerAll(1), ayak: 2, yas: 3 }, { name: 'A' });
    expect(input.preferredFoot).toBe('iki');
    expect(input.age).toBe(42);
  });

  it('anketi yeniden çözmek fotoğrafı, forma numarasını, boyu ve kiloyu SİLMEZ', () => {
    const input = quizToInput(answerAll(1), {
      name: 'Ali',
      photoImage: 'data:image/png;base64,AAA',
      shirtNumber: '10',
      heightCm: 188,
      weightKg: 82,
    });
    expect(input.photoImage).toBe('data:image/png;base64,AAA');
    expect(input.shirtNumber).toBe('10');
    expect(input.heightCm).toBe(188);
    expect(input.weightKg).toBe(82);
  });

  it('eski altı alan alt özelliklerden türetilir (dengeleyici ve eski sütunlar okuyor)', () => {
    const input = quizToInput(answerAll(0), { name: 'A' });
    expect(input.goalkeeping).toBeGreaterThanOrEqual(8);
    expect(input.pace).toBe(9);
  });

  it('eksik ankette çökmez ve tamamlandı demez', () => {
    expect(quizToSkills({ karsiKarsiya: 0 }).bitiricilik).toBe(9);
    expect(isQuizComplete({})).toBeFalse();
    expect(isQuizComplete(answerAll(0))).toBeTrue();
    const missing = answerAll(0);
    delete missing[SELF_CARD_QUIZ[0].id];
    expect(isQuizComplete(missing)).toBeFalse();
  });
  it("her soruda ikinci (iyi) cevabı veren saha oyuncusu KAL çıkmaz — kaleci cevabı yalnızca ilk seçenek", () => {
    // Tarayıcıda yakalandı: "iyi kurtarırım" cevabı 7/5 iken ortalama-iyi bir oyuncu kaleci çıkıyordu.
    const rating = new RatingService();
    const input = quizToInput(answerAll(1), { name: "O", heightCm: 186, weightKg: 80 });
    expect(rating.calculate(input).position).not.toBe("KAL");
  });

  it('FORMLA EŞDEĞER: kaleye geçmeme, sigara ve gol cevapları karta yazılır', () => {
    const rating = new RatingService();
    const input = quizToInput({ ...answerAll(1), kale: 3, sigara: 1, gol: 2 }, { name: 'E' });
    expect(input.noKeeper).toBeTrue();
    expect(input.skills!.refleks).toBe(0);
    expect(input.smoker).toBeTrue();
    expect(input.goalsPerMatch).toBe(1);
    const r = rating.calculate(input);
    expect(r.position).not.toBe('KAL');
    expect(r.goalkeeping).toBe(1);
  });

  /*
   * HIZ nokta atışı (12 Ekim 2026): iki ayrı soru (sprint = grupta kaç kişi geçer, ivme = 10
   * kısa düellonun kaçı). Eskiden tek soru iki beceriye aynı değeri yazıyor, kart 90/72/54/27
   * diye sıçrıyordu.
   */
  describe('hız', () => {
    const rating = new RatingService();
    // 28 yaş, normal kilo, sigarasız: yaş/vücut düzeltmesi devreye girmesin, yalnız cevaplar ölçülsün.
    const hiz = (sprint: number, ilkAdim: number): number => {
      const cevap = { ...answerAll(1), sprint, ilkAdim, yas: 1, sigara: 0 };
      return rating.calculate(quizToInput(cevap, { name: 'Test', heightCm: 178, weightKg: 74 })).pace;
    };

    it('sprint ve ivme AYRI sorulur ve birbirinden bağımsız beslenir', () => {
      const s = quizToSkills({ ...answerAll(1), sprint: 0, ilkAdim: 4 });
      expect(s.sprint).toBe(9);
      expect(s.ivme).toBe(1);
    });

    it('cevaplar kademeli bir HIZ üretir: grubun en hızlısı ~90, ortası ~54, en yavaşı ~20', () => {
      expect(hiz(0, 0)).toBe(90);
      expect(hiz(2, 2)).toBeGreaterThanOrEqual(58);
      expect(hiz(2, 2)).toBeLessThanOrEqual(66);
      expect(hiz(3, 2)).toBe(54);
      expect(hiz(4, 4)).toBeLessThanOrEqual(25);
    });

    it('her daha kötü cevap hızı düşürür (hiçbir basamak atlanmaz)', () => {
      for (let i = 0; i < 4; i++) {
        expect(hiz(i + 1, 2)).withContext(`sprint ${i} → ${i + 1}`).toBeLessThan(hiz(i, 2));
        expect(hiz(2, i + 1)).withContext(`ilk adım ${i} → ${i + 1}`).toBeLessThan(hiz(2, i));
      }
    });

    it('yaş hızı düşürür: aynı cevaplarla 40 yaşındaki daha yavaş', () => {
      const genc = hiz(1, 1);
      const yasli = rating.calculate(
        quizToInput({ ...answerAll(1), sprint: 1, ilkAdim: 1, yas: 3, sigara: 0 }, { name: 'Test', heightCm: 178, weightKg: 74 }),
      ).pace;
      expect(yasli).toBeLessThan(genc);
    });
  });
});
