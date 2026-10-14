import { TestBed } from '@angular/core/testing';
import { Player, PlayerInput } from '../models/player.model';
import { PlayerRepositoryService } from './player-repository.service';
import { RatingService } from './rating.service';
import { SquadStore } from './squad-store.service';
import { FakePlayerRepositoryService } from './testing/fake-player-repository';
import { findNameMatches } from '../utils/name-match';

const rating = new RatingService();

const input = (name: string, over: Partial<PlayerInput> = {}): PlayerInput => ({
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
  ...over,
});

const card = (id: string, name: string, over: Partial<Player> = {}, statOver: Partial<PlayerInput> = {}): Player => {
  const raw = input(name, statOver);
  return { id, input: raw, ratings: rating.calculate(raw), ownerId: null, mergedInto: null, ...over };
};

/**
 * "KENDİ KARTIM" MİMARİSİNİN ÇEKİRDEĞİ.
 *
 * Eşleme, havuz satırını SİLMEDEN kişinin kendi kartına yönlendirir; çözümleme tek yerde
 * (`playersById`) yapılır. Bu testler asıl iddiayı ölçüyor: kadro, kura ve saha eşlemeden
 * HABERSİZ olduğu hâlde doğru kartı görüyor.
 */
describe('kart eşleme mimarisi', () => {
  let repo: FakePlayerRepositoryService;

  beforeEach(() => {
    localStorage.clear();
    repo = new FakePlayerRepositoryService();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: PlayerRepositoryService, useValue: repo }],
    });
  });

  it('eşlemeden sonra ESKİ id kişinin kendi kartını gösterir', async () => {
    // Kadro sahibinin havuza elle eklediği kart — kaba tahminlerle.
    repo.seed([
      card('havuz-1', 'Ali Yılmaz', {}, { pace: 3, attacking: 3 }),
      // Kişinin anketle oluşturduğu kendi kartı.
      card('kendi-1', 'Ali Yılmaz', { ownerId: 'user-1' }, { pace: 9, attacking: 8 }),
    ]);

    await repo.linkToOwnedCard('havuz-1', 'kendi-1');

    expect(repo.resolveId('havuz-1')).toBe('kendi-1');
    expect(repo.playersById().get('havuz-1')?.ratings.pace).toBe(repo.playersById().get('kendi-1')!.ratings.pace);
  });

  it('kadro eşlemeden habersizdir: eski id kadroda dururken kişinin kartı devreye girer', () => {
    repo.seed([
      card('havuz-1', 'Ali Yılmaz', {}, { attacking: 2 }),
      card('kendi-1', 'Ali Yılmaz', { ownerId: 'user-1' }, { attacking: 9 }),
    ]);

    const store = TestBed.inject(SquadStore);
    store.addExistingPlayer('havuz-1');
    const before = store.players()[0];

    // Eşleme kadroya DOKUNMUYOR — sadece havuz satırı yönlendiriliyor.
    void repo.linkToOwnedCard('havuz-1', 'kendi-1');
    const after = store.players()[0];

    expect(before.id).toBe('havuz-1');
    expect(after.id).toBe('kendi-1');
    expect(after.ratings.shooting).toBeGreaterThan(before.ratings.shooting);
  });

  it('eşlenen havuz kartı havuz listesinden düşer, aynı kişi iki kez görünmez', async () => {
    repo.seed([card('havuz-1', 'Ali Yılmaz'), card('kendi-1', 'Ali Yılmaz', { ownerId: 'user-1' })]);

    await repo.linkToOwnedCard('havuz-1', 'kendi-1');

    expect(repo.poolPlayers().map((p) => p.id)).toEqual(['kendi-1']);
  });

  it('eşleme geri alınabilir', async () => {
    repo.seed([card('havuz-1', 'Ali Yılmaz'), card('kendi-1', 'Ali Yılmaz', { ownerId: 'user-1' })]);

    await repo.linkToOwnedCard('havuz-1', 'kendi-1');
    await repo.unlink('havuz-1');

    expect(repo.resolveId('havuz-1')).toBe('havuz-1');
    expect(repo.poolPlayers().length).toBe(2);
  });

  it('kadro sahibi sahipli kartı düzenleyince kart değişir ama SAHİPLİĞİ düşmez', async () => {
    repo.seed([card('kendi-1', 'Ali Yılmaz', { ownerId: 'user-1' }, { attacking: 4 })]);

    await repo.update('kendi-1', input('Ali Yılmaz', { attacking: 9 }));
    const updated = repo.playersById().get('kendi-1')!;

    expect(updated.ownerId).toBe('user-1');
    expect(updated.input.attacking).toBe(9);
  });

  it('isim eşleşmesi ÖNERİ üretir, otomatik eşlemez', () => {
    repo.seed([
      card('havuz-1', 'ali yilmaz'),
      card('kendi-1', 'Ali Yılmaz', { ownerId: 'user-1' }),
      card('kendi-2', 'Veli Yılmaz', { ownerId: 'user-2' }),
    ]);

    const suggestions = findNameMatches(
      'ALİ YILMAZ',
      repo.ownedCards().map((p) => ({ id: p.id, name: p.input.name })),
    );

    expect(suggestions.map((s) => s.id)).toEqual(['kendi-1']);
    // Öneri var ama eşleme YOK — kullanıcı onaylamadan hiçbir şey değişmez.
    expect(repo.resolveId('havuz-1')).toBe('havuz-1');
  });

  it('bozuk veri döngü oluştursa bile çözümleme sonsuza girmez', () => {
    repo.seed([
      card('a', 'Ali', { mergedInto: 'b' }),
      card('b', 'Ali', { mergedInto: 'a' }),
    ]);

    expect(() => repo.playersById()).not.toThrow();
    expect(['a', 'b']).toContain(repo.resolveId('a'));
  });

  it('bir kullanıcının yalnızca tek kendi kartı olur — ikinci kayıt günceller', async () => {
    repo.userId = 'user-1';

    const first = await repo.saveOwnCard(input('Ali Yılmaz', { pace: 4 }));
    const second = await repo.saveOwnCard(input('Ali Yılmaz', { pace: 9 }));

    expect(first!.id).toBe(second!.id);
    expect(repo.ownedCards().length).toBe(1);
    expect(repo.ownCard()!.input.pace).toBe(9);
  });
});
