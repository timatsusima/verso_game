import OpenAI from 'openai';
import crypto from 'crypto';
import type { QuestionWithAnswer, Language, DifficultyLevel } from '@tg-duel/shared';
import { OpenAIResponseSchema } from '@tg-duel/shared';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ============ Language Detection ============

/**
 * Detect if text is primarily in Russian or English
 * Returns 'ru' if text contains Cyrillic characters, 'en' otherwise
 */
function detectLanguage(text: string): 'ru' | 'en' {
  // Check for Cyrillic characters (Russian)
  const cyrillicPattern = /[\u0400-\u04FF]/;
  const hasCyrillic = cyrillicPattern.test(text);
  
  // If text has Cyrillic, it's Russian
  if (hasCyrillic) {
    return 'ru';
  }
  
  // Check for Latin characters (English)
  const latinPattern = /[a-zA-Z]/;
  const hasLatin = latinPattern.test(text);
  
  // If has Latin but no Cyrillic, it's English
  if (hasLatin) {
    return 'en';
  }
  
  // Default to English if no clear indicators (numbers, symbols, etc.)
  return 'en';
}

/**
 * Validate that all texts (question + all options) are in the expected language
 */
function validateLanguage(
  questionText: string,
  options: string[],
  expectedLanguage: Language
): boolean {
  const questionLang = detectLanguage(questionText);
  
  if (questionLang !== expectedLanguage) {
    console.log(`[LANGUAGE_MISMATCH] Question language mismatch: expected ${expectedLanguage}, got ${questionLang}`);
    console.log(`[LANGUAGE_MISMATCH] Question text: "${questionText.substring(0, 100)}"`);
    return false;
  }
  
  for (let i = 0; i < options.length; i++) {
    const optionLang = detectLanguage(options[i]);
    if (optionLang !== expectedLanguage) {
      console.log(`[LANGUAGE_MISMATCH] Option ${i} language mismatch: expected ${expectedLanguage}, got ${optionLang}`);
      console.log(`[LANGUAGE_MISMATCH] Option text: "${options[i]}"`);
      return false;
    }
  }
  
  return true;
}

const DIFFICULTY_DESCRIPTIONS = {
  ru: {
    easy: 'ЛЕГКО - простые вопросы, базовые факты, которые знает большинство людей. Подходит для новичков.',
    medium: 'СРЕДНЕ - вопросы средней сложности, требующие базовых знаний по теме. Для людей с общим представлением о предмете.',
    hard: 'СЛОЖНО - сложные вопросы, требующие глубоких знаний и понимания нюансов. Для настоящих знатоков темы.',
  },
  en: {
    easy: 'EASY - simple questions, basic facts that most people know. Suitable for beginners.',
    medium: 'MEDIUM - medium difficulty questions requiring basic knowledge of the topic. For people with general understanding.',
    hard: 'HARD - difficult questions requiring deep knowledge and understanding of nuances. For true connoisseurs.',
  },
};

function getSystemPrompt(language: Language, difficulty: DifficultyLevel): string {
  const difficultyDesc = DIFFICULTY_DESCRIPTIONS[language][difficulty];
  
  if (language === 'ru') {
    return `Ты — генератор викторины. Создавай интересные и увлекательные вопросы на указанную тему.

УРОВЕНЬ СЛОЖНОСТИ: ${difficultyDesc}

КРИТИЧЕСКИ ВАЖНО - ЯЗЫК:
⚠️ ВСЕ тексты (вопрос И ВСЕ 4 варианта ответа) ДОЛЖНЫ быть СТРОГО на русском языке.
⚠️ ЗАПРЕЩЕНО смешивать языки. Если тема на английском (например, "Hollywood movies"), 
   ВСЕ РАВНО вопрос и ответы должны быть на русском языке.
⚠️ НЕ используй английские названия в ответах, если не указано иное.

ПРАВИЛА:
1. Каждый вопрос должен иметь ровно 4 варианта ответа (A, B, C, D)
2. Только один вариант должен быть правильным
3. Неправильные варианты должны быть правдоподобными, но явно неверными
4. ВСЕ вопросы должны соответствовать указанному уровню сложности
5. ВСЕ тексты (вопрос + все 4 ответа) СТРОГО на русском языке
6. Если тема связана с визуальными объектами (картины, логотипы, флаги и т.д.), добавь поисковый запрос для изображения в поле imageSearchQuery

ФОРМАТ ОТВЕТА (строго JSON):
{
  "language": "ru",
  "questions": [
    {
      "text": "Текст вопроса на русском?",
      "options": ["Вариант A на русском", "Вариант B на русском", "Вариант C на русском", "Вариант D на русском"],
      "correctIndex": 0,
      "imageSearchQuery": null или "поисковый запрос для изображения"
    }
  ]
}

correctIndex: 0 = A, 1 = B, 2 = C, 3 = D`;
  }

  return `You are a quiz generator. Create interesting and engaging questions on the given topic.

DIFFICULTY LEVEL: ${difficultyDesc}

CRITICALLY IMPORTANT - LANGUAGE:
⚠️ ALL text (question AND ALL 4 answer options) MUST be STRICTLY in English.
⚠️ MIXING languages is FORBIDDEN. Even if the topic is in another language, 
   the question and ALL answers MUST be in English.
⚠️ DO NOT use non-English text in answers unless explicitly required.

RULES:
1. Each question must have exactly 4 answer options (A, B, C, D)
2. Only one option should be correct
3. Wrong options should be plausible but clearly incorrect
4. ALL questions must match the specified difficulty level
5. ALL text (question + all 4 answers) STRICTLY in English
6. If the topic involves visual objects (paintings, logos, flags, etc.), add an image search query in the imageSearchQuery field

RESPONSE FORMAT (strict JSON):
{
  "language": "en",
  "questions": [
    {
      "text": "Question text in English?",
      "options": ["Option A in English", "Option B in English", "Option C in English", "Option D in English"],
      "correctIndex": 0,
      "imageSearchQuery": null or "image search query"
    }
  ]
}

correctIndex: 0 = A, 1 = B, 2 = C, 3 = D`;
}

