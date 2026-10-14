/**
 * KADRO KATILMA KODU.
 *
 * Kod WhatsApp'tan yazılıp elle giriliyor, bu yüzden gözle karışan karakterler alfabeden
 * ÇIKARILDI: 0/O, 1/I/İ/L, 2/Z, 5/S, 8/B. Kalan 24 harf/rakamla 6 hane ≈ 191 milyon
 * olasılık — bir arkadaş grubunun kadroları için fazlasıyla yeterli.
 *
 * Türkçe karakter yok: kod bir kimlik, okunacak bir metin değil; "Ş" ile "S" ayrımı telefonda
 * yazarken hata kaynağı olurdu.
 */
const ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679';
const CODE_LENGTH = 6;

export function generateJoinCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return code;
}

/**
 * Kullanıcının yazdığını koda çevirir: büyük harfe alır, boşluk ve tireleri atar, karışan
 * karakterleri doğrusuna map'ler. "kad-3g7 pq" → "KAD3G7PQ" gibi.
 *
 * Böylece "0" yazan kullanıcı "O" demiş sayılır; kod alfabesinde ikisinden yalnızca biri var.
 */
const CONFUSIONS: Record<string, string> = {
  '0': 'Q',
  O: 'Q',
  Ö: 'Q',
  '1': '7',
  I: 'J',
  İ: 'J',
  L: 'J',
  '2': 'X',
  Z: 'X',
  '5': 'X',
  S: 'X',
  Ş: 'X',
  '8': 'A',
  B: 'A',
  Ç: 'C',
  Ğ: 'G',
  Ü: 'U',
};

export function normalizeJoinCode(raw: string): string {
  const upper = raw.toLocaleUpperCase('tr-TR').replace(/[^0-9A-ZÇĞİÖŞÜ]/g, '');
  let out = '';
  for (const ch of upper) {
    const mapped = ALPHABET.includes(ch) ? ch : CONFUSIONS[ch];
    if (mapped) out += mapped;
  }
  return out.slice(0, CODE_LENGTH);
}

export function isValidJoinCode(raw: string): boolean {
  return normalizeJoinCode(raw).length === CODE_LENGTH;
}
