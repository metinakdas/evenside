import { Injectable, inject, signal } from '@angular/core';
import { supabase } from '../supabase/supabase-client';
import { AuthService } from './auth.service';
import { describeSupabaseError } from '../utils/supabase-error';
import { mesaj } from './i18n.service';

/**
 * TAKIM KADROSU — hangi oyuncular hangi takımın kadrosunda (sunucu tarafı).
 *
 * Kadro listesi önce yalnızca cihazdaydı; bu yüzden katıldığın takımın kadrosunu göremiyordun,
 * liste kuran kişinin tarayıcısındaydı. Artık `public.squad_players` tablosunda: **kurucu
 * yazar, takımdaki herkes okur** (RLS bunu zorluyor, arayüzün iyi niyetine bırakılmadı).
 *
 * Yazma stratejisi: listeyi diff'lemek yerine takımın satırlarını silip yeniden yazıyoruz.
 * Kadro en fazla 22 satır; diff mantığı burada kazandırdığından fazla karmaşıklık getirirdi.
 */
@Injectable({ providedIn: 'root' })
export class SquadRosterService {
  private readonly auth = inject(AuthService);

  readonly error = signal<string | null>(null);
  /** Son `save` sunucunun YETKİ reddiyle mi bitti (bkz. save içindeki 42501 notu). */
  lastWasForbidden = false;

  /**
   * Takımın kadrosundaki oyuncu id'leri, kadro sırasıyla. Okunamazsa `null` — BOŞ DİZİ DEĞİL:
   * hata "kadro boş" demek değildir. Eskiden [] dönüyordu; üyenin kadrosu ekranda boşalıyor,
   * kurucuda ise sunucunun bilinmeyen hâli cihazdaki bayat listeyle eziliyordu (tarama, 10 Ekim 2026).
   */
  async load(squadId: string): Promise<string[] | null> {
    await this.auth.ready;
    const oku = () =>
      supabase.from('squad_players').select('player_id, sort_order').eq('squad_id', squadId).order('sort_order', { ascending: true });
    let { data, error } = await oku();
    // Jeton tam o an dolmuşsa bir kez tazeleyip yeniden dene.
    if (error && (error.code === 'PGRST301' || /jwt/i.test(error.message ?? ''))) {
      await supabase.auth.refreshSession().catch(() => undefined);
      ({ data, error } = await oku());
    }

    if (error) {
      this.error.set(describeSupabaseError(error, mesaj('mesaj.kadroYuklenemedi')));
      return null;
    }
    // Başarılı okuma eski hatayı temizler: hata bir kez yazılınca takım değişse de alt
    // şeritte kalıyordu.
    this.error.set(null);
    return ((data ?? []) as { player_id: string }[]).map((r) => r.player_id);
  }

  /**
   * Takımın kadrosunu yazar. Yalnızca KURUCU için çalışır; üye denerse RLS reddeder ve
   * `false` döner — arayüz zaten salt okunur, bu ikinci savunma hattı.
   */
  async save(squadId: string, playerIds: readonly string[]): Promise<boolean> {
    await this.auth.ready;
    this.lastWasForbidden = false;

    /*
     * TEK İŞLEM. Eskiden "önce hepsini sil, sonra hepsini ekle" yapılıyordu: silme başarılı
     * olup ekleme başarısız olursa (ağ koptu, oturum düştü) takımın kadrosu SUNUCUDA BOŞ
     * kalıyordu — üyeler de boş kadro görüyordu. Artık sunucudaki fonksiyon ikisini tek
     * işlemde yapıyor (bkz. supabase/guvenlik-2026-09-13.sql · save_squad_roster).
     *
     * Ağ hataları İSTİSNA olarak gelir (supabase-js reddeder), bu yüzden tüm gövde
     * try/catch içinde: eskiden istisna yakalanmıyor, hata sinyali boş kalıyor ve kullanıcı
     * kadronun kaydedildiğini sanıyordu (ölçüldü).
     */
    try {
      const rpc = await supabase.rpc('save_squad_roster', { p_squad: squadId, p_players: [...playerIds] });
      if (!rpc.error) {
        this.error.set(null);
        return true;
      }

      // Fonksiyon henüz kurulmadıysa eski yola düşülür (SQL çalıştırılana kadar).
      const missing = rpc.error.code === 'PGRST202' || /function.*does not exist/i.test(rpc.error.message ?? '');
      /*
       * YETKİ REDDİ (42501) bir arıza değil, "bu kadro senin değil" demek: rol geri alınmış ya
       * da takımdan çıkarılmış olabilirsin. Ham sunucu cümlesi ("Sunucu bu kaydı reddetti…")
       * alt şeritte kalıcı duruyordu (kullanıcı geri bildirimi). Hata sinyali YAZILMAZ; çağıran
       * (SquadStore) rolleri tazeler, kadroyu sunucudan geri okur ve bir kez bildirim gösterir.
       */
      if (rpc.error.code === '42501') {
        this.error.set(null);
        this.lastWasForbidden = true;
        return false;
      }
      if (!missing) {
        this.error.set(describeSupabaseError(rpc.error, mesaj('mesaj.kadroYazilamadi')));
        return false;
      }

      const { error: delError } = await supabase.from('squad_players').delete().eq('squad_id', squadId);
      if (delError) {
        this.error.set(describeSupabaseError(delError, mesaj('mesaj.kadroYazilamadi')));
        return false;
      }

      if (playerIds.length === 0) {
        this.error.set(null);
        return true;
      }

      const rows = playerIds.map((id, index) => ({ squad_id: squadId, player_id: id, sort_order: index }));
      const { error } = await supabase.from('squad_players').insert(rows);
      if (error) {
        this.error.set(describeSupabaseError(error, mesaj('mesaj.kadroYazilamadi')));
        return false;
      }

      this.error.set(null);
      return true;
    } catch {
      this.error.set(mesaj('mesaj.kadroKaydedilemedi'));
      return false;
    }
  }
}
