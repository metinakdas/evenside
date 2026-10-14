import { ConfirmService } from '../../core/services/confirm.service';
import { NoticeService } from '../../core/services/notice.service';
import { PlayerFormService } from '../../core/services/player-form.service';
import { takimAdiGoster } from '../../core/utils/team-name';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatchRecord, MatchHistoryService } from '../../core/services/match-history.service';
import { PlayerRepositoryService } from '../../core/services/player-repository.service';
import { SquadStore } from '../../core/services/squad-store.service';
import { MyTeam, SquadInviteService } from '../../core/services/squad-invite.service';
import { ActiveTeamService } from '../../core/services/active-team.service';
import { UserScopeService } from '../../core/services/user-scope.service';
import { TeamBadgeComponent } from '../../shared/components/team-badge/team-badge.component';
import { StarBallComponent } from '../../shared/components/star-ball/star-ball.component';
import { PitchJugglerComponent } from '../../shared/components/pitch-juggler/pitch-juggler.component';
import { AccountDialogComponent } from '../../shared/components/account-dialog/account-dialog.component';
import { PlayerCardComponent } from '../../shared/components/player-card/player-card.component';
import { OnboardingPromptComponent } from '../../shared/components/onboarding-prompt/onboarding-prompt.component';
import { AuthService } from '../../core/services/auth.service';
import { I18nService, ondalik, yuzde } from '../../core/services/i18n.service';
import { MENU_DICTIONARIES } from '../../core/i18n/menu-dictionary';

type HomeTab = 'oyna' | 'takimlar' | 'gecmis';

/**
 * ANA MENÜ. Uygulama artık doğrudan kadro ekranıyla değil bu menüyle açılıyor (kullanıcı
 * isteği): FIFA'nın oyun menüsündeki gibi bir sekme şeridi ve kutu ızgarası — solda büyük
 * birincil kutu, yanında sıradaki maç, kadro ve havuz kutuları.
 *
 * Kutular "dekor" değil, gerçek veriyi gösterir: sıradaki maç \`MatchHistoryService\`'ten gelir
 * ve vakte göre kendini günceller (geçmişte kalınca "son maç" kutusuna düşer), kadro kutusu
 * kadronun doluluğunu, havuz kutusu havuzdaki oyuncu sayısını okur.
 */
/** Kura yorumu için en az kaç ölçülebilir (reyting farkı olan, berabere bitmeyen) maç gerekir. */
const MIN_EDGE_GAMES = 5;

@Component({
    selector: 'app-home',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, StarBallComponent, TeamBadgeComponent, OnboardingPromptComponent, PlayerCardComponent, AccountDialogComponent, PitchJugglerComponent],
    templateUrl: './home.component.html',
    styleUrl: './home.component.scss'
})
export class HomeComponent {
  protected readonly store = inject(SquadStore);
  private readonly history = inject(MatchHistoryService);
  private readonly playerForm = inject(PlayerFormService);
  private readonly scope = inject(UserScopeService);
  private readonly pool = inject(PlayerRepositoryService);
  /**
   * Havuz ŞU ANKİ kullanıcı için yüklendi mi — "kartın var mı" sorusu ancak ondan sonra
   * cevaplanabilir. Tek seferlik `pool.ready` promise'i YETMİYOR: oturumsuz açılışta da
   * çözülüyor ve giriş yapan kullanıcı için havuz gelene kadar "kartın yok" kararı
   * verilmiş oluyordu (bkz. `PlayerRepositoryService.readyForUser`).
   */
  protected readonly poolReady = computed(() => this.pool.readyForUser());
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly invites = inject(SquadInviteService);
  private readonly confirmSvc = inject(ConfirmService);
  private readonly notices = inject(NoticeService);
  private readonly activeTeamService = inject(ActiveTeamService);
  private readonly i18n = inject(I18nService);
  /** Şablon çevirileri buradan okur; sözlük ekranın kendi parçasında yükleniyor. */
  protected readonly t = this.i18n.t;

