import { Directive, ElementRef, NgZone, OnDestroy, OnInit, inject } from '@angular/core';

/**
 * KAYDIRIRKEN BELİREN FİLE.
 *
 * Kullanıcı isteği (referans: buzzworthystudio): "kaydırınca arkada file gibi bir şey
 * çıkıyor, durunca gidiyor." Sayfanın arkasında kale filesi dokusu var; yalnızca PARMAK
 * ÜZERİNDEYKEN — yani kullanıcı hareket hâlindeyken — beliriyor, durunca çekiliyor.
 *
 * Neden sürekli durmuyor: doku sabit dursa okuma zemininde kalıcı bir gürültü olurdu.
 * Hareket sırasında ortaya çıkıp durunca kaybolması, dokuyu bir SAYFA DURUMU yapıyor
 * ("şu an geziyorsun"), dekor değil.
 *
 * Bu yüzden CSS zaman çizelgesi kullanılmadı: `scroll()` "NEREDE olduğunu" bilir,
 * "HAREKET EDİYOR MU" bilmez. Ölçülen şey hareketin kendisi, konumu değil.
 *
 * Maliyet: `passive` dinleyici, Angular bölgesinin DIŞINDA, ve yalnızca DURUM DEĞİŞİNCE
 * sınıf yazıyor — her karede stil yazan bir kaydırma dinleyicisi uzun sayfada kasmanın
 * en hızlı yolu.
 */
@Directive({
  selector: '[appScrollPulse]',
  standalone: true,
})
export class ScrollPulseDirective implements OnInit, OnDestroy {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);

  /**
   * Durduktan sonra filenin çekilmesi için beklenen süre. Kullanıcı isteği "durduğum gibi
   * kaybolsun": ilk sürümdeki 420ms fazla sabırlıydı, doku parmak durduktan sonra da bir an
   * duruyordu.
   *
   * 130ms denendi ve ÖLÇÜMDE KIRILDI: fare tekerleğinin tıkları arasında ~260ms boşluk var,
   * doku her tıkta 0,55 → 0,02 → 0,55 diye yanıp sönüyordu (ölçüldü). 300ms o boşluğu
   * köprüler ama gerçek durmada hâlâ hızlı: geçişle birlikte toplam ~480ms.
   */
  private static readonly DINGIN_MS = 300;

  private zamanlayici: ReturnType<typeof setTimeout> | null = null;
  private aktif = false;
  private dinleyici: (() => void) | null = null;

  ngOnInit(): void {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    this.zone.runOutsideAngular(() => {
      const kaydi = (): void => {
        if (!this.aktif) {
          this.aktif = true;
          this.host.classList.add('is-scrolling');
        }
        if (this.zamanlayici !== null) clearTimeout(this.zamanlayici);
        this.zamanlayici = setTimeout(() => {
          this.aktif = false;
          this.host.classList.remove('is-scrolling');
        }, ScrollPulseDirective.DINGIN_MS);
      };

      window.addEventListener('scroll', kaydi, { passive: true });
      this.dinleyici = () => window.removeEventListener('scroll', kaydi);
    });
  }

  ngOnDestroy(): void {
    if (this.zamanlayici !== null) clearTimeout(this.zamanlayici);
    this.dinleyici?.();
  }
}
