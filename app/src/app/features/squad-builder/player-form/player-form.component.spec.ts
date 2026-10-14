import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoticeService } from '../../../core/services/notice.service';
import { PlayerRepositoryService } from '../../../core/services/player-repository.service';
import { BLANK_PLAYER_INPUT, SquadStore } from '../../../core/services/squad-store.service';
import { FakePlayerRepositoryService } from '../../../core/services/testing/fake-player-repository';
import { PlayerFormComponent } from './player-form.component';

describe('PlayerFormComponent', () => {
  let fixture: ComponentFixture<PlayerFormComponent>;
  let store: SquadStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [PlayerFormComponent],
      providers: [{ provide: PlayerRepositoryService, useValue: new FakePlayerRepositoryService() }],
    });
    fixture = TestBed.createComponent(PlayerFormComponent);
    store = TestBed.inject(SquadStore);
    fixture.detectChanges();
  });

  function nameInput(): HTMLInputElement {
    return fixture.nativeElement.querySelector('input.input');
  }

  it('loads the raw input into the form when editing starts (regression: prototype zeroed stats on edit)', async () => {
    const saved = await store.savePlayer({ ...BLANK_PLAYER_INPUT, name: 'Test Oyuncu', heightCm: 190 });

    store.startEditing(saved!.id);
    fixture.detectChanges();

    expect(nameInput().value).toBe('Test Oyuncu');
  });

  it('resets the form to blank when editing is cancelled', async () => {
    const saved = await store.savePlayer({ ...BLANK_PLAYER_INPUT, name: 'Test Oyuncu' });
    store.startEditing(saved!.id);
    fixture.detectChanges();

    store.cancelEditing();
    fixture.detectChanges();

    expect(nameInput().value).toBe('');
  });

  it('no longer shows the removed country-code/flag fields, and the photo field is a styled button (not the bare native input)', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('Ülke kodu');
    expect(text).not.toContain('Bayrak');

    // Fotoğraf alanı artık düğme değil, 72x72 bırakma alanı (Tur 4 · Bölüm 5.3).
    const dropZone: HTMLElement = fixture.nativeElement.querySelector('.avatar__drop');
    expect(dropZone).not.toBeNull();
    const hiddenInput: HTMLInputElement = fixture.nativeElement.querySelector('.upload-input');
    expect(hiddenInput.type).toBe('file');
  });

  /** Ad yazar ve son adıma kadar "İleri" der (yeni oyuncu akışı). */
  function adYazVeSonAdimaGit(ad: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(nameInput(), ad);
    nameInput().dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const c = fixture.componentInstance;
    for (let i = 0; i < 5; i++) c.nextStep();
    fixture.detectChanges();
  }

  it('SIRALI: ad yazılmadan ikinci adıma geçilmez, hata gösterilir', () => {
    const c = fixture.componentInstance;
    c.nextStep();
    fixture.detectChanges();
    expect(c.stepIndex()).toBe(0);
    expect(fixture.nativeElement.querySelector('.field__error')?.textContent).toBeTruthy();
  });

  it('SIRALI: adım çubuğunda açılmamış adımlar kilitli, tıklamak bir şey yapmaz', () => {
    const items = [...fixture.nativeElement.querySelectorAll('.stepper__item')] as HTMLButtonElement[];
    expect(items[0].disabled).toBeFalse();
    expect(items.slice(1).every((b) => b.disabled)).toBeTrue();
    items[3].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.stepIndex()).toBe(0);
  });

  it('KAYDET YALNIZCA SONDA: son adımdan önce submit kaydetmez, bir sonraki adıma götürür', async () => {
    const c = fixture.componentInstance;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(nameInput(), 'Erken Kayıt');
    nameInput().dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const once = store.players().length;
    await c.submit();
    expect(c.canSubmitHere()).toBeFalse();
    expect(c.stepIndex()).toBe(1);
    expect(store.players().length).toBe(once);
  });

  it('BAŞARILI KAYIT: oyuncu kaydedilir, pencere kapanır, form ve adımlar sıfırlanır, bildirim çıkar', async () => {
    const notices = TestBed.inject(NoticeService);
    const spy = spyOn(notices, 'success').and.callThrough();
    store.startCreating();
    fixture.detectChanges();
    adYazVeSonAdimaGit('Yeni Oyuncu');
    const c = fixture.componentInstance;
    expect(c.isLastStep()).toBeTrue();
    expect(c.canSubmitHere()).toBeTrue();

    await c.submit();
    fixture.detectChanges();

    expect(store.players().some((p) => p.input.name === 'Yeni Oyuncu')).toBeTrue();
    expect(store.formOpen()).toBeFalse();
    expect(c.stepIndex()).toBe(0);
    expect(nameInput().value).toBe('');
    expect(fixture.nativeElement.querySelectorAll('.stepper__item--done').length).toBe(0);
    expect(spy).toHaveBeenCalled();
    expect(spy.calls.mostRecent().args[0]).toContain('Yeni Oyuncu');
  });

  it('DÜZENLEME: adımlar serbest ve Güncelle her adımda; kaydedince pencere kapanır', async () => {
    const saved = await store.savePlayer({ ...BLANK_PLAYER_INPUT, name: 'Var Olan' });
    store.startEditing(saved!.id);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    expect(c.canSubmitHere()).toBeTrue();
    const items = [...fixture.nativeElement.querySelectorAll('.stepper__item')] as HTMLButtonElement[];
    expect(items.every((b) => !b.disabled)).toBeTrue();
    await c.submit();
    expect(store.formOpen()).toBeFalse();
  });
  it("an old card (no sub-skills) opens WITHOUT being marked as unsaved", async () => {
    const saved = await store.savePlayer({ ...BLANK_PLAYER_INPUT, name: "Eski Kart" });
    store.startEditing(saved!.id);
    fixture.detectChanges();
    expect(fixture.componentInstance.isDirty()).toBeFalse();
  });

  it("changing a sub-skill updates the card and re-derives the legacy fields the balancer reads", () => {
    const c = fixture.componentInstance;
    const before = (c as unknown as { previewPlayer: () => { ratings: { shooting: number } } }).previewPlayer().ratings.shooting;
    c.setSkill("bitiricilik", 10);
    c.setSkill("sutGucu", 10);
    c.setSkill("uzaktanSut", 10);
    fixture.detectChanges();
    const p = (c as unknown as { previewPlayer: () => { input: { attacking: number; skills?: { bitiricilik: number } }; ratings: { shooting: number } } }).previewPlayer();
    expect(p.ratings.shooting).toBeGreaterThan(before);
    expect(p.input.skills?.bitiricilik).toBe(10);
    expect(p.input.attacking).toBe(10);
    expect(c.isDirty()).toBeTrue();
  });

  it("each skill step shows a concrete behaviour example for the chosen level", () => {
    const btn = [...fixture.nativeElement.querySelectorAll(".stepper__item")] as HTMLButtonElement[];
    expect(btn.length).toBe(6);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(nameInput(), 'Hücumcu');
    nameInput().dispatchEvent(new Event('input'));
    fixture.componentInstance.nextStep();
    fixture.componentInstance.nextStep(); // Hücum
    fixture.detectChanges();
    const anchors = fixture.nativeElement.querySelectorAll(".skill__anchor");
    expect(anchors.length).toBe(4);
    expect((anchors[0] as HTMLElement).textContent!.trim().length).toBeGreaterThan(5);
  });
  it("ileri/geri adımlar arasında gezer, gezilen adım işaretlenir ve formu temizlemek başa döndürür", () => {
    const c = fixture.componentInstance;
    expect(c.isFirstStep()).toBeTrue();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(nameInput(), 'Gezen');
    nameInput().dispatchEvent(new Event('input'));
    c.nextStep();
    c.nextStep();
    fixture.detectChanges();
    expect(c.stepIndex()).toBe(2);
    expect(c.stepCaption()).toContain("3/6");
    const done = fixture.nativeElement.querySelectorAll(".stepper__item--done");
    expect(done.length).toBe(2);
    c.prevStep();
    expect(c.stepIndex()).toBe(1);
    c.reset();
    fixture.detectChanges();
    expect(c.isFirstStep()).toBeTrue();
    expect(fixture.nativeElement.querySelectorAll(".stepper__item--done").length).toBe(0);
  });

  it("her becerinin yanında seviye adı yazar (sayının ne demek olduğu)", () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(nameInput(), 'Bant');
    nameInput().dispatchEvent(new Event('input'));
    fixture.componentInstance.nextStep();
    fixture.detectChanges();
    const bands = [...fixture.nativeElement.querySelectorAll(".skill__band")].map((e) => (e as HTMLElement).textContent!.trim());
    expect(bands.length).toBe(5);
    for (const b of bands) expect(["Zayıf", "Orta", "İyi", "Çok iyi"]).toContain(b);
  });

  /** Kimlik adımındaki sayısal alana (sıra: boy, kilo, yaş) metin yazar. */
  function sayiYaz(sira: number, metin: string): HTMLInputElement {
    const el = fixture.nativeElement.querySelectorAll('.row--three input')[sira] as HTMLInputElement;
    el.value = metin;
    el.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    return el;
  }

  it('SAYI: boy/kilo alanına eksi, harf ve "e" yazılamaz; yalnızca rakam kalır', () => {
    expect(sayiYaz(0, '-1e8a0').value).toBe('180');
    expect(sayiYaz(1, '7.5').value).toBe('75');
  });

  it('SAYI: yazarken değer sınıra ÇEKİLMEZ ("1" yazınca 100\'e dönmez)', () => {
    const el = sayiYaz(0, '1');
    expect(el.value).toBe('1');
    sayiYaz(0, '18');
    expect(sayiYaz(0, '185').value).toBe('185');
    expect((fixture.componentInstance as unknown as { form: () => { heightCm: number } }).form().heightCm).toBe(185);
  });

  it('SAYI: aralık dışı boy/kilo/yaş hata verir ve İleri adımı geçirmez', () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(nameInput(), 'Sayı Testi');
    nameInput().dispatchEvent(new Event('input'));
    sayiYaz(0, '50');
    sayiYaz(1, '300');
    sayiYaz(2, '5');
    const c = fixture.componentInstance;
    c.nextStep();
    fixture.detectChanges();
    expect(c.stepIndex()).toBe(0);
    const hatalar = fixture.nativeElement.querySelectorAll('.row--three .field__error');
    expect(hatalar.length).toBe(3);
    sayiYaz(0, '180');
    sayiYaz(1, '80');
    sayiYaz(2, '');
    c.nextStep();
    expect(c.stepIndex()).toBe(1);
  });

  it('BOŞ KART: yeni oyuncuda beceri adımına gelmeden kart değer göstermez', () => {
    const kart = () => fixture.nativeElement.querySelector('.preview .card__rating')?.textContent?.trim();
    expect(kart()).toBe('–');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(nameInput(), 'Dolu');
    nameInput().dispatchEvent(new Event('input'));
    fixture.componentInstance.nextStep();
    fixture.detectChanges();
    expect(kart()).toMatch(/^\d+$/);
  });

  it('KALE: "hiç kaleye geçemez" işaretlenince kalecilik becerileri sıfırlanır, kart KAL olamaz', () => {
    const c = fixture.componentInstance;
    c.setNoKeeper(true);
    fixture.detectChanges();
    const p = (c as unknown as { previewPlayer: () => { input: { noKeeper?: boolean; skills?: { refleks: number } }; ratings: { position: string; goalkeeping: number } } }).previewPlayer();
    expect(p.input.noKeeper).toBeTrue();
    expect(p.input.skills?.refleks).toBe(0);
    expect(p.ratings.position).not.toBe('KAL');
    expect(p.ratings.goalkeeping).toBe(1);
  });
});
