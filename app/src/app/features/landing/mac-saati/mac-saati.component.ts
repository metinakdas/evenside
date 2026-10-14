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

interface Durak {
  /** Sayfadaki bölümün seçicisi. */
  secici: string;
  /** Etiketin sözlük anahtarı. */
  anahtar: string;
}

/** Çentikler: sayfanın bölümleri, yukarıdan aşağı. */
const DURAKLAR: Durak[] = [
  { secici: '#giris', anahtar: 'saat.giris' },
  { secici: '.proof', anahtar: 'saat.kanit' },
  { secici: '.problem', anahtar: 'saat.problem' },
  { secici: '#cozum', anahtar: 'saat.cozum' },
  { secici: '#nasil', anahtar: 'saat.adimlar' },
  { secici: '#sss', anahtar: 'saat.sss' },
  { secici: '.final', anahtar: 'saat.son' },
];

/** Maçın süresi: sayfanın sonu 90. dakika. */
const MAC_DAKIKA = 90;

/**
 * MAÇ SAATİ — sayfa ilerleme göstergesi (11 Ekim 2026, kullanıcı: "sayfa sonunu gösteren,
 * hareket eden bar; profesyonel sitelerdeki gibi ama farklı olsun").
 *
 * Sıradan bir yüzde çubuğu yerine sayfa bir MAÇ gibi okunur: sağ kenarda dikey bir taç çizgisi
 * 0'dan 90'a dolar, üzerinde kaydırdıkça dönen bir top ilerler ve yanındaki çip dakikayı söyler
 * (sayfanın sonu 90'). Her bölümün bir çentiği var: geçilen çentik yeşile döner, üzerine gelince
 * bölümün adı açılır, tıklayınca o bölüme gidilir. Telefonda (≤960px, sol ray alta indiğinde)
 * ekranın tepesinde ince bir çizgiye dönüşür.
 *
 * Performans: kaydırma dinleyicisi Angular bölgesinin DIŞINDA ve `passive`; kare başına tek
 * hesap (rAF), sonuç doğrudan CSS değişkenine (`--p`) ve dakika metnine yazılır — değişiklik
 * algılama çalışmaz. Çentiklerin konumu yalnızca sayfa boyu değişince yeniden ölçülür.
 */
