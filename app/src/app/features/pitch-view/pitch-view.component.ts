import { PlayerFormService } from '../../core/services/player-form.service';
import { weakLinkStrength, winProbability } from '../../core/services/balancer.service';
import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal, viewChild, NgZone } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ActiveTeamService } from '../../core/services/active-team.service';
import { Player, PlayerPosition } from '../../core/models/player.model';
import { PitchSlot } from '../../core/models/pitch.model';
import { MatchDetails } from '../../core/models/match-details.model';
import { RatingTableRow } from '../../core/models/rating-table.model';
import { TeamSide } from '../../core/models/team.model';
import { MatchHistoryService, MatchRecordPlayer } from '../../core/services/match-history.service';
import { PitchExportService } from '../../core/services/pitch-export.service';
import { KeeperRotationPlan } from '../../core/models/keeper-rotation.model';
import { KeeperRotationService } from '../../core/services/keeper-rotation.service';
import { FormationLines, PitchService } from '../../core/services/pitch.service';
import { SquadStore } from '../../core/services/squad-store.service';
import { RatingTableComponent } from '../../shared/components/rating-table/rating-table.component';
import { ExportDialogComponent } from './export-dialog/export-dialog.component';
import { TeamLineupCardComponent } from '../../shared/components/team-lineup-card/team-lineup-card.component';
import { I18nService, ondalik } from '../../core/services/i18n.service';
import { OYUN_DICTIONARIES } from '../../core/i18n/oyun-dictionary';

type ViewTab = 'saha' | 'liste';

/** Alt şeritteki bir hat satırı; `level` fark eşiğine göre renk verir. */
interface LineRow {
  label: string;
  a: number | null;
  b: number | null;
  gap: number | null;
  level: 'balanced' | 'ok' | 'off' | 'unknown';
}

@Component({
    selector: 'app-pitch-view',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, TeamLineupCardComponent, RatingTableComponent, ExportDialogComponent],
    templateUrl: './pitch-view.component.html',
    styleUrl: './pitch-view.component.scss'
})
export class PitchViewComponent {
  private readonly i18n = inject(I18nService);
  /** Sözlük ekranla birlikte yükleniyor (giriş paketi şişmesin). */
  protected readonly t = this.i18n.t;
  /** Şablonda dile göre tek ondalıklı sayı. */
  protected readonly ondalik = ondalik;

  protected readonly store = inject(SquadStore);

  private readonly playerForm = inject(PlayerFormService);
  private readonly pitchExport = inject(PitchExportService);
  private readonly history = inject(MatchHistoryService);
  private readonly pitchService = inject(PitchService);
  private readonly keeperRotationService = inject(KeeperRotationService);

  /** Kalecisiz takımlar için kale sırası — iki takım için simetrik periyotla üretilir. */
  /** Kartlarda soyadı çakışanları ayırt eden etiketler. */
  protected readonly nameLabels = computed<Record<string, string>>(() => Object.fromEntries(this.store.nameLabels()));

  protected readonly rotationPlan = computed<KeeperRotationPlan>(() =>
    this.keeperRotationService.buildPlan(this.store.teamAPlayers(), this.store.teamBPlayers()),
  );
  private readonly router = inject(Router);
  private readonly activeTeam = inject(ActiveTeamService);

  protected readonly tab = signal<ViewTab>('saha');
  protected readonly exportError = signal<string | null>(null);
  protected readonly exporting = signal(false);
  /** "İndir" popup'ı açık mı — maç bilgisi (saha/tarih/saat) burada sorulur. */
  protected readonly exportDialogOpen = signal(false);
  /**
   * "Kurayı yenile" geri alınamaz (mevcut takımlar gider ve tören sıfırdan başlar), bu
   * yüzden tek tıkla çalışmaz: buton önce onay ister. Tarayıcının `confirm()` kutusu
   * yerine satır içi onay — uygulamanın koyu temasıyla uyumlu (bkz. giriş formundaki
   * aynı gerekçe).
   */
  protected readonly confirmingRedraw = signal(false);
  /** "Kurayı yenile" sonucu değiştiremediyse gösterilen bilgi metni. */
  protected readonly redrawNotice = signal<string | null>(null);

