import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Player, PlayerInput } from '../models/player.model';
import { ActiveTeamService } from './active-team.service';
import { PlayerRepositoryService } from './player-repository.service';
import { RatingService } from './rating.service';
import { SquadInviteService, MyTeam, SquadInvite } from './squad-invite.service';
import { SquadRosterService } from './squad-roster.service';
import { SquadStore } from './squad-store.service';
import { FakePlayerRepositoryService } from './testing/fake-player-repository';

const rating = new RatingService();

const input = (name: string): PlayerInput => ({
  name,
  shirtNumber: '',
  countryCode: 'TR',
  flagImage: null,
  photoImage: null,
  heightCm: 178,
  weightKg: 74,
  smoker: false,
  goalkeeping: 2,
  defending: 5,
  midfield: 5,
  attacking: 5,
  pace: 5,
  stamina: 5,
  goalsPerMatch: 0,
});

const card = (id: string, name: string, over: Partial<Player> = {}): Player => {
  const raw = input(name);
  return { id, input: raw, ratings: rating.calculate(raw), ownerId: null, mergedInto: null, ...over };
};

const squad = (id: string, name: string): SquadInvite => ({
  id,
  ownerId: 'u1',
  name,
  joinCode: 'ABC123',
  logoImage: null,
});

class FakeInvites {
  readonly myTeams = signal<MyTeam[]>([]);
  readonly teamsLoaded = signal(true);
  readonly ownSquad = signal<SquadInvite | null>(null);
  readonly ownSquadLoaded = signal(true);
  readonly members = signal([]);
  readonly error = signal<string | null>(null);
  async loadMyTeams(): Promise<void> {}
  async loadOwnSquad(): Promise<void> {}
  /* Angular 19: effect'ler değişiklik algılamada daha erken çalışıyor; açık takımın üyelerini
     yükleyen effect artık testlerde de tetikleniyor. Sahte servis onu da karşılamalı. */
  async loadMembers(): Promise<void> {}
}

/** Sunucuya gitmeyen kadro dublörü — hangi takıma ne yazıldığını sayar. */
class FakeRoster {
  readonly error = signal<string | null>(null);
  rosters = new Map<string, string[]>();
  saves: { squadId: string; ids: string[] }[] = [];

  /** Sıradaki okuma(lar) hata versin (ağ / süresi dolmuş jeton). */
  failLoads = 0;
  loads = 0;

  async load(squadId: string): Promise<string[] | null> {
    this.loads++;
    if (this.failLoads > 0) {
      this.failLoads--;
      return null;
    }
    return this.rosters.get(squadId) ?? [];
  }

  /** Sunucu yazmayı YETKİ gerekçesiyle reddetsin (42501). */
  yasakli = false;
  lastWasForbidden = false;

  async save(squadId: string, ids: readonly string[]): Promise<boolean> {
    this.saves.push({ squadId, ids: [...ids] });
    this.lastWasForbidden = this.yasakli;
    if (this.yasakli) return false;
    this.rosters.set(squadId, [...ids]);
    return true;
  }
}

/**
 * KATILDIĞIN TAKIMIN KADROSU: görülür, DEĞİŞTİRİLEMEZ.
 *
 * Kural sunucuda RLS ile zorlanıyor; bu testler arayüz tarafındaki kapının da kapalı
 * olduğunu ölçüyor — düğme gizlemek yetmez, sürükle-bırak ya da ileride eklenecek bir ekran
 * kapıyı atlayabilir.
 */
