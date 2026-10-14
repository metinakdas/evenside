import { PEER_SETTINGS, PeerLevel, blendWithPeers, calibratePeer, peerWeight } from './peer-rating.service';

const lv = (median: number, raters = 5): PeerLevel => ({ median, raters });

describe('takım arkadaşı puanlaması (kalibrasyon)', () => {
  it('3 kişiden az puanlanan oyuncu kuraya girmez; ağırlık puanlayanla büyür, tavanı aşmaz', () => {
    expect(peerWeight(2)).toBe(0);
    expect(peerWeight(3)).toBeCloseTo(0.5, 5);
    expect(peerWeight(6)).toBeCloseTo(0.667, 2);
    expect(peerWeight(50)).toBe(PEER_SETTINGS.maxWeight);
  });

  it('kalibrasyon için en az 3 oyuncunun akran puanı gerekir', () => {
    const levels = new Map([['a', lv(8)], ['b', lv(4)]]);
    const cards = new Map([['a', 70], ['b', 70]]);
    expect(calibratePeer(levels, cards).size).toBe(0);
  });

  it('akranların SIRALAMASI alınır, ölçek kartlardan gelir: herkese cömert takım kurayı kaydırmaz', () => {
    const cards = new Map([['a', 60], ['b', 70], ['c', 80]]);
    const normal = calibratePeer(new Map([['a', lv(3)], ['b', lv(5)], ['c', lv(7)]]), cards);
    const comert = calibratePeer(new Map([['a', lv(6)], ['b', lv(8)], ['c', lv(10)]]), cards);
    for (const id of ['a', 'b', 'c']) expect(comert.get(id)!).toBeCloseTo(normal.get(id)!, 5);
    // Ortalama korunur: takımın toplam gücü akran puanıyla şişmez.
    const ort = [...normal.values()].reduce((x, y) => x + y, 0) / 3;
    expect(ort).toBeCloseTo(70, 5);
  });

  it('kartını abartan oyuncu: akranlar en alta koyarsa kurada aşağı iner', () => {
    // "z" kendine 88 vermiş; akranlar onu grubun en zayıfı görüyor.
    const cards = new Map([['x', 65], ['y', 70], ['z', 88], ['w', 72]]);
    const levels = new Map([['x', lv(6, 6)], ['y', lv(7, 6)], ['z', lv(3, 6)], ['w', lv(7, 6)]]);
    const peer = calibratePeer(levels, cards).get('z')!;
    expect(peer).toBeLessThan(65);
    const kura = blendWithPeers(88, peer, 6);
    expect(kura).toBeLessThan(75);
    expect(kura).toBeGreaterThan(peer); // kartın payı sürer (ağırlık %67)
  });

  it('akranların ayırt etmediği takımda herkes kart ortalamasına çekilir', () => {
    const cards = new Map([['a', 60], ['b', 70], ['c', 80]]);
    const out = calibratePeer(new Map([['a', lv(5)], ['b', lv(5)], ['c', lv(5)]]), cards);
    for (const v of out.values()) expect(v).toBeCloseTo(70, 5);
  });

  it('akran puanı olmayan oyuncunun kart reytingi aynen kalır', () => {
    expect(blendWithPeers(77, undefined, 0)).toBe(77);
  });
});
