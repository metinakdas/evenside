import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NoticeService } from '../../../core/services/notice.service';
import { I18nService } from '../../../core/services/i18n.service';

/**
 * Bildirim yığını — ekranın SAĞ ÜSTÜ, tüm rotaların üstünde (app.component'te bir kez basılır).
 *
 * `role="status"` + `aria-live="polite"`: ekran okuyucu bildirimi okur ama kullanıcının
 * yaptığı işi bölmez. Hata bildirimleri `assertive` DEĞİL — kullanıcı formda yazarken sesli
 * okuyucunun araya girmesi, hatayı okumaktan daha çok engelliyor.
 */
@Component({
  selector: 'app-toast-host',
  standalone: true,
  templateUrl: './toast-host.component.html',
  styleUrl: './toast-host.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastHostComponent {
  private readonly i18n = inject(I18nService);
  /** Taban sözlük uygulama açılışında yüklü; ayrıca register gerekmiyor. */
  protected readonly t = this.i18n.t;

  protected readonly notices = inject(NoticeService);
}
