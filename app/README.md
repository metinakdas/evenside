# Evenside — Halı Saha Kadro Kurma

Halı saha (4v4 – 11v11) maçları için kadro kurma, iki takıma dengeli kura çekme ve
EA FC tarzı "walkout" açılış töreniyle oyuncuları tanıtma uygulaması. Angular 22
(standalone API, signals) ile yazıldı; harici UI kütüphanesi kullanılmadı.

Canlı: https://evenside.pages.dev

## Kurulum

```bash
npm install
```

Ayrıca bir Supabase projesi gerekir (kayıtlı oyuncu havuzu + giriş için):

1. [supabase.com](https://supabase.com)'da proje oluşturun.
2. **SQL Editor**'e `supabase/schema.sql` dosyasının içeriğini yapıştırıp çalıştırın
   (`players` tablosu + RLS politikaları + realtime aboneliği kurulur).
3. **Project Settings → API**'den Project URL ve Publishable key'i alıp
   `src/environments/environment.ts`'e yazın (zaten örnek değerlerle dolu — kendi
   projenizinkiyle değiştirin).
4. **Authentication → Providers**'da Email sağlayıcısının açık olduğunu doğrulayın
   (varsayılan olarak açıktır, e-posta onayı da varsayılan olarak zorunludur).

## Çalıştırma

```bash
npx ng serve
```

Uygulama `http://localhost:4200` adresinde açılır. Giriş yapılmamışsa `/giris`'e
yönlendirilir (kayıt ol / giriş yap); e-posta onayı zorunlu olduğu için yeni bir hesapla
kayıt olunca gelen onay bağlantısına tıklamadan giriş yapılamaz. Giriş sonrası `/kadro` ile
başlar; kadro tamamlanınca `/kura` (kura töreni), oradan `/saha` (saha görünümü + reyting
tablosu) açılır.

## Test

```bash
npx ng test --watch=false --browsers=ChromeHeadless
```

`core/services/` altındaki tüm iş mantığı (reyting hesaplama, takım dengeleme, saha
yerleştirme, kura sekans motoru, kalıcılık) birim testleriyle kaplanmıştır.

## Derleme

```bash
npx ng build
```

Çıktı `dist/app` altına yazılır (gitignore'da).

## Mimari

```
src/app/
  core/
    models/       Player, TeamInfo, DrawResult, PitchSlot, RatingTableRow — tip tanımları
    constants/     tier-colors.ts — kart renk durakları (CSS ve canvas render'ı aynı kaynaktan besler)
    supabase/      supabase-client.ts — tek Supabase istemcisi (environment'tan URL/key okur)
    services/      RatingService, BalancerService, PitchService, SequenceService,
                    AuthService, PlayerRepositoryService, SquadStore,
                    StorageService, ImageService, PitchExportService
    guards/        authGuard/guestGuard (giriş şart), squadCompleteGuard (kadro tamam şart)
  shared/
    components/    PlayerCardComponent, TeamBadgeComponent, StatSliderComponent,
                    AppButtonComponent, PitchComponent, RatingTableComponent,
                    ErrorBannerComponent, UserMenuComponent
  features/
    auth/login/     Giriş / kayıt ekranı
    squad-builder/  Kadro kurma ekranı (maç ayarları, oyuncu formu, kadro listesi + havuzdan ekleme)
    draw-ceremony/  Kura töreni (SequenceService'in fazlarını görüntüler)
    pitch-view/     Saha görünümü + reyting tablosu
  styles/           _tokens.scss, _typography.scss, _animations.scss, _mixins.scss
supabase/
  schema.sql        players tablosu + RLS politikaları + realtime aboneliği (SQL Editor'e yapıştırılır)
```

**Oyuncu havuzu ve kadrolar arasındaki ilişki — bu, "referans" mimarisidir, kopya değil:**
Oyuncunun kendisi (`PlayerInput` + ondan hesaplanan reytingler) artık yalnızca Supabase'teki
`players` tablosunda yaşar; bunu `PlayerRepositoryService` çeker, canlı tutar (Supabase
Realtime ile — başka bir oturumda yapılan değişiklik de anında yansır) ve id'den `Player`'a
eşleyen bir harita olarak sinyalde tutar. `SquadStore` artık tam `Player` nesneleri değil,
sadece `squadPlayerIds: string[]` (bu kadroda hangi havuz oyuncularının olduğu) tutar ve
`localStorage`'a onu yazar; `SquadStore.players` bu id'leri her okunduğunda havuzdan canlı
çözen bir `computed`'tır. Sonuç: bir oyuncuyu (kim düzenlerse düzensin, nereden) güncellemek
onu kullanan **her** kadroya anında yansır — kadro listesindeki × butonu havuzdaki kaydı
silmez, sadece o kadrodan bağlantıyı kaldırır.

Durum yönetimi sinyal tabanlı servislerde yaşar (`SquadStore`, `PlayerRepositoryService`,
`AuthService`); bileşenler bunları doğrudan enjekte edip sinyalleri template'te okur — ayrı
bir NgRx/RxJS state katmanı yok.

### Reyting formülü (`RatingService`)

```
BMI = kilo / (boy/100)²
biçim  = BMI>28 ? -7 : BMI>25 ? -3 : BMI<18 ? -2 : 0
sigara = içiyorsa -6, değilse 0

HIZ = hız×9.4 + biçim + sigara + 6
ŞUT = forvet×8.8 + golOrtalaması×4.2 + 8
PAS = ortaSaha×9.2 + 7
DRİ = (ortaSaha×0.55 + forvet×0.45)×9.3 + 8
DEF = defans×9.5 + 6
FİZ = dayanıklılık×8.6 + biçim + sigara + (boy-170)×0.25 + 12
KAL = kaleci×9.2 + (boy-170)×0.35 + 8   (gizli, sadece mevki/kaleci seçiminde)

Tümü 1–99'a sıkıştırılır. Mevki kompozitleri (KAL/DEF/OS/FOR ağırlıklı toplamlar)
hesaplanır; en yüksek olan oyuncunun mevkisi ve genel reytingi olur.
Tier: 85+ özel · 75+ altın · 65+ gümüş · altı bronz.
```

Ham girdi (`PlayerInput`) hep saklanır; reytingler her zaman ondan yeniden hesaplanır —
bir oyuncu düzenlendiğinde veri kaybı olmaz.

### Takım dengeleme (`BalancerService`)

60 rastgele başlangıç bölüşümü kurulur, her biri ikili değiş-tokuşla (tepe tırmanma)
yerel olarak iyileştirilir, en düşük maliyetli sonuç seçilir:

```
maliyet = |toplamReytingFarkı|×1.0 + |enİyiKaleciFarkı|×0.7
        + |defansOrtalamaFarkı|×0.5 + |şutOrtalamaFarkı|×0.5 + |hızOrtalamaFarkı|×0.3
```

`seed` verilirse sonuç tekrarlanabilir (mulberry32 PRNG). Kura sonucu "Kuraya geç"te bir
kez hesaplanır ve sabittir — tören sadece onu açıklar.

### Saha yerleştirme (`PitchService`)

Her takımda en yüksek `goalkeeping` puanlı oyuncu kaleye yerleşir (mevkisi kaleci
olmasa bile), kalanlar kendi mevkisine reyting sırasıyla, mevki dolmuşsa en yakın boş
hatta kayar (rozet turuncuya döner). Uyum çizgileri komşu hatlardaki dolu yuvalar arasında
çizilir.

### Oyuncu havuzu ve giriş (`AuthService`, `PlayerRepositoryService`)

Kimlik doğrulama Supabase Auth (e-posta + şifre) ile yapılır. `players` tablosunda RLS
"güvenilir arkadaş grubu" modeliyle kurulu: giriş yapmış herkes tüm havuzu okur/yazar/siler
— kişiye özel gizlilik yok, kasıtlı bir basitlik kararı (bkz. `supabase/schema.sql`).
Kadro kurma ekranındaki "+ Kayıtlı oyuncu ekle" paneli havuzdan isimle arayıp tek tıkla
mevcut kadroya ekler (yeni kayıt oluşturmaz); "Kart" sekmesindeki form da her zaman havuza
yazar — yeni oyuncu için `insert`, düzenlenen oyuncu için `update`.

## Bilinen sınırlar

- **PNG dışa aktarma** (`PitchExportService`) saha + kartları doğrudan Canvas 2D API'siyle
  çizer; `PlayerCardComponent`'in tam DOM/CSS temsili değil, sade bir özetidir (foto/bayrak
  görselleri şu an dahil edilmiyor, sadece reyting/isim/mevki). Gerçek bir Chrome'da
  `<a download>` + blob URL standart şekilde çalışır; headless/otomasyon ortamlarında
  indirmenin son adımı araca özgü nedenlerle iptal görünebilir (uygulama tarafında hata yok
  — canvas çıktısı doğrulanmıştır).
