import { Directive, NgZone, OnDestroy, OnInit, inject } from '@angular/core';

/**
 * SAYFAYI EKRANLARA BÖLEN GEÇİŞ — "tab geçişi gibi".
 *
 * Kullanıcı isteği: tanıtım sayfasında kaydırma adım adım değil, sekme değiştirir gibi TEK
 * SEFERDE bir sonraki ekrana geçsin; bu her bölümde aynı olsun. Tek bir aşağı/yukarı hareketi
 * (tekerlek, PageDown/PageUp, ↓/↑, boşluk) sayfayı tarayıcının yumuşak kaydırmasıyla bir sonraki /
 * önceki DURAĞA taşır. Ekrandan çıkan bölümün kalkıp sönmesi CSS'te
 * (`landing-scroll.scss` → "EKRAN GEÇİŞİ"), bu direktif yalnızca kaydırma konumunu sürer.
 *
 * DURAKLAR sayfadan okunur, elle koordinat yazılmaz (yükseklikler dile ve ekrana göre değişiyor):
 * - `data-ekran` taşıyan her öğenin üst kenarı bir duraktır.
 * - Öğe ekrandan uzunsa içinde ekran ekran ek duraklar açılır (son durak öğenin dibi).
 * - `data-ekran="ust"`: yalnızca üst kenar durak; iç durakları içindeki başka öğe verir.
 * - `data-ekran="dip"`: öğenin DİBİ ekranın altına (DIP_PAYI kadar boşlukla) oturur; üstünde
 *   kalan ne varsa (ör. "adalet" bandı) aynı ekranda görünür.
 * - `data-ekran="yigin"`: dert destesi. Deste yapışık bir sahnede kaydırmayla ilerliyor
 *   (`StackProgressDirective`); her kartın tam oturduğu kaydırma konumu bir duraktır, yani
 *   her hareket BİR kart çevirir.
 * - Sayfanın en altı her zaman son duraktır.
 *
 * Sınırlar (bilinçli):
 * - Yalnızca imleçli, geniş ekranda (≥861px, `hover: hover`). Dokunmatikte doğal kaydırmayı
 *   ele geçirmek kaydırmanın kendisini bozar (tarayıcı hareketi zaten başlatmış oluyor).
 * - `prefers-reduced-motion` altında hiç bağlanmaz.
 * - Yazı alanlarındaki ve düğmelerdeki tuşlara, Ctrl+tekerleğe (yakınlaştırma) dokunulmaz.
 * - Dokunmatik yüzeyin ATALETİ geçiş bitince de olay göndermeye devam eder: olaylar arası
 *   sessizlik `ATALET_MS`'i geçmeden yeni geçiş başlamaz (yoksa tek hareket iki ekran atlardı).
 */
@Directive({ selector: '[appEkranlar]' })
export class ScreenStepperDirective implements OnInit, OnDestroy {
  private readonly zone = inject(NgZone);

  private static readonly SURE_MS = 850;
  private static readonly ATALET_MS = 220;
  /** Uzun bölümlerde iki durak arası: bir ekran eksi bu kadar örtüşme (bağlam kopmasın). */
  private static readonly ORTUSME_PX = 120;
  /**
   * `data-ekran="dip"`: öğenin altında bırakılan boşluk. Ekranın dibinde yüzen "Ücretsiz başla"
   * şeridi (~66px + 30px kenar payı) öğenin alt kenarını örtmesin diye ondan büyük.
   */
  private static readonly DIP_PAYI = 104;

  private gecisteMi = false;
  private yedek: ReturnType<typeof setTimeout> | undefined;
  private sonTekerlek = 0;

