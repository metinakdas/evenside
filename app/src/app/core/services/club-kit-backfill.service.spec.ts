import { TestBed } from '@angular/core/testing';
import { ClubKitBackfillService } from './club-kit-backfill.service';
import { PlayerRepositoryService } from './player-repository.service';
import { SportsDbService } from './sports-db.service';
import { SquadStore } from './squad-store.service';
import { FakePlayerRepositoryService } from './testing/fake-player-repository';

/**
 * Kulüp seçimi zamanla genişledi; eski kayıtlarda kaleci forması alanı yok ve ekranda kaleci
 * düz vektör formada kalıyordu (kullanıcı geri bildirimi). Bu servis eksikleri açılışta
 * tamamlar — ama YALNIZCA gerçekten eksikse ve ağ hatası akışı bozmamalı.
 */
describe('ClubKitBackfillService', () => {
  let store: SquadStore;
  let kitsCalls: string[];

  function setup(kits: { id: string; season: string; type: string; url: string }[], searchId = '133804'): ClubKitBackfillService {
    kitsCalls = [];
    const fakeSportsDb = {
      kits: (id: string) => {
        kitsCalls.push(id);
        return Promise.resolve(kits);
      },
      searchTeams: () =>
        Promise.resolve([{ id: searchId, name: 'Galatasaray', league: '', country: '', badgeUrl: null, kitUrl: null, colour: null }]),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: PlayerRepositoryService, useValue: new FakePlayerRepositoryService() },
        { provide: SportsDbService, useValue: fakeSportsDb },
      ],
    });
    store = TestBed.inject(SquadStore);
    return TestBed.inject(ClubKitBackfillService);
  }

  beforeEach(() => localStorage.clear());

  it('kulüp seçilmemiş takım için istek atmaz', async () => {
    const service = setup([]);
    await service.run();
    expect(kitsCalls.length).toBe(0);
  });

  it('eksik kaleci formasını doldurur: ilk forma sahaya, farklı olan ikinci forma kaleciye', async () => {
    const service = setup([
      { id: '1', season: '2025-2026', type: '1st', url: 'https://x/home.png' },
      { id: '2', season: '2025-2026', type: '2nd', url: 'https://x/away.png' },
    ]);
    store.updateTeam('A', { clubName: 'Galatasaray', clubId: '133804', kitImage: 'https://x/home.png' });

    await service.run();

    const teamA = store.teams()[0];
    expect(teamA.kitImage).toBe('https://x/home.png');
    expect(teamA.keeperKitImage).toBe('https://x/away.png');
    expect(kitsCalls).toEqual(['133804']);
  });

  it('kulüp kimliği yoksa ada göre arayıp bulur', async () => {
    const service = setup([
      { id: '1', season: '2025-2026', type: '1st', url: 'https://x/home.png' },
      { id: '2', season: '2025-2026', type: '2nd', url: 'https://x/away.png' },
    ]);
    store.updateTeam('A', { clubName: 'Galatasaray', kitImage: 'https://x/home.png' });

    await service.run();

    expect(store.teams()[0].clubId).toBe('133804');
    expect(store.teams()[0].keeperKitImage).toBe('https://x/away.png');
  });

  it('ikinci forma yoksa kaleci formasız kalır (düz mor vektör forma)', async () => {
    const service = setup([{ id: '1', season: '2025-2026', type: '1st', url: 'https://x/home.png' }]);
    store.updateTeam('B', { clubName: 'Kulüp', clubId: '9', kitImage: 'https://x/home.png' });

    await service.run();

    expect(store.teams()[1].keeperKitImage).toBeNull();
  });
});
