-- =============================================================================
-- DÜZELTME 4 · Hesap silme yetim kart bırakıyordu (QA, 9 Ekim 2026)
--
-- Ölçüldü: bir hesap kendi takımına 7 kart ekleyip hesabını silince takım silindi ama 7 kart
-- sahipsiz (owner_id = null, created_by = null) olarak veritabanında kaldı. Bu kartlarda
-- arkadaşların adı, boyu, kilosu ve fotoğrafı olabiliyor (kişisel veri) ve silme ekranı
-- silineceklerini söylüyor.
--
-- Kural: kullanıcının OLUŞTURDUĞU ve sahipsiz olan kartlar, artık hiçbir kadroda, üyelikte ya da
-- eşlemede kullanılmıyorsa silinir. Başkasının takımında duran kartlara dokunulmaz; onların
-- yalnızca created_by alanı boşaltılır (eskisi gibi).
-- =============================================================================

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  ben uuid := auth.uid();
begin
  if ben is null then
    raise exception 'Oturum yok' using errcode = '42501';
  end if;

  delete from public.squad_players
  where squad_id in (select id from public.squads where owner_id = ben);

  delete from public.squad_members
  where user_id = ben
     or squad_id in (select id from public.squads where owner_id = ben);

  delete from public.squads where owner_id = ben;

  delete from public.players where owner_id = ben;

  -- YENİ: oluşturduğu, sahipsiz ve artık hiçbir yerde kullanılmayan kartlar.
  delete from public.players p
  where p.created_by = ben
    and p.owner_id is null
    and not exists (select 1 from public.squad_players sp where sp.player_id = p.id)
    and not exists (select 1 from public.squad_members sm where sm.player_id = p.id)
    and not exists (select 1 from public.players q where q.merged_into = p.id);

  -- Başkasının takımında duranlar kalır; yalnızca "oluşturan" bağı kopar.
  update public.players set created_by = null where created_by = ben;

  delete from auth.users where id = ben;
end
$fn$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- -----------------------------------------------------------------------------
-- TEK SEFERLİK TEMİZLİK: eski fonksiyonun bıraktığı yetim kartlar.
-- Sahibi yok, oluşturanı yok (hesabı silinmiş), hiçbir kadroda/üyelikte/eşlemede yok.
-- Böyle bir kartı uygulamada kimse göremez ve kimse düzenleyemez (RLS).
-- Önce kaç kart olduğunu görmek isterseniz yalnızca şu satırı çalıştırın:
--   select count(*) from public.players p where p.owner_id is null and p.created_by is null
--     and not exists (select 1 from public.squad_players sp where sp.player_id = p.id)
--     and not exists (select 1 from public.squad_members sm where sm.player_id = p.id)
--     and not exists (select 1 from public.players q where q.merged_into = p.id);
-- -----------------------------------------------------------------------------
delete from public.players p
where p.owner_id is null
  and p.created_by is null
  and not exists (select 1 from public.squad_players sp where sp.player_id = p.id)
  and not exists (select 1 from public.squad_members sm where sm.player_id = p.id)
  and not exists (select 1 from public.players q where q.merged_into = p.id);
