import { Injectable, computed, inject, signal } from '@angular/core';
import { UserScopeService } from './user-scope.service';
import { Player } from '../models/player.model';
import { personNameKey } from '../utils/name-match';
import { PlayerRepositoryService } from './player-repository.service';
import { mesaj } from './i18n.service';

const STORAGE_KEY = 'saha42.cardmatch.v1';

/** Bir havuz kartı ile aynı isimli, sahipli bir kartın eşleşme önerisi. */
export interface CardMatchSuggestion {
  /** Kadro sahibinin elle eklediği kart. */
  poolCard: Player;
  /** Kişinin kendi (anketle oluşturduğu) kartı. */
  ownedCard: Player;
}

const pairKey = (poolId: string, ownedId: string): string => `${poolId}|${ownedId}`;

/**
 * KART EŞLEŞTİRME — "bu havuz kartı aslında şu kişinin kendi kartı mı?"
 *
 * Öneri üretir, KARAR VERMEZ: aynı isimde iki gerçek kişi olabilir, bu yüzden eşleme her
 * zaman onayla yapılır (bkz. proje notları · "İsim eşleştirme").
 *
 * Eşlemeyi kadro sahibi de başlatabilir (kullanıcı kararı: kadro sahibi her şeyi yapmaya
 * yetkili). Reddedilen öneri BİR DAHA sorulmaz — yoksa aynı iki isim her açılışta tekrar
 * önerilir ve uyarı çöpe döner.
 */
@Injectable({ providedIn: 'root' })
export class CardMatchService {
  /** Reddedilen öneriler kişiye aittir: başka hesabın kararı bu hesabı bağlamaz. */
  private readonly scope = inject(UserScopeService);

  private readonly players = inject(PlayerRepositoryService);

  /** "Ayrı kalsınlar" denen çiftler; cihaza özel, kararı tekrar sormamak için. */
  private readonly dismissed = signal<Set<string>>(this.read());
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  /**
   * Açık öneriler. Yalnızca SAHİPSİZ havuz kartları aday: sahipli kart zaten birinin,
   * eşlenmiş kart zaten bir takma ad.
   */
  readonly suggestions = computed<CardMatchSuggestion[]>(() => {
    const owned = this.players.ownedCards();
    if (owned.length === 0) return [];

    const byKey = new Map<string, Player[]>();
    for (const card of owned) {
      const key = personNameKey(card.input.name);
      if (!key) continue;
      byKey.set(key, [...(byKey.get(key) ?? []), card]);
    }

    const skipped = this.dismissed();
    const out: CardMatchSuggestion[] = [];

    for (const poolCard of this.players.players()) {
      if (poolCard.ownerId || poolCard.mergedInto) continue;
      const key = personNameKey(poolCard.input.name);
      if (!key) continue;
      for (const ownedCard of byKey.get(key) ?? []) {
        if (skipped.has(pairKey(poolCard.id, ownedCard.id))) continue;
        out.push({ poolCard, ownedCard });
      }
    }

    return out;
  });

  /**
   * Belirli kartlar (bir takıma KODLA KATILAN üyelerin kendi kartları) için öneriler. Takımı
   * kuran kişi "Kullanıcılar" sekmesinde her üyenin altında görür: üye katıldığında havuzda onun
   * adını taşıyan, elle girilmiş bir kart varsa uyarı çıkar ve iki kart tek dokunuşla eşlenir.
   * Reddedilen çift tekrar sorulmaz.
   */
  forOwnedCards(ownedIds: ReadonlySet<string>): CardMatchSuggestion[] {
    if (ownedIds.size === 0) return [];
    const skipped = this.dismissed();
    const byId = this.players.playersById();
    const out: CardMatchSuggestion[] = [];
    for (const id of ownedIds) {
      const ownedCard = byId.get(id);
      if (!ownedCard || !ownedCard.ownerId) continue;
      const key = personNameKey(ownedCard.input.name);
      if (!key) continue;
      for (const poolCard of this.players.players()) {
        if (poolCard.ownerId || poolCard.mergedInto || poolCard.id === ownedCard.id) continue;
        if (personNameKey(poolCard.input.name) !== key) continue;
        if (skipped.has(pairKey(poolCard.id, ownedCard.id))) continue;
        out.push({ poolCard, ownedCard });
      }
    }
    return out;
  }

  /** Eşlemeyi uygular: havuz kartı kişinin kartına yönlendirilir. */
  async link(suggestion: CardMatchSuggestion): Promise<boolean> {
    this.busy.set(true);
    this.error.set(null);
    const ok = await this.players.linkToOwnedCard(suggestion.poolCard.id, suggestion.ownedCard.id);
    this.busy.set(false);
    if (!ok) this.error.set(mesaj('mesaj.kartEslenemedi'));
    return ok;
  }

  /** İki kart "ayrı kişiler" diye işaretlendi mi (sıra fark etmez). */
  isDismissedPair(a: string, b: string): boolean {
    const set = this.dismissed();
    return set.has(pairKey(a, b)) || set.has(pairKey(b, a));
  }

  /** "Ayrı kalsınlar" — öneri bir daha çıkmaz. */
  dismiss(suggestion: CardMatchSuggestion): void {
    const next = new Set(this.dismissed());
    next.add(pairKey(suggestion.poolCard.id, suggestion.ownedCard.id));
    this.dismissed.set(next);
    this.write(next);
  }

  /** Reddedilen önerileri geri getirir (kullanıcı fikrini değiştirirse). */
  resetDismissed(): void {
    this.dismissed.set(new Set());
    this.write(new Set());
  }

  private read(): Set<string> {
    try {
      const raw = localStorage.getItem(this.scope.key(STORAGE_KEY));
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
    } catch {
      return new Set();
    }
  }

  private write(value: Set<string>): void {
    try {
      localStorage.setItem(this.scope.key(STORAGE_KEY), JSON.stringify([...value]));
    } catch {
      // Hatırlanamazsa öneri tekrar çıkar; akış bozulmaz.
    }
  }
}
