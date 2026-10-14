import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  inject,
  viewChildren,
} from '@angular/core';

/**
 * İMLEÇ İZİ — giriş ekranında imleç gezindikçe futbol nesneleri belirip kayboluyor.
 *
 * Referans (kullanıcı): Brand Appart'ın anahtarlık render'larından oluşan iz. Nesneler
 * ürünün KENDİ oyuncu kartları ve CC0 kesitler (bkz. public/iz/LISANS.txt): kart ×2,
 * top ×2, kronometre. Marka taşıyan hiçbir şey yok.
 *
 * Katman EKRANI kaplar (sabit konum) — iz ilk ekranın her yerinde bırakılabilsin diye;
 * giriş bölümü yukarı kaybolunca direktif susar. Aynı anda en fazla ÜÇ nesne durur ve
 * nesne imlecin altında değil, ondan savrulan bir noktada belirir.
 *
 * Nesneler HAVUZDAN geliyor: sabit sayıda öğe bir kez basılıyor, sırayla yeniden
 * kullanılıyor. Her harekette DOM'a düğüm eklemek/çıkarmak çöp toplayıcıyı meşgul ederdi.
 *
 * Dinleyici Angular bölgesinin DIŞINDA: imleç hareketi saniyede onlarca olaydır, her
 * birinde değişiklik algılama çalıştırmak sayfayı kasar. Konum doğrudan CSS değişkenine
 * yazılıyor, sinyal kullanılmıyor.
 *
 * Nesne, imleç son bıraktığı yerden EN AZ "adim" kadar uzaklaşınca çıkar: hızlı hareket
 * çok nesne, yavaş hareket az nesne üretir — iz, hareketin kendisini anlatır.
 *
 * "prefers-reduced-motion" altında ve dokunmatikte (hover yok) dinleyici HİÇ bağlanmaz.
 */
