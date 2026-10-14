import { ConfirmService } from '../../core/services/confirm.service';
import { SquadUsersComponent } from './squad-users/squad-users.component';
import { SquadInviteService } from '../../core/services/squad-invite.service';
import { CardMatchService } from '../../core/services/card-match.service';
import { ActiveTeamService } from '../../core/services/active-team.service';
import { PlayerFormService } from '../../core/services/player-form.service';
import { ChangeDetectionStrategy, Component, computed, inject, signal, DestroyRef, NgZone } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Player, PlayerPosition } from '../../core/models/player.model';
import { RatingTableRow } from '../../core/models/rating-table.model';
import { PlayerRepositoryService } from '../../core/services/player-repository.service';
import { SquadStore } from '../../core/services/squad-store.service';
import { trFold } from '../../core/utils/turkish-text';
import { AppButtonComponent } from '../../shared/components/app-button/app-button.component';
import { ErrorBannerComponent } from '../../shared/components/error-banner/error-banner.component';
import { RatingTableComponent } from '../../shared/components/rating-table/rating-table.component';
import { PlayerFormDialogComponent } from '../../shared/components/player-form-dialog/player-form-dialog.component';
import { MatchSettingsComponent } from './match-settings/match-settings.component';
import { SquadIdentityComponent } from './squad-identity/squad-identity.component';
import { CardMatchPanelComponent } from './card-match/card-match-panel.component';
import { PlayerCardComponent } from '../../shared/components/player-card/player-card.component';
import { SquadListComponent } from './squad-list/squad-list.component';
import { I18nService } from '../../core/services/i18n.service';
import { OYUN_DICTIONARIES } from '../../core/i18n/oyun-dictionary';

type BuilderTab = 'kart' | 'liste' | 'kullanicilar';

@Component({
    selector: 'app-squad-builder',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, 
        MatchSettingsComponent,
        SquadIdentityComponent,
        CardMatchPanelComponent,
        SquadListComponent,
        AppButtonComponent,
        RatingTableComponent,
        ErrorBannerComponent,
        PlayerFormDialogComponent,
        PlayerCardComponent,
        SquadUsersComponent,
    ],
    templateUrl: './squad-builder.component.html',
    styleUrl: './squad-builder.component.scss'
})
export class SquadBuilderComponent {
  private readonly i18n = inject(I18nService);
  /** Sözlük ekranla birlikte yükleniyor (giriş paketi şişmesin). */
  protected readonly t = this.i18n.t;

  protected readonly store = inject(SquadStore);

  private readonly playerForm = inject(PlayerFormService);
  private readonly repo = inject(PlayerRepositoryService);
  private readonly router = inject(Router);

  protected readonly tab = signal<BuilderTab>('kart');
  /** "Kaydedilmemiş değişiklikler gidecek" onayı açık mı. */

  protected readonly statusText = computed(() => {
    const missing = this.store.missingCount();
    const excess = this.store.excessCount();
    if (missing > 0) return `${missing} oyuncu daha`;
    if (excess > 0) return this.t('kadro.fazlaKisa', { sayi: excess });

    // Kadro tamamken metin YOK: "Kuraya geç" düğmesinin aktifleşmesi zaten bunu söylüyor
    // (kullanıcı isteği — alt şeritte duran "Kadro tamam" fazlalıktı).
    return '';
  });

  /**
   * Liste görünümü artık HAVUZUN TAMAMINI gösterir, sadece kadroyu değil (kontrol raporu B3):
   * Kart'tan Liste'ye geçmek yetenek kaybı olmamalı. "Durum" sütunu ve satır içi ekle/çıkar
   * butonu `showSquadActions` ile açılıyor. Kura henüz oynanmadığı için takım sütunu boş.
   */
  protected readonly ratingRows = computed<RatingTableRow[]>(() => {
    const query = trFold(this.listSearch());
    // poolPlayers: eşlenmiş (artık başka kartın takma adı olan) satırlar listede YOK — yoksa
    // aynı kişi iki kez çıkıyor, eski kart "Kadroda", gerçek kartı "Havuzda" görünüyordu.
    return this.repo
      .poolPlayers()
      .filter((player) => !query || trFold(player.input.name).includes(query))
      .map((player) => ({
        player,
        teamName: '—',
        teamColor: '#6a6a72',
        inSquad: this.store.isInSquad(player.id),
      }));
  });

  /** Liste görünümünün kendi arama kutusu — Kart görünümündekiyle aynı işi görür. */
  protected readonly listSearch = signal('');

