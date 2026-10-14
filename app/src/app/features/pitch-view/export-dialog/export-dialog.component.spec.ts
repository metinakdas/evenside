import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatchDetails } from '../../../core/models/match-details.model';
import { ExportDialogComponent } from './export-dialog.component';

/**
 * "İndir" popup'ı: saha ve başlama vakti ZORUNLU; tarih+saat tek alanda ve alanın herhangi bir
 * yerine tıklamak takvimi açar (kullanıcı isteği — tarayıcı varsayılanında yalnızca simge açar).
 */
describe('ExportDialogComponent', () => {
  let fixture: ComponentFixture<ExportDialogComponent>;

  const input = (type: string) => fixture.nativeElement.querySelector(`input[type="${type}"]`) as HTMLInputElement;
  const setValue = (el: HTMLInputElement, value: string) => {
    el.value = value;
    el.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [ExportDialogComponent] }).compileComponents();
    fixture = TestBed.createComponent(ExportDialogComponent);
    fixture.detectChanges();
  });

  it('alanlar boşken ne kaydeder ne indirir; hataları gösterir', () => {
    const emitted: { details: MatchDetails; download: boolean }[] = [];
    fixture.componentInstance.confirmed.subscribe((d) => emitted.push(d));

    (fixture.nativeElement.querySelector('.ui-btn--primary') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(emitted.length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('.field__error').length).toBe(2);
  });

  it('"Kaydet ve indir" bilgiyi indirme isteğiyle yayar', () => {
    const emitted: { details: MatchDetails; download: boolean }[] = [];
    fixture.componentInstance.confirmed.subscribe((d) => emitted.push(d));

    setValue(input('text'), 'Yıldız Halı Saha');
    setValue(input('datetime-local'), '2026-09-13T21:00');
    (fixture.nativeElement.querySelector('.ui-btn--primary') as HTMLButtonElement).click();

    expect(emitted).toEqual([
      { details: { venue: 'Yıldız Halı Saha', kickoff: '2026-09-13T21:00' }, download: true },
    ]);
  });

  it('"Yalnızca kaydet" aynı bilgiyi indirmeden yayar', () => {
    const emitted: { details: MatchDetails; download: boolean }[] = [];
    fixture.componentInstance.confirmed.subscribe((d) => emitted.push(d));

    setValue(input('text'), 'Yıldız Halı Saha');
    setValue(input('datetime-local'), '2026-09-13T21:00');
    const saveOnly = [...fixture.nativeElement.querySelectorAll('.dialog__foot button')].find(
      (b) => (b as HTMLButtonElement).textContent?.includes('Yalnızca kaydet'),
    ) as HTMLButtonElement;
    saveOnly.click();

    expect(emitted).toEqual([
      { details: { venue: 'Yıldız Halı Saha', kickoff: '2026-09-13T21:00' }, download: false },
    ]);
  });

  it('alana tıklamak takvimi açar (showPicker)', () => {
    const el = input('datetime-local') as HTMLInputElement & { showPicker: () => void };
    let opened = 0;
    el.showPicker = () => opened++;

    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(opened).toBe(1);
  });

  it('tarayıcı showPicker desteklemiyorsa tıklama hata vermez', () => {
    const el = input('datetime-local') as HTMLInputElement & { showPicker?: () => void };
    el.showPicker = () => {
      throw new Error('desteklenmiyor');
    };

    expect(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true }))).not.toThrow();
  });
});
