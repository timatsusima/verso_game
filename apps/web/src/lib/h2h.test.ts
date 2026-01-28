import { describe, it, expect } from 'vitest';
import { calculateStreak, normalizePair } from './h2h';

describe('calculateStreak', () => {
  const yourId = 'user-123';
  const opponentId = 'user-456';

  it('should return streak of 3 when you won last 3 matches', () => {
    const matches = [
      { winnerId: yourId },      // Most recent
      { winnerId: yourId },
      { winnerId: yourId },
      { winnerId: opponentId },  // Older loss (doesn't count)
    ];

    const result = calculateStreak(matches, yourId, opponentId);

    expect(result.holder).toBe('you');
    expect(result.count).toBe(3);
  });

  it('should return streak of 1 when wins alternate', () => {
    const matches = [
      { winnerId: yourId },      // Most recent
      { winnerId: opponentId },  // Previous was opponent, streak breaks
      { winnerId: yourId },
    ];

    const result = calculateStreak(matches, yourId, opponentId);

    expect(result.holder).toBe('you');
    expect(result.count).toBe(1);
  });

  it('should return opponent streak when opponent won recent matches', () => {
    const matches = [
      { winnerId: opponentId },
      { winnerId: opponentId },
      { winnerId: yourId },
    ];

    const result = calculateStreak(matches, yourId, opponentId);

    expect(result.holder).toBe('opponent');
    expect(result.count).toBe(2);
  });

  it('should return null streak when most recent match is a draw', () => {
    const matches = [
      { winnerId: null },        // Draw
      { winnerId: yourId },
      { winnerId: yourId },
    ];

    const result = calculateStreak(matches, yourId, opponentId);

    expect(result.holder).toBe(null);
    expect(result.count).toBe(0);
  });

  it('should handle draw in the middle of streak', () => {
    const matches = [
      { winnerId: yourId },
      { winnerId: yourId },
      { winnerId: null },        // Draw breaks streak
      { winnerId: yourId },
    ];

    const result = calculateStreak(matches, yourId, opponentId);

    expect(result.holder).toBe('you');
    expect(result.count).toBe(2);
  });

  it('should return null streak when no matches', () => {
    const matches: Array<{ winnerId: string | null }> = [];

    const result = calculateStreak(matches, yourId, opponentId);

    expect(result.holder).toBe(null);
    expect(result.count).toBe(0);
  });

  it('should handle single match win', () => {
    const matches = [
      { winnerId: yourId },
    ];

    const result = calculateStreak(matches, yourId, opponentId);

    expect(result.holder).toBe('you');
    expect(result.count).toBe(1);
  });

  it('should handle single match draw', () => {
    const matches = [
      { winnerId: null },
    ];

    const result = calculateStreak(matches, yourId, opponentId);

    expect(result.holder).toBe(null);
    expect(result.count).toBe(0);
  });

  it('should handle long winning streak', () => {
    const matches = Array.from({ length: 10 }, () => ({ winnerId: opponentId }));

    const result = calculateStreak(matches, yourId, opponentId);

    expect(result.holder).toBe('opponent');
    expect(result.count).toBe(10);
  });
});

describe('normalizePair', () => {
  it('should return smaller id first', () => {
    const result = normalizePair('user-zzz', 'user-aaa');
    expect(result).toEqual(['user-aaa', 'user-zzz']);
  });

  it('should keep order when already normalized', () => {
    const result = normalizePair('user-aaa', 'user-zzz');
    expect(result).toEqual(['user-aaa', 'user-zzz']);
  });

  it('should handle numeric-like IDs', () => {
    const result = normalizePair('123', '456');
    expect(result).toEqual(['123', '456']);
  });

  it('should handle same IDs', () => {
    const result = normalizePair('user-123', 'user-123');
    expect(result).toEqual(['user-123', 'user-123']);
  });
});
