import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { PersistedSquad, StorageService } from './storage.service';
import { makeDrawResult } from './testing/draw-result.factory';

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(() => {
    localStorage.clear();
    // Anahtar kullanıcıya bağlı (bkz. UserScopeService); testte oturum yok sayılır.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { user: () => null } }],
    });
    service = TestBed.inject(StorageService);
  });

  it('round-trips a saved squad exactly', () => {
    const data: PersistedSquad = {
      format: 7,
      teams: [
        { side: 'A', name: 'Takım A', color: '#0068A8', logoImage: null },
        { side: 'B', name: 'Takım B', color: '#FB090B', logoImage: null },
      ],
      squadPlayerIds: ['p1', 'p2'],
      drawResult: makeDrawResult({ teamAPlayerIds: ['p1'], teamBPlayerIds: ['p2'], cost: 1.5 }),
    };

    expect(service.save(data)).toBeTrue();
    expect(service.load()).toEqual(data);
  });

  it('returns null when nothing is saved yet', () => {
    expect(service.load()).toBeNull();
  });

  it('yields drawResult: null for records saved before kura persistence existed', () => {
    // v2'nin ilk sürümü kura sonucunu yazmıyordu; eski kayıt bozuk sayılmamalı.
    localStorage.setItem(
      'saha42.squad.v2',
      JSON.stringify({
        format: 6,
        teams: [
          { side: 'A', name: 'A', color: '#000', logoImage: null },
          { side: 'B', name: 'B', color: '#fff', logoImage: null },
        ],
        squadPlayerIds: ['p1'],
      }),
    );

    expect(service.load()).toEqual(
      jasmine.objectContaining({ format: 6, squadPlayerIds: ['p1'], drawResult: null }),
    );
  });

  it('purgeLegacyKeys() drops the abandoned v1 key', () => {
    localStorage.setItem('saha42.squad.v1', '{"format":6}');

    service.purgeLegacyKeys();

    expect(localStorage.getItem('saha42.squad.v1')).toBeNull();
  });

  it('returns null (not throw) when the stored JSON is corrupted', () => {
    localStorage.setItem('saha42.squad.v2', '{not valid json');
    expect(service.load()).toBeNull();
  });

  it('clear() removes the saved squad', () => {
    service.save({
      format: 6,
      teams: [
        { side: 'A', name: 'A', color: '#000', logoImage: null },
        { side: 'B', name: 'B', color: '#fff', logoImage: null },
      ],
      squadPlayerIds: [],
      drawResult: null,
    });

    service.clear();

    expect(service.load()).toBeNull();
  });
});
