import { TestBed } from '@angular/core/testing';
import { Player, PlayerInput } from '../models/player.model';
import { PlayerRepositoryService } from './player-repository.service';
import { BLANK_PLAYER_INPUT, SquadStore } from './squad-store.service';
import { StorageService } from './storage.service';
import { makeDrawResult } from './testing/draw-result.factory';
import { FakePlayerRepositoryService } from './testing/fake-player-repository';

function makeInput(overrides: Partial<PlayerInput> = {}): PlayerInput {
  return { ...BLANK_PLAYER_INPUT, name: 'Test Oyuncu', ...overrides };
}

describe('SquadStore', () => {
  let fakeRepo: FakePlayerRepositoryService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    fakeRepo = new FakePlayerRepositoryService();
    TestBed.configureTestingModule({
      providers: [{ provide: PlayerRepositoryService, useValue: fakeRepo }],
    });
  });

  it('varsayılan format 7v7 (en sık oynanan düzen)', () => {
    const store = TestBed.inject(SquadStore);
    expect(store.format()).toBe(7);
    expect(store.requiredPlayerCount()).toBe(14);
  });

  it('preserves the raw input when a player is edited (does not zero out on edit)', async () => {
    const store = TestBed.inject(SquadStore);
    const input = makeInput({ heightCm: 182, weightKg: 78, pace: 8 });

    const saved = await store.savePlayer(input);
    store.startEditing(saved!.id);

    expect(store.editingPlayer()?.input).toEqual(input);
  });

  it('recalculates ratings from the raw input when an edited player is saved again', async () => {
    const store = TestBed.inject(SquadStore);
    const saved = await store.savePlayer(makeInput({ pace: 2 }));
    const originalPace = saved!.ratings.pace;

    store.startEditing(saved!.id);
    const updated = await store.savePlayer(makeInput({ pace: 10 }));

    expect(updated!.id).toBe(saved!.id);
    expect(updated!.ratings.pace).toBeGreaterThan(originalPace);
    expect(store.players().length).toBe(1);
    expect(store.editingPlayerId()).toBeNull();
  });

  it('does not delete players when the format shrinks below the current squad size', async () => {
    const store = TestBed.inject(SquadStore);
    store.setFormat(8); // 16 gerekli
    for (let i = 0; i < 14; i++) {
      await store.savePlayer(makeInput({ name: `Oyuncu ${i}` }));
    }
    expect(store.missingCount()).toBe(2);

    store.setFormat(6); // 12 gerekli, ama 14 oyuncu var

    expect(store.players().length).toBe(14);
    expect(store.excessCount()).toBe(2);
    expect(store.isSquadComplete()).toBeFalse();
  });

  it('restores players and teams a previous session saved to localStorage', () => {
    // Havuzda zaten var olan bir oyuncuyu tohumla (SquadStore'un dışında, sanki
    // önceki oturumdan geldi gibi), sonra SquadStore'un onu id referansıyla
    // localStorage'dan geri yükleyip doğru gösterdiğini doğrula.
    const player: Player = {
      id: 'saved-1',
      input: makeInput({ name: 'Kalıcı Oyuncu' }),
      ratings: {
        pace: 60,
        shooting: 55,
        passing: 58,
        dribbling: 57,
        defending: 60,
        physical: 62,
        goalkeeping: 30,
        position: 'DEF',
        overall: 60,
        tier: 'silver',
      },
    };
    fakeRepo.seed([player]);

    const storage = TestBed.inject(StorageService);
    storage.save({
      format: 7,
      teams: [
        { side: 'A', name: 'Yıldırım FK', color: '#111111', logoImage: null },
        { side: 'B', name: 'Takım B', color: '#FB090B', logoImage: null },
      ],
      squadPlayerIds: ['saved-1'],
      drawResult: null,
    });

    const store = TestBed.inject(SquadStore);

    expect(store.format()).toBe(7);
    expect(store.players().length).toBe(1);
    expect(store.players()[0].input.name).toBe('Kalıcı Oyuncu');
    expect(store.teams()[0].name).toBe('Yıldırım FK');
  });

  it('surfaces a Turkish error via persistError when saving fails (regression: effect must allow signal writes)', () => {
    const store = TestBed.inject(SquadStore);
    const storage = TestBed.inject(StorageService);
    spyOn(storage, 'save').and.returnValue(false);

    store.setFormat(7); // sinyal değişikliği tetikler → persist effect çalışır
    TestBed.flushEffects();

    expect(store.persistError()).toContain('kaydedilemedi');
  });

  it('clears persistError once a save succeeds again', () => {
    const store = TestBed.inject(SquadStore);
    const storage = TestBed.inject(StorageService);
    const saveSpy = spyOn(storage, 'save').and.returnValue(false);
    store.setFormat(7);
    TestBed.flushEffects();
    expect(store.persistError()).not.toBeNull();

    saveSpy.and.returnValue(true);
    store.setFormat(8);
    TestBed.flushEffects();

    expect(store.persistError()).toBeNull();
  });

  it('addExistingPlayer() adds a pool player to the squad without creating a new record', async () => {
    const store = TestBed.inject(SquadStore);
    const other = await store.savePlayer(makeInput({ name: 'Havuzdaki Oyuncu' }));
    store.removePlayer(other!.id); // kadrodan çıkar ama havuzda kalsın

    store.addExistingPlayer(other!.id);

    expect(store.players().length).toBe(1);
    expect(store.players()[0].id).toBe(other!.id);
    expect(fakeRepo.players().length).toBe(1); // havuzda hâlâ tek kayıt, kopyalanmadı
  });

  it('removePlayer() unlinks from the squad but keeps the pool record (reference, not delete)', async () => {
    const store = TestBed.inject(SquadStore);
    const saved = await store.savePlayer(makeInput({ name: 'Silinecek mi' }));

    store.removePlayer(saved!.id);

    expect(store.players().length).toBe(0);
    expect(fakeRepo.playersById().has(saved!.id)).toBeTrue();
  });

  it('addDemoPlayer() creates and attaches a new pool player regardless of an in-progress edit', async () => {
    const store = TestBed.inject(SquadStore);
    const beingEdited = await store.savePlayer(makeInput({ name: 'Düzenleniyor' }));
    store.startEditing(beingEdited!.id); // rastgele ekleme bunu güncellememeli

    const random = await store.addDemoPlayer();

    expect(random).not.toBeNull();
    expect(random!.id).not.toBe(beingEdited!.id);
    expect(store.players().length).toBe(2);
    expect(fakeRepo.players().length).toBe(2);
    // Düzenlenmekte olan oyuncu rastgele veriyle ezilmemiş olmalı.
    expect(fakeRepo.playersById().get(beingEdited!.id)!.input.name).toBe('Düzenleniyor');
  });

  it('formOpen() reflects startCreating()/startEditing()/cancelEditing() (drives the form overlay)', async () => {
    const store = TestBed.inject(SquadStore);
    const saved = await store.savePlayer(makeInput({ name: 'Düzenlenecek' }));
    expect(store.formOpen()).toBeFalse();

    store.startCreating();
    expect(store.formOpen()).toBeTrue();
    expect(store.editingPlayerId()).toBeNull();

    store.startEditing(saved!.id);
    expect(store.formOpen()).toBeTrue();
    expect(store.creatingNew()).toBeFalse(); // düzenleme, "yeni" moduna baskın gelir

    store.cancelEditing();
    expect(store.formOpen()).toBeFalse();
  });

  it('a successful create keeps the panel open (creatingNew stays true) so multiple players can be added in a row', async () => {
    const store = TestBed.inject(SquadStore);
    store.startCreating();

    await store.savePlayer(makeInput({ name: 'Birinci' }));

    expect(store.formOpen()).toBeTrue();
    expect(store.editingPlayerId()).toBeNull();
  });

  it('a successful edit closes the panel (editingPlayerId resets, creatingNew was already false)', async () => {
    const store = TestBed.inject(SquadStore);
    const saved = await store.savePlayer(makeInput({ name: 'Güncellenecek' }));
    store.startEditing(saved!.id);

    await store.savePlayer(makeInput({ name: 'Güncellenecek', pace: 9 }));

    expect(store.formOpen()).toBeFalse();
  });

  // QA denetimi §6: "🎲 Rastgele" kadro dolu olduğu için tarayıcıda denenememişti.
  describe('demo oyuncu ekleme', () => {
    it('adds a generated player to both the pool and the squad', async () => {
      const store = TestBed.inject(SquadStore);

      const added = await store.addDemoPlayer();

      expect(added).not.toBeNull();
      expect(store.squadPlayerIds()).toContain(added!.id);
      expect(fakeRepo.playersById().get(added!.id)).toBeTruthy();
    });

    it('generates a player with a name and usable ratings', async () => {
      const store = TestBed.inject(SquadStore);

      const added = await store.addDemoPlayer();

      expect(added!.input.name.trim().length).toBeGreaterThan(0);
      expect(added!.ratings.overall).toBeGreaterThan(0);
      expect(added!.ratings.overall).toBeLessThanOrEqual(99);
    });

    it('refuses once the squad is full (button is disabled for the same reason)', async () => {
      const store = TestBed.inject(SquadStore);
      store.setFormat(6);
      for (let i = 0; i < 12; i++) await store.addDemoPlayer();

      const extra = await store.addDemoPlayer();

      expect(extra).toBeNull();
      expect(store.players().length).toBe(12);
    });
  });

  // Tur 3 · A5: "Rastgele" havuzdaki gerçek oyuncuları atlayıp sahte oyuncu üretiyordu.
  describe('havuzdan rastgele doldurma', () => {
    it('takes a real player from the pool instead of inventing one', async () => {
      const store = TestBed.inject(SquadStore);
      const created = await store.savePlayer(makeInput({ name: 'Havuz Oyuncusu' }));
      store.removePlayer(created!.id); // havuzda kalsın, kadroda olmasın

      const picked = store.addRandomFromPool();

      expect(picked!.id).toBe(created!.id);
      expect(store.squadPlayerIds()).toContain(created!.id);
    });

    it('prefers the line the squad is missing (a keeper first)', async () => {
      const store = TestBed.inject(SquadStore);
      const outfield = await store.savePlayer(makeInput({ name: 'Forvet Adayi', attacking: 9, goalkeeping: 0 }));
      const keeper = await store.savePlayer(makeInput({ name: 'Kaleci Adayi', goalkeeping: 10, attacking: 0 }));
      store.removePlayer(outfield!.id);
      store.removePlayer(keeper!.id);
      expect(keeper!.ratings.position).toBe('KAL'); // kurulum doğrulaması

      const picked = store.addRandomFromPool();

      expect(picked!.id).toBe(keeper!.id);
    });

    it('returns null when the pool is exhausted instead of fabricating a player', () => {
      const store = TestBed.inject(SquadStore);

      expect(store.addRandomFromPool()).toBeNull();
    });
  });

  // Tur 4 · Bölüm 4: ızgara oyuncu sayısıyla uzamamalı; formatın gerektirdiği kadar hücre olmalı.
  describe('kadro yuvaları', () => {
    it('always has exactly one slot per required player', async () => {
      const store = TestBed.inject(SquadStore);
      store.setFormat(6);

      expect(store.squadSlots().length).toBe(12);

      await store.savePlayer(makeInput({ name: 'Tek Oyuncu' }));

      expect(store.squadSlots().length).toBe(12);
      expect(store.squadSlots().filter((s) => s.player).length).toBe(1);
    });

    it('boş yuvalar mevki İSTEMEZ — kadroda hat kotası yok', async () => {
      const store = TestBed.inject(SquadStore);
      store.setFormat(6);
      await store.savePlayer(makeInput({ name: 'Kaleci', goalkeeping: 10, attacking: 0 }));

      const needs = store.squadSlots().filter((s) => !s.player).map((s) => s.missingPosition);

      // Kullanıcı isteği: "kadro eklerken mevki kısıtımız yok, isterse hepsi forvet olsun."
      expect(needs.every((n) => n === null)).toBeTrue();
      expect(needs.length).toBe(11); // 12 yuva, biri dolu
    });
  });

  // Tur 5 · R3: kadro eksikken panel tek bir tire gösteriyordu.
  describe('eksik kadroda öngörülen fark', () => {
    it('still reports a gap with an incomplete squad', async () => {
      const store = TestBed.inject(SquadStore);
      await store.savePlayer(makeInput({ name: 'Bir', attacking: 9 }));
      await store.savePlayer(makeInput({ name: 'İki', attacking: 2 }));

      // Kadro 12 kişilik değil ama eldeki iki oyuncuyla bir öngörü verilebilir.
      expect(store.isSquadComplete()).toBeFalse();
      expect(store.projectedGap()).toBeGreaterThan(0);
    });

    it('drops the weakest player when the count is odd, instead of failing', async () => {
      const store = TestBed.inject(SquadStore);
      await store.savePlayer(makeInput({ name: 'Bir' }));
      await store.savePlayer(makeInput({ name: 'İki' }));
      await store.savePlayer(makeInput({ name: 'Üç' }));

      expect(() => store.projectedGap()).not.toThrow();
    });

    it('is zero when there are not enough players to split at all', () => {
      const store = TestBed.inject(SquadStore);

      expect(store.projectedGap()).toBe(0);
    });
  });

  describe('kura sonucunun kalıcılığı (sayfa yenileme)', () => {
    /** Aynı localStorage'ı koruyarak yeni bir TestBed + yeni SquadStore kurar — sayfa yenilemesi budur. */
    function reload(players: Player[]): SquadStore {
      TestBed.resetTestingModule();
      const repo = new FakePlayerRepositoryService();
      repo.seed(players);
      TestBed.configureTestingModule({ providers: [{ provide: PlayerRepositoryService, useValue: repo }] });
      return TestBed.inject(SquadStore);
    }

    it('restores the draw result after a reload', async () => {
      const store = TestBed.inject(SquadStore);
      const a = await store.savePlayer(makeInput({ name: 'A Oyuncusu' }));
      const b = await store.savePlayer(makeInput({ name: 'B Oyuncusu' }));
      store.drawResult.set(makeDrawResult({ teamAPlayerIds: [a!.id], teamBPlayerIds: [b!.id] }));
      TestBed.flushEffects();

      const reloaded = reload([a!, b!]);

      expect(reloaded.drawResult()?.teamAPlayerIds).toEqual([a!.id]);
      expect(reloaded.drawResult()?.teamBPlayerIds).toEqual([b!.id]);
    });

    it('drops a stored draw result that no longer matches the squad', async () => {
      const store = TestBed.inject(SquadStore);
      const a = await store.savePlayer(makeInput({ name: 'A Oyuncusu' }));
      const b = await store.savePlayer(makeInput({ name: 'B Oyuncusu' }));
      store.drawResult.set(makeDrawResult({ teamAPlayerIds: [a!.id], teamBPlayerIds: [b!.id] }));
      TestBed.flushEffects();
      // Kadro kuradan sonra değişti: bayat sonuçla /saha açmak hayalet oyuncu gösterirdi.
      store.removePlayer(b!.id);
      store.drawResult.set(null);
      TestBed.flushEffects();
      const storage = TestBed.inject(StorageService);
      const saved = storage.load()!;
      storage.save({
        ...saved,
        drawResult: makeDrawResult({ teamAPlayerIds: [a!.id], teamBPlayerIds: [b!.id] }),
      });

      const reloaded = reload([a!]);

      expect(reloaded.drawResult()).toBeNull();
    });

    it('purges the abandoned v1 storage key on startup', () => {
      localStorage.setItem('saha42.squad.v1', '{"format":6}');

      TestBed.inject(SquadStore);

      expect(localStorage.getItem('saha42.squad.v1')).toBeNull();
    });
  });

  describe('post-draw pitch editing (swap / remove)', () => {
    function seedDrawResult(store: SquadStore, teamAIds: string[], teamBIds: string[]): void {
      store.drawResult.set(makeDrawResult({ teamAPlayerIds: teamAIds, teamBPlayerIds: teamBIds }));
    }

    it('swapDrawPlayers() exchanges two players across teams A/B', async () => {
      const store = TestBed.inject(SquadStore);
      const a = await store.savePlayer(makeInput({ name: 'A Oyuncusu' }));
      const b = await store.savePlayer(makeInput({ name: 'B Oyuncusu' }));
      seedDrawResult(store, [a!.id], [b!.id]);

      store.swapDrawPlayers(a!.id, b!.id);

      expect(store.drawResult()!.teamAPlayerIds).toEqual([b!.id]);
      expect(store.drawResult()!.teamBPlayerIds).toEqual([a!.id]);
    });

    it('swapDrawPlayers() is a no-op for two players already on the same team', async () => {
      const store = TestBed.inject(SquadStore);
      const a = await store.savePlayer(makeInput({ name: 'A1' }));
      const c = await store.savePlayer(makeInput({ name: 'A2' }));
      seedDrawResult(store, [a!.id, c!.id], []);

      store.swapDrawPlayers(a!.id, c!.id);

      expect(store.drawResult()!.teamAPlayerIds).toEqual([a!.id, c!.id]);
    });

    it('removePlayer() also strips the player from an existing draw result (no ghost slot on the pitch)', async () => {
      const store = TestBed.inject(SquadStore);
      const a = await store.savePlayer(makeInput({ name: 'Çıkarılacak' }));
      const b = await store.savePlayer(makeInput({ name: 'Kalacak' }));
      seedDrawResult(store, [a!.id], [b!.id]);

      store.removePlayer(a!.id);

      expect(store.drawResult()!.teamAPlayerIds).not.toContain(a!.id);
      expect(store.drawResult()!.teamBPlayerIds).toEqual([b!.id]);
    });
  });

  describe('atCapacity — "formattan fazla oyuncu seçilemez"', () => {
    async function fillSquad(store: SquadStore): Promise<void> {
      store.setFormat(6); // 12 gerekli — en küçük format, testi hızlı tutar
      for (let i = 0; i < 12; i++) {
        await store.savePlayer(makeInput({ name: `Dolgu ${i}` }));
      }
    }

    it('savePlayer() still saves a new player to the pool when full, but does not attach it to the squad', async () => {
      const store = TestBed.inject(SquadStore);
      await fillSquad(store);
      expect(store.atCapacity()).toBeTrue();

      const extra = await store.savePlayer(makeInput({ name: 'Fazlalık' }));

      expect(extra).not.toBeNull(); // havuza kaydedildi
      expect(fakeRepo.playersById().has(extra!.id)).toBeTrue();
      expect(store.players().length).toBe(12); // ama kadroya eklenmedi
      expect(store.squadPlayerIds()).not.toContain(extra!.id);
    });

    it('editing an existing squad member while full still works (edit does not change squad size)', async () => {
      const store = TestBed.inject(SquadStore);
      await fillSquad(store);
      const first = store.players()[0];

      store.startEditing(first.id);
      const updated = await store.savePlayer(makeInput({ name: 'Güncellendi', pace: 10 }));

      expect(updated!.id).toBe(first.id);
      expect(store.players().length).toBe(12);
    });

    it('addExistingPlayer() and addDemoPlayer() are no-ops once full', async () => {
      const store = TestBed.inject(SquadStore);
      await fillSquad(store);
      const outsider = await fakeRepo.create(makeInput({ name: 'Havuzda Bekleyen' }));

      store.addExistingPlayer(outsider.id);
      const random = await store.addDemoPlayer();

      expect(store.squadPlayerIds()).not.toContain(outsider.id);
      expect(random).toBeNull();
      expect(store.players().length).toBe(12);
    });
  });
});
