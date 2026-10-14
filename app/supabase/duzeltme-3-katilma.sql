-- ==========================================================================
-- P0 — KOD BİLMEDEN TAKIMA KATILMA (13 Eylül 2026)
--
-- ÖLÇÜLDÜ (taze bir hesapla): `POST /squad_members` ile herhangi bir kullanıcı,
-- kodu HİÇ bilmeden istediği takıma kendini ekleyebiliyordu → HTTP 201.
-- Daha önce bu deneme asıl hesapla yapılmış ve zaten üye olunduğu için 409
-- dönmüştü; "güvenli" görünmesinin sebebi buydu. Kod paylaşmak anlamsızdı:
-- takım kimlikleri listelenmese de tahmin/sızma ile bir kez öğrenilen id
-- kalıcı erişim veriyordu.
--
-- Çözüm: katılma tek kapıdan geçiyor — `join_squad_with_code()`. Doğrudan
-- INSERT ise yalnızca "kendi takımına kendini ekleme" hâline daraltıldı.
-- ==========================================================================

-- Katılma: kodu doğrular, kartın gerçekten ÇAĞIRANA ait olduğunu doğrular,
-- sonra üyeliği açar. find_squad_by_code içeride çağrıldığı için kod deneme
-- kotası (saatte 30) burada da işler.
create or replace function public.join_squad_with_code(p_code text, p_player uuid)
returns table (id uuid, name text, logo_image text, owner_id uuid)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  hedef record;
  kart_sahibi uuid;
begin
  if auth.uid() is null then
    raise exception 'Oturum yok' using errcode = '42501';
  end if;

  select * into hedef from public.find_squad_by_code(p_code) limit 1;

  if hedef.id is null then
    raise exception 'Bu kodla takim bulunamadi' using errcode = 'P0002';
  end if;

  if hedef.owner_id = auth.uid() then
    raise exception 'Bu senin kendi takimin' using errcode = '22023';
  end if;

  -- Kart ZORUNLU ve mutlaka çağıranın kendi kartı olmalı: aksi hâlde kişi
  -- başkasının kartıyla üye görünür ve kadroda onun yerine geçerdi.
  select owner_id into kart_sahibi from public.players where id = p_player;
  if kart_sahibi is null or kart_sahibi <> auth.uid() then
    raise exception 'Once kendi kartini olustur' using errcode = '42501';
  end if;

  insert into public.squad_members (squad_id, user_id, player_id)
  values (hedef.id, auth.uid(), p_player)
  on conflict (squad_id, user_id) do update set player_id = excluded.player_id;

  return query select hedef.id, hedef.name, hedef.logo_image, hedef.owner_id;
end
$fn$;

revoke all on function public.join_squad_with_code(text, uuid) from public;
grant execute on function public.join_squad_with_code(text, uuid) to authenticated;

-- Doğrudan INSERT artık yalnızca "kendi takımına kendini ekleme".
-- Başkasının takımına katılmanın TEK yolu yukarıdaki fonksiyon.
drop policy if exists "squad_members_insert_self" on public.squad_members;
drop policy if exists "squad_members_insert_authenticated" on public.squad_members;
create policy "squad_members_insert_own_squad"
  on public.squad_members for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.squads s where s.id = squad_id and s.owner_id = auth.uid())
  );

-- ==========================================================================
-- ÜYE, BAŞKASININ KARTINI DÜZENLEYEMEZ
--
-- ÖLÇÜLDÜ: takıma katılan bir üye, kadrodaki HERHANGİ bir kartın adını API'den
-- değiştirebiliyordu (HTTP 200). Arayüz bunu zaten yasaklıyor ("kadroyu
-- görebilirsin ama değiştiremezsin") ama düğmeyi gizlemek sunucuyu bağlamaz.
--
-- Yeni kural — bir kartı düzenleyebilmek için:
--   * kart senin olmalı (owner_id), ya da
--   * kartı sen oluşturmuş olmalısın (created_by), ya da
--   * kartın bulunduğu takımın SAHİBİ olmalısın (kendi havuzunu yönetiyorsun).
-- "O takımın üyesiyim" artık yetmiyor.
--
-- OKUMA politikası değişmiyor: üye kadroyu görmeye devam ediyor.
-- ==========================================================================
drop policy if exists "players_update_visible" on public.players;
create policy "players_update_visible"
  on public.players for update to authenticated
  using (
    owner_id = auth.uid()
    or created_by = auth.uid()
    or exists (
      select 1
      from public.squad_players sp
      join public.squads s on s.id = sp.squad_id
      where sp.player_id = players.id and s.owner_id = auth.uid()
    )
  )
  with check (true);
