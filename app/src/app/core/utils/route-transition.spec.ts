import { gecisYonu } from './route-transition';

describe('sayfa geçişi yönü', () => {
  it('derine giderken ileri, geri dönerken geri', () => {
    expect(gecisYonu('welcome', 'login')).toBe('ileri');
    expect(gecisYonu('', 'squad')).toBe('ileri');
    expect(gecisYonu('draw', 'pitch')).toBe('ileri');
    expect(gecisYonu('pitch', '')).toBe('geri');
    expect(gecisYonu('squad', '')).toBe('geri');
  });

  it('aynı katta ve bilinmeyen rotada solma', () => {
    expect(gecisYonu('my-card', 'squad')).toBe('esit');
    expect(gecisYonu('privacy', 'welcome')).toBe('esit');
    expect(gecisYonu(null, 'squad')).toBe('esit');
  });
});
