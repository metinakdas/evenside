import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatStepperComponent } from './stat-stepper.component';

describe('StatStepperComponent', () => {
  let fixture: ComponentFixture<StatStepperComponent>;
  let emitted: number[];

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [StatStepperComponent] });
    fixture = TestBed.createComponent(StatStepperComponent);
    fixture.componentRef.setInput('label', 'Kaleci');
    fixture.componentRef.setInput('value', 4);
    emitted = [];
    fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));
    fixture.detectChanges();
  });

  function segments(): HTMLElement[] {
    return [...fixture.nativeElement.querySelectorAll('.stepper__seg')];
  }

  it('renders ten segments and fills them up to the current value', () => {
    const filled = segments().filter((s) => s.hasAttribute('data-on'));

    expect(segments().length).toBe(10);
    expect(filled.length).toBe(4);
  });

  it('emits the clicked segment as the new value', () => {
    segments()[6].click();

    expect(emitted).toEqual([7]);
  });

  it('clicking the current value steps down, so zero is reachable', () => {
    segments()[3].click(); // mevcut değer 4 → 3

    expect(emitted).toEqual([3]);
  });

  it('stays a slider for assistive tech and keyboard users', () => {
    const slider: HTMLElement = fixture.nativeElement.querySelector('.stepper');
    expect(slider.getAttribute('role')).toBe('slider');
    expect(slider.getAttribute('aria-valuenow')).toBe('4');

    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(emitted).toEqual([5]);
  });

  it('does not go past the 0-10 bounds with the keyboard', () => {
    fixture.componentRef.setInput('value', 10);
    fixture.detectChanges();
    const slider: HTMLElement = fixture.nativeElement.querySelector('.stepper');

    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));

    expect(emitted).toEqual([10]);
  });
  // Tur 5 · E15: WAI-ARIA slider deseni Home/End/PageUp/PageDown bekler.
  it('supports Home, End and Page keys', () => {
    const slider: HTMLElement = fixture.nativeElement.querySelector('.stepper');

    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp' }));
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown' }));

    expect(emitted).toEqual([0, 10, 7, 1]);
  });
  // Tur 7 · D4: segmentler ayrı Tab durağı olmamalı; klavye erişimi dıştaki slider'da.
  it('keeps a single tab stop for the whole control', () => {
    const focusable = fixture.nativeElement.querySelectorAll(String.raw`button, [tabindex]:not([tabindex="-1"])`);

    expect(focusable.length).toBe(1);
    expect(focusable[0].getAttribute('role')).toBe('slider');
  });
});
