import { Directive, ElementRef, NgZone, OnDestroy, OnInit, inject, input } from '@angular/core';

/**
 * İMLECİN YERİNİ CSS'E YAZAR — `--mx` / `--my` (host'a göre piksel).
 *
 * Tanıtım sayfasının yıldız katmanı bununla canlanıyor: parlak kopya, imlecin çevresine
 * açılan bir radyal maskeyle gösteriliyor, yani imleç nereye giderse oradaki noktalar
 * yanıyor. Tek tek noktaya olay bağlamak yerine TEK bir maske kullanılıyor — katman
 * dekoratif ve `pointer-events: none`, kendi üstünde olay bekleyemez.
 *
 * Angular bölgesinin DIŞINDA: imleç hareketi saniyede onlarca olaydır, her birinde
 * değişiklik algılama çalıştırmak sayfayı kasar. Değer doğrudan CSS değişkenine yazılıyor,
 * sinyal kullanılmıyor. Yazma `requestAnimationFrame` ile kare başına bire indiriliyor.
 *
 * `prefers-reduced-motion` altında dinleyici HİÇ bağlanmaz; maske merkezde sabit kalır.
 */
@Directive({ selector: '[appPointerGlow]', standalone: true })
export class PointerGlowDirective implements OnInit, OnDestroy {
  /**
   * Efektin ÇALIŞTIĞI bölge (seçici). Verilmezse host'un kendisi. Sabit (fixed) katmanlar her zaman
   * ekranda göründüğü için kapsam ayrıca verilmeli (yıldızlar → giriş ekranı).
   */
  readonly glowKapsam = input<string | null>(null);
  /** Kapsam ekranda mı: değilse imleç hareketi HİÇBİR ŞEY yazmaz (tam ekran maske boşuna çizilmesin). */
  private aktif = false;
  private gozlemci: IntersectionObserver | null = null;
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private kare = 0;
  private x = 0;
  private y = 0;
  private readonly hareket = (olay: PointerEvent): void => {
    if (!this.aktif) return;
    this.x = olay.clientX;
    this.y = olay.clientY;
    if (this.kare) return;
    this.kare = requestAnimationFrame(() => {
      this.kare = 0;
      const el: HTMLElement = this.host.nativeElement;
      const kutu = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${(this.x - kutu.left).toFixed(0)}px`);
      el.style.setProperty('--my', `${(this.y - kutu.top).toFixed(0)}px`);
    });
  };

  constructor() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.zone.runOutsideAngular(() => {
      window.addEventListener('pointermove', this.hareket, { passive: true });
    });
  }

  ngOnInit(): void {
    if (typeof IntersectionObserver === 'undefined') {
      this.aktif = true;
      return;
    }
    const secici = this.glowKapsam();
    const hedef = (secici ? document.querySelector(secici) : null) ?? this.host.nativeElement;
    this.zone.runOutsideAngular(() => {
      this.gozlemci = new IntersectionObserver((k) => (this.aktif = k.some((x) => x.isIntersecting)));
      this.gozlemci.observe(hedef);
    });
  }

  ngOnDestroy(): void {
    this.gozlemci?.disconnect();
    window.removeEventListener('pointermove', this.hareket);
    if (this.kare) cancelAnimationFrame(this.kare);
  }
}
