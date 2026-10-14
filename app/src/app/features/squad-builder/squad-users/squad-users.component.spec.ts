import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Player, PlayerInput } from '../../../core/models/player.model';
import { ActiveTeamService } from '../../../core/services/active-team.service';
import { AuthService } from '../../../core/services/auth.service';
import { PlayerRepositoryService } from '../../../core/services/player-repository.service';
import { RatingService } from '../../../core/services/rating.service';
import { MemberRole, MyTeam, SquadInviteService, SquadMember } from '../../../core/services/squad-invite.service';
import { SquadRosterService } from '../../../core/services/squad-roster.service';
import { FakePlayerRepositoryService } from '../../../core/services/testing/fake-player-repository';
import { SquadUsersComponent } from './squad-users.component';
import { ConfirmService } from '../../../core/services/confirm.service';

const rating = new RatingService();
const input = (name: string): PlayerInput => ({
  name, shirtNumber: '', countryCode: 'TR', flagImage: null, photoImage: null, heightCm: 178, weightKg: 74,
  smoker: false, goalkeeping: 2, defending: 5, midfield: 5, attacking: 5, pace: 5, stamina: 5, goalsPerMatch: 0,
});
const card = (id: string, name: string, over: Partial<Player> = {}): Player => {
  const raw = input(name);
  return { id, input: raw, ratings: rating.calculate(raw), ownerId: null, mergedInto: null, ...over };
};
const member = (userId: string, playerId: string, role: MemberRole = 'uye'): SquadMember => ({
  squadId: 't1', userId, playerId, joinedAt: '2026-10-01T10:00:00Z', role,
});

class FakeInvites {
  readonly myTeams = signal<MyTeam[]>([]);
  readonly teamsLoaded = signal(true);
  readonly members = signal<SquadMember[]>([]);
  readonly error = signal<string | null>(null);
  roleCalls: { squadId: string; userId: string; role: MemberRole }[] = [];
  removeCalls: string[] = [];
  async loadMyTeams(): Promise<void> {}
  async loadMembers(): Promise<void> {}
  async setMemberRole(squadId: string, userId: string, role: MemberRole): Promise<boolean> {
    this.roleCalls.push({ squadId, userId, role });
    this.members.update((l) => l.map((m) => (m.userId === userId ? { ...m, role } : m)));
    return true;
  }
  async removeMember(_squadId: string, userId: string): Promise<boolean> {
    this.removeCalls.push(userId);
    this.members.update((l) => l.filter((m) => m.userId !== userId));
    return true;
  }
}

class FakeRoster {
  readonly error = signal<string | null>(null);
  async load(): Promise<string[]> { return []; }
  async save(): Promise<boolean> { return true; }
}

