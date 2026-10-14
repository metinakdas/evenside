import { Injectable } from '@angular/core';
import type { ImageSegmenter } from '@mediapipe/tasks-vision';
import { mesaj } from './i18n.service';

/** Kırpılmış görselin en fazla kaç piksel genişlikte tutulacağı (kart portresi için yeterli). */
export const CUTOUT_MAX_WIDTH = 420;

/** Alfa geçişinin yumuşatıldığı olasılık bandı — bu ikisinin arasında kenar yumuşar. */
const SOFT_EDGE_LOW = 0.35;
const SOFT_EDGE_HIGH = 0.65;

/** Kırpma kutusunun etrafında bırakılan pay (kısa kenarın oranı). */
const CROP_PADDING = 0.04;

/** Kişi olarak sayılan en düşük olasılık — kırpma kutusu bu eşiğe göre çıkarılır. */
const PERSON_THRESHOLD = 0.5;

export interface CutoutResult {
  /** Arka planı silinmiş, kişiye kırpılmış PNG data URL. */
  dataUrl: string;
  /** Kaynak görselin yüzde kaçının kişi olarak işaretlendiği — çok düşükse sonuç şüphelidir. */
  coverage: number;
}

/**
 * Yüklenen fotoğraftan **yalnızca kişiyi** ayırıp arka planı saydam yapar ve görseli kişiye
 * kırpar. Kart portresi referans FIFA kartlarındaki gibi zemine oturmalı; kullanıcının
 * yüklediği tatil fotoğrafında deniz/gökyüzü kartın yarısını kaplıyordu.
 *
 * Model tarayıcıda çalışır (MediaPipe `ImageSegmenter` + selfie segmenter, WASM). Ağırlıklar
 * `public/vision/` altında yerel olarak duruyor: sunucuya fotoğraf GÖNDERİLMEZ, dış servise
 * bağlanılmaz. Model ~250KB, WASM ~12MB ve yalnızca ilk fotoğraf yüklendiğinde indirilir —
 * bu yüzden segmenter tembel (lazy) kurulur ve tek örnek olarak saklanır.
 */
@Injectable({ providedIn: 'root' })
export class PhotoCutoutService {
  private segmenter: Promise<ImageSegmenter> | null = null;

  /** Model daha önce kurulduysa (yani ikinci fotoğraftan itibaren) bekleme olmayacak demektir. */
  get isReady(): boolean {
    return this.segmenter !== null;
  }

  /**
   * @param source Kaynak görsel (data URL).
   * @returns Arka planı silinmiş PNG. Model çalışmazsa hata fırlatır — çağıran taraf özgün
   * fotoğrafa geri dönmelidir.
   */
  async cutout(source: string): Promise<CutoutResult> {
    const image = await this.loadImage(source);
    const canvas = this.drawScaled(image);
    const segmenter = await this.load();

    const mask = await this.personMask(segmenter, canvas);
    return this.compose(canvas, mask);
  }

