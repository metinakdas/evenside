import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { I18nService } from '../../../core/services/i18n.service';
import { RevealDirective } from '../../../shared/directives/reveal.directive';

export interface AdimKarti {
  no: string;
  foto: string;
  baslik: string;
  metin: string;
  sure: string;
}

/**
 * "ÜÇ ADIM, BEŞ DAKİKADAN KISA" kartları (11 Ekim 2026, kullanıcı: "bu ekranları birbirinden ayır,
 * aynı mantık revize"). Kura ve adalet kartlarıyla AYNI dil: beyaz yüzey, kenarda tur atan Mac
 * ışığı, birkaç saniyede bir geçen yeşil parıltı (`styles/_mac-isik.scss`). Üzerine gelince adımın
 * başlığı ve metni söner, yerinde o adımın motivasyon sözü kelime kelime yükselir
 * (`adim.motto1-3`, 6 dil). Stiller kendi dosyasında: tanıtım sayfasının SCSS'i bütçe sınırında.
 */
@Component({
  selector: 'app-adim-kartlari',
  imports: [RevealDirective],
  templateUrl: './adim-kartlari.component.html',
  styleUrl: './adim-kartlari.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdimKartlariComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  readonly adimlar = input.required<AdimKarti[]>();

  /** Sözü kelime kelime yükseltmek için (her kelime kendi gecikmesiyle). */
  protected kelimeler(anahtar: string): string[] {
    return this.t(anahtar).split(/\s+/).filter(Boolean);
  }
}
