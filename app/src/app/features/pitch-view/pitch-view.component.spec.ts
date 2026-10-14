import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { PlayerRepositoryService } from '../../core/services/player-repository.service';
import { FakePlayerRepositoryService } from '../../core/services/testing/fake-player-repository';
import { BLANK_PLAYER_INPUT, SquadStore } from '../../core/services/squad-store.service';
import { PitchViewComponent } from './pitch-view.component';

/**
 * `/pitch` ekranındaki ELLE müdahale: bir oyuncuyu seçip karşı takımdan biriyle takas etmek.
 * Düzenleme ve kadrodan çıkarma bu ekranda YOK (kullanıcı isteği) — ikisi de `/squad`'da.
 */
describe('PitchViewComponent — elle müdahale', () => {
  let fixture: ComponentFixture<PitchViewComponent>;
  let store: SquadStore;

  /** `protected` üyelere testten erişim — şablonun kullandığı yüzeyin aynısı. */
  function api(): {
    selection: { set: (v: { id: string; side: 'A' | 'B' } | null) => void; (): unknown };
    selected: () => { player: { id: string } } | null;
    onMarkerClick: (id: string, side: 'A' | 'B') => void;
    startSwap: (id: string, side: 'A' | 'B') => void;
    cancelSwap: () => void;
    swapMode: () => boolean;
    clearSelection: () => void;
    onEscape: () => void;
  } {
    return fixture.componentInstance as unknown as ReturnType<typeof api>;
  }

  beforeEach(async () => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PitchViewComponent],
      providers: [provideRouter([]), { provide: PlayerRepositoryService, useValue: new FakePlayerRepositoryService() }],
    });
    store = TestBed.inject(SquadStore);
    // 6v6 = 12 oyunculuk dolu bir kadro; ekran kura sonucuyla açılıyor.
    store.setFormat(6);
    for (let i = 0; i < 12; i++) {
      await store.savePlayer({ ...BLANK_PLAYER_INPUT, name: `Oyuncu ${i + 1}`, pace: (i % 10) + 1, defending: ((i * 3) % 10) + 1 });
    }
    store.computeDraw();
    fixture = TestBed.createComponent(PitchViewComponent);
    fixture.detectChanges();
  });

  /**
   * Kullanıcının bildirdiği hata: "oyuncuya tıklayınca hiçbir şey olmuyor". Sebep, formanın
   * `pointerdown`'unda `preventDefault()` çağrılması — tarayıcı `click` üretmiyordu, ama
   * birim testler `.click()`'i doğrudan çağırdığı için yeşil kalıyordu. Bu test GERÇEK
   * etkileşimi taklit eder: aynı noktada pointerdown + pointerup.
   */
  it('sahadaki bir oyuncuya tıklamak takas düğmesini açar', () => {
    const jersey = fixture.nativeElement.querySelector('.marker__jersey') as HTMLElement;
    expect(fixture.nativeElement.querySelector('.marker__actions--open')).toBeNull();

    jersey.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 3, button: 0, clientX: 120, clientY: 120, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 3, clientX: 120, clientY: 120 }));
    fixture.detectChanges();

    const open = fixture.nativeElement.querySelector('.marker__actions--open');
    expect(open).not.toBeNull();
    // Tek eylem: ⇄ takas.
    expect(open.querySelectorAll('.marker__act').length).toBe(1);
  });

  it('seçim yokken eylem şeridi boş, seçimle birlikte oyuncuyu bildirir', () => {
    expect(api().selected()).toBeNull();

    const first = store.players()[0];
    const side = store.teamOfMap()[first.id] as 'A' | 'B';
    api().onMarkerClick(first.id, side);
    expect(api().selected()?.player.id).toBe(first.id);
  });

  it('⇄ takas modunu açar, karşı kadrodan tıklama takası tamamlar ve modu kapatır', () => {
    const a = store.teamAPlayers()[0];
    const b = store.teamBPlayers()[0];

    api().startSwap(a.id, 'A');
    expect(api().swapMode()).toBeTrue();

    api().onMarkerClick(b.id, 'B');

    expect(store.teamAPlayers().some((p) => p.id === b.id)).toBeTrue();
    expect(store.teamBPlayers().some((p) => p.id === a.id)).toBeTrue();
    expect(api().swapMode()).toBeFalse();
    expect(api().selected()).toBeNull();
  });

  it('takas modu olmadan da iki farklı takımdan seçim takas eder', () => {
    const teamA = store.teamAPlayers();
    const teamB = store.teamBPlayers();
    const a = teamA[0];
    const b = teamB[0];

    api().onMarkerClick(a.id, 'A');
    api().onMarkerClick(b.id, 'B');

    expect(store.teamAPlayers().some((p) => p.id === b.id)).toBeTrue();
    expect(store.teamBPlayers().some((p) => p.id === a.id)).toBeTrue();
    expect(api().selected()).toBeNull();
  });

  it('boş bir yere tıklamak seçimi bırakır (⇄ kaybolur)', () => {
    const jersey = fixture.nativeElement.querySelector('.marker__jersey') as HTMLElement;
    jersey.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 4, button: 0, clientX: 120, clientY: 120, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 4, clientX: 120, clientY: 120 }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.marker__actions--open')).not.toBeNull();

    // Sahanın dışında, herhangi bir boş nokta:
    document.body.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, button: 0, bubbles: true }));
    fixture.detectChanges();

    expect(api().selected()).toBeNull();
    expect(fixture.nativeElement.querySelector('.marker__actions--open')).toBeNull();
  });

  it('Esc seçimi bırakır', () => {
    const first = store.players()[0];
    api().onMarkerClick(first.id, store.teamOfMap()[first.id] as 'A' | 'B');
    api().onEscape();
    expect(api().selected()).toBeNull();
  });


  /* Kayıttan sonra iş bitti: "Ana menüye git" birincil eylem olarak çıkar (kullanıcı isteği, 11 Ekim 2026). */
  it('maç kaydedilmeden "Ana menüye git" yok; kaydedince çıkar ve ana menüye götürür', async () => {
    expect(fixture.nativeElement.querySelector('.download-both--menu')).toBeNull();

    const kayit = fixture.componentInstance as unknown as {
      confirmExport: (e: { details: { venue: string; kickoff: string }; download: boolean }) => Promise<void>;
    };
    await kayit.confirmExport({ details: { venue: 'Test Sahası', kickoff: '2026-10-12T21:00' }, download: false });
    fixture.detectChanges();

    const dugme: HTMLButtonElement = fixture.nativeElement.querySelector('.download-both--menu');
    expect(dugme).withContext('kayıttan sonra düğme çıkmalı').not.toBeNull();
    expect(fixture.nativeElement.querySelector('.download-both--ikincil')).withContext('indir ikincile iner').not.toBeNull();

    const git = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    dugme.click();
    expect(git).toHaveBeenCalledWith('/');
  });

  /* Üst çubuk rol bazlı (11 Ekim 2026): herkes menüye döner; yalnızca kurucu/yönetici kadroyu
     düzenler ve kurayı yeniden çeker. Logo da ana menüye götürür. */
  const ustDugmeler = (): string[] =>
    [...fixture.nativeElement.querySelectorAll('.topbar__actions .chip-btn')].map((b: HTMLElement) => (b.textContent ?? '').trim());

  it('düzenleyebilen kullanıcı: kurayı yenile + kadroyu düzenle + menüye dön; logo ana menüye bağlı', () => {
    const d = ustDugmeler();
    expect(d.length).toBe(3);
    expect(d[d.length - 1]).toContain('Menüye dön');
    expect(fixture.nativeElement.querySelector('a.topbar__brand')?.getAttribute('href')).toBe('/');
  });

  it('üye: yalnızca "Menüye dön"', () => {
    // Mağazanın yetki sinyalini üyeye çevirip bileşeni yeniden kur (OnPush: sonradan değiştirmek ekranı tazelemez).
    (store as unknown as { canEditSquad: () => boolean }).canEditSquad = signal(false);
    fixture.destroy();
    fixture = TestBed.createComponent(PitchViewComponent);
    fixture.detectChanges();
    const d = ustDugmeler();
    expect(d.length).toBe(1);
    expect(d[0]).toContain('Menüye dön');
  });
});
