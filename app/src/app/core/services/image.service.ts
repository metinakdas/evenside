import { Injectable } from '@angular/core';
import { mesaj } from './i18n.service';

/** Yüklenebilecek görsellerin en fazla kaç piksel genişlikte tutulacağı. */
export const MAX_IMAGE_WIDTH = 400;

/**
 * Kullanıcının yüklediği fotoğraf/logo/bayrak dosyalarını localStorage'ı şişirmeden
 * saklayabilmek için küçültür ve sıkıştırır (bkz. proje notları Faz 4.2).
 */
@Injectable({ providedIn: 'root' })
export class ImageService {
  /** Dosyayı en fazla `MAX_IMAGE_WIDTH` genişliğe küçültüp WebP (desteklenmiyorsa JPEG) data URL'e çevirir. */
  async toResizedDataUrl(file: File, quality = 0.85): Promise<string> {
    const original = await this.readAsDataUrl(file);
    const image = await this.loadImage(original);
    const { width, height } = this.targetSize(image.naturalWidth, image.naturalHeight);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return original;
    ctx.drawImage(image, 0, 0, width, height);

    const webp = canvas.toDataURL('image/webp', quality);
    if (webp.startsWith('data:image/webp')) return webp;
    return canvas.toDataURL('image/jpeg', quality);
  }

  private targetSize(width: number, height: number): { width: number; height: number } {
    if (width <= MAX_IMAGE_WIDTH) return { width, height };
    const scale = MAX_IMAGE_WIDTH / width;
    return { width: MAX_IMAGE_WIDTH, height: Math.round(height * scale) };
  }

  private readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error(mesaj('mesaj.dosyaOkunamadi')));
      reader.readAsDataURL(file);
    });
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
