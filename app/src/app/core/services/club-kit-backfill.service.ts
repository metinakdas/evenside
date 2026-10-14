import { Injectable, inject } from '@angular/core';
import { TeamInfo, TeamSide } from '../models/team.model';
import { SportsDbService } from './sports-db.service';
import { SquadStore } from './squad-store.service';

/**
 * Kayıtlı takımlarda eksik kalan forma bilgisini tamamlar.
 *
 * NEDEN: kulüp seçimi zamanla genişledi (önce yalnızca arma, sonra saha forması, sonra kaleci
 * forması). Daha önce seçilmiş bir kulüp `localStorage`'ta eski alanlarla duruyor ve ekranda
 * kaleci hâlâ düz vektör formada çıkıyordu (kullanıcı geri bildirimi: "kaleciler hâlâ default").
 * Bu servis, eksik alanı olan takımlar için TheSportsDB'den forma arşivini bir kez çeker.
 *
 * Ağ hatası akışı bozmaz: forma gelmezse takım eski hâliyle çalışmaya devam eder.
 */
@Injectable({ providedIn: 'root' })
export class ClubKitBackfillService {
  private readonly store = inject(SquadStore);
  private readonly sportsDb = inject(SportsDbService);
  private ran = false;

  /** Uygulama açılışında bir kez çağrılır. */
  async run(): Promise<void> {
    if (this.ran) return;
    this.ran = true;

    const sides: TeamSide[] = ['A', 'B'];
    await Promise.all(sides.map((side) => this.fillTeam(side)));
  }

  private async fillTeam(side: TeamSide): Promise<void> {
    const team = this.store.teams()[side === 'A' ? 0 : 1];
    // Kulüp seçilmemişse ya da kaleci forması zaten varsa yapacak iş yok.
    if (!team.clubName || team.keeperKitImage) return;

    try {
      const id = team.clubId ?? (await this.findClubId(team));
      if (!id) return;
      const kits = await this.sportsDb.kits(id);
      if (!kits.length) return;

      const outfield = team.kitImage ?? kits[0].url;
      const keeper = kits.find((k) => k.url !== outfield)?.url ?? null;
      this.store.updateTeam(side, { clubId: id, kitImage: outfield, keeperKitImage: keeper });
    } catch {
      // Servis yanıt vermezse takım olduğu gibi kalır.
    }
  }

  /** Eski kayıtlarda kulüp kimliği yok: ada göre aranıp bulunur. */
  private async findClubId(team: TeamInfo): Promise<string | null> {
    const results = await this.sportsDb.searchTeams(team.clubName ?? '');
    const exact = results.find((r) => r.name.toLocaleLowerCase('tr') === (team.clubName ?? '').toLocaleLowerCase('tr'));
    return (exact ?? results[0])?.id ?? null;
  }
}
