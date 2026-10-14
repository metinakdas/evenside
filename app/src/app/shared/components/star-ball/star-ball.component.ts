import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * ŞAMPİYONLAR LİGİ TOPU — dekoratif zemin grafiği.
 *
 * Yıldızlar serpiştirilmiş değil: her biri kürenin yüzeyindeki bir panelin merkezine oturur,
 * teğet düzlemde çizilip küreye sarılır ve ortografik izdüşümle düşer; kenara gidenler bu
 * yüzden kendiliğinden yassılaşır. Arka yüzdekiler çizilmez.
 *
 * Renk `currentColor`: koyu zeminde vurgu yeşili, yeşil kutuda kutunun kendi mürekkebi.
 * Ölçü/konum/opaklık kullanan ekranın işi — bileşen yalnızca topu çizer.
 */
@Component({
  selector: 'app-star-ball',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './star-ball.component.html',
  styleUrl: './star-ball.component.scss',
})
export class StarBallComponent {
  /**
   * Her kopyanın KENDİ gradyan kimliği. Menüde top iki kez basılıyor (zemin + hero kutusu);
   * ikisi de `s42ball` taşıyınca ikinci top birincinin gradyanını — ve onun rengini — kullanıyordu,
   * sayfada da tekrarlanan id oluyordu (QA D1).
   */
  protected readonly gradyanId = 's42ball-' + ++sayac;
}

let sayac = 0;
