import { Injectable, computed, signal } from '@angular/core';
import { AuthError, Session } from '@supabase/supabase-js';
import { supabase } from '../supabase/supabase-client';
import { environment } from '../../../environments/environment';
import { mesaj } from './i18n.service';

/* Değerler SÖZLÜK ANAHTARIDIR; metin çalışma anında seçili dile göre çözülür. */
/* Değerler SÖZLÜK ANAHTARIDIR; metin çalışma anında seçili dile göre çözülür. */
const ERROR_MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'mesaj.girisHatali',
  'User already registered': 'mesaj.epostaKayitli',
  'Email not confirmed': 'mesaj.epostaOnay',
  'Password should be at least 6 characters': 'mesaj.sifre6',
  'Password should be at least 8 characters': 'mesaj.sifre8',
};

/*
 * Supabase parola KURALLARINI uzun ve İngilizce anlatıyor; kullanıcıya ham hâliyle
 * "Password should contain at least one character of each: abcdefg… , 0123456789" diye
 * çıkıyordu (kullanıcı bildirdi). Mesaj sabit değil (panelde seçilen kurala göre değişiyor),
 * bu yüzden sözlük değil KALIP eşlemesi gerekiyor.
 */
const ERROR_PATTERNS: { test: RegExp; anahtar: string }[] = [
  {
    test: /Password should contain at least one character of each/i,
    anahtar: 'mesaj.sifreKural',
  },
  { test: /Password should be at least (d+) characters/i, anahtar: 'mesaj.sifreEnAz' },
  { test: /weak.?password/i, anahtar: 'mesaj.sifreZayif' },
  { test: /rate limit|too many requests/i, anahtar: 'mesaj.cokDeneme' },
];

/** Sunucuya hiç ulaşılamadı mı (ağ yok, DNS yok, sunucu kapalı)? */
export function isConnectionError(error: AuthError): boolean {
  return error.name === 'AuthRetryableFetchError' || error.status === 0 || /fetch|network/i.test(error.message);
}

function translateAuthError(error: AuthError): string {
  if (isConnectionError(error)) return mesaj('mesaj.sunucuYok');
  const bilinen = ERROR_MESSAGES[error.message];
  if (bilinen) return mesaj(bilinen);
  for (const { test, anahtar } of ERROR_PATTERNS) {
    const eslesme = error.message.match(test);
    if (eslesme) return mesaj(anahtar, { n: eslesme[1] ?? '' });
  }
  /*
   * Tanımadığımız hata: kullanıcıya SUNUCUNUN metni gösterilmez.
   *
   * Ham metin iki türlü zarar veriyordu: (a) İngilizce ve teknik olduğu için kullanıcıya
   * hiçbir şey anlatmıyor ("Password should contain at least one character of each: abcdefg…"),
   * (b) sunucunun iç yapısını (tablo/politika/fonksiyon adları) dışarı sızdırıyor. Teknik
   * ayrıntı yalnızca geliştirici konsoluna yazılır.
   */
  console.warn('Evenside · auth hatası:', error.message);
  return mesaj('mesaj.genelHata');
}

