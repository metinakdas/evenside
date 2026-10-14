import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  NgZone,
  OnDestroy,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AdaletDemoComponent } from './adalet-demo/adalet-demo.component';
import { AdimKartlariComponent } from './adim-kartlari/adim-kartlari.component';
import { MacSaatiComponent } from './mac-saati/mac-saati.component';
import { SoruIziComponent } from './soru-izi/soru-izi.component';
import { SaatIziComponent } from './saat-izi/saat-izi.component';
import { Player } from '../../core/models/player.model';
import { RatingService } from '../../core/services/rating.service';
import { PlayerCardComponent } from '../../shared/components/player-card/player-card.component';
import { StarBallComponent } from '../../shared/components/star-ball/star-ball.component';
import { HeroTrailComponent } from '../../shared/components/hero-trail/hero-trail.component';
import { CursorDotComponent } from '../../shared/components/cursor-dot/cursor-dot.component';
import { I18nService } from '../../core/services/i18n.service';
import { LANDING_DICTIONARIES } from '../../core/i18n/landing-dictionary';
import { RibbonArtComponent } from '../../shared/components/ribbon-art/ribbon-art.component';
import { RevealDirective } from '../../shared/directives/reveal.directive';
import { TypeCycleDirective } from '../../shared/directives/type-cycle.directive';
import { StackProgressDirective } from '../../shared/directives/stack-progress.directive';
import { ScreenStepperDirective } from '../../shared/directives/screen-stepper.directive';
import { ProofBackdropComponent } from './proof-backdrop/proof-backdrop.component';
import { ProofStatsComponent } from './proof-stats/proof-stats.component';
import { ScrollPulseDirective } from '../../shared/directives/scroll-pulse.directive';
import { PointerGlowDirective } from '../../shared/directives/pointer-glow.directive';
import { TypeOnDirective } from '../../shared/directives/type-on.directive';
import { HoverTypeDirective } from '../../shared/directives/hover-type.directive';
import { OffscreenPauseDirective } from '../../shared/directives/offscreen-pause.directive';

/** Sıkça sorulan soru — açılır cevap. */
interface Soru {
  id: string;
  soru: string;
  cevap: string;
}

/**
 * AÇILIŞ SAYFASI (`/welcome`) — uygulamanın ÖNÜNDEKİ yüz.
 *
 * Uygulama doğrudan giriş ekranıyla açılıyordu: siteye ilk gelen kişi ne olduğunu anlamadan
 * "e-posta / şifre" görüyordu. Bu sayfa o boşluğu dolduruyor ve klasik yedi bölümü izliyor:
 * giriş → sosyal kanıt → problem → çözüm → nasıl çalışıyor → SSS → son çağrı.
 *
 * **Görseller SAHTE EKRAN GÖRÜNTÜSÜ DEĞİL.** Kart, uygulamanın gerçek `PlayerCardComponent`'i
 * (gerçek reyting formülüyle hesaplanmış demo oyuncu); saha, denge çubuğu ve kura şeridi
 * uygulamanın kendi çizim diliyle kurulu. Pazarlama için "olduğundan iyi" bir şey
 * göstermiyoruz — gösterilen şey ürünün kendisi.
 */
