import { fakeAsync, tick } from '@angular/core/testing';
import { Player, PlayerInput } from '../models/player.model';
import { TeamInfo } from '../models/team.model';
import { SequenceService } from './sequence.service';

const BLANK_INPUT: PlayerInput = {
  name: '',
  shirtNumber: '',
  countryCode: 'TR',
  flagImage: null,
  photoImage: null,
  heightCm: 180,
  weightKg: 75,
  smoker: false,
  goalkeeping: 0,
  defending: 0,
  midfield: 0,
  attacking: 0,
  pace: 0,
  stamina: 0,
  goalsPerMatch: 0,
};

function makePlayer(id: string, overall: number): Player {
  return {
    id,
    input: { ...BLANK_INPUT, name: id },
    ratings: {
      pace: overall,
      shooting: overall,
      passing: overall,
      dribbling: overall,
      defending: overall,
      physical: overall,
      goalkeeping: overall,
      position: 'OS',
      overall,
      tier: overall >= 85 ? 'special' : overall >= 75 ? 'gold' : overall >= 65 ? 'silver' : 'bronze',
    },
  };
}

describe('SequenceService', () => {
  let service: SequenceService;
  let teams: [TeamInfo, TeamInfo];

  beforeEach(() => {
    service = new SequenceService();
    // rAF'a bağımlı sayaç animasyonunu devre dışı bırakıp zamanlamayı deterministik yapar.
    service.reducedMotion.set(true);
    teams = [
      { side: 'A', name: 'Takım A', color: '#111111', logoImage: null },
      { side: 'B', name: 'Takım B', color: '#222222', logoImage: null },
    ];
  });

  it('classifies ceremony tiers at the documented thresholds', () => {
    expect(service.tierOf(60)).toBe('sade');
    expect(service.tierOf(69)).toBe('sade');
    expect(service.tierOf(70)).toBe('altin');
    expect(service.tierOf(84)).toBe('altin');
    expect(service.tierOf(85)).toBe('walkout');
  });

  it('reveals players from lowest to highest rating, not the prototype\'s reversed order', () => {
    const players = [makePlayer('high', 90), makePlayer('low', 55), makePlayer('mid', 72)];
    service.initialize(players, teams, { high: 'A', low: 'A', mid: 'B' });

    service.next();

    expect(service.currentPlayer()?.id).toBe('low');
  });

  it('walks a full reveal (prep → position → teamlogo → walkout → counter → land) and auto-finishes on the last player', fakeAsync(() => {
    const players = [makePlayer('p1', 55)]; // düşük reyting — eskiden "sade" kısaltılmış sekansı alırdı
    service.initialize(players, teams, { p1: 'A' });

    service.next();
    expect(service.locked()).toBeTrue();
    // Sayaç AÇILMIŞ kartı sayar, açılmakta olanı değil: hiçbir şey açılmadan "1 / 14"
    // yazıyordu (tarayıcı test raporu B5).
    expect(service.progressText()).toBe('0 / 1');

    tick(150 * 6 + 50); // azaltılmış harekette her faz 150ms, sekans artık 6 faz

    expect(service.locked()).toBeFalse();
    expect(service.progressText()).withContext('kart yere indi, sayaç artmalı').toBe('1 / 1');
    expect(service.placedIds()).toEqual(['p1']);
    expect(service.displayRating()).toBe(55);
    // Regresyon: son oyuncu iner inmez biter — "Sıradaki oyuncu"ya bir kez daha
    // (hiçbir şey yapmayan) tıklamak gerekmez.
    expect(service.finished()).toBeTrue();
  }));

  it('every tier — low or high rated — walks the exact same phase sequence (bkz. kullanıcı isteği: "75 üstü animasyon hepsinde geçerli olsun")', fakeAsync(() => {
    const phasesFor = (overall: number): string[] => {
      const svc = new SequenceService();
      svc.reducedMotion.set(true);
      svc.initialize([makePlayer('p1', overall)], teams, { p1: 'A' });
      const seen: string[] = [];
      svc.next();
      for (let i = 0; i < 6; i++) {
        seen.push(svc.phase());
        tick(150);
      }
      return seen;
    };

    const low = phasesFor(55); // sade
    const mid = phasesFor(76); // altin
    const high = phasesFor(90); // walkout

    expect(low).toEqual(['prep', 'position', 'teamlogo', 'walkout', 'counter', 'land']);
    expect(mid).toEqual(low);
    expect(high).toEqual(low);
  }));

  it('position then the destination team logo appear before landing', fakeAsync(() => {
    const players = [makePlayer('p1', 55)];
    service.initialize(players, teams, { p1: 'A' });
    service.next();

    expect(service.phase()).toBe('prep');
    tick(150); // prep -> position
    expect(service.phase()).toBe('position');
    tick(150); // position -> teamlogo
    expect(service.phase()).toBe('teamlogo');

    tick(150 * 4); // teamlogo -> walkout -> counter -> land -> biter (bekleyen zamanlayıcı kalmasın)
  }));

  it('skip() lands the current player early without waiting the full sequence', fakeAsync(() => {
    const players = [makePlayer('p1', 90)];
    service.initialize(players, teams, { p1: 'A' });
    service.next();
    expect(service.locked()).toBeTrue();

    service.skip();
    tick(200);

    expect(service.locked()).toBeFalse();
    expect(service.placedIds()).toEqual(['p1']);
  }));

  it('next() is a no-op while the sequence is locked (no double-advance on double-click)', fakeAsync(() => {
    const players = [makePlayer('p1', 55), makePlayer('p2', 60)];
    service.initialize(players, teams, { p1: 'A', p2: 'A' });

    service.next();
    const lockedIndex = service.currentIndex();
    service.next();
    service.next();

    expect(service.currentIndex()).toBe(lockedIndex);
    tick(1000);
  }));

  it('toggleAutoPlay() ("İleri sar") starts immediately and chains through every remaining player unattended', fakeAsync(() => {
    const players = [makePlayer('p1', 55), makePlayer('p2', 60), makePlayer('p3', 90)];
    service.initialize(players, teams, { p1: 'A', p2: 'A', p3: 'A' });

    service.toggleAutoPlay();
    expect(service.autoPlay()).toBeTrue();
    expect(service.locked()).toBeTrue(); // hemen başladı, "Sıradaki oyuncu"ya tıklamaya gerek yok

    tick(20000); // tüm sekansın bitmesi için bolca zaman

    expect(service.finished()).toBeTrue();
    expect(service.placedIds()).toEqual(['p1', 'p2', 'p3']);
  }));

  it('toggleAutoPlay() again turns it back off without forcing further advances', fakeAsync(() => {
    const players = [makePlayer('p1', 55), makePlayer('p2', 60)];
    service.initialize(players, teams, { p1: 'A', p2: 'A' });

    service.toggleAutoPlay();
    service.toggleAutoPlay();
    expect(service.autoPlay()).toBeFalse();

    tick(150 * 6 + 50); // ilk oyuncu iner...
    expect(service.placedIds()).toEqual(['p1']);
    tick(2000); // ...ama ikincisi otomatik başlamaz
    expect(service.placedIds()).toEqual(['p1']);
    expect(service.locked()).toBeFalse();
  }));

  it('skipAll() ("Atla") places every remaining player instantly with no animation', fakeAsync(() => {
    const players = [makePlayer('p1', 55), makePlayer('p2', 60), makePlayer('p3', 90)];
    service.initialize(players, teams, { p1: 'A', p2: 'A', p3: 'A' });
    service.next(); // ortada bir yerde durduruyoruz

    service.skipAll();

    expect(service.finished()).toBeTrue();
    expect(service.locked()).toBeFalse();
    expect(service.placedIds()).toEqual(['p1', 'p2', 'p3']);
    expect(service.phase()).toBe('idle');
    tick(1); // bekleyen zamanlayıcı kalmadığını doğrula (hata fırlatmaz)
  }));
});
