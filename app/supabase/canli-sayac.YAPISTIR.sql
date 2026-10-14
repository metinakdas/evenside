create or replace function public.public_stats()
returns json
language sql
security definer
set search_path = public
stable
as $$
  select json_build_object(
    'teams', (select count(*) from public.squads),
    'players', (select count(*) from public.players),
    'users', (select count(*) from auth.users),
    'teams_week', (select count(*) from public.squads where created_at > now() - interval '7 days'),
    'players_week', (select count(*) from public.players where created_at > now() - interval '7 days'),
    'users_week', (select count(*) from auth.users where created_at > now() - interval '7 days')
  );
$$;

grant execute on function public.public_stats() to anon, authenticated;
