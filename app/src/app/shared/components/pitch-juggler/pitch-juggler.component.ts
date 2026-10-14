import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  afterNextRender,
  inject,
} from '@angular/core';

/** Sahada durabileceği alan (yüzde) — kenar çizgilerine yapışmasın. */
const SINIR = { minX: 10, maxX: 90, minY: 16, maxY: 84 };

/** İmleç bu kadar yaklaşınca kaçar (kabın kısa kenarına oranla). */
const KACIS_MESAFESI = 0.26;

/** Bir kaçıştan sonra en az bu kadar beklenir — imleç üstünde titremesin (ms). */
const KACIS_ARALIGI = 420;

/**
 * Kullanıcının kartı sahadaysa figür onun bu kadar yakınına GİRMEZ (yüzde).
 * Kart, kutunun asıl konusu; karakterin onu kapatması kabul edilemez.
 */
const ENGEL_YARICAPI = 22;

/** Kaçarken alınan yol (yüzde). */
const ADIM = 26;

/**
 * SAHADA TOP SEKTİREN OYUNCU.
 *
 * "Kartım" kutusu, kartı olmayan kullanıcıda boş bir sahaydı: yedi hayalet yuva ve
 * "Kartın yok" yazısı. Kullanıcı isteği: "top sektiren bir çöp adam olsa, mouse yaklaşınca
 * kaçsa." İşe yarıyor çünkü boş saha bir EKSİKLİK anlatıyordu; oynayan biri onu bir DAVETE
 * çeviriyor — kutu zaten kart oluşturma ekranına gidiyor.
 *
 * Figür, yol haritasındaki koşucuyla AYNI dilde (yön tabelası piktogramı, tek renk, 1.8px
 * kontur): iki ayrı karakter değil, tek bir karakter ailesi.
 *
 * **Tıklamayı yutmaz.** Kutunun kendisi bir düğme; karakter `pointer-events: none`. Konumu
 * imleci PENCEREDEN dinleyerek hesaplıyor, kendi üstünde olay beklemiyor.
 *
 * **Angular bölgesinin DIŞINDA çalışır.** İmleç hareketi saniyede onlarca olay demek; her
 * birinde değişiklik algılama çalıştırmak kutuyu kasardı. Konum doğrudan CSS değişkenine
 * yazılıyor, sinyal kullanılmıyor.
 */
