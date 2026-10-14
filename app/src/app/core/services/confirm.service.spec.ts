import { ConfirmService } from './confirm.service';

describe('ConfirmService (silme/çıkarma onayı)', () => {
  it('onay → true, vazgeç → false döner', async () => {
    const svc = new ConfirmService();
    const evet = svc.ask({ title: 'A', message: 'm', confirmLabel: 'Sil', danger: true });
    expect(svc.pending()?.danger).toBeTrue();
    svc.answer(true);
    expect(await evet).toBeTrue();
    expect(svc.pending()).toBeNull();

    const hayir = svc.ask({ title: 'B', message: 'm', confirmLabel: 'Sil' });
    svc.answer(false);
    expect(await hayir).toBeFalse();
  });

  it('ikinci soru gelince birincisi VAZGEÇİLMİŞ sayılır (iki pencere üst üste açılmaz)', async () => {
    const svc = new ConfirmService();
    const ilk = svc.ask({ title: '1', message: '', confirmLabel: 'x' });
    const ikinci = svc.ask({ title: '2', message: '', confirmLabel: 'y' });
    expect(await ilk).toBeFalse();
    expect(svc.pending()?.title).toBe('2');
    svc.answer(true);
    expect(await ikinci).toBeTrue();
  });

  it('bekleyen soru yokken answer bir şey yapmaz', () => {
    const svc = new ConfirmService();
    expect(() => svc.answer(true)).not.toThrow();
  });
});
