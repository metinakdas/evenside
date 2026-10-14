import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Player } from '../../../core/models/player.model';
import { TeamInfo } from '../../../core/models/team.model';
import { TeamLineupCardComponent } from './team-lineup-card.component';

function makePlayer(id: string, name: string, position: Player['ratings']['position'], overall = 70): Player {
  return {
    id,
    input: {
      name,
      shirtNumber: '9',
      countryCode: 'TR',
      flagImage: null,
      photoImage: null,
      heightCm: 180,
      weightKg: 75,
      smoker: false,
      goalkeeping: position === 'KAL' ? 60 : 10,
      defending: 0,
      midfield: 0,
      attacking: 0,
      pace: 0,
      stamina: 0,
      goalsPerMatch: 0,
    },
    ratings: {
      pace: overall,
      shooting: overall,
      passing: overall,
      dribbling: overall,
      defending: overall,
      physical: overall,
      goalkeeping: position === 'KAL' ? 60 : 10,
      position,
      overall,
      tier: 'silver',
    },
  };
}

const TEAM: TeamInfo = { side: 'A', name: 'Takım A', color: '#d81f27', logoImage: null };

const SIX_PLAYERS: Player[] = [
  makePlayer('p1', 'Koray Yılmaz', 'KAL', 66),
  makePlayer('p2', 'Furkan Demir', 'DEF', 78),
  makePlayer('p3', 'Mert Kaya', 'DEF', 69),
  makePlayer('p4', 'Volkan Şahin', 'OS', 60),
  makePlayer('p5', 'Cihan Öz', 'OS', 84),
  makePlayer('p6', 'Deniz Aydın', 'FOR', 69),
];

/** Gerçek tarayıcıdaki tıklama: aynı noktada pointerdown + pointerup. */
function tapMarker(el: HTMLElement, pointerId = 5): void {
  const at = { clientX: 120, clientY: 120 };
  el.dispatchEvent(new PointerEvent('pointerdown', { pointerId, button: 0, bubbles: true, ...at }));
  window.dispatchEvent(new PointerEvent('pointerup', { pointerId, ...at }));
}

