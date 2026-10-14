import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { UserScopeService } from './user-scope.service';
import { SquadInviteService } from './squad-invite.service';
import { MatchRemoteService, matchKey } from './match-remote.service';
import { NoticeService } from './notice.service';
import { mesaj } from './i18n.service';

const STORAGE_KEY = 'saha42.history.v1';
/** CİHAZDA tutulan en fazla maç sayısı (sunucudaki geçmişin sınırı yok, bkz. MatchRemoteService). */
const MAX_RECORDS = 12;

/** Ana menüdeki kartlarda gösterilen tek bir maç kaydı. */
export interface MatchRecord {
  /** Sunucudaki kayıtta satırın kimliği (uuid); cihazdaki kayıtta "vakit|saha" anahtarı. */
  id: string;
  /** "Aynı maç" anahtarı (`matchKey`): vakit + saha. Sunucu kaydında dolu. */
  key?: string;
  /** Kayıt takımın ORTAK geçmişinde mi (sunucu), yoksa yalnızca bu cihazda mı. */
  remote?: boolean;
  /** Kaydın oluşturulma anı (ISO) — sıralama için. */
  savedAt: string;
  /** Başlama vakti, `yyyy-MM-ddTHH:mm` (bkz. MatchDetails.kickoff). */
  kickoff: string;
  venue: string;
  format: number;
  /**
   * Maçın kaydedildiği TAKIM (11 Ekim 2026). Kayıtlar takım bilgisi taşımadığı için takımdan
   * ayrılan, takımı silinen ya da hiç takımı kalmayan kullanıcı menüde hâlâ "Sıradaki maç"
   * görüyordu. Eski kayıtlarda yok; onlar kullanıcının en az bir takımı varsa gösterilir.
   */
  squadId?: string | null;
  teamA: MatchRecordTeam;
  teamB: MatchRecordTeam;
  /**
   * Maç sonucu. Kayıt maç OYNANMADAN (görsel indirilirken) açıldığı için başta yoktur;
   * kullanıcı sonradan girer. Denge analizi bunun üzerine kuruluyor.
   */
  score?: MatchScore;
}

export interface MatchScore {
  a: number;
  b: number;
  /** Skorun girildiği an (ISO) — "yeni girilen" kayıtları ayırt etmek için. */
  enteredAt: string;
}

/** Kayıt anındaki kadro üyesi — kart sonradan değişse bile maçın kimlerle oynandığı sabit kalır. */
export interface MatchRecordPlayer {
  id: string;
  name: string;
  rating: number;
  position: string;
}

export interface MatchRecordTeam {
  name: string;
  color: string;
  /** Kulüp arması (uzak URL ya da data URL) — yoksa baş harfler gösterilir. */
  logoImage: string | null;
  /** Takım ortalaması, bir ondalık basamak. */
  avg: string;
  playerCount: number;
  /**
   * O maçta sahaya çıkan kadro. Kayıt anında KOPYALANIR (havuzdaki karta referans değil):
   * oyuncunun reytingi sonradan değişince geçmiş maçın dengesi değişmiş görünmemeli.
   * Eski kayıtlarda yok — arayüz boş listeyi "kadro kaydedilmemiş" olarak gösterir.
   */
  players?: MatchRecordPlayer[];
}

/**
 * Oynanan/planlanan maçların geçmişi. Ana menüdeki "Sıradaki maç" / "Son maç" kutularını,
 * Takım Geçmişi'ni ve skorlardan form düzeltmesini (`PlayerFormService`) besler.
 *
 * TAKIMIN ORTAK VERİSİ (12 Ekim 2026): maçlar `public.matches`'te (bkz. MatchRemoteService).
 * Eskiden yalnızca o telefonun localStorage'ındaydı; kaptan skoru kendi telefonuna girince form
 * düzeltmesi yalnızca onun cihazında çalışıyor, takımın geri kalanının kurası bunu görmüyordu.
 *
 * - Okuma: takımın herkesi. Yazma (maç kaydı, skor, silme): yalnızca kurucu ve yönetici —
 *   skor kartları düzelttiği için üye kendi lehine skor yazamaz (sunucu RLS'i de zorlar).
 * - Cihazda kalanlar: sunucu tablosu kurulmamışsa her şey; aksi hâlde yalnızca sunucuya
 *   taşınamayan eski kayıtlar ve üyenin kendi cihazına aldığı maçlar. Yetkili kullanıcının
 *   cihazındaki eski kayıtlar ilk açılışta BİR KEZ sunucuya taşınır (`tasi`).
 */