describe('Kullanıcılar sekmesi (yetkiler ve eşleme)', () => {
  let invites: FakeInvites;
  let repo: FakePlayerRepositoryService;
  const me = signal<{ id: string } | null>({ id: 'kurucu-1' });

  const kur = (rol: MyTeam['role'], benim: string) => {
    me.set({ id: benim });
    invites.myTeams.set([{ squad: { id: 't1', ownerId: 'kurucu-1', name: 'QA', joinCode: 'ABC123', logoImage: null }, role: rol }]);
    TestBed.configureTestingModule({
      imports: [SquadUsersComponent],
      providers: [
        { provide: SquadInviteService, useValue: invites },
        { provide: PlayerRepositoryService, useValue: repo },
        { provide: SquadRosterService, useValue: new FakeRoster() },
        { provide: AuthService, useValue: { user: () => me(), ready: Promise.resolve(), session: () => null, isAuthenticated: () => true } },
      ],
    });
    TestBed.inject(ActiveTeamService).select('t1');
    const fixture = TestBed.createComponent(SquadUsersComponent);
    fixture.detectChanges();
    return fixture;
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    invites = new FakeInvites();
    repo = new FakePlayerRepositoryService();
    repo.seed([
      card('havuz-arda', 'Arda Güler'),
      card('kart-arda', 'Arda Güler', { ownerId: 'uye-1' }),
      card('kart-kerem', 'Kerem Aktürkoğlu', { ownerId: 'uye-2' }),
    ]);
    invites.members.set([member('uye-1', 'kart-arda'), member('uye-2', 'kart-kerem', 'yonetici')]);
  });

  it('kurucu herkesi görür: kendisi + iki üye, rolleriyle', () => {
    const f = kur('kurucu', 'kurucu-1');
    const rows = [...f.nativeElement.querySelectorAll('.row')] as HTMLElement[];
    expect(rows.length).toBe(3);
    const roller = [...f.nativeElement.querySelectorAll('.row .chip')].map((c) => (c as HTMLElement).textContent!.trim());
    expect(roller).toEqual(['Kurucu', 'Yönetici', 'Üye']);
  });

  it('KURUCU yetki verir/alır; işlem sunucu kapısından (setMemberRole) geçer', async () => {
    const f = kur('kurucu', 'kurucu-1');
    const butonlar = () => [...f.nativeElement.querySelectorAll('.row__actions .act')] as HTMLButtonElement[];
    const yap = butonlar().find((b) => b.textContent!.includes('Yönetici yap'))!;
    yap.click();
    await f.whenStable();
    f.detectChanges();
    expect(invites.roleCalls).toEqual([{ squadId: 't1', userId: 'uye-1', role: 'yonetici' }]);
    const al = butonlar().find((b) => b.textContent!.includes('Yetkiyi al'))!;
    expect(al).toBeTruthy();
  });

  it('KURUCU üyeyi ONAYLA çıkarır: "emin misin" sorulur, vazgeçince hiçbir şey olmaz', async () => {
    const f = kur('kurucu', 'kurucu-1');
    const onay = TestBed.inject(ConfirmService);
    const cikar = () => [...f.nativeElement.querySelectorAll('.act')].find((b) => (b as HTMLElement).textContent!.includes('Takımdan çıkar')) as HTMLButtonElement;

    cikar().click();
    expect(onay.pending()?.title).toContain('emin misin');
    expect(invites.removeCalls).withContext('onaysız çıkarma olmamalı').toEqual([]);
    onay.answer(false);
    await f.whenStable();
    expect(invites.removeCalls).withContext('vazgeçince çıkarılmamalı').toEqual([]);

    cikar().click();
    onay.answer(true);
    await f.whenStable();
    expect(invites.removeCalls.length).toBe(1);
  });

  it('YÖNETİCİ rol veremez ve üye çıkaramaz (düğmeler yok); eşleme uyarısını görür', () => {
    const f = kur('yonetici', 'uye-2');
    expect(f.nativeElement.querySelectorAll('.row__actions').length).toBe(0);
    expect(f.nativeElement.querySelectorAll('.match').length).toBe(1);
  });

  it('ÜYE yalnızca listeyi görür: ne yetki düğmesi ne eşleme uyarısı', () => {
    const f = kur('uye', 'uye-1');
    expect(f.nativeElement.querySelectorAll('.row__actions').length).toBe(0);
    expect(f.nativeElement.querySelectorAll('.match').length).toBe(0);
    expect(f.nativeElement.querySelector('.users__code')).toBeNull();
    expect(f.nativeElement.querySelector('.row__me')).toBeTruthy();
  });

  it('EŞLEME: katılan üyenin kartı havuzdaki aynı adlı kartla eşleşince kurucuda uyarı + "Ayrı kalsın" kalıcı', () => {
    const f = kur('kurucu', 'kurucu-1');
    const uyari = f.nativeElement.querySelector('.match') as HTMLElement;
    expect(uyari.textContent).toContain('Arda Güler');
    const ayri = [...uyari.querySelectorAll('button')].find((b) => b.textContent!.includes('Ayrı kalsın'))!;
    ayri.click();
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('.match').length).toBe(0);
  });
});
