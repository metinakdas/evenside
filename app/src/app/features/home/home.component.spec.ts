import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { PlayerRepositoryService } from '../../core/services/player-repository.service';
import { MyTeam, SquadInvite, SquadInviteService } from '../../core/services/squad-invite.service';
import { FakePlayerRepositoryService } from '../../core/services/testing/fake-player-repository';
import { HomeComponent } from './home.component';

const squad = (id: string, name: string): SquadInvite => ({
  id,
  ownerId: 'user-1',
  name,
  joinCode: 'ABC123',
  logoImage: null,
});

class FakeInvites {
  readonly myTeams = signal<MyTeam[]>([]);
  /** Testlerin çoğu YÜKLENMİŞ durumu varsayar; yükleme hâli ayrıca test ediliyor. */
  readonly teamsLoaded = signal(true);
  readonly ownSquad = signal<SquadInvite | null>(null);
  readonly members = signal([]);
  readonly error = signal<string | null>(null);
  async loadMyTeams(): Promise<void> {}
  async loadOwnSquad(): Promise<void> {}
  /* Angular 19: effect'ler değişiklik algılamada daha erken çalışıyor; açık takımın üyelerini
     yükleyen effect artık testlerde de tetikleniyor. Sahte servis onu da karşılamalı. */
  async loadMembers(): Promise<void> {}
}

/**
 * Menünün kurgusu iki yere ayrıldı (kullanıcı isteği):
 *  - "Oyna" sekmesindeki birincil kutu = HIZLI YOL. Tek takımı olan kullanıcı tek tıkla
 *    kadrosuna gider; seçilecek bir şey yokken takım listesi bir tık israfıdır.
 *  - "Takımlarım" sekmesi = YÖNETİM. Solda kur/katıl, sağda takımlar.
 */