@Component({
  selector: 'app-hero-trail',
  standalone: true,
  templateUrl: './hero-trail.component.html',
  styleUrl: './hero-trail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
})
export class HeroTrailComponent implements AfterViewInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private readonly ogeler = viewChildren<ElementRef<HTMLElement>>('oge');

  /** İki nesne arasındaki en küçük imleç yolu (px). */
  private readonly adim = 150;
  /** Nesnenin ekranda kalma süresi — CSS animasyonuyla aynı. */
  private readonly omur = 900;
  /** Aynı anda ekranda duran en fazla nesne (kullanıcı isteği: üçten fazla olmasın). */
  private readonly enCok = 3;
  /** Nesnenin imleçten savrulduğu en az/en çok uzaklık (px). */
  private readonly atisEnAz = 70;
  private readonly atisEnCok = 170;

  private sonX = 0;
  private sonY = 0;
  private baslandi = false;
  private sira = 0;
  /** Şu an ekranda olanlar, en eskisi başta. Dördüncü gelince ilki hemen kapanır. */
  private canlilar: { el: HTMLElement; zaman: number }[] = [];

  private readonly hareket = (olay: PointerEvent): void => {
    const kutu: DOMRect = this.host.nativeElement.getBoundingClientRect();
    const x = olay.clientX - kutu.left;
    const y = olay.clientY - kutu.top;
    if (x < 0 || y < 0 || x > kutu.width || y > kutu.height) return;
    // Katman ekranı kaplıyor ama iz YALNIZCA ilk ekranın işi. Ölçüt "giriş bölümü hâlâ
    // görünüyor mu" DEĞİL, "ekranın çoğunu hâlâ o mu kaplıyor": biraz kaydırınca nesneler
    // alttaki krem bandın üstüne düşüyordu (kullanıcı, ekran görüntüsüyle).
    if (!this.ilkEkranda()) {
      this.hepsiniKapat();
      return;
    }

    if (!this.baslandi) {
      this.baslandi = true;
      this.sonX = x;
      this.sonY = y;
      return;
    }

    const yol = Math.hypot(x - this.sonX, y - this.sonY);
    if (yol < this.adim) return;
    this.sonX = x;
    this.sonY = y;
    this.birak(x, y, kutu.width, kutu.height);
  };

  private birak(x: number, y: number, enGenis: number, enYuksek: number): void {
    const liste = this.ogeler();
    if (liste.length === 0) return;
    const el: HTMLElement = liste[this.sira % liste.length].nativeElement;

    /*
     * Nesne imlecin ALTINDA doğmaz, oradan bir yere SAVRULUR (kullanıcı isteği). Açı sırayla
     * ilerliyor (altın oranlı adım) — rastgele sayı üretmeden dağınık ama tekrarsız bir
     * dağılım verir. Hedef ekran dışına taşarsa kenarın içine çekiliyor.
     */
    const aci = this.sira * 2.39996;
    const uzaklik = this.atisEnAz + ((this.sira * 37) % (this.atisEnCok - this.atisEnAz));
    const pay = 70;
    let hx = Math.min(enGenis - pay, Math.max(pay, x + Math.cos(aci) * uzaklik));
    let hy = Math.min(enYuksek - pay, Math.max(pay, y + Math.sin(aci) * uzaklik));
    [hx, hy] = this.yasaktanKac(hx, hy, enGenis, enYuksek);
    this.sira++;

    // Sınıfı önce kaldır, sonra yeniden ekle: aynı öğe tekrar kullanıldığında animasyon
    // baştan başlasın (yalnızca sınıf eklemek duran animasyonu yeniden başlatmaz).
    el.classList.remove('iz__oge--canli');
    void el.offsetWidth;
    el.style.setProperty('--x', hx.toFixed(0) + 'px');
    el.style.setProperty('--y', hy.toFixed(0) + 'px');
    el.classList.add('iz__oge--canli');

    const zaman = window.setTimeout(() => this.kapat(el), this.omur);
    this.canlilar.push({ el, zaman });
    while (this.canlilar.length > this.enCok) {
      const eski = this.canlilar.shift();
      if (eski) {
        window.clearTimeout(eski.zaman);
        eski.el.classList.remove('iz__oge--canli');
      }
    }
  }

  /**
   * YASAK BÖLGELER — nesne arayüzün üstüne ya da arkasına düşmesin (kullanıcı: "bu alanda
   * arka planda ikon çıkmasın, sınır belirle").
   *
   * Sınır elle yazılmıyor, arayüzün GERÇEK kutusundan okunuyor: ray menü, marka ve yüzen
   * şerit nerede duruyorsa yasak bölge orası. Ölçüler ekrana göre değiştiği için (ray
   * masaüstünde solda, telefonda altta) sabit bir koordinat yazmak yanlış olurdu.
   */
  private yasaktanKac(x: number, y: number, enGenis: number, enYuksek: number): [number, number] {
    const pay = 58;
    const kenar = 70;
    let hx = x;
    let hy = y;
    for (const sec of ['.ray', '.brand--sabit', '.yuzen-cta']) {
      const el = document.querySelector(sec);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const sol = r.left - pay;
      const sag = r.right + pay;
      const ust = r.top - pay;
      const alt = r.bottom + pay;
      if (hx < sol || hx > sag || hy < ust || hy > alt) continue;

      // En yakın kenardan çık: hangi yöne itmek daha kısaysa o yöne.
      const mesafeler = [
        { yon: 'sag' as const, m: sag - hx },
        { yon: 'sol' as const, m: hx - sol },
        { yon: 'alt' as const, m: alt - hy },
        { yon: 'ust' as const, m: hy - ust },
      ].sort((a, b) => a.m - b.m);
      for (const { yon } of mesafeler) {
        const ax = yon === 'sag' ? sag : yon === 'sol' ? sol : hx;
        const ay = yon === 'alt' ? alt : yon === 'ust' ? ust : hy;
        if (ax >= kenar && ax <= enGenis - kenar && ay >= kenar && ay <= enYuksek - kenar) {
          hx = ax;
          hy = ay;
          break;
        }
      }
    }
    return [hx, hy];
  }

  private kapat(el: HTMLElement): void {
    el.classList.remove('iz__oge--canli');
    this.canlilar = this.canlilar.filter((k) => k.el !== el);
  }

  /** Ekranın en az dörtte üçünü hâlâ giriş bölümü kaplıyor mu? */
  private ilkEkranda(): boolean {
    const bolum = this.host.nativeElement.parentElement;
    if (!bolum) return true;
    return bolum.getBoundingClientRect().bottom >= window.innerHeight * 0.75;
  }

  /** Ekranda ne varsa anında kapat (ilk ekrandan çıkarken). */
  private hepsiniKapat(): void {
    for (const k of this.canlilar) {
      window.clearTimeout(k.zaman);
      k.el.classList.remove('iz__oge--canli');
    }
    this.canlilar = [];
  }

  /**
   * Kaydırırken de temizlensin: imleç kıpırdamadan sayfa kaydırılırsa nesneler alttaki
   * bölümün üstünde asılı kalıyordu. Dinleyici `passive` ve bölge dışında.
   */
  private readonly kaydirma = (): void => {
    if (this.canlilar.length > 0 && !this.ilkEkranda()) this.hepsiniKapat();
  };

  ngAfterViewInit(): void {
    const azalt = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const imlecVar = window.matchMedia?.('(hover: hover)').matches ?? false;
    if (azalt || !imlecVar) return;
    this.zone.runOutsideAngular(() => {
      window.addEventListener('pointermove', this.hareket, { passive: true });
      window.addEventListener('scroll', this.kaydirma, { passive: true });
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('pointermove', this.hareket);
    window.removeEventListener('scroll', this.kaydirma);
    for (const k of this.canlilar) window.clearTimeout(k.zaman);
  }
}
