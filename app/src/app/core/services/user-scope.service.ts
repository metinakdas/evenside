import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';

/** Kullanıcıya bağlanan yerel depo anahtarlarının tabanları — tek yerde dursun. */
export const SCOPED_KEYS = [
  'saha42.squad.v2',
  'saha42.history.v1',
  'saha42.activeTeam.v1',
  'saha42.cardmatch.v1',
  'saha42.onboarding.v1',
  'saha42.match.v1',
] as const;

/** Onarımın bu kullanıcı için bir kez çalıştığını işaretler. */
const REPAIR_FLAG = 'saha42.scope.repaired.v1';

/**
 * YEREL DEPO KULLANICIYA AİTTİR.
 *
 * `localStorage` cihaz başınadır; uygulamanın verisi ise kişiye. Aynı tarayıcıda ikinci bir
 * hesapla giren kullanıcı, öncekinin kadrosunu, maç geçmişini ve "bir daha gösterme"
 * tercihini devralıyordu — yeni hesapta "Sıradaki maç" kutusu doluydu ve karşılama daveti
 * hiç çıkmıyordu (kullanıcı geri bildirimi).
 *
 * Çözüm: veri anahtarları kullanıcı kimliğiyle son ekleniyor (`saha42.history.v1::<uid>`).
 * Oturum yokken taban anahtar kullanılır (giriş öncesi yazılan tek şey karşılama tercihi).
 *
 * TERCİHLER kapsam dışıdır (tören hızı gibi): onlar cihazın davranışı, kişinin verisi değil.
 *
 * **Eski (kimliksiz) veri TAŞINMAZ.** Bir tur "giriş yapan ilk kullanıcıya devret" denendi ve
 * yanlış çıktı: cihazdaki veri kime ait bilinmiyor, devir yeni açılan hesaba yapılabiliyordu
 * (kullanıcı: "düzeltmedi ki" — yeni hesapta hâlâ eski maç görünüyordu). Artık kimliksiz
 * anahtarlar yok sayılır; kimsenin verisi kimseye geçmez.
 */
@Injectable({ providedIn: 'root' })
export class UserScopeService {
  private readonly auth = inject(AuthService);

  /** Oturumdaki kullanıcı kimliği; oturum yoksa null. Anahtarlar buna bağlı. */
  readonly userId = computed(() => this.auth.user()?.id ?? null);

  /**
   * Depo dışarıdan değiştiğinde (onarım) artan sayaç. Yerel veriyi okuyan effect'ler bunu da
   * okur; böylece temizlikten sonra hiçbir ekran bayat veriyle kalmaz.
   */
  readonly revision = signal(0);

  /**
   * Verilen tabandan bu kullanıcıya ait anahtarı üretir. Kimlik yoksa taban anahtar döner:
   * giriş ekranında yazılan tek şey karşılama tercihi ve o zaten cihaza ait.
   */
  key(base: string): string {
    const id = this.userId();
    return id ? `${base}::${id}` : base;
  }

  /**
   * DEVRALINMIŞ VERİYİ TEMİZLER — kullanıcı başına bir kez.
   *
   * Kapsamlandırmadan önceki sürüm, cihazdaki kimliksiz veriyi giriş yapan ilk hesaba
   * taşımıştı; o hesap yeni açılmış olabiliyor ve başkasının maç geçmişini/kadrosunu
   * devralıyordu. Sunucuda HİÇ takımı olmayan bir hesabın yerel kadrosu ve maç geçmişi
   * olamaz (geçmişe düşmek için önce takım, sonra kadro, sonra maç gerekir) — böyle bir
   * durumda yereldeki veri devralınmış demektir ve siliniyor.
   *
   * `hasTeams` sunucudan gelir; yükleme bitmeden ÇAĞIRMAYIN, yoksa gerçek veriyi siler.
   */
  repairInheritedData(hasTeams: boolean): void {
    const id = this.userId();
    if (!id) return;
    const flag = `${REPAIR_FLAG}::${id}`;
    try {
      if (localStorage.getItem(flag) === '1') return;
      localStorage.setItem(flag, '1');
      if (hasTeams) return; // Kendi takımı var: veri onun, dokunulmaz.

      let removed = 0;
      for (const key of Object.keys(localStorage)) {
        if (!key.endsWith(`::${id}`)) continue;
        // Tercihler kalsın; yalnızca VERİ temizlenir.
        if (key.startsWith(REPAIR_FLAG)) continue;
        if (key.startsWith('saha42.squad.v2') || key.startsWith('saha42.history.v1') ||
            key.startsWith('saha42.activeTeam.v1') || key.startsWith('saha42.match.v1') ||
            key.startsWith('saha42.cardmatch.v1') || key.startsWith('saha42.onboarding.v1')) {
          localStorage.removeItem(key);
          removed++;
        }
      }
      if (removed) this.revision.update((v) => v + 1);
    } catch {
      // Depo kapalıysa onarım da yapılamaz; uygulama yine çalışır.
    }
  }
}
