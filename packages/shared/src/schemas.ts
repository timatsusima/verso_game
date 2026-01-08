import { z } from 'zod';

// ============ Language ============
export const LanguageSchema = z.enum(['ru', 'en']);

// ============ Question Schemas ============
export const QuestionWithAnswerSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  options: z.tuple([z.string(), z.string(), z.string(), z.string()]),
  correctIndex: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  imageSearchQuery: z.string().nullable(),
  imageUrl: z.string().nullable(),
});

export const QuestionsPackSchema = z.array(QuestionWithAnswerSchema);

// ============ OpenAI Response Schema ============
export const OpenAIQuestionSchema = z.object({
  text: z.string().min(1),
  options: z.tuple([z.string(), z.string(), z.string(), z.string()]),
  correctIndex: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  imageSearchQuery: z.string().nullable().optional(),
});

export const OpenAIResponseSchema = z.object({
  questions: z.array(OpenAIQuestionSchema),
});

// ============ API Schemas ============
export const CreateDuelSchema = z.object({
  topic: z.string().min(1).max(200),
  questionsCount: z.union([z.literal(10), z.literal(20), z.literal(30)]),
  language: LanguageSchema,
});

export const AuthTelegramSchema = z.object({
  initData: z.string().min(1),
});

export const AnswerSchema = z.object({
  duelId: z.string().uuid(),
  questionIndex: z.number().int().min(0),
  answerIndex: z.number().int().min(0).max(3),
});

// ============ Type exports from schemas ============
export type CreateDuelInput = z.infer<typeof CreateDuelSchema>;
export type AuthTelegramInput = z.infer<typeof AuthTelegramSchema>;
export type OpenAIQuestion = z.infer<typeof OpenAIQuestionSchema>;
export type OpenAIResponse = z.infer<typeof OpenAIResponseSchema>;
