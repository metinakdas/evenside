import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

@Component({
  selector: 'app-stat-slider',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stat-slider.component.html',
  styleUrl: './stat-slider.component.scss',
})
export class StatSliderComponent {
  readonly label = input.required<string>();
  readonly min = input<number>(0);
  readonly max = input<number>(10);
  readonly step = input<number>(1);
  /** İki yönlü bağlanır: `[(value)]="form.pace"`. */
  readonly value = model.required<number>();

  readonly fillPercent = computed(() => {
    const range = this.max() - this.min();
    if (range <= 0) return 0;
    return ((this.value() - this.min()) / range) * 100;
  });

  onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.value.set(Number(target.value));
  }
}
