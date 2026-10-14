import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, NgZone, OnDestroy, inject, viewChildren } from '@angular/core';

/** Havuzdaki saatlerin görünümü: kontur kronometre, dolu kronometre ya da dijital "05:00" ekranı. */
const HAVUZ = [
  { tur: 'kontur', aci: -14, olcek: 1 },
  { tur: 'dijital', aci: 6, olcek: 0.9 },
  { tur: 'dolu', aci: 14, olcek: 1.15 },
  { tur: 'kontur', aci: 8, olcek: 0.8 },
  { tur: 'dolu', aci: -16, olcek: 0.95 },
  { tur: 'dijital', aci: -6, olcek: 1 },
  { tur: 'kontur', aci: 12, olcek: 1.2 },
  { tur: 'dolu', aci: -8, olcek: 0.85 },
  { tur: 'dijital', aci: 10, olcek: 0.85 },
  { tur: 'kontur', aci: -4, olcek: 1.05 },
] as const;

/**
 * SAAT İZİ — "Üç adım" ekranında imleç gezindikçe kronometreler belirip yükselerek söner
 * (11 Ekim 2026, kullanıcı: "ilk sayfadaki gibi bu sefer saat ikonu olsun"). SSS'teki soru
 * işareti izinin (`app-soru-izi`) birebir mekaniği; yalnızca görünüm farklı:
 *
 * - Havuz: on öğe bir kez basılır, sırayla yeniden kullanılır (DOM'a düğüm eklenip çıkmaz).
 * - Ölçüt MESAFE: imleç son bıraktığı yerden 130px uzaklaşınca yeni saat çıkar.
 * - Saat imlecin altında değil, ondan savrulan bir noktada (altın oranlı açı adımı) doğar;
 *   aynı anda en fazla üç saat canlı. Kronometrelerin ibresi doğarken hızla döner.
 * - Katman bölümün içinde ve KARTLARIN ARKASINDA, ekranı boydan boya kaplar; tıklamayı yutmaz.
 * - Dinleyici Angular bölgesinin dışında; dokunmatikte ve hareketi azaltılmışta hiç bağlanmaz.
 */
@Component({
  selector: 'app-saat-izi',
  templateUrl: './saat-izi.component.html',
  styleUrl: './saat-izi.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
})
export class SaatIziComponent implements AfterViewInit, OnDestroy {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);
  private readonly ogeler = viewChildren<ElementRef<HTMLElement>>('oge');

  protected readonly havuz = HAVUZ;

  private readonly adim = 130;
  private readonly omur = 1100;
  private readonly enCok = 3;

  private sonX = 0;
  private sonY = 0;
  private baslandi = false;
  private sira = 0;
  private canlilar: { el: HTMLElement; zaman: number }[] = [];
  private bagli = false;

  private readonly hareket = (olay: PointerEvent): void => {
    const kutu = this.host.getBoundingClientRect();
    const x = olay.clientX - kutu.left;
    const y = olay.clientY - kutu.top;
    if (x < 0 || y < 0 || x > kutu.width || y > kutu.height) {
      this.baslandi = false;
      return;
    }
    if (!this.baslandi) {
      this.baslandi = true;
      this.sonX = x;
      this.sonY = y;
      return;
    }
    if (Math.hypot(x - this.sonX, y - this.sonY) < this.adim) return;
    this.sonX = x;
    this.sonY = y;
    this.birak(x, y, kutu.width, kutu.height);
  };

  ngAfterViewInit(): void {
    if (typeof window === 'undefined') return;
    const kapali =
      window.matchMedia?.('(hover: none)').matches || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (kapali) return;
    this.zone.runOutsideAngular(() => window.addEventListener('pointermove', this.hareket, { passive: true }));
    this.bagli = true;
  }

  ngOnDestroy(): void {
    if (this.bagli) window.removeEventListener('pointermove', this.hareket);
    for (const c of this.canlilar) window.clearTimeout(c.zaman);
  }

  private birak(x: number, y: number, genislik: number, yukseklik: number): void {
    const liste = this.ogeler();
    if (liste.length === 0) return;
    const el = liste[this.sira % liste.length].nativeElement;

    const aci = this.sira * 2.39996;
    const uzaklik = 50 + ((this.sira * 37) % 90);
    const pay = 50;
    const hx = Math.min(genislik - pay, Math.max(pay, x + Math.cos(aci) * uzaklik));
    const hy = Math.min(yukseklik - pay, Math.max(pay, y + Math.sin(aci) * uzaklik));
    this.sira++;

    // Aynı öğe yeniden kullanılınca animasyon baştan başlasın: sınıf sök → yeniden akış → tak.
    el.classList.remove('saat--canli');
    void el.offsetWidth;
    el.style.setProperty('--x', `${hx.toFixed(0)}px`);
    el.style.setProperty('--y', `${hy.toFixed(0)}px`);
    el.classList.add('saat--canli');

    const zaman = window.setTimeout(() => el.classList.remove('saat--canli'), this.omur);
    this.canlilar.push({ el, zaman });
    while (this.canlilar.length > this.enCok) {
      const eski = this.canlilar.shift();
      if (eski) {
        window.clearTimeout(eski.zaman);
        eski.el.classList.remove('saat--canli');
      }
    }
  }
}
