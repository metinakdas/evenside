import { ConfirmService } from '../../../core/services/confirm.service';
import { ChangeDetectionStrategy, Component, HostListener, inject, signal, viewChild } from '@angular/core';
import { PlayerFormComponent } from '../../../features/squad-builder/player-form/player-form.component';
import { SquadStore } from '../../../core/services/squad-store.service';
import { FocusTrapDirective } from '../../directives/focus-trap.directive';
import { I18nService } from '../../../core/services/i18n.service';
import { OYUN_DICTIONARIES } from '../../../core/i18n/oyun-dictionary';

/**
 * Oyuncu ekleme/düzenleme diyaloğu. Önce `SquadBuilderComponent`'in şablonunda gömülüydü;
 * `/pitch` ekranından da oyuncu düzenlenebilmesi gerekince ortak bileşene çıkarıldı —
 * iki ekranın aynı doğrulama, aynı onay akışı ve aynı ölçülerde formu görmesi için.
 *
 * Açık olup olmadığını kendi tutmaz: tek kaynak `SquadStore.formOpen()` (yani
 * `creatingNew` + `editingPlayerId`). Böylece formu açmak için herhangi bir ekran
 * `store.startEditing(id)` / `store.startCreating()` demekle yetinir.
 */
@Component({
    selector: 'app-player-form-dialog',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [PlayerFormComponent, FocusTrapDirective],
    templateUrl: './player-form-dialog.component.html',
    styleUrl: './player-form-dialog.component.scss'
})
export class PlayerFormDialogComponent {
  private readonly i18n = inject(I18nService);
  /** Sözlük ekranla birlikte yükleniyor (giriş paketi şişmesin). */
  protected readonly t = this.i18n.t;

  constructor() {
    this.i18n.register(OYUN_DICTIONARIES);
  }

  protected readonly store = inject(SquadStore);
  private readonly confirmSvc = inject(ConfirmService);

  /** Kaydedilmemiş değişiklikle kapatma onayı (Tur 3 · A13). */
  protected readonly confirmingDiscard = signal(false);

  private readonly playerForm = viewChild(PlayerFormComponent);

  /** Formda kaydedilmemiş değişiklik varsa önce onay ister. */
  closeForm(): void {
    if (this.playerForm()?.isDirty()) {
      this.confirmingDiscard.set(true);
      return;
    }
    this.store.cancelEditing();
  }

  discardChanges(): void {
    this.confirmingDiscard.set(false);
    this.store.cancelEditing();
  }

  /** "Formu temizle": girilmiş bilgi varsa önce sorar. */
  async clearForm(): Promise<void> {
    const form = this.playerForm();
    if (!form) return;
    if (form.isDirty()) {
      const ok = await this.confirmSvc.ask({
        title: this.t('onay.formBaslik'),
        message: this.t('onay.formMetin'),
        confirmLabel: this.t('onay.formDugme'),
        danger: true,
      });
      if (!ok) return;
    }
    form.reset();
  }

  keepEditing(): void {
    this.confirmingDiscard.set(false);
  }

  /**
   * Esc, × düğmesiyle AYNI korumalı akıştan geçer: kaydedilmemiş değişiklik varsa önce onay
   * sorar, sessizce kapatmaz (Tur 7 · D1 — Esc hiçbir şey yapmıyordu).
   */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    // Üstte onay penceresi açıksa Esc onu kapatır; formu değil.
    if (this.confirmSvc.pending()) return;
    if (this.store.formOpen()) this.closeForm();
  }
}
