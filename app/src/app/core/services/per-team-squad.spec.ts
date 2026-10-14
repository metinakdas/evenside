import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MyTeam, SquadInviteService } from './squad-invite.service';
import { Player, PlayerInput } from '../models/player.model';
import { ActiveTeamService } from './active-team.service';
import { PlayerRepositoryService } from './player-repository.service';
import { RatingService } from './rating.service';
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

const card = (id: string, name: string): Player => {
  const raw = input(name);
  return { id, input: raw, ratings: rating.calculate(raw), ownerId: null, mergedInto: null };
};

/**
 * HER TAKIMIN KENDİ KADROSU.
 *
 * Kullanıcı birden fazla takım kurabildiği için kadro artık tek bir anahtarda tutulamaz:
 * iki takım aynı kadroyu paylaşsaydı birinde yapılan değişiklik diğerini bozardı. Bu testler
 * asıl iddiayı ölçüyor — takım değişince kadro da değişiyor ve karışmıyor.
 */
/**
 * Kullanıcının KENDİ takımları (kurucu). Kadro yazmak artık yetkinin KESİN bilinmesine bağlı
 * (11 Ekim 2026): takım listede değilse düzenleme kapalı. Testteki takımlar bu yüzden listede.
 */
class FakeInvites {
  readonly myTeams = signal<MyTeam[]>(
    ['takim-A', 'takim-B'].map((id) => ({
      squad: { id, ownerId: 'u1', name: id, joinCode: 'ABC123', logoImage: null },
      role: 'kurucu',
    }) as MyTeam),
  );
  readonly teamsLoaded = signal(true);
  readonly members = signal([]);
  readonly error = signal<string | null>(null);
  async loadMyTeams(): Promise<void> {}
  async loadOwnSquad(): Promise<void> {}
  async loadMembers(): Promise<void> {}
}

describe('takım başına kadro', () => {
  let repo: FakePlayerRepositoryService;

  const build = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: PlayerRepositoryService, useValue: repo },
        { provide: SquadInviteService, useValue: new FakeInvites() },
      ],
    });
    return { store: TestBed.inject(SquadStore), active: TestBed.inject(ActiveTeamService) };
  };

  beforeEach(() => {
    localStorage.clear();
    repo = new FakePlayerRepositoryService();
    repo.seed([card('p1', 'Ali'), card('p2', 'Veli'), card('p3', 'Hasan')]);
  });

  it('takım değişince kadro da değişir — biri diğerine sızmaz', () => {
    const { store, active } = build();

    active.select('takim-A');
    TestBed.flushEffects();
    store.addExistingPlayer('p1');
    TestBed.flushEffects();
    expect(store.squadPlayerIds()).toEqual(['p1']);

    active.select('takim-B');
    TestBed.flushEffects();
    // B'nin kadrosu BOŞ başlar: A'nın kadrosunu devralmak iki takımı karıştırmanın en hızlı yolu.
    expect(store.squadPlayerIds()).toEqual([]);

    store.addExistingPlayer('p2');
    TestBed.flushEffects();
    expect(store.squadPlayerIds()).toEqual(['p2']);

    active.select('takim-A');
    TestBed.flushEffects();
    expect(store.squadPlayerIds()).toEqual(['p1']);
  });

  it('kadrolar takım başına ayrı anahtarda saklanır', () => {
    const { store, active } = build();

    active.select('takim-A');
    TestBed.flushEffects();
    store.addExistingPlayer('p1');
    TestBed.flushEffects();

    expect(localStorage.getItem('saha42.squad.v2.takim-A')).toContain('p1');
    expect(localStorage.getItem('saha42.squad.v2.takim-B')).toBeNull();
  });

  it('yeni oturumda seçili takımın kadrosu geri yüklenir', () => {
    const first = build();
    first.active.select('takim-A');
    TestBed.flushEffects();
    first.store.addExistingPlayer('p1');
    first.store.addExistingPlayer('p3');
    TestBed.flushEffects();

    // Yeni oturum: seçim de kadro da diskten okunur.
    const second = build();
    TestBed.flushEffects();

    expect(second.active.teamId()).toBe('takim-A');
    expect(second.store.squadPlayerIds()).toEqual(['p1', 'p3']);
  });

  it('takım seçilmemişse eski tekil anahtar kullanılır — takım özelliğinden önceki kadro kaybolmaz', () => {
    const { store, active } = build();

    expect(active.teamId()).toBeNull();
    store.addExistingPlayer('p2');
    TestBed.flushEffects();

    expect(localStorage.getItem('saha42.squad.v2')).toContain('p2');
  });
});
