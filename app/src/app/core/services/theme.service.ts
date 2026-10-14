import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'saha42.tema.v1';

/**
 * Her zaman KOYU kalan ekranlar. Dördü de fotoğraf atmosferli sahneler (tanıtım, giriş,
 * kura töreni, saha) ve tasarım dili "tören/sahne koyu kutuptadır" der — açık temada orayı
 * beyaza çevirmek stadyum fotoğraflarını, konfetiyi ve VS mührünü bozardı. Giriş ekranı bir
 * tur açık temaya çevrildi: fotoğrafın perdesi beyaz bir sise döndü, "veya e-posta ile"
 * çipi okunmaz oldu (ölçüldü) — geri alındı.
 */
const ALWAYS_DARK = ['/welcome', '/login', '/draw', '/pitch'];

export function isAlwaysDark(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  return ALWAYS_DARK.some((p) => path === p || path.startsWith(p + '/'));
}

/**
 * Uygulama YALNIZCA KOYU temadır (11 Ekim 2026, kullanıcı isteği: "tema sadece koyu kalsın").
 * Tema seçici kaldırıldı; daha önce açık tema seçmiş cihazdaki eski tercih yok sayılır ve
 * açılışta silinir. `light-dark()` yazılmış renkler zararsız: `color-scheme` hep koyu.
 */
export function readStoredTheme(): ThemeMode {
  try {
    localStorage.removeItem(THEME_STORAGE_KEY);
  } catch {
    // depo kapalı: zaten okunmuyor
  }
  return 'dark';
}

/**
 * Açık / koyu tema.
 *
 * - Tercih CİHAZA aittir (dil tercihi gibi): giriş yapmadan da seçilebilir, kullanıcı verisi
 *   değildir — bu yüzden `UserScopeService` kapsamına girmez.
 * - Uygulanan tema `<html data-theme>`'dir; renklerin hangisinin geçerli olacağını CSS'teki
 *   `light-dark()` çözer (bkz. `_tokens.scss`).
 * - `effective` rota bazındadır: her zaman koyu kalan ekranlarda tercih ne olursa olsun koyu.
 */
/**
 * Tema — YALNIZCA KOYU (11 Ekim 2026, kullanıcı isteği). Açık tema ve seçici kaldırıldı; servis
 * yalnızca <html data-theme="dark"> yazar. `readStoredTheme` eski açık tercihi açılışta siler.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly effective = signal<ThemeMode>('dark');

  constructor() {
    applyTheme(readStoredTheme());
  }
}

export function applyTheme(mode: ThemeMode): void {
  document.documentElement.dataset['theme'] = mode;
}
