import { ConfirmService } from '../../../core/services/confirm.service';
import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { SquadFormat } from '../../../core/models/draw.model';
import { TeamInfo, TeamSide } from '../../../core/models/team.model';
import { SportsDbService, SportsDbTeam } from '../../../core/services/sports-db.service';
import { ImageService } from '../../../core/services/image.service';
import { SquadStore } from '../../../core/services/squad-store.service';
import { ErrorBannerComponent } from '../../../shared/components/error-banner/error-banner.component';
import { TeamBadgeComponent } from '../../../shared/components/team-badge/team-badge.component';
import { I18nService } from '../../../core/services/i18n.service';
import { OYUN_DICTIONARIES } from '../../../core/i18n/oyun-dictionary';
import { takimAdiGoster } from '../../../core/utils/team-name';

/**
 * Açılır listedeki lig seçenekleri. TheSportsDB `search_all_teams.php` ucu lig ADIYLA
 * çalışıyor ve ücretsiz anahtarda 10 sonuçla sınırlı (ölçüldü) — listede olmayan kulüpler
 * için aynı panelde arama kutusu var.
 */
const LEAGUES = [
  'Turkish Super Lig',
  'English Premier League',
  'Spanish La Liga',
  'Italian Serie A',
  'German Bundesliga',
  'French Ligue 1',
] as const;

const FORMATS: SquadFormat[] = [4, 5, 6, 7, 8, 9, 10, 11];

/**
 * Takım renkleri. Mor (#7B2FF7) bilerek YOK: o ton kalecinin forması (bkz.
 * `KEEPER_JERSEY_COLOR`) — palette dururken takım moru seçilince kaleci saha oyuncularından
 * ayrılamıyordu.
 */
const TEAM_COLOR_SWATCHES = ['#0068A8', '#FB090B', '#00A650', '#F5A800', '#D81B60', '#161618'];

/** Telefon genişliği — ayar şeridinin kapalı başlayacağı eşik (bkz. Ö7). */
function isNarrowViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
}

@Component({
    selector: 'app-match-settings',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [TeamBadgeComponent, ErrorBannerComponent],
    templateUrl: './match-settings.component.html',
    styleUrl: './match-settings.component.scss'
})
export class MatchSettingsComponent {
  /** Varsayılan "Takım A/B" ekranda çevrilir; kullanıcının verdiği ad olduğu gibi kalır. */
  protected readonly takimAdi = takimAdiGoster;

  private readonly i18n = inject(I18nService);
  /** Sözlük ekranla birlikte yükleniyor (giriş paketi şişmesin). */
  protected readonly t = this.i18n.t;

  constructor() {
    this.i18n.register(OYUN_DICTIONARIES);
  }

  protected readonly store = inject(SquadStore);
  private readonly confirmSvc = inject(ConfirmService);
  private readonly sportsDb = inject(SportsDbService);
  private readonly imageService = inject(ImageService);

  readonly formats = FORMATS;
  readonly swatches = TEAM_COLOR_SWATCHES;

  /**
   * Ayar şeridi katlanabilir. Telefonda (<=900px) KAPALI başlar: 108px'lik sabit şerit +
   * üst krom, kadro havuzuna neredeyse yer bırakmıyordu (kontrol raporu Ö7). Geniş ekranda
   * açık başlar, davranış değişmez.
   */
  protected readonly expanded = signal(!isNarrowViewport());

  protected onToggle(event: Event): void {
    this.expanded.set((event.target as HTMLDetailsElement).open);
  }
  readonly sides: TeamSide[] = ['A', 'B'];

  /**
   * Takım kartı iki durumlu: KAPALI (arma + ad, tek satır) ve DÜZENLEME. Ayarlar bir kez
   * yapılıp bir daha açılmıyor; sürekli açık duran beş satırlık form, asıl iş olan kadro
   * kurma alanından yer çalıyordu (kullanıcı isteği).
   */
  protected readonly editingTeam = signal<TeamSide | null>(null);

  /**
   * Düzenlemeye girerken takımın kopyası. Değişiklikler store'a ANINDA yazılıyor (önizleme
   * canlı olsun diye), bu yüzden "Vazgeç" ancak bu kopyayı geri yazarak gerçek olabilir.
   */
  private snapshot: TeamInfo | null = null;

  protected startEditTeam(side: TeamSide): void {
    this.snapshot = { ...this.teamAt(side) };
    this.editingTeam.set(side);
    this.clubOpen.set(null);
  }

