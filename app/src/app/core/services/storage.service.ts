import { Injectable, inject } from '@angular/core';
import { UserScopeService } from './user-scope.service';
import { DrawResult, SquadFormat } from '../models/draw.model';
import { TeamInfo } from '../models/team.model';

// v2: oyuncular artık Supabase'teki havuza referansla tutulur (bkz. SquadStore),
// bu yüzden şema değişti — v1'deki tam Player[] ile uyumsuz, anahtar bilerek değiştirildi.
const STORAGE_KEY = 'saha42.squad.v2';

/**
 * HER TAKIMIN KENDİ KADROSU var. Kullanıcı birden fazla takım kurabildiği için tek bir
 * anahtar yetmiyor: iki takım aynı kadroyu paylaşırsa birinde yapılan değişiklik diğerini
 * bozar. Takım seçilmemişse (ya da hiç takım yoksa) eski tekil anahtar kullanılır — böylece
 * takım özelliğinden önce kurulmuş kadrolar kaybolmaz.
 */
function baseKeyFor(teamId: string | null | undefined): string {
  return teamId ? `${STORAGE_KEY}.${teamId}` : STORAGE_KEY;
}

/**
 * Artık yazılmayan, eski sürümlerden kalmış anahtarlar. Açılışta bir kez silinir ki
 * tarayıcı deposunda ölü veri birikmesin (kullanıcı geri bildirimi: "v1 hâlâ duruyor").
 */
// `saha42.intro.*`: açılış videosu kaldırıldı (kullanıcı isteği), tercihi de anlamsız kaldı.
const LEGACY_KEYS = ['saha42.squad.v1', 'saha42.intro.skipped', 'saha42.ses.v1'];

export interface PersistedSquad {
  format: SquadFormat;
  teams: [TeamInfo, TeamInfo];
  squadPlayerIds: string[];
  /**
   * Kura sonucu da saklanır: aksi hâlde `/pitch`'da sayfa yenilendiğinde kurulmuş
   * takımlar uçuyor ve kullanıcı boş bir sahayla kalıyordu. Kura çekilmemişse null.
   */
  drawResult: DrawResult | null;
}

/**
 * `SquadStore`'un tek kalıcılık kapısı. Kadro `localStorage`'a yazılır ki sayfa
 * yenilenince kaybolmasın (bkz. proje notları Faz 4.4). Hatalar (bozuk JSON,
 * kota dolması) burada yutulur ve konsola loglanır — kullanıcıya görünür hata
 * mesajı Faz 8'in kapsamı, `SquadStore.persistError` sinyali o iş için hazır.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly scope = inject(UserScopeService);

  /** Anahtar HEM takıma HEM kullanıcıya bağlı: aynı cihazda iki hesap birbirini ezmesin. */
  private keyFor(teamId: string | null | undefined): string {
    return this.scope.key(baseKeyFor(teamId));
  }

  save(data: PersistedSquad, teamId: string | null = null): boolean {
    try {
      localStorage.setItem(this.keyFor(teamId), JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('Evenside: kadro kaydedilemedi.', error);
      return false;
    }
  }

  load(teamId: string | null = null): PersistedSquad | null {
    try {
      const raw = localStorage.getItem(this.keyFor(teamId));
      if (!raw) return null;
      // `drawResult` v2'nin ilk sürümünde yoktu — eski kayıtlarda alan hiç bulunmaz,
      // bu yüzden anahtar yükseltmek yerine eksik alan null'a düşürülür.
      const parsed = JSON.parse(raw) as Partial<PersistedSquad>;
      if (!parsed || typeof parsed !== 'object') return null;
      return { ...parsed, drawResult: parsed.drawResult ?? null } as PersistedSquad;
    } catch (error) {
      console.error('Evenside: kayıtlı kadro okunamadı, sıfırdan başlanıyor.', error);
      return null;
    }
  }

  /** Eski sürüm anahtarlarını temizler — veri taşımaz, sadece çöpü siler. */
  purgeLegacyKeys(): void {
    try {
      LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch {
      // Depoya erişilemiyorsa temizlik de gereksiz.
    }
  }

  clear(teamId: string | null = null): void {
    try {
      localStorage.removeItem(this.keyFor(teamId));
    } catch {
      // Kaydedilecek bir şey yoksa temizleme hatası önemsiz.
    }
  }
}
