#!/usr/bin/env node
/**
 * SIZINTI TARAMASI — yayına çıkmadan önce çalıştırın:  (app/ içinden)  npm run sizinti-tara
 *
 * Yayına giden her şeyi (app/src, app/public, app/dist) gizli bilgi kalıpları için tarar ve
 * bulursa ÇIKIŞ KODU 1 verir. 13 Eylül 2026'da public/ altında gerçek bir oturum jetonu
 * yayınlanmıştı (__seed.html); bu betik o hatanın bir daha sessizce olmaması için var.
 *
 * Bilinçli MUAF: Supabase "publishable" anahtarı (sb_publishable_…) — istemcide durması
 * tasarım gereği, veriyi satır güvenliği (RLS) korur. "anon" JWT'si de aynı nedenle muaf
 * (payload'ında "role":"anon" yazar).
 */
const fs = require('fs');
const path = require('path');

const APP = path.resolve(__dirname, '..', 'app');
const KOKLER = ['src', 'public', 'dist'].map((d) => path.join(APP, d)).filter((d) => fs.existsSync(d));
const IKILI = /\.(png|jpe?g|webp|gif|ico|wasm|tflite|mp4|mp3|woff2?|ttf|eot|pdf)$/i;

const KURALLAR = [
  { ad: 'JWT (anon olmayan)', re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, sus: (m) => jwtRol(m) === 'anon' },
  { ad: 'service_role', re: /service_role/g, sus: (m, satir) => /RLS|politika|policy|--|\/\/|\*/.test(satir) },
  { ad: 'Supabase gizli anahtar', re: /sb_secret_[A-Za-z0-9_-]{10,}/g },
  { ad: 'Yenileme jetonu', re: /"refresh_token"\s*:\s*"[A-Za-z0-9_-]{8,}"/g },
  { ad: 'Oturum deposu dökümü', re: /sb-[a-z0-9]{10,}-auth-token"\s*:/g },
  { ad: 'Özel anahtar', re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { ad: 'Stripe/OpenAI/GitHub anahtarı', re: /\b(sk_live_[A-Za-z0-9]{16,}|sk-[A-Za-z0-9]{32,}|ghp_[A-Za-z0-9]{30,})\b/g },
  { ad: 'Açık parola', re: /\b(password|sifre|şifre)\s*[:=]\s*['"][^'"\s]{6,}['"]/gi, sus: (m, satir, dosya) => /\.spec\.ts$/.test(dosya) },
];

function jwtRol(jwt) {
  try {
    const govde = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
    return govde.role ?? null;
  } catch {
    return null;
  }
}

const bulgular = [];
let taranan = 0;
function gez(dizin) {
  for (const ad of fs.readdirSync(dizin)) {
    const p = path.join(dizin, ad);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (ad === 'node_modules' || ad === '.angular') continue;
      gez(p);
      continue;
    }
    if (IKILI.test(ad) || st.size > 8 * 1024 * 1024) continue;
    taranan++;
    const metin = fs.readFileSync(p, 'utf8');
    const satirlar = metin.split('\n');
    for (const k of KURALLAR) {
      k.re.lastIndex = 0;
      let m;
      while ((m = k.re.exec(metin))) {
        const satirNo = metin.slice(0, m.index).split('\n').length;
        const satir = satirlar[satirNo - 1] ?? '';
        if (k.sus && k.sus(m[0], satir, p)) continue;
        bulgular.push(`${k.ad}: ${path.relative(APP, p)}:${satirNo}  ${m[0].slice(0, 24)}…`);
      }
    }
  }
}
KOKLER.forEach(gez);
console.log(`Taranan dosya: ${taranan} (${KOKLER.map((k) => path.basename(k)).join(', ')})`);
if (bulgular.length) {
  console.log('SIZINTI ŞÜPHESİ:\n  ' + bulgular.join('\n  '));
  process.exit(1);
}
console.log('Temiz: gizli bilgi kalıbı bulunamadı.');
