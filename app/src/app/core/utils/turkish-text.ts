/**
 * Türkçe metin dönüşümleri. JavaScript'in yerel-bağımsız `toUpperCase()`/`toLowerCase()`
 * çağrıları Türkçe için yanlış sonuç verir: "Şimşek" → "ŞIMŞEK" (noktasız I), doğrusu
 * "ŞİMŞEK". Kullanıcıya görünen her metin bu yardımcılardan geçmeli.
 */

/** Türkçe kurallarıyla büyük harfe çevirir ("i" → "İ", "ı" → "I"). */
export function trUpper(value: string): string {
  return value.toLocaleUpperCase('tr-TR');
}

/** Türkçe kurallarıyla küçük harfe çevirir ("I" → "ı", "İ" → "i"). */
export function trLower(value: string): string {
  return value.toLocaleLowerCase('tr-TR');
}

const FOLD_MAP: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  i: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
  â: 'a',
  î: 'i',
  û: 'u',
};

/**
 * Aramada karşılaştırma için "katlanmış" biçim: Türkçe kurallarıyla küçültür, sonra
 * aksanlı harfleri ASCII karşılıklarına indirir. Böylece "dogan" araması "Doğan"ı,
 * "SIMSEK" araması "Şimşek"i bulur (kullanıcı geri bildirimi: "dogan" hiç sonuç vermiyordu).
 */
export function trFold(value: string): string {
  return trLower(value.trim())
    .split('')
    .map((ch) => FOLD_MAP[ch] ?? ch)
    .join('');
}

/** Tam addan soyadı — boşsa "OYUNCU". Büyük harfe ÇEVİRMEZ, sadece ayıklar. */
export function surnameOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : 'OYUNCU';
}

/**
 * Kartlarda gösterilecek isim etiketleri. Kartlar yalnızca soyadı basıyor; aynı kadroda üç
 * "DOĞAN" olunca hangisinin kim olduğu anlaşılmıyordu (QA denetimi). Soyadı çakışanlara
 * adın baş harfi eklenir: "H. DOĞAN", "U. DOĞAN". Çakışma yoksa etiket sade kalır.
 */
export function buildNameLabels(people: readonly { id: string; name: string }[]): Map<string, string> {
  const bySurname = new Map<string, { id: string; name: string }[]>();
  for (const person of people) {
    const key = trUpper(surnameOf(person.name));
    bySurname.set(key, [...(bySurname.get(key) ?? []), person]);
  }

  const labels = new Map<string, string>();
  for (const [surname, group] of bySurname) {
    for (const person of group) {
      if (group.length === 1) {
        labels.set(person.id, surname);
        continue;
      }
      const first = person.name.trim().split(/\s+/).filter(Boolean)[0] ?? '';
      const initial = first && first !== surnameOf(person.name) ? `${trUpper(first.charAt(0))}. ` : '';
      labels.set(person.id, `${initial}${surname}`);
    }
  }
  return labels;
}
