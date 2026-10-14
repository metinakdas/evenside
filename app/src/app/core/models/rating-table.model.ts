import { Player } from './player.model';

/** Reyting tablosunun bir satırı — hem saha ekranında hem kadro kurmada kullanılır. */
export interface RatingTableRow {
  player: Player;
  teamName: string;
  teamColor: string;
  /**
   * Oyuncu bu kadroda mı. Kadro kurma ekranındaki liste görünümü havuzu da gösterdiği için
   * gerekli (kontrol raporu B3); saha görünümünde tüm satırlar zaten kadroda olduğundan
   * alan verilmez ve "Durum" sütunu kapalı kalır.
   */
  inSquad?: boolean;
}