  /**
   * Kartların seçili dizilişi. Kartlar dizilişi kendi içlerinde tutuyor ama alt bardaki
   * hat ortalamalarının sahadaki gerçek yerleşimle aynı olması gerekiyor; `viewChild`
   * yerine çıktıyla (`formationChanged`) yukarı taşınıyor, çünkü `viewChild` ilk
   * render sırasında henüz çözülmemiş olabiliyor. null = kartın varsayılan dizilişi.
   */
  protected readonly formationA = signal<FormationLines | null>(null);
  protected readonly formationB = signal<FormationLines | null>(null);

  /** Sahada takas için seçilmiş ilk oyuncu — iki kart arasında paylaşılır. */
  protected readonly selection = signal<{ id: string; side: TeamSide } | null>(null);
  /**
   * Takas modu: seçili oyuncunun üstündeki ⇄'ye basılmış, sıra KARŞI kadrodan birini
   * seçmekte. Bu moddayken karşı kartın oyuncuları yanıp söner.
   */
  protected readonly swapMode = signal(false);

  /**
   * Seçili oyuncunun kendisi + hangi takımda olduğu. Eylem şeridi bunu okur: sahada bir
   * oyuncuya tıklamak artık yalnızca "takas için işaretle" değil, üç eylemin (takas, düzenle,
   * çıkar) kapısı. Önceden takas iki tıkla yapılıyordu ama bunu söyleyen hiçbir şey yoktu.
   */
  protected readonly selected = computed(() => {
    const sel = this.selection();
    if (!sel) return null;
    const player = this.store.players().find((p) => p.id === sel.id);
    if (!player) return null;
    const team = this.store.teams()[sel.side === 'A' ? 0 : 1];
    const other = this.store.teams()[sel.side === 'A' ? 1 : 0];
    return { player, side: sel.side, team, otherTeam: other };
  });

  private readonly cardA = viewChild.required<TeamLineupCardComponent>('cardA');
  private readonly cardB = viewChild.required<TeamLineupCardComponent>('cardB');

  protected readonly ratingRows = computed<RatingTableRow[]>(() => {
    const [teamA, teamB] = this.store.teams();
    const teamOf = this.store.teamOfMap();
    return this.store.players().map((player) => {
      const side = teamOf[player.id];
      const team = side === 'A' ? teamA : side === 'B' ? teamB : null;
      return { player, teamName: team?.name ?? '—', teamColor: team?.color ?? '#6a6a72' };
    });
  });

