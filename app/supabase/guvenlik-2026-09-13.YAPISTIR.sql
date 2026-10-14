create or replace function public.is_squad_member(p_squad uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $fn$
  select exists (
    select 1 from public.squads s
    where s.id = p_squad and s.owner_id = auth.uid()
  ) or exists (
    select 1 from public.squad_members m
    where m.squad_id = p_squad and m.user_id = auth.uid()
  )
$fn$;

revoke all on function public.is_squad_member(uuid) from public;
grant execute on function public.is_squad_member(uuid) to authenticated;

create or replace function public.find_squad_by_code(p_code text)
returns table (id uuid, name text, logo_image text, owner_id uuid)
language sql
security definer
stable
set search_path = public
as $fn$
  select s.id, s.name, s.logo_image, s.owner_id
  from public.squads s
  where upper(trim(s.join_code)) = upper(trim(p_code))
  limit 1
$fn$;

revoke all on function public.find_squad_by_code(text) from public;
grant execute on function public.find_squad_by_code(text) to authenticated;

drop policy if exists "squads_select_authenticated" on public.squads;
create policy "squads_select_own_or_member"
  on public.squads for select to authenticated
  using (owner_id = auth.uid() or public.is_squad_member(id));

drop policy if exists "squad_members_select_authenticated" on public.squad_members;
create policy "squad_members_select_same_squad"
  on public.squad_members for select to authenticated
  using (user_id = auth.uid() or public.is_squad_member(squad_id));

drop policy if exists "squad_players_select_authenticated" on public.squad_players;
create policy "squad_players_select_same_squad"
  on public.squad_players for select to authenticated
  using (public.is_squad_member(squad_id));

alter table public.players
  add column if not exists created_by uuid default auth.uid() references auth.users (id) on delete set null;

update public.players
set created_by = owner_id
where created_by is null and owner_id is not null;

update public.players p
set created_by = s.owner_id
from public.squad_players sp
join public.squads s on s.id = sp.squad_id
where p.created_by is null and sp.player_id = p.id;

create index if not exists players_created_by_idx on public.players (created_by);

drop policy if exists "players_select_authenticated" on public.players;
create policy "players_select_visible"
  on public.players for select to authenticated
  using (
    owner_id = auth.uid()
    or created_by = auth.uid()
    or exists (
      select 1 from public.squad_players sp
      where sp.player_id = players.id and public.is_squad_member(sp.squad_id)
    )
    or exists (
      select 1 from public.squad_members m
      where m.player_id = players.id and public.is_squad_member(m.squad_id)
    )
  );

drop policy if exists "players_update_authenticated" on public.players;
create policy "players_update_visible"
  on public.players for update to authenticated
  using (
    owner_id = auth.uid()
    or created_by = auth.uid()
    or exists (
      select 1 from public.squad_players sp
      where sp.player_id = players.id and public.is_squad_member(sp.squad_id)
    )
    or exists (
      select 1 from public.squad_members m
      where m.player_id = players.id and public.is_squad_member(m.squad_id)
    )
  )
  with check (
    owner_id is null
    or owner_id = auth.uid()
    or owner_id = (select p.owner_id from public.players p where p.id = players.id)
  );

drop policy if exists "players_delete_authenticated" on public.players;
create policy "players_delete_own"
  on public.players for delete to authenticated
  using (
    owner_id = auth.uid()
    or (owner_id is null and created_by = auth.uid())
  );

drop policy if exists "players_insert_authenticated" on public.players;
create policy "players_insert_self"
  on public.players for insert to authenticated
  with check (
    (owner_id is null or owner_id = auth.uid())
    and (created_by is null or created_by = auth.uid())
  );

update public.players set name = left(trim(name), 48) where length(trim(name)) > 48 or name <> trim(name);
update public.players set name = 'Oyuncu' where coalesce(trim(name), '') = '';
update public.players set shirt_number = left(coalesce(shirt_number, ''), 2);
update public.players set height_cm = least(greatest(height_cm, 100), 230);
update public.players set weight_kg = least(greatest(weight_kg, 30), 200);
update public.players set goalkeeping = least(greatest(goalkeeping, 0), 10);
update public.players set defending = least(greatest(defending, 0), 10);
update public.players set midfield = least(greatest(midfield, 0), 10);
update public.players set attacking = least(greatest(attacking, 0), 10);
update public.players set pace = least(greatest(pace, 0), 10);
update public.players set stamina = least(greatest(stamina, 0), 10);
update public.players set photo_image = null where length(photo_image) > 1500000;

alter table public.players drop constraint if exists players_name_len;
alter table public.players add constraint players_name_len
  check (char_length(name) between 1 and 48);

alter table public.players drop constraint if exists players_shirt_len;
alter table public.players add constraint players_shirt_len
  check (shirt_number is null or char_length(shirt_number) <= 2);

alter table public.players drop constraint if exists players_body_range;
alter table public.players add constraint players_body_range
  check (height_cm between 100 and 230 and weight_kg between 30 and 200);

alter table public.players drop constraint if exists players_skill_range;
alter table public.players add constraint players_skill_range
  check (
    goalkeeping between 0 and 10
    and defending between 0 and 10
    and midfield between 0 and 10
    and attacking between 0 and 10
    and pace between 0 and 10
    and stamina between 0 and 10
  );

alter table public.players drop constraint if exists players_photo_size;
alter table public.players add constraint players_photo_size
  check (photo_image is null or length(photo_image) <= 1500000);

update public.squads set name = left(trim(name), 40) where length(trim(name)) > 40;

alter table public.squads drop constraint if exists squads_name_len;
alter table public.squads add constraint squads_name_len
  check (char_length(name) <= 40);

alter table public.squads drop constraint if exists squads_code_len;
alter table public.squads add constraint squads_code_len
  check (char_length(join_code) between 4 and 12);

create or replace function public.save_squad_roster(p_squad uuid, p_players uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not exists (
    select 1 from public.squads s where s.id = p_squad and s.owner_id = auth.uid()
  ) then
    raise exception 'Bu takimin kadrosunu yalnizca kurucusu degistirebilir'
      using errcode = '42501';
  end if;

  delete from public.squad_players where squad_id = p_squad;

  insert into public.squad_players (squad_id, player_id, sort_order)
  select p_squad, pid, ord - 1
  from unnest(p_players) with ordinality as t(pid, ord);
end
$fn$;

revoke all on function public.save_squad_roster(uuid, uuid[]) from public;
grant execute on function public.save_squad_roster(uuid, uuid[]) to authenticated;

create or replace function public.enforce_card_merge()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  hedef_sahip uuid;
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

  if hedef_sahip <> auth.uid()
     and not exists (
       select 1
       from public.squad_players sp
       join public.squads s on s.id = sp.squad_id
       where sp.player_id = new.id and s.owner_id = auth.uid()
     )
     and not exists (
       select 1
       from public.squad_members m
       join public.squads s on s.id = m.squad_id
       where m.player_id = new.merged_into and s.owner_id = auth.uid()
     )
  then
    raise exception 'Bu karti eslestirme yetkin yok' using errcode = '42501';
  end if;

  return new;
end
$fn$;

drop trigger if exists players_merge_guard on public.players;
create trigger players_merge_guard
  before insert or update of merged_into on public.players
  for each row execute function public.enforce_card_merge();

create table if not exists public.join_code_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index if not exists join_code_attempts_idx
  on public.join_code_attempts (user_id, attempted_at desc);

alter table public.join_code_attempts enable row level security;

drop policy if exists "join_code_attempts_own" on public.join_code_attempts;
create policy "join_code_attempts_own"
  on public.join_code_attempts for select to authenticated
  using (user_id = auth.uid());

create or replace function public.find_squad_by_code(p_code text)
returns table (id uuid, name text, logo_image text, owner_id uuid)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  son_deneme int;
begin
  select count(*) into son_deneme
  from public.join_code_attempts a
  where a.user_id = auth.uid() and a.attempted_at > now() - interval '1 hour';

  if son_deneme >= 30 then
    raise exception 'Cok fazla kod denemesi yaptin, bir sure sonra tekrar dene'
      using errcode = '42901';
  end if;

  insert into public.join_code_attempts (user_id) values (auth.uid());

  delete from public.join_code_attempts
  where attempted_at < now() - interval '1 day';

  return query
    select s.id, s.name, s.logo_image, s.owner_id
    from public.squads s
    where upper(trim(s.join_code)) = upper(trim(p_code))
    limit 1;
end
$fn$;

revoke all on function public.find_squad_by_code(text) from public;
grant execute on function public.find_squad_by_code(text) to authenticated;
