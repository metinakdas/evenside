import { ChangeDetectionStrategy, Component, HostListener, computed, output, signal, inject } from '@angular/core';
import { UserScopeService } from '../../../core/services/user-scope.service';
import { EMPTY_MATCH_DETAILS, MatchDetails } from '../../../core/models/match-details.model';
import { FocusTrapDirective } from '../../../shared/directives/focus-trap.directive';
import { I18nService } from '../../../core/services/i18n.service';
import { OYUN_DICTIONARIES } from '../../../core/i18n/oyun-dictionary';

const STORAGE_KEY = 'saha42.match.v1';

/**
 * "İndir" popup'ı: kadro görselinin başlığına basılacak maç bilgisini sorar (saha/adres,
 * tarih, saat). Bilgiler hatırlanır — aynı grup çoğunlukla aynı sahada, aynı saatte oynuyor;
 * her hafta yeniden yazdırmak gereksiz.
 */
@Component({
    selector: 'app-export-dialog',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FocusTrapDirective],
    templateUrl: './export-dialog.component.html',
    styleUrl: './export-dialog.component.scss'
})
export class ExportDialogComponent {
  private readonly i18n = inject(I18nService);
  /** Sözlük ekranla birlikte yükleniyor (giriş paketi şişmesin). */
  protected readonly t = this.i18n.t;

  constructor() {
    this.i18n.register(OYUN_DICTIONARIES);
  }

  /** Kullanıcı "İndir"e bastı: doldurulan bilgiyle dışa aktarılır. */
  /**
   * Onay: maç bilgisi + görselin de inip inmeyeceği. Kayıt her iki durumda da yapılır;
   * `download` yalnızca PNG'yi etkiler.
   */
  readonly confirmed = output<{ details: MatchDetails; download: boolean }>();
  readonly cancelled = output<void>();

  /** Hatırlanan saha KİŞİYE aittir; anahtar kullanıcıya göre üretilir. */
  private readonly scope = inject(UserScopeService);
  protected readonly details = signal<MatchDetails>(readStored(this.scope.key(STORAGE_KEY)));
  /** İlk "İndir" denemesinden sonra doğrulama canlıya geçer (bkz. oyuncu formundaki aynı desen). */
  protected readonly submitted = signal(false);

  protected readonly venueError = computed(() =>
    this.submitted() && !this.details().venue.trim() ? this.t('saha.adGerek') : null,
  );
  protected readonly kickoffError = computed(() =>
    this.submitted() && !this.details().kickoff ? this.t('saha.vakitGerek') : null,
  );

  /**
   * Alanın HERHANGİ bir yerine tıklamak takvimi açar (kullanıcı isteği) — tarayıcının
   * varsayılanında yalnızca sağdaki küçük takvim simgesi açıyor. `showPicker()` yalnızca
   * kullanıcı etkileşiminde çağrılabilir ve bazı tarayıcılarda yok; desteklenmiyorsa simge
   * yolu çalışmaya devam eder.
   */
  protected openPicker(event: Event): void {
    const input = event.target as HTMLInputElement & { showPicker?: () => void };
    try {
      input.showPicker?.();
    } catch {
      // Desteklenmiyor ya da etkileşim dışı çağrıldı: yerleşik davranış kalır.
    }
  }

  protected onInput(key: keyof MatchDetails, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.details.update((d) => ({ ...d, [key]: value }));
  }

  protected confirm(download: boolean): void {
    this.submitted.set(true);
    const details = this.details();
    // İkisi de zorunlu (kullanıcı isteği): eksikse hiçbir şey olmaz, alanlar hatayı gösterir.
    // Kayıt için de zorunlu: geçmişteki maçın kimliği "vakit + saha".
    if (!details.venue.trim() || !details.kickoff) return;
    writeStored(this.scope.key(STORAGE_KEY), details);
    this.confirmed.emit({ details, download });
  }

  protected cancel(): void {
    this.cancelled.emit();
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.cancel();
  }
}

function readStored(key: string): MatchDetails {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...EMPTY_MATCH_DETAILS };
    const parsed = JSON.parse(raw) as Partial<MatchDetails>;
    // Yalnızca SAHA hatırlanır: geçen haftanın tarih/saatini görselin başlığına basmak, boş
    // bırakmaktan daha kötü — kullanıcı her indirmede vakti bilinçli olarak seçsin.
    return { venue: parsed.venue ?? '', kickoff: '' };
  } catch {
    return { ...EMPTY_MATCH_DETAILS };
  }
}

function writeStored(key: string, details: MatchDetails): void {
  try {
    localStorage.setItem(key, JSON.stringify({ venue: details.venue }));
  } catch {
    // Depoya erişilemiyorsa bilgi yalnızca bu indirmede kullanılır — akış tıkanmaz.
  }
}
