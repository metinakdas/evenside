import { createClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

/**
 * Tek Supabase istemcisi — oturum yönetimi (localStorage'da otomatik saklanır) ve
 * tüm tablo erişimleri buradan geçer. `AuthService` ve `PlayerRepositoryService`
 * bunu kullanır, başka yerden doğrudan çağrılmaz.
 */
/**
 * Oturum ayarları AÇIKÇA yazılıyor. Bunlar zaten kütüphane varsayılanı; ama QA denetiminde
 * sayfa yenilemede oturumun düştüğü ve yenilemede HİÇ auth isteği yapılmadığı gözlendi
 * (token tarayıcıdan kaybolmuştu). Varsayılanlara güvenmek yerine niyeti kodda sabitlemek,
 * ileride bir sürüm yükseltmesi varsayılanı değiştirirse sessizce bozulmayı engeller.
 *
 * - persistSession: token localStorage'da kalır (`sb-<ref>-auth-token`)
 * - autoRefreshToken: süresi dolmadan arka planda yenilenir
 * - detectSessionInUrl: OAuth dönüşünde adresteki oturum yakalanır
 */
export const supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