describe('TeamLineupCardComponent', () => {
  let fixture: ComponentFixture<TeamLineupCardComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TeamLineupCardComponent] });
    fixture = TestBed.createComponent(TeamLineupCardComponent);
    fixture.componentRef.setInput('side', 'A');
    fixture.componentRef.setInput('team', TEAM);
    fixture.componentRef.setInput('players', SIX_PLAYERS);
    fixture.componentRef.setInput('format', 6);
    fixture.detectChanges();
  });

  it('renders one jersey marker per player, defaulting to the format\'s first formation preset', () => {
    const markers = fixture.nativeElement.querySelectorAll('.marker__jersey');
    expect(markers.length).toBe(6);
    const options = fixture.nativeElement.querySelectorAll('.lineup__select option');
    expect(options[0].textContent.trim()).toBe('2-2-1');
  });

  it('switching the formation re-lays out the same players under the new preset', () => {
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('.lineup__select');
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
    setter.call(select, '3-1-1');
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    // Hâlâ 6 oyuncu, hâlâ üst üste binme yok (tek bir mevki başına en fazla bir kart).
    expect(fixture.nativeElement.querySelectorAll('.marker__jersey').length).toBe(6);
  });

  it('rating badges are hidden by default and appear once "Rating göster" is toggled', () => {
    expect(fixture.nativeElement.querySelectorAll('.marker__rating').length).toBe(0);

    const toggle: HTMLInputElement = fixture.nativeElement.querySelector('.lineup__switch');
    toggle.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.marker__rating').length).toBe(6);
  });

  /**
   * Tıklama şablondaki `(click)` ile DEĞİL, hareketsiz biten bir işaretçi hareketiyle
   * tespit edilir: `pointerdown`'daki `preventDefault()` tarayıcının `click` olayını
   * susturuyor (kullanıcı geri bildirimi: "oyuncuya tıklayınca hiçbir şey olmuyor" —
   * `.click()` çağıran birim test bunu yakalamamıştı).
   */
  it('hareketsiz bir işaretçi hareketi playerClicked yayar', () => {
    const clicked: string[] = [];
    fixture.componentInstance.playerClicked.subscribe((id) => clicked.push(id));

    tapMarker(fixture.nativeElement.querySelector('.marker__jersey'));

    expect(clicked.length).toBe(1);
  });

  it('sürükleme (5px üstü hareket) playerClicked YAYMAZ', () => {
    const clicked: string[] = [];
    fixture.componentInstance.playerClicked.subscribe((id) => clicked.push(id));

    const jersey: HTMLElement = fixture.nativeElement.querySelector('.marker__jersey');
    jersey.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, clientX: 100, clientY: 100, button: 0, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: 160, clientY: 140 }));
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, clientX: 160, clientY: 140 }));

    expect(clicked.length).toBe(0);
  });

  /**
   * Eylem satırı DOM'da her zaman var (hover ile açılabilsin diye), görünürlüğü CSS'te:
   * seçili oyuncuda `--open` sınıfıyla açık, diğerlerinde kapalı.
   */
  it('eylem satırı yalnızca seçili oyuncuda açık durur', () => {
    expect(fixture.nativeElement.querySelectorAll('.marker__actions').length).toBe(6);
    expect(fixture.nativeElement.querySelectorAll('.marker__actions--open').length).toBe(0);

    const firstId = (fixture.nativeElement.querySelector('.marker__jersey') as HTMLElement).dataset['playerId']!;
    fixture.componentRef.setInput('selectedPlayerId', firstId);
    fixture.detectChanges();

    // Opaklık geçiş hâlinde ölçüldüğü için sınıfa bakılıyor; görünürlük kuralı CSS'te.
    const open = fixture.nativeElement.querySelectorAll('.marker__actions--open');
    expect(open.length).toBe(1);
    // Sahada TEK eylem var: takas. Düzenleme ve çıkarma `/squad` ekranında (kullanıcı isteği).
    expect(open[0].querySelectorAll('.marker__act').length).toBe(1);
  });

  it('⇄ düğmesi swapRequested yayar', () => {
    const swaps: string[] = [];
    const firstId = (fixture.nativeElement.querySelector('.marker__jersey') as HTMLElement).dataset['playerId']!;
    fixture.componentRef.setInput('selectedPlayerId', firstId);
    fixture.detectChanges();
    fixture.componentInstance.swapRequested.subscribe((id) => swaps.push(id));

    (fixture.nativeElement.querySelector('.marker__act--swap') as HTMLButtonElement).click();

    expect(swaps).toEqual([firstId]);
  });

  it('takas hedefi modunda karşı kadronun oyuncuları işaretlenir', () => {
    expect(fixture.nativeElement.querySelectorAll('.marker__jersey--target').length).toBe(0);
    fixture.componentRef.setInput('swapTargetsActive', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.marker__jersey--target').length).toBe(6);
  });

  it('editing the team name commits a trimmed value on Enter, and does nothing on Escape', () => {
    const changed: string[] = [];
    fixture.componentInstance.nameChanged.subscribe((n) => changed.push(n));

    fixture.nativeElement.querySelector('.lineup__name').click();
    fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('.lineup__name-input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, '  Yıldırım FK  ');
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();

    expect(changed).toEqual(['Yıldırım FK']);
    expect(fixture.nativeElement.querySelector('.lineup__name-input')).toBeNull(); // düzenleme kapandı

    fixture.nativeElement.querySelector('.lineup__name').click();
    fixture.detectChanges();
    const input2: HTMLInputElement = fixture.nativeElement.querySelector('.lineup__name-input');
    setter.call(input2, 'İptal olacak');
    input2.dispatchEvent(new Event('input'));
    input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(changed).toEqual(['Yıldırım FK']); // ikinci düzenleme Escape ile iptal oldu, yayılmadı
  });

  it('exposes the current formation/rating state publicly for the parent\'s single combined download', () => {
    expect(Array.isArray(fixture.componentInstance.currentFormationLines())).toBeTrue();
    expect(fixture.componentInstance.currentShowRating()).toBeFalse();

    const toggle: HTMLInputElement = fixture.nativeElement.querySelector('.lineup__switch');
    toggle.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.currentShowRating()).toBeTrue();
  });

  describe('pointer-based drag (native HTML5 drag-and-drop is NOT used — bkz. kullanıcı geri bildirimi)', () => {
    afterEach(() => {
      fixture.nativeElement.remove();
    });

    it('dragging a jersey and dropping it INSIDE its own pitch gives it a real, freeform position', () => {
      document.body.appendChild(fixture.nativeElement);
      fixture.nativeElement.style.width = '400px';
      fixture.nativeElement.style.height = '700px'; // saha artık YÜKSEKLİĞE göre boyutlanıyor (bkz. cardWidthPx), kesin bir yükseklik lazım
      fixture.detectChanges();

      const jersey: HTMLElement = fixture.nativeElement.querySelector('.marker__jersey');
      const marker: HTMLElement = jersey.closest('.marker')!;
      const pitchEl: HTMLElement = fixture.nativeElement.querySelector('.lineup__pitch');
      const startRect = jersey.getBoundingClientRect();
      const pitchRect = pitchEl.getBoundingClientRect();
      const targetX = pitchRect.left + pitchRect.width * 0.5;
      const targetY = pitchRect.top + pitchRect.height * 0.85;

      jersey.dispatchEvent(
        new PointerEvent('pointerdown', { clientX: startRect.left, clientY: startRect.top, pointerId: 1, bubbles: true }),
      );
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: targetX, clientY: targetY, pointerId: 1 }));
      fixture.detectChanges();
      expect(marker.classList.contains('marker--dragging')).toBeTrue();

      window.dispatchEvent(new PointerEvent('pointerup', { clientX: targetX, clientY: targetY, pointerId: 1 }));
      fixture.detectChanges();

      expect(marker.classList.contains('marker--dragging')).toBeFalse();
      const topPercent = parseFloat(marker.style.top);
      expect(topPercent).toBeGreaterThan(70);
      expect(topPercent).toBeLessThan(100);
    });

    it('dropping OUTSIDE its own pitch, onto a foreign player element, requests a swap instead of moving locally', () => {
      document.body.appendChild(fixture.nativeElement);
      fixture.nativeElement.style.width = '300px';
      fixture.nativeElement.style.height = '700px'; // saha artık YÜKSEKLİĞE göre boyutlanıyor (bkz. cardWidthPx), kesin bir yükseklik lazım
      fixture.detectChanges();

      const pitchEl: HTMLElement = fixture.nativeElement.querySelector('.lineup__pitch');
      const pitchRect = pitchEl.getBoundingClientRect();
      const foreign = document.createElement('div');
      foreign.setAttribute('data-player-id', 'foreign-1');
      Object.assign(foreign.style, {
        position: 'fixed',
        left: `${pitchRect.right + 30}px`,
        top: `${pitchRect.top + 10}px`,
        width: '20px',
        height: '20px',
      });
      document.body.appendChild(foreign);

      const swaps: { fromId: string; toId: string }[] = [];
      fixture.componentInstance.dragSwapRequested.subscribe((e) => swaps.push(e));

      const jersey: HTMLElement = fixture.nativeElement.querySelector('.marker__jersey');
      const playerId = jersey.getAttribute('data-player-id')!;
      const startRect = jersey.getBoundingClientRect();
      const dropX = pitchRect.right + 40;
      const dropY = pitchRect.top + 20;

      jersey.dispatchEvent(
        new PointerEvent('pointerdown', { clientX: startRect.left, clientY: startRect.top, pointerId: 1, bubbles: true }),
      );
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: dropX, clientY: dropY, pointerId: 1 }));
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: dropX, clientY: dropY, pointerId: 1 }));
      fixture.detectChanges();

      expect(swaps).toEqual([{ fromId: playerId, toId: 'foreign-1' }]);

      foreign.remove();
    });
  });

  it('shows a photo instead of a jersey when the player has one', () => {
    const withPhoto = [...SIX_PLAYERS];
    withPhoto[0] = { ...withPhoto[0], input: { ...withPhoto[0].input, photoImage: 'data:image/png;base64,xx' } };
    fixture.componentRef.setInput('players', withPhoto);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.marker__photo')).not.toBeNull();
  });
});
