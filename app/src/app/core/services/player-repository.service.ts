import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { safeImage } from '../utils/safe-image';
import { PlayerSkills, PreferredFoot, legacyFromSkills } from '../constants/player-skills';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Player, PlayerInput } from '../models/player.model';
import { supabase } from '../supabase/supabase-client';
import { personNameKey } from '../utils/name-match';
import { describeSupabaseError } from '../utils/supabase-error';
import { AuthService } from './auth.service';
import { NoticeService } from './notice.service';
import { withTimeout } from './connection.service';
import { RatingService } from './rating.service';
import { mesaj } from './i18n.service';

/** `public.players` tablosunun satır şekli — bkz. `supabase/schema.sql`. */
interface PlayerRow {
  id: string;
  name: string;
  shirt_number: string;
  country_code: string;
  flag_image: string | null;
  photo_image: string | null;
  height_cm: number;
  weight_kg: number;
  smoker: boolean;
  goalkeeping: number;
  defending: number;
  midfield: number;
  attacking: number;
  pace: number;
  stamina: number;
  goals_per_match: number;
  owner_id?: string | null;
  merged_into?: string | null;
  last_edited_by?: string | null;
  /** Puanlama 2. sürüm: alt özellikler + ayak + yaş (bkz. supabase/kart-puanlama-v2.sql). */
  attributes?: PlayerAttributes | null;
}

interface PlayerAttributes {
  v?: number;
  skills?: PlayerSkills;
  foot?: PreferredFoot;
  age?: number | null;
  /** "Bu oyuncu hiç kaleye geçemez". */
  nk?: boolean;
}

/**
 * Uyruk kodunu iki harfe sabitler. Formda artık uyruk alanı yok (yeni oyuncular 'TR'
 * ile gelir), ama havuzda alanın elle yazıldığı dönemden kalma "Tür", "Türkiye" gibi
 * kayıtlar var ve kartta/tabloda kırpılmış görünüyorlardı (kullanıcı geri bildirimi).
 * Normalizasyon OKUMA sırasında yapılır — eski satırlar yazılmadan da düzgün görünür.
 */
const COUNTRY_ALIASES: Record<string, string> = {
  TUR: 'TR',
  TURKIYE: 'TR',
  TURKEY: 'TR',
};

export function normalizeCountryCode(raw: string | null | undefined): string {
  if (!raw) return '';
  const upper = raw.trim().toLocaleUpperCase('tr-TR').replace(/[^A-ZÇĞİÖŞÜ]/g, '');
  if (!upper) return '';
  const ascii = upper.replace(/Ç/g, 'C').replace(/Ğ/g, 'G').replace(/İ/g, 'I').replace(/Ö/g, 'O').replace(/Ş/g, 'S').replace(/Ü/g, 'U');
  return COUNTRY_ALIASES[ascii] ?? ascii.slice(0, 2);
}

function rowToInput(row: PlayerRow): PlayerInput {
  return {
    name: row.name,
    shirtNumber: row.shirt_number,
    countryCode: normalizeCountryCode(row.country_code),
    flagImage: safeImage(row.flag_image),
    photoImage: safeImage(row.photo_image),
    heightCm: row.height_cm,
    weightKg: row.weight_kg,
    smoker: row.smoker,
    goalkeeping: row.goalkeeping,
    defending: row.defending,
    midfield: row.midfield,
    attacking: row.attacking,
    pace: row.pace,
    stamina: row.stamina,
    goalsPerMatch: row.goals_per_match,
    ...(row.attributes?.skills ? { skills: row.attributes.skills } : {}),
    ...(row.attributes?.foot ? { preferredFoot: row.attributes.foot } : {}),
    ...(row.attributes?.age ? { age: row.attributes.age } : {}),
    ...(row.attributes?.nk ? { noKeeper: true } : {}),
  };
}

function inputToRow(input: PlayerInput): Omit<PlayerRow, 'id'> {
  return {
    name: input.name,
    shirt_number: input.shirtNumber,
    country_code: normalizeCountryCode(input.countryCode),
    flag_image: input.flagImage,
    photo_image: input.photoImage,
    height_cm: input.heightCm,
    weight_kg: input.weightKg,
    smoker: input.smoker,
    goalkeeping: input.goalkeeping,
    defending: input.defending,
    midfield: input.midfield,
    attacking: input.attacking,
    pace: input.pace,
    stamina: input.stamina,
    goals_per_match: input.goalsPerMatch,
  };
}

