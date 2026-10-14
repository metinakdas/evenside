import { generateJoinCode, isValidJoinCode, normalizeJoinCode } from './join-code';

describe('kadro katılma kodu', () => {
  it('6 haneli ve yalnızca karışmayan karakterlerden üretilir', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateJoinCode();
      expect(code.length).toBe(6);
      // Gözle karışanlar alfabede olmamalı: 0/O, 1/I/L, 2/Z, 5/S, 8/B.
      expect(code).not.toMatch(/[0O1IL2Z5S8B]/);
    }
  });

  it('kullanıcı küçük harfle, boşlukla, tireyle yazsa da aynı koda çözülür', () => {
    expect(normalizeJoinCode('kad-3g7 pq')).toBe(normalizeJoinCode('KAD3G7PQ'.slice(0, 8)));
    expect(normalizeJoinCode(' a c d e f g ')).toBe('ACDEFG');
  });

  it('karışan karakterleri doğrusuna çevirir — "0" yazan "Q" demiştir', () => {
    expect(normalizeJoinCode('0CDEFG')).toBe('QCDEFG');
    expect(normalizeJoinCode('OCDEFG')).toBe('QCDEFG');
    expect(normalizeJoinCode('1CDEFG')).toBe('7CDEFG');
    expect(normalizeJoinCode('lCDEFG')).toBe('JCDEFG');
    expect(normalizeJoinCode('SCDEFG')).toBe('XCDEFG');
  });

  it('Türkçe karakterler ASCII karşılığına düşer', () => {
    expect(normalizeJoinCode('ÇĞÜACD')).toBe('CGUACD');
    expect(normalizeJoinCode('ŞACDEF')).toBe('XACDEF');
  });

  it('6 haneden kısa kod geçersizdir, uzun olan kırpılır', () => {
    expect(isValidJoinCode('ACD')).toBeFalse();
    expect(isValidJoinCode('ACDEFG')).toBeTrue();
    expect(normalizeJoinCode('ACDEFGHJK')).toBe('ACDEFG');
  });

  it('üretilen her kod kendi normalizasyonundan geçtiğinde değişmez', () => {
    // Aksi hâlde paylaşılan kod, yazılıp geri okunduğunda başka bir koda dönüşürdü.
    for (let i = 0; i < 200; i++) {
      const code = generateJoinCode();
      expect(normalizeJoinCode(code)).toBe(code);
    }
  });
});
