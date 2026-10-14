import { TestBed } from '@angular/core/testing';
import { takimliKullanici } from './testing/takimli-kullanici';
import { signal } from '@angular/core';
import { AuthService } from './auth.service';
import { MatchHistoryService } from './match-history.service';
import { UserScopeService } from './user-scope.service';

/** Oturumu testten sürebilen sahte AuthService. */
class FakeAuth {
  readonly current = signal<{ id: string } | null>(null);
  user = () => this.current();
}

/**
 * YEREL DEPO KULLANICIYA AİT.
 *
 * `localStorage` cihaz başınadır; aynı tarayıcıda ikinci bir hesapla giren kullanıcı
 * öncekinin kadrosunu, maç geçmişini ve "bir daha gösterme" tercihini devralıyordu
 * (yeni hesapta "Sıradaki maç" kutusu doluydu, karşılama daveti hiç çıkmıyordu).
 */
describe('UserScopeService — veri kullanıcıya bağlı', () => {
  let auth: FakeAuth;

  const build = () => {
    TestBed.resetTestingModule();
    auth = new FakeAuth();
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: auth }] });
    return TestBed.inject(UserScopeService);
  };

  beforeEach(() => localStorage.clear());

  it('oturum yokken taban anahtarı, varken kullanıcıya özel anahtarı verir', () => {
    const scope = build();
    expect(scope.key('saha42.history.v1')).toBe('saha42.history.v1');

    auth.current.set({ id: 'u-1' });
    expect(scope.key('saha42.history.v1')).toBe('saha42.history.v1::u-1');
  });

  it('iki kullanıcı aynı tabandan FARKLI anahtar alır', () => {
    const scope = build();
    auth.current.set({ id: 'u-1' });
    const first = scope.key('saha42.squad.v2');
    auth.current.set({ id: 'u-2' });

    expect(scope.key('saha42.squad.v2')).not.toBe(first);
  });

  it('kimliksiz eski veri OKUNMAZ ve kimseye devredilmez', () => {
    localStorage.setItem('saha42.history.v1', '[{"id":"m1"}]');
    const scope = build();
    auth.current.set({ id: 'u-1' });

    // Anahtar kullanıcıya bağlı olduğu için kimliksiz kayda hiç bakılmaz.
    expect(localStorage.getItem(scope.key('saha42.history.v1'))).toBeNull();
  });

  /*
   * Kapsamlandırmadan önceki sürüm, cihazdaki veriyi giriş yapan ilk hesaba taşımıştı; o
   * hesap YENİ açılmış olabiliyordu ve başkasının geçmişini devralıyordu. Sunucuda hiç takımı
   * olmayan bir hesabın yerel kadrosu/geçmişi olamaz — varsa devralınmıştır, silinir.
   */
  it('takımı olmayan hesapta devralınmış yerel veri temizlenir', () => {
    const scope = build();
    auth.current.set({ id: 'u-1' });
    localStorage.setItem('saha42.history.v1::u-1', '[{"id":"m1"}]');
    localStorage.setItem('saha42.squad.v2::u-1', '{"format":7}');
    // Tercih örneği: onarım yalnızca VERİ anahtarlarını siler, kapsam dışı anahtarlara dokunmaz.
    localStorage.setItem('saha42.ceremony.speed::u-1', '2');

    scope.repairInheritedData(false);

    expect(localStorage.getItem('saha42.history.v1::u-1')).toBeNull();
    expect(localStorage.getItem('saha42.squad.v2::u-1')).toBeNull();
    expect(localStorage.getItem('saha42.ceremony.speed::u-1'))
      .withContext('tercihler veri değildir, silinmez')
      .toBe('2');
    expect(scope.revision()).withContext('ekranlar tazelensin diye sayaç artar').toBe(1);
  });

  it('takımı OLAN hesabın verisine dokunulmaz', () => {
    const scope = build();
    auth.current.set({ id: 'u-1' });
    localStorage.setItem('saha42.history.v1::u-1', '[{"id":"m1"}]');

    scope.repairInheritedData(true);

    expect(localStorage.getItem('saha42.history.v1::u-1')).toBe('[{"id":"m1"}]');
  });

  it('onarım kullanıcı başına BİR KEZ çalışır', () => {
    const scope = build();
    auth.current.set({ id: 'u-1' });
    scope.repairInheritedData(false);

    // İkinci turda (artık takım kurmuş olabilir) veriyi tekrar silmemeli.
    localStorage.setItem('saha42.history.v1::u-1', '[{"id":"yeni"}]');
    scope.repairInheritedData(false);

    expect(localStorage.getItem('saha42.history.v1::u-1')).toBe('[{"id":"yeni"}]');
  });
});

describe('MatchHistoryService — hesap değişince geçmiş değişir', () => {
  it('ikinci hesap öncekinin maçlarını GÖRMEZ', () => {
    localStorage.clear();
    localStorage.setItem(
      'saha42.history.v1::u-1',
      JSON.stringify([
        {
          id: 'm1',
          savedAt: '2026-09-01T10:00:00.000Z',
          kickoff: '2026-09-01T20:00',
          venue: 'Saha',
          format: 7,
          teamA: { name: 'A', color: '#fff', logoImage: null, avg: '70,0', playerCount: 7 },
          teamB: { name: 'B', color: '#000', logoImage: null, avg: '70,0', playerCount: 7 },
        },
      ]),
    );

    TestBed.resetTestingModule();
    const auth = new FakeAuth();
    auth.current.set({ id: 'u-1' });
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: auth }, takimliKullanici().provider] });
    const history = TestBed.inject(MatchHistoryService);
    expect(history.all().length).withContext('ilk hesap kendi maçını görür').toBe(1);

    auth.current.set({ id: 'u-2' });
    TestBed.flushEffects();

    expect(history.all()).withContext('ikinci hesabın geçmişi boş').toEqual([]);
  });
});
