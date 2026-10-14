import { TestBed } from '@angular/core/testing';
import { takimliKullanici } from './testing/takimli-kullanici';
import { MatchHistoryService, MatchRecord } from './match-history.service';

/** İki takımlı bir kayıt üretir; kadro içeriği isteğe bağlı (eski kayıtlarda yok). */
const record = (
  kickoff: string,
  venue: string,
  avgA: string,
  avgB: string,
  withPlayers = true,
): Omit<MatchRecord, 'id' | 'savedAt'> => ({
  kickoff,
  venue,
  format: 7,
  teamA: {
    name: 'A',
    color: '#2196F3',
    logoImage: null,
    avg: avgA,
    playerCount: 2,
    players: withPlayers
      ? [
          { id: 'p1', name: 'BİR', rating: 80, position: 'FOR' },
          { id: 'p2', name: 'İKİ', rating: 70, position: 'DEF' },
        ]
      : undefined,
  },
  teamB: {
    name: 'B',
    color: '#E53935',
    logoImage: null,
    avg: avgB,
    playerCount: 2,
    players: withPlayers
      ? [
          { id: 'p3', name: 'ÜÇ', rating: 78, position: 'FOR' },
          { id: 'p4', name: 'DÖRT', rating: 68, position: 'DEF' },
        ]
      : undefined,
  },
});

/**
 * TAKIM GEÇMİŞİ: skor girişi ve kadro dengesi analizi.
 *
 * Analizin tek amacı şu soruyu ölçmek: kura takımları reyting ortalamasına göre eşitliyor,
 * bu saha sonuçlarında da tutuyor mu? Skor girilmemiş maç hiçbir şey iddia etmez.
 */
describe('MatchHistoryService — skor ve denge analizi', () => {
  let service: MatchHistoryService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [takimliKullanici().provider] });
    service = TestBed.inject(MatchHistoryService);
  });

  it('skor girilmeden analiz YOKTUR — boş veriyle yorum yapılmaz', () => {
    service.add(record('2026-09-11T20:30', 'Saha 1', '72,0', '71,0'));
    expect(service.analysis()).toBeNull();
  });

  it('skoru yazar, günceller ve siler', () => {
    service.add(record('2026-09-11T20:30', 'Saha 1', '72,0', '71,0'));
    const id = service.all()[0].id;

    service.setScore(id, 6, 5);
    expect(service.all()[0].score).toEqual(jasmine.objectContaining({ a: 6, b: 5 }));

    service.setScore(id, 3, 3);
    expect(service.all()[0].score).toEqual(jasmine.objectContaining({ a: 3, b: 3 }));

    service.setScore(id, null, null);
    expect(service.all()[0].score).toBeUndefined();
  });

  it('skor 0-99 aralığına çekilir ve tam sayıya yuvarlanır', () => {
    service.add(record('2026-09-11T20:30', 'Saha 1', '72,0', '71,0'));
    const id = service.all()[0].id;
    service.setScore(id, -4, 120.6);
    expect(service.all()[0].score).toEqual(jasmine.objectContaining({ a: 0, b: 99 }));
  });

  it('güçlü takımın kazanma oranını ve gol farkını hesaplar', () => {
    // 1. maç: ortalaması yüksek olan A kazandı. 2. maç: ortalaması yüksek olan B kaybetti.
    service.add(record('2026-09-11T20:30', 'Saha 1', '72,0', '70,0'));
    service.add(record('2026-09-04T20:30', 'Saha 2', '70,0', '73,0'));
    const [second, first] = service.all(); // en yeni başta
    service.setScore(first.id, 6, 5);
    service.setScore(second.id, 4, 1);

    const a = service.analysis()!;
    expect(a.playedCount).toBe(2);
    expect(a.edgeGames).toBe(2);
    expect(a.ratingEdgeRate).toBe(0.5);
    expect(a.avgGoalGap).toBe(2); // |6-5| = 1 ve |4-1| = 3 → ortalama 2
    expect(a.draws).toBe(0);
  });

  it('beraberlik hiçbir takıma galibiyet yazmaz', () => {
    service.add(record('2026-09-11T20:30', 'Saha 1', '72,0', '70,0'));
    service.setScore(service.all()[0].id, 3, 3);

    const a = service.analysis()!;
    expect(a.draws).toBe(1);
    // Beraberlik "güçlü takım kazandı" ölçümüne girmez: kazanan yok.
    expect(a.edgeGames).toBe(0);
    expect(a.ratingEdgeRate).toBeNull();
  });

  it('oyuncu bazlı galibiyet oranı en az iki maç oynayanlar için çıkar', () => {
    service.add(record('2026-09-11T20:30', 'Saha 1', '72,0', '70,0'));
    service.add(record('2026-09-04T20:30', 'Saha 2', '72,0', '70,0'));
    service.all().forEach((r) => service.setScore(r.id, 5, 2)); // iki maçı da A kazandı

    const top = service.analysis()!.topPlayers;
    const p1 = top.find((p) => p.id === 'p1')!;
    const p3 = top.find((p) => p.id === 'p3')!;
    expect(p1.winRate).toBe(1);
    expect(p3.winRate).toBe(0);
    expect(p1.played).toBe(2);
  });

  it('kadrosu kaydedilmemiş eski kayıtlar analizi kırmaz', () => {
    service.add(record('2026-09-11T20:30', 'Saha 1', '72,0', '70,0', false));
    service.setScore(service.all()[0].id, 2, 1);

    const a = service.analysis()!;
    expect(a.playedCount).toBe(1);
    expect(a.topPlayers).toEqual([]);
  });
});
