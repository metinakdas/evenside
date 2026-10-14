import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { ConfirmService } from '../../../core/services/confirm.service';
import { I18nService } from '../../../core/services/i18n.service';
import { FocusTrapDirective } from '../../directives/focus-trap.directive';

/**
 * Onay penceresi — uygulama kökünde TEK bir tane (bkz. ConfirmService).
 *
 * Güvenli varsayılan: açılınca odak "Vazgeç"te (Enter'a refleksle basan kişi bir şey
 * silmesin). Esc ve pencerenin dışına tıklamak da vazgeçer. Yıkıcı işlemde onay düğmesi kırmızı.
 */
@Component({
  selector: 'app-confirm-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FocusTrapDirective],
  template: `
    @if (confirm.pending(); as req) {
      <div class="confirm-overlay" (click)="confirm.answer(false)">
        <div
          class="confirm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-message"
          appFocusTrap
          (click)="$event.stopPropagation()"
        >
          <span class="confirm__icon" [class.confirm__icon--danger]="req.danger" aria-hidden="true">!</span>
          <h2 class="confirm__title" id="confirm-title">{{ req.title }}</h2>
          <p class="confirm__message" id="confirm-message">{{ req.message }}</p>
          <div class="confirm__actions">
            <button type="button" class="confirm__btn confirm__btn--cancel" (click)="confirm.answer(false)">
              {{ req.cancelLabel ?? t('onay.vazgec') }}
            </button>
            @for (x of req.extras ?? []; track x.id) {
              <button type="button" class="confirm__btn confirm__btn--extra" (click)="confirm.answer(x.id)">{{ x.label }}</button>
            }
            <button
              type="button"
              class="confirm__btn"
              [class.confirm__btn--danger]="req.danger"
              [class.confirm__btn--primary]="!req.danger"
              (click)="confirm.answer(true)"
            >
              {{ req.confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .confirm-overlay {
      position: fixed;
      inset: 0;
      z-index: 400;
      display: grid;
      place-items: center;
      padding: 16px;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(2px);
      animation: confirm-in 160ms ease-out;
    }
    .confirm {
      width: min(440px, 100%);
      padding: 24px;
      border-radius: 18px;
      border: 1px solid var(--color-divider);
      background: var(--color-panel);
      box-shadow: var(--shadow-elevated);
      display: flex;
      flex-direction: column;
      gap: 10px;
      animation: confirm-pop 180ms ease-out;
    }
    .confirm__icon {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      font-family: var(--font-display);
      font-size: 22px;
      font-weight: 800;
      background: light-dark(rgba(161, 92, 0, 0.12), rgba(240, 180, 41, 0.16));
      color: light-dark(#a15c00, #f0b429);
    }
    .confirm__icon--danger {
      background: light-dark(rgba(196, 43, 43, 0.12), rgba(255, 107, 109, 0.16));
      color: light-dark(#c42b2b, #ff6b6d);
    }
    .confirm__title {
      margin: 4px 0 0;
      font-family: var(--font-body);
      font-size: 18px;
      font-weight: 700;
      color: var(--color-text-primary);
    }
    .confirm__message {
      margin: 0;
      font-family: var(--font-body);
      font-size: 14px;
      line-height: 1.5;
      color: var(--color-text-secondary);
    }
    .confirm__actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 10px;
    }
    .confirm__btn {
      min-height: 44px;
      padding: 0 18px;
      border-radius: 999px;
      border: 1px solid var(--color-divider);
      background: transparent;
      color: var(--color-text-primary);
      font-family: var(--font-body);
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
    }
    /* Ek seçenekli soru (kart eşleme): dört düğme tek satıra sığsın diye pencere genişler,
       "Vazgeç" sola ayrılır — karar düğmeleri sağda bir arada durur. */
    .confirm:has(.confirm__btn--extra) {
      width: min(560px, 100%);
    }
    .confirm:has(.confirm__btn--extra) .confirm__btn--cancel {
      margin-right: auto;
    }
    .confirm__btn--extra:hover,
    .confirm__btn--cancel:hover {
      border-color: var(--color-accent-line);
    }
    .confirm__btn--primary {
      border-color: var(--color-accent);
      background: var(--color-accent);
      color: var(--color-accent-contrast, #05130a);
    }
    .confirm__btn--danger {
      border-color: #ef4444;
      background: #ef4444;
      color: #fff;
    }
    .confirm__btn--danger:hover,
    .confirm__btn--primary:hover {
      filter: brightness(1.08);
    }
    .confirm__btn:focus-visible {
      outline: 2px solid var(--color-accent-line);
      outline-offset: 2px;
    }
    @keyframes confirm-in {
      from { opacity: 0; }
    }
    @keyframes confirm-pop {
      from { opacity: 0; transform: translateY(8px) scale(0.98); }
    }
    @media (prefers-reduced-motion: reduce) {
      .confirm-overlay, .confirm { animation: none; }
    }
    @media (max-width: 480px) {
      .confirm__actions { flex-direction: column-reverse; }
      .confirm__btn { width: 100%; }
    }
  `,
})
export class ConfirmHostComponent {
  protected readonly confirm = inject(ConfirmService);
  protected readonly t = inject(I18nService).t;

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (!this.confirm.pending()) return;
    // Onay açıkken Esc yalnızca onayı kapatır, altındaki pencereyi değil.
    event.stopImmediatePropagation();
    this.confirm.answer(false);
  }
}
