import { Injectable } from '@angular/core';
import { SquadFormat } from '../models/draw.model';
import { Player, PlayerPosition } from '../models/player.model';
import { PitchLayout, PitchLink, PitchSlot } from '../models/pitch.model';
import { TeamSide } from '../models/team.model';

/** Hat listesi — [mevki, o hattaki yuva sayısı], kaleci dahil, kaleden orta sahaya doğru sırayla. */
export type FormationLines = [PlayerPosition, number][];

export interface FormationPreset {
  id: string;
  /** "3-2-1" gibi — DEF-OS-FOR sırası, kaleci örtük. */
  label: string;
  lines: FormationLines;
}

/** Format → varsayılan hat listesi. Prototipin `FORMATIONS` sabitiyle aynı. */
const FORMATIONS: Record<SquadFormat, FormationLines> = {
  4: [
    ['KAL', 1],
    ['DEF', 1],
    ['OS', 1],
    ['FOR', 1],
  ],
  5: [
    ['KAL', 1],
    ['DEF', 2],
    ['OS', 1],
    ['FOR', 1],
  ],
  6: [
    ['KAL', 1],
    ['DEF', 2],
    ['OS', 2],
    ['FOR', 1],
  ],
  7: [
    ['KAL', 1],
    ['DEF', 3],
    ['OS', 2],
    ['FOR', 1],
  ],
  8: [
    ['KAL', 1],
    ['DEF', 3],
    ['OS', 3],
    ['FOR', 1],
  ],
  9: [
    ['KAL', 1],
    ['DEF', 3],
    ['OS', 3],
    ['FOR', 2],
  ],
  10: [
    ['KAL', 1],
    ['DEF', 4],
    ['OS', 3],
    ['FOR', 2],
  ],
  11: [
    ['KAL', 1],
    ['DEF', 4],
    ['OS', 4],
    ['FOR', 2],
  ],
};

/**
 * Kadro haritası (bkz. `TeamLineupCardComponent`) için seçilebilir diziliş seçenekleri —
 * her formatın toplam oyuncu sayısını korur, ilk seçenek her zaman varsayılan `FORMATIONS`.
 */
export const FORMATION_PRESETS: Record<SquadFormat, FormationPreset[]> = {
  4: [
    { id: '1-1-1', label: '1-1-1', lines: FORMATIONS[4] },
    { id: '2-1-0', label: '2-1-0', lines: [['KAL', 1], ['DEF', 2], ['OS', 1], ['FOR', 0]] },
    { id: '1-2-0', label: '1-2-0', lines: [['KAL', 1], ['DEF', 1], ['OS', 2], ['FOR', 0]] },
    { id: '1-0-2', label: '1-0-2', lines: [['KAL', 1], ['DEF', 1], ['OS', 0], ['FOR', 2]] },
  ],
  5: [
    { id: '2-1-1', label: '2-1-1', lines: FORMATIONS[5] },
    { id: '1-2-1', label: '1-2-1', lines: [['KAL', 1], ['DEF', 1], ['OS', 2], ['FOR', 1]] },
    { id: '2-2-0', label: '2-2-0', lines: [['KAL', 1], ['DEF', 2], ['OS', 2], ['FOR', 0]] },
    { id: '1-1-2', label: '1-1-2', lines: [['KAL', 1], ['DEF', 1], ['OS', 1], ['FOR', 2]] },
  ],
  6: [
    { id: '2-2-1', label: '2-2-1', lines: FORMATIONS[6] },
    { id: '1-3-1', label: '1-3-1', lines: [['KAL', 1], ['DEF', 1], ['OS', 3], ['FOR', 1]] },
    { id: '3-1-1', label: '3-1-1', lines: [['KAL', 1], ['DEF', 3], ['OS', 1], ['FOR', 1]] },
    { id: '2-1-2', label: '2-1-2', lines: [['KAL', 1], ['DEF', 2], ['OS', 1], ['FOR', 2]] },
  ],
  7: [
    { id: '3-2-1', label: '3-2-1', lines: FORMATIONS[7] },
    { id: '2-3-1', label: '2-3-1', lines: [['KAL', 1], ['DEF', 2], ['OS', 3], ['FOR', 1]] },
    { id: '2-2-2', label: '2-2-2', lines: [['KAL', 1], ['DEF', 2], ['OS', 2], ['FOR', 2]] },
    { id: '3-1-2', label: '3-1-2', lines: [['KAL', 1], ['DEF', 3], ['OS', 1], ['FOR', 2]] },
  ],
  8: [
    { id: '3-3-1', label: '3-3-1', lines: FORMATIONS[8] },
    { id: '3-2-2', label: '3-2-2', lines: [['KAL', 1], ['DEF', 3], ['OS', 2], ['FOR', 2]] },
    { id: '2-3-2', label: '2-3-2', lines: [['KAL', 1], ['DEF', 2], ['OS', 3], ['FOR', 2]] },
    { id: '4-2-1', label: '4-2-1', lines: [['KAL', 1], ['DEF', 4], ['OS', 2], ['FOR', 1]] },
  ],
  9: [
    { id: '3-3-2', label: '3-3-2', lines: FORMATIONS[9] },
    { id: '4-3-1', label: '4-3-1', lines: [['KAL', 1], ['DEF', 4], ['OS', 3], ['FOR', 1]] },
    { id: '3-4-1', label: '3-4-1', lines: [['KAL', 1], ['DEF', 3], ['OS', 4], ['FOR', 1]] },
    { id: '4-2-2', label: '4-2-2', lines: [['KAL', 1], ['DEF', 4], ['OS', 2], ['FOR', 2]] },
  ],
  10: [
    { id: '4-3-2', label: '4-3-2', lines: FORMATIONS[10] },
    { id: '3-4-2', label: '3-4-2', lines: [['KAL', 1], ['DEF', 3], ['OS', 4], ['FOR', 2]] },
    { id: '4-4-1', label: '4-4-1', lines: [['KAL', 1], ['DEF', 4], ['OS', 4], ['FOR', 1]] },
    { id: '3-3-3', label: '3-3-3', lines: [['KAL', 1], ['DEF', 3], ['OS', 3], ['FOR', 3]] },
  ],
  11: [
    { id: '4-4-2', label: '4-4-2', lines: FORMATIONS[11] },
    { id: '4-3-3', label: '4-3-3', lines: [['KAL', 1], ['DEF', 4], ['OS', 3], ['FOR', 3]] },
    { id: '3-5-2', label: '3-5-2', lines: [['KAL', 1], ['DEF', 3], ['OS', 5], ['FOR', 2]] },
    { id: '5-3-2', label: '5-3-2', lines: [['KAL', 1], ['DEF', 5], ['OS', 3], ['FOR', 2]] },
  ],
};

