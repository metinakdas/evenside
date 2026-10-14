/**
 * YASAL METİNLER — tek kaynak.
 *
 * Dört belge: gizlilik politikası · KVKK aydınlatma metni · çerez politikası · kullanım
 * koşulları. Her belge DİLE göre tutulur; eksik dil İngilizceye, o da yoksa Türkçeye düşer
 * (`legalDoc()`), böylece yeni bir dil eklendiğinde sayfa boş kalmaz.
 *
 * DOLDURULACAK ALANLAR: veri sorumlusunun unvanı, adresi ve iletişim e-postası uydurulamaz —
 * metinlerde `[...]` ile işaretli. Yayına çıkmadan önce `VERI_SORUMLUSU` sabiti doldurulmalı.
 *
 * Metinler bilgilendirme amaçlıdır; yayına çıkmadan önce bir hukukçuya okutulması önerilir.
 */

import { EXTRA_LEGAL_DOCS } from './legal-docs-extra';
import { LegalDoc, LegalDocId, VERI_SORUMLUSU } from './legal-common';

// Tipler ve veri sorumlusu ortak dosyada (bkz. legal-common.ts); buradan yeniden yayımlanıyor
// ki çağıranlar tek yerden içe aktarabilsin.
export { VERI_SORUMLUSU } from './legal-common';
export type { LegalDoc, LegalDocId, LegalSection } from './legal-common';

