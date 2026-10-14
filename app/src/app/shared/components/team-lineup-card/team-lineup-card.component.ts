import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { keeperJerseyColor } from '../../../core/constants/keeper-jersey';
import { KeeperRotation } from '../../../core/models/keeper-rotation.model';
import { surnameOf } from '../../../core/utils/turkish-text';
import { Player } from '../../../core/models/player.model';
import { PitchSlot } from '../../../core/models/pitch.model';
import { SquadFormat } from '../../../core/models/draw.model';
import { TeamInfo, TeamSide } from '../../../core/models/team.model';
import { FORMATION_PRESETS, FormationLines, FormationPreset, PitchService } from '../../../core/services/pitch.service';
import { TeamBadgeComponent } from '../team-badge/team-badge.component';
import { I18nService } from '../../../core/services/i18n.service';
import { OYUN_DICTIONARIES } from '../../../core/i18n/oyun-dictionary';
import { takimAdiGoster } from '../../../core/utils/team-name';

/** Bu kadar pikselin altındaki hareket sürükleme değil TIKLAMA sayılır. */
const CLICK_SLOP_PX = 5;

interface DisplaySlot extends PitchSlot {
  displayX: number;
  displayY: number;
}

/** Kart üstünde yatay konumu, dikeydeki (displayY) konuma göre daraltıp "izometrik" yanılsaması verir. */
const TOP_WIDTH_FACTOR = 0.76;
const BOTTOM_WIDTH_FACTOR = 1;

function widthFactorAt(displayYPercent: number): number {
  const t = Math.min(100, Math.max(0, displayYPercent)) / 100;
  return TOP_WIDTH_FACTOR + (BOTTOM_WIDTH_FACTOR - TOP_WIDTH_FACTOR) * t;
}

/** Sahanın kendi oranı (viewBox 100×120) — kartın genişliğini mevcut yüksekliğe göre sınırlarken kullanılır. */
const PITCH_HEIGHT_OVER_WIDTH = 1.2;
/** `.lineup__pitch { margin-bottom }` ile aynı — bkz. team-lineup-card.component.scss. */
const PITCH_BOTTOM_GAP_PX = 8;
const MIN_CARD_WIDTH_PX = 180;

/**
 * "Kadro haritası" — tek bir takımın 11'ini (ya da 6/7/8'ini) eğik/izometrik görünümlü
 * bir sahada, forma/foto ikonlarıyla gösteren paylaşılabilir kart. Saha görünümünde iki
 * takım yan yana bu karttan birer tane olarak gösterilir (bkz. kullanıcı referans görselleri).
 * Sunum bileşenidir — SquadStore'a dokunmaz, her şeyi input/output ile alır/bildirir.
 *
 * Sürükleme: Pointer Events ile elle yapılır (native HTML5 drag-and-drop KULLANILMIYOR —
 * bkz. kullanıcı geri bildirimi, tarayıcı/trackpad'e göre güvenilmezdi ve gerçek serbest
 * konumlandırmaya izin vermiyordu). Kendi sahası içinde bırakılırsa oyuncu o noktaya
 * "sabitlenir" (`manualPositions`, sadece bu kartın yerel state'i — diziliş değişince
 * sıfırlanır). Sahanın dışına, KARŞI karttaki bir oyuncunun üstüne bırakılırsa gerçek bir
 * takas istenir (`dragSwapRequested`) ve bu karttaki oyuncu kendi yerine geri döner.
 */
@Component({
    selector: 'app-team-lineup-card',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [TeamBadgeComponent],
    templateUrl: './team-lineup-card.component.html',
    styleUrl: './team-lineup-card.component.scss'
})
export class TeamLineupCardComponent {
  /** Varsayılan "Takım A/B" ekranda çevrilir; kullanıcının verdiği ad olduğu gibi kalır. */
  protected readonly takimAdi = takimAdiGoster;

  private readonly i18n = inject(I18nService);
  /** Sözlük ekranla birlikte yükleniyor (giriş paketi şişmesin). */
  protected readonly t = this.i18n.t;