  onListSearch(event: Event): void {
    this.listSearch.set((event.target as HTMLInputElement).value);
  }

  addNewFromList(): void {
    this.store.startCreating();
  }

  /** Tablodaki satır içi ekle/çıkar — Kart görünümündeki tıklamayla aynı kural. */
  toggleSquad(playerId: string): void {
    if (this.store.isInSquad(playerId)) {
      void this.removeFromSquad(playerId);
      return;
    }
    this.store.addExistingPlayer(playerId);
  }

  /** Kilitli "Kuraya geç" butonunun tooltip'i — neden basılamadığını açıklar. */
  protected readonly drawBlockedReason = computed<string | null>(() => {
    // Kura üyeye de açık (kadro doluysa): sonuç cihaza yazılır, kadroyu değiştirmez.
    if (this.store.isSquadComplete()) return null;
    const missing = this.store.missingCount();
    if (missing > 0) {
      const format = this.store.format();
      return this.t('kadro.kuraEksik', { gerek: format * 2, eksik: missing });
    }
    return this.t('kadro.fazlaUzun', { sayi: this.store.excessCount() });
  });

  /**
   * Denge önizlemesinin tek satırlık özeti (kontrol raporu Ö1). Kullanıcı kuraya geçmeden
   * kadronun dengelenebilir olup olmadığını görür — "amaç dengeli kadro kurmak" hedefinin
   * ekrandaki doğrudan karşılığı.
   */
  protected readonly previewText = computed<string | null>(() => {
    const preview = this.store.balancePreview();
    if (!preview) {
      // Kadro eksikken şerit tamamen kaybolmasın: kaç kişi gerektiği ve hangi hatların
      // hazır olduğu görünsün (Tur 3 · A17).
      const missing = this.store.missingCount();
      if (!missing) return null;
      const c = this.store.lineCounts();
      return this.t('kadro.onizlemeEksik', { eksik: missing, KAL: c.KAL, DEF: c.DEF, OS: c.OS, FOR: c.FOR });
    }
    // Türkçe ondalık ayırıcı virgüldür (Tur 3 · A16).
    const gap = this.t('kadro.puanFark', { fark: preview.ratingGap.toFixed(1).replace('.', ',') });
    const keeper =
      preview.keeperCount === 0
        ? this.t('kadro.onizlemeKaleciYok')
        : preview.keeperCount === 1
          ? this.t('kadro.onizlemeKaleciTek')
          : this.t('kadro.onizlemeKaleci', { sayi: preview.keeperCount });
    const { KAL, DEF, OS, FOR } = preview.counts;
    return this.t('kadro.onizlemeTam', { fark: gap, kaleci: keeper, KAL, DEF, OS, FOR });
  });

  /** Kura hep aynı sonucu verecekse kullanıcı bunu önceden bilsin. */
  protected readonly previewSingleSplit = computed(() => (this.store.balancePreview()?.fairAlternatives ?? 2) <= 1);

  /**
   * Dar ekranda orta/sağ kolon sekmeye dönüşür (Tur 4 · Bölüm 4.4). `narrow` bir medya
   * sorgusuna canlı bağlı: CSS ile `display:none` vermek yetmez, çünkü `hidden` ile
   * gizlenen kolon aynı zamanda erişilebilirlik ağacından da çıkmalı.
   */
  protected readonly benchTab = signal<'kadro' | 'havuz'>('kadro');
  protected readonly narrow = signal(typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches);

  setBenchTab(tab: 'kadro' | 'havuz'): void {
    this.benchTab.set(tab);
  }

  /** "Neden dengeli?" açıklaması açık mı. */
  protected readonly whyOpen = signal(false);

