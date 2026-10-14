import { ChangeDetectionStrategy, Component, ElementRef, NgZone, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { I18nService, ondalik } from '../../../core/services/i18n.service';

type Poz = 'KAL' | 'DEF' | 'OS' | 'FOR';

interface DemoOyuncu {
  /** Reyting (aynı zamanda kimlik: havuzda tekrar eden reyting yok). */
  r: number;
  p: Poz;
}

/** Havuz — reyting sırasıyla; dağıtım da bu sırayla oynar (çip başına gecikme = dizin). */
const HAVUZ: DemoOyuncu[] = [
  { r: 84, p: 'FOR' },
  { r: 79, p: 'FOR' },
  { r: 76, p: 'OS' },
  { r: 72, p: 'OS' },
  { r: 70, p: 'DEF' },
  { r: 68, p: 'DEF' },
  { r: 65, p: 'KAL' },
  { r: 61, p: 'KAL' },
  { r: 58, p: 'DEF' },
  { r: 55, p: 'OS' },
];

/** Kabul edilen en büyük ortalama farkı (puan). */
const MAKS_FARK = 0.4;

/*
 * GEÇERLİ BÖLÜŞÜMLER — uygulamanın kura kurallarının küçük bir kopyası, sabit yazılmadı,
 * havuzdan HESAPLANIYOR: 5'e 5, her takımda tam bir kaleci, en iyi iki oyuncu ayrı takımda,
 * her takımda en az bir defans ve bir orta saha, ortalama farkı en çok 0,4. Bu havuzda dört
 * bölüşüm geçiyor (iki tanesi 0,0, iki tanesi 0,4) — "Kurayı yeniden çek" bunlardan birini çeker.
 * Uydurma "olduğundan iyi" bir sonuç gösterilmiyor: her bölüşüm gerçek kuranın kabul edeceği türden.
 */
function gecerliBolusumler(): number[][] {
  const sonuc: number[][] = [];
  const n = HAVUZ.length;
  for (let m = 0; m < 1 << n; m++) {
    // 0. oyuncu (en iyi) hep A'da sayılır: aynı bölüşümün aynası iki kez sayılmasın.
    if (!(m & 1)) continue;
    const a = HAVUZ.filter((_, i) => (m >> i) & 1);
    const b = HAVUZ.filter((_, i) => !((m >> i) & 1));
    if (a.length !== n / 2) continue;
    if ((m >> 1) & 1) continue; // en iyi iki oyuncu ayrı
    const sayi = (l: DemoOyuncu[], p: Poz) => l.filter((o) => o.p === p).length;
    if (sayi(a, 'KAL') !== 1 || sayi(b, 'KAL') !== 1) continue;
    if ([a, b].some((l) => sayi(l, 'DEF') === 0 || sayi(l, 'OS') === 0)) continue;
    const toplam = (l: DemoOyuncu[]) => l.reduce((t, o) => t + o.r, 0);
    if (Math.abs(toplam(a) - toplam(b)) / a.length > MAKS_FARK) continue;
    sonuc.push(a.map((o) => o.r));
  }
  return sonuc;
}

const BOLUSUMLER = gecerliBolusumler();

/**
 * "ADALET NASIL KURULUR" — çözüm ekranının görsel anlatımı. Solda küçük bir KURA MAKİNESİ:
 * 10 oyuncu havuzdan iki takıma dağılır, terazi dengeye gelir, iki ortalama belirir. Sağda üç adım.
 *
 * Animasyon yalnızca CSS (host'taki `calis` sınıfı); sınıfı IntersectionObserver ekrana girişte
 * takar, çıkınca söker. "Kurayı yeniden çek" GERÇEKTEN yeni bir kura çeker (11 Ekim 2026,
 * kullanıcı isteği): çipler anında havuza döner, yeni bölüşüm yazılır, dağıtım baştan oynar.
 */
@Component({
  selector: 'app-adalet-demo',
  templateUrl: './adalet-demo.component.html',
  styleUrl: './adalet-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdaletDemoComponent implements OnInit, OnDestroy {
  private readonly i18n = inject(I18nService);
  private readonly zone = inject(NgZone);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  protected readonly t = this.i18n.t;

  /** Şu anki kura: A takımındaki oyuncuların reytingleri + A'nın sahada hangi yanda durduğu. */
  private readonly kura = signal({ a: BOLUSUMLER[0], aSolda: true });

  /** Çiplerin havuzdaki ve takımdaki konumları (yüzde). */
  protected readonly oyuncular = computed(() => {
    const { a, aSolda } = this.kura();
    const satir = { A: 0, B: 0 };
    return HAVUZ.map((o, i) => {
      const takim: 'A' | 'B' = a.includes(o.r) ? 'A' : 'B';
      const sira = satir[takim]++; // havuz reyting sırasında: takım içinde de güçlüden zayıfa
      const solda = (takim === 'A') === aSolda;
      return {
        ...o,
        sira: i,
        hx: 7 + i * 9.6,
        tx: solda ? 27 : 73,
        ty: 11 + sira * 16,
        tier: o.r >= 75 ? 'altin' : o.r >= 65 ? 'gumus' : 'bronz',
      };
    });
  });

  /** Sol ve sağ sütunun ortalaması (gerçek hesap, sabit yazılmadı). */
  protected readonly ortalama = computed(() => {
    this.i18n.locale(); // dil değişince ayırıcı yeniden biçimlensin
    const { a, aSolda } = this.kura();
    const ort = (l: DemoOyuncu[]) => l.reduce((s, o) => s + o.r, 0) / l.length;
    const ta = ort(HAVUZ.filter((o) => a.includes(o.r)));
    const tb = ort(HAVUZ.filter((o) => !a.includes(o.r)));
    const [sol, sag] = aSolda ? [ta, tb] : [tb, ta];
    return { sol: ondalik(sol), sag: ondalik(sag) };
  });

  /** Motivasyon sözünü kelime kelime yükseltmek için (her kelime kendi gecikmesiyle). */
  protected kelimeler(anahtar: string): string[] {
    return this.t(anahtar).split(/\s+/).filter(Boolean);
  }

  private gozcu: IntersectionObserver | null = null;
  private zamanlayici: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.silgiyiKur();
    const azHareket = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (azHareket || typeof IntersectionObserver === 'undefined') {
      this.host.classList.add('calis', 'hazir');
      return;
    }
    this.zone.runOutsideAngular(() => {
      this.gozcu = new IntersectionObserver(
        ([k]) => this.host.classList.toggle('calis', k.isIntersecting),
        { threshold: 0.45 },
      );
      this.gozcu.observe(this.host);
    });
  }

  ngOnDestroy(): void {
    this.gozcu?.disconnect();
    if (this.zamanlayici) clearTimeout(this.zamanlayici);
    this.silgiyiKaldir?.();
    for (const z of this.geriGelis.values()) clearTimeout(z);
  }

  /* ---------------------------------------------------------------- SİLGİ (Excalidraw) */
  /*
   * Kullanıcı (11 Ekim 2026): "üzerlerine gelince silgi ikonu çıksın, silebileyim, birkaç saniye
   * sonra sildiklerim geri gelsin". Excalidraw'daki silgi gibi: kartların üzerinde imleç silgiye
   * döner (CSS `cursor`), basılı tutup sürükleyince (ya da tıklayınca) silginin GEÇTİĞİ öğeler tek
   * tek silinir — çipler, takım adları, orta çizgi, terazi, ortalamalar, başlık, adımlar, numaralar.
   * Her silinen öğe SILME_MS sonra yeniden çizilir gibi geri gelir. "Kurayı yeniden çek" silinmez.
   *
   * Öğe tespiti `elementsFromPoint` ile imlecin çevresindeki birkaç noktadan (silgi ucu ~12px).
   * Silme yalnızca sınıf: `.silindi` → opaklık 0 (CSS'te). Dinleyiciler Angular bölgesinin dışında;
   * dokunmatikte (hover yok) hiç bağlanmaz — parmakla sürüklemek sayfa kaydırmasıyla çakışırdı.
   */
  private static readonly SILINEBILIR =
    '.cip, .saha__takim, .saha__cizgi, .saha__yuvarlak, .olcu__deger, .olcu__terazi, .adimlar__etiket, .adimlar__baslik, .adimlar__no, .adimlar__liste b, .adimlar__liste p';
  private static readonly SILME_MS = 3200;
  private readonly geriGelis = new Map<Element, ReturnType<typeof setTimeout>>();
  private siliyor = false;
  private silgiyiKaldir: (() => void) | null = null;

  private silgiyiKur(): void {
    if (typeof window === 'undefined' || !window.matchMedia?.('(hover: hover)').matches) return;
    this.host.classList.add('silgi-acik');

    const sil = (x: number, y: number): void => {
      for (const [dx, dy] of [[0, 0], [-8, 0], [8, 0], [0, -8], [0, 8]]) {
        for (const el of document.elementsFromPoint(x + dx, y + dy)) {
          if (!this.host.contains(el)) continue;
          const hedef = el.closest(AdaletDemoComponent.SILINEBILIR);
          if (hedef && this.host.contains(hedef)) this.silOge(hedef);
        }
      }
      this.izBirak(x, y);
    };
    const bas = (e: PointerEvent): void => {
      if (e.button !== 0) return;
      const hedef = e.target as Element | null;
      if (!hedef?.closest('.demo, .adimlar') || hedef.closest('button')) return;
      e.preventDefault(); // sürüklerken metin seçilmesin
      this.siliyor = true;
      this.host.classList.add('siliyor');
      sil(e.clientX, e.clientY);
    };
    const gez = (e: PointerEvent): void => {
      if (this.siliyor) sil(e.clientX, e.clientY);
    };
    const birak = (): void => {
      this.siliyor = false;
      this.host.classList.remove('siliyor');
    };

    this.zone.runOutsideAngular(() => {
      this.host.addEventListener('pointerdown', bas);
      window.addEventListener('pointermove', gez, { passive: true });
      window.addEventListener('pointerup', birak);
      window.addEventListener('pointercancel', birak);
    });
    this.silgiyiKaldir = () => {
      this.host.removeEventListener('pointerdown', bas);
      window.removeEventListener('pointermove', gez);
      window.removeEventListener('pointerup', birak);
      window.removeEventListener('pointercancel', birak);
    };
  }

  /** Öğeyi siler; SILME_MS sonra yeniden çizerek geri getirir (tekrar silinirse süre yenilenir). */
  private silOge(el: Element): void {
    const onceki = this.geriGelis.get(el);
    if (onceki) clearTimeout(onceki);
    el.classList.remove('geri-ciziliyor');
    el.classList.add('silindi');
    this.geriGelis.set(
      el,
      setTimeout(() => {
        this.geriGelis.delete(el);
        el.classList.remove('silindi');
        el.classList.add('geri-ciziliyor');
        setTimeout(() => el.classList.remove('geri-ciziliyor'), 700);
      }, AdaletDemoComponent.SILME_MS),
    );
  }

  /** Silginin arkasında kısa ömürlü gri iz (havuzdan; DOM'a düğüm eklenip çıkmaz). */
  private izSira = 0;
  private izBirak(x: number, y: number): void {
    const izler = this.host.querySelectorAll<HTMLElement>('.silgi-izi');
    if (izler.length === 0) return;
    const iz = izler[this.izSira++ % izler.length];
    const kutu = this.host.getBoundingClientRect();
    iz.classList.remove('silgi-izi--canli');
    void iz.offsetWidth;
    iz.style.setProperty('--x', `${(x - kutu.left).toFixed(0)}px`);
    iz.style.setProperty('--y', `${(y - kutu.top).toFixed(0)}px`);
    iz.classList.add('silgi-izi--canli');
  }

  /**
   * Yeni kura: öncekinden FARKLI bir bölüşüm (ve rastgele bir yan) seçilir. Çipler geçişsiz
   * havuza döner (`sifirla`), değişiklik algılama yeni hedefleri yazar, sonra dağıtım baştan oynar.
   */
  protected tekrar(): void {
    const simdiki = this.kura();
    const adaylar = BOLUSUMLER.filter((b) => b !== simdiki.a);
    const a = adaylar.length ? adaylar[Math.floor(Math.random() * adaylar.length)] : simdiki.a;
    const aSolda = Math.random() < 0.5;

    const azHareket = this.host.classList.contains('hazir');
    if (!azHareket) {
      this.host.classList.add('sifirla');
      this.host.classList.remove('calis');
      void this.host.offsetWidth; // geçişsiz havuza dönüş hemen uygulansın
      this.host.classList.remove('sifirla');
    }
    this.kura.set({ a, aSolda });
    if (azHareket) return;
    if (this.zamanlayici) clearTimeout(this.zamanlayici);
    // Yeni hedefler bu turun değişiklik algılamasıyla DOM'a yazılır; sınıf ondan SONRA takılmalı.
    this.zamanlayici = setTimeout(() => this.host.classList.add('calis'), 80);
  }
}