  readonly side = input.required<TeamSide>();
  readonly team = input.required<TeamInfo>();
  readonly players = input.required<Player[]>();
  readonly format = input.required<SquadFormat>();
  /** Karşı karttaki seçim de buraya iletilir ki takas seçimi iki kart arasında görünür kalsın. */
  readonly selectedPlayerId = input<string | null>(null);
  /**
   * Takas hedefi modu: karşı kadrodan biri "Değiştir" dediğinde BU kart hedef olur —
   * oyuncular yanıp söner ve tıklanan oyuncu takası tamamlar.
   */
  readonly swapTargetsActive = input(false);
  /** Takımın kale sırası — gerçek kalecisi varsa null (bkz. KeeperRotationService). */
  readonly keeperRotation = input<KeeperRotation | null>(null);
  /** id → ayırt edici isim; soyadı çakışan oyuncular için "H. DOĞAN" (bkz. SquadStore.nameLabels). */
  readonly nameLabels = input<Record<string, string>>({});

  readonly playerClicked = output<string>();
  /** Seçili oyuncunun üstündeki 🔁 — takas modunu başlatır. */
  readonly swapRequested = output<string>();
  readonly nameChanged = output<string>();
  /**
   * Sahanın dışına, KARŞI kartta bir oyuncunun üstüne bırakılınca. Taraf bilgisi kasıtlı
   * olarak yok — `SquadStore.swapDrawPlayers` iki id'nin gerçek tarafını `drawResult`'tan
   * kendi çözüyor ve aynı taraftan gelirse zaten sessizce hiçbir şey yapmıyor.
   */
  readonly dragSwapRequested = output<{ fromId: string; toId: string }>();
  /**
   * Seçilen diziliş değişti. Üst bileşen (pitch-view) yuva dağılımını kendi de hesaplamak
   * zorunda — alt bardaki hat ortalamaları sahadaki GERÇEK yerleşimi yansıtsın diye
   * (kullanıcı geri bildirimi: "ORTA SAHA –" yazarken orta sahada iki oyuncu duruyordu).
   */
  readonly formationChanged = output<FormationLines>();

  private readonly pitchService = inject(PitchService);
  private readonly pitchElRef = viewChild.required<ElementRef<HTMLDivElement>>('pitchEl');

  protected readonly presets = computed<FormationPreset[]>(() => FORMATION_PRESETS[this.format()]);
  private readonly formationId = signal<string | null>(null);
  protected readonly formation = computed<FormationPreset>(() => {
    const id = this.formationId();
    return this.presets().find((p) => p.id === id) ?? this.presets()[0];
  });

  protected readonly showRating = signal(false);
  protected readonly editingName = signal(false);
  protected readonly nameDraft = signal('');

  /** Elle sürüklenip bırakılmış oyuncuların bu SAHA içindeki özel konumu (playerId → %). */
  private readonly manualPositions = signal<Record<string, { x: number; y: number }>>({});
  /** Şu an sürüklenmekte olan oyuncu ve anlık (canlı) konumu — sadece görsel geri bildirim. */
  protected readonly draggingId = signal<string | null>(null);
  private readonly livePosition = signal<{ x: number; y: number } | null>(null);
  /** Sürükleme sırasında üstüne gelinen HEDEF oyuncu (karşı kartta olabilir) — görsel vurgu için. */
  protected readonly dragOverId = signal<string | null>(null);

  private activePointerId: number | null = null;
  /** İşaretçi hareketinin başladığı nokta — tıklama/sürükleme ayrımı için. */
  private pointerStart: { x: number; y: number } | null = null;
  private pointerMoved = false;
  private windowMoveHandler: ((e: PointerEvent) => void) | null = null;
  private windowUpHandler: ((e: PointerEvent) => void) | null = null;

  /** Üst bileşenin (pitch-view) tek, birleşik "İndir" için okuduğu genel arayüz. */
  readonly currentFormationLines = computed<FormationLines>(() => this.formation().lines);
  readonly currentShowRating = computed(() => this.showRating());

