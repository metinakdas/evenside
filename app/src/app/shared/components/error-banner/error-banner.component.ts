import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type BannerVariant = 'error' | 'warning';

/**
 * Kullanıcıya anlaşılır Türkçe mesaj gösteren küçük, tekrar kullanılabilir şerit (Faz 8.4).
 * `warning` çeşidi engelleyici olmayan uyarılar için (ör. kadroda tek kaleci): kırmızı
 * "bir şey bozuldu" tonundan ayrışsın diye kehribar renkte ve `role="status"` ile duyurulur.
 */
@Component({
  selector: 'app-error-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (message()) {
      <div
        class="banner"
        [class.banner--warning]="variant() === 'warning'"
        [attr.role]="variant() === 'warning' ? 'status' : 'alert'"
      >
        {{ message() }}
      </div>
    }
  `,
  styleUrl: './error-banner.component.scss',
})
export class ErrorBannerComponent {
  readonly message = input<string | null>(null);
  readonly variant = input<BannerVariant>('error');
}
