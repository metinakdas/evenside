/**
 * Kalecinin forması: DÜZ MOR. Kaleci sahada diğer on oyuncudan ayrışmak zorunda; kulüp
 * formaları takım renklerinde olduğu için ayrım rengi hiçbir kulübe ait olmayan bir ton
 * olmalı. Önceden neon yeşildi ve veri ekranlarındaki vurgu yeşiliyle karışıyordu.
 *
 * DİKKAT: bu renk takım rengi paletinde (`TEAM_COLOR_SWATCHES`) BULUNMAMALI — bulunduğu bir
 * turda takım moru seçilince kaleci saha oyuncularıyla birebir aynı formada çıktı (PNG
 * çıktısında görüldü). Yine de eski kayıtlarda mor takım rengi kalmış olabilir: o durumda
 * `keeperJerseyColor()` sarıya düşer.
 */
export const KEEPER_JERSEY_COLOR = '#7B2FF7';

/** Takım rengi kaleci moruyla çakışırsa kullanılan yedek ton. */
export const KEEPER_JERSEY_FALLBACK = '#FFC400';

/** Bu takımın kalecisi hangi renk formayı giyecek. */
export function keeperJerseyColor(teamColor: string): string {
  return teamColor.toLowerCase() === KEEPER_JERSEY_COLOR.toLowerCase() ? KEEPER_JERSEY_FALLBACK : KEEPER_JERSEY_COLOR;
}
