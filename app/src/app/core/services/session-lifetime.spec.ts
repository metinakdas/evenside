import { INACTIVITY_LIMIT_MS, MAX_SESSION_MS, sessionExpired } from './session-lifetime.service';
import { I18nService } from './i18n.service';

/*
 * Supabase'in oturum sınırları Pro planında (ölçüldü: panelde kilitli). Aynı işi istemcide
 * yapan kararın kendisi burada ölçülüyor — zaman geçirmeye gerek yok, karar saf bir fonksiyon.
 */
describe('sessionExpired', () => {
  const simdi = Date.UTC(2026, 8, 14, 12, 0, 0);

  it('taze oturumda süre dolmaz', () => {
    expect(sessionExpired(simdi, simdi - 1000, simdi - 1000)).toBeNull();
  });

  it('hareketsizlik sınırı aşılınca kapanır', () => {
    expect(sessionExpired(simdi, simdi - INACTIVITY_LIMIT_MS - 1, simdi)).toBe('inactivity');
  });

  it('hareketsizlik sınırının hemen altında AÇIK kalır', () => {
    expect(sessionExpired(simdi, simdi - INACTIVITY_LIMIT_MS + 1000, simdi)).toBeNull();
  });

  it('mutlak üst sınır aşılınca kapanır — kullanıcı aktif olsa bile', () => {
    expect(sessionExpired(simdi, simdi, simdi - MAX_SESSION_MS - 1)).toBe('max-age');
  });

  it('hareketsizlik, mutlak sınırdan ÖNCE raporlanır (kullanıcıya doğru sebep gösterilsin)', () => {
    expect(sessionExpired(simdi, simdi - INACTIVITY_LIMIT_MS - 1, simdi - MAX_SESSION_MS - 1)).toBe('inactivity');
  });

  it('damga yoksa karar verilmez — ilk açılışta oturum kapatılmaz', () => {
    expect(sessionExpired(simdi, null, null)).toBeNull();
  });
});

/*
 * Servisin KENDİSİ: sınır aşılmışsa çıkış yapıyor mu, sebebi söylüyor mu, damgaları
 * temizliyor mu? Tarayıcıda ölçmek kararsız çıktı (QA koşucusu her yüklemede oturumu ve
 * eski damgaları yeniden tohumlayıp döngü kuruyor), bu yüzden karar burada ölçülüyor.
 */
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from './auth.service';
import { SessionLifetimeService } from './session-lifetime.service';

describe('SessionLifetimeService', () => {
  const UID = 'kullanici-1';
  const A = `saha42.session.activity.v1::${UID}`;
  const B = `saha42.session.start.v1::${UID}`;
  let fakeAuth: { user: ReturnType<typeof signal>; error: ReturnType<typeof signal>; signOut: jasmine.Spy };

  beforeEach(() => {
    localStorage.removeItem(A);
    localStorage.removeItem(B);
    fakeAuth = {
      user: signal<{ id: string } | null>(null),
      error: signal<string | null>(null),
      signOut: jasmine.createSpy('signOut').and.resolveTo(undefined),
    };
    TestBed.configureTestingModule({
      providers: [SessionLifetimeService, { provide: AuthService, useValue: fakeAuth }],
    });
    // Çıkış mesajı `mesaj()` ile çevriliyor; o da o an var olan I18nService örneğini kullanıyor.
    // Test bunu kendisi kurmazsa sonuç, testlerin rastgele SIRASINA bağlı oluyordu (bir koşuda
    // anahtarın kendisi döndü: 'mesaj.hareketsizCikis'). Dil Türkçeye sabitlenir.
    TestBed.inject(I18nService).setLocale('tr');
  });

  /** Yönlendirmeyi yutar: gerçek `location.assign` Karma sayfasını götürürdü. */
  function kur(): SessionLifetimeService {
    const service = TestBed.inject(SessionLifetimeService);
    spyOn(service as unknown as { navigateToLogin(): void }, 'navigateToLogin');
    return service;
  }

  it('taze oturumda damgaları yazar ve çıkış YAPMAZ', () => {
    kur();
    fakeAuth.user.set({ id: UID });
    TestBed.flushEffects();

    expect(localStorage.getItem(A)).withContext('etkinlik damgası').not.toBeNull();
    expect(localStorage.getItem(B)).withContext('başlangıç damgası').not.toBeNull();
    expect(fakeAuth.signOut).not.toHaveBeenCalled();
  });

  it('hareketsizlik sınırı aşılmışsa çıkış yapar, sebebi söyler ve damgaları siler', async () => {
    const cokEski = Date.now() - 8 * 24 * 60 * 60 * 1000;
    localStorage.setItem(A, String(cokEski));
    localStorage.setItem(B, String(cokEski));

    kur();
    fakeAuth.user.set({ id: UID });
    TestBed.flushEffects();
    await Promise.resolve();

    expect(fakeAuth.signOut).toHaveBeenCalled();
    expect(fakeAuth.error()).toContain('Uzun süre işlem yapılmadığı');
    expect(localStorage.getItem(A)).withContext('damga temizlenmeli').toBeNull();
  });
});
