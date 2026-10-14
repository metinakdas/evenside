import { Injectable, computed, inject, signal } from '@angular/core';
import { safeImage } from '../utils/safe-image';
import { supabase } from '../supabase/supabase-client';
import { AuthService } from './auth.service';
import { NoticeService } from './notice.service';
import { withTimeout } from './connection.service';
import { PlayerRepositoryService } from './player-repository.service';
import { generateJoinCode, normalizeJoinCode } from '../utils/join-code';
import { describeSupabaseError } from '../utils/supabase-error';
import { mesaj } from './i18n.service';

/** `public.squads` satırı. */
export interface SquadInvite {
  id: string;
  ownerId: string;
  name: string;
  joinCode: string;
  /** Takım logosu (data URL) — isteğe bağlı. */
  logoImage: string | null;
}

/** Kullanıcının ait olduğu bir takım ve oradaki rolü. */
export interface MyTeam {
  squad: SquadInvite;
  /**
   * 'kurucu' = takımı bu kullanıcı kurdu; 'uye' = kodla katıldı; 'yonetici' = kodla katıldı ve
   * kurucu ona kadroyu yönetme yetkisi verdi (bkz. supabase/yetki-yonetici.sql).
   */
  role: SquadRole;
}

/** Takımdaki rol. Yalnızca kurucu rol verir/alır; yönetici kadroda kurucu gibi çalışır. */
export type SquadRole = 'kurucu' | 'yonetici' | 'uye';
/** Üyelik satırındaki rol (kurucu tabloda yok, takımın sahibi olarak tutulur). */
export type MemberRole = 'yonetici' | 'uye';

/** `public.squad_members` satırı — kimin hangi kartla katıldığı. */
export interface SquadMember {
  squadId: string;
  userId: string;
  playerId: string | null;
  joinedAt: string;
  role: MemberRole;
}

interface SquadRow {
  id: string;
  owner_id: string;
  name: string;
  join_code: string;
  logo_image?: string | null;
}

interface MemberRow {
  squad_id: string;
  user_id: string;
  player_id: string | null;
  joined_at: string;
  /** `yetki-yonetici.sql` çalıştırılmadıysa sütun yoktur → 'uye' sayılır (varsayılan yasak). */
  role?: string | null;
}

const toInvite = (row: SquadRow): SquadInvite => ({
  id: row.id,
  ownerId: row.owner_id,
  name: row.name,
  joinCode: row.join_code,
  logoImage: safeImage(row.logo_image),
});

const toMember = (row: MemberRow): SquadMember => ({
  squadId: row.squad_id,
  userId: row.user_id,
  playerId: row.player_id,
  joinedAt: row.joined_at,
  role: row.role === 'yonetici' ? 'yonetici' : 'uye',
});

/**
 * KADRO DAVETİ — kadronun adı, katılma kodu ve üyeleri.
 *
 * Kadronun OYUNCU LİSTESİ burada değil: o hâlâ `SquadStore` içinde, cihazda. Kadroyu kuran
 * kişi listeyi sürekli kurcalıyor ve her hareketi sunucuya yazmanın faydası yok. Sunucuya
 * taşınan şey kadronun KİMLİĞİ — böylece başkası kodla katılabiliyor.
 *
 * Katılma akışı: kişi kodu girer → `squad_members`'a KENDİ kartıyla bir satır düşer → kadro
 * sahibinin havuzunda o kart "dahil edildi" işaretiyle görünür. Kadroya kimin gireceğine
 * yine kadro sahibi karar verir; katılmak kadroya girmek değil, HAVUZA girmektir.
 */
@Injectable({ providedIn: 'root' })
export class SquadInviteService {
  private readonly auth = inject(AuthService);
  private readonly notices = inject(NoticeService);
  private readonly players = inject(PlayerRepositoryService);

  /** Kullanıcının kendi kurduğu kadro (kimliği) — yoksa null. */
  readonly ownSquad = signal<SquadInvite | null>(null);
  /** Açık kadronun üyeleri. */
  readonly members = signal<SquadMember[]>([]);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  /**
   * Kullanıcının AİT OLDUĞU takımlar: kurduğu takım + kodla katıldıkları. Menüdeki
   * "Takımlarım" kutusunu besler; kullanıcı takımı olduktan sonra menü ona "takım kur"
   * demek yerine takımlarını göstermeli.
   */
  readonly myTeams = signal<MyTeam[]>([]);

