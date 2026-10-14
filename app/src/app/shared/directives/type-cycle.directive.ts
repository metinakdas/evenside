import { Directive, ElementRef, NgZone, OnDestroy, OnInit, effect, inject, input } from '@angular/core';

/**
 * YAZMA EFEKTİ — kelime kendini siler, yenisini yazar (referans: buzzworthystudio,
 * "Let's build something, amazing. / crazy.").
 *
 * Başlığın SON kelimesi sabit bir söz değil, bir vaat listesi: adil → dengeli →
 * tartışmasız. Sayfanın konusu tek kelimeyle değişerek anlatılıyor.
 *
 * Erişilebilirlik: harf harf değişen metni ekran okuyucu her karede tekrar okur. Bu yüzden
 * animasyonlu yüzey `aria-hidden`, gerçek kelime ayrı bir `sr-only` kardeşte DURAN metin
 * olarak kalır (şablonda yazılı). Buradaki iş yalnızca görünen yüzeyi yazmak.
 *
 * Hareketi azaltılmışsa ilk kelime yazılı hâlde durur, imleç yanıp sönmez.
 */
@Directive({
  selector: '[appTypeCycle]',
  standalone: true,
})
export class TypeCycleDirective implements OnInit, OnDestroy {
  /** Sırayla yazılacak kelimeler. İlki sayfa açılırken YAZILI gelir. */
  readonly appTypeCycle = input<string[]>([]);

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);
  private zamanlayici: ReturnType<typeof setTimeout> | null = null;
  private gozcu: IntersectionObserver | null = null;

  // Ölçüler: yazmak silmekten yavaş (insan yazarken düşünür, silerken düşünmez).
  private static readonly YAZ_MS = 78;
  private static readonly SIL_MS = 34;
  private static readonly BEKLE_MS = 2200;

  /*
   * Girdiler KURUCUDA okunamaz (NG8118) — kurulum ngOnInit'te.
   */
  constructor() {
    /*
     * Liste DEĞİŞEBİLİR: dil değişince kelimeler yenileniyor. İlk kurulumdan sonraki her
     * değişimde döngü sıfırdan kuruluyor — yoksa efekt eski dizideki kelimeyi yazmayı
     * sürdürüyor ve ekranda iki dil karışıyor (ölçüldü).
     */
    effect(() => {
      const kelimeler = this.appTypeCycle();
      if (!this.kuruldu) return; // ilk kurulum ngOnInit'te
      this.durdur();
      this.gozcu?.disconnect();
      this.gozcu = null;
      this.kur(kelimeler);
    });
  }

  ngOnInit(): void {
    this.kuruldu = true;
    this.kur(this.appTypeCycle());
  }

  /** Kurulum: ilk kelimeyi yaz, koşullar uygunsa döngüyü başlat. */
  private kur(kelimeler: string[]): void {
    if (kelimeler.length === 0) return;

    this.host.textContent = kelimeler[0];
    this.host.classList.add('typed');

    const azHareket =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (azHareket || kelimeler.length < 2) return;

    this.host.classList.add('typed--live');

    /*
     * Ekranda değilken yazmanın anlamı yok: sekme arkadayken ya da kullanıcı aşağıdayken
     * boşuna zamanlayıcı döndürmüyoruz.
     */
    this.zone.runOutsideAngular(() => {
      if (typeof IntersectionObserver === 'undefined') {
        this.baslat(kelimeler);
        return;
      }
      this.gozcu = new IntersectionObserver(
        (kayitlar) => {
          for (const k of kayitlar) {
            if (k.isIntersecting) this.baslat(kelimeler);
            else this.durdur();
          }
        },
        { threshold: 0.2 },
      );
      this.gozcu.observe(this.host);
    });
  }

  ngOnDestroy(): void {
    this.durdur();
    this.gozcu?.disconnect();
  }

  /** İlk kurulum yapıldı mı — effect'in ilk turunda iki kez kurmamak için. */
  private kuruldu = false;

  private durdur(): void {
    if (this.zamanlayici !== null) clearTimeout(this.zamanlayici);
    this.zamanlayici = null;
  }

  private baslat(kelimeler: string[]): void {
    if (this.zamanlayici !== null) return; // zaten dönüyor
    let sira = 0;
    let harf = kelimeler[0].length;
    let siliyor = true;

    const adim = (): void => {
      if (siliyor) {
        harf -= 1;
        if (harf <= 0) {
          harf = 0;
          siliyor = false;
          sira = (sira + 1) % kelimeler.length;
        }
      } else {
        harf += 1;
      }

      const kelime = kelimeler[sira];
      this.host.textContent = kelime.slice(0, harf);

      // Kelime tamamlandı: okunacak kadar dursun, sonra silmeye geç.
      const tamamlandi = !siliyor && harf >= kelime.length;
      if (tamamlandi) siliyor = true;

      const gecikme = tamamlandi
        ? TypeCycleDirective.BEKLE_MS
        : siliyor
          ? TypeCycleDirective.SIL_MS
          : TypeCycleDirective.YAZ_MS;
      this.zamanlayici = setTimeout(adim, gecikme);
    };

    this.zamanlayici = setTimeout(adim, TypeCycleDirective.BEKLE_MS);
  }
}
