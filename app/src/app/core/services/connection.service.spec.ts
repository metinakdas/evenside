import { withTimeout } from './connection.service';

/*
 * "İnternet gidince sonsuza kadar dönen çember olmasın" (kullanıcı isteği).
 *
 * Kökü şuydu: ağ koptuğunda istek ASKIDA kalıyor, `loading` sinyali hiç kapanmıyordu.
 * `withTimeout` bu askıyı keser. Tarayıcıda ölçmek zor (uygulama açılışta zaten yüklenmiş
 * oluyor), ama davranışın kendisi burada deterministik olarak doğrulanabiliyor.
 */
describe('withTimeout', () => {
  it('cevap gelmezse süre dolunca null döner (çember sonsuza kadar dönmez)', async () => {
    const asilanIstek = new Promise<string>(() => {
      /* hiç çözülmez — kopmuş ağın taklidi */
    });
    const sonuc = await withTimeout(asilanIstek, 30);
    expect(sonuc).toBeNull();
  });

  it('cevap süresinde gelirse sonucu aynen döndürür', async () => {
    const sonuc = await withTimeout(Promise.resolve('kadro'), 1000);
    expect(sonuc).toBe('kadro');
  });

  it('geç gelen cevap zaman aşımını ezmez', async () => {
    const gec = new Promise<string>((resolve) => setTimeout(() => resolve('geç'), 200));
    const sonuc = await withTimeout(gec, 30);
    expect(sonuc).withContext('süre dolduysa geç gelen cevap kullanılmaz').toBeNull();
  });
});