  /**
   * Takımlar EN AZ BİR KEZ yüklendi mi. Arayüz bunu beklemeden karar veremez: yükleme
   * sürerken liste boş olduğu için menü "takımın yok" varsayıp "TAKIM KUR" yazıyordu, veri
   * gelince de "KADROYA GEÇ"e dönüyordu — sayfa her yenilendiğinde göze çarpan bir sıçrama.
   */
  /**
   * Takım listesi KİMİN İÇİN yüklendi? (yüklenmediyse `undefined`)
   *
   * Düz bir `teamsLoaded` bayrağı BAYATLIYOR: uygulama açılışta oturumsuzken de takımları
   * yüklüyor (tanıtım sayfası), bayrak "yüklendi + liste boş" hâlinde kalıyor ve kullanıcı
   * giriş yapınca menü bir an "takımı yok" sanıp YOL HARİTASI KARTINI açıyordu; veri
   * gelince kart kapanıyordu (kullanıcı bildirdi: "adımlar önce göründü, sonra gizlendi").
   *
   * Bu yüzden bayrak kimliğe bağlı: liste ŞU ANKİ kullanıcı için yüklendiyse hazır sayılır.
   */
  private readonly loadedFor = signal<string | null | undefined>(undefined);
  /**
   * Son yükleme HATAYLA bitti mi. Hata "takımı yok" DEMEK DEĞİL: 401/500'de boş liste
   * görüp devralınmış-veri onarımı çalışsaydı kullanıcının yerel kadrosu/geçmişi silinirdi
   * (tarama turu, 10 Ekim 2026 — açılışta süresi dolmuş jetonla 401 ölçüldü).
   */
  readonly teamsFailed = signal(false);
  readonly teamsLoaded = computed(
    () => this.loadedFor() !== undefined && this.loadedFor() === (this.auth.user()?.id ?? null),
  );

  /** Kadro ekranındaki kimlik paneli için: kendi takımı en az bir kez yüklendi mi. */
  readonly ownSquadLoaded = signal(false);

  /**
   * Kod ile katılmış üyelerin KART id'leri. Havuz listesi bu kümeye bakıp "dahil edildi"
   * işaretini basar — kadro sahibinin elle eklediği kartlarla kodla gelenleri ayırmanın
   * tek yolu bu.
   */
  readonly joinedPlayerIds = computed<Set<string>>(
    () => new Set(this.members().map((m) => m.playerId).filter((id): id is string => !!id)),
  );

  /**
   * YENİ takım kurar. Bir kullanıcı birden fazla takım kurabilir; her takımın kendi kadrosu
   * vardır (`ActiveTeamService` + takım başına saklama). Kod BİR KEZ üretilir ve değişmez —
   * paylaşılmış bir kodun sonradan değişmesi elindekini herkes için geçersiz kılardı.
   */
  async createTeam(name: string, logoImage?: string | null): Promise<SquadInvite | null> {
    await this.auth.ready;
    const userId = this.auth.user()?.id;
    if (!userId) {
      this.error.set(mesaj('mesaj.takimIcinGiris'));
      return null;
    }

    /*
     * Kod eşsiz olmalı; çakışma ihtimali düşük ama sıfır değil. Tekrar denemek, kodu
     * "kontrol et sonra yaz" diye iki adıma bölmekten daha güvenli: iki kullanıcı aynı anda
     * aynı kodu kontrol edip ikisi de boş bulabilirdi.
     */
    let lastError: { code?: string | null; message?: string | null } | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await supabase
        .from('squads')
        .insert({ owner_id: userId, name, logo_image: logoImage ?? null, join_code: generateJoinCode() })
        .select()
        .single();
      if (!error && data) {
        const invite = toInvite(data as SquadRow);
        this.ownSquad.set(invite);
        await this.loadMyTeams();
        return invite;
      }
      // 23505 = unique violation → kod çakıştı, yeni kod dene. Başka hata ise vazgeç.
      if (error && error.code !== '23505') {
        lastError = error;
        break;
      }
    }