  protected readonly tabs = computed<{ id: HomeTab; label: string }[]>(() => [
    { id: 'oyna', label: this.t('menu.oyna') },
    { id: 'takimlar', label: this.t('menu.takimlarim') },
    { id: 'gecmis', label: this.t('menu.gecmis') },
  ]);
  protected readonly tab = signal<HomeTab>('oyna');

  /** Sıradaki maç: başlama vakti gelecekte olan en yakın kayıt. */
  protected readonly nextMatch = computed(() => this.history.all() && this.history.next());
  /** Son maç: vakti geçmiş en yeni kayıt. */
  protected readonly lastMatch = computed(() => this.history.all() && this.history.last());
  /** Geçmiş sekmesi: tüm kayıtlar, yeniden eskiye. */
  protected readonly records = computed(() => this.history.all());

  /* ---------------- TAKIM GEÇMİŞİ: skor girişi ve kadro içeriği ---------------- */

  /** Skoru düzenlenen maç (id) — aynı anda yalnızca biri açık. */
  protected readonly scoringId = signal<string | null>(null);
  /** Kadrosu açık olan maçlar; birden fazlası aynı anda açık kalabilir (karşılaştırma için). */
  protected readonly openRosters = signal<ReadonlySet<string>>(new Set());
  protected readonly scoreA = signal('');
  protected readonly scoreB = signal('');

