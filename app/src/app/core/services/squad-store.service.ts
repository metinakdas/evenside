import { PlayerFormService } from './player-form.service';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { DrawResult, SquadFormat } from '../models/draw.model';
import { Player, PlayerInput, PlayerPosition } from '../models/player.model';
import { TeamInfo, TeamSide } from '../models/team.model';
import { BalancerService } from './balancer.service';
import { PlayerRepositoryService } from './player-repository.service';
import { randomPlayerInput } from './random-player';
import { FORMATION_PRESETS } from './pitch.service';
import { StorageService } from './storage.service';
import { ActiveTeamService } from './active-team.service';
import { SquadRosterService } from './squad-roster.service';
import { SquadInviteService } from './squad-invite.service';
import { UserScopeService } from './user-scope.service';
import { buildNameLabels } from '../utils/turkish-text';
import { mesaj } from './i18n.service';
import { NoticeService } from './notice.service';

/** Kadro ekranındaki denge önizlemesinin verisi (bkz. SquadStore.balancePreview). */
/** Kadro ızgarasının bir hücresi — dolu ya da (eksik hattı söyleyen) boş. */
export interface SquadSlot {
  player: Player | null;
  /** Boş yuvanın hangi hat için beklediği; belirsizse null. */
  missingPosition: PlayerPosition | null;
}

export interface BalancePreview {
  /** İki takımın ortalama reytingi arasındaki fark — en iyi bölüşümde. */
  ratingGap: number;
  /** Kadrodaki toplam oyuncu — hat dağılımının toplamı buna eşit olmalı. */
  totalPlayers: number;
  keeperCount: number;
  counts: Record<PlayerPosition, number>;
  /**
   * Kuranın verebileceği fark ARALIĞI. Önizleme deterministik olduğu için tek bir sayı
   * gösteriyordu; kura ise adil banttan rastgele seçiyor ve o sayıyı tutturmak zorunda
   * değil. Aralık, vaadi gerçeğe eşitliyor.
   */
  gapRange: { min: number; max: number };
  /** Toleransa giren farklı bölüşüm sayısı — 1 ise kura hep aynı sonucu verecek. */
  fairAlternatives: number;
  /** İki takımın reyting dağılımı (standart sapma) — ortalama eşitken bile ayrışabilir. */
  spread: { A: number; B: number };
  /** En dengeli bölüşümde tahmini kazanma ihtimali (0-1). */
  winChance: { A: number; B: number };
}

export const BLANK_PLAYER_INPUT: PlayerInput = {
  name: '',
  shirtNumber: '',
  countryCode: 'TR',
  flagImage: null,
  photoImage: null,
  heightCm: 180,
  weightKg: 75,
  smoker: false,
  goalkeeping: 2,
  defending: 5,
  midfield: 5,
  attacking: 4,
  pace: 6,
  stamina: 6,
  goalsPerMatch: 0.5,
};

function defaultTeams(): [TeamInfo, TeamInfo] {
  return [
    { side: 'A', name: 'Takım A', color: '#0068A8', logoImage: null },
    { side: 'B', name: 'Takım B', color: '#FB090B', logoImage: null },
  ];
}

/**
 * Uygulamanın tek durum kaynağı (bkz. proje notları Faz 0 kararı). Format, takımlar
 * ve kura sonucu burada, yalnızca bu cihazda (`localStorage`) tutulur. Oyuncuların
 * kendisi artık burada YAŞAMAZ — `SquadStore` sadece hangi havuz oyuncusunun (id) bu
 * kadroda olduğunu tutar; asıl veri `PlayerRepositoryService`'ten referansla gelir.
 * Böylece bir oyuncuyu havuzda güncellemek onu kullanan her kadroya anında yansır.
 */
/**
 * Canlı önizlemenin yeniden başlatma sayısı (9v9 ve üstü; 8v8'e kadar tam tarama yapılır).
 * Ölçüldü: 20 ile 60 arasında ortalama fark 0,02 puan değişiyor, süre 3 kat kısalıyor
 * (11v11: 297 → 99 ms). Önizleme her kadro değişikliğinde çalışır; asıl kura 60 ile çekilir.
 */
const PREVIEW_RESTARTS = 20;

@Injectable({ providedIn: 'root' })
export class SquadStore {
  private readonly storage = inject(StorageService);
  private readonly activeTeam = inject(ActiveTeamService);
  private readonly roster = inject(SquadRosterService);
  private readonly notices = inject(NoticeService);
  private readonly invites = inject(SquadInviteService);
  private readonly scope = inject(UserScopeService);
  private seenRevision = 0;

  /**
   * Açık takımın kadrosunu DEĞİŞTİREBİLİR MİYİM? Yalnızca kurduğun takımın kadrosu senindir;
   * katıldığın takımda kadro salt okunurdur (sunucuda RLS de aynı kuralı uygular, bu yalnızca
   * arayüzün buna göre davranması için).
   */
  readonly canEditSquad = computed(() => {
    const id = this.activeTeam.teamId();
    if (!id) return true; // Takım seçilmemişse eski tekil kadro: sahibi kullanıcının kendisi.
    /*
     * Yetki ancak KESİN biliniyorsa verilir. Eskiden takım listede yoksa "düzenleyebilir"
     * sayılıyordu (`!team || …`): liste henüz yüklenmemişken ya da cihazda hatırlanan açık
     * takım artık senin değilken kadro sunucuya yazılmaya çalışılıyor, sunucu reddediyor ve
     * alt şeritte "Sunucu bu kaydı reddetti: bu işlem için yetkin yok." kalıyordu
     * (kullanıcı geri bildirimi, 11 Ekim 2026).
     */
    if (!this.invites.teamsLoaded()) return false;
    const team = this.invites.myTeams().find((t) => t.squad.id === id);
    // Kurucu ve YÖNETİCİ kadroyu düzenler; normal üye düzenleyemez (sunucu da aynı kuralı
    // `is_squad_admin` ile zorluyor — buradaki kontrol yalnızca arayüz içindir).
    return !!team && team.role !== 'uye';
  });