@Component({
  selector: 'app-pitch-juggler',
  standalone: true,
  templateUrl: './pitch-juggler.component.html',
  styleUrl: './pitch-juggler.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PitchJugglerComponent {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);

  private x = 50;
  private y = 52;
  private sonKacis = 0;
  /** Kartı görüp ona göre yerleşti mi — bir kez olur. */
  private yerlesti = false;
  private kacisTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const destroy = inject(DestroyRef);

    afterNextRender(() => {
      /*
       * Kart varsa figür ondan UZAK bir noktada başlar. Kartın ölçüsü ilk karede hazır
       * olmayabiliyor (ölçüldü: ilk denemede null döndü ve figür ortada başladı); bu yüzden
       * bir kare sonra bir kez daha denenir.
       */
      /*
       * Kart VERİ GELİNCE basılıyor; figür yerleşirken henüz DOM'da olmayabilir (ölçüldü:
       * ilk karede yoktu, figür ortada kaldı). Kart belirene kadar birkaç kez denenir.
       * Kullanıcı bu arada figürü kovaladıysa yerleşim iptal — onun oyununu bozmayalım.
       */
      this.baslangicKonumu();
      for (const gecikme of [150, 600, 1500]) {
        this.zone.runOutsideAngular(() => setTimeout(() => this.baslangicKonumu(), gecikme));
      }

      /*
       * `prefers-reduced-motion`: kaçış da sektirme de kapalı. Karakter YOK OLMUYOR —
       * hareketi azaltmak, içeriği silmek demek değil.
       */
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      this.zone.runOutsideAngular(() => {
        const dinle = (event: PointerEvent) => this.imlecGeldi(event);
        window.addEventListener('pointermove', dinle, { passive: true });
        destroy.onDestroy(() => {
          window.removeEventListener('pointermove', dinle);
          if (this.kacisTimer) clearTimeout(this.kacisTimer);
        });
      });
    });
  }

  /**
   * Kullanıcının kendi kartının sahadaki yeri (yüzde) — yoksa null.
   *
   * Kart, aynı kabın içindeki `.spot--mine` öğesi. Bileşene girdi olarak geçmek yerine
   * DOM'dan okunuyor: konum zaten orada hesaplanıyor (yüzdeli yuvalar) ve iki yerde
   * tutulan bir koordinat er geç ayrışır.
   */
  private engel(): { x: number; y: number } | null {
    const kap = this.host.parentElement;
    const kart = kap?.querySelector<HTMLElement>('.spot--mine');
    if (!kap || !kart) return null;
    const kb = kap.getBoundingClientRect();
    const tb = kart.getBoundingClientRect();
    if (!kb.width || !kb.height) return null;
    return {
      x: ((tb.left + tb.width / 2 - kb.left) / kb.width) * 100,
      y: ((tb.top + tb.height / 2 - kb.top) / kb.height) * 100,
    };
  }

  /** Hedef karta çok yakınsa, kartın ters yönüne iterek uzaklaştırır. */
  private engeldenKac(hedefX: number, hedefY: number): { x: number; y: number } {
    const engel = this.engel();
    if (!engel) return { x: hedefX, y: hedefY };

    const dx = hedefX - engel.x;
    const dy = hedefY - engel.y;
    const uzaklik = Math.hypot(dx, dy);
    if (uzaklik >= ENGEL_YARICAPI) return { x: hedefX, y: hedefY };

    const boy = uzaklik || 1;
    return {
      x: engel.x + (dx / boy) * ENGEL_YARICAPI,
      y: engel.y + (dy / boy) * ENGEL_YARICAPI,
    };
  }

  /** Kart neredeyse figür karşı yarıda başlar; kart yoksa ortada durur. */
  private baslangicKonumu(): void {
    if (this.yerlesti || this.sonKacis > 0) return;
    const engel = this.engel();
    if (engel) {
      this.x = engel.x > 50 ? 26 : 74;
      this.y = engel.y > 50 ? 32 : 68;
      this.yerlesti = true; // kart bulundu, yerleşim kesinleşti
    }
    this.yerlestir();
  }

  private yerlestir(): void {
    this.host.style.setProperty('--jx', `${this.x}%`);
    this.host.style.setProperty('--jy', `${this.y}%`);
  }

  private imlecGeldi(event: PointerEvent): void {
    const kutu = this.host.getBoundingClientRect();
    if (!kutu.width || !kutu.height) return;

    // İmleç kutunun dışındaysa hiç hesaplama yapma.
    if (
      event.clientX < kutu.left - 40 ||
      event.clientX > kutu.right + 40 ||
      event.clientY < kutu.top - 40 ||
      event.clientY > kutu.bottom + 40
    ) {
      return;
    }

    const imlecX = ((event.clientX - kutu.left) / kutu.width) * 100;
    const imlecY = ((event.clientY - kutu.top) / kutu.height) * 100;

    // Mesafe PİKSELDE ölçülür: yüzdeyle ölçmek geniş kutularda yatayı yanlış büyütür.
    const dx = ((this.x - imlecX) / 100) * kutu.width;
    const dy = ((this.y - imlecY) / 100) * kutu.height;
    const uzaklik = Math.hypot(dx, dy);
    const esik = Math.min(kutu.width, kutu.height) * KACIS_MESAFESI;
    if (uzaklik > esik) return;

    const simdi = performance.now();
    if (simdi - this.sonKacis < KACIS_ARALIGI) return;
    this.sonKacis = simdi;

    this.kac(dx / (uzaklik || 1), dy / (uzaklik || 1), imlecX, imlecY);
  }

  /**
   * İmlecin TERS yönüne kaçar. Duvara dayanırsa imlece EN UZAK köşeyi seçer — yoksa kenarda
   * sıkışıp imlecin altında titrerdi.
   *
   * `yonX/yonY` birim vektör, `imlecX/imlecY` yüzde. Birimleri karıştırmamak önemli:
   * mesafe PİKSELDE ölçülüyor (geniş kutuda yüzde yatayı yanlış büyütür), konum YÜZDEDE
   * tutuluyor (kutu esnese de figür sahada kalsın).
   */
  private kac(yonX: number, yonY: number, imlecX: number, imlecY: number): void {
    let hedefX = this.x + yonX * ADIM;
    let hedefY = this.y + yonY * ADIM;

    const sikisti =
      hedefX < SINIR.minX || hedefX > SINIR.maxX || hedefY < SINIR.minY || hedefY > SINIR.maxY;

    if (sikisti) {
      const koseler = [
        { x: SINIR.minX, y: SINIR.minY },
        { x: SINIR.maxX, y: SINIR.minY },
        { x: SINIR.minX, y: SINIR.maxY },
        { x: SINIR.maxX, y: SINIR.maxY },
      ];
      const enUzak = koseler.reduce((a, b) =>
        Math.hypot(b.x - imlecX, b.y - imlecY) > Math.hypot(a.x - imlecX, a.y - imlecY) ? b : a,
      );
      hedefX = enUzak.x;
      hedefY = enUzak.y;
    }

    const kacinilmis = this.engeldenKac(hedefX, hedefY);
    this.x = Math.min(SINIR.maxX, Math.max(SINIR.minX, kacinilmis.x));
    this.y = Math.min(SINIR.maxY, Math.max(SINIR.minY, kacinilmis.y));

    /* Kaçtığı yöne DÖNSÜN: sola kaçarken sağa bakan bir figür yanlış görünür. */
    this.host.style.setProperty('--jyon', this.x >= imlecX ? '1' : '-1');
    this.host.classList.add('juggler--running');
    this.yerlestir();

    if (this.kacisTimer) clearTimeout(this.kacisTimer);
    this.kacisTimer = setTimeout(() => this.host.classList.remove('juggler--running'), 520);
  }
}
