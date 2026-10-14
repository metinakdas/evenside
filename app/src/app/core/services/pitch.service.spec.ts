import { SquadFormat } from '../models/draw.model';
import { Player, PlayerInput, PlayerPosition, PlayerRatings } from '../models/player.model';
import { FORMATION_PRESETS, PitchService } from './pitch.service';

const BLANK_INPUT: PlayerInput = {
  name: '',
  shirtNumber: '',
  countryCode: '',
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

function makePlayer(id: string, position: PlayerPosition, overall: number, goalkeeping = 20): Player {
  const ratings: PlayerRatings = {
    pace: overall,
    shooting: overall,
    passing: overall,
    dribbling: overall,
    defending: overall,
    physical: overall,
    goalkeeping,
    position,
    overall,
    tier: 'silver',
  };
  return { id, input: { ...BLANK_INPUT, name: id }, ratings };
}

describe('PitchService', () => {
  let service: PitchService;

  beforeEach(() => {
    service = new PitchService();
  });

  it('produces the documented slot count/positions per format', () => {
    expect(service.slotCoordinates(6, 'A').map((s) => s.mevki)).toEqual(['KAL', 'DEF', 'DEF', 'OS', 'OS', 'FOR']);
    expect(service.slotCoordinates(7, 'A').map((s) => s.mevki)).toEqual(['KAL', 'DEF', 'DEF', 'DEF', 'OS', 'OS', 'FOR']);
    expect(service.slotCoordinates(8, 'A').map((s) => s.mevki)).toEqual([
      'KAL', 'DEF', 'DEF', 'DEF', 'OS', 'OS', 'OS', 'FOR',
    ]);
  });

  it('keeps team A in the top half (y < 50) and team B in the bottom half (y > 50)', () => {
    const a = service.slotCoordinates(6, 'A');
    const b = service.slotCoordinates(6, 'B');
    expect(a.every((s) => s.y < 50)).toBeTrue();
    expect(b.every((s) => s.y > 50)).toBeTrue();
  });

  it('places the highest-goalkeeping player in goal even if their best position is not KAL', () => {
    const players = [
      makePlayer('def-1', 'DEF', 70, 10),
      makePlayer('def-2', 'DEF', 65, 15),
      makePlayer('os-1', 'OS', 68, 40), // en yüksek kalecilik, ama mevkisi OS
      makePlayer('os-2', 'OS', 60, 5),
      makePlayer('for-1', 'FOR', 72, 5),
      makePlayer('for-2', 'FOR', 55, 5),
    ];

    const slots = service.assignSlots(6, 'A', players);
    const keeperSlot = slots.find((s) => s.mevki === 'KAL');

    expect(keeperSlot?.player?.id).toBe('os-1');
    expect(keeperSlot?.fit).toBe('shifted');
  });

  it('shifts overflow players to the nearest open slot and fills every slot exactly once', () => {
    // 6v6 sadece 2 DEF yuvası var ama 3 DEF mevkili oyuncu geliyor.
    const players = [
      makePlayer('kal-1', 'KAL', 60, 60),
      makePlayer('def-1', 'DEF', 70, 10),
      makePlayer('def-2', 'DEF', 68, 10),
      makePlayer('def-3', 'DEF', 66, 10),
      makePlayer('os-1', 'OS', 65, 10),
      makePlayer('for-1', 'FOR', 62, 10),
    ];

    const slots = service.assignSlots(6, 'A', players);

    expect(slots.every((s) => s.player !== null)).toBeTrue();
    expect(new Set(slots.map((s) => s.player!.id)).size).toBe(6);
    const shifted = slots.filter((s) => s.fit === 'shifted');
    expect(shifted.length).toBe(1);
    expect(shifted[0].player?.id).toBe('def-3'); // en düşük reytingli taşan DEF
  });

  it('builds links only within the same side (never crossing the halfway line)', () => {
    const teamA = [
      makePlayer('a-kal', 'KAL', 60, 60),
      makePlayer('a-def', 'DEF', 70, 10),
      makePlayer('a-def2', 'DEF', 65, 10),
      makePlayer('a-os', 'OS', 65, 10),
      makePlayer('a-os2', 'OS', 60, 10),
      makePlayer('a-for', 'FOR', 62, 10),
    ];
    const teamB = teamA.map((p) => ({ ...p, id: p.id + '-b' }));

    const layout = service.buildLayout(6, teamA, teamB);

    expect(layout.links.length).toBeGreaterThan(0);
    for (const link of layout.links) {
      const bothTopHalf = link.y1 < 50 && link.y2 < 50;
      const bothBottomHalf = link.y1 > 50 && link.y2 > 50;
      expect(bothTopHalf || bothBottomHalf).toBeTrue();
    }
  });

  // Tur 3 · A1: iki oyuncunun kalecilik puanı birebir eşitken gerçek kaleci yerine
  // yüksek reytingli forvet kaleye geçiyordu.
  it('puts the real goalkeeper in goal even when someone else has the same goalkeeping score', () => {
    const realKeeper = makePlayer('kaleci', 'KAL', 66, 64);
    const forward = makePlayer('forvet', 'FOR', 67, 64); // aynı kalecilik puanı, daha yüksek overall
    const others = [
      makePlayer('d1', 'DEF', 70, 10),
      makePlayer('d2', 'DEF', 68, 10),
      makePlayer('o1', 'OS', 65, 10),
      makePlayer('f1', 'FOR', 62, 10),
    ];

    const slots = service.assignSlots(6, 'A', [forward, realKeeper, ...others]);

    const keeperSlot = slots.find((s) => s.mevki === 'KAL')!;
    expect(keeperSlot.player!.id).toBe('kaleci');
    expect(keeperSlot.fit).toBe('own');
  });

  describe('FORMATION_PRESETS ("diziliş" seçici)', () => {
    it('every preset keeps the total player count equal to its format (kaleci dahil)', () => {
      const formats: SquadFormat[] = [4, 5, 6, 7, 8, 9, 10, 11];
      formats.forEach((format) => {
        for (const preset of FORMATION_PRESETS[format]) {
          const total = preset.lines.reduce((sum, [, count]) => sum + count, 0);
          expect(total).toBe(format);
        }
      });
    });

    it("the first preset per format matches the pre-existing default (regression: shouldn't change the drawn layout)", () => {
      expect(service.slotCoordinates(6, 'A').map((s) => s.mevki)).toEqual(
        service.slotCoordinates(6, 'A', FORMATION_PRESETS[6][0].lines).map((s) => s.mevki),
      );
    });

    it('assignSlots() honors a custom formation instead of the format default', () => {
      const players = [
        makePlayer('kal-1', 'KAL', 60, 60),
        makePlayer('def-1', 'DEF', 70, 10),
        makePlayer('def-2', 'DEF', 68, 10),
        makePlayer('def-3', 'DEF', 66, 10),
        makePlayer('os-1', 'OS', 65, 10),
        makePlayer('for-1', 'FOR', 62, 10),
      ];
      const threeAtBack = FORMATION_PRESETS[6].find((p) => p.id === '3-1-1')!.lines;

      const slots = service.assignSlots(6, 'A', players, threeAtBack);

      expect(slots.map((s) => s.mevki)).toEqual(['KAL', 'DEF', 'DEF', 'DEF', 'OS', 'FOR']);
      expect(slots.filter((s) => s.fit === 'shifted').length).toBe(0); // artık taşma yok, hepsi kendi mevkisinde
    });

    // Kontrol raporu §6: 7v7 ve alternatif dizilişler tarayıcıda test edilememişti.
    it('fills every slot exactly once for 7v7 in each of its presets', () => {
      const players = [
        makePlayer('kal-1', 'KAL', 60, 60),
        makePlayer('def-1', 'DEF', 70, 10),
        makePlayer('def-2', 'DEF', 68, 10),
        makePlayer('os-1', 'OS', 66, 10),
        makePlayer('os-2', 'OS', 64, 10),
        makePlayer('for-1', 'FOR', 62, 10),
        makePlayer('for-2', 'FOR', 61, 10),
      ];

      for (const preset of FORMATION_PRESETS[7]) {
        const slots = service.assignSlots(7, 'A', players, preset.lines);

        expect(slots.length).withContext(preset.id).toBe(7);
        expect(slots.filter((s) => s.player).length).withContext(preset.id).toBe(7);
        expect(new Set(slots.map((s) => s.player!.id)).size).withContext(preset.id).toBe(7);
      }
    });

    it('fills every slot exactly once for 8v8 in each of its presets', () => {
      const players = [
        makePlayer('kal-1', 'KAL', 60, 60),
        makePlayer('def-1', 'DEF', 70, 10),
        makePlayer('def-2', 'DEF', 68, 10),
        makePlayer('def-3', 'DEF', 67, 10),
        makePlayer('os-1', 'OS', 66, 10),
        makePlayer('os-2', 'OS', 64, 10),
        makePlayer('os-3', 'OS', 63, 10),
        makePlayer('for-1', 'FOR', 62, 10),
      ];

      for (const preset of FORMATION_PRESETS[8]) {
        const slots = service.assignSlots(8, 'A', players, preset.lines);

        expect(slots.filter((s) => s.player).length).withContext(preset.id).toBe(8);
        expect(new Set(slots.map((s) => s.player!.id)).size).withContext(preset.id).toBe(8);
      }
    });

    /**
     * Formatlar zamanla genişledi (6-8 → 9-11 → 4-5). HER formatın HER dizilişinde tüm
     * yuvalar tam bir kez dolmalı: eksik `FORMATIONS`/`FORMATION_PRESETS` girdisi sahayı
     * sessizce boş bırakır. 4v4/5v5 dizilişlerinde sayısı 0 olan hatlar da var (ör. 2-1-0) —
     * bu test onların yuva üretmediğini ve toplamı bozmadığını da kapsıyor.
     */
    it('her formatın her dizilişinde her yuva tam bir kez dolar', () => {
      const allFormats: SquadFormat[] = [4, 5, 6, 7, 8, 9, 10, 11];

      for (const format of allFormats) {
        const players = [
          makePlayer('kal-1', 'KAL', 60, 60),
          ...Array.from({ length: format - 1 }, (_, i) =>
            makePlayer(`oyuncu-${i}`, i < 4 ? 'DEF' : i < 7 ? 'OS' : 'FOR', 70 - i, 10),
          ),
        ];

        for (const preset of FORMATION_PRESETS[format]) {
          const slots = service.assignSlots(format, 'A', players, preset.lines);

          expect(slots.length).withContext(`${format} · ${preset.id}`).toBe(format);
          expect(slots.filter((s) => s.player).length).withContext(`${format} · ${preset.id}`).toBe(format);
          expect(new Set(slots.map((s) => s.player!.id)).size).withContext(`${format} · ${preset.id}`).toBe(format);
        }
      }
    });
  });

  it("\"kaleye hiç geçemez\" işaretli oyuncu, kalecilik puanı en yüksek olsa bile kaleye konmaz", () => {
    const yasakli = makePlayer("yasak", "DEF", 80, 90);
    yasakli.input = { ...yasakli.input, noKeeper: true };
    const digerleri = ["d1", "d2", "o1", "o2", "f1"].map((id, i) => makePlayer(id, i < 2 ? "DEF" : i < 4 ? "OS" : "FOR", 60, 30 + i));
    const slots = service.assignSlots(6, "A", [yasakli, ...digerleri]);
    const kale = slots.find((sl) => sl.mevki === "KAL");
    expect(kale?.player?.id).not.toBe("yasak");
    expect(slots.some((sl) => sl.player?.id === "yasak")).toBeTrue();
  });
});