  /**
   * Takımın SAHİBİ mi: rol vermek/almak ve üye çıkarmak yalnızca ona ait (yönetici dahil
   * değil — yetki dağıtma yetkisi devredilmez).
   */
  readonly isSquadOwner = computed(() => {
    const id = this.activeTeam.teamId();
    if (!id) return true;
    if (!this.invites.teamsLoaded()) return false;
    const team = this.invites.myTeams().find((t) => t.squad.id === id);
    return !!team && team.role === 'kurucu';
  });

  /** Sunucudan kadro çekilirken arayüz "boş kadro" sanmasın. */
  readonly rosterLoading = signal(false);

  /**
   * Kadrosu sunucudan EN AZ BİR KEZ okunmuş (başarılı ya da hatalı) son takım. Rota koruması
   * bunu bekler: yeni bir cihazda `/draw` ya da `/pitch` doğrudan açılınca (ya da sayfa
   * yenilenince) cihazda kadro yok, sunucudaki kadro henüz gelmemiş oluyor ve koruma "kadro
   * eksik" deyip `/squad`'ya atıyordu (11 Ekim 2026, tarayıcıda ölçüldü).
   */
  private readonly rosterSettledFor = signal<string | null | undefined>(undefined);

  /** Açık takımın kadrosu sunucudan okunana kadar bekler (takım yoksa hemen; en fazla 8 sn). */
  whenRosterSettled(): Promise<void> {
    const hazir = (): boolean => {
      const id = this.activeTeam.teamId();
      return !id || this.rosterSettledFor() === id;
    };
    if (hazir()) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const t0 = Date.now();
      const yokla = (): void => {
        if (hazir() || Date.now() - t0 > 8000) resolve();
        else setTimeout(yokla, 60);
      };
      yokla();
    });
  }

  /**
   * Sunucudaki kadronun bilinen son hâli (takım → id listesi). Kayıt buna göre atlanıyor:
   * `squad_players` yazımı "önce DELETE sonra INSERT" olduğu için her sayfa açılışında
   * gereksizce çalıştırmak kadroyu kaybetme riski demekti (tarayıcı test raporu). Artık
   * yalnızca liste GERÇEKTEN değiştiyse yazılıyor.
   */
  private readonly syncedRoster = new Map<string, string>();
  /** Sunucudaki kadrosu OKUNAMAYAN takımlar: okunana kadar üzerine yazılmaz (bayat liste sunucuyu ezmesin). */
  private readonly rosterUnknown = new Map<string, string>();
  private readonly balancer = inject(BalancerService);
  private readonly playerForm = inject(PlayerFormService);
  /**
   * Kuraya giren oyuncular: kart reytingi + skorlardan gelen form düzeltmesi (bkz.
   * PlayerFormService). Kartın kendisi değişmez; denge önizlemesi ve kura aynı listeyi okur ki
   * şeritte görünen fark kuranın gerçekten dengelediği şey olsun.
   */
  readonly balancingPlayers = computed(() => this.playerForm.forBalancing(this.players()));
  private readonly repo = inject(PlayerRepositoryService);

  /**
   * Oyuncu havuzunun son hata mesajı (yetki reddi, politika hatası, eksik şema).
   * Form bunu kendi genel mesajına TERCİH eder — sunucu sebebi söylüyorsa onu gösterelim.
   */
  readonly playerError = this.repo.error.asReadonly();

  /** Varsayılan format 7v7 — en sık oynanan halı saha düzeni (kullanıcı isteği). */
  readonly format = signal<SquadFormat>(7);
  readonly teams = signal<[TeamInfo, TeamInfo]>(defaultTeams());
  readonly squadPlayerIds = signal<string[]>([]);
  readonly editingPlayerId = signal<string | null>(null);
  /** "Yeni oyuncu ekle" akışı elle açıldı mı — düzenlemeden bağımsız (bkz. `formOpen`). */
  readonly creatingNew = signal(false);
  /**
   * Kaydetme sorunlarının TEK kapısı: cihaz deposu ya da sunucu. Sunucu hatası eskiden
   * yalnızca servis içinde duruyor, hiçbir ekran göstermiyordu — kullanıcı kadronun
   * kaydedildiğini sanıyordu (ölçüldü: ağ kesikken sayaç artıyor, uyarı çıkmıyor).
   */
  readonly saveError = computed(() => this.persistError() ?? this.roster.error());

  /** Son kalıcılık denemesi başarısız olduysa Türkçe mesaj. */
  readonly persistError = signal<string | null>(null);
  /** Kura sonucu — "Kuraya geç" ile bir kez hesaplanır, tören sadece bunu açıklar (Faz 5). */
  readonly drawResult = signal<DrawResult | null>(null);

  /** Bu kadrodaki oyuncuların güncel hâli — havuzdan canlı okunur (referans, kopya değil). */
  readonly players = computed<Player[]>(() => {
    const pool = this.repo.playersById();
    return this.squadPlayerIds()
      .map((id) => pool.get(id))
      .filter((p): p is Player => !!p);
  });

  readonly requiredPlayerCount = computed(() => this.format() * 2);
  readonly missingCount = computed(() => Math.max(0, this.requiredPlayerCount() - this.players().length));
  readonly excessCount = computed(() => Math.max(0, this.players().length - this.requiredPlayerCount()));
  readonly isSquadComplete = computed(() => this.players().length === this.requiredPlayerCount());
  /** Format dolduysa yeni oyuncu SEÇİLEMEZ (havuza kayıt hâlâ serbest — bkz. savePlayer). */
  readonly atCapacity = computed(() => this.players().length >= this.requiredPlayerCount());

  /**
   * Düzenlenen oyuncu HAVUZDAN çözülür, kadrodan değil. Eskiden `players()` (yalnızca
   * kadrodakiler) içinde aranıyordu: havuzdaki ama kadroda OLMAYAN bir oyuncunun adına
   * tıklayınca form BOŞ açılıyor, "Güncelle" o oyuncunun adını siliyordu (tarayıcı test
   * raporu · yeni kırılma). Havuz kartların tek kaynağı; kadro onun alt kümesi.
   */
  readonly editingPlayer = computed(() => {
    const id = this.editingPlayerId();
    if (!id) return null;
    return this.repo.playersById().get(this.repo.resolveId(id)) ?? null;
  });

  /** Oyuncu formu (kadro havuzunun üstünde bindirmeli panel olarak) açık mı. */
  readonly formOpen = computed(() => this.creatingNew() || this.editingPlayerId() !== null);

  /** Oyuncu id'sinden takım tarafına (A/B) hızlı erişim — kura sonucundan türetilir. */
  readonly teamOfMap = computed<Record<string, TeamSide>>(() => {
    const result = this.drawResult();
    if (!result) return {};
    const map: Record<string, TeamSide> = {};
    result.teamAPlayerIds.forEach((id) => (map[id] = 'A'));
    result.teamBPlayerIds.forEach((id) => (map[id] = 'B'));
    return map;
  });

  /**
   * Kartlarda gösterilecek isim etiketleri (id → etiket). Soyadı çakışan oyunculara adın
   * baş harfi eklenir; çakışma kadro genelinde hesaplanır, tek tek kartlar bunu bilemez.
   */
  readonly nameLabels = computed(() =>
    buildNameLabels(this.players().map((p) => ({ id: p.id, name: p.input.name }))),
  );

  /**
   * Kadro ızgarasının yuvaları: dolu yuvalar oyuncu, boş yuvalar o an EKSİK olan hattın
   * kısaltmasını taşır. Izgara oyuncu sayısına göre uzamaz — formatın gerektirdiği kadar
   * hücre vardır (Tur 4 · Bölüm 4), böylece sayfa kadro büyüdükçe kaymaz ve kullanıcı
   * "neyi eksik kuruyorum" sorusunu ızgaraya bakarak yanıtlar.
   */
  readonly squadSlots = computed<SquadSlot[]>(() => {
    const players = this.players();

    /*
     * Izgara hat SIRASINA göre dizilir (kaleler → defans → orta saha → forvet) ama hat
     * KOTASI YOKTUR: kadro tamamen forvetlerden oluşabilir (kullanıcı isteği). Boş yuvalar
     * bu yüzden bir mevki İSTEMEZ, yalnızca "daha kaç kişi lazım" der.
     */
    const order: Record<PlayerPosition, number> = { KAL: 0, DEF: 1, OS: 2, FOR: 3 };
    const slots: SquadSlot[] = [...players]
      .sort((a, b) => order[a.ratings.position] - order[b.ratings.position])
      .map((player) => ({ player, missingPosition: null }));

    const emptyCount = Math.max(0, this.requiredPlayerCount() - players.length);
    for (let i = 0; i < emptyCount; i++) slots.push({ player: null, missingPosition: null });
    return slots;
  });

  /** Formatın gerektirdiği mevki dağılımı (iki takım toplamı) — eksik hat göstergesi bunu okur. */
  readonly requiredLineCounts = computed<Record<PlayerPosition, number>>(() => {
    const need: Record<PlayerPosition, number> = { KAL: 0, DEF: 0, OS: 0, FOR: 0 };
    FORMATION_PRESETS[this.format()][0].lines.forEach(([position, count]) => (need[position] += count * 2));
    return need;
  });

  /** Kadrodaki mevki dağılımı — hem önizleme şeridi hem eksik kadro mesajı okur. */
  readonly lineCounts = computed<Record<PlayerPosition, number>>(() => {
    const counts: Record<PlayerPosition, number> = { KAL: 0, DEF: 0, OS: 0, FOR: 0 };
    this.players().forEach((p) => counts[p.ratings.position]++);
    return counts;
  });

  /** Kadroda mevkisi KAL olan oyuncu sayısı — kaleci uyarısının kaynağı. */
  readonly keeperCount = computed(() => this.players().filter((p) => p.ratings.position === 'KAL').length);

  /**
   * Adil kura için her takıma bir kaleci gerekir. Dengeleyici havuzdaki kalecileri
   * ayırmak zorundadır (bkz. BalancerService.keeperCoverage), ama havuzda iki kaleci yoksa
   * kısıt sağlanamaz — bu durumda kullanıcı kuradan ÖNCE uyarılır, sessizce forvet
   * kaleye konmaz (kullanıcı geri bildirimi).
   */
  readonly keeperWarning = computed<string | null>(() => {
    if (!this.players().length) return null;
    const count = this.keeperCount();
    if (count >= 2) return null;
    // Kalecisiz oynamak artık desteklenen bir senaryo (vekil kaleci + rotasyon), bu yüzden
    // metin emir değil bilgi veriyor: kullanıcı dilerse böyle devam edebilir.
    return count === 0
      ? mesaj('kadro.kaleciUyariYok')
      : mesaj('kadro.kaleciUyariTek');
  });

  /**
   * Kadro tam olmasa da ELDEKİ oyuncularla öngörülen ortalama farkı — panelin en büyük
   * tipografik öğesi anlamsız bir tire olarak durmasın diye (Tur 5 · R3). Dengeleyici çift
   * sayı istediği için tek sayıda oyuncuda en düşük reytingli oyuncu hesap dışı kalır.
   */
  /**
   * Deterministik önizleme kurası — TEK YERDE hesaplanır. Eskiden `projectedGap`,
   * `projectedTeams` ve `balancePreview` aynı hesabı ayrı ayrı yapıyordu; kadro doluyken her
   * değişiklikte üçü birden çalışıyor, 11v11'de ~1 sn, 8v8'de ~0,3 sn donma oluyordu
   * (yayın öncesi ölçüm, 10 Ekim 2026). Dengeleyici çift sayı ister: tek sayıda oyuncuda en
   * düşük reytingli oyuncu hesap dışı kalır.
   */
  private readonly previewSplit = computed(() => {
    const players = [...this.balancingPlayers()].sort((a, b) => b.ratings.overall - a.ratings.overall);
    const even = players.length % 2 === 0 ? players : players.slice(0, -1);
    if (even.length < 2) return null;
    const result = this.balancer.balance(even, { deterministic: true, restarts: PREVIEW_RESTARTS });
    const byId = new Map(even.map((p) => [p.id, p]));
    const avg = (ids: string[]): number =>
      ids.reduce((sum, id) => sum + (byId.get(id)?.ratings.overall ?? 0), 0) / (ids.length || 1);
    return { players: even, result, a: avg(result.teamAPlayerIds), b: avg(result.teamBPlayerIds) };
  });

  readonly projectedGap = computed(() => {
    const split = this.previewSplit();
    return split ? Math.abs(split.a - split.b) : 0;
  });

  /**
   * Öngörülen iki takımın ortalama reytingi — `projectedGap` ile aynı hesaptan gelir. Kadro
   * ekranındaki denge paneli bunu iki çubuk olarak gösterir: ekranın en boş yeri tam da
   * dengenin görselleştirileceği yerdi (Tur 7 · B3).
   */
  readonly projectedTeams = computed<{ a: number; b: number } | null>(() => {
    const split = this.previewSplit();
    return split ? { a: split.a, b: split.b } : null;
  });

  /**
   * Kadro ekranındaki canlı denge önizlemesi (kontrol raporu Ö1): kadro dolduğunda, kuraya
   * geçmeden önce "bu kadro dengelenebilir mi" sorusunu cevaplar. Kurayı ÇEKMEZ — sadece
   * en iyi bölüşümün ne kadar dengeli olacağını ve hat dağılımını hesaplar. Kadro tam
   * değilse null (henüz söylenecek bir şey yok).
   */
  readonly balancePreview = computed<BalancePreview | null>(() => {
    if (!this.isSquadComplete()) return null;
    // deterministic: şeritte gördüğün sayı kuradan kuraya zıplamasın (Tur 3 · A3). Hesap
    // `previewSplit`ten gelir — ikinci kez kura çalıştırılmaz.
    const split = this.previewSplit();
    if (!split) return null;
    const players = split.players;
    const preview = split.result;
    const byId = new Map(players.map((p) => [p.id, p]));
    const avg = (ids: string[]): number =>
      ids.reduce((sum, id) => sum + (byId.get(id)?.ratings.overall ?? 0), 0) / (ids.length || 1);
    return {
      ratingGap: Math.abs(avg(preview.teamAPlayerIds) - avg(preview.teamBPlayerIds)),
      // Hat dağılımı KAL dahil bütün kadroyu toplamalı; eskiden DEF+OS+FOR yazıp 14 yerine
      // 13 gösteriyordu (Tur 3 · A4).
      totalPlayers: players.length,
      keeperCount: this.keeperCount(),
      counts: this.lineCounts(),
      gapRange: preview.fairGapRange,
      fairAlternatives: preview.fairAlternatives,
      spread: preview.spread,
      winChance: preview.winChance,
    };
  });

  readonly teamAPlayers = computed(() => this.playersFor(this.drawResult()?.teamAPlayerIds));
  readonly teamBPlayers = computed(() => this.playersFor(this.drawResult()?.teamBPlayerIds));

  /** Hangi takımın kadrosu yüklü — takım değişince yeniden yüklemek için. */
  private loadedTeamId: string | null = null;
  /** Kaydın hangi kullanıcı için okunduğu — oturum geç gelince yeniden okumak için. */
  private loadedUserId: string | null = null;

  constructor() {
    this.loadedUserId = this.scope.userId();
    this.loadedTeamId = this.activeTeam.teamId();
    this.restore(this.loadedTeamId);

    /*
     * Açılışta takım ZATEN seçiliyse effect hiç "değişti" demez (teamId === loadedTeamId) ve
     * kadro sunucudan çekilmezdi: /kadro doğrudan açıldığında ekran boş geliyordu. İlk çekim
     * bu yüzden burada, açıkça yapılıyor.
     *
     * `loadMyTeams` da burada: yetki (kurucu mu üye mi) ona bağlı ve /kadro'da onu çağıran
     * başka kimse yok — yüklenmeden herkes "kurucu" sayılıyordu.
     */
    void this.invites.loadMyTeams();
    void this.pullRoster(this.loadedTeamId);

    /*
     * TAKIM DEĞİŞİNCE KADRO DEĞİŞİR. Aynı effect hem kaydeder hem takım değişimini yakalar:
     * takım değiştiyse ÖNCE yeni takımın kadrosu yüklenir, o turda kayıt yapılmaz — yoksa
     * yeni takımın anahtarına eski takımın kadrosu yazılırdı.
     */
    effect(
      () => {
        const teamId = this.activeTeam.teamId();
        /*
         * KULLANICI DEĞİŞİNCE (ya da oturum GEÇ yüklenince) önce o kullanıcının kaydı okunur ve
         * o turda HİÇBİR ŞEY yazılmaz. Depo uygulama açılırken oturumdan önce kuruluyor
         * (`ClubKitBackfillService`); kimliksiz anahtardan okunan varsayılanlar (format 7) kimlik
         * gelince kullanıcının GERÇEK anahtarının üstüne yazılıyordu — yenilemede seçilen format
         * ve kura kayboluyordu (QA 9 Ekim 2026, ölçüldü: açılışın 126. ms'sinde format=7 yazıldı).
         */
        const userId = this.scope.userId();
        // Onarım (devralınmış veri temizliği) sonrası kadro yeniden okunmalı.
        const revision = this.scope.revision();
        if (revision !== this.seenRevision) {
          this.seenRevision = revision;
          this.restore(teamId);
        }

        /*
         * TUZAK: anlık görüntü, erken dönüşten ÖNCE okunmalı. Bir effect yalnızca O TURDA
         * OKUDUĞU sinyalleri izler; takım değişiminde erken dönseydik format/kadro/kura
         * sinyalleri izlenmemiş olur ve o andan sonra yapılan hiçbir değişiklik kaydı
         * tetiklemezdi — takım değiştirdikten sonra kadro sessizce kaydedilmiyordu.
         */
        const snapshot = {
          format: this.format(),
          teams: this.teams(),
          squadPlayerIds: this.squadPlayerIds(),
          drawResult: this.drawResult(),
        };

        if (userId !== this.loadedUserId) {
          this.loadedUserId = userId;
          this.loadedTeamId = teamId;
          this.restore(teamId);
          void this.pullRoster(teamId);
          return;
        }

        // Takım değiştiyse ÖNCE yeni takımın kadrosu yüklenir; o turda kayıt yapılmaz, yoksa
        // yeni takımın anahtarına eski takımın kadrosu yazılırdı.
        if (teamId !== this.loadedTeamId) {
          this.loadedTeamId = teamId;
          this.restore(teamId);
          void this.pullRoster(teamId);
          return;
        }
        const ok = this.storage.save(snapshot, teamId);

        /*
         * Takım seçiliyse kadro SUNUCUYA da yazılır ki katılanlar görebilsin. Yalnızca
         * kurucu yazabilir; üyenin denemesini RLS zaten reddeder, burada boşuna istek
         * atılmasın diye ayrıca kontrol ediliyor. Yükleme sürerken yazmıyoruz: sunucudan
         * gelen liste henüz oturmadan yazmak, dolu kadroyu boşla ezerdi.
         */
        // Sunucunun hâli bilinmiyorsa (son okuma hatalıydı) yazmak yerine yeniden oku: kullanıcının
        // her değişikliği aynı zamanda doğal bir "tekrar dene" olur.
        // Yalnızca liste GERÇEKTEN değiştiyse yeniden denenir; yoksa kalıcı bir hatada effect
        // (rosterLoading değişimiyle) sonsuz istek döngüsüne girerdi.
        if (teamId && this.rosterUnknown.has(teamId)) {
          if (!this.rosterLoading() && this.rosterUnknown.get(teamId) !== snapshot.squadPlayerIds.join(',')) {
            void this.pullRoster(teamId);
          }
        } else if (teamId && this.canEditSquad() && !this.rosterLoading()) {
          // Sunucudaki hâlinden farklı değilse yazma: DELETE+INSERT boşuna çalışmasın.
          const key = snapshot.squadPlayerIds.join(',');
          if (this.syncedRoster.get(teamId) !== key) {
            /*
             * "Eşitlendi" damgası ancak yazma BAŞARILI olursa vurulur. Önce damgalayıp sonra
             * yazmak, ağ koptuğunda kadroyu sessizce kaybettiriyordu: istek başarısız oluyor,
             * bir daha da denenmiyordu (ölçüldü).
             */
            void this.roster.save(teamId, snapshot.squadPlayerIds).then((ok) => {
              if (ok) {
                this.syncedRoster.set(teamId, key);
                return;
              }
              // Reddedildiyse rol değişmiş olabilir (kurucu yöneticiliği geri aldı): roller
              // tazelenir, ekran salt okunura döner.
              void this.invites.loadMyTeams();
              if (this.roster.lastWasForbidden) {
                // Kaydedilmeyen değişiklik ekranda "kaydedilmiş" gibi kalmasın: sunucudaki
                // hâle dönülür ve kullanıcı bir kez bilgilendirilir.
                this.notices.error(mesaj('mesaj.kadroYetkiYok'));
                void this.pullRoster(teamId, true);
              }
            });
          }
        }
        this.persistError.set(ok ? null : mesaj('mesaj.kadroDepoDolu'));
      });
  }

  /** Kadroyu iki takıma dengeli dağıtır ve sonucu saklar. Kadro tamam değilse bir şey yapmaz. */
  computeDraw(): DrawResult | null {
    /*
     * Kura ÜYEYE de açık (kullanıcı isteği, 10 Ekim 2026): kura sonucu yalnızca bu cihazda
     * saklanır, sunucudaki kadroya dokunmaz — üyenin kendi ekranında takımları görmesi
     * kimsenin kadrosunu değiştirmez. Tek şart kadronun dolu olması.
     */
    if (!this.isSquadComplete()) return null;
    // Önceki bölüşüm eleniyor: "Kurayı yenile" aynı takımları tekrar çıkarmasın
    // (kullanıcı geri bildirimi: üç kez üst üste birebir aynı sonuç geldi).
    const result = this.balancer.balance(this.balancingPlayers(), { avoidSignature: this.drawResult()?.signature });
    this.drawResult.set(result);
    return result;
  }

  setFormat(format: SquadFormat): void {
    if (!this.canEditSquad()) return;
    // Kadro doluyken format küçültülürse oyuncular silinmez; fazlalık sayısı
    // (excessCount) arayüzde uyarı olarak gösterilir (Faz 4.4).
    this.format.set(format);
  }

  updateTeam(side: TeamSide, patch: Partial<Omit<TeamInfo, 'side'>>): void {
    this.teams.update(([a, b]) => {
      const next: [TeamInfo, TeamInfo] = [{ ...a }, { ...b }];
      const target = side === 'A' ? 0 : 1;
      next[target] = { ...next[target], ...patch };
      return next;
    });
  }

  /**
   * Formdaki ham girdiyi havuza kaydeder (yeni oyuncu ya da düzenlenen oyuncunun
   * güncellemesi) ve kadroya ekler. Havuz yazımı ağdan geçtiği için asenkron.
   */
  async savePlayer(input: PlayerInput): Promise<Player | null> {
    // Formu açan yollar zaten kapalı; kayıt da üyeye kapalı (düğme gizlemek yetmez kuralı).
    if (!this.canEditSquad()) return null;
    const editingId = this.editingPlayerId();
    const saved = editingId ? await this.repo.update(editingId, input) : await this.repo.create(input);
    if (!saved) return null;

    // Düzenleme her zaman yerinde günceller (kadro sayısı değişmez). Yeni oyuncu
    // ise, format doluysa havuza kaydedilir ama kadroya EKLENMEZ (bkz. atCapacity —
    // "formattan fazla oyuncu seçilemez").
    if (!this.isInSquad(saved.id) && !this.atCapacity()) {
      this.squadPlayerIds.update((ids) => [...ids, saved.id]);
    }
    this.editingPlayerId.set(null);
    return saved;
  }

  /**
   * Kadroyu (ör. kurayı denemek için) hızla doldurmaya yarayan sahte oyuncu —
   * o an bir düzenleme sürüyor olsa bile her zaman YENİ bir kayıt oluşturur
   * (bkz. `savePlayer` — editingPlayerId'ye bakmaz, karışıklık riski yok). Format
   * doluysa hiç oluşturulmaz (boşa havuz kaydı açılmasın).
   */
  /**
   * "Rastgele" — kadroyu HAVUZDAKİ gerçek oyunculardan doldurur. Önceden her basışta yeni bir
   * sahte oyuncu uyduruyordu: havuzda bekleyen gerçek oyuncular (üstelik tek kaleci) hiç
   * seçilmiyor, havuz da erimiyordu (Tur 3 · A5).
   *
   * Seçim kör değil: kadroda en eksik olan hattan başlar ve o hattın en yüksek reytingli
   * havuz oyuncusunu alır. Havuz boşsa null döner — uydurmaz (bkz. `addDemoPlayer`).
   */
  addRandomFromPool(): Player | null {
    if (!this.canEditSquad()) return null;
    if (this.atCapacity()) return null;
    // Eşlenmiş takma ad satırları hariç; "kadroda mı" eşleme çözülerek (aynı kişi iki kez seçilmesin).
    const available = this.repo.poolPlayers().filter((p) => !this.isInSquad(p.id));
    if (!available.length) return null;

    const counts = this.lineCounts();
    // Kalecisi olmayan kadroya önce kaleci: kullanıcının en çok canını yakan eksik bu.
    const neediest = (['KAL', 'DEF', 'OS', 'FOR'] as PlayerPosition[]).sort((a, b) => counts[a] - counts[b]);
    const preferred = neediest
      .map((position) => available.filter((p) => p.ratings.position === position))
      .find((group) => group.length > 0);

    const pick = [...(preferred ?? available)].sort((a, b) => b.ratings.overall - a.ratings.overall)[0];
    this.squadPlayerIds.update((ids) => [...ids, pick.id]);
    return pick;
  }

  /**
   * Deneme amaçlı sahte oyuncu üretir ve kadroya ekler. Eskiden "Rastgele" bunu yapıyordu;
   * ayrı bir aksiyona taşındı ki kimse kadrosunu farkında olmadan uydurma oyuncularla
   * doldurmasın (Tur 3 · A5).
   */
  async addDemoPlayer(): Promise<Player | null> {
    // Düğmeyi gizlemek yetmez: üye bu yoldan da kadroya oyuncu ekleyemesin.
    if (!this.canEditSquad()) return null;
    if (this.atCapacity()) return null;
    const saved = await this.repo.create(randomPlayerInput());
    if (!saved) return null;
    if (!this.isInSquad(saved.id)) {
      this.squadPlayerIds.update((ids) => [...ids, saved.id]);
    }
    return saved;
  }


  /** Havuzdan seçilen, zaten var olan bir oyuncuyu kadroya ekler — format doluysa hiçbir şey yapmaz. */
  /**
   * İki kimlik AYNI KİŞİ mi — eşleme (merged_into) çözülerek. Kadroda eşlenmiş bir havuz kartının
   * ESKİ id'si durabilir; ekranlar ise kişinin gerçek kartının id'sini verir. Ham karşılaştırma
   * yapılınca aynı kişi kadroya ikinci kez giriyor, kadrodan çıkarma sessizce hiçbir şey
   * yapmıyor ve kura yenilemede "kadroya uymuyor" diye siliniyordu (tarama turu, 10 Ekim 2026).
   */
  private sameId(a: string, b: string): boolean {
    return a === b || this.repo.resolveId(a) === this.repo.resolveId(b);
  }

  /** Bu kimlik (eşleme çözülerek) kadroda mı. */
  isInSquad(id: string): boolean {
    return this.squadPlayerIds().some((x) => this.sameId(x, id));
  }

  addExistingPlayer(id: string): void {
    if (!this.canEditSquad()) return;
    if (this.atCapacity()) return;
    if (!this.isInSquad(id)) {
      this.squadPlayerIds.update((ids) => [...ids, id]);
    }
  }

  /**
   * Oyuncuyu HAVUZDAN kalıcı olarak siler ve açık kadrodan da çıkarır. `removePlayer`
   * yalnızca kadro bağlantısını koparır; bu ise geri alınamaz. Uydurulan demo oyuncular
   * ve yanlış kayıtlar başka türlü temizlenemiyordu (Tur 3 · A7).
   */
  async deletePlayerPermanently(id: string): Promise<boolean> {
    if (!this.canEditSquad()) return false;
    const ok = await this.repo.remove(id);
    if (!ok) return false;
    this.removePlayer(id);
    return true;
  }

  /**
   * Boş formu "yeni oyuncu ekle" panelinde açar. Üye, katıldığı takımın kadrosunu
   * değiştiremez; formu AÇMAK da bir düzenleme yoludur (kaydet düğmesi oradadır), bu yüzden
   * burada da kapatılıyor — arayüzde düğmeyi gizlemek tek başına yetmez.
   */
  startCreating(): void {
    if (!this.canEditSquad()) return;
    this.editingPlayerId.set(null);
    this.creatingNew.set(true);
  }

  /** Ham girdinin tamamını forma geri yükler — düzenleme puanları sıfırlamaz (bkz. Faz 1 kritik kural). */
  startEditing(id: string): void {
    if (!this.canEditSquad()) return;
    this.creatingNew.set(false);
    this.editingPlayerId.set(id);
  }

  cancelEditing(): void {
    this.editingPlayerId.set(null);
    this.creatingNew.set(false);
  }

  /**
   * Oyuncuyu bu kadrodan çıkarır — havuzdaki kaydı silmez, sadece bağlantıyı kaldırır.
   * Kura zaten çekilmişse (saha görünümü), oyuncuyu kura sonucundan da temizler ki
   * saha haritasında hayalet olarak kalmasın.
   */
  removePlayer(id: string): void {
    if (!this.canEditSquad()) return;
    this.squadPlayerIds.update((ids) => ids.filter((x) => !this.sameId(x, id)));
    const editing = this.editingPlayerId();
    if (editing && this.sameId(editing, id)) this.editingPlayerId.set(null);

    const draw = this.drawResult();
    const has = (list: string[]) => list.some((x) => this.sameId(x, id));
    if (draw && (has(draw.teamAPlayerIds) || has(draw.teamBPlayerIds))) {
      this.drawResult.set({
        ...draw,
        teamAPlayerIds: draw.teamAPlayerIds.filter((x) => !this.sameId(x, id)),
        teamBPlayerIds: draw.teamBPlayerIds.filter((x) => !this.sameId(x, id)),
      });
    }
  }

  /**
   * Saha görünümünde kura sonrası manuel düzeltme: iki oyuncunun takımını değiştirir
   * (A↔B). Yalnızca FARKLI takımlardaki iki oyuncu arasında çalışır — kadro boyutları
   * (6v6/7v7/8v8) bu sayede her zaman eşit kalır.
   */
  swapDrawPlayers(idA: string, idB: string): void {
    // Takas üyeye de açık: kura sonucu bu cihaza ait (üye de kura çekebiliyor), sunucudaki
    // kadroya dokunmaz. Kapalıyken üye sahada ⇄'e basıyor ve sessizce hiçbir şey olmuyordu.
    const draw = this.drawResult();
    if (!draw || this.sameId(idA, idB)) return;
    const sideOf = (id: string): TeamSide | null =>
      draw.teamAPlayerIds.some((x) => this.sameId(x, id)) ? 'A' : draw.teamBPlayerIds.some((x) => this.sameId(x, id)) ? 'B' : null;
    const sideA = sideOf(idA);
    const sideB = sideOf(idB);
    if (!sideA || !sideB || sideA === sideB) return;

    const swapIn = (ids: string[]): string[] => ids.map((x) => (this.sameId(x, idA) ? idB : this.sameId(x, idB) ? idA : x));
    this.drawResult.set({
      ...draw,
      teamAPlayerIds: swapIn(draw.teamAPlayerIds),
      teamBPlayerIds: swapIn(draw.teamBPlayerIds),
    });
  }

  private playersFor(ids: string[] | undefined): Player[] {
    if (!ids) return [];
    const pool = this.repo.playersById();
    return ids.map((id) => pool.get(id)).filter((p): p is Player => !!p);
  }

  /**
   * Seçili takımın kadrosunu yükler. Kayıt yoksa BOŞ kadroya döner: başka takımın kadrosunu
   * devralmak, iki takımı birbirine karıştırmanın en hızlı yolu olurdu.
   */
  /**
   * Takımın kadrosunu SUNUCUDAN çeker. Kurucuysan sunucu boşsa cihazdaki liste korunur
   * (takım özelliğinden önce kurulmuş kadrolar kaybolmasın); üyeysen sunucu tek kaynaktır,
   * boşsa kadro da boştur.
   */
  private async pullRoster(teamId: string | null, sunucuyaDon = false): Promise<void> {
    if (!teamId) return;

    this.rosterLoading.set(true);
    const ids = await this.roster.load(teamId);
    // Kadroda havuzda OLMAYAN kart varsa havuz bayattır (yeni katıldın, yetkin değişti, başka
    // cihazda eklendi): bir kez tazelenir — yoksa kadro eksik ya da boş görünüyordu.
    if (ids?.some((id) => !this.repo.playersById().has(id))) await this.repo.refresh();
    // Bu arada kullanıcı başka takıma geçtiyse gelen cevabı yok say.
    if (this.loadedTeamId !== teamId) {
      this.rosterLoading.set(false);
      return;
    }
    // Aşağıdaki dalların hepsi senkron: kadro bu tur içinde yerleşir, koruma bunu bekliyor.
    queueMicrotask(() => this.rosterSettledFor.set(teamId));
    if (ids === null) {
      // Okunamadı: ekrandaki liste olduğu gibi kalır, sunucuya da yazılmaz (bkz. rosterUnknown).
      this.rosterUnknown.set(teamId, this.squadPlayerIds().join(','));
      this.rosterLoading.set(false);
      return;
    }
    const failedAt = this.rosterUnknown.get(teamId);
    this.rosterUnknown.delete(teamId);
    const owner0 = this.canEditSquad();
    if (owner0 && failedAt !== undefined && ids.join(',') === failedAt) {
      // Okuma hatasından SONRA yapılan değişiklik korunur: sunucu, hatadan önceki hâliyle aynı
      // çıktı, yani ezilecek başka birinin işi yok. Damgayı vurup listeyi tazeliyoruz ki kayıt
      // effect'i yeniden çalışıp değişikliği yazsın.
      this.syncedRoster.set(teamId, failedAt);
      this.squadPlayerIds.update((list) => [...list]);
      this.rosterLoading.set(false);
      return;
    }

    const owner = this.canEditSquad();
    // Takım listesi henüz gelmediyse yetki BİLİNMİYOR (canEditSquad false döner): boş sunucu
    // cevabı cihazdaki listeyi silmesin — sahibiysen o liste korunmalı.
    const yetkiBilinmiyor = !this.invites.teamsLoaded();
    // Sunucunun söylediği hâl artık biliniyor: aynısını geri yazmaya gerek yok.
    this.syncedRoster.set(teamId, ids.join(','));
    if (sunucuyaDon || ids.length > 0 || (!owner && !yetkiBilinmiyor)) {
      this.squadPlayerIds.set([...ids]);
      this.drawResult.set(this.validDrawResult(this.drawResult(), ids));
    }
    this.rosterLoading.set(false);
  }

  private restore(teamId: string | null): void {
    this.storage.purgeLegacyKeys();
    const saved = this.storage.load(teamId);

    if (!saved) {
      this.squadPlayerIds.set([]);
      this.drawResult.set(null);
      return;
    }

    this.format.set(saved.format);
    this.teams.set(saved.teams);
    this.squadPlayerIds.set(saved.squadPlayerIds);
    this.drawResult.set(this.validDrawResult(saved.drawResult, saved.squadPlayerIds));
  }

  /**
   * Kayıtlı kura sonucunu ancak kadroyla tutarlıysa geri yükler. Kadro kayıttan sonra
   * değişmiş olabilir (oyuncu çıkarılmış, format değişmiş); bayat bir kura sonucuyla
   * `/pitch` açmak eksik ya da hayalet oyuncu gösterir — o durumda kura sıfırlanır ve
   * kullanıcı yeniden çeker.
   */
  private validDrawResult(draw: DrawResult | null, squadIds: readonly string[]): DrawResult | null {
    if (!draw) return null;
    const drawn = [...draw.teamAPlayerIds, ...draw.teamBPlayerIds];
    if (drawn.length !== squadIds.length) return null;
    if (draw.teamAPlayerIds.length !== draw.teamBPlayerIds.length) return null;
    const canon = (id: string): string => this.repo.resolveId(id);
    if (new Set(drawn.map(canon)).size !== drawn.length) return null;
    const inSquad = new Set(squadIds.map(canon));
    return drawn.every((id) => inSquad.has(canon(id))) ? draw : null;
  }
}
