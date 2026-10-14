import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PitchSlot } from '../../../core/models/pitch.model';
import { Player } from '../../../core/models/player.model';
import { PitchComponent } from './pitch.component';

function makePlayer(id: string, overall = 70): Player {
  return {
    id,
    input: {
      name: id,
      shirtNumber: '9',
      countryCode: 'TR',
      flagImage: null,
      photoImage: null,
      heightCm: 180,
      weightKg: 75,
      smoker: false,
      goalkeeping: 0,
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
      goalkeeping: overall,
      position: 'OS',
      overall,
      tier: 'silver',
    },
  };
}

function makeSlot(side: 'A' | 'B', player: Player | null, x = 50, line = 1): PitchSlot {
  return { side, mevki: 'OS', x, y: 50, line, player, fit: player ? 'own' : null };
}

describe('PitchComponent', () => {
  let fixture: ComponentFixture<PitchComponent>;

  const p1 = makePlayer('p1');
  const p2 = makePlayer('p2');
  const p3 = makePlayer('p3');

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PitchComponent] });
    fixture = TestBed.createComponent(PitchComponent);
    fixture.componentRef.setInput('slotsA', [makeSlot('A', p1, 40), makeSlot('A', p3, 60)]);
    fixture.componentRef.setInput('slotsB', [makeSlot('B', p2, 50)]);
    fixture.componentRef.setInput('editable', true);
    fixture.detectChanges();
  });

  function cardFor(playerId: string): HTMLElement {
    return fixture.nativeElement.querySelector(`.pitch__card[data-player-id="${playerId}"]`);
  }

  function removeBtnFor(playerId: string): HTMLButtonElement {
    return cardFor(playerId).querySelector('.pitch__remove')!;
  }

  function isSelected(playerId: string): boolean {
    return cardFor(playerId).classList.contains('pitch__card--selected');
  }

  it('clicking two players on different teams emits a swap request, then clears the selection', () => {
    const swaps: { a: string; b: string }[] = [];
    fixture.componentInstance.swapRequested.subscribe((e) => swaps.push(e));

    cardFor('p1').click();
    cardFor('p2').click();
    fixture.detectChanges();

    expect(swaps).toEqual([{ a: 'p1', b: 'p2' }]);
    expect(isSelected('p1')).toBeFalse();
    expect(isSelected('p2')).toBeFalse();
  });

  it('clicking a second player on the SAME team moves the selection instead of swapping', () => {
    const swaps: { a: string; b: string }[] = [];
    fixture.componentInstance.swapRequested.subscribe((e) => swaps.push(e));

    cardFor('p1').click();
    cardFor('p3').click();
    fixture.detectChanges();

    expect(swaps.length).toBe(0);
    expect(isSelected('p1')).toBeFalse();
    expect(isSelected('p3')).toBeTrue();
  });

  it('clicking the same player twice deselects it', () => {
    cardFor('p1').click();
    fixture.detectChanges();
    expect(isSelected('p1')).toBeTrue();

    cardFor('p1').click();
    fixture.detectChanges();
    expect(isSelected('p1')).toBeFalse();
  });

  it('does nothing when not editable', () => {
    fixture.componentRef.setInput('editable', false);
    fixture.detectChanges();
    const swaps: { a: string; b: string }[] = [];
    fixture.componentInstance.swapRequested.subscribe((e) => swaps.push(e));

    cardFor('p1').click();
    cardFor('p2').click();

    expect(swaps.length).toBe(0);
  });

  it('the remove button emits removeRequested and clears a matching selection, without triggering a swap', () => {
    const removed: string[] = [];
    const swaps: { a: string; b: string }[] = [];
    fixture.componentInstance.removeRequested.subscribe((id) => removed.push(id));
    fixture.componentInstance.swapRequested.subscribe((e) => swaps.push(e));

    cardFor('p1').click();
    fixture.detectChanges();
    removeBtnFor('p1').click();
    fixture.detectChanges();

    expect(removed).toEqual(['p1']);
    expect(swaps.length).toBe(0);
    expect(isSelected('p1')).toBeFalse();
  });

  it('renders a visible × remove button per player card in edit mode', () => {
    expect(fixture.nativeElement.querySelectorAll('.pitch__remove').length).toBe(3); // p1, p2, p3
  });

  it('does not render remove buttons when not editable', () => {
    fixture.componentRef.setInput('editable', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.pitch__remove').length).toBe(0);
  });

  describe('card size adapts to its OWN rendered width, not the viewport (regression: cards overlapped in a narrow column on a wide monitor)', () => {
    afterEach(() => {
      fixture.nativeElement.remove();
    });

    async function waitForResize(): Promise<void> {
      // ResizeObserver geri çağrısı setTimeout tabanlı değil, gerçek bir bekleme gerekir.
      await new Promise((resolve) => setTimeout(resolve, 80));
    }

    // Saha en-boy oranını koruyarak kabına sığdığı için ölçüm KABIN YÜKSEKLİĞİNE de bağlı:
    // yükseklik verilmezse saha (ve dolayısıyla genişliği) sıfıra çöker. Bu yüzden test
    // kabı hem genişlik hem yükseklik veriyor.
    it('switches to micro cards when its own box is narrow, even though nothing about the viewport changed', async () => {
      document.body.appendChild(fixture.nativeElement);
      fixture.nativeElement.style.display = 'block';
      fixture.nativeElement.style.height = '1200px';
      fixture.nativeElement.style.width = '300px';
      fixture.detectChanges();
      await waitForResize();
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.card');
      expect(card.classList.contains('card--micro')).toBeTrue();
    });

    it('stays on mini cards when its own box is comfortably wide', async () => {
      document.body.appendChild(fixture.nativeElement);
      fixture.nativeElement.style.display = 'block';
      fixture.nativeElement.style.height = '1100px';
      fixture.nativeElement.style.width = '900px';
      fixture.detectChanges();
      await waitForResize();
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.card');
      expect(card.classList.contains('card--mini')).toBeTrue();
    });
  });
});
