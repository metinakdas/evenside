create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.squads(id) on delete cascade,
  match_key text not null check (char_length(match_key) between 1 and 200),
  kickoff text not null check (char_length(kickoff) between 1 and 32),
  venue text not null check (char_length(venue) between 1 and 120),
  format smallint not null check (format between 4 and 11),
  team_a jsonb not null check (jsonb_typeof(team_a) = 'object' and pg_column_size(team_a) <= 16000),
  team_b jsonb not null check (jsonb_typeof(team_b) = 'object' and pg_column_size(team_b) <= 16000),
  score_a smallint check (score_a between 0 and 99),
  score_b smallint check (score_b between 0 and 99),
  score_entered_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_squad_key unique (squad_id, match_key),
  constraint matches_score_pair check ((score_a is null) = (score_b is null))
);

create index if not exists matches_squad_kickoff on public.matches (squad_id, kickoff desc);

drop trigger if exists matches_updated_at on public.matches;
create trigger matches_updated_at
  before update on public.matches
  for each row execute function public.set_updated_at();

alter table public.matches enable row level security;

drop policy if exists matches_select on public.matches;
create policy matches_select on public.matches
  for select to authenticated
  using (public.is_squad_member(squad_id));

drop policy if exists matches_insert on public.matches;
create policy matches_insert on public.matches
  for insert to authenticated
  with check (public.is_squad_admin(squad_id));

drop policy if exists matches_update on public.matches;
create policy matches_update on public.matches
  for update to authenticated
  using (public.is_squad_admin(squad_id))
  with check (public.is_squad_admin(squad_id));

drop policy if exists matches_delete on public.matches;
create policy matches_delete on public.matches
  for delete to authenticated
  using (public.is_squad_admin(squad_id));

revoke all on public.matches from anon;
grant select, insert, update, delete on public.matches to authenticated;