describe('katılınan takımda kadro salt okunur', () => {
  let repo: FakePlayerRepositoryService;
  let invites: FakeInvites;
  let roster: FakeRoster;

  const build = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: PlayerRepositoryService, useValue: repo },
        { provide: SquadInviteService, useValue: invites },
        { provide: SquadRosterService, useValue: roster },
      ],
    });
    return { store: TestBed.inject(SquadStore), active: TestBed.inject(ActiveTeamService) };
  };

  beforeEach(() => {
    localStorage.clear();
    repo = new FakePlayerRepositoryService();
    repo.seed([card('p1', 'Ali'), card('p2', 'Veli')]);
    invites = new FakeInvites();
    roster = new FakeRoster();
  });

  it('kurduğun takımda kadro düzenlenebilir ve SUNUCUYA yazılır', async () => {
    invites.myTeams.set([{ squad: squad('t1', 'Seyir Mobil'), role: 'kurucu' }]);
    const { store, active } = build();

    active.select('t1');
    TestBed.flushEffects();
    await Promise.resolve();

    expect(store.canEditSquad()).toBeTrue();

    store.addExistingPlayer('p1');
    TestBed.flushEffects();

    expect(store.squadPlayerIds()).toEqual(['p1']);
    expect(roster.saves.at(-1)).toEqual({ squadId: 't1', ids: ['p1'] });
  });

  it('katıldığın takımda kadro DEĞİŞTİRİLEMEZ ve sunucuya yazılmaz', async () => {
    invites.myTeams.set([{ squad: squad('t2', 'Test Takımı'), role: 'uye' }]);
    roster.rosters.set('t2', ['p1', 'p2']);
    const { store, active } = build();

    active.select('t2');
    TestBed.flushEffects();
    await Promise.resolve();
    await Promise.resolve();
    TestBed.flushEffects();

    expect(store.canEditSquad()).withContext('üye düzenleyememeli').toBeFalse();
    // Kadro GÖRÜLÜYOR: sunucudan geldi.
    expect(store.squadPlayerIds()).toEqual(['p1', 'p2']);

    store.removePlayer('p1');
    store.addExistingPlayer('p2');
    TestBed.flushEffects();

    expect(store.squadPlayerIds()).withContext('liste değişmemeli').toEqual(['p1', 'p2']);
    expect(roster.saves.some((s) => s.squadId === 't2')).withContext('üye adına yazma olmamalı').toBeFalse();
  });

  /*
   * Düğmeleri gizlemek YETMEZ: form üye için hiç açılmamalı, kura da başlatılamamalı
   * (tarayıcı testinde ikisi de üyeye açıktı — kalem düğmesi modalı açıyordu).
   */
  /*
   * Havuzdaki ama kadroda OLMAYAN bir oyuncu düzenlenince form BOŞ açılıyordu: kart kadro
   * listesinde aranıyordu. "Güncelle" o oyuncunun adını siliyordu.
   */
  it('havuzdaki (kadroda olmayan) oyuncu düzenlenince kartı gelir', () => {
    const { store } = build();
    TestBed.flushEffects();

    expect(store.squadPlayerIds()).not.toContain('p2');
    store.startEditing('p2');

    expect(store.editingPlayer()?.input.name).toBe('Veli');
  });

  /*
   * `squad_players` yazımı DELETE+INSERT: her açılışta çalıştırmak kadroyu kaybetme riski.
   * Değişmemiş kadro sunucuya yeniden yazılmamalı.
   */
  it('değişmeyen kadro sunucuya yeniden yazılmaz', async () => {
    invites.myTeams.set([{ squad: squad('t1', 'Seyir Mobil'), role: 'kurucu' }]);
    roster.rosters.set('t1', ['p1']);
    const { store, active } = build();

    active.select('t1');
    TestBed.flushEffects();
    await Promise.resolve();
    await Promise.resolve();
    TestBed.flushEffects();

    expect(store.squadPlayerIds()).toEqual(['p1']);
    expect(roster.saves.length).withContext('sunucudan gelenin aynısı geri yazılmamalı').toBe(0);

    store.addExistingPlayer('p2');
    TestBed.flushEffects();
    expect(roster.saves.length).withContext('gerçek değişiklik yazılmalı').toBe(1);
  });

  it('üye form açamaz, formatı değiştiremez, kart silemez; kadro EKSİKKEN kura çekemez', async () => {
    invites.myTeams.set([{ squad: squad('t2', 'Test Takımı'), role: 'uye' }]);
    roster.rosters.set('t2', ['p1', 'p2']);
    const { store, active } = build();

    active.select('t2');
    TestBed.flushEffects();
    await Promise.resolve();
    await Promise.resolve();
    TestBed.flushEffects();

    store.startEditing('p1');
    store.startCreating();
    expect(store.formOpen()).withContext('üyeye form açılmamalı').toBeFalse();

    store.setFormat(4);
    expect(store.format()).withContext('format değişmemeli').toBe(7);

    // Kadro 7v7 için 14 kişi ister; 2 kişiyle kura yok (üye ya da kurucu fark etmez).
    expect(store.computeDraw()).withContext('kadro eksikken kura olmamalı').toBeNull();
    expect(await store.deletePlayerPermanently('p1')).withContext('üye kart silememeli').toBeFalse();
  });

  it('takım seçilmemişken düzenleme serbesttir — eski tekil kadro kullanıcının kendisinin', () => {
    const { store } = build();
    TestBed.flushEffects();

    expect(store.canEditSquad()).toBeTrue();
    store.addExistingPlayer('p1');
    TestBed.flushEffects();
    expect(store.squadPlayerIds()).toEqual(['p1']);
  });

  it('YÖNETİCİ: katıldığı takımda kadroyu düzenler ve sunucuya yazar, ama SAHİP sayılmaz', async () => {
    invites.myTeams.set([{ squad: squad('t3', 'Yönetilen'), role: 'yonetici' }]);
    roster.rosters.set('t3', ['p1']);
    const { store, active } = build();

    active.select('t3');
    TestBed.flushEffects();
    await Promise.resolve();
    await Promise.resolve();
    TestBed.flushEffects();

    expect(store.canEditSquad()).withContext('yönetici düzenleyebilmeli').toBeTrue();
    expect(store.isSquadOwner()).withContext('yetki dağıtmak yalnızca kurucuya ait').toBeFalse();

    store.addExistingPlayer('p2');
    TestBed.flushEffects();
    expect(roster.saves.at(-1)).toEqual({ squadId: 't3', ids: ['p1', 'p2'] });

    store.startEditing('p1');
    expect(store.formOpen()).withContext('yönetici oyuncu formunu açabilmeli').toBeTrue();
  });

  it('kurucu hem düzenler hem sahiptir; üye ikisi de değildir', async () => {
    invites.myTeams.set([
      { squad: squad('t1', 'Benim'), role: 'kurucu' },
      { squad: squad('t2', 'Katıldığım'), role: 'uye' },
    ]);
    const { store, active } = build();
    active.select('t1');
    TestBed.flushEffects();
    expect(store.canEditSquad()).toBeTrue();
    expect(store.isSquadOwner()).toBeTrue();
    active.select('t2');
    TestBed.flushEffects();
    expect(store.canEditSquad()).toBeFalse();
    expect(store.isSquadOwner()).toBeFalse();
  });

  it('ÜYE kadro DOLUYSA kura çekebilir (sonuç cihaza yazılır, sunucudaki kadro değişmez)', async () => {
    const ids = Array.from({ length: 14 }, (_, i) => 'k' + i);
    repo.seed(ids.map((id, i) => card(id, 'Oyuncu ' + i)));
    invites.myTeams.set([{ squad: squad('t9', 'Dolu Takım'), role: 'uye' }]);
    roster.rosters.set('t9', ids);
    const { store, active } = build();
    active.select('t9');
    TestBed.flushEffects();
    await Promise.resolve();
    await Promise.resolve();
    TestBed.flushEffects();

    expect(store.canEditSquad()).toBeFalse();
    expect(store.isSquadComplete()).toBeTrue();
    const kura = store.computeDraw();
    expect(kura).withContext('üye dolu kadroda kura çekebilmeli').not.toBeNull();
    expect(kura!.teamAPlayerIds.length + kura!.teamBPlayerIds.length).toBe(14);
    expect(roster.saves.some((x) => x.squadId === 't9')).withContext('kura sunucudaki kadroya yazmaz').toBeFalse();
  });

  /*
   * EŞLENMİŞ KART: kadroda havuz kartının ESKİ id'si duruyor, ekranlar kişinin gerçek kartının
   * id'sini veriyor. Tarama turunda (10 Ekim 2026) üçü de bozuktu.
   */
  it('EŞLENMİŞ kart: aynı kişi kadroya iki kez girmez, gerçek id ile çıkarılır, kura geçerli kalır', () => {
    repo.seed([
      card('eski', 'Kenan Yıldız', { mergedInto: 'gercek' }),
      card('gercek', 'Kenan Yıldız', { ownerId: 'uye-9' }),
      card('p1', 'Ali'),
    ]);
    const { store } = build();
    TestBed.flushEffects();
    store.addExistingPlayer('eski');
    store.addExistingPlayer('p1');
    expect(store.isInSquad('gercek')).withContext('takma ad üzerinden kadroda sayılmalı').toBeTrue();

    store.addExistingPlayer('gercek');
    expect(store.squadPlayerIds().length).withContext('aynı kişi ikinci kez eklenmemeli').toBe(2);

    store.removePlayer('gercek');
    expect(store.squadPlayerIds()).withContext('gerçek id ile çıkarılabilmeli').toEqual(['p1']);
  });

  /*
   * OKUMA HATASI "kadro boş" DEMEK DEĞİL (tarama, 10 Ekim 2026): eskiden hata [] dönüyordu;
   * kurucuda cihazdaki bayat liste sunucudaki (bilinmeyen) kadronun üstüne yazılıyordu.
   */
  const yerlesik = async () => {
    for (let i = 0; i < 4; i++) {
      TestBed.flushEffects();
      await Promise.resolve();
    }
    TestBed.flushEffects();
  };

  it('kadro OKUNAMAZSA sunucuya yazılmaz; sonsuz yeniden deneme de yok', async () => {
    invites.myTeams.set([{ squad: squad('t1', 'Seyir Mobil'), role: 'kurucu' }]);
    roster.rosters.set('t1', ['p1', 'p2']);
    roster.failLoads = 99;
    const { active } = build();
    active.select('t1');
    await yerlesik();

    expect(roster.saves.length).withContext('bilinmeyen sunucu hâli ezilmemeli').toBe(0);
    expect(roster.loads).withContext('değişiklik yokken istek döngüsü olmamalı').toBe(1);
  });

  it('okuma hatasından SONRAKİ değişiklik: yeniden okunur, sunucu aynıysa değişiklik YAZILIR', async () => {
    invites.myTeams.set([{ squad: squad('t1', 'Seyir Mobil'), role: 'kurucu' }]);
    roster.rosters.set('t1', []);
    roster.failLoads = 1;
    const { store, active } = build();
    active.select('t1');
    await yerlesik();
    expect(roster.saves.length).toBe(0);

    store.addExistingPlayer('p1');
    await yerlesik();
    expect(roster.loads).withContext('değişiklik yeniden okumayı tetiklemeli').toBe(2);
    expect(store.squadPlayerIds()).toEqual(['p1']);
    expect(roster.saves.at(-1)).toEqual({ squadId: 't1', ids: ['p1'] });
  });

  it('üyede okuma hatası ekrandaki kadroyu BOŞALTMAZ', async () => {
    invites.myTeams.set([{ squad: squad('t2', 'Test Takımı'), role: 'uye' }]);
    roster.rosters.set('t2', ['p1', 'p2']);
    const { store, active } = build();
    active.select('t2');
    await yerlesik();
    expect(store.squadPlayerIds()).toEqual(['p1', 'p2']);

    // Aynı takım yeniden okunurken (ör. kullanıcı başka hesaba geçip döndü) hata gelirse liste kalır.
    roster.failLoads = 1;
    active.select(null);
    await yerlesik();
    active.select('t2');
    await yerlesik();
    expect(store.squadPlayerIds()).withContext('hata kadroyu silmemeli').toEqual(['p1', 'p2']);
  });

  /*
   * "Sunucu bu kaydı reddetti: bu işlem için yetkin yok." (kullanıcı geri bildirimi, 11 Ekim
   * 2026). Yetki BİLİNMİYORKEN ya da açık takım artık listede değilken kadro sunucuya yazılmaya
   * çalışılıyordu; eski kural takım listede yoksa "düzenleyebilir" diyordu.
   */
  it('takım listesi henüz yüklenmeden kadro sunucuya YAZILMAZ', async () => {
    invites.teamsLoaded.set(false);
    roster.rosters.set('t1', ['p1']);
    const { store, active } = build();

    active.select('t1');
    await yerlesik();
    store.addExistingPlayer('p2');
    await yerlesik();

    expect(store.canEditSquad()).withContext('yetki bilinmiyor').toBeFalse();
    expect(roster.saves.length).withContext('yazma denenmemeli').toBe(0);
  });

  it('açık takım kullanıcının takımları arasında yoksa yazma denenmez', async () => {
    invites.myTeams.set([{ squad: squad('t1', 'Seyir Mobil'), role: 'kurucu' }]);
    const { store, active } = build();

    active.select('baskasinin-takimi');
    await yerlesik();
    store.addExistingPlayer('p1');
    await yerlesik();

    expect(store.canEditSquad()).toBeFalse();
    expect(roster.saves.some((x) => x.squadId === 'baskasinin-takimi')).toBeFalse();
  });

  it('sunucu YETKİ gerekçesiyle reddederse alt şeritte ham hata kalmaz, kadro sunucudaki hâline döner', async () => {
    invites.myTeams.set([{ squad: squad('t1', 'Seyir Mobil'), role: 'yonetici' as MyTeam['role'] }]);
    roster.rosters.set('t1', ['p1']);
    const { store, active } = build();

    active.select('t1');
    await yerlesik();
    expect(store.squadPlayerIds()).toEqual(['p1']);

    roster.yasakli = true; // kurucu yöneticiliği arada geri aldı
    store.addExistingPlayer('p2');
    await yerlesik();

    expect(roster.saves.length).toBeGreaterThan(0);
    expect(store.saveError()).withContext('ham sunucu cümlesi gösterilmemeli').toBeNull();
    expect(store.squadPlayerIds()).withContext('kaydedilmeyen değişiklik geri alınmalı').toEqual(['p1']);
  });
});
