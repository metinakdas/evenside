import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PlayerRepositoryService } from '../../../core/services/player-repository.service';
import { BLANK_PLAYER_INPUT, SquadStore } from '../../../core/services/squad-store.service';
import { FakePlayerRepositoryService } from '../../../core/services/testing/fake-player-repository';
import { SquadListComponent } from './squad-list.component';
import { ConfirmService } from '../../../core/services/confirm.service';
import { RatingService } from '../../../core/services/rating.service';
import { Player } from '../../../core/models/player.model';

/**
 * Bu bileşen artık "kadro + havuz" ızgarası değil, yalnızca HAVUZ listesi (Tur 4 · Bölüm 4):
 * kadro orta kolonda yuva ızgarası olarak duruyor, havuz sağ kolonda kayan bir liste.
 */
describe('SquadListComponent', () => {
  let fixture: ComponentFixture<SquadListComponent>;
  let store: SquadStore;
  let fakeRepo: FakePlayerRepositoryService;

  beforeEach(() => {
    localStorage.clear();
    fakeRepo = new FakePlayerRepositoryService();
    TestBed.configureTestingModule({
      imports: [SquadListComponent],
      providers: [{ provide: PlayerRepositoryService, useValue: fakeRepo }],
    });
    fixture = TestBed.createComponent(SquadListComponent);
    store = TestBed.inject(SquadStore);
    fixture.detectChanges();
  });

  function rowNames(): string[] {
    return [...fixture.nativeElement.querySelectorAll('.pool__name')].map((el: HTMLElement) =>
      (el.textContent ?? '').trim(),
    );
  }

  function takeButton(name: string): HTMLButtonElement | undefined {
    return [...fixture.nativeElement.querySelectorAll('.pool__take')].find(
      (el: HTMLElement) => el.getAttribute('aria-label') === `${name} — kadroya ekle`,
    );
  }

  it('lists only the players who are not in the squad', async () => {
    await store.savePlayer({ ...BLANK_PLAYER_INPUT, name: 'Zaten Kadroda' });
    await fakeRepo.create({ ...BLANK_PLAYER_INPUT, name: 'Havuzda Bekleyen' });
    fixture.detectChanges();

    expect(rowNames()).toEqual(['Havuzda Bekleyen']);
  });

  it('the "+" button adds the player to the squad without creating a new record', async () => {
    const player = await fakeRepo.create({ ...BLANK_PLAYER_INPUT, name: 'Seçilecek Oyuncu' });
    fixture.detectChanges();

    takeButton('Seçilecek Oyuncu')?.click();
    fixture.detectChanges();

    expect(store.squadPlayerIds()).toContain(player.id);
    expect(fakeRepo.players().length).toBe(1);
  });

  it('clicking the name opens that player for editing', async () => {
    const player = await fakeRepo.create({ ...BLANK_PLAYER_INPUT, name: 'Düzenlenecek' });
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.pool__name').click();
    fixture.detectChanges();

    expect(store.editingPlayerId()).toBe(player.id);
  });

  it('"+ Yeni oyuncu" opens the create panel via the store (creatingNew)', () => {
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.pool__add-new');
    btn.click();

    expect(store.formOpen()).toBeTrue();
    expect(store.editingPlayerId()).toBeNull();
  });

  it('filters accent-insensitively (Tur 3 · B2)', async () => {
    await fakeRepo.create({ ...BLANK_PLAYER_INPUT, name: 'Uğur Doğan' });
    await fakeRepo.create({ ...BLANK_PLAYER_INPUT, name: 'Berk Şimşek' });
    fixture.detectChanges();

    const search: HTMLInputElement = fixture.nativeElement.querySelector('.pool__search');
    search.value = 'dogan';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(rowNames()).toEqual(['Uğur Doğan']);
  });
  // Tur 5 · E9: arama yalnızca havuzu tarıyordu; kadrodaki eşleşmeler "yok" sanılıyordu.
  it('surfaces matching squad members too, under their own group', async () => {
    await store.savePlayer({ ...BLANK_PLAYER_INPUT, name: 'Uğur Doğan' });
    await fakeRepo.create({ ...BLANK_PLAYER_INPUT, name: 'Berk Şimşek' });
    fixture.detectChanges();

    const search: HTMLInputElement = fixture.nativeElement.querySelector('.pool__search');
    search.value = 'dogan';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.pool__group')?.textContent).toContain('Kadroda');
    expect(rowNames()).toEqual(['Uğur Doğan']);
    expect(fixture.nativeElement.querySelector('.pool__empty')).toBeNull();
  });

  /*
   * AYNI KİŞİNİN İKİ KARTI (kullanıcı geri bildirimi, 11 Ekim 2026): "Metin Akdaş" satırında ⚠
   * vardı ama kartlar ÇOKTAN eşlenmişti (eşlenmiş kopya havuzda gizli ama uyarı onu sayıyordu);
   * eşlenmemiş çiftte ise ⚠ hiçbir eylem sunmuyordu. Kural: "aynı karttan varsa uyarı ve eşleme".
   */
  const kart = (id: string, ad: string, over: Partial<Player> = {}): Player => {
    const input = { ...BLANK_PLAYER_INPUT, name: ad };
    return { id, input, ratings: new RatingService().calculate(input), ownerId: null, mergedInto: null, ...over };
  };
  const satir = (ad: string): HTMLElement =>
    [...fixture.nativeElement.querySelectorAll('.pool__row')].find((r: HTMLElement) => r.textContent?.includes(ad));

  it('eşlenmiş kopya "aynı ad" uyarısı DOĞURMAZ', () => {
    fakeRepo.seed([
      kart('kendi', 'Metin Akdaş', { ownerId: 'u1' }),
      kart('elle', 'Metin Akdaş', { mergedInto: 'kendi' }),
    ]);
    fixture.detectChanges();

    expect(rowNames().filter((n) => n === 'Metin Akdaş').length).toBe(1);
    expect(satir('Metin Akdaş').querySelector('.pool__dupe')).toBeNull();
  });

  it('elle eklenmiş kart ile aynı adlı kendi kartı EŞLEME eylemi sunar ve onayla eşler', async () => {
    fakeRepo.seed([
      kart('kendi', 'Ali Yılmaz', { ownerId: 'u1' }),
      kart('elle', 'Ali Yılmaz'),
    ]);
    fixture.detectChanges();

    const dugmeler = fixture.nativeElement.querySelectorAll('.pool__dupe--esle');
    expect(dugmeler.length).withContext('iki satırda da eşleme düğmesi').toBe(2);

    const onay = spyOn(TestBed.inject(ConfirmService), 'choose').and.resolveTo('onay');
    (dugmeler[0] as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(onay).toHaveBeenCalled();
    expect(fakeRepo.players().find((p) => p.id === 'elle')?.mergedInto).toBe('kendi');
    expect(rowNames().filter((n) => n === 'Ali Yılmaz').length).withContext('havuzda tek kart kalır').toBe(1);
    expect(fixture.nativeElement.querySelector('.pool__dupe')).toBeNull();
  });

  it('onaydan vazgeçilirse eşleme yapılmaz', async () => {
    fakeRepo.seed([kart('kendi', 'Ali Yılmaz', { ownerId: 'u1' }), kart('elle', 'Ali Yılmaz')]);
    fixture.detectChanges();
    spyOn(TestBed.inject(ConfirmService), 'choose').and.resolveTo(null);

    fixture.nativeElement.querySelector('.pool__dupe--esle').click();
    await fixture.whenStable();

    expect(fakeRepo.players().find((p) => p.id === 'elle')?.mergedInto).toBeFalsy();
  });

  it('iki elle eklenmiş aynı adlı kart yalnızca UYARI alır (eşlenecek sahipli kart yok)', () => {
    fakeRepo.seed([kart('a', 'Veli Kaya'), kart('b', 'Veli Kaya')]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.pool__dupe').length).toBe(2);
    expect(fixture.nativeElement.querySelector('.pool__dupe--esle')).toBeNull();
  });

  /* Aynı ad aynı kişi değil: "iki farklı insan olabilir, illa eşlemek zorunda değiliz". */
  it('"Ayrı kişiler" eşlemez; öneri ve uyarı susar, bir daha sorulmaz', async () => {
    fakeRepo.seed([kart('kendi', 'Ali Yılmaz', { ownerId: 'u1' }), kart('elle', 'Ali Yılmaz')]);
    fixture.detectChanges();
    spyOn(TestBed.inject(ConfirmService), 'choose').and.resolveTo('ayri');

    fixture.nativeElement.querySelector('.pool__dupe--esle').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fakeRepo.players().find((p) => p.id === 'elle')?.mergedInto).toBeFalsy();
    expect(rowNames().filter((n) => n === 'Ali Yılmaz').length).withContext('iki ayrı oyuncu kalır').toBe(2);
    expect(fixture.nativeElement.querySelector('.pool__dupe')).withContext('uyarı susar').toBeNull();
  });

  it('"Adını değiştir" elle eklenen kartın formunu açar, eşlemez', async () => {
    fakeRepo.seed([kart('kendi', 'Ali Yılmaz', { ownerId: 'u1' }), kart('elle', 'Ali Yılmaz')]);
    fixture.detectChanges();
    spyOn(TestBed.inject(ConfirmService), 'choose').and.resolveTo('ad');

    fixture.nativeElement.querySelector('.pool__dupe--esle').click();
    await fixture.whenStable();

    expect(store.editingPlayerId()).toBe('elle');
    expect(fakeRepo.players().find((p) => p.id === 'elle')?.mergedInto).toBeFalsy();
  });
});
