import { Injectable, computed, signal } from '@angular/core';

/** Kullanıcının verdiği yanıt. `zorunlu` = isteğe bağlı kategorilere hayır. */
export type CerezKarari = 'hepsi' | 'zorunlu';

interface Kayit {
  karar: CerezKarari;
  /** Metin sürümü: politika değişirse yeniden sorulur. */
  surum: number;
  tarih: string;
}

const ANAHTAR = 'saha42.cerez.v1';
/** Çerez/veri metni değiştiğinde ARTIRILIR: eski onay geçersiz olur ve şerit yeniden çıkar. */
export const CEREZ_SURUMU = 1;

/**
 * ÇEREZ ONAYI — cihaza ait, hesaba değil.
 *
 * Şerit giriş yapmadan da görünmeli, bu yüzden kayıt kullanıcı kimliğiyle kapsamlanmıyor
 * (bkz. `UserScopeService`: orada kişiye ait VERİ tutuluyor, burada cihazın tercihi).
 *
 * Bugün isteğe bağlı bir kategori YOK: uygulama analiz/reklam aracı çalıştırmıyor. Yine de
 * karar saklanıyor ki ileride bir araç eklenirse onay olmadan çalıştırılmasın —
 * `isteğeBağlıAçık()` o kapıyı şimdiden tanımlıyor.
 */
@Injectable({ providedIn: 'root' })
export class CookieConsentService {
  private readonly kayit = signal<Kayit | null>(this.oku());

  /** Şerit gösterilsin mi: hiç yanıt yoksa ya da metin sürümü eskiyse. */
  readonly sorulmali = computed(() => {
    const k = this.kayit();
    return !k || k.surum !== CEREZ_SURUMU;
  });

  /** İsteğe bağlı araçlar (ileride) çalıştırılabilir mi? */
  readonly istegeBagliAcik = computed(() => this.kayit()?.karar === 'hepsi');

  karar(karar: CerezKarari): void {
    const kayit: Kayit = { karar, surum: CEREZ_SURUMU, tarih: new Date().toISOString() };
    this.kayit.set(kayit);
    try {
      localStorage.setItem(ANAHTAR, JSON.stringify(kayit));
    } catch {
      // Depo kapalıysa (gizli sekme) karar bu oturum boyunca geçerli olur.
    }
  }

  /** Kullanıcı fikrini değiştirmek isterse: şerit yeniden çıkar. */
  sifirla(): void {
    this.kayit.set(null);
    try {
      localStorage.removeItem(ANAHTAR);
    } catch {
      // yok sayılır
    }
  }

  private oku(): Kayit | null {
    try {
      const ham = localStorage.getItem(ANAHTAR);
      if (!ham) return null;
      const k = JSON.parse(ham) as Kayit;
      return k && (k.karar === 'hepsi' || k.karar === 'zorunlu') ? k : null;
    } catch {
      return null;
    }
  }
}
