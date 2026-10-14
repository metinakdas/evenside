-- Saha 42 — kayıtlı oyuncu havuzu şeması.
-- Supabase Dashboard → SQL Editor'e yapıştırıp çalıştırın.

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users (id) on delete set null,
  name text not null default '',
  shirt_number text not null default '',
  country_code text not null default 'TR',
  flag_image text,
  photo_image text,
  height_cm numeric not null default 175,
  weight_kg numeric not null default 70,
  smoker boolean not null default false,
  goalkeeping numeric not null default 0,
  defending numeric not null default 0,
  midfield numeric not null default 0,
  attacking numeric not null default 0,
  pace numeric not null default 0,
  stamina numeric not null default 0,
  goals_per_match numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.players enable row level security;

-- Basit "güvenilir arkadaş grubu" modeli: giriş yapmış herkes tüm havuzu
-- görebilir ve düzenleyebilir. Kişiye özel gizlilik gerekmiyor.
drop policy if exists "players_select_authenticated" on public.players;
create policy "players_select_authenticated"
  on public.players for select
  to authenticated
  using (true);

drop policy if exists "players_insert_authenticated" on public.players;
create policy "players_insert_authenticated"
  on public.players for insert
  to authenticated
  with check (true);

drop policy if exists "players_update_authenticated" on public.players;
create policy "players_update_authenticated"
  on public.players for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "players_delete_authenticated" on public.players;
create policy "players_delete_authenticated"
  on public.players for delete
  to authenticated
  using (true);

-- `updated_at` fonksiyonu ve tetikleyiciler ayrı dosyada: supabase/triggers.sql

-- Realtime aboneliği ayrı dosyada: supabase/realtime.sql (isteğe bağlı).

-- ---------------------------------------------------------------------------
-- "Kendi kartım" — kart SAHİPLİĞİ ve eşleme (bkz. proje notları)
-- ---------------------------------------------------------------------------
-- Ayrı bir tablo AÇILMADI: sahipli kart da bir oyuncu kartıdır, aynı puan
-- hattından geçer ve kadroda aynı yeri tutar. İkinci bir tablo, birleşik tip,
-- ikinci depo ve polimorfik kadro referansı demek olurdu.

-- Kartın sahibi olan kullanıcı. NULL = kadro sahibinin havuza elle eklediği kart.
alter table public.players
  add column if not exists owner_id uuid references auth.users (id) on delete set null;

-- Bir kullanıcının EN FAZLA BİR kendi kartı olur.
create unique index if not exists players_owner_id_key
  on public.players (owner_id)
  where owner_id is not null;

-- Eşleme: havuzdaki kart, kişinin kendi kartına yönlendirilir. Satır SİLİNMEZ —
-- eski kadrolar ve kaydedilmiş kuralar hâlâ bu id'ye bakıyor olabilir; okuma
-- sırasında yönlendirme çözülür.
alter table public.players
  add column if not exists merged_into uuid references public.players (id) on delete set null;

create index if not exists players_merged_into_idx
  on public.players (merged_into)
  where merged_into is not null;

-- Kartı en son kimin değiştirdiği. Kadro sahibi sahipli kartı da düzenleyebilir
-- (ürün kararı); kişi bunu kartında görebilsin diye kaynak yazılıyor.
alter table public.players
  add column if not exists last_edited_by uuid references auth.users (id) on delete set null;

-- İsimle eşleştirme aramaları için: Türkçe katlanmış ad (uygulama tarafında
-- `trFold` ile üretilir, sunucu tarafında da aranabilsin diye saklanır).
alter table public.players
  add column if not exists name_key text not null default '';

create index if not exists players_name_key_idx on public.players (name_key);

-- Sahiplik, sahibinden BAŞKASI tarafından değiştirilemez: grup güveniyle
-- puanları düzenlemek serbest, ama bir kartı "benim" ilan etmek değil.
drop policy if exists "players_update_authenticated" on public.players;
create policy "players_update_authenticated"
  on public.players for update
  to authenticated
  using (true)
  with check (
    owner_id is null
    or owner_id = auth.uid()
    or owner_id = (select p.owner_id from public.players p where p.id = players.id)
  );

