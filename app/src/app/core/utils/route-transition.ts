import { ActivatedRouteSnapshot, ViewTransitionInfo } from '@angular/router';

/**
 * SAYFA GEÇİŞLERİ (11 Ekim 2026, yayın öncesi: "sayfa geçişlerini güzel kurgula").
 *
 * Tarayıcının View Transitions API'si (Angular `withViewTransitions`) eski ve yeni ekranın
 * görüntüsünü alıp aralarında canlandırır. Burada yalnızca YÖN belirlenir; hareketin kendisi
 * `styles.scss` → "SAYFA GEÇİŞLERİ" bloğunda.
 *
 * Yön, ekranların uygulamadaki DERİNLİĞİNDEN gelir — kullanıcının zihnindeki akış:
 * tanıtım → giriş → menü → kart / takım / kadro → kura → saha. Derine gidince yeni ekran
 * sağdan gelir ("ileri"), geri dönünce soldan ("geri"); aynı derinlikte yumuşak bir solma.
 * Yasal sayfalar tanıtımla aynı katta.
 *
 * Geçiş YAPILMAYAN durumlar: aynı ekranda yalnızca sorgu/çapa değiştiyse (ör. `/my-card?join=1`)
 * ve `prefers-reduced-motion` açıksa — o zaman ekran doğrudan değişir.
 */
const DERINLIK: Record<string, number> = {
  welcome: 0,
  privacy: 0,
  'data-protection': 0,
  cookies: 0,
  terms: 0,
  login: 1,
  '': 2,
  'my-card': 3,
  'create-team': 3,
  squad: 3,
  rate: 4,
  draw: 4,
  pitch: 5,
};

/** Rota anlık görüntüsünün en derin çocuğunun yolu ('' = ana menü). */
function yol(snap: ActivatedRouteSnapshot | null | undefined): string | null {
  let s = snap ?? null;
  let son: string | null = null;
  while (s) {
    if (s.routeConfig) son = s.routeConfig.path ?? '';
    s = s.firstChild;
  }
  return son;
}

export function gecisYonu(onceki: string | null, sonraki: string | null): 'ileri' | 'geri' | 'esit' {
  const a = onceki === null ? undefined : DERINLIK[onceki];
  const b = sonraki === null ? undefined : DERINLIK[sonraki];
  if (a === undefined || b === undefined || a === b) return 'esit';
  return b > a ? 'ileri' : 'geri';
}

export function onViewTransitionCreated(info: ViewTransitionInfo): void {
  const kok = document.documentElement;
  const onceki = yol(info.from);
  const sonraki = yol(info.to);
  const azalt = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if (azalt || onceki === sonraki) {
    info.transition.skipTransition();
    return;
  }
  kok.dataset['gecis'] = gecisYonu(onceki, sonraki);
  /*
   * Tarayıcı geçişi İPTAL EDEBİLİR (ör. telefonda adres çubuğu açılıp kapanınca "Viewport size
   * changed"): o zaman `ready`/`finished` söz reddedilir ve yakalanmazsa konsola hata düşer
   * (uçtan uca testte ölçüldü). İptal zararsızdır — ekran yine yeni sayfaya geçer — bu yüzden
   * ret yutulur; yön işareti her durumda temizlenir.
   */
  const yut = (): void => undefined;
  info.transition.ready.catch(yut);
  info.transition.updateCallbackDone.catch(yut);
  info.transition.finished.catch(yut).finally(() => {
    delete kok.dataset['gecis'];
  });
}
