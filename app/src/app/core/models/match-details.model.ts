/**
 * PNG çıktısının başlığına basılan maç bilgisi. "İndir" bunları sorar ve İKİSİ DE ZORUNLUDUR:
 * kadro görselini gruba atan kişi tarih/saat/konumu ayrıca yazmak zorunda kalmasın.
 */
export interface MatchDetails {
  /** Saha adı / adres — tek satır. */
  venue: string;
  /**
   * Başlama vakti, `input[type=datetime-local]` biçiminde: `yyyy-MM-ddTHH:mm`.
   * Tarih ve saat TEK alanda (kullanıcı isteği) — tarayıcının yerleşik takvim+saat seçicisi
   * açılır, ayrı kütüphane gerekmez.
   */
  kickoff: string;
}

/** Boş form değeri. */
export const EMPTY_MATCH_DETAILS: MatchDetails = { venue: '', kickoff: '' };