describe('HomeComponent · takım kurgusu', () => {
  let fixture: ComponentFixture<HomeComponent>;
  let invites: FakeInvites;

  const text = (): string => fixture.nativeElement.textContent as string;
  const button = (label: string): HTMLButtonElement =>
    [...fixture.nativeElement.querySelectorAll('button')].find((b) =>
      (b as HTMLButtonElement).textContent?.includes(label),
    ) as HTMLButtonElement;

  beforeEach(async () => {
    localStorage.clear();
    invites = new FakeInvites();
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        { provide: PlayerRepositoryService, useValue: new FakePlayerRepositoryService() },
        { provide: SquadInviteService, useValue: invites },
        {
          provide: AuthService,
          useValue: { user: () => ({ email: 'a@b.c', id: 'user-1' }), signOut: () => Promise.resolve() },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(HomeComponent);
  });

  it('adresteki sekme parametresiyle açılır — başka ekrandan dönenler yerini kaybetmesin', async () => {
    // Sihirbazdaki "Şimdi değil" menüye /?sekme=takimlar ile döner.
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        { provide: PlayerRepositoryService, useValue: new FakePlayerRepositoryService() },
        { provide: SquadInviteService, useValue: invites },
        {
          provide: AuthService,
          useValue: { user: () => ({ email: 'a@b.c', id: 'user-1' }), signOut: () => Promise.resolve() },
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: new Map([['sekme', 'takimlar']]) } },
        },
      ],
    }).compileComponents();
    const f = TestBed.createComponent(HomeComponent);
    f.detectChanges();

    const active = f.nativeElement.querySelector('.tabs__btn--active') as HTMLElement;
    expect(active.textContent?.trim()).toBe('Takımlarım');
  });

  it('sekme şeridinde "Takımlarım" var, "Kadro" yok', () => {
    fixture.detectChanges();

    const tabs = [...fixture.nativeElement.querySelectorAll('.tabs__btn')].map((b) =>
      (b as HTMLElement).textContent?.trim(),
    );
    expect(tabs).toEqual(['Oyna', 'Takımlarım', 'Takım Geçmişi']);
  });

  it('takımlar yüklenmeden kutu KARAR VERMEZ — yenilemede sıçrama olmaz', () => {
    invites.teamsLoaded.set(false);
    fixture.detectChanges();

    // Ne 'takımın yok' ne de 'kadroya geç': ikisi de veri gelmeden söylenemez.
    expect(text()).not.toContain('TAKIM KUR');
    expect(text()).not.toContain('KADROYA GEÇ');
    expect(fixture.nativeElement.querySelector('.skeleton')).not.toBeNull();

    invites.teamsLoaded.set(true);
    invites.myTeams.set([{ squad: squad('s1', 'Seyir Mobil'), role: 'kurucu' }]);
    fixture.detectChanges();

    expect(text()).toContain('KADROYA GEÇ');
    expect(fixture.nativeElement.querySelector('.skeleton')).toBeNull();
  });

  it('takımı yokken birincil kutu "TAKIM KUR" der', () => {
    fixture.detectChanges();

    expect(text()).toContain('TAKIM KUR');
    expect(text()).not.toContain('TAKIMLARIM');
  });

  it('takımı olan kullanıcıda kutu doğrudan "KADROYA GEÇ" der', () => {
    invites.myTeams.set([{ squad: squad('s1', 'Seyir Mobil'), role: 'kurucu' }]);
    fixture.detectChanges();

    expect(text()).toContain('KADROYA GEÇ');
    expect(text()).toContain('Seyir Mobil');
    expect(button('Kadroya geç')).toBeTruthy();
    // Tek takımda seçici hiç basılmaz: seçilecek bir şey yok.
    expect(fixture.nativeElement.querySelector('.picker')).toBeNull();
  });

  it('birden fazla takımda kutudan takım SEÇİLEBİLİR ve seçim kutuya yansır', () => {
    invites.myTeams.set([
      { squad: squad('s1', 'Seyir Mobil'), role: 'kurucu' },
      { squad: squad('s2', 'Ofis Maçı'), role: 'uye' },
    ]);
    fixture.detectChanges();

    const chips = fixture.nativeElement.querySelectorAll('.picker__chip');
    expect(chips.length).toBe(2);
    // Varsayılan: kurduğu takım.
    expect(text()).toContain('Kadroya geç');

    (chips[1] as HTMLButtonElement).click();
    fixture.detectChanges();

    // Katıldığı takımda da kadroya gidilir, ama yetki farkı metinde ve düğmede söylenir.
    expect(button('Kadroya geç')).toBeFalsy();
    expect(text()).toContain('Kadroya git');
    expect(text()).toContain('görebilirsin ama değiştiremezsin');
  });

  /*
   * İLK KULLANICI: menüde "ne yapacağım" sorusunun cevabı. Kart statik bir karşılama değil,
   * ilerleme çizelgesi — üç adım bitince kendiliğinden kaybolur.
   */
  it('yolun başındaki kullanıcıya hoş geldin kartı ve sıradaki adım gösterilir', async () => {
    invites.myTeams.set([]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('.welcome');
    expect(card).withContext('kart görünmeli').not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.welcome__step').length).toBe(3);
    // Eylemler artık SATIRDA: sıradaki adımda 'Adıma başla' + 'Bu adımı atla'.
    const next = fixture.nativeElement.querySelector('.welcome__step--next');
    expect(next.textContent).toContain('Kartını oluştur');
    expect(next.querySelector('.welcome__start')).not.toBeNull();
    expect(next.querySelector('.welcome__skip')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.welcome__step--next').length).toBe(1);
  });

  /*
   * TAKIMI OLAN KULLANICI yolun başında değildir (kullanıcı isteği): 2. adım uygulamanın
   * eşiği, geçilmişse menüde yol haritası değil kutuların kendisi konuşur. Kalan adımlar
   * (kart, ilk maç) zaten kendi kutularından erişilebiliyor.
   */
  /*
   * Yol haritasındaki KOŞUCU. Hareketin kendisi tarayıcıda ölçüldü (konum, poz, sıçrama);
   * burada ölçülen şey yapının ayakta olması: kart varken koşucu ve ray basılır, kart
   * kapanınca ikisi de gider. Kartla birlikte gitmesi önemli — kalırsa boşlukta duran bir
   * figür olurdu.
   */
  it('yol haritası görünürken koşucu ve ray basılır', async () => {
    invites.myTeams.set([]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.welcome__steps')).withContext('ray şeridi').not.toBeNull();
    expect(fixture.nativeElement.querySelector('.runner')).withContext('koşucu').not.toBeNull();
    expect(fixture.nativeElement.querySelector('.runner__figure')).withContext('piktogram').not.toBeNull();
  });

  it('takımı olan kullanıcıda başlangıç kartı görünmez', async () => {
    invites.myTeams.set([{ squad: squad('s1', 'Seyir Mobil'), role: 'kurucu' }]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.welcome'))
      .withContext('takım varken kart basılmamalı')
      .toBeNull();
  });

  it('"Bu adımı atla" sırayı bir sonraki adıma geçirir, adım listede kalır', async () => {
    invites.myTeams.set([]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const skip = fixture.nativeElement.querySelector('.welcome__step--next .welcome__skip') as HTMLButtonElement;
    skip.click();
    fixture.detectChanges();

    const next = fixture.nativeElement.querySelector('.welcome__step--next');
    expect(next.textContent).withContext('sıra ikinci adıma geçer').toContain('Takımını kur');
    expect(fixture.nativeElement.querySelectorAll('.welcome__step').length).withContext('atlanan adım listede kalır').toBe(3);
    expect(fixture.nativeElement.querySelector('.welcome__step--skipped')).not.toBeNull();
    expect(localStorage.getItem('saha42.welcome.skip.v1::user-1')).toContain('kart');

    // Geri al: adım yeniden sıraya girer.
    (fixture.nativeElement.querySelector('.welcome__step--skipped .welcome__undo') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.welcome__step--next').textContent).toContain('Kartını oluştur');
  });

  it('takım adımı ZORUNLUDUR: atlama sunulmaz', async () => {
    invites.myTeams.set([]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Birinci adımı atla: sıra takım adımına geçer.
    (fixture.nativeElement.querySelector('.welcome__step--next .welcome__skip') as HTMLButtonElement).click();
    fixture.detectChanges();

    const next = fixture.nativeElement.querySelector('.welcome__step--next');
    expect(next.textContent).toContain('Takımını kur');
    expect(next.querySelector('.welcome__skip')).withContext('zorunlu adımda atlama düğmesi olmamalı').toBeNull();
    // 'zorunlu' etiketi kullanıcı isteğiyle kaldırıldı: atlama düğmesinin YOKLUĞU yeterli.
    expect(next.querySelector('.welcome__start')).withContext('başlama yolu durur').not.toBeNull();
  });

  it('her adımın numarasında ipucu vardır', async () => {
    invites.myTeams.set([]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const tips = [...fixture.nativeElement.querySelectorAll('.welcome__num')].map((n) => n.getAttribute('data-tip'));
    expect(tips.length).toBe(3);
    expect(tips.every((tip) => !!tip && tip.length > 30)).toBeTrue();
  });

  it('"Kapat" kartı ŞERİDE indirir, yok etmez', async () => {
    invites.myTeams.set([]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const hide = [...fixture.nativeElement.querySelectorAll('.welcome__actions button')].find(
      (b) => (b as HTMLButtonElement).textContent?.includes('Kapat'),
    ) as HTMLButtonElement;
    hide.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.welcome')).withContext('kart kapanır').toBeNull();
    expect(fixture.nativeElement.querySelector('.welcome-bar'))
      .withContext('yerinde şerit kalır — rehber kaybolmaz')
      .not.toBeNull();
    expect(localStorage.getItem('saha42.welcome.v1::user-1')).toBe('1');

    (fixture.nativeElement.querySelector('.welcome-bar') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.welcome')).withContext('şerit kartı geri açar').not.toBeNull();
  });

  it('açılış daveti ile hoş geldin kartı AYNI ANDA çıkmaz', async () => {
    invites.myTeams.set([]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.welcome')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-onboarding-prompt'))
      .withContext('kart duruyorken modal davet açılmaz')
      .toBeNull();
  });

  it('seçim cihazda hatırlanır', () => {
    invites.myTeams.set([
      { squad: squad('s1', 'Seyir Mobil'), role: 'kurucu' },
      { squad: squad('s2', 'Ofis Maçı'), role: 'uye' },
    ]);
    fixture.detectChanges();
    (fixture.nativeElement.querySelectorAll('.picker__chip')[1] as HTMLButtonElement).click();
    fixture.detectChanges();

    // Anahtar kullanıcıya bağlı: 'saha42.activeTeam.v1::<uid>' (bkz. UserScopeService).
    expect(localStorage.getItem('saha42.activeTeam.v1::user-1')).toBe('s2');
  });

  it('hatırlanan takım artık yoksa kurduğu takıma düşer — kutu boş kalmaz', () => {
    localStorage.setItem('saha42.activeTeam.v1::user-1', 'silinmis-takim');
    invites.myTeams.set([{ squad: squad('s1', 'Seyir Mobil'), role: 'kurucu' }]);
    fixture.detectChanges();

    expect(text()).toContain('Seyir Mobil');
    expect(button('Kadroya geç')).toBeTruthy();
  });

  it('birden fazla takım varsa kutudan "Takımlarım" sekmesine geçiş çıkar', () => {
    invites.myTeams.set([
      { squad: squad('s1', 'Seyir Mobil'), role: 'kurucu' },
      { squad: squad('s2', 'Ofis Maçı'), role: 'uye' },
    ]);
    fixture.detectChanges();

    const jump = button('Takımlarım (2)');
    expect(jump).toBeTruthy();

    jump.click();
    fixture.detectChanges();

    // Sekme değişti: yönetim ekranı ve takım listesi DOĞRUDAN açık.
    // Çoklu takım açık: 'yeni takım oluştur' takımı olsa da geçerli bir eylem.
    expect(text()).toContain('Yeni takım oluştur');
    expect(fixture.nativeElement.querySelector('.tbl')).not.toBeNull();
  });

  it('sol kutuda yalnızca kur/katıl var; düzenle listenin satırında', () => {
    invites.myTeams.set([{ squad: squad('s1', 'Seyir Mobil'), role: 'kurucu' }]);
    fixture.detectChanges();
    button('Takımlarım').click();
    fixture.detectChanges();

    const heroText = (fixture.nativeElement.querySelector('.tile--hero') as HTMLElement).textContent ?? '';
    expect(heroText).toContain('Takıma katıl');
    // Kurma HER ZAMAN mümkün; belirli bir takımı düzenlemek satırın işi.
    expect(heroText).toContain('Yeni takım oluştur');
    expect(heroText).not.toContain('Düzenle');
    expect(fixture.nativeElement.querySelector('.tbl__btn')?.textContent).toContain('Düzenle');
  });

  it('sekme açılır açılmaz takım tablosu görünür ve eylemler satırda olur', () => {
    invites.myTeams.set([
      { squad: squad('s1', 'Seyir Mobil'), role: 'kurucu' },
      { squad: squad('s2', 'Ofis Maçı'), role: 'uye' },
    ]);
    fixture.detectChanges();
    button('Takımlarım').click();
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('.tbl__row');
    expect(rows.length).toBe(3); // başlık + iki takım
    expect(text()).toContain('Seyir Mobil');
    expect(text()).toContain('Ofis Maçı');
    // Kurucu satırında düzenle + kadroya geç; üye satırında yalnızca kadroya git.
    // ('Kartım' beklentisi yanlıştı: o metin açılış davetinin düğmesinden geliyordu.)
    expect(button('Düzenle')).toBeTruthy();
    expect(button('Kadroya geç')).toBeTruthy();
    expect(button('Kadroya git')).toBeTruthy();
  });

  it('kod yalnızca kurucunun satırında görünür', () => {
    invites.myTeams.set([
      { squad: squad('s1', 'Seyir Mobil'), role: 'kurucu' },
      { squad: squad('s2', 'Ofis Maçı'), role: 'uye' },
    ]);
    fixture.detectChanges();
    button('Takımlarım').click();
    fixture.detectChanges();

    const codes = [...fixture.nativeElement.querySelectorAll('.tbl__code')].map((e) => e.textContent.trim());
    expect(codes).toEqual(['ABC123', '—']);
  });

  it('hiç takım yokken sekme kurmaya çağırır ve boş durumu söyler', () => {
    fixture.detectChanges();
    button('Takımlarım').click();
    fixture.detectChanges();

    expect(text()).toContain('Yeni takım oluştur');
    expect(text()).toContain('HENÜZ TAKIM YOK');
    expect(text()).not.toContain('Takımımı düzenle');
  });

  it('yalnızca üye olunan takımda kadro GÖRÜLÜR ama düzenlenemez', () => {
    invites.myTeams.set([{ squad: squad('s2', 'Ofis Maçı'), role: 'uye' }]);
    fixture.detectChanges();

    // Kadro artık sunucuda: üye de görebiliyor, bu yüzden düğme var — ama 'geç' değil 'git'.
    expect(text()).toContain('Kadroya git');
    expect(button('Kadroya geç')).withContext('düzenleme yetkisi yok').toBeFalsy();
    expect(text()).toContain('değiştiremezsin');
  });

  /*
   * TİTREME TESTİ (kullanıcı bildirdi): "adımları tamamlamama rağmen ekran önce yol
   * haritasıyla açılıyor, sonra kayboluyor." Sebep: takım listesi ŞU ANKİ kullanıcı için
   * yüklenmeden karar verilmesiydi — bayrak önceki (oturumsuz) yüklemeden bayat kalıyordu.
   */
  it('takımlar bu kullanıcı için yüklenmeden yol haritası BASILMAZ', () => {
    invites.teamsLoaded.set(false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.welcome'))
      .withContext('yükleme sürerken kart açılıp kapanmamalı')
      .toBeNull();

    // Veri gelince karar verilir: takımı yoksa kart açılır.
    invites.teamsLoaded.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.welcome')).not.toBeNull();
  });

  it('takım verisi geldiğinde takımı olan kullanıcıda kart HİÇ açılmaz', () => {
    invites.teamsLoaded.set(false);
    invites.myTeams.set([{ squad: squad('s1', 'Seyir Mobil'), role: 'kurucu' }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.welcome')).toBeNull();

    invites.teamsLoaded.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.welcome'))
      .withContext('takımı olan kullanıcı "başlangıçta" değildir')
      .toBeNull();
  });
});
