import { randomPlayerInput } from './random-player';

describe('randomPlayerInput', () => {
  it('produces a plausible, non-empty player within the app\'s field bounds', () => {
    const input = randomPlayerInput();

    expect(input.name.trim().length).toBeGreaterThan(0);
    expect(input.heightCm).toBeGreaterThanOrEqual(165);
    expect(input.heightCm).toBeLessThanOrEqual(195);
    expect(input.weightKg).toBeGreaterThanOrEqual(62);
    expect(input.weightKg).toBeLessThanOrEqual(95);
    for (const key of ['goalkeeping', 'defending', 'midfield', 'attacking', 'pace', 'stamina'] as const) {
      expect(input[key]).toBeGreaterThanOrEqual(0);
      expect(input[key]).toBeLessThanOrEqual(10);
    }
    expect(input.goalsPerMatch).toBeGreaterThanOrEqual(0);
    expect(input.flagImage).toBeNull();
    expect(input.photoImage).toBeNull();
  });

  it('gives the player one clearly strong position rather than flat mediocrity everywhere', () => {
    const input = randomPlayerInput();
    const scores = [input.goalkeeping, input.defending, input.midfield, input.attacking];

    expect(Math.max(...scores)).toBeGreaterThanOrEqual(6);
  });

  it('varies names across calls (not a single hardcoded player)', () => {
    const names = new Set(Array.from({ length: 20 }, () => randomPlayerInput().name));
    expect(names.size).toBeGreaterThan(1);
  });
});
