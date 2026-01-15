import crypto from 'crypto';
import { prisma } from './prisma';
import type { QuestionWithAnswer, DifficultyLevel, Language } from '@tg-duel/shared';

// ============ Configuration ============

const ROTATION_DAYS = 30; // Don't serve same question within 30 days
const MIN_CACHE_QUESTIONS = 5; // Minimum questions before generating more

// ============ Normalization ============

/**
 * Normalize topic for consistent matching
 * "UFC Fighters" -> "ufc fighters"
 */
export function normalizeTopic(topic: string): string {
  return topic
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '') // Remove punctuation, keep letters/numbers
    .substring(0, 200);
}

/**
 * Normalize text for fingerprinting
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '');
}

/**
 * Generate unique fingerprint for a question
 * Based on normalized question + sorted options
 */
export function generateFingerprint(
  questionText: string,
  options: string[]
): string {
  const normalizedQuestion = normalizeText(questionText);
  const normalizedOptions = options
    .map(opt => normalizeText(opt))
    .sort()
    .join('|');
  
  const content = `${normalizedQuestion}::${normalizedOptions}`;
  
  return crypto
    .createHash('sha256')
    .update(content)
    .digest('hex')
    .substring(0, 32); // Use first 32 chars for readability
}

// ============ Database Operations ============

interface BankQuestion {
  id: string;
  questionText: string;
  options: string[];
  correctIndex: number;
  fingerprint: string;
}

/**
 * Get available questions from bank
 * Prioritizes least recently served questions
 */
async function getQuestionsFromBank(
  topicNorm: string,
  language: Language,
  difficulty: DifficultyLevel,
  count: number,
  excludeFingerprints: string[] = []
): Promise<BankQuestion[]> {
  const rotationDate = new Date();
  rotationDate.setDate(rotationDate.getDate() - ROTATION_DAYS);

  const questions = await prisma.questionBank.findMany({
    where: {
      topicNorm,
      language,
      difficulty,
      isActive: true,
      fingerprint: {
        notIn: excludeFingerprints,
      },
      OR: [
        { lastServedAt: null },
        { lastServedAt: { lt: rotationDate } },
      ],
    },
    orderBy: [
      { lastServedAt: 'asc' },
      { timesServed: 'asc' },
    ],
    take: count,
  });

  return questions.map(q => ({
    id: q.id,
    questionText: q.questionText,
    options: JSON.parse(q.options) as string[],
    correctIndex: q.correctIndex,
    fingerprint: q.fingerprint,
  }));
}

/**
 * Get existing question summaries for OpenAI prompt
 * To prevent generating duplicates
 */
async function getExistingQuestionSummaries(
  topicNorm: string,
  language: Language,
  difficulty: DifficultyLevel,
  limit: number = 50
): Promise<string[]> {
  const questions = await prisma.questionBank.findMany({
    where: {
      topicNorm,
      language,
      difficulty,
      isActive: true,
    },
    select: {
      questionText: true,
    },
    take: limit,
    orderBy: {
      createdAt: 'desc',
    },
  });

  // Return short summaries (first 80 chars)
  return questions.map(q => 
    q.questionText.length > 80 
      ? q.questionText.substring(0, 80) + '...'
      : q.questionText
  );
}

/**
 * Save new questions to bank
 */
async function saveQuestionsToBank(
  questions: Array<{
    questionText: string;
    options: string[];
    correctIndex: number;
  }>,
  topicNorm: string,
  language: Language,
  difficulty: DifficultyLevel
): Promise<BankQuestion[]> {
  const saved: BankQuestion[] = [];

  for (const q of questions) {
    const fingerprint = generateFingerprint(q.questionText, q.options);

    try {
      // Use upsert to handle race conditions
      const question = await prisma.questionBank.upsert({
        where: { fingerprint },
        update: {
          // Don't update if exists, just return it
        },
        create: {
          topicNorm,
          language,
          difficulty,
          questionText: q.questionText,
          options: JSON.stringify(q.options),
          correctIndex: q.correctIndex,
          fingerprint,
        },
      });

      saved.push({
        id: question.id,
        questionText: question.questionText,
        options: JSON.parse(question.options) as string[],
        correctIndex: question.correctIndex,
        fingerprint: question.fingerprint,
      });
    } catch (error) {
      // Fingerprint collision - question already exists
      console.log(`Question already exists: ${fingerprint}`);
      
      const existing = await prisma.questionBank.findUnique({
        where: { fingerprint },
      });
      
      if (existing) {
        saved.push({
          id: existing.id,
          questionText: existing.questionText,
          options: JSON.parse(existing.options) as string[],
          correctIndex: existing.correctIndex,
          fingerprint: existing.fingerprint,
        });
      }
    }
  }

  return saved;
}

