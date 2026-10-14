import { Directive, ElementRef, NgZone, OnInit, inject, input } from '@angular/core';

/**
 * GÖRÜNÜNCE BELİR.
 *
 * Açılış sayfasında bölümler ekrana girdikçe yerine oturuyor. Kaydırma olayını dinlemek
 * yerine `IntersectionObserver`: tarayıcı kesişimi kendisi hesaplıyor, saniyede onlarca
 * `scroll` olayında change detection çalıştırmıyoruz.
 *
 * Sınıf ekleyip BIRAKIYOR (`.is-in`): animasyon CSS'in işi. Öğe bir kez belirdikten sonra
 * gözlem durur — yukarı kaydırınca tekrar tekrar oynayan bir sayfa, okumayı zorlaştırıyor.
 *
 * `prefers-reduced-motion` altında hiç beklemeden sınıf verilir: içerik animasyonun
 * arkasında saklı kalmamalı — hareketi azaltmak, görmemek demek değildir.
 */
@Directive({
  selector: '[appReveal]',
  standalone: true,
})
export class RevealDirective implements OnInit {
  /** Sıralı belirme için gecikme (ms) — kart ızgaralarında kullanılır. */
  readonly appReveal = input<number | ''>('');

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);

  /*
   * GİRDİLER KURUCUDA OKUNAMAZ: bağlanan değer o an henüz yazılmamıştır (varsayılan döner).
   * Angular 22 bunu derleme zamanında yakalıyor (NG8118). Kurulum bu yüzden `ngOnInit`'te.
   */
  ngOnInit(): void {
    const gecikme = Number(this.appReveal() || 0);
    if (gecikme > 0) this.host.style.setProperty('--reveal-delay', `${gecikme}ms`);
    this.host.classList.add('reveal');

    const azHareket =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (azHareket || typeof IntersectionObserver === 'undefined') {
      this.host.classList.add('is-in');
      return;
    }

    this.zone.runOutsideAngular(() => {
      const gozcu = new IntersectionObserver(
        (kayitlar) => {
          for (const k of kayitlar) {
            if (!k.isIntersecting) continue;
            this.host.classList.add('is-in');
            gozcu.disconnect(); // bir kez belirir, sonra rahat bırakır
          }
        },
        // Öğenin %18'i göründüğünde başlasın: tam kenarda tetiklenince göz kaçırıyor.
        { threshold: 0.18 },
      );
      gozcu.observe(this.host);
    });
  }
}
