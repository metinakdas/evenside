import { safeImage } from './safe-image';

describe('safeImage (başkasının yazdığı görsel adresi)', () => {
  it('yüklenen data URL ve TheSportsDB görseli geçer', () => {
    expect(safeImage('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(safeImage('data:image/jpeg;base64,AAAA')).toBe('data:image/jpeg;base64,AAAA');
    expect(safeImage('https://r2.thesportsdb.com/images/media/team/badge/x.png')).toContain('thesportsdb');
  });

  it('yabancı sunucu, http, javascript: ve SVG data URL reddedilir', () => {
    expect(safeImage('https://kotu.example/izle.gif')).toBeNull();
    expect(safeImage('http://r2.thesportsdb.com/a.png')).toBeNull();
    expect(safeImage('javascript:alert(1)')).toBeNull();
    expect(safeImage('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull();
    expect(safeImage('data:text/html;base64,AAAA')).toBeNull();
    expect(safeImage(null)).toBeNull();
    expect(safeImage('')).toBeNull();
  });
});
