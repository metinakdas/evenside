import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Oturum açılmadan `/squad`, `/draw`, `/pitch`'ya girişi engeller. */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  /*
   * Oturumsuz ziyaretçi GİRİŞ FORMUNA değil AÇILIŞ SAYFASINA gider. Siteye ilk gelen kişi
   * ne olduğunu anlamadan "e-posta / şifre" görüyordu; artık önce ürünü görüyor, girişi
   * kendisi seçiyor. (Oturumu düşen kullanıcı da oraya düşer ama /tanitim'deki "Giriş yap"
   * tek tık uzakta ve giriş ekranı sebebini yazıyor.)
   */
  return auth.isAuthenticated() ? true : router.parseUrl('/welcome');
};

/** Zaten giriş yapmış kullanıcıyı `/login` ekranında bırakmaz. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  // Giriş yapmış kullanıcının varış noktası ana menüdür, kadro ekranı değil.
  return auth.isAuthenticated() ? router.parseUrl('/') : true;
};
