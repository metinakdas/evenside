import { Injectable, inject } from '@angular/core';
import { supabase } from '../supabase/supabase-client';
import { AuthService } from './auth.service';
import type { MatchRecord, MatchRecordTeam } from './match-history.service';

/**
 * MAÇ GEÇMİŞİNİN SUNUCU TARAFI (`public.matches`, bkz. supabase/mac-gecmisi.sql).
 *
 * Takımın sahibi ve üyeleri OKUR; maç kaydetmeyi, skor girmeyi ve silmeyi yalnızca kurucu ve
 * yönetici YAPAR (RLS). `MatchHistoryService` bu sınıfı kullanır; testlerde yerine sahtesi
 * verilir (`testing/fake-match-remote.ts`).
 */

/** Sunucudaki tek satır. */
interface MatchRow {
  id: string;
  squad_id: string;
  match_key: string;
  kickoff: string;
  venue: string;
  format: number;
  team_a: MatchRecordTeam;
  team_b: MatchRecordTeam;
  score_a: number | null;
  score_b: number | null;
  score_entered_at: string | null;
  created_at: string;
}

export type MatchListResult =
  | { kind: 'ok'; records: MatchRecord[] }
  /** Tablo henüz kurulmamış (SQL çalıştırılmadı): istemci eski, cihaza özel davranışa döner. */
  | { kind: 'missing' }
  | { kind: 'error' };

/** "Aynı maç" anahtarı: başlama vakti + saha (büyük/küçük harf duyarsız). */
export function matchKey(kickoff: string, venue: string): string {
  return `${kickoff}|${venue.trim().toLocaleLowerCase('tr')}`;
}

/**
 * Sunucuya yazılacak takım bilgisi: arma yalnızca UZAK adresse (kulüp arması) gider. Kullanıcının
 * yüklediği logo data URL'dir ve onlarca kB tutar; maç kaydını şişirmesin (sunucu 16 kB sınırı koyar).
 */
function sunucuTakimi(team: MatchRecordTeam): MatchRecordTeam {
  return { ...team, logoImage: team.logoImage && /^https:\/\//.test(team.logoImage) ? team.logoImage : null };
}

function kayda(row: MatchRow): MatchRecord {
  return {
    id: row.id,
    key: row.match_key,
    remote: true,
    savedAt: row.created_at,
    kickoff: row.kickoff,
    venue: row.venue,
    format: row.format,
    squadId: row.squad_id,
    teamA: row.team_a,
    teamB: row.team_b,
    ...(row.score_a !== null && row.score_b !== null
      ? { score: { a: row.score_a, b: row.score_b, enteredAt: row.score_entered_at ?? row.created_at } }
      : {}),
  };
}

/** Tablo/sütun yok: PostgREST şema önbelleğinde bulunamadı ya da Postgres "relation does not exist". */
function tabloYok(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === 'PGRST205' || error.code === '42P01' || /matches/.test(error.message ?? '') && /exist|find/i.test(error.message ?? ''));
}

@Injectable({ providedIn: 'root' })
export class MatchRemoteService {
  private readonly auth = inject(AuthService);

  /** Verilen takımların maçları, en yeni kayıt başta. En fazla 300 maç (form için fazlasıyla yeter). */
  async list(squadIds: readonly string[]): Promise<MatchListResult> {
    if (!squadIds.length) return { kind: 'ok', records: [] };
    await this.auth.ready;
    const oku = () =>
      supabase.from('matches').select('*').in('squad_id', [...squadIds]).order('created_at', { ascending: false }).limit(300);
    let { data, error } = await oku();
    if (error && (error.code === 'PGRST301' || error.code === 'PGRST303' || /jwt/i.test(error.message ?? ''))) {
      await supabase.auth.refreshSession().catch(() => undefined);
      ({ data, error } = await oku());
    }
    if (tabloYok(error)) return { kind: 'missing' };
    if (error) {
      console.warn('Evenside · maç geçmişi okunamadı:', error.code ?? '', error.message);
      return { kind: 'error' };
    }
    return { kind: 'ok', records: ((data ?? []) as MatchRow[]).map(kayda) };
  }

  /** Maçı kaydeder; aynı takımda aynı anahtar varsa üzerine yazar (skor korunur). Başarısızsa null. */
  async upsert(record: Omit<MatchRecord, 'id' | 'savedAt'> & { squadId: string }): Promise<MatchRecord | null> {
    await this.auth.ready;
    const satir = {
      squad_id: record.squadId,
      match_key: matchKey(record.kickoff, record.venue),
      kickoff: record.kickoff,
      venue: record.venue.trim(),
      format: record.format,
      team_a: sunucuTakimi(record.teamA),
      team_b: sunucuTakimi(record.teamB),
    };
    const { data, error } = await supabase
      .from('matches')
      .upsert(satir, { onConflict: 'squad_id,match_key' })
      .select()
      .single();
    if (error || !data) {
      console.warn('Evenside · maç kaydedilemedi:', error?.code ?? '', error?.message);
      return null;
    }
    return kayda(data as MatchRow);
  }

  /** Skoru yazar ya da siler (ikisi de null). Satırı geri okuyarak RLS'in sessiz reddini yakalar. */
  async setScore(id: string, a: number | null, b: number | null): Promise<boolean> {
    await this.auth.ready;
    const { data, error } = await supabase
      .from('matches')
      .update({ score_a: a, score_b: b, score_entered_at: a === null ? null : new Date().toISOString() })
      .eq('id', id)
      .select('id');
    if (error || !data?.length) {
      console.warn('Evenside · skor kaydedilemedi:', error?.code ?? 'yetki/0 satır', error?.message ?? '');
      return false;
    }
    return true;
  }

  async remove(id: string): Promise<boolean> {
    await this.auth.ready;
    const { data, error } = await supabase.from('matches').delete().eq('id', id).select('id');
    return !error && !!data?.length;
  }
}
