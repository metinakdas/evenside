import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SELF_CARD_QUIZ, isQuizComplete, quizToInput } from '../../core/constants/self-card-quiz';
import { Player } from '../../core/models/player.model';
import { PlayerRepositoryService } from '../../core/services/player-repository.service';
import { SquadInviteService } from '../../core/services/squad-invite.service';
import { PlayerCardComponent } from '../../shared/components/player-card/player-card.component';
import { PhotoAdjusterComponent } from '../../shared/components/photo-adjuster/photo-adjuster.component';
import { ImageService } from '../../core/services/image.service';
import { PhotoCutoutService } from '../../core/services/photo-cutout.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { OYUN_DICTIONARIES } from '../../core/i18n/oyun-dictionary';

type Step = 'giris' | 'anket' | 'isim' | 'kart' | 'katil';
import { I18nService } from '../../core/services/i18n.service';
import { HESAP_DICTIONARIES } from '../../core/i18n/hesap-dictionary';

/**
 * "KARTIM" — kullanıcının kendi kartını anketle oluşturduğu ve kodla kadroya katıldığı ekran.
 *
 * Akış tek yönlü değil: kartı olan biri doğrudan kart ekranında açılır, oradan "yeniden çöz"
 * ile ankete dönebilir ya da "kadroya katıl"a geçebilir. Adres çubuğundaki `?katil=1`
 * (açılış davetindeki "Kadroya katıl" düğmesi) doğrudan katılma adımını açar.
 */
@Component({
    selector: 'app-my-card',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, PlayerCardComponent, PhotoAdjusterComponent],
    templateUrl: './my-card.component.html',
    styleUrl: './my-card.component.scss'
})
export class MyCardComponent {
  private readonly i18n = inject(I18nService);
  /** Çeviri; sözlük ekranla birlikte yükleniyor. */
  protected readonly t = this.i18n.t;

  private readonly players = inject(PlayerRepositoryService);
  private readonly invites = inject(SquadInviteService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly questions = SELF_CARD_QUIZ;
  protected readonly ownCard = computed<Player | null>(() => this.players.ownCard());

  /** Havuz BU KULLANICI İÇİN yüklendi mi — giriş ekranı o ana kadar bir şey iddia etmez. */
  protected readonly poolReady = this.players.readyForUser;

  protected readonly step = signal<Step>('giris');
  protected readonly index = signal(0);
  protected readonly answers = signal<Record<string, number>>({});
  protected readonly name = signal('');
  /** Boy ve kilo: kart fizik puanını (vücut kitle indeksi, boy) bunlardan da alıyor. */
  protected readonly heightCm = signal(175);
  protected readonly weightKg = signal(72);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /*
   * FOTOĞRAF (12 Ekim 2026). Oyuncu formuyla AYNI hat: küçültme (`ImageService`) → tarayıcıda
   * arka plan silme (`PhotoCutoutService`) → sürükle/yakınlaştır (`PhotoAdjusterComponent`).
   * Anketin son adımında yeni kartla birlikte kaydedilir; kart ekranında ise anketi yeniden
   * çözmeden yalnızca fotoğraf değiştirilebilir (`photoForCard`).
   */
  private readonly imageService = inject(ImageService);
  private readonly cutout = inject(PhotoCutoutService);
  private readonly confirmSvc = inject(ConfirmService);
  protected readonly photo = signal<string | null>(null);
  protected readonly photoProcessing = signal(false);
  protected readonly photoNotice = signal<string | null>(null);
  /** Yerleştirme paneli açıkken kaynak fotoğraf; panel ekranın içeriğini devralır. */
  protected readonly adjustSource = signal<string | null>(null);
  /** Kart ekranından açıldıysa: yerleştirme bitince doğrudan karta kaydedilir. */
  private photoForCard = false;
  private photoSource: string | null = null;

  /** Katılma adımı. */
  protected readonly code = signal('');
  protected readonly joinedSquadName = signal<string | null>(null);
  protected readonly joinError = computed(() => this.invites.error());
  /** Katılma isteği sürüyor: düğme kilitli (çift tıklamayla iki istek gitmesin). */
  protected readonly joining = computed(() => this.invites.busy());

  protected readonly current = computed(() => this.questions[this.index()]);
  protected readonly total = computed(() => this.questions.length);
  protected readonly complete = computed(() => isQuizComplete(this.answers()));

  constructor() {
    this.i18n.register(HESAP_DICTIONARIES);
    // Fotoğraf metinleri (form.foto*, form.ayriliyor…) oyuncu formuyla ortak.
    this.i18n.register(OYUN_DICTIONARIES);
    // Davetteki "Kadroya katıl" doğrudan buraya düşer; kart varsa kart ekranı karşılar.
    const q = this.route.snapshot.queryParamMap;
    const wantsJoin = q.get('join') === '1' || q.get('katil') === '1'; // `katil`: eski Türkçe ad
    if (wantsJoin) this.step.set('katil');

    /*
     * VERİ GELMEDEN KARAR VERME. Karar kurucuda bir kez veriliyordu; sayfa yenilendiğinde
     * havuz henüz yüklenmemiş oluyor, `ownCard()` null dönüyor ve kartı OLAN kullanıcıyı
     * "Kartını oluştur" ekranı karşılıyordu (tarayıcı test raporu 9). Karar artık kart
     * geldiğinde veriliyor — ama yalnızca kullanıcı hâlâ giriş ekranındaysa, yoksa ankete
     * başlamış birini kart ekranına geri fırlatırdı.
     */
    effect(
      () => {
        const card = this.players.ownCard();
        if (card && this.step() === 'giris') this.step.set('kart');
      });
  }

  protected startQuiz(): void {
    const card = this.ownCard();
    // Yeniden çözerken eski cevaplar hatırlanmaz ama isim korunur — kimlik değişmiyor.
    if (card) {
      this.name.set(card.input.name);
      this.heightCm.set(card.input.heightCm);
      this.weightKg.set(card.input.weightKg);
      this.photo.set(card.input.photoImage ?? null);
    }
    this.answers.set({});
    this.index.set(0);
    this.step.set('anket');
  }

  protected choose(optionIndex: number): void {
    const q = this.current();
    this.answers.update((a) => ({ ...a, [q.id]: optionIndex }));
    // Seçim yapınca kendiliğinden ilerlemez: kullanıcı cevabını görüp "Devam" demeli,
    // yoksa yanlış dokunuş bir sonraki soruya atlar ve geri dönmek zorunda kalır.
  }

  protected selected(questionId: string): number | undefined {
    return this.answers()[questionId];
  }

  protected next(): void {
    if (this.index() + 1 < this.total()) {
      this.index.update((i) => i + 1);
      return;
    }
    this.step.set('isim');
  }

  protected back(): void {
    if (this.index() === 0) {
      this.step.set(this.ownCard() ? 'kart' : 'giris');
      return;
    }
    this.index.update((i) => i - 1);
  }

  protected get canAdvance(): boolean {
    return this.selected(this.current().id) !== undefined;
  }

  protected onName(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
  }

  protected onNumber(field: 'heightCm' | 'weightKg', event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(raw) || raw <= 0) return;
    const [min, max] = field === 'heightCm' ? [100, 230] : [30, 200];
    this[field].set(Math.round(Math.min(max, Math.max(min, raw))));
  }

