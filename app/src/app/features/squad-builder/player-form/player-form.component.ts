import { ConfirmService } from '../../../core/services/confirm.service';
import { NoticeService } from '../../../core/services/notice.service';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Player, PlayerInput, PlayerPosition } from '../../../core/models/player.model';
import {
  PreferredFoot,
  SKILL_GROUPS,
  SkillGroup,
  SkillKey,
  effectiveSkills,
  legacyFromSkills,
  skillBand,
} from '../../../core/constants/player-skills';
import { ImageService } from '../../../core/services/image.service';
import { PhotoCutoutService } from '../../../core/services/photo-cutout.service';
import { RatingService } from '../../../core/services/rating.service';
import { BLANK_PLAYER_INPUT, SquadStore } from '../../../core/services/squad-store.service';
import { ErrorBannerComponent } from '../../../shared/components/error-banner/error-banner.component';
import { PhotoAdjusterComponent } from '../../../shared/components/photo-adjuster/photo-adjuster.component';
import { PlayerCardComponent } from '../../../shared/components/player-card/player-card.component';
import { StatStepperComponent } from '../../../shared/components/stat-stepper/stat-stepper.component';
import { I18nService } from '../../../core/services/i18n.service';
import { OYUN_DICTIONARIES } from '../../../core/i18n/oyun-dictionary';

type TextField = 'name' | 'shirtNumber';
type NumberField = 'heightCm' | 'weightKg' | 'goalsPerMatch' | 'age';
type FormStep = 'kimlik' | SkillGroup;

/** Her adımın etkilediği yüz puanları — adımın altında canlı gösterilir. */
const STEP_FACES: Record<SkillGroup, { label: string; key: 'pace' | 'shooting' | 'passing' | 'dribbling' | 'defending' | 'physical' | 'goalkeeping' }[]> = {
  fizik: [{ label: 'stat.hiz', key: 'pace' }, { label: 'stat.fiz', key: 'physical' }],
  hucum: [{ label: 'stat.sut', key: 'shooting' }],
  oyun: [{ label: 'stat.pas', key: 'passing' }, { label: 'stat.dri', key: 'dribbling' }],
  savunma: [{ label: 'stat.def', key: 'defending' }],
  kale: [{ label: 'form.kal', key: 'goalkeeping' }],
};

/**
 * Forma girişte alt özellikleri her zaman DOLU getirir (eski kartta eski alanlardan tahmin)
 * ve eski altı alanı onlardan yeniden türetir. Hem form hem "değişti mi" tabanı aynı
 * normalizasyondan geçer — yoksa eski bir kart açılır açılmaz "kaydedilmemiş" sayılırdı.
 */
function normalize(input: PlayerInput): PlayerInput {
  const skills = effectiveSkills(input);
  return {
    ...input,
    ...legacyFromSkills(skills),
    skills,
    preferredFoot: input.preferredFoot ?? 'sag',
    age: input.age ?? null,
    noKeeper: input.noKeeper ?? false,
  };
}

const PLACEHOLDER_ID = '__preview__';

/** Geçersiz/aşırı sayısal girdilerin (Faz 8.4) hesaplamayı bozmasını önleyen makul sınırlar. */
/** Kartta okunabilir kalan en uzun ad (Tur 3 · A8: 52 karakterlik ad girilebiliyordu). */
const MAX_NAME_LENGTH = 32;

type MetricField = 'heightCm' | 'weightKg' | 'age' | 'goalsPerMatch';

/** Girdinin ekranda görünen metni (virgüllü ondalık). */
function metricTexts(input: PlayerInput): Record<MetricField, string> {
  return {
    heightCm: String(input.heightCm),
    weightKg: String(input.weightKg),
    age: input.age == null ? '' : String(input.age),
    goalsPerMatch: String(input.goalsPerMatch).replace('.', ','),
  };
}

const NUMBER_FIELD_BOUNDS: Record<NumberField, [number, number]> = {
  heightCm: [100, 230],
  age: [10, 90],
  weightKg: [30, 200],
  goalsPerMatch: [0, 10],
};

