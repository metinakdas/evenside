-- =============================================================================
-- SAHA 42 — Realtime abonelikleri (İSTEĞE BAĞLI)
-- =============================================================================
-- Bu satırlar, tablolardaki değişikliklerin açık sekmelere anında yansımasını sağlar.
-- Uygulama bunlar olmadan da çalışır; yalnızca "başkası bir şey değiştirdi" güncellemesi
-- sayfa yenilenene kadar gecikir.
--
-- Satırları TEK TEK çalıştırın. Tablo yayına zaten eklenmişse şu hatayı verir:
--   42710: relation "..." is already member of publication "supabase_realtime"
-- Bu hata ZARARSIZDIR — o tablo zaten aboneydi demektir, diğer satıra geçin.
-- =============================================================================

alter publication supabase_realtime add table public.players;

alter publication supabase_realtime add table public.squad_members;

alter publication supabase_realtime add table public.squad_players;
