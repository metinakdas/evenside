import { ConfirmService } from '../../../core/services/confirm.service';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { trFold, trUpper } from '../../../core/utils/turkish-text';
import { personNameKey } from '../../../core/utils/name-match';
import { TIER_SOLID_COLOR, TIER_TEXT_COLOR } from '../../../core/constants/tier-colors';
import { Player } from '../../../core/models/player.model';
import { PlayerRepositoryService } from '../../../core/services/player-repository.service';
import { SquadInviteService } from '../../../core/services/squad-invite.service';
import { CardMatchService, CardMatchSuggestion } from '../../../core/services/card-match.service';
import { NoticeService } from '../../../core/services/notice.service';
import { SquadStore } from '../../../core/services/squad-store.service';
import { I18nService } from '../../../core/services/i18n.service';
import { OYUN_DICTIONARIES } from '../../../core/i18n/oyun-dictionary';

/**
 * Kadro havuzu — tek bir birleşik ızgara. Bu bir "her seferinde yeni oyuncu
 * ekleme" ekranı değil: sabit ~20 kişilik bir kadronun her hafta hangi
 * üyelerinin sahada olacağını tek tıkla işaretlediği bir seçim ekranı (bkz.
 * kullanıcı notu — takım sabit, sık sık yeni oyuncu eklenmeyecek). Havuzdaki
 * her oyuncu bir kart olarak görünür; tıklamak kadroya ekler/çıkarır, kalem
 * ikonu düzenlemeyi açar. Eskiden ayrı "liste" / "seçici" modları vardı, tek
 * ızgaraya birleştirildi ki kadroda-kim-var ve havuzda-kim-var aynı anda görülsün.
 */
@Component({
    selector: 'app-squad-list',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [],
    templateUrl: './squad-list.component.html',
    styleUrl: './squad-list.component.scss'
})
export class SquadListComponent {
  private readonly i18n = inject(I18nService);
  /** Sözlük ekranla birlikte yükleniyor (giriş paketi şişmesin). */
  protected readonly t = this.i18n.t;

  constructor() {
    this.i18n.register(OYUN_DICTIONARIES);
  }

  protected readonly store = inject(SquadStore);
  private readonly confirmSvc = inject(ConfirmService);
  protected readonly repo = inject(PlayerRepositoryService);
  private readonly invites = inject(SquadInviteService);
  private readonly matchSvc = inject(CardMatchService);
  private readonly notices = inject(NoticeService);

  /**
   * Kodla katılan kişilerin kart id'leri. Havuzda iki tür kart var: kadro sahibinin ELLE
   * eklediği kartlar ve kodla KATILAN kişilerin kendi kartları — listede ayırt edilebilmeli
   * (kullanıcı isteği). Eşlenmiş kartlar için de doğru çalışsın diye id'ler kanonikleştirilir.
   */
  protected readonly joinedIds = computed<Set<string>>(() => {
    const raw = this.invites.joinedPlayerIds();
    return new Set([...raw].map((id) => this.repo.resolveId(id)));
  });

  /**
   * Havuzda AYNI ADI taşıyan kartlar. Eşleme önerisi yalnızca kullanıcının KENDİ kartı için
   * çıkıyordu; iki "Ahmet Bulut" yan yana durduğunda hangisinin hangisi olduğu anlaşılmıyordu
   * (test raporu 8). Ad karşılaştırması aksana/büyük harfe duyarsız (bkz. trFold).
   */
  protected readonly duplicateIds = computed<Set<string>>(() => {
    const byName = new Map<string, string[]>();
    // EŞLENMİŞ kopyalar sayılmaz: havuzda zaten görünmüyorlar ve "aynı ad var" uyarısı, eşlemesi
    // ÇOKTAN yapılmış kartta yanlış alarm veriyordu (kullanıcı geri bildirimi, 11 Ekim 2026).
    this.repo.poolPlayers().forEach((p) => {
      // Eşleme önerisiyle AYNI anahtar (personNameKey): boşluk/noktalama farkı uyarıyı kaçırmasın.
      const key = personNameKey(p.input.name);
      if (!key) return;
      byName.set(key, [...(byName.get(key) ?? []), p.id]);
    });
    const dupes = new Set<string>();
    byName.forEach((ids) => {
      if (ids.length < 2) return;
      // "Ayrı kişiler" diye işaretlenmiş çift artık uyarı DOĞURMAZ: kullanıcı bilerek karar verdi.
      for (const id of ids) {
        if (ids.some((o) => o !== id && !this.matchSvc.isDismissedPair(id, o))) dupes.add(id);
      }
    });
    return dupes;
  });

  protected isDuplicate(player: Player): boolean {
    return this.duplicateIds().has(player.id);
  }

  /**
   * Kartın dahil olduğu EŞLEME önerisi (elle eklenmiş kart ↔ aynı adlı sahipli kart). Uyarı tek
   * başına iş görmüyordu: kullanıcı "aynı karttan varsa uyarı ve eşleştirme yapmalıyız" dedi.
   * Öneri varsa ve kadroyu düzenleyebiliyorsan ⚠ tıklanır ve onayla iki kart eşlenir.
   */
  private readonly matchFor = computed(() => {
    const m = new Map<string, CardMatchSuggestion>();
    for (const s of this.matchSvc.suggestions()) {
      if (!m.has(s.poolCard.id)) m.set(s.poolCard.id, s);
      if (!m.has(s.ownedCard.id)) m.set(s.ownedCard.id, s);
    }
    return m;
  });

