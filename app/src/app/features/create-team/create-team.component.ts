import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ActiveTeamService } from '../../core/services/active-team.service';
import { SquadInviteService } from '../../core/services/squad-invite.service';

type Step = 'hazir' | 'ad' | 'bitti';
import { I18nService } from '../../core/services/i18n.service';
import { HESAP_DICTIONARIES } from '../../core/i18n/hesap-dictionary';

/**
 * TAKIM KUR — kadro ekranına girmeden önceki karşılama sihirbazı.
 *
 * Eskiden "Takımı kur" doğrudan boş bir kadro ızgarasına düşürüyordu: takımın adı yoktu,
 * katılma kodu üretilmemişti ve kullanıcı ne yapacağını ekrandan anlamıyordu. Akış artık
 * takıma katılma akışıyla simetrik: karşılama → ad → kadro ekranı.
 *
 * Logo adımı kullanıcı isteğiyle KALDIRILDI; `squads.logo_image` alanı veri tarafında duruyor
 * ama sihirbaz artık ona dokunmuyor (`createOrRename` logosuz çağrılınca mevcut logo korunur).
 */
@Component({
  selector: 'app-create-team',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './create-team.component.html',
  styleUrl: './create-team.component.scss',
})
export class CreateTeamComponent {
  private readonly i18n = inject(I18nService);
  /** Çeviri; sözlük ekranla birlikte yükleniyor. */
  protected readonly t = this.i18n.t;

  private readonly invites = inject(SquadInviteService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly activeTeam = inject(ActiveTeamService);

  /** Düzenlenen takımın id'si; boşsa YENİ takım kuruluyor demektir. */
  protected readonly editingId = signal<string | null>(null);

  protected readonly step = signal<Step>('hazir');
  protected readonly name = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly squad = computed(() => this.invites.ownSquad());
  /** Düzenleme modundaki takım — yalnızca `?edit=<id>` ile gelindiğinde dolu. */
  protected readonly existing = computed(() => {
    const id = this.editingId();
    if (!id) return null;
    return this.invites.myTeams().find((t) => t.squad.id === id)?.squad ?? null;
  });

  constructor() {
    this.i18n.register(HESAP_DICTIONARIES);
    /*
     * `?duzenle=<id>` ile gelindiyse o takım düzenlenir; parametresiz gelindiğinde HER ZAMAN
     * yeni takım kurulur. Eskiden kullanıcının takımı varsa sihirbaz otomatik düzenlemeye
     * geçiyordu ve "yeni takım oluştur" demek mümkün değildi.
     */
    const q = this.route.snapshot.queryParamMap;
    const editId = q.get('edit') ?? q.get('duzenle'); // `duzenle`: eski Türkçe ad
    void this.invites.loadMyTeams().then(() => {
      if (!editId) return;
      const team = this.invites.myTeams().find((t) => t.squad.id === editId);
      // Yalnızca KURUCU adı değiştirebilir (sunucu da reddeder); üyeye düzenleme formu açılmaz.
      if (!team || team.role !== 'kurucu') return;
      this.editingId.set(team.squad.id);
      this.name.set(team.squad.name);
    });
  }

  protected start(): void {
    this.step.set('ad');
  }

  protected onName(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
    if (this.error()) this.error.set(null);
  }

  /** Takımı kaydeder. */
  protected async finish(): Promise<void> {
    // Kayıt sürerken Enter'a tekrar basmak devre dışı düğmeyi atlıyordu: iki takım kurulabiliyordu.
    if (this.saving()) return;
    const name = this.name().trim();
    if (!name) {
      this.step.set('ad');
      this.error.set(this.t('takim.adGerek'));
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    /*
     * Sihirbaz iki işi yapıyor: YENİ takım kurmak ve VAR OLANI düzenlemek. Hangisi olduğunu
     * `editingId` söylüyor — menüden "yeni takım oluştur" gelindiğinde boş, "düzenle"
     * gelindiğinde dolu. Ayrım olmadan ikinci takım kurmak imkânsızdı: her kayıt mevcut
     * takımın adını değiştiriyordu.
     */
    const editing = this.editingId();
    const saved = editing
      ? await this.invites.renameTeam(editing, name)
      : await this.invites.createTeam(name);

    // Yeni kurulan takım hemen ÜZERİNDE ÇALIŞILAN takım olur; kadro ekranı onun kadrosunu açar.
    if (saved && !editing) this.activeTeam.select(saved.id);
    this.saving.set(false);

    if (!saved) {
      this.error.set(this.invites.error() ?? this.t('takim.kaydedilemedi'));
      return;
    }
    this.step.set('bitti');
  }

  protected goSquad(): void {
    void this.router.navigateByUrl('/squad');
  }

  protected goHome(): void {
    void this.router.navigateByUrl('/');
  }

  /**
   * "Şimdi değil" kullanıcıyı GELDİĞİ yere bırakır: takım kurma sihirbazına menüdeki
   * "Takımlarım" sekmesinden gelinir, vazgeçince oraya dönmeli — menünün ilk sekmesinde
   * bulmak yaptığı işi kaybetmiş gibi hissettirir.
   */
  protected goTeams(): void {
    void this.router.navigateByUrl('/?sekme=takimlar');
  }

  protected back(): void {
    if (this.step() === 'ad') this.step.set('hazir');
    else this.goHome();
  }
}
