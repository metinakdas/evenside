import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { I18nService } from '../../core/services/i18n.service';
import { SquadStore } from '../../core/services/squad-store.service';
import { PlayerRepositoryService } from '../../core/services/player-repository.service';
import { PeerRatingService } from '../../core/services/peer-rating.service';
import { SquadInviteService } from '../../core/services/squad-invite.service';
import { ActiveTeamService } from '../../core/services/active-team.service';
import { NoticeService } from '../../core/services/notice.service';
import { Player } from '../../core/models/player.model';
import { takimAdiGoster } from '../../core/utils/team-name';
import { safeImage } from '../../core/utils/safe-image';

/**
 * TAKIM ARKADAŞLARINI PUANLA (`/rate`, 12 Ekim 2026). Bkz. PeerRatingService.
 *
 * Her oyuncuya tek soru: "grubunuzda nerede?" (1-10, bantlı açıklamayla). Kartın PUANI BİLEREK
 * GÖSTERİLMEZ: ekranda bir sayı görünürse puanlayan ona çapalanır ve sahada gördüğünü değil
 * kartta yazanı verir — bu da akran görüşünün bütün değerini siler. Yalnızca ad, mevki, fotoğraf.
 * Kendi kartı listede yoktur (sunucu da reddeder). Her seçim anında kaydedilir.
 */
@Component({
  selector: 'app-peer-rate',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './peer-rate.component.html',
  styleUrl: './peer-rate.component.scss',
})
export class PeerRateComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  private readonly store = inject(SquadStore);
  private readonly repo = inject(PlayerRepositoryService);
  private readonly peers = inject(PeerRatingService);
  private readonly invites = inject(SquadInviteService);
  private readonly activeTeam = inject(ActiveTeamService);
  private readonly notice = inject(NoticeService);
  private readonly router = inject(Router);

  protected readonly levels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  protected readonly photo = (p: Player): string | null => safeImage(p.input.photoImage);
  protected readonly unavailable = this.peers.unavailable;
  protected readonly loaded = this.peers.loaded;
  /** Az önce kaydedilen oyuncu: satırda kısa bir "kaydedildi" işareti. */
  protected readonly justSaved = signal<string | null>(null);

  protected readonly teamName = computed(() => {
    const id = this.activeTeam.teamId();
    const team = this.invites.myTeams().find((t) => t.squad.id === id);
    return team ? takimAdiGoster(team.squad.name) : null;
  });

  /** Kadrodaki diğer oyuncular (kendi kartı hariç), ada göre. */
  protected readonly players = computed<Player[]>(() => {
    const own = this.repo.ownCard();
    const ownId = own ? this.repo.resolveId(own.id) : null;
    return this.store
      .players()
      .filter((p) => this.repo.resolveId(p.id) !== ownId)
      .sort((a, b) => a.input.name.localeCompare(b.input.name, 'tr'));
  });

  protected readonly ratedCount = computed(() => this.players().filter((p) => this.mineFor(p) !== null).length);

  constructor() {
    this.peers.refresh();
  }

  protected mineFor(p: Player): number | null {
    return this.peers.mine().get(p.id) ?? null;
  }

  /** Seçilen seviyenin bandı: 1-3 · 4-6 · 7-8 · 9-10 (oyuncu formundaki çapalarla aynı aralıklar). */
  protected band(level: number): string {
    const b = level <= 3 ? 1 : level <= 6 ? 2 : level <= 8 ? 3 : 4;
    return this.t('puan.bant' + b);
  }

  protected initials(p: Player): string {
    return p.input.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('');
  }

  protected async rate(p: Player, level: number): Promise<void> {
    const ok = await this.peers.rate(p.id, level);
    if (!ok) {
      this.notice.error(this.t('puan.hata'));
      return;
    }
    this.justSaved.set(p.id);
  }

  protected goBack(): void {
    void this.router.navigateByUrl('/squad');
  }
}
