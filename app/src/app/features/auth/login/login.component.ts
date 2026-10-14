import { ChangeDetectionStrategy, Component, NgZone, computed, inject, signal } from '@angular/core';

/** Google ile giriş düğmesi. Supabase'deki Google ayarı düzelince true yapın. */
const GOOGLE_GIRIS_ACIK = false;
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { I18nService } from '../../../core/services/i18n.service';
import { AUTH_DICTIONARIES } from '../../../core/i18n/auth-dictionary';

type AuthMode = 'signin' | 'signup';

/** Türkçe harfler dahil. */
/*
 * GİRİŞ DENEME KİLİDİ.
 *
 * Ölçüldü: 12 yanlış parola denemesi 2.9 saniyede geçti, sunucu hiç engellemedi. Asıl
 * sınırlama sunucuda olmalı (Supabase → Authentication → Rate Limits) ama istemci tarafı da
 * boş durmamalı: art arda başarısız denemeden sonra form KİLİTLENİR ve geri sayım gösterilir.
 * Bu, tarayıcıdan yapılan kaba kuvveti yavaşlatır; API'ye doğrudan atılan isteği bağlamaz —
 * o yüzden panel ayarı da şart (bkz. GUVENLIK-YAPILACAKLAR.md).
 */
const MAX_DENEME = 5;
const KILIT_SANIYE = 30;

const HARF = /[A-Za-zÇĞİıÖŞÜçğöşü]/;
const RAKAM = /[0-9]/;

@Component({
    selector: 'app-login',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink],
    templateUrl: './login.component.html',
    styleUrl: './login.component.scss'
})
export class LoginComponent {
  constructor() {
    void this.auth.loadOAuthProviders();
    this.i18n.register(AUTH_DICTIONARIES);
  }

  private readonly i18n = inject(I18nService);
  /** Çeviri; sözlük ekranla birlikte yükleniyor. */
  protected readonly t = this.i18n.t;

  private readonly auth = inject(AuthService);
  private readonly zone = inject(NgZone);
  private readonly router = inject(Router);

  protected readonly mode = signal<AuthMode>('signin');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly submitting = signal(false);
  protected readonly info = signal<string | null>(null);
  protected readonly error = this.auth.error;
  /** Şifre alanı düz metin mi — göz ikonuyla açılır. */
  protected readonly passwordVisible = signal(false);
  /**
   * Kendi doğrulama mesajlarımız. Tarayıcının kendi baloncuğu ("Lütfen bu alanı doldurun")
   * koyu temayla uyumsuzdu (kullanıcı geri bildirimi); form `novalidate` ile gönderiliyor
   * ve alan hataları burada tutuluyor. Sadece bir kez gönderim denendikten sonra gösterilir.
   */
  protected readonly emailError = signal<string | null>(null);
  protected readonly passwordError = signal<string | null>(null);

  setMode(mode: AuthMode): void {
    this.mode.set(mode);
    this.info.set(null);
    this.auth.error.set(null);
    this.emailError.set(null);
    this.passwordError.set(null);
  }

  onEmailInput(event: Event): void {
    this.email.set((event.target as HTMLInputElement).value);
    if (this.emailError()) this.emailError.set(null);
  }

  onPasswordInput(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
    if (this.passwordError()) this.passwordError.set(null);
  }

  togglePasswordVisible(): void {
    this.passwordVisible.update((v) => !v);
  }

  /** E-posta alanının hatası (geçerliyse null). Giriş, kayıt ve şifre sıfırlama AYNI kuralı kullanır. */
  private epostaHatasi(email: string): string | null {
    if (!email) return this.t('giris.epostaGir');
    const [local, domain, ...rest] = email.split('@');
    const gecerli =
      rest.length === 0 && !!local && !!domain && !email.includes(' ') && domain.includes('.') && !domain.endsWith('.');
    return gecerli ? null : this.t('giris.hataEposta');
  }

  /** Alan doğrulaması — geçerliyse true. Mesajlar Türkçe ve alanın altında gösterilir. */
  private validate(): boolean {
    const email = this.email().trim();
    const password = this.password();
    // Kasten gevşek bir kontrol: adresin gerçekten var olup olmadığına sunucu karar verir,
    // buradaki amaç sadece bariz yazım hatasını gönderimden önce yakalamak.
    this.emailError.set(this.epostaHatasi(email));
    /*
     * KAYITTA daha sert: ölçüldü, sunucu "123456" parolasını kabul ediyordu. GİRİŞTE eski
     * sınır korunur — yoksa 6-7 karakterli eski parolası olan kullanıcı kendi hesabına
     * giremez hâle gelirdi.
     */
    const minimum = this.mode() === 'signup' ? 8 : 6;
    const yaygin = new Set(['12345678', '123456789', 'password', 'parola12', 'qwerty123', '11111111']);
    this.passwordError.set(
      !password
        ? this.t('giris.hataSifre')
        : password.length < minimum
          ? this.t('mesaj.sifreEnAz', { n: minimum })
          : this.mode() === 'signup' && yaygin.has(password.toLowerCase())
            ? this.t('giris.hataYaygin')
            : /*
               * Sunucu (Supabase → Password Requirements) HARF + RAKAM istiyor. Kuralı
               * istemcide söylemezsek kullanıcı ham İngilizce hatayı görüyor:
               * "Password should contain at least one character of each: abcdefg…, 0123456789"
               * (kullanıcı bildirdi).
               */
              this.mode() === 'signup' && !(HARF.test(password) && RAKAM.test(password))
              ? this.t('giris.hataKural')
              : null,
    );
    return !this.emailError() && !this.passwordError();
  }

