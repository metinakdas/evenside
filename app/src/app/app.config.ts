import { ApplicationConfig, LOCALE_ID, provideZoneChangeDetection } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeTr from '@angular/common/locales/tr';
import localeDe from '@angular/common/locales/de';
import localeFr from '@angular/common/locales/fr';
import localeEs from '@angular/common/locales/es';
import localeAr from '@angular/common/locales/ar';
import { provideRouter, withNavigationErrorHandler, withViewTransitions } from '@angular/router';
import { parcaHatasindaYenile } from './core/utils/chunk-recovery';
import { onViewTransitionCreated } from './core/utils/route-transition';

import { routes } from './app.routes';
import { SUPPORTED_LOCALES, SupportedLocale } from './core/i18n/dictionaries';

/*
 * YEREL AYAR SEÇİLEN DİLDEN GELİR.
 *
 * Angular'ın varsayılanı `en-US`: `date`, `number` ve `percent` boruları Amerikan
 * biçimini basar (9/14/2026, 1,234.5). Uygulama altı dil taşıdığı için yerel ayar
 * `I18nService`'in depoladığı tercihten okunuyor; altı dilin verisi de kaydediliyor
 * (kaydedilmemiş bir yerel ayar çalışma zamanında hata verir).
 *
 * SINIR: `LOCALE_ID` uygulama AÇILIRKEN bir kez çözülür — Angular borularının yerel
 * ayarı çalışma zamanında değişmez. Dil değiştirince borular ancak sayfa yenilendiğinde
 * yeni biçime geçer. Ekranlardaki tarih/saat metinleri bu yüzden boru değil
 * `toLocaleDateString(i18n.locale())` kullanıyor: onlar anında değişir.
 */
registerLocaleData(localeTr);
registerLocaleData(localeDe);
registerLocaleData(localeFr);
registerLocaleData(localeEs);
registerLocaleData(localeAr);

const DEPO_ANAHTARI = 'saha42.dil.v1';

/** Depodaki dil tercihi; yoksa tarayıcının dili, o da desteklenmiyorsa Türkçe. */
function secilenYerelAyar(): string {
  const destekli = (aday: string): aday is SupportedLocale =>
    SUPPORTED_LOCALES.some((d) => d.id === aday);
  try {
    const kayitli = localStorage.getItem(DEPO_ANAHTARI);
    if (kayitli && destekli(kayitli)) return kayitli === 'tr' ? 'tr-TR' : kayitli;
  } catch {
    // Gizli sekmede depo kapalı olabilir.
  }
  // I18nService.ilkDil ile AYNI kural: tarayıcının dil sıralaması denenir.
  const liste = navigator.languages?.length ? navigator.languages : [navigator.language || 'tr'];
  for (const etiket of liste) {
    const kod = etiket.slice(0, 2).toLowerCase();
    if (destekli(kod)) return kod === 'tr' ? 'tr-TR' : kod;
  }
  return 'tr-TR';
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    // Sayfa geçişleri: yönü ekran derinliği belirler (bkz. core/utils/route-transition.ts).
    provideRouter(
      routes,
      withViewTransitions({ skipInitialTransition: true, onViewTransitionCreated }),
      // Yayından sonra eski parça istenirse sayfayı bir kez yenile (bkz. core/utils/chunk-recovery.ts).
      withNavigationErrorHandler((e) => void parcaHatasindaYenile(e.error, e.url)),
    ),
    { provide: LOCALE_ID, useFactory: secilenYerelAyar },
  ],
};
