import { TestBed } from '@angular/core/testing';
import { PhotoCutoutService } from './photo-cutout.service';

/**
 * Modelin kendisi test edilmiyor (WASM + 250KB ağırlık); test edilen, maskeden alfa/kırpma
 * üreten saf geometri: kişi dışındaki her piksel saydam olmalı ve görsel kişinin sınır
 * kutusuna (küçük bir payla) kırpılmalı.
 */
describe('PhotoCutoutService', () => {
  let service: PhotoCutoutService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PhotoCutoutService);
  });

  /** 40x40 düz kırmızı bir görsel — ortadaki 20x20 alan "kişi" sayılacak. */
  function redSquareDataUrl(size = 40): string {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, size, size);
    return canvas.toDataURL('image/png');
  }

  /** Ortadaki kareyi kişi (1), dışını arka plan (0) işaretleyen sahte segmenter. */
  function fakeSegmenterWithCenterPerson(size: number, box: number): unknown {
    const mask = new Float32Array(size * size);
    const start = (size - box) / 2;
    for (let y = start; y < start + box; y++) {
      for (let x = start; x < start + box; x++) mask[y * size + x] = 1;
    }
    // Gerçek model tek maske döndürüyor ve o maske doğrudan kişi olasılığı (etiket: "selfie").
    return {
      segment: () => ({
        confidenceMasks: [{ getAsFloat32Array: () => mask, width: size, height: size }],
        close: () => undefined,
      }),
    };
  }

  async function cutoutWithFakeModel(size: number, box: number) {
    const fake = fakeSegmenterWithCenterPerson(size, box);
    // Modelin kurulumu (ağ + WASM) testte atlanır; geri kalan boru hattı gerçek çalışır.
    (service as unknown as { load: () => Promise<unknown> }).load = () => Promise.resolve(fake);
    return service.cutout(redSquareDataUrl(size));
  }

  it('kişiyi sınır kutusuna kırpar ve payı ekler', async () => {
    const result = await cutoutWithFakeModel(40, 20);
    const image = await loadImage(result.dataUrl);

    // 20px kişi + iki yandan %4'lük pay (40 * 0.04 = 1.6 → 2px).
    expect(image.naturalWidth).toBe(24);
    expect(image.naturalHeight).toBe(24);
    expect(result.coverage).toBeCloseTo(0.25, 2);
  });

  it('kişi dışındaki pikselleri saydam bırakır', async () => {
    const result = await cutoutWithFakeModel(40, 20);
    const image = await loadImage(result.dataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);

    const corner = ctx.getImageData(0, 0, 1, 1).data;
    const middle = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;

    expect(corner[3]).toBe(0);
    expect(middle[3]).toBe(255);
    expect(middle[0]).toBeGreaterThan(200); // kişinin rengi korunur
  });

  it('fotoğrafta kişi bulunmazsa hata verir (çağıran özgün fotoğrafa döner)', async () => {
    await expectAsync(cutoutWithFakeModel(40, 0)).toBeRejected();
  });

  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('yüklenemedi'));
      image.src = src;
    });
  }
});
