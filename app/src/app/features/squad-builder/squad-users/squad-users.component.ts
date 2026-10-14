import { ConfirmService } from '../../../core/services/confirm.service';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Player } from '../../../core/models/player.model';
import { ActiveTeamService } from '../../../core/services/active-team.service';
import { AuthService } from '../../../core/services/auth.service';
import { CardMatchService, CardMatchSuggestion } from '../../../core/services/card-match.service';
import { I18nService } from '../../../core/services/i18n.service';
import { NoticeService } from '../../../core/services/notice.service';
import { PlayerRepositoryService } from '../../../core/services/player-repository.service';
import { MemberRole, SquadInviteService, SquadMember } from '../../../core/services/squad-invite.service';
import { SquadStore } from '../../../core/services/squad-store.service';
import { OYUN_DICTIONARIES } from '../../../core/i18n/oyun-dictionary';
import { PlayerCardComponent } from '../../../shared/components/player-card/player-card.component';

/** Listede bir satır: takımın kurucusu ya da koda katılan bir üye. */
interface UserRow {
  key: string;
  userId: string;
  card: Player | null;
  role: 'kurucu' | MemberRole;
  isMe: boolean;
  joinedAt: string | null;
  member: SquadMember | null;
  /** Bu üyenin kartıyla aynı adı taşıyan havuz kartları (eşleme önerisi). */
  matches: CardMatchSuggestion[];
}

/**
 * KULLANICILAR — /kadro ekranının üçüncü sekmesi (10 Ekim 2026).
 *
 * Takıma kodla katılan herkesi kendi kartıyla listeler. Takımın KURUCUSU burada:
 *   * bir üyeye "yönetici" yetkisi verir ya da geri alır (yönetici kadroda kurucu gibi
 *     ekler/çıkarır/düzenler; normal üye hiçbirini yapamaz),
 *   * üyeyi takımdan çıkarır,
 *   * katılan üyenin kartı havuzdaki elle girilmiş bir kartla aynı adı taşıyorsa uyarıyı görür
 *     ve iki kartı eşler (kadroda bundan sonra üyenin KENDİ kartı geçer).
 *
 * Yetkiyi dağıtmak yalnızca kurucuya ait (yönetici rol veremez). Bütün kurallar sunucuda da
 * zorlanıyor (`supabase/yetki-yonetici.sql`); buradaki düğmeler yalnızca kullanım kolaylığı.
 */
@Component({
  selector: 'app-squad-users',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlayerCardComponent],
  templateUrl: './squad-users.component.html',
  styleUrl: './squad-users.component.scss',
})
export class SquadUsersComponent {
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly store = inject(SquadStore);
  private readonly invites = inject(SquadInviteService);
  private readonly activeTeam = inject(ActiveTeamService);
  private readonly auth = inject(AuthService);
  private readonly repo = inject(PlayerRepositoryService);
  private readonly matches = inject(CardMatchService);
  private readonly notices = inject(NoticeService);
  private readonly confirmSvc = inject(ConfirmService);

  /** İşlem süren satır — çift tıklamayla iki istek gitmesin. */
  protected readonly busyUser = signal<string | null>(null);
  protected readonly error = computed(() => this.invites.error() ?? this.matches.error());

  protected readonly team = computed(() => {
    const id = this.activeTeam.teamId();
    return id ? (this.invites.myTeams().find((t) => t.squad.id === id) ?? null) : null;
  });