@Component({
    selector: 'app-player-form',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [PlayerCardComponent, PhotoAdjusterComponent, StatStepperComponent, ErrorBannerComponent],
    templateUrl: './player-form.component.html',
    styleUrl: './player-form.component.scss'
})
export class PlayerFormComponent {
  private readonly i18n = inject(I18nService);
  /** Sözlük ekranla birlikte yükleniyor (giriş paketi şişmesin). */
  protected readonly t = this.i18n.t;

  protected readonly store = inject(SquadStore);
  private readonly imageService = inject(ImageService);
  private readonly cutout = inject(PhotoCutoutService);
  private readonly rating = inject(RatingService);
  private readonly notices = inject(NoticeService);
  private readonly confirmSvc = inject(ConfirmService);

  protected readonly form = signal<PlayerInput>(normalize(BLANK_PLAYER_INPUT));
  readonly isEditing = computed(() => this.store.editingPlayerId() !== null);
  protected readonly imageError = signal<string | null>(null);
  /**
   * Yüklenen fotoğrafın arka planı silinmemiş hâli. Kullanıcı "arka planı kaldır"ı kapatıp
   * açtığında dosyayı yeniden seçmek zorunda kalmasın diye bellekte tutulur; kaydedilmez.
   */
  private readonly photoOriginal = signal<string | null>(null);
  /** Arka planı silinmiş hâl — aynı fotoğraf için model iki kez çalışmasın. */
  private readonly photoCut = signal<string | null>(null);
  /** Kullanıcı tercihi: yüklenen fotoğraftan yalnızca kişiyi ayır. */
  /**
   * Arka plan silme HER ZAMAN açık (kullanıcı isteği, 10 Ekim 2026): formdaki "arka planı kaldır"
   * anahtarı kaldırıldı. Model kişiyi bulamazsa servis özgün fotoğrafa döner (bkz. applyCutout).
   */
  protected readonly removeBackground = signal(true);

  /**
   * SAYISAL ALANLAR. Eskiden her tuş vuruşunda değer sınıra çekiliyordu: "180" yazmaya başlayınca
   * "1" anında 100'e dönüyor, "-" yazınca alt sınır geliyordu. Artık yazılan METİN ayrı tutulur,
   * yalnızca rakam (gol ortalamasında bir ondalık) kabul edilir; geçerliyse forma yazılır,
   * değilse alanın altında hata çıkar ve "İleri" o adımı geçirmez.
   */
  protected readonly metricText = signal<Record<MetricField, string>>(metricTexts(BLANK_PLAYER_INPUT));
  /** Hatalar ancak alandan çıkınca ya da "İleri"de gösterilir (yazarken "1" hata sayılmasın). */
  protected readonly showMetricErrors = signal(false);
  protected readonly metricErrors = computed<Record<MetricField, string | null>>(() => {
    const m = this.metricText();
    const tamSayi = (text: string, [min, max]: [number, number]): boolean => {
      if (!/^\d{1,3}$/.test(text)) return false;
      const n = Number(text);
      return n >= min && n <= max;
    };
    const gol = /^\d{1,2}([.,]\d)?$/.test(m.goalsPerMatch) && Number(m.goalsPerMatch.replace(',', '.')) <= 10;
    return {
      heightCm: tamSayi(m.heightCm, NUMBER_FIELD_BOUNDS.heightCm) ? null : this.t('form.boyHata'),
      weightKg: tamSayi(m.weightKg, NUMBER_FIELD_BOUNDS.weightKg) ? null : this.t('form.kiloHata'),
      age: m.age === '' || tamSayi(m.age, NUMBER_FIELD_BOUNDS.age) ? null : this.t('form.yasHata'),
      goalsPerMatch: gol ? null : this.t('form.golHata'),
    };
  });

