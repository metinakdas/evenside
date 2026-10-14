import { Directive, ElementRef, NgZone, OnInit, inject, input } from '@angular/core';

/**
 * RAKAM SAYARAK GELİR.
 *
 * Sosyal kanıt şeridindeki sayılar ekrana girince 0'dan hedefe sayıyor. Küçük ama işe yarayan
 * bir hareket: göz rakama takılıyor, şerit "dekor" olmaktan çıkıyor.
 *
 * Sayma JS gerektiriyor (CSS ile metin içeriği değiştirilemez) ama Angular BÖLGESİNİN
 * DIŞINDA çalışıyor: her karede değişiklik algılama tetiklemek uzun bir sayfada kasardı.
 * Metin doğrudan DOM'a yazılıyor.
 *
 * Erişilebilirlik: sayma sırasında ekran okuyucuya ara değerler okutulmaz — öğe
 * `aria-hidden` değil ama değer tek seferde okunacak şekilde sayma 900ms'de biter ve
 * `prefers-reduced-motion` altında hiç sayılmaz, hedef değer doğrudan yazılır.
 */
@Directive({
  selector: '[appCountUp]',
  standalone: true,
})
export class CountUpDirective implements OnInit {
  /** Hedef sayı. Metindeki diğer karakterler (v4, dk, ₺) şablonda ayrı duruyor. */
  readonly appCountUp = input.required<number>();

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);

  /*
   * Zorunlu girdi KURUCUDA okunamaz — değeri henüz yoktur (NG8118, derleme hatası).
   * Sayma `ngOnInit`'te başlar.
   */
  ngOnInit(): void {
    const hedef = this.appCountUp();
    const yaz = (deger: number) => (this.host.textContent = String(deger));

    const azHareket =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (azHareket || typeof IntersectionObserver === 'undefined') {
      yaz(hedef);
      return;
    }

    yaz(0);
    this.zone.runOutsideAngular(() => {
      const gozcu = new IntersectionObserver(
        (kayitlar) => {
          if (!kayitlar.some((k) => k.isIntersecting)) return;
          gozcu.disconnect();

          const sure = 900;
          const basla = performance.now();
          const adim = (simdi: number) => {
            const oran = Math.min(1, (simdi - basla) / sure);
            // Yavaşlayarak dur: sabit hızda sayan bir rakam makine gibi duruyor.
            const yumusak = 1 - Math.pow(1 - oran, 3);
            yaz(Math.round(hedef * yumusak));
            if (oran < 1) requestAnimationFrame(adim);
          };
          requestAnimationFrame(adim);
        },
        { threshold: 0.4 },
      );
      gozcu.observe(this.host);
    });
  }
}
