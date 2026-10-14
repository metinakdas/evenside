import { Injectable, signal } from '@angular/core';
import { supabase } from '../supabase/supabase-client';

/** Tanıtım sayfasındaki sosyal kanıt sayıları. Hepsi GERÇEK; uydurma değer yok. */
export interface PublicStats {
  /** Kurulan kadro (takım) sayısı. */
  teams: number;
  /** Havuzdaki kart sayısı. */
  players: number;
  /** Kayıtlı kullanıcı sayısı (`auth.users`). */
  users: number;
  /** Son 7 günde kurulan kadro. */
  teamsWeek: number;
  /** Son 7 günde açılan kart. */
  playersWeek: number;
  /** Son 7 günde katılan kullanıcı. */
  usersWeek: number;
}

/**
 * Açılış sayfasının canlı sayacı.
 *
 * Sayılar `public_stats()` RPC'sinden gelir (bkz. `supabase/canli-sayac.sql`): RLS oturumsuz
 * ziyaretçiye hiçbir satırı göstermediği için toplamlar security definer bir fonksiyondan
 * okunuyor — kimse kimin takımını/kartını göremiyor, yalnızca sayı dönüyor.
 *
 * **Fonksiyon kurulmamışsa ya da çağrı hata verirse `stats` null kalır ve sayfa şeridi HİÇ
 * basmaz.** Uydurma rakam gösterilmez; kullanıcı isteği olsa bile (sahte
 * sosyal kanıt notu) sayılar yalnızca veritabanından gelir.
 */
@Injectable({ providedIn: 'root' })
export class PublicStatsService {
  readonly stats = signal<PublicStats | null>(null);

  async load(): Promise<void> {
    try {
      const { data, error } = await supabase.rpc('public_stats');
      if (error || !data) return;
      const ham = data as Record<string, unknown>;
      const sayi = (deger: unknown): number => {
        const n = Number(deger);
        return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
      };
      this.stats.set({
        teams: sayi(ham['teams']),
        players: sayi(ham['players']),
        users: sayi(ham['users']),
        teamsWeek: sayi(ham['teams_week']),
        playersWeek: sayi(ham['players_week']),
        usersWeek: sayi(ham['users_week']),
      });
    } catch {
      // Ağ/kurulum hatası: sayaç gösterilmez. Sayfanın geri kalanı etkilenmez.
    }
  }
}
