import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { supabase } from '../supabase/supabase-client';
import { AuthService } from './auth.service';
import { ActiveTeamService } from './active-team.service';
import { PlayerRepositoryService } from './player-repository.service';

/**
 * TAKIM ARKADAŞI PUANLAMASI (12 Ekim 2026) — bkz. supabase/akran-puani.sql, proje notları §12.
 *
 * Kişinin kendine verdiği puan gerçek performansla zayıf ilişkili (r ≈ 0,29); dışarıdan bakanların
 * ortak görüşü daha isabetli. Takımdaki herkes kadrodaki diğer oyunculara tek bir "grupta nerede"
 * seviyesi (1-10) verir; sunucu oyuncu başına ORTANCAYI döndürür (en az 3 puanlayan varsa).
 *
 * KALİBRASYON: seviye ham hâliyle karta eklenmez. Takım arkadaşları herkese cömert ya da cimri
 * olabilir; bunu yok etmek için ortanca seviyeler TAKIMIN KART DAĞILIMINA eşlenir (z-puanı):
 * akranların söylediği SIRALAMA alınır, ölçek kartlardan gelir. Sonra kart reytingiyle,
 * puanlayan sayısı arttıkça ağırlığı büyüyerek harmanlanır. Kartın kendisi değişmez.
 */
export const PEER_SETTINGS = {
  /** Sunucunun sonuç döndürmesi için gereken en az puanlayan (gizlilik + tek uç oya karşı). */
  minRaters: 3,
  /** Kalibrasyon için en az kaç oyuncunun akran puanı olmalı (daha azında dağılım ölçülemez). */
  minPlayers: 3,
  /** Ağırlık = n / (n + k), tavan `maxWeight`: 3 kişi %50, 6 kişi %67, 9+ kişi %75. */
  k: 3,
  maxWeight: 0.75,
} as const;

export interface PeerLevel {
  raters: number;
  median: number;
}

/** Puanlayan sayısına göre akran görüşünün ağırlığı (0-0,75). */
export function peerWeight(raters: number): number {
  if (raters < PEER_SETTINGS.minRaters) return 0;
  return Math.min(PEER_SETTINGS.maxWeight, raters / (raters + PEER_SETTINGS.k));
}

/**
 * Ortanca seviyeleri takımın kart ölçeğine çevirir (z-puanı eşleme). Saf fonksiyon.
 * Dönen harita: oyuncu → akranlara göre "olması gereken" reyting (1-99).
 */
export function calibratePeer(levels: ReadonlyMap<string, PeerLevel>, cards: ReadonlyMap<string, number>): Map<string, number> {
  const ids = [...levels.keys()].filter((id) => cards.has(id) && levels.get(id)!.raters >= PEER_SETTINGS.minRaters);
  const out = new Map<string, number>();
  if (ids.length < PEER_SETTINGS.minPlayers) return out;
  const ort = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const ss = (xs: number[], m: number) => Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
  const seviye = ids.map((id) => levels.get(id)!.median);
  const kart = ids.map((id) => cards.get(id)!);
  const mL = ort(seviye);
  const sL = ss(seviye, mL);
  const mC = ort(kart);
  // Kartlar birbirine çok yakınsa akranların ayrımı yine de duyulsun: seviye başına en az 6 puan.
  const sC = Math.max(ss(kart, mC), 6 * Math.max(sL, 0.5));
  ids.forEach((id, i) => {
    const z = sL < 0.25 ? 0 : (seviye[i] - mL) / sL;
    out.set(id, Math.max(1, Math.min(99, mC + z * sC)));
  });
  return out;
}

/** Kart reytingi ile akran reytingini puanlayan sayısına göre harmanlar. */
export function blendWithPeers(card: number, peer: number | undefined, raters: number): number {
  if (peer === undefined) return card;
  return card + (peer - card) * peerWeight(raters);
}

@Injectable({ providedIn: 'root' })
export class PeerRatingService {
  private readonly auth = inject(AuthService);
  private readonly activeTeam = inject(ActiveTeamService);
  private readonly repo = inject(PlayerRepositoryService);

