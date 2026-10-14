-- =============================================================================
-- SAHA 42 — updated_at tetikleyicileri
-- =============================================================================
-- Ana şemadan AYRI tutuluyor: bu dosya dolar alıntılı ($$) bir fonksiyon gövdesi içeriyor
-- ve bazı SQL editörlerinin ifade ayırıcısı bu gövdedeki noktalı virgüllerden cümleyi
-- bölüp sonraki ifadeleri bozabiliyor. Tek başına çalıştırıldığında böyle bir risk yok.
--
-- Bir kez çalıştırmak yeterli; tekrar çalıştırmak zarar vermez.
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists players_set_updated_at on public.players;

create trigger players_set_updated_at
  before update on public.players
  for each row
  execute function public.set_updated_at();

drop trigger if exists squads_set_updated_at on public.squads;

create trigger squads_set_updated_at
  before update on public.squads
  for each row
  execute function public.set_updated_at();
