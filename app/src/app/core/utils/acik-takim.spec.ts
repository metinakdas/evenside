import { acikTakimSec } from './acik-takim';

const t = (id: string, role: string) => ({ squad: { id }, role });

describe('açık takım seçimi', () => {
  it('yeni cihazda (seçim boş) kullanıcının KENDİ takımı açılır', () => {
    expect(acikTakimSec(null, [t('a', 'uye'), t('b', 'kurucu')])).toBe('b');
  });
  it('kendi takımı yoksa ilk takım açılır', () => {
    expect(acikTakimSec(null, [t('a', 'uye'), t('c', 'yonetici')])).toBe('a');
  });
  it('geçerli seçim korunur', () => {
    expect(acikTakimSec('a', [t('a', 'uye'), t('b', 'kurucu')])).toBe('a');
  });
  it('artık sana ait olmayan seçim düzeltilir; hiç takım yoksa boş', () => {
    expect(acikTakimSec('silinmis', [t('b', 'kurucu')])).toBe('b');
    expect(acikTakimSec('silinmis', [])).toBeNull();
  });
});
