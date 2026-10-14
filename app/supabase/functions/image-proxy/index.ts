/**
 * Kulüp arması/forma görselleri için CORS proxy'si (Supabase Edge Function).
 *
 * NEDEN: TheSportsDB'nin görsel sunucusu (`r2.thesportsdb.com`) `Access-Control-Allow-Origin`
 * başlığı GÖNDERMİYOR (ölçüldü). Tarayıcıda o görseller `<img>` ile gösterilebiliyor ama
 * canvas'a çizilince canvas "tainted" oluyor ve `toBlob`/`toDataURL` SecurityError fırlatıyor —
 * yani PNG çıktısına (kadro görseli) kulüp forması/arması KOYULAMIYOR. Bu fonksiyon görseli
 * sunucu tarafında indirip CORS başlığıyla geri verir; böylece `crossOrigin="anonymous"` ile
 * yüklenip canvas'a güvenle çizilebilir.
 *
 * KURULUM:
 *   1. supabase functions deploy image-proxy --no-verify-jwt
 *   2. Dönen URL'yi `src/environments/environment.ts` içindeki `imageProxyUrl` alanına yaz:
 *      imageProxyUrl: 'https://<proje>.supabase.co/functions/v1/image-proxy?url='
 *   Alan boş bırakılırsa uygulama eskisi gibi çalışır; PNG çıktısında forma/arma yerine
 *   takım rengi + baş harfler kullanılır.
 */

/** Yalnızca bu ana makinelerden görsel çekilir — proxy açık bir yönlendirici olmamalı. */
const ALLOWED_HOSTS = ['r2.thesportsdb.com', 'www.thesportsdb.com', 'thesportsdb.com'];

/*
 * CORS KİTLİ.
 *
 * Önce `Access-Control-Allow-Origin: *` vardı: proxy'yi İNTERNETTEKİ HERKES kendi sitesi için
 * görsel CDN'i gibi kullanabilirdi (bant genişliği ve Supabase kotası bizden gider). Artık
 * yalnızca bizim kaynaklarımız: yayın adresi ve yerel geliştirme sunucusu.
 *
 * Yeni bir alan adına geçilirse buraya EKLENMELİ; liste dışı bir origin'e CORS başlığı
 * verilmez ve tarayıcı yanıtı reddeder.
 */
const ALLOWED_ORIGINS = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  // Yayına çıkarken gerçek adres buraya:
  // 'https://saha42.example.com',
];

function corsFor(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') ?? '';
  const izinli = ALLOWED_ORIGINS.includes(origin);
  return {
    // İzinsiz origin'e origin YANSITILMAZ: tarayıcı yanıtı bloklar.
    'Access-Control-Allow-Origin': izinli ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    // Ara belleklerin farklı origin'lere aynı yanıtı vermemesi için ŞART.
    Vary: 'Origin',
  };
}


Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsFor(request) });

  const target = new URL(request.url).searchParams.get('url');
  if (!target) return new Response('url parametresi gerekli', { status: 400, headers: corsFor(request) });

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response('geçersiz url', { status: 400, headers: corsFor(request) });
  }

  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.includes(parsed.hostname)) {
    return new Response('bu adrese izin yok', { status: 403, headers: corsFor(request) });
  }

  const upstream = await fetch(parsed.toString());
  if (!upstream.ok) return new Response('görsel alınamadı', { status: 502, headers: corsFor(request) });

  return new Response(upstream.body, {
    headers: {
      ...corsFor(request),
      'Content-Type': upstream.headers.get('content-type') ?? 'image/png',
      // Görseller değişmiyor: bir gün önbellekte kalsın, her indirmede yeniden çekilmesin.
      'Cache-Control': 'public, max-age=86400',
    },
  });
});