  /**
   * Yeni oyuncuda hiçbir beceri girilmeden kart DEĞER GÖSTERMEZ (kullanıcı isteği): varsayılan
   * puanlardan hesaplanmış "58 DEF", kullanıcının hiç girmediği bir değeri söylüyordu. İlk
   * beceri adımına gelinince kart canlı değerlerle dolar.
   */
  protected readonly cardBlank = computed(() => !this.isEditing() && this.visited().size <= 1);
  /** Model çalışırken buton/önizleme "işleniyor" durumunda kalır (ilk çalıştırmada ~1-2 sn). */
  protected readonly photoProcessing = signal(false);
  /** Arka plan silme başarısız olduysa kullanıcıya sebebini söyleyen bilgi metni. */
  protected readonly cutoutNotice = signal<string | null>(null);
  /**
   * Fotoğraf yerleştirme paneli açıkken ayarlanan görsel. Yükleme biter bitmez açılır:
   * kullanıcı fotoğrafın kartta nereye oturacağını görmeden kaydetmek zorunda kalmasın.
   */
  protected readonly adjustSource = signal<string | null>(null);
  readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  /** Ad alanının doğrulama hatası — boş adla "Kadroya ekle" sessizce hiçbir şey yapıyordu. */
  protected readonly nameError = signal<string | null>(null);
  /**
   * Bir kez gönderim denendi mi. Denendikten SONRA doğrulama canlıya geçer: kullanıcı hatayı
   * düzeltirken anında görür, tekrar "Kaydet"e basmayı beklemez (Tur 4 · Y6). Önce canlı
   * doğrulama yapmıyoruz ki forma girer girmez kırmızı görmesin.
   */
  private submitted = false;
  /** Formda kaydedilmemiş değişiklik var mı — kapatma onayı bunu okur (Tur 3 · A13). */
  readonly isDirty = computed(() => {
    const current = this.form();
    const base = normalize(this.store.editingPlayer()?.input ?? BLANK_PLAYER_INPUT);
    return JSON.stringify(current) !== JSON.stringify(base);
  });

  protected readonly previewPlayer = computed<Player>(() => ({
    id: this.store.editingPlayerId() ?? PLACEHOLDER_ID,
    input: this.form(),
    ratings: this.rating.calculate(this.form()),
  }));

  protected readonly feet: { id: PreferredFoot; label: string }[] = [
    { id: 'sag', label: 'form.ayakSag' },
    { id: 'sol', label: 'form.ayakSol' },
    { id: 'iki', label: 'form.ayakIki' },
  ];

  constructor() {
    this.i18n.register(OYUN_DICTIONARIES);
    // Düzenleme başlayınca ham girdinin tamamı forma geri yüklenir — puanlar sıfırlanmaz.
    effect(
      () => {
        const editing = this.store.editingPlayer();
        const input = normalize(editing ? editing.input : BLANK_PLAYER_INPUT);
        this.form.set(input);
        this.metricText.set(metricTexts(input));
        this.showMetricErrors.set(false);
      });

  }

  setText(key: TextField, value: string): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  setNumber(key: NumberField, value: number): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  /** Alt özellik değişince eski altı alan da yeniden türetilir: dengeleyici ve anket onları okuyor. */
  setSkill(key: SkillKey, value: number): void {
    this.form.update((f) => {
      const skills = { ...effectiveSkills(f), [key]: value };
      return { ...f, ...legacyFromSkills(skills), skills };
    });
  }

  protected skillValue(key: SkillKey): number {
    return effectiveSkills(this.form())[key];
  }

  /** Puanın altındaki somut davranış örneği (davranış çapalı ölçek). */
  protected anchor(key: SkillKey): string {
    return this.t(`beceri.${key}.${skillBand(this.skillValue(key))}`);
  }

  setFoot(foot: PreferredFoot): void {
    this.form.update((f) => ({ ...f, preferredFoot: foot }));
  }

