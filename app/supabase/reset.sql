-- =============================================================================
-- SAHA 42 — TAM SIFIRLAMA
-- =============================================================================
-- Bu betik havuzdaki TÜM oyuncuları, kurulmuş takımları ve üyelikleri siler.
-- GERİ ALINAMAZ. Kullanıcı hesapları (auth.users) silinmez — giriş bilgin durur.
--
-- Nasıl çalıştırılır: Supabase Dashboard → SQL Editor → yapıştır → Run.
--
-- Önce ne silineceğini GÖRMEK istersen, aşağıdaki DELETE satırlarını çalıştırmadan
-- şu üç sayımı çalıştır:
--
--   select count(*) as oyuncu from public.players;
--   select count(*) as takim  from public.squads;
--   select count(*) as uyelik from public.squad_members;
-- =============================================================================

-- Üyelikler önce: kartlara ve takımlara bağlılar.
delete from public.squad_members;

-- Takımlar (ad + katılma kodu). Kodlar da gider; yeni takım yeni kod alır.
delete from public.squads;

-- Havuzdaki tüm kartlar — kadro sahibinin elle eklediği kartlar da,
-- kullanıcıların anketle oluşturduğu "kendi kartı" kayıtları da.
delete from public.players;

-- Kontrol: üçü de 0 dönmeli.
select
  (select count(*) from public.players) as oyuncu,
  (select count(*) from public.squads) as takim,
  (select count(*) from public.squad_members) as uyelik;
