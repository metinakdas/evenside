// Supabase "publishable" anahtarı istemci tarafında görünmesi güvenli olacak şekilde
// tasarlanmıştır (Row Level Security ile korunur) — bu dosya normal şekilde commit'lenir.
export const environment = {
  supabaseUrl: 'https://gqkwuilixnhhfvjnbnvm.supabase.co',
  supabaseKey: 'sb_publishable_GEsYHPqcpBLl56mdoPPYgg_DkXDWaaX',
  /**
   * TheSportsDB ücretsiz v1 anahtarı (kulüp arması ve forma görselleri). "123" herkese açık
   * test anahtarıdır ve hız sınırı düşüktür; kendi anahtarın varsa burayı değiştir.
   */
  sportsDbKey: '123',
  /**
   * Kulüp arması/forma görsellerini CORS başlığıyla geri veren proxy (bkz.
   * `supabase/functions/image-proxy`). BOŞSA: görseller ekranda görünür ama PNG çıktısına
   * GİREMEZ (uzak görsel canvas'ı "tainted" yapar, `toBlob` SecurityError fırlatır) ve
   * çıktıda takım rengi + baş harfler kullanılır. Örnek:
   * 'https://<proje>.supabase.co/functions/v1/image-proxy?url='
   */
  imageProxyUrl: 'https://images.weserv.nl/?url=',
};
