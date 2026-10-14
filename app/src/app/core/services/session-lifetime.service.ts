import { Injectable, NgZone, effect, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { mesaj } from './i18n.service';

/**
 * Hareketsizlik sınırı: bu süre boyunca hiç dokunulmamışsa oturum kapanır.
 * Hafta bir maç yapan bir kullanıcı için 7 gün rahat; paylaşılan bir bilgisayarda
 * unutulmuş oturumu da sonsuza kadar açık bırakmaz.
 */
export const INACTIVITY_LIMIT_MS = 7 * 24 * 60 * 60 * 1000;

/** Mutlak üst sınır: hiç ara vermeden kullanılsa bile oturum bu kadar yaşar. */
export const MAX_SESSION_MS = 30 * 24 * 60 * 60 * 1000;

/** Etkinlik damgası en fazla bu sıklıkta yazılır — her tıklamada localStorage'a yazmayalım. */
const WRITE_THROTTLE_MS = 60 * 1000;

/** Süre dolmuş mu? Saf karar — testler bunu ölçüyor. */
export function sessionExpired(
  now: number,
  lastActivity: number | null,
  startedAt: number | null,
): 'inactivity' | 'max-age' | null {
  if (lastActivity !== null && now - lastActivity > INACTIVITY_LIMIT_MS) return 'inactivity';
  if (startedAt !== null && now - startedAt > MAX_SESSION_MS) return 'max-age';
  return null;
}

/**
 * OTURUM ÖMRÜ — sunucu ayarının İSTEMCİ KARŞILIĞI.
 *
 * Supabase'in "Time-box user sessions" ve "Inactivity timeout" ayarları **Pro planında**
 * (ölçüldü: panelde kilitli). Ücretsiz planda oturum SÜRESİZ yaşıyor — yenileme jetonu her
 * kullanımda döndüğü için kullanıcı bir daha hiç giriş ekranı görmüyor. Paylaşılan bir
 * bilgisayarda bu, "çıkış yapmayı unuttum" demenin bedelinin sonsuz olması demek.
 *
 * Bu servis aynı işi tarayıcıda yapar: son etkinlik ve oturum başlangıcı kullanıcıya özel
 * saklanır; sınır aşılmışsa oturum kapatılır ve kullanıcıya SEBEBİ söylenir.
 *
 * **Sınırı açıkça bilin:** bu yalnızca TARAYICIYI bağlar. Elinde geçerli bir jeton olan biri
 * API'ye doğrudan istek atmaya devam edebilir (jeton ömrü kadar). Gerçek çözüm Pro'daki
 * sunucu ayarıdır; bu, o gelene kadar kullanılan pratik katman.
 */
@Injectable({ providedIn: 'root' })
export class SessionLifetimeService {
  private readonly auth = inject(AuthService);
  private readonly zone = inject(NgZone);
  private lastWrite = 0;
  private started = false;

  constructor() {
    /*
     * Oturum GELDİĞİNDE başlar, gittiğinde damgalar silinir. `effect` ile bağlanıyor çünkü
     * oturum sayfa açılışında localStorage'dan geç gelir; kurucuda okumak "oturum yok"
     * sonucunu verirdi (projede iki kez ısıran tuzak).
     */
    effect(() => {
      const kullanici = this.auth.user();
      if (!kullanici) {
        this.started = false;
        return;
      }
      if (this.started) return;
      this.started = true;
      this.begin(kullanici.id);
    });
  }

  private key(base: string, userId: string): string {
    return `saha42.session.${base}::${userId}`;
  }

  private begin(userId: string): void {
    const now = Date.now();
    const sonEtkinlik = this.read(this.key('activity.v1', userId));
    const baslangic = this.read(this.key('start.v1', userId));

    const sebep = sessionExpired(now, sonEtkinlik, baslangic);
    if (sebep) {
      void this.expire(sebep, userId);
      return;
    }

    if (baslangic === null) this.write(this.key('start.v1', userId), now);
    this.write(this.key('activity.v1', userId), now);

    if (typeof window === 'undefined') return;

    /* Etkinlik damgası: gerçek kullanıcı hareketleri. Kısma ile en fazla dakikada bir yazılır. */
    const dokun = () => {
      const now2 = Date.now();
      if (now2 - this.lastWrite < WRITE_THROTTLE_MS) return;
      this.lastWrite = now2;
      this.write(this.key('activity.v1', userId), now2);
    };
    for (const olay of ['pointerdown', 'keydown', 'visibilitychange'] as const) {
      window.addEventListener(olay, dokun, { passive: true });
    }

    /*
     * Periyodik kontrol: sekme açık unutulduysa da sınır işlesin. Zamanlayıcı Angular
     * bölgesinin DIŞINDA — bölge içinde açılan uzun zamanlayıcı uygulamayı "kararsız"
     * tutar ve `whenStable` bekleyen testleri kilitler (projede iki kez yaşandı).
     */
    this.zone.runOutsideAngular(() => {
      setInterval(
        () => {
          const sebep2 = sessionExpired(
            Date.now(),
            this.read(this.key('activity.v1', userId)),
            this.read(this.key('start.v1', userId)),
          );
          if (sebep2) void this.expire(sebep2, userId);
        },
        5 * 60 * 1000,
      );
    });
  }

  private async expire(sebep: 'inactivity' | 'max-age', userId: string): Promise<void> {
    this.clear(userId);
    await this.auth.signOut();
    this.auth.error.set(
      sebep === 'inactivity'
        ? mesaj('mesaj.hareketsizCikis')
        : mesaj('mesaj.oturumSiniri'),
    );
    /*
     * TAM YENİLEME: yalnızca oturumu düşürmek ekrandaki kadro/havuz/geçmişi bırakır.
     * Uygulamanın sıfırdan kurulması hem doğru ekranı hem temiz durumu garanti eder.
     */
    this.navigateToLogin();
  }

  /*
   * Yönlendirme AYRI bir metotta: birim testi bunu geçersiz kılabilsin.
   * Gerçek location.assign test içinde çağrılırsa Karma sayfası gider, tüm koşu çöker.
   */
  protected navigateToLogin(): void {
    if (typeof window !== 'undefined') window.location.assign('/login');
  }

  private read(key: string): number | null {
    try {
      const ham = localStorage.getItem(key);
      const sayi = ham ? Number(ham) : NaN;
      return Number.isFinite(sayi) ? sayi : null;
    } catch {
      return null; // Depo kapalıysa sınır uygulanmaz; akışı kırmaktan iyidir.
    }
  }

  private write(key: string, value: number): void {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      /* Depo kapalı: sessizce geç. */
    }
  }

  private clear(userId: string): void {
    try {
      localStorage.removeItem(this.key('activity.v1', userId));
      localStorage.removeItem(this.key('start.v1', userId));
    } catch {
      /* boş */
    }
  }
}
