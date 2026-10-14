import { Injectable } from '@angular/core';
import { KeeperRotation, KeeperRotationPlan } from '../models/keeper-rotation.model';
import { Player } from '../models/player.model';

/**
 * Varsayılan periyot sayısı. 3, halı sahada yaygın "üçe böl" alışkanlığına denk geliyor;
 * takımda 3'ten az oyuncu varsa (teorik) oyuncu sayısına düşer.
 */
export const DEFAULT_KEEPER_PERIODS = 3;

/**
 * Kalecisiz takımlar için kale sırası üretir (bkz. `KeeperRotation`). Gerçek kalecisi
 * (mevkisi KAL) olan takım rotasyona girmez — `null` döner.
 */
@Injectable({ providedIn: 'root' })
export class KeeperRotationService {
  /**
   * İki takım için birlikte plan üretir; periyot sayısı ikisinde de aynı tutulur, çünkü
   * asimetrik rotasyon sahada "onlar daha az kaleci değiştirdi" tartışması yaratır.
   */
  buildPlan(teamAPlayers: readonly Player[], teamBPlayers: readonly Player[]): KeeperRotationPlan {
    const needsA = this.needsRotation(teamAPlayers);
    const needsB = this.needsRotation(teamBPlayers);
    if (!needsA && !needsB) return { A: null, B: null };

    const periods = Math.min(
      DEFAULT_KEEPER_PERIODS,
      ...[needsA ? teamAPlayers.length : Infinity, needsB ? teamBPlayers.length : Infinity],
    );

    return {
      A: needsA ? this.rotationFor(teamAPlayers, periods) : null,
      B: needsB ? this.rotationFor(teamBPlayers, periods) : null,
    };
  }

  /** Takımda mevkisi KAL olan oyuncu yoksa rotasyon gerekir. */
  needsRotation(players: readonly Player[]): boolean {
    return players.length > 0 && !players.some((p) => p.ratings.position === 'KAL');
  }

  private rotationFor(players: readonly Player[], periods: number): KeeperRotation {
    // "Kaleye hiç geçemez" işaretliler sıraya girmez; herkes işaretliyse mecburen herkes aday.
    const eligible = players.filter((p) => !p.input.noKeeper);
    const order = [...(eligible.length ? eligible : players)]
      .sort((a, b) => b.ratings.goalkeeping - a.ratings.goalkeeping)
      .slice(0, periods);
    return { periods, order };
  }
}