- **Görsel sıkıştırma** (`ImageService`) WebP'yi tercih eder, desteklenmeyen tarayıcılarda
  JPEG'e düşer; her ikisi de yoksa (çok eski tarayıcı) orijinal boyutlu data URL kalır.
- **Reyting tablosu** kadro kurma ekranında kura oynanmadan önce gösterildiğinde TAKIM
  sütunu boştur (`—`) — oyuncular henüz bir tarafa atanmamıştır, bu beklenen davranıştır.
- Kura sonucu (`SquadStore.drawResult`) `localStorage`'a yazılmaz; `/saha`'ya doğrudan
  sayfa yenilemeyle girilirse dengeleme sessizce yeniden hesaplanır (aynı oyuncularla,
  farklı rastgele tur sırasıyla — sonuç kalitesi aynı, dağılım birebir aynı olmayabilir).
- Uygulama artık ağ + oturum gerektiriyor — oyuncu havuzu olmadan (Supabase erişilemezse)
  kadro kurma ekranı açılır ama oyuncu ekleme/listeleme başarısız olur; `PlayerRepositoryService`
  hataları `error` sinyaline yazar, arayüze henüz bağlanmadı (sadece konsola/log'a düşer).
- `players` tablosunda kişiye özel gizlilik/sahiplik yok — giriş yapan herkes tüm havuzu
  görür ve düzenler ("güvenilir arkadaş grubu" varsayımı, bkz. yukarı). Daha büyük/güvensiz
  bir kullanıcı kümesi için RLS politikaları `created_by`'a göre daraltılmalı.
- Yeni kayıt olan bir kullanıcı e-postasındaki onay bağlantısına tıklamadan giriş yapamaz
  (Supabase projesinin varsayılan ayarı) — bu akış manuel test gerektirir, otomatikleştirilemedi.

## Gelecek fikirler

- PNG dışa aktarmaya oyuncu fotoğraflarını/bayrakları da dahil etmek (foreignObject veya
  görselleri ayrı ayrı `drawImage` ile bindirerek).
- Kura sonucunu da `localStorage`'a yazıp `/saha` yenilemesinde birebir aynı diziliş.
- Çoklu dil desteği (şu an arayüz metinleri sabit Türkçe).
