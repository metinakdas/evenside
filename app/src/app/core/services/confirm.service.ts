import { Injectable, signal } from '@angular/core';

/** Onay penceresinde gösterilecek içerik. Metinler çağıran tarafta çevrilmiş gelir. */
export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Geri alınamaz / yıkıcı işlem: onay düğmesi kırmızı. */
  danger?: boolean;
  /**
   * Onay ile vazgeç arasında ek seçenekler (ör. kart eşlemede "Ayrı kişiler", "Adını değiştir").
   * Yalnızca `choose()` ile anlamlı: seçilen seçeneğin `id`'si döner.
   */
  extras?: { id: string; label: string }[];
}

interface PendingConfirm extends ConfirmRequest {
  resolve: (answer: boolean | string) => void;
}

/**
 * ONAY — silme, çıkarma ve kaldırma işlemlerinin TEK kapısı (10 Ekim 2026, kullanıcı isteği:
 * "direkt silme, çıkarmak istediğinize emin misiniz diye sorsun").
 *
 * `ask()` bir söz döner: kullanıcı onaylarsa true, vazgeçerse (düğme, Esc, dışarı tıklama) false.
 * Pencere uygulama kökünde tek bir yerde çizilir (`app-confirm-host`). Aynı anda ikinci bir
 * soru gelirse önceki VAZGEÇİLMİŞ sayılır — iki pencere üst üste açılmaz.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly pending = signal<PendingConfirm | null>(null);

  ask(request: ConfirmRequest): Promise<boolean> {
    return this.open(request).then((a) => a === true);
  }

  /**
   * Çok seçenekli soru: onay → `'onay'`, ek seçenek → onun `id`'si, vazgeç/Esc/dışarı → `null`.
   * Vazgeçmek HİÇBİR karar sayılmaz (kart eşlemede Esc "ayrı kişiler" demek değildir).
   */
  choose(request: ConfirmRequest): Promise<string | null> {
    return this.open(request).then((a) => (a === true ? 'onay' : a === false ? null : a));
  }

  private open(request: ConfirmRequest): Promise<boolean | string> {
    this.pending()?.resolve(false);
    return new Promise<boolean | string>((resolve) => this.pending.set({ ...request, resolve }));
  }

  answer(ok: boolean | string): void {
    const current = this.pending();
    if (!current) return;
    this.pending.set(null);
    current.resolve(ok);
  }
}