  /**
   * Sol kolondaki denge paneli (Tur 4 · Bölüm 4). Ayrı bir kaleci uyarı bandı yerine burada
   * tek satır: kadro tamamlanmadan da bilgi verir, ekranın üstünde 41px'lik bant tutmaz.
   */
  protected readonly balance = computed(() => {
    const preview = this.store.balancePreview();
    const counts = this.store.lineCounts();
    const keeperCount = this.store.keeperCount();
    const maxCount = Math.max(1, ...Object.values(counts));
    const gap = preview?.ratingGap ?? null;

    return {
      // ± yalnızca kadro tamken hesaplanabilir (kura ancak o zaman çekilebiliyor); ama hat
      // çubukları, kaleci satırı ve dağılım kadro eksikken de gösteriliyor — hat dağılımına
      // en çok o an ihtiyaç var (Tur 5 · E6).
      // Kadro eksikken bile eldeki oyuncularla ÖNGÖRÜLEN fark hesaplanıyor: panelin en büyük
      // tipografik öğesi anlamsız bir tire olarak durmasın (Tur 5 · R3).
      /*
       * Kura adil banttan RASTGELE seçer; tek bir sayı yazmak vaat olurdu. Bant birden fazla
       * farka açıksa aralık yazılıyor ("0,1 – 1,0"), yoksa tek sayı kalıyor.
       */
      gapText: (() => {
        const tek = (gap ?? this.store.projectedGap()).toFixed(1).replace('.', ',');
        const aralik = preview?.gapRange;
        if (!aralik || aralik.max - aralik.min < 0.05) return tek;
        return `${aralik.min.toFixed(1).replace('.', ',')} – ${aralik.max.toFixed(1).replace('.', ',')}`;
      })(),
      level: (gap ?? this.store.projectedGap()) <= 0.5 ? 'good' : (gap ?? this.store.projectedGap()) <= 1.5 ? 'ok' : 'bad',
      preview: gap === null,
      previewNote: this.t('kadro.ongoru', { sayi: this.store.players().length }),
      // Hat kotası kaldırıldı: "eksik hat" diye bir şey yok, yalnızca kaç kişi gerektiği var.
      missingNote: null,
      spreadA: preview ? preview.spread.A.toFixed(1).replace('.', ',') : null,
      spreadB: preview ? preview.spread.B.toFixed(1).replace('.', ',') : null,
      winText: preview
        ? this.t('saha.kazanma', {
            a: Math.round(preview.winChance.A * 100),
            b: 100 - Math.round(preview.winChance.A * 100),
          })
        : null,
      formText: this.playerForm.scoredMatches()
        ? this.t('saha.formNotu', { sayi: this.playerForm.scoredMatches() })
        : null,
      keeperWarn: keeperCount < 2,
      keeperText:
        keeperCount === 0
          ? this.t('kadro.kaleciYok')
          : keeperCount === 1
            ? this.t('kadro.kaleciTek')
            : `Kaleci: ${keeperCount}`,
      // Hat şeridi yalnızca DAĞILIMI gösterir: kota yok, "eksik" yok (kullanıcı isteği).
      lines: (['KAL', 'DEF', 'OS', 'FOR'] as PlayerPosition[]).map((position) => ({
        label: this.t('poz.' + position),
        count: counts[position],
        fill: (counts[position] / maxCount) * 100,
      })),
      fairAlternatives: preview?.fairAlternatives ?? null,
      // Ekranın en boş yeri tam da dengenin görselleştirileceği yerdi (Tur 7 · B3): iki takımın
      // öngörülen ortalaması yan yana iki çubuk. Zaten hesaplanıyordu, yalnızca gösterilmiyordu.
      teams: this.store.projectedTeams(),
    };
  });


  toggleWhy(): void {
    this.whyOpen.update((v) => !v);
  }

  /**
   * Bu yuva, format için FAZLA olan oyunculardan biri mi. "2 oyuncu fazla" deniyordu ama
   * hangileri olduğu hiçbir yerde yazmıyordu (Tur 5 · E7); kadroya en son eklenenler fazla
   * sayılır ve kartta işaretlenir.
   */
  isExcess(index: number): boolean {
    return index >= this.store.requiredPlayerCount();
  }

  /** Yuvadaki oyuncuyu düzenlemeye açar. */
  editPlayer(id: string): void {
    this.store.startEditing(id);
  }

  /** Yuvadaki oyuncuyu kadrodan çıkarır (havuzda kalır) — önce onay ister. */
  async removeFromSquad(id: string): Promise<void> {
    const ad = this.store.players().find((p) => p.id === id)?.input.name ?? '';
    const ok = await this.confirmSvc.ask({
      title: this.t('onay.cikarBaslik'),
      message: this.t('onay.cikarMetin', { ad }),
      confirmLabel: this.t('onay.cikarDugme'),
      danger: true,
    });
    if (ok) this.store.removePlayer(id);
  }

  /** Kartta basılacak ayırt edici isim (soyadı çakışanlar için "H. DOĞAN"). */
  nameLabel(player: Player): string | null {
    return this.store.nameLabels().get(player.id) ?? null;
  }