  /**
   * Sayısal alan: yalnızca rakam (gol ortalamasında tek ondalık ayırıcı) kabul edilir; eksi,
   * "e", artı gibi karakterler yazılamaz. Geçerli değer forma yazılır; geçersizse form son
   * geçerli değeri korur ve alan hatayı gösterir. Yaş boş bırakılabilir.
   */
  onMetricInput(field: MetricField, event: Event): void {
    const el = event.target as HTMLInputElement;
    let text: string;
    if (field === 'goalsPerMatch') {
      text = el.value.replace(/[^\d.,]/g, '');
      const sep = text.search(/[.,]/);
      if (sep >= 0) text = text.slice(0, sep + 1) + text.slice(sep + 1).replace(/[.,]/g, '').slice(0, 1);
      text = text.slice(0, 4);
    } else {
      text = el.value.replace(/\D/g, '').slice(0, 3);
    }
    if (text !== el.value) el.value = text;
    this.metricText.update((m) => ({ ...m, [field]: text }));
    if (this.metricErrors()[field]) return;
    if (field === 'age') {
      this.form.update((f) => ({ ...f, age: text === '' ? null : Number(text) }));
    } else {
      this.form.update((f) => ({ ...f, [field]: Number(text.replace(',', '.')) }));
    }
  }

  onMetricBlur(): void {
    this.showMetricErrors.set(true);
  }

  /** Kalede: "Bu oyuncu hiç kaleye geçemez". Açılınca kalecilik becerileri sıfırlanır. */
  setNoKeeper(value: boolean): void {
    this.form.update((f) => ({ ...f, noKeeper: value }));
    if (value) {
      this.setSkill('refleks', 0);
      this.setSkill('kaleHakimiyeti', 0);
    }
  }

  onNoKeeperToggle(event: Event): void {
    this.setNoKeeper((event.target as HTMLInputElement).checked);
  }

  setSmoker(value: boolean): void {
    this.form.update((f) => ({ ...f, smoker: value }));
  }

  onTextInput(key: TextField, event: Event): void {
    const input = event.target as HTMLInputElement;
    // Forma numarası en fazla iki hane ve sadece rakam: "99999" kabul ediliyor ve önizleme
    // kartındaki numara dairesinden taşıyordu (Tur 3 · A8). Ad alanı da makul bir uzunlukla
    // sınırlı, aksi hâlde kartta okunamayan bir şerit oluşuyor.
    const value =
      key === 'shirtNumber'
        ? input.value.replace(/[^0-9]/g, '').slice(0, 2)
        : input.value.slice(0, MAX_NAME_LENGTH);
    if (value !== input.value) input.value = value;
    this.setText(key, value);
    if (key === 'name') this.revalidateName();
  }

  onSmokerToggle(event: Event): void {
    this.setSmoker((event.target as HTMLInputElement).checked);
  }

  async onPhotoSelected(event: Event): Promise<void> {
    const dataUrl = await this.readImage(event);
    if (!dataUrl) return;
    this.photoOriginal.set(dataUrl);
    this.photoCut.set(null);
    this.cutoutNotice.set(null);
    this.form.update((f) => ({ ...f, photoImage: dataUrl }));
    if (this.removeBackground()) await this.applyCutout();
    this.openAdjuster();
  }

  /** Yerleştirme panelini, elde olan en iyi kaynakla (arka planı silinmiş hâl varsa onunla) açar. */
  protected openAdjuster(): void {
    const source = (this.removeBackground() ? this.photoCut() : null) ?? this.photoOriginal() ?? this.form().photoImage;
    if (source) this.adjustSource.set(source);
  }

  protected onPhotoAdjusted(dataUrl: string): void {
    this.adjustSource.set(null);
    this.form.update((f) => ({ ...f, photoImage: dataUrl }));
  }

  protected closeAdjuster(): void {
    this.adjustSource.set(null);
  }

  /**
   * Fotoğraftan kişiyi ayırır. Model tarayıcıda çalışıyor; başarısız olursa (WASM
   * yüklenemedi, fotoğrafta kişi bulunamadı) özgün fotoğrafa dönülür ve sebebi yazılır —
   * yükleme akışı asla tıkanmaz.
   */
  private async applyCutout(): Promise<void> {
    const original = this.photoOriginal();
    if (!original) return;

    const cached = this.photoCut();
    if (cached) {
      this.form.update((f) => ({ ...f, photoImage: cached }));
      return;
    }

    this.photoProcessing.set(true);
    try {
      const result = await this.cutout.cutout(original);
      this.photoCut.set(result.dataUrl);
      this.form.update((f) => ({ ...f, photoImage: result.dataUrl }));
      this.cutoutNotice.set(
        result.coverage < 0.05
          ? this.t('form.kucukKisi')
          : null,
      );
    } catch {
      this.cutoutNotice.set(this.t('form.arkaPlanHata'));
      this.form.update((f) => ({ ...f, photoImage: original }));
    } finally {
      this.photoProcessing.set(false);
    }
  }

