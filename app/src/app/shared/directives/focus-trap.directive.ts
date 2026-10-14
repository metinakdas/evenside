import { AfterViewInit, DestroyRef, Directive, ElementRef, inject } from '@angular/core';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Bindirmeli panellerde (oyuncu formu gibi) klavye odağını panel içinde tutar.
 * Denetim bulgusu: modal açıkken arka plandaki butonlar sekmeyle geziliyordu — klavye
 * ve ekran okuyucu kullanıcıları için panel "modal" değil, sadece üstte duran bir kutuydu.
 *
 * Açılışta ilk odaklanabilir öğeye odaklanır, Tab/Shift+Tab'i panel içinde döndürür ve
 * kapanışta odağı paneli açan öğeye geri verir.
 */
@Directive({
  selector: '[appFocusTrap]',
  standalone: true,
  host: { '(keydown.tab)': 'onTab($event)', '(keydown.shift.tab)': 'onTab($event)' },
})
export class FocusTrapDirective implements AfterViewInit {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly previouslyFocused = document.activeElement as HTMLElement | null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.previouslyFocused?.focus?.());
  }

  ngAfterViewInit(): void {
    this.focusable()[0]?.focus();
  }

  /*
   * Angular 21: host bağlamalarında $event artık `Event` olarak tiplenip daraltma
   * yapılmadan geçirilmiyor. Daraltma METOT İÇİNDE yapılıyor — şablonda `$any()` ile
   * tipi susturmak yerine, çünkü buradaki daraltma çalışma zamanında da doğru.
   */
  protected onTab(event: Event): void {
    if (!(event instanceof KeyboardEvent)) return;
    const items = this.focusable();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;

    // Panelin dışına çıkacak olan sekme, diğer uca sarılır.
    if (event.shiftKey && (active === first || !this.host.contains(active))) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusable(): HTMLElement[] {
    return Array.from(this.host.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
  }
}
