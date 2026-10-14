-- ==========================================================================
-- SIKILAŞTIRMA — kart eşlemede ORTAK TAKIM şartı (13 Eylül 2026)
--
-- enforce_card_merge ilk kuralında "hedef kartın sahibi sensen serbest" diyordu.
-- Bu tek başına fazla genişti: saldırgan, bilmediği bir takımın havuzundaki
-- sahipsiz bir kartın kimliğini ele geçirirse onu kendi kartına eşleyebilirdi
-- (pratikte RLS o satırı zaten göstermiyor ve UPDATE 0 satır döndürüyor —
-- ölçüldü — ama tek katmana güvenilmez).
--
-- Yeni kural: eşleme, kaynak kartın GEÇTİĞİ bir takımda taraf olmayı gerektirir.
--   * takımın SAHİBİYSEN: havuzundaki kartı, sahipli bir karta eşleyebilirsin
--     (kodla katılan kişiyi kadrodaki kartıyla eşleştirme akışı),
--   * takımın ÜYESİYSEN: o havuzdaki kartı yalnızca KENDİ kartına eşleyebilirsin
--     ("bu kart benim" demek),
--   * hiçbir ortak takımın yoksa eşleme yok.
-- ==========================================================================
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

  -- Takım sahibi, havuzundaki kartı herhangi bir sahipli karta eşleyebilir.
  if takim_sahibiyim then
    return new;
  end if;

  -- Üye yalnızca KENDİ kartına eşleyebilir.
  if takimda_uyeyim and hedef_sahip = auth.uid() then
    return new;
  end if;

  raise exception 'Bu karti eslestirme yetkin yok' using errcode = '42501';
end
$fn$;
