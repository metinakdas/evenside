import { TestBed } from '@angular/core/testing';
import { Player, PlayerInput } from '../models/player.model';
import { CardMatchService } from './card-match.service';
import { PlayerRepositoryService } from './player-repository.service';
import { RatingService } from './rating.service';
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

describe('CardMatchService', () => {
  let repo: FakePlayerRepositoryService;
  let service: CardMatchService;

  beforeEach(() => {
    localStorage.clear();
    repo = new FakePlayerRepositoryService();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: PlayerRepositoryService, useValue: repo }],
    });
    service = TestBed.inject(CardMatchService);
  });

  it('aynı isimli havuz kartı ile sahipli kartı önerir', () => {
    repo.seed([card('havuz-1', 'Ali Yılmaz'), card('kendi-1', 'ali yilmaz', { ownerId: 'user-1' })]);

    const list = service.suggestions();
    expect(list.length).toBe(1);
    expect(list[0].poolCard.id).toBe('havuz-1');
    expect(list[0].ownedCard.id).toBe('kendi-1');
  });

  it('sahipli kartı başka bir sahipli kartla eşleştirmeyi önermez', () => {
    repo.seed([
      card('kendi-1', 'Ali Yılmaz', { ownerId: 'user-1' }),
      card('kendi-2', 'Ali Yılmaz', { ownerId: 'user-2' }),
    ]);

    expect(service.suggestions().length).toBe(0);
  });

  it('farklı isimler için öneri üretmez', () => {
    repo.seed([card('havuz-1', 'Veli Yılmaz'), card('kendi-1', 'Ali Yılmaz', { ownerId: 'user-1' })]);

    expect(service.suggestions().length).toBe(0);
  });

  it('isimsiz kartlar birbirine yapışmaz', () => {
    repo.seed([card('havuz-1', '  '), card('kendi-1', '', { ownerId: 'user-1' })]);

    expect(service.suggestions().length).toBe(0);
  });

  it('eşleme uygulanınca öneri listeden düşer', async () => {
    repo.seed([card('havuz-1', 'Ali Yılmaz'), card('kendi-1', 'Ali Yılmaz', { ownerId: 'user-1' })]);

    await service.link(service.suggestions()[0]);

    expect(service.suggestions().length).toBe(0);
    expect(repo.resolveId('havuz-1')).toBe('kendi-1');
  });

  it('"ayrı kalsınlar" kararı hatırlanır — aynı öneri bir daha çıkmaz', () => {
    repo.seed([card('havuz-1', 'Ali Yılmaz'), card('kendi-1', 'Ali Yılmaz', { ownerId: 'user-1' })]);

    service.dismiss(service.suggestions()[0]);
    expect(service.suggestions().length).toBe(0);

    // Yeni bir oturum: karar diskten okunur.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: PlayerRepositoryService, useValue: repo }] });
    expect(TestBed.inject(CardMatchService).suggestions().length).toBe(0);
  });

  it('reddedilen kararlar geri alınabilir', () => {
    repo.seed([card('havuz-1', 'Ali Yılmaz'), card('kendi-1', 'Ali Yılmaz', { ownerId: 'user-1' })]);

    service.dismiss(service.suggestions()[0]);
    service.resetDismissed();

    expect(service.suggestions().length).toBe(1);
  });

  it('aynı isimde iki sahipli kart varsa İKİ ayrı öneri çıkar — seçim kullanıcınındır', () => {
    repo.seed([
      card('havuz-1', 'Mehmet Demir'),
      card('kendi-1', 'Mehmet Demir', { ownerId: 'user-1' }),
      card('kendi-2', 'Mehmet Demir', { ownerId: 'user-2' }),
    ]);

    expect(service.suggestions().length).toBe(2);
  });

  it('forOwnedCards: katılan üyenin kartıyla aynı adlı SAHİPSİZ havuz kartını önerir; reddedileni tekrar önermez', () => {
    repo.seed([
      card('havuz-1', 'Arda Güler'),
      card('havuz-2', 'Kerem Aktürkoğlu'),
      card('esli', 'Arda Güler', { mergedInto: 'baska' }),
      card('uye-kart', 'arda guler', { ownerId: 'uye-1' }),
      card('baska-sahipli', 'Arda Güler', { ownerId: 'uye-2' }),
    ]);
    const list = service.forOwnedCards(new Set(['uye-kart']));
    expect(list.map((o) => o.poolCard.id)).toEqual(['havuz-1']);
    expect(list[0].ownedCard.id).toBe('uye-kart');
    service.dismiss(list[0]);
    expect(service.forOwnedCards(new Set(['uye-kart']))).toEqual([]);
    expect(service.forOwnedCards(new Set())).toEqual([]);
    expect(service.forOwnedCards(new Set(['havuz-2']))).withContext('sahipsiz kart üye kartı sayılmaz').toEqual([]);
  });
});