/**
 * Mark questions as served (update usage stats)
 */
async function markQuestionsAsServed(questionIds: string[]): Promise<void> {
  await prisma.questionBank.updateMany({
    where: {
      id: { in: questionIds },
    },
    data: {
      timesServed: { increment: 1 },
      lastServedAt: new Date(),
    },
  });
}

// ============ OpenAI Integration ============

import OpenAI from 'openai';
import { OpenAIResponseSchema } from '@tg-duel/shared';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate new questions via OpenAI
 * Only generates missing questions, avoiding duplicates
 */
async function generateMissingQuestions(
  topic: string,
  language: Language,
  difficulty: DifficultyLevel,
  count: number,
  existingSummaries: string[]
): Promise<Array<{
  questionText: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
}>> {
  const difficultyDescriptions = {
    ru: {
      easy: 'простые, базовые факты',
      medium: 'средней сложности, требуют знаний темы',
      hard: 'сложные, для экспертов в теме',
    },
    en: {
      easy: 'easy, basic facts',
      medium: 'medium difficulty, requires topic knowledge',
      hard: 'hard, for topic experts',
    },
  };

  const existingBlock = existingSummaries.length > 0
    ? `\nEXISTING QUESTIONS TO AVOID (do not duplicate or paraphrase):\n${existingSummaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n`
    : '';

  const systemPrompt = language === 'ru'
    ? `Ты генератор викторины. Создавай УНИКАЛЬНЫЕ вопросы, которые НЕ повторяют существующие.
Сложность: ${difficultyDescriptions.ru[difficulty]}
${existingBlock}
ПРАВИЛА:
1. Каждый вопрос должен иметь ровно 4 варианта ответа
2. Только один вариант правильный
3. НЕ повторяй и НЕ перефразируй существующие вопросы
4. Ищи менее очевидные факты
5. Все вопросы должны быть фактически корректными

Верни JSON объект с полем "questions":
{"questions": [{"text": "Вопрос?", "options": ["A", "B", "C", "D"], "correctIndex": 0}]}`
    : `You are a quiz generator. Create UNIQUE questions that do NOT repeat existing ones.
Difficulty: ${difficultyDescriptions.en[difficulty]}
${existingBlock}
RULES:
1. Each question must have exactly 4 answer options
2. Only one option is correct
3. Do NOT duplicate or paraphrase existing questions
4. Focus on less obvious facts
5. All questions must be factually correct

Return JSON object with "questions" field:
{"questions": [{"text": "Question?", "options": ["A", "B", "C", "D"], "correctIndex": 0}]}`;

  const userPrompt = language === 'ru'
    ? `Создай ровно ${count} уникальных вопросов на тему: "${topic}"`
    : `Create exactly ${count} unique questions on topic: "${topic}"`;

  console.log(`[QuestionBank] Generating ${count} new questions for "${topic}" (${language}/${difficulty})`);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.9, // Higher for more variety
    max_tokens: 4000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenAI');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    console.error('[QuestionBank] Failed to parse OpenAI response:', content);
    throw new Error('Invalid JSON response from OpenAI');
  }
  
  // Handle {questions: [...]} format
  const questionsArray = parsed.questions;
  
  if (!Array.isArray(questionsArray)) {
    console.error('[QuestionBank] Invalid response format:', parsed);
    throw new Error('OpenAI response must contain "questions" array');
  }

  if (questionsArray.length === 0) {
    throw new Error('OpenAI returned empty questions array');
  }

  // Validate and map questions
  return questionsArray.map((q: any, index: number) => {
    if (!q.text || !q.options || typeof q.correctIndex !== 'number') {
      throw new Error(`Invalid question format at index ${index}: ${JSON.stringify(q)}`);
    }
    
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      throw new Error(`Question at index ${index} must have exactly 4 options`);
    }
    
    if (q.correctIndex < 0 || q.correctIndex > 3) {
      throw new Error(`Question at index ${index} has invalid correctIndex: ${q.correctIndex}`);
    }

    return {
      questionText: q.text,
      options: q.options as [string, string, string, string],
      correctIndex: q.correctIndex as 0 | 1 | 2 | 3,
    };
  });
}

// ============ Main API ============

export interface GeneratedPack {
  questions: QuestionWithAnswer[];
  seed: string;
  commitHash: string;
  stats: {
    fromCache: number;
    newlyGenerated: number;
  };
}

/**
 * Main function: Get or generate questions for a duel
 * Uses cached questions when available, generates missing ones
 */
