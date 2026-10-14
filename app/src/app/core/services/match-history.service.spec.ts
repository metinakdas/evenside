import { TestBed } from '@angular/core/testing';
import { takimliKullanici } from './testing/takimli-kullanici';
import { sahteMacSunucusu } from './testing/fake-match-remote';
import { MatchHistoryService, MatchRecordTeam } from './match-history.service';

const team = (name: string): MatchRecordTeam => ({ name, color: '#0068A8', logoImage: null, avg: '68.4', playerCount: 7 });

/**
 * Ana menüdeki "Sıradaki maç" / "Son maç" kutuları bu servisten besleniyor: ayrım tamamen
 * BAŞLAMA VAKTİNE göre — kayıt vakti geçince kendiliğinden "son maç" tarafına düşmeli.
 */
describe('MatchHistoryService', () => {
  let service: MatchHistoryService;

  const iso = (offsetHours: number): string => {
    const d = new Date(Date.now() + offsetHours * 3_600_000);
    // `yyyy-MM-ddTHH:mm` — MatchDetails.kickoff ile aynı biçim.
    return d.toISOString().slice(0, 16);
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [takimliKullanici().provider, sahteMacSunucusu().provider] });
    service = TestBed.inject(MatchHistoryService);
  });

  /** Effect'leri çalıştırır ve sahte sunucunun söz zincirini boşaltır. */
  const bekle = async (): Promise<void> => {
    TestBed.tick();
    for (let i = 0; i < 6; i++) await Promise.resolve();
  };

  it('vakti gelecekte olan en yakın maçı sıradaki sayar', () => {
    service.add({ kickoff: iso(72), venue: 'Uzak', format: 7, teamA: team('A'), teamB: team('B') });
    service.add({ kickoff: iso(5), venue: 'Yakın', format: 7, teamA: team('A'), teamB: team('B') });

    expect(service.next()?.venue).toBe('Yakın');
    expect(service.last()).toBeNull();
  });

  it('vakti geçmiş maç son maça düşer, sıradakinden çıkar', () => {
    service.add({ kickoff: iso(-3), venue: 'Dün', format: 7, teamA: team('A'), teamB: team('B') });

    expect(service.next()).toBeNull();
    expect(service.last()?.venue).toBe('Dün');
  });

  it('aynı vakit ve saha için ikinci kayıt açmaz, üzerine yazar', () => {
    const kickoff = iso(10);
    service.add({ kickoff, venue: 'Yıldız Halı Saha', format: 7, teamA: team('A'), teamB: team('B') });
    service.add({ kickoff, venue: 'Yıldız Halı Saha', format: 8, teamA: team('C'), teamB: team('D') });

    expect(service.all().length).toBe(1);
    expect(service.all()[0].format).toBe(8);
    expect(service.all()[0].teamA.name).toBe('C');
  });

  it('takımsız kayıt cihazda (localStorage) hayatta kalır', () => {
    service.add({ kickoff: iso(8), venue: 'Saha', format: 7, teamA: team('A'), teamB: team('B') });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [takimliKullanici().provider, sahteMacSunucusu().provider] });
    const restored = TestBed.inject(MatchHistoryService);

    expect(restored.all().length).toBe(1);
    expect(restored.next()?.venue).toBe('Saha');
  });

  /*
   * HATA (11 Ekim 2026, kullanıcı ekran görüntüsü): takımı OLMAYAN hesap menüde hâlâ "Sıradaki
   * maç" görüyordu — kayıtlar takım bilgisi taşımıyordu. Artık yalnızca üyesi olunan takımların
   * maçları görünür.
   */
  it('takımı olmayan kullanıcı hiçbir maç görmez; takım listesi gelmeden hiçbir şey iddia edilmez', async () => {
    const { sahte, provider } = takimliKullanici(['t1']);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provider, sahteMacSunucusu().provider] });
    const h = TestBed.inject(MatchHistoryService);
    await h.add({ kickoff: iso(8), venue: 'Saha', format: 7, squadId: 't1', teamA: team('A'), teamB: team('B') });
    expect(h.next()).not.toBeNull();
    sahte.myTeams.set([]);
    expect(h.all().length).toBe(0);
    expect(h.next()).toBeNull();
    sahte.teamsLoaded.set(false);
    expect(h.all().length).toBe(0);
  });

  it('ayrılınan takımın maçı gizlenir; takım bilgisi olmayan eski kayıt takımı olana görünür', async () => {
    const { sahte, provider } = takimliKullanici(['t1', 't2']);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provider, sahteMacSunucusu().provider] });
    const h = TestBed.inject(MatchHistoryService);
    await h.add({ kickoff: iso(8), venue: 'Bir', format: 7, squadId: 't1', teamA: team('A'), teamB: team('B') });
    await h.add({ kickoff: iso(9), venue: 'İki', format: 7, squadId: 't2', teamA: team('A'), teamB: team('B') });
    await h.add({ kickoff: iso(10), venue: 'Eski', format: 7, teamA: team('A'), teamB: team('B') });
    expect(h.all().length).toBe(3);
    sahte.myTeams.set(sahte.myTeams().filter((t) => t.squad.id !== 't2'));
    expect(h.all().map((r) => r.venue).sort()).toEqual(['Bir', 'Eski']);
  });

  /*
   * TAKIMIN ORTAK GEÇMİŞİ (12 Ekim 2026): maç ve skor sunucuda. Kaptanın girdiği skor takımın
   * herkesinin kurasını düzeltmeli; eskiden yalnızca kaptanın telefonundaydı.
   */
  describe('sunucudaki ortak geçmiş', () => {
    it('kurucunun kaydettiği maç ve skoru, takımın BAŞKA cihazında görünür', async () => {
      const sunucu = sahteMacSunucusu();
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [takimliKullanici(['t1']).provider, sunucu.provider] });
      const kaptan = TestBed.inject(MatchHistoryService);
      await kaptan.add({ kickoff: iso(-2), venue: 'Ortak', format: 7, squadId: 't1', teamA: team('A'), teamB: team('B') });
      await kaptan.setScore(kaptan.all()[0].id, 3, 2);
      expect(kaptan.all()[0].remote).toBeTrue();
      expect(localStorage.length).toBe(0); // cihaza hiçbir şey yazılmadı

      // Başka cihaz: boş localStorage, aynı sunucu.
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [takimliKullanici(['t1']).provider, sunucu.provider] });
      const uye = TestBed.inject(MatchHistoryService);
      await bekle();
      expect(uye.all().length).toBe(1);
      expect(uye.all()[0].score).toEqual(jasmine.objectContaining({ a: 3, b: 2 }));
    });

    it('üye ortak maça skor YAZAMAZ ve kendi kaydı yalnızca cihazına düşer', async () => {
      const sunucu = sahteMacSunucusu();
      sunucu.sahte.yoneticiler = ['t1'];
      await sunucu.sahte.upsert({ kickoff: iso(-2), venue: 'Ortak', format: 7, squadId: 't1', teamA: team('A'), teamB: team('B') });
      const kullanici = takimliKullanici(['t1']);
      kullanici.sahte.myTeams.set(kullanici.sahte.myTeams().map((t) => ({ ...t, role: 'uye' })));
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [kullanici.provider, sunucu.provider] });
      const h = TestBed.inject(MatchHistoryService);
      await bekle();
      const ortak = h.all()[0];
      expect(h.canScore(ortak)).toBeFalse();
      await h.setScore(ortak.id, 9, 0);
      expect(h.all()[0].score).toBeUndefined();
      expect(sunucu.sahte.satirlar[0].score).toBeUndefined();

      await h.add({ kickoff: iso(5), venue: 'Benim', format: 7, squadId: 't1', teamA: team('A'), teamB: team('B') });
      const benim = h.all().find((r) => r.venue === 'Benim')!;
      expect(benim.remote).toBeFalsy();
      expect(sunucu.sahte.satirlar.length).toBe(1);
    });

    it('cihazdaki eski kayıtlar yönetilen takımın ortak geçmişine BİR KEZ taşınır (skoruyla)', async () => {
      const eski = [{
        id: 'x', savedAt: '2026-10-01T10:00:00Z', kickoff: iso(-48), venue: 'Eski Saha', format: 7,
        squadId: 't1', teamA: team('A'), teamB: team('B'), score: { a: 4, b: 4, enteredAt: '2026-10-01T22:00:00Z' },
      }];
      localStorage.setItem('saha42.history.v1', JSON.stringify(eski));
      const sunucu = sahteMacSunucusu();
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [takimliKullanici(['t1']).provider, sunucu.provider] });
      const h = TestBed.inject(MatchHistoryService);
      await bekle();
      await bekle();
      expect(sunucu.sahte.satirlar.length).toBe(1);
      expect(sunucu.sahte.satirlar[0].score).toEqual(jasmine.objectContaining({ a: 4, b: 4 }));
      expect(h.all().length).toBe(1);
      expect(h.all()[0].remote).toBeTrue();
      expect(JSON.parse(localStorage.getItem('saha42.history.v1') ?? '[]').length).toBe(0);
    });

    it('sunucu tablosu kurulmamışsa eskisi gibi cihazda çalışır', async () => {
      const sunucu = sahteMacSunucusu();
      sunucu.sahte.eksik = true;
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [takimliKullanici(['t1']).provider, sunucu.provider] });
      const h = TestBed.inject(MatchHistoryService);
      await bekle();
      await h.add({ kickoff: iso(3), venue: 'Yerel', format: 7, squadId: 't1', teamA: team('A'), teamB: team('B') });
      expect(h.all().length).toBe(1);
      expect(h.all()[0].remote).toBeFalsy();
      expect(sunucu.sahte.satirlar.length).toBe(0);
    });
  });
});