@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [AdaletDemoComponent, SoruIziComponent, SaatIziComponent, MacSaatiComponent, AdimKartlariComponent, 
    StackProgressDirective,
    ScreenStepperDirective,
    OffscreenPauseDirective,
    ProofBackdropComponent,
    ProofStatsComponent,
    PlayerCardComponent,
    StarBallComponent,
    HeroTrailComponent,
    CursorDotComponent,
    RouterLink,
    RibbonArtComponent,
    RevealDirective,
    TypeCycleDirective,
    ScrollPulseDirective,
    PointerGlowDirective, TypeOnDirective, HoverTypeDirective],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingComponent implements AfterViewInit, OnDestroy {
  /**
   * Yüzen "Ücretsiz başla" pili görünür mü?
   *
   * Kural: ekranda başka bir dolu yeşil birincil düğme VARKEN pil gizli — giriş ekranında ve
   * son çağrıda aynı eylem zaten duruyor, ikisini birden göstermek gürültü. Bu yüzden pil,
   * o iki bölümün ikisi de ekran dışındayken açılıyor.
   */
  readonly pilGorunur = signal(false);
  /** Vaat şeridinin maddeleri (sözlük anahtarları). Hepsi ölçülebilir gerçek — uydurma yok. */
  protected readonly seritMaddeleri = [
    'serit.reklam',
    'serit.kurulum',
    'serit.kart',
    'serit.ucretsiz',
    'serit.format',
    'serit.telefon',
  ];
  /** "Başa dön" düğmesi: giriş ekranı görünmez olunca açılır. */
  readonly basaDonGorunur = signal(false);
  private yuzenKare = 0;
  private readonly yuzenOlc = (): void => {
    if (this.yuzenKare) return;
    this.yuzenKare = requestAnimationFrame(() => {
      this.yuzenKare = 0;
      this.yuzenleriGuncelle();
    });
  };

  /**
   * Canlı sayaç — GERÇEK veriden. Fonksiyon kurulmadıysa (ya da çağrı düşerse) `null` kalır
   * ve şerit hiç basılmaz: uydurma rakam gösterilmiyor.
   */

  /**
   * GERÇEK kullanıcı sözleri. Dizi BOŞ olduğu sürece bölüm sayfada hiç basılmaz.
   *
   * Buraya yalnızca gerçekten söylenmiş cümleler yazılır — uydurma referans, ilk kullanıcıda
   * güveni bir kerede bitirir (bkz. proje notları). Örnek biçim:
   *   { soz: 'Kura tartışması bitti, maça vaktinde başlıyoruz.', ad: 'Mert K.', rol: 'Çarşamba grubu kaptanı' }
   */
  protected readonly yorumlar: { soz: string; ad: string; rol: string }[] = [];

  /** Üst menüde hangi bölüm işaretli — uzun sayfada "neredeyim" sorusunun cevabı. */
  protected readonly aktifBolum = signal<string | null>(null);

  /** Sayfayı ekranlara bölen direktif: sol menü bölüme onun DURAĞIYLA gider (bkz. bolumeKaydir). */
  private readonly ekranlar = viewChild(ScreenStepperDirective);

  /**
   * Sol raydaki ekranlar — sayfanın YEDİ ekranının hepsi, yukarıdan aşağı. Etiketler sağdaki
   * maç saatiyle ortak (`saat.*`). `genis`: yalnızca geniş ekranda; telefonun alt şeridine
   * sekiz düğme sığmadığı için orada beş ana durak kalır.
   */
  protected readonly rayBolumleri = [
    { id: 'giris', etiket: 'saat.giris', genis: false },
    { id: 'kanit', etiket: 'saat.kanit', genis: true },
    { id: 'problem', etiket: 'saat.problem', genis: true },
    { id: 'cozum', etiket: 'saat.cozum', genis: false },
    { id: 'nasil', etiket: 'saat.adimlar', genis: false },
    { id: 'sss', etiket: 'saat.sss', genis: false },
    { id: 'son', etiket: 'saat.son', genis: true },
  ] as const;

  private readonly zone = inject(NgZone);
  private readonly duraklat = viewChild(OffscreenPauseDirective);
  /** Yıldız katmanının animasyonları şu an çalışıyor mu (giriş ekranı görünürken). */
  private yildizlarCalisiyor = true;

  ngAfterViewInit(): void {
    /*
     * Kaydırma dinleyicisi Angular bölgesinin DIŞINDA (12 Ekim 2026): bölge içindeyken saniyede
     * onlarca kaydırma olayının HER BİRİ bütün sayfada değişiklik algılamayı çalıştırıyordu.
     * Sinyaller değer değiştiğinde ekranı yine kendileri günceller.
     */
    this.zone.runOutsideAngular(() => {
      window.addEventListener('scroll', this.yuzenOlc, { passive: true });
      window.addEventListener('resize', this.yuzenOlc, { passive: true });
    });
    this.yuzenleriGuncelle();
    this.gorselleriOnceCoz();
  }

  /*
   * GÖRSELLERİ ÖNCEDEN ÇÖZ (12 Ekim 2026). Bölüm fotoğrafları 2400px; ekrana İLK geldikleri anda
   * çözülüp ekran kartına yükleniyorlardı ve kaydırma tam o anda takılıyordu ("Sahaya çık
   * açılırken kasma var"). Sayfa açıldıktan sonra, tarayıcı boştayken sırayla çözülürler.
   * Ölçüldü: "Sahaya çık" geçişinin GPU yükü 398 → 162 ms, "Üç adım" 611 → 313 ms.
   * Nesneler alanda tutulur ki çözülen görsel çöpe gitmesin.
   */
  private readonly onceCozulen: HTMLImageElement[] = [];
  private gorselleriOnceCoz(): void {
    if (typeof window === 'undefined') return;
    const gorseller = [
      '/foto-saha-kusbakisi.webp',
      '/foto-halisaha-gece.webp',
      '/kart-halisaha.webp',
      '/kart-kaleci.webp',
      '/kart-top.webp',
      '/kart-bos-kale.webp',
      '/foto-saha-cizgisi.webp',
      '/foto-takim-isiklar.webp',
      '/kura-stadium.jpg',
    ];
    const calistir = async (): Promise<void> => {
      for (const src of gorseller) {
        const img = new Image();
        img.decoding = 'async';
        img.src = src;
        this.onceCozulen.push(img);
        await img.decode().catch(() => undefined);
      }
    };
    this.zone.runOutsideAngular(() => {
      if ('requestIdleCallback' in window) window.requestIdleCallback(() => void calistir(), { timeout: 2500 });
      else setTimeout(() => void calistir(), 1200);
    });
  }

  /**
   * Yüzen pil ve "Başa dön" görünürlüğü. Pil yalnızca ORTADAKİ ekranlarda: giriş ekranı, son
   * çağrı ve alt bilgi görünürken gizli (orada aynı eylem zaten var / sayfa bitti).
   *
   * Öğeler HER ölçümde sayfadan yeniden okunur. Önce IntersectionObserver ile açılışta yakalanan
   * düğümler izleniyordu: şablon yeniden kurulunca (geliştirmede sıcak yenileme) gözlemci ESKİ,
   * sayfadan kopmuş düğümleri izlemeye devam ediyor, onlar hiç "görünmediği" için pil en üstte
   * ve en altta da açılıyordu (kullanıcı: "en üstte ve en altta yoktu, geri gelmiş").
   * Son çağrının çıkış animasyonu transform'u da gözlemcinin ölçtüğü kutuyu kaydırıyordu.
   */
  private yuzenleriGuncelle(): void {
    const vh = window.innerHeight;
    const gorunurOran = (el: Element | null): number => {
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      const kesisim = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      return r.height > 0 ? Math.max(0, kesisim) / r.height : 0;
    };
    const giris = gorunurOran(document.getElementById('giris'));
    const sonCagri = gorunurOran(document.querySelector('.final'));
    const altBilgi = gorunurOran(document.querySelector('footer'));
    this.pilGorunur.set(giris < 0.12 && sonCagri < 0.12 && altBilgi === 0);
    const orta = vh / 2;
    this.acikZemin.set(
      // `.proof` artık fotoğraflı koyu zemin (kuş bakışı saha): açık bant sayılmaz.
      ['.pains-track', '.faq'].some((sec) => {
        const r = document.querySelector(sec)?.getBoundingClientRect();
        return !!r && r.top <= orta && r.bottom >= orta;
      }),
    );
    this.basaDonGorunur.set(giris < 0.05);
    // Yıldız katmanı ekrana SABİT ve giriş ekranından sonra görünmez; 260 yanıp sönme animasyonu
    // görünmezken de çalışıyordu. Giriş ekranı tamamen gidince duraklatılır, dönünce sürer.
    const yildizlar = document.querySelector('.yildizlar');
    const calissin = giris > 0;
    if (yildizlar && calissin !== this.yildizlarCalisiyor) {
      this.yildizlarCalisiyor = calissin;
      this.duraklat()?.ayarla(yildizlar, calissin);
    }

    /*
     * SOL RAYDAKİ SEÇİLİ EKRAN (scroll-spy). Eskiden IntersectionObserver idi: açılışta yakalanan
     * öğelere bağlı kaldığı için sayfa yeniden kurulunca (geliştirmede sıcak yenileme) bayatlıyor ve
     * hiçbir düğme yanmıyordu (kullanıcı: "olduğum sayfada renklenmiyor"); bölümler ARASINDAKİ
     * bantlarda da seçimi bilerek boşaltıyordu. Artık her kaydırmada sayfadan okunuyor ve HER ZAMAN
     * bir ekran seçili: üst kenarı ekranın ortasını geçmiş SON bölüm. Sayfanın dibinde son çağrı
     * ortaya varamayabilir — alt bilgi görünüyorsa son ekran seçilir.
     */
    let aktif: string = this.rayBolumleri[0].id;
    for (const b of this.rayBolumleri) {
      const r = document.getElementById(b.id)?.getBoundingClientRect();
      if (r && r.top <= orta) aktif = b.id;
    }
    if (altBilgi > 0) aktif = 'son';
    if (this.aktifBolum() !== aktif) this.aktifBolum.set(aktif);
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.yuzenOlc);
    window.removeEventListener('resize', this.yuzenOlc);
    cancelAnimationFrame(this.yuzenKare);
  }

  /**
   * Rayın HİZASINDAKİ bölüm açık renkli mi (krem bantlar)?
   *
   * Ray sabit ve sayfanın ortasında; krem bantların üstüne gelince beyaz ikonlar
   * kayboluyordu (ekran görüntüsünde yakalandı). Ölçüt "bölüm ekranda mı" değil
   * "ekranın ORTASINDAN geçiyor mu" — rayın durduğu yer orası.
   *
   * Gözlemciyle DEĞİL, `yuzenleriGuncelle` içinde her kaydırmada sayfadan okunarak ölçülür:
   * açılışta yakalanan düğümler şablon yeniden kurulunca bayatlıyordu ve logo krem zeminde
   * beyaz kalıyordu (kullanıcının ekran görüntüsünde görüldü; pildeki hatanın aynısı).
   */
  protected readonly acikZemin = signal(false);

  /** Sözlük: şablon çevirileri buradan okur (bkz. I18nService). */
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  /** Cümleyi kelimelere böler (yanan yazı efektinde her kelime kendi gecikmesiyle tutuşur). */
  protected kelimeler(anahtar: string): string[] {
    return this.t(anahtar).split(/\s+/).filter(Boolean);
  }

  constructor() {
    /*
     * Sayfanın sözlüğü BURADA ekleniyor: bileşen tembel yüklendiği için altı dilin metni
     * giriş paketine girmiyor (sınır bir kez aşılmıştı, derleme hata vermişti).
     */
    this.i18n.register(LANDING_DICTIONARIES);
  }

  /** Footer'daki telif yılı: elle yazılan yıl er geç eskiyor. */
  readonly yil = new Date().getFullYear();

  /**
   * ZEMİN YILDIZLARI — konumları TOHUMLU, rastgele değil.
   *
   * `OnPush` altında her değişiklik algılamada yeni bir dizi üretilseydi yıldızlar yer
   * değiştirir, parlama animasyonları baştan başlardı (aynı tuzak kura töreninin
   * konfetisinde yaşanmıştı). Bu yüzden dizi bir kez, sabit tohumlu bir üreteçle kuruluyor.
   * `tur` 0 = nokta, 1 = dört uçlu yıldız; ikisi karışık dursun diye üçte biri yıldız.
   */
  protected readonly yildizlar = ((): { x: number; y: number; b: number; tur: number; gec: number }[] => {
    let tohum = 42;
    const rast = (): number => (tohum = (tohum * 1103515245 + 12345) % 2147483648) / 2147483648;
    return Array.from({ length: 130 }, () => ({
      x: Math.round(rast() * 1000) / 10,
      y: Math.round(rast() * 1000) / 10,
      b: 2 + Math.round(rast() * 30) / 10,
      tur: rast() > 0.66 ? 1 : 0,
      gec: Math.round(rast() * 60) / 10,
    }));
  })();
  /** Dar ekranda üst menü açık mı (hamburger). */
  readonly menuAcik = signal(false);

  menuAcikDegistir(): void {
    this.menuAcik.update((a) => !a);
  }

  menuKapat(): void {
    this.menuAcik.set(false);
  }

  /**
   * Sayfa içi bağlantılar. Ölçüldü: düz `<a href="#nasil">` tıklandığında `location.hash`
   * hiç değişmiyor ve sayfa o bölüme GİTMİYOR (Angular'ın rota katmanı aynı sayfa çapasını
   * yutuyor). Bu yüzden kaydırma elle yapılıyor; `scroll-margin-top` burada da geçerli,
   * yani başlık sabit üst çubuğun altında kalmıyor.
   */
  bolumeKaydir(id: string, olay: Event): void {
    const hedef = document.getElementById(id);
    if (!hedef) return;
    olay.preventDefault();

    const menuAcikti = this.menuAcik();
    this.menuAcik.set(false);

    const azalt = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    /*
     * Geniş ekranda ekran durağına git (kullanıcı, 11 Ekim 2026: "sol menüden sayfalara gidince
     * ortalamıyor, yarım kalıyor"): `scrollIntoView` bölüm başı + 28px paya gidiyordu; dibe hizalı
     * (Adil kura) ve deste ekranlarında tekerlekle gelinen hizayla tutmuyordu. Durak direktiften.
     * Telefonda ekran durakları yok: eski yol.
     */
    const kaydir = (): void => {
      const ekranlar = this.ekranlar();
      if (ekranlar?.etkin) {
        window.scrollTo({ top: ekranlar.durakFor(hedef), behavior: azalt ? 'auto' : 'smooth' });
        return;
      }
      hedef.scrollIntoView({ behavior: azalt ? 'auto' : 'smooth', block: 'start' });
    };

    /*
     * TUZAK (telefonda ölçüldü): menü paneli 300ms'lik `max-height` geçişiyle kapanıyor ve
     * kapanırken sayfa 184px yukarı kayıyor. Kaydırmayı hemen (ya da tek kare sonra) yaparsak
     * hedef altımızdan kayıyor ve bölümün üstü sabit çubuğun ALTINDA kalıyor (ölçüldü: -92px,
     * beklenen +92px). Bu yüzden menü açıktıysa kaydırma geçiş bittikten SONRA yapılıyor.
     */
    if (menuAcikti && !azalt) {
      setTimeout(kaydir, 340);
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(kaydir));
  }

  private readonly router = inject(Router);
  private readonly rating = inject(RatingService);

  /** Açık olan SSS satırı — aynı anda tek cevap açık kalır. */
  /**
   * Başlıktaki son kelimenin vaat listesi. Üçü de sayfanın SÖZÜ: aynı cümleyi üç açıdan
   * söylüyor, süslü eşanlamlı değil.
   */
  /*
   * Kelimeler SATIRA SIĞMALI. "tartışmasız kurulsun" alt satıra sarıyor, başlık bir satır
   * uzuyor ve altındaki paragraf 58px zıplıyordu (ölçüldü). Vaat listesi bu yüzden
   * "kurulsun" ile aynı satırda kalan kelimelerden kuruldu.
   */
  /** Başlıkta kendini yazıp silen kelimeler — dil değişince listesi de değişir. */
  protected readonly vaatler = computed(() => [
    this.t('hero.vaat1'),
    this.t('hero.vaat2'),
    this.t('hero.vaat3'),
  ]);

  protected readonly acikSoru = signal<string | null>('ucret');

  protected soruAc(id: string): void {
    this.acikSoru.update((mevcut) => (mevcut === id ? null : id));
  }

  protected girisYap(): void {
    void this.router.navigateByUrl('/login');
  }

  /**
   * Vitrindeki kart GERÇEK hesapla üretiliyor: aynı formül, aynı bileşen. Elle yazılmış
   * "güzel görünsün" diye şişirilmiş bir kart, ilk kartını çıkaran kullanıcıda hayal
   * kırıklığı yaratırdı.
   */
  private demoOyuncu(
    name: string,
    girdi: { boy: number; kilo: number; kal: number; def: number; os: number; forvet: number; hiz: number; day: number },
  ): Player {
    const input = {
      name,
      shirtNumber: '',
      countryCode: 'TR',
      flagImage: null,
      photoImage: null,
      heightCm: girdi.boy,
      weightKg: girdi.kilo,
      smoker: false,
      goalkeeping: girdi.kal,
      defending: girdi.def,
      midfield: girdi.os,
      attacking: girdi.forvet,
      pace: girdi.hiz,
      stamina: girdi.day,
      goalsPerMatch: 0.6,
    };
    return { id: name, input, ratings: this.rating.calculate(input) };
  }

  protected readonly vitrinKart = computed(() =>
    this.demoOyuncu('Yıldız', { boy: 182, kilo: 76, kal: 2, def: 6, os: 8, forvet: 9, hiz: 9, day: 8 }),
  );

  protected readonly ikinciKart = computed(() =>
    this.demoOyuncu('Duvar', { boy: 188, kilo: 84, kal: 4, def: 9, os: 6, forvet: 4, hiz: 6, day: 8 }),
  );

  /** Denge şeridindeki örnek: iki takım, ortalamaları neredeyse eşit. */
  protected readonly denge = { a: 74.2, b: 73.8 };

  /** Sekiz soru; metinler sözlükten gelir (kimlikler anahtarın ilk parçası). */
  protected readonly sorular = computed<Soru[]>(() =>
    ['ucret', 'kisi', 'arkadas', 'kaleci', 'adalet', 'telefon', 'veri', 'skor'].map((id) => ({
      id,
      soru: this.t(`sss.${id}.soru`),
      cevap: this.t(`sss.${id}.cevap`),
    })),
  );

  /**
   * Üç adım. Her adımın kendi FOTOĞRAFI var (kullanıcı: "bu alanların görsel kullan"):
   * kart → çimde top, takım → ışıklar altında takım, kura → gece halı saha. Üçü de
   * sayfanın diğer fotoğraflarıyla aynı CC0 kaynaktan ve aynı karartma işleminden geçiyor.
   */
  /**
   * Üç adım. Metinler sözlükten (dil değişince yeniden hesaplanır), fotoğraflar sabit:
   * saha çizgisi · ışıklar altında takım · gece halı saha.
   */
  protected readonly adimlar = computed(() =>
    [
      { no: '1', anahtar: 'adim1', foto: 'foto-saha-cizgisi.webp' },
      { no: '2', anahtar: 'adim2', foto: 'foto-takim-isiklar.webp' },
      { no: '3', anahtar: 'adim3', foto: 'foto-halisaha-gece.webp' },
    ].map((a) => ({
      no: a.no,
      foto: a.foto,
      baslik: this.t(`${a.anahtar}.baslik`),
      metin: this.t(`${a.anahtar}.metin`),
      sure: this.t(`${a.anahtar}.sure`),
    })),
  );
}