  private readonly invitesForUsers = inject(SquadInviteService);
  private readonly confirmSvc = inject(ConfirmService);
  private readonly cardMatchForUsers = inject(CardMatchService);
  private readonly activeTeamForUsers = inject(ActiveTeamService);

  /**
   * Kullanıcılar sekmesinin rozeti: takıma katılan üyelerin kartlarıyla AYNI ADI taşıyan,
   * eşlenmeyi bekleyen havuz kartı sayısı. Yalnızca kadroyu yönetenler (kurucu/yönetici) görür:
   * eşleme onların işi. Üye katıldığında kurucunun ekranında uyarı buradan çıkar.
   */
  protected readonly pendingMatches = computed(() => {
    if (!this.store.canEditSquad()) return 0;
    const teamId = this.activeTeamForUsers.teamId();
    if (!teamId) return 0;
    const ids = new Set(
      this.invitesForUsers
        .members()
        .filter((m) => m.squadId === teamId && m.playerId)
        .map((m) => m.playerId as string),
    );
    return this.cardMatchForUsers.forOwnedCards(ids).length;
  });

  constructor() {
    this.i18n.register(OYUN_DICTIONARIES);
    // Rol tazelensin: kurucu başka bir cihazdan yönetici yetkisi verdiyse ekran açılınca görünsün.
    void this.invitesForUsers.loadMyTeams();
    if (typeof window !== 'undefined') {
      const query = window.matchMedia('(max-width: 900px)');
      const sync = (e: MediaQueryListEvent | MediaQueryList) => this.narrow.set(e.matches);
      query.addEventListener('change', sync);
      inject(DestroyRef).onDestroy(() => query.removeEventListener('change', sync));
      this.uyeleriIzle();
    }
  }

  /**
   * KATILANLAR CANLI GÖRÜNSÜN (11 Ekim 2026, uçtan uca testte bulundu). Kurucu kodu paylaşıp bu
   * ekranda beklerken koda katılanlar, sayfa yenilenene kadar ne Kullanıcılar sekmesinde ne de
   * havuzda görünüyordu: katılmak kartın GÖRÜNÜRLÜĞÜNÜ sunucuda değiştiriyor, satırın kendisi
   * değişmediği için canlı akış bunu bildirmiyor. Ekran açıkken açık takımın üyeleri 15 saniyede
   * bir ve sekmeye her dönüşte yoklanır; değiştiyse havuz da tazelenir (yeni kart + eşleme
   * önerisi kendiliğinden belirir). Sekmeye dönüşte roller de tazelenir (yönetici yapıldıysan).
   * Yoklama Angular bölgesinin DIŞINDA (uygulama "kararsız" kalmasın) ve sekme gizliyken susar.
   */
  private uyeleriIzle(): void {
    const zone = inject(NgZone);
    let calisiyor = false;
    const yokla = async (rolleriDe: boolean): Promise<void> => {
      const id = this.activeTeamForUsers.teamId();
      if (!id || calisiyor || document.visibilityState !== 'visible') return;
      calisiyor = true;
      try {
        const degisti = await this.invitesForUsers.refreshMembersIfChanged(id);
        if (degisti) await this.repo.refresh();
        if (rolleriDe) await this.invitesForUsers.loadMyTeams();
      } finally {
        calisiyor = false;
      }
    };
    const gorunurluk = (): void => {
      if (document.visibilityState === 'visible') void yokla(true);
    };
    const zaman = zone.runOutsideAngular(() => setInterval(() => void yokla(false), 15000));
    document.addEventListener('visibilitychange', gorunurluk);
    window.addEventListener('focus', gorunurluk);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(zaman);
      document.removeEventListener('visibilitychange', gorunurluk);
      window.removeEventListener('focus', gorunurluk);
    });
  }

  setTab(tab: BuilderTab): void {
    // Kullanıcılar sekmesi yalnızca kadroyu yönetenlere (kurucu/yönetici) açık; üye yalnızca
    // Kart ve Liste'yi görür. Düğme kilitli ama başka bir yoldan gelinirse de açılmasın.
    if (tab === 'kullanicilar' && !this.store.canEditSquad()) return;
    this.tab.set(tab);
  }

  /** Üst çubuktaki "← Menüye dön": kadro store'da kaldığı için dönüş hiçbir şey silmez. */
  goHome(): void {
    void this.router.navigateByUrl('/');
  }

  goToDraw(): void {
    if (!this.store.computeDraw()) return;
    this.router.navigateByUrl('/draw');
  }
}