@Injectable({ providedIn: 'root' })
export class MatchHistoryService {
  private readonly scope = inject(UserScopeService);
  private readonly invites = inject(SquadInviteService);
  private readonly remote = inject(MatchRemoteService);
  private readonly notice = inject(NoticeService);
  /** Cihazdaki kayıtlar (kullanıcıya özel anahtar). */
  private readonly records = signal<MatchRecord[]>(readStored(this.scope.key(STORAGE_KEY)));
  /** Sunucudaki kayıtlar (kullanıcının takımlarının maçları). */
  private readonly server = signal<MatchRecord[]>([]);
  /** Sunucu listesi HANGİ takım kümesi için okundu (imza); takımlar değişince yeniden okunur. */
  private readonly serverFor = signal<string | null>(null);
  /** `public.matches` henüz kurulmamış: davranış eskisi gibi tamamen cihazda. */
  private readonly serverMissing = signal(false);

  constructor() {
    /*
     * Geçmiş KULLANICIYA aittir. Aynı tarayıcıda ikinci hesapla giren kullanıcı öncekinin
     * maçlarını görüyordu ("Sıradaki maç" kutusu dolu geliyordu). Hesap değişince liste
     * yeniden okunur.
     */
    effect(() => {
      this.scope.userId();
      this.scope.revision();
      this.records.set(readStored(this.scope.key(STORAGE_KEY)));
      this.server.set([]);
      this.serverFor.set(null);
    });

    // Takım listesi gelince (ve değişince) o takımların maçları sunucudan okunur.
    effect(() => {
      if (!this.invites.teamsLoaded()) return;
      const ids = this.invites.myTeams().map((t) => t.squad.id).sort();
      const imza = ids.join(',');
      if (imza === this.serverFor()) return;
      this.serverFor.set(imza);
      void this.yukle(ids, imza);
    });
  }

  /** Sunucudaki geçmişi yeniden okur (menü açılırken: başkasının girdiği skor görünsün). */
  refresh(): void {
    if (!this.invites.teamsLoaded()) return;
    const ids = this.invites.myTeams().map((t) => t.squad.id).sort();
    void this.yukle(ids, ids.join(','));
  }

  private async yukle(ids: string[], imza: string): Promise<void> {
    if (!ids.length) {
      this.server.set([]);
      return;
    }
    const sonuc = await this.remote.list(ids);
    if (this.serverFor() !== imza) return; // bu arada takımlar değişti: bayat cevap
    if (sonuc.kind === 'missing') {
      this.serverMissing.set(true);
      return;
    }
    if (sonuc.kind === 'error') return; // eldeki liste korunur; sonraki açılışta yeniden denenir
    this.serverMissing.set(false);
    this.server.set(sonuc.records);
    await this.tasi();
  }

  /** Takımda kayıt/skor yazma yetkisi: kurucu ya da yönetici. */
  canManage(squadId: string | null | undefined): boolean {
    if (!squadId) return false;
    const team = this.invites.myTeams().find((t) => t.squad.id === squadId);
    return !!team && team.role !== 'uye';
  }

  /** Bu kaydın skoru bu kullanıcı tarafından girilebilir mi. Cihazdaki kayıt her zaman. */
  canScore(record: MatchRecord): boolean {
    return !record.remote || this.canManage(record.squadId);
  }

  /**
   * Cihazdaki eski kayıtları takımın ortak geçmişine BİR KEZ taşır — yalnızca kullanıcının
   * yönettiği takımlarınkini (üye kendi cihazındaki kaydı ortak geçmişe yazamaz). Takım bilgisi
   * olmayan çok eski kayıtlar, kullanıcının yönettiği TEK takım varsa ona sayılır. Taşınan kayıt
   * cihazdan silinir; taşınamayan cihazda kalır ve görünmeye devam eder.
   */
  private async tasi(): Promise<void> {
    const yonetilen = this.invites.myTeams().filter((t) => t.role !== 'uye').map((t) => t.squad.id);
    if (!yonetilen.length || !this.records().length) return;
    const sunucuda = new Set(this.server().map((r) => `${r.squadId}|${r.key}`));
    const tasinan = new Set<string>();
    for (const kayit of this.records()) {
      const squadId = kayit.squadId ?? (yonetilen.length === 1 ? yonetilen[0] : null);
      if (!squadId || !yonetilen.includes(squadId)) continue;
      const key = matchKey(kayit.kickoff, kayit.venue);
      if (sunucuda.has(`${squadId}|${key}`)) {
        tasinan.add(kayit.id);
        continue;
      }
      const { id: _id, savedAt: _s, score, ...govde } = kayit;
      const yeni = await this.remote.upsert({ ...govde, squadId });
      if (!yeni) continue;
      let son = yeni;
      if (score && (await this.remote.setScore(yeni.id, score.a, score.b))) son = { ...yeni, score };
      this.server.update((list) => [son, ...list.filter((r) => r.id !== son.id)]);
      tasinan.add(kayit.id);
    }
    if (tasinan.size) {
      this.records.update((list) => list.filter((r) => !tasinan.has(r.id)));
      this.persist();
    }
  }

