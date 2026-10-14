import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { applyTheme, isAlwaysDark, readStoredTheme } from './app/core/services/theme.service';

// Tema Angular açılmadan uygulanır: yoksa açık tema seçmiş kullanıcı her açılışta bir an
// koyu ekran görür (ThemeService effect'i ilk change detection'da çalışıyor).
applyTheme(isAlwaysDark(location.pathname) ? 'dark' : readStoredTheme());

/*
 * SOSYAL GİRİŞ DÖNÜŞ HATASI (12 Ekim 2026). Google/OAuth dönüşünde Supabase bir hata gönderirse
 * (`#error=…&error_description=…` ya da `?error=…`), uygulama yönlendirme sırasında adresi
 * temizliyor ve kullanıcı HİÇBİR mesaj görmeden tanıtım sayfasına düşüyordu ("Google ile giriş
 * yaptım ama uygulamaya girmedi"). Hata, Angular açılmadan önce okunup oturum deposuna yazılır;
 * AppComponent onu bildirim olarak gösterir.
 */
try {
  const parca = new URLSearchParams((location.hash || '').replace(/^#/, '') + '&' + (location.search || '').replace(/^\?/, ''));
  const aciklama = parca.get('error_description') || parca.get('error');
  if (aciklama) {
    // Supabase açıklamayı bazen İKİ KEZ kodluyor ("code%3A 4%2F0A"): bir kez daha çözülür.
    let metin = aciklama.replace(/\+/g, ' ');
    try {
      metin = decodeURIComponent(metin);
    } catch {
      // bozuk kodlama: olduğu gibi gösterilir
    }
    sessionStorage.setItem('saha42.oauthHata', metin.slice(0, 300));
  }
} catch {
  // depo kapalı: hata gösterilemez, akış bozulmaz
}

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
