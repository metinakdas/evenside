import { Directive, ElementRef, NgZone, OnDestroy, OnInit, effect, inject, input } from '@angular/core';

/**
 * ÜZERİNE GELİNCE METİN DEĞİŞTİREN YAZI — ilk sayfadaki yazma efektinin dili: mevcut metin harf
 * harf silinir, hedef metin harf harf yazılır; imleç çekilince geri döner.
 *
 * Kullanım (problem sahnesi): saat "21:00" → "KAOS BİTTİ." Host üzerinde olay dinlenir, metin
 * host'un İÇİNDEKİ `[data-yazi]` öğesine yazılır. İkinci metindeyken host'a `yazi--b` sınıfı
 * eklenir (stil oradan değişir: boyut, renk). Sınıf, metin TAMAMEN silinince değişir — yarım
 * kelime iki farklı boyutta görünmesin.
 *
 * Hover alanı sabit kalmalı: host'un ölçüsü yazılan metne göre değişirse imleç kutudan düşer ve
 * efekt kendini kapatır (ileri-geri titreme). Bunu şablon/stil sağlar (görünmez iskelet metin).
 *
 * Klavye: odaklanınca da tetiklenir (host `tabindex` taşımalı). Hareketi azaltılmışta metin
 * anında değişir. Zamanlayıcı Angular bölgesinin DIŞINDA.
 */
@Directive({ selector: '[appHoverType]', standalone: true })
export class HoverTypeDirective implements OnInit, OnDestroy {
  /** [ilk metin, üzerine gelinince yazılacak metin] */
  readonly appHoverType = input<[string, string]>(['', '']);

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);
  private zamanlayici: ReturnType<typeof setTimeout> | null = null;
  private hedef: 0 | 1 = 0;
  private kuruldu = false;

  private static readonly SIL_MS = 38;
  private static readonly YAZ_MS = 70;

  private readonly gir = (): void => this.git(1);
  private readonly cik = (): void => this.git(0);

  constructor() {
    effect(() => {
      const metinler = this.appHoverType();
      if (!this.kuruldu) return;
      this.durdur();
      this.hedef = 0;
      this.host.classList.remove('yazi--b');
      this.yuzey().textContent = metinler[0];
    });
  }

  ngOnInit(): void {
    this.kuruldu = true;
    this.yuzey().textContent = this.appHoverType()[0];
    this.zone.runOutsideAngular(() => {
      this.host.addEventListener('pointerenter', this.gir);
      this.host.addEventListener('pointerleave', this.cik);
      this.host.addEventListener('focus', this.gir);
      this.host.addEventListener('blur', this.cik);
    });
  }

  ngOnDestroy(): void {
    this.durdur();
    this.host.removeEventListener('pointerenter', this.gir);
    this.host.removeEventListener('pointerleave', this.cik);
    this.host.removeEventListener('focus', this.gir);
    this.host.removeEventListener('blur', this.cik);
  }

  private yuzey(): HTMLElement {
    return (this.host.querySelector('[data-yazi]') as HTMLElement | null) ?? this.host;
  }

  private git(hedef: 0 | 1): void {
    if (this.hedef === hedef) return;
    this.hedef = hedef;
    this.durdur();
    const metin = this.appHoverType()[hedef];
    const el = this.yuzey();

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this.host.classList.toggle('yazi--b', hedef === 1);
      el.textContent = metin;
      return;
    }

    // Önce sil (yarıda kalmışsa oradan), boşalınca boyut/renk değişir, sonra yaz.
    const sil = (): void => {
      const simdiki = el.textContent ?? '';
      if (simdiki.length > 0) {
        el.textContent = simdiki.slice(0, -1);
        this.zamanlayici = setTimeout(sil, HoverTypeDirective.SIL_MS);
        return;
      }
      this.host.classList.toggle('yazi--b', hedef === 1);
      let harf = 0;
      const yaz = (): void => {
        harf += 1;
        el.textContent = metin.slice(0, harf);
        if (harf < metin.length) this.zamanlayici = setTimeout(yaz, HoverTypeDirective.YAZ_MS);
        else this.zamanlayici = null;
      };
      this.zamanlayici = setTimeout(yaz, 90);
    };
    sil();
  }

  private durdur(): void {
    if (this.zamanlayici !== null) clearTimeout(this.zamanlayici);
    this.zamanlayici = null;
  }
}
