-- ==========================================================================
-- HESABIMI SİL — kullanıcının kendi hesabını silmesi (13 Eylül 2026)
--
-- İstemci tek başına hesap silemez: Supabase'de auth.users'a yazmak yalnızca
-- service_role ile mümkündür ve o anahtar TARAYICIYA KONULAMAZ (koyulursa
-- siteyi açan herkes tüm hesapları silebilir). Bu yüzden silme, sunucuda
-- çalışan security definer bir fonksiyona veriliyor: fonksiyon yalnızca
-- ÇAĞIRANIN kendi hesabını siler, başka kimseye dokunamaz.
--
-- Silinenler:
--   * kullanıcının SAHİBİ olduğu takımlar (kadroları ve üyelikleriyle),
--   * kullanıcının başka takımlardaki ÜYELİKLERİ,
--   * kullanıcının kendi kartı (owner_id = kendisi),
--   * auth kaydı.
--
-- Silinmeyen: kullanıcının OLUŞTURDUĞU ama başkasının takımında duran havuz
-- kartları. Onlar o takımın kadro geçmişinin parçası; sahipsiz bırakılır
-- (created_by null) ki takım sahibinin kadrosu delik deşik olmasın.
-- ==========================================================================
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

  update public.players set created_by = null where created_by = ben;

  delete from auth.users where id = ben;
end
$fn$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