/**
 * Supabase Auth'un ince bir sarmalayıcısı. Oturum durumu `session` sinyalinde tutulur;
 * `ready` promise'i ilk oturum kontrolü tamamlanana kadar (localStorage'dan geri yükleme
 * dahil) guard'ların beklemesi için var — aksi halde sayfa yenilemede yanlışlıkla
 * /giris'e atılabilir.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly session = signal<Session | null>(null);
  readonly error = signal<string | null>(null);
  readonly user = computed(() => this.session()?.user ?? null);
  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly ready: Promise<void>;
  /**
   * Az önce (bu tarayıcı oturumunda, şimdi) giriş yapıldığını işaretler — sayfa
   * yenilemede zaten var olan bir oturumun geri yüklenmesinden ('INITIAL_SESSION')
   * giriş karşılama videosunu sadece bu true olduğunda oynatır.
   */
  /** Kullanıcının kendi bastığı çıkış mı — kendiliğinden düşen oturumdan ayırmak için. */
  private signingOut = false;

  constructor() {
    this.ready = supabase.auth.getSession().then(({ data }) => {
      this.session.set(data.session);
    });
    supabase.auth.onAuthStateChange((event, session) => {
      this.session.set(session);
      // Oturum kendiliğinden düştüyse (token süresi doldu, yenileme başarısız) kullanıcı
      // sebebini görsün: QA denetiminde sayfa /giris'e atıldı ve ekranda hiçbir açıklama
      // yoktu, kullanıcı uygulamayı bozuk sandı.
      if (event === 'TOKEN_REFRESHED') this.error.set(null);
      if (event === 'SIGNED_OUT' && !this.signingOut) {
        this.error.set(mesaj('mesaj.oturumDoldu'));
      }
    });

    this.watchOtherTabs();
  }

  /**
   * SEKMELER ARASI EŞİTLEME.
   *
   * Ölçüldü: iki sekme açıkken birinde "Çıkış"a basmak diğerini ETKİLEMİYORDU — ikinci
   * sekme menüde kalıyor, kadro ekranda duruyor ve bellekteki oturumla istek atmaya devam
   * ediyordu (erişim jetonu süresi dolana kadar, en fazla 60 dk). Paylaşılan bir
   * bilgisayarda "çıkış yaptım" demek bunu kapatmıyordu.
   *
   * supabase-js oturumu `localStorage`'ta tutar ama sekmeleri KENDİ BAŞINA eşitlemez.
   * `storage` olayı yalnızca DİĞER sekmelerde tetiklenir (kendi yazdığın değişiklikte
   * gelmez), yani bu dinleyici tam olarak "başka sekmede bir şey oldu" demektir.
   *
   * Tepki TAM YENİLEME: yalnızca sinyali sıfırlamak yetmez — ekrandaki kadro, havuz ve
   * geçmiş hâlâ önceki kullanıcının verisiyle duruyor olurdu. Yeniden yükleme uygulamayı
   * sıfırdan, doğru kimlikle kurar.
   */
  private watchOtherTabs(): void {
    if (typeof window === 'undefined') return;
    const ref = new URL(environment.supabaseUrl).hostname.split('.')[0];
    const anahtar = `sb-${ref}-auth-token`;

    window.addEventListener('storage', (event) => {
      if (event.key !== anahtar) return;

      // Başka sekme ÇIKIŞ yaptı.
      if (!event.newValue) {
        if (!this.session()) return; // zaten oturumsuzuz
        window.location.assign('/login');
        return;
      }

      // Başka sekme BAŞKA BİR HESAPLA giriş yaptı — bu sekme eski kimliği göstermeye devam etmemeli.
      try {
        const yeni = JSON.parse(event.newValue) as { user?: { id?: string } };
        const suan = this.session()?.user?.id;
        if (yeni.user?.id && suan && yeni.user.id !== suan) window.location.reload();
      } catch {
        /* Bozuk değer: karar vermiyoruz, oturum yenilemede zaten düşer. */
      }
    });
  }

  /**
   * Son giriş denemesi gerçekten "e-posta/şifre hatalı" yanıtı mı aldı? Giriş ekranının deneme
   * kilidi YALNIZCA bunları sayar: bağlantı hatası da sayılıyordu ve interneti kopan kullanıcı
   * şifresi doğru olsa bile 30 saniye kilitleniyordu (QA 9 Ekim 2026).
   */
  lastSignInWrongCredentials = false;

  async signIn(email: string, password: string): Promise<boolean> {
    this.error.set(null);
    this.lastSignInWrongCredentials = false;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      this.lastSignInWrongCredentials = !isConnectionError(error) && (error.status === 400 || error.code === 'invalid_credentials');
      this.error.set(translateAuthError(error));
      return false;
    }
    return true;
  }

  async signUp(email: string, password: string): Promise<boolean> {
    this.error.set(null);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      this.error.set(translateAuthError(error));
      return false;
    }
    return true;
  }

  /**
   * Şifre sıfırlama bağlantısı gönderir. Supabase güvenlik gereği e-posta kayıtlı
   * olmasa da hata döndürmez (hesap sayımını engellemek için) — arayüz de bu yüzden
   * her durumda aynı nötr mesajı gösterir.
   */
  async sendPasswordReset(email: string): Promise<boolean> {
    this.error.set(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    if (error) {
      this.error.set(translateAuthError(error));
      return false;
    }
    return true;
  }

  async signOut(): Promise<void> {
    this.signingOut = true;
    this.error.set(null);
    try {
      /*
       * scope: 'global' — oturum YALNIZCA bu tarayıcıda değil SUNUCUDA da kapatılır ve
       * kullanıcının bütün cihazlardaki yenileme jetonları geçersiz kılınır. Varsayılan
       * davranışa güvenmek yerine açıkça yazılıyor: 'local' seçilse jeton sunucuda canlı
       * kalır ve çalınmış bir yenileme jetonu çıkıştan sonra da çalışırdı.
       */
      await supabase.auth.signOut({ scope: 'global' });
    } finally {
      this.signingOut = false;
    }
  }

  /**
   * Şifre değiştirir. Önce MEVCUT şifre doğrulanır — Supabase bunu istemiyor ama açık
   * bırakılmış bir cihazın başına geçen biri tek tıkla şifreyi değiştirip hesabı ele
   * geçirebilirdi. Doğrulama, aynı e-postayla sessiz bir giriş denemesiyle yapılıyor.
   */
  async updatePassword(currentPassword: string, nextPassword: string): Promise<boolean> {
    this.error.set(null);
    const email = this.user()?.email;
    if (!email) {
      this.error.set(mesaj('mesaj.oturumYok'));
      return false;
    }

    const { error: checkError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (checkError) {
      this.error.set(mesaj('mesaj.mevcutSifreYanlis'));
      return false;
    }

    const { error } = await supabase.auth.updateUser({ password: nextPassword });
    if (error) {
      this.error.set(translateAuthError(error));
      return false;
    }
    return true;
  }

  /**
   * Hesabı ve verisini siler. İş SUNUCUDA yapılır (`delete_my_account`): auth kaydını
   * silmek service_role ister ve o anahtar tarayıcıya konulamaz — konulsaydı siteyi açan
   * herkes herkesin hesabını silebilirdi. Fonksiyon yalnızca çağıranın kendi hesabına
   * dokunur (bkz. supabase/hesap-silme.sql).
   */
  async deleteAccount(): Promise<boolean> {
    this.error.set(null);
    const { error } = await supabase.rpc('delete_my_account');
    if (error) {
      this.error.set(
        error.code === 'PGRST202'
          ? mesaj('mesaj.sunucuGuncellemesi')
          : mesaj('mesaj.hesapSilinemedi'),
      );
      return false;
    }
    await this.signOut();
    return true;
  }

  /** Google/X gibi sağlayıcının kendi giriş sayfasına yönlendirir; dönüşte oturum otomatik kurulur. */
  /**
   * Supabase'de AÇIK olan sosyal giriş sağlayıcıları (null = henüz bilinmiyor). 12 Ekim 2026:
   * Google/X düğmeleri koşulsuz gösteriliyordu; sağlayıcı panelde açılmamışken basan ziyaretçi
   * Supabase'in ham "Unsupported provider: provider is not enabled" sayfasına düşüyordu.
   * Herkese açık `/auth/v1/settings` ucundan okunur; panelde açılınca düğme kendiliğinden gelir.
   * Okunamazsa (ağ) düğmeler gösterilmez — çalışmayan düğme göstermekten iyidir.
   */
  readonly oauthProviders = signal<{ google: boolean; twitter: boolean } | null>(null);
  private oauthYuklendi = false;

  async loadOAuthProviders(): Promise<void> {
    if (this.oauthYuklendi) return;
    this.oauthYuklendi = true;
    try {
      const r = await fetch(`${environment.supabaseUrl}/auth/v1/settings`, { headers: { apikey: environment.supabaseKey } });
      const j = (await r.json()) as { external?: Record<string, boolean> };
      this.oauthProviders.set({ google: !!j.external?.['google'], twitter: !!j.external?.['twitter'] });
    } catch {
      this.oauthProviders.set({ google: false, twitter: false });
      this.oauthYuklendi = false; // bir sonraki açılışta yeniden dener
    }
  }

  async signInWithOAuth(provider: 'google' | 'twitter'): Promise<void> {
    this.error.set(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) this.error.set(translateAuthError(error));
  }
}
