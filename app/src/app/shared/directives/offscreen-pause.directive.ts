import { Directive, ElementRef, NgZone, OnDestroy, OnInit, inject } from '@angular/core';

/**
 * EKRAN DIŞINDA DURAKLAT (12 Ekim 2026) — `<main appEkranDisiDuraklat>`.
 *
 * Tanıtım sayfasında sürekli dönen animasyonlar (kartların "Mac ışığı", terazi, geri sayım,
 * SSS süsü, saha oyuncuları…) bölüm ekranda değilken de her karede stil + boyama maliyeti
 * üretiyordu; kaydırırken bu yük takılma olarak hissediliyordu (kullanıcı: "kaydırınca
 * animasyonlar kasmamalı"). Bu direktif host'un DOĞRUDAN çocuklarını (bölümleri) izler:
 * bölüm ekrandan uzaklaşınca içindeki ZAMANA BAĞLI animasyonlar duraklatılır, yaklaşınca
 * kaldıkları yerden sürer.
 *
 * Yalnızca belge zaman çizelgesindeki animasyonlara dokunulur: kaydırmaya bağlı
 * (`animation-timeline: view()/scroll()`) giriş/çıkış koreografisi zaten kaydırmayla ilerler,
 * duraklatılırsa bölüme gelindiğinde yerinden oynamazdı. Görünüm değişmez: duran şey ekranda
 * değildir. Gözlemci geniş paylıdır (üstte/altta yarım ekran) — animasyon bölüm GÖRÜNMEDEN
 * önce yeniden başlar.
 */
@Directive({ selector: '[appEkranDisiDuraklat]' })
export class OffscreenPauseDirective implements OnInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private gozlemci: IntersectionObserver | null = null;
  /** Bizim duraklattığımız animasyonlar — yalnızca onları yeniden başlatırız. */
  private readonly durdurulan = new WeakSet<Animation>();

  ngOnInit(): void {
    if (typeof IntersectionObserver === 'undefined' || typeof document === 'undefined') return;
    this.zone.runOutsideAngular(() => {
      this.gozlemci = new IntersectionObserver(
        (kayitlar) => {
          for (const k of kayitlar) this.ayarla(k.target as HTMLElement, k.isIntersecting);
        },
        { rootMargin: '50% 0px 50% 0px' },
      );
      for (const cocuk of Array.from((this.host.nativeElement as HTMLElement).children)) this.gozlemci.observe(cocuk);
    });
  }

  /** Bir öğenin (ve altındakilerin, sözde öğeler dahil) zamana bağlı animasyonlarını durdurur/sürdürür. */
  static zamanaBagli(el: Element): Animation[] {
    if (typeof el.getAnimations !== 'function') return [];
    return el.getAnimations({ subtree: true }).filter((a) => a.timeline === document.timeline);
  }

  ayarla(el: Element, gorunur: boolean): void {
    for (const a of OffscreenPauseDirective.zamanaBagli(el)) {
      if (!gorunur && a.playState === 'running') {
        a.pause();
        this.durdurulan.add(a);
      } else if (gorunur && this.durdurulan.has(a) && a.playState === 'paused') {
        a.play();
        this.durdurulan.delete(a);
      }
    }
  }

  ngOnDestroy(): void {
    this.gozlemci?.disconnect();
  }
}
