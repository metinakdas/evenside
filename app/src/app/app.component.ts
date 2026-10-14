import { NoticeService } from './core/services/notice.service';
import { ConfirmHostComponent } from './shared/components/confirm-host/confirm-host.component';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { ClubKitBackfillService } from './core/services/club-kit-backfill.service';
import { UserScopeService } from './core/services/user-scope.service';
import { SquadInviteService } from './core/services/squad-invite.service';
import { ActiveTeamService } from './core/services/active-team.service';
import { acikTakimSec } from './core/utils/acik-takim';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { I18nService } from './core/services/i18n.service';
import { ToastHostComponent } from './shared/components/toast-host/toast-host.component';
import { ConnectionService } from './core/services/connection.service';
import { SessionLifetimeService } from './core/services/session-lifetime.service';
import { CookieBannerComponent } from './shared/components/cookie-banner/cookie-banner.component';
import { LanguageSwitcherComponent } from './shared/components/language-switcher/language-switcher.component';
import { ThemeService } from './core/services/theme.service';
import { SeoService } from './core/services/seo.service';

@Component({
    selector: 'app-root',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterOutlet, RouterLink, ToastHostComponent, ConfirmHostComponent, CookieBannerComponent, LanguageSwitcherComponent],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss'
})
export class AppComponent {
  private readonly clubKits = inject(ClubKitBackfillService);
  private readonly scope = inject(UserScopeService);
  private readonly invites = inject(SquadInviteService);
  private readonly bildirim = inject(NoticeService);
  private readonly i18n = inject(I18nService);
  private readonly activeTeam = inject(ActiveTeamService);
  /* Bağlantı gözcüsü: yalnızca enjekte edilmesi yeter, kendisi dinlemeye başlar. */
  private readonly connection = inject(ConnectionService);
  /*
   * Oturum ömrü gözcüsü. Supabase'in "Time-box" ve "Inactivity timeout" ayarları Pro
   * planında (ölçüldü: panelde kilitli); bu, ücretsiz planda aynı işi tarayıcıda yapar.
   */
  private readonly sessionLifetime = inject(SessionLifetimeService);
  /* Tema: tercih + rota bazında uygulanan tema (<html data-theme>). */
  private readonly theme = inject(ThemeService);
  /** Ekran başına sekme başlığı, açıklama ve dizinleme kuralı (bkz. SeoService). */
  private readonly seo = inject(SeoService);

  private readonly auth = inject(AuthService);
  protected readonly t = inject(I18nService).t;
  private readonly url = toSignal(
    inject(Router).events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: typeof location === 'undefined' ? '/' : location.pathname },
  );
  /**
   * Geçiş 300 ms'den uzun sürerse gösterge açılır (kısa geçişlerde göz kırpması olmasın).
   * Zamanlayıcı her geçişte sıfırlanır.
   */
  protected readonly gecisSuruyor = signal(false);
  private gecisZamanlayici: ReturnType<typeof setTimeout> | null = null;

  /** "Giriş yap" yalnızca oturum yokken ve giriş ekranının kendisi dışında. */
  protected readonly girisGorunur = computed(
    () => !this.auth.isAuthenticated() && !this.url().startsWith('/login'),
  );

  constructor() {
    // Sosyal giriş dönüşünden gelen hata (bkz. main.ts): sessizce yutulmasın.
    try {
      const oauthHata = sessionStorage.getItem('saha42.oauthHata');
      if (oauthHata) {
        sessionStorage.removeItem('saha42.oauthHata');
        console.error('Sosyal giriş hatası:', oauthHata);
        this.bildirim.error(this.i18n.t('mesaj.sosyalGirisHata', { sebep: oauthHata }));
      }
    } catch {
      // depo kapalı
    }
    /*
     * DEVRALINMIŞ VERİ ONARIMI (bkz. UserScopeService.repairInheritedData). Takım listesi
     * SUNUCUDAN gelmeden çalıştırılmaz: yükleme sürerken "takımı yok" sanıp gerçek veriyi
     * silerdi — bu, "veri gelmeden karar verme" kuralının aynısı.
     */
    effect(
      () => {
        const id = this.scope.userId();
        if (!id) return;
        if (!this.invites.teamsLoaded()) return;
        // Hata "takımı yok" demek değil: onarım yalnızca BAŞARILI bir yanıttan sonra karar verir.
        if (this.invites.teamsFailed()) return;
        this.scope.repairInheritedData(this.invites.myTeams().length > 0);
      },
      // Onarım `revision` sinyalini yazar. Angular 18'de bu `allowSignalWrites` bayrağını
      // gerektiriyordu (yoksa NG0600 ile SESSİZCE yutuluyordu — tarayıcıda birebir yaşandı);
      // Angular 22'de effect içinde sinyale yazmak serbest, bayrak kaldırıldı.
    );

    /*
     * CİHAZDA KALMIŞ AÇIK TAKIM. Seçim cihaza yazılıyor; takım silinmiş ya da kullanıcı takımdan
     * çıkarılmışsa cihaz hâlâ onu "açık" sanıyordu ve kadro ekranı olmayan bir takımla çalışıyordu
     * (sunucu yazmayı reddediyordu). Liste SUNUCUDAN başarıyla geldikten sonra, açık takım
     * listede yoksa ilk takıma geçilir; hiç takım yoksa seçim bırakılır.
     *
     * AÇIK TAKIM BOŞSA DA SEÇİLİR (11 Ekim 2026, uçtan uca testte bulundu): seçim cihaza yazıldığı
     * için yeni bir cihazda (ya da veriler temizlenince) boş kalıyordu. Kadro ekranı kimlik
     * panelinde takımın adını gösterse de HİÇBİR takıma bağlı olmayan yerel bir kadroyla
     * çalışıyordu: eklenen oyuncular sunucuya yazılmıyor, üyeler boş kadro görüyordu. Artık
     * takımı olan kullanıcıda açık takım asla boş kalmaz — önce KENDİ kurduğu takım, yoksa ilki.
     */
    effect(() => {
      // Okunacak sinyaller erken dönüşten ÖNCE okunur (bkz. proje notları · effect erken dönüş tuzağı).
      const id = this.activeTeam.teamId();
      const yuklendi = this.invites.teamsLoaded();
      const hata = this.invites.teamsFailed();
      const takimlar = this.invites.myTeams();
      if (!yuklendi || hata) return;
      const yeni = acikTakimSec(id, takimlar);
      if (yeni !== id) this.activeTeam.select(yeni);
    });

    // Takım listesi oturum açılır açılmaz çekilir; onarım da menüye girilmeden yapılabilsin.
    effect(() => {
      this.scope.userId();
      void this.invites.loadMyTeams();
    });

    inject(Router).events.subscribe((e) => {
      if (e instanceof NavigationStart) {
        if (this.gecisZamanlayici) clearTimeout(this.gecisZamanlayici);
        this.gecisZamanlayici = setTimeout(() => this.gecisSuruyor.set(true), 300);
      } else if (e instanceof NavigationEnd || e instanceof NavigationCancel || e instanceof NavigationError) {
        if (this.gecisZamanlayici) clearTimeout(this.gecisZamanlayici);
        this.gecisZamanlayici = null;
        this.gecisSuruyor.set(false);
      }
    });

    // Kulüp seçimi zamanla genişledi (arma → forma → kaleci forması). Daha önce seçilmiş
    // kulüplerde eksik kalan alanları açılışta bir kez tamamlar; hata olursa sessizce geçer.
    void this.clubKits.run();
  }
}
