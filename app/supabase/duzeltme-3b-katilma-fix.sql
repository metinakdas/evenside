-- ==========================================================================
-- DÜZELTME — join_squad_with_code'da BELİRSİZ SÜTUN (13 Eylül 2026)
--
-- Ölçüldü: meşru katılma HTTP 400 ile düşüyordu —
--   42702: column reference "owner_id" is ambiguous
-- Sebep: fonksiyon `returns table (... owner_id uuid)` ile ÇIKTI sütunu
-- tanımlıyor; gövdedeki `select owner_id from public.players` ifadesinde
-- PostgreSQL bunun çıktı değişkeni mi tablo sütunu mu olduğunu bilemiyor.
--
-- Çözüm: fonksiyon artık tek bir uuid (katılınan takımın kimliği) döndürüyor;
-- çıktı sütunu kalmadığı için belirsizlik de kalmıyor. Ayrıca "kod bulunamadı"
-- hatası PT404 ile veriliyor: PostgREST bunu 404'e çevirir, 500'e değil.
-- ==========================================================================
drop function if exists public.join_squad_with_code(text, uuid);

create or replace function public.join_squad_with_code(p_code text, p_player uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  bulunan_id uuid;
  bulunan_sahip uuid;
  kart_sahibi uuid;
begin
  if auth.uid() is null then
    raise exception 'Oturum yok' using errcode = '42501';
  end if;

  select f.id, f.owner_id into bulunan_id, bulunan_sahip
  from public.find_squad_by_code(p_code) f
  limit 1;

  if bulunan_id is null then
    raise exception 'Bu kodla takim bulunamadi' using errcode = 'PT404';
  end if;

  if bulunan_sahip = auth.uid() then
    raise exception 'Bu senin kendi takimin' using errcode = '22023';
  end if;

  -- Kart ZORUNLU ve mutlaka çağıranın kendi kartı olmalı: aksi hâlde kişi
  -- başkasının kartıyla üye görünür ve kadroda onun yerine geçerdi.
  select p.owner_id into kart_sahibi from public.players p where p.id = p_player;
  if kart_sahibi is null or kart_sahibi <> auth.uid() then
    raise exception 'Once kendi kartini olustur' using errcode = '42501';
  end if;

  insert into public.squad_members (squad_id, user_id, player_id)
  values (bulunan_id, auth.uid(), p_player)
  on conflict (squad_id, user_id) do update set player_id = excluded.player_id;

  return bulunan_id;
end
$fn$;

revoke all on function public.join_squad_with_code(text, uuid) from public;
grant execute on function public.join_squad_with_code(text, uuid) to authenticated;
