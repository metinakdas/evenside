import { Injectable, NgZone, computed, inject, signal } from '@angular/core';

/** Bildirimin tonu: hata kırmızı, uyarı kehribar, başarı yeşil. */
export type NoticeKind = 'error' | 'warning' | 'success';

export interface Notice {
  id: number;
  kind: NoticeKind;
  text: string;
  /** Kullanıcının yapabileceği tek şey — ör. "Tekrar dene". */
  action?: { label: string; run: () => void };
}

/** Bildirim ekranda ne kadar kalır (ms). Hata daha uzun durur: okunması gerekiyor. */
const LIFETIME: Record<NoticeKind, number> = { error: 8000, warning: 6000, success: 4000 };

/**
 * TEK BİLDİRİM KAPISI.
 *
 * Her ekran hatayı kendi içinde, kendi cümlesiyle gösteriyordu; kullanıcı aynı sorunu farklı
 * yerlerde farklı metinlerle görüyor, bazı hatalar ise (ağ kopması gibi) hiç görünmüyordu.
 * Artık ekranın SAĞ ÜSTÜNDE ortak bir yığın var: nereden gelirse gelsin bildirim oraya düşer.
 *
 * Aynı metin üst üste basılmaz (tekrar eden ağ hataları ekranı doldurmasın); yalnızca süresi
 * yenilenir.
 */
@Injectable({ providedIn: 'root' })
export class NoticeService {
  private readonly zone = inject(NgZone);
  private readonly items = signal<Notice[]>([]);
  private nextId = 1;

  readonly notices = computed(() => this.items());

  show(kind: NoticeKind, text: string, action?: Notice['action']): void {
    const varOlan = this.items().find((n) => n.text === text && n.kind === kind);
    if (varOlan) {
      this.schedule(varOlan.id, kind);
      return;
    }
    const id = this.nextId++;
    this.items.update((list) => [...list, { id, kind, text, action }]);
    this.schedule(id, kind);
  }

  error(text: string, action?: Notice['action']): void {
    this.show('error', text, action);
  }

  success(text: string): void {
    this.show('success', text);
  }

  dismiss(id: number): void {
    this.items.update((list) => list.filter((n) => n.id !== id));
  }

  /*
   * Zamanlayıcı Angular BÖLGESİNİN DIŞINDA: bölge içinde açılan uzun zamanlayıcılar uygulamayı
   * "kararsız" tutuyor ve `whenStable` bekleyen testleri kilitliyor (projede iki kez yaşandı).
   * Sinyale yazmak değişiklik algılamayı zaten kendisi tetikler.
   */
  private schedule(id: number, kind: NoticeKind): void {
    this.zone.runOutsideAngular(() => {
      setTimeout(() => this.dismiss(id), LIFETIME[kind]);
    });
  }
}
