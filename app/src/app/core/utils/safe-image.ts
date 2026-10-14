/**
 * Başka kullanıcının yazdığı görsel adresine GÜVENME (tarama turu, 10 Ekim 2026).
 *
 * Kart fotoğrafı ve takım arması sunucuda serbest metin. Bir takım arkadaşı oraya kendi
 * sunucusunun adresini yazarsa kartı gören herkesin tarayıcısı o adrese istek atar: IP adresi
 * ve görüntüleme zamanı sızar (izleme pikseli). Uygulamanın kendi ürettiği görseller ya
 * `data:image/...` (yükleme) ya da TheSportsDB'nin görsel sunucusu (kulüp arması/forma) —
 * bunların dışındaki her şey yok sayılır, kart/rozet görselsiz hâline döner.
 */
const IZINLI_HOSTLAR = ['r2.thesportsdb.com', 'www.thesportsdb.com', 'thesportsdb.com'];

export function safeImage(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(url)) return url;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && IZINLI_HOSTLAR.includes(u.hostname) ? url : null;
  } catch {
    return null;
  }
}
