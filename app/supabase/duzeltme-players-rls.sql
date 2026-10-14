-- ==========================================================================
-- DÜZELTME — players politikasındaki SONSUZ DÖNGÜ (13 Eylül 2026)
--
-- Belirti (tarayıcıda ölçüldü): oyuncu düzenleme ve oluşturma
-- "Oyuncu kaydedilemedi" veriyor; sunucu yanıtı
--   42P17: infinite recursion detected in policy for relation "players"
--
-- Sebep: guvenlik-2026-09-13.sql içindeki players UPDATE politikasının
-- with check satırı KENDİ tablosunu sorguluyordu:
--   or owner_id = (select p.owner_id from public.players p where p.id = players.id)
-- players politikası -> players okuması -> yine politika ... döngü.
--
-- Çözüm: sahiplik kuralı politikadan TETİKLEYİCİYE taşındı. Tetikleyici OLD
-- satırını doğrudan görür; sorgu yok, dolayısıyla döngü de yok.
-- Kural aynı kalıyor:
--   * sahiplik değişmiyorsa serbest (grup içinde kart düzenleme),
--   * SAHİPSİZ kart yalnızca kişinin KENDİ üstüne alınabilir,
--   * kendi kartının sahipliğini bırakabilirsin,
--   * başkasının kartı asla devralınamaz / başkasına devredilemez.
-- ==========================================================================

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

-- --------------------------------------------------------------------------
-- created_by için VARSAYILAN
--
-- Ölçüldü: alan gönderilmeden yapılan ekleme 403 alıyordu
-- ("new row violates row-level security policy"), alan konunca 201.
-- İstemci artık alanı gönderiyor; varsayılan ikinci bir emniyet kemeri
-- (başka bir istemci ya da elle atılan istek unutursa satır yine doğru sahiplenilir).
-- --------------------------------------------------------------------------
alter table public.players alter column created_by set default auth.uid();
