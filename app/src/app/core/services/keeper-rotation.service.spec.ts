import { Player, PlayerInput, PlayerRatings } from '../models/player.model';
import { KeeperRotationService } from './keeper-rotation.service';

const BLANK_INPUT: PlayerInput = {
  name: '',
  shirtNumber: '',
  countryCode: 'TR',
  flagImage: null,
  photoImage: null,
  heightCm: 175,
  weightKg: 70,
  smoker: false,
  goalkeeping: 0,
  defending: 0,
  midfield: 0,
  attacking: 0,
  pace: 0,
  stamina: 0,
  goalsPerMatch: 0,
};

function makePlayer(id: string, goalkeeping: number, overrides: Partial<PlayerRatings> = {}): Player {
  return {
    id,
    input: { ...BLANK_INPUT, name: id },
    ratings: {
      pace: 60,
      shooting: 60,
      passing: 60,
      dribbling: 60,
      defending: 60,
      physical: 60,
      goalkeeping,
      position: 'OS',
      overall: 60,
      tier: 'silver',
      ...overrides,
    },
  };
}

describe('KeeperRotationService', () => {
  let service: KeeperRotationService;

  beforeEach(() => {
    service = new KeeperRotationService();
  });

  it('needs no rotation for a team that has a real goalkeeper', () => {
    const withKeeper = [makePlayer('k', 85, { position: 'KAL' }), makePlayer('a', 20)];

    expect(service.needsRotation(withKeeper)).toBeFalse();
  });

  it('orders the stand-in keepers by goalkeeping rating, best first', () => {
    const teamA = [makePlayer('lo', 30), makePlayer('hi', 70), makePlayer('mid', 50)];
    const teamB = [makePlayer('k', 85, { position: 'KAL' })];

    const plan = service.buildPlan(teamA, teamB);

    expect(plan.A?.order.map((p) => p.id)).toEqual(['hi', 'mid', 'lo']);
    expect(plan.B).toBeNull();
  });

  it('uses the same period count for both teams when neither has a keeper', () => {
    const teamA = [makePlayer('a1', 40), makePlayer('a2', 30), makePlayer('a3', 20)];
    const teamB = [makePlayer('b1', 45), makePlayer('b2', 35), makePlayer('b3', 25)];

    const plan = service.buildPlan(teamA, teamB);

    // Asimetrik rotasyon sahada adalet tartışması yaratır — periyot sayısı eşit olmalı.
    expect(plan.A?.periods).toBe(plan.B?.periods as number);
  });

  it('returns no plan at all when both teams have real keepers', () => {
    const plan = service.buildPlan(
      [makePlayer('ka', 85, { position: 'KAL' })],
      [makePlayer('kb', 80, { position: 'KAL' })],
    );

    expect(plan).toEqual({ A: null, B: null });
  });

  it('"kaleye hiç geçemez" işaretli oyuncu kale sırasına girmez', () => {
    const svc = new KeeperRotationService();
    const oyuncu = (id: string, gk: number, noKeeper = false) =>
      ({ id, input: { name: id, noKeeper }, ratings: { goalkeeping: gk, position: 'DEF', overall: 60 } }) as unknown as Player;
    const takim = [oyuncu('a', 90, true), oyuncu('b', 40), oyuncu('c', 30), oyuncu('d', 20)];
    const r = svc.buildPlan(takim, takim);
    expect(r.A!.order.map((p) => p.id)).not.toContain('a');
  });
});
