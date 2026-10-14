import { Injectable, computed, inject } from '@angular/core';
import { Player } from '../models/player.model';
import { weakLinkStrength, winProbability } from './balancer.service';
import { MatchHistoryService, MatchRecord } from './match-history.service';
import { PlayerRepositoryService } from './player-repository.service';
import { PeerRatingService } from './peer-rating.service';

/**
 * SKORLARDAN FORM — oyuncu başına reyting düzeltmesi (10 Ekim 2026). Bkz. proje notları §10.
 *
 * Kart oyuncunun KENDİ beyanıdır ve insanlar kendini sistematik olarak yanlış puanlar. Skor ise
 * sahada olanın kendisidir. Her skorlu maçta kuranın beklentisi ile sonuç karşılaştırılır
 * (Elo): beklenenden iyi oynayan takımın oyuncuları yukarı, kötü oynayanınkiler aşağı düzeltilir.
 *
 * - Beklenti, kuranın kullandığı AYNI modelden gelir: zayıf halka ağırlıklı takım gücü +
 *   `winProbability`. Dengeli kurulmuş maçta beklenti %50'dir; kazanmak +, kaybetmek − verir.
 * - Gol farkı çarpanı World Football Elo'dan: 1 fark ×1, 2 fark ×1,5, 3+ fark ×(11+N)/8.
 *   3-2 ile 8-1 aynı bilgi değil.
 * - Maçlar SIRAYLA işlenir ve her maçın beklentisi o ana kadarki form ile hesaplanır: yükselen
 *   oyuncunun takımı sonraki maçta zaten favori sayılır, aynı galibiyet daha az puan getirir.
 * - Düzeltme `formCap(oynanan maç)` ile sınırlıdır: birkaç maç kartı ezmez, çok maç gerçeği gösterir.
 *
 * Kartın üzerindeki reyting DEĞİŞMEZ; düzeltme yalnızca kuranın hesabına girer.
 */
export const FORM_SETTINGS = {
  /** Maç başı en büyük değişim (beklenti 0 iken kazanmak); %50 beklentide galibiyet +K/2. */
  k: 3,
  /**
   * Düzeltmenin sınırı OYNANAN MAÇLA büyür (12 Ekim 2026): `max × n / (n + halfAt)`.
   * Az maçta kişinin beyanı (kart) ağır basar, maç biriktikçe sonuçlar: 3 maçta ±6,7 · 6 maçta
   * ±10 · 12 maçta ±13,3 · 24 maçta ±16 · üst sınır ±20. Eskiden herkes için sabit ±8'di;
   * kartını 15 puan abartmış biri ne kadar oynarsa oynasın gerçeğine inemiyordu.
   */
  max: 20,
  halfAt: 6,
} as const;

/** `n` maç oynamış oyuncunun form düzeltmesine izin verilen en büyük mutlak değer. */
export function formCap(played: number): number {
  return played <= 0 ? 0 : (FORM_SETTINGS.max * played) / (played + FORM_SETTINGS.halfAt);
}

export interface PlayerFormEntry {
  id: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  /** Reytinge eklenecek düzeltme (puan, bir ondalık). */
  delta: number;
}

/** World Football Elo gol farkı çarpanı. */
export function goalMarginFactor(goalDiff: number): number {
  const d = Math.abs(goalDiff);
  if (d <= 1) return 1;
  if (d === 2) return 1.5;
  return (11 + d) / 8;
}

/** Skoru girilmiş, iki kadrosu da kayıtlı maçlardan form tablosu çıkarır. Saf fonksiyon. */
export function computeForm(
  records: readonly MatchRecord[],
  resolve: (id: string) => string = (id) => id,
): Map<string, PlayerFormEntry> {
  const form = new Map<string, PlayerFormEntry>();
  const time = (r: MatchRecord): number => {
    const t = new Date(r.kickoff).getTime();
    return Number.isNaN(t) ? 0 : t;
  };
  const played = records
    .filter((r) => r.score && r.teamA.players?.length && r.teamB.players?.length)
    .sort((a, b) => time(a) - time(b));

  for (const match of played) {
    const score = match.score!;
    const sides = [match.teamA.players!, match.teamB.players!].map((list) =>
      list.map((p) => ({ id: resolve(p.id), name: p.name, rating: p.rating })),
    );
    const strength = sides.map((list) =>
      weakLinkStrength(list.map((p) => p.rating + (form.get(p.id)?.delta ?? 0))),
    );
    const expectedA = winProbability(strength[0], strength[1]);
    const actualA = score.a > score.b ? 1 : score.a < score.b ? 0 : 0.5;
    const change = FORM_SETTINGS.k * goalMarginFactor(score.a - score.b) * (actualA - expectedA);

    sides.forEach((list, sideIndex) => {
      const sign = sideIndex === 0 ? 1 : -1;
      const result = actualA === 0.5 ? 'drawn' : (actualA === 1) === (sideIndex === 0) ? 'won' : 'lost';
      for (const p of list) {
        const entry = form.get(p.id) ?? { id: p.id, name: p.name, played: 0, won: 0, drawn: 0, lost: 0, delta: 0 };
        entry.played++;
        entry[result]++;
        const cap = formCap(entry.played);
        entry.delta = Math.max(-cap, Math.min(cap, entry.delta + sign * change));
        form.set(p.id, entry);
      }
    });
  }

  for (const entry of form.values()) entry.delta = Math.round(entry.delta * 10) / 10;
  return form;
}

@Injectable({ providedIn: 'root' })
export class PlayerFormService {
  private readonly history = inject(MatchHistoryService);
  private readonly repo = inject(PlayerRepositoryService);
  private readonly peers = inject(PeerRatingService);

  /** Oyuncu id'si (eşleme çözülmüş) → form. */
  readonly form = computed(() => computeForm(this.history.all(), (id) => this.repo.resolveId(id)));

  /** Formu hesaplanan, skoru girilmiş maç sayısı. */
  readonly scoredMatches = computed(
    () => this.history.all().filter((r) => r.score && r.teamA.players?.length && r.teamB.players?.length).length,
  );

  /**
   * Oyuncunun kuraya giren reytingi (1-99): KART → takım arkadaşlarının görüşüyle harmanlanır
   * (PeerRatingService, en az 3 puanlayan) → skorlardan form düzeltmesi eklenir.
   */
  effectiveOverall(player: Player): number {
    const base = this.peers.blended(player.id, player.ratings.overall);
    const delta = this.form().get(this.repo.resolveId(player.id))?.delta ?? 0;
    return Math.max(1, Math.min(99, Math.round((base + delta) * 10) / 10));
  }

  /** Kuraya verilecek kopya: yalnızca `overall` düzeltilir, kart verisine dokunulmaz. */
  forBalancing(players: readonly Player[]): Player[] {
    if (!this.form().size && !this.peers.adjusted().size) return [...players];
    return players.map((p) => {
      const overall = this.effectiveOverall(p);
      return overall === p.ratings.overall ? p : { ...p, ratings: { ...p.ratings, overall } };
    });
  }
}
