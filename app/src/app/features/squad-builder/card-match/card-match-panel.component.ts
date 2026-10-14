import { ChangeDetectionStrategy, Component, computed, inject, signal, DestroyRef, NgZone } from '@angular/core';
import { CardMatchService, CardMatchSuggestion } from '../../../core/services/card-match.service';
import { PlayerCardComponent } from '../../../shared/components/player-card/player-card.component';
import { I18nService } from '../../../core/services/i18n.service';
import { OYUN_DICTIONARIES } from '../../../core/i18n/oyun-dictionary';

/**
 * KART EŞLEME PANELİ — /kadro ekranında, havuzda aynı isimli bir "kendi kartı" bulunduğunda
 * çıkan öneri.
 *
 * İki kart YAN YANA gösterilir: kadro sahibinin elle girdiği tahminler ile kişinin kendi
 * cevapları. Karar kör verilmesin — hangi kartın devreye gireceği ve neyin değişeceği
 * görünür olmalı.
 *
 * Panel bir bildirim şerididir, modal değil: eşleme acil bir iş değil, kullanıcının kadro
 * kurmasını engellememeli. Açıp kapanabilir.
 */
/** Eşleme onayının ekranda kalma süresi. Okunacak kadar uzun, unutulacak kadar kısa. */
const LINKED_NOTICE_MS = 4000;

@Component({
    selector: 'app-card-match-panel',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [PlayerCardComponent],
    templateUrl: './card-match-panel.component.html',
    styleUrl: './card-match-panel.component.scss'
})
export class CardMatchPanelComponent {
  private readonly i18n = inject(I18nService);
  /** Sözlük ekranla birlikte yükleniyor (giriş paketi şişmesin). */
  protected readonly t = this.i18n.t;

  private readonly matches = inject(CardMatchService);

  protected readonly suggestions = computed(() => this.matches.suggestions());
  protected readonly busy = computed(() => this.matches.busy());
  protected readonly error = computed(() => this.matches.error());

  private readonly zone = inject(NgZone);

  protected readonly open = signal(false);
  /**
   * Eşleme yapıldıktan sonra gösterilen kısa onay. Kalıcı DEĞİL: iş bitti, mesaj birkaç
   * saniye sonra kendiliğinden kalkar (kullanıcı isteği) — yoksa sol kolonda kalıcı bir
   * bant olarak duruyor ve asıl işin (kadro) yerini alıyordu.
   */
  protected readonly linkedName = signal<string | null>(null);
  private linkedTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.i18n.register(OYUN_DICTIONARIES);
    // Ekran kapanırken bekleyen zamanlayıcı kalmasın (sızıntı + yok edilmiş sinyale yazma).
    inject(DestroyRef).onDestroy(() => {
      if (this.linkedTimer) clearTimeout(this.linkedTimer);
    });
  }

  protected toggle(): void {
    this.open.update((v) => !v);
  }

  protected async link(suggestion: CardMatchSuggestion): Promise<void> {
    const ok = await this.matches.link(suggestion);
    if (ok) {
      this.showLinked(suggestion.ownedCard.input.name);
      // Liste kendiliğinden kısalır; son öneri de bitince paneli kapat.
      if (this.suggestions().length === 0) this.open.set(false);
    }
  }

  /** Onayı gösterir ve ${LINKED_NOTICE_MS}ms sonra kaldırır. Üst üste eşlemede süre sıfırlanır. */
  private showLinked(name: string): void {
    this.linkedName.set(name);
    if (this.linkedTimer) clearTimeout(this.linkedTimer);
    this.linkedTimer = this.zone.runOutsideAngular(() =>
      setTimeout(() => {
        this.linkedName.set(null);
        this.linkedTimer = null;
      }, LINKED_NOTICE_MS),
    );
  }

  protected dismiss(suggestion: CardMatchSuggestion): void {
    this.matches.dismiss(suggestion);
    if (this.suggestions().length === 0) this.open.set(false);
  }
}
