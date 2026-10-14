import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  inject,
} from '@angular/core';

/**
 * İMLECİ TAKİP EDEN NOKTA (kullanıcı isteği: "fare ikonunun arkasından böyle bir nokta
 * takip etsin").
 *
 * Nokta imlecin TAM ÜSTÜNDE değil, ARKASINDAN gelir: her karede hedefe doğru sabit oranda
 * yaklaşıyor (lerp). Böylece hızlı harekette geride kalıp yavaşça yetişiyor — takip hissi
 * bundan doğuyor.
 *
 * Renk `mix-blend-mode: difference` ile çözülüyor: sayfa hem koyu hem krem bantlar taşıyor;
 * tek bir renk ikisinde birden okunmaz. Fark karışımı noktayı her zeminin tersine çeviriyor,
 * yani ayrıca "açık bant" kuralı yazmaya gerek kalmıyor.
 *
 * Döngü Angular bölgesinin DIŞINDA ve yalnızca imleç kıpırdadıktan sonra açılıyor; duran
 * imleçte kare isteği kapanıyor (boşuna çalışan bir rAF döngüsü pili yer).
 *
 * Dokunmatikte (`hover: none`) ve `prefers-reduced-motion` altında HİÇ bağlanmaz.
 */
@Component({
  selector: 'app-cursor-dot',
  standalone: true,
  template: '<span class="nokta"></span>',
  styleUrl: './cursor-dot.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
})
export class CursorDotComponent implements AfterViewInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);

  /** Her karede hedefe yaklaşma oranı: küçük değer = daha tembel, daha uzun kuyruk. */
  private readonly yaklasma = 0.14;

  private hedefX = 0;
  private hedefY = 0;
  private x = 0;
  private y = 0;
  private kare = 0;
  private yerlesti = false;

  private readonly hareket = (olay: PointerEvent): void => {
    this.hedefX = olay.clientX;
    this.hedefY = olay.clientY;
    if (!this.yerlesti) {
      // İlk karede ekranın köşesinden süzülmesin: noktayı imlecin yanında başlat.
      this.yerlesti = true;
      this.x = this.hedefX;
      this.y = this.hedefY;
      this.host.nativeElement.classList.add('gorunur');
    }
    this.baslat();
  };

  private baslat(): void {
    if (this.kare) return;
    this.kare = requestAnimationFrame(this.adim);
  }

  private readonly adim = (): void => {
    this.x += (this.hedefX - this.x) * this.yaklasma;
    this.y += (this.hedefY - this.y) * this.yaklasma;
    const el: HTMLElement = this.host.nativeElement;
    el.style.setProperty('--nx', `${this.x.toFixed(1)}px`);
    el.style.setProperty('--ny', `${this.y.toFixed(1)}px`);

    // Hedefe yeterince yaklaştıysa döngüyü kapat: duran imleçte kare istemeye gerek yok.
    const kalan = Math.hypot(this.hedefX - this.x, this.hedefY - this.y);
    this.kare = kalan < 0.4 ? 0 : requestAnimationFrame(this.adim);
  };

  ngAfterViewInit(): void {
    const azalt = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const imlecVar = window.matchMedia?.('(hover: hover)').matches ?? false;
    if (azalt || !imlecVar) return;
    this.zone.runOutsideAngular(() => {
      window.addEventListener('pointermove', this.hareket, { passive: true });
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('pointermove', this.hareket);
    if (this.kare) cancelAnimationFrame(this.kare);
  }
}
