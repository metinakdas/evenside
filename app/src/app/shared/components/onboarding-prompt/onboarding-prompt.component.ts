import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FocusTrapDirective } from '../../directives/focus-trap.directive';
import { Router } from '@angular/router';
import { PlayerRepositoryService } from '../../../core/services/player-repository.service';
import { UserScopeService } from '../../../core/services/user-scope.service';

const KEY = 'saha42.onboarding.v1';
import { I18nService } from '../../../core/services/i18n.service';
import { AUTH_DICTIONARIES } from '../../../core/i18n/auth-dictionary';

/** Diskte tutulan hâl — "bir daha gösterme" kalıcı, "sonra" bir sonraki açılışta geri gelir. */
interface OnboardingState {
  /** Kullanıcı "bir daha gösterme" dedi. */
  dismissed: boolean;
  /** "Daha sonra hatırlat" denen an (epoch ms). */
  snoozedAt: number | null;
}

/** "Daha sonra" ne kadar susar. Bir günden kısa olursa her açılışta çıkar ve rahatsız eder. */
const SNOOZE_MS = 24 * 60 * 60 * 1000;

/**
 * AÇILIŞ DAVETİ — menüye ilk gelen kullanıcıyı TEK bir işe yönlendirir: kendi kartını
 * oluşturmak. Takıma katılma seçeneği buradan kaldırıldı (kullanıcı isteği) — kartı olmayan
 * biri zaten takıma katılamıyor, dolayısıyla ilk adım her hâlükârda kart.
 *
 * Üç kuralı var, üçü de "reklam gibi durmasın" diye:
 * 1. Kullanıcının ZATEN kartı varsa hiç açılmaz — anlatacak bir şey kalmamıştır.
 * 2. "Daha sonra hatırlat" bir gün susturur; "bir daha gösterme" kalıcıdır.
 * 3. Esc ve dışına tıklama "daha sonra" ile aynıdır — kapatmak cezalandırılmaz.
 */
@Component({
  selector: 'app-onboarding-prompt',
  imports: [FocusTrapDirective],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './onboarding-prompt.component.html',
  styleUrl: './onboarding-prompt.component.scss',
})
export class OnboardingPromptComponent {
  private readonly i18n = inject(I18nService);
  /** Çeviri; sözlük ekranla birlikte yükleniyor. */
  protected readonly t = this.i18n.t;

  private readonly players = inject(PlayerRepositoryService);
  private readonly router = inject(Router);

  private readonly scope = inject(UserScopeService);
  private readonly state = signal<OnboardingState>(this.read());
  private readonly closed = signal(false);
  /**
   * Havuz BU KULLANICI İÇİN yüklenene kadar karar verilmez. Tek seferlik `ready` promise'i
   * yetmiyordu: tanıtım sayfasında oturumsuz açılışta zaten çözülüyor, giriş yapan kullanıcının
   * havuzu henüz gelmemişken `ownCard()` null dönüyor ve kartı OLAN kullanıcıya davet bir an
   * açılıp kapanıyordu (kullanıcı geri bildirimi, 11 Ekim 2026).
   */
  private readonly poolReady = this.players.readyForUser;

  /** Kullanıcının kendi kartı var mı — varsa davet hiç açılmaz. */
  private readonly hasCard = computed(() => !!this.players.ownCard());

  readonly visible = computed(() => {
    if (!this.poolReady()) return false;
    if (this.closed() || this.hasCard()) return false;
    const s = this.state();
    if (s.dismissed) return false;
    if (s.snoozedAt && Date.now() - s.snoozedAt < SNOOZE_MS) return false;
    return true;
  });

  constructor() {
    this.i18n.register(AUTH_DICTIONARIES);

    /*
     * "Bir daha gösterme" tercihi KİŞİYE aittir. Cihaz başına tutulduğu için aynı tarayıcıda
     * yeni hesap açan kullanıcı daveti hiç görmüyordu (kullanıcı geri bildirimi).
     */
    effect(
      () => {
        this.scope.userId();
        this.scope.revision();
        this.state.set(this.read());
      });
  }

  /** Depoya erişilemese bile (gizli sekme, kapalı çerez) davet çalışmalı — sadece hatırlamaz. */
  private read(): OnboardingState {
    try {
      const raw = localStorage.getItem(this.scope.key(KEY));
      const parsed = raw ? (JSON.parse(raw) as Partial<OnboardingState>) : null;
      return { dismissed: parsed?.dismissed ?? false, snoozedAt: parsed?.snoozedAt ?? null };
    } catch {
      return { dismissed: false, snoozedAt: null };
    }
  }

  private write(next: OnboardingState): void {
    this.state.set(next);
    try {
      localStorage.setItem(this.scope.key(KEY), JSON.stringify(next));
    } catch {
      // Hatırlayamıyorsak davet bir sonraki açılışta yine çıkar; akışı bozmaz.
    }
  }

  /** Kartını oluşturmaya gider; davet kapanır ama "bir daha gösterme" sayılmaz. */
  createCard(): void {
    this.closed.set(true);
    void this.router.navigateByUrl('/my-card');
  }

  snooze(): void {
    this.write({ dismissed: false, snoozedAt: Date.now() });
    this.closed.set(true);
  }

  dismiss(): void {
    this.write({ dismissed: true, snoozedAt: null });
    this.closed.set(true);
  }
}