  /** "Şifremi unuttum" — sıfırlama bağlantısını e-postayla gönderir. */
  async forgotPassword(): Promise<void> {
    const email = this.email().trim();
    this.auth.error.set(null);
    this.info.set(null);
    if (!email) {
      this.emailError.set(this.t('giris.hataSifirlama'));
      return;
    }
    // Bozuk adres sunucuya gitmez: eskiden "abc" ile istek atılıyor ve dönen hata
    // "Giriş olmadı · Bir şeyler ters gitti" başlığıyla gösteriliyordu.
    const hata = this.epostaHatasi(email);
    if (hata) {
      this.emailError.set(hata);
      return;
    }
    this.hataTuru.set('sifirlama');
    this.submitting.set(true);
    const ok = await this.auth.sendPasswordReset(email);
    this.submitting.set(false);
    if (ok) this.info.set(this.t('giris.sifirlamaGonderildi'));
  }

  /** Art arda başarısız giriş sayısı — başarılı girişte sıfırlanır. */
  private basarisiz = 0;
  /** Kilit bitene kadar kalan saniye; 0 ise kilit yok. */
  protected readonly kilitKalan = signal(0);

  private kilitle(): void {
    this.kilitKalan.set(KILIT_SANIYE);
    /* Zamanlayıcı Angular bölgesinin DIŞINDA: bölge içinde açılan sayaç uygulamayı
       "kararsız" tutar ve whenStable bekleyen testleri kilitler (projede iki kez yaşandı). */
    this.zone.runOutsideAngular(() => {
      const sayac = setInterval(() => {
        const kalan = this.kilitKalan() - 1;
        this.kilitKalan.set(kalan);
        if (kalan <= 0) {
          clearInterval(sayac);
          this.basarisiz = 0;
        }
      }, 1000);
    });
  }

  /** Ekrandaki sunucu hatasının hangi işten geldiği — başlığı o belirler. */
  protected readonly hataTuru = signal<'giris' | 'kayit' | 'sifirlama'>('giris');

  async submit(): Promise<void> {
    if (this.kilitKalan() > 0) {
      this.passwordError.set(this.t('giris.kilit', { saniye: this.kilitKalan() }));
      return;
    }
    if (this.submitting()) return;
    this.info.set(null);
    // Yeni deneme eski sunucu hatasını taşımaz: istemci doğrulaması reddederse ekranda
    // "Bu e-posta zaten kayıtlı" ile "Şifre en az 8 karakter" yan yana çelişkili duruyordu.
    this.auth.error.set(null);
    this.hataTuru.set(this.mode() === 'signin' ? 'giris' : 'kayit');
    if (!this.validate()) return;
    const email = this.email().trim();
    const password = this.password();

    this.submitting.set(true);

    if (this.mode() === 'signin') {
      const ok = await this.auth.signIn(email, password);
      this.submitting.set(false);
      if (ok) {
        this.basarisiz = 0;
        this.router.navigateByUrl('/');
        return;
      }
      // Bağlantı hatası sayılmaz: kilit kaba kuvvete karşı, internetin kopmasına karşı değil.
      if (this.auth.lastSignInWrongCredentials) this.basarisiz += 1;
      if (this.basarisiz >= MAX_DENEME) this.kilitle();
      return;
    }

    const ok = await this.auth.signUp(email, password);
    this.submitting.set(false);
    if (!ok) return;
    if (this.auth.isAuthenticated()) {
      this.router.navigateByUrl('/');
      return;
    }
    this.info.set(this.t('giris.kayitTamam'));
  }

  /** Açık sosyal giriş sağlayıcıları (null iken düğme satırı hiç çizilmez). */
  protected readonly oauth = computed(() => {
    const s = this.auth.oauthProviders();
    // Google girişi şimdilik GİZLİ (12 Ekim 2026, kullanıcı isteği): Supabase kod değişiminde
    // "Unable to exchange external code" veriyor. Düzelince bu satırı kaldırın.
    return s ? { ...s, google: GOOGLE_GIRIS_ACIK && s.google } : s;
  });

  async continueWithGoogle(): Promise<void> {
    await this.auth.signInWithOAuth('google');
  }

  async continueWithX(): Promise<void> {
    await this.auth.signInWithOAuth('twitter');
  }
}
