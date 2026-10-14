import { ImageService, MAX_IMAGE_WIDTH } from './image.service';

/** Verilen ölçülerde, gerçek bir PNG dosyası üretir (canvas üzerinden). */
async function makeImageFile(width: number, height: number): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#00f57a';
  ctx.fillRect(0, 0, width, height);
  const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
  return new File([blob], 'test.png', { type: 'image/png' });
}

/** Data URL'in gerçek piksel ölçüsünü okur. */
function measure(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('ölçülemedi'));
    img.src = dataUrl;
  });
}

// QA denetimi §6: fotoğraf/logo yükleme akışı tarayıcıda test edilememişti.
describe('ImageService', () => {
  let service: ImageService;

  beforeEach(() => {
    service = new ImageService();
  });

  it('shrinks an oversized upload to the maximum width, keeping the aspect ratio', async () => {
    const file = await makeImageFile(1200, 600);

    const dataUrl = await service.toResizedDataUrl(file);
    const size = await measure(dataUrl);

    expect(size.width).toBe(MAX_IMAGE_WIDTH);
    expect(size.height).toBe(MAX_IMAGE_WIDTH / 2);
  });

  it('leaves an already-small upload at its original size', async () => {
    const file = await makeImageFile(120, 90);

    const dataUrl = await service.toResizedDataUrl(file);
    const size = await measure(dataUrl);

    expect(size.width).toBe(120);
    expect(size.height).toBe(90);
  });

  it('returns a data URL that is smaller than a raw full-size bitmap', async () => {
    const file = await makeImageFile(1200, 1200);

    const dataUrl = await service.toResizedDataUrl(file);

    expect(dataUrl.startsWith('data:image/')).toBeTrue();
    // Ham 1200x1200 RGBA ~5.7MB; sıkıştırılmış hâli localStorage'a sığacak kadar küçük olmalı.
    expect(dataUrl.length).toBeLessThan(400_000);
  });
});
