/**
 * AÇIK TAKIM SEÇİMİ (11 Ekim 2026, uçtan uca testte bulunan veri kaybı hatası).
 *
 * Seçim cihaza yazılıyor; yeni cihazda boş kalınca kadro ekranı HİÇBİR takıma bağlı olmayan
 * yerel bir kadroyla çalışıyor, eklenen oyuncular sunucuya yazılmıyordu. Kural: takımı olan
 * kullanıcıda açık takım asla boş ya da yabancı kalmaz — önce KENDİ kurduğu takım, yoksa ilki.
 * Dönüş: seçilmesi gereken takım; mevcut seçim geçerliyse onun kendisi, hiç takım yoksa null.
 */
export function acikTakimSec(mevcut: string | null, takimlar: readonly { squad: { id: string }; role: string }[]): string | null {
  if (mevcut && takimlar.some((t) => t.squad.id === mevcut)) return mevcut;
  const kendi = takimlar.find((t) => t.role === 'kurucu') ?? takimlar[0];
  return kendi?.squad.id ?? null;
}