  protected readonly comparison = computed(() => {
    const teamA = this.store.teamAPlayers();
    const teamB = this.store.teamBPlayers();
    // Ortalama ve kazanma ihtimali KURANIN gördüğü reytingle (kart + skorlardan form): kura
    // onu dengeledi; kart reytingiyle göstermek, dengelenmemiş bir fark gösterirdi.
    const eff = (p: Player): number => this.playerForm.effectiveOverall(p);
    const avg = (list: Player[]): number => (list.length ? list.reduce((s, p) => s + eff(p), 0) / list.length : 0);
    // Takımda o hatta (ör. orta saha) hiç oyuncu yoksa "0" değil "–" gösterilir — "0" o
    // hattın reytinginin berbat olduğu gibi okunabilir, hâlbuki sadece veri yok demek
    // (bkz. kullanıcı geri bildirimi: canlıda "ORTA SAHA 0 - 69" gibi yanıltıcı bir satır gözlendi).
    // Hat ortalaması oyuncunun KENDİ mevkisine göre değil, sahada FİİLEN durduğu yuvaya
    // göre hesaplanır. Aksi hâlde alt bar "ORTA SAHA –" derken sahadaki orta saha yuvasında
    // iki oyuncu duruyordu (kullanıcı geri bildirimi) — ikisi de aynı yerleşimi okusun diye
    // `PitchService.assignSlots` tek kaynak.
    const lineAvg = (slots: PitchSlot[], position: PlayerPosition): number | null => {
      const g = slots.filter((s) => s.player && s.mevki === position).map((s) => s.player as Player);
      return g.length ? Math.round(g.reduce((s, p) => s + p.ratings.overall, 0) / g.length) : null;
    };
    const format = this.store.format();
    const slotsA = this.pitchService.assignSlots(format, 'A', teamA, this.formationA() ?? undefined);
    const slotsB = this.pitchService.assignSlots(format, 'B', teamB, this.formationB() ?? undefined);
    const avgA = avg(teamA);
    const avgB = avg(teamB);
    const diff = Math.abs(avgA - avgB);
    // Üç hattın DE farkı söylenir: yalnızca en kötüyü yazmak, diğer ikisinin de 13-14 puan
    // açık olduğunu gizliyordu (Tur 3 · A15).
    const lineGaps = [
      // Etiketler sözlükten (saha.hatDef/Os/For); cümle de sözlükte (saha.hatFarkiCumle). Türkçe
      // hâl ekini kodda üretmek yerine cümle ekten bağımsız kuruldu: "Hat farkı: Defans 7 puan."
      { label: this.t('saha.hatDef'), a: lineAvg(slotsA, 'DEF' as PlayerPosition), b: lineAvg(slotsB, 'DEF' as PlayerPosition) },
      { label: this.t('saha.hatOs'), a: lineAvg(slotsA, 'OS' as PlayerPosition), b: lineAvg(slotsB, 'OS' as PlayerPosition) },
      { label: this.t('saha.hatFor'), a: lineAvg(slotsA, 'FOR' as PlayerPosition), b: lineAvg(slotsB, 'FOR' as PlayerPosition) }]
      .map((l) => ({ ...l, gap: l.a !== null && l.b !== null ? Math.abs(l.a - l.b) : null }))
      .filter((l): l is { label: string; a: number; b: number; gap: number } => l.gap !== null && l.gap > 5)
      .sort((x, y) => y.gap - x.gap);

    const remark =
      diff < 2
        ? this.t('saha.farkEsit', { fark: ondalik(diff) })
        : diff < 6
          ? this.t('saha.farkHafif', { fark: ondalik(diff) })
          : this.t('saha.farkBelirgin', { fark: ondalik(diff) });
    // Çubuk iki takımın PAYINI gösterir, ikisi birlikte tam %100 eder. Önceden her yarı
    // "ortalama / en yüksek ortalama" ile hesaplanıyordu; ikisi de ~%100 çıkıp aynı flex
    // satırında eziliyor, toplam %100'ü aşıyordu (ölçülen %100.046 — kullanıcı geri bildirimi).
    const total = avgA + avgB;
    const shareA = total > 0 ? (avgA / total) * 100 : 50;
    return {
      avgA: ondalik(avgA),
      // VS rozetinin altındaki fark. Takım ADI yazılmıyor (rozetin altında satır taşırıyordu);
      // önde olan taraf metnin RENGİYLE söyleniyor — iki kartın başlıkları zaten o renkte.
      diffText: diff < 0.05 ? this.t('saha.esit') : `+${ondalik(diff)}`,
      diffColor:
        diff < 0.05
          ? null
          : avgA > avgB
            ? this.store.teams()[0].color
            : this.store.teams()[1].color,
      avgB: ondalik(avgB),
      shareA,
      shareB: 100 - shareA,
      lines: [
        this.lineRow(this.t('saha.hatDef'), lineAvg(slotsA, 'DEF'), lineAvg(slotsB, 'DEF')),
        this.lineRow(this.t('saha.hatOs'), lineAvg(slotsA, 'OS'), lineAvg(slotsB, 'OS')),
        this.lineRow(this.t('saha.hatFor'), lineAvg(slotsA, 'FOR'), lineAvg(slotsB, 'FOR')),
      ],
      remark,
      // Ortalama eşitken bile dağılımlar çok farklı olabiliyor; kullanıcı bunu görsün (Tur 4 · Y1).
      spread: this.store.drawResult()?.spread ?? null,
      // Tahmini kazanma ihtimali: elle takastan SONRAKİ kadrolardan hesaplanır (kuranın
      // kaydettiği değer takasla bayatlar). Zayıf halka ağırlıklı güç, bkz. BalancerService.
      win: (() => {
        const a = winProbability(
          weakLinkStrength(teamA.map(eff)),
          weakLinkStrength(teamB.map(eff)),
        );
        const yuzde = Math.round(a * 100);
        return { a: yuzde, b: 100 - yuzde };
      })(),
      formMatches: this.playerForm.scoredMatches(),
      // Ortalamalar eşit olsa bile en kötü hat farkı kullanıcıya tek cümleyle söylenir.
      lineRemark: lineGaps.length
        ? this.t('saha.hatFarkiCumle', { hatlar: lineGaps.map((l) => `${l.label} ${Math.round(l.gap)}`).join(', ') })
        : null,
    };
  });

