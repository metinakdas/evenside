-- CANLI SAYAÇ — tanıtım sayfasındaki sosyal kanıt şeridi (17 Eylül 2026)
--
-- Tanıtım sayfası OTURUMSUZ açılıyor; RLS yüzünden anonim kullanıcı hiçbir satırı göremez
-- (bilinçli). Bu yüzden sayılar tek tek satır okunarak değil, YALNIZCA TOPLAM döndüren bir
-- security definer fonksiyonundan alınır: kimse kimin takımını, kimin kartını göremez.
--
-- Uydurma rakam YOK: fonksiyon kurulmazsa istemci şeridi hiç basmaz.
--
-- 17 Eylül güncellemesi: kullanıcı sayısı eklendi (`auth.users`). Şerit artık
-- "N kadro · M kullanıcı · bu hafta +K kadro" diyor. Bu dosyayı yeniden çalıştırın.

create or replace function public.public_stats()
returns json
language sql
security definer
set search_path = public
stable
as $$
  select json_build_object(
    'teams', (select count(*) from public.squads),
    'players', (select count(*) from public.players),
    'users', (select count(*) from auth.users),
    'teams_week', (select count(*) from public.squads where created_at > now() - interval '7 days'),
    'players_week', (select count(*) from public.players where created_at > now() - interval '7 days'),
    'users_week', (select count(*) from auth.users where created_at > now() - interval '7 days')
  );
$$;

-- Tanıtım sayfası oturumsuz: anon da çağırabilmeli.
grant execute on function public.public_stats() to anon, authenticated;
