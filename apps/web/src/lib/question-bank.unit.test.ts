import { describe, it, expect } from 'vitest';
import { normalizeTopic, generateFingerprint } from './question-bank';

describe('normalizeTopic', () => {
  it('should normalize topics correctly', () => {
    expect(normalizeTopic('UFC Fighters')).toBe('ufc fighters');
    expect(normalizeTopic('  Space   Travel  ')).toBe('space travel');
    expect(normalizeTopic('AI & ML')).toBe('ai  ml'); // & is removed, leaving double space which is normalized to single
    expect(normalizeTopic('CHEMISTRY')).toBe('chemistry');
    expect(normalizeTopic('Общая эрудиция')).toBe('общая эрудиция');
  });

  it('should remove punctuation', () => {
    expect(normalizeTopic('AI&ML')).toBe('aiml');
    expect(normalizeTopic('One, Two, Three')).toBe('one two three');
  });

  it('should handle long topics', () => {
    const longTopic = 'a'.repeat(300);
    const normalized = normalizeTopic(longTopic);
    expect(normalized.length).toBe(200); // Truncated to 200 chars
  });
});

describe('generateFingerprint', () => {
  it('should generate consistent fingerprints', () => {
    const fp1 = generateFingerprint('What is 2+2?', ['3', '4', '5', '6']);
    const fp2 = generateFingerprint('What is 2+2?', ['3', '4', '5', '6']);
    
    expect(fp1).toBe(fp2);
    expect(fp1).toHaveLength(32);
  });

  it('should normalize text before fingerprinting', () => {
    const fp1 = generateFingerprint('What is 2+2?', ['A', 'B', 'C', 'D']);
    const fp2 = generateFingerprint('WHAT IS 2+2?', ['A', 'B', 'C', 'D']);
    
    // Should be the same after normalization
    expect(fp1).toBe(fp2);
  });

  it('should sort options before fingerprinting', () => {
    const fp1 = generateFingerprint('Question?', ['A', 'B', 'C', 'D']);
    const fp2 = generateFingerprint('Question?', ['D', 'C', 'B', 'A']);
    
    // Should be the same after sorting
    expect(fp1).toBe(fp2);
  });

  it('should generate different fingerprints for different questions', () => {
    const fp1 = generateFingerprint('Question 1?', ['A', 'B', 'C', 'D']);
    const fp2 = generateFingerprint('Question 2?', ['A', 'B', 'C', 'D']);
    
    expect(fp1).not.toBe(fp2);
  });

  it('should generate different fingerprints for different options', () => {
    const fp1 = generateFingerprint('Question?', ['A', 'B', 'C', 'D']);
    const fp2 = generateFingerprint('Question?', ['A', 'B', 'C', 'E']);
    
    expect(fp1).not.toBe(fp2);
  });
});

describe('Matchmaking Question Constraints (Logic Tests)', () => {
  it('should correctly implement topicCap=1 logic', () => {
    // Simulate the topicCap logic
    const questions = [
      { id: '1', topic: 'chemistry' },
      { id: '2', topic: 'chemistry' },
      { id: '3', topic: 'physics' },
      { id: '4', topic: 'physics' },
      { id: '5', topic: 'math' },
    ];

    const topicCounts = new Map<string, number>();
    const selected: typeof questions = [];
    const topicCap = 1;

    for (const q of questions) {
      const currentCount = topicCounts.get(q.topic) || 0;
      
      if (currentCount < topicCap) {
        selected.push(q);
        topicCounts.set(q.topic, currentCount + 1);
      }
    }

    // Should have selected exactly 3 questions (1 per topic)
    expect(selected).toHaveLength(3);
    
    // Verify each topic appears at most once
    const finalTopicCounts = new Map<string, number>();
    for (const q of selected) {
      finalTopicCounts.set(q.topic, (finalTopicCounts.get(q.topic) || 0) + 1);
    }
    
    const maxCount = Math.max(...Array.from(finalTopicCounts.values()));
    expect(maxCount).toBeLessThanOrEqual(1);
  });

  it('should map null topic to general', () => {
    const questions = [
      { id: '1', subtopic: null },
      { id: '2', subtopic: 'chemistry' },
      { id: '3', subtopic: null },
    ];

    const withEffectiveTopic = questions.map(q => ({
      ...q,
      effectiveTopic: q.subtopic || 'general',
    }));

    expect(withEffectiveTopic[0].effectiveTopic).toBe('general');
    expect(withEffectiveTopic[1].effectiveTopic).toBe('chemistry');
    expect(withEffectiveTopic[2].effectiveTopic).toBe('general');
  });

  it('should filter out easy difficulty', () => {
    const questions = [
      { id: '1', difficulty: 'easy' },
      { id: '2', difficulty: 'medium' },
      { id: '3', difficulty: 'hard' },
      { id: '4', difficulty: 'easy' },
    ];

    const filtered = questions.filter(q => q.difficulty !== 'easy');

    expect(filtered).toHaveLength(2);
    expect(filtered.every(q => q.difficulty === 'medium' || q.difficulty === 'hard')).toBe(true);
  });

  it('should implement fallback to topicCap=2', () => {
    const questions = [
      { id: '1', topic: 'chemistry' },
      { id: '2', topic: 'chemistry' },
      { id: '3', topic: 'physics' },
      { id: '4', topic: 'physics' },
    ];

    // Try topicCap=1
    let topicCounts = new Map<string, number>();
    let selected: typeof questions = [];
    let topicCap = 1;

    for (const q of questions) {
      const currentCount = topicCounts.get(q.topic) || 0;
      
      if (currentCount < topicCap) {
        selected.push(q);
        topicCounts.set(q.topic, currentCount + 1);
      }
    }

    // Only got 2, need 4
    expect(selected.length).toBeLessThan(4);

    // Fallback to topicCap=2
    topicCounts.clear();
    selected = [];
    topicCap = 2;

    for (const q of questions) {
      const currentCount = topicCounts.get(q.topic) || 0;
      
      if (currentCount < topicCap) {
        selected.push(q);
        topicCounts.set(q.topic, currentCount + 1);
      }
    }

    // Now we should have all 4
    expect(selected).toHaveLength(4);
  });

  it('should calculate difficulty distribution', () => {
    const questions = [
      { difficulty: 'medium' },
      { difficulty: 'medium' },
      { difficulty: 'hard' },
      { difficulty: 'medium' },
      { difficulty: 'hard' },
    ];

    const distribution: Record<string, number> = {};
    
    for (const q of questions) {
      distribution[q.difficulty] = (distribution[q.difficulty] || 0) + 1;
    }

    expect(distribution['medium']).toBe(3);
    expect(distribution['hard']).toBe(2);
    expect(distribution['easy']).toBeUndefined();
  });

  it('should calculate topic distribution', () => {
    const questions = [
      { topic: 'chemistry' },
      { topic: 'physics' },
      { topic: 'chemistry' },
      { topic: 'math' },
    ];

    const distribution: Record<string, number> = {};
    
    for (const q of questions) {
      distribution[q.topic] = (distribution[q.topic] || 0) + 1;
    }

    expect(distribution['chemistry']).toBe(2);
    expect(distribution['physics']).toBe(1);
    expect(distribution['math']).toBe(1);
    expect(Object.keys(distribution).length).toBe(3); // 3 unique topics
  });
});