  /**
   * GÖRÜNEN kayıtlar, en yeni başta: yalnızca kullanıcının HÂLÂ üyesi olduğu takımların maçları.
   * Takım listesi sunucudan gelmeden hiçbir şey iddia edilmez (boş döner — bkz. "veri gelmeden
   * karar verme"); takımı olmayan kullanıcı hiç maç görmez. Takım bilgisi olmayan eski kayıtlar
   * kullanıcının en az bir takımı varsa gösterilir. Aynı maç hem sunucuda hem cihazda varsa
   * sunucudaki gösterilir.
   */
  readonly all = computed<MatchRecord[]>(() => {
    if (!this.invites.teamsLoaded()) return [];
    const takimlar = new Set(this.invites.myTeams().map((t) => t.squad.id));
    if (takimlar.size === 0) return [];
    const sunucu = this.server().filter((r) => r.squadId && takimlar.has(r.squadId));
    const sunucuda = new Set(sunucu.map((r) => `${r.squadId}|${r.key}`));
    const cihaz = this.records().filter(
      (r) => (!r.squadId || takimlar.has(r.squadId)) && !sunucuda.has(`${r.squadId}|${matchKey(r.kickoff, r.venue)}`),
    );
    return [...sunucu, ...cihaz].sort((a, b) => (b.savedAt > a.savedAt ? 1 : b.savedAt < a.savedAt ? -1 : 0));
  });

  /** Başlama vakti GELECEKTE olan en yakın maç (yoksa null). */
  next(): MatchRecord | null {
    const now = Date.now();
    return (
      this.all()
        .filter((r) => kickoffTime(r) > now)
        .sort((a, b) => kickoffTime(a) - kickoffTime(b))[0] ?? null
    );
  }

  /** Başlama vakti GEÇMİŞTE kalan en son maç (yoksa null). */
  last(): MatchRecord | null {
    const now = Date.now();
    return (
      this.all()
        .filter((r) => kickoffTime(r) <= now)
        .sort((a, b) => kickoffTime(b) - kickoffTime(a))[0] ?? null
    );
  }

  /**
   * Kaydı ekler. Aynı vakit + aynı saha için ikinci kayıt açılmaz, üzerine yazılır: aynı maçın
   * görselini iki kez indirmek geçmişte iki satır oluşturmasın.
   *
   * Yönetilen takımda kayıt takımın ORTAK geçmişine gider. Üye ya da sunucuya ulaşılamazsa
   * kayıt bu cihazda tutulur ve kullanıcıya NEDENİ söylenir (sessizce yalnızca cihaza düşmesin).
   */
  async add(record: Omit<MatchRecord, 'id' | 'savedAt'>): Promise<void> {
    const squadId = record.squadId ?? null;
    if (squadId && !this.serverMissing()) {
      if (this.canManage(squadId)) {
        const saved = await this.remote.upsert({ ...record, squadId });
        if (saved) {
          this.server.update((list) => [saved, ...list.filter((r) => r.id !== saved.id)]);
          return;
        }
        this.notice.error(mesaj('mesaj.macSunucuHata'));
      } else {
        this.notice.show('warning', mesaj('mesaj.macUyeYerel'));
      }
    }
    const id = matchKey(record.kickoff, record.venue);
    const entry: MatchRecord = { ...record, id, savedAt: new Date().toISOString() };
    this.records.update((list) => [entry, ...list.filter((r) => r.id !== id)].slice(0, MAX_RECORDS));
    this.persist();
  }

  /**
   * Maçın skorunu yazar (ya da siler). Negatif ya da sayı olmayan değer kabul edilmez;
   * 0-99 aralığı halı sahada fazlasıyla yeterli. Sunucudaki maçta yalnızca kurucu/yönetici.
   */
  async setScore(id: string, a: number | null, b: number | null): Promise<void> {
    const clean = (v: number | null): number | null =>
      v === null || !Number.isFinite(v) ? null : Math.max(0, Math.min(99, Math.round(v)));
    const ca = clean(a);
    const cb = clean(b);
    const uygula = (r: MatchRecord): MatchRecord => {
      if (ca === null || cb === null) {
        const { score: _drop, ...rest } = r;
        return rest;
      }
      return { ...r, score: { a: ca, b: cb, enteredAt: new Date().toISOString() } };
    };

    const sunucuKaydi = this.server().find((r) => r.id === id);
    if (sunucuKaydi) {
      if (!this.canScore(sunucuKaydi)) {
        this.notice.error(mesaj('mesaj.skorYetki'));
        return;
      }
      // İyimser güncelleme: ekran hemen değişir; sunucu reddederse geri alınır.
      this.server.update((list) => list.map((r) => (r.id === id ? uygula(r) : r)));
      const ok = await this.remote.setScore(id, ca === null || cb === null ? null : ca, ca === null || cb === null ? null : cb);
      if (!ok) {
        this.server.update((list) => list.map((r) => (r.id === id ? sunucuKaydi : r)));
        this.notice.error(mesaj('mesaj.skorYetki'));
      }
      return;
    }

    this.records.update((list) => list.map((r) => (r.id === id ? uygula(r) : r)));
    this.persist();
  }