const tr: Record<LegalDocId, LegalDoc> = {
  gizlilik: {
    title: 'Gizlilik Politikası',
    updated: '22 Eylül 2026',
    intro:
      'Evenside, halı saha kadrosu kurmanı sağlayan bir web uygulamasıdır. Bu metin hangi verileri topladığımızı, neden topladığımızı ve ne kadar süre sakladığımızı anlatır.',
    sections: [
      {
        heading: 'Topladığımız veriler',
        body: [
          '- **Hesap verisi:** e-posta adresin ve şifrenin şifrelenmiş özeti. Şifre hiçbir yerde açık metin olarak tutulmaz.',
          '- **Oyuncu kartı verisi:** ad, boy, kilo, yetenek puanları ve isteğe bağlı fotoğraf. Fotoğrafın arka planını silme işlemi TARAYICINDA yapılır; fotoğraf bu işlem için hiçbir sunucuya gönderilmez.',
          '- **Takım ve kadro verisi:** takım adı, katılma kodu, kadroda kimlerin olduğu.',
          '- **Cihazında kalan veriler:** maç geçmişi, açık takım ve tören tercihleri tarayıcının yerel deposunda (localStorage) tutulur; sunucuya gönderilmez.',
          'Reklam, konum, rehber ya da takip amaçlı veri toplamıyoruz.',
        ],
      },
      {
        heading: 'Neden topluyoruz',
        body: [
          'Veriler yalnızca hizmetin kendisi için işlenir: hesabını açmak, kartını hesaplamak, takımını kurmak, kurayı çekmek ve kadro görselini üretmek.',
          'Verilerini satmıyoruz, pazarlama amacıyla üçüncü kişilerle paylaşmıyoruz.',
        ],
      },
      {
        heading: 'Kimlerle paylaşılıyor',
        body: [
          '- **Supabase** (veritabanı ve kimlik doğrulama altyapısı) — verilerin barındırıldığı yer.',
          '- **TheSportsDB** — kulüp arması ve forma görselleri için; yalnızca senin seçtiğin kulübün adı sorgulanır, kişisel veri gönderilmez.',
          '- **images.weserv.nl** — kulüp görsellerinin kadro çıktısına basılabilmesi için görsel vekil sunucusu; yalnızca görsel adresi iletilir.',
          'Yasal bir talep gelmesi hâlinde mevzuatın gerektirdiği ölçüde paylaşım yapılabilir.',
        ],
      },
      {
        heading: 'Saklama süresi',
        body: [
          'Hesabın açık olduğu sürece verilerin saklanır. Hesabını sildiğinde kendi kartın, kurduğun takımlar ve o takımların kadroları silinir; başkasının takımında bıraktığın kayıtlarda yalnızca seninle bağın kopartılır.',
          'Cihazındaki yerel veriler tarayıcı verilerini temizlediğinde gider.',
        ],
      },
      {
        heading: 'Güvenlik',
        body: [
          'Bağlantı HTTPS ile şifrelenir. Veritabanında satır düzeyinde güvenlik (RLS) kuralları vardır: kendi takımın ve üyesi olduğun takımlar dışındaki kayıtlara erişemezsin.',
          'Şifreler Supabase tarafından özetlenerek (hash) saklanır; uygulama şifreleri hiçbir yere yazmaz.',
        ],
      },
      {
        heading: 'Çocuklar',
        body: ['Hizmet 13 yaşın altındaki kişilere yönelik değildir.'],
      },
      {
        heading: 'İletişim',
        body: [
          `Sorular ve talepler için: ${VERI_SORUMLUSU.eposta}`,
          `Veri sorumlusu: ${VERI_SORUMLUSU.unvan} · ${VERI_SORUMLUSU.adres}`,
        ],
      },
    ],
  },

  kvkk: {
    title: 'KVKK Aydınlatma Metni',
    updated: '22 Eylül 2026',
    intro:
      '6698 sayılı Kişisel Verilerin Korunması Kanunu’nun 10. maddesi uyarınca, kişisel verilerinin işlenmesine ilişkin olarak seni bilgilendiriyoruz.',
    sections: [
      {
        heading: 'Veri sorumlusu',
        body: [`${VERI_SORUMLUSU.unvan}`, `${VERI_SORUMLUSU.adres}`, `${VERI_SORUMLUSU.eposta}`],
      },
      {
        heading: 'İşlenen kişisel veriler',
        body: [
          '- Kimlik ve iletişim: e-posta adresi, görünen ad.',
          '- Kullanıcı işlem verisi: oyuncu kartı bilgileri (boy, kilo, yetenek puanları), takım ve kadro kayıtları, maç kayıtları.',
          '- Görsel veri: isteğe bağlı profil/oyuncu fotoğrafı.',
        ],
      },
      {
        heading: 'İşleme amaçları',
        body: [
          'Üyelik kaydının oluşturulması ve kimlik doğrulama, hizmetin sunulması (kart hesaplama, takım ve kadro yönetimi, kura), hizmetin güvenliğinin sağlanması ve kötüye kullanımın önlenmesi.',
        ],
      },
      {
        heading: 'Hukuki sebep',
        body: [
          'Veriler; KVKK md. 5/2-(c) uyarınca sözleşmenin kurulması ve ifası için gerekli olması, md. 5/2-(f) uyarınca meşru menfaat ve açık rızanın gerektiği hâllerde md. 5/1 uyarınca açık rıza hukuki sebeplerine dayanılarak işlenir.',
        ],
      },
      {
        heading: 'Toplama yöntemi',
        body: [
          'Veriler, uygulamayı kullanırken doldurduğun formlar ve yaptığın işlemler aracılığıyla elektronik ortamda toplanır.',
        ],
      },
      {
        heading: 'Aktarım',
        body: [
          'Veriler, barındırma hizmeti alınan Supabase altyapısında işlenir; bu altyapı yurt dışında bulunabilir. Aktarım KVKK md. 9 kapsamında ve yalnızca hizmetin sunulması amacıyla gerçekleşir.',
        ],
      },
      {
        heading: 'Haklarınız (KVKK md. 11)',
        body: [
          '- Kişisel verinin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme.',
          '- İşlenme amacını ve amaca uygun kullanılıp kullanılmadığını öğrenme.',
          '- Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme.',
          '- Eksik veya yanlış işlenmişse düzeltilmesini isteme.',
          '- Şartları oluştuğunda silinmesini veya yok edilmesini isteme.',
          '- İşlemenin münhasıran otomatik sistemlerle analizi sonucu aleyhine bir sonuç çıkmasına itiraz etme.',
          '- Kanuna aykırı işleme sebebiyle zarara uğraman hâlinde zararın giderilmesini talep etme.',
          `Taleplerini ${VERI_SORUMLUSU.eposta} adresine iletebilirsin. Hesabını uygulama içinden (Hesabım → Hesabı sil) kendin de silebilirsin.`,
        ],
      },
    ],
  },

  cerez: {
    title: 'Çerez Politikası',
    updated: '22 Eylül 2026',
    intro:
      'Evenside klasik anlamda çerez (cookie) kullanmaz; tarayıcının yerel deposunu (localStorage) kullanır. Bu metin hangi verinin tarayıcında tutulduğunu anlatır.',
    sections: [
      {
        heading: 'Zorunlu (her zaman açık)',
        body: [
          '- **Oturum anahtarı** (`sb-…-auth-token`): giriş yaptığında kimliğini taşır. Olmadan uygulama çalışmaz.',
          '- **Kadro ve tercih kayıtları** (`saha42.*`): açık takımın, kadron, maç geçmişin ve tören tercihlerin. Cihazından çıkmaz.',
          '- **Onay kaydı** (`saha42.cerez.v1`): bu ekrandaki seçimini hatırlar.',
        ],
      },
      {
        heading: 'İsteğe bağlı',
        body: [
          'Şu anda analiz, reklam veya takip amaçlı hiçbir çerez/araç KULLANILMIYOR. İleride eklenirse bu ekrandan ayrıca onayın istenecek ve onay vermeden çalıştırılmayacak.',
        ],
      },
      {
        heading: 'Nasıl silersin',
        body: [
          'Tarayıcının ayarlarından site verilerini temizleyerek hepsini silebilirsin. Bu durumda oturumun kapanır ve cihazındaki kadro/geçmiş kayıtları gider.',
        ],
      },
    ],
  },

  kosullar: {
    title: 'Kullanım Koşulları',
    updated: '22 Eylül 2026',
    intro: 'Evenside’ı kullanarak aşağıdaki koşulları kabul etmiş olursun.',
    sections: [
      {
        heading: 'Hizmet',
        body: [
          'Evenside ücretsiz bir web uygulamasıdır: oyuncu kartı çıkarır, takım ve kadro yönetir, iki dengeli takım kurar ve kadro görseli üretir.',
          'Hizmet "olduğu gibi" sunulur; kesintisiz veya hatasız çalışacağı garanti edilmez.',
        ],
      },
      {
        heading: 'Hesabın',
        body: [
          'Hesabının güvenliğinden sen sorumlusun. Şifreni paylaşma; hesabınla yapılan işlemler senin sayılır.',
          'Başkasının adına hesap açamaz, başkasının kartını izinsiz kullanamazsın.',
        ],
      },
      {
        heading: 'İçerik ve davranış',
        body: [
          'Yüklediğin ad, fotoğraf ve takım bilgilerinin hakkına sahip olmalısın. Hakaret, nefret söylemi, müstehcenlik veya başkasının kişisel verisini izinsiz paylaşmak yasaktır.',
          'Kulüp armaları ve formaları üçüncü kaynaklardan gelir; marka hakları sahiplerine aittir.',
        ],
      },
      {
        heading: 'Sorumluluğun sınırı',
        body: [
          'Uygulamanın ürettiği kadro ve kura sonuçları bir öneridir; sahadaki sonuçlardan, anlaşmazlıklardan veya veri kaybından sorumluluk kabul edilmez.',
        ],
      },
      {
        heading: 'Değişiklik ve sona erme',
        body: [
          'Koşullar güncellenebilir; önemli değişiklikler uygulamada duyurulur. Hesabını dilediğin an silebilirsin (Hesabım → Hesabı sil).',
        ],
      },
      { heading: 'İletişim', body: [`${VERI_SORUMLUSU.eposta}`] },
    ],
  },
};

