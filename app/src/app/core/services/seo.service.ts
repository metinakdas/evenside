import { Injectable, effect, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { I18nService } from './i18n.service';

/** Rota → sözlük anahtarı (`seo.<anahtar>`). Giriş gerektiren ekranlar dizine alınmaz. */
const ROTALAR: Record<string, { anahtar: string; dizin: boolean }> = {
  welcome: { anahtar: 'tanitim', dizin: true },
  login: { anahtar: 'giris', dizin: true },
  privacy: { anahtar: 'gizlilik', dizin: true },
  'data-protection': { anahtar: 'kvkk', dizin: true },
  cookies: { anahtar: 'cerez', dizin: true },
  terms: { anahtar: 'kosullar', dizin: true },
  '': { anahtar: 'menu', dizin: false },
  'my-card': { anahtar: 'kartim', dizin: false },
  'create-team': { anahtar: 'takimKur', dizin: false },
  squad: { anahtar: 'kadro', dizin: false },
  rate: { anahtar: 'puan', dizin: false },
  draw: { anahtar: 'kura', dizin: false },
  pitch: { anahtar: 'saha', dizin: false },
};

/**
 * SAYFA BAŞLIĞI VE ARAMA ETİKETLERİ (11 Ekim 2026, yayın öncesi).
 *
 * Tek sayfalık uygulamada her ekran aynı `<title>`ı taşıyordu: sekmede, geçmişte ve arama
 * sonucunda hepsi "Saha 42" görünüyordu. Artık her rota kendi başlığını ve açıklamasını seçili
 * dilde yazar; dil değişince de güncellenir. Giriş gerektiren ekranlar `noindex` alır.
 * JavaScript çalıştırmayan önizleyiciler için varsayılanlar `index.html`'de duruyor.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly i18n = inject(I18nService);
  private readonly yol = signal<string>(typeof location === 'undefined' ? '' : location.pathname);

  constructor() {
    inject(Router)
      .events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.yol.set(e.urlAfterRedirects));

    effect(() => {
      const ilk = this.yol().split(/[?#]/)[0].replace(/^\/+/, '').split('/')[0];
      const rota = ROTALAR[ilk] ?? ROTALAR[''];
      const t = this.i18n.t;
      this.title.setTitle(t('seo.' + rota.anahtar));
      this.meta.updateTag({ name: 'description', content: t('seo.aciklama') });
      this.meta.updateTag({ name: 'robots', content: rota.dizin ? 'index, follow, max-image-preview:large' : 'noindex, nofollow' });
    });
  }
}