  /** Açık takımın toplu sonucu (kadro kimliğiyle; eşleme çözülmüş değil). */
  private readonly levels = signal<Map<string, PeerLevel>>(new Map());
  /** Bu kullanıcının açık takımda verdiği puanlar (oyuncu → seviye). */
  readonly mine = signal<Map<string, number>>(new Map());
  /** `public.peer_ratings` kurulmamış (SQL çalıştırılmadı): özellik sessizce kapalı. */
  readonly unavailable = signal(false);
  readonly loaded = signal(false);

  constructor() {
    effect(() => {
      const team = this.activeTeam.teamId();
      this.auth.user();
      void this.load(team);
    });
  }

  /** Oyuncu (eşleme çözülmüş kimlik) → { akran reytingi, puanlayan sayısı }. */
  readonly adjusted = computed(() => {
    const cozulmus = new Map<string, PeerLevel>();
    for (const [id, lvl] of this.levels()) cozulmus.set(this.repo.resolveId(id), lvl);
    const kartlar = new Map<string, number>();
    const havuz = this.repo.playersById();
    for (const id of cozulmus.keys()) {
      const p = havuz.get(id);
      if (p) kartlar.set(id, p.ratings.overall);
    }
    const kal = calibratePeer(cozulmus, kartlar);
    const out = new Map<string, { peer: number; raters: number }>();
    for (const [id, peer] of kal) out.set(id, { peer, raters: cozulmus.get(id)!.raters });
    return out;
  });

  /** Kuraya girecek reyting: kart + akran harmanı (form düzeltmesi ayrıca eklenir). */
  blended(playerId: string, card: number): number {
    const a = this.adjusted().get(this.repo.resolveId(playerId));
    return a ? blendWithPeers(card, a.peer, a.raters) : card;
  }

  /** Oyuncunun kaç kişi tarafından puanlandığı (sonuç döndüyse; 3'ten azsa 0). */
  raterCount(playerId: string): number {
    return this.adjusted().get(this.repo.resolveId(playerId))?.raters ?? 0;
  }

  refresh(): void {
    void this.load(this.activeTeam.teamId());
  }

  private async load(team: string | null): Promise<void> {
    await this.auth.ready;
    if (!team || !this.auth.user()) {
      this.levels.set(new Map());
      this.mine.set(new Map());
      this.loaded.set(true);
      return;
    }
    const [toplu, benim] = await Promise.all([
      supabase.rpc('squad_peer_levels', { p_squad: team }),
      supabase.from('peer_ratings').select('player_id, level').eq('squad_id', team),
    ]);
    if (this.activeTeam.teamId() !== team) return; // bu arada takım değişti
    const eksik = (e: { code?: string } | null) => !!e && ['PGRST202', 'PGRST205', '42P01', '42883'].includes(e.code ?? '');
    if (eksik(toplu.error) || eksik(benim.error)) {
      this.unavailable.set(true);
      this.loaded.set(true);
      return;
    }
    this.unavailable.set(false);
    if (!toplu.error) {
      const m = new Map<string, PeerLevel>();
      for (const r of (toplu.data ?? []) as { player_id: string; raters: number; median_level: number }[]) {
        m.set(r.player_id, { raters: r.raters, median: Number(r.median_level) });
      }
      this.levels.set(m);
    }
    if (!benim.error) {
      this.mine.set(new Map(((benim.data ?? []) as { player_id: string; level: number }[]).map((r) => [r.player_id, r.level])));
    }
    this.loaded.set(true);
  }

  /** Bir oyuncuya seviye verir (aynı oyuncuya yeniden verirse güncellenir). */
  async rate(playerId: string, level: number): Promise<boolean> {
    const team = this.activeTeam.teamId();
    const userId = this.auth.user()?.id;
    if (!team || !userId) return false;
    const temiz = Math.max(1, Math.min(10, Math.round(level)));
    const once = this.mine();
    this.mine.set(new Map(once).set(playerId, temiz));
    const { error } = await supabase
      .from('peer_ratings')
      .upsert(
        { squad_id: team, player_id: playerId, rater_id: userId, level: temiz, updated_at: new Date().toISOString() },
        { onConflict: 'squad_id,player_id,rater_id' },
      );
    if (error) {
      console.warn('Evenside · puan kaydedilemedi:', error.code ?? '', error.message);
      this.mine.set(once);
      return false;
    }
    return true;
  }
}