  /**
   * Mevkinin nasıl seçildiğini tek satırla açıklar. Kullanıcı ORTA SAHA 7 > FORVET 6 iken
   * kartın "FOR" demesini anlamıyordu (Tur 3 · A9): mevki yalnızca slider'lardan değil,
   * boy/kilo/sigara üzerinden hesaplanan fiziksel istatistiklerin de girdiği bileşke
   * puanların en büyüğünden geliyor.
   */
  /** Dört mevkinin bileşke puanı — en yükseği kartın mevkisi. "Neden FOR?" sorusunu cevaplar. */
  protected readonly positionFit = computed(() => {
    const scores = this.rating.positionScores(this.form());
    const best = this.previewPlayer().ratings.position;
    // Kaleye hiç geçemeyen oyuncuda KAL uygunluğu 0: o mevki onun için seçenek değil.
    const noKeeper = this.form().noKeeper === true;
    return (['KAL', 'DEF', 'OS', 'FOR'] as PlayerPosition[]).map((p) => ({
      id: p,
      value: noKeeper && p === 'KAL' ? 0 : scores[p],
      best: p === best,
    }));
  });

  /** İlk gönderimden sonra ad alanını yazarken doğrular. */
  private revalidateName(): void {
    if (!this.submitted) {
      if (this.nameError()) this.nameError.set(null);
      return;
    }
    this.nameError.set(this.form().name.trim() ? null : this.t('form.adGerek'));
  }

  /** Silme iki adımlı: tek tıkla geri alınamaz bir işlem yapılmasın. */
  readonly confirmingDelete = signal(false);

  /**
   * Form üç adıma bölündü (Tur 4 · Bölüm 5): aynı anda tek adım görünür, böylece modalın
   * kendi iç scroll'u kalkıyor. Her adımda en fazla altı alan var.
   */
  protected readonly steps: { id: FormStep; label: string }[] = [
    { id: 'kimlik', label: 'form.adim.kimlik' },
    ...SKILL_GROUPS.map((g) => ({ id: g.id, label: `form.adim.${g.id}` })),
  ];
  readonly step = signal<FormStep>('kimlik');
  /** Gezilen adımlar — adım çubuğunda tik işareti alır (nerede olduğunu ve neyi gördüğünü bilsin). */
  protected readonly visited = signal<ReadonlySet<FormStep>>(new Set(['kimlik']));
  readonly stepIndex = computed(() => this.steps.findIndex((s) => s.id === this.step()));
  readonly stepCount = this.steps.length;
  readonly isFirstStep = computed(() => this.stepIndex() === 0);
  readonly isLastStep = computed(() => this.stepIndex() === this.steps.length - 1);
  /**
   * SIRALI VE ZORUNLU ADIMLAR (kullanıcı isteği, 10 Ekim 2026): yeni oyuncuda bir adım ancak
   * öncekiler geçildikten sonra açılır; ileri yalnızca "İleri" ile (o adımın doğrulamasından
   * geçerek) gidilir, geri her zaman serbest. Kaydet yalnızca SON adımda. Düzenlemede kartın
   * bütün verisi zaten var: adımlar açık ve "Güncelle" her adımda (adı düzeltmek için altı
   * adım gezdirmek anlamsız).
   */
  readonly freeNavigation = computed(() => this.isEditing());
  protected canOpenStep(index: number): boolean {
    if (this.freeNavigation()) return true;
    return index <= this.stepIndex() || this.visited().has(this.steps[index].id);
  }
  /** Birincil eylem (kaydet) görünür mü: yeni oyuncuda yalnızca son adımda. */
  readonly canSubmitHere = computed(() => this.freeNavigation() || this.isLastStep());

