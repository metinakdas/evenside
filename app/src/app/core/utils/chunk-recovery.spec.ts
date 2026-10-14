import { parcaHatasiMi } from './chunk-recovery';

describe('parcaHatasiMi', () => {
  it('yayın sonrası eksik parça hatalarını tanır', () => {
    expect(parcaHatasiMi(new TypeError('Failed to fetch dynamically imported module: https://x/chunk-ABC.js'))).toBeTrue();
    expect(parcaHatasiMi(new TypeError('Importing a module script failed.'))).toBeTrue();
    expect(parcaHatasiMi(new TypeError("Expected a JavaScript module script but the server responded with a MIME type of 'text/html'."))).toBeTrue();
    expect(parcaHatasiMi(Object.assign(new Error('Loading chunk 12 failed'), { name: 'ChunkLoadError' }))).toBeTrue();
  });

  it('sıradan hatalarda sayfayı yenilemez', () => {
    expect(parcaHatasiMi(new Error('Cannot match any routes'))).toBeFalse();
    expect(parcaHatasiMi(null)).toBeFalse();
  });
});
