import { ChangeDetectionStrategy, Component, input , inject } from '@angular/core';
import { Player } from '../../../core/models/player.model';
import { TeamInfo, TeamSide } from '../../../core/models/team.model';
import { TeamBadgeComponent } from '../team-badge/team-badge.component';
import { I18nService } from '../../../core/services/i18n.service';
import { OYUN_DICTIONARIES } from '../../../core/i18n/oyun-dictionary';
import { takimAdiGoster } from '../../../core/utils/team-name';

/**
 * Kura ve saha ekranlarında ortak kullanılan yan panel: takım rozeti + adı +
 * oyuncu listesi + ortalama. "TAKIM A/B" etiketi kullanıcı takımı yeniden
 * adlandırsa bile hangi tarafın A hangi tarafın B olduğu hep açık kalsın diye
 * eklendi (bkz. kullanıcı geri bildirimi — saha haritasında A/B netleşmeli).
 */
@Component({
    selector: 'app-team-roster-panel',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [TeamBadgeComponent],
    templateUrl: './team-roster-panel.component.html',
    styleUrl: './team-roster-panel.component.scss'
})
export class TeamRosterPanelComponent {
  /** Varsayılan "Takım A/B" ekranda çevrilir; kullanıcının verdiği ad olduğu gibi kalır. */
  protected readonly takimAdi = takimAdiGoster;

  private readonly i18n = inject(I18nService);
  /** Sözlük ekranla birlikte yükleniyor (giriş paketi şişmesin). */
  protected readonly t = this.i18n.t;

  constructor() {
    this.i18n.register(OYUN_DICTIONARIES);
  }

  readonly side = input.required<TeamSide>();
  readonly team = input.required<TeamInfo>();
  readonly players = input.required<Player[]>();
  /** Kura sırasında henüz herkes açılmamışken toplam kadro sayısı farklı olabilir. */
  readonly totalCount = input<number | null>(null);
  readonly avg = input<string>('—');
}
