-- ============================================================================
-- TAKIM ARKADAŞI PUANLAMASI (12 Ekim 2026)
--
-- Kişinin kendine verdiği puan gerçek performansla zayıf ilişkili (r ≈ 0,29, Zell & Krizan 2014);
-- dışarıdan bakanların birleşik görüşü daha isabetli. Takımdaki herkes kadrodaki DİĞER oyunculara
-- tek bir "grupta nerede" seviyesi (1-10) verir. Kura bunu takımın kart dağılımına ölçekleyip
-- kart reytingiyle harmanlar (istemci, PeerRatingService).
--
-- Gizlilik: kimse başkasının verdiği puanı GÖREMEZ (okuma yalnızca kendi satırların). Takım
-- yalnızca TOPLU sonucu görür ve o da en az 3 kişi puanladıysa (`squad_peer_levels`).
-- Kendini puanlamak sunucuda engellenir. Hesap silinince verdiği puanlar da gider.
-- ============================================================================

create table if not exists public.peer_ratings (
  squad_id uuid not null references public.squads(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  rater_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  level smallint not null check (level between 1 and 10),
  updated_at timestamptz not null default now(),
  primary key (squad_id, player_id, rater_id)
);

-- Puanlanabilir mi: çağıran takımın üyesi/sahibi, oyuncu takımın kadrosunda (ya da kadrodaki bir kart
-- ona eşlenmiş) ve kart ÇAĞIRANIN değil.
-- security definer: politika içinde players/squad_players RLS'ine takılmasın.
create or replace function public.peer_rating_allowed(p_squad uuid, p_player uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select public.is_squad_member(p_squad)
    and exists (
      select 1 from public.squad_players sp join public.players k on k.id = sp.player_id
      where sp.squad_id = p_squad and (sp.player_id = p_player or k.merged_into = p_player)
    )
    and not exists (select 1 from public.players p where p.id = p_player and p.owner_id = (select auth.uid()))
$fn$;

revoke all on function public.peer_rating_allowed(uuid, uuid) from public, anon;
grant execute on function public.peer_rating_allowed(uuid, uuid) to authenticated;

alter table public.peer_ratings enable row level security;

drop policy if exists peer_ratings_select on public.peer_ratings;
create policy peer_ratings_select on public.peer_ratings
  for select to authenticated
  using (rater_id = (select auth.uid()));

drop policy if exists peer_ratings_insert on public.peer_ratings;
create policy peer_ratings_insert on public.peer_ratings
  for insert to authenticated
  with check (rater_id = (select auth.uid()) and public.peer_rating_allowed(squad_id, player_id));

drop policy if exists peer_ratings_update on public.peer_ratings;
create policy peer_ratings_update on public.peer_ratings
  for update to authenticated
  using (rater_id = (select auth.uid()))
  with check (rater_id = (select auth.uid()) and public.peer_rating_allowed(squad_id, player_id));

drop policy if exists peer_ratings_delete on public.peer_ratings;
create policy peer_ratings_delete on public.peer_ratings
  for delete to authenticated
  using (rater_id = (select auth.uid()));

revoke all on public.peer_ratings from anon;
grant select, insert, update, delete on public.peer_ratings to authenticated;

-- Takımın TOPLU sonucu: oyuncu başına puanlayan sayısı ve ortanca seviye. Yalnızca takımın
-- üyesi/sahibi çağırabilir; en az 3 puanlayanı olmayan oyuncu dönmez (kimin ne verdiği çıkarılamasın).
create or replace function public.squad_peer_levels(p_squad uuid)
returns table (player_id uuid, raters integer, median_level numeric)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if not public.is_squad_member(p_squad) then
    raise exception 'yetki yok' using errcode = '42501';
  end if;
  return query
    select r.player_id, count(*)::integer, percentile_cont(0.5) within group (order by r.level)::numeric
    from public.peer_ratings r
    where r.squad_id = p_squad
    group by r.player_id
    having count(*) >= 3;
end;
$fn$;

revoke all on function public.squad_peer_levels(uuid) from public, anon;
grant execute on function public.squad_peer_levels(uuid) to authenticated;
