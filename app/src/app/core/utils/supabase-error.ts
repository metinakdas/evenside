/**
 * Supabase/PostgREST hatalarını KULLANICIYA YARAR bir cümleye çevirir.
 *
 * Buradaki asıl derdimiz "şema henüz çalıştırılmamış" durumu: uygulamaya yeni bir tablo ya da
 * sütun eklendiğinde `supabase/schema.sql` bir kez çalıştırılmazsa her istek başarısız olur ve
 * arayüz "Takım kurulamadı." gibi hiçbir şey söylemeyen bir mesaj gösterir. Kullanıcı da,
 * geliştirici de saatlerce yanlış yerde arar. Kod bunu tanıyıp doğrudan söylüyor.
 */

/** Eksik tablo (PostgREST şema önbelleği + PostgreSQL) ve eksik sütun kodları. */
const SCHEMA_MISSING_CODES = new Set([
  'PGRST205', // Could not find the table '…' in the schema cache
  'PGRST204', // Could not find the column '…' in the schema cache
  '42P01', // undefined_table
  '42703', // undefined_column
]);
import { mesaj } from '../services/i18n.service';

export interface SupabaseLikeError {
  code?: string | null;
  message?: string | null;
}

export function isSchemaMissing(error: SupabaseLikeError | null | undefined): boolean {
  return !!error?.code && SCHEMA_MISSING_CODES.has(error.code);
}

/**
 * `fallback` normal hata metnidir; şema eksikse onun yerine ne yapılması gerektiğini söyler.
 */
/** Yetki reddi: satır güvenliği (RLS) ya da açık `raise exception … 42501`. */
const FORBIDDEN_CODE = '42501';

/**
 * Sunucunun KENDİ hatası — bağlantı sorunu DEĞİL. Kullanıcıyı internetini kontrol etmeye
 * göndermek burada yanlış yönlendirme oluyor (ölçüldü: 42P17 politika döngüsü "bağlantınızı
 * kontrol edin" diye gösteriliyordu, kullanıcı saatlerce modemine bakabilirdi).
 */
const SERVER_FAULT_CODES = new Set([
  '42P17', // infinite recursion detected in policy
  '42883', // undefined_function
  'PGRST202', // fonksiyon şema önbelleğinde yok
]);

export function describeSupabaseError(error: SupabaseLikeError | null | undefined, fallback: string): string {
  if (isSchemaMissing(error)) {
    return mesaj('mesaj.sunucuGuncellemesi');
  }
  if (error?.code === FORBIDDEN_CODE) {
    return mesaj('mesaj.yetkiYok');
  }
  if (error?.code && SERVER_FAULT_CODES.has(error.code)) {
    return mesaj('mesaj.sunucuHatasi', { kod: error.code });
  }
  /* Tanımadığımız durumda çağıranın Türkçe cümlesi kullanılır; sunucu metni KONSOLA gider. */
  if (error?.message) console.warn('Evenside · sunucu hatası:', error.code ?? '', error.message);
  return fallback;
}
