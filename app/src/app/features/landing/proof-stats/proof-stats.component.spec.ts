import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ProofStatsComponent } from './proof-stats.component';

/**
 * Sayaç: 05:00'ten saniye saniye geri sayar, 00:00'da bir saniye durur ve yeniden 05:00'ten başlar.
 * Zamanlayıcı normalde yalnızca kart ekrandayken açılır; burada doğrudan başlatılıyor.
 */
describe('ProofStatsComponent sayacı', () => {
  let fixture: ComponentFixture<ProofStatsComponent>;
  // Korunan üyelere testten erişim.
  let c: { baslat(): void; durdur(): void; kalan: { set(n: number): void }; sayacMetni(): string; halkaBosluk(): number };

  beforeEach(() => {
    fixture = TestBed.createComponent(ProofStatsComponent);
    c = fixture.componentInstance as unknown as typeof c;
  });

  afterEach(() => c.durdur());

  it('05:00 ile başlar, halka dolu', () => {
    expect(c.sayacMetni()).toBe('05:00');
    expect(c.halkaBosluk()).toBe(0);
  });

  it('her saniye bir azalır', fakeAsync(() => {
    c.baslat();
    tick(1000);
    expect(c.sayacMetni()).toBe('04:59');
    tick(59_000);
    expect(c.sayacMetni()).toBe('04:00');
    c.durdur();
  }));

  it('00:00 görünür, sonraki saniyede yeniden 05:00', fakeAsync(() => {
    c.kalan.set(1);
    c.baslat();
    tick(1000);
    expect(c.sayacMetni()).toBe('00:00');
    expect(c.halkaBosluk()).toBe(100);
    tick(1000);
    expect(c.sayacMetni()).toBe('05:00');
    c.durdur();
  }));
});
