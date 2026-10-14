import { findNameMatches, isSamePersonName, personNameKey } from './name-match';

describe('isim eşleştirme', () => {
  it('büyük/küçük harf ve Türkçe karakter farkını yok sayar', () => {
    expect(isSamePersonName('ALİ YILMAZ', 'ali yilmaz')).toBeTrue();
    expect(isSamePersonName('Şevval Aydıngöz', 'sevval aydingoz')).toBeTrue();
  });

  it('fazla boşlukları ve ad içindeki noktalamayı önemsemez', () => {
    expect(isSamePersonName('  Ali   Can  ', 'Ali-Can')).toBeTrue();
    expect(isSamePersonName("O'Brien", 'OBrien')).toBeTrue();
  });

  it('farklı kişileri eşleştirmez', () => {
    expect(isSamePersonName('Ali Yılmaz', 'Ali Yılmazlar')).toBeFalse();
    expect(isSamePersonName('Ali', 'Ali Yılmaz')).toBeFalse();
  });

  it('boş ad hiçbir şeyle eşleşmez — boş isimli kartlar birbirine yapışmasın', () => {
    expect(isSamePersonName('', '')).toBeFalse();
    expect(isSamePersonName('   ', 'Ali')).toBeFalse();
    expect(personNameKey('  ')).toBe('');
  });

  it('adayları bulur ve kendisini dışarıda bırakır', () => {
    const candidates = [
      { id: 'a', name: 'Ali Yılmaz' },
      { id: 'b', name: 'ALI YILMAZ' },
      { id: 'c', name: 'Veli Yılmaz' },
    ];

    expect(findNameMatches('ali yilmaz', candidates).map((c) => c.id)).toEqual(['a', 'b']);
    expect(findNameMatches('ali yilmaz', candidates, 'a').map((c) => c.id)).toEqual(['b']);
  });

  it('aynı isimde iki kişi olabilir — eşleşme birden fazla aday döndürebilir', () => {
    const candidates = [
      { id: 'a', name: 'Mehmet Demir' },
      { id: 'b', name: 'Mehmet Demir' },
    ];

    expect(findNameMatches('Mehmet Demir', candidates).length).toBe(2);
  });
});
