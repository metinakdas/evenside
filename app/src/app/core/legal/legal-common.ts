/**
 * YASAL METİNLERİN ORTAK PARÇALARI — tipler ve veri sorumlusu.
 *
 * Ayrı dosyada, çünkü hem asıl metinler (`legal-docs.ts`) hem ek diller
 * (`legal-docs-extra.ts`) buna ihtiyaç duyuyor. Aynı sabiti biri diğerinden okusaydı
 * DAİRESEL içe aktarma oluşurdu ve sabit modül gövdesinde `undefined` gelirdi
 * (bir tur yaşandı: yasal sayfalar hiç açılmadı).
 */

export type LegalDocId = 'gizlilik' | 'kvkk' | 'cerez' | 'kosullar';

export interface LegalSection {
  heading: string;
  /** Paragraflar; `- ` ile başlayan satırlar madde listesi olarak basılır. */
  body: string[];
}

export interface LegalDoc {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}

/**
 * Veri sorumlusunun kimliği. KVKK md. 10 ve GDPR md. 13 bu bilgiyi ZORUNLU kılıyor;
 * uydurulamaz, bu yüzden köşeli parantezle bırakıldı. YAYINA ÇIKMADAN ÖNCE DOLDURULMALI.
 */
export const VERI_SORUMLUSU = {
  unvan: '[Veri sorumlusunun adı / unvanı]',
  adres: '[Adres]',
  eposta: '[iletisim@alanadi.com]',
} as const;
