import { MatchListResult, MatchRemoteService, matchKey } from '../match-remote.service';
import type { MatchRecord } from '../match-history.service';

/**
 * Testler için bellekte çalışan maç sunucusu (`public.matches` yerine). RLS'i taklit eder:
 * `yoneticiler` dışındaki takımlara yazma reddedilir. `eksik = true` tablonun kurulmamış
 * olduğu durumu (SQL çalıştırılmadı) canlandırır.
 */
export class FakeMatchRemote {
  satirlar: MatchRecord[] = [];
  eksik = false;
  /** Yazma yetkisi olan takımlar; boşsa her takıma yazılabilir. */
  yoneticiler: string[] = [];
  private sayac = 0;

  private yazabilir(squadId: string | null | undefined): boolean {
    return !!squadId && (!this.yoneticiler.length || this.yoneticiler.includes(squadId));
  }

  async list(squadIds: readonly string[]): Promise<MatchListResult> {
    if (this.eksik) return { kind: 'missing' };
    return { kind: 'ok', records: this.satirlar.filter((r) => r.squadId && squadIds.includes(r.squadId)).map((r) => ({ ...r })) };
  }

  async upsert(record: Omit<MatchRecord, 'id' | 'savedAt'> & { squadId: string }): Promise<MatchRecord | null> {
    if (!this.yazabilir(record.squadId)) return null;
    const key = matchKey(record.kickoff, record.venue);
    const eski = this.satirlar.find((r) => r.squadId === record.squadId && r.key === key);
    const yeni: MatchRecord = {
      ...record,
      id: eski?.id ?? `m${++this.sayac}`,
      key,
      remote: true,
      savedAt: eski?.savedAt ?? new Date(Date.now() + this.sayac).toISOString(),
      ...(eski?.score ? { score: eski.score } : {}),
    };
    this.satirlar = [yeni, ...this.satirlar.filter((r) => r !== eski)];
    return { ...yeni };
  }

  async setScore(id: string, a: number | null, b: number | null): Promise<boolean> {
    const r = this.satirlar.find((x) => x.id === id);
    if (!r || !this.yazabilir(r.squadId)) return false;
    if (a === null || b === null) delete r.score;
    else r.score = { a, b, enteredAt: new Date().toISOString() };
    return true;
  }

  async remove(id: string): Promise<boolean> {
    const r = this.satirlar.find((x) => x.id === id);
    if (!r || !this.yazabilir(r.squadId)) return false;
    this.satirlar = this.satirlar.filter((x) => x !== r);
    return true;
  }
}

export function sahteMacSunucusu() {
  const sahte = new FakeMatchRemote();
  return { sahte, provider: { provide: MatchRemoteService, useValue: sahte } };
}
