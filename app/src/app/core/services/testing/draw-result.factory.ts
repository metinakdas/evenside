import { DrawResult } from '../../models/draw.model';

/**
 * Testler için `DrawResult` üretir. Alan eklendikçe her spec'teki nesne sabitini tek tek
 * güncellemek gerekmesin diye tek bir yerde toplandı — `spread`, `fairAlternatives`,
 * `signature` gibi alanlar eklenirken spec'ler üst üste kırılmıştı.
 */
export function makeDrawResult(overrides: Partial<DrawResult> = {}): DrawResult {
  return {
    teamAPlayerIds: [],
    teamBPlayerIds: [],
    cost: 0,
    weakKeeper: null,
    keeperCounts: { A: 1, B: 1 },
    signature: 'test-signature',
    fairAlternatives: 1,
    fairGapRange: { min: 0, max: 0 },
    winChance: { A: 0.5, B: 0.5 },
    spread: { A: 0, B: 0 },
    ...overrides,
  };
}
