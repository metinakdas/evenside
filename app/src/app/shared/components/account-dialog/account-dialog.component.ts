import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { FocusTrapDirective } from '../../directives/focus-trap.directive';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { SCOPED_KEYS, UserScopeService } from '../../../core/services/user-scope.service';

/** Paneldeki üç bölüm; aynı anda yalnızca biri açık olur. */
type Section = 'bilgi' | 'sifre' | 'sil';

/** Sık kullanılan parolalar — kayıt ekranındaki listeyle aynı kural (bkz. LoginComponent). */
const COMMON_PASSWORDS = new Set(['12345678', '123456789', 'password', 'parola12', 'qwerty123', '11111111']);

/** Silmeyi onaylamak için kullanıcının harfi harfine yazması gereken metin. */
const DELETE_PHRASE = 'HESABIMI SİL';
import { I18nService, mesaj } from '../../../core/services/i18n.service';
import { HESAP_DICTIONARIES } from '../../../core/i18n/hesap-dictionary';

/**
 * HESABIM paneli.
 *
 * Menüde yalnızca "Çıkış" vardı; kullanıcının şifresini değiştirmek ya da hesabını silmek
 * için hiçbir yol yoktu (kullanıcı isteği). İkisi de hesaba dokunan işler olduğu için ayrı
 * bir ekran değil, menünün üstünden açılan tek bir panelde toplandı.
 *
 * Panelin iki sert kuralı var:
 *  - Şifre değiştirmek MEVCUT şifreyi ister (açık bırakılmış cihaz senaryosu).
 *  - Hesap silmek, onay metnini HARFİ HARFİNE yazmayı ister; "Sil" düğmesi o zamana kadar
 *    kapalı durur. Geri alınamaz bir iş için tek tık fazla ucuz.
 */
@Component({
  selector: 'app-account-dialog',
  imports: [FocusTrapDirective],
  standalone: true,
  templateUrl: './account-dialog.component.html',
  styleUrl: './account-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close()' },
})
export class AccountDialogComponent {
  constructor() {
    this.i18n.register(HESAP_DICTIONARIES);
  }

  private readonly i18n = inject(I18nService);
  /** Çeviri; sözlük ekranla birlikte yükleniyor. */
  protected readonly t = this.i18n.t;

  private readonly auth = inject(AuthService);
  private readonly scope = inject(UserScopeService);
  private readonly router = inject(Router);

  readonly closed = output<void>();

  protected readonly section = signal<Section>('bilgi');
  protected readonly email = computed(() => this.auth.user()?.email ?? '—');
  protected readonly memberSince = computed(() => {
    const raw = this.auth.user()?.created_at;
    if (!raw) return '—';
    return new Date(raw).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  });

  /** Şifre formu. */
  protected readonly current = signal('');
  protected readonly next = signal('');
  protected readonly repeat = signal('');
  protected readonly passwordError = signal<string | null>(null);
  protected readonly passwordDone = signal(false);
  protected readonly saving = signal(false);

  /** Silme formu. */
  protected readonly confirmText = signal('');
  protected readonly deleteError = signal<string | null>(null);
  protected readonly deleting = signal(false);
  protected readonly deletePhrase = computed(() => this.t('hesap.onayMetni'));
  /** Seçili dildeki ifade ya da Türkçesi kabul edilir (dil sonradan değiştiyse kilitlenmesin). */
  protected readonly canDelete = computed(() => {
    const yazilan = this.confirmText().trim();
    return yazilan === this.deletePhrase() || yazilan === DELETE_PHRASE;
  });

  protected open(section: Section): void {
    this.section.set(section);
    this.passwordError.set(null);
    this.passwordDone.set(false);
    this.deleteError.set(null);
  }

  protected close(): void {
    this.closed.emit();
  }

  protected onInput(target: EventTarget | null, into: (value: string) => void): void {
    into((target as HTMLInputElement).value);
  }

  protected async submitPassword(): Promise<void> {
    if (this.saving()) return;
    const current = this.current();
    const next = this.next();

    if (!current) return this.passwordError.set(this.t('hesap.mevcutGerek'));
    if (next.length < 8) return this.passwordError.set(this.t('hesap.yeni8'));
    if (COMMON_PASSWORDS.has(next.toLowerCase())) return this.passwordError.set(this.t('hesap.yaygin'));
    // Sunucu harf + rakam istiyor (Supabase parola kuralı); aynı kuralı burada da söylüyoruz.
    if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(next) || !/[0-9]/.test(next)) {
      return this.passwordError.set(this.t('hesap.harfRakam'));
    }
    if (next !== this.repeat()) return this.passwordError.set(this.t('hesap.tutmuyor'));
    if (next === current) return this.passwordError.set(this.t('hesap.eskisiyleAyni'));

    this.passwordError.set(null);
    this.saving.set(true);
    const ok = await this.auth.updatePassword(current, next);
    this.saving.set(false);

    if (!ok) {
      this.passwordError.set(this.auth.error() ?? this.t('hesap.guncellenemedi'));
      return;
    }
    this.current.set('');
    this.next.set('');
    this.repeat.set('');
    this.passwordDone.set(true);
  }

  protected async submitDelete(): Promise<void> {
    if (this.deleting() || !this.canDelete()) return;
    this.deleteError.set(null);
    this.deleting.set(true);
    const ok = await this.auth.deleteAccount();
    this.deleting.set(false);

    if (!ok) {
      this.deleteError.set(this.auth.error() ?? mesaj('mesaj.hesapSilinemedi'));
      return;
    }

    /*
     * Sunucudaki veri gitti; CİHAZDAKİ kopya da gitmeli. Aksi hâlde aynı tarayıcıda açılan
     * yeni hesap, silinen hesabın kadrosunu ve maç geçmişini görürdü — kapatılmış bir hata
     * (bkz. UserScopeService).
     */
    const id = this.scope.userId();
    try {
      for (const base of SCOPED_KEYS) {
        localStorage.removeItem(base);
        if (id) localStorage.removeItem(`${base}::${id}`);
      }
    } catch {
      /* Depo kapalıysa sorun değil: oturum zaten kapandı. */
    }
    this.closed.emit();
    void this.router.navigateByUrl('/login');
  }
}
