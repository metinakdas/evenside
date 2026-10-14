import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * KURDELE GRAFİĞİ — ana menünün zemin deseni.
 *
 * Menüdeki (`/`) sol üst kurdele, tanıtım sayfasının giriş ekranında da kullanılsın diye
 * ortak bileşene alındı (kullanıcı isteği: "bu deseni tanıtım ekranında en üste uyarla").
 * Şekiller tasarımdan birebir; boyaları uygulamanın paletinde (yeşil geçişler + grafit).
 *
 * Ölçü, konum ve opaklık KULLANAN ekranın işi: bileşen yalnızca çizer, kendi yerleşimini
 * dayatmaz. Tamamı dekor — `aria-hidden` ve tıklamayı yutmaz.
 */
@Component({
  selector: 'app-ribbon-art',
  standalone: true,
  templateUrl: './ribbon-art.component.html',
  styleUrl: './ribbon-art.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
})
export class RibbonArtComponent {}
