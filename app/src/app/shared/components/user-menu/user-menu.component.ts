import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { I18nService } from '../../../core/services/i18n.service';
import { OYUN_DICTIONARIES } from '../../../core/i18n/oyun-dictionary';

/** Üç ana ekranın üst çubuğunda tekrar kullanılan giriş yapan kullanıcı + çıkış düğmesi. */
@Component({
  selector: 'app-user-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-menu.component.html',
  styleUrl: './user-menu.component.scss',
})
export class UserMenuComponent {
  private readonly i18n = inject(I18nService);
  /** Sözlük ekranla birlikte yükleniyor (giriş paketi şişmesin). */
  protected readonly t = this.i18n.t;

  constructor() {
    this.i18n.register(OYUN_DICTIONARIES);
  }

  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  async signOut(): Promise<void> {
    await this.auth.signOut();
    this.router.navigateByUrl('/login');
  }
}