  protected canLink(player: Player): boolean {
    return this.store.canEditSquad() && this.matchFor().has(player.id);
  }

  protected async link(player: Player, event: Event): Promise<void> {
    event.stopPropagation();
    const s = this.matchFor().get(player.id);
    if (!s || !this.store.canEditSquad()) return;
    /*
     * Aynı ad AYNI KİŞİ demek değil (kullanıcı: "iki farklı insan olabilir, illa eşlemek zorunda
     * değiliz"). Üç karar: eşle · ayrı kişiler (öneri ve uyarı susar) · elle eklenen kartın adını
     * değiştir (form açılır; ad değişince öneri kendiliğinden kalkar). Vazgeç hiçbir karar değildir.
     */
    const secim = await this.confirmSvc.choose({
      title: this.t('kadro.esleBaslik'),
      message:
        this.t('kadro.esleMetin', { elle: s.poolCard.input.name, kendi: s.ownedCard.input.name }) +
        ' ' +
        this.t('kadro.esleSecenek'),
      confirmLabel: this.t('kadro.kartlariEsle'),
      extras: [
        { id: 'ayri', label: this.t('kadro.ayriKisiler') },
        { id: 'ad', label: this.t('kadro.adiniDegistir') },
      ],
    });
    if (secim === 'ayri') {
      this.matchSvc.dismiss(s);
      this.notices.success(this.t('kadro.ayriKaydedildi'));
      return;
    }
    if (secim === 'ad') {
      this.store.startEditing(s.poolCard.id);
      return;
    }
    if (secim !== 'onay') return;
    if (await this.matchSvc.link(s)) {
      this.notices.success(this.t('kullanici.eslendi', { ad: s.ownedCard.input.name }));
    } else {
      this.notices.error(this.matchSvc.error() ?? this.t('kadro.ayniAd'));
    }
  }

  protected isJoined(player: Player): boolean {
    return this.joinedIds().has(player.id);
  }

  protected readonly search = signal('');

  private readonly filtered = computed(() => {
    // Aksana duyarsız arama: "dogan" da "DOĞAN" da "Doğan"ı bulur (bkz. trFold).
    const query = trFold(this.search());
    // Eşlenmiş takma ad kartları havuzda gösterilmez (aynı kişi iki kez çıkıyordu).
    return this.repo
      .poolPlayers()
      .filter((p) => !query || trFold(p.input.name).includes(query))
      .sort((a, b) => a.input.name.localeCompare(b.input.name, 'tr'));
  });

  protected readonly squadMembers = computed<Player[]>(() => {
    return this.filtered().filter((p) => this.store.isInSquad(p.id));
  });

  protected readonly poolRest = computed<Player[]>(() => {
    return this.filtered().filter((p) => !this.store.isInSquad(p.id));
  });

  protected readonly isEmpty = computed(() => this.repo.poolPlayers().length === 0);

  onSearchInput(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  /**
   * Kartta basılacak isim: kadroda soyadı çakışanlar için "H. DOĞAN" gibi ayırt edici
   * etiket (bkz. SquadStore.nameLabels). Havuzdaki, kadroda olmayan oyuncular için etiket
   * yok — onlar sade soyadıyla görünür.
   */
  protected nameLabel(player: Player): string | null {
    return this.store.nameLabels().get(player.id) ?? null;
  }

  /**
   * Aramaya uyan ve KADRODA olan oyuncular. Arama yalnızca havuzu tarıyordu; "dogan" yazınca
   * kadroda üç Doğan olmasına rağmen "kadro dışında oyuncu yok" çıkıyordu (Tur 5 · E9).
   * Yalnızca arama yapılırken gösterilir — boş aramada kadro zaten orta kolonda duruyor.
   */
  protected readonly squadMatches = computed<Player[]>(() => {
    if (!this.search().trim()) return [];
    return this.filtered().filter((p) => this.store.isInSquad(p.id));
  });

  /** Liste satırındaki avatarın rengi — oyuncunun kart tier'ından gelir. */
  protected tierColor(player: Player): string {
    return TIER_SOLID_COLOR[player.ratings.tier];
  }

  /**
   * Avatarın harf rengi de tier'dan gelir. Sabit koyu mürekkep, gradyanlar aydınlatıldıktan
   * sonra açık tier'larda doğru ama `special` (koyu mor) üstünde koyu-üstüne-koyu kalıyordu.
   */
  protected tierInk(player: Player): string {
    return TIER_TEXT_COLOR[player.ratings.tier];
  }

  /** Fotoğrafı olmayan oyuncu için avatar harfi. */
  protected initial(player: Player): string {
    return trUpper(player.input.name.trim().charAt(0) || '?');
  }

  async toggle(id: string, currentlyInSquad: boolean): Promise<void> {
    if (currentlyInSquad) {
      const ad = this.store.players().find((p) => p.id === id)?.input.name ?? '';
      const ok = await this.confirmSvc.ask({
        title: this.t('onay.cikarBaslik'),
        message: this.t('onay.cikarMetin', { ad }),
        confirmLabel: this.t('onay.cikarDugme'),
        danger: true,
      });
      if (ok) this.store.removePlayer(id);
    } else {
      if (this.store.atCapacity()) return; // "formattan fazla oyuncu seçilemez"
      this.store.addExistingPlayer(id);
    }
  }

  edit(id: string, event: Event): void {
    event.stopPropagation();
    this.store.startEditing(id);
  }

  addNew(): void {
    this.store.startCreating();
  }

 

 

}
