create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  ben uuid := auth.uid();
begin
  if ben is null then
    raise exception 'Oturum yok' using errcode = '42501';
  end if;

  delete from public.squad_players
  where squad_id in (select id from public.squads where owner_id = ben);

  delete from public.squad_members
  where user_id = ben
     or squad_id in (select id from public.squads where owner_id = ben);

  delete from public.squads where owner_id = ben;

  delete from public.players where owner_id = ben;

  delete from public.players p
  where p.created_by = ben
    and p.owner_id is null
    and not exists (select 1 from public.squad_players sp where sp.player_id = p.id)
    and not exists (select 1 from public.squad_members sm where sm.player_id = p.id)
    and not exists (select 1 from public.players q where q.merged_into = p.id);

  update public.players set created_by = null where created_by = ben;

  delete from auth.users where id = ben;
end
$fn$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

delete from public.players p
where p.owner_id is null
  and p.created_by is null
  and not exists (select 1 from public.squad_players sp where sp.player_id = p.id)
  and not exists (select 1 from public.squad_members sm where sm.player_id = p.id)
  and not exists (select 1 from public.players q where q.merged_into = p.id);