  /**
   * Alt şeridin tek metin alanı. Öncelik: o an yapılan iş (takas) → uyarı → hat yorumu.
   * Ekranın üstünde ayrı uyarı kutuları vardı; boşken bile yer kaplıyor ve iki ayrı yerde
   * mesaj aramak gerekiyordu.
   */
  protected readonly footnote = computed<string | null>(() => {
    const sel = this.selected();
    if (this.swapMode() && sel) {
      return this.t('saha.takasIpucu', { ad: sel.player.input.name, takim: sel.otherTeam.name });
    }
    // `redrawNotice` burada DEĞİL: o mesaj "Kurayı yenile" düğmesinin yanında duruyor.
    return this.exportError() ?? this.savedNotice() ?? this.comparison().lineRemark;
  });

  protected readonly footnoteKind = computed<'swap' | 'warn' | 'info'>(() => {
    if (this.swapMode() && this.selected()) return 'swap';
    if (this.exportError()) return 'warn';
    // Kayıt onayı da "swap" gibi vurgulu yeşil: olumlu ve geçici bir bildirim.
    if (this.savedNotice()) return 'swap';
    return 'info';
  });

  /** Kaydettikten sonra beliren, birkaç saniye sonra kalkan onay. */
  protected readonly savedNotice = signal<string | null>(null);
  /**
   * Maç bu ekranda kaydedildi mi. Kaydettikten sonra iş bitmiştir; kullanıcı ana menüye dönmek
   * istiyor (kullanıcı isteği, 11 Ekim 2026) — alt şeritte "Ana menüye git" birincil eylem olur,
   * "Kaydet ve indir" ikincile iner (ekranda tek dolu yeşil düğme kuralı).
   */
  protected readonly matchSaved = signal(false);
  /** Kurucu ya da yönetici: kadroyu düzenleyip kurayı yeniden çekebilir (üye yalnızca görür). */
  protected readonly canEdit = computed(() => this.store.canEditSquad());
  private savedTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly zone = inject(NgZone);

  constructor() {
    this.i18n.register(OYUN_DICTIONARIES);
    // Kura sonucu artık localStorage'da saklanıyor (bkz. StorageService.PersistedSquad),
    // ama kadro kayıttan sonra değiştiyse geri yüklenmez; o durumda burada yeniden hesaplanır.
    if (!this.store.drawResult()) this.store.computeDraw();
  }

  /**
   * Bir hat satırı: iki değer + farkın YORUMU. Rapor Ö2'nin tespiti — "82 - 69" gibi bir
   * sayı çifti hangisinin sorun olduğunu söylemiyordu; ortalamalar birebir eşitken hatlar
   * berbat dengesiz olabiliyor ve kullanıcı bunu göremiyordu.
   */
  private lineRow(label: string, a: number | null, b: number | null): LineRow {
    const gap = a !== null && b !== null ? Math.abs(a - b) : null;
    const level: LineRow['level'] = gap === null ? 'unknown' : gap <= 5 ? 'balanced' : gap <= 12 ? 'ok' : 'off';
    return { label, a, b, gap, level };
  }

