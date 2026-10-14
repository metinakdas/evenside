import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * "Kaos bitti" (ücretsiz) ekranının ZEMİNİ: kuş bakışı GERÇEK bir saha fotoğrafı (kullanıcı
 * isteği). Önce krem bandın üstüne çizilmiş saha çizgileri vardı; fotoğrafın kendi çizgileri var.
 *
 * Neden ayrı bileşen: tanıtım sayfasının stil bütçesi sınırda; zemin kendi stil dosyasını
 * taşıyor. Yalnızca çizer — konumu bölüm belirler (`.proof` içinde, içeriğin arkasında).
 * Dekoratif: `aria-hidden`, tıklamayı yutmaz.
 */
@Component({
  selector: 'app-proof-backdrop',
  templateUrl: './proof-backdrop.component.html',
  styleUrl: './proof-backdrop.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
})
export class ProofBackdropComponent {}