const POSITION_ORDER: readonly PlayerPosition[] = ['KAL', 'DEF', 'OS', 'FOR'];
/** İki dolu yuva arasında uyum çizgisi çizilecek en fazla uzaklık (% birimde). */
const LINK_DISTANCE_THRESHOLD = 40;

/**
 * Oyuncuları sahadaki mevki yuvalarına yerleştirir ve aralarındaki uyum çizgilerini
 * hesaplar (bkz. proje notları Faz 6). Hem kura töreni (dolarak açılan yuvalar)
 * hem saha görünümü (tamamı dolu) aynı yerleşimi kullanır.
 */
@Injectable({ providedIn: 'root' })
export class PitchService {
  /** Bir takımın kendi yarısındaki boş yuva koordinatları — kaleden orta sahaya doğru. */
  slotCoordinates(format: SquadFormat, side: TeamSide, formationLines?: FormationLines): Omit<PitchSlot, 'player' | 'fit'>[] {
    const lines = formationLines ?? FORMATIONS[format];
    const lineCount = lines.length;
    const out: Omit<PitchSlot, 'player' | 'fit'>[] = [];

    lines.forEach(([mevki, count], lineIndex) => {
      const frac = lineCount > 1 ? lineIndex / (lineCount - 1) : 0;
      const y = side === 'A' ? 7 + frac * 36 : 93 - frac * 36;
      for (let j = 0; j < count; j++) {
        const x = ((j + 1) / (count + 1)) * 100;
        out.push({ side, mevki, x, y, line: lineIndex });
      }
    });

    return out;
  }

