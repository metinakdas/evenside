import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FRAME_HEIGHT, FRAME_WIDTH, PhotoAdjusterComponent } from './photo-adjuster.component';

/** 100x50 düz mavi bir görsel — çerçeveye sığdırma ölçeğinin doğruluğu ölçülebilsin. */
function blueImage(width = 100, height = 50): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0000ff';
  ctx.fillRect(0, 0, width, height);
  return canvas.toDataURL('image/png');
}

describe('PhotoAdjusterComponent', () => {
  let fixture: ComponentFixture<PhotoAdjusterComponent>;
  let component: PhotoAdjusterComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PhotoAdjusterComponent] }).compileComponents();
    fixture = TestBed.createComponent(PhotoAdjusterComponent);
    fixture.componentRef.setInput('source', blueImage());
    fixture.detectChanges();
    component = fixture.componentInstance;
    await imageLoaded();
  });

  /** Şablondaki <img> gerçekten yüklenmeden ölçüler bilinmiyor. */
  async function imageLoaded(): Promise<void> {
    const img = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    if (!img.complete) await new Promise((resolve) => img.addEventListener('load', resolve, { once: true }));
    img.dispatchEvent(new Event('load'));
    fixture.detectChanges();
  }

  function protectedApi(): {
    zoom: () => number;
    stepZoom: (d: number) => void;
    apply: () => void;
    reset: () => void;
    offsetX: { set: (v: number) => void };
  } {
    return component as unknown as ReturnType<typeof protectedApi>;
  }

  it('çıktıyı çerçeve oranında üretir', async () => {
    const api = protectedApi();
    const emitted = new Promise<string>((resolve) => component.applied.subscribe(resolve));
    api.apply();
    const dataUrl = await emitted;

    expect(dataUrl.startsWith('data:image/png')).toBeTrue();
    const image = await load(dataUrl);
    expect(image.naturalWidth / image.naturalHeight).toBeCloseTo(FRAME_WIDTH / FRAME_HEIGHT, 2);
  });

  it('yakınlaştırmayı sınırların dışına taşırmaz', () => {
    const api = protectedApi();
    for (let i = 0; i < 40; i++) api.stepZoom(0.1);
    expect(api.zoom()).toBeLessThanOrEqual(3);
    for (let i = 0; i < 60; i++) api.stepZoom(-0.1);
    expect(api.zoom()).toBeGreaterThanOrEqual(0.5);
  });

  it('sıfırla konum ve yakınlaştırmayı başa alır', () => {
    const api = protectedApi();
    api.stepZoom(0.5);
    api.offsetX.set(40);
    api.reset();
    expect(api.zoom()).toBe(1);
  });

  function load(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('yüklenemedi'));
      image.src = src;
    });
  }
});
