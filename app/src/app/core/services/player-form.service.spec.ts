import { Player } from '../models/player.model';
import { BalancerService } from './balancer.service';
import { MatchRecord } from './match-history.service';
import { FORM_SETTINGS, computeForm, formCap, goalMarginFactor } from './player-form.service';

let sayac = 0;
function mac(
  a: [string, number][],
  b: [string, number][],
  skor: [number, number] | null,
  kickoff = `2026-09-${String(10 + sayac++).padStart(2, '0')}T21:00`,
): MatchRecord {
  const takim = (list: [string, number][]) => ({
    name: 'T',
    color: '#000',
    logoImage: null,
    avg: '0',
    playerCount: list.length,
    players: list.map(([id, rating]) => ({ id, name: id, rating, position: 'OS' })),
  });
  return {
    id: kickoff,
    savedAt: kickoff,
    kickoff,
    venue: 'saha',
    format: a.length,
    teamA: takim(a),
    teamB: takim(b),
    ...(skor ? { score: { a: skor[0], b: skor[1], enteredAt: kickoff } } : {}),
  };
}

const esit = (): [[string, number][], [string, number][]] => [
  [['a1', 70], ['a2', 70]],
  [['b1', 70], ['b2', 70]],
];

describe('skorlardan form (Elo)', () => {
  it('skoru girilmemiş ya da kadrosu kaydedilmemiş maçı saymaz', () => {
    const [a, b] = esit();
    const kadrosuz = mac(a, b, [3, 0]);
    delete kadrosuz.teamA.players;
    expect(computeForm([mac(a, b, null), kadrosuz]).size).toBe(0);
  });

  it('denk takımlar arasında kazanan +K/2, kaybeden −K/2', () => {
    const [a, b] = esit();
    const form = computeForm([mac(a, b, [1, 0])]);
    expect(form.get('a1')!.delta).toBeCloseTo(FORM_SETTINGS.k / 2, 5);
    expect(form.get('b1')!.delta).toBeCloseTo(-FORM_SETTINGS.k / 2, 5);
    expect(form.get('a1')!.won).toBe(1);
    expect(form.get('b2')!.lost).toBe(1);
  });

  it('farklı yenilgi daha çok bilgi taşır: 5-0, 1-0\'dan büyük düzeltme verir', () => {
    const [a, b] = esit();
    const az = computeForm([mac(a, b, [1, 0])]).get('a1')!.delta;
    const cok = computeForm([mac(a, b, [5, 0])]).get('a1')!.delta;
    expect(cok).toBeGreaterThan(az);
    expect(goalMarginFactor(5)).toBeCloseTo(2, 5);
  });

  it('denk takımların beraberliği bir şey değiştirmez; favori berabere kalırsa düşer', () => {
    const [a, b] = esit();
    expect(computeForm([mac(a, b, [2, 2])]).get('a1')!.delta).toBe(0);
    const favori = computeForm([mac([['f1', 80], ['f2', 80]], [['z1', 70], ['z2', 70]], [2, 2])]);
    expect(favori.get('f1')!.delta).toBeLessThan(0);
    expect(favori.get('z1')!.delta).toBeGreaterThan(0);
  });

  it('beklenen sonuç az, sürpriz çok değiştirir', () => {
    const guclu: [string, number][] = [['g1', 82], ['g2', 82]];
    const zayif: [string, number][] = [['z1', 70], ['z2', 70]];
    const beklenen = computeForm([mac(guclu, zayif, [1, 0])]).get('g1')!.delta;
    const surpriz = computeForm([mac(guclu, zayif, [0, 1])]).get('z1')!.delta;
    expect(surpriz).toBeGreaterThan(beklenen * 3);
  });

  it('maçlar sırayla işlenir: üst üste kazanan takımın her galibiyeti daha az getirir', () => {
    const [a, b] = esit();
    const bir = computeForm([mac(a, b, [1, 0])]).get('a1')!.delta;
    const iki = computeForm([mac(a, b, [1, 0]), mac(a, b, [1, 0])]).get('a1')!.delta;
    expect(iki - bir).toBeLessThan(bir);
  });

  it('düzeltme ±max ile sınırlı', () => {
    const [a, b] = esit();
    const seri = Array.from({ length: 30 }, () => mac(a, b, [9, 0]));
    const form = computeForm(seri);
    expect(form.get('a1')!.delta).toBeLessThanOrEqual(FORM_SETTINGS.max);
    expect(form.get('b1')!.delta).toBeGreaterThanOrEqual(-FORM_SETTINGS.max);
  });

  /*
   * Sınır OYNANAN MAÇLA büyür (12 Ekim 2026): az maçta beyan, çok maçta sonuç ağır basar.
   * Eskiden herkes ±8'de duruyordu; kartını abartan biri ne kadar kaybederse kaybetsin inemiyordu.
   */
  it('sınır maç sayısıyla büyür: az maçta küçük, çok maçta büyük', () => {
    expect(formCap(0)).toBe(0);
    expect(formCap(3)).toBeCloseTo(6.67, 1);
    expect(formCap(6)).toBeCloseTo(10, 5);
    expect(formCap(24)).toBeCloseTo(16, 5);
    for (let n = 1; n < 40; n++) expect(formCap(n + 1)).toBeGreaterThan(formCap(n));
    expect(formCap(1000)).toBeLessThan(FORM_SETTINGS.max);
  });

  it('kartını abartan oyuncu sürekli kaybettikçe eski ±8 tavanının ALTINA iner', () => {
    // a1 kartında 85 (abartılmış), takımı kâğıt üstünde favori ama hep kaybediyor.
    const a: [string, number][] = [['a1', 85], ['a2', 70]];
    const b: [string, number][] = [['b1', 70], ['b2', 70]];
    const az = computeForm(Array.from({ length: 3 }, () => mac(a, b, [1, 3])));
    expect(Math.abs(az.get('a1')!.delta)).toBeLessThanOrEqual(formCap(3) + 0.05);
    const cok = computeForm(Array.from({ length: 20 }, () => mac(a, b, [1, 3])));
    expect(cok.get('a1')!.delta).toBeLessThan(-8);
  });

  it('eşlenmiş (takma ad) kartların maçları kanonik karta yazılır', () => {
    const [a, b] = esit();
    const form = computeForm([mac(a, b, [1, 0])], (id) => (id === 'a1' ? 'kendi' : id));
    expect(form.has('a1')).toBeFalse();
    expect(form.get('kendi')!.played).toBe(1);
  });

  it('KURAYI ETKİLER: kartı aynı ama sahada hep kazanan iki oyuncuyu ayrı takımlara koyar', () => {
    // Altı oyuncunun kartı aynı (70). Skorlar s1 ve s2'nin sürekli kazandırdığını söylüyor.
    const kadro = ['s1', 's2', 'x1', 'x2', 'x3', 'x4'];
    const kayitlar = [
      mac([['s1', 70], ['s2', 70], ['x1', 70]], [['x2', 70], ['x3', 70], ['x4', 70]], [6, 1]),
      mac([['s1', 70], ['s2', 70], ['x3', 70]], [['x1', 70], ['x2', 70], ['x4', 70]], [5, 2]),
      mac([['s1', 70], ['s2', 70], ['x4', 70]], [['x1', 70], ['x2', 70], ['x3', 70]], [4, 0]),
    ];
    const form = computeForm(kayitlar);
    expect(form.get('s1')!.delta).toBeGreaterThan(3);

    const oyuncular: Player[] = kadro.map((id) => ({
      id,
      input: {} as Player['input'],
      ratings: {
        pace: 70, shooting: 70, passing: 70, dribbling: 70, defending: 70, physical: 70, goalkeeping: 30,
        position: 'OS', tier: 'silver',
        overall: Math.round(70 + (form.get(id)?.delta ?? 0)),
      },
    }));
    const balancer = new BalancerService();
    for (let tur = 0; tur < 10; tur++) {
      const r = balancer.balance(oyuncular);
      const ayni = r.teamAPlayerIds.includes('s1') === r.teamAPlayerIds.includes('s2');
      expect(ayni).withContext(`tur ${tur}: s1 ve s2 aynı takımda`).toBeFalse();
    }
  });
});