  /** Segmenter'ı (ve WASM'ı) tek sefer kurar; sonraki çağrılar aynı örneği bekler. */
  private load(): Promise<ImageSegmenter> {
    this.segmenter ??= (async () => {
      const vision = await import('@mediapipe/tasks-vision');
      const files = await vision.FilesetResolver.forVisionTasks('vision');
      return vision.ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: 'vision/selfie_segmenter.tflite' },
        runningMode: 'IMAGE',
        outputCategoryMask: true,
        outputConfidenceMasks: true,
      });
    })();
    return this.segmenter;
  }

  /**
   * Kişi olasılığını 0-1 arası bir diziye indirger.
   *
   * Kullandığımız model (`selfie_segmenter.tflite`) TEK etiketli: `labels.txt` içeriği
   * "selfie". Tarayıcıda ölçüldü — tek bir güven maskesi döner ve o maske doğrudan KİŞİ
   * olasılığıdır (tersi değil); kategori maskesinde ise 0 = kişi, 255 = sınıfsız/arka plan.
   * İki maskeli (arka plan + kişi) bir model takılırsa ikincisi kişi olur.
   */
  private async personMask(segmenter: ImageSegmenter, canvas: HTMLCanvasElement): Promise<Float32Array> {
    const result = segmenter.segment(canvas);
    try {
      const confidences = result.confidenceMasks;
      if (confidences?.length) {
        const person = confidences.length > 1 ? confidences[1] : confidences[0];
        return this.fit(Float32Array.from(person.getAsFloat32Array()), person.width, person.height, canvas);
      }
      const category = result.categoryMask;
      if (!category) throw new Error('Segmentasyon maskesi alınamadı.');
      const values = Float32Array.from(category.getAsUint8Array(), (v) => (v === 0 ? 1 : 0));
      return this.fit(values, category.width, category.height, canvas);
    } finally {
      result.close();
    }
  }

  /**
   * Maske ölçüldüğü kadarıyla görselle aynı boyutta geliyor; yine de model ölçeği değiştirirse
   * en yakın komşu ile görselin boyutuna oturtulur (yoksa alfa kayar ve kırpma saçmalar).
   */
  private fit(mask: Float32Array, maskWidth: number, maskHeight: number, canvas: HTMLCanvasElement): Float32Array {
    if (maskWidth === canvas.width && maskHeight === canvas.height) return mask;
    const out = new Float32Array(canvas.width * canvas.height);
    for (let y = 0; y < canvas.height; y++) {
      const sy = Math.min(maskHeight - 1, Math.floor((y * maskHeight) / canvas.height));
      for (let x = 0; x < canvas.width; x++) {
        const sx = Math.min(maskWidth - 1, Math.floor((x * maskWidth) / canvas.width));
        out[y * canvas.width + x] = mask[sy * maskWidth + sx] ?? 0;
      }
    }
    return out;
  }

  /** Maskeyi alfaya çevirir, kişinin sınır kutusunu bulur ve oraya kırpar. */
  private compose(canvas: HTMLCanvasElement, mask: Float32Array): CutoutResult {
    const { width, height } = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas bağlamı açılamadı.');

    const pixels = ctx.getImageData(0, 0, width, height);
    const data = pixels.data;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let inside = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const p = mask[i] ?? 0;
        data[i * 4 + 3] = Math.round(255 * this.softEdge(p));
        if (p >= PERSON_THRESHOLD) {
          inside++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < 0) throw new Error(mesaj('mesaj.kisiYok'));
    ctx.putImageData(pixels, 0, 0);

    const pad = Math.round(Math.min(width, height) * CROP_PADDING);
    const left = Math.max(0, minX - pad);
    const top = Math.max(0, minY - pad);
    const right = Math.min(width, maxX + 1 + pad);
    const bottom = Math.min(height, maxY + 1 + pad);

    const cropped = document.createElement('canvas');
    cropped.width = right - left;
    cropped.height = bottom - top;
    const cropCtx = cropped.getContext('2d');
    if (!cropCtx) throw new Error('Canvas bağlamı açılamadı.');
    cropCtx.drawImage(canvas, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);

    // Saydamlık gerektiği için PNG: WebP/JPEG alfa koruma garantisi vermiyor.
    return { dataUrl: cropped.toDataURL('image/png'), coverage: inside / (width * height) };
  }

  /** 0-1 arası olasılığı yumuşak bir alfaya çevirir (smoothstep) — kenarlar testere olmasın. */
  private softEdge(p: number): number {
    const t = Math.min(1, Math.max(0, (p - SOFT_EDGE_LOW) / (SOFT_EDGE_HIGH - SOFT_EDGE_LOW)));
    return t * t * (3 - 2 * t);
  }

  private drawScaled(image: HTMLImageElement): HTMLCanvasElement {
    const scale = Math.min(1, CUTOUT_MAX_WIDTH / image.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas bağlamı açılamadı.');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(mesaj('mesaj.gorselYuklenemedi')));
      image.src = src;
    });
  }
}
