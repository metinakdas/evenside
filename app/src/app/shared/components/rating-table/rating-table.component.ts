import { ChangeDetectionStrategy, Component, computed, input, output, signal , inject } from '@angular/core';
import { trLower } from '../../../core/utils/turkish-text';
import { RatingTableRow } from '../../../core/models/rating-table.model';
import { I18nService } from '../../../core/services/i18n.service';
import { OYUN_DICTIONARIES } from '../../../core/i18n/oyun-dictionary';

type SortKey =
  | 'sira'
  | 'ad'
  | 'ulke'
  | 'takim'
  | 'durum'
  | 'mevki'
  | 'gen'
  | 'hiz'
  | 'sut'
  | 'pas'
  | 'dri'
  | 'def'
  | 'fiz';
type SortDir = 1 | -1;

interface ColumnDef {
  key: SortKey;
  label: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'sira', label: 'SIRA' },
  { key: 'ad', label: 'OYUNCU' },
  { key: 'ulke', label: 'UYR' },
  { key: 'takim', label: 'stat.takim' },
  { key: 'durum', label: 'stat.durum' },
  { key: 'mevki', label: 'stat.poz' },
  { key: 'gen', label: 'stat.gen' },
  { key: 'hiz', label: 'stat.hiz' },
  { key: 'sut', label: 'stat.sut' },
  { key: 'pas', label: 'stat.pas' },
  { key: 'dri', label: 'stat.dri' },
  { key: 'def', label: 'stat.def' },
  { key: 'fiz', label: 'stat.fiz' },
];

/** Sıralanabilir sütun için sıralama değeri — metinler küçük harf, sayılar yuvarlanmış. */
function sortValue(row: RatingTableRow, key: SortKey): string | number {
  const r = row.player.ratings;
  switch (key) {
    case 'ad':
      return trLower(row.player.input.name);
    case 'ulke':
      return row.player.input.countryCode ?? '';
    case 'takim':
      return trLower(row.teamName);
    case 'durum':
      // Kadrodakiler önce: "kim eksik" sorusunun cevabı listenin başında dursun.
      return row.inSquad ? 0 : 1;
    case 'mevki':
      return r.position;
    case 'gen':
      return r.overall;
    case 'hiz':
      return Math.round(r.pace);
    case 'sut':
      return Math.round(r.shooting);
    case 'pas':
      return Math.round(r.passing);
    case 'dri':
      return Math.round(r.dribbling);
    case 'def':
      return Math.round(r.defending);
    case 'fiz':
      return Math.round(r.physical);
    default:
      return 0;
  }
}

@Component({
  selector: 'app-rating-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.with-status]': 'showSquadActions()' },
  templateUrl: './rating-table.component.html',
  styleUrl: './rating-table.component.scss',
})
export class RatingTableComponent {
  private readonly i18n = inject(I18nService);
  /** Sütun başlıkları SÖZLÜK ANAHTARI tutar; metin burada çözülür. */
  protected readonly t = this.i18n.t;

  constructor() {
    this.i18n.register(OYUN_DICTIONARIES);
  }

  readonly rows = input.required<RatingTableRow[]>();
  /**
   * "Durum" sütununu ve satır içi ekle/çıkar butonunu açar. Kadro kurma ekranında true:
   * Kart'tan Liste'ye geçmek yetenek kaybı olmasın (kontrol raporu B3).
   */
  readonly showSquadActions = input(false);
  readonly squadToggled = output<string>();

  /** "Durum" sütunu yalnızca kadro kurma ekranında görünür. */
  protected readonly columns = computed(() =>
    this.showSquadActions() ? COLUMNS : COLUMNS.filter((c) => c.key !== 'durum'),
  );
  protected readonly sortKey = signal<SortKey>('gen');
  protected readonly sortDir = signal<SortDir>(-1);

  protected readonly sortedRows = computed(() => {
    const key = this.sortKey();
    if (key === 'sira') {
      return [...this.rows()].sort((a, b) => b.player.ratings.overall - a.player.ratings.overall);
    }
    const dir = this.sortDir();
    return [...this.rows()].sort((a, b) => {
      const x = sortValue(a, key);
      const y = sortValue(b, key);
      // Metinler Türkçe alfabeye göre karşılaştırılır: '<' operatörü kod noktası sırasına
      // bakıyor ve "Çetin"i "Güneş"ten SONRA koyuyordu (kontrol raporu B2). Büyük/küçük
      // harf düzeltmesi (trLower) sıralama sorununu çözmez — collation ayrı bir konu.
      if (typeof x === 'string' && typeof y === 'string') return x.localeCompare(y, 'tr') * dir;
      if (x < y) return -1 * dir;
      if (x > y) return 1 * dir;
      return 0;
    });
  });

  sortBy(key: SortKey): void {
    if (key === 'sira') return;
    if (this.sortKey() === key) {
      this.sortDir.update((d) => (d === 1 ? -1 : 1) as SortDir);
      return;
    }
    const ascendingByDefault: SortKey[] = ['ad', 'ulke', 'mevki', 'takim'];
    this.sortKey.set(key);
    this.sortDir.set(ascendingByDefault.includes(key) ? 1 : -1);
  }

  protected roundStat(row: RatingTableRow, key: SortKey): number {
    return sortValue(row, key) as number;
  }
}