/**
 * Kayıtlı oyuncu havuzu — tek gerçek kaynak Supabase'teki `players` tablosu.
 * `SquadStore` sadece hangi oyuncu id'lerinin bu kadroda olduğunu tutar; asıl
 * oyuncu verisi (ve ondan hesaplanan reytingler) hep buradan, canlı olarak gelir.
 * Böylece bir oyuncu havuzda güncellenince onu kullanan her kadro anında görür.
 */
@Injectable({ providedIn: 'root' })
export class PlayerRepositoryService {
  private readonly rating = inject(RatingService);
  private readonly auth = inject(AuthService);
  private readonly notices = inject(NoticeService);

  private readonly rows = signal<PlayerRow[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private channel: RealtimeChannel | null = null;

  readonly players = computed<Player[]>(() =>
    this.rows()
      .map((row) => this.toPlayer(row))
      .sort((a, b) => a.input.name.localeCompare(b.input.name, 'tr')),
  );

  /**
   * Eşlenmiş (merged) kartların zincirini izleyip KANONİK kartı bulur.
   *
   * Eşleme yapıldığında havuzdaki satır silinmez, yalnızca `merged_into` ile kişinin kendi
   * kartına yönlendirilir — çünkü eski kadrolar, kaydedilmiş kuralar ve indirilmiş maç
   * kayıtları hâlâ ESKİ id'yi tutuyor. Yönlendirme burada, tek yerde çözülür.
   *
   * Döngü koruması var: veri bozulsa bile (a→b→a) sonsuz döngüye girmez.
   */
  private canonical(row: Player, byId: Map<string, Player>): Player {
    let current = row;
    for (let hop = 0; hop < 8; hop++) {
      const next = current.mergedInto ? byId.get(current.mergedInto) : undefined;
      if (!next || next.id === current.id) return current;
      current = next;
    }
    return current;
  }

  /**
   * id → oyuncu. Eşlenmiş kartların ESKİ id'leri de bu haritada bulunur ve kanonik karta
   * çıkar; böylece `SquadStore`, kura, saha ve dışa aktarma hiçbir şey bilmeden doğru kartı
   * görür. Bu, eşleme özelliğinin uygulamanın geri kalanına dokunmadan çalışmasının sebebidir.
   */
  readonly playersById = computed<Map<string, Player>>(() => {
    const list = this.players();
    const direct = new Map(list.map((p) => [p.id, p]));
    const resolved = new Map<string, Player>();
    for (const player of list) {
      resolved.set(player.id, this.canonical(player, direct));
    }
    return resolved;
  });

  /** Bir id'nin kanonik karşılığı — eşlenmemişse kendisi. */
  resolveId(id: string): string {
    return this.playersById().get(id)?.id ?? id;
  }

  /**
   * HAVUZDA gösterilecek kartlar: eşlenmiş (artık başka bir kartın takma adı olan) satırlar
   * listeden düşer, yoksa aynı kişi havuzda iki kez görünür.
   */
  readonly poolPlayers = computed<Player[]>(() => this.players().filter((p) => !p.mergedInto));

  /** Giriş yapmış kullanıcının KENDİ kartı — yoksa null. */
  readonly ownCard = computed<Player | null>(() => {
    const userId = this.auth.user()?.id;
    if (!userId) return null;
    return this.players().find((p) => p.ownerId === userId && !p.mergedInto) ?? null;
  });

  /** Sahipli kartlar — isim eşleştirme önerileri yalnızca bunlar arasında aranır. */
  readonly ownedCards = computed<Player[]>(() => this.players().filter((p) => p.ownerId && !p.mergedInto));

  /**
   * `AuthService.ready` restore edilene kadar `auth.isAuthenticated()` geçici olarak `false`
   * kalıyor (oturum localStorage'dan/ağdan henüz geri yüklenmedi) — aşağıdaki `effect()` bunu
   * beklemeden çalışırsa "oturum yok" sanıp havuzu boşaltır ve `ready`'yi ERKEN çözerdi. Bu
   * sinyal netleşene kadar effect hiçbir karar vermiyor (bkz. `authRestored()` erken-dönüşü).
   */
  private readonly authRestored = signal(false);

  /**
   * İlk yükleme (ya da oturum değişimi sonrası yeniden yükleme) tamamlanana kadar bekleyen
   * promise — `squadCompleteGuard` bunu `await`lemeden `isSquadComplete()`'i kontrol ederse,
   * havuz henüz Supabase'den gelmediği için kadro dolu olsa bile boş görünüp `/pitch` ve
   * `/draw`'ya doğrudan URL'den girişte ya da sayfa yenilemede yanlışlıkla `/squad`'ya geri
   * atardı (bkz. kullanıcı geri bildirimi — tam olarak bu senaryo canlıda gözlemlendi ve
   * `auth.isAuthenticated()`'ın geçici `false` durumuyla ilişkili olduğu doğrulandı).
   */
  private resolveReady: (() => void) | null = null;
  readonly ready: Promise<void>;

  /**
   * Havuz KİMİN İÇİN yüklendi? (`undefined` = hiç yüklenmedi)
   *
   * `ready` bir kez çözülür ve OTURUMSUZ açılışta da çözülür; sonra giriş yapan kullanıcı
   * için havuz yeniden çekilene kadar "kartın yok" kararı verilmiş olur. Bu bayrak kimliğe
   * bağlı olduğu için kullanıcı değişince kendiliğinden "hazır değil"e döner.
   */
  private readonly loadedFor = signal<string | null | undefined>(undefined);
  readonly readyForUser = computed(
    () => this.loadedFor() !== undefined && this.loadedFor() === (this.auth.user()?.id ?? null),
  );

  /** `whenReadyForUser` bekleyenleri — havuz kim için yüklendiği her değiştiğinde yoklanır. */
  private bekleyenler: (() => void)[] = [];

  /**
   * Havuz ŞU ANKİ kullanıcı için yüklenene kadar bekler (rota korumaları ve tek seferlik
   * kararlar için). Tek seferlik `ready` YETMEZ: tanıtım sayfasında oturumsuz açılışta da
   * çözülür; giriş yapan kullanıcı için havuz henüz gelmeden "kartı yok / kadro boş" kararı
   * verilirdi (kullanıcı: "kartım olduğu hâlde girişte kart oluştur daveti çıkıp gitti").
   * Ağ takılırsa sonsuza kadar beklememek için 12 sn sonra yine çözülür.
   */
  whenReadyForUser(): Promise<void> {
    if (this.readyForUser()) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const zaman = setTimeout(bitir, 12_000);
      function bitir(): void {
        clearTimeout(zaman);
        resolve();
      }
      this.bekleyenler.push(bitir);
    });
  }

  private bekleyenleriYokla(): void {
    if (!this.readyForUser() || this.bekleyenler.length === 0) return;
    const liste = this.bekleyenler;
    this.bekleyenler = [];
    for (const bitir of liste) bitir();
  }

  constructor() {
    void this.auth.ready.then(() => this.authRestored.set(true));

    this.ready = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });
    effect(
      () => {
        if (!this.authRestored()) return; // oturum durumu netleşmeden hiçbir karar verme
        if (this.auth.isAuthenticated()) {
          void this.refresh().finally(() => this.markReady());
          this.subscribe();
        } else {
          this.rows.set([]);
          this.unsubscribe();
          this.loadedFor.set(null);
          this.bekleyenleriYokla();
          this.markReady();
        }
      });
  }

  private markReady(): void {
    this.resolveReady?.();
    this.resolveReady = null;
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    /*
     * ZAMAN AŞIMI ŞART. Ağ gidince istek askıda kalıyor, `loading` hiç kapanmıyor ve ekranda
     * sonsuza kadar dönen bir çember kalıyordu (kullanıcı: "internet gidince sonsuza kadar
     * dönen çember olmasın"). Süre dolarsa yükleme biter, kullanıcı hatayı ve "Tekrar dene"
     * düğmesini görür.
     */
    const oku = () => withTimeout(Promise.resolve(supabase.from('players').select('*').order('name')));
    let sonuc = await oku();
    // Jeton açılışta tam o an dolmuşsa (401 / PGRST301) oturumu bir kez tazeleyip yeniden dene;
    // yoksa kullanıcı sebepsiz bir "havuz yüklenemedi" bildirimi görüyordu.
    if (sonuc?.error && (sonuc.error.code === 'PGRST301' || /jwt/i.test(sonuc.error.message ?? ''))) {
      await supabase.auth.refreshSession().catch(() => undefined);
      sonuc = await oku();
    }
    this.loading.set(false);

    if (!sonuc) {
      this.error.set(mesaj('mesaj.havuzYuklenemediAg'));
      this.notices.error(mesaj('mesaj.havuzYuklenemedi'), { label: mesaj('mesaj.tekrarDene'), run: () => void this.refresh() });
      return;
    }
    if (sonuc.error) {
      this.error.set(describeSupabaseError(sonuc.error, mesaj('mesaj.havuzYuklenemedi')));
      this.notices.error(mesaj('mesaj.havuzYuklenemedi'), { label: mesaj('mesaj.tekrarDene'), run: () => void this.refresh() });
      return;
    }
    this.rows.set((sonuc.data ?? []) as PlayerRow[]);
    this.loadedFor.set(this.auth.user()?.id ?? null);
    this.bekleyenleriYokla();
    this.error.set(null);
  }

  /**
   * Yazma anında iki türetilmiş alan tazelenir: `name_key` (isim eşleştirmesinin sunucu
   * tarafındaki karşılığı) ve `last_edited_by` (sahipli bir kartı kadro sahibi düzenlediğinde
   * "kim değiştirdi" sorusunun cevabı). İkisi de girdiden türer, elle set edilmez.
   */
  /**
   * Sunucuda `attributes` sütunu var mı. `kart-puanlama-v2.sql` çalıştırılana kadar YOK; o
   * zaman ilk yazma PGRST204 alır, bayrak düşer ve kayıt alan olmadan tekrarlanır — kullanıcı
   * kartını yine kaydeder, yalnızca alt özellik ayrıntısı saklanmaz (eski altı alan saklanır).
   */
  private attributesColumn = true;

  private writableRow(input: PlayerInput): Record<string, unknown> {
    // Alt özellikler varsa eski altı sütun onlardan üretilir: dengeleyici, anket ve eski
    // istemciler aynı oyuncuyu aynı güçte görsün.
    const legacy = input.skills ? legacyFromSkills(input.skills) : {};
    const row: Record<string, unknown> = {
      ...inputToRow({ ...input, ...legacy }),
      name_key: personNameKey(input.name),
      last_edited_by: this.auth.user()?.id ?? null,
    };
    if (this.attributesColumn && (input.skills || input.preferredFoot || input.age || input.noKeeper)) {
      row['attributes'] = {
        v: 2,
        ...(input.skills ? { skills: input.skills } : {}),
        ...(input.preferredFoot ? { foot: input.preferredFoot } : {}),
        ...(input.age ? { age: input.age } : {}),
        ...(input.noKeeper ? { nk: true } : {}),
      };
    }
    return row;
  }

  /** Yazmayı dener; `attributes` sütunu yoksa onu çıkarıp bir kez daha dener. */
  private async yaz<T>(calis: (row: Record<string, unknown>) => PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>, row: Record<string, unknown>) {
    const ilk = await calis(row);
    if (ilk.error && 'attributes' in row && (ilk.error.code === 'PGRST204' || /attributes/.test(ilk.error.message ?? ''))) {
      this.attributesColumn = false;
      const { attributes: _atla, ...kalan } = row;
      return calis(kalan);
    }
    return ilk;
  }

  async create(input: PlayerInput): Promise<Player | null> {
    /*
     * `created_by` YALNIZCA ekleme sırasında yazılır.
     *
     * Sunucu politikası kartı ekleyenin kim olduğunu bilmek zorunda (kartlar yalnızca
     * sahibine, oluşturana ve birlikte oynanan takımlara görünür). Alan gönderilmediğinde
     * sunucu satırı REDDEDİYOR — ölçüldü: `created_by` yokken HTTP 403
     * "new row violates row-level security policy", alan konunca 201.
     *
     * Güncellemede BİLEREK yazılmıyor: kartı sonradan düzenleyen kişi onu oluşturan kişi
     * değildir; üzerine yazmak kart geçmişini çalardı (kim düzenledi bilgisi
     * `last_edited_by` alanında zaten duruyor).
     */
    const yeniSatir = { ...this.writableRow(input), created_by: this.auth.user()?.id ?? null };
    const { data, error } = await this.yaz((r) => supabase.from('players').insert(r).select().single(), yeniSatir);
    if (error || !data) {
      this.error.set(describeSupabaseError(error, mesaj('mesaj.oyuncuKaydedilemedi')));
      return null;
    }
    const row = data as PlayerRow;
    this.rows.update((list) => [...list, row]);
    return this.toPlayer(row);
  }

  async update(id: string, input: PlayerInput): Promise<Player | null> {
    const { data, error } = await this.yaz((r) => supabase.from('players').update(r).eq('id', id).select().single(), this.writableRow(input));
    if (error || !data) {
      this.error.set(describeSupabaseError(error, mesaj('mesaj.oyuncuGuncellenemedi')));
      return null;
    }
    const row = data as PlayerRow;
    this.rows.update((list) => list.map((r) => (r.id === id ? row : r)));
    return this.toPlayer(row);
  }

  /** Havuzdan tamamen siler (tüm kadrolardaki referansı da geçersiz kılar) — geri alınamaz. */
  async remove(id: string): Promise<boolean> {
    const { error } = await supabase.from('players').delete().eq('id', id);
    if (error) {
      this.error.set(mesaj('mesaj.oyuncuSilinemedi'));
      return false;
    }
    this.rows.update((list) => list.filter((r) => r.id !== id));
    return true;
  }

  /**
   * Kullanıcının KENDİ kartını oluşturur (anket çıktısı). Bir kullanıcının en fazla bir kendi
   * kartı olur — veritabanında da kısmi eşsiz indeksle güvence altında; burada ayrıca
   * kontrol edilir ki kullanıcı ikinci kez ankete girdiğinde yeni kart değil GÜNCELLEME olsun.
   */
  async saveOwnCard(input: PlayerInput): Promise<Player | null> {
    const userId = this.auth.user()?.id;
    if (!userId) {
      this.error.set(mesaj('mesaj.kartIcinGiris'));
      return null;
    }

    const existing = this.ownCard();
    if (existing) return this.update(existing.id, input);

    const { data, error } = await this.yaz(
      (r) => supabase.from('players').insert(r).select().single(),
      { ...this.writableRow(input), owner_id: userId },
    );
    if (error || !data) {
      this.error.set(describeSupabaseError(error, mesaj('mesaj.kartKaydedilemedi')));
      return null;
    }
    const row = data as PlayerRow;
    this.rows.update((list) => [...list, row]);
    return this.toPlayer(row);
  }

  /**
   * EŞLEME: havuzdaki kartı, kişinin kendi kartına yönlendirir. Havuz satırı SİLİNMEZ —
   * kadrolar, kaydedilmiş kuralar ve indirilmiş maç kayıtları hâlâ eski id'yi tutuyor;
   * yönlendirme okuma sırasında `playersById` içinde çözülür.
   *
   * Zincir oluşmasın diye hedefin kendisi de çözülür: A zaten B'ye eşliyse, A'ya eşlemek
   * B'ye eşlemek demektir.
   */
  async linkToOwnedCard(poolPlayerId: string, ownedCardId: string): Promise<boolean> {
    const target = this.playersById().get(ownedCardId);
    if (!target || target.id === poolPlayerId) {
      this.error.set(mesaj('mesaj.kartEslenemedi'));
      return false;
    }

    const { data, error } = await supabase
      .from('players')
      .update({ merged_into: target.id })
      .eq('id', poolPlayerId)
      .select()
      .single();
    if (error || !data) {
      this.error.set(mesaj('mesaj.kartEslenemedi'));
      return false;
    }
    const row = data as PlayerRow;
    this.rows.update((list) => list.map((r) => (r.id === poolPlayerId ? row : r)));
    return true;
  }

  /** Eşlemeyi geri alır: havuz kartı yeniden kendi başına durur. */
  async unlink(poolPlayerId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('players')
      .update({ merged_into: null })
      .eq('id', poolPlayerId)
      .select()
      .single();
    if (error || !data) {
      this.error.set(mesaj('mesaj.eslemeKaldirilamadi'));
      return false;
    }
    const row = data as PlayerRow;
    this.rows.update((list) => list.map((r) => (r.id === poolPlayerId ? row : r)));
    return true;
  }

  private toPlayer(row: PlayerRow): Player {
    const input = rowToInput(row);
    return {
      id: row.id,
      input,
      ratings: this.rating.calculate(input),
      ownerId: row.owner_id ?? null,
      mergedInto: row.merged_into ?? null,
      lastEditedBy: row.last_edited_by ?? null,
    };
  }

  /** Başka bir oturumun havuzda yaptığı değişiklik bu sekmeye de anında yansısın. */
  private subscribe(): void {
    if (this.channel) return;
    this.channel = supabase
      .channel('players-pool')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => void this.refresh())
      .subscribe();
  }

  private unsubscribe(): void {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }
}
