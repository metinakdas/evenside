import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

/** Arama sonucundaki bir kulüp. */
export interface SportsDbTeam {
  id: string;
  name: string;
  league: string;
  country: string;
  /** Kulüp arması (uzak URL). */
  badgeUrl: string | null;
  /** Güncel forma görseli (uzak URL). */
  kitUrl: string | null;
  /**
   * Kulübün birincil rengi (`strColour1`). PNG çıktısında forma GÖRSELİ kullanılamadığı
   * durumda (CORS proxy'si yoksa) vektör forma en azından kulübün renginde çizilsin diye
   * saklanır. API'de çoğu Türk kulübünde boş geliyor (ölçüldü) — o zaman null.
   */
  colour: string | null;
}

/** Kulübün bir sezona ait forma görseli. */
export interface SportsDbKit {
  id: string;
  season: string;
  /** "1st" / "2nd" / "3rd" — API'nin kendi etiketi. */
  type: string;
  url: string;
}

interface RawTeam {
  idTeam?: string;
  strColour1?: string | null;
  strTeam?: string;
  strLeague?: string;
  strCountry?: string;
  strBadge?: string | null;
  strEquipment?: string | null;
  strSport?: string;
}

interface RawEquipment {
  idEquipment?: string;
  strSeason?: string;
  strType?: string;
  strEquipment?: string | null;
}

/**
 * TheSportsDB (ücretsiz v1 API) istemcisi — kulüp arması ve forma görselleri için.
 *
 * ÖNEMLİ, ölçülerek doğrulandı: API'nin JSON uçları `Access-Control-Allow-Origin: *`
 * gönderiyor (tarayıcıdan çağrılabilir), ama GÖRSEL sunucusu (`r2.thesportsdb.com`) CORS
 * başlığı GÖNDERMİYOR. Sonuçları:
 *   - `<img src="...">` ile göstermek çalışır.
 *   - `fetch()` ile indirmek CORS'a takılır ("Failed to fetch"), yani görseli data URL'e
 *     çevirip saklayamayız.
 *   - Görsel bir canvas'a çizilirse canvas "tainted" olur ve `toDataURL` SecurityError
 *     fırlatır — bu yüzden PNG çıktısında (bkz. `PitchExportService`) uzak görseller
 *     kullanılmaz, oradaki çizim vektör formaya/baş harflere düşer.
 * Bu yüzden takımda uzak URL saklanır, data URL değil.
 */
/** `#dc052d` / `dc052d` → `#dc052d`; boş ya da geçersizse null. */
function normalizeColour(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  const hex = raw.startsWith('#') ? raw : `#${raw}`;
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex : null;
}

@Injectable({ providedIn: 'root' })
export class SportsDbService {
  private readonly base = `https://www.thesportsdb.com/api/v1/json/${environment.sportsDbKey}`;

  /**
   * Bir ligin kulüpleri — açılır liste bununla DOLU açılır, kullanıcı yazmadan da seçebilsin.
   *
   * Ücretsiz/test anahtarı bu ucu 10 sonuçla sınırlıyor (ölçüldü: Süper Lig 10 takım
   * döndürüyor, alfabetik). Listede olmayan kulüp için arama kutusu var.
   */
  async leagueTeams(league: string): Promise<SportsDbTeam[]> {
    const data = await this.get<{ teams: RawTeam[] | null }>(`search_all_teams.php?l=${encodeURIComponent(league)}`);
    return this.mapTeams(data?.teams ?? []);
  }

  /** Kulüp adına göre arama. Futbol dışındaki sporlar elenir. */
  async searchTeams(query: string): Promise<SportsDbTeam[]> {
    const term = query.trim();
    if (term.length < 2) return [];
    const data = await this.get<{ teams: RawTeam[] | null }>(`searchteams.php?t=${encodeURIComponent(term)}`);
    return this.mapTeams(data?.teams ?? []);
  }

  private mapTeams(raw: RawTeam[]): SportsDbTeam[] {
    return raw
      .filter((t) => (t.strSport ?? 'Soccer') === 'Soccer')
      .map((t) => ({
        id: t.idTeam ?? '',
        name: t.strTeam ?? '',
        league: t.strLeague ?? '',
        country: t.strCountry ?? '',
        badgeUrl: t.strBadge || null,
        kitUrl: t.strEquipment || null,
        colour: normalizeColour(t.strColour1),
      }))
      .filter((t) => t.id && t.name);
  }

  /**
   * Kulübün forma arşivi — en yeni sezon başa alınır. Arama sonucundaki `kitUrl` yalnızca
   * güncel formayı verir; kullanıcı başka bir sezon/deplasman forması seçebilsin diye bu uç
   * ayrıca çağrılır.
   */
  async kits(teamId: string): Promise<SportsDbKit[]> {
    const data = await this.get<{ equipment: RawEquipment[] | null }>(`lookupequipment.php?id=${encodeURIComponent(teamId)}`);
    return (data?.equipment ?? [])
      .filter((e) => !!e.strEquipment)
      .map((e) => ({
        id: e.idEquipment ?? '',
        season: e.strSeason ?? '',
        type: e.strType ?? '',
        url: e.strEquipment as string,
      }))
      .sort((a, b) => b.season.localeCompare(a.season));
  }

  private async get<T>(path: string): Promise<T | null> {
    const response = await fetch(`${this.base}/${path}`);
    if (!response.ok) throw new Error(`TheSportsDB ${response.status}`);
    return (await response.json()) as T;
  }
}
