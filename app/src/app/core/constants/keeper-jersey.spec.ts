import { KEEPER_JERSEY_COLOR, KEEPER_JERSEY_FALLBACK, keeperJerseyColor } from './keeper-jersey';

/**
 * Kaleci sahada MUTLAKA ayrışmalı. Mor bir turluk hem kaleci formasıydı hem de takım rengi
 * paletindeydi; takım moru seçilince PNG çıktısında kaleci saha oyuncularıyla birebir aynı
 * formada çıktı (kullanıcı geri bildirimi). Palet düzeltildi ama eski kayıtlarda mor takım
 * rengi kalmış olabilir — bu yüzden çakışma kodda da ele alınıyor.
 */
describe('keeperJerseyColor', () => {
  it('normal takım renginde kaleci morunu döndürür', () => {
    expect(keeperJerseyColor('#0068A8')).toBe(KEEPER_JERSEY_COLOR);
  });

  it('takım rengi kaleci moruyla aynıysa yedek tona düşer', () => {
    expect(keeperJerseyColor(KEEPER_JERSEY_COLOR)).toBe(KEEPER_JERSEY_FALLBACK);
    expect(keeperJerseyColor(KEEPER_JERSEY_COLOR.toUpperCase())).toBe(KEEPER_JERSEY_FALLBACK);
  });
});
