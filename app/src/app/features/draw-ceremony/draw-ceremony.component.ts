import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TeamSide } from '../../core/models/team.model';
import { SequenceService, SequenceSpeed } from '../../core/services/sequence.service';
import { SquadStore } from '../../core/services/squad-store.service';
import { AppButtonComponent } from '../../shared/components/app-button/app-button.component';
import { PlayerCardComponent } from '../../shared/components/player-card/player-card.component';
import { TeamBadgeComponent } from '../../shared/components/team-badge/team-badge.component';
import { TeamRosterPanelComponent } from '../../shared/components/team-roster-panel/team-roster-panel.component';
import { I18nService, ondalik } from '../../core/services/i18n.service';
import { OYUN_DICTIONARIES } from '../../core/i18n/oyun-dictionary';
import { takimAdiGoster } from '../../core/utils/team-name';

const BIG_CARD_PHASES = new Set(['walkout', 'counter', 'land']);
const PRISM_PHASES = new Set(['teamlogo', 'walkout']);

@Component({
    selector: 'app-draw-ceremony',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, 
        PlayerCardComponent,
        TeamBadgeComponent,
        TeamRosterPanelComponent,
        AppButtonComponent,
    ],
    templateUrl: './draw-ceremony.component.html',
    styleUrl: './draw-ceremony.component.scss'
})
export class DrawCeremonyComponent implements OnDestroy {
  /** Varsayılan "Takım A/B" ekranda çevrilir; kullanıcının verdiği ad olduğu gibi kalır. */
  protected readonly takimAdi = takimAdiGoster;

  private readonly i18n = inject(I18nService);
  /** Sözlük ekranla birlikte yükleniyor (giriş paketi şişmesin). */
  protected readonly t = this.i18n.t;

  protected readonly store = inject(SquadStore);
  protected readonly sequence = inject(SequenceService);
  private readonly router = inject(Router);

  protected readonly speeds: SequenceSpeed[] = [1, 2, 3];
  /**
   * Kura kullanıcı BAŞLATANA kadar beklemede durur. Önceden ekrana girer girmez tören
   * kendiliğinden akıyor (tercih hatırlanıyorsa tamamı anında açılıyordu) ve kullanıcı
   * kadroları daha "Kuraya başla" demeden görüyordu — kuranın sürprizi kalmıyordu.
   */
  protected readonly started = signal(false);
  protected readonly currentPlayer = this.sequence.currentPlayer;

  protected readonly sceneGlow = computed(() => {
    const color = this.sequence.washColor();
    const tint = color ?? '#7B2FF7';
    const opacity = color ? '66' : '33';
    return `radial-gradient(120% 100% at 50% 20%, ${tint}${opacity}, transparent 60%)`;
  });

  protected readonly showBigCard = computed(() => BIG_CARD_PHASES.has(this.sequence.phase()));
  protected readonly showPrisms = computed(() => PRISM_PHASES.has(this.sequence.phase()));
  protected readonly showBeams = computed(() => this.sequence.phase() === 'walkout');
  protected readonly showPosition = computed(() => this.sequence.phase() === 'position');
  protected readonly showTeamStamp = computed(() => this.sequence.phase() === 'teamlogo' && this.sequence.showTeamLogo());

  protected readonly teamPanelA = computed(() => this.teamPanel('A'));
  protected readonly teamPanelB = computed(() => this.teamPanel('B'));

  protected readonly prisms = Array.from({ length: 5 }, (_, i) => i);

  /**
   * Takım damgasında patlayan konfeti. Rastgele DEĞİL, tohumlu: her açılışta aynı desen
   * çıksın ve `OnPush` altında her change detection'da yeni bir dizi üretilmesin (o zaman
   * animasyon baştan başlıyordu). Açılar 360°'ye eşit dağılır, mesafe/gecikme/boy üç ayrı
   * ritimde salınır ki patlama mekanik görünmesin.
   */
  protected readonly burstPieces = Array.from({ length: 36 }, (_, i) => ({
    i,
    angle: Math.round((360 / 36) * i + (i % 3) * 4),
    distance: 180 + ((i * 37) % 220),
    delay: (i % 6) * 40,
    width: 5 + ((i * 13) % 6),
    height: 12 + ((i * 7) % 12),
    spin: 180 + ((i * 53) % 360),
    // 0: takım rengi, 1: beyaz, 2: vurgu yeşili — takım damgası ekranın en renkli anı.
    tone: i % 3,
  }));

  /** Ekran okuyucular için: her yeni oyuncu sahaya yerleştiğinde metin karşılığı duyurulur. */
  protected readonly announcement = computed(() => {
    const placed = this.sequence.placedIds();
    if (!placed.length) return '';
    const lastId = placed[placed.length - 1];
    const player = this.store.players().find((p) => p.id === lastId);
    if (!player) return '';
    const side = this.store.teamOfMap()[lastId];
    const teamName = side === 'A' ? this.store.teams()[0].name : this.store.teams()[1].name;
    return this.t('kura.acildi', { ad: player.input.name, reyting: player.ratings.overall, mevki: player.ratings.position, takim: teamName });
  });

  constructor() {
    this.i18n.register(OYUN_DICTIONARIES);
    if (!this.store.drawResult()) this.store.computeDraw();
    this.sequence.initialize(this.store.players(), this.store.teams(), this.store.teamOfMap());
    // Tören burada BAŞLATILMAZ; başlangıç ekranı bekler. "Sonucu doğrudan göster"i seçmiş
    // kullanıcının tercihi (rapor Ö4) unutulmuyor, o seçenek başlangıç ekranında öne çıkıyor.
  }

  /** Başlangıç ekranındaki birincil eylem: töreni başlatır ve ilk oyuncuyu açar. */
  startCeremony(): void {
    this.started.set(true);
    this.sequence.next();
  }

  /** Başlangıç ekranındaki ikincil eylem: töreni atlayıp iki kadroyu doğrudan gösterir. */
  revealAll(): void {
    this.started.set(true);
    this.sequence.skipAll();
  }

  /** Kullanıcı töreni tekrar izlemek isterse tercihi geri alır ve baştan başlatır. */
  replayCeremony(): void {
    this.sequence.forgetSkipPreference();
    this.sequence.initialize(this.store.players(), this.store.teams(), this.store.teamOfMap());
    this.started.set(false);
  }

  ngOnDestroy(): void {
    this.sequence.stop();
  }

  next(): void {
    this.sequence.next();
  }

  skip(): void {
    this.sequence.skip();
  }

  toggleAutoPlay(): void {
    this.sequence.toggleAutoPlay();
  }

  skipAll(): void {
    this.sequence.skipAll();
  }

  setSpeed(speed: SequenceSpeed): void {
    this.sequence.setSpeed(speed);
  }

  goToPitch(): void {
    this.router.navigateByUrl('/pitch');
  }

  /** Topbar'daki geri dönüş — kura sonucu store'da kaldığı için kaybolan bir şey olmaz. */
  goToSquad(): void {
    this.router.navigateByUrl('/squad');
  }

  private teamPanel(side: TeamSide) {
    const team = this.store.teams()[side === 'A' ? 0 : 1];
    const players = side === 'A' ? this.store.teamAPlayers() : this.store.teamBPlayers();
    const placed = new Set(this.sequence.placedIds());
    const revealed = players.filter((p) => placed.has(p.id)).sort((a, b) => b.ratings.overall - a.ratings.overall);
    const avg = revealed.length
      ? ondalik(revealed.reduce((sum, p) => sum + p.ratings.overall, 0) / revealed.length)
      : '—';
    return { team, total: players.length, revealed, avg };
  }
}
