import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type AppButtonVariant = 'primary' | 'secondary';

@Component({
  selector: 'app-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app-button.component.html',
  styleUrl: './app-button.component.scss',
  host: { '[attr.title]': 'tooltip()' },
})
export class AppButtonComponent {
  readonly variant = input<AppButtonVariant>('primary');
  /** Kilitli/pasif durum — plan bunu "kilitli durumlar" olarak adlandırıyor. */
  readonly disabled = input<boolean>(false);
  readonly type = input<'button' | 'submit'>('button');
  /**
   * Buton neden kilitli — kullanıcı geri bildirimi: kilitli "Kuraya geç" tıklanınca
   * hiçbir şey olmuyor ve sebebi anlaşılmıyordu. Tooltip `:host`'a bağlanır, çünkü
   * `disabled` bir <button> fare olaylarını yutar ve kendi title'ını göstermez.
   */
  readonly disabledReason = input<string | null>(null);

  protected readonly tooltip = computed(() => (this.disabled() ? this.disabledReason() : null));
}