  protected readonly rows = computed<UserRow[]>(() => {
    const team = this.team();
    if (!team) return [];
    const me = this.auth.user()?.id ?? null;
    const byId = this.repo.playersById();
    const members = this.invites.members().filter((m) => m.squadId === team.squad.id);
    const canMatch = this.store.canEditSquad();

    const ownerCard = team.squad.ownerId === me ? this.repo.ownCard() : null;
    const owner: UserRow = {
      key: 'kurucu',
      userId: team.squad.ownerId,
      card: ownerCard,
      role: 'kurucu',
      isMe: team.squad.ownerId === me,
      joinedAt: null,
      member: null,
      // Kurucunun KENDİ kartı da eşlenebilir: havuza kendini elle eklemiş, sonra kartını
      // oluşturmuş olabilir. Önceden yalnızca katılan üyeler öneri alıyordu.
      matches: canMatch && ownerCard ? this.matches.forOwnedCards(new Set([ownerCard.id])) : [],
    };

    const memberRows = members
      .map<UserRow>((m) => {
        const card = m.playerId ? (byId.get(this.repo.resolveId(m.playerId)) ?? null) : null;
        return {
          key: m.userId,
          userId: m.userId,
          card,
          role: m.role,
          isMe: m.userId === me,
          joinedAt: m.joinedAt,
          member: m,
          matches: canMatch && card ? this.matches.forOwnedCards(new Set([card.id])) : [],
        };
      })
      // Yöneticiler üstte, sonra katılma sırası.
      .sort((a, b) => (a.role === b.role ? (a.joinedAt ?? '').localeCompare(b.joinedAt ?? '') : a.role === 'yonetici' ? -1 : 1));

    return [owner, ...memberRows];
  });

  protected readonly memberCount = computed(() => Math.max(0, this.rows().length - 1));
  protected readonly adminCount = computed(() => this.rows().filter((r) => r.role === 'yonetici').length);

  constructor() {
    this.i18n.register(OYUN_DICTIONARIES);
    // Sekme açıkken takım değişirse ya da açılırken: üyeler ve roller tazelenir (başka cihazda
    // verilen yetki burada görünsün).
    effect(() => {
      const team = this.team();
      if (team) void this.invites.loadMembers(team.squad.id);
    });
  }

  protected roleLabel(role: UserRow['role']): string {
    return role === 'kurucu' ? this.t('kullanici.kurucu') : role === 'yonetici' ? this.t('kullanici.yonetici') : this.t('kullanici.uye');
  }

  protected joined(date: string | null): string {
    if (!date) return '';
    const d = new Date(date);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(this.i18n.locale(), { day: 'numeric', month: 'long', year: 'numeric' });
  }

  protected async toggleRole(row: UserRow): Promise<void> {
    const team = this.team();
    if (!team || !row.member || this.busyUser()) return;
    const next: MemberRole = row.role === 'yonetici' ? 'uye' : 'yonetici';
    this.busyUser.set(row.userId);
    const ok = await this.invites.setMemberRole(team.squad.id, row.userId, next);
    this.busyUser.set(null);
    if (ok) {
      const ad = row.card?.input.name ?? this.t('kullanici.adsiz');
      this.notices.success(this.t(next === 'yonetici' ? 'kullanici.yetkiVerildi' : 'kullanici.yetkiAlindi', { ad }));
    }
  }

  /** Üye çıkarma: "Çıkarmak istediğine emin misin?" — onaylanmadan hiçbir şey olmaz. */
  protected async askRemove(row: UserRow): Promise<void> {
    const ad = row.card?.input.name ?? this.t('kullanici.adsiz');
    const ok = await this.confirmSvc.ask({
      title: this.t('onay.uyeBaslik'),
      message: this.t('onay.uyeMetin', { ad }),
      confirmLabel: this.t('onay.uyeDugme'),
      danger: true,
    });
    if (ok) await this.remove(row);
  }

  protected async remove(row: UserRow): Promise<void> {
    const team = this.team();
    if (!team || this.busyUser()) return;
    this.busyUser.set(row.userId);
    const ok = await this.invites.removeMember(team.squad.id, row.userId);
    this.busyUser.set(null);
    if (ok) this.notices.success(this.t('kullanici.cikarildi', { ad: row.card?.input.name ?? this.t('kullanici.adsiz') }));
  }

  protected async link(s: CardMatchSuggestion): Promise<void> {
    const ok = await this.matches.link(s);
    if (ok) this.notices.success(this.t('kullanici.eslendi', { ad: s.ownedCard.input.name }));
  }

  protected dismiss(s: CardMatchSuggestion): void {
    this.matches.dismiss(s);
  }
}