    this.error.set(describeSupabaseError(lastError, mesaj('mesaj.takimKurulamadi')));
    return null;
  }

  /** Var olan takımın adını (ve istenirse logosunu) günceller. */
  async renameTeam(teamId: string, name: string, logoImage?: string | null): Promise<SquadInvite | null> {
    await this.auth.ready;

    // `logoImage` verilmediyse (undefined) mevcut logoya DOKUNULMAZ; null ise temizlenir.
    const patch: Record<string, unknown> = { name };
    if (logoImage !== undefined) patch['logo_image'] = logoImage;

    const { data, error } = await supabase.from('squads').update(patch).eq('id', teamId).select().single();
    if (error || !data) {
      this.error.set(describeSupabaseError(error, mesaj('mesaj.takimAdiGuncellenemedi')));
      return null;
    }
    const invite = toInvite(data as SquadRow);
    this.ownSquad.set(invite);
    await this.loadMyTeams();
    return invite;
  }

  /** Kullanıcının kendi kadrosunu ve üyelerini yükler. */
  async loadOwnSquad(): Promise<void> {
    // Oturum geri yüklenene kadar bekle: ready beklenmezse user() null doner ve
    // aşağıdaki erken dönüş sessizce "hiç takımı yok" sonucunu üretir.
    await this.auth.ready;
    const userId = this.auth.user()?.id;
    if (!userId) return;

    // `maybeSingle()` birden fazla satırda HATA verir. Veritabanında eşsiz indeks var ama
    // eski kayıtlarda çift satır kalmış olabilir; en eskisini almak çökmekten iyidir.
    const { data } = await supabase
      .from('squads')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!data) {
      this.ownSquad.set(null);
      this.members.set([]);
      this.ownSquadLoaded.set(true);
      return;
    }
    const invite = toInvite(data as SquadRow);
    this.ownSquad.set(invite);
    this.ownSquadLoaded.set(true);
    await this.loadMembers(invite.id);
  }

  /**
   * Kurduğu + katıldığı takımları toplar. İki ayrı sorgu: sahiplik `squads.owner_id`'de,
   * üyelik `squad_members`'ta duruyor; tek sorguyla birleştirmek için görünüm (view) açmak
   * gerekirdi ve bu kadar küçük bir veri için gereksiz.
   *
   * Şema henüz çalıştırılmamışsa (tablo yok) sessizce boş döner — menü bu yüzden hata
   * göstermemeli, kullanıcı zaten takım kurmaya davet ediliyor.
   */
  async loadMyTeams(): Promise<void> {
    // Oturum geri yüklenene kadar bekle: ready beklenmezse user() null doner ve
    // aşağıdaki erken dönüş sessizce "hiç takımı yok" sonucunu üretir.
    await this.auth.ready;
    const userId = this.auth.user()?.id;
    if (!userId) {
      this.myTeams.set([]);
      // Oturum yoksa da karar verilebilir: takımı yok. Arayüz beklemeye devam etmemeli.
      this.loadedFor.set(null);
      return;
    }

    /* Zaman aşımı: ağ askıda kalırsa menü sonsuza kadar iskelet göstermesin. */
    type Sonuc = { data: unknown[] | null; error: { code?: string; message?: string } | null } | null;
    const oku = async (): Promise<[Sonuc, Sonuc]> => {
      const owned: Sonuc = await withTimeout(Promise.resolve(supabase.from('squads').select('*').eq('owner_id', userId)));
      // Rol sütunu `yetki-yonetici.sql` ile geliyor; yoksa (42703) rolsüz okunur ve herkes 'uye' sayılır.
      let memberships: Sonuc = await withTimeout(
        Promise.resolve(supabase.from('squad_members').select('squad_id, role').eq('user_id', userId)),
      );
      if (memberships?.error?.code === '42703') {
        memberships = await withTimeout(Promise.resolve(supabase.from('squad_members').select('squad_id').eq('user_id', userId)));
      }
      return [owned, memberships];
    };
    let [owned, memberships] = await oku();
    // Jeton açılışta tam o an dolmuşsa (401 / PGRST301) oturumu bir kez tazeleyip yeniden dene.
    const jetonHatasi = (x: Sonuc) => x?.error?.code === 'PGRST301' || /jwt/i.test(x?.error?.message ?? '');
    if (jetonHatasi(owned) || jetonHatasi(memberships)) {
      await supabase.auth.refreshSession().catch(() => undefined);
      [owned, memberships] = await oku();
    }
    if (!owned || !memberships || owned.error || memberships.error) {
      if (owned?.error || memberships?.error) console.error('Takımlar yüklenemedi', owned?.error ?? memberships?.error);
      this.teamsFailed.set(true);
      this.loadedFor.set(userId);
      this.notices.error(mesaj('mesaj.takimlarYuklenemedi'), { label: mesaj('mesaj.tekrarDene'), run: () => void this.loadMyTeams() });
      return;
    }

    const teams: MyTeam[] = ((owned.data ?? []) as SquadRow[]).map((row) => ({
      squad: toInvite(row),
      role: 'kurucu' as const,
    }));

    const memberRows = (memberships.data ?? []) as { squad_id: string; role?: string | null }[];
    const joinedIds = memberRows.map((m) => m.squad_id);
    const roleOf = new Map(memberRows.map((m) => [m.squad_id, m.role === 'yonetici' ? ('yonetici' as const) : ('uye' as const)]));
    if (joinedIds.length) {
      const joined = await supabase.from('squads').select('*').in('id', joinedIds);
      for (const row of (joined.data ?? []) as SquadRow[]) {
        // Kendi kurduğu takıma ayrıca üye olarak da yazılmışsa iki kez listelenmesin.
        if (teams.some((t) => t.squad.id === row.id)) continue;
        teams.push({ squad: toInvite(row), role: roleOf.get(row.id) ?? 'uye' });
      }
    }

    this.myTeams.set(teams);
    this.teamsFailed.set(false);
    this.loadedFor.set(userId);
  }

  /** Kullanıcı yeni bir şey denemeye başladığında eski hata ekranda kalmasın. */
  clearError(): void {
    this.error.set(null);
  }

  async loadMembers(squadId: string): Promise<void> {
    const { data } = await supabase.from('squad_members').select('*').eq('squad_id', squadId);
    this.members.set(((data ?? []) as MemberRow[]).map(toMember));
  }

  /**
   * Takımın üyeleri (kim, hangi kartla, hangi rolde) DEĞİŞTİ Mİ? Değiştiyse üye listesini
   * günceller ve `true` döner. Kadro ekranı bunu aralıklarla yoklar (11 Ekim 2026, uçtan uca
   * test): kurucu kodu paylaşıp ekranda beklerken katılanlar sayfa yenilenene kadar
   * görünmüyordu — kartın görünürlüğü SUNUCUDA değiştiği için canlı akış bunu bildirmiyor.
   * Ağ hatasında sessizce `false` döner (bir sonraki yoklamada yeniden dener).
   */
  async refreshMembersIfChanged(squadId: string): Promise<boolean> {
    const { data, error } = await supabase.from('squad_members').select('*').eq('squad_id', squadId);
    if (error || !data) return false;
    const yeni = (data as MemberRow[]).map(toMember);
    const imza = (list: readonly { userId: string; playerId: string | null; role: string }[]): string =>
      list.map((m) => `${m.userId}:${m.playerId ?? ''}:${m.role}`).sort().join('|');
    const eski = this.members().filter((m) => m.squadId === squadId);
    if (imza(eski) === imza(yeni)) return false;
    this.members.set(yeni);
    return true;
  }

  /**
   * Koda sahip kadroyu bulur. Kod normalize edilir, yani kullanıcı küçük harfle ya da
   * boşluklu yazabilir.
   */
  async findByCode(rawCode: string): Promise<SquadInvite | null> {
    const code = normalizeJoinCode(rawCode);
    if (code.length !== 6) {
      this.error.set(mesaj('mesaj.kod6'));
      return null;
    }
    /*
     * KOD ARAMASI LİSTELEME DEĞİL. Takımlar tablosunu kodla sorgulamak, o tabloyu okuyabilen
     * herkesin TÜM kodları görebilmesi demekti (güvenlik taramasında ölçüldü: yabancı bir
     * hesap kodları listeleyip istediği takıma katılabiliyordu). Politikalar daraltıldı;
     * kod araması artık yalnızca TAM eşleşmeyi döndüren bir fonksiyona gidiyor
     * (bkz. supabase/guvenlik-2026-09-13.sql · find_squad_by_code).
     */
    const rpc = await supabase.rpc('find_squad_by_code', { p_code: code });
    if (!rpc.error) {
      const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
      if (!row) {
        this.error.set(mesaj('mesaj.kodBulunamadi'));
        return null;
      }
      return { id: row.id, ownerId: row.owner_id, name: row.name ?? '', joinCode: code, logoImage: safeImage(row.logo_image) };
    }

    /*
     * Yedek yola YALNIZCA fonksiyon kurulu değilse (PGRST202) düşülür. Önce her hatada
     * düşülüyordu: deneme sınırı aşılınca (42901) yedek sorgu RLS yüzünden boş dönüyor ve
     * kullanıcı DOĞRU kodu yazsa bile "Bu kodla bir takım bulunamadı" görüyordu (QA 9 Ekim 2026).
     */
    if (rpc.error.code !== 'PGRST202') {
      this.error.set(
        rpc.error.code === '42901' || /Cok fazla kod denemesi/i.test(rpc.error.message ?? '')
          ? mesaj('mesaj.cokKod')
          : describeSupabaseError(rpc.error, mesaj('mesaj.kodBulunamadi')),
      );
      return null;
    }

    /*
     * Fonksiyon henüz kurulmadıysa (SQL çalıştırılmamış) eski yol kullanılır: uygulama
     * çalışmaya devam etsin, ama bu YOLUN AÇIK olduğunu bilerek — güvenlik SQL'i
     * çalıştırıldığında bu dal kendiliğinden devre dışı kalır.
     */
    const { data, error } = await supabase.from('squads').select('*').eq('join_code', code).maybeSingle();
    if (!data) {
      this.error.set(describeSupabaseError(error, mesaj('mesaj.kodBulunamadi')));
      return null;
    }
    return toInvite(data as SquadRow);
  }

  /**
   * Kodla kadroya katılır. Katılmak için KENDİ KARTININ olması gerekir — kart, kadro
   * sahibinin havuzunda kişiyi temsil eden şeydir; kartsız katılan bir satır, sahibin
   * havuzunda adı bile olmayan bir kayıt olurdu.
   */
  async joinByCode(rawCode: string): Promise<SquadInvite | null> {
    // Oturum geri yüklenene kadar bekle: ready beklenmezse user() null doner ve
    // aşağıdaki erken dönüş sessizce "hiç takımı yok" sonucunu üretir.
    await this.auth.ready;
    const userId = this.auth.user()?.id;
    if (!userId) {
      this.error.set(mesaj('mesaj.katilmaIcinGiris'));
      return null;
    }

    // Doğrulama SIRASI: önce kodun kendisi (boş / 6 hane değil), sonra kart, sonra sunucu.
    // Eskiden kod hiç yazılmamışken de "önce kartını oluştur" deniyordu (tarayıcı testi).
    const code = normalizeJoinCode(rawCode);
    if (!code) {
      this.error.set(mesaj('mesaj.kodGir'));
      return null;
    }
    if (code.length !== 6) {
      this.error.set(mesaj('mesaj.kod6'));
      return null;
    }

    const card = this.players.ownCard();
    if (!card) {
      this.error.set(mesaj('mesaj.onceKart'));
      return null;
    }

    this.busy.set(true);
    this.error.set(null);
    const squad = await this.findByCode(rawCode);
    if (!squad) {
      this.busy.set(false);
      return null;
    }

    if (squad.ownerId === userId) {
      this.busy.set(false);
      this.error.set(mesaj('mesaj.kendiTakimin'));
      return null;
    }

    // Zaten üyesi olduğun takımın kodu: sunucuya gitme (kod deneme kotası boşa harcanmasın) ve
    // "katıldın" deme — uçtan uca testte ikinci denemede yine "takımına katıldın" yazıyordu.
    if (this.myTeams().some((t) => t.squad.id === squad.id)) {
      this.busy.set(false);
      this.error.set(mesaj('mesaj.zatenUye', { takim: squad.name }));
      return null;
    }

    /*
     * Katılma SUNUCUDA doğrulanır (`join_squad_with_code`): kodu, kartın gerçekten sana ait
     * olduğunu ve takımın senin olmadığını orada kontrol eder.
     *
     * Eskiden istemci doğrudan `squad_members`'a satır yazıyordu ve ÖLÇÜLDÜ: taze bir hesap,
     * kodu HİÇ bilmeden istediği takıma kendini ekleyebiliyordu (HTTP 201). Kod paylaşmanın
     * anlamı kalmıyordu. Doğrudan yazma artık politikayla da kapalı.
     */
    const { error } = await supabase.rpc('join_squad_with_code', { p_code: code, p_player: card.id });
    this.busy.set(false);

    if (error) {
      /*
       * Sunucunun kendi gerekçeleri Türkçeleştirilir. Genel çeviri (`describeSupabaseError`)
       * 42501'i "bu işlem için yetkin yok" diye okuyor; burada gerçek sebep "kartın yok" ya da
       * "bu senin kendi takımın" — kullanıcıya ne yapacağını söylemek gerekiyor.
       */
      const sunucu = error.message ?? '';
      this.error.set(
        error.code === 'PGRST202'
          ? mesaj('mesaj.sunucuGuncellemesi')
          : /kendi kartini/i.test(sunucu)
            ? mesaj('mesaj.onceKart')
            : /kendi takimin/i.test(sunucu)
              ? mesaj('mesaj.kendiTakimin')
              : /takim bulunamadi/i.test(sunucu)
                ? mesaj('mesaj.kodBulunamadi')
                : /Cok fazla kod denemesi/i.test(sunucu)
                  ? mesaj('mesaj.cokKod')
                  : describeSupabaseError(error, mesaj('mesaj.katilinamadi')),
      );
      return null;
    }
    /*
     * Katılınca takım listesi VE oyuncu havuzu tazelenir. Tazelenmezse yeni takımın kartları
     * (artık görünür olanlar) havuzda yoktu: üye sayfayı yenilemeden kadroya geçince 0/14 boş
     * kadro görüyordu ve aynı kodu tekrar girince yine "katıldın" deniyordu (uçtan uca test).
     */
    await Promise.all([this.loadMyTeams(), this.players.refresh()]);
    return squad;
  }

  /**
   * Kurucu bir üyeye yönetici yetkisi verir ya da geri alır. Tek kapı sunucudaki
   * `set_member_role`: yalnızca takımın sahibi çağırabilir; üye kendini yükseltemez.
   */
  async setMemberRole(squadId: string, userId: string, role: MemberRole): Promise<boolean> {
    const { error } = await supabase.rpc('set_member_role', { p_squad: squadId, p_user: userId, p_role: role });
    if (error) {
      const eksik = error.code === 'PGRST202' || /set_member_role/.test(error.message ?? '');
      this.error.set(eksik ? mesaj('mesaj.yetkiSqlEksik') : describeSupabaseError(error, mesaj('mesaj.yetkiVerilemedi')));
      return false;
    }
    this.error.set(null);
    this.members.update((list) => list.map((m) => (m.squadId === squadId && m.userId === userId ? { ...m, role } : m)));
    return true;
  }

  /** Kadro sahibi bir üyeyi çıkarır (ya da kişi kendi çıkar). */
  /**
   * TAKIMDAN AYRIL (11 Ekim 2026, kullanıcı isteği). Kendi üyeliğini siler; sunucu kuralı
   * (`squad_members_delete_self_or_owner`) buna zaten izin veriyor. Silinen satır geri
   * okunur: satır güvenliği reddederse hata değil "0 satır" döner, sessiz başarısızlık olmasın.
   * Kurucu kendi takımından ayrılamaz (takımı silmesi gerekir). Kartın takımın kadrosunda
   * KALIR — kadrodan çıkarmak kurucunun kararı.
   */
  async leaveTeam(squadId: string): Promise<boolean> {
    await this.auth.ready;
    const userId = this.auth.user()?.id;
    if (!userId) return false;
    const { data, error } = await supabase
      .from('squad_members')
      .delete()
      .eq('squad_id', squadId)
      .eq('user_id', userId)
      .select('squad_id');
    if (error || !data?.length) return false;
    await this.loadMyTeams();
    return true;
  }

  async removeMember(squadId: string, userId: string): Promise<boolean> {
    const { error } = await supabase
      .from('squad_members')
      .delete()
      .eq('squad_id', squadId)
      .eq('user_id', userId);
    if (error) {
      this.error.set(mesaj('mesaj.uyeCikarilamadi'));
      return false;
    }
    this.members.update((list) => list.filter((m) => m.userId !== userId));
    return true;
  }
}
