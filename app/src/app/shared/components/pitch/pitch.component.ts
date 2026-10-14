import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
} from '@angular/core';
import { PitchLink, PitchSlot } from '../../../core/models/pitch.model';
import { TeamSide } from '../../../core/models/team.model';
import { PlayerCardComponent, PlayerCardSize } from '../player-card/player-card.component';
import { I18nService } from '../../../core/services/i18n.service';
import { OYUN_DICTIONARIES } from '../../../core/i18n/oyun-dictionary';

/**
 * Bu genişliğin altında kartlar mikro boyuta düşer, sadece reyting+soyisim kalır (Faz 8.1).
 * SAHANIN KENDİ render genişliğine göre ölçülür (viewport'a göre değil) — aksi hâlde
 * geniş bir monitörde saha dar bir sütuna sıkışsa bile (bkz. saha görünümü 3 sütunlu
 * düzeni) hâlâ "mini" kartlar seçilip 3'lü hatlarda (ör. DEF/OS %25 aralıklı) üst üste
 * biniyordu — asıl "aşırı kötü" şikayetinin kaynağı buydu.
 */
const COMPACT_WIDTH_PX = 620;

interface ProjectedSlot extends PitchSlot {
  displayY: number;
  scale: number;
}

@Component({
    selector: 'app-pitch',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [PlayerCardComponent],
    templateUrl: './pitch.component.html',
    styleUrl: './pitch.component.scss'
})
export class PitchComponent {
  private readonly i18n = inject(I18nService);
  /** Sözlük ekranla birlikte yükleniyor (giriş paketi şişmesin). */
  protected readonly t = this.i18n.t;

  readonly slotsA = input.required<PitchSlot[]>();
  readonly slotsB = input.required<PitchSlot[]>();
  readonly links = input<PitchLink[]>([]);
  /** Tören sırasında saha karartılıp hafif bulanıklaştırılır (Faz 5.3). */
  readonly dimmed = input(false);
  /** false: hover/animasyon kapalı — ekran görüntüsü modu (Faz 7.1). */
  readonly interactive = input(true);
  /** Faz 7 "tek takım" modu — seçili taraf tam sahayı kaplar, kartlar büyür. */
  readonly singleTeam = input<TeamSide | null>(null);
  /** Kura sonrası manuel düzeltme: kartlara tıklanabilir, takas/çıkarma isteği yükseltir. */
  readonly editable = input(false);

  /** İki farklı takımdan oyuncu seçilince (bkz. seçim mantığı aşağıda) yükselir. */
  readonly swapRequested = output<{ a: string; b: string }>();
  readonly removeRequested = output<string>();

  /** id → kartta basılacak ayırt edici isim (bkz. SquadStore.nameLabels). Boş bırakılabilir. */
  readonly nameLabels = input<Record<string, string>>({});

  protected readonly hoveredPlayerId = signal<string | null>(null);
  protected readonly compact = signal(false);
  protected readonly cardSize = computed<PlayerCardSize>(() => (this.compact() ? 'micro' : 'mini'));

  /** Takas için seçilmiş ilk oyuncu — aynı taraftan ikinci tıklama seçimi değiştirir, karşı taraftan tıklama takas ister. */
  protected readonly selection = signal<{ id: string; side: TeamSide } | null>(null);

  constructor() {
    this.i18n.register(OYUN_DICTIONARIES);
    const host = inject(ElementRef<HTMLElement>).nativeElement;
    const destroyRef = inject(DestroyRef);
    if (typeof ResizeObserver === 'undefined') return;
    // Ölçülen şey `:host` değil, sahanın KENDİ genişliği: saha artık en-boy oranıyla
    // kabına sığdığı için (bkz. .pitch), geniş bir kapta bile dar olabiliyor — kart boyutu
    // kararı sahanın gerçek genişliğine bakmalı, yoksa dar sahada mini kartlar üst üste
    // biniyor. `.pitch` şablonla geldiği için ölçüm ilk render'dan SONRA bağlanır.
    afterNextRender(
      () => {
        const target = host.querySelector('.pitch') ?? host;
        const observer = new ResizeObserver((entries) => {
          this.compact.set(entries[0].contentRect.width < COMPACT_WIDTH_PX);
        });
        observer.observe(target);
        destroyRef.onDestroy(() => observer.disconnect());
      },
      { injector: inject(Injector) },
    );
  }

  protected readonly visibleSlotsA = computed(() => this.project(this.slotsA(), 'A'));
  protected readonly visibleSlotsB = computed(() => this.project(this.slotsB(), 'B'));
  protected readonly visibleSlots = computed(() => [...this.visibleSlotsA(), ...this.visibleSlotsB()]);

  protected readonly visibleLinks = computed<PitchLink[]>(() => (this.singleTeam() ? [] : this.links()));

  protected linkOpacity(link: PitchLink): number {
    const hovered = this.hoveredPlayerId();
    if (!hovered) return this.singleTeam() ? 0.7 : 0.55;
    const touchesHovered = this.touchesHoveredSlot(link);
    return touchesHovered ? 1 : 0.12;
  }

  private touchesHoveredSlot(link: PitchLink): boolean {
    const hovered = this.hoveredPlayerId();
    if (!hovered) return false;
    const hoveredSlot = [...this.slotsA(), ...this.slotsB()].find((s) => s.player?.id === hovered);
    if (!hoveredSlot) return false;
    const matchesStart = hoveredSlot.x === link.x1 && hoveredSlot.y === link.y1;
    const matchesEnd = hoveredSlot.x === link.x2 && hoveredSlot.y === link.y2;
    return matchesStart || matchesEnd;
  }

  protected onEnter(playerId: string | undefined): void {
    if (playerId && this.interactive()) this.hoveredPlayerId.set(playerId);
  }

  protected onLeave(): void {
    this.hoveredPlayerId.set(null);
  }

  protected isSelected(playerId: string | undefined): boolean {
    return !!playerId && this.selection()?.id === playerId;
  }

  protected onCardClick(playerId: string | undefined, side: TeamSide): void {
    if (!this.editable() || !playerId) return;
    const sel = this.selection();
    if (!sel) {
      this.selection.set({ id: playerId, side });
      return;
    }
    if (sel.id === playerId) {
      this.selection.set(null); // aynı karta tekrar tıklama: seçimi bırak
      return;
    }
    if (sel.side === side) {
      this.selection.set({ id: playerId, side }); // aynı taraftan başka biri: seçimi ona taşı
      return;
    }
    this.swapRequested.emit({ a: sel.id, b: playerId });
    this.selection.set(null);
  }

  protected onRemoveClick(playerId: string, event: Event): void {
    event.stopPropagation();
    if (this.selection()?.id === playerId) this.selection.set(null);
    this.removeRequested.emit(playerId);
  }

  private project(slots: PitchSlot[], side: TeamSide): ProjectedSlot[] {
    const single = this.singleTeam();
    if (!single) return slots.map((s) => ({ ...s, displayY: s.y, scale: 1 }));
    if (single !== side) return [];

    const lineCount = slots.length ? Math.max(...slots.map((s) => s.line)) + 1 : 1;
    return slots.map((s) => {
      // Büyümüş kartın (scale 1.4) üstten/alttan taşmaması için 18-82 aralığına yerleşir.
      const frac = lineCount > 1 ? s.line / (lineCount - 1) : 0;
      const displayY = side === 'A' ? 18 + frac * 64 : 82 - frac * 64;
      return { ...s, displayY, scale: 1.4 };
    });
  }
}
