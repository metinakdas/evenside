import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { surnameOf, trUpper } from '../../../core/utils/turkish-text';
import { TIER_BORDER_COLOR, TIER_TEXT_COLOR, tierCssGradient, tierShineGradient } from '../../../core/constants/tier-colors';
import { Player, PlayerTier } from '../../../core/models/player.model';
import { mesaj } from '../../../core/services/i18n.service';

export type PlayerCardSize = 'large' | 'mini' | 'micro';

interface StatRow {
  label: string;
  value: number | string;
  revealed: boolean;
}

@Component({
  selector: 'app-player-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './player-card.component.html',
  styleUrl: './player-card.component.scss',
})
export class PlayerCardComponent {
  readonly player = input.required<Player>();
  readonly size = input<PlayerCardSize>('large');
  /** Sayaç animasyonu sırasında kaç istatistik açığa çıkmış olsun (0-6). Varsayılan: tümü görünür. */
  readonly revealedStats = input<number>(6);
  /** Sayaç animasyonu sırasında gösterilecek geçici reyting. `null` ise gerçek reyting gösterilir. */
  readonly displayRating = input<number | null>(null);
  /**
   * Boş kart: henüz hiçbir değer girilmediyse (yeni oyuncu formunun başı) reyting, mevki ve
   * istatistikler "–" basılır. Varsayılan puanlardan hesaplanmış bir 58 DEF, kullanıcının hiç
   * girmediği bir değeri gösteriyordu (kullanıcı geri bildirimi).
   */
  readonly blank = input(false);

  readonly tier = computed<PlayerTier>(() => this.player().ratings.tier);
  readonly background = computed(() => tierCssGradient(this.tier()));
  readonly textColor = computed(() => TIER_TEXT_COLOR[this.tier()]);
  /** Kartın 3px'lik dış çerçevesi (bkz. tier-colors.ts). */
  readonly borderColor = computed(() => TIER_BORDER_COLOR[this.tier()]);
  /** Referanstaki 115deg'lik parlama şeridi. */
  readonly shine = computed(() => tierShineGradient(this.tier()));
  readonly ratingText = computed(() => (this.blank() ? '–' : (this.displayRating() ?? this.player().ratings.overall)));
  // Mevki kısaltması seçili dilde (KAL → GK/TW/POR…); computed içinde mesaj() dil sinyalini izler.
  readonly positionText = computed(() => (this.blank() ? '–' : mesaj('poz.' + this.player().ratings.position)));
  readonly showSheen = computed(() => this.size() === 'large');
  /** Fotoğraf, bayrak ve forma numarası — mikro kart dışında her boyutta. */
  readonly showDetail = computed(() => this.size() !== 'micro');

  /**
   * Altı istatistik referans kartın parçası — mikro kart dışında her boyutta basılır. Mini
   * kartta 8.7cqw = 11.7px'e denk gelir, projenin 11px alt sınırının üstünde kalır.
   */
  readonly showStats = computed(() => this.size() !== 'micro');

  /**
   * Kartta basılacak isim. Verilmezse soyadı kullanılır; kadroda soyadı çakışan oyuncular
   * varsa üst bileşen buraya "H. DOĞAN" gibi ayırt edici bir etiket geçer (QA denetimi:
   * aynı kadroda üç "DOĞAN" vardı ve kartlardan hangisi kim anlaşılmıyordu).
   */
  readonly nameLabel = input<string | null>(null);

  /**
   * Oyuncunun takımının arması. Referans FUT kartında kulüp arması reyting sütununun
   * altındadır (bayrağın hemen yanında/altında) — kartın kimlik sütunu orası. Kura töreninde
   * oyuncunun hangi takıma gittiği zaten o an açıklanıyor; arma bunu kartın üstünde de
   * sabitliyor. Yoksa (kadro ekranındaki mini kartlarda oyuncu henüz takımsız) çizilmez.
   */
  readonly teamLogo = input<string | null>(null);

  readonly surname = computed(() => {
    const override = this.nameLabel();
    if (override) return override;
    // JS'in yerel-bağımsız toUpperCase()'i "Şimşek"i "ŞIMŞEK" yapıyordu (bkz. trUpper).
    return trUpper(surnameOf(this.player().input.name));
  });

  private readonly statRows = computed<StatRow[]>(() => {
    const r = this.player().ratings;
    const shown = this.revealedStats();
    const all: Omit<StatRow, 'revealed'>[] = [
      { label: mesaj('stat.hiz'), value: Math.round(r.pace) },
      { label: mesaj('stat.sut'), value: Math.round(r.shooting) },
      { label: mesaj('stat.pas'), value: Math.round(r.passing) },
      { label: mesaj('stat.dri'), value: Math.round(r.dribbling) },
      { label: mesaj('stat.def'), value: Math.round(r.defending) },
      { label: mesaj('stat.fiz'), value: Math.round(r.physical) },
    ];
    const bos = this.blank();
    return all.map((stat, i) => ({ ...stat, value: bos ? '–' : stat.value, revealed: i < shown }));
  });

  readonly leftStats = computed(() => this.statRows().slice(0, 3));
  readonly rightStats = computed(() => this.statRows().slice(3));
}
