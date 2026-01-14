import OpenAI from 'openai';
import crypto from 'crypto';
import type { QuestionWithAnswer, Language, DifficultyLevel } from '@tg-duel/shared';
import { OpenAIResponseSchema } from '@tg-duel/shared';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DIFFICULTY_DESCRIPTIONS = {
  ru: {
    novice: 'НОВИЧОК - очень простые вопросы, базовые факты, которые знает большинство людей. Подходит для детей или тех, кто только начинает изучать тему.',
    confident: 'УВЕРЕННЫЙ - средние вопросы, требующие базовых знаний по теме. Подходит для людей с общим представлением о предмете.',
    advanced: 'ПРОДВИНУТЫЙ - сложные вопросы, требующие хороших знаний темы. Подходит для тех, кто увлекается данной темой.',
    expert: 'ЭКСПЕРТ - очень сложные вопросы, требующие глубоких знаний и понимания нюансов. Для настоящих знатоков темы.',
    master: 'МАСТЕР - экстремально сложные вопросы, малоизвестные факты, детали которые знают только специалисты. Максимальная сложность.',
  },
  en: {
    novice: 'NOVICE - very easy questions, basic facts that most people know. Suitable for beginners or children.',
    confident: 'CONFIDENT - medium questions requiring basic knowledge of the topic. Suitable for people with general understanding.',
    advanced: 'ADVANCED - hard questions requiring good knowledge of the topic. For enthusiasts of the subject.',
    expert: 'EXPERT - very hard questions requiring deep knowledge and understanding of nuances. For true connoisseurs.',
    master: 'MASTER - extremely difficult questions, obscure facts known only to specialists. Maximum difficulty.',
  },
};

function getSystemPrompt(language: Language, difficulty: DifficultyLevel): string {
  const difficultyDesc = DIFFICULTY_DESCRIPTIONS[language][difficulty];
  
  if (language === 'ru') {
    return `Ты — генератор викторины. Создавай интересные и увлекательные вопросы на указанную тему.

УРОВЕНЬ СЛОЖНОСТИ: ${difficultyDesc}

ПРАВИЛА:
1. Каждый вопрос должен иметь ровно 4 варианта ответа (A, B, C, D)
2. Только один вариант должен быть правильным
3. Неправильные варианты должны быть правдоподобными, но явно неверными
4. ВСЕ вопросы должны соответствовать указанному уровню сложности
5. Все вопросы должны быть на русском языке
6. Если тема связана с визуальными объектами (картины, логотипы, флаги и т.д.), добавь поисковый запрос для изображения в поле imageSearchQuery

ФОРМАТ ОТВЕТА (строго JSON):
{
  "questions": [
    {
      "text": "Текст вопроса?",
      "options": ["Вариант A", "Вариант B", "Вариант C", "Вариант D"],
      "correctIndex": 0,
      "imageSearchQuery": null или "поисковый запрос для изображения"
    }
  ]
}

correctIndex: 0 = A, 1 = B, 2 = C, 3 = D`;
  }

  return `You are a quiz generator. Create interesting and engaging questions on the given topic.

DIFFICULTY LEVEL: ${difficultyDesc}

RULES:
1. Each question must have exactly 4 answer options (A, B, C, D)
2. Only one option should be correct
3. Wrong options should be plausible but clearly incorrect
4. ALL questions must match the specified difficulty level
5. All questions should be in English
6. If the topic involves visual objects (paintings, logos, flags, etc.), add an image search query in the imageSearchQuery field

RESPONSE FORMAT (strict JSON):
{
  "questions": [
    {
      "text": "Question text?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "imageSearchQuery": null or "image search query"
    }
  ]
}

correctIndex: 0 = A, 1 = B, 2 = C, 3 = D`;
}

const DIFFICULTY_NAMES = {
  ru: {
    novice: 'Новичок',
    confident: 'Уверенный', 
    advanced: 'Продвинутый',
    expert: 'Эксперт',
    master: 'Мастер',
  },
  en: {
    novice: 'Novice',
    confident: 'Confident',
    advanced: 'Advanced',
    expert: 'Expert',
    master: 'Master',
  },
};

function getUserPrompt(topic: string, count: number, language: Language, difficulty: DifficultyLevel): string {
  const diffName = DIFFICULTY_NAMES[language][difficulty];
  
  if (language === 'ru') {
    return `Создай ${count} вопросов на тему: "${topic}"
Уровень сложности: ${diffName}

Убедись, что:
- Вопросы охватывают разные аспекты темы
- ВСЕ вопросы соответствуют уровню "${diffName}"
- Варианты ответов не слишком длинные (макс 50 символов каждый)
- Правильный ответ не всегда на одной и той же позиции`;
  }

  return `Create ${count} questions on the topic: "${topic}"
Difficulty level: ${diffName}

Make sure that:
- Questions cover different aspects of the topic
- ALL questions match the "${diffName}" difficulty level
- Answer options are not too long (max 50 characters each)
- The correct answer is not always in the same position`;
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
}
