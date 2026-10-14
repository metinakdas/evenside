import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { LandingComponent } from './landing.component';

/*
 * AÇILIŞ SAYFASI. Görünüm tarayıcıda ölçüldü (yerleşim, dokunma hedefleri, 11px alt sınırı);
 * burada ölçülen şey YAPININ ayakta olması: yedi bölümün hepsi basılıyor mu, ana eylem
 * girişe götürüyor mu, SSS gerçekten açılıp kapanıyor mu.
 */
describe('LandingComponent', () => {
  let fixture: ComponentFixture<LandingComponent>;
  const q = (sel: string): Element | null => fixture.nativeElement.querySelector(sel);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LandingComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(LandingComponent);
    fixture.detectChanges();
  });

  it('yedi bölümün hepsini basar', () => {
    for (const bolum of ['#giris', '.proof', '.problem', '#cozum', '#nasil', '#sss', '.final', '.foot']) {
      expect(q(bolum)).withContext(bolum).not.toBeNull();
    }
  });

  it('adım ve soru sayıları beklenen aralıkta; özellik şeridi yok', () => {
    // Özellik şeridi kullanıcı isteğiyle KALDIRILDI ("adalet" bandı + çözüm tek ekran oldu).
    expect(fixture.nativeElement.querySelector('.features, .feature')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.step').length).withContext('en fazla 4 adım').toBeLessThanOrEqual(4);
    expect(fixture.nativeElement.querySelectorAll('.faq__item').length).toBeGreaterThanOrEqual(6);
  });

  it('sağ üstteki "Giriş yap" giriş ekranına götürür', () => {
    const router = TestBed.inject(Router);
    const git = spyOn(router, 'navigateByUrl');

    const btn = [...fixture.nativeElement.querySelectorAll('button')].find(
      (b: HTMLButtonElement) => b.textContent?.trim() === 'Giriş yap',
    ) as HTMLButtonElement;
    expect(btn).withContext('giriş düğmesi').toBeTruthy();
    btn.click();

    expect(git).toHaveBeenCalledWith('/login');
  });

  it('SSS aynı anda tek cevabı açık tutar', () => {
    const sorular = fixture.nativeElement.querySelectorAll('.faq__q');
    expect(fixture.nativeElement.querySelectorAll('.faq__a').length).withContext('başlangıçta bir cevap açık').toBe(1);

    // İkinci soruyu aç: birincisi kapanmalı, toplam yine bir.
    sorular[1].click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.faq__a').length).toBe(1);

    // Aynı soruya tekrar basmak kapatır.
    sorular[1].click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.faq__a').length).toBe(0);
  });

  /*
   * KAYDIRMA EFEKTLERİ. Hareketin KENDİSİ tarayıcıda ölçüldü (yazma, file, dev kelime);
   * burada ölçülen şey iskeletin yerinde olması — bir yeniden düzenlemede sessizce
   * düşmesinler.
   */
  it('kaydırma efektlerinin taşıyıcıları yerinde', () => {
    expect(q('.mesh')).withContext('kaydırırken beliren file').not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.bigword__text').length).toBeGreaterThanOrEqual(1);
    expect(fixture.nativeElement.querySelectorAll('.from-left, .from-right').length)
      .withContext('yandan gelen öğeler').toBeGreaterThanOrEqual(2);
  });

  it('sayfa ekranlara bölünmüş: duraklar ve deste yerinde', () => {
    expect(q('main[appEkranlar]')).withContext('ekran adımlayıcı').not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('[data-ekran]').length).toBeGreaterThanOrEqual(6);
    expect(q('.pains-track[data-ekran="yigin"]')).withContext('deste kart kart').not.toBeNull();
    expect(q('app-adalet-demo[data-ekran="dip"]')).withContext('bant + çözüm tek ekran').not.toBeNull();
  });

  it('dert kartları yığın olarak basılır ve her kartın metni vardır', () => {
    // Yığın DAVRANIŞI tarayıcıda ölçüldü (yapışma, geri çekilme, geri sarma); burada
    // ölçülen, dört kartın da içeriğiyle birlikte ayakta olması.
    const kartlar = fixture.nativeElement.querySelectorAll('.pains .pain');
    expect(kartlar.length).toBe(4);
    for (const kart of kartlar) {
      expect(kart.querySelector('.pain__title')?.textContent?.trim()).withContext('başlık').toBeTruthy();
      expect(kart.querySelector('.pain__text')?.textContent?.trim()).withContext('metin').toBeTruthy();
      expect(kart.querySelector('.pain__sahne .sahne-ui')).withContext('sahne maketi').not.toBeNull();
    }
  });

  it('yazan kelime ekran okuyucuya DURAN metin olarak da verilir', () => {
    // Harf harf değişen metni ekran okuyucu her karede tekrar okur; bu yüzden animasyonlu
    // yüzey aria-hidden, gerçek kelime ayrı bir sr-only kardeşte duruyor.
    const yuzey = q('.hero__accent') as HTMLElement;
    expect(yuzey.getAttribute('aria-hidden')).toBe('true');
    expect(q('.hero__title .sr-only')?.textContent?.trim()).toBeTruthy();
  });

  it('vitrindeki kart GERÇEK reyting hesabıyla üretilir', () => {
    // Elle yazılmış "güzel görünsün" diye şişirilmiş bir kart, ilk kartını çıkaran
    // kullanıcıda hayal kırıklığı olurdu; kart uygulamanın kendi formülünden geliyor.
    const kartlar = fixture.nativeElement.querySelectorAll('app-player-card');
    expect(kartlar.length).toBeGreaterThanOrEqual(2);
    expect(kartlar[0].textContent).withContext('kartta reyting basılı').toMatch(/\d{2}/);
  });
});