  /** Kura, takımları reyting ortalamasına göre eşitler; analiz bunun sahada tutup tutmadığını ölçer. */
  protected readonly analysis = computed(() => this.history.analysis());
  /**
   * Skorlardan gelen form düzeltmesi — kuraya giren değer. En büyük altı düzeltme (iki yön de)
   * gösterilir: kullanıcı kuranın kimi neden farklı tarttığını görsün.
   */
  protected readonly formList = computed(() =>
    [...this.playerForm.form().values()]
      .filter((e) => Math.abs(e.delta) >= 0.5)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 6)
      .map((e) => ({ ...e, text: (e.delta > 0 ? "+" : "−") + ondalik(Math.abs(e.delta)) })),
  );

  /** Skoru bu kullanıcı girebilir mi: takımın ortak maçında yalnızca kurucu/yönetici. */
  protected canScore(record: MatchRecord): boolean {
    return this.history.canScore(record);
  }

  protected startScoring(record: MatchRecord, event?: Event): void {
    event?.stopPropagation();
    // Düğme gizli ama yol yine de kapalı (bkz. "düğme gizlemek YETMEZ").
    if (!this.canScore(record)) return;
    this.scoringId.set(record.id);
    this.scoreA.set(record.score ? String(record.score.a) : '');
    this.scoreB.set(record.score ? String(record.score.b) : '');
  }

  protected cancelScoring(): void {
    this.scoringId.set(null);
  }

  protected onScoreInput(side: 'a' | 'b', event: Event): void {
    // Yalnızca rakam: halı sahada iki hane fazlasıyla yeter, harf girilmesinin anlamı yok.
    // DİKKAT: `\D` — ters eğik çizgi bir betik düzenlemesinde düşmüş, kalıp `/D/g` olarak yalnızca
    // "D" harfini siliyordu; "ab", "-1", "2." kabul ediliyordu (tarama, 10 Ekim 2026).
    const value = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 2);
    (side === 'a' ? this.scoreA : this.scoreB).set(value);
    (event.target as HTMLInputElement).value = value;
  }

  protected saveScore(id: string): void {
    const a = this.scoreA().trim();
    const b = this.scoreB().trim();
    // İki taraf da boşsa skor SİLİNİR; biri boşsa kaydedilmez (yarım skor bir şey anlatmaz).
    if (!a && !b) {
      void this.history.setScore(id, null, null);
      this.scoringId.set(null);
      return;
    }
    if (!a || !b) return;
    // İkinci kapı: alan bir şekilde rakam dışı bir şey taşırsa (yapıştırma, otomatik doldurma) NaN kaydedilmez.
    if (!/^\d{1,2}$/.test(a) || !/^\d{1,2}$/.test(b)) return;
    void this.history.setScore(id, Number(a), Number(b));
    this.scoringId.set(null);
  }

  protected toggleRoster(id: string): void {
    this.openRosters.update((open) => {
      const next = new Set(open);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  protected isRosterOpen(id: string): boolean {
    return this.openRosters().has(id);
  }

  /** 'A' | 'B' | 'X' (berabere) | null (skor yok) — kazananı vurgulamak için. */
  protected winner(record: MatchRecord): 'A' | 'B' | 'X' | null {
    if (!record.score) return null;
    if (record.score.a === record.score.b) return 'X';
    return record.score.a > record.score.b ? 'A' : 'B';
  }

  /**
   * Tek maçın denge yorumu: kuranın öngördüğü fark (ortalama reyting) ile sahadaki fark
   * (gol) yan yana. "Kura ne dedi, saha ne dedi" — kullanıcının asıl merak ettiği bu.
   */
  protected balanceNote(record: MatchRecord): string {
    const avgA = Number(record.teamA.avg.replace(',', '.'));
    const avgB = Number(record.teamB.avg.replace(',', '.'));
    const gap = Number.isFinite(avgA) && Number.isFinite(avgB) ? Math.abs(avgA - avgB) : null;
    const gapText = gap === null ? '—' : ondalik(gap);
    if (!record.score) return this.t('menu.skorBekleniyor', { fark: gapText });
    const diff = Math.abs(record.score.a - record.score.b);
    if (diff === 0) return this.t('menu.berabereYorum', { fark: gapText });
    return this.t('menu.golFark', { fark: gapText, gol: diff });
  }

  protected readonly minEdgeGames = MIN_EDGE_GAMES;
  /** Varsayılan "Takım A/B" adı GÖSTERİMDE seçili dile çevrilir (veri değişmez). */
  protected readonly takimAdi = takimAdiGoster;

  /** Analiz kutusundaki tek cümlelik yorum: sayı değil, ne anlama geldiği. */
  protected readonly edgeVerdict = computed(() => {
    const rate = this.analysis()?.ratingEdgeRate;
    if (rate === null || rate === undefined) return this.t('menu.skorGir');
    // Bir-iki maçtan hüküm çıkmaz: tek maçta oran ya %0 ya %100'dür ve "kura dengeli" ya da
    // "dengesiz" demek yanıltıcı olurdu (tarama, 10 Ekim 2026).
    const oyun = this.analysis()?.edgeGames ?? 0;
    if (oyun < MIN_EDGE_GAMES) return this.t('menu.oranAzVeri', { oyun, gerek: MIN_EDGE_GAMES });
    const pct = Math.round(rate * 100);
    if (pct <= 60) return this.t('menu.oranIyi', { oran: pct });
    if (pct <= 75) return this.t('menu.oranOrta', { oran: pct });
    return this.t('menu.oranKotu', { oran: pct });
  });

  protected percent(value: number): string {
    return yuzde(value);
  }

  protected oneDecimal(value: number): string {
    return ondalik(value);
  }

  /** Kadro dolu mu — "Sıradaki maç" kutusunun nereye götüreceğini belirler. */
  protected readonly squadReady = computed(() => this.store.isSquadComplete());

  /** Kullanıcının kendi kartı — "KARTIM" kutusunu besler. */
  protected readonly ownCard = computed(() => this.pool.ownCard());

  /**
   * KARTIM kutusundaki DİZİLİŞ: kale 1 · defans 3 · orta saha 2 · forvet 1 (7v7'nin
   * varsayılan 3-2-1'i). Tek bir büyük kart yerine sahaya dağılmış küçük kartlar, kutunun
   * ne anlattığını tek bakışta söylüyor: "kartın bu kadronun içinde bir yer tutuyor".
   *
   * Kullanıcının KENDİ kartı, mevkisine karşılık gelen yuvaya oturur ve orada gerçek kart
   * olarak basılır; kalan yuvalar hayalet kalır. Kart yoksa yedi yuva da hayalettir.
   *
   * Koordinatlar yüzde: sahanın sol kenarı kale, sağ kenarı rakip kalesi.
   */
  protected readonly lineupSpots = computed(() => {
    const card = this.ownCard();
    const spots = [
      { id: 'kal', x: 10, y: 50, line: 'KAL' },
      { id: 'def-ust', x: 27, y: 20, line: 'DEF' },
      { id: 'def-orta', x: 24, y: 50, line: 'DEF' },
      { id: 'def-alt', x: 27, y: 80, line: 'DEF' },
      { id: 'os-ust', x: 50, y: 32, line: 'OS' },
      { id: 'os-alt', x: 50, y: 68, line: 'OS' },
      { id: 'for', x: 70, y: 50, line: 'FOR' },
    ];
    // Kartın mevkisi hangi hatta düşüyorsa o hattın ORTA yuvası kullanıcıya ayrılır.
    const mineId =
      card?.ratings.position === 'KAL'
        ? 'kal'
        : card?.ratings.position === 'DEF'
          ? 'def-orta'
          : card?.ratings.position === 'OS'
            ? 'os-ust'
            : 'for';
    return spots.map((spot) => ({ ...spot, mine: !!card && spot.id === mineId }));
  });

  /* ---------------- İLK KULLANICI: HOŞ GELDİN / YOL HARİTASI ---------------- */

  /**
   * Yeni kullanıcı menüye "ne yapacağım" sorusuyla geliyor; ekranda ise birbirinden bağımsız
   * kutular var. Bu kart o boşluğu dolduruyor: karşılama + ÜÇ ADIMLIK yol haritası.
   *
   * Statik bir "hoş geldin" değil, İLERLEME kartı: adımlar tamamlandıkça işaretlenir ve üçü
   * de bitince kart kendiliğinden kaybolur — yani kullanıcıyı kapatmaya zorlamaz. Yine de
   * kapatmak isteyene "Gizle" var (tercih kullanıcıya özel saklanır).
   */
  /** Kart kapalı mı — kapalıyken yerinde ince bir şerit durur, kart yok olmaz. */
  /** HESABIM paneli açık mı. Menüde yalnızca "Çıkış" vardı; şifre/hesap işleri buradan. */
  /* ------------------------------------------------------------------ *
   * YOL HARİTASINDAKİ KOŞUCU
   *
   * Koşucu, sıradaki adımın hizasında durur ve adım tamamlanınca bir alttaki istasyona
   * zıplar. Konum CSS ile hesaplanamaz: satır yükseklikleri içeriğe göre değişiyor
   * (sıradaki adım "Adıma başla"/"Bu adımı atla" düğmeleri yüzünden ~6px daha yüksek).
   * Bu yüzden aktif satırın numara rozetinin merkezi GERÇEK DOM'dan ölçülüyor.
   * ------------------------------------------------------------------ */
  private readonly stepList = viewChild<ElementRef<HTMLElement>>('welcomeSteps');
  private readonly zone = inject(NgZone);

  /** Koşucunun duracağı y (liste kutusuna göre, px). */
  protected readonly runnerY = signal(30);
  /** Sıçrama sürüyor mu — poz ve yay animasyonu buna bakıyor. */
  protected readonly runnerMoving = signal(false);
  private lastRunnerStep: string | null = null;
  private resize: ResizeObserver | null = null;
  /*
   * YOLCULUK KİLİDİ. ResizeObserver yükleme sırasında tetikleniyor ve koşucuyu SESSİZCE
   * hedefe taşıyordu; 450ms sonra gelen "koşarak git" çağrısı "zaten oradayım" deyip
   * dönüyor, sıçrama hiç oynamıyordu (tarayıcıda örnekleyerek bulundu). Kilit açıkken
   * yeniden boyutlanma konuma dokunmaz.
   */
  private journeyLock = false;

  protected readonly accountOpen = signal(false);

  protected readonly welcomeCollapsed = signal(this.readWelcomeHidden());

  /** Kullanıcının "şimdilik geç" dediği adımlar — kişiye özel hatırlanır. */
  private readonly skipped = signal<ReadonlySet<string>>(this.readSkipped());

  protected readonly steps = computed(() => [
    {
      id: 'kart',
      label: this.t('menu.adimKart'),
      hint: this.t('menu.adimKartIpucu'),
      time: '~1 dk',
      tip: this.t('menu.adimKartTip'),
      done: !!this.ownCard(),
      // Kart olmadan da takıma katılınabilir; bu adım ertelenebilir.
      skippable: true,
    },
    {
      id: 'takim',
      label: this.t('menu.adimTakim'),
      hint: this.t('menu.adimTakimIpucu'),
      time: '~30 sn',
      tip: this.t('menu.adimTakimTip'),
      done: this.teams().length > 0,
      // ATLANAMAZ: takım olmadan kadro da kura da yok — uygulamanın zorunlu adımı.
      skippable: false,
    },
    {
      id: 'mac',
      label: this.t('menu.adimMac'),
      hint: this.t('menu.adimMacIpucu'),
      time: '~2 dk',
      tip: this.t('menu.adimMacTip'),
      done: this.records().length > 0,
      skippable: true,
    },
  ]);

  /** Sıradaki adım — kartın birincil eylemi buna göre değişir. */
  /** Sıradaki adım: tamamlanmamış VE atlanmamış ilk adım. */
  protected readonly nextStep = computed(
    () => this.steps().find((s) => !s.done && !this.skipped().has(s.id)) ?? null,
  );

  protected isSkipped(id: string): boolean {
    return this.skipped().has(id);
  }

  protected readonly welcomeVisible = computed(() => {
    // Veri gelmeden karar verme: yüklenirken kart bir an açılıp kapanmasın.
    if (!this.teamsLoaded() || !this.poolReady()) return false;
    // Takım listesi hatayla geldiyse "takımın yok" deme (bildirim zaten "Tekrar dene" sunuyor).
    if (this.invites.teamsFailed?.()) return false;
    /*
     * TAKIMI OLAN KULLANICI "başlangıçta" değildir (kullanıcı isteği). 2. adım (takım kurma)
     * uygulamanın eşiği: o geçilmişse menüde yol haritası değil, kutuların kendisi konuşur.
     * Kalan adımlar (kart, ilk maç) zaten kendi kutularından erişilebiliyor.
     */
    if (this.steps().find((s) => s.id === 'takim')?.done) return false;
    return !!this.nextStep();
  });

  /** Adımın kendi ekranına götürür. */
  protected startStep(id: string): void {
    if (id === 'kart') void this.router.navigateByUrl('/my-card');
    else if (id === 'takim') void this.router.navigateByUrl('/create-team');
    else {
      // Üçüncü adım kadroya götürür: takım zaten var, sıradaki iş kurayı çekmek.
      const team = this.activeTeam() ?? this.teams()[0];
      if (team) this.openSquad(team.squad.id);
    }
  }

  /** "Bu adımı atla" — adım listede kalır ama sıra bir sonrakine geçer; geri alınabilir. */
  protected skipStep(id: string): void {
    // Zorunlu adım atlanamaz (takım): arayüzde düğme yok, kapı burada da kapalı.
    if (!this.steps().find((s) => s.id === id)?.skippable) return;
    this.writeSkipped(new Set([...this.skipped(), id]));
  }

  protected unskipStep(id: string): void {
    const next = new Set(this.skipped());
    next.delete(id);
    this.writeSkipped(next);
  }

  private writeSkipped(value: ReadonlySet<string>): void {
    this.skipped.set(value);
    try {
      localStorage.setItem(this.scope.key('saha42.welcome.skip.v1'), JSON.stringify([...value]));
    } catch {
      // Hatırlanamazsa adım bir sonraki açılışta yine sırada görünür; akışı bozmaz.
    }
  }

  private readSkipped(): ReadonlySet<string> {
    try {
      const raw = localStorage.getItem(this.scope.key('saha42.welcome.skip.v1'));
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  }

  /** Kartı kapatır/açar; tercih kullanıcıya özel hatırlanır. */
  protected toggleWelcome(): void {
    const next = !this.welcomeCollapsed();
    this.welcomeCollapsed.set(next);
    try {
      localStorage.setItem(this.scope.key('saha42.welcome.v1'), next ? '1' : '0');
    } catch {
      // Hatırlanamazsa kart bir sonraki açılışta açık gelir; akışı bozmaz.
    }
  }

  /** Şeritte ve rozette gösterilen ilerleme: "1 / 3". */
  protected readonly welcomeProgress = computed(() => {
    const steps = this.steps();
    return { done: steps.filter((s) => s.done).length, total: steps.length };
  });

  private readWelcomeHidden(): boolean {
    try {
      return localStorage.getItem(this.scope.key('saha42.welcome.v1')) === '1';
    } catch {
      return false;
    }
  }

  /**
   * Kullanıcının ait olduğu takımlar. Takımı olduğu anda menünün birincil kutusu "takım kur"
   * demeyi bırakıp takımlarını gösterir (kullanıcı isteği) — kurulmuş bir takımı olan birine
   * hâlâ "takım kur" demek, menünün en büyük alanını boşa harcamak olurdu.
   */
  protected readonly teams = computed(() => this.invites.myTeams());
  /** Takımlar yüklenmeden kutu hiçbir şey iddia etmez (bkz. `teamsLoaded`). */
  protected readonly teamsLoaded = computed(() => this.invites.teamsLoaded());
  protected readonly ownedTeam = computed(() => this.teams().find((t) => t.role === 'kurucu') ?? null);

  /**
   * SEÇİLİ TAKIM artık ortak serviste: kadroyu da o belirliyor (`SquadStore` aynı sinyali
   * okuyor). Menüde seçilen takım, /kadro'da açılan kadronun ta kendisi olmalı — iki ayrı
   * yerde tutulsaydı menüde "Salı Grubu" seçiliyken kadro ekranında başka takımın kadrosu
   * açılabilirdi.
   */
  protected readonly activeTeam = computed<MyTeam | null>(() => {
    const id = this.activeTeamService.teamId();
    const list = this.teams();
    return list.find((x) => x.squad.id === id) ?? this.ownedTeam() ?? list[0] ?? null;
  });

  /** Seçili takımın kadrosuna girilebilir mi — yalnızca KURDUĞUN takımın kadrosu senindir. */
  protected readonly activeIsOwned = computed(() => this.activeTeam()?.role === 'kurucu');

  protected selectTeam(id: string): void {
    this.activeTeamService.select(id);
  }

  /** Satırdaki "kadroya geç": önce o takımı seçer, sonra kadro ekranına götürür. */
  protected openSquad(teamId: string): void {
    this.activeTeamService.select(teamId);
    this.go('/squad');
  }

  /** Onay sorup takımdan ayrılır; açık takım ise kendiliğinden başka takıma geçilir. */
  protected async leaveTeam(teamId: string, name: string): Promise<void> {
    const ad = name || this.t('ui.adsizTakim');
    const ok = await this.confirmSvc.ask({
      title: this.t('menu.ayrilBaslik'),
      message: this.t('menu.ayrilMetin', { takim: ad }),
      confirmLabel: this.t('menu.ayril'),
      danger: true,
    });
    if (!ok) return;
    if (await this.invites.leaveTeam(teamId)) {
      this.notices.success(this.t('menu.ayrildin', { takim: ad }));
    } else {
      this.notices.error(this.t('menu.ayrilamadin'));
    }
  }

  protected editTeam(teamId: string): void {
    void this.router.navigateByUrl(`/create-team?edit=${teamId}`);
  }

  constructor() {
    /* Menünün sözlüğü ekranla birlikte yükleniyor: giriş paketi altı dilin metniyle şişmiyor. */
    this.i18n.register(MENU_DICTIONARIES);
    this.watchRunner();
    // Menü her açıldığında takımın ortak geçmişi tazelenir: başkasının girdiği skor görünsün.
    this.history.refresh();

    /*
     * Menü belirli bir sekmeyle açılabilsin: `/?sekme=takimlar`. Başka ekranlardan menüye
     * dönerken kullanıcıyı GELDİĞİ yere bırakmak için gerekli — "şimdi değil" deyip menünün
     * ilk sekmesinde bulmak, yaptığı işi kaybetmiş gibi hissettiriyor.
     */
    const tab = this.route.snapshot.queryParamMap.get('sekme');
    if (tab && this.tabs().some((sekme) => sekme.id === tab)) this.tab.set(tab as HomeTab);

    /*
     * Takımlar OTURUMA bağlı. `effect` kullanıcıyı okuduğu için oturum geri yüklendiğinde ya da
     * kullanıcı değiştiğinde takımlar yeniden yükleniyor. Tek seferlik bir çağrı yetmiyordu:
     * menü açıldığında oturum henüz hazır olmayabiliyor ve takımı olan kullanıcıya
     * "TAKIM KUR" yazıyordu.
     *
     * Sinyal yazımı `await`in ötesinde (mikro görevde) gerçekleşiyor, yani effect'in tepkisel
     * bağlamının içinde değil — NG0600 tuzağına düşmüyor.
     */
    effect(() => {
      this.auth.user();
      void this.invites.loadMyTeams();
    });
  }

  protected setTab(tab: HomeTab): void {
    this.tab.set(tab);
  }

  /**
   * Çıkış düğmesi burada `UserMenuComponent` DEĞİL: tasarımın kendi pill'i (ince kenar,
   * hover'da yeşil) ve o bileşenin stilleri dışarıdan değiştirilemiyor.
   */
  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    void this.router.navigateByUrl('/login');
  }

  protected go(path: string): void {
    void this.router.navigateByUrl(path);
  }

  /** `2026-09-13T21:00` → `13 Eylül Cumartesi · 21:00`. */
  protected formatKickoff(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    const date = parsed.toLocaleDateString(this.i18n.locale(), { day: 'numeric', month: 'long', weekday: 'long' });
    const time = parsed.toLocaleTimeString(this.i18n.locale(), { hour: '2-digit', minute: '2-digit' });
    return `${date} · ${time}`;
  }

  /**
   * Maça kalan süre — "2 gün 4 saat" gibi. Sıradaki maç kutusunun canlı kalmasını sağlar;
   * vakit geçince kayıt zaten "son maç" tarafına düşer.
   */
  protected countdown(record: MatchRecord): string {
    const diff = new Date(record.kickoff).getTime() - Date.now();
    if (Number.isNaN(diff) || diff <= 0) return this.t('menu.basliyor');
    const hours = Math.floor(diff / 3_600_000);
    const days = Math.floor(hours / 24);
    if (days >= 1) return this.t('menu.kalanGun', { gun: days, saat: hours % 24 });
    const minutes = Math.floor((diff % 3_600_000) / 60_000);
    return hours >= 1 ? this.t('menu.kalanSaat', { saat: hours, dakika: minutes }) : this.t('menu.kalanDakika', { dakika: minutes });
  }

  /** Kayıttaki takımı `TeamBadgeComponent`'ın beklediği biçime çevirir. */
  protected badgeTeam(record: MatchRecord, side: 'A' | 'B') {
    const team = side === 'A' ? record.teamA : record.teamB;
    return { side, name: team.name, color: team.color, logoImage: team.logoImage };
  }

  /**
   * Aktif istasyonun merkezini ölçüp koşucuyu oraya taşır.
   *
   * `effect` iki şeyi izliyor: sıradaki adım (değişince zıplar) ve kartın görünürlüğü
   * (kart yeni basıldıysa ölçüm ancak o zaman mümkün). Ölçüm DOM okuması olduğu için
   * bir kare beklenir — aksi hâlde satırlar henüz yerleşmemiş olur ve 0 okunur.
   */
  private measureRunner(hareketli: boolean): void {
    const liste = this.stepList()?.nativeElement;
    if (!liste) return;

    const hedefId = this.nextStep()?.id ?? this.steps()[this.steps().length - 1]?.id;
    const satirlar = [...liste.querySelectorAll<HTMLElement>('.welcome__step')];
    const index = this.steps().findIndex((s) => s.id === hedefId);
    const satir = satirlar[index < 0 ? satirlar.length - 1 : index];
    if (!satir) return;

    const rozet = satir.querySelector<HTMLElement>('.welcome__num') ?? satir;
    const merkez = rozet.offsetTop + rozet.offsetHeight / 2 + satir.offsetTop;
    // offsetTop rozet için satıra göre; satırın kendi offsetTop'u listeye göre.
    const y = rozet.offsetParent === satir ? satir.offsetTop + rozet.offsetTop + rozet.offsetHeight / 2 : merkez;

    const farkli = Math.abs(this.runnerY() - y) >= 0.5;
    if (farkli) this.runnerY.set(y);
    // Yerinde duruyorsa sıçratmaya gerek yok; hareket istenmiyorsa da iş burada biter.
    if (!hareketli || !farkli) return;

    this.runnerMoving.set(true);
    /* Zamanlayıcı Angular bölgesinin DIŞINDA: bölge içindeki uzun zamanlayıcı uygulamayı
       "kararsız" tutar ve whenStable bekleyen testleri kilitler (projede iki kez yaşandı). */
    this.zone.runOutsideAngular(() => {
      setTimeout(() => {
        this.runnerMoving.set(false);
        this.journeyLock = false;
      }, 720);
    });
  }

  private watchRunner(): void {
    effect(() => {
      // İzlenecek sinyaller ERKEN DÖNÜŞTEN ÖNCE okunmalı, yoksa effect onları bir daha izlemez.
      const sirada = this.nextStep()?.id ?? null;
      const gorunur = this.welcomeVisible() && !this.welcomeCollapsed();
      if (!gorunur) {
        this.lastRunnerStep = null;
        return;
      }

      const ilkYerlesme = this.lastRunnerStep === null;
      const degisti = this.lastRunnerStep !== sirada;
      this.lastRunnerStep = sirada;

      this.zone.runOutsideAngular(() => {
        // Bir kare bekle: satırlar yerleşmeden ölçüm 0 okur.
        requestAnimationFrame(() => {
          this.zone.run(() => {
            if (ilkYerlesme) {
              /* Açılışta koşucu ilk istasyondan başlayıp sıradakine KOŞARAK gelir: kart
                 açıldığı anda gözü doğru satıra çeken şey bu yolculuk. */
              this.journeyLock = true;
              this.runnerY.set(30);
              setTimeout(() => this.measureRunner(true), 450);
              return;
            }
            /*
             * Effect veri geldikçe YENİDEN çalışıyor. Kilit olmadan ikinci tur, planlanmış
             * yolculuğu ezip koşucuyu sessizce hedefe ışınlıyordu (tarayıcıda günlükle
             * bulundu: 'ilk yerleşme 30' → hemen ardından 'measure(false) → 100').
             */
            if (this.journeyLock) return;
            if (degisti) this.journeyLock = true;
            this.measureRunner(degisti);
          });
        });
      });
    });

    /* Satır yüksekliği değişirse (pencere daralması, metin sarması) koşucu kaymasın. */
    effect(() => {
      const liste = this.stepList()?.nativeElement;
      this.resize?.disconnect();
      if (!liste || typeof ResizeObserver === 'undefined') return;
      this.resize = new ResizeObserver(() => {
        if (this.journeyLock) return; // yolculuk sürerken konuma karışma
        this.zone.run(() => this.measureRunner(false));
      });
      this.resize.observe(liste);
    });
  }
}