  /** "Kaydet": değişiklikler zaten yazılı; kart kapanır. */
  protected saveTeam(): void {
    this.snapshot = null;
    this.editingTeam.set(null);
    this.clubOpen.set(null);
  }

  /** "Vazgeç": düzenlemeye girerkenki hâli geri yazılır. */
  protected cancelEditTeam(side: TeamSide): void {
    if (this.snapshot) {
      const { side: _ignored, ...rest } = this.snapshot;
      this.store.updateTeam(side, rest);
    }
    this.saveTeam();
  }
  /**
   * Kulüp arama (TheSportsDB): arma ve forma görselini hazır getirir. Görseller UZAK URL
   * olarak saklanır — görsel sunucusu CORS başlığı göndermediği için indirilip data URL'e
   * çevrilemiyor (bkz. SportsDbService).
   */
  readonly leagues = LEAGUES;
  /** Açılır listede seçili lig — liste bununla dolu açılır. */
  protected readonly league = signal<string>(LEAGUES[0]);
  protected readonly clubQuery = signal<Record<TeamSide, string>>({ A: '', B: '' });
  protected readonly clubResults = signal<Record<TeamSide, SportsDbTeam[]>>({ A: [], B: [] });
  protected readonly clubSearching = signal<TeamSide | null>(null);
  protected readonly clubError = signal<string | null>(null);
  /** Arama kutusu açık olan taraf — panel dar, ikisi aynı anda açılmasın. */
  protected readonly clubOpen = signal<TeamSide | null>(null);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  /** Açılır listeyi açar/kapatır; açarken seçili ligin kulüplerini yükler. */
  protected toggleClubSearch(side: TeamSide): void {
    const next = this.clubOpen() === side ? null : side;
    this.clubOpen.set(next);
    this.clubError.set(null);
    if (next) void this.loadLeague(side);
  }

  protected onLeagueChange(side: TeamSide, event: Event): void {
    this.league.set((event.target as HTMLSelectElement).value);
    this.clubQuery.update((q) => ({ ...q, [side]: '' }));
    void this.loadLeague(side);
  }

  /** Seçili ligin kulüplerini listeye doldurur. */
  private async loadLeague(side: TeamSide): Promise<void> {
    this.clubSearching.set(side);
    this.clubError.set(null);
    try {
      const teams = await this.sportsDb.leagueTeams(this.league());
      this.clubResults.update((r) => ({ ...r, [side]: teams }));
      if (!teams.length) this.clubError.set(this.t('kadro.ligHatasi'));
    } catch {
      this.clubError.set(this.t('kadro.kulupServisi'));
    } finally {
      this.clubSearching.set(null);
    }
  }

  /** Açılır listenin dışına tıklayınca kapanır. */
  @HostListener('document:pointerdown', ['$event'])
  protected onDocumentPointerDown(event: PointerEvent): void {
    if (!this.clubOpen()) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.club-picker')) return;
    this.clubOpen.set(null);
  }