const DIFFICULTY_NAMES = {
  ru: {
    easy: 'Легко',
    medium: 'Средне',
    hard: 'Сложно',
  },
  en: {
    easy: 'Easy',
    medium: 'Medium',
    hard: 'Hard',
  },
};

function getUserPrompt(topic: string, count: number, language: Language, difficulty: DifficultyLevel): string {
  const diffName = DIFFICULTY_NAMES[language][difficulty];
  
  if (language === 'ru') {
    return `Создай ${count} вопросов на тему: "${topic}"
Уровень сложности: ${diffName}

⚠️ ВАЖНО: ВСЕ тексты (вопрос и ВСЕ 4 варианта ответа) должны быть СТРОГО на русском языке.
Даже если тема содержит английские названия (например, "Hollywood movies"), 
вопрос и ответы должны быть на русском.

Убедись, что:
- Вопросы охватывают разные аспекты темы
- ВСЕ вопросы соответствуют уровню "${diffName}"
- Варианты ответов не слишком длинные (макс 50 символов каждый)
- Правильный ответ не всегда на одной и той же позиции
- ВСЕ тексты (вопрос + все 4 ответа) СТРОГО на русском языке`;
  }

  return `Create ${count} questions on the topic: "${topic}"
Difficulty level: ${diffName}

⚠️ IMPORTANT: ALL text (question and ALL 4 answer options) MUST be STRICTLY in English.
Even if the topic contains non-English names, the question and answers must be in English.

Make sure that:
- Questions cover different aspects of the topic
- ALL questions match the "${diffName}" difficulty level
- Answer options are not too long (max 50 characters each)
- The correct answer is not always in the same position
- ALL text (question + all 4 answers) STRICTLY in English`;
}

export interface GeneratedPack {
  questions: QuestionWithAnswer[];
  seed: string;
  commitHash: string;
}

/**
 * Generates quiz questions using OpenAI API
 */
export async function generateQuestions(
  topic: string,
  count: 10 | 20 | 30,
  language: Language,
  difficulty: DifficultyLevel
): Promise<GeneratedPack> {
  // Retry logic for language validation
  const MAX_RETRIES = 1;
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= MAX_RETRIES) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: getSystemPrompt(language, difficulty) },
          { role: 'user', content: getUserPrompt(topic, count, language, difficulty) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.8,
        max_tokens: 4000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      // Parse and validate response
      const parsed = JSON.parse(content);
      const validated = OpenAIResponseSchema.parse(parsed);

      // Validate language for all questions
      for (let i = 0; i < validated.questions.length; i++) {
        const q = validated.questions[i];
        if (!validateLanguage(q.text, q.options, language)) {
          throw new Error(`[LANGUAGE_MISMATCH] Question at index ${i} has language mismatch`);
        }
      }

      // All questions validated successfully
      console.log(`[OpenAI] Successfully generated and validated ${validated.questions.length} questions in ${language}`);

      // Generate unique IDs and seed
      const seed = crypto.randomBytes(32).toString('hex');
      
      const questions: QuestionWithAnswer[] = validated.questions.map((q, index) => ({
        id: `q-${crypto.randomUUID()}`,
        text: q.text,
        options: q.options,
        correctIndex: q.correctIndex,
        imageSearchQuery: q.imageSearchQuery ?? null,
        imageUrl: null, // MVP: no image resolution
      }));

      // Create commit hash for anti-cheat verification
      const answersString = questions.map(q => q.correctIndex).join(',');
      const commitHash = crypto
        .createHash('sha256')
        .update(seed + answersString)
        .digest('hex');

      return {
        questions,
        seed,
        commitHash,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if it's a language mismatch error
      if (lastError.message.includes('[LANGUAGE_MISMATCH]')) {
        if (attempt < MAX_RETRIES) {
          attempt++;
          console.log(`[OpenAI] Language mismatch detected, retrying (attempt ${attempt}/${MAX_RETRIES})...`);
          // Add a small delay before retry
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        } else {
          console.error(`[OpenAI] Language validation failed after ${MAX_RETRIES + 1} attempts`);
          throw new Error(`Failed to generate questions in ${language} after ${MAX_RETRIES + 1} attempts. Language mismatch detected.`);
        }
      } else {
        // Other errors - throw immediately
        throw lastError;
      }
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError || new Error('Unknown error in question generation');
}