const en: Record<LegalDocId, LegalDoc> = {
  gizlilik: {
    title: 'Privacy Policy',
    updated: '22 September 2026',
    intro:
      'Evenside is a web app for building five-a-side squads. This page explains what data we collect, why, and how long we keep it.',
    sections: [
      {
        heading: 'What we collect',
        body: [
          '- **Account data:** your e-mail address and a hashed form of your password. Passwords are never stored in plain text.',
          '- **Player card data:** name, height, weight, skill ratings and an optional photo. Background removal runs IN YOUR BROWSER; the photo is not uploaded for that step.',
          '- **Team and squad data:** team name, join code, who is in the squad.',
          '- **Data that stays on your device:** match history, active team and ceremony preferences live in your browser’s local storage and are not sent to the server.',
          'We do not collect advertising, location or contact-list data.',
        ],
      },
      {
        heading: 'Why we collect it',
        body: [
          'Data is processed only to provide the service: creating your account, computing your card, managing teams and squads, drawing balanced sides and exporting the line-up image.',
          'We do not sell your data and do not share it for marketing.',
        ],
      },
      {
        heading: 'Who we share it with',
        body: [
          '- **Supabase** — database and authentication hosting.',
          '- **TheSportsDB** — club badges and kits; only the club name you pick is queried, no personal data.',
          '- **images.weserv.nl** — image proxy so club artwork can be drawn into the exported PNG; only the image URL is sent.',
          'We may disclose data where required by law.',
        ],
      },
      {
        heading: 'Retention',
        body: [
          'Data is kept while your account exists. Deleting your account removes your own card, the teams you created and their squads; records left in someone else’s team are unlinked from you.',
          'Local data disappears when you clear your browser storage.',
        ],
      },
      {
        heading: 'Security',
        body: [
          'Traffic is encrypted with HTTPS. The database enforces row-level security: you cannot read records outside your own teams and the teams you belong to.',
          'Passwords are hashed by Supabase; the app never writes them anywhere.',
        ],
      },
      { heading: 'Children', body: ['The service is not directed at children under 13.'] },
      {
        heading: 'Contact',
        body: [`${VERI_SORUMLUSU.eposta}`, `Controller: ${VERI_SORUMLUSU.unvan} · ${VERI_SORUMLUSU.adres}`],
      },
    ],
  },

  kvkk: {
    title: 'Data Protection Notice (GDPR / KVKK)',
    updated: '22 September 2026',
    intro:
      'This notice explains how personal data is processed, in line with the Turkish Data Protection Law (KVKK, art. 10) and the GDPR (art. 13).',
    sections: [
      {
        heading: 'Controller',
        body: [`${VERI_SORUMLUSU.unvan}`, `${VERI_SORUMLUSU.adres}`, `${VERI_SORUMLUSU.eposta}`],
      },
      {
        heading: 'Categories of data',
        body: [
          '- Identity and contact: e-mail address, display name.',
          '- Usage data: player card values (height, weight, skill ratings), teams, squads and match records.',
          '- Image data: optional player photo.',
        ],
      },
      {
        heading: 'Purposes',
        body: ['Account creation and authentication, providing the service, securing it and preventing abuse.'],
      },
      {
        heading: 'Legal basis',
        body: [
          'Performance of a contract (GDPR art. 6(1)(b); KVKK art. 5/2-c), legitimate interests (GDPR art. 6(1)(f); KVKK art. 5/2-f) and, where required, your consent (GDPR art. 6(1)(a); KVKK art. 5/1).',
        ],
      },
      {
        heading: 'Transfers',
        body: [
          'Data is hosted on Supabase infrastructure, which may be located outside your country. Transfers happen only to provide the service.',
        ],
      },
      {
        heading: 'Your rights',
        body: [
          '- Access, rectification and erasure of your data.',
          '- Restriction of and objection to processing.',
          '- Data portability.',
          '- Lodging a complaint with your supervisory authority.',
          `Write to ${VERI_SORUMLUSU.eposta}. You can also delete your account yourself (Account → Delete account).`,
        ],
      },
    ],
  },

  cerez: {
    title: 'Cookie Policy',
    updated: '22 September 2026',
    intro:
      'Evenside does not use classic cookies; it uses your browser’s local storage. This page lists what is stored.',
    sections: [
      {
        heading: 'Strictly necessary (always on)',
        body: [
          '- **Session key** (`sb-…-auth-token`): keeps you signed in. The app cannot work without it.',
          '- **Squad and preference records** (`saha42.*`): active team, squad, match history and ceremony preferences. They never leave your device.',
          '- **Consent record** (`saha42.cerez.v1`): remembers the choice you make in the banner.',
        ],
      },
      {
        heading: 'Optional',
        body: [
          'No analytics, advertising or tracking tools are used today. If any are added, you will be asked here first and nothing will run before you agree.',
        ],
      },
      {
        heading: 'How to delete',
        body: [
          'Clear site data in your browser settings. You will be signed out and local squad/history records will be removed.',
        ],
      },
    ],
  },

  kosullar: {
    title: 'Terms of Use',
    updated: '22 September 2026',
    intro: 'By using Evenside you agree to the terms below.',
    sections: [
      {
        heading: 'The service',
        body: [
          'Evenside is a free web app: it builds player cards, manages teams and squads, splits two balanced sides and exports a line-up image.',
          'The service is provided “as is”; we do not guarantee uninterrupted or error-free operation.',
        ],
      },
      {
        heading: 'Your account',
        body: [
          'You are responsible for your account’s security. Do not share your password; actions taken with your account are considered yours.',
          'Do not create accounts on behalf of others or use someone else’s card without permission.',
        ],
      },
      {
        heading: 'Content and conduct',
        body: [
          'You must hold the rights to the names, photos and team details you upload. Insults, hate speech, obscenity and sharing someone else’s personal data without consent are prohibited.',
          'Club badges and kits come from third-party sources; trademarks belong to their owners.',
        ],
      },
      {
        heading: 'Limitation of liability',
        body: [
          'Squad and draw results are suggestions. We accept no liability for outcomes on the pitch, disputes or data loss.',
        ],
      },
      {
        heading: 'Changes and termination',
        body: [
          'These terms may be updated; significant changes are announced in the app. You may delete your account at any time (Account → Delete account).',
        ],
      },
      { heading: 'Contact', body: [`${VERI_SORUMLUSU.eposta}`] },
    ],
  },
};

/**
 * Dile göre belgeler; eksik dil İngilizceye, o da yoksa Türkçeye düşer.
 * Almanca/Fransızca/İspanyolca/Arapça ayrı dosyada (`legal-docs-extra.ts`).
 */
export const LEGAL_DOCS: Record<string, Record<LegalDocId, LegalDoc>> = { tr, en, ...EXTRA_LEGAL_DOCS };

export function legalDoc(locale: string, id: LegalDocId): LegalDoc {
  return LEGAL_DOCS[locale]?.[id] ?? LEGAL_DOCS['en'][id] ?? LEGAL_DOCS['tr'][id];
}
