import { Injectable, computed, signal } from '@angular/core';
import { DICTIONARIES, EkSozluk, SUPPORTED_LOCALES, SupportedLocale } from '../i18n/dictionaries';

const DEPO_ANAHTARI = 'saha42.dil.v1';

/**
 * DİL SERVİSİ — çalışma zamanında dil değiştirme.
 *
 * Angular'ın yerleşik `$localize` i18n'i DERLEME ZAMANINDA çalışır: her dil için ayrı paket
 * üretir ve dil değiştirmek sayfayı başka bir adrese göndermek demektir. Burada istenen
 * "tek pakette, anında değişen dil" olduğu için sözlük tabanlı bir servis kuruldu.
 *
 * Kurallar:
 * - Tercih kullanıcıya değil CİHAZA ait (`localStorage`), çünkü giriş yapmadan da seçilebilir.
 * - İlk açılışta tarayıcının dili denenir; desteklenmiyorsa Türkçe.
 * - `<html lang>` ve `<html dir>` her değişimde güncellenir (Arapça sağdan sola).
 * - Anahtar bulunamazsa önce İngilizce, sonra Türkçe, en sonda anahtarın kendisi basılır —
 *   sayfa hiçbir durumda BOŞ metinle kalmaz.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly secili = signal<SupportedLocale>(this.ilkDil());
  /**
   * Sonradan eklenen sözlükler (ör. tanıtım sayfasının metni). Sinyal, çünkü sözlük
   * geldiğinde ekrandaki metinlerin yeniden hesaplanması gerekiyor.
   */
  private readonly ekler = signal<Record<string, Record<string, string>>>({});
  readonly locale = this.secili.asReadonly();
  readonly locales = SUPPORTED_LOCALES;
  /** Arapça sağdan sola; düzen yönü buradan okunur. */
  readonly dir = computed<'ltr' | 'rtl'>(() => (this.secili() === 'ar' ? 'rtl' : 'ltr'));

  constructor() {
    this.belgeyeYaz(this.secili());
    etkinServis = this;
  }

  /**
   * Çeviri. Şablonlarda `t('anahtar')` diye çağrılabilmesi için OK FONKSİYONU: `this`
   * bağlamı kaybolmasın.
   */
  readonly t = (anahtar: string, params?: Record<string, string | number>): string => {
    const dil = this.secili();
    const ek = this.ekler();
    const ham =
      ek[dil]?.[anahtar] ??
      DICTIONARIES[dil]?.[anahtar] ??
      ek['en']?.[anahtar] ??
      DICTIONARIES['en']?.[anahtar] ??
      ek['tr']?.[anahtar] ??
      DICTIONARIES['tr']?.[anahtar] ??
      anahtar;
    if (!params) return ham;
    return Object.entries(params).reduce((metin, [k, v]) => metin.replaceAll(`{${k}}`, String(v)), ham);
  };

  /**
   * Bir ekranın kendi sözlüğünü ekler. Ekran TEMBEL yüklendiği için sözlüğü de o parçada
   * taşınır — giriş paketi altı dilin sayfa metniyle şişmez (sınır bir kez aşıldı).
   * Aynı sözlük iki kez eklenirse zararsız: üzerine yazılır.
   */
  register(ek: EkSozluk): void {
    this.ekler.update((mevcut) => {
      const yeni: Record<string, Record<string, string>> = { ...mevcut };
      for (const dil of Object.keys(ek) as SupportedLocale[]) {
        yeni[dil] = { ...(yeni[dil] ?? {}), ...ek[dil] };
      }
      return yeni;
    });
  }

  setLocale(dil: SupportedLocale): void {
    if (!SUPPORTED_LOCALES.some((d) => d.id === dil)) return;
    this.secili.set(dil);
    try {
      localStorage.setItem(DEPO_ANAHTARI, dil);
    } catch {
      // Gizli sekmede depo kapalı olabilir: dil yine de bu oturum boyunca geçerli.
    }
    this.belgeyeYaz(dil);
  }

  private ilkDil(): SupportedLocale {
    try {
      const kayitli = localStorage.getItem(DEPO_ANAHTARI) as SupportedLocale | null;
      if (kayitli && SUPPORTED_LOCALES.some((d) => d.id === kayitli)) return kayitli;
    } catch {
      // yok sayılır
    }
    // Tarayıcının dil SIRALAMASI denenir (ör. ["fr-BE", "nl", "en"] → fr): yalnızca ilk dile
    // bakmak, ilk tercihi desteklenmeyen kullanıcıyı ikinci tercihi yerine Türkçeye düşürüyordu.
    const liste = navigator.languages?.length ? navigator.languages : [navigator.language || 'tr'];
    for (const etiket of liste) {
      const kod = etiket.slice(0, 2).toLowerCase();
      const eslesme = SUPPORTED_LOCALES.find((d) => d.id === kod);
      if (eslesme) return eslesme.id;
    }
    return 'tr';
  }

  private belgeyeYaz(dil: SupportedLocale): void {
    const kok = document.documentElement;
    kok.setAttribute('lang', dil);
    kok.setAttribute('dir', dil === 'ar' ? 'rtl' : 'ltr');
  }
}

/**
 * Enjeksiyon bağlamı OLMAYAN yerler için çeviri kapısı.
 *
 * Servislerin bazı kullanıcı mesajları modül düzeyindeki sabit tablolarda ve düz
 * fonksiyonlarda (`describeSupabaseError`) üretiliyor; oralara `inject()` konamaz. Servis
 * kök enjektörde tek örnek olduğu için kurucuda kendini buraya yazıyor.
 *
 * Örnek henüz yoksa (yalnız birim testlerde olur) TÜRKÇE temel sözlüğe düşer. Önceden ham
 * anahtar dönüyordu: çevrilmiş mesajı ölçen testler, önlerinde servisi kuran başka bir test
 * koşup koşmamasına göre — yani rastgele SIRAYA göre — kırılıyordu (iki ayrı testte yaşandı).
 */
let etkinServis: I18nService | null = null;

/**
 * Tek ondalıklı sayı, SEÇİLİ DİLİN ayırıcısıyla (tr/de/fr/es "71,3", en "71.3"). Rakamlar her
 * dilde Latin: Arapça "٧١٫٣" maç geçmişine yazılınca sayıya geri çevrilemiyordu. Bir `computed`
 * içinde çağrılırsa dil sinyalini okur, dil değişince güncellenir. (QA K5: kura ekranı "71.3",
 * menü "71,3" yazıyordu — ikisi de sabit kodluydu.)
 */
export function ondalik(n: number): string {
  const dil = etkinServis?.locale() ?? 'tr';
  return new Intl.NumberFormat(dil + '-u-nu-latn', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
}

/** Yüzde, seçili dilin biçiminde (Türkçede "%40", İngilizcede "40%"), her dilde Latin rakam. */
export function yuzde(oran: number): string {
  const dil = etkinServis?.locale() ?? 'tr';
  return new Intl.NumberFormat(dil + '-u-nu-latn', { style: 'percent', maximumFractionDigits: 0 }).format(oran);
}

export function mesaj(anahtar: string, params?: Record<string, string | number>): string {
  if (etkinServis) return etkinServis.t(anahtar, params);
  const ham = DICTIONARIES['tr']?.[anahtar] ?? anahtar;
  if (!params) return ham;
  return Object.entries(params).reduce((metin, [k, v]) => metin.replaceAll(`{${k}}`, String(v)), ham);
}