@Component({
  selector: 'app-mac-saati',
  templateUrl: './mac-saati.component.html',
  styleUrl: './mac-saati.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MacSaatiComponent implements OnInit, OnDestroy {
  private readonly i18n = inject(I18nService);
  private readonly zone = inject(NgZone);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  protected readonly t = this.i18n.t;

  /** Çentiklerin ray üzerindeki konumu (0-1). Ölçülene kadar boş: yanlış yerde çentik çizilmesin. */
  private readonly konumlar = signal<number[]>([]);

  protected readonly cetikler = computed(() =>
    this.konumlar().map((konum, i) => ({ konum, etiket: this.t(DURAKLAR[i].anahtar), i })),
  );

  private kare = 0;
  private gozcu: ResizeObserver | null = null;

  private readonly kaydir = (): void => {
    if (this.kare) return;
    this.kare = requestAnimationFrame(() => {
      this.kare = 0;
      this.guncelle();
    });
  };

  ngOnInit(): void {
    if (typeof window === 'undefined') return;
    this.zone.runOutsideAngular(() => {
      window.addEventListener('scroll', this.kaydir, { passive: true });
      window.addEventListener('resize', this.kaydir, { passive: true });
      // Sayfa boyu görseller/animasyonlar yüklendikçe değişir: çentikleri o zaman yeniden ölç.
      this.gozcu = new ResizeObserver(() => this.olc());
      this.gozcu.observe(document.body);
    });
    this.olc();
    this.guncelle();
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.kaydir);
    window.removeEventListener('resize', this.kaydir);
    this.gozcu?.disconnect();
    if (this.kare) cancelAnimationFrame(this.kare);
  }

  /**
   * SÜRÜKLEME (kullanıcı: "topu sürükleyince scroll gibi davranmalı"). Raya ya da topa basılınca
   * imlecin rayda bulunduğu oran sayfanın o oranına kaydırılır; bırakana kadar izlenir. Kaydırma
   * `behavior: 'instant'` — sayfadaki yumuşak kaydırma ayarı sürüklemeyi geride bırakmasın.
   * Çentiklere basmak sürükleme başlatmaz (onlar kendi bölümüne gider). Dinleyiciler Angular
   * bölgesinin dışında: her harekette değişiklik algılama çalışmaz.
   */
  protected tut(olay: PointerEvent): void {
    const hedef = olay.target as Element | null;
    if (hedef?.closest('.saat__centik') || olay.button !== 0) return;
    const ray = this.host.querySelector<HTMLElement>('.saat__ray');
    if (!ray) return;
    olay.preventDefault();
    this.host.querySelector<HTMLElement>('.saat__top')?.focus({ preventScroll: true });

    const kaydirOran = (y: number): void => {
      const kutu = ray.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (y - kutu.top) / kutu.height));
      window.scrollTo({ top: p * this.yol(), behavior: 'instant' });
    };
    this.zone.runOutsideAngular(() => {
      this.host.classList.add('saat--surukle');
      const hareket = (e: PointerEvent): void => kaydirOran(e.clientY);
      const birak = (): void => {
        this.host.classList.remove('saat--surukle');
        window.removeEventListener('pointermove', hareket);
        window.removeEventListener('pointerup', birak);
        window.removeEventListener('pointercancel', birak);
      };
      window.addEventListener('pointermove', hareket, { passive: true });
      window.addEventListener('pointerup', birak);
      window.addEventListener('pointercancel', birak);
      kaydirOran(olay.clientY);
    });
  }

  /** Klavye: ↑/↓ sayfanın %5'i, PageUp/PageDown bir ekran, Home/End baş/son. */
  protected tus(olay: KeyboardEvent): void {
    const adim: Record<string, number> = {
      ArrowDown: this.yol() * 0.05,
      ArrowUp: -this.yol() * 0.05,
      PageDown: window.innerHeight,
      PageUp: -window.innerHeight,
    };
    let hedef: number | null = null;
    if (olay.key in adim) hedef = window.scrollY + adim[olay.key];
    else if (olay.key === 'Home') hedef = 0;
    else if (olay.key === 'End') hedef = this.yol();
    if (hedef === null) return;
    olay.preventDefault();
    olay.stopPropagation(); // ekran durağı direktifi aynı tuşu ikinci kez işlemesin
    window.scrollTo({ top: hedef, behavior: 'instant' });
  }

  /** Bir çentiğe tıklanınca o bölüme git. */
  protected git(i: number): void {
    document.querySelector(DURAKLAR[i].secici)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private yol(): number {
    return Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  }

  /** Bölümlerin sayfadaki yerini oranla. Konum `offsetTop` zincirinden: çıkış animasyonlarının
   *  transform'u ölçüyü kaydırmasın (ekran duraklarındaki tuzağın aynısı). */
  private olc(): void {
    const yol = this.yol();
    const konumlar = DURAKLAR.map((d) => {
      let el = document.querySelector(d.secici) as HTMLElement | null;
      let ust = 0;
      while (el) {
        ust += el.offsetTop;
        el = el.offsetParent as HTMLElement | null;
      }
      return Math.min(1, Math.max(0, ust / yol));
    });
    const once = this.konumlar();
    if (once.length === konumlar.length && once.every((k, i) => Math.abs(k - konumlar[i]) < 0.002)) return;
    this.zone.run(() => this.konumlar.set(konumlar));
    // Çentikler bir sonraki karede DOM'a basılır; "geçildi" boyaması ondan sonra.
    this.kaydir();
  }

  private guncelle(): void {
    const p = Math.min(1, Math.max(0, window.scrollY / this.yol()));
    this.host.style.setProperty('--p', p.toFixed(4));
    const dakika = this.host.querySelector('.saat__dakika');
    const dk = Math.round(p * MAC_DAKIKA);
    if (dakika) dakika.textContent = `${dk}'`;
    const top = this.host.querySelector('.saat__top');
    top?.setAttribute('aria-valuenow', String(dk));
    top?.setAttribute('aria-valuetext', `${dk}'`);
    // Geçilen çentikler yeşile döner (sınıf, doğrudan DOM'a — değişiklik algılama yok).
    this.host.querySelectorAll<HTMLElement>('.saat__centik').forEach((c) => {
      c.classList.toggle('saat__centik--gecti', p + 0.004 >= Number(c.dataset['konum']));
    });
    this.host.classList.toggle('saat--bitti', p > 0.995);
  }
}