  /**
   * KADRO DENGESİ ANALİZİ. Kura, takımları REYTİNG ortalamasına göre eşitliyor; bu analiz
   * "gerçekten eşit mi çıkıyor" sorusunu oynanmış maçlarla ölçer:
   *
   * - `ratingEdgeWins`: ortalaması YÜKSEK olan takım kaç maçı kazandı. %50'ye yakınsa kura
   *   adil demektir; %80 ise reyting sahaya fazla yansıyor (kura toleransı sıkılmalı).
   * - `avgGoalGap`: ortalama skor farkı. Büyükse maçlar tek taraflı geçiyor.
   * - `draws`: berabere biten maçlar — dengenin en doğrudan kanıtı.
   *
   * Analiz yalnızca SKORU GİRİLMİŞ maçları sayar; skor yoksa bir şey iddia edilmez.
   */
  readonly analysis = computed(() => {
    const played = this.all().filter((r) => !!r.score);
    if (!played.length) return null;

    let edgeWins = 0;
    let edgeGames = 0;
    let draws = 0;
    let goalGap = 0;
    const perPlayer = new Map<string, { name: string; played: number; won: number; drawn: number }>();

    for (const match of played) {
      const score = match.score!;
      goalGap += Math.abs(score.a - score.b);
      const avgA = Number(match.teamA.avg.replace(',', '.'));
      const avgB = Number(match.teamB.avg.replace(',', '.'));
      const winner = score.a === score.b ? null : score.a > score.b ? 'A' : 'B';
      if (winner === null) draws++;

      if (Number.isFinite(avgA) && Number.isFinite(avgB) && avgA !== avgB && winner) {
        edgeGames++;
        if ((avgA > avgB && winner === 'A') || (avgB > avgA && winner === 'B')) edgeWins++;
      }

      for (const side of ['A', 'B'] as const) {
        const team = side === 'A' ? match.teamA : match.teamB;
        for (const player of team.players ?? []) {
          const entry = perPlayer.get(player.id) ?? { name: player.name, played: 0, won: 0, drawn: 0 };
          entry.played++;
          if (winner === null) entry.drawn++;
          else if (winner === side) entry.won++;
          perPlayer.set(player.id, entry);
        }
      }
    }

    return {
      playedCount: played.length,
      draws,
      avgGoalGap: goalGap / played.length,
      /** Reyting üstünlüğü olan takımın kazanma oranı (0-1); ölçülebilir maç yoksa null. */
      ratingEdgeRate: edgeGames ? edgeWins / edgeGames : null,
      edgeGames,
      /** En çok maç kazanan oyuncular — kadro kurarken kimin hangi tarafta olduğu bilinsin. */
      topPlayers: [...perPlayer.entries()]
        .map(([id, v]) => ({ id, ...v, winRate: v.played ? v.won / v.played : 0 }))
        .filter((p) => p.played >= 2)
        .sort((a, b) => b.winRate - a.winRate || b.played - a.played)
        .slice(0, 5),
    };
  });

  async remove(id: string): Promise<void> {
    const sunucuKaydi = this.server().find((r) => r.id === id);
    if (sunucuKaydi) {
      if (!this.canScore(sunucuKaydi) || !(await this.remote.remove(id))) {
        this.notice.error(mesaj('mesaj.skorYetki'));
        return;
      }
      this.server.update((list) => list.filter((r) => r.id !== id));
      return;
    }
    this.records.update((list) => list.filter((r) => r.id !== id));
    this.persist();
  }

  private persist(): void {
    try {
      localStorage.setItem(this.scope.key(STORAGE_KEY), JSON.stringify(this.records()));
    } catch {
      // Depo dolu ya da kapalıysa geçmiş yalnızca bu oturumda yaşar.
    }
  }
}

function kickoffTime(record: MatchRecord): number {
  const t = new Date(record.kickoff).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function readStored(key: string): MatchRecord[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MatchRecord[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECORDS) : [];
  } catch {
    return [];
  }
}
