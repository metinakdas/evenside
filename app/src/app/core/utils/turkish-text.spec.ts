import { trFold, trLower, trUpper } from './turkish-text';

describe('turkish-text', () => {
  it('uppercases dotted i as İ, not I (the "ŞIMŞEK" bug)', () => {
    expect(trUpper('Şimşek')).toBe('ŞİMŞEK');
    expect(trUpper('ismail')).toBe('İSMAİL');
  });

  it('lowercases dotless I as ı', () => {
    expect(trLower('IŞIK')).toBe('ışık');
  });

  it('folds Turkish letters to ASCII so accent-free search still matches', () => {
    expect(trFold('Doğan')).toBe('dogan');
    expect(trFold('ŞİMŞEK')).toBe('simsek');
    expect(trFold('  Çetin ')).toBe('cetin');
  });

  it('folds both spellings of a name to the same key', () => {
    expect(trFold('DOĞAN')).toBe(trFold('dogan'));
  });
  it('sorts Turkish names by the Turkish alphabet (Ç before G)', () => {
    const sorted = ['Gökhan Güneş', 'Gökhan Çetin'].sort((a, b) => a.localeCompare(b, 'tr'));

    expect(sorted).toEqual(['Gökhan Çetin', 'Gökhan Güneş']);
  });
});
