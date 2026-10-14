-- =============================================================================
-- KART PUANLAMA 2. SÜRÜM (9 Ekim 2026) — players.attributes
--
-- Oyuncu formu artık 20 alt özellik (ivme, sprint, bitiricilik, kısa pas, top kapma, refleks…),
-- tercih edilen ayak ve yaş soruyor. Bunlar tek bir jsonb sütununda tutulur:
--   { "v": 2, "skills": { "ivme": 7, ... }, "foot": "sag" | "sol" | "iki", "age": 29 }
-- Eski altı sütun (pace, attacking, ...) kayıtta alt özelliklerden yeniden doldurulmaya devam
-- eder; bu sütun yokken uygulama yine çalışır, yalnızca ayrıntı saklanmaz.
--
-- Güvenlik: yalnızca nesne kabul edilir ve boyutu sınırlıdır (API'ye doğrudan yazılan dev
-- veriyi reddeder). Değerlerin 0-10 aralığı istemcide sınırlanır; sunucuda da kontrol edilir.
-- =============================================================================

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

-- PostgREST şema önbelleğini tazele (yeni sütun hemen görünsün).
notify pgrst, 'reload schema';
