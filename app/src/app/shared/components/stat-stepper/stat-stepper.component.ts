import { ChangeDetectionStrategy, Component, computed, input, output , inject } from '@angular/core';
import { I18nService } from '../../../core/services/i18n.service';
import { OYUN_DICTIONARIES } from '../../../core/i18n/oyun-dictionary';

/** 0-10 arası puanlar için segment sayısı. */
const SEGMENTS = 10;

/**
 * 0–10 puan seçici — slider'ın yerine geçen 10 segmentli şerit (Tur 4 · Bölüm 5.2).
 * Dokunmatikte sürükleme hassasiyeti sorunu ortadan kalkıyor, değer tek bakışta okunuyor.
 * Erişilebilirlik açısından yine bir slider: `role="slider"` + ok tuşları + `aria-valuenow`.
 */
@Component({
  selector: 'app-stat-stepper',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stat-stepper.component.html',
  styleUrl: './stat-stepper.component.scss',
})
export class StatStepperComponent {
  private readonly i18n = inject(I18nService);
  /** Sözlük ekranla birlikte yükleniyor (giriş paketi şişmesin). */
  protected readonly t = this.i18n.t;

  constructor() {
    this.i18n.register(OYUN_DICTIONARIES);
  }

  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly valueChange = output<number>();

  protected readonly segments = computed(() =>
    Array.from({ length: SEGMENTS }, (_, i) => ({ index: i + 1, on: i + 1 <= this.value() })),
  );

  protected pick(index: number): void {
    // Dolu son segmente tekrar basmak değeri sıfırlar: 0'a inmenin başka yolu olmazdı.
    this.valueChange.emit(index === this.value() ? index - 1 : index);
  }

  /**
   * WAI-ARIA slider deseninin beklediği tuşlar: oklar bir adım, PageUp/PageDown üç adım,
   * Home/End uçlara götürür (Tur 5 · E15).
   */
  protected onKeydown(event: KeyboardEvent): void {
    const next = this.valueForKey(event.key);
    if (next === null) return;
    event.preventDefault();
    this.valueChange.emit(Math.min(SEGMENTS, Math.max(0, next)));
  }

  private valueForKey(key: string): number | null {
    const value = this.value();
    switch (key) {
      case 'ArrowRight':
      case 'ArrowUp':
        return value + 1;
      case 'ArrowLeft':
      case 'ArrowDown':
        return value - 1;
      case 'PageUp':
        return value + 3;
      case 'PageDown':
        return value - 3;
      case 'Home':
        return 0;
      case 'End':
        return SEGMENTS;
      default:
        return null;
    }
  }
}
