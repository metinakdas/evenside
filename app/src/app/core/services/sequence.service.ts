import { Injectable, computed, signal } from '@angular/core';
import { Player } from '../models/player.model';
import { TeamInfo, TeamSide } from '../models/team.model';

export type SequencePhase = 'idle' | 'prep' | 'position' | 'teamlogo' | 'walkout' | 'counter' | 'land';
export type CeremonyTier = 'sade' | 'altin' | 'walkout';
/**
 * Tören hız çarpanı. 2× ve 3× kullanıcı geri bildirimiyle eklendi: 12 oyuncu için
 * "İleri sar" bile ~1 dakika sürüyordu. Faz süreleri bu değere BÖLÜNÜR (bkz. `d()`).
 */
export type SequenceSpeed = 1 | 2 | 3;

const SPEED_KEY = 'saha42.ceremony.speed';
const SKIP_KEY = 'saha42.ceremony.skipAll';
/** Yalnızca 1× · 2× · 3× (11 Ekim 2026, kullanıcı isteği; 0.75× ve 1.5× kaldırıldı). */
const ALLOWED_SPEEDS: SequenceSpeed[] = [1, 2, 3];

/** Kayıtlı hız tercihi; okunamıyorsa ya da artık sunulmayan bir değerse (0.75, 1.5) 1×. */
function readStoredSpeed(): SequenceSpeed {
  try {
    const raw = Number(localStorage.getItem(SPEED_KEY));
    return ALLOWED_SPEEDS.find((s) => s === raw) ?? 1;
  } catch {
    return 1;
  }
}

function readStoredSkip(): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === '1';
  } catch {
    return false;
  }
}

export interface ConfettiPiece {
  id: number;
  left: number;
  size: number;
  color: string;
  duration: number;
  delay: number;
}

const CONFETTI_COLORS = ['#7B2FF7', '#00F57A', '#FFFFFF', '#B98CFF'];
const CONFETTI_COUNT = 30;
/** Takım logosu belirmeden önce sahne ışığının o takımın rengine boyanmaya başlaması (Faz 5.3). */
const TEAM_WASH_LEAD_MS = 200;

/**
 * Kura töreninin faz zamanlayıcısı. Tüm animasyon durumu burada, `DrawCeremonyComponent`
 * sadece bu sinyalleri görüntüler (bkz. proje notları Faz 5.1). Süreler prototipten
 * geldi ama faz LİSTESİ artık kullanıcı geri bildirimiyle değişti: prototip düşük reytingli
 * oyuncuları kısa/sade geçiriyordu, bu tutarsız hissettirdi ("bazısında animasyon var
 * bazısında yok") — şimdi HERKES aynı tam sırayı (mevki → takım logosu → yürüyüş → kart)
 * aynı hızda görüyor; sadece en üst dilim (walkout, 85+) üstüne konfeti/kamera sarsıntısı
 * ekleniyor — bu bir SÜS, sıradaki kutuları değiştirmiyor.
 */
@Injectable({ providedIn: 'root' })
export class SequenceService {
  private timers: ReturnType<typeof setTimeout>[] = [];
  private raf: number | null = null;

  private readonly order = signal<Player[]>([]);
  private readonly teams = signal<[TeamInfo, TeamInfo]>([
    { side: 'A', name: '', color: '#7B2FF7', logoImage: null },
    { side: 'B', name: '', color: '#00F57A', logoImage: null },
  ]);
  private readonly teamOf = signal<Record<string, TeamSide>>({});

  readonly currentIndex = signal(-1);
  readonly phase = signal<SequencePhase>('idle');
  readonly phaseDurationMs = signal(0);
  readonly locked = signal(false);
  readonly finished = signal(false);
  readonly placedIds = signal<string[]>([]);
  readonly displayRating = signal(0);
  readonly revealedStats = signal(0);
  readonly confetti = signal<ConfettiPiece[]>([]);
  readonly shaking = signal(false);
  readonly showTeamLogo = signal(false);
  readonly washColor = signal<string | null>(null);
  /**
   * Varsayılan 1× (seçenekler yalnızca 1× · 2× · 3×; eski 0.75× varsayılanı kaldırıldı).
   * Kullanıcının seçtiği hız cihaz başına hatırlanır: ilk seferde etkileyici olan tören
   * üçüncüde eziyet oluyordu (kontrol raporu Ö4).
   */
  readonly speed = signal<SequenceSpeed>(readStoredSpeed());
  readonly reducedMotion = signal(false);
  /** "İleri sar" — açık olduğu sürece her iniş sonrası bir sonraki oyuncu otomatik başlar. */
  readonly autoPlay = signal(false);

  readonly totalCount = computed(() => this.order().length);

  readonly currentPlayer = computed<Player | null>(() => {
    const i = this.currentIndex();
    const list = this.order();
    return i >= 0 && i < list.length ? list[i] : null;
  });