  /** Diyalog başlığının alt satırı: "Adım 2/6 · <adımın notu>". */
  readonly stepCaption = computed(() =>
    this.t('form.adimSayac', { n: this.stepIndex() + 1, toplam: this.steps.length }) +
    ' · ' +
    this.t('form.adimNot.' + this.step()),
  );
  /** Adım çubuğunun dolulğu (0-100). */
  protected readonly progress = computed(() => (this.stepIndex() / (this.steps.length - 1)) * 100);
  protected readonly stepSkills = computed(() => SKILL_GROUPS.find((g) => g.id === this.step())?.skills ?? []);
  /** Açık adımın etkilediği yüz puanları (canlı). */
  protected readonly stepFaces = computed(() => {
    const step = this.step();
    if (step === 'kimlik') return [];
    const r = this.previewPlayer().ratings;
    return STEP_FACES[step].map((f) => ({ label: f.label, value: Math.round(r[f.key]) }));
  });

  /**
   * Alt çubuk artık modalın AYAĞI (bkz. squad-builder şablonu): sağ kolonun son elemanı
   * olduğu için sekmeye göre 146px zıplıyor ve modalın ortasında kalıyordu (Tur 5 · M1-M3).
   * Bileşen aksiyonları dışarıya açıyor; düğmeler modalın kendi 64px'lik satırında duruyor.
   */
  readonly canSave = computed(() => !this.saving());

  protected setStep(step: FormStep): void {
    const index = this.steps.findIndex((s) => s.id === step);
    // İleri atlama yalnızca "İleri" ile (doğrulamadan geçerek); çubuktan açılmamış adıma gidilmez.
    if (index > this.stepIndex() && !this.canOpenStep(index)) return;
    if (index > this.stepIndex() && !this.validateStep()) return;
    this.step.set(step);
    this.visited.update((v) => new Set([...v, step]));
  }

  /** Açık adımın zorunlu alanları tamam mı; değilse hatayı gösterir. */
  private validateStep(): boolean {
    const hatalar = this.metricErrors();
    if (this.step() === 'hucum') {
      this.showMetricErrors.set(true);
      return !hatalar.goalsPerMatch;
    }
    if (this.step() !== 'kimlik') return true;
    this.showMetricErrors.set(true);
    if (hatalar.heightCm || hatalar.weightKg || hatalar.age) {
      if (!this.form().name.trim()) this.nameError.set(this.t('form.adGerek'));
      return false;
    }
    this.submitted = true;
    if (!this.form().name.trim()) {
      this.nameError.set(this.t('form.adGerek'));
      return false;
    }
    this.nameError.set(null);
    return true;
  }

  nextStep(): void {
    const i = this.stepIndex();
    if (i >= this.steps.length - 1) return;
    if (!this.validateStep()) return;
    const next = this.steps[i + 1].id;
    this.step.set(next);
    this.visited.update((v) => new Set([...v, next]));
  }

  prevStep(): void {
    const i = this.stepIndex();
    if (i > 0) this.setStep(this.steps[i - 1].id);
  }

  /** Puanın bant adı (Zayıf / Orta / İyi / Çok iyi) — sayının ne demek olduğunu tek kelimeyle söyler. */
  protected band(key: SkillKey): string {
    return this.t(`form.bant.${skillBand(this.skillValue(key))}`);
  }

  protected bandLevel(key: SkillKey): number {
    return skillBand(this.skillValue(key));
  }

  /** Yüklenen fotoğrafı kaldırır — bırakma alanının yanındaki bağlantı. */
  protected async clearPhoto(): Promise<void> {
    const ok = await this.confirmSvc.ask({
      title: this.t('onay.fotoBaslik'),
      message: this.t('onay.fotoMetin'),
      confirmLabel: this.t('onay.fotoDugme'),
      danger: true,
    });
    if (!ok) return;
    this.adjustSource.set(null);
    this.photoOriginal.set(null);
    this.photoCut.set(null);
    this.cutoutNotice.set(null);
    this.form.update((f) => ({ ...f, photoImage: null }));
  }

