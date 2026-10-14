import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { trUpper } from '../../../core/utils/turkish-text';
import { TeamInfo } from '../../../core/models/team.model';

/** `xl` yalnızca tören sahnesindeki takım damgası için: uzaktan okunması gereken tek yer. */
export type TeamBadgeSize = 'sm' | 'md' | 'lg' | 'xl';

@Component({
  selector: 'app-team-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './team-badge.component.html',
  styleUrl: './team-badge.component.scss',
})
export class TeamBadgeComponent {
  readonly team = input.required<TeamInfo>();
  readonly size = input<TeamBadgeSize>('md');

  readonly background = computed(() => (this.team().logoImage ? 'transparent' : this.team().color));

  readonly initials = computed(() => {
    const words = this.team().name.trim().split(/\s+/).filter(Boolean);
    return trUpper(words.map((w) => w[0]).join('').slice(0, 3) || '??');
  });
}