  setTab(tab: ViewTab): void {
    this.tab.set(tab);
  }

  askRedraw(): void {
    this.confirmingRedraw.set(true);
  }

  cancelRedraw(): void {
    this.confirmingRedraw.set(false);
  }

  redraw(): void {
    this.confirmingRedraw.set(false);
    const before = this.store.drawResult()?.signature;
    const result = this.store.computeDraw();
    // Kura değişmediyse sebebini söyle: kullanıcı sessiz kalan arayüzü bozuk sanıyordu
    // (kontrol raporu B1/öneri 3). "Kurayı yenile" töreni tekrar oynatmaz — Ö4.
    if (result && result.signature === before) {
      this.redrawNotice.set(this.t('saha.baskaBolusumYok'));
      return;
    }
    this.redrawNotice.set(null);
    this.router.navigateByUrl('/draw');
  }

  editSquad(): void {
    this.router.navigateByUrl('/squad');
  }

  goHome(): void {
    void this.router.navigateByUrl('/');
  }

  renameTeam(side: TeamSide, name: string): void {
    this.store.updateTeam(side, { name });
  }

  /**
   * Kart tıklaması — iki farklı takımdan seçim yapılırsa takas ister, aynı takımdan
   * ikinci tıklama seçimi değiştirir, aynı oyuncuya tekrar tıklama seçimi bırakır
   * (bkz. `PitchComponent`'teki aynı mantık — burada iki ayrı kart arasında paylaşılıyor).
   */
  onMarkerClick(playerId: string, side: TeamSide): void {
    const sel = this.selection();
    // Takas modunda karşı kadrodan yapılan tıklama takası TAMAMLAR.
    if (sel && this.swapMode() && side !== sel.side) {
      this.store.swapDrawPlayers(sel.id, playerId);
      this.cancelSwap();
      return;
    }
    if (!sel) {
      this.selection.set({ id: playerId, side });
      return;
    }
    if (sel.id === playerId) {
      this.selection.set(null);
      return;
    }
    if (sel.side === side) {
      this.selection.set({ id: playerId, side });
      return;
    }
    this.store.swapDrawPlayers(sel.id, playerId);
    this.selection.set(null);
  }

  /** Oyuncunun üstündeki ⇄ — takas modunu başlatır, karşı kadro hedefe dönüşür. */
  startSwap(playerId: string, side: TeamSide): void {
    this.selection.set({ id: playerId, side });
    this.swapMode.set(true);
  }

  /** Takas modundan çıkar; seçim de bırakılır (ekranda asılı bir "yarım iş" kalmasın). */
  cancelSwap(): void {
    this.swapMode.set(false);
    this.selection.set(null);
  }

  clearSelection(): void {
    this.swapMode.set(false);
    this.selection.set(null);
  }

