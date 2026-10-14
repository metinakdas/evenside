import { TestBed } from '@angular/core/testing';
import { SportsDbService } from './sports-db.service';

/**
 * Ağ çağrısı `fetch` ile yapıldığı için testte `fetch` taklit ediliyor: gerçek servise
 * bağlanmak testi hem yavaş hem kırılgan yapardı (ücretsiz anahtarın hız sınırı var).
 * Test edilen: yanıtın ayıklanması, futbol dışı sporların elenmesi ve sezon sıralaması.
 */
describe('SportsDbService', () => {
  let service: SportsDbService;
  let calls: string[];

  function mockFetch(payload: unknown, ok = true): void {
    calls = [];
    spyOn(window, 'fetch').and.callFake(((url: string) => {
      calls.push(String(url));
      return Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(payload) } as Response);
    }) as typeof window.fetch);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SportsDbService);
  });

  it('iki harften kısa aramada isteğe çıkmaz', async () => {
    mockFetch({ teams: [] });
    const result = await service.searchTeams('g');
    expect(result).toEqual([]);
    expect(calls.length).toBe(0);
  });

  it('lig kulüplerini lig ADIYLA ister (açılır liste bununla dolar)', async () => {
    mockFetch({
      teams: [
        { idTeam: '1', strTeam: 'Beşiktaş', strSport: 'Soccer', strBadge: 'b.png', strEquipment: 'k.png' },
        { idTeam: '2', strTeam: 'Galatasaray', strSport: 'Soccer', strBadge: 'g.png', strEquipment: null },
      ],
    });

    const teams = await service.leagueTeams('Turkish Super Lig');

    expect(teams.map((t) => t.name)).toEqual(['Beşiktaş', 'Galatasaray']);
    expect(teams[1].kitUrl).toBeNull();
    expect(calls[0]).toContain('search_all_teams.php?l=Turkish%20Super%20Lig');
  });

  it('kulüpleri ayıklar ve futbol dışı sporları eler', async () => {
    mockFetch({
      teams: [
        {
          idTeam: '133804',
          strTeam: 'Galatasaray',
          strLeague: 'Turkish Super Lig',
          strCountry: 'Turkey',
          strSport: 'Soccer',
          strBadge: 'https://r2.thesportsdb.com/badge.png',
          strEquipment: 'https://r2.thesportsdb.com/kit.png',
        },
        { idTeam: '2', strTeam: 'Basket Takımı', strSport: 'Basketball' },
      ],
    });

    const result = await service.searchTeams('Galatasaray');

    expect(result.length).toBe(1);
    expect(result[0].name).toBe('Galatasaray');
    expect(result[0].badgeUrl).toBe('https://r2.thesportsdb.com/badge.png');
    expect(result[0].kitUrl).toBe('https://r2.thesportsdb.com/kit.png');
    expect(result[0].colour).toBeNull();
    expect(calls[0]).toContain('searchteams.php?t=Galatasaray');
  });

  it('kulüp rengini # ile normalize eder, geçersizse null döner', async () => {
    mockFetch({
      teams: [
        { idTeam: '1', strTeam: 'Bayern', strSport: 'Soccer', strColour1: 'dc052d' },
        { idTeam: '2', strTeam: 'Kulüp', strSport: 'Soccer', strColour1: 'kırmızı' },
      ],
    });

    const result = await service.searchTeams('kul');

    expect(result[0].colour).toBe('#dc052d');
    expect(result[1].colour).toBeNull();
  });

  it('formaları en yeni sezon başta olacak şekilde sıralar ve görselsizleri atar', async () => {
    mockFetch({
      equipment: [
        { idEquipment: '1', strSeason: '2021-2022', strType: '1st', strEquipment: 'https://x/1.png' },
        { idEquipment: '2', strSeason: '2025-2026', strType: '2nd', strEquipment: 'https://x/2.png' },
        { idEquipment: '3', strSeason: '2024-2025', strType: '1st', strEquipment: null },
      ],
    });

    const kits = await service.kits('133804');

    expect(kits.map((k) => k.season)).toEqual(['2025-2026', '2021-2022']);
  });

  it('sunucu hata verirse hata fırlatır (çağıran taraf mesaj gösterir)', async () => {
    mockFetch(null, false);
    await expectAsync(service.searchTeams('Galatasaray')).toBeRejected();
  });
});
