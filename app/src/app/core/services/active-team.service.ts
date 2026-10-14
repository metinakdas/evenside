import { Injectable, effect, inject, signal } from '@angular/core';
import { UserScopeService } from './user-scope.service';

const STORAGE_KEY = 'saha42.activeTeam.v1';

/**
 * ÜZERİNDE ÇALIŞILAN TAKIM.
 *
 * Kullanıcı birden fazla takım kurabildiği andan itibaren "kadro" tek başına anlamlı değil:
 * hangi takımın kadrosu? Bu servis o soruyu tek yerde cevaplıyor; `SquadStore` kadroyu buna
 * göre yüklüyor, menü de seçimi buradan okuyor.
 *
 * Seçim CİHAZA özel (`localStorage`), kullanıcıya değil: aynı hesap başka cihazda başka
 * takımla çalışıyor olabilir ve bunu sunucuya yazmanın bir faydası yok.
 */
@Injectable({ providedIn: 'root' })
export class ActiveTeamService {
  private readonly scope = inject(UserScopeService);

  readonly teamId = signal<string | null>(this.read());

  constructor() {
    /*
     * Seçim KULLANICIYA bağlı: hesap değişince yeni hesabın seçimi (çoğunlukla "yok")
     * okunur. Eskiden cihaz başınaydı ve ikinci hesap, birincinin takımını açık buluyordu.
     */
    effect(
      () => {
        this.scope.userId();
        this.scope.revision();
        this.teamId.set(this.read());
      });
  }

  select(teamId: string | null): void {
    if (this.teamId() === teamId) return;
    this.teamId.set(teamId);
    try {
      if (teamId) localStorage.setItem(this.scope.key(STORAGE_KEY), teamId);
      else localStorage.removeItem(this.scope.key(STORAGE_KEY));
    } catch {
      // Hatırlanamazsa seçim yalnızca bu oturumda geçerli olur; akış bozulmaz.
    }
  }

  private read(): string | null {
    try {
      return localStorage.getItem(this.scope.key(STORAGE_KEY));
    } catch {
      return null;
    }
  }
}
