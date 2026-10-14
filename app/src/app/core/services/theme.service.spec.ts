import { TestBed } from '@angular/core/testing';
import { THEME_STORAGE_KEY, ThemeService, isAlwaysDark, readStoredTheme } from './theme.service';

/** Uygulama yalnızca koyu temadır (11 Ekim 2026); eski açık tercih yok sayılır ve silinir. */
describe('ThemeService', () => {
  const kok = document.documentElement;

  afterEach(() => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    delete kok.dataset['theme'];
  });

  it('her zaman koyu açılır', () => {
    TestBed.inject(ThemeService);
    expect(readStoredTheme()).toBe('dark');
    expect(kok.dataset['theme']).toBe('dark');
  });

  it('cihazda kalmış eski AÇIK tercih yok sayılır ve silinir', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(readStoredTheme()).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('her zaman koyu kalan rotaları tanır (sorgu dizgesi ve alt yol dahil)', () => {
    expect(isAlwaysDark('/welcome')).toBeTrue();
    expect(isAlwaysDark('/login?x=1')).toBeTrue();
    expect(isAlwaysDark('/squad')).toBeFalse();
  });
});
