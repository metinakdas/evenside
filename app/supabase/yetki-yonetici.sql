-- ===========================================================================
-- TAKIM YETKİLERİ — "yönetici" rolü (10 Ekim 2026)
-- ===========================================================================
-- Kural (kullanıcı isteği): koda katılan normal üye kadroya oyuncu EKLEYEMEZ, ÇIKARAMAZ,
-- DÜZENLEYEMEZ. Takımı kuran kişi (sahip) bir üyeye "yönetici" yetkisi verirse o üye kadro
-- üzerinde sahip gibi çalışır. Rolü YALNIZCA sahip verir/alır.
--
-- İlkeler (OWASP Authorization Cheat Sheet; Supabase RLS rehberleri):
--   * Varsayılan YASAK: yeni üye 'uye' rolüyle başlar.
--   * Yetki SUNUCUDA zorlanır; arayüzde düğme gizlemek yalnızca kullanım kolaylığıdır.
--   * Kullanıcı kendi rol satırını değiştiremez (yoksa bütün model çöker): bu tabloda üyenin
--     kendi satırını güncelleme politikası VAR (kart değiştirmek için), bu yüzden rol ve kimlik
--     sütunları ayrıca bir tetikleyiciyle kilitleniyor.
--   * Tek merkezî kontrol: is_squad_admin() — sahip VEYA yönetici. Bütün politikalar onu çağırır.
--   * Yalnızca sahibe kalanlar: rol vermek/almak, üye çıkarmak, takımın adı/kodu/silinmesi.
--
-- Supabase SQL düzenleyicisinde bir kez çalıştırın (yorumsuz sürüm: yetki-yonetici.YAPISTIR.sql).
-- ===========================================================================

-- 1) Rol sütunu: varsayılan 'uye'.
alter table public.squad_members
  add column if not exists role text not null default 'uye';

alter table public.squad_members drop constraint if exists squad_members_role_check;
alter table public.squad_members
  add constraint squad_members_role_check check (role in ('uye', 'yonetici'));

-- 2) Merkezî kontrol: çağıran kişi bu takımın sahibi ya da yöneticisi mi.
--    security definer: RLS döngüsünü kırar (politikalar squad_members'ı okuyor).
create or replace function public.is_squad_admin(p_squad uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.squads s where s.id = p_squad and s.owner_id = (select auth.uid())
  ) or exists (
    select 1 from public.squad_members m
    where m.squad_id = p_squad and m.user_id = (select auth.uid()) and m.role = 'yonetici'
  )
$fn$;

revoke all on function public.is_squad_admin(uuid) from public, anon;
grant execute on function public.is_squad_admin(uuid) to authenticated;

-- 3) Üyelik satırı kilidi.
--    * Rolü yalnızca takım SAHİBİ değiştirebilir (üye kendini yönetici yapamaz).
--    * Yeni satır her zaman 'uye' rolüyle doğar (katılırken rol seçilemez).
--    * Takım ve kullanıcı sütunları değişmez; kartı (player_id) yalnızca üyenin kendisi değiştirir.
create or replace function public.enforce_member_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  sahip_mi boolean;
begin
  select exists (
    select 1 from public.squads s where s.id = new.squad_id and s.owner_id = (select auth.uid())
  ) into sahip_mi;

  if tg_op = 'INSERT' then
    if new.role <> 'uye' and not sahip_mi then
      raise exception 'Rol yalnizca takim sahibi tarafindan verilir' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.squad_id <> old.squad_id or new.user_id <> old.user_id then
    raise exception 'Uyelik tasinamaz' using errcode = '42501';
  end if;
  if new.role is distinct from old.role and not sahip_mi then
    raise exception 'Rol yalnizca takim sahibi tarafindan degistirilir' using errcode = '42501';
  end if;
  if new.player_id is distinct from old.player_id and old.user_id <> (select auth.uid()) then
    raise exception 'Uyenin kartini yalnizca kendisi degistirir' using errcode = '42501';
  end if;
  -- Üye kendi satırına BAŞKASININ kartını yazamaz (kartı takıma sokup görünür kılmak olurdu).
  if new.player_id is distinct from old.player_id and new.player_id is not null and not exists (
    select 1 from public.players p where p.id = new.player_id and p.owner_id = (select auth.uid())
  ) then
    raise exception 'Uyelige yalnizca kendi kartin yazilir' using errcode = '42501';
  end if;
  return new;
end
$fn$;

drop trigger if exists squad_members_guard on public.squad_members;
create trigger squad_members_guard
  before insert or update on public.squad_members
  for each row execute function public.enforce_member_row();

-- 4) Rol verme/alma: tek kapı, yalnızca sahip.
create or replace function public.set_member_role(p_squad uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if (select auth.uid()) is null then
    raise exception 'Oturum yok' using errcode = '42501';
  end if;
  if p_role not in ('uye', 'yonetici') then
    raise exception 'Gecersiz rol' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.squads s where s.id = p_squad and s.owner_id = (select auth.uid())
  ) then
    raise exception 'Rolu yalnizca takim sahibi degistirir' using errcode = '42501';
  end if;
  update public.squad_members set role = p_role
  where squad_id = p_squad and user_id = p_user;
  if not found then
    raise exception 'Bu takimda boyle bir uye yok' using errcode = 'PT404';
  end if;
end
$fn$;

revoke all on function public.set_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;

