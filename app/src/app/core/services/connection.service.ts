import { Injectable, inject, signal } from '@angular/core';
import { NoticeService } from './notice.service';
import { mesaj } from './i18n.service';

/**
 * BAĞLANTI GÖZCÜSÜ — "sonsuza kadar dönen çember" sorununun kökü.
 *
 * Ağ gidince istekler sessizce askıda kalıyordu: ekranda iskelet/çember dönüyor, hiçbir şey
 * olmuyor, kullanıcı uygulamayı bozuk sanıyordu. Artık:
 *  - tarayıcı çevrimdışına düşünce ekranın sağ üstünde kalıcı bir uyarı beliriyor,
 *  - bağlantı dönünce "yeniden bağlanıldı" bildirimi düşüyor,
 *  - uzun süren istekler `withTimeout` ile KESİLİYOR (aşağıda).
 *
 * `navigator.onLine` tek başına güvenilir değildir (ağ var ama internet yok durumunu bilmez);
 * bu yüzden asıl güvence zaman aşımıdır, bu sınıf yalnızca kullanıcıya durumu söyler.
 */
@Injectable({ providedIn: 'root' })
export class ConnectionService {
  private readonly notices = inject(NoticeService);
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('offline', () => {
      this.online.set(false);
      this.notices.show('warning', mesaj('mesaj.baglantiYok'));
    });
    window.addEventListener('online', () => {
      this.online.set(true);
      this.notices.success(mesaj('mesaj.baglantiGeldi'));
    });
  }
}

/** Zaman aşımı süresi (ms). Supabase'in kendi denemeleriyle birlikte bu kadar beklenir. */
export const REQUEST_TIMEOUT_MS = 12000;

/**
 * Bir isteği SÜREYLE sınırlar. Süre dolarsa `null` döner — çağıran taraf "yükleniyor"
 * durumundan çıkıp hata gösterebilir. Çember sonsuza kadar dönmez.
 */
export async function withTimeout<T>(work: Promise<T>, ms = REQUEST_TIMEOUT_MS): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
