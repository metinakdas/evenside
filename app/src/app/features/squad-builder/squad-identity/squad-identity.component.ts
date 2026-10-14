import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { SquadInviteService } from '../../../core/services/squad-invite.service';
import { ActiveTeamService } from '../../../core/services/active-team.service';
import { I18nService } from '../../../core/services/i18n.service';
import { OYUN_DICTIONARIES } from '../../../core/i18n/oyun-dictionary';

/**
 * KADRO KİMLİĞİ — kadronun adı ve katılma kodu.
 *
 * Kadro kurulunca bir ad ve bir kod alır; kod paylaşılır, arkadaşlar kendi kartlarıyla
 * katılır ve havuzda "dahil edildi" işaretiyle görünürler (bkz. proje notları).
 *
 * Kod BİR KEZ üretilir ve değişmez: paylaşılmış bir kodun sonradan değişmesi, kodu alan
 * herkesin elindekini geçersiz kılardı.
 */
@Component({
  selector: 'app-squad-identity',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './squad-identity.component.html',
  styleUrl: './squad-identity.component.scss',
})
export class SquadIdentityComponent {
  private readonly i18n = inject(I18nService);
  /** Sözlük ekranla birlikte yükleniyor (giriş paketi şişmesin). */
  protected readonly t = this.i18n.t;

  private readonly invites = inject(SquadInviteService);
  private readonly activeTeam = inject(ActiveTeamService);

  /**
   * Panel AÇIK TAKIMI gösterir, "kullanıcının kendi takımını" değil: kullanıcı birden fazla
   * takıma ait olabiliyor ve /kadro hangi takım seçiliyse onun kadrosunu açıyor. Panelin
   * başka bir takımın adını yazması ekranla çelişirdi.
   */
  protected readonly squad = computed(() => {
    const id = this.activeTeam.teamId();
    const mine = this.invites.myTeams().find((t) => t.squad.id === id);
    return mine?.squad ?? (id ? null : this.invites.ownSquad());
  });

  /** Yalnızca KURUCU düzenleyebilir; üye için panel salt okunur. */
  protected readonly isOwner = computed(() => {
    const id = this.activeTeam.teamId();
    if (!id) return true;
    return this.invites.myTeams().find((t) => t.squad.id === id)?.role === 'kurucu';
  });
  /** Yüklenmeden "Adsız / Ad ver" göstermek yanlış olurdu; panel bekler. */
  protected readonly loaded = computed(() => this.invites.teamsLoaded() || this.invites.ownSquadLoaded());
  protected readonly memberCount = computed(() => this.invites.members().length);

  /**
   * Katılım satırının metni. Üyeler yalnızca KENDİ takımının üyeleri için yükleniyordu, bu
   * yüzden katıldığın takımda panel "Henüz kimse katılmadı" diyordu — oysa katılan sensin
   * (test raporu 7). Üye listesi artık AÇIK takım için çekiliyor; üyeye ayrıca rolü yazılıyor.
   */
  protected readonly joinedText = computed(() => {
    const count = this.memberCount();
    if (!this.isOwner()) {
      return count > 1 ? this.t('kadro.kodlaKatildinCok', { sayi: count }) : this.t('kadro.kodlaKatildin');
    }
    return count ? this.t('kadro.katilanSayisi', { sayi: count }) : this.t('kadro.kimseYok');
  });
  protected readonly error = computed(() => this.invites.error());

  protected readonly editing = signal(false);
  protected readonly draft = signal('');
  protected readonly saving = signal(false);
  protected readonly copied = signal(false);

  constructor() {
    this.i18n.register(OYUN_DICTIONARIES);
    void this.invites.loadOwnSquad();

    /*
     * Üye listesi AÇIK takıma göre tazelenir. `loadOwnSquad` yalnızca kullanıcının kendi
     * kurduğu takımın üyelerini yüklüyordu; katıldığın takımda sayı hep 0 kalıyordu.
     */
    effect(() => {
      const id = this.activeTeam.teamId();
      if (id) void this.invites.loadMembers(id);
    });
  }

  /** Paneli açar/kapatır: açıkken katılma kodu ve üye satırı da görünür. */
  protected toggle(): void {
    if (this.editing()) {
      this.cancel();
      return;
    }
    this.draft.set(this.squad()?.name ?? '');
    this.editing.set(true);
  }

  protected onName(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  protected async save(): Promise<void> {
    // Enter'a kayıt sürerken tekrar basmak ikinci bir istek (takım yokken İKİ takım) üretiyordu.
    if (this.saving()) return;
    const name = this.draft().trim();
    if (!name) return;
    this.saving.set(true);
    // Panel yalnızca AÇIK takımı düzenler; yeni takım kurmak menüdeki sihirbazın işi.
    const current = this.squad();
    const saved = current ? await this.invites.renameTeam(current.id, name) : await this.invites.createTeam(name);
    this.saving.set(false);
    // Kayıt başarısızsa düzenleme açık kalır (yazılan ad kaybolmasın, hata görünsün).
    if (saved) this.editing.set(false);
  }

  protected cancel(): void {
    this.editing.set(false);
  }

  /** Kodu panoya kopyalar. Pano yoksa (izin verilmemişse) sessizce geçer — kod zaten ekranda. */
  protected async copyCode(): Promise<void> {
    const code = this.squad()?.joinCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // Kopyalanamadıysa kullanıcı kodu elle okuyabilir.
    }
  }
}
