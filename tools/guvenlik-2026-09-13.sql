-- ===========================================================================
-- GÜVENLİK SIKILAŞTIRMASI — 13 Eylül 2026
--
-- Bulgu (gerçek jetonla ölçüldü): giriş yapan HERKES tüm takımları, katılma
-- kodlarını, üyelikleri ve kadroları listeleyebiliyordu. Kod paylaşmasan bile
-- yabancı bir hesap kodu okuyup takımına katılabiliyordu.
--
-- Bu dosya politikaları daraltır:
--   * squads        -> yalnızca sahibi ve üyeleri görür
--   * squad_members -> yalnızca o takımın sahibi ve üyeleri görür
--   * squad_players -> yalnızca o takımın sahibi ve üyeleri görür
--   * players       -> yalnızca kendi kartın, senin oluşturdukların ve
--                      birlikte olduğun takımların kadrosundaki kartlar
--
-- Kodla katılma artık listeleme ile değil, TEK SATIR döndüren bir fonksiyonla
-- yapılır (find_squad_by_code). Fonksiyon security definer olduğu için
-- politikaları aşar ama yalnızca TAM eşleşen kodu döndürür, listeleme yapmaz.
--
-- NOT: Supabase SQL düzenleyicisi komutları noktalı virgüle göre böler ve
--      yorum satırlarını anlamaz. Bu dosyadaki yorumlarda noktalı virgül YOKTUR.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- 1) Yardımcı: takımın sahibi miyim ya da üyesi miyim
--    security definer -> kendi sorgusu RLS'e takılmaz, böylece politikaların
--    birbirini çağırmasından doğan sonsuz döngü olmaz
-- --------------------------------------------------------------------------
create or replace function public.is_squad_member(p_squad uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $fn$
  select exists (
    select 1 from public.squads s
    where s.id = p_squad and s.owner_id = auth.uid()
  ) or exists (
    select 1 from public.squad_members m
    where m.squad_id = p_squad and m.user_id = auth.uid()
  )
$fn$;

revoke all on function public.is_squad_member(uuid) from public;
grant execute on function public.is_squad_member(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- 2) Kodla takım bulma — listeleme değil, TEK eşleşme
--    Kod normalize edilir (boşluk kırpılır, büyük harfe çevrilir)
-- --------------------------------------------------------------------------
create or replace function public.find_squad_by_code(p_code text)
returns table (id uuid, name text, logo_image text, owner_id uuid)
language sql
security definer
stable
set search_path = public
as $fn$
  select s.id, s.name, s.logo_image, s.owner_id
  from public.squads s
  where upper(trim(s.join_code)) = upper(trim(p_code))
  limit 1
$fn$;

revoke all on function public.find_squad_by_code(text) from public;
grant execute on function public.find_squad_by_code(text) to authenticated;

-- --------------------------------------------------------------------------
-- 3) squads: okuma yalnızca sahibi ve üyeleri
-- --------------------------------------------------------------------------
drop policy if exists "squads_select_authenticated" on public.squads;
create policy "squads_select_own_or_member"
  on public.squads for select to authenticated
  using (owner_id = auth.uid() or public.is_squad_member(id));

-- --------------------------------------------------------------------------
-- 4) squad_members: okuma yalnızca aynı takımın içinden
-- --------------------------------------------------------------------------
drop policy if exists "squad_members_select_authenticated" on public.squad_members;
create policy "squad_members_select_same_squad"
  on public.squad_members for select to authenticated
  using (user_id = auth.uid() or public.is_squad_member(squad_id));

-- --------------------------------------------------------------------------
-- 5) squad_players: okuma yalnızca aynı takımın içinden
-- --------------------------------------------------------------------------
drop policy if exists "squad_players_select_authenticated" on public.squad_players;
create policy "squad_players_select_same_squad"
  on public.squad_players for select to authenticated
  using (public.is_squad_member(squad_id));

-- --------------------------------------------------------------------------
-- 6) players: kartlar artık herkese açık değil
--    created_by sütunu eklenir ve mevcut satırlar sahiplerine göre doldurulur
-- --------------------------------------------------------------------------
alter table public.players
  add column if not exists created_by uuid default auth.uid() references auth.users (id) on delete set null;

update public.players
set created_by = owner_id
where created_by is null and owner_id is not null;

-- Sahipsiz ve sahipsiz kalmış eski kartlar: onları kadrosunda tutan takımın
-- sahibine yazılır, böylece o takımın herkesi kartı görmeye devam eder
update public.players p
set created_by = s.owner_id
from public.squad_players sp
join public.squads s on s.id = sp.squad_id
where p.created_by is null and sp.player_id = p.id;

create index if not exists players_created_by_idx on public.players (created_by);

