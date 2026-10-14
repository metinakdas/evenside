import { computed, signal } from '@angular/core';
import { Player, PlayerInput } from '../../models/player.model';
import { RatingService } from '../rating.service';

let counter = 0;

/**
 * `PlayerRepositoryService`'in ağa/Supabase'e dokunmayan test dublörü. Gerçek servisle
 * aynı public yüzeyi (players/playersById/create/update/remove) sunar; `SquadStore` ve
 * `PlayerFormComponent` testlerinde `{ provide: PlayerRepositoryService, useValue: ... }`
 * ile takılır (bkz. private alanlar yüzünden `useClass` yerine `useValue` kullanımı).
 */
export class FakePlayerRepositoryService {
  private readonly rating = new RatingService();
  private readonly store = signal<Map<string, Player>>(new Map());

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /**
   * Gerçek serviste olduğu gibi EŞLENMİŞ kartların eski id'leri de kanonik karta çıkar —
   * `SquadStore` eşlemeden habersiz çalışabilsin diye (bkz. proje notları).
   */
  readonly playersById = computed<Map<string, Player>>(() => {
    const direct = this.store();
    const resolved = new Map<string, Player>();
    for (const player of direct.values()) {
      let current = player;
      for (let hop = 0; hop < 8; hop++) {
        const next = current.mergedInto ? direct.get(current.mergedInto) : undefined;
        if (!next || next.id === current.id) break;
        current = next;
      }
      resolved.set(player.id, current);
    }
    return resolved;
  });

  readonly players = computed(() => [...this.store().values()]);
  readonly poolPlayers = computed(() => this.players().filter((p) => !p.mergedInto));
  readonly ownedCards = computed(() => this.players().filter((p) => p.ownerId && !p.mergedInto));
  readonly ownCard = computed<Player | null>(() => this.ownedCards().find((p) => p.ownerId === this.userId) ?? null);

  /** Testte "giriş yapmış kullanıcı" — `ownCard` bunu kullanır. */
  userId: string | null = null;

  resolveId(id: string): string {
    return this.playersById().get(id)?.id ?? id;
  }

  async linkToOwnedCard(poolPlayerId: string, ownedCardId: string): Promise<boolean> {
    const pool = this.store().get(poolPlayerId);
    const target = this.playersById().get(ownedCardId);
    if (!pool || !target || target.id === poolPlayerId) return false;
    this.store.update((m) => new Map(m).set(poolPlayerId, { ...pool, mergedInto: target.id }));
    return true;
  }

  async unlink(poolPlayerId: string): Promise<boolean> {
    const pool = this.store().get(poolPlayerId);
    if (!pool) return false;
    this.store.update((m) => new Map(m).set(poolPlayerId, { ...pool, mergedInto: null }));
    return true;
  }

  async saveOwnCard(input: PlayerInput): Promise<Player | null> {
    if (!this.userId) return null;
    const existing = this.ownCard();
    if (existing) return this.update(existing.id, input);
    const id = `fake-${++counter}`;
    const player: Player = { id, input, ratings: this.rating.calculate(input), ownerId: this.userId, mergedInto: null };
    this.store.update((m) => new Map(m).set(id, player));
    return player;
  }
  /** Gerçek servisteki asenkron ilk-yükleme bekleyişinin dublörü — testte havuz zaten hazır, hemen çözülür. */
  readonly ready: Promise<void> = Promise.resolve();
  /**
   * Gerçek serviste bu bayrak KİMLİĞE bağlı (havuz şu anki kullanıcı için yüklendi mi).
   * Testte havuz hep hazır sayılır; menü "kartın var mı" kararını bekletmeden verir.
   */
  readonly readyForUser = () => true;
  /** Gerçek servisteki `whenReadyForUser` dublörü — testte havuz hep hazır. */
  whenReadyForUser(): Promise<void> {
    return Promise.resolve();
  }

  async create(input: PlayerInput): Promise<Player> {
    const id = `fake-${++counter}`;
    const player: Player = { id, input, ratings: this.rating.calculate(input) };
    this.store.update((m) => new Map(m).set(id, player));
    return player;
  }

  async update(id: string, input: PlayerInput): Promise<Player> {
    // Sahiplik ve eşleme düzenlemeyle KAYBOLMAZ: kadro sahibi sahipli bir kartı düzenlediğinde
    // kart hâlâ o kişinindir (ürün kararı: düzenleme doğrudan kartı değiştirir).
    const previous = this.store().get(id);
    const player: Player = {
      id,
      input,
      ratings: this.rating.calculate(input),
      ownerId: previous?.ownerId ?? null,
      mergedInto: previous?.mergedInto ?? null,
    };
    this.store.update((m) => new Map(m).set(id, player));
    return player;
  }

  async remove(id: string): Promise<boolean> {
    this.store.update((m) => {
      const next = new Map(m);
      next.delete(id);
      return next;
    });
    return true;
  }

  async refresh(): Promise<void> {
    // Testte yapılacak bir şey yok — havuz zaten bellekte.
  }

  /** Testte havuzu doğrudan tohumlamak için. */
  seed(players: Player[]): void {
    this.store.set(new Map(players.map((p) => [p.id, p])));
  }
}