  private readonly onWheel = (e: WheelEvent): void => {
    if (e.ctrlKey) return;
    const simdi = performance.now();
    const akista = simdi - this.sonTekerlek < ScreenStepperDirective.ATALET_MS;
    this.sonTekerlek = simdi;
    // Geçiş sürerken ya da önceki hareketin ataleti sürerken: yut.
    if (this.gecisteMi || akista) {
      e.preventDefault();
      return;
    }
    if (Math.abs(e.deltaY) < 2) return;
    const hedef = this.hedef(e.deltaY);
    if (hedef === null) return;
    e.preventDefault();
    this.git(hedef);
  };

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|SUMMARY)$/.test(el.tagName))) return;
    const asagi = ['PageDown', 'ArrowDown'].includes(e.key) || (e.key === ' ' && !e.shiftKey);
    const yukari = ['PageUp', 'ArrowUp'].includes(e.key) || (e.key === ' ' && e.shiftKey);
    if (!asagi && !yukari) return;
    if (this.gecisteMi) {
      e.preventDefault();
      return;
    }
    const hedef = this.hedef(asagi ? 1 : -1);
    if (hedef === null) return;
    e.preventDefault();
    this.git(hedef);
  };

  ngOnInit(): void {
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia?.('(min-width: 861px) and (hover: hover)').matches) return;
    this.zone.runOutsideAngular(() => {
      window.addEventListener('wheel', this.onWheel, { passive: false });
      window.addEventListener('keydown', this.onKey);
    });
  }

  ngOnDestroy(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKey);
    clearTimeout(this.yedek);
  }

  /**
   * Bir bölümün HİZALI durağı: bölümün düzen üstüne en yakın durak. Sol menü bunu kullanır
   * (kullanıcı, 11 Ekim 2026: "soldaki menüden sayfalara gidince ortalamıyor, yarım kalıyor") —
   * menü önceden bölüm başı + 28px paya gidiyordu; dibe hizalı ("dip") ya da deste ("yigin")
   * ekranlarda bu, tekerlekle gelinen hizayla tutmuyordu. Artık iki yol aynı yere varır.
   * Yalnızca direktifin çalıştığı yerde anlamlı (geniş ekran, imleçli); `etkin` bunu söyler.
   */
  durakFor(el: HTMLElement): number {
    const ust = duzenUstu(el);
    const d = this.duraklar();
    return d.reduce((en, x) => (Math.abs(x - ust) < Math.abs(en - ust) ? x : en), d[0]);
  }

  /** Ekran durakları bu cihazda etkin mi (geniş ekran, imleç, hareket serbest). */
  get etkin(): boolean {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(min-width: 861px) and (hover: hover)').matches &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  /** Bu yöndeki bir sonraki durak; yoksa null (sayfa normal kayar). */
  private hedef(yon: number): number | null {
    const y = window.scrollY;
    const duraklar = this.duraklar();
    // 60px'ten yakın durak "şu anki ekran" sayılır: soldaki menü bölüme `scroll-margin`
    // (28px) payıyla gidiyor; sonraki hareket 28px'lik boş bir adım atmasın.
    if (yon > 0) return duraklar.find((d) => d > y + 60) ?? null;
    for (let i = duraklar.length - 1; i >= 0; i--) if (duraklar[i] < y - 60) return duraklar[i];
    return null;
  }

  /** Durakları HER hareket anında yeniden ölçer: yükseklikler dile/pencereye göre değişir. */
  private duraklar(): number[] {
    const vh = window.innerHeight;
    const enAlt = document.documentElement.scrollHeight - vh;
    const adim = vh - ScreenStepperDirective.ORTUSME_PX;
    const sonuc: number[] = [0, enAlt];

    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-ekran]'))) {
      // DÜZEN konumu: getBoundingClientRect çıkış animasyonunun transform'unu da sayıyor ve
      // kalkmakta olan bölüm 90px yukarıda ölçülüyordu (geri dönüşte duraklar kaydı — ölçüldü).
      const ust = duzenUstu(el);
      const yukseklik = el.offsetHeight;

      if (el.dataset['ekran'] === 'yigin') {
        sonuc.push(...this.yiginDuraklari(el, ust, yukseklik));
        continue;
      }

      if (el.dataset['ekran'] === 'dip') {
        sonuc.push(ust + yukseklik + ScreenStepperDirective.DIP_PAYI - vh);
        continue;
      }

      sonuc.push(ust);
      // `ust`: yalnızca üst kenar (iç durakları içindeki başka bir öğe veriyor, ör. deste).
      if (el.dataset['ekran'] === 'ust') continue;
      // Ekrandan uzun bölüm: üstten dibe kadar EŞİT aralıklı duraklar. Sabit adımla bölmek
      // son durağı dibe 62px yakın düşürüyordu (1280×720'de ölçüldü — "boş" bir adım).
      const dip = ust + yukseklik - vh;
      if (dip > ust + 40) {
        const parca = Math.ceil((dip - ust) / adim);
        for (let i = 1; i <= parca; i++) sonuc.push(ust + ((dip - ust) * i) / parca);
      }
    }

    const sirali = sonuc
      .map((d) => Math.round(Math.min(enAlt, Math.max(0, d))))
      .sort((a, b) => a - b);
    // 40px'ten yakın duraklar tek durak sayılır (iki "boş" adım olmasın).
    return sirali.filter((d, i) => i === 0 || d - sirali[i - 1] > 40);
  }

  /**
   * Dert destesinin her kartının OTURDUĞU kaydırma konumu. Formül
   * `StackProgressDirective.update()` ile aynıdır: t = (yapışma − iz.top) / aralık,
   * p = t · (kart − 1 + 0,25); k. kart p = k'de oturur. Biri değişirse diğeri de değişmeli.
   */
  private yiginDuraklari(iz: HTMLElement, ust: number, yukseklik: number): number[] {
    const kartSayisi = iz.querySelectorAll('.pain').length || 4;
    const sahne = iz.firstElementChild as HTMLElement | null;
    const yapisma = sahne ? parseFloat(getComputedStyle(sahne).top) || 0 : 0;
    const aralik = Math.max(1, yukseklik - (sahne?.offsetHeight ?? window.innerHeight));
    const adimlar = kartSayisi - 1;
    const duraklar: number[] = [];
    for (let k = 0; k <= adimlar; k++) {
      const t = k / (adimlar + 0.25);
      duraklar.push(ust - yapisma + t * aralik);
    }
    return duraklar;
  }

  /*
   * GEÇİŞ TARAYICININ KENDİ YUMUŞAK KAYDIRMASIYLA (12 Ekim 2026). Eskiden kaydırmayı JS sürüyordu:
   * her karede `scrollTo` ile 850 ms'lik ease-in-out. Bu döngü ANA iş parçacığında çalıştığı için
   * o karede başka iş olunca (bölüm animasyonları devreye giriyor, fotoğraf çözülüyor) kare
   * kaçıyor ve geçiş takılıyordu (kullanıcı: "canlıda hâlâ animasyon geçişleri kasıyor").
   * `behavior: 'smooth'` kaydırmayı compositor iş parçacığında yürütür: ana iş parçacığı meşgulken
   * de akıcı kalır. Bitiş `scrollend` ile; desteklemeyen tarayıcıda zamanlayıcı yedeği.
   */
  private git(hedefY: number): void {
    if (Math.abs(hedefY - window.scrollY) < 2) return;
    this.gecisteMi = true;
    const bitir = (): void => {
      if (!this.gecisteMi) return;
      this.gecisteMi = false;
      window.removeEventListener('scrollend', bitir);
      clearTimeout(this.yedek);
    };
    window.addEventListener('scrollend', bitir, { once: true });
    this.yedek = setTimeout(bitir, ScreenStepperDirective.SURE_MS + 600);
    window.scrollTo({ top: hedefY, behavior: 'smooth' });
  }
}

/** Öğenin belgedeki üst kenarı, transform'lar YOK SAYILARAK (offsetTop zinciri). */
function duzenUstu(el: HTMLElement): number {
  let y = 0;
  let e: HTMLElement | null = el;
  while (e) {
    y += e.offsetTop;
    e = e.offsetParent as HTMLElement | null;
  }
  return y;
}
