export type TeamSide = 'A' | 'B';

export interface TeamInfo {
  side: TeamSide;
  name: string;
  color: string;
  /** Kulüp arması: yüklenen dosyada data URL, TheSportsDB'den seçildiğinde uzak URL. */
  logoImage: string | null;
  /**
   * Forma görseli — yalnızca TheSportsDB'den seçilir (uzak URL). null ise sahada vektör
   * forma takımın renginde çizilir.
   */
  kitImage?: string | null;
  /**
   * Kalecinin forması: kulübün İKİNCİ (deplasman) forması. TheSportsDB'de ayrı bir kaleci
   * forması yok (ölçüldü: yalnızca `1st`/`2nd`), kaleci de sahada ayrışmak zorunda — deplasman
   * forması hem kulüp kimliğini taşır hem de saha oyuncularından farklıdır. Kulübün ikinci
   * forması yoksa null kalır ve kaleci düz mor vektör formada oynar.
   */
  keeperKitImage?: string | null;
  /** Seçilen kulübün adı (arama kutusunda ve "kaldır" düğmesinde gösterilir). */
  clubName?: string | null;
  /** TheSportsDB kulüp kimliği — eksik forma bilgisini sonradan tamamlayabilmek için. */
  clubId?: string | null;
}
