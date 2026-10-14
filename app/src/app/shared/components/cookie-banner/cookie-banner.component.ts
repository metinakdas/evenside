import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CookieConsentService } from '../../../core/services/cookie-consent.service';
import { I18nService } from '../../../core/services/i18n.service';

/**
 * ÇEREZ / VERİ BİLGİLENDİRME ŞERİDİ.
 *
 * Uygulama bugün yalnızca ZORUNLU depolama kullanıyor (oturum anahtarı ve cihazdaki kadro
 * tercihleri); reklam, analiz ya da takip aracı yok. Bu yüzden şerit bir "kabul et/reddet"
 * pazarlığı değil, açık bir bilgilendirme: seçenekler "Tamam" ve "Yalnızca zorunlu".
 * İkisi de aynı teknik sonucu verir — fark, kullanıcının isteğe bağlı kategorilere
 * (ileride eklenirse) verdiği yanıtta ortaya çıkar.
 *
 * Şerit yanıt verilene kadar durur, yanıt CİHAZA kaydedilir (`saha42.cerez.v1`).
 */
@Component({
  selector: 'app-cookie-banner',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './cookie-banner.component.html',
  styleUrl: './cookie-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CookieBannerComponent {
  private readonly consent = inject(CookieConsentService);
  private readonly i18n = inject(I18nService);

  protected readonly t = this.i18n.t;
  protected readonly gorunur = this.consent.sorulmali;

  protected kabul(): void {
    this.consent.karar('hepsi');
  }

  protected zorunlu(): void {
    this.consent.karar('zorunlu');
  }
}
