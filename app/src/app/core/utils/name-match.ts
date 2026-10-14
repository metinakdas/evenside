import { trFold } from './turkish-text';

/**
 * İSİM EŞLEŞTİRME — "kendi kartım" özelliğinin çekirdeği.
 *
 * Kadroda "Ali Yılmaz" diye bir havuz kartı varken, aynı isimli bir kullanıcı kendi kartını
 * oluşturmuşsa arayüz "kartları eşle" önerir. Karar EŞLEŞME DEĞİL ÖNERİDİR: aynı isimde iki
 * gerçek kişi olabilir, bu yüzden eşleme her zaman kullanıcı onayıyla yapılır (bkz.
 * proje notları).
 */

/**
 * Karşılaştırma anahtarı: Türkçe katlanmış (büyük/küçük ve aksan farkı yok), fazla boşluklar
 * tek boşluğa inmiş hâl. "  ALİ   yılmaz " ve "Ali Yilmaz" aynı anahtarı verir.
 *
 * Noktalama TAMAMEN atılmaz, yalnızca ad içinde anlam taşımayanlar temizlenir: "O'Brien" ile
 * "OBrien" aynı kişidir ama "Ali-Can" ile "Ali Can" da aynıdır.
 */
export function personNameKey(fullName: string): string {
  return trFold(fullName)
    .replace(/['’`.]/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** İki ad aynı kişiyi işaret ediyor olabilir mi? */
export function isSamePersonName(a: string, b: string): boolean {
  const keyA = personNameKey(a);
  return keyA.length > 0 && keyA === personNameKey(b);
}

export interface NameMatchCandidate {
  id: string;
  name: string;
}

/**
 * `name` ile eşleşen adayları döndürür — kendisi hariç. Sıra korunur; çağıran taraf hangisini
 * önereceğine kendi karar verir (ör. yalnızca sahipli kartlar).
 */
export function findNameMatches<T extends NameMatchCandidate>(
  name: string,
  candidates: readonly T[],
  excludeId?: string,
): T[] {
  const key = personNameKey(name);
  if (!key) return [];
  return candidates.filter((c) => c.id !== excludeId && personNameKey(c.name) === key);
}