-- Görünürlük: kendi kartın, senin oluşturdukların ve birlikte olduğun
-- takımların kadrosundaki kartlar
drop policy if exists "players_select_authenticated" on public.players;
create policy "players_select_visible"
  on public.players for select to authenticated
  using (
    owner_id = auth.uid()
    or created_by = auth.uid()
    or exists (
      select 1 from public.squad_players sp
      where sp.player_id = players.id and public.is_squad_member(sp.squad_id)
    )
  );

-- Yazma: görebildiğin kartı düzenleyebilirsin (grup içi güven), ama SAHİPLİĞİ
-- değiştiremezsin
drop policy if exists "players_update_authenticated" on public.players;
create policy "players_update_visible"
  on public.players for update to authenticated
  using (
    owner_id = auth.uid()
    or created_by = auth.uid()
    or exists (
      select 1 from public.squad_players sp
      where sp.player_id = players.id and public.is_squad_member(sp.squad_id)
    )
  )
  with check (
    owner_id is null
    or owner_id = auth.uid()
    or owner_id = (select p.owner_id from public.players p where p.id = players.id)
  );

-- Silme: kendi kartın ya da senin oluşturduğun sahipsiz kart
drop policy if exists "players_delete_authenticated" on public.players;
create policy "players_delete_own"
  on public.players for delete to authenticated
  using (
    owner_id = auth.uid()
    or (owner_id is null and created_by = auth.uid())
  );

-- Ekleme: yalnızca kendi adına
drop policy if exists "players_insert_authenticated" on public.players;
create policy "players_insert_self"
  on public.players for insert to authenticated
  with check (
    (owner_id is null or owner_id = auth.uid())
    and (created_by is null or created_by = auth.uid())
  );

-- --------------------------------------------------------------------------
-- 7) GİRDİ SINIRLARI — istemci doğrulaması atlanabilir
--
-- Ölçüldü (doğrudan API'ye istek): 3000 karakterlik ad, negatif boy, 10 üstü
-- yetenek puanı, 12 haneli forma numarası ve 2 MB'lık fotoğraf METNİ sunucu
-- tarafından KABUL ediliyordu. Arayüzdeki maxlength ve min/max yalnızca
-- tarayıcıyı bağlar. Aşağısı veritabanı seviyesinde bağlar.
--
-- Önce mevcut satırlar sınırlara çekilir, sonra kısıtlar eklenir: aksi hâlde
-- ALTER TABLE eski bir satır yüzünden hata verir.
-- --------------------------------------------------------------------------
update public.players set name = left(trim(name), 48) where length(trim(name)) > 48 or name <> trim(name);
update public.players set name = 'Oyuncu' where coalesce(trim(name), '') = '';
update public.players set shirt_number = left(coalesce(shirt_number, ''), 2);
update public.players set height_cm = least(greatest(height_cm, 100), 230);
update public.players set weight_kg = least(greatest(weight_kg, 30), 200);
update public.players set goalkeeping = least(greatest(goalkeeping, 0), 10);
update public.players set defending = least(greatest(defending, 0), 10);
update public.players set midfield = least(greatest(midfield, 0), 10);
update public.players set attacking = least(greatest(attacking, 0), 10);
update public.players set pace = least(greatest(pace, 0), 10);
update public.players set stamina = least(greatest(stamina, 0), 10);
update public.players set photo_image = null where length(photo_image) > 1500000;

alter table public.players drop constraint if exists players_name_len;
alter table public.players add constraint players_name_len
  check (char_length(name) between 1 and 48);

alter table public.players drop constraint if exists players_shirt_len;
alter table public.players add constraint players_shirt_len
  check (shirt_number is null or char_length(shirt_number) <= 2);

alter table public.players drop constraint if exists players_body_range;
alter table public.players add constraint players_body_range
  check (height_cm between 100 and 230 and weight_kg between 30 and 200);

alter table public.players drop constraint if exists players_skill_range;
alter table public.players add constraint players_skill_range
  check (
    goalkeeping between 0 and 10
    and defending between 0 and 10
    and midfield between 0 and 10
    and attacking between 0 and 10
    and pace between 0 and 10
    and stamina between 0 and 10
  );

-- Fotoğraf data URL olarak saklanıyor: 1.5 MB metin yaklaşık 1.1 MB görsel demek
alter table public.players drop constraint if exists players_photo_size;
alter table public.players add constraint players_photo_size
  check (photo_image is null or length(photo_image) <= 1500000);

update public.squads set name = left(trim(name), 40) where length(trim(name)) > 40;

alter table public.squads drop constraint if exists squads_name_len;
alter table public.squads add constraint squads_name_len
  check (char_length(name) <= 40);

alter table public.squads drop constraint if exists squads_code_len;
alter table public.squads add constraint squads_code_len
  check (char_length(join_code) between 4 and 12);
