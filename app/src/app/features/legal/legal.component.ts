import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { LegalDocId, legalDoc } from '../../core/legal/legal-docs';
import { I18nService } from '../../core/services/i18n.service';

/**
 * YASAL BELGE EKRANI — gizlilik, KVKK, çerez ve kullanım koşulları tek bileşenden basılır.
 *
 * Belge rota verisinden gelir (`data.doc`), metin ise seçili DİLDEN. Sayfa herkese açık:
 * hem oturumsuz ziyaretçi hem giriş yapmış kullanıcı okuyabilmeli (mevzuat gereği erişimin
 * bir hesabın arkasında olmaması gerekir).
 */
@Component({
  selector: 'app-legal',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './legal.component.html',
  styleUrl: './legal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);

  /** Rota verisi sinyale çevriliyor: aynı bileşen dört belgeye hizmet ediyor. */
  private readonly veri = toSignal(this.route.data, { initialValue: this.route.snapshot.data });

  protected readonly doc = computed(() => {
    const id = (this.veri()['doc'] as LegalDocId) ?? 'gizlilik';
    return legalDoc(this.i18n.locale(), id);
  });

  protected readonly t = this.i18n.t;

  /** Satır madde mi? (`- ` ile başlıyorsa listeye girer) */
  protected madde(satir: string): boolean {
    return satir.startsWith('- ');
  }

  /**
   * Metinlerde **kalın** için küçük bir işaretleme var; ham HTML basmamak için parçalara
   * ayırıyoruz (projede `innerHTML` yasak — XSS yüzeyi).
   */
  protected parcala(satir: string): { metin: string; kalin: boolean }[] {
    const temiz = satir.startsWith('- ') ? satir.slice(2) : satir;
    return temiz.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((p) =>
      p.startsWith('**') && p.endsWith('**')
        ? { metin: p.slice(2, -2), kalin: true }
        : { metin: p, kalin: false },
    );
  }

  protected geri(): void {
    void this.router.navigateByUrl('/welcome');
  }
}
