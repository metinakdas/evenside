import { signal } from '@angular/core';
import { SquadInviteService } from '../squad-invite.service';

/**
 * Testler için: takım listesi yüklenmiş ve EN AZ BİR takımı olan kullanıcı. Maç geçmişi
 * yalnızca kullanıcının hâlâ üyesi olduğu takımların maçlarını gösteriyor (11 Ekim 2026);
 * geçmişi ölçen testler bu sahte servisle kurulur. `myTeams` testten değiştirilebilir.
 */
export function takimliKullanici(takimIdleri: string[] = ['t1']) {
  const sahte = {
    teamsLoaded: signal(true),
    teamsFailed: signal(false),
    myTeams: signal(takimIdleri.map((id) => ({ squad: { id, name: id, ownerId: 'u1', joinCode: 'ABC123', logoImage: null }, role: 'kurucu' }))),
  };
  return { sahte, provider: { provide: SquadInviteService, useValue: sahte } };
}