  /** Kalıcı silme: ortak onay penceresi; onaylanırsa siler. */
  async askDelete(): Promise<void> {
    const ok = await this.confirmSvc.ask({
      title: this.t('onay.oyuncuSilBaslik'),
      message: this.t('onay.oyuncuSilMetin', { ad: this.form().name || this.t('kullanici.adsiz') }),
      confirmLabel: this.t('onay.oyuncuSilDugme'),
      danger: true,
    });
    if (ok) await this.deletePlayer();
  }


  cancelDelete(): void {
    this.confirmingDelete.set(false);
  }

  async deletePlayer(): Promise<void> {
    const id = this.store.editingPlayerId();
    if (!id || this.saving()) return;
    this.saving.set(true);
    const ok = await this.store.deletePlayerPermanently(id);
    this.saving.set(false);
    this.confirmingDelete.set(false);
    if (!ok) this.saveError.set(this.t('form.silinemedi'));
  }

  async submit(): Promise<void> {
    if (this.saving()) return;
    // Enter vb. başka bir yoldan gelse bile: yeni oyuncu son adımdan önce kaydedilmez.
    if (!this.canSubmitHere()) {
      this.nextStep();
      return;
    }
    this.submitted = true;
    if (!this.form().name.trim()) {
      this.nameError.set(this.t('form.adGerek'));
      // Ad Kimlik adımında: kullanıcıyı hatanın olduğu yere götür.
      this.step.set('kimlik');
      return;
    }
    this.nameError.set(null);
    const wasEditing = this.isEditing();
    this.saving.set(true);
    this.saveError.set(null);
    const result = await this.store.savePlayer(this.form());
    this.saving.set(false);
    if (!result) {
      /*
       * Deponun mesajı VARSA o kazanır: sunucu neden reddettiğini söylüyorsa (yetki, politika
       * hatası, eksik şema) kullanıcıyı "bağlantını kontrol et" diye yanlış yöne göndermeyelim.
       * Ölçüldü: 42P17 politika döngüsü tam olarak böyle gizlenmişti.
       */
      this.saveError.set(
        this.store.playerError() ?? this.t('form.kaydedilemedi'),
      );
      return;
    }
    const attached = this.store.isInSquad(result.id);
    this.announceSuccess(result.input.name, wasEditing, attached);
    // Başarılı kayıt: pencere KAPANIR, bir sonraki açılış temiz başlar (form bileşeni diyalogla
    // birlikte yok edilir; yine de durum burada da sıfırlanıyor). Onay bildirimi sağ üstte.
    this.resetState();
    this.store.cancelEditing();
  }

  /** Formu ve adım durumunu başlangıca döndürür. */
  private resetState(): void {
    this.form.set(normalize(BLANK_PLAYER_INPUT));
    this.metricText.set(metricTexts(BLANK_PLAYER_INPUT));
    this.showMetricErrors.set(false);
    this.step.set('kimlik');
    this.visited.set(new Set(['kimlik']));
    this.submitted = false;
    this.nameError.set(null);
    this.saveError.set(null);
    this.adjustSource.set(null);
    this.photoOriginal.set(null);
    this.photoCut.set(null);
    this.cutoutNotice.set(null);
  }

  private announceSuccess(name: string, wasEditing: boolean, attachedToSquad: boolean): void {
    const message = wasEditing
      ? this.t('form.onayGuncel', { ad: name })
      : attachedToSquad
        ? this.t('form.onayEklendi', { ad: name })
        : this.t('form.onayDolu', { ad: name });
    this.notices.success(message);
  }

  /** Formu boşa döndürür — düzenleniyorsa bırakır ama paneli KAPATMAZ (bkz. kapatma için "×"). */
  reset(): void {
    this.store.startCreating();
    this.resetState();
  }

  private async readImage(event: Event): Promise<string | null> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return null;
    try {
      const dataUrl = await this.imageService.toResizedDataUrl(file);
      this.imageError.set(null);
      return dataUrl;
    } catch {
      this.imageError.set(this.t('form.gorselHata'));
      return null;
    } finally {
      input.value = '';
    }
  }
}
