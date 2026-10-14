import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { I18nService, ondalik } from './i18n.service';
import { PlayerRepositoryService } from './player-repository.service';
import { SquadStore } from './squad-store.service';
import { UserScopeService } from './user-scope.service';
import { FakePlayerRepositoryService } from './testing/fake-player-repository';

/**
 * QA denetimi (9 Ekim 2026) gerileme testleri. Bkz. proje notları.
 */

/** Kimliği testten sürülebilen kapsam: oturumun GEÇ gelmesini taklit eder. */
class FakeScope {
  readonly id = signal<string | null>(null);
  readonly userId = computed(() => this.id());
  readonly revision = signal(0);
  key(base: string): string {
    const id = this.id();
    return id ? `${base}::${id}` : base;
  }
  repairInheritedData(): void {}
}

describe('QA K2 — kadro deposu oturum geç gelince kaydı korur', () => {
  let scope: FakeScope;

  beforeEach(() => {
    localStorage.clear();
    scope = new FakeScope();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: PlayerRepositoryService, useValue: new FakePlayerRepositoryService() },
        { provide: UserScopeService, useValue: scope },
      ],
    });
  });

  afterEach(() => localStorage.clear());

  it('kimlik sonradan gelince kullanıcının kayıtlı formatını okur, varsayılanla EZMEZ', () => {
    // Kullanıcının kendi anahtarında 4v4 kayıtlı.
    localStorage.setItem(
      'saha42.squad.v2::u1',
      JSON.stringify({ format: 4, teams: null, squadPlayerIds: [], drawResult: null }),
    );

    // Depo oturumdan ÖNCE kuruluyor (uygulamada ClubKitBackfillService yüzünden).
    const store = TestBed.inject(SquadStore);
    TestBed.tick();
    expect(store.format()).toBe(7); // kimlik yok: varsayılan

    // Oturum geliyor.
    scope.id.set('u1');
    TestBed.tick();
    TestBed.tick();

    expect(store.format()).withContext('kayıtlı format okunmalı').toBe(4);
    const kayit = JSON.parse(localStorage.getItem('saha42.squad.v2::u1') || '{}');
    expect(kayit.format).withContext('kullanıcının anahtarı varsayılanla ezilmemeli').toBe(4);
  });

  it('kimlik geldikten sonra yapılan seçim kullanıcının anahtarına yazılır', () => {
    const store = TestBed.inject(SquadStore);
    scope.id.set('u2');
    TestBed.tick();
    store.setFormat(5);
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem('saha42.squad.v2::u2') || '{}').format).toBe(5);
  });
});

describe('QA K5 — ondalık sayı seçili dile göre', () => {
  let i18n: I18nService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    i18n = TestBed.inject(I18nService);
  });

  afterEach(() => i18n.setLocale('tr'));

  it('Türkçede virgül, İngilizcede nokta; Arapçada da Latin rakam', () => {
    i18n.setLocale('tr');
    expect(ondalik(71.25)).toBe('71,3');
    i18n.setLocale('en');
    expect(ondalik(71.25)).toBe('71.3');
    i18n.setLocale('ar');
    // Maç geçmişine yazılan metin sayıya geri çevrilebilmeli: Latin rakam şart.
    expect(/^[0-9]+[.,٫][0-9]$/.test(ondalik(71.25))).withContext(ondalik(71.25)).toBeTrue();
    expect(ondalik(0)).toMatch(/^0[.,٫]0$/);
  });
});
