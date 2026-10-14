# tools/ — YAYINLANMAYAN yardımcılar

Buradaki dosyalar bilerek `app/public/` DIŞINDA tutuluyor: `public/` altındaki her şey
üretim paketine kopyalanır ve internete açılır.

- `__seed.html.SIZINTI` — geliştirme sırasında oturum tohumlamak için üretilmişti ve
  **gerçek bir erişim + yenileme jetonu** içeriyor. `public/` altında olduğu için siteyi
  açan HERKES o hesapla giriş yapabilirdi (güvenlik taramasında bulundu, 13 Eylül 2026).
  Dosya kanıt olarak burada duruyor; **içindeki jeton Supabase panelinden geçersiz
  kılınmalı** (Auth → Sessions → "Sign out all users" ya da ilgili oturum) ve ardından
  dosya silinmelidir.
- `sifirla.html` — kullanıcının kendi verisini temizleyen bakım sayfası. Zararsız (yalnızca
  ziyaretçinin kendi oturumuyla çalışır) ama üretimde durmasının bir sebebi yok. Gerekirse
  `app/public/` altına elle kopyalanıp kullanıldıktan sonra geri alınır.

**Kural:** `app/public/` altına yalnızca sitenin İHTİYAÇ DUYDUĞU varlıklar konur
(görseller, favicon, model dosyaları). Jeton, anahtar, bakım aracı ASLA.

## Test araçları (13 Eylül 2026)

- `guvenlik-provasi.js` — kullanıcının KENDİ jetonuyla başkasının verisine saldırmayı dener
  (takım adını değiştir, takım sil, başkası adına üyelik ekle, kart sahiplen, auth şemasını
  oku, oturumsuz oku, katılma kodlarını listele). Her deneme gerçek isteğe çıkar; başarılı
  olan yazma hemen geri alınır. Çalıştırmadan önce `login.json` ve `k.txt` gerekir.
- `qa.js` + `helpers.js` — CDP koşucusu: gerçek oturumla tarayıcı açar, istekleri ve konsolu
  kaydeder. `QA_MOBILE=390x844` gerçek cihaz ölçüsü + dokunmatik, `QA_NO_SESSION=1` oturumsuz,
  `QA_HOVER=x,y` gerçek işaretçi hover'ı.
- `mobil-tarama.js` — bir ekranda yatay kaydırma, 44px altı dokunma hedefi, 11px altı yazı ve
  kesilen metin sayar.

Kullanım: `node qa.js mobil-tarama.js http://localhost:4200/kadro`
