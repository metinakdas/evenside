import { Player } from './player.model';

/**
 * Gerçek kalecisi olmayan bir takımın kaleyi paylaşma planı. Maç periyotlara bölünür ve
 * her periyotta sıradaki oyuncu kaleye geçer; sıra kalecilik puanına göre azalandır.
 *
 * İki takım da kalecisizse periyot sayısı ikisinde de AYNI olur — "adalet algısı" için
 * (kontrol raporu Ö3/5): bir takım 3, diğeri 2 periyot kaleci değiştirirse tartışma çıkar.
 */
export interface KeeperRotation {
  /** Maçın kaç periyoda bölüneceği. */
  periods: number;
  /** Kaleye geçecek oyuncular, ilk periyottan itibaren sırayla. */
  order: Player[];
}

/** İki takımın rotasyon planı; gerçek kalecisi olan takım için `null`. */
export interface KeeperRotationPlan {
  A: KeeperRotation | null;
  B: KeeperRotation | null;
}
