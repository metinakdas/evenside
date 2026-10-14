import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PlayerRepositoryService } from '../services/player-repository.service';
import { SquadStore } from '../services/squad-store.service';

/**
 * `/draw` ve `/pitch` rotalarını korur — kadro tamamlanmadan bu ekranlara doğrudan
 * URL'den veya sayfa yenilemeyle girilirse `/squad`'ya geri gönderir.
 *
 * `PlayerRepositoryService.ready`'yi bekliyor: oyuncu havuzu Supabase'den ASENKRON
 * geliyor, bu bekleme olmadan sayfa yenilemede (veya doğrudan URL'den girişte) havuz
 * henüz gelmeden `isSquadComplete()` kontrol edilip kadro dolu olsa bile boş sanılıp
 * yanlışlıkla `/squad`'ya geri atıyordu (bkz. kullanıcı geri bildirimi).
 */
export const squadCompleteGuard: CanActivateFn = async () => {
  const store = inject(SquadStore);
  const playerRepo = inject(PlayerRepositoryService);
  const router = inject(Router);
  // Tek seferlik `ready` değil: oturumsuz açılışta (tanıtım) da çözülür ve giriş yapan
  // kullanıcının havuzu gelmeden kadro boş sanılırdı. Havuz BU kullanıcı için yüklenmeli.
  await playerRepo.whenReadyForUser();
  // Takımın kadrosu SUNUCUDAN da gelmeli: yeni cihazda/yenilemede cihazda kadro yok.
  await store.whenRosterSettled();
  return store.isSquadComplete() ? true : router.parseUrl('/squad');
};
