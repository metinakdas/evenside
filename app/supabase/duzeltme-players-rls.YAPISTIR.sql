drop policy if exists "players_update_visible" on public.players;
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
  with check (true);

create or replace function public.enforce_card_owner()
returns trigger
language plpgsql
as $fn$
begin
  if new.owner_id is not distinct from old.owner_id then
    return new;
  end if;

  if old.owner_id is null and new.owner_id = auth.uid() then
    return new;
  end if;

  if old.owner_id = auth.uid() and new.owner_id is null then
    return new;
  end if;

  raise exception 'Kart sahipligi degistirilemez' using errcode = '42501';
end
$fn$;

drop trigger if exists players_owner_guard on public.players;
create trigger players_owner_guard
  before update of owner_id on public.players
  for each row execute function public.enforce_card_owner();

alter table public.players alter column created_by set default auth.uid();
