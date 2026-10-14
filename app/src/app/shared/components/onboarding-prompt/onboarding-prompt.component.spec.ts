import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { OnboardingPromptComponent } from './onboarding-prompt.component';
import { PlayerRepositoryService } from '../../../core/services/player-repository.service';
import { FakePlayerRepositoryService } from '../../../core/services/testing/fake-player-repository';

/**
 * Gerileme (11 Ekim 2026): kartı OLAN kullanıcı giriş yapınca "Kartını oluştur" daveti bir an
 * açılıp kapanıyordu. Sebep: davet tek seferlik `ready` promise'ine bakıyordu; o promise
 * tanıtım sayfasında OTURUMSUZ açılışta zaten çözülmüş oluyor. Karar artık havuz BU KULLANICI
 * İÇİN yüklenene kadar (`readyForUser`) hiç verilmiyor.
 */
describe('OnboardingPromptComponent', () => {
  function kur(hazir: ReturnType<typeof signal<boolean>>) {
    localStorage.clear();
    const repo = new FakePlayerRepositoryService();
    (repo as unknown as { readyForUser: () => boolean }).readyForUser = () => hazir();
    TestBed.configureTestingModule({
      imports: [OnboardingPromptComponent],
      providers: [provideRouter([]), { provide: PlayerRepositoryService, useValue: repo }],
    });
    const fixture = TestBed.createComponent(OnboardingPromptComponent);
    fixture.detectChanges();
    return { fixture, repo };
  }

  it('havuz bu kullanıcı için yüklenmeden davet AÇILMAZ', async () => {
    const hazir = signal(false);
    const { fixture } = kur(hazir);
    // Eski kod tek seferlik `ready` promise'ini bekliyordu: bir mikro görev sonra açılırdı.
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    expect(fixture.componentInstance.visible()).toBeFalse();
  });

  it('kartı olan kullanıcıda havuz gelince de davet açılmaz', async () => {
    const hazir = signal(false);
    const { fixture, repo } = kur(hazir);
    repo.userId = 'u1';
    await repo.saveOwnCard({
      name: 'Ali',
      shirtNumber: '',
      countryCode: 'TR',
      flagImage: null,
      photoImage: null,
      heightCm: 178,
      weightKg: 74,
      smoker: false,
      goalkeeping: 2,
      defending: 5,
      midfield: 5,
      attacking: 5,
      pace: 5,
      stamina: 5,
      goalsPerMatch: 0,
    });
    expect(repo.ownCard()).not.toBeNull();
    hazir.set(true);
    fixture.detectChanges();
    expect(fixture.componentInstance.visible()).toBeFalse();
  });

  it('kartı olmayan kullanıcıda havuz gelince davet açılır', () => {
    const hazir = signal(false);
    const { fixture } = kur(hazir);
    hazir.set(true);
    fixture.detectChanges();
    expect(fixture.componentInstance.visible()).toBeTrue();
  });
});
