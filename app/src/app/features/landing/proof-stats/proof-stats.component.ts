import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { I18nService } from '../../../core/services/i18n.service';
import { CountUpDirective } from '../../../shared/directives/count-up.directive';

/** Sayacın başladığı süre: "kartından sahaya 5 dakika". */
const BASLANGIC_SN = 5 * 60;

/**
 * "Hesap sana gelmez" ekranının ÜÇ KARTI: 6 ölçüt · 4v4→11v11 · 5 dk.
 *
 * Kullanıcı isteği: terazi hareket etsin, sahada hareket olsun, sayaç geriye saysın (sıfırlanınca
 * yeniden 05:00), kartın üzerine gelince arkasında kısa bir motivasyon sözü yazsın. (Daha önce
 * çizimlerin SABİT durması istenmişti; bu istek onun yerini aldı.)
 *
 * Neden ayrı bileşen: tanıtım sayfasının stil bütçesi sınırdaydı ve kartların stili orada beş
 * katman üst üste yazılmıştı. Kartlar kendi temiz stil dosyasında; eski kurallar silindi.
 *
 * Sayaç gerçek saniyeyle geri sayar ve yalnızca kart ekranda iken çalışır. Hareketi azaltılmışta
 * hiç başlamaz (05:00, halka dolu).
 */
@Component({
  selector: 'app-proof-stats',
  imports: [CountUpDirective],
  templateUrl: './proof-stats.component.html',
  styleUrl: './proof-stats.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProofStatsComponent implements OnInit, OnDestroy {
  private readonly i18n = inject(I18nService);
  private readonly zone = inject(NgZone);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  protected readonly t = this.i18n.t;

  /** Kalan saniye (geri sayım). */
  protected readonly kalan = signal(BASLANGIC_SN);
  protected readonly sayacMetni = computed(() => {
    const k = this.kalan();
    return `${String(Math.floor(k / 60)).padStart(2, '0')}:${String(k % 60).padStart(2, '0')}`;
  });
  /** Halka geçen süre kadar boşalır (pathLength = 100). */
  protected readonly halkaBosluk = computed(() => ((BASLANGIC_SN - this.kalan()) / BASLANGIC_SN) * 100);
  /** Saniye ibresi: her saniye 6°. */
  protected readonly ibreAci = computed(() => (BASLANGIC_SN - this.kalan()) * 6);

  /** Hover sözünü kelime kelime basmak için (her kelime kendi gecikmesiyle yükselir). */
  protected kelimeler(anahtar: string): string[] {
    return this.t(anahtar).split(' ');
  }

  private zamanlayici: ReturnType<typeof setInterval> | null = null;
  private gozlemci: IntersectionObserver | null = null;

  /**
   * İMLECİ İZLEYEN EĞİM + PARLAMA. Kartın üzerinde imlecin konumu `--rx/--ry` (eğim, derece) ve
   * `--gx/--gy` (parlamanın merkezi, %) olarak yazılır. Angular bölgesinin DIŞINDA ve kare başına
   * bir kez: saniyede onlarca olay değişiklik algılamayı tetiklemesin. Dokunmatikte ve hareketi
   * azaltılmışta hiç bağlanmaz.
   */
  private kare = 0;
  private sonKart: HTMLElement | null = null;
  private readonly egim = (olay: PointerEvent): void => {
    const kart = (olay.target as Element | null)?.closest?.('.kart') as HTMLElement | null;
    if (this.sonKart && this.sonKart !== kart) this.sifirla(this.sonKart);
    this.sonKart = kart;
    if (!kart || this.kare) return;
    const { clientX, clientY } = olay;
    this.kare = requestAnimationFrame(() => {
      this.kare = 0;
      const k = kart.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (clientX - k.left) / k.width));
      const y = Math.min(1, Math.max(0, (clientY - k.top) / k.height));
      kart.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
      kart.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
      kart.style.setProperty('--ry', `${((x - 0.5) * 9).toFixed(2)}deg`);
      kart.style.setProperty('--rx', `${((0.5 - y) * 9).toFixed(2)}deg`);
      // Hayalet rakamın kayması için BİRİMSİZ eksenler (-1…1): açı (deg) piksele çarpılamaz.
      kart.style.setProperty('--ex', ((x - 0.5) * 2).toFixed(3));
      kart.style.setProperty('--ey', ((y - 0.5) * 2).toFixed(3));
    });
  };
  private readonly ayril = (): void => {
    if (this.sonKart) this.sifirla(this.sonKart);
    this.sonKart = null;
  };

  private sifirla(kart: HTMLElement): void {
    kart.style.removeProperty('--rx');
    kart.style.removeProperty('--ry');
    kart.style.removeProperty('--ex');
    kart.style.removeProperty('--ey');
  }

  ngOnInit(): void {
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia?.('(hover: hover)').matches) {
      const el = this.host.nativeElement;
      this.zone.runOutsideAngular(() => {
        el.addEventListener('pointermove', this.egim, { passive: true });
        el.addEventListener('pointerleave', this.ayril);
      });
    }
    if (typeof IntersectionObserver === 'undefined') {
      this.baslat();
      return;
    }
    // Yalnızca ekrandayken say: görünmeyen bir sayaç için her saniye çalışmanın anlamı yok.
    this.gozlemci = new IntersectionObserver(([kayit]) => (kayit.isIntersecting ? this.baslat() : this.durdur()));
    this.gozlemci.observe(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    const el = this.host.nativeElement;
    el.removeEventListener('pointermove', this.egim);
    el.removeEventListener('pointerleave', this.ayril);
    if (this.kare) cancelAnimationFrame(this.kare);
    this.gozlemci?.disconnect();
    this.durdur();
  }

  private baslat(): void {
    if (this.zamanlayici) return;
    this.zone.runOutsideAngular(() => {
      this.zamanlayici = setInterval(() => {
        // 00:00 bir saniye görünür, sonra yeniden 05:00.
        this.kalan.update((k) => (k === 0 ? BASLANGIC_SN : k - 1));
      }, 1000);
    });
  }

  private durdur(): void {
    if (this.zamanlayici) clearInterval(this.zamanlayici);
    this.zamanlayici = null;
  }
}