  protected async save(): Promise<void> {
    const name = this.name().trim();
    if (!name) {
      this.error.set(this.t('kart.adGerek'));
      return;
    }
    if (!this.complete()) {
      this.error.set(this.t('kart.eksikCevap'));
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    // Mevcut kartın kimliği (fotoğraf, forma no, sigara, gol ortalaması) korunur: anketi
    // yeniden çözmek yalnızca becerileri değiştirmeli.
    const existing = this.ownCard()?.input;
    const saved = await this.players.saveOwnCard(
      quizToInput(this.answers(), {
        ...existing,
        name,
        heightCm: this.heightCm(),
        weightKg: this.weightKg(),
        photoImage: this.photo(),
      }),
    );
    this.saving.set(false);

    if (!saved) {
      this.error.set(this.t('kart.kaydedilemedi'));
      return;
    }
    this.step.set('kart');
  }

  /** Dosya seçildi: küçült → arka planı sil → yerleştirme panelini aç. `forCard`: kart ekranından. */
  protected async onPhotoSelected(event: Event, forCard = false): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.photoNotice.set(null);
    let dataUrl: string;
    try {
      dataUrl = await this.imageService.toResizedDataUrl(file);
    } catch {
      this.photoNotice.set(this.t('form.gorselHata'));
      return;
    }
    this.photoProcessing.set(true);
    try {
      const result = await this.cutout.cutout(dataUrl);
      dataUrl = result.dataUrl;
    } catch {
      // Model çalışmazsa ya da kişi bulunamazsa özgün fotoğrafla devam — akış tıkanmaz.
      this.photoNotice.set(this.t('form.arkaPlanHata'));
    } finally {
      this.photoProcessing.set(false);
    }
    this.photoForCard = forCard;
    this.photoSource = dataUrl;
    this.adjustSource.set(dataUrl);
  }

  /** Mevcut fotoğrafı yeniden yerleştir (anketin son adımında). */
  protected openAdjuster(): void {
    const source = this.photoSource ?? this.photo();
    if (!source) return;
    this.photoForCard = false;
    this.adjustSource.set(source);
  }

  protected async onPhotoAdjusted(dataUrl: string): Promise<void> {
    this.adjustSource.set(null);
    if (!this.photoForCard) {
      this.photo.set(dataUrl);
      return;
    }
    await this.savePhotoToCard(dataUrl);
  }

  protected closeAdjuster(): void {
    this.adjustSource.set(null);
  }

  protected async clearPhoto(forCard = false): Promise<void> {
    const ok = await this.confirmSvc.ask({
      title: this.t('onay.fotoBaslik'),
      message: this.t('onay.fotoMetin'),
      confirmLabel: this.t('onay.fotoDugme'),
      danger: true,
    });
    if (!ok) return;
    this.photoSource = null;
    this.photoNotice.set(null);
    if (forCard) await this.savePhotoToCard(null);
    else this.photo.set(null);
  }

  /** Kart ekranında: yalnızca fotoğraf değişir, beceriler ve kimlik olduğu gibi kalır. */
  private async savePhotoToCard(photoImage: string | null): Promise<void> {
    const card = this.ownCard();
    if (!card) return;
    this.saving.set(true);
    const saved = await this.players.saveOwnCard({ ...card.input, photoImage });
    this.saving.set(false);
    this.photoNotice.set(saved ? null : this.t('kart.kaydedilemedi'));
  }

  protected onCode(event: Event): void {
    this.code.set((event.target as HTMLInputElement).value);
    // Yazmaya başlamak yeni bir deneme demektir: eski hata orada durmasın.
    this.invites.clearError();
  }

  protected async join(): Promise<void> {
    // Önceki başarı mesajı yeni denemenin sonucunu (ör. "zaten bu takımdasın") örtmesin.
    this.joinedSquadName.set(null);
    const squad = await this.invites.joinByCode(this.code());
    if (squad) this.joinedSquadName.set(squad.name || this.t('ui.adsizTakim'));
  }

  protected goHome(): void {
    void this.router.navigateByUrl('/');
  }

  protected goJoin(): void {
    this.joinedSquadName.set(null);
    this.step.set('katil');
  }
}
