import { Directive, ElementRef, NgZone, OnDestroy, OnInit, inject, input } from '@angular/core';

/**
 * Yığın kartların ilerlemesi. Uzun bir izin (host) içinde yapışık bir sahne var; izde ne kadar
 * yol alındığını 0…(kart sayısı − 1) aralığında `--p` CSS değişkenine yazar. Kartların
 * konumu tamamen CSS'te `--p`'den türetilir — yukarı kaydırınca sıra kendiliğinden tersten gelir.
 *
 * CSS zaman çizelgesi burada yetmedi: yapışık sahnenin kendi `view()` ilerlemesi yapışıkken
 * DURUR (bkz. proje notları "Dert kartları yığın oldu"). Ölçülen şey izin kendisi.
 * Angular bölgesinin dışında; hareketi azaltılmışta hiç bağlanmaz (CSS düz listeye döner).
 */
@Directive({ selector: '[appStackProgress]' })
export class StackProgressDirective implements OnInit, OnDestroy {
  readonly appStackProgress = input.required<number>();

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private frame = 0;
  private readonly onScroll = (): void => {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.update();
    });
  };

  ngOnInit(): void {
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    this.zone.runOutsideAngular(() => {
      window.addEventListener('scroll', this.onScroll, { passive: true });
      window.addEventListener('resize', this.onScroll, { passive: true });
    });
    this.update();
  }

  ngOnDestroy(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onScroll);
    cancelAnimationFrame(this.frame);
  }

  private update(): void {
    const el: HTMLElement = this.host.nativeElement;
    const steps = Math.max(1, this.appStackProgress() - 1);
    const rect = el.getBoundingClientRect();
    // Yol, yapışık sahnenin YAPIŞTIĞI andan bırakıldığı ana kadar: ölü kaydırma yok.
    const stage = el.firstElementChild as HTMLElement | null;
    const stickyTop = stage ? parseFloat(getComputedStyle(stage).top) || 0 : 0;
    const range = Math.max(1, rect.height - (stage?.offsetHeight ?? window.innerHeight));
    const t = Math.min(1, Math.max(0, (stickyTop - rect.top) / range));
    // Sonda kısa bekleme: son kart hemen kaymasın.
    const p = Math.min(steps, t * (steps + 0.25));
    el.style.setProperty('--p', p.toFixed(4));
  }
}
