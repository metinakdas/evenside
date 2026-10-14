import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SquadInvite, SquadInviteService, SquadMember } from '../../../core/services/squad-invite.service';
import { ActiveTeamService } from '../../../core/services/active-team.service';
import { SquadIdentityComponent } from './squad-identity.component';

const invite: SquadInvite = {
  id: 's1',
  ownerId: 'user-1',
  name: 'Seyir Mobil',
  joinCode: 'JC3EPH',
  logoImage: null,
};

const member = (userId: string): SquadMember => ({
  squadId: 's1',
  userId,
  playerId: 'p-' + userId,
  joinedAt: new Date().toISOString(),
  role: 'uye',
});

/** Ağa gitmeyen dublör; bileşen yalnızca bu yüzeyi kullanıyor. */
class FakeInvites {
  /** Panel artık aktif takımı gösteriyor; dublör de takım listesini sunmalı. */
  readonly myTeams = signal([{ squad: invite, role: 'kurucu' as const }]);
  readonly teamsLoaded = signal(true);
  readonly ownSquad = signal<SquadInvite | null>(invite);
  /** Testler yüklenmiş durumu varsayar; yükleme hâli ayrıca test ediliyor. */
  readonly ownSquadLoaded = signal(true);
  readonly members = signal<SquadMember[]>([]);
  readonly error = signal<string | null>(null);
  async loadOwnSquad(): Promise<void> {}
  /* Angular 19: effect'ler değişiklik algılamada daha erken çalışıyor; açık takımın üyelerini
     yükleyen effect artık testlerde de tetikleniyor. Sahte servis onu da karşılamalı. */
  async loadMembers(): Promise<void> {}
  async createTeam(): Promise<SquadInvite | null> {
    return invite;
  }
  async renameTeam(): Promise<SquadInvite | null> {
    return invite;
  }
}

describe('SquadIdentityComponent', () => {
  let fixture: ComponentFixture<SquadIdentityComponent>;
  let invites: FakeInvites;

  const text = (): string => fixture.nativeElement.textContent as string;
  const toggle = (): HTMLButtonElement => fixture.nativeElement.querySelector('.identity__btn');

  beforeEach(async () => {
    invites = new FakeInvites();
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [SquadIdentityComponent],
      providers: [{ provide: SquadInviteService, useValue: invites }],
    }).compileComponents();
    // Aktif takım = paneldeki takım; /kadro hangi takım seçiliyse onun kadrosunu açıyor.
    TestBed.inject(ActiveTeamService).select(invite.id);
    fixture = TestBed.createComponent(SquadIdentityComponent);
  });

  it('yüklenmeden "Adsız / Ad ver" demez — panel bir an yanlış bilgi göstermez', () => {
    invites.ownSquadLoaded.set(false);
    invites.teamsLoaded.set(false);
    fixture.detectChanges();

    expect(text()).not.toContain('Adsız');
    expect(text()).not.toContain('Ad ver');
    expect(text()).not.toContain('Düzenle');
  });

  it('kapalıyken ad ve katılan sayısını gösterir, katılma kodunu GÖSTERMEZ', () => {
    invites.members.set([member('a'), member('b')]);
    fixture.detectChanges();

    expect(text()).toContain('Seyir Mobil');
    expect(text()).toContain('2 kişi kodla katıldı');
    // Kod yalnızca panel açıkken görünür (kullanıcı isteği) — sol kolonda yer kaplamasın.
    expect(text()).not.toContain('JC3EPH');
  });

  it('kimse katılmadıysa sayı yerine durumu yazar', () => {
    fixture.detectChanges();
    expect(text()).toContain('Henüz kimse katılmadı');
  });

  it('"Düzenle" katılma kodunu ve ad alanını açar', () => {
    fixture.detectChanges();
    expect(toggle().textContent).toContain('Düzenle');

    toggle().click();
    fixture.detectChanges();

    expect(text()).toContain('JC3EPH');
    expect(fixture.nativeElement.querySelector('.identity__field')).not.toBeNull();
    expect(toggle().textContent).toContain('Kapat');
  });

  it('"Kapat" paneli geri toplar', () => {
    fixture.detectChanges();
    toggle().click();
    fixture.detectChanges();
    toggle().click();
    fixture.detectChanges();

    expect(text()).not.toContain('JC3EPH');
    expect(fixture.nativeElement.querySelector('.identity__field')).toBeNull();
    // Sayı kapalıyken de durmaya devam eder.
    expect(text()).toContain('Henüz kimse katılmadı');
  });

  it('takım yoksa "Ad ver" der ve kod alanı hiç yoktur', () => {
    invites.ownSquad.set(null);
    invites.myTeams.set([]);
    TestBed.inject(ActiveTeamService).select(null);
    fixture.detectChanges();

    expect(toggle().textContent).toContain('Ad ver');
    expect(text()).not.toContain('Katılma kodu');
  });
});