  /**
   * Kartın kendi yüksekliğine sığacak azami genişlik — "tek ekran, scroll yok" isteğinin
   * kaynağı: saha `aspect-ratio` yerine mevcut YÜKSEKLİĞE göre genişliğini kendi kısıtlıyor,
   * böylece dar-ama-uzun bir dikey alanda bile saha hiçbir zaman görünür alanın dışına taşmıyor
   * (bkz. `PitchComponent`'teki host-genişliğine göre ResizeObserver deseni — burada YÜKSEKLİK
   * için aynı fikir). null = henüz ölçülmedi, CSS varsayılanı (%100) geçerli.
   */
  protected readonly cardWidthPx = signal<number | null>(null);

  constructor() {
    this.i18n.register(OYUN_DICTIONARIES);
    const host = inject(ElementRef<HTMLElement>).nativeElement;
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => this.recomputeCardWidth(host));
      observer.observe(host);
      inject(DestroyRef).onDestroy(() => observer.disconnect());
    }
  }

  private recomputeCardWidth(host: HTMLElement): void {
    const hostRect = host.getBoundingClientRect();
    if (hostRect.height <= 0 || hostRect.width <= 0) return;
    const headerH = host.querySelector('.lineup__header')?.getBoundingClientRect().height ?? 0;
    const controlsH = host.querySelector('.lineup__controls')?.getBoundingClientRect().height ?? 0;
    const availableForPitch = hostRect.height - headerH - controlsH - PITCH_BOTTOM_GAP_PX;
    const maxWidthFromHeight = availableForPitch / PITCH_HEIGHT_OVER_WIDTH;
    const width = Math.max(MIN_CARD_WIDTH_PX, Math.min(hostRect.width, maxWidthFromHeight));
    this.cardWidthPx.set(Math.floor(width));
  }

  private readonly baseSlots = computed<DisplaySlot[]>(() => {
    const raw = this.pitchService.assignSlots(this.format(), 'A', this.players(), this.formation().lines);
    // Ham y aralığı (~7-43, paylaşımlı iki takımlı saha için tasarlanmıştı) karta göre genişletilir.
    return raw.map((s) => {
      const displayY = 8 + ((s.y - 7) / 36) * 78;
      const factor = widthFactorAt(displayY);
      const displayX = 50 + (s.x - 50) * factor;
      const manual = s.player ? this.manualPositions()[s.player.id] : undefined;
      return manual ? { ...s, displayX: manual.x, displayY: manual.y } : { ...s, displayX, displayY };
    });
  });

  /** Şablonun okuduğu son hâl — sürüklenen oyuncu varsa onun konumunu canlı takip eder. */
  protected readonly slots = computed<DisplaySlot[]>(() => {
    const base = this.baseSlots();
    const dragging = this.draggingId();
    const live = this.livePosition();
    if (!dragging || !live) return base;
    return base.map((s) => (s.player?.id === dragging ? { ...s, displayX: live.x, displayY: live.y } : s));
  });

  /**
   * Oyuncunun ekran okuyucu etiketi ve tooltip'i. Kendi mevkisi dışında oynuyorsa
   * (`fit === 'shifted'`) bunu açıkça söyler — kullanıcı geri bildirimi: sahada forvet
   * kaleye/orta sahaya konduğunda hiçbir işaret yoktu.
   */
  protected markerLabel(player: Player, slot: DisplaySlot): string {
    const name = player.input.name;
    if (this.isStandInKeeper(slot)) return `${name} — vekil kaleci (mevkisi ${player.ratings.position})`;
    if (slot.fit !== 'shifted') return `${name} — ${slot.mevki}`;
    return this.t('saha.pozisyonDisi', { ad: name, mevki: player.ratings.position, oynadigi: slot.mevki });
  }

  /**
   * Kaleye konmuş ama mevkisi kaleci OLMAYAN oyuncu. Sahadaki diğer "pozisyon dışı"
   * oyunculardan ayrı gösterilir (kesikli çerçeve + "KAL · vekil"), çünkü bu bir yerleşim
   * kazası değil, bilinçli bir plan: kaleyi sırayla paylaşıyorlar (kontrol raporu Ö3).
   */
  /**
   * Forma numarası yoksa forma BOŞ kalır. Önce tire, sonra soyadın baş harfi denendi; ikisi de
   * "aynı görsel yuvada bazen sayı bazen harf" tutarsızlığı yaratıyordu (Tur 4 · Y5). Oyuncunun
   * kim olduğu zaten formanın altındaki isimde yazıyor.
   */
  protected jerseyLabel(player: Player): string {
    return player.input.shirtNumber?.trim() ?? '';
  }

  protected isStandInKeeper(slot: DisplaySlot): boolean {
    return slot.mevki === 'KAL' && slot.fit === 'shifted' && !!slot.player;
  }

  /** "1. Polat · 2. Kaya · 3. Akdaş" — kale sırası çipinin metni. */
  protected readonly rotationText = computed(() => {
    const rotation = this.keeperRotation();
    if (!rotation) return null;
    return rotation.order.map((p, i) => `${i + 1}. ${this.surname(p)}`).join(' · ');
  });

  protected setFormation(id: string): void {
    this.formationId.set(id);
    this.formationChanged.emit(this.presets().find((p) => p.id === id)?.lines ?? this.formation().lines);
    this.manualPositions.set({}); // yeni diziliş eski elle-taşımaların üstüne yazar, karışıklık olmasın
  }

  protected onFormationSelect(event: Event): void {
    this.setFormation((event.target as HTMLSelectElement).value);
  }

  protected toggleRating(): void {
    this.showRating.update((v) => !v);
  }

  protected startEditName(): void {
    this.nameDraft.set(this.team().name);
    this.editingName.set(true);
  }

  protected commitEditName(): void {
    const trimmed = this.nameDraft().trim();
    this.editingName.set(false);
    if (trimmed && trimmed !== this.team().name) this.nameChanged.emit(trimmed);
  }

  protected cancelEditName(): void {
    this.editingName.set(false);
  }

  protected onNameDraftInput(event: Event): void {
    this.nameDraft.set((event.target as HTMLInputElement).value);
  }

  /** Kalecinin düz forma rengi — takım rengiyle çakışırsa yedek tona düşer. */
  protected readonly keeperColor = computed(() => keeperJerseyColor(this.team().color));

  /** Saha oyuncularının forması — kulüp seçiliyse vektör formanın yerine basılır. */
  protected readonly kitImage = computed(() => this.team().kitImage ?? null);

  /**
   * Bu yuvada hangi forma görseli basılacak. Kaleci kulübün İKİNCİ (deplasman) formasını giyer
   * (kullanıcı isteği); o forma yoksa null döner ve kaleci düz mor vektör formada kalır.
   */
  protected kitFor(slot: PitchSlot): string | null {
    if (slot.mevki !== 'KAL') return this.kitImage();
    const keeper = this.team().keeperKitImage ?? null;
    /*
     * Kaleci formasi saha formasının AYNISIYSA yok sayılır: arşivde ikinci forma bulunamayan
     * kulüplerde ikisi aynı URL'e düşüyordu ve kaleci sahada ayırt edilemiyordu (tarayıcı
     * test raporu 8). O zaman kaleci düz vektör formaya (kendi rengine) döner.
     */
    return keeper && keeper !== this.kitImage() ? keeper : null;
  }

  protected isSelected(playerId: string | undefined): boolean {
    return !!playerId && this.selectedPlayerId() === playerId;
  }

  protected onMarkerClick(playerId: string | undefined): void {
    if (playerId) this.playerClicked.emit(playerId);
  }

  /** Eylem düğmeleri seçimi bozmasın: tıklama yuvaya sızmaz. */
  protected onActionClick(event: Event): void {
    event.stopPropagation();
  }

  /**
   * Sürüklemeyi başlatır — hareket global `pointermove`/`pointerup` ile izlenir (element
   * sınırının dışına da çıkabilsin).
   *
   * DİKKAT: buradaki `preventDefault()` metin seçimini/sayfa kaydırmasını engelliyor ama
   * tarayıcının uyumluluk olaylarını da (yani `click`'i) susturuyor. Bu yüzden "tıklama"
   * şablondaki `(click)` ile DEĞİL, hareketsiz biten bir işaretçi hareketi olarak burada
   * tespit edilir (bkz. `handlePointerUp`). Kullanıcı geri bildirimi: "oyuncuya tıklayınca
   * hiçbir şey olmuyor" — birim testler `.click()`'i doğrudan çağırdığı için yakalamamıştı.
   */
  protected onPointerDown(event: PointerEvent, playerId: string): void {
    if (event.button !== 0 && event.pointerType === 'mouse') return; // sadece sol tık / dokunma / kalem
    event.preventDefault();
    this.pointerStart = { x: event.clientX, y: event.clientY };
    this.pointerMoved = false;
    this.activePointerId = event.pointerId;
    this.draggingId.set(playerId);
    this.livePosition.set(this.percentFromClient(event.clientX, event.clientY));

    this.windowMoveHandler = (e: PointerEvent) => this.handlePointerMove(e);
    this.windowUpHandler = (e: PointerEvent) => this.handlePointerUp(e, playerId);
    window.addEventListener('pointermove', this.windowMoveHandler);
    window.addEventListener('pointerup', this.windowUpHandler);
    window.addEventListener('pointercancel', this.windowUpHandler);
  }

  private percentFromClient(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.pitchElRef().nativeElement.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return { x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) };
  }

  private handlePointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.activePointerId) return;
    const start = this.pointerStart;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP_PX) {
      this.pointerMoved = true;
    }
    this.livePosition.set(this.percentFromClient(event.clientX, event.clientY));

    const targetEl = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-player-id]');
    const targetId = targetEl?.getAttribute('data-player-id') ?? null;
    this.dragOverId.set(targetId && targetId !== this.draggingId() ? targetId : null);
  }

  private handlePointerUp(event: PointerEvent, playerId: string): void {
    if (event.pointerId !== this.activePointerId) return;
    this.cleanupPointerListeners();

    // Parmak/imleç kıpırdamadıysa bu bir TIKLAMA: oyuncuyu seç, yerini değiştirme.
    if (!this.pointerMoved) {
      this.draggingId.set(null);
      this.livePosition.set(null);
      this.dragOverId.set(null);
      this.pointerStart = null;
      this.playerClicked.emit(playerId);
      return;
    }

    const rect = this.pitchElRef().nativeElement.getBoundingClientRect();
    const insideOwnPitch =
      event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;

    if (insideOwnPitch) {
      const pos = this.percentFromClient(event.clientX, event.clientY);
      this.manualPositions.update((m) => ({ ...m, [playerId]: pos }));
    } else {
      const targetEl = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-player-id]');
      const targetId = targetEl?.getAttribute('data-player-id');
      if (targetId && targetId !== playerId) {
        this.dragSwapRequested.emit({ fromId: playerId, toId: targetId });
      }
      // Kendi sahasının dışında, geçerli bir hedef yoksa: bu kartta hiçbir şey değişmez, kart eski yerine döner.
    }

    this.draggingId.set(null);
    this.livePosition.set(null);
    this.dragOverId.set(null);
    this.pointerStart = null;
  }

  private cleanupPointerListeners(): void {
    if (this.windowMoveHandler) window.removeEventListener('pointermove', this.windowMoveHandler);
    if (this.windowUpHandler) {
      window.removeEventListener('pointerup', this.windowUpHandler);
      window.removeEventListener('pointercancel', this.windowUpHandler);
    }
    this.windowMoveHandler = null;
    this.windowUpHandler = null;
    this.activePointerId = null;
  }

  /**
   * Marker altında basılan isim. Kadroda soyadı çakışıyorsa ayırt edici etiket kullanılır
   * ("H. DOĞAN"); yoksa sade soyadı (bkz. SquadStore.nameLabels).
   */
  protected surname(player: Player): string {
    return this.nameLabels()[player.id] ?? surnameOf(player.input.name);
  }
}
