import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { squadCompleteGuard } from './core/guards/squad-complete.guard';

export const routes: Routes = [
  // Uygulama ana menüyle açılır (kullanıcı isteği): kadro kurma artık oradan bir kutu.
  {
    path: '',
    loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
    canActivate: [authGuard],
  },
  /*
   * AÇILIŞ SAYFASI — uygulamanın önündeki yüz. Oturumsuz ziyaretçi hangi adrese gelirse
   * gelsin buraya düşer (bkz. authGuard); oradan "Giriş yap" ile /giris'e geçer.
   * guestGuard: oturumu olan kullanıcı tanıtım sayfasında oyalanmaz, menüye gider.
   *
   * TEMBEL YÜKLENİR: sayfayı yalnızca OTURUMSUZ ziyaretçi görür, ama eager olduğu için
   * giriş paketine giriyor ve paket 1 MB sınırını aştı (derleme hatası). Kendi parçasına
   * alındı — giriş yapmış kullanıcı bu kodu hiç indirmiyor.
   */
  {
    path: 'welcome',
    loadComponent: () => import('./features/landing/landing.component').then((m) => m.LandingComponent),
    canActivate: [guestGuard],
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent),
    canActivate: [guestGuard],
  },
  // Kullanıcının kendi kartı + kodla kadroya katılma (bkz. proje notları).
  {
    path: 'my-card',
    loadComponent: () => import('./features/my-card/my-card.component').then((m) => m.MyCardComponent),
    canActivate: [authGuard],
  },
  // Takım kurma karşılaması: ad + (isteğe bağlı) logo, sonra /kadro.
  {
    path: 'create-team',
    loadComponent: () => import('./features/create-team/create-team.component').then((m) => m.CreateTeamComponent),
    canActivate: [authGuard],
  },
  {
    // Takım arkadaşlarını puanla (12 Ekim 2026) — bkz. PeerRatingService.
    path: 'rate',
    loadComponent: () => import('./features/peer-rate/peer-rate.component').then((m) => m.PeerRateComponent),
    canActivate: [authGuard],
  },
  {
    path: 'squad',
    loadComponent: () => import('./features/squad-builder/squad-builder.component').then((m) => m.SquadBuilderComponent),
    canActivate: [authGuard],
  },
  {
    path: 'draw',
    loadComponent: () => import('./features/draw-ceremony/draw-ceremony.component').then((m) => m.DrawCeremonyComponent),
    canActivate: [authGuard, squadCompleteGuard],
  },
  {
    path: 'pitch',
    loadComponent: () => import('./features/pitch-view/pitch-view.component').then((m) => m.PitchViewComponent),
    canActivate: [authGuard, squadCompleteGuard],
  },
  /*
   * YASAL BELGELER — herkese açık, guard YOK: gizlilik/KVKK metinlerine erişim bir hesabın
   * arkasında olamaz. Tembel yüklenir; tanıtım sayfası gibi giriş paketini şişirmesin.
   */
  {
    path: 'privacy',
    loadComponent: () => import('./features/legal/legal.component').then((m) => m.LegalComponent),
    data: { doc: 'gizlilik' },
  },
  {
    path: 'data-protection',
    loadComponent: () => import('./features/legal/legal.component').then((m) => m.LegalComponent),
    data: { doc: 'kvkk' },
  },
  {
    path: 'cookies',
    loadComponent: () => import('./features/legal/legal.component').then((m) => m.LegalComponent),
    data: { doc: 'cerez' },
  },
  {
    path: 'terms',
    loadComponent: () => import('./features/legal/legal.component').then((m) => m.LegalComponent),
    data: { doc: 'kosullar' },
  },
  /*
   * ESKİ TÜRKÇE ADRESLER (12 Ekim 2026'ya kadar). Rotalar global/İngilizce adlara taşındı;
   * paylaşılmış linkler, e-postalardaki dönüş adresleri ve yer imleri bozulmasın diye kalıcı
   * yönlendirme. Sorgu parametreleri (ör. `?katil=1`) korunur.
   */
  { path: 'tanitim', redirectTo: 'welcome' },
  { path: 'giris', redirectTo: 'login' },
  { path: 'kartim', redirectTo: 'my-card' },
  { path: 'takim-kur', redirectTo: 'create-team' },
  { path: 'kadro', redirectTo: 'squad' },
  { path: 'kura', redirectTo: 'draw' },
  { path: 'saha', redirectTo: 'pitch' },
  { path: 'gizlilik', redirectTo: 'privacy' },
  { path: 'kvkk', redirectTo: 'data-protection' },
  { path: 'cerez-politikasi', redirectTo: 'cookies' },
  { path: 'kullanim-kosullari', redirectTo: 'terms' },
  { path: '**', redirectTo: '' },
];