  /** Esc seçimi bırakır — takas için tıkladıktan sonra vazgeçmenin klavye yolu. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.store.formOpen()) this.clearSelection();
  }

  /**
   * Boş bir yere tıklamak seçimi bırakır (⇄ düğmesi kaybolur). `pointerdown` dinleniyor,
   * `click` değil: formanın `pointerdown`'ı `preventDefault()` çağırdığı için tarayıcı
   * `click` üretmiyor (bkz. TeamLineupCardComponent). Bir oyuncunun ya da eylem düğmesinin
   * üstündeki tıklama `.marker` içinden geldiği için seçimi bozmaz.
   */
  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    if (!this.selection()) return;
    // `event.target` her zaman Element değil (document'in kendisi olabilir) — `closest`
    // çağrısı o durumda hata fırlatır ve seçim hiç temizlenmezdi.
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.marker')) return;
    this.clearSelection();
  }

  /**
   * Sürükle-bırak ile takas — bir kartın sahasının dışına, karşı karttaki bir oyuncunun
   * üstüne bırakılınca. Taraf çözümü `SquadStore.swapDrawPlayers`'a bırakılıyor: aynı
   * taraftan gelen iki id'yi zaten sessizce yoksayıyor, burada tekrar kontrol gerekmiyor.
   */
  onDragSwap(event: { fromId: string; toId: string }): void {
    this.clearSelection();
    this.store.swapDrawPlayers(event.fromId, event.toId);
  }

  /** "İndir" doğrudan indirmez: önce maç bilgisini sorar (kullanıcı isteği). */
  openExportDialog(): void {
    this.exportError.set(null);
    this.exportDialogOpen.set(true);
  }

  closeExportDialog(): void {
    this.exportDialogOpen.set(false);
  }

  /**
   * Maç ÖNCE kaydedilir, sonra (istenmişse) görsel iner. Eskiden kayıt indirmeye bağlıydı:
   * görsel istemeyen ya da indirme başarısız olan kullanıcının maçı geçmişe hiç düşmüyordu
   * (kullanıcı: "kadro kaydetme butonu yok").
   */
  async confirmExport(event: { details: MatchDetails; download: boolean }): Promise<void> {
    this.exportDialogOpen.set(false);
    this.recordMatch(event.details);
    this.matchSaved.set(true);
    this.savedNotice.set(this.t('saha.kaydedildi'));
    if (this.savedTimer) clearTimeout(this.savedTimer);
    // Onay geçicidir (bkz. eşleme onayı): zamanlayıcı Angular bölgesinin DIŞINDA açılır,
    // yoksa uygulama 5 saniye boyunca "kararsız" kalır ve testler onu bekler.
    this.savedTimer = this.zone.runOutsideAngular(() =>
      setTimeout(() => {
        this.savedNotice.set(null);
        this.savedTimer = null;
      }, 5000),
    );

    if (event.download) await this.downloadLineups(event.details);
  }

  /**
   * Kadro KOPYALANIR, referans tutulmaz: oyuncunun reytingi sonradan değişince geçmişteki
   * maçın dengesi geriye dönük değişmemeli (havuz-referans mimarisinin bilinçli istisnası).
   */
  private snapshotPlayers(players: readonly Player[]): MatchRecordPlayer[] {
    return players.map((p) => ({
      id: p.id,
      name: this.nameLabels()[p.id] ?? p.input.name,
      rating: p.ratings.overall,
      position: p.ratings.position,
    }));
  }

  private recordMatch(details: MatchDetails): void {
    const [teamA, teamB] = this.store.teams();
    const comparison = this.comparison();
    void this.history.add({
      squadId: this.activeTeam.teamId(),
      kickoff: details.kickoff,
      venue: details.venue.trim(),
      format: this.store.format(),
      teamA: {
        name: teamA.name,
        color: teamA.color,
        logoImage: teamA.logoImage,
        avg: comparison.avgA,
        playerCount: this.store.teamAPlayers().length,
        players: this.snapshotPlayers(this.store.teamAPlayers()),
      },
      teamB: {
        name: teamB.name,
        color: teamB.color,
        logoImage: teamB.logoImage,
        avg: comparison.avgB,
        playerCount: this.store.teamBPlayers().length,
        players: this.snapshotPlayers(this.store.teamBPlayers()),
      },
    });
  }

  /** Tek, birleşik indirme — iki kart da aynı görselde yan yana çıkar (bkz. kullanıcı isteği). */
  async downloadLineups(details: MatchDetails | null = null): Promise<boolean> {
    this.exporting.set(true);
    this.exportError.set(null);
    const [teamA, teamB] = this.store.teams();
    const ok = await this.pitchExport.exportLineups(
      teamA,
      this.store.teamAPlayers(),
      this.cardA().currentFormationLines(),
      this.cardA().currentShowRating(),
      teamB,
      this.store.teamBPlayers(),
      this.cardB().currentFormationLines(),
      this.cardB().currentShowRating(),
      this.store.format(),
      'saha42-kadro.png',
      this.rotationPlan(),
      details,
      // Ekranda basılan ayırt edici isimler PNG'de de basılsın (aynı soyadlılar).
      this.nameLabels(),
    );
    this.exporting.set(false);
    if (!ok) this.exportError.set(this.t('saha.indirilemedi'));
    return ok;
  }
}