  readonly currentTeamSide = computed<TeamSide | null>(() => {
    const player = this.currentPlayer();
    return player ? (this.teamOf()[player.id] ?? null) : null;
  });

  readonly currentTeam = computed<TeamInfo | null>(() => {
    const side = this.currentTeamSide();
    if (!side) return null;
    const [a, b] = this.teams();
    return side === 'A' ? a : b;
  });

  readonly currentTier = computed<CeremonyTier | null>(() => {
    const player = this.currentPlayer();
    return player ? this.tierOf(player.ratings.overall) : null;
  });

  /**
   * AÇILMIŞ kart sayısı. Eskiden sıradaki oyuncu da sayılıyordu ve hiçbir şey açılmadan
   * "1 / 14" yazıyordu (tarayıcı test raporu B5). Sayaç olan biteni anlatmalı, olacak olanı değil.
   */
  readonly progressText = computed(() => {
    const done = Math.min(this.placedIds().length, this.totalCount());
    return `${done} / ${this.totalCount()}`;
  });

  constructor() {
    try {
      this.reducedMotion.set(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch {
      // matchMedia bazı test ortamlarında yok — sorun değil, varsayılan false kalır.
    }
  }

  /** Kadroyu artan reytinge göre sıralayıp töreni sıfırdan hazırlar (Faz 5.2: sade önce, walkout son). */
  initialize(players: readonly Player[], teams: [TeamInfo, TeamInfo], teamOf: Record<string, TeamSide>): void {
    this.clearTimers();
    const sorted = [...players].sort((a, b) => a.ratings.overall - b.ratings.overall || Math.random() - 0.5);
    this.order.set(sorted);
    this.teams.set(teams);
    this.teamOf.set(teamOf);
    this.currentIndex.set(-1);
    this.phase.set('idle');
    this.locked.set(false);
    this.finished.set(false);
    this.placedIds.set([]);
    this.autoPlay.set(false);
  }

  setSpeed(speed: SequenceSpeed): void {
    this.speed.set(speed);
    try {
      localStorage.setItem(SPEED_KEY, String(speed));
    } catch {
      // Tercih saklanamazsa tören yine çalışır; sadece bir dahaki sefere hatırlanmaz.
    }
  }

  /** "İleri sar" — açıksa boştaysa hemen başlatır, sıradaki her iniş sonrası zincirlemeye devam eder. */
  toggleAutoPlay(): void {
    const next = !this.autoPlay();
    this.autoPlay.set(next);
    if (next && !this.locked() && !this.finished()) this.next();
  }

  tierOf(overall: number): CeremonyTier {
    if (overall >= 85) return 'walkout';
    if (overall >= 70) return 'altin';
    return 'sade';
  }

  /** Sıradaki oyuncunun törenini başlatır. Sekans oynarken kilitlenir, tekrar çağrı yutulur. */
  next(): void {
    if (this.locked()) return;
    const n = this.currentIndex() + 1;
    if (n >= this.totalCount()) {
      this.finished.set(true);
      return;
    }
    this.start(n);
  }

  /** Oynayan sekansı atlar, kart doğrudan sahaya yerleşir. */
  skip(): void {
    if (!this.locked()) return;
    const player = this.currentPlayer();
    if (!player) return;
    this.clearTimers();
    this.phase.set('land');
    this.displayRating.set(player.ratings.overall);
    this.revealedStats.set(6);
    this.showTeamLogo.set(false);
    this.shaking.set(false);
    this.confetti.set([]);
    this.timers.push(setTimeout(() => this.land(player.id), this.reducedMotion() ? 120 : 450));
  }

  /** Kalan TÜM oyuncuları animasyonsuz doğrudan sahaya yerleştirir (bkz. "Atla"). */
  /**
   * "Sonucu göster" tercihi hatırlansın diye: bir kez töreni atlayan kullanıcı bir daha
   * 12 oyuncuyu tek tek açmak zorunda kalmasın — tören ekranı doğrudan sonuçla açılır.
   */
  skipAll(): void {
    try {
      localStorage.setItem(SKIP_KEY, '1');
    } catch {
      // bkz. setSpeed
    }
    this.skipAllInternal();
  }

  /** "Töreni izle" — atlama tercihini siler, tören bir dahaki sefere tam oynar. */
  forgetSkipPreference(): void {
    try {
      localStorage.removeItem(SKIP_KEY);
    } catch {
      // bkz. setSpeed
    }
  }

  /** Kullanıcı daha önce töreni atladıysa true. */
  get ceremonySkipRemembered(): boolean {
    return readStoredSkip();
  }

  private skipAllInternal(): void {
    this.clearTimers();
    this.autoPlay.set(false);
    this.placedIds.set(this.order().map((p) => p.id));
    this.currentIndex.set(this.totalCount() - 1);
    this.phase.set('idle');
    this.locked.set(false);
    this.showTeamLogo.set(false);
    this.shaking.set(false);
    this.confetti.set([]);
    this.finished.set(true);
  }

  /** Bileşen route'tan ayrılırken çağrılır — arka planda çalışan zamanlayıcı kalmasın. */
  stop(): void {
    this.clearTimers();
    this.locked.set(false);
  }

  private start(index: number): void {
    const player = this.order()[index];
    const tier = this.tierOf(player.ratings.overall);
    this.clearTimers();
    this.currentIndex.set(index);
    this.locked.set(true);
    this.phase.set('prep');
    this.displayRating.set(0);
    this.revealedStats.set(0);
    this.confetti.set([]);
    this.shaking.set(false);
    this.showTeamLogo.set(false);
    this.washColor.set(null);
    this.run(this.sequenceFor(), 0, player, tier);
  }

  /**
   * Faz listesi — artık REYTİNGDEN BAĞIMSIZ, herkes aynı sırayı aynı hızda görür
   * (bkz. kullanıcı geri bildirimi: "75 üstü olan animasyon hepsinde geçerli olsun").
   * `tier` parametresi sadece `run()`'da walkout-özel konfeti/kamera sarsıntısını
   * açıp kapatmak için tutuluyor — süs, faz LİSTESİNİ etkilemiyor. Süreler hız
   * çarpanına bölünür, azaltılmış harekette 150ms'e sabitlenir.
   */
  private sequenceFor(): [SequencePhase, number][] {
    const d = (ms: number) => (this.reducedMotion() ? 150 : Math.round(ms / this.speed()));
    return [
      ['prep', d(600)],
      ['position', d(1700)],
      ['teamlogo', d(1800)],
      ['walkout', d(2000)],
      ['counter', d(1800)],
      ['land', d(1200)],
    ];
  }

  private run(sequence: [SequencePhase, number][], i: number, player: Player, tier: CeremonyTier): void {
    if (i >= sequence.length) {
      this.land(player.id);
      return;
    }
    const [phase, duration] = sequence[i];
    this.phase.set(phase);
    this.phaseDurationMs.set(duration);

    if (phase === 'teamlogo') {
      this.washColor.set(this.currentTeam()?.color ?? null);
      this.showTeamLogo.set(false);
      this.timers.push(
        setTimeout(() => this.showTeamLogo.set(true), this.reducedMotion() ? 20 : TEAM_WASH_LEAD_MS),
      );
    }

    if (phase === 'walkout' && tier === 'walkout' && !this.reducedMotion()) {
      this.shaking.set(true);
      this.confetti.set(this.makeConfetti());
      this.timers.push(setTimeout(() => this.shaking.set(false), 600));
    }

    if (phase === 'counter') {
      // Azaltılmış harekette sayaç animasyonu atlanır, değer doğrudan yazılır.
      if (this.reducedMotion()) {
        this.displayRating.set(player.ratings.overall);
        this.revealedStats.set(6);
      } else {
        this.animateCounter(player.ratings.overall);
      }
    }

    this.timers.push(setTimeout(() => this.run(sequence, i + 1, player, tier), duration));
  }

  private animateCounter(target: number): void {
    const start = performance.now();
    const duration = this.reducedMotion() ? 120 : Math.round(1100 / this.speed());
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3.2); // sona doğru belirgin yavaşlayan eğri
      this.displayRating.set(Math.round(target * eased));
      if (t < 1) {
        this.raf = requestAnimationFrame(step);
      } else {
        this.displayRating.set(target);
        this.slideStats();
      }
    };
    this.raf = requestAnimationFrame(step);
  }

  private slideStats(): void {
    const gap = this.reducedMotion() ? 20 : Math.round(130 / this.speed());
    for (let n = 1; n <= 6; n++) {
      this.timers.push(setTimeout(() => this.revealedStats.set(n), n * gap));
    }
  }

  private land(playerId: string): void {
    this.clearTimers();
    this.placedIds.update((list) => (list.includes(playerId) ? list : [...list, playerId]));
    this.phase.set('idle');
    this.locked.set(false);
    this.showTeamLogo.set(false);

    if (this.placedIds().length >= this.totalCount()) {
      // Son oyuncu indi — "Sıradaki oyuncu"ya bir kez daha (hiçbir şey yapmayan)
      // tıklama gerektirmeden doğrudan bitmiş sayılır.
      this.finished.set(true);
      return;
    }
    if (this.autoPlay()) {
      this.timers.push(setTimeout(() => this.next(), this.reducedMotion() ? 200 : 500));
    }
  }

  private makeConfetti(): ConfettiPiece[] {
    return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      size: 6 + Math.random() * 8,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      duration: 900 + Math.random() * 700,
      delay: Math.random() * 300,
    }));
  }

  private clearTimers(): void {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
  }
}
