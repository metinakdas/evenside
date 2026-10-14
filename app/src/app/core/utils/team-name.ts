import { mesaj } from '../services/i18n.service';

/**
 * VARSAYILAN TAKIM ADLARI EKRANDA ÇEVRİLİR, VERİDE ÇEVRİLMEZ.
 *
 * `SquadStore` takımları "Takım A" / "Takım B" diye açar ve bu ad VERİTABANINA yazılır.
 * Adı dile göre kaydetmek yanlış olurdu: kullanıcı dili değiştirince kendi kaydettiği ad
 * değişirdi ve aynı takım iki kişide iki farklı adla görünürdü. Bu yüzden çeviri yalnızca
 * GÖSTERİMDE yapılır ve yalnızca kullanıcının DOKUNMADIĞI varsayılan ada uygulanır.
 *
 * Kullanıcı adı bir kez değiştirdiyse (ör. "Salı Grubu") metin olduğu gibi basılır.
 */
const VARSAYILANLAR: Record<string, 'A' | 'B'> = { 'Takım A': 'A', 'Takım B': 'B' };

export function takimAdiGoster(ad: string | null | undefined): string {
  if (!ad) return '';
  const taraf = VARSAYILANLAR[ad.trim()];
  return taraf ? mesaj('kadro.takimTaraf', { taraf }) : ad;
}
