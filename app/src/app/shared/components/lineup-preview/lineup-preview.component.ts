import { ChangeDetectionStrategy, Component, computed, input, inject } from '@angular/core';
import { I18nService } from '../../../core/services/i18n.service';
import { Player } from '../../../core/models/player.model';
import { PlayerCardComponent } from '../player-card/player-card.component';
import { PitchJugglerComponent } from '../pitch-juggler/pitch-juggler.component';

/**
 * KADRO ÖNİZLEMESİ — "kartın sahada bir yer tutuyor".
 *
 * Ana menüdeki KARTIM kutusunun sahnesi, tanıtım sayfasında da kullanılabilsin diye ortak
 * bileşene alındı (kullanıcı isteği: "bu 2. görseli tanıtım sayfasına da ekle"). Yedi yuva:
 * kale 1 · defans 3 · orta saha 2 · forvet 1 (7v7'nin varsayılan 3-2-1'i). Verilen kart
 * KENDİ hattının orta yuvasında gerçek kart olarak basılır, kalanlar hayalet kalır.
 *
 * Saha ÇİZİM: fotoğraf değil, uygulamanın kendi çizgi dili.
 */
@Component({
  selector: 'app-lineup-preview',
  standalone: true,
  imports: [PlayerCardComponent, PitchJugglerComponent],
  templateUrl: './lineup-preview.component.html',
  styleUrl: './lineup-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
})
export class LineupPreviewComponent {
  protected readonly t = inject(I18nService).t;
  /** Sahada gösterilecek kart; verilmezse yedi yuva da hayalet kalır. */
  readonly card = input<Player | null>(null);
  /** Top sektiren figür — dekor. Kalabalık yerlerde kapatılabilsin diye giriş. */
  readonly juggler = input(true);

  protected readonly spots = computed(() => {
    const card = this.card();
    const yuvalar = [
      { id: 'kal', x: 10, y: 50, line: 'KAL' },
      { id: 'def-ust', x: 27, y: 20, line: 'DEF' },
      { id: 'def-orta', x: 24, y: 50, line: 'DEF' },
      { id: 'def-alt', x: 27, y: 80, line: 'DEF' },
      { id: 'os-ust', x: 50, y: 32, line: 'OS' },
      { id: 'os-alt', x: 50, y: 68, line: 'OS' },
      { id: 'for', x: 70, y: 50, line: 'FOR' },
    ];
    // Kartın mevkisi hangi hatta düşüyorsa o hattın yuvası kullanıcıya ayrılır.
    const mevki = card?.ratings.position;
    const benim =
      mevki === 'KAL' ? 'kal' : mevki === 'DEF' ? 'def-orta' : mevki === 'OS' ? 'os-ust' : 'for';
    return yuvalar.map((y) => ({ ...y, mine: !!card && y.id === benim }));
  });
}
