/*
 * EVENSIDE — AÇILIŞ GÜVENLİK AĞI (12 Ekim 2026).
 *
 * Angular paketinin DIŞINDA, adı sabit, <head>'de ana koddan ÖNCE çalışır. Ana kod hiç
 * yüklenemezse (eski sayfa kopyası artık var olmayan bir dosyayı istiyor, bağlantı koptu…)
 * uygulamanın kendi onarım kodu da o paketin içinde olduğu için çalışamazdı ve kullanıcı boş
 * siyah ekran görürdü. Bu dosya iki şey yapar:
 *   1) Ana kod / parça / stil dosyası yüklenemezse sayfayı BİR KEZ yeniler (30 sn'de en çok bir).
 *   2) Uygulama 12 saniyede hâlâ ekrana gelmediyse boş ekran yerine "Yenile" düğmeli kısa mesaj.
 * Kasıtlı olarak eski JS sözdizimi: hangi tarayıcıda olursa olsun kendisi çökmemeli.
 */
(function () {
  var ANAHTAR = 'evenside.acilisYenile';
  var ARALIK = 30000;

  function yenile() {
    try {
      var son = Number(sessionStorage.getItem(ANAHTAR) || 0);
      if (Date.now() - son < ARALIK) return false;
      sessionStorage.setItem(ANAHTAR, String(Date.now()));
    } catch (e) {
      /* depo kapalı: yine de bir kez dene */
    }
    location.reload();
    return true;
  }

  // 1) Kaynak yükleme hatası: hata olayı kabarcıklanmaz, YAKALAMA aşamasında dinlenir.
  window.addEventListener(
    'error',
    function (e) {
      var el = e && e.target;
      if (!el || el === window || !el.tagName) return;
      var adres = el.src || el.href || '';
      if (/\/(main|polyfills|chunk|styles)-[\w-]+\.(js|css)(\?|$)/.test(adres)) yenile();
    },
    true
  );

  // Uygulamanın kendi parça onarımına girmeyen dinamik içe aktarma hataları (ör. tembel yüklenen modüller).
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    var metin = r ? String((r.name || '') + ' ' + (r.message || r)) : '';
    if (/dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i.test(metin)) yenile();
  });

  // 2) Boş ekran yerine mesaj.
  function bosMu() {
    var kok = document.querySelector('app-root');
    return !kok || kok.childElementCount === 0;
  }

  function mesajGoster() {
    if (!bosMu() || document.getElementById('acilis-hata')) return;
    var dil = (navigator.language || 'tr').slice(0, 2);
    var tr = dil === 'tr';
    var kutu = document.createElement('div');
    kutu.id = 'acilis-hata';
    kutu.setAttribute('role', 'alert');
    kutu.style.cssText =
      'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;' +
      'padding:24px;background:#08080a;color:#fff;font:16px/1.5 system-ui,sans-serif;text-align:center;z-index:2147483647';
    var baslik = document.createElement('p');
    baslik.style.cssText = 'margin:0;font-weight:700;font-size:18px';
    baslik.textContent = tr ? 'Sayfa yüklenemedi.' : 'The page could not be loaded.';
    var alt = document.createElement('p');
    alt.style.cssText = 'margin:0;color:rgba(255,255,255,.7);max-width:420px';
    alt.textContent = tr
      ? 'Bağlantın yavaş olabilir ya da site yeni güncellendi. Yenilemek çoğu zaman yeter.'
      : 'Your connection may be slow or the site was just updated. Reloading usually fixes it.';
    var dugme = document.createElement('button');
    dugme.type = 'button';
    dugme.textContent = tr ? 'Yenile' : 'Reload';
    dugme.style.cssText =
      'min-height:46px;padding:0 26px;border:0;border-radius:999px;background:#00f57a;color:#05130a;font:700 15px system-ui,sans-serif;cursor:pointer';
    dugme.onclick = function () {
      try { sessionStorage.removeItem(ANAHTAR); } catch (e) { /* yok say */ }
      location.reload();
    };
    kutu.appendChild(baslik);
    kutu.appendChild(alt);
    kutu.appendChild(dugme);
    document.body.appendChild(kutu);
  }

  window.addEventListener('load', function () {
    setTimeout(mesajGoster, 12000);
  });
})();
