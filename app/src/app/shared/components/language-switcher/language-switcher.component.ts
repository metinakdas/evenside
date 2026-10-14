import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { I18nService } from '../../../core/services/i18n.service';
import { SupportedLocale } from '../../../core/i18n/dictionaries';

/**
 * DİL SEÇİCİ — uygulamanın kendi dilinde, özel açılır liste.
 *
 * Önce yerleşik `<select>` kullanılmıştı; tarayıcının beyaz, sistem yazı tipli listesi koyu
 * arayüzün içinde yamalı duruyordu (kullanıcı: "CSS çok kötü"). Artık düğme + panel:
 * uygulamanın yüzeyleri, yazı tipi ve vurgu yeşiliyle.
 *
 * Erişilebilirlik yerleşik denetimden geri kalmasın diye elle kuruldu:
 * - Düğme `aria-haspopup="listbox"` + `aria-expanded`, panel `role="listbox"`,
 *   satırlar `role="option"` ve `aria-selected`.
 * - Ok tuşlarıyla gezinme, Enter/Space ile seçme, Esc ile kapanma, dışarı tıklayınca kapanma.
 * - Odak panele taşınır, kapanınca düğmeye geri döner (klavye kullanıcısı kaybolmaz).
 */
@Component({
  selector: 'app-language-switcher',
  standalone: true,
  templateUrl: './language-switcher.component.html',
  styleUrl: './language-switcher.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LanguageSwitcherComponent {
  private readonly i18n = inject(I18nService);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  protected readonly locales = this.i18n.locales;
  protected readonly secili = this.i18n.locale;
  protected readonly t = this.i18n.t;
  protected readonly acik = signal(false);
  /** Klavyeyle gezinirken vurgulanan satır. */
  protected readonly imlec = signal(0);

  protected readonly seciliDil = computed(
    () => this.locales.find((d) => d.id === this.secili()) ?? this.locales[0],
  );

  protected ac(): void {
    const sira = this.locales.findIndex((d) => d.id === this.secili());
    this.imlec.set(sira < 0 ? 0 : sira);
    this.acik.set(true);
    // Panel bir sonraki karede basılıyor: odak ondan sonra taşınabilir.
    requestAnimationFrame(() => this.odakla());
  }

  protected kapat(odakGeri = true): void {
    if (!this.acik()) return;
    this.acik.set(false);
    if (odakGeri) {
      (this.host.nativeElement.querySelector('.dil__dugme') as HTMLElement | null)?.focus();
    }
  }

  protected degistir(dil: SupportedLocale): void {
    this.i18n.setLocale(dil);
    this.kapat();
  }

  protected tus(olay: KeyboardEvent): void {
    if (!this.acik()) {
      if (olay.key === 'ArrowDown' || olay.key === 'Enter' || olay.key === ' ') {
        olay.preventDefault();
        this.ac();
      }
      return;
    }
    if (olay.key === 'Escape') {
      olay.preventDefault();
      this.kapat();
      return;
    }
    if (olay.key === 'ArrowDown' || olay.key === 'ArrowUp') {
      olay.preventDefault();
      const yon = olay.key === 'ArrowDown' ? 1 : -1;
      const n = this.locales.length;
      this.imlec.set((this.imlec() + yon + n) % n);
      this.odakla();
      return;
    }
    if (olay.key === 'Enter' || olay.key === ' ') {
      olay.preventDefault();
      this.degistir(this.locales[this.imlec()].id);
    }
  }

  /** Dışarı tıklayınca kapanır — panel açıkken sayfa kilitlenmiyor. */
  @HostListener('document:pointerdown', ['$event'])
  protected disari(olay: Event): void {
    if (!this.acik()) return;
    const hedef = olay.target;
    if (hedef instanceof Node && this.host.nativeElement.contains(hedef)) return;
    this.kapat(false);
  }

  private odakla(): void {
    const satirlar = this.host.nativeElement.querySelectorAll('.dil__satir') as NodeListOf<HTMLElement>;
    satirlar[this.imlec()]?.focus();
  }
}
