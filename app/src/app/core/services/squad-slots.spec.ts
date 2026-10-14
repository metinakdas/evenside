import { TestBed } from '@angular/core/testing';
import { Player, PlayerInput, PlayerPosition } from '../models/player.model';
import { PlayerRepositoryService } from './player-repository.service';
import { RatingService } from './rating.service';
import { SquadStore } from './squad-store.service';
import { FakePlayerRepositoryService } from './testing/fake-player-repository';

const rating = new RatingService();

/** Verilen mevkide çıkması için puanları ona göre kurulmuş ham girdi. */
const inputFor = (name: string, position: PlayerPosition): PlayerInput => ({
  name,
  shirtNumber: '',
  countryCode: 'TR',
  flagImage: null,
  photoImage: null,
  heightCm: 180,
  weightKg: 76,
  smoker: false,
  goalkeeping: position === 'KAL' ? 10 : 0,
  defending: position === 'DEF' ? 10 : 2,
  midfield: position === 'OS' ? 10 : 2,
  attacking: position === 'FOR' ? 10 : 2,
  pace: 5,
  stamina: 5,
  goalsPerMatch: 0,
});

const card = (id: string, position: PlayerPosition): Player => {
  const raw = inputFor(id, position);
  return { id, input: raw, ratings: rating.calculate(raw), ownerId: null, mergedInto: null };
};

/**
 * KADRODA MEVKİ KOTASI YOKTUR (kullanıcı isteği: "isterse hepsi forvet olsun").
 *
 * Izgara yalnızca OKUNABİLİRLİK için hat sırasına göre dizilir (KAL → DEF → OS → FOR);
 * dizilişin istediği sayıya göre boş yuva açmaz, kimseyi "fazla" saymaz. Boş yuva sadece
 * "daha kaç kişi lazım" der.
 */
describe('kadro yuvaları: hat SIRASI var, hat KOTASI yok', () => {
  let repo: FakePlayerRepositoryService;
  let store: SquadStore;

  beforeEach(() => {
    localStorage.clear();
    repo = new FakePlayerRepositoryService();
    repo.seed([card('def1', 'DEF'), card('kal1', 'KAL'), card('for1', 'FOR'), card('for2', 'FOR')]);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: PlayerRepositoryService, useValue: repo }] });
    store = TestBed.inject(SquadStore);
  });

  it('tek bir oyuncu kadronun İLK yuvasında durur — mevkisi ne olursa olsun', () => {
    store.addExistingPlayer('for1');
    const slots = store.squadSlots();

    expect(slots[0].player?.id).toBe('for1');
    expect(slots[0].missingPosition).withContext('boş yuva mevki istemez').toBeNull();
    expect(slots.length).toBe(store.requiredPlayerCount());
  });

  it('oyuncular hat sırasına göre dizilir (KAL → DEF → OS → FOR)', () => {
    ['for1', 'def1', 'kal1'].forEach((id) => store.addExistingPlayer(id));
    const order = store.squadSlots().filter((s) => s.player).map((s) => s.player!.ratings.position);

    expect(order).toEqual(['KAL', 'DEF', 'FOR']);
  });

  it('kadro tamamen forvetlerden oluşabilir: boş yuva kalmaz, kimse "fazla" olmaz', () => {
    // 4v4: 8 kişilik kadro. İki forvet ekleyip formatı küçültmek yerine doğrudan ölçüyoruz.
    store.setFormat(4);
    ['for1', 'for2'].forEach((id) => store.addExistingPlayer(id));
    const slots = store.squadSlots();

    expect(slots.filter((s) => s.player).length).toBe(2);
    expect(slots.length).toBe(8);
    expect(slots.every((s) => s.missingPosition === null)).toBeTrue();
    // "fazla" yalnızca formatın sayısını AŞAN oyuncular içindir; iki forvet 8 kişilik kadroda fazla değil.
    expect(store.excessCount()).toBe(0);
  });
});