-- Sahipli kartı yalnızca sahibi silebilir.
drop policy if exists "players_delete_authenticated" on public.players;
create policy "players_delete_authenticated"
  on public.players for delete
  to authenticated
  using (owner_id is null or owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- KADRO DAVETİ — kadro adı, katılma kodu ve üyeler
-- (bkz. proje notları · "Kadroya katıl")
-- ---------------------------------------------------------------------------
-- Kadronun OYUNCU LİSTESİ hâlâ cihazda (`saha42.squad.v2`): kadroyu kuran kişi onu
-- serbestçe kurcalıyor, her sürüklemeyi sunucuya yazmanın bir faydası yok. Sunucuya
-- taşınan şey kadronun KİMLİĞİ: adı, katılma kodu ve kimlerin katıldığı. Katılan
-- kişinin kartı kadro sahibinin HAVUZUNDA belirir; kadroya kimin gireceğine yine
-- kadro sahibi karar verir.

create table if not exists public.squads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  -- Paylaşılan kod: kısa, okunaklı, elle yazılabilir (I/O/0/1 gibi karışanlar üretilmez).
  join_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Takımın logosu (data URL). Takım kurma sihirbazında isteğe bağlı olarak yüklenir.
alter table public.squads
  add column if not exists logo_image text;

-- Bir kullanıcı BİRDEN FAZLA takım kurabilir (kullanıcı isteği). Eskiden burada eşsiz bir
-- indeks vardı: kadronun oyuncu listesi tek bir anahtarda saklandığı için ikinci takım ikinci
-- kadro demek olurdu ve saklanacak yeri yoktu. Artık kadro TAKIM BAŞINA saklanıyor
-- (`saha42.squad.v2.<takım id>`), dolayısıyla sınır kalktı.
drop index if exists public.squads_owner_key;

create index if not exists squads_owner_idx on public.squads (owner_id);

create table if not exists public.squad_members (
  squad_id uuid not null references public.squads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Katılan kişinin KENDİ kartı. Kart silinirse üyelik kalır ama kartsız görünür.
  player_id uuid references public.players (id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (squad_id, user_id)
);

create index if not exists squad_members_user_idx on public.squad_members (user_id);

alter table public.squads enable row level security;
alter table public.squad_members enable row level security;

-- Kadroyu kod ile bulabilmek için okuma serbest (grup içi güven modeli); yazma sahibine ait.
drop policy if exists "squads_select_authenticated" on public.squads;
create policy "squads_select_authenticated"
  on public.squads for select to authenticated using (true);

drop policy if exists "squads_insert_own" on public.squads;
create policy "squads_insert_own"
  on public.squads for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists "squads_update_own" on public.squads;
create policy "squads_update_own"
  on public.squads for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "squads_delete_own" on public.squads;
create policy "squads_delete_own"
  on public.squads for delete to authenticated using (owner_id = auth.uid());

-- Üyelik: herkes görebilir; kişi KENDİ üyeliğini ekler/siler, kadro sahibi de çıkarabilir.
drop policy if exists "squad_members_select_authenticated" on public.squad_members;
create policy "squad_members_select_authenticated"
  on public.squad_members for select to authenticated using (true);

drop policy if exists "squad_members_insert_self" on public.squad_members;
create policy "squad_members_insert_self"
  on public.squad_members for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "squad_members_update_self" on public.squad_members;
create policy "squad_members_update_self"
  on public.squad_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "squad_members_delete_self_or_owner" on public.squad_members;
create policy "squad_members_delete_self_or_owner"
  on public.squad_members for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.squads s where s.id = squad_id and s.owner_id = auth.uid())
  );

-- squads tetikleyicisi de supabase/triggers.sql içinde.

-- ---------------------------------------------------------------------------
-- TAKIM KADROSU — hangi oyuncular hangi takımın kadrosunda
-- ---------------------------------------------------------------------------
-- Kadro listesi başlangıçta yalnızca cihazdaydı (`saha42.squad.v2.<takım>`), bu yüzden
-- katıldığın takımın kadrosunu GÖREMİYORDUN: liste kuran kişinin tarayıcısındaydı.
-- Artık sunucuda: kurucu yazar, takımdaki herkes okur.

create table if not exists public.squad_players (
  squad_id uuid not null references public.squads (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  -- Kadrodaki sıra: yuva ızgarasının düzeni korunsun.
  sort_order int not null default 0,
  added_at timestamptz not null default now(),
  primary key (squad_id, player_id)
);

create index if not exists squad_players_squad_idx on public.squad_players (squad_id);

alter table public.squad_players enable row level security;

-- Okuma serbest: takıma katılan kişi kadroyu görebilmeli (salt okunur).
drop policy if exists "squad_players_select_authenticated" on public.squad_players;
create policy "squad_players_select_authenticated"
  on public.squad_players for select to authenticated using (true);

-- Yazma YALNIZCA takımın sahibine ait: üye kadroyu değiştiremez.
drop policy if exists "squad_players_insert_owner" on public.squad_players;
create policy "squad_players_insert_owner"
  on public.squad_players for insert to authenticated
  with check (exists (select 1 from public.squads s where s.id = squad_id and s.owner_id = auth.uid()));

drop policy if exists "squad_players_update_owner" on public.squad_players;
create policy "squad_players_update_owner"
  on public.squad_players for update to authenticated
  using (exists (select 1 from public.squads s where s.id = squad_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from public.squads s where s.id = squad_id and s.owner_id = auth.uid()));

drop policy if exists "squad_players_delete_owner" on public.squad_players;
create policy "squad_players_delete_owner"
  on public.squad_players for delete to authenticated
  using (exists (select 1 from public.squads s where s.id = squad_id and s.owner_id = auth.uid()));

