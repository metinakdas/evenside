import { Directive, ElementRef, NgZone, OnDestroy, OnInit, effect, inject, input } from '@angular/core';

/**
 * EKRANA GELİNCE YAZILAN BAŞLIK — metin her ekrana girişte harf harf yazılır, sonunda imleç
 * yanıp söner (ilk sayfadaki yazma efektiyle aynı dil; o bir kelime listesini döndürür, bu tek
 * bir başlığı bir kez yazar). Kullanıcı isteği: "KAOS BİTTİ. yazısı ilk sayfadaki gibi yazılsın".
 *
 * - Ekrandan çıkınca sıfırlanır, tekrar girince yeniden yazılır (sayfa ekran ekran gezildiğinde
 *   her gelişte canlı).
 * - Boşken satır çökmesin diye görünmez boşluk (U+200B) yazılır: yoksa altındaki satır yukarı zıplar.
 * - Erişilebilirlik: görünen yüzey `aria-hidden`, metnin kendisi şablonda ayrı bir `sr-only`
 *   kardeşte DURAN metin olarak bulunmalı.
 * - Hareketi azaltılmışta metin baştan yazılı durur, imleç yok.
 * - Zamanlayıcı Angular bölgesinin DIŞINDA (uygulamayı "kararsız" tutmasın).
 */
@Directive({ selector: '[appTypeOn]', standalone: true })
export class TypeOnDirective implements OnInit, OnDestroy {
  readonly appTypeOn = input<string>('');

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);
  private zamanlayici: ReturnType<typeof setTimeout> | null = null;
  private gozcu: IntersectionObserver | null = null;
  private kuruldu = false;

  private static readonly YAZ_MS = 85;
  private static readonly BOS = '​';

  constructor() {
    // Dil değişince metin değişir: o anki durumu yeni metinle yeniden kur.
    effect(() => {
      const metin = this.appTypeOn();
      if (!this.kuruldu) return;
      this.durdur();
      this.host.textContent = metin;
    });
  }

  ngOnInit(): void {
    this.kuruldu = true;
    this.host.textContent = this.appTypeOn();
    const azHareket = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (azHareket || typeof IntersectionObserver === 'undefined') return;

    this.zone.runOutsideAngular(() => {
      this.gozcu = new IntersectionObserver(
        ([kayit]) => {
          if (kayit.isIntersecting) this.yaz();
          else {
            this.durdur();
            this.host.textContent = TypeOnDirective.BOS;
            this.host.classList.remove('typed--live');
          }
        },
        { threshold: 0.6 },
      );
      this.gozcu.observe(this.host);
    });
  }

  ngOnDestroy(): void {
    this.durdur();
    this.gozcu?.disconnect();
  }

  private yaz(): void {
    this.durdur();
    const metin = this.appTypeOn();
    let harf = 0;
    this.host.textContent = TypeOnDirective.BOS;
    this.host.classList.add('typed--live');
    const adim = (): void => {
      harf += 1;
      this.host.textContent = metin.slice(0, harf);
      if (harf < metin.length) this.zamanlayici = setTimeout(adim, TypeOnDirective.YAZ_MS);
      else this.zamanlayici = null;
    };
    this.zamanlayici = setTimeout(adim, 260);
  }

  private durdur(): void {
    if (this.zamanlayici !== null) clearTimeout(this.zamanlayici);
    this.zamanlayici = null;
  }
}
