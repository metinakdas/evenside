import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, NgZone, OnDestroy, inject, viewChildren } from '@angular/core';

/** Havuzdaki soru işaretlerinin görünümü: dolu, kontur ya da balon; açı ve ölçü tohumlu. */
const HAVUZ = [
  { tur: 'dolu', aci: -14, olcek: 1 },
  { tur: 'balon', aci: 8, olcek: 0.9 },
  { tur: 'kontur', aci: 16, olcek: 1.2 },
  { tur: 'dolu', aci: 6, olcek: 0.8 },
  { tur: 'kontur', aci: -18, olcek: 1.05 },
  { tur: 'balon', aci: -6, olcek: 1 },
  { tur: 'dolu', aci: 12, olcek: 1.15 },
  { tur: 'kontur', aci: -9, olcek: 0.85 },
  { tur: 'balon', aci: 14, olcek: 0.8 },
  { tur: 'dolu', aci: -4, olcek: 0.95 },
] as const;

/**
 * SORU İŞARETİ İZİ — SSS ekranında imleç gezindikçe soru işaretleri belirip yükselerek söner
 * (11 Ekim 2026, kullanıcı: "ilk sayfada mouse hareket ettirince ikonlar çıkıyor ya, bu ekranda
 * da soru işaretleri çıksın"). Giriş ekranındaki izin (`app-hero-trail`) dili ve kuralları:
 *
 * - Havuz: on öğe bir kez basılır, sırayla yeniden kullanılır (DOM'a düğüm eklenip çıkmaz).
 * - Ölçüt MESAFE: imleç son bıraktığı yerden 130px uzaklaşınca yeni işaret çıkar.
 * - İşaret imlecin altında değil, ondan savrulan bir noktada (altın oranlı açı adımı) doğar;
 *   aynı anda en fazla üç işaret canlı.
 * - Katman bölümün içinde ve KARTLARIN ARKASINDA (`z-index` bölümde ayarlı): soru listesinin
 *   metnini örtmez, tıklamayı yutmaz (`pointer-events: none`).
 * - Dinleyici Angular bölgesinin dışında; dokunmatikte ve hareketi azaltılmışta hiç bağlanmaz.
 */
@Component({
  selector: 'app-soru-izi',
  templateUrl: './soru-izi.component.html',
  styleUrl: './soru-izi.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
})
export class SoruIziComponent implements AfterViewInit, OnDestroy {
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
    el.classList.remove('soru--canli');
    void el.offsetWidth;
    el.style.setProperty('--x', `${hx.toFixed(0)}px`);
    el.style.setProperty('--y', `${hy.toFixed(0)}px`);
    el.classList.add('soru--canli');

    const zaman = window.setTimeout(() => el.classList.remove('soru--canli'), this.omur);
    this.canlilar.push({ el, zaman });
    while (this.canlilar.length > this.enCok) {
      const eski = this.canlilar.shift();
      if (eski) {
        window.clearTimeout(eski.zaman);
        eski.el.classList.remove('soru--canli');
      }
    }
  }
}
