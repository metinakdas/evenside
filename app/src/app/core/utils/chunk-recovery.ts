/*
 * YAYIN SONRASI KIRIK PARÇA ONARIMI (12 Ekim 2026).
 *
 * Her yayında Angular parça dosyalarının adı (`chunk-<özet>.js`) değişir. Sayfası açık kalmış bir
 * cihaz yeni bir ekrana geçerken ESKİ yayının parçasını ister; o dosya artık yoktur ve barındırmanın
 * tek sayfa kuralı (`/* /index.html 200`) yerine HTML döndürür. Tarayıcı bunu betik olarak
 * çalıştıramaz, ekran açılmaz (kullanıcı: "site mobilde açılmadı, hiçbir animasyon çalışmadı").
 *
 * Çözüm: parça yüklenemezse sayfa hedef adrese TAM YENİLEME ile gider; yeni index.html güncel
 * parça adlarını getirir. Sonsuz yenileme döngüsü olmasın diye 30 saniyede en fazla bir kez.
 */
const ANAHTAR = 'evenside.parcaYenile';
const ARALIK_MS = 30_000;

export function parcaHatasiMi(hata: unknown): boolean {
  const metin = hata instanceof Error ? `${hata.name} ${hata.message}` : String(hata ?? '');
  return /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed|error loading dynamically imported module|MIME type/i.test(
    metin,
  );
}

/** Parça hatasıysa sayfayı bir kez yeniler ve true döner; değilse (ya da az önce denendiyse) false. */
export function parcaHatasindaYenile(hata: unknown, hedef: string): boolean {
  if (!parcaHatasiMi(hata) || typeof window === 'undefined') return false;
  try {
    const son = Number(sessionStorage.getItem(ANAHTAR) ?? 0);
    if (Date.now() - son < ARALIK_MS) return false;
    sessionStorage.setItem(ANAHTAR, String(Date.now()));
  } catch {
    // depo kapalı: yine de bir kez dene
  }
  window.location.assign(hedef);
  return true;
}