  /**
   * Yerleştirme kuralları (Faz 6.3): önce en yüksek kalecilik puanlı oyuncu kale
   * yuvasına (mevkisi kaleci olmasa bile), kalanlar kendi mevkisine reyting sırasıyla,
   * mevki dolmuşsa en yakın boş hatta kayar ve rozeti turuncuya (`shifted`) döner.
   */
  assignSlots(format: SquadFormat, side: TeamSide, players: readonly Player[], formationLines?: FormationLines): PitchSlot[] {
    const slots: PitchSlot[] = this.slotCoordinates(format, side, formationLines).map((s) => ({
      ...s,
      player: null,
      fit: null,
    }));

    const remaining = [...players];
    const keeperSlot = slots.find((s) => s.mevki === 'KAL');
    if (keeperSlot && remaining.length) {
      // Sıralı karşılaştırma: ÖNCE gerçek kaleci (mevkisi KAL), sonra kalecilik puanı,
      // sonra genel reyting. Eskiden yalnızca kalecilik puanına ve katı ">" ile bakılıyordu;
      // iki oyuncunun kalecilik puanı birebir eşit olduğunda (aynı slider + aynı boy) sıra
      // dizi düzenine kalıyor ve gerçek kaleci varken forvet kaleye geçebiliyordu (Tur 3 · A1).
      let bestIndex = 0;
      remaining.forEach((p, i) => {
        if (this.isBetterKeeper(p, remaining[bestIndex])) bestIndex = i;
      });
      const [keeper] = remaining.splice(bestIndex, 1);
      keeperSlot.player = keeper;
      keeperSlot.fit = keeper.ratings.position === 'KAL' ? 'own' : 'shifted';
    }

    const buckets: Record<PlayerPosition, Player[]> = { KAL: [], DEF: [], OS: [], FOR: [] };
    remaining.forEach((p) => buckets[p.ratings.position].push(p));
    POSITION_ORDER.forEach((m) => buckets[m].sort((a, b) => b.ratings.overall - a.ratings.overall));

    POSITION_ORDER.forEach((m) => {
      slots.forEach((slot) => {
        if (slot.mevki === m && !slot.player && buckets[m].length) {
          slot.player = buckets[m].shift() ?? null;
          slot.fit = 'own';
        }
      });
    });

    const leftovers = POSITION_ORDER.flatMap((m) => buckets[m]);
    leftovers.forEach((player) => {
      const empty = slots.filter((s) => !s.player);
      if (!empty.length) {
        // Format × 2 === kadro sayısı garantisi `squadCompleteGuard` ile sağlanır;
        // buraya düşülmesi bir hatadır, sessizce yutulmaz.
        console.error(`Evenside: "${player.input.name}" için boş yuva kalmadı — format/kadro sayısı uyuşmuyor.`);
        return;
      }
      empty.sort((a, b) => Math.abs(a.y - 50) - Math.abs(b.y - 50));
      empty[0].player = player;
      empty[0].fit = 'shifted';
    });

    return slots;
  }

  /** Kaleye kim geçmeli: gerçek kaleci > yüksek kalecilik puanı > yüksek genel reyting. */
  private isBetterKeeper(candidate: Player, current: Player): boolean {
    // "Kaleye hiç geçemez" işaretli oyuncu, işaretsiz biri varken asla kaleye konmaz.
    const allowed = (p: Player): number => (p.input.noKeeper ? 0 : 1);
    if (allowed(candidate) !== allowed(current)) return allowed(candidate) > allowed(current);
    const isKeeper = (p: Player): number => (p.ratings.position === 'KAL' ? 1 : 0);
    if (isKeeper(candidate) !== isKeeper(current)) return isKeeper(candidate) > isKeeper(current);
    if (candidate.ratings.goalkeeping !== current.ratings.goalkeeping) {
      return candidate.ratings.goalkeeping > current.ratings.goalkeeping;
    }
    return candidate.ratings.overall > current.ratings.overall;
  }

  /** Aynı yarıda, komşu hatlardaki ve yeterince yakın dolu yuvalar arasında uyum çizgisi. */
  buildLinks(slots: readonly PitchSlot[]): PitchLink[] {
    const filled = slots.filter((s) => s.player && s.fit);
    const links: PitchLink[] = [];

    for (let i = 0; i < filled.length; i++) {
      for (let j = i + 1; j < filled.length; j++) {
        const a = filled[i];
        const b = filled[j];
        if (a.side !== b.side) continue;
        if (Math.abs(a.line - b.line) > 1) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) > LINK_DISTANCE_THRESHOLD) continue;
        const color: PitchLink['color'] = a.fit === 'shifted' || b.fit === 'shifted' ? 'shifted' : 'own';
        links.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, color });
      }
    }

    return links;
  }

  buildLayout(format: SquadFormat, teamAPlayers: readonly Player[], teamBPlayers: readonly Player[]): PitchLayout {
    const slotsA = this.assignSlots(format, 'A', teamAPlayers);
    const slotsB = this.assignSlots(format, 'B', teamBPlayers);
    return { slotsA, slotsB, links: this.buildLinks([...slotsA, ...slotsB]) };
  }
}