  protected onClubQueryInput(side: TeamSide, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.clubQuery.update((q) => ({ ...q, [side]: value }));
    // Her tuşta istek atmamak için kısa gecikme: ücretsiz anahtarın hız sınırı düşük.
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.runClubSearch(side), 350);
  }

  private async runClubSearch(side: TeamSide): Promise<void> {
    const term = this.clubQuery()[side];
    // Arama kutusu boşaltılınca liste yine LİGİN kulüplerine döner, boş kalmaz.
    if (term.trim().length < 2) {
      void this.loadLeague(side);
      return;
    }
    this.clubSearching.set(side);
    this.clubError.set(null);
    try {
      const teams = await this.sportsDb.searchTeams(term);
      this.clubResults.update((r) => ({ ...r, [side]: teams.slice(0, 10) }));
      if (!teams.length) this.clubError.set(this.t('kadro.kulupYok'));
    } catch {
      this.clubError.set(this.t('kadro.kulupServisiElle'));
    } finally {
      this.clubSearching.set(null);
    }
  }

  /**
   * Seçilen kulübün arması ve forması takıma yazılır; takım adı da kulübün adı olur.
   * Arama sonucunda forma gelmediyse (bazı kulüplerde `strEquipment` boş) forma arşivinden
   * en yeni sezonun forması çekilir — kullanıcı ayrıca bir şey seçmek zorunda kalmasın.
   */
  protected async pickClub(side: TeamSide, team: SportsDbTeam): Promise<void> {
    this.clubOpen.set(null);
    this.clubResults.update((r) => ({ ...r, [side]: [] }));
    this.clubQuery.update((q) => ({ ...q, [side]: '' }));
    this.store.updateTeam(side, {
      name: team.name,
      logoImage: team.badgeUrl,
      kitImage: team.kitUrl,
      keeperKitImage: null,
      clubName: team.name,
      clubId: team.id,
      // Kulübün kendi rengi varsa takım rengi de ona döner: forma görselinin çizilemediği
      // yerlerde (PNG çıktısı, mini rozetler) vektör forma kulüp renginde çıksın.
      ...(team.colour ? { color: team.colour } : {}),
    });

    // Forma arşivi: saha oyuncuları için ilk forma, KALECİ için farklı olan ikinci (deplasman)
    // forma. Arama sonucunda forma gelmediyse (bazı kulüplerde `strEquipment` boş) saha forması
    // da arşivden alınır. İkinci forma yoksa kaleci düz mor vektör formada kalır.
    try {
      const kits = await this.sportsDb.kits(team.id);
      if (!kits.length) return;
      const outfield = team.kitUrl ?? kits[0].url;
      const keeper = kits.find((k) => k.url !== outfield)?.url ?? null;
      this.store.updateTeam(side, { kitImage: outfield, keeperKitImage: keeper });
    } catch {
      // Forma bulunamazsa takım kendi renginde vektör formayla oynar — akış tıkanmaz.
    }
  }

  /** Kulübü ya da yüklenen logoyu bırakır: takım kendi rengine ve vektör formasına döner. */
  protected async clearClub(side: TeamSide): Promise<void> {
    const ok = await this.confirmSvc.ask({
      title: this.t('onay.kulupBaslik'),
      message: this.t('onay.kulupMetin'),
      confirmLabel: this.t('onay.kulupDugme'),
    });
    if (!ok) return;
    const current = this.teamAt(side);
    this.store.updateTeam(side, {
      logoImage: null,
      kitImage: null,
      keeperKitImage: null,
      clubName: null,
      clubId: null,
      /*
       * Kulüp seçilince takımın adı da kulübün adı oluyordu; "Temizle" arma ve formayı
       * bırakıyor ama ad "Barcelona" olarak kalıyordu (tarayıcı test raporu 8). Ad SADECE
       * kulüpten geldiyse varsayılana döner — kullanıcı kendi yazdıysa ona dokunulmaz.
       */
      ...(current.clubName && current.name === current.clubName ? { name: this.t('kadro.takimTaraf', { taraf: side }) } : {}),
    });
  }

  /** Kulüpten gelmeyen, kullanıcının kendi yüklediği logo mu? */
  protected hasOwnLogo(side: TeamSide): boolean {
    const team = this.teamAt(side);
    return !!team.logoImage && !team.clubName;
  }

  /**
   * İkinci yol: kendi logonu yükle. Kulüp seçiliyken de yüklenebilir — arma kullanıcının
   * görseliyle değişir, FORMA kulüpten kalır (kimi kullanıcı yalnızca armayı değiştirmek
   * istiyor). Görsel küçültülüp data URL olarak saklanır, yani PNG çıktısına da girer.
   */
  protected async onLogoSelected(side: TeamSide, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await this.imageService.toResizedDataUrl(file);
      this.store.updateTeam(side, { logoImage: dataUrl, clubName: null });
      this.clubError.set(null);
    } catch {
      this.clubError.set(this.t('kadro.logoHata'));
    } finally {
      input.value = '';
    }
  }

  teamAt(side: TeamSide) {
    return this.store.teams()[side === 'A' ? 0 : 1];
  }

  onNameInput(side: TeamSide, event: Event): void {
    this.store.updateTeam(side, { name: (event.target as HTMLInputElement).value });
  }

  /**
   * Boş takım adı kaydedilmez: rozet "??" gösteriyor ve kura ekranına adsız geçiliyordu
   * (kullanıcı geri bildirimi). Yazarken engellemek yerine — silip yeniden yazmak doğal bir
   * hareket — alandan ÇIKARKEN varsayılan ada dönülür.
   */
  onNameBlur(side: TeamSide, event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.value.trim()) return;
    const fallback = this.t('kadro.takimTaraf', { taraf: side });
    input.value = fallback;
    this.store.updateTeam(side, { name: fallback });
  }

  onColorPick(side: TeamSide, color: string): void {
    this.store.updateTeam(side, { color });
  }

}
