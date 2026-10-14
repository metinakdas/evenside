import { Player, PlayerPosition } from './player.model';
import { TeamSide } from './team.model';

export type SlotFit = 'own' | 'shifted';

/** Sahadaki bir mevki yuvası — dolu ise oyuncu taşır, boşsa kesik çizgili silüet olarak çizilir. */
export interface PitchSlot {
  side: TeamSide;
  mevki: PlayerPosition;
  /** 0-100, saha genişliğine göre yüzde. */
  x: number;
  /** 0-100, saha yüksekliğine göre yüzde. */
  y: number;
  /** Formasyon hattı indeksi (0 = kaleci hattı) — komşuluk/uyum çizgisi hesabında kullanılır. */
  line: number;
  player: Player | null;
  /** Oyuncu kendi en iyi mevkisinde mi (own) yoksa taşma yüzünden kaydırılmış mı (shifted). */
  fit: SlotFit | null;
}

/** İki yuva arasındaki uyum çizgisi. */
export interface PitchLink {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: SlotFit;
}

export interface PitchLayout {
  slotsA: PitchSlot[];
  slotsB: PitchSlot[];
  links: PitchLink[];
}
