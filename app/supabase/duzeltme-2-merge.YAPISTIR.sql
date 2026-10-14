create or replace function public.enforce_card_merge()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  hedef_sahip uuid;
  takim_sahibiyim boolean;
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

  select exists (
    select 1
    from public.squad_players sp
    join public.squads s on s.id = sp.squad_id
    where sp.player_id = new.id and s.owner_id = auth.uid()
  ) into takim_sahibiyim;

  select exists (
    select 1
    from public.squad_players sp
    join public.squad_members m on m.squad_id = sp.squad_id
    where sp.player_id = new.id and m.user_id = auth.uid()
  ) into takimda_uyeyim;

  if takim_sahibiyim then
    return new;
  end if;

  if takimda_uyeyim and hedef_sahip = auth.uid() then
    return new;
  end if;

  raise exception 'Bu karti eslestirme yetkin yok' using errcode = '42501';
end
$fn$;
