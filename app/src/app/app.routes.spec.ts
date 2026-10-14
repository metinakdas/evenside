import { Component, ChangeDetectionStrategy } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { AuthService } from './core/services/auth.service';
import { PlayerRepositoryService } from './core/services/player-repository.service';
import { FakePlayerRepositoryService } from './core/services/testing/fake-player-repository';

@Component({
    selector: 'app-test-root', imports: [RouterOutlet], changeDetection: ChangeDetectionStrategy.Eager,
 template: '<router-outlet />'
})
class TestRootComponent {}

/**
 * Uygulamanın oturum açık kullanıcıyı nereye bıraktığını doğrular. Bu bir kez canlıda
 * patladı: rota tablosunda `''` ana menüydü ama girişten sonraki `navigateByUrl` ve
 * `guestGuard` hâlâ `/squad`'ya gönderiyordu, dolayısıyla menü hiç görünmüyordu — rota
 * tablosuna bakmak yetmiyor, VARIŞ noktası ölçülmeli.
 */
describe('uygulama rotaları — varış noktası', () => {
  /*
   * TEMBEL PARÇALAR ÖNCEDEN ISITILIR (10 Ekim 2026). Testler fakeAsync içinde; webpack'in parça
   * indirme ZAMAN AŞIMI da bir setTimeout. Parça henüz indirilmemişken bir testteki `tick` sahte
   * saati ileri sarınca zaman aşımı anında doluyor ve rota `ChunkLoadError` ile düşüyordu —
   * 3-4 koşudan birinde rastgele 3 test kırılıyordu (tanıtım parçası büyüdükçe sıklaştı).
   * Parçalar burada GERÇEK zamanda bir kez indirilir; sonraki gezinmeler önbellekten gelir.
   */
  beforeAll(async () => {
    await Promise.all([
      import('./features/home/home.component'),
      import('./features/landing/landing.component'),
      import('./features/auth/login/login.component'),
      import('./features/my-card/my-card.component'),
      import('./features/create-team/create-team.component'),
      import('./features/squad-builder/squad-builder.component'),
      import('./features/draw-ceremony/draw-ceremony.component'),
      import('./features/pitch-view/pitch-view.component'),
      import('./features/legal/legal.component'),
    ]);
  }, 60_000);

  const setup = (authenticated: boolean) => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        { provide: PlayerRepositoryService, useValue: new FakePlayerRepositoryService() },
        {
          provide: AuthService,
          useValue: {
            ready: Promise.resolve(),
            isAuthenticated: () => authenticated,
            user: () => (authenticated ? { email: 'a@b.c' } : null),
            error: () => null,
            signOut: () => Promise.resolve(),
            oauthProviders: () => null,
            loadOAuthProviders: () => Promise.resolve(),
          },
        },
      ],
    });
    return TestBed.createComponent(TestRootComponent);
  };

  it('oturum açıkken kök adres ana menüyü gösterir', fakeAsync(() => {
    const fixture = setup(true);
    TestBed.inject(Router).navigateByUrl('/');
    tick();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-home')).withContext('ana menü yok').toBeTruthy();
  }));

  it('oturum açıkken /login ana menüye yönlendirir (kadroya değil)', fakeAsync(() => {
    const fixture = setup(true);
    const router = TestBed.inject(Router);
    router.navigateByUrl('/login');
    tick();
    fixture.detectChanges();

    expect(router.url).toBe('/');
  }));

  /*
   * Oturumsuz ziyaretçi artık GİRİŞ FORMUNA değil AÇILIŞ SAYFASINA düşüyor: siteye ilk gelen
   * kişi ne olduğunu anlamadan "e-posta / şifre" görmesin. Varış noktası ölçülüyor, rota
   * tablosuna bakmak bu hatayı yakalamaz (projede bir kez canlıda patladı).
   */
  it('oturum yokken kök adres AÇILIŞ SAYFASINA yönlendirir', fakeAsync(() => {
    const fixture = setup(false);
    const router = TestBed.inject(Router);
    router.navigateByUrl('/');
    tick();
    fixture.detectChanges();

    expect(router.url).toBe('/welcome');
  }));

  it('oturumsuz ziyaretçi korumalı ekranlardan da açılış sayfasına düşer', fakeAsync(() => {
    const fixture = setup(false);
    const router = TestBed.inject(Router);
    router.navigateByUrl('/squad');
    tick();
    fixture.detectChanges();

    expect(router.url).toBe('/welcome');
  }));

  it('oturum açıkken açılış sayfası ana menüye yönlendirir', fakeAsync(() => {
    const fixture = setup(true);
    const router = TestBed.inject(Router);
    router.navigateByUrl('/welcome');
    tick();
    fixture.detectChanges();

    expect(router.url).withContext('giriş yapmış kullanıcı tanıtımda oyalanmaz').toBe('/');
  }));

  /* Rotalar İngilizce adlara taşındı (12 Ekim 2026); eski Türkçe linkler bozulmamalı. */
  it('eski Türkçe adresler yeni adlara yönlenir ve sorgu parametresini korur', fakeAsync(() => {
    const fixture = setup(false);
    const router = TestBed.inject(Router);
    for (const [eski, yeni] of [['/tanitim', '/welcome'], ['/giris', '/login'], ['/gizlilik', '/privacy'], ['/kullanim-kosullari', '/terms']]) {
      router.navigateByUrl(eski);
      tick();
      fixture.detectChanges();
      expect(router.url).withContext(eski).toBe(yeni);
    }
    router.navigateByUrl('/giris?x=1');
    tick();
    expect(router.url).toBe('/login?x=1');
  }));
});
