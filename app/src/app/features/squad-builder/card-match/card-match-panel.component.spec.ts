import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Player, PlayerInput } from '../../../core/models/player.model';
import { PlayerRepositoryService } from '../../../core/services/player-repository.service';
import { RatingService } from '../../../core/services/rating.service';
import { FakePlayerRepositoryService } from '../../../core/services/testing/fake-player-repository';
import { CardMatchPanelComponent } from './card-match-panel.component';

const rating = new RatingService();

const input = (name: string, attacking: number): PlayerInput => ({
  name,
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
  attacking,
  pace: 5,
  stamina: 5,
  goalsPerMatch: 0,
});

const card = (id: string, name: string, attacking: number, over: Partial<Player> = {}): Player => {
  const raw = input(name, attacking);
  return { id, input: raw, ratings: rating.calculate(raw), ownerId: null, mergedInto: null, ...over };
};

describe('CardMatchPanelComponent', () => {
  let fixture: ComponentFixture<CardMatchPanelComponent>;
  let repo: FakePlayerRepositoryService;

  const text = (): string => fixture.nativeElement.textContent as string;
  const button = (label: string): HTMLButtonElement | undefined =>
    [...fixture.nativeElement.querySelectorAll('button')].find((b) =>
      (b as HTMLButtonElement).textContent?.includes(label),
    ) as HTMLButtonElement | undefined;

  beforeEach(async () => {
    localStorage.clear();
    repo = new FakePlayerRepositoryService();
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [CardMatchPanelComponent],
      providers: [{ provide: PlayerRepositoryService, useValue: repo }],
    }).compileComponents();
    fixture = TestBed.createComponent(CardMatchPanelComponent);
  });

  it('öneri yoksa hiçbir şey göstermez — boş bir şerit yer kaplamaz', () => {
    repo.seed([card('havuz-1', 'Ali Yılmaz', 5)]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.match')).toBeNull();
  });

  it('eşleşme varsa şerit çıkar ve sayıyı söyler', () => {
    repo.seed([card('havuz-1', 'Ali Yılmaz', 3), card('kendi-1', 'ali yilmaz', 9, { ownerId: 'user-1' })]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.match')).not.toBeNull();
    expect(text()).toContain('1');
  });

  it('"İncele" iki kartı yan yana açar', () => {
    repo.seed([card('havuz-1', 'Ali Yılmaz', 3), card('kendi-1', 'Ali Yılmaz', 9, { ownerId: 'user-1' })]);
    fixture.detectChanges();

    button('İncele')!.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('app-player-card').length).toBe(2);
    expect(text()).toContain('Kartları eşle');
    expect(text()).toContain('Ayrı kalsınlar');
  });

  it('"Kartları eşle" eşlemeyi uygular ve şerit kapanır', async () => {
    repo.seed([card('havuz-1', 'Ali Yılmaz', 3), card('kendi-1', 'Ali Yılmaz', 9, { ownerId: 'user-1' })]);
    fixture.detectChanges();
    button('İncele')!.click();
    fixture.detectChanges();

    button('Kartları eşle')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(repo.resolveId('havuz-1')).toBe('kendi-1');
    expect(fixture.nativeElement.querySelector('.match')).toBeNull();
    expect(text()).toContain('eşlendi');
  });

  it('"Ayrı kalsınlar" öneriyi kapatır, eşleme YAPMAZ', () => {
    repo.seed([card('havuz-1', 'Ali Yılmaz', 3), card('kendi-1', 'Ali Yılmaz', 9, { ownerId: 'user-1' })]);
    fixture.detectChanges();
    button('İncele')!.click();
    fixture.detectChanges();

    button('Ayrı kalsınlar')!.click();
    fixture.detectChanges();

    expect(repo.resolveId('havuz-1')).toBe('havuz-1');
    expect(fixture.nativeElement.querySelector('.match')).toBeNull();
  });
});
