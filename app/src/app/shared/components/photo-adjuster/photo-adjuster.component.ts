import { ChangeDetectionStrategy, Component, ElementRef, computed, input, output, signal, viewChild , inject } from '@angular/core';
import { I18nService } from '../../../core/services/i18n.service';
import { OYUN_DICTIONARIES } from '../../../core/i18n/oyun-dictionary';

/** Ayar çerçevesinin CSS ölçüsü — kartın portre alanıyla aynı orana (5:4) sahip. */
export const FRAME_WIDTH = 300;
export const FRAME_HEIGHT = 240;

/** Kaydedilen görselin genişliği; kart en fazla 340px olduğu için 480 fazlasıyla yeter. */
const OUTPUT_WIDTH = 480;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;

/**
 * Kullanıcının yüklediği fotoğrafı kartta nasıl duracağını KENDİSİNİN ayarlamasını sağlar:
 * sürükleyerek konumlandırma + yakınlaştırma. Önceden fotoğraf olduğu gibi karta basılıyordu;
 * arka planı silinmiş bir portrede bile yüzün kartın neresine denk geleceğine kullanıcı karar
 * veremiyordu.
 *
 * Önizleme CSS `transform` ile yapılır (anlık), kaydederken aynı dönüşüm canvas'a birebir
 * uygulanır — yani gördüğü şey çıkan şeydir.
 */
@Component({
  selector: 'app-photo-adjuster',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './photo-adjuster.component.html',
  styleUrl: './photo-adjuster.component.scss',
})
export class PhotoAdjusterComponent {
  private readonly i18n = inject(I18nService);
  /** Sözlük ekranla birlikte yükleniyor (giriş paketi şişmesin). */
  protected readonly t = this.i18n.t;

  constructor() {
    this.i18n.register(OYUN_DICTIONARIES);
  }

  /** Ayarlanacak görsel (data URL). */
  readonly source = input.required<string>();

  /** Kullanıcı "Uygula" dediğinde çerçeveye göre yeniden çizilmiş PNG. */
  readonly applied = output<string>();
  readonly cancelled = output<void>();

  protected readonly frameWidth = FRAME_WIDTH;
  protected readonly frameHeight = FRAME_HEIGHT;

  protected readonly zoom = signal(1);
  protected readonly offsetX = signal(0);
  protected readonly offsetY = signal(0);
  /** Görsel yüklenene kadar ölçüler bilinmediği için kaydetme kapalı kalır. */
  protected readonly ready = signal(false);

  private readonly image = viewChild.required<ElementRef<HTMLImageElement>>('image');
  private dragPointer: number | null = null;
  private dragStart = { x: 0, y: 0, offsetX: 0, offsetY: 0 };

  /** Görselin çerçeveye sığdığı temel ölçek — yakınlaştırma bunun katı olarak uygulanır. */
  private readonly baseScale = signal(1);

  protected readonly transform = computed(
    () => `translate(-50%, -50%) translate(${this.offsetX()}px, ${this.offsetY()}px) scale(${this.baseScale() * this.zoom()})`,
  );

  protected readonly zoomPercent = computed(() => Math.round(this.zoom() * 100));

  protected onImageLoad(): void {
    const el = this.image().nativeElement;
    const fit = Math.min(FRAME_WIDTH / el.naturalWidth, FRAME_HEIGHT / el.naturalHeight);
    this.baseScale.set(fit);
    this.zoom.set(1);
    this.offsetX.set(0);
    this.offsetY.set(0);
    this.ready.set(true);
  }

  protected onPointerDown(event: PointerEvent): void {
    if (!this.ready()) return;
    this.dragPointer = event.pointerId;
    this.dragStart = { x: event.clientX, y: event.clientY, offsetX: this.offsetX(), offsetY: this.offsetY() };
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.dragPointer !== event.pointerId) return;
    this.offsetX.set(this.dragStart.offsetX + (event.clientX - this.dragStart.x));
    this.offsetY.set(this.dragStart.offsetY + (event.clientY - this.dragStart.y));
  }

  protected onPointerUp(event: PointerEvent): void {
    if (this.dragPointer !== event.pointerId) return;
    this.dragPointer = null;
  }

  /** Ok tuşlarıyla da konumlandırılabilsin — sürükleme tek giriş yolu olmamalı. */
  protected onKeydown(event: KeyboardEvent): void {
    const step = event.shiftKey ? 16 : 4;
    const moves: Record<string, () => void> = {
      ArrowLeft: () => this.offsetX.update((v) => v - step),
      ArrowRight: () => this.offsetX.update((v) => v + step),
      ArrowUp: () => this.offsetY.update((v) => v - step),
      ArrowDown: () => this.offsetY.update((v) => v + step),
      '+': () => this.stepZoom(ZOOM_STEP),
      '-': () => this.stepZoom(-ZOOM_STEP),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    move();
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    this.stepZoom(event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
  }

  protected onZoomInput(event: Event): void {
    this.zoom.set(Number((event.target as HTMLInputElement).value));
  }

  protected stepZoom(delta: number): void {
    this.zoom.update((v) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((v + delta) * 100) / 100)));
  }

  protected reset(): void {
    this.zoom.set(1);
    this.offsetX.set(0);
    this.offsetY.set(0);
  }

  protected readonly minZoom = MIN_ZOOM;
  protected readonly maxZoom = MAX_ZOOM;
  protected readonly zoomStep = ZOOM_STEP;

  /** Çerçevedeki görünümü aynı oranlarla canvas'a çizip PNG olarak yayınlar. */
  protected apply(): void {
    const el = this.image().nativeElement;
    const ratio = OUTPUT_WIDTH / FRAME_WIDTH;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_WIDTH;
    canvas.height = Math.round(FRAME_HEIGHT * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scale = this.baseScale() * this.zoom() * ratio;
    const width = el.naturalWidth * scale;
    const height = el.naturalHeight * scale;
    const left = canvas.width / 2 + this.offsetX() * ratio - width / 2;
    const top = canvas.height / 2 + this.offsetY() * ratio - height / 2;
    ctx.drawImage(el, left, top, width, height);

    // Arka planı silinmiş portrelerde saydamlık korunmalı: PNG.
    this.applied.emit(canvas.toDataURL('image/png'));
  }

  protected cancel(): void {
    this.cancelled.emit();
  }
}