export async function getOrGenerateQuestions(
  topic: string,
  count: 10 | 20 | 30,
  language: Language,
  difficulty: DifficultyLevel
): Promise<GeneratedPack> {
  const topicNorm = normalizeTopic(topic);
  
  console.log(`[QuestionBank] Request: ${count} questions for "${topicNorm}" (${language}/${difficulty})`);

  // Step 1: Try to get questions from bank
  const cachedQuestions = await getQuestionsFromBank(
    topicNorm,
    language,
    difficulty,
    count
  );

  console.log(`[QuestionBank] Found ${cachedQuestions.length} cached questions`);

  let allQuestions: BankQuestion[] = [...cachedQuestions];
  let newlyGenerated = 0;

  // Step 2: Generate missing questions if needed
  const missing = count - cachedQuestions.length;
  
  if (missing > 0) {
    // Get existing summaries to avoid duplicates
    const existingSummaries = await getExistingQuestionSummaries(
      topicNorm,
      language,
      difficulty
    );

    // Add cached questions to exclude list
    const excludeFingerprints = cachedQuestions.map(q => q.fingerprint);

    try {
      const generated = await generateMissingQuestions(
        topic, // Use original topic for better prompts
        language,
        difficulty,
        missing,
        existingSummaries
      );

      // Save to bank
      const saved = await saveQuestionsToBank(
        generated,
        topicNorm,
        language,
        difficulty
      );

      // Filter out any that ended up being duplicates
      const uniqueSaved = saved.filter(
        s => !excludeFingerprints.includes(s.fingerprint)
      );

      allQuestions = [...cachedQuestions, ...uniqueSaved];
      newlyGenerated = uniqueSaved.length;

      console.log(`[QuestionBank] Generated and saved ${newlyGenerated} new questions`);
    } catch (error) {
      console.error('[QuestionBank] Generation error:', error);
      
      // If generation fails but we have some cached, use what we have
      if (cachedQuestions.length >= MIN_CACHE_QUESTIONS) {
        console.log(`[QuestionBank] Using ${cachedQuestions.length} cached questions due to generation error`);
      } else {
        throw error;
      }
    }
  }

  // Step 3: Mark questions as served
  const questionIds = allQuestions.map(q => q.id);
  await markQuestionsAsServed(questionIds);

  // Step 4: Build final pack
  const seed = crypto.randomBytes(32).toString('hex');
  
  // Shuffle questions for variety
  const shuffled = shuffleArray([...allQuestions]);
  
  // Take exactly the requested count
  const finalQuestions = shuffled.slice(0, count);

  const questions: QuestionWithAnswer[] = finalQuestions.map((q, index) => ({
    id: `q-${crypto.randomUUID()}`,
    text: q.questionText,
    options: q.options as [string, string, string, string],
    correctIndex: q.correctIndex as 0 | 1 | 2 | 3,
    imageSearchQuery: null,
    imageUrl: null,
  }));

  // Create commit hash for anti-cheat
  const answersString = questions.map(q => q.correctIndex).join(',');
  const commitHash = crypto
    .createHash('sha256')
    .update(seed + answersString)
    .digest('hex');

  console.log(`[QuestionBank] Final pack: ${finalQuestions.length} questions (${cachedQuestions.length} cached, ${newlyGenerated} new)`);

  return {
    questions,
    seed,
    commitHash,
    stats: {
      fromCache: cachedQuestions.length,
      newlyGenerated,
    },
  };
}

// ============ Admin Functions ============

/**
 * Report a question as problematic
 */
export async function reportQuestion(questionId: string): Promise<void> {
  await prisma.questionBank.update({
    where: { id: questionId },
    data: { isReported: true },
  });
}

/**
 * Invalidate/deactivate a question
 */
export async function invalidateQuestion(questionId: string): Promise<void> {
  await prisma.questionBank.update({
    where: { id: questionId },
    data: { isActive: false },
  });
}

/**
 * Get bank statistics
 */
export async function getBankStats(): Promise<{
  totalQuestions: number;
  byLanguage: Record<string, number>;
  byDifficulty: Record<string, number>;
  reported: number;
}> {
  const [total, byLanguage, byDifficulty, reported] = await Promise.all([
    prisma.questionBank.count({ where: { isActive: true } }),
    prisma.questionBank.groupBy({
      by: ['language'],
      where: { isActive: true },
      _count: true,
    }),
    prisma.questionBank.groupBy({
      by: ['difficulty'],
      where: { isActive: true },
      _count: true,
    }),
    prisma.questionBank.count({ where: { isReported: true } }),
  ]);

  return {
    totalQuestions: total,
    byLanguage: Object.fromEntries(byLanguage.map(b => [b.language, b._count])),
    byDifficulty: Object.fromEntries(byDifficulty.map(b => [b.difficulty, b._count])),
    reported,
  };
}

// ============ Utilities ============

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