-- 5) Kadro yazımı: sahip VEYA yönetici.
create or replace function public.save_squad_roster(p_squad uuid, p_players uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_squad_admin(p_squad) then
    raise exception 'Bu kadroyu degistirme yetkin yok' using errcode = '42501';
  end if;
  delete from public.squad_players where squad_id = p_squad;
  insert into public.squad_players (squad_id, player_id, sort_order)
  select p_squad, x.pid, x.ord::int - 1
  from unnest(p_players) with ordinality as x(pid, ord);
end
$fn$;

revoke all on function public.save_squad_roster(uuid, uuid[]) from public, anon;
grant execute on function public.save_squad_roster(uuid, uuid[]) to authenticated;

drop policy if exists "squad_players_insert_owner" on public.squad_players;
drop policy if exists "squad_players_insert_admin" on public.squad_players;
create policy "squad_players_insert_admin"
  on public.squad_players for insert to authenticated
  with check (public.is_squad_admin(squad_id));

drop policy if exists "squad_players_update_owner" on public.squad_players;
drop policy if exists "squad_players_update_admin" on public.squad_players;
create policy "squad_players_update_admin"
  on public.squad_players for update to authenticated
  using (public.is_squad_admin(squad_id))
  with check (public.is_squad_admin(squad_id));

drop policy if exists "squad_players_delete_owner" on public.squad_players;
drop policy if exists "squad_players_delete_admin" on public.squad_players;
create policy "squad_players_delete_admin"
  on public.squad_players for delete to authenticated
  using (public.is_squad_admin(squad_id));

-- 6) Kart düzenleme: kartın sahibi, oluşturanı, ya da kartın KADROSUNDA olduğu ya da bir
--    ÜYENİN kartı olduğu takımın sahibi/yöneticisi. (Sahiplik değişimini players_owner_guard
--    tetikleyicisi zaten kilitliyor.)
drop policy if exists "players_update_visible" on public.players;
create policy "players_update_visible"
  on public.players for update to authenticated
  using (
    owner_id = (select auth.uid())
    or created_by = (select auth.uid())
    or exists (
      select 1 from public.squad_players sp
      where sp.player_id = players.id and public.is_squad_admin(sp.squad_id)
    )
  )
  with check (true);

-- 7) Kart eşleme: sahip yerine sahip VEYA yönetici.
create or replace function public.enforce_card_merge()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  hedef_sahip uuid;
  yonetebilirim boolean;
  takimda_uyeyim boolean;
begin
  if new.merged_into is null then
    return new;
  end if;
  if new.merged_into = new.id then
    raise exception 'Kart kendine eslenemez' using errcode = '22023';
  end if;
  if new.owner_id is not null then
    raise exception 'Sahipli kart baska bir karta eslenemez' using errcode = '42501';
  end if;
  select owner_id into hedef_sahip from public.players where id = new.merged_into;
  if hedef_sahip is null then
    raise exception 'Eslenecek kartin bir sahibi olmali' using errcode = '42501';
  end if;

  -- Kaynak kart, çağıranın yönettiği (sahip/yönetici) bir takımın kadrosunda mı.
  select exists (
    select 1 from public.squad_players sp
    where sp.player_id = new.id and public.is_squad_admin(sp.squad_id)
  ) or (
    -- Havuzdaki (kadroya alınmamış) kendi oluşturduğun kart → yönettiğin takımın bir ÜYESİNİN kartı.
    new.created_by = auth.uid()
    and exists (
      select 1 from public.squad_members m
      where m.player_id = new.merged_into and public.is_squad_admin(m.squad_id)
    )
  ) into yonetebilirim;

  select exists (
    select 1
    from public.squad_players sp
    join public.squad_members m on m.squad_id = sp.squad_id
    where sp.player_id = new.id and m.user_id = auth.uid()
  ) into takimda_uyeyim;

  if yonetebilirim then
    return new;
  end if;
  if takimda_uyeyim and hedef_sahip = auth.uid() then
    return new;
  end if;
  raise exception 'Bu karti eslestirme yetkin yok' using errcode = '42501';
end
$fn$;

-- GORSEL KAYNAGI (tarama 10 Ekim 2026): kart fotografi/bayrak yalnizca yuklenen data URL, takim
-- armasi data URL ya da TheSportsDB. Baska adres izleme pikseli olurdu (goren herkesin IP adresi sizar).
update public.players set photo_image = null
  where photo_image is not null and photo_image !~* '^data:image/(png|jpe?g|webp|gif);base64,';
update public.players set flag_image = null
  where flag_image is not null and flag_image !~* '^data:image/(png|jpe?g|webp|gif);base64,';
update public.squads set logo_image = null
  where logo_image is not null
    and logo_image !~* '^data:image/(png|jpe?g|webp|gif);base64,'
    and logo_image !~* '^https://(r2\.|www\.)?thesportsdb\.com/';

alter table public.players drop constraint if exists players_photo_kaynak;
alter table public.players add constraint players_photo_kaynak
  check (photo_image is null or photo_image ~* '^data:image/(png|jpe?g|webp|gif);base64,');
alter table public.players drop constraint if exists players_flag_kaynak;
alter table public.players add constraint players_flag_kaynak
  check (flag_image is null or flag_image ~* '^data:image/(png|jpe?g|webp|gif);base64,');
alter table public.squads drop constraint if exists squads_logo_kaynak;
alter table public.squads add constraint squads_logo_kaynak
  check (logo_image is null
    or logo_image ~* '^data:image/(png|jpe?g|webp|gif);base64,'
    or logo_image ~* '^https://(r2\.|www\.)?thesportsdb\.com/');

notify pgrst, 'reload schema';
