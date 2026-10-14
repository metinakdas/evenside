alter table public.players add column if not exists attributes jsonb;

create or replace function public.players_attributes_valid(a jsonb)
returns boolean
language sql
immutable
as $fn$
  select a is null or (
    jsonb_typeof(a) = 'object'
    and pg_column_size(a) <= 4000
    and (a->'skills' is null or (
      jsonb_typeof(a->'skills') = 'object'
      and not exists (
        select 1 from jsonb_each(a->'skills') e
        where jsonb_typeof(e.value) <> 'number' or (e.value)::numeric < 0 or (e.value)::numeric > 10
      )
    ))
    and (a->>'foot' is null or a->>'foot' in ('sag', 'sol', 'iki'))
    and (a->'age' is null or jsonb_typeof(a->'age') = 'null' or ((a->>'age')::numeric between 10 and 90))
  )
$fn$;

alter table public.players drop constraint if exists players_attributes_check;
alter table public.players add constraint players_attributes_check check (public.players_attributes_valid(attributes));

notify pgrst, 'reload schema';
